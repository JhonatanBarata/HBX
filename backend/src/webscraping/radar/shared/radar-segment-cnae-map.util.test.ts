import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRadarSegmentCnaeMatcher,
  buildRadarSegmentCnaePrismaMatchers,
  matchesRadarSegmentCnaeAllowlist,
  resolveRadarSegmentCnaeEntries,
  resolveRadarSegmentCnaeSignalKeyword,
} from './radar-segment-cnae-map.util';
import { buildSegmentAliasMatcher, buildSegmentTextMatcher } from './radar-segment-match.util';

// LOTE 1 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): o mapa curado segmento→CNAE é a
// LEI que destrava a porta da Receita. Tudo que ele promete está aqui.

const codigos = (segment: unknown) => resolveRadarSegmentCnaeEntries(segment).map((e) => e.cnae).sort();

test('mapa: "distribuidora de agua" e suas formas naturais resolvem os MESMOS 4 CNAEs', () => {
  const esperado = ['3600602', '4635401', '4723700', '4784900'];
  assert.deepEqual(codigos('distribuidora de agua'), esperado);
  assert.deepEqual(codigos('Distribuidoras de Água'), esperado, 'plural + acento + caixa');
  assert.deepEqual(codigos('distribuidora de agua mineral'), esperado, 'palavra a mais nao atrapalha');
});

// É assim que o dono digita de verdade (decisão 17/08) — os apelidos são chave própria do mapa.
test('mapa: apelidos do ramo do dono chegam nos CNAEs da agua', () => {
  const esperado = ['3600602', '4635401', '4723700', '4784900'];
  assert.deepEqual(codigos('agua mineral'), esperado);
  assert.deepEqual(codigos('galao de agua'), esperado);
  assert.deepEqual(codigos('galões de água'), esperado, 'plural de galao (oes→ao)');
  assert.deepEqual(codigos('agua e gas'), esperado);
  assert.deepEqual(codigos('deposito de agua'), esperado);
});

// A chave casa por SUBCONJUNTO: TODAS as palavras dela têm de estar no pedido. Sem isso o mapa
// da água apareceria numa busca por "distribuidora de autopeças".
test('mapa: palavra solta NAO alcanca o mapa ("distribuidora" sozinho nao vira agua)', () => {
  assert.deepEqual(codigos('distribuidora'), []);
  assert.deepEqual(codigos('distribuidora de autopecas'), []);
  assert.deepEqual(codigos('padaria'), []);
  assert.deepEqual(codigos(''), []);
  assert.deepEqual(codigos(null), []);
});

test('mapa: segmento em LISTA vira uniao deduplicada por CNAE', () => {
  const entries = resolveRadarSegmentCnaeEntries('distribuidora de agua, distribuidora de gas');
  const lista = entries.map((e) => e.cnae).sort();
  assert.deepEqual(lista, ['3600602', '4635401', '4682600', '4723700', '4784900']);
  assert.equal(entries.filter((e) => e.cnae === '4784900').length, 1, 'sem duplicar o GLP');
  // Quem pediu gás EXPLICITAMENTE não pode receber menos GLP do que quem só pediu gás: na
  // união, a forma SEM sinal exigido vence a forma com sinal.
  assert.equal(entries.find((e) => e.cnae === '4784900')?.textSignals, undefined);
});

test('mapa: gas e bebidas tem allowlist propria', () => {
  assert.deepEqual(codigos('distribuidora de gas'), ['4682600', '4784900']);
  assert.deepEqual(codigos('distribuidoras de bebidas'), ['4635402', '4635499', '4723700']);
});

// ── O SINAL TEXTUAL DAS ENTRADAS AMPLAS ─────────────────────────────────────────────────────

test('matcher: CNAE amplo (4723700) so passa COM o sinal de agua no texto', () => {
  const matcher = buildRadarSegmentCnaeMatcher('distribuidora de agua', 'Valinhos');
  assert.equal(matcher({
    cnae: '4723700',
    haystack: 'ferreiragua comercio de aguas ltda 4723700 comercio varejista de bebidas',
  }), true);
  assert.equal(matcher({
    cnae: '4723700',
    haystack: 'adega do joao 4723700 comercio varejista de bebidas',
  }), false, 'todo bar da cidade tem esse CNAE — sem sinal, fica fora');
});

test('matcher: CNAE exclusivo do ramo (4635401) passa com nome MUDO — o codigo E o pedido', () => {
  const matcher = buildRadarSegmentCnaeMatcher('distribuidora de agua', 'Valinhos');
  assert.equal(matcher({ cnae: '4635401', haystack: 'vegas ltda 4635401 comercio atacadista de agua mineral' }), true);
  assert.equal(matcher({ cnae: '4635401', haystack: 'acquarella ltda' }), true);
});

test('matcher: CNAE fora da allowlist nunca passa (saneamento 3600601 e vizinho do 3600602)', () => {
  const matcher = buildRadarSegmentCnaeMatcher('distribuidora de agua', 'Valinhos');
  assert.equal(matcher({ cnae: '3600601', haystack: 'sanasa captacao tratamento e distribuicao de agua' }), false);
  assert.equal(matcher({ cnae: '4930202', haystack: 'transvale transporte rodoviario de carga' }), false);
  assert.equal(matcher({ cnae: null, haystack: 'agua agua agua' }), false, 'sem codigo nao ha evidencia');
});

test('matcher: CNAE formatado da Receita ("4723-7/00") conta igual ao de digitos', () => {
  const matcher = buildRadarSegmentCnaeMatcher('distribuidora de agua', 'Valinhos');
  assert.equal(matcher({ cnae: '4723-7/00', haystack: 'rinagua comercio de aguas ltda' }), true);
});

