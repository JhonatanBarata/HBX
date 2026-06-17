import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computePlanProration,
  computeRemainingRatio,
  remainingDays,
} from './plan-proration.util';

// Período de 30 dias (1/jun → 1/jul). "Agora" no dia 16 = ~metade restante.
const periodStart = new Date(2026, 5, 1);
const periodEnd = new Date(2026, 6, 1);
const midPeriod = new Date(2026, 5, 16); // 15 dias restantes de 30 ≈ 0.5

test('upgrade cobra a diferença proporcional aos dias restantes', () => {
  // Lead 99 → Pro 249 = +150; ~metade do período = ~75.
  const p = computePlanProration({
    fromCycleAmount: 99,
    toCycleAmount: 249,
    periodStart,
    periodEnd,
    now: midPeriod,
  });
  assert.equal(p.creditGenerated, 0);
  assert.ok(p.chargeNow > 70 && p.chargeNow < 80, `chargeNow=${p.chargeNow}`);
});

test('downgrade gera crédito proporcional e NÃO cobra nada', () => {
  // Pro 249 → Lead 99 = -150; ~metade = ~75 de crédito.
  const p = computePlanProration({
    fromCycleAmount: 249,
    toCycleAmount: 99,
    periodStart,
    periodEnd,
    now: midPeriod,
  });
  assert.equal(p.chargeNow, 0);
  assert.ok(p.creditGenerated > 70 && p.creditGenerated < 80, `credit=${p.creditGenerated}`);
});

test('mesmo valor: nem cobra nem credita', () => {
  const p = computePlanProration({
    fromCycleAmount: 99,
    toCycleAmount: 99,
    periodStart,
    periodEnd,
    now: midPeriod,
  });
  assert.equal(p.chargeNow, 0);
  assert.equal(p.creditGenerated, 0);
});

test('no começo do período cobra a diferença cheia (ratio 1)', () => {
  const p = computePlanProration({
    fromCycleAmount: 99,
    toCycleAmount: 249,
    periodStart,
    periodEnd,
    now: periodStart,
  });
  assert.equal(p.remainingRatio, 1);
  assert.equal(p.chargeNow, 150);
});

test('no fim do período não cobra nada (ratio 0)', () => {
  const p = computePlanProration({
    fromCycleAmount: 99,
    toCycleAmount: 249,
    periodStart,
    periodEnd,
    now: periodEnd,
  });
  assert.equal(p.remainingRatio, 0);
  assert.equal(p.chargeNow, 0);
});

test('período ausente trata como ciclo cheio (ratio 1)', () => {
  assert.equal(computeRemainingRatio(null, null, midPeriod), 1);
  const p = computePlanProration({
    fromCycleAmount: 99,
    toCycleAmount: 249,
    periodStart: null,
    periodEnd: null,
    now: midPeriod,
  });
  assert.equal(p.chargeNow, 150);
});

test('remainingDays conta os dias inteiros que faltam', () => {
  assert.equal(remainingDays(periodEnd, midPeriod), 15);
  assert.equal(remainingDays(periodEnd, periodEnd), 0);
});
