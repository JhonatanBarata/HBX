import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

// FIXER PR10072026 — fecho do buraco de DNS rebinding do guard anti-SSRF (W5): o guard
// resolve e valida o DNS em check(), mas `fetch` re-resolve no connect — um domínio com
// TTL 0 alternando IP público ↔ 169.254.169.254 passava no guard e conectava no alvo
// interno. Aqui o connect usa um `lookup` custom que SÓ devolve os IPs já validados
// (pinning): rebinding entre check e connect não muda o alvo do socket. TLS continua
// validando o certificado pelo HOSTNAME (SNI = host), não pelo IP.

const MAX_RESPONSE_BYTES = 5_000_000; // teto duro anti-stream-infinito (o provider trunca antes)

export type PinnedFetchInit = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  redirect?: 'manual' | 'follow' | 'error';
  pinnedAddresses?: string[];
};

export type PinnedFetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
};

// Exportado p/ teste: lookup que ignora o hostname e devolve SÓ os IPs pinados.
export function buildPinnedLookup(addresses: string[]) {
  const pinned = (addresses || [])
    .map((address) => ({ address: String(address || '').trim(), family: isIP(String(address || '').trim()) }))
    .filter((entry) => entry.family === 4 || entry.family === 6);
  return function pinnedLookup(_hostname: string, options: any, callback: any) {
    // Assinatura dupla do dns.lookup: (hostname, cb) ou (hostname, options, cb).
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? {} : options || {};
    if (!pinned.length) {
      cb(new Error('pinned_fetch_sem_ips_validados'));
      return;
    }
    if (opts.all) {
      cb(null, pinned.map((entry) => ({ address: entry.address, family: entry.family })));
      return;
    }
    cb(null, pinned[0].address, pinned[0].family);
  };
}

/**
 * GET com a mesma cara mínima de `fetch` que o website-crawl usa (ok/status/text/headers.get),
 * mas com o DNS do connect FIXADO em `init.pinnedAddresses` (os IPs que o guard validou).
 * Nunca segue redirect (o provider revalida cada Location no guard e chama de novo).
 */
export async function pinnedFetch(rawUrl: string, init: PinnedFetchInit = {}): Promise<PinnedFetchResponse> {
  const url = new URL(String(rawUrl || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('pinned_fetch_protocolo_invalido');
  const pinned = (init.pinnedAddresses || []).filter((address) => isIP(String(address || '').trim()));
  // Fail-closed: sem IP validado não há o que pinar — conectar re-resolvendo seria o próprio buraco.
  if (!pinned.length) throw new Error('pinned_fetch_sem_ips_validados');

  const isHttps = url.protocol === 'https:';
  const requestFn = isHttps ? httpsRequest : httpRequest;

  return new Promise<PinnedFetchResponse>((resolve, reject) => {
    const req = requestFn(
      {
        host: url.hostname,
        port: url.port ? Number(url.port) : (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}` || '/',
        method: 'GET',
        headers: init.headers,
        signal: init.signal,
        lookup: buildPinnedLookup(pinned) as any,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          const body = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: {
              get: (name: string) => {
                const value = res.headers[String(name || '').toLowerCase()];
                if (Array.isArray(value)) return value[0] ?? null;
                return value ?? null;
              },
            },
            text: async () => body,
          });
        };
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          chunks.push(chunk);
          if (received > MAX_RESPONSE_BYTES) {
            // Teto de bytes: entrega o que leu (o provider trunca em maxHtmlBytes de qualquer jeito).
            finish();
            res.destroy();
          }
        });
        res.on('end', finish);
        res.on('error', (error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}
