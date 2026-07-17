'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCompactEvidence, evidenceContainsValue, pageTypeFromUrl } = require('../extractors/evidence.extractor');
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
