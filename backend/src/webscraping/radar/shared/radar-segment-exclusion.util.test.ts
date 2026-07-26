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
