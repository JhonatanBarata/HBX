import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSeatBillingFromIntervals,
  resolveExtraSeatMonthlyAmount,
} from './seat-billing.util';

test('seat billing prorates extra users by active days in the month', () => {
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

test('seat billing defaults the extra user price to 24.90 when config is empty', () => {
  assert.equal(resolveExtraSeatMonthlyAmount(0), 24.9);
  assert.equal(resolveExtraSeatMonthlyAmount(null), 24.9);
});
