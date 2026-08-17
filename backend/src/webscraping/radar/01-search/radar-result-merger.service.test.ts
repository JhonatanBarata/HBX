import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarResultMergerService } from './radar-result-merger.service';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';

// ─── Helper: candidato mínimo (lead informal, sem CNPJ) ─────────────────────────────────────────

function makeContact(overrides: Partial<WebscrapingContactResult> & Record<string, any> = {}): WebscrapingContactResult {
  return {
    placeId: '',
    name: 'Salão da Maria',
    phone: '',
    phoneDigits: '',
    rating: null,
    reviews: null,
    address: null,
    website: null,
    ...overrides,
  } as WebscrapingContactResult;
}

function svc() {
  return new RadarResultMergerService();
}

// ─── 1. Duplicata por MESMO FONE (sem CNPJ) ──────────────────────────────────────────────────────

test('funde dois candidatos sem CNPJ com o mesmo phoneDigits (fonte web x fonte web)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Salão da Maria', phoneDigits: '5588912345678' });
  const b = makeContact({ name: 'Salao Maria Cabelo', phoneDigits: '5588912345678' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'deveria fundir em 1 card só (mesmo fone)');
});

test('funde fone com e SEM o 9º dígito (mesmo número, formatos diferentes)', () => {
  const merger = svc();
  // 55 88 9 1234-5678 (com 9) vs 55 88 1234-5678 (sem 9) — mesmo celular, captura divergente
  const a = makeContact({ name: 'Barbearia Central', phoneDigits: '5588912345678' });
  const b = makeContact({ name: 'Barbearia Central', phoneDigits: '558812345678' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'deveria reconhecer 5588912345678 ≡ 558812345678 e fundir');
});

// ─── 2. Duplicata por MESMO SITE (sem CNPJ) ──────────────────────────────────────────────────────

test('funde dois candidatos sem CNPJ com o mesmo domínio de site (variação www/https/path)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Pizzaria do Zé', website: 'https://www.pizzariadoze.com.br/' });
  const b = makeContact({ name: 'Pizzaria Ze', website: 'pizzariadoze.com.br/cardapio' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'deveria fundir pelo domínio (website key já difere por causa do path)');
});

// ─── 3. Duplicata por MESMO NOME+CIDADE (sem CNPJ, sem fone, sem site) ───────────────────────────

test('funde dois candidatos sem CNPJ/fone/site com nome+cidade normalizados iguais', () => {
  const merger = svc();
  const a = makeContact({ name: 'Doceria Sabor Mineiro', city: 'Fortaleza' });
  const b = makeContact({ name: 'DOCERIA SABOR MINEIRO', city: 'fortaleza' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'nome+cidade normalizados iguais deveria fundir mesmo sem CNPJ/fone/site');
});

// ─── 4. CNPJ é chave ABSOLUTA — funde mesmo com nome/fone diferentes ─────────────────────────────

test('CNPJ igual funde mesmo com nome e fone diferentes entre as fontes', () => {
  const merger = svc();
  const a = makeContact({ name: 'Mercadinho Bom Preço', phoneDigits: '558811112222', cnpj: '12345678000199' });
  const b = makeContact({ name: 'Bom Preco Supermercados LTDA', phoneDigits: '558833334444', cnpj: '12.345.678/0001-99' });
  const { results } = merger.mergeSources([
    { source: 'cnpj_public', results: [a] },
    { source: 'hbx_engine', results: [b] },
  ]);
  assert.equal(results.length, 1, 'CNPJ normalizado igual (com/sem máscara) é chave absoluta — funde sempre');
});

test('CNPJs diferentes NÃO fundem mesmo com nome parecido', () => {
  const merger = svc();
  const a = makeContact({ name: 'Mercadinho Bom Preço', cnpj: '12345678000199' });
  const b = makeContact({ name: 'Mercadinho Bom Preço', cnpj: '98765432000188' });
  const { results } = merger.mergeSources([
    { source: 'cnpj_public', results: [a] },
    { source: 'cnpj_public', results: [b] },
  ]);
  assert.equal(results.length, 2, 'CNPJs distintos são empresas distintas — nunca fundir por nome parecido');
});

// ─── 5. Guarda anti-falso-positivo: fone genérico/compartilhado ──────────────────────────────────

test('NÃO funde mesmo fone quando nomes normalizados são muito diferentes (fone de galeria/shopping)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Studio Unhas Fernanda', phoneDigits: '558533334444' });
  const b = makeContact({ name: 'Otica Visao Clara', phoneDigits: '558533334444' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 2, 'fone compartilhado (galeria) com nomes sem relação NÃO deveria fundir cegamente');
});

