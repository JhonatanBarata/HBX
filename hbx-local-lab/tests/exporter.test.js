'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBatchExport } = require('../exporters/hbx-jsonl-exporter');

test('exporter gera contrato JSONL do passo 13', () => {
  const exported = buildBatchExport({
    id: 'job-1',
    batchId: 'local-lab-job-1',
    city: 'Rio Claro',
    state: 'sp',
    segment: 'clinicas',
    targetEmails: 10,
    providers: ['web_query', 'site_crawl'],
    createdAt: '2026-06-08T12:00:00.000Z',
  }, {
    leads: [{
      externalId: 'lead-1',
      name: 'Clinica Real',
      city: 'Rio Claro',
      state: 'sp',
      segment: 'clinicas',
      website: 'clinicareal.com.br',
      phone: '+55 (19) 99999-0001',
      email: 'contato@clinicareal.com.br',
      sourceUrl: 'https://clinicareal.com.br/contato',
      sourceProvider: 'site_crawl',
      evidence: { method: 'mailto' },
    }],
    emails: [{
      externalId: 'email-1',
      email: 'contato@clinicareal.com.br',
      sourceUrl: 'https://clinicareal.com.br/contato',
      provider: 'site_crawl',
      confidence: 95,
      status: 'public_found',
      evidence: { method: 'mailto' },
    }],
  });

  assert.equal(exported.manifest.sourceMode, 'local_lab');
  assert.equal(exported.batch.leads.length, 1);
  assert.equal(exported.batch.emails.length, 1);
  assert.equal(exported.batch.leads[0].sourceRisk, 'experimental');
  assert.equal(exported.batch.leads[0].phone, '19999990001');
  assert.match(exported.leadsJsonl, /"sourceMode":"local_lab"/);
  assert.match(exported.emailsJsonl, /"status":"public_found"/);
});
