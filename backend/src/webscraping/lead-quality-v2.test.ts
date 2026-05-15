import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLeadQualityV2 } from './lead-quality-v2';

test('LeadQualityV2 entrega oficina boa com score alto', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Oficina Mecânica São José',
      phoneDigits: '19999990001',
      city: 'Campinas',
      state: 'SP',
      address: 'Rua Um, 123',
      segment: 'oficina',
      rating: 4.7,
      reviews: 86,
      websiteStatus: 'none',
      whatsappStatus: 'confirmed',
    },
    context: { requestedSegment: 'oficina' },
  });

  assert.equal(quality.decision, 'deliver');
  assert.ok(quality.productFit.leadFit >= 70);
  assert.ok(quality.contactabilityScore >= 70);
  assert.ok(quality.finalRankScore >= 70);
  assert.equal(quality.recommendedChannel, 'whatsapp');
});

test('LeadQualityV2 reduz autoescola em busca de oficina', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Auto Escola Central',
      phoneDigits: '1933334444',
      city: 'Campinas',
      state: 'SP',
      address: 'Av Brasil, 100',
      segment: 'auto escola',
    },
    context: { requestedSegment: 'oficina' },
  });

  assert.ok(quality.segmentFitScore <= 25);
  assert.ok(['review', 'discard'].includes(quality.decision));
  assert.match(quality.reasons.join(' '), /nao combina com oficina/i);
});

test('LeadQualityV2 descarta contato impossivel sem telefone email ou social', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Clínica Boa Vida',
      city: 'Campinas',
      state: 'SP',
      address: 'Rua Dois, 200',
      segment: 'clinica',
    },
    context: { requestedSegment: 'clinica' },
  });

  assert.ok(quality.contactabilityScore < 30);
  assert.ok(['review', 'discard'].includes(quality.recommendedChannel));
  assert.equal(quality.decision, 'discard');
});

test('LeadQualityV2 protege opt-out', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Pet Shop Bloqueado',
      phoneDigits: '19999990001',
      status: 'opt_out',
      segment: 'pet shop',
    },
    context: { requestedSegment: 'pet' },
  });

  assert.equal(quality.decision, 'protect');
  assert.ok(quality.riskScore >= 80);
  assert.equal(quality.recommendedChannel, 'discard');
});

test('LeadQualityV2 reconhece Instagram sem site como oportunidade de website', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Barbearia Estilo',
      phoneDigits: '19999990001',
      city: 'Campinas',
      state: 'SP',
      segment: 'barbearia',
      instagramUrl: 'https://instagram.com/barbearia',
      websiteStatus: 'none',
    },
    context: { requestedSegment: 'salao' },
  });

  assert.ok(quality.commercialIntentScore >= 70);
  assert.ok(quality.productFit.websiteFit >= 70);
  assert.match(quality.reasons.join(' '), /Instagram|Rede social/i);
});

test('LeadQualityV2 reduz ranking de duplicado com negativo global', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Restaurante Antigo',
      phoneDigits: '19999990001',
      city: 'Campinas',
      state: 'SP',
      segment: 'restaurante',
      duplicate: true,
      globalNegativeCount: 2,
      rating: 4.6,
      reviews: 120,
    },
    context: { requestedSegment: 'restaurante' },
  });

  assert.ok(quality.riskScore >= 60);
  assert.ok(quality.finalRankScore < quality.opportunityScore);
});
