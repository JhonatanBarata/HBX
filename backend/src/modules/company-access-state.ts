import { isPlatformInfraCompany } from '../common/company-kind';

// Fonte unica de verdade para o estado comercial/acesso de uma empresa.
// Todos os outros motores (module-access-policy, statusBucket do master,
// master-billing-situation, evaluateCompanyStatus) devem PROJETAR este
// resultado, nunca re-derivar estado de paymentStatus/subscriptionStatus crus.
export type CompanyAccessStateKey =
  | 'platform_infra'
  | 'exempt'
  | 'manual'
  | 'paying'
  | 'trial'
  | 'trial_ending'
  | 'grace'
  | 'overdue'
  | 'pending_checkout'
  | 'suspended'
  | 'unknown';

export type CompanyAccessRiskLevel = 'stable' | 'warning' | 'critical';

export type CompanyAccessSnapshot = {
  companyKind?: string | null;
  slug?: string | null;
  isActive?: boolean | null;
  onboardingStatus?: string | null;
  paymentStatus?: string | null;
  subscriptionStatus?: string | null;
  paymentMethod?: string | null;
  premiumAccess?: boolean | null;
  billingExempt?: boolean | null;
  selectedPlanKey?: string | null;
  trialEndsAt?: Date | string | null;
  billingGraceEndsAt?: Date | string | null;
};

export type CompanyAccessState = {
  state: CompanyAccessStateKey;
  canUse: boolean;
  pendingCheckout: boolean;
  statusLabel: string;
  riskLevel: CompanyAccessRiskLevel;
  detailCode: 'platform_infra_company' | 'inactive' | 'trial_expired' | 'no_payment_method' | null;
};

export const TRIAL_ENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<CompanyAccessStateKey, string> = {
  platform_infra: 'Infraestrutura da plataforma',
  exempt: 'Isenta (decisão master)',
  manual: 'Acesso manual liberado',
  paying: 'Adimplente',
  trial: 'Trial ativo',
  trial_ending: 'Trial vencendo',
  grace: 'Período de graça',
  overdue: 'Em atraso',
  pending_checkout: 'Checkout pendente',
  suspended: 'Suspenso',
  unknown: 'Sem leitura financeira',
};

const RISK_LEVELS: Record<CompanyAccessStateKey, CompanyAccessRiskLevel> = {
  platform_infra: 'stable',
  exempt: 'stable',
  manual: 'stable',
  paying: 'stable',
  trial: 'stable',
  trial_ending: 'warning',
  grace: 'warning',
  overdue: 'critical',
  pending_checkout: 'warning',
  suspended: 'critical',
  unknown: 'warning',
};

const RELEASED_STATES = new Set<CompanyAccessStateKey>([
  'exempt',
  'manual',
  'paying',
  'trial',
  'trial_ending',
  'grace',
]);

function parseDateTime(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildResult(
  state: CompanyAccessStateKey,
  detailCode: CompanyAccessState['detailCode'] = null,
): CompanyAccessState {
  return {
    state,
    canUse: RELEASED_STATES.has(state),
    pendingCheckout: state === 'pending_checkout',
    statusLabel: STATUS_LABELS[state],
    riskLevel: RISK_LEVELS[state],
    detailCode,
  };
}

// Precedencia (decisoes de unificacao, ver PR10062026001):
//  1. platform_infra nunca tem estado comercial;
//  2. empresa inativa esta suspensa, ponto — quem reativa e o fluxo de
//     escrita (evaluateCompanyStatus), nunca a leitura;
//  3. isencao (decisao master) > manual > pago > trial: a decisao mais
//     explicita do master vence o sinal mais automatico;
//  4. suspensao dura (EXPIRED/DISABLED/canceled) vence janela de graça:
//     graça nao ressuscita empresa desligada pelo master;
//  5. PENDING e cliente que nunca concluiu checkout — nunca "Em atraso";
//  6. trial vencido sem conversao e suspensao com detalhe trial_expired.
export function resolveCompanyAccessState(
  company: CompanyAccessSnapshot | null | undefined,
  nowMs = Date.now(),
): CompanyAccessState {
  if (isPlatformInfraCompany(company)) {
    return buildResult('platform_infra', 'platform_infra_company');
  }

  if (!company || company.isActive === false) {
    return buildResult('suspended', 'inactive');
  }

  const paymentStatus = String(company.paymentStatus || '').trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || '').trim().toLowerCase();
  const onboardingStatus = String(company.onboardingStatus || '').trim().toLowerCase();
  const paymentMethod = String(company.paymentMethod || '').trim().toUpperCase();
  const trialEndsAt = parseDateTime(company.trialEndsAt);
  const billingGraceEndsAt = parseDateTime(company.billingGraceEndsAt);

  if (company.billingExempt === true) return buildResult('exempt');

  const manualReleased =
    paymentStatus === 'MANUAL' || subscriptionStatus === 'manual' || Boolean(company.premiumAccess);
  if (manualReleased) return buildResult('manual');

  const paidReleased =
    paymentStatus === 'PAID' || subscriptionStatus === 'active' || subscriptionStatus === 'authorized';
  if (paidReleased) return buildResult('paying');

  const trialSignal =
    paymentStatus === 'TRIAL' || subscriptionStatus === 'trialing' || onboardingStatus === 'active_trial';
  const trialStillValid = !trialEndsAt || trialEndsAt.getTime() >= nowMs;
  if (trialSignal && trialStillValid) {
    const ending = Boolean(trialEndsAt && trialEndsAt.getTime() - nowMs <= TRIAL_ENDING_WINDOW_MS);
    return buildResult(ending ? 'trial_ending' : 'trial');
  }

  const hardSuspended =
    paymentStatus === 'DISABLED' ||
    paymentStatus === 'EXPIRED' ||
    subscriptionStatus === 'canceled' ||
    subscriptionStatus === 'expired' ||
    onboardingStatus === 'suspended';
  if (hardSuspended) return buildResult('suspended');

  const graceActive = Boolean(billingGraceEndsAt && billingGraceEndsAt.getTime() >= nowMs);
  if (graceActive) return buildResult('grace');

  const overdue = paymentStatus === 'OVERDUE' || subscriptionStatus === 'past_due';
  if (overdue) return buildResult('overdue');

  const pendingCheckout =
    paymentStatus === 'PENDING' ||
    subscriptionStatus === 'pending_checkout' ||
    onboardingStatus === 'pending_checkout';
  if (pendingCheckout) return buildResult('pending_checkout');

  if (trialSignal && !trialStillValid) return buildResult('suspended', 'trial_expired');

  return buildResult('unknown', !paymentMethod || paymentMethod === 'NONE' ? 'no_payment_method' : null);
}

export function isCompanyAccessReleased(state: CompanyAccessStateKey) {
  return RELEASED_STATES.has(state);
}
