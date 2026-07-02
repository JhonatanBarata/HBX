import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarQualityGateService, type RadarQualityGateHost } from './radar-quality-gate.service';

const gate = new RadarQualityGateService();

// Host permissivo: nao bloqueia nome nem website — o objetivo dos testes e' isolar o
// comportamento source-aware do proprio evaluate(), nao os heuristicos externos do host.
const permissiveHost: RadarQualityGateHost = {
  isGenericDirectoryName: () => false,
  nameConflictsWithRequestedSegment: () => false,
  hasUsablePublicContactChannel: (candidate) => Boolean(candidate.phone || candidate.website || candidate.email),
  isBlockedLeadOfficialWebsite: () => false,
};

test('quality gate: MEI de cnpj_public (nome de pessoa + digitos) com score 0 -> deliver_with_pending_enrichment', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'cnpj_public',
      name: 'JOSIMAR PEREIRA DOS SANTOS 82644497191',
      city: 'Fortaleza',
      state: 'CE',
      phoneDigits: '85999998888',
      score: 0,
    },
    filters: { city: 'Fortaleza', state: 'CE', segment: 'padaria' } as any,
    host: permissiveHost,
    minQualityScore: 25,
  });
  assert.equal(result.deliverable, true, `esperava deliverable=true, motivo: ${result.reason}`);
  assert.equal(result.qualityDecision, 'deliver_with_pending_enrichment');
});

test('quality gate: mesmo nome de MEI vindo de fonte web segue heuristica normal (nao ganha bypass)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'JOSIMAR PEREIRA DOS SANTOS 82644497191',
      city: 'Fortaleza',
      state: 'CE',
      phoneDigits: '85999998888',
      score: 0,
    },
    filters: { city: 'Fortaleza', state: 'CE', segment: 'padaria' } as any,
    host: permissiveHost,
    minQualityScore: 25,
  });
  // Sem os bypasses de isCnpjPublic, score 0 < minQualityScore (25) derruba pra reject.
  assert.equal(result.deliverable, false);
  assert.equal(result.qualityDecision, 'reject');
  assert.ok(result.hardBlockers.includes('quality_below_minimum'));
});

test('quality gate: cnpj_public PULA isGenericDirectoryName/looksLikeNonBusinessName/nameConflictsWithRequestedSegment', () => {
  const strictHost: RadarQualityGateHost = {
    isGenericDirectoryName: () => true, // mesmo dizendo que e' generico, cnpj_public ignora
    nameConflictsWithRequestedSegment: () => true, // mesmo dizendo que conflita, cnpj_public ignora
    hasUsablePublicContactChannel: () => true,
    isBlockedLeadOfficialWebsite: () => false,
  };
  const result = gate.evaluate({
    candidate: {
      source: 'cnpj_public',
      name: 'JOSIMAR PEREIRA DOS SANTOS 82644497191',
      city: 'Fortaleza',
      state: 'CE',
      phoneDigits: '85999998888',
      score: 60,
    },
    filters: { city: 'Fortaleza', state: 'CE', segment: 'padaria' } as any,
    host: strictHost,
  });
  assert.equal(result.deliverable, true);
  assert.notEqual(result.hardBlockers[0], 'generic_directory');
  assert.notEqual(result.hardBlockers[0], 'segment_mismatch');
});

test('quality gate: candidato SEM nome continua rejeitado mesmo sendo cnpj_public', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'cnpj_public',
      name: '',
      city: 'Fortaleza',
      state: 'CE',
      phoneDigits: '85999998888',
    },
    filters: { city: 'Fortaleza', state: 'CE' } as any,
    host: permissiveHost,
  });
  assert.equal(result.deliverable, false);
  assert.ok(result.hardBlockers.includes('missing_name'));
});

test('quality gate: UF conflitante ainda derruba cnpj_public (bypass nao cobre isso)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'cnpj_public',
      name: 'Empresa Exemplo Ltda',
      city: 'Sao Paulo',
      state: 'SP',
      phoneDigits: '85999998888',
      score: 60,
    },
    filters: { city: 'Fortaleza', state: 'CE' } as any,
    host: permissiveHost,
  });
  assert.equal(result.deliverable, false);
  assert.ok(result.hardBlockers.includes('state_conflict'));
});

test('quality gate: contato minimo ausente ainda derruba cnpj_public (regra comum das duas fontes)', () => {
  const noContactHost: RadarQualityGateHost = {
    ...permissiveHost,
    hasUsablePublicContactChannel: () => false,
  };
  const result = gate.evaluate({
    candidate: {
      source: 'cnpj_public',
      name: 'Empresa Exemplo Ltda',
      city: 'Fortaleza',
      state: 'CE',
      score: 60,
    },
    filters: { city: 'Fortaleza', state: 'CE' } as any,
    host: noContactHost,
  });
  assert.equal(result.deliverable, false);
  assert.ok(result.hardBlockers.includes('missing_minimum_contact'));
});
