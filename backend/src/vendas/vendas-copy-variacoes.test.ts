// VACINAS das variações de copy por IA (item 3, 30/07). O contrato que estes
// testes seguram: a IA só PROPÕE; o lote passa pela MESMA régua do gate
// anti-carimbo; placeholders da frase-base são imutáveis.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VARIACOES_QUANTIDADE_MAX,
  extrairPlaceholders,
  montarPromptVariacoes,
  parseVariacoesResposta,
  validarLoteVariacoes,
} from './vendas-copy-variacoes';

const BASE =
  '{{cumprimentacao}}, tudo bem? Me chamo {{funcionario}}, da {{empresa}}. Posso te explicar rapidinho o que a gente faz e ver se faz sentido aí?';

test('placeholders: extrai o conjunto {{...}} ordenado e ignora lixo', () => {
  assert.deepEqual(extrairPlaceholders(BASE), ['cumprimentacao', 'empresa', 'funcionario']);
  assert.deepEqual(extrairPlaceholders('sem marcador nenhum'), []);
  assert.deepEqual(extrairPlaceholders('{{ espacado }} e {{repetido}} de novo {{repetido}}'), ['espacado', 'repetido']);
});

test('prompt: exige os marcadores da base e proíbe inventar oferta', () => {
  const messages = montarPromptVariacoes(BASE, 4);
  const system = messages[0].content;
  assert.match(system, /PROIBIDO inventar produto, benefício, preço/);
  assert.match(system, /\{\{cumprimentacao\}\}, \{\{empresa\}\}, \{\{funcionario\}\}/);
  const semPlaceholder = montarPromptVariacoes('Frase simples sem marcador, tudo bem por aí?', 4);
  assert.match(semPlaceholder[0].content, /NÃO use marcadores/);
});

test('parse tolerante: JSON puro, JSON em markdown, bullets e podre', () => {
  assert.deepEqual(parseVariacoesResposta('["a primeira", "a segunda"]'), ['a primeira', 'a segunda']);
  assert.deepEqual(parseVariacoesResposta('Claro! Aqui:\n```json\n["x da silva"]\n```'), ['x da silva']);
  assert.deepEqual(parseVariacoesResposta('- opcao um da lista\n2) opcao dois da lista'), ['opcao um da lista', 'opcao dois da lista']);
  assert.deepEqual(parseVariacoesResposta(''), []);
  assert.deepEqual(parseVariacoesResposta('   '), []);
});

test('régua do gate: variação quase igual à base é RECUSADA com motivo legível', () => {
  // Mesmo truque do incidente real: trocar meia dúzia de palavras não passa.
  const quaseIgual = BASE.replace('Me chamo', 'Aqui é o').replace('rapidinho', 'bem rápido');
  const bemDiferente =
    '{{cumprimentacao}}! Sou {{funcionario}}, da {{empresa}}. Vi o trabalho de vocês e queria trocar uma ideia curta sobre a rotina — topa?';
  const { aprovadas, recusadas } = validarLoteVariacoes(BASE, [quaseIgual, bemDiferente], 85);
  assert.deepEqual(aprovadas, [bemDiferente]);
  assert.equal(recusadas.length, 1);
  assert.match(recusadas[0].motivo, /igual à frase original/);
});

test('irmãs parecidas entre si: só a primeira entra', () => {
  const v1 = '{{cumprimentacao}}! Sou {{funcionario}}, da {{empresa}}. Vi o trabalho de vocês e queria trocar uma ideia curta sobre a rotina — topa?';
  const v2 = v1.replace('ideia curta', 'ideia rápida');
  const { aprovadas, recusadas } = validarLoteVariacoes(BASE, [v1, v2], 85);
  assert.equal(aprovadas.length, 1);
  assert.match(recusadas[0].motivo, /outra variação do lote/);
});

test('placeholders imutáveis: perder ou inventar {{...}} recusa', () => {
  const perdeu = 'Bom dia, tudo bem? Sou da {{empresa}}. Posso te mostrar uma ideia nova sobre a rotina de vocês hoje?';
  const inventou = `${BASE} {{link_pagamento}}`;
  const { aprovadas, recusadas } = validarLoteVariacoes(BASE, [perdeu, inventou], 85);
  assert.equal(aprovadas.length, 0);
  assert.equal(recusadas.length, 2);
  assert.match(recusadas[0].motivo, /marcadores/);
  assert.match(recusadas[1].motivo, /marcadores/);
});

test('curta demais e teto de quantidade', () => {
  const curta = 'oi, tudo bem?';
  const { recusadas } = validarLoteVariacoes(BASE, [curta], 85);
  assert.match(recusadas[0]?.motivo || '', /Curta demais/);

  const muitas = Array.from({ length: 20 }, (_, i) =>
    `{{cumprimentacao}} numero ${'x'.repeat(i + 1)}, aqui fala {{funcionario}} da {{empresa}} sobre o assunto ${i} de hoje, completamente diferente ${'y'.repeat(20 - i)}`);
  const lote = validarLoteVariacoes(BASE, muitas, 999 /* régua frouxa: mede só o teto */, VARIACOES_QUANTIDADE_MAX);
  assert.ok(lote.aprovadas.length <= VARIACOES_QUANTIDADE_MAX);
});
