import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSeatBillingFromIntervals,
  isBillableUserSeatSnapshot,
  resolveExtraSeatMonthlyAmount,
} from './seat-billing.util';

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

test('seat billing only counts active sellers, not admins', () => {
  const base = {
    companyId: 10,
    isActive: true,
    deactivatedAt: null,
    isSystemMaster: false,
  };

  assert.equal(isBillableUserSeatSnapshot({ ...base, role: 'USER' }), true);
  assert.equal(isBillableUserSeatSnapshot({ ...base, role: 'ADMIN' }), false);
  assert.equal(isBillableUserSeatSnapshot({ ...base, role: 'USERMASTER' }), false);
});
