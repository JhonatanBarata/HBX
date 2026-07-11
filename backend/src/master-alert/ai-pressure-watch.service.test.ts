import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAiPressure, AiPressureSample } from './ai-pressure-watch.service';
import { AiPressureSignals } from './ai-pressure-signals';

// AI-SOS — o avaliador é PURO: janela de amostras → veredito. Aqui provamos os
// 3 sinais (recusas do governor, falhas do extrator, p95) e que zero-pressão
// NUNCA grita (o grito incomoda o dono — falso positivo é bug).

const THRESHOLDS = { refusals15m: 3, extractorFails15m: 3, waitP95Ms: 20_000 };

function sample(partial: Partial<AiPressureSample>): AiPressureSample {
  return { refusedDelta: 0, extractorFailsDelta: 0, waitP95Ms: 0, ...partial };
}

test('sem pressão → sem grito (janela vazia e janela zerada)', () => {
  assert.equal(evaluateAiPressure([], THRESHOLDS).trigger, false);
  assert.equal(evaluateAiPressure([sample({}), sample({}), sample({})], THRESHOLDS).trigger, false);
});

test('recusas do governor somadas na janela cruzam o limiar → grito', () => {
  const window = [sample({ refusedDelta: 1 }), sample({ refusedDelta: 1 }), sample({ refusedDelta: 1 })];
  const verdict = evaluateAiPressure(window, THRESHOLDS);
  assert.equal(verdict.trigger, true);
  assert.equal(verdict.refusals, 3);
  assert.match(verdict.reasons.join(','), /recusas=3/);
});

test('2 recusas + 2 falhas de extrator NÃO grita (nenhum sinal cruzou sozinho)', () => {
  const window = [sample({ refusedDelta: 2 }), sample({ extractorFailsDelta: 2 })];
  assert.equal(evaluateAiPressure(window, THRESHOLDS).trigger, false);
});

test('falhas do extrator do concierge cruzam o limiar → grito', () => {
  const window = [sample({ extractorFailsDelta: 2 }), sample({ extractorFailsDelta: 1 })];
  const verdict = evaluateAiPressure(window, THRESHOLDS);
  assert.equal(verdict.trigger, true);
  assert.equal(verdict.extractorFails, 3);
});

test('p95 acima do teto → grito; teto 0 desliga o sinal', () => {
  const window = [sample({ waitP95Ms: 25_000 })];
  assert.equal(evaluateAiPressure(window, THRESHOLDS).trigger, true);
  assert.equal(evaluateAiPressure(window, { ...THRESHOLDS, waitP95Ms: 0 }).trigger, false);
});

test('delta negativo (reset/boot) nunca vira pressão fantasma', () => {
  const window = [sample({ refusedDelta: -5, extractorFailsDelta: -2 })];
  const verdict = evaluateAiPressure(window, THRESHOLDS);
  assert.equal(verdict.trigger, false);
  assert.equal(verdict.refusals, 0);
});

test('AiPressureSignals: report/total/snapshot e nunca lança', () => {
  AiPressureSignals.resetForTests();
  AiPressureSignals.report('concierge_extractor_fail');
  AiPressureSignals.report('concierge_extractor_fail');
  AiPressureSignals.report('concierge_extractor_invalid');
  AiPressureSignals.report('');
  assert.equal(AiPressureSignals.total(), 4);
  const snap = AiPressureSignals.snapshot();
  assert.equal(snap['concierge_extractor_fail'], 2);
  assert.equal(snap['concierge_extractor_invalid'], 1);
  assert.equal(snap['unknown'], 1);
  AiPressureSignals.resetForTests();
});
