import assert from 'node:assert/strict';
import test from 'node:test';
import { RadarScoreEnrichmentService } from './radar-score-enrichment.service';

const host = {
  parseMaybeJsonObject: () => ({}),
  inferWebsiteStatus: () => 'none' as const,
  isLikelyValidBrPhone: () => false,
  isLikelyWhatsapp: () => false,
};

test('score enrichment usa finalRankScore V2 como fonte canônica', () => {
  const service = new RadarScoreEnrichmentService();
  const score = service.buildOpportunityScore({
    placeId: '', name: 'Empresa', phone: '', phoneDigits: '', rating: 5, reviews: 500,
    address: null, website: 'https://empresa.test', opportunityScore: 99,
    qualityV2: { version: 'lead-quality-v2', finalRankScore: 37 },
  } as any, null, host);
  assert.equal(score, 37);
});

test('score enrichment mantém cálculo legado quando Quality V2 não existe', () => {
  const service = new RadarScoreEnrichmentService();
  const score = service.buildOpportunityScore({
    placeId: '', name: 'Empresa', phone: '', phoneDigits: '', rating: null, reviews: null,
    address: null, website: null,
  } as any, null, host);
  assert.equal(score, 20);
});
