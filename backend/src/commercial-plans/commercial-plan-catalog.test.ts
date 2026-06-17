import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PRICING,
  applyCommissionCap,
  buildCommercialPlansCatalog,
} from './commercial-plan-catalog';

test('HBX commercial catalog exposes package prices and quotas', () => {
  assert.equal(COMMERCIAL_PRICING.liteMonthly, 49.00);
  assert.equal(COMMERCIAL_PRICING.padraoMonthly, 99.00);
  assert.equal(COMMERCIAL_PRICING.proMonthly, 249.00);
  assert.equal(COMMERCIAL_PRICING.melhorMonthly, 445.90);
  assert.equal(COMMERCIAL_PRICING.extraUserMonthly, 24.90);
  assert.equal(COMMERCIAL_PRICING.annualDiscountPercent, 20);

  const catalog = buildCommercialPlansCatalog();
  assert.equal(catalog.length, 4);

  const lite = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.LITE);
  assert.equal(lite?.title, 'HBX List');
  assert.equal(lite?.monthlyPrice, 49.00);
  assert.equal(lite?.status, 'available');
  assert.equal(lite?.trialDays, 0);
  assert.equal(lite?.includedUsers, 1);
  assert.equal(lite?.extraUserMonthlyPrice, 0);
  assert.equal(lite?.requiresCheckout, false);
  assert.equal(lite?.quotas?.googleSearchesPerDay, 0);
  assert.equal(lite?.quotas?.cardsPerMonth, 880);
  assert.equal(lite?.quotas?.dailyCardSafetyLimit, 50);
  assert.equal(lite?.quotas?.cardsPerSearch, 50);
  assert.equal(lite?.quotas?.searchesPerCycle, 3);
  assert.equal(lite?.quotas?.totalCards, 880);

  const fullCatalog = buildCommercialPlansCatalog({ includeHidden: true });
  const padrao = fullCatalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(padrao?.title, 'HBX Lead Plus');
  assert.equal(padrao?.monthlyPrice, 99.00);
  assert.equal(padrao?.trialDays, 14);
  assert.equal(padrao?.hidden, false);
  assert.equal(padrao?.recommended, true);
  assert.equal(padrao?.includedUsers, 2);
  assert.equal(padrao?.extraUserMonthlyPrice, 24.90);
  assert.equal(padrao?.quotas?.googleSearchesPerDay, 2);
  assert.equal(padrao?.quotas?.cardsPerMonth, 2200);
  assert.equal(padrao?.quotas?.dailyCardSafetyLimit, 100);

  const pro = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.PRO);
  assert.equal(pro?.title, 'HBX Pro');
  assert.equal(pro?.monthlyPrice, 249.00);
  assert.equal(pro?.trialDays, 0);
  assert.equal(pro?.includedUsers, 3);
  assert.equal(pro?.requiresAssistedSetup, false);
  assert.equal(pro?.quotas?.cardsPerMonth, 3500);

  const melhor = catalog.find((plan) => plan.key === COMMERCIAL_PLAN_KEYS.MELHOR);
  assert.equal(melhor?.title, 'Implantação');
  assert.equal(melhor?.monthlyPrice, 445.90);
  assert.equal((melhor as { priceFrom?: boolean })?.priceFrom, true);
  assert.equal(melhor?.trialDays, 0);
  assert.equal(melhor?.includedUsers, 5);
  assert.equal(melhor?.extraUserMonthlyPrice, 24.90);
  assert.equal(melhor?.requiresAssistedSetup, true);
  assert.equal(melhor?.setupFeeMode, 'negotiated');
  assert.equal(melhor?.requiresCheckout, false);
  assert.equal(melhor?.quotas?.googleSearchesPerDay, 6);
  assert.equal(melhor?.quotas?.cardsPerMonth, 5000);
  assert.equal(melhor?.quotas?.dailyCardSafetyLimit, 250);
});

test('applyCommissionCap limita a comissão por fechamento ao teto do vendedor', () => {
  // Comissão acima do teto cai pro teto (ex. do dono: R$300 com teto R$100 → R$100).
  assert.equal(applyCommissionCap(300, 100), 100);
  // Abaixo do teto não muda.
  assert.equal(applyCommissionCap(60, 100), 60);
  // Teto 0/ausente = sem limite (comportamento atual preservado).
  assert.equal(applyCommissionCap(300, 0), 300);
  assert.equal(applyCommissionCap(300, null), 300);
  assert.equal(applyCommissionCap(300, undefined), 300);
  // Exatamente no teto.
  assert.equal(applyCommissionCap(100, 100), 100);
  // Arredonda pra centavos e nunca negativo.
  assert.equal(applyCommissionCap(49.999, 100), 50);
  assert.equal(applyCommissionCap(-5, 100), 0);
});
