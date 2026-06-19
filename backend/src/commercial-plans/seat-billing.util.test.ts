import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSeatBillingFromIntervals,
  computeImmediateExtraSeatCharge,
  isBillableUserSeatSnapshot,
  resolveExtraSeatMonthlyAmount,
} from './seat-billing.util';

test('F6: assento extra cobra proporcional aos dias restantes do mês corrente', () => {
  // Junho tem 30 dias. Dia 28 (00:00) → faltam 3 dias (28, 29, 30) → 3/30 = 0,1.
  const dia28 = new Date(2026, 5, 28);
  const um = computeImmediateExtraSeatCharge({ seats: 1, extraSeatMonthly: 24.9, now: dia28 });
  assert.equal(um.daysInMonth, 30);
  assert.equal(um.remainingDays, 3);
  assert.equal(um.chargeNow, 2.49); // 24,90 × 1 × 0,1

  // 2 assentos no mesmo dia dobram a cobrança proporcional.
  const dois = computeImmediateExtraSeatCharge({ seats: 2, extraSeatMonthly: 24.9, now: dia28 });
  assert.equal(dois.chargeNow, 4.98);

  // No primeiro dia do mês cobra o valor cheio (mês inteiro pela frente).
  const dia1 = new Date(2026, 5, 1);
  const cheio = computeImmediateExtraSeatCharge({ seats: 1, extraSeatMonthly: 24.9, now: dia1 });
  assert.equal(cheio.remainingDays, 30);
  assert.equal(cheio.chargeNow, 24.9);

  // Valor do assento extra editado no Self-Checkout (F2) é respeitado.
  const custom = computeImmediateExtraSeatCharge({ seats: 1, extraSeatMonthly: 19.9, now: dia1 });
  assert.equal(custom.chargeNow, 19.9);

  // Zero assentos → zero.
  assert.equal(computeImmediateExtraSeatCharge({ seats: 0, extraSeatMonthly: 24.9, now: dia1 }).chargeNow, 0);
});

test('seat billing prorates extra sellers by active days in the month', () => {
  const periodStart = new Date(2026, 4, 1);
  const periodEnd = new Date(2026, 5, 1);
  const snapshot = buildSeatBillingFromIntervals({
    periodStart,
    periodEnd,
    includedUsers: 2,
    activeUsers: 2,
    extraSeatMonthlyAmount: 24.9,
    intervals: [
      { startedAt: new Date(2026, 3, 20), endedAt: null },
      { startedAt: new Date(2026, 3, 21), endedAt: null },
      { startedAt: new Date(2026, 4, 10), endedAt: new Date(2026, 4, 20) },
    ],
  });

  assert.equal(snapshot.billedImmediately, false);
  assert.equal(snapshot.billingMode, 'month_end_prorated');
  assert.equal(snapshot.extraActiveUsers, 0);
  assert.equal(snapshot.extraSeatBillableDays, 10);
  assert.equal(snapshot.extraSeatCycleAmount, 8.03);
});

test('seat billing defaults the extra seller price to 24.90 when config is empty', () => {
  assert.equal(resolveExtraSeatMonthlyAmount(0), 24.9);
  assert.equal(resolveExtraSeatMonthlyAmount(null), 24.9);
});

test('seat billing charges the occupied seller slot, not each replaced seller', () => {
  const periodStart = new Date(2026, 4, 1);
  const periodEnd = new Date(2026, 5, 1);
  const replacementAt = new Date(2026, 4, 16);
  const snapshot = buildSeatBillingFromIntervals({
    periodStart,
    periodEnd,
    includedUsers: 2,
    activeUsers: 3,
    extraSeatMonthlyAmount: 24.9,
    intervals: [
      { startedAt: new Date(2026, 3, 20), endedAt: null },
      { startedAt: new Date(2026, 3, 21), endedAt: null },
      { startedAt: new Date(2026, 4, 1), endedAt: replacementAt },
      { startedAt: replacementAt, endedAt: null },
    ],
  });

  assert.equal(snapshot.extraSeatAverageUsers, 1);
  assert.equal(snapshot.extraSeatCycleAmount, 24.9);
});

test('seat billing counts active customer admins as seller seats', () => {
  const base = {
    companyId: 10,
    isActive: true,
    deactivatedAt: null,
    isSystemMaster: false,
  };

  assert.equal(isBillableUserSeatSnapshot({ ...base, role: 'USER' }), true);
  assert.equal(isBillableUserSeatSnapshot({ ...base, role: 'ADMIN' }), true);
  assert.equal(isBillableUserSeatSnapshot({ ...base, role: 'USERMASTER' }), false);
  assert.equal(isBillableUserSeatSnapshot({ ...base, role: 'ADMIN', isSystemMaster: true }), false);
});
