import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCanonicalLeadScore,
  resolveLeadQualityV2FinalRankScore,
  resolveStrongCnpjIdentity,
} from './lead-quality-v2-resolver';

test('score canônico prioriza finalRankScore V2, inclusive zero', () => {
  assert.equal(resolveCanonicalLeadScore({ opportunityScore: 91, qualityV2: { finalRankScore: 42 } }), 42);
  assert.equal(resolveCanonicalLeadScore({ opportunityScore: 91, qualityV2: { finalRankScore: 0 } }), 0);
  assert.equal(resolveCanonicalLeadScore({ finalRankScore: 64 }), 64);
});

test('score canônico encontra Quality V2 nos JSONs persistidos e mantém fallback legado', () => {
  assert.equal(resolveLeadQualityV2FinalRankScore({ enrichmentJson: JSON.stringify({ qualityV2: { finalRankScore: 73 } }) }), 73);
  assert.equal(resolveCanonicalLeadScore({ opportunityScore: 67, score: 20 }), 67);
  assert.equal(resolveCanonicalLeadScore({}, () => 55), 55);
});

test('resolvedor extrai somente CNPJ completo como identidade forte', () => {
  assert.equal(resolveStrongCnpjIdentity({ evidenceJson: { cnpjPublic: { cnpj: '11.222.333/0001-81' } } }), '11222333000181');
  assert.equal(resolveStrongCnpjIdentity({ cnpj: '123' }), null);
  assert.equal(resolveStrongCnpjIdentity({ cnpj: '11.111.111/0001-11' }), null);
  assert.equal(resolveStrongCnpjIdentity({ cnpj: '00.000.000/0000-00' }), null);
  assert.equal(resolveStrongCnpjIdentity({ cnpj: '12.345.678/0001-94' }), null);
});
