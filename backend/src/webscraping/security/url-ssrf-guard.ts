import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Guard anti-SSRF do website-crawl: valida URL + resolve DNS (A/AAAA) e bloqueia
// qualquer destino em faixa privada/reservada. Fail-closed: DNS que falha, IP que
// não parseia ou QUALQUER endereço bloqueado na resposta => nega.
// TOCTOU/rebinding: os IPs validados aqui são FIXADOS no connect pelo fetcher default
// (security/pinned-fetch.ts) — o socket nunca re-resolve DNS por conta própria.

export type SsrfLookupAddress = { address: string; family: number };
export type SsrfLookupFn = (hostname: string) => Promise<SsrfLookupAddress[]>;

// Achatado (sem união discriminada): o tsconfig do backend roda com strict:false
// e o narrowing por discriminante não segura o typecheck.
export type SsrfCheckResult = {
  allowed: boolean;
  reason?: string;
  url?: URL;
  addresses?: string[];
};

export type UrlSsrfGuardOptions = {
  lookup?: SsrfLookupFn;
  allowedPorts?: number[];
};

const DEFAULT_ALLOWED_PORTS = [80, 443];

export const defaultSsrfLookup: SsrfLookupFn = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => ({ address: entry.address, family: entry.family }));
};

function ipv4ToBytes(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

function ipv4BlockReason(bytes: number[]): string | null {
  const [a, b] = bytes;
  if (a === 0) return 'ipv4_rede_zero';
  if (a === 10) return 'ipv4_rfc1918';
  if (a === 100 && b >= 64 && b <= 127) return 'ipv4_cgnat';
  if (a === 127) return 'ipv4_loopback';
  if (a === 169 && b === 254) return 'ipv4_link_local';
  if (a === 172 && b >= 16 && b <= 31) return 'ipv4_rfc1918';
  if (a === 192 && b === 168) return 'ipv4_rfc1918';
  if (a === 192 && b === 0 && bytes[2] === 0) return 'ipv4_reservado_ietf';
  if (a === 198 && (b === 18 || b === 19)) return 'ipv4_benchmark';
  if (a >= 224 && a <= 239) return 'ipv4_multicast';
  if (a >= 240) return 'ipv4_reservado_ou_broadcast';
  return null;
}

function hextetPair(high: number, low: number) {
  return ((high << 8) | low).toString(16);
}

function ipv6ToBytes(raw: string): number[] | null {
  let ip = raw.split('%')[0].toLowerCase();
  if (!ip) return null;
  // Cauda IPv4 embutida (::ffff:127.0.0.1) vira dois hextets para o parser único.
  const v4tail = ip.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4tail) {
    const v4 = ipv4ToBytes(v4tail[2]);
    if (!v4) return null;
    ip = `${v4tail[1]}${hextetPair(v4[0], v4[1])}:${hextetPair(v4[2], v4[3])}`;
  }
  const first = ip.indexOf('::');
  if (first !== ip.lastIndexOf('::')) return null;
  let groups: string[];
  if (first >= 0) {
    const left = ip.slice(0, first).split(':').filter(Boolean);
    const right = ip.slice(first + 2).split(':').filter(Boolean);
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    groups = ip.split(':');
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

function ipv6BlockReason(bytes: number[]): string | null {
  if (bytes.every((byte) => byte === 0)) return 'ipv6_nao_especificado';
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return 'ipv6_loopback';
  if (bytes[0] === 0xff) return 'ipv6_multicast';
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return 'ipv6_link_local';
  if ((bytes[0] & 0xfe) === 0xfc) return 'ipv6_ula';
  const first10Zero = bytes.slice(0, 10).every((byte) => byte === 0);
  if (first10Zero && bytes[10] === 0xff && bytes[11] === 0xff) {
    const v4 = ipv4BlockReason(bytes.slice(12));
    return v4 ? `ipv4_mapeado:${v4}` : null;
  }
  // IPv4-compatible (::/96, deprecado) — trata a cauda como IPv4.
  if (bytes.slice(0, 12).every((byte) => byte === 0)) {
    const v4 = ipv4BlockReason(bytes.slice(12));
    return v4 ? `ipv4_compat:${v4}` : null;
  }
  // NAT64 well-known prefix 64:ff9b::/96 — o destino real é o IPv4 da cauda.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b
    && bytes.slice(4, 12).every((byte) => byte === 0)) {
    const v4 = ipv4BlockReason(bytes.slice(12));
    return v4 ? `nat64:${v4}` : null;
  }
  return null;
}

export function blockedIpReason(rawIp: string): string | null {
  const ip = String(rawIp || '').trim();
  const family = isIP(ip.split('%')[0]);
  if (family === 4) {
    const bytes = ipv4ToBytes(ip);
    return bytes ? ipv4BlockReason(bytes) : 'ip_invalido';
  }
  if (family === 6) {
    const bytes = ipv6ToBytes(ip);
    return bytes ? ipv6BlockReason(bytes) : 'ip_invalido';
  }
  return 'ip_invalido';
}

export class UrlSsrfGuard {
  private readonly lookup: SsrfLookupFn;
  private readonly allowedPorts: number[];

  constructor(options: UrlSsrfGuardOptions = {}) {
    this.lookup = options.lookup || defaultSsrfLookup;
    this.allowedPorts = options.allowedPorts?.length ? options.allowedPorts : DEFAULT_ALLOWED_PORTS;
  }

  async check(rawUrl: string): Promise<SsrfCheckResult> {
    let url: URL;
    try {
      url = new URL(String(rawUrl || ''));
    } catch {
      return { allowed: false, reason: 'url_invalida' };
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { allowed: false, reason: 'protocolo_invalido' };
    }
    if (url.username || url.password) {
      return { allowed: false, reason: 'credencial_na_url' };
    }
    const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
    if (!this.allowedPorts.includes(port)) {
      return { allowed: false, reason: 'porta_bloqueada' };
    }

    // URL WHATWG já canonicaliza IPv4 exótico (decimal/octal/hex) para dotted-quad.
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (!hostname) return { allowed: false, reason: 'host_vazio' };

    if (isIP(hostname)) {
      const reason = blockedIpReason(hostname);
      if (reason) return { allowed: false, reason };
      return { allowed: true, url, addresses: [hostname] };
    }

    // Host de rótulo único (localhost, intranet, nomes de container) nunca é site público.
    if (!hostname.includes('.') || /\.(localhost|local|internal|home\.arpa)$/i.test(hostname)) {
      return { allowed: false, reason: 'host_sem_dominio_publico' };
    }

    let addresses: SsrfLookupAddress[];
    try {
      addresses = await this.lookup(hostname);
    } catch {
      return { allowed: false, reason: 'dns_falhou' };
    }
    if (!addresses?.length) {
      return { allowed: false, reason: 'dns_sem_resposta' };
    }
    for (const entry of addresses) {
      const reason = blockedIpReason(entry.address);
      if (reason) return { allowed: false, reason: `dns_resolveu_ip_bloqueado:${reason}` };
    }
    return { allowed: true, url, addresses: addresses.map((entry) => entry.address) };
  }
}

export const urlSsrfGuard = new UrlSsrfGuard();
