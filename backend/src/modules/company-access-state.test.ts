import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_KIND_PLATFORM_INFRA } from '../common/company-kind';
import {
  resolveCompanyAccessState,
  storedCompanyStatusFromAccessState,
} from './company-access-state';

// Pos-DROP (PR10062026002): o resolver le APENAS o estado unico persistido
// (Company.status + datas). Os campos legados sairam do schema e do snapshot.

const NOW = Date.now();
const inDays = (days: number) => new Date(NOW + days * 24 * 60 * 60 * 1000);

test('platform_infra company never has commercial state', () => {
  const state = resolveCompanyAccessState({ companyKind: COMPANY_KIND_PLATFORM_INFRA, isActive: true }, NOW);
  assert.equal(state.state, 'platform_infra');
  assert.equal(state.canUse, false);
  assert.equal(state.detailCode, 'platform_infra_company');
});

test('missing snapshot reads as suspended', () => {
  const state = resolveCompanyAccessState(null, NOW);
  assert.equal(state.state, 'suspended');
  assert.equal(state.canUse, false);
  assert.equal(state.detailCode, 'inactive');
});

// ---- Estado unico persistido (Company.status) decide a leitura ----

test('stored active reads as paying and releases access', () => {
  const state = resolveCompanyAccessState({ isActive: true, status: 'active' }, NOW);
  assert.equal(state.state, 'paying');
  assert.equal(state.canUse, true);
  assert.equal(state.riskLevel, 'stable');
});

test('stored courtesy without deadline reads as permanent (exempt view)', () => {
  const state = resolveCompanyAccessState(
    { isActive: true, status: 'courtesy', courtesyReason: 'Empresa interna HBX' },
    NOW,
  );
  assert.equal(state.state, 'exempt');
  assert.equal(state.canUse, true);
  assert.equal(state.riskLevel, 'stable');
});

test('stored courtesy with future deadline is temporary; expired deadline goes back to charging', () => {
  const temporary = resolveCompanyAccessState(
    { isActive: true, status: 'courtesy', courtesyEndsAt: inDays(10) },
    NOW,
  );
  assert.equal(temporary.state, 'manual');
  assert.equal(temporary.canUse, true);

  const expired = resolveCompanyAccessState(
    { isActive: true, status: 'courtesy', courtesyEndsAt: inDays(-1) },
    NOW,
  );
  assert.equal(expired.state, 'overdue');
  assert.equal(expired.detailCode, 'courtesy_expired');
  assert.equal(expired.canUse, false);
});

test('stored trial honours dates: far is stable, within 7 days warns, expired suspends', () => {
  const far = resolveCompanyAccessState({ status: 'trial', trialEndsAt: inDays(20) }, NOW);
  assert.equal(far.state, 'trial');
  assert.equal(far.riskLevel, 'stable');
  assert.equal(far.canUse, true);

  const ending = resolveCompanyAccessState({ status: 'trial', trialEndsAt: inDays(2) }, NOW);
  assert.equal(ending.state, 'trial_ending');
  assert.equal(ending.riskLevel, 'warning');
  assert.equal(ending.canUse, true);

  const expired = resolveCompanyAccessState({ status: 'trial', trialEndsAt: inDays(-2) }, NOW);
  assert.equal(expired.state, 'suspended');
  assert.equal(expired.detailCode, 'trial_expired');
  assert.equal(expired.canUse, false);
});

test('stored overdue keeps access during grace window and blocks after it', () => {
  const inGrace = resolveCompanyAccessState(
    { status: 'overdue', billingGraceEndsAt: inDays(3) },
    NOW,
  );
  assert.equal(inGrace.state, 'grace');
  assert.equal(inGrace.canUse, true);
  assert.equal(inGrace.riskLevel, 'warning');

  const blocked = resolveCompanyAccessState({ status: 'overdue' }, NOW);
  assert.equal(blocked.state, 'overdue');
  assert.equal(blocked.canUse, false);
  assert.equal(blocked.riskLevel, 'critical');
});

test('stored pending_checkout and suspended map directly and block use', () => {
  const pending = resolveCompanyAccessState({ status: 'pending_checkout' }, NOW);
  assert.equal(pending.state, 'pending_checkout');
  assert.equal(pending.pendingCheckout, true);
  assert.equal(pending.canUse, false);
  assert.notEqual(pending.state, 'overdue');

  const suspended = resolveCompanyAccessState({ status: 'suspended' }, NOW);
  assert.equal(suspended.state, 'suspended');
  assert.equal(suspended.canUse, false);
});

test('view state projects back to the 6-state stored vocabulary', () => {
  assert.equal(storedCompanyStatusFromAccessState('exempt'), 'courtesy');
  assert.equal(storedCompanyStatusFromAccessState('manual'), 'courtesy');
  assert.equal(storedCompanyStatusFromAccessState('paying'), 'active');
  assert.equal(storedCompanyStatusFromAccessState('trial_ending'), 'trial');
  assert.equal(storedCompanyStatusFromAccessState('grace'), 'overdue');
  assert.equal(storedCompanyStatusFromAccessState('overdue'), 'overdue');
  assert.equal(storedCompanyStatusFromAccessState('pending_checkout'), 'pending_checkout');
  assert.equal(storedCompanyStatusFromAccessState('suspended'), 'suspended');
  assert.equal(storedCompanyStatusFromAccessState('unknown'), null);
  assert.equal(storedCompanyStatusFromAccessState('platform_infra'), null);
});

// ---- Caminho sem stored status (snapshots em memoria/testes) ----

test('snapshot without status: expired trial date still suspends (paywall protection)', () => {
  const state = resolveCompanyAccessState({ isActive: true, trialEndsAt: inDays(-30) }, NOW);
  assert.equal(state.state, 'suspended');
  assert.equal(state.detailCode, 'trial_expired');
  assert.equal(state.canUse, false);
});

test('snapshot without status: inactive company reads as suspended', () => {
  const state = resolveCompanyAccessState({ isActive: false }, NOW);
  assert.equal(state.state, 'suspended');
  assert.equal(state.detailCode, 'inactive');
  assert.equal(state.canUse, false);
});

test('snapshot without status: active company with no signals reads as unknown', () => {
  const state = resolveCompanyAccessState({ isActive: true }, NOW);
  assert.equal(state.state, 'unknown');
  assert.equal(state.detailCode, 'no_payment_method');
  assert.equal(state.riskLevel, 'warning');
  assert.equal(state.canUse, true);
});
