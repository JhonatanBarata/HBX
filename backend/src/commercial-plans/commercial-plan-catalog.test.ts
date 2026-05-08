import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PRICING,
  buildCommercialPlansCatalog,
} from './commercial-plan-catalog';

test('HBX commercial catalog exposes package prices and quotas', () => {
  assert.equal(COMMERCIAL_PRICING.liteMonthly, 49.90);
  assert.equal(COMMERCIAL_PRICING.padraoMonthly, 89.90);
  assert.equal(COMMERCIAL_PRICING.melhorMonthly, 149.90);
  assert.equal(COMMERCIAL_PRICING.annualDiscountPercent, 20);

  const catalog = buildCommercialPlansCatalog();
  assert.equal(catalog.length, 3);

  const lite = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.LITE);
  assert.equal(lite?.title, 'HBX List');
  assert.equal(lite?.monthlyPrice, 49.90);
  assert.equal(lite?.status, 'available');
  assert.equal(lite?.quotas?.googleSearchesPerDay, 0);
  assert.equal(lite?.quotas?.cardsPerSearch, 50);
  assert.equal(lite?.quotas?.searchesPerCycle, 3);
  assert.equal(lite?.quotas?.totalCards, 150);

  const padrao = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(padrao?.title, 'HBX Lead');
  assert.equal(padrao?.monthlyPrice, 89.90);
  assert.equal(padrao?.trialDays, 30);
  assert.equal(padrao?.recommended, true);
  assert.equal(padrao?.quotas?.googleSearchesPerDay, 2);

  const melhor = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.MELHOR);
  assert.equal(melhor?.title, 'HBX Full — Bot e IA');
  assert.equal(melhor?.monthlyPrice, 149.90);
  assert.equal(melhor?.trialDays, 0);
  assert.equal(melhor?.quotas?.googleSearchesPerDay, 6);
});