// Lei herdada do buildSegmentTextMatcher: o nome da CIDADE pedida não conta como texto de
// segmento — em "Águas de Lindóia" toda igreja e academia carrega 'aguas' no nome.
test('matcher: cidade com agua no nome NAO satisfaz o sinal ("Aguas de Lindoia")', () => {
  const matcher = buildRadarSegmentCnaeMatcher('distribuidora de agua', 'Águas de Lindóia');
  assert.equal(matcher({
    cnae: '4723700',
    haystack: 'adega central de aguas de lindoia 4723700 comercio varejista de bebidas',
  }), false);
});

test('matcher: sinal casa PALAVRA INTEIRA ("aguardente"/"aguai" nao sao agua)', () => {
  const matcher = buildRadarSegmentCnaeMatcher('distribuidora de agua', 'Campinas');
  assert.equal(matcher({ cnae: '4723700', haystack: 'casa de aguardente do joao 4723700 comercio varejista de bebidas' }), false);
  assert.equal(matcher({ cnae: '4723700', haystack: 'adega aguai 4723700 comercio varejista de bebidas' }), false);
});

// ARMADILHA documentada em radar-segment-match.util.ts:114-117: buildSegmentTextMatcher aceita
// TUDO quando a frase não tem palavra útil (≥4 chars). Se o sinal usasse aquele matcher, um
// sinal curto ('gas') viraria CURINGA e a allowlist inteira soltaria qualquer registro do CNAE.
test('matcher: sinal de token CURTO e fail-closed, nunca curinga', () => {
  // O mapa hoje só usa 'agua' (4 chars), então a prova é feita na engrenagem que o matcher
  // escolheu: `buildSegmentAliasMatcher` DESCARTA alias sem palavra útil e devolve ()=>false.
  // Se o sinal usasse `buildSegmentTextMatcher`, um 'gas' viraria "casa qualquer texto" e a
  // allowlist inteira soltaria todo registro do CNAE, calada.
  const curto = buildSegmentAliasMatcher(['gas'], 'Valinhos');
  assert.equal(curto('qualquer texto do mundo 4784900'), false);
  assert.equal(curto('deposito de gas do ze'), false);
  const solto = buildSegmentTextMatcher('gas', 'Valinhos');
  assert.equal(solto('qualquer texto do mundo'), true, 'este e o fail-OPEN que nao pode entrar no mapa');
});

test('matcher: segmento sem mapa devolve matcher que nunca aceita (nada afrouxa)', () => {
  const matcher = buildRadarSegmentCnaeMatcher('padaria', 'Fortaleza');
  assert.equal(matcher({ cnae: '4723700', haystack: 'padaria com agua' }), false);
});

// ── O SINAL PRECISA VIAJAR DENTRO DO SQL ────────────────────────────────────────────────────
// O `take` do fetchRecords corta ANTES do filtro fino: 4723700 solto no WHERE traria todo bar
// da cidade e expulsaria as distribuidoras reais das vagas.

test('prisma: entrada sem sinal vira startsWith puro; com sinal vira AND com searchText', () => {
  const matchers = buildRadarSegmentCnaePrismaMatchers('distribuidora de agua');
  const semSinal = matchers.filter((m: any) => m.cnae?.startsWith).map((m: any) => m.cnae.startsWith).sort();
  assert.deepEqual(semSinal, ['3600602', '4635401']);
  const comSinal = matchers.filter((m: any) => Array.isArray(m.AND));
  assert.deepEqual(comSinal.map((m: any) => m.AND[0].cnae.startsWith).sort(), ['4723700', '4784900']);
  assert.deepEqual(comSinal[0].AND[1], { OR: [{ searchText: { contains: 'agua' } }] });
});

test('prisma: segmento fora do mapa nao acrescenta nada ao WHERE', () => {
  assert.deepEqual(buildRadarSegmentCnaePrismaMatchers('padaria'), []);
  assert.deepEqual(buildRadarSegmentCnaePrismaMatchers(''), []);
});

// ── O ATALHO DA EXCLUSAO E DA LANE WEB ──────────────────────────────────────────────────────

test('allowlist: o CODIGO e a evidencia — nome que diz agua sem CNAE nao prova nada', () => {
  assert.equal(matchesRadarSegmentCnaeAllowlist({
    segment: 'distribuidora de agua',
    cnae: '4723700',
    city: 'Valinhos',
    texts: ['RICCI & RICCI COMERCIO DE AGUA MINERAL LTDA', 'Comercio varejista de bebidas'],
  }), true);
  assert.equal(matchesRadarSegmentCnaeAllowlist({
    segment: 'distribuidora de agua',
    city: 'Valinhos',
    texts: ['AGUA E GAS DO ZE'],
  }), false, 'sem CNAE nao ha evidencia positiva');
});

// ── A CONTAGEM DA BASE FALA A MESMA LINGUA DA PORTA ────────────────────────────────────────

test('keyword de contagem: agua vira sinal; gas/bebidas nao tem sinal a exigir', () => {
  assert.equal(resolveRadarSegmentCnaeSignalKeyword('distribuidoras de água'), 'agua');
  assert.equal(resolveRadarSegmentCnaeSignalKeyword('distribuidora de gas'), '');
  assert.equal(resolveRadarSegmentCnaeSignalKeyword('distribuidora de bebidas'), '');
  assert.equal(resolveRadarSegmentCnaeSignalKeyword('padaria'), '');
});
