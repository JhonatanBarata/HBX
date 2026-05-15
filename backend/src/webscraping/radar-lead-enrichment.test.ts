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

test('radar enrichment does not promote inferred email to confirmed on refresh', () => {
  const enrichment = buildRadarLeadEnrichment({
    email: 'contato@empresa.com.br',
    emailStatus: 'probable',
    emailSource: 'inferred',
    website: 'https://empresa.com.br',
  });

  assert.equal(enrichment.emailStatus, 'probable');
  assert.equal(enrichment.emailSource, 'inferred');
});

test('radar enrichment confirms email collected from website text', () => {
  const enrichment = buildRadarLeadEnrichment({
    website: 'https://empresa.com.br',
    rawPayload: {
      contactPageText: 'Fale conosco pelo atendimento@empresa.com.br',
    },
  });

  assert.equal(enrichment.email, 'atendimento@empresa.com.br');
  assert.equal(enrichment.emailStatus, 'confirmed');
  assert.equal(enrichment.emailSource, 'website');
});

test('radar enrichment adds social networks to score and payload', () => {
  const enrichment = buildRadarLeadEnrichment({
    websiteStatus: 'none',
    instagramUrl: 'instagram.com/empresa',
    facebookUrl: 'https://facebook.com/empresa',
    opportunityScore: 80,
  });

  assert.equal(enrichment.instagramUrl, 'https://instagram.com/empresa');
  assert.equal(enrichment.facebookUrl, 'https://facebook.com/empresa');
  assert.equal(enrichment.socialStatus, 'found');
  assert.equal(enrichment.enrichmentScore, 99);
  assert.match(enrichment.opportunityReason, /Instagram encontrado/);
  assert.match(enrichment.enrichmentJson, /instagramUrl/);
});

test('radar enrichment includes LeadQualityV2 in payload', () => {
  const enrichment = buildRadarLeadEnrichment({
    name: 'Oficina Mecânica São José',
    phoneDigits: '19999990001',
    city: 'Campinas',
    state: 'SP',
    segment: 'oficina',
    websiteStatus: 'none',
    whatsappStatus: 'confirmed',
    rating: 4.6,
    reviews: 50,
  });
  const payload = JSON.parse(enrichment.enrichmentJson);

  assert.equal(payload.qualityV2.version, 'lead-quality-v2');
  assert.ok(payload.qualityV2.finalRankScore > 0);
  assert.ok(['deliver', 'review'].includes(payload.qualityV2.decision));
});
