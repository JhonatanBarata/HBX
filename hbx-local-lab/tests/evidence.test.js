'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCompactEvidence, evidenceContainsValue, pageTypeFromUrl } = require('../extractors/evidence.extractor');
const { assertSafePublicUrl, configurePacing, fetchPublicPage } = require('../providers/site-crawl.provider');
const { hydratePersistedJob } = require('../server');

test('evidencia compacta guarda URL, tipo, hash e trecho sem HTML bruto', () => {
  const evidence = buildCompactEvidence({
    ok: true,
    url: 'https://empresa.test/contato',
    capturedAt: '2026-07-16T20:00:00.000Z',
    html: '<html><body><h1>Contato</h1><a href="mailto:oi@empresa.test">Email</a><p>WhatsApp (51) 99999-1234</p><p>Proprietária Maria Silva</p></body></html>',
  });

  assert.equal(evidence.pageType, 'contact');
  assert.match(evidence.contentHash, /^[a-f0-9]{64}$/);
  assert.match(evidence.id, /^ev_[a-f0-9]{24}$/);
  assert.equal(evidence.excerpt.includes('<html>'), false);
  assert.equal(evidenceContainsValue(evidence, 'oi@empresa.test', 'email'), true);
  assert.equal(evidenceContainsValue(evidence, '51999991234', 'phone'), true);
  assert.equal(evidenceContainsValue(evidence, 'Maria Silva', 'person'), true);
  assert.equal(pageTypeFromUrl('https://empresa.test/sobre'), 'about');
});

test('job interrompido é hidratado como queued com o mesmo contrato e missão', () => {
  const restored = hydratePersistedJob({
    id: 'job-1',
    batchId: 'local-lab-job-1',
    status: 'running',
    createdAt: '2026-07-16T20:00:00.000Z',
    resumableInput: {
      contractVersion: 'local_deep_enrich_v1',
      missionId: 'mission-1',
      radarLeadId: 'radar-1',
      workVersion: 3,
      providers: ['site_crawl'],
      candidates: [{ name: 'Empresa', website: 'https://empresa.test' }],
    },
  });

  assert.equal(restored.status, 'queued');
  assert.equal(restored.contractVersion, 'local_deep_enrich_v1');
  assert.equal(restored.missionId, 'mission-1');
  assert.equal(restored.workVersion, 3);
  assert.match(restored.warnings.at(-1), /retomado/i);
});

test('crawl bloqueia SSRF por literal, DNS privado, rebinding e redirect inseguro', async () => {
  configurePacing({ minDelayMs: 0, maxDelayMs: 0, blockBackoffMs: 0 });
  const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
  for (const url of [
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fd00:ec2::254]/latest/meta-data/',
    'http://metadata.google.internal/',
    'ftp://empresa.example/arquivo',
  ]) {
    await assert.rejects(assertSafePublicUrl(url, publicDns), /unsafe_target/);
  }
  await assert.rejects(
    assertSafePublicUrl('https://empresa.example/', async () => [{ address: '192.168.1.10', family: 4 }]),
    /unsafe_target_address/,
  );
  assert.equal(await assertSafePublicUrl('https://empresa.example/', publicDns), 'https://empresa.example/');

  let redirectFetches = 0;
  const redirected = await fetchPublicPage('https://empresa.example/', null, async () => {
    redirectFetches += 1;
    return {
      ok: false,
      status: 302,
      headers: { get: (name) => name === 'location' ? 'http://169.254.169.254/latest/meta-data/' : null },
      text: async () => '',
    };
  }, publicDns);
  assert.equal(redirected.ok, false);
  assert.match(redirected.error, /unsafe_target_address/);
  assert.equal(redirectFetches, 1);

  let resolutions = 0;
  const rebound = await fetchPublicPage('https://empresa.example/', null, async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    text: async () => '<h1>Empresa</h1>',
  }), async () => {
    resolutions += 1;
    return [{ address: resolutions === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  });
  assert.equal(rebound.ok, false);
  assert.match(rebound.error, /unsafe_target_address/);
});
