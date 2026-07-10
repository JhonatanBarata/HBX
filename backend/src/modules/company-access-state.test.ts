import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_KIND_PLATFORM_INFRA } from '../common/company-kind';
import {
  normalizeCompanyAccountType,
  resolveCompanyAccessState,
  storedCompanyStatusFromAccessState,
} from './company-access-state';

// Pos-DROP (PR10062026002): o resolver le APENAS o estado unico persistido
// (Company.status + datas). Os campos legados sairam do schema e do snapshot.
//
// MASTER-REFAB S6 (10/07 noite, ordem literal do dono — "não vai existir mais contas
// cortesias... só vão ter 2 tipos: conta crédito ou conta empresarial"): o resolver agora
// bifurca ANTES da máquina de estados por `accountType`. Conta `credit` (default) é ATIVA por
// default, bloqueio SÓ por suspensão — a máquina legada (courtesy/trial/grace/overdue/
// pending_checkout) só continua viva pra conta `enterprise`.

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

// ---- normalizeCompanyAccountType: 2 tipos, sem meio-termo, default 'credit' ----

test('normalizeCompanyAccountType: reconhece os 2 valores e cai em credit por omissão/lixo', () => {
  assert.equal(normalizeCompanyAccountType('credit'), 'credit');
  assert.equal(normalizeCompanyAccountType('enterprise'), 'enterprise');
  assert.equal(normalizeCompanyAccountType('ENTERPRISE'), 'enterprise');
  assert.equal(normalizeCompanyAccountType(undefined), 'credit');
  assert.equal(normalizeCompanyAccountType(null), 'credit');
  assert.equal(normalizeCompanyAccountType(''), 'credit');
  assert.equal(normalizeCompanyAccountType('courtesy'), 'credit');
});

// ---- Conta CREDIT (default da coluna) — ativa por default, bloqueio SÓ por suspensão ----

test('credit sem status (default de coluna): lê como ativa (exempt)', () => {
  const state = resolveCompanyAccessState({ isActive: true }, NOW);
  assert.equal(state.state, 'exempt');
  assert.equal(state.canUse, true);
  assert.equal(state.riskLevel, 'stable');
});

test('credit com status active: lê como ativa (exempt), não "paying" (isso é vocabulário de enterprise)', () => {
  const state = resolveCompanyAccessState({ accountType: 'credit', status: 'active' }, NOW);
  assert.equal(state.state, 'exempt');
  assert.equal(state.canUse, true);
});

test('credit com status suspended: bloqueia (única forma de bloqueio de conta credit)', () => {
  const state = resolveCompanyAccessState({ accountType: 'credit', status: 'suspended' }, NOW);
  assert.equal(state.state, 'suspended');
  assert.equal(state.canUse, false);
});

test('credit legada em courtesy (com ou sem prazo, mesmo vencido) lê como ativa — dado não some, só para de pesar', () => {
  const semPrazo = resolveCompanyAccessState({ accountType: 'credit', status: 'courtesy', courtesyEndsAt: null }, NOW);
  assert.equal(semPrazo.state, 'exempt');
  assert.equal(semPrazo.canUse, true);

  const prazoVencido = resolveCompanyAccessState(
    { accountType: 'credit', status: 'courtesy', courtesyEndsAt: inDays(-30) },
    NOW,
  );
  assert.equal(prazoVencido.state, 'exempt');
  assert.equal(prazoVencido.canUse, true);
});

test('credit legada em trial (mesmo vencido) lê como ativa — trial morreu como estado de conta credit', () => {
  const state = resolveCompanyAccessState({ accountType: 'credit', status: 'trial', trialEndsAt: inDays(-90) }, NOW);
  assert.equal(state.state, 'exempt');
  assert.equal(state.canUse, true);
});

test('credit legada em pending_checkout lê como ativa — nunca mais é atribuído a conta nova, legado não trava', () => {
  const state = resolveCompanyAccessState({ accountType: 'credit', status: 'pending_checkout' }, NOW);
  assert.equal(state.state, 'exempt');
  assert.equal(state.pendingCheckout, false);
  assert.equal(state.canUse, true);
});

test('credit legada em overdue/grace lê como ativa — cobrança de plano não existe pra conta credit', () => {
  const state = resolveCompanyAccessState({ accountType: 'credit', status: 'overdue', billingGraceEndsAt: inDays(-5) }, NOW);
  assert.equal(state.state, 'exempt');
  assert.equal(state.canUse, true);
});

test('credit com isActive=false mas status != suspended NÃO bloqueia — bloqueio é só pelo status (suspensão/exclusão gravam status=suspended juntas)', () => {
  const state = resolveCompanyAccessState({ accountType: 'credit', status: 'active', isActive: false }, NOW);
  assert.equal(state.state, 'exempt');
  assert.equal(state.canUse, true);
});

// ---- Conta ENTERPRISE — mantém a máquina de estados legada inteira ----

