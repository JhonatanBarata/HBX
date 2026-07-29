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

// S2 LEAD-CENTRICO (25/07): a lane web (free_pj/scraping) ganha o mesmo mapa de exclusão da
// porta da Receita. "Distribuidora de Energia X" tem "distribuidora" no nome (o
// nameConflictsWithRequestedSegment permissivo do host deixaria passar), mas a exclusão de
// segmento (energia/água/combustível) tem que vencer e rejeitar mesmo assim.
test('quality gate: lane web com segmento pedido - exclusao vence nome parecido ("Distribuidora de Energia X" nao entra em distribuidora)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_scraping:free_pj',
      name: 'Distribuidora de Energia X',
      city: 'Fortaleza',
      state: 'CE',
      phoneDigits: '85999998888',
      score: 60,
    },
    filters: { city: 'Fortaleza', state: 'CE', segment: 'distribuidora' } as any,
    host: permissiveHost,
  });
  assert.equal(result.deliverable, false);
  assert.equal(result.qualityDecision, 'reject');
  assert.ok(result.hardBlockers.includes('segment_excluded_energia_agua_combustivel'));
});

test('quality gate: lane web - distribuidora de verdade (sem exclusao) nao e bloqueada pelo mapa de exclusao', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_scraping:free_pj',
      name: 'Distribuidora Boa Vista Ltda',
      city: 'Fortaleza',
      state: 'CE',
      phoneDigits: '85999998888',
      score: 60,
    },
    filters: { city: 'Fortaleza', state: 'CE', segment: 'distribuidora' } as any,
    host: permissiveHost,
  });
  assert.equal(result.deliverable, true);
  assert.ok(!result.hardBlockers.some((code) => code.startsWith('segment_excluded_')));
});

test('quality gate: lane web sem segmento pedido - mapa de exclusao nunca entra (comportamento intacto)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_scraping:free_pj',
      name: 'Distribuidora de Energia X',
      city: 'Fortaleza',
      state: 'CE',
      phoneDigits: '85999998888',
      score: 60,
    },
    filters: { city: 'Fortaleza', state: 'CE', segment: '' } as any,
    host: permissiveHost,
  });
  assert.equal(result.deliverable, true);
  assert.ok(!result.hardBlockers.some((code) => code.startsWith('segment_excluded_')));
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

// ── E2 ESTABILIZAÇÃO (29/07) — segment_mismatch vira PORTA na lane web ──────────────────────
// Caso real de Analândia/SP: clima, engenharia, cervejaria e página de categoria saíam como
// "Aguardando liberação" com score 52-61 — o motor SABIA (quality.status=segment_mismatch,
// lei única do scoreSegmentMatch) e entregava assim mesmo.

const mismatchQuality = {
  status: 'segment_mismatch' as const,
  billable: false,
  segmentMatchScore: 25,
  contactQualityScore: 60,
  commercialScore: 52,
  reasons: ['Lead sem aderencia minima ao segmento solicitado.'],
};

test('quality gate E2: lane web com quality.status=segment_mismatch REJEITA (caso Analândia)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Quero Brasil',
      city: 'Analândia',
      state: 'SP',
      phoneDigits: '19999990001',
      phone: '(19) 99999-0001',
      sourceUrl: 'https://www.querobrasil.com.br/sp/analandia/agua-saneamento',
    },
    filters: { city: 'Analândia', state: 'SP', segment: 'distribuidora de agua' } as any,
    quality: mismatchQuality,
    host: permissiveHost,
    minQualityScore: 25,
  });
  assert.equal(result.deliverable, false);
  assert.equal(result.qualityDecision, 'reject');
  assert.ok(result.hardBlockers.includes('quality_segment_mismatch'));
});

test('quality gate E2: cnpj_public com segment_mismatch textual NAO bloqueia (razao social nao "fala" o segmento)', () => {
  // M. COSTA DISTRIBUIDORA DE AGUA LTDA veio validada por CNAE na porta do provider; a lei
  // TEXTUAL pode dar score baixo (CNAE "atacadista de agua mineral" nao contem a frase
  // pedida) — isso nao e prova de outro segmento, e o melhor lead da busca.
  const result = gate.evaluate({
    candidate: {
      source: 'cnpj_public',
      name: 'M. COSTA DISTRIBUIDORA DE AGUA LTDA',
      city: 'Araras',
      state: 'SP',
      phoneDigits: '19999990002',
      phone: '(19) 99999-0002',
      score: 61,
    },
    filters: { city: 'Araras', state: 'SP', segment: 'distribuidora de agua' } as any,
    quality: { ...mismatchQuality, commercialScore: 61 },
    host: permissiveHost,
    minQualityScore: 25,
  });
  assert.equal(result.deliverable, true, `esperava deliverable=true, motivo: ${result.reason}`);
  assert.ok(!result.hardBlockers.includes('quality_segment_mismatch'));
});

test('quality gate E2: lane web com quality approved segue entregavel (controle)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'PA Pingo D Agua Distribuidora de Agua',
      city: 'Analândia',
      state: 'SP',
      phoneDigits: '19999990003',
      phone: '(19) 99999-0003',
    },
    filters: { city: 'Analândia', state: 'SP', segment: 'distribuidora de agua' } as any,
    quality: {
      status: 'approved' as const,
      billable: true,
      segmentMatchScore: 85,
      contactQualityScore: 70,
      commercialScore: 74,
      reasons: [],
    },
    host: permissiveHost,
    minQualityScore: 25,
  });
  assert.equal(result.deliverable, true, `esperava deliverable=true, motivo: ${result.reason}`);
});

// ── E3 ESTABILIZAÇÃO (29/07) — nome de MENU/categoria não é empresa ─────────────────────────
// Caso real Mirão: extrator pegou "Informática & Eletrônicos" (menu do site) como nome.

test('quality gate E3: "Informática & Eletrônicos" (menu de loja) REJEITA como non_business_name', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Informática & Eletrônicos',
      city: 'Analândia',
      state: 'SP',
      phoneDigits: '1129432050',
      phone: '(11) 2943-2050',
    },
    filters: { city: 'Analândia', state: 'SP', segment: 'distribuidora de agua' } as any,
    host: permissiveHost,
    minQualityScore: 25,
  });
  assert.equal(result.deliverable, false);
  assert.ok(result.hardBlockers.includes('non_business_name'));
});

test('quality gate E3: "M & M Distribuidora" (identidade propria com &) NAO cai no anti-menu', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'M & M Distribuidora',
      city: 'Araras',
      state: 'SP',
      phoneDigits: '19999990015',
      phone: '(19) 99999-0015',
    },
    filters: { city: 'Araras', state: 'SP', segment: 'distribuidora de agua' } as any,
    quality: {
      status: 'approved' as const,
      billable: true,
      segmentMatchScore: 85,
      contactQualityScore: 70,
      commercialScore: 74,
      reasons: [],
    },
    host: permissiveHost,
    minQualityScore: 25,
  });
  assert.equal(result.deliverable, true, `esperava deliverable=true, motivo: ${result.reason}`);
});
