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

test('LeadQualityV2 List entrega lead com telefone valido e WhatsApp nao confirmado', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Padaria Central',
      phoneDigits: '1933334444',
      city: 'Campinas',
      state: 'SP',
      address: 'Rua Tres, 10',
      segment: 'padaria',
      rating: 4.4,
      reviews: 32,
      whatsappStatus: 'unverified',
    },
    context: { requestedSegment: 'padaria', qualityMode: 'list' },
  });

  assert.equal(quality.decision, 'deliver');
  assert.equal(quality.recommendedChannel, 'call');
});

test('LeadQualityV2 List descarta diretorio ou lista generica', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Lista Telefonica de Empresas',
      phoneDigits: '1933334444',
      city: 'Campinas',
      state: 'SP',
      segment: 'restaurante',
      source: 'diretorio',
    },
    context: { requestedSegment: 'restaurante', qualityMode: 'list' },
  });

  assert.equal(quality.decision, 'discard');
  assert.equal(quality.discardReason, 'generic_directory');
});

test('LeadQualityV2 List protege opt_out', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Mercado Bloqueado',
      phoneDigits: '19999990001',
      status: 'opt_out',
      segment: 'mercado',
    },
    context: { requestedSegment: 'mercado', qualityMode: 'list' },
  });

  assert.equal(quality.decision, 'protect');
});

test('LeadQualityV2 Lead+ nao entrega sem fit de segmento', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Auto Escola Avenida',
      phoneDigits: '19999990001',
      city: 'Campinas',
      state: 'SP',
      address: 'Av Um, 90',
      segment: 'auto escola',
      whatsappStatus: 'confirmed',
      rating: 4.8,
      reviews: 90,
    },
    context: {
      requestedSegment: 'oficina',
      qualityMode: 'lead_plus',
      salesProfile: { qualityMode: 'lead_plus', targetSegments: ['oficina'] },
    },
  });

  assert.notEqual(quality.decision, 'deliver');
  assert.equal(quality.discardReason, 'segment_mismatch');
});

test('LeadQualityV2 Lead+ descarta fora da cidade quando avoidOutOfCity=true', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Clínica Horizonte',
      phoneDigits: '19999990001',
      city: 'Limeira',
      state: 'SP',
      address: 'Rua Um, 55',
      segment: 'clínica médica',
      whatsappStatus: 'confirmed',
      rating: 4.9,
      reviews: 120,
    },
    context: {
      requestedSegment: 'clinica',
      qualityMode: 'lead_plus',
      salesProfile: {
        qualityMode: 'lead_plus',
        targetSegments: ['clínicas médicas'],
        preferredCities: ['Campinas'],
        preferredStates: ['SP'],
        negativeRules: { avoidOutOfCity: true },
      },
    },
  });

  assert.equal(quality.decision, 'discard');
  assert.equal(quality.discardReason, 'location_mismatch');
  assert.match(quality.reasons.join(' '), /fora da cidade configurada/i);
});

test('LeadQualityV2 Lead+ nao entrega sem WhatsApp quando avoidNoWhatsapp=true', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Clínica Sem WhatsApp',
      phoneDigits: '1933334444',
      city: 'Campinas',
      state: 'SP',
      address: 'Rua Um, 55',
      segment: 'clínica médica',
      rating: 4.9,
      reviews: 120,
    },
    context: {
      requestedSegment: 'clinica',
      qualityMode: 'lead_plus',
      salesProfile: {
        qualityMode: 'lead_plus',
        targetSegments: ['clínicas médicas'],
        preferredCities: ['Campinas'],
        preferredStates: ['SP'],
        negativeRules: { avoidNoWhatsapp: true },
      },
    },
  });

  assert.notEqual(quality.decision, 'deliver');
  assert.equal(quality.discardReason, 'weak_contactability');
});

test('LeadQualityV2 Lead+ entrega clinica boa com WhatsApp confirmado e fit correto', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Clínica Boa Vida',
      phoneDigits: '19999990001',
      city: 'Campinas',
      state: 'SP',
      address: 'Rua Dois, 200',
      segment: 'clínica médica',
      website: 'https://clinicaboavida.com.br',
      websiteStatus: 'present',
      whatsappStatus: 'confirmed',
      rating: 4.9,
      reviews: 160,
    },
    context: {
      requestedSegment: 'clinica',
      qualityMode: 'lead_plus',
      salesProfile: {
        qualityMode: 'lead_plus',
        targetSegments: ['clínicas médicas'],
        preferredCities: ['Campinas'],
        preferredStates: ['SP'],
        preferredChannels: ['whatsapp'],
      },
    },
  });

  assert.equal(quality.decision, 'deliver');
  assert.equal(quality.recommendedChannel, 'whatsapp');
  assert.ok(quality.finalRankScore >= 68);
});

test('LeadQualityV2 Lead+ manda para review quando email e provavel e WhatsApp ausente', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Clínica Revisão',
      city: 'Campinas',
      state: 'SP',
      address: 'Rua Dois, 200',
      segment: 'clínica médica',
      website: 'https://clinicarevisao.com.br',
      websiteStatus: 'present',
      emailStatus: 'probable',
      emailCandidate: 'contato@clinicarevisao.com.br',
      rating: 4.7,
      reviews: 90,
    },
    context: {
      requestedSegment: 'clinica',
      qualityMode: 'lead_plus',
      salesProfile: {
        qualityMode: 'lead_plus',
        targetSegments: ['clínicas médicas'],
        preferredCities: ['Campinas'],
        preferredStates: ['SP'],
      },
    },
  });

  assert.equal(quality.decision, 'review');
  assert.equal(quality.recommendedChannel, 'email');
});

test('LeadQualityV2 segmento contabilidade bate com Escritorio Contabil', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Escritório Contábil Alfa',
      phoneDigits: '19999990001',
      city: 'Campinas',
      state: 'SP',
      address: 'Rua Contábil, 1',
      segment: 'Escritório Contábil',
      whatsappStatus: 'confirmed',
    },
    context: { requestedSegment: 'contabilidade', qualityMode: 'lead_plus', salesProfile: { qualityMode: 'lead_plus', targetSegments: ['contabilidade'] } },
  });

  assert.ok(quality.segmentFitScore >= 65);
  assert.notEqual(quality.discardReason, 'segment_mismatch');
});

test('LeadQualityV2 segmento agencia de marketing bate com Marketing Digital', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Marketing Digital Pro',
      phoneDigits: '19999990001',
      city: 'Campinas',
      state: 'SP',
      address: 'Rua Mkt, 1',
      segment: 'Marketing Digital',
      whatsappStatus: 'confirmed',
    },
    context: { requestedSegment: 'agência de marketing', qualityMode: 'lead_plus', salesProfile: { qualityMode: 'lead_plus', targetSegments: ['agências de marketing'] } },
  });

  assert.ok(quality.segmentFitScore >= 65);
  assert.notEqual(quality.discardReason, 'segment_mismatch');
});

test('LeadQualityV2 segmento oficina continua rejeitando auto escola', () => {
  const quality = calculateLeadQualityV2({
    lead: {
      name: 'Auto Escola Centro',
      phoneDigits: '19999990001',
      city: 'Campinas',
      state: 'SP',
      segment: 'auto escola',
      whatsappStatus: 'confirmed',
    },
    context: { requestedSegment: 'oficina', qualityMode: 'lead_plus', salesProfile: { qualityMode: 'lead_plus', targetSegments: ['oficina'] } },
  });

  assert.equal(quality.decision, 'discard');
  assert.equal(quality.discardReason, 'segment_mismatch');
});
