import test from 'node:test';
import assert from 'node:assert/strict';
import { UrlSsrfGuard, blockedIpReason } from './url-ssrf-guard';
import { buildPinnedLookup } from './pinned-fetch';
import { WebsiteCrawlProviderService } from '../radar/providers/website-crawl/website-crawl-provider.service';

const publicLookup = async () => [{ address: '203.0.113.10', family: 4 }];

function htmlResponse(body: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
    text: async () => body,
  };
}

function redirectResponse(status: number, location: string) {
  return {
    ok: false,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'location' ? location : null) },
    text: async () => '',
  };
}

test('ssrf guard: caso feliz passa e devolve IPs resolvidos', async () => {
  const guard = new UrlSsrfGuard({ lookup: publicLookup });
  const verdict = await guard.check('https://barbeariax.com.br/contato');
  assert.equal(verdict.allowed, true);
  if (verdict.allowed) assert.deepEqual(verdict.addresses, ['203.0.113.10']);
});

test('ssrf guard: rebinding — host publico resolvendo IP privado é bloqueado', async () => {
  const guard = new UrlSsrfGuard({ lookup: async () => [{ address: '10.20.30.40', family: 4 }] });
  const verdict = await guard.check('https://site-legitimo.com.br/');
  assert.equal(verdict.allowed, false);
  if (!verdict.allowed) assert.match(verdict.reason, /^dns_resolveu_ip_bloqueado:ipv4_rfc1918$/);
});

test('ssrf guard: basta UM endereco privado na resposta DNS para bloquear', async () => {
  const guard = new UrlSsrfGuard({
    lookup: async () => [
      { address: '203.0.113.10', family: 4 },
      { address: '192.168.0.10', family: 4 },
    ],
  });
  const verdict = await guard.check('https://site-legitimo.com.br/');
  assert.equal(verdict.allowed, false);
});

test('ssrf guard: DNS que resolve AAAA interno (ULA) é bloqueado', async () => {
  const guard = new UrlSsrfGuard({ lookup: async () => [{ address: 'fd12:3456::1', family: 6 }] });
  const verdict = await guard.check('https://site-legitimo.com.br/');
  assert.equal(verdict.allowed, false);
});

test('ssrf guard: DNS que falha bloqueia (fail-closed)', async () => {
  const guard = new UrlSsrfGuard({ lookup: async () => { throw new Error('nx'); } });
  const verdict = await guard.check('https://nao-existe.com.br/');
  assert.equal(verdict.allowed, false);
  if (!verdict.allowed) assert.equal(verdict.reason, 'dns_falhou');
});

test('ssrf guard: IPs literais internos sao bloqueados', async () => {
  const guard = new UrlSsrfGuard({ lookup: publicLookup });
  for (const url of [
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/',
    'http://172.16.5.5/',
    'http://192.168.1.1/',
    'http://0.0.0.0/',
    'http://100.64.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fe80::1]/',
    'http://[fd00::1]/',
    'http://0177.0.0.1/', // octal vira 127.0.0.1 na normalização WHATWG
  ]) {
    const verdict = await guard.check(url);
    assert.equal(verdict.allowed, false, `esperava bloqueio: ${url}`);
  }
});

test('ssrf guard: host sem ponto e sufixos internos sao bloqueados sem DNS', async () => {
  const guard = new UrlSsrfGuard({ lookup: publicLookup });
  for (const url of ['http://localhost/', 'http://intranet/', 'http://foo.localhost/', 'http://roteador.local/']) {
    const verdict = await guard.check(url);
    assert.equal(verdict.allowed, false, `esperava bloqueio: ${url}`);
    if (!verdict.allowed) assert.equal(verdict.reason, 'host_sem_dominio_publico');
  }
});

test('ssrf guard: porta fora da allowlist e credencial na URL bloqueiam', async () => {
  const guard = new UrlSsrfGuard({ lookup: publicLookup });
  const porta = await guard.check('http://site.com.br:8080/');
  assert.equal(porta.allowed, false);
  if (!porta.allowed) assert.equal(porta.reason, 'porta_bloqueada');
  const credencial = await guard.check('http://user:pass@site.com.br/');
  assert.equal(credencial.allowed, false);
  if (!credencial.allowed) assert.equal(credencial.reason, 'credencial_na_url');
});

test('ssrf guard: blockedIpReason cobre faixas reservadas IPv4 e IPv6', () => {
  assert.equal(blockedIpReason('127.0.0.1'), 'ipv4_loopback');
  assert.equal(blockedIpReason('169.254.169.254'), 'ipv4_link_local');
  assert.equal(blockedIpReason('224.0.0.1'), 'ipv4_multicast');
  assert.equal(blockedIpReason('255.255.255.255'), 'ipv4_reservado_ou_broadcast');
  assert.equal(blockedIpReason('198.18.0.1'), 'ipv4_benchmark');
  assert.equal(blockedIpReason('192.0.0.5'), 'ipv4_reservado_ietf');
  assert.equal(blockedIpReason('::1'), 'ipv6_loopback');
  assert.equal(blockedIpReason('::'), 'ipv6_nao_especificado');
  assert.equal(blockedIpReason('ff02::1'), 'ipv6_multicast');
  assert.equal(blockedIpReason('fe80::1'), 'ipv6_link_local');
  assert.equal(blockedIpReason('fc00::1'), 'ipv6_ula');
  assert.equal(blockedIpReason('::ffff:127.0.0.1'), 'ipv4_mapeado:ipv4_loopback');
  assert.equal(blockedIpReason('::ffff:7f00:1'), 'ipv4_mapeado:ipv4_loopback');
  assert.equal(blockedIpReason('64:ff9b::10.0.0.1'), 'nat64:ipv4_rfc1918');
  assert.equal(blockedIpReason('2001:4860:4860::8888'), null);
  assert.equal(blockedIpReason('8.8.8.8'), null);
});

