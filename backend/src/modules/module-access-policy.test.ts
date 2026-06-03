import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  getCommercialPlanTitle,
} from '../commercial-plans/commercial-plan-catalog';
import { resolveCompanyModuleAccessPolicy } from './module-access-policy';

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

test('pending_checkout/PENDING blocks operational modules', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    isActive: false,
    onboardingStatus: 'pending_checkout',
    paymentStatus: 'PENDING',
    subscriptionStatus: 'pending_checkout',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });

  assert.equal(policy.active, false);
  assert.equal(policy.pendingCheckout, true);
  assert.equal(policy.blockedCode, 'pending_checkout');
  assert.deepEqual([...policy.moduleKeys], []);
});

test('active_trial/TRIAL/trialing releases padrao commercial modules', () => {
  const policy = resolveCompanyModuleAccessPolicy({
    isActive: true,
    onboardingStatus: 'active_trial',
    paymentStatus: 'TRIAL',
    subscriptionStatus: 'trialing',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
    trialEndsAt: future,
  });

  assert.equal(policy.accessState, 'trial');
  assert.equal(policy.planKey, COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(policy.moduleKeys.has('vendas'), true);
  assert.equal(policy.moduleKeys.has('atendimento'), true);
  assert.equal(policy.moduleKeys.has('webscraping'), true);
  assert.equal(policy.moduleKeys.has('gerencial'), true);
});

test('active/PAID releases modules by selected plan', () => {
  const lite = resolveCompanyModuleAccessPolicy({
    isActive: true,
    paymentStatus: 'PAID',
    subscriptionStatus: 'active',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  });
  assert.equal(lite.moduleKeys.has('vendas'), true);
  assert.equal(lite.moduleKeys.has('webscraping'), true);
  assert.equal(lite.moduleKeys.has('atendimento'), false);
  assert.equal(lite.moduleKeys.has('gerencial'), false);
  assert.equal(lite.moduleKeys.has('cadastro'), false);

  const melhor = resolveCompanyModuleAccessPolicy({
    isActive: true,
    paymentStatus: 'PAID',
    subscriptionStatus: 'active',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.MELHOR,
  });
  assert.equal(melhor.moduleKeys.has('atendimento'), true);
  assert.equal(melhor.moduleKeys.has('vendas'), true);
  assert.equal(melhor.moduleKeys.has('webscraping'), true);
  assert.equal(melhor.moduleKeys.has('gerencial'), true);
  assert.equal(melhor.moduleKeys.has('cadastro'), true);
  assert.equal(melhor.moduleKeys.has('bot_ia'), true);
});

test('commercial plan catalog keeps new HBX names and premium entitlements', () => {
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.LITE), 'HBX List');
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.PADRAO), 'HBX Lead Plus');
  assert.equal(getCommercialPlanTitle(COMMERCIAL_PLAN_KEYS.MELHOR), 'HBX Full — Bot e IA');

  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.LITE].includes(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY), false);
  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.PADRAO].includes(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY), true);
  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.MELHOR].includes(COMMERCIAL_ENTITLEMENT_KEYS.NIGHT_FACTORY), true);
  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.PADRAO].includes(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA), false);
  assert.equal(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[COMMERCIAL_PLAN_KEYS.MELHOR].includes(COMMERCIAL_ENTITLEMENT_KEYS.BOT_IA), true);
});

test('MANUAL/premiumAccess releases selected plan or padrao fallback', () => {
  const manualLite = resolveCompanyModuleAccessPolicy({
    isActive: true,
    paymentStatus: 'MANUAL',
    subscriptionStatus: 'manual',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.LITE,
  });
  assert.equal(manualLite.accessState, 'manual');
  assert.equal(manualLite.moduleKeys.has('vendas'), true);
  assert.equal(manualLite.moduleKeys.has('webscraping'), true);
  assert.equal(manualLite.moduleKeys.has('atendimento'), false);

  const fallback = resolveCompanyModuleAccessPolicy({
    isActive: true,
    paymentStatus: 'PENDING',
    subscriptionStatus: 'past_due',
    premiumAccess: true,
    selectedPlanKey: null,
  });
  assert.equal(fallback.accessState, 'manual');
  assert.equal(fallback.planKey, COMMERCIAL_PLAN_KEYS.PADRAO);
  assert.equal(fallback.moduleKeys.has('atendimento'), true);
  assert.equal(fallback.moduleKeys.has('vendas'), true);
  assert.equal(fallback.moduleKeys.has('webscraping'), true);
  assert.equal(fallback.moduleKeys.has('gerencial'), true);
});

test('expired/canceled blocks modules', () => {
  const expired = resolveCompanyModuleAccessPolicy({
    isActive: false,
    paymentStatus: 'EXPIRED',
    subscriptionStatus: 'expired',
    selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
  });

  assert.equal(expired.active, false);
  assert.equal(expired.pendingCheckout, false);
  assert.equal(expired.blockedCode, 'subscription_inactive');
  assert.deepEqual([...expired.moduleKeys], []);
});