test('enterprise: stored active reads as paying and releases access', () => {
  const state = resolveCompanyAccessState({ accountType: 'enterprise', isActive: true, status: 'active' }, NOW);
  assert.equal(state.state, 'paying');
  assert.equal(state.canUse, true);
  assert.equal(state.riskLevel, 'stable');
});

test('enterprise: stored courtesy without deadline reads as permanent (exempt view)', () => {
  const state = resolveCompanyAccessState(
    { accountType: 'enterprise', isActive: true, status: 'courtesy', courtesyReason: 'Empresa interna HBX' },
    NOW,
  );
  assert.equal(state.state, 'exempt');
  assert.equal(state.canUse, true);
  assert.equal(state.riskLevel, 'stable');
});

test('enterprise: stored courtesy with future deadline is temporary; expired deadline goes back to charging', () => {
  const temporary = resolveCompanyAccessState(
    { accountType: 'enterprise', isActive: true, status: 'courtesy', courtesyEndsAt: inDays(10) },
    NOW,
  );
  assert.equal(temporary.state, 'manual');
  assert.equal(temporary.canUse, true);

  const expired = resolveCompanyAccessState(
    { accountType: 'enterprise', isActive: true, status: 'courtesy', courtesyEndsAt: inDays(-1) },
    NOW,
  );
  assert.equal(expired.state, 'overdue');
  assert.equal(expired.detailCode, 'courtesy_expired');
  assert.equal(expired.canUse, false);
});

test('enterprise: stored trial honours dates: far is stable, within 7 days warns, expired suspends', () => {
  const far = resolveCompanyAccessState({ accountType: 'enterprise', status: 'trial', trialEndsAt: inDays(20) }, NOW);
  assert.equal(far.state, 'trial');
  assert.equal(far.riskLevel, 'stable');
  assert.equal(far.canUse, true);

  const ending = resolveCompanyAccessState({ accountType: 'enterprise', status: 'trial', trialEndsAt: inDays(2) }, NOW);
  assert.equal(ending.state, 'trial_ending');
  assert.equal(ending.riskLevel, 'warning');
  assert.equal(ending.canUse, true);

  const expired = resolveCompanyAccessState({ accountType: 'enterprise', status: 'trial', trialEndsAt: inDays(-2) }, NOW);
  assert.equal(expired.state, 'suspended');
  assert.equal(expired.detailCode, 'trial_expired');
  assert.equal(expired.canUse, false);
});

test('enterprise: stored overdue keeps access during grace window and blocks after it', () => {
  const inGrace = resolveCompanyAccessState(
    { accountType: 'enterprise', status: 'overdue', billingGraceEndsAt: inDays(3) },
    NOW,
  );
  assert.equal(inGrace.state, 'grace');
  assert.equal(inGrace.canUse, true);
  assert.equal(inGrace.riskLevel, 'warning');

  const blocked = resolveCompanyAccessState({ accountType: 'enterprise', status: 'overdue' }, NOW);
  assert.equal(blocked.state, 'overdue');
  assert.equal(blocked.canUse, false);
  assert.equal(blocked.riskLevel, 'critical');
});

test('enterprise: stored pending_checkout and suspended map directly and block use', () => {
  const pending = resolveCompanyAccessState({ accountType: 'enterprise', status: 'pending_checkout' }, NOW);
  assert.equal(pending.state, 'pending_checkout');
  assert.equal(pending.pendingCheckout, true);
  assert.equal(pending.canUse, false);
  assert.notEqual(pending.state, 'overdue');

  const suspended = resolveCompanyAccessState({ accountType: 'enterprise', status: 'suspended' }, NOW);
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

// ---- Caminho sem stored status (snapshots em memoria/testes) — só alcançável por enterprise:
// conta credit NUNCA cai aqui (intercepta antes, ver bloco acima) ----

test('enterprise snapshot without status: expired trial date still suspends (paywall protection)', () => {
  const state = resolveCompanyAccessState({ accountType: 'enterprise', isActive: true, trialEndsAt: inDays(-30) }, NOW);
  assert.equal(state.state, 'suspended');
  assert.equal(state.detailCode, 'trial_expired');
  assert.equal(state.canUse, false);
});

test('enterprise snapshot without status: inactive company reads as suspended', () => {
  const state = resolveCompanyAccessState({ accountType: 'enterprise', isActive: false }, NOW);
  assert.equal(state.state, 'suspended');
  assert.equal(state.detailCode, 'inactive');
  assert.equal(state.canUse, false);
});

test('enterprise snapshot without status: active company with no signals reads as unknown', () => {
  const state = resolveCompanyAccessState({ accountType: 'enterprise', isActive: true }, NOW);
  assert.equal(state.state, 'unknown');
  assert.equal(state.detailCode, 'no_payment_method');
  assert.equal(state.riskLevel, 'warning');
  assert.equal(state.canUse, true);
});