test('provider: site que resolve IP privado é pulado sem retry (rebinding na base)', async () => {
  const provider = new WebsiteCrawlProviderService();
  let fetchCalls = 0;
  const result = await provider.crawl('https://site-rebind.com.br', {
    paths: ['/'],
    ssrfLookup: async () => [{ address: '127.0.0.1', family: 4 }],
    fetcher: async () => {
      fetchCalls += 1;
      return htmlResponse('<html></html>');
    },
  });
  assert.equal(result.status, 'skipped');
  assert.equal(result.retryable, false);
  assert.match(result.reason, /^website_bloqueado_ssrf:/);
  assert.equal(fetchCalls, 0);
});

test('provider: redirect de site publico para 127.0.0.1 é bloqueado no hop', async () => {
  const provider = new WebsiteCrawlProviderService();
  const urlsFetched: string[] = [];
  const result = await provider.crawl('https://site-legitimo.com.br', {
    paths: ['/'],
    ssrfLookup: publicLookup,
    fetcher: async (url) => {
      urlsFetched.push(url);
      return redirectResponse(302, 'http://127.0.0.1/admin');
    },
  });
  assert.equal(urlsFetched.length, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.retryable, false);
  assert.equal(result.reason, 'website_bloqueado_ssrf');
  assert.match(String(result.evidence.pages[0]?.reason || ''), /^ssrf_bloqueado:/);
});

test('provider: redirect para host que resolve interno (169.254) é bloqueado no hop', async () => {
  const provider = new WebsiteCrawlProviderService();
  const result = await provider.crawl('https://site-legitimo.com.br', {
    paths: ['/'],
    ssrfLookup: async (hostname) => (hostname === 'metadata.interno.com.br'
      ? [{ address: '169.254.169.254', family: 4 }]
      : [{ address: '203.0.113.10', family: 4 }]),
    fetcher: async () => redirectResponse(301, 'https://metadata.interno.com.br/latest/'),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'website_bloqueado_ssrf');
});

test('provider: segue redirect publico com revalidacao e completa', async () => {
  const provider = new WebsiteCrawlProviderService();
  const inits: any[] = [];
  const result = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    ssrfLookup: publicLookup,
    fetcher: async (url, init) => {
      inits.push(init);
      if (url === 'https://barbeariax.com.br/') return redirectResponse(301, 'https://www.barbeariax.com.br/');
      return htmlResponse('<html><body>Contato: agenda@barbeariax.com.br</body></html>');
    },
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.fields.emails, ['agenda@barbeariax.com.br']);
  assert.equal(inits.every((init) => init?.redirect === 'manual'), true);
});

// Pinning anti-rebinding (FIXER PR10072026): o provider repassa ao fetcher os IPs que o
// guard validou; o fetcher default (pinnedFetch) fixa o connect neles — TTL 0 alternando
// IP público ↔ interno entre check e connect não muda o alvo do socket.
test('provider: fetcher recebe os IPs validados pelo guard em CADA hop (pinning)', async () => {
  const provider = new WebsiteCrawlProviderService();
  const inits: any[] = [];
  const result = await provider.crawl('https://barbeariax.com.br', {
    paths: ['/'],
    ssrfLookup: publicLookup,
    fetcher: async (url, init) => {
      inits.push(init);
      if (url === 'https://barbeariax.com.br/') return redirectResponse(301, 'https://www.barbeariax.com.br/');
      return htmlResponse('<html></html>');
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(inits.length, 2); // original + redirect: ambos com IPs pinados
  for (const init of inits) assert.deepEqual(init?.pinnedAddresses, ['203.0.113.10']);
});

test('pinned lookup: ignora o DNS do sistema e devolve SÓ os IPs validados; sem IP => erro', async () => {
  const lookup = buildPinnedLookup(['203.0.113.10']);
  await new Promise<void>((resolve, reject) => {
    lookup('evil-rebind.com.br', { all: true }, (err: any, addresses: any) => {
      try {
        assert.equal(err, null);
        assert.deepEqual(addresses, [{ address: '203.0.113.10', family: 4 }]);
        resolve();
      } catch (e) { reject(e); }
    });
  });
  const vazio = buildPinnedLookup([]);
  await new Promise<void>((resolve, reject) => {
    vazio('qualquer.com.br', {}, (err: any) => {
      try {
        assert.match(String(err?.message || ''), /pinned_fetch_sem_ips_validados/);
        resolve();
      } catch (e) { reject(e); }
    });
  });
});

test('provider: corrente de redirect estoura em 3 hops sem loop infinito', async () => {
  const provider = new WebsiteCrawlProviderService();
  let fetchCalls = 0;
  const result = await provider.crawl('https://site-loop.com.br', {
    paths: ['/'],
    ssrfLookup: publicLookup,
    fetcher: async () => {
      fetchCalls += 1;
      return redirectResponse(302, 'https://site-loop.com.br/outra');
    },
  });
  assert.equal(fetchCalls, 4); // original + 3 hops
  assert.equal(result.status, 'partial_error');
  assert.match(String(result.evidence.pages[0]?.reason || ''), /redirect_excedido/);
});
