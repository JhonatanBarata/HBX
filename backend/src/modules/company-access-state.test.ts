import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_KIND_PLATFORM_INFRA, COMPANY_KIND_TENANT } from '../common/company-kind';
import { resolveCompanyAccessState } from './company-access-state';

const NOW = Date.now();
const inDays = (days: number) => new Date(NOW + days * 24 * 60 * 60 * 1000);

test('platform_infra company never has commercial state', () => {
  const state = resolveCompanyAccessState({ companyKind: COMPANY_KIND_PLATFORM_INFRA, isActive: true }, NOW);
  assert.equal(state.state, 'platform_infra');
  assert.equal(state.canUse, false);
  assert.equal(state.detailCode, 'platform_infra_company');
});

test('inactive company reads as suspended regardless of statuses', () => {
  const state = resolveCompanyAccessState(
    { isActive: false, paymentStatus: 'PAID', subscriptionStatus: 'active' },
    NOW,
  );
  assert.equal(state.state, 'suspended');
  assert.equal(state.canUse, false);
  assert.equal(state.detailCode, 'inactive');
});

test('billingExempt wins over everything and carries no risk', () => {
  const state = resolveCompanyAccessState(
    { isActive: true, billingExempt: true, paymentStatus: 'PENDING', subscriptionStatus: 'past_due' },
    NOW,
  );
  assert.equal(state.state, 'exempt');
  assert.equal(state.canUse, true);
  assert.equal(state.riskLevel, 'stable');
});

test('manual release is stable, not a warning, including premiumAccess-only', () => {
  const viaStatus = resolveCompanyAccessState(
    { isActive: true, paymentStatus: 'MANUAL', subscriptionStatus: 'manual' },
    NOW,
  );
  assert.equal(viaStatus.state, 'manual');
  assert.equal(viaStatus.riskLevel, 'stable');
  assert.equal(viaStatus.canUse, true);

  const viaPremiumFlag = resolveCompanyAccessState(
    { isActive: true, premiumAccess: true, paymentStatus: 'PENDING' },
    NOW,
  );
  assert.equal(viaPremiumFlag.state, 'manual');
  assert.equal(viaPremiumFlag.canUse, true);
});

test('paid subscription reads as paying', () => {
  for (const snapshot of [
    { isActive: true, paymentStatus: 'PAID' },
    { isActive: true, subscriptionStatus: 'active' },
    { isActive: true, subscriptionStatus: 'authorized' },
  ]) {
    const state = resolveCompanyAccessState(snapshot, NOW);
    assert.equal(state.state, 'paying');
    assert.equal(state.canUse, true);
    assert.equal(state.riskLevel, 'stable');
  }
});

test('valid trial is stable; trial within 7 days is trial_ending warning', () => {
  const farTrial = resolveCompanyAccessState(
    { isActive: true, paymentStatus: 'TRIAL', trialEndsAt: inDays(14) },
    NOW,
  );
  assert.equal(farTrial.state, 'trial');
  assert.equal(farTrial.riskLevel, 'stable');

  const endingTrial = resolveCompanyAccessState(
    { isActive: true, subscriptionStatus: 'trialing', trialEndsAt: inDays(3) },
    NOW,
  );
  assert.equal(endingTrial.state, 'trial_ending');
  assert.equal(endingTrial.riskLevel, 'warning');
  assert.equal(endingTrial.canUse, true);
});

test('hard suspension wins over a future grace window (master decision is final)', () => {
  const state = resolveCompanyAccessState(
    { isActive: true, paymentStatus: 'DISABLED', billingGraceEndsAt: inDays(5) },
    NOW,
  );
  assert.equal(state.state, 'suspended');
  assert.equal(state.canUse, false);
});

test('grace window keeps access for past_due company (grace is not overdue)', () => {
  const state = resolveCompanyAccessState(
    { isActive: true, subscriptionStatus: 'past_due', billingGraceEndsAt: inDays(5) },
    NOW,
  );
  assert.equal(state.state, 'grace');
  assert.equal(state.canUse, true);
  assert.equal(state.riskLevel, 'warning');
});

test('overdue without grace is critical and blocks use', () => {
  for (const snapshot of [
    { isActive: true, paymentStatus: 'OVERDUE', paymentMethod: 'CARD' },
    { isActive: true, subscriptionStatus: 'past_due', paymentMethod: 'PIX' },
  ]) {
    const state = resolveCompanyAccessState(snapshot, NOW);
    assert.equal(state.state, 'overdue');
    assert.equal(state.canUse, false);
    assert.equal(state.riskLevel, 'critical');
  }
});

test('new PENDING client is pending_checkout, never overdue', () => {
  const state = resolveCompanyAccessState(
    {
      companyKind: COMPANY_KIND_TENANT,
      isActive: true,
      paymentStatus: 'PENDING',
      subscriptionStatus: 'pending_checkout',
      onboardingStatus: 'pending_checkout',
    },
    NOW,
  );
  assert.equal(state.state, 'pending_checkout');
  assert.equal(state.pendingCheckout, true);
  assert.equal(state.canUse, false);
  assert.notEqual(state.state, 'overdue');
  assert.equal(state.riskLevel, 'warning');
});

test('expired trial without conversion is suspended with trial_expired detail', () => {
  const state = resolveCompanyAccessState(
    { isActive: true, paymentStatus: 'TRIAL', trialEndsAt: inDays(-2) },
    NOW,
  );
  assert.equal(state.state, 'suspended');
  assert.equal(state.detailCode, 'trial_expired');
  assert.equal(state.canUse, false);
});

test('no signals and no payment method reads as unknown/no_payment_method', () => {
  const state = resolveCompanyAccessState({ isActive: true }, NOW);
  assert.equal(state.state, 'unknown');
  assert.equal(state.detailCode, 'no_payment_method');
  assert.equal(state.riskLevel, 'warning');
});
