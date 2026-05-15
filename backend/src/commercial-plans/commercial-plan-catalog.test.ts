import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PRICING,
  buildCommercialPlansCatalog,
} from './commercial-plan-catalog';

test('HBX commercial catalog exposes package prices and quotas', () => {
  assert.equal(COMMERCIAL_PRICING.liteMonthly, 39.90);
  assert.equal(COMMERCIAL_PRICING.padraoMonthly, 99.90);
  assert.equal(COMMERCIAL_PRICING.melhorMonthly, 149.90);
  assert.equal(COMMERCIAL_PRICING.extraUserMonthly, 29.90);
  assert.equal(COMMERCIAL_PRICING.annualDiscountPercent, 20);

  const catalog = buildCommercialPlansCatalog();
  assert.equal(catalog.length, 2);

  const lite = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.LITE);
  assert.equal(lite?.title, 'HBX List');
  assert.equal(lite?.monthlyPrice, 39.90);
  assert.equal(lite?.status, 'available');
  assert.equal(lite?.trialDays, 0);
  assert.equal(lite?.includedUsers, 1);
  assert.equal(lite?.extraUserMonthlyPrice, 29.90);
  assert.equal(lite?.requiresCheckout, false);
  assert.equal(lite?.quotas?.googleSearchesPerDay, 0);
  assert.equal(lite?.quotas?.cardsPerSearch, 50);
  assert.equal(lite?.quotas?.searchesPerCycle, 3);
  assert.equal(lite?.quotas?.totalCards, 150);

  const fullCatalog = buildCommercialPlansCatalog({ includeHidden: true });
  const padrao = fullCatalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(padrao?.title, 'HBX Lead');
  assert.equal(padrao?.monthlyPrice, 99.90);
  assert.equal(padrao?.trialDays, 14);
  assert.equal(padrao?.hidden, true);
  assert.equal(padrao?.recommended, false);
  assert.equal(padrao?.quotas?.googleSearchesPerDay, 2);

  const melhor = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.MELHOR);
  assert.equal(melhor?.title, 'HBX Full — Bot e IA');
  assert.equal(melhor?.monthlyPrice, 149.90);
  assert.equal(melhor?.trialDays, 0);
  assert.equal(melhor?.includedUsers, 1);
  assert.equal(melhor?.extraUserMonthlyPrice, 29.90);
  assert.equal(melhor?.requiresAssistedSetup, true);
  assert.equal(melhor?.setupFeeMode, 'negotiated');
  assert.equal(melhor?.requiresCheckout, false);
  assert.equal(melhor?.quotas?.googleSearchesPerDay, 6);
});
