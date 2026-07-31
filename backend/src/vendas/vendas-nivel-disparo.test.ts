// VACINA do nível de disparo (pedido do dono 31/07: "qual nível ele está? nos
// disparos? conservador, médio, agressivo? tudo isso está muito confuso!").
//
// O que estes testes seguram:
//  1. escolher um nível PREENCHE os 4 campos de risco (senão o botão é decoração);
//  2. a config que sai de um nível é RECONHECIDA como aquele nível (ida e volta) —
//     sem isso a tela mostraria "personalizado" logo depois de clicar em Médio;
//  3. a frase do topo nunca promete o que o freio anti-ban não deixa sair.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NIVEIS_DISPARO,
  detectarNivel,
  definicaoDoNivel,
  fraseDoNivel,
  isNivelDisparo,
  valoresDoNivel,
} from './vendas-nivel-disparo';

test('os três níveis existem e sobem em risco: mais por dia, menos espera', () => {
  assert.deepEqual(NIVEIS_DISPARO.map((n) => n.chave), ['conservador', 'medio', 'agressivo']);
  const [cons, med, agr] = NIVEIS_DISPARO;
  assert.ok(cons.dailyLimit < med.dailyLimit && med.dailyLimit < agr.dailyLimit);
  assert.ok(cons.intervalMinutes > med.intervalMinutes && med.intervalMinutes > agr.intervalMinutes);
});

test('ida e volta: o que o nível grava é reconhecido como aquele nível', () => {
  for (const def of NIVEIS_DISPARO) {
    assert.equal(detectarNivel(valoresDoNivel(def.chave)), def.chave, `nível ${def.chave} não se reconhece`);
  }
});

test('config fora dos presets é personalizado — e isso não é erro', () => {
  assert.equal(
    detectarNivel({ dailyLimit: 17, intervalMinutes: 15, intervalVarianceMinutes: 30, maxAttemptsPerLead: 1 }),
    'personalizado',
  );
  assert.equal(detectarNivel(null), 'personalizado');
  assert.equal(detectarNivel({}), 'personalizado');
});

test('um campo diferente já tira do preset (nível não pode mentir por aproximação)', () => {
  const medio = valoresDoNivel('medio');
  assert.equal(detectarNivel({ ...medio, maxAttemptsPerLead: 3 }), 'personalizado');
  assert.equal(detectarNivel({ ...medio, intervalMinutes: medio.intervalMinutes + 1 }), 'personalizado');
});

test('só as três chaves são aceitas', () => {
  assert.equal(isNivelDisparo('medio'), true);
  assert.equal(isNivelDisparo('AGRESSIVO'), true);
  assert.equal(isNivelDisparo('turbo'), false);
  assert.equal(isNivelDisparo(''), false);
  assert.equal(isNivelDisparo(undefined), false);
});

test('nível desconhecido cai no médio, nunca no agressivo', () => {
  assert.equal(definicaoDoNivel('inexistente' as never).chave, 'medio');
});

test('a frase diz o que SAI, não o que foi pedido, quando o freio corta', () => {
  const frase = fraseDoNivel({ nivel: 'agressivo', valores: valoresDoNivel('agressivo'), tetoEfetivo: 10 });
  assert.match(frase, /Agressivo/);
  assert.match(frase, /10 primeiro/);
  assert.match(frase, /o freio anti-ban libera 10/);
  assert.ok(!/20 primeiro/.test(frase), 'não pode prometer 20 quando só saem 10');
});

test('sem corte do freio, a frase não enche a tela de aviso', () => {
  const frase = fraseDoNivel({ nivel: 'medio', valores: valoresDoNivel('medio'), tetoEfetivo: 10 });
  assert.match(frase, /Médio — 10 primeiro\(s\) contato\(s\) por dia, um a cada ~15 min\./);
  assert.ok(!/freio/.test(frase));
});

test('personalizado também tem frase legível', () => {
  const frase = fraseDoNivel({
    nivel: 'personalizado',
    valores: { dailyLimit: 17, intervalMinutes: 12 },
    tetoEfetivo: 10,
  });
  assert.match(frase, /^Personalizado — 10 primeiro/);
  assert.match(frase, /sua config pede 17/);
});
