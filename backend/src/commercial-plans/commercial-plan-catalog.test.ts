import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PRICING,
  buildCommercialPlansCatalog,
} from './commercial-plan-catalog';

test('HBX commercial catalog exposes fixed prices and unavailable recovery', () => {
  assert.equal(COMMERCIAL_PRICING.vendasMonthly, 89.90);
  assert.equal(COMMERCIAL_PRICING.botAiMonthly, 39.90);
  assert.equal(COMMERCIAL_PRICING.comboIntroMonthly, 109.85);
  assert.equal(COMMERCIAL_PRICING.comboRegularMonthly, 129.80);

  const catalog = buildCommercialPlansCatalog();
  const recovery = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.RECOVERY);
  assert.equal(recovery?.status, 'unavailable');
  assert.equal(recovery?.monthlyPrice, null);
});