test('funde mesmo fone quando a primeira palavra do nome bate (desempate barato)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Fernanda Nails Studio', phoneDigits: '558533334444' });
  const b = makeContact({ name: 'Fernanda Unhas e Estetica', phoneDigits: '558533334444' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1, 'mesma primeira palavra do nome + mesmo fone é sinal suficiente de fusão');
});

// ─── 6. Fusão preserva o melhor de cada fonte (não perde campo preenchido) ───────────────────────

test('ao fundir por CNPJ, preserva website de uma fonte e email de outra (não perde nenhum campo)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Padaria Pão Quente', cnpj: '11222333000144', website: 'padariapaoquente.com.br' });
  const b = makeContact({ name: 'Padaria Pao Quente Ltda', cnpj: '11.222.333/0001-44', email: 'contato@padariapaoquente.com.br' });
  const { results } = merger.mergeSources([
    { source: 'website_crawl_light', results: [a] },
    { source: 'cnpj_public', results: [b] },
  ]);
  assert.equal(results.length, 1);
  const merged = results[0] as any;
  assert.equal(merged.website, 'padariapaoquente.com.br', 'website da fonte A deveria sobreviver');
  assert.equal(merged.email, 'contato@padariapaoquente.com.br', 'email da fonte B deveria sobreviver');
});

