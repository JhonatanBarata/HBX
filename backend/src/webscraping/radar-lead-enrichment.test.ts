import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarLeadEnrichment } from './radar-lead-enrichment';

test('radar enrichment infers probable email from website domain', () => {
  const enrichment = buildRadarLeadEnrichment({ website: 'https://exemplo.com.br' });

  assert.equal(enrichment.emailStatus, 'probable');
  assert.equal(enrichment.emailSource, 'inferred');
  assert.equal(enrichment.emailCandidate, 'contato@exemplo.com.br');
});

test('radar enrichment marks missing website as sem_site pain', () => {
  const enrichment = buildRadarLeadEnrichment({ website: null, websiteStatus: 'none' });

  assert.equal(enrichment.painType, 'sem_site');
  assert.equal(enrichment.painLabel, 'Sem site');
});

test('radar enrichment prefers whatsapp when confirmed', () => {
  const enrichment = buildRadarLeadEnrichment({
    phone: '(19) 99999-9999',
    websiteStatus: 'none',
    whatsappStatus: 'confirmed',
  });

  assert.equal(enrichment.recommendedChannel, 'whatsapp');
  assert.match(enrichment.opportunityReason, /WhatsApp confirmado/);
});

test('radar enrichment recommends email when whatsapp is missing and email is probable', () => {
  const enrichment = buildRadarLeadEnrichment({
    phone: '(19) 99999-9999',
    website: 'cliente.com.br',
    whatsappStatus: 'missing',
  });

  assert.equal(enrichment.emailStatus, 'probable');
  assert.equal(enrichment.recommendedChannel, 'email');
});

test('radar enrichment discards protected leads', () => {
  const enrichment = buildRadarLeadEnrichment({
    status: 'blocked',
    website: 'cliente.com.br',
    whatsappStatus: 'confirmed',
  });

  assert.equal(enrichment.recommendedChannel, 'discard');
  assert.equal(enrichment.enrichmentScore, 0);
});

test('radar enrichment keeps existing confirmed email when payload is sparse', () => {
  const enrichment = buildRadarLeadEnrichment({
    email: 'vendas@empresa.com.br',
    emailStatus: 'confirmed',
    websiteStatus: 'unknown',
  });

  assert.equal(enrichment.email, 'vendas@empresa.com.br');
  assert.equal(enrichment.emailStatus, 'confirmed');
  assert.ok(enrichment.enrichmentJson.includes('confirmed'));
});
