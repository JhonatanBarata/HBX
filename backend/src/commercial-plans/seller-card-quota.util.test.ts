import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRadarSearchAllowance, resolveSellerCardQuota } from './seller-card-quota.util';

test('resolveSellerCardQuota returns zero when seller is paused', () => {
  const result = resolveSellerCardQuota({
    config: { paused: true, baseActiveCardLimit: 20 },
    salesWonLast30: 12,
    inactivityDays: 0,
  });

  assert.equal(result.effectiveLimit, 0);
  assert.equal(result.reason, 'SELLER_QUOTA_PAUSED');
});

test('resolveSellerCardQuota clamps manual override inside min and max', () => {
  const low = resolveSellerCardQuota({
    config: { manualActiveCardLimitOverride: 2, minActiveCardLimit: 5, maxActiveCardLimit: 100 },
    salesWonLast30: 0,
    inactivityDays: 0,
  });
  const high = resolveSellerCardQuota({
    config: { manualActiveCardLimitOverride: 200, minActiveCardLimit: 5, maxActiveCardLimit: 100 },
    salesWonLast30: 0,
    inactivityDays: 0,
  });

  assert.equal(low.effectiveLimit, 5);
  assert.equal(high.effectiveLimit, 100);
});

test('resolveSellerCardQuota applies sales bonus and inactivity penalty', () => {
  const result = resolveSellerCardQuota({
    config: { baseActiveCardLimit: 20, minActiveCardLimit: 5, maxActiveCardLimit: 100 },
    salesWonLast30: 6,
    inactivityDays: 8,
  });

  assert.equal(result.baseLimit, 20);
  assert.equal(result.bonus, 10);
  assert.equal(result.inactivityPenalty, 15);
  assert.equal(result.effectiveLimit, 15);
});

test('resolveRadarSearchAllowance blocks before expensive Radar search when no slot remains', () => {
  const result = resolveRadarSearchAllowance({
    sellerId: 7,
    companyId: 1,
    requestedLimit: 50,
    activeCount: 20,
    effectiveLimit: 20,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SELLER_CARD_QUOTA_REACHED');
  assert.equal(result.allowedLimit, 0);
});

test('resolveRadarSearchAllowance limits requested count by active slots, plan and day', () => {
  const result = resolveRadarSearchAllowance({
    sellerId: 7,
    companyId: 1,
    requestedLimit: 50,
    activeCount: 12,
    effectiveLimit: 20,
    planLimit: 30,
    dailyRemaining: 6,
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'OK');
  assert.equal(result.availableSlots, 8);
  assert.equal(result.allowedLimit, 6);
});
