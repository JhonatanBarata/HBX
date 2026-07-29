import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSegmentTextMatcher, buildSegmentAliasMatcher, segmentTokenGroups } from './radar-segment-match.util';

// Casos REAIS da regressão de 28/07 (busca "distribuidora de agua" em Águas de Lindóia/Aguaí/
// Zacarias na VPS): o OR-substring antigo aceitava igreja, academia, partido e piscicultor.

test('segmentTokenGroups: uma palavra util por grupo, singular/plural equivalentes', () => {
  const groups = segmentTokenGroups('distribuidora de agua');
  assert.equal(groups.length, 2, '"de" (curta) fora; distribuidora e agua viram 2 grupos');
  assert.ok(groups[0].includes('distribuidora') && groups[0].includes('distribuidoras'));
  assert.ok(groups[1].includes('agua') && groups[1].includes('aguas'));
});

test('segmentTokenGroups: withRadical conecta variacoes de atividade (sorveteria→sorvete)', () => {
  const groups = segmentTokenGroups('sorveteria', { withRadical: true });
  assert.ok(groups[0].includes('sorvete'), 'radical curto entra no MESMO grupo (OR interno)');
});

test('matcher: distribuidora de agua legitima passa', () => {
  const matcher = buildSegmentTextMatcher('distribuidora de agua', 'Águas da Prata');
  assert.ok(matcher('mr distribuidora de agua mineral'));
  assert.ok(matcher('distribuidora de aguas cristal 4635402 comercio atacadista de agua mineral'));
});

test('matcher: exige TODAS as palavras — "distribuidora" sozinha nao basta (pescado fora)', () => {
  const matcher = buildSegmentTextMatcher('distribuidora de agua', 'Zacarias');
  assert.equal(matcher('jf fogaca distribuidora de pescado ltda comercio atacadista de pescados'), false);
});

test('matcher: "agua" na descricao de CNAE sem a outra palavra nao basta (piscicultor fora)', () => {
  const matcher = buildSegmentTextMatcher('distribuidora de agua', 'Zacarias');
  assert.equal(matcher('jose roberto marin 0322101 criacao de peixes em agua doce'), false);
});

test('matcher: palavra INTEIRA — "agua" nao casa "AGUAI" (academia de Aguai fora)', () => {
  const matcher = buildSegmentTextMatcher('distribuidora de agua', 'Outra Cidade');
  assert.equal(matcher('academia champions aguai'), false);
  // Isola o \b: tem "distribuidora", mas o unico "agua*" e substring de "aguai" — nao casa.
  assert.equal(matcher('distribuidora champions aguai'), false);
});

test('matcher: nome da cidade pedida nao conta como texto (igreja de Aguas de Lindoia fora)', () => {
  const matcher = buildSegmentTextMatcher('distribuidora de agua', 'Águas de Lindóia');
  assert.equal(matcher('igreja presbiteriana de aguas de lindoia 9491000 atividades de organizacoes religiosas'), false);
  // Contraprova: distribuidora legitima DA MESMA cidade continua passando — o strip tira só a
  // frase da cidade, "agua" de verdade fora dela segue valendo.
  assert.ok(matcher('distribuidora de agua sao jose de aguas de lindoia'));
});

test('matcher: sem segmento pedido aceita tudo (sem filtro)', () => {
  const matcher = buildSegmentTextMatcher('', 'Aguaí');
  assert.ok(matcher('qualquer empresa'));
});

test('matcher: singular/plural cruzados casam (distribuidoras↔distribuidora)', () => {
  const matcher = buildSegmentTextMatcher('distribuidoras de aguas', 'Zacarias');
  assert.ok(matcher('distribuidora de agua mineral zacarias ltda'));
});

test('matcher: lista com virgula e OR entre frases (cada frase inteira, nao a soma)', () => {
  // "bicicletarias, calçados" = quero bicicletaria OU calçados — um item basta, mas o item
  // que casar casa inteiro. Tratar a lista como frase única (AND de tudo) mataria os dois.
  const matcher = buildSegmentTextMatcher('bicicletarias, calçados', 'Rio Claro');
  assert.ok(matcher('humanitarian calcados'));
  assert.ok(matcher('bicicletaria e borracharia santana'));
  assert.equal(matcher('edr imobiliaria'), false);
});

test('matcher: radicalPrefix tolera flexao em palavra longa sem reabrir o furo da curta', () => {
  const matcher = buildSegmentTextMatcher('distribuidora de agua', 'Aguaí', { radicalPrefix: true });
  assert.ok(matcher('distribuidores de agua em sao paulo'), 'distribuidores casa pelo radical');
  assert.equal(matcher('distribuidora champions aguai'), false, '"agua" segue exigindo palavra exata');
});
