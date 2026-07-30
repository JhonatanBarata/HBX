import test from 'node:test';
import assert from 'node:assert/strict';
import { findRadarSegmentExclusionMatch, resolveSegmentExclusionRules } from './radar-segment-exclusion.util';

test('resolveSegmentExclusionRules: "distribuidora" tem mapa de exclusao (varias categorias)', () => {
  const rules = resolveSegmentExclusionRules('distribuidora');
  assert.ok(rules.length >= 4);
  assert.ok(rules.some((rule) => rule.code === 'energia_agua_combustivel'));
  assert.ok(rules.some((rule) => rule.code === 'transporte_carga'));
  assert.ok(rules.some((rule) => rule.code === 'varejo_puro'));
  assert.ok(rules.some((rule) => rule.code === 'servicos_financeiros'));
});

test('resolveSegmentExclusionRules: tolera plural ("distribuidoras") e segmento composto ("distribuidora de bebidas")', () => {
  assert.ok(resolveSegmentExclusionRules('distribuidoras').length > 0);
  assert.ok(resolveSegmentExclusionRules('distribuidora de bebidas').length > 0);
});

test('resolveSegmentExclusionRules: segmento sem mapa devolve lista vazia (nao quebra, so nao exclui nada)', () => {
  assert.deepEqual(resolveSegmentExclusionRules('padaria'), []);
  assert.deepEqual(resolveSegmentExclusionRules(''), []);
  assert.deepEqual(resolveSegmentExclusionRules(null), []);
});

// Caso literal do briefing (dono 25/07): "Distribuidora de Energia X" nao entra no
// segmento "distribuidora" mesmo o nome tendo a palavra "distribuidora" (similaridade
// textual venceria um match ingenuo por token) — a exclusao tem que vencer.
test('findRadarSegmentExclusionMatch: exclusao vence nome parecido ("Distribuidora de Energia X" nao entra em distribuidora)', () => {
  const match = findRadarSegmentExclusionMatch('distribuidora', 'Distribuidora de Energia X', 'Distribuidora de Energia X Ltda');
  assert.ok(match);
  assert.equal(match?.code, 'energia_agua_combustivel');
});

test('findRadarSegmentExclusionMatch: pega pelo CNAE/descricao mesmo com nome neutro', () => {
  const match = findRadarSegmentExclusionMatch(
    'distribuidora',
    'Comercial ABC',
    'Comercial ABC Ltda',
    '4930-2/02',
    'Transporte rodoviario de carga',
  );
  assert.ok(match);
  assert.equal(match?.code, 'transporte_carga');
});

test('findRadarSegmentExclusionMatch: candidato realmente do segmento (distribuidora de bebidas) nao e excluido', () => {
  const match = findRadarSegmentExclusionMatch(
    'distribuidora',
    'Distribuidora de Bebidas Boa Vista',
    'Distribuidora de Bebidas Boa Vista Ltda',
    '4635-4/99',
    'Comercio atacadista de bebidas',
  );
  assert.equal(match, null);
});

test('findRadarSegmentExclusionMatch: sem segmento pedido nunca exclui', () => {
  assert.equal(findRadarSegmentExclusionMatch('', 'Distribuidora de Energia X'), null);
  assert.equal(findRadarSegmentExclusionMatch(null, 'Banco Comercial Y'), null);
});

test('findRadarSegmentExclusionMatch: segmento sem mapa proprio nunca exclui (comportamento intacto)', () => {
  assert.equal(findRadarSegmentExclusionMatch('padaria', 'Distribuidora de Energia X'), null);
});

// ── 30/07 (DDD 19): 18 farmacêuticas/hospitalares passaram VIVAS em "distribuidora de água"
// (Sanofi 54 > JOBEMA água 49). CNAE/nome de medicamentos É evidência positiva de outro ramo —
// o mapa tinha 5 regras e nenhuma de farma, então a porta só via "não sei" (unconfirmed).
test('exclusao distribuidora: farmaceutico/hospitalar e evidencia positiva de outro ramo', () => {
  const match = findRadarSegmentExclusionMatch('distribuidora de agua', 'Suplefar',
    'Comércio atacadista de medicamentos e drogas de uso humano');
  assert.equal(match?.code, 'farma_hospitalar');
  const porNome = findRadarSegmentExclusionMatch('distribuidora de agua', 'Sanofi Medley Farmaceutica');
  assert.equal(porNome?.code, 'farma_hospitalar');
});

// MINA pré-existente (relatório 30/07): o segmento PEDIDO pelo dono caía na própria regra de
// exclusão — "distribuidora de energia" morria na regra energia_agua_combustivel (token
// 'energia' e 'distribuicao de energia' no CNAE) e a busca se auto-excluía inteira, na porta
// da Receita E no gate web. Regra cuja atividade É o pedido sai do jogo.
test('exclusao NAO auto-exclui o segmento pedido ("distribuidora de energia" vive)', () => {
  const match = findRadarSegmentExclusionMatch(
    'distribuidora de energia',
    'Distribuidora de Energia Alfa Ltda',
    'Distribuição de energia elétrica',
  );
  assert.equal(match, null);
});

// Guarda da regra nova: pedir "distribuidora de medicamentos" não pode cair na regra farma.
test('exclusao NAO mata o proprio segmento pedido (farma pedida explicitamente)', () => {
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de medicamentos',
    'Camp Life Distribuidora de Medicamentos', 'Comércio atacadista de medicamentos'), null);
});