test('sourceEngines concatena as origens ao fundir por chave secundária (sem CNPJ)', () => {
  const merger = svc();
  const a = makeContact({ name: 'Salão da Maria', phoneDigits: '5588912345678' });
  const b = makeContact({ name: 'Salao Maria Cabelo', phoneDigits: '558812345678' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1);
  const merged = results[0] as any;
  assert.ok(merged.sourceEngines.includes('hbx_engine'));
  assert.ok(merged.sourceEngines.includes('website_crawl_light'));
});

// ─── 7. Histórico negativo nunca é apagado (regra de ouro) — merger não mexe em status negativo ──

test('fundir não apaga rejectReasons/qualityReason já registrados no candidato existente', () => {
  const merger = svc();
  const a = makeContact({
    name: 'Salão da Maria',
    phoneDigits: '5588912345678',
    rejectReasons: ['invalid_phone_previous_attempt'],
    qualityReason: 'baixa_qualidade_anterior',
  });
  const b = makeContact({ name: 'Salao Maria Cabelo', phoneDigits: '558812345678' });
  const { results } = merger.mergeSources([
    { source: 'hbx_engine', results: [a] },
    { source: 'website_crawl_light', results: [b] },
  ]);
  assert.equal(results.length, 1);
  const merged = results[0] as any;
  assert.deepEqual(merged.rejectReasons, ['invalid_phone_previous_attempt'], 'histórico negativo não pode ser apagado pela fusão');
});

// ─── 8. LOTE 5 (PR17082026) — uma empresa = um card ──────────────────────────────────────────────
// O `fused=0` da busca de Valinhos: a Receita manda "RINAGUA LTDA." e a web manda "Rinágua".
// Acento nunca foi o problema (normalizeLookupValue já derruba) — o problema era o PONTO e o
// SUFIXO SOCIETÁRIO contra uma igualdade exata.

test('RINAGUA LTDA. (Receita) funde com Rinágua (web) na mesma cidade/UF, mesmo com fone diferente', () => {
  const merger = svc();
  const receita = makeContact({
    placeId: 'cnpj_public:11222333000181',
    name: 'RINAGUA LTDA.',
    legalName: 'RINAGUA LTDA.',
    cnpj: '11222333000181',
    phoneDigits: '19991110000',
    city: 'Valinhos',
    state: 'SP',
    source: 'cnpj_public',
  });
  const web = makeContact({
    name: 'Rinágua',
    phoneDigits: '19992220000',
    city: 'Valinhos',
    state: 'SP',
    website: 'https://rinagua.com.br',
    source: 'hbx_engine',
  });
  const output = merger.mergeCanonicalRfbWithWeb({ rfbResults: [receita], webResults: [web], city: 'Valinhos', state: 'SP' });
  assert.equal(output.matchedCount, 1, 'RINAGUA LTDA. x Rinágua tem que fundir (era o fused=0 de hoje)');
  assert.equal(output.results.length, 1, 'a empresa é uma só — não pode sobrar card web solto');
  const fundido = output.results[0] as any;
  assert.equal(fundido.sourceChain, 'rfb+web');
  assert.ok(fundido.canonicalMatch.rules.includes('name_city_state_core'), 'a razão da fusão fica auditável em canonicalMatch.rules');
  assert.equal(fundido.website, 'https://rinagua.com.br', 'o que a web trouxe entra no card da Receita');
});

test('duas linhas da Receita com o mesmo núcleo de nome deixam o card web AMBÍGUO (não funde no chute)', () => {
  const merger = svc();
  const receitaA = makeContact({ placeId: 'cnpj_public:11222333000181', name: 'RINAGUA LTDA.', cnpj: '11222333000181', city: 'Valinhos', state: 'SP', source: 'cnpj_public' });
  const receitaB = makeContact({ placeId: 'cnpj_public:11444777000161', name: 'RINAGUA ME', cnpj: '11444777000161', city: 'Valinhos', state: 'SP', source: 'cnpj_public' });
  const web = makeContact({ name: 'Rinágua', city: 'Valinhos', state: 'SP', source: 'hbx_engine' });
  const output = merger.mergeCanonicalRfbWithWeb({ rfbResults: [receitaA, receitaB], webResults: [web], city: 'Valinhos', state: 'SP' });
  assert.equal(output.matchedCount, 0, 'com duas candidatas na Receita o motor não escolhe no chute');
  assert.equal(output.ambiguousCount, 1);
  assert.equal(output.results.length, 3, 'as duas da Receita ficam de pé e o card web fica separado (nada some)');
});

test('nome que é SÓ sufixo societário não funde com ninguém (núcleo não distintivo)', () => {
  const merger = svc();
  const receita = makeContact({ placeId: 'cnpj_public:11222333000181', name: 'LTDA.', cnpj: '11222333000181', city: 'Valinhos', state: 'SP', source: 'cnpj_public' });
  const web = makeContact({ name: 'Ltda', city: 'Valinhos', state: 'SP', source: 'hbx_engine' });
  const output = merger.mergeCanonicalRfbWithWeb({ rfbResults: [receita], webResults: [web], city: 'Valinhos', state: 'SP' });
  assert.equal(output.matchedCount, 0, 'chave de nome vazia/genérica fundiria empresa com qualquer outra');
  assert.equal(output.results.length, 2);
});

test('os trios do pool ("Água em Valinhos" 3x) não nascem mais como 3 cards', () => {
  const merger = svc();
  const { results } = merger.mergeSources([
    { source: 'cnpj_public', results: [makeContact({ name: 'AGUA EM VALINHOS LTDA', city: 'Valinhos', state: 'SP' })] },
    { source: 'hbx_engine', results: [makeContact({ name: 'Água em Valinhos', city: 'Valinhos', state: 'SP' })] },
    { source: 'website_crawl_light', results: [makeContact({ name: 'AGUA EM VALINHOS - ME', city: 'valinhos', state: 'SP' })] },
  ]);
  assert.equal(results.length, 1, 'mesma empresa escrita de 3 jeitos = 1 card');
});

test('Kero Água e Água Volga (duplas do pool) também colapsam em 1 card cada', () => {
  const merger = svc();
  const kero = merger.mergeSources([
    { source: 'cnpj_public', results: [makeContact({ name: 'KERO AGUA COMERCIO DE AGUAS LTDA', city: 'Valinhos', state: 'SP' })] },
    { source: 'hbx_engine', results: [makeContact({ name: 'Kero Água Comércio de Águas', city: 'Valinhos', state: 'SP' })] },
  ]);
  assert.equal(kero.results.length, 1);
  const volga = merger.mergeSources([
    { source: 'cnpj_public', results: [makeContact({ name: 'AGUA VOLGA LTDA - EPP', city: 'Valinhos', state: 'SP' })] },
    { source: 'hbx_engine', results: [makeContact({ name: 'Água Volga', city: 'Valinhos', state: 'SP' })] },
  ]);
  assert.equal(volga.results.length, 1);
});

// ─── 9. LOTE 5 — a guarda de CNPJ tem que enxergar o card VINDO DO POOL ──────────────────────────
// O card restaurado do RadarLeadPool (`restoreRadarPoolResults`, radar-core-presentation.mixin)
// NÃO tem campo `cnpj`: a identidade fiscal dele viaja DENTRO do placeId, no formato
// `cnpj_public:<14 dígitos>`. Com o nome passando a casar por NÚCLEO (sufixo societário fora),
// duas empresas distintas da mesma cidade batem em `name_city:` — e a guarda "CNPJ diferente nunca
// funde" ficava INERTE justamente onde mais dói, porque lia só `result.cnpj`.

test('duas empresas do POOL com CNPJ diferente no placeId NÃO fundem por nome+cidade', () => {
  const merger = svc();
  // Cena real de Valinhos: mesmo núcleo de nome ("distribuidora de agua sao joao"), CNPJs distintos.
  const poolA = makeContact({
    placeId: 'cnpj_public:11222333000181',
    name: 'DISTRIBUIDORA DE AGUA SAO JOAO LTDA',
    phoneDigits: '1932000001',
    city: 'Valinhos',
    state: 'SP',
    source: 'radar_database',
  });
  const poolB = makeContact({
    placeId: 'cnpj_public:11444777000161',
    name: 'Distribuidora de Água São João ME',
    phoneDigits: '1933000002',
    city: 'Valinhos',
    state: 'SP',
    website: 'https://saojoaome.com.br',
    instagramUrl: 'https://instagram.com/saojoao.me',
    source: 'radar_database',
  });
  const { results } = merger.mergeSources([{ source: 'radar_database', results: [poolA, poolB] }]);
  assert.equal(results.length, 2, 'CNPJ diferente (dentro do placeId do pool) é lei nos dois sentidos — não pode colar');
  const placeIds = results.map((result) => String(result.placeId));
  assert.deepEqual(
    placeIds.sort(),
    ['cnpj_public:11222333000181', 'cnpj_public:11444777000161'],
    'as duas empresas continuam de pé com a própria âncora fiscal',
  );
  const cardA = results.find((result) => result.placeId === 'cnpj_public:11222333000181') as any;
  assert.ok(!cardA.website, 'o site da empresa B não pode ser carimbado no card da empresa A');
  assert.ok(!cardA.instagramUrl, 'o instagram da empresa B não pode ser carimbado no card da empresa A');
});

test('shouldAppend também respeita o CNPJ do placeId do pool (card novo não é engolido)', () => {
  const merger = svc();
  const jaNaTela = makeContact({
    placeId: 'cnpj_public:11222333000181',
    name: 'DISTRIBUIDORA DE AGUA SAO JOAO LTDA',
    phoneDigits: '1932000001',
    city: 'Valinhos',
    state: 'SP',
    source: 'radar_database',
  });
  const candidato = makeContact({
    placeId: 'cnpj_public:11444777000161',
    name: 'Distribuidora de Água São João ME',
    phoneDigits: '1933000002',
    city: 'Valinhos',
    state: 'SP',
    source: 'radar_database',
  });
  assert.equal(merger.shouldAppend(candidato, [jaNaTela]), true, 'empresa com outro CNPJ é card novo, não duplicata');
});

test('mesmo CNPJ no placeId de um lado e no campo cnpj do outro continua fundindo', () => {
  const merger = svc();
  const pool = makeContact({
    placeId: 'cnpj_public:11222333000181',
    name: 'DISTRIBUIDORA DE AGUA SAO JOAO LTDA',
    city: 'Valinhos',
    state: 'SP',
    source: 'radar_database',
  });
  const receita = makeContact({
    name: 'Distribuidora de Água São João',
    cnpj: '11.222.333/0001-81',
    city: 'Valinhos',
    state: 'SP',
    source: 'cnpj_public',
  });
  const { results } = merger.mergeSources([
    { source: 'radar_database', results: [pool] },
    { source: 'cnpj_public', results: [receita] },
  ]);
  assert.equal(results.length, 1, 'mesma empresa (mesmo CNPJ) segue sendo 1 card — a guarda só separa CNPJ DIFERENTE');
});

test('empresas DIFERENTES com nome parecido continuam separadas (vacina anti-cola)', () => {
  const merger = svc();
  // CNPJ é chave absoluta nos dois sentidos: núcleo igual + cidade igual não vence CNPJ diferente.
  const mesmoNucleo = merger.mergeSources([
    { source: 'cnpj_public', results: [makeContact({ name: 'AGUA MINERAL LTDA', cnpj: '11222333000181', city: 'Valinhos', state: 'SP' })] },
    { source: 'cnpj_public', results: [makeContact({ name: 'AGUA MINERAL ME', cnpj: '11444777000161', city: 'Valinhos', state: 'SP' })] },
  ]);
  assert.equal(mesmoNucleo.results.length, 2, 'CNPJs distintos são empresas distintas — nunca fundir por nome');
  // Sem CNPJ, o que separa é o próprio nome: 'distribuidora'/'comercio' NÃO são removidos.
  const nomesVizinhos = merger.mergeSources([
    { source: 'hbx_engine', results: [makeContact({ name: 'AGUAS DO VALE COMERCIO DE AGUAS LTDA', city: 'Valinhos', state: 'SP' })] },
    { source: 'hbx_engine', results: [makeContact({ name: 'AGUAS DO VALE DISTRIBUIDORA DE AGUAS LTDA', city: 'Valinhos', state: 'SP' })] },
  ]);
  assert.equal(nomesVizinhos.results.length, 2, 'comercio x distribuidora são empresas diferentes no ramo do dono');
});
