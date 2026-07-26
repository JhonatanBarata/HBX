import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyRoboReplyHeat } from './vendas-robo-heat';

test('classifyRoboReplyHeat: pedido de preco e quente', () => {
  const result = classifyRoboReplyHeat('Oi, quanto custa isso?');
  assert.equal(result.quente, true);
  assert.equal(result.intent.kind, 'positive');
});

test('classifyRoboReplyHeat: pedido de humano e quente', () => {
  const result = classifyRoboReplyHeat('Pode me ligar? quero falar com humano');
  assert.equal(result.quente, true);
  assert.equal(result.intent.kind, 'human_requested');
});

test('classifyRoboReplyHeat: recusa nao e quente', () => {
  const result = classifyRoboReplyHeat('Não tenho interesse, obrigado');
  assert.equal(result.quente, false);
  assert.equal(result.intent.kind, 'negative');
});

test('classifyRoboReplyHeat: opt-out explicito nao e quente', () => {
  const result = classifyRoboReplyHeat('Remova meu contato da lista, por favor');
  assert.equal(result.quente, false);
  assert.equal(result.intent.kind, 'opt_out');
});

test('classifyRoboReplyHeat: duvida neutra nao e quente', () => {
  const result = classifyRoboReplyHeat('oi, quem é vc?');
  assert.equal(result.quente, false);
});

test('classifyRoboReplyHeat: texto vazio nao e quente', () => {
  const result = classifyRoboReplyHeat('');
  assert.equal(result.quente, false);
});

test('classifyRoboReplyHeat: aceita classificador injetado (campo pra IA plugar)', () => {
  const result = classifyRoboReplyHeat('qualquer coisa', () => ({
    kind: 'positive',
    confidence: 0.99,
    reasons: ['ai:mock'],
    signals: { positive: true, negative: false, optOut: false, whatIsIt: false, delay: false, humanHandoff: false, neutral: false },
  }));
  assert.equal(result.quente, true);
});
