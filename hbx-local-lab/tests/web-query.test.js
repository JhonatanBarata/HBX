'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { configurePacing } = require('../providers/site-crawl.provider');
const {
  buildDiscoveryQueries,
  rankOfficialCandidates,
  runWebQueryProvider,
} = require('../providers/web-query.provider');

function htmlResponse(html, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: async () => html,
  };
}

const resolvePublic = async () => [{ address: '93.184.216.34', family: 4 }];

function job(overrides = {}) {
  return {
    city: 'Xangri-lá',
    state: 'RS',
    segment: 'Madeireira',
    candidates: [{ name: 'Empresa Real', city: 'Xangri-lá', state: 'RS', segment: 'Madeireira' }],
    seedUrls: [],
    websites: [],
    targetEmails: 3,
    maxCandidates: 1,
    maxPagesPerSite: 2,
    maxDiscoveredLinks: 0,
    minDelayMs: 0,
    maxDelayMs: 0,
    blockBackoffMs: 0,
    ...overrides,
  };
}

test('sem site pesquisa fonte pública gratuita, valida identidade e rastreia o site descoberto', async () => {
  configurePacing(job());
  const requested = [];
  const fetcher = async (url) => {
    requested.push(String(url));
    if (String(url).includes('duckduckgo.com')) {
      return htmlResponse('<a class="result__a" href="https://empresareal.com.br/contato">Empresa Real | Site Oficial</a><div class="result__snippet">Empresa Real em Xangri-lá RS</div>');
    }
    if (String(url).includes('bing.com/search')) return htmlResponse('<ol></ol>');
    if (String(url).endsWith('/contato')) {
      return htmlResponse('<html><body><h1>Empresa Real</h1><a href="mailto:contato@empresareal.com.br">contato@empresareal.com.br</a></body></html>');
    }
    return htmlResponse('<html><body><h1>Empresa Real</h1><a href="/contato">Contato</a></body></html>');
  };

  const result = await runWebQueryProvider(job(), { fetcher, resolveHostname: resolvePublic });

  assert.equal(result.stats.discovered, 1);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].website, 'https://empresareal.com.br/contato');
  assert.equal(result.leads[0].sourceProvider, 'web_query_verified');
  assert.equal(result.leads[0].raw.discovery.identityConfirmed, true);
  assert.equal(result.emails.some((item) => item.email === 'contato@empresareal.com.br'), true);
  assert.equal(result.evidence.some((item) => item.pageType === 'contact'), true);
  assert.equal(requested.some((url) => url.includes('duckduckgo.com')), true);
  assert.equal(requested.some((url) => url === 'https://empresareal.com.br/contato'), true);
});

test('sem resultado compatível termina vazio; diretório e terceiro não viram site oficial', async () => {
  const input = job();
  const queries = buildDiscoveryQueries(input);
  assert.match(queries[0], /"Empresa Real"/);
  assert.deepEqual(rankOfficialCandidates(input, [
    { url: 'https://guiamais.com.br/empresa-real', title: 'Empresa Real', snippet: 'Xangri-lá RS', source: 'teste' },
    { url: 'https://outraempresa.example/', title: 'Outra Empresa', snippet: 'Outra cidade', source: 'teste' },
  ]), []);

  const result = await runWebQueryProvider(input, { fetcher: async () => htmlResponse('<html><body>sem resultados</body></html>'), resolveHostname: resolvePublic });
  assert.equal(result.stats.discovered, 0);
  assert.deepEqual(result.leads, []);
  assert.deepEqual(result.emails, []);
  assert.match(result.warnings.at(-1), /sem site oficial compatível/i);
});

test('queda total das fontes de busca é retryable pelo job, não falso noNewData', async () => {
  await assert.rejects(
    runWebQueryProvider(job(), { fetcher: async () => { throw new Error('internet_offline'); }, resolveHostname: resolvePublic }),
    /web_query_indisponivel/,
  );
});
