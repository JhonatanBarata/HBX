import { isPlatformInfraCompany } from '../common/company-kind';

// Fonte unica de verdade para o estado comercial/acesso de uma empresa.
//
// PR10062026002 (arquitetura pura, pos-DROP): o banco persiste UM campo
// (`Company.status`, vocabulario de 6 estados) e as datas decidem os
// vencimentos na leitura. Os campos legados (paymentStatus/
// subscriptionStatus/premiumAccess/onboardingStatus/billingExempt*) foram
// REMOVIDOS do schema. Todos os outros motores PROJETAM este resultado.
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

// Vocabulario PERSISTIDO (Company.status): 6 estados, decididos pelo dono.
// courtesy funde "liberacao manual" + "isenta" (prazo opcional);
// graça nao e estado — e prazo (billingGraceEndsAt) dentro de overdue.
export type StoredCompanyStatus =
  | 'pending_checkout'
  | 'trial'
  | 'active'
  | 'courtesy'
  | 'overdue'
  | 'suspended';

export type CompanyAccessRiskLevel = 'stable' | 'warning' | 'critical';

export type CompanyAccessSnapshot = {
  companyKind?: string | null;
  slug?: string | null;
  status?: string | null;
  isActive?: boolean | null;
  paymentMethod?: string | null;
  selectedPlanKey?: string | null;
  trialEndsAt?: Date | string | null;
  billingGraceEndsAt?: Date | string | null;
  courtesyEndsAt?: Date | string | null;
  courtesyReason?: string | null;
};

export type CompanyAccessState = {
  state: CompanyAccessStateKey;
  canUse: boolean;
  pendingCheckout: boolean;
  statusLabel: string;
  riskLevel: CompanyAccessRiskLevel;
  detailCode:
    | 'platform_infra_company'
    | 'inactive'
    | 'trial_expired'
    | 'courtesy_expired'
    | 'no_payment_method'
    | null;
};

export const TRIAL_ENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const STORED_COMPANY_STATUSES = new Set<StoredCompanyStatus>([
  'pending_checkout',
  'trial',
  'active',
  'courtesy',
  'overdue',
  'suspended',
]);

const STATUS_LABELS: Record<CompanyAccessStateKey, string> = {
  platform_infra: 'Infraestrutura da plataforma',
  exempt: 'Cortesia (sem prazo)',
  manual: 'Cortesia',
  paying: 'Adimplente',
  trial: 'Trial ativo',
  trial_ending: 'Trial vencendo',
  grace: 'Em atraso · em prazo de graça',
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
    // 'unknown' mantem acesso no caminho de leitura (empresa ativa sem nenhum
    // sinal negativo); quem decide suspender e o fluxo de escrita
    // (evaluateCompanyStatus), que usa isCompanyAccessReleased e nao canUse.
    canUse: RELEASED_STATES.has(state) || state === 'unknown',
    pendingCheckout: state === 'pending_checkout',
    statusLabel: STATUS_LABELS[state],
    riskLevel: RISK_LEVELS[state],
    detailCode,
  };
}

export function normalizeStoredCompanyStatus(value: unknown): StoredCompanyStatus | null {
  const normalized = String(value || '').trim().toLowerCase();
  return STORED_COMPANY_STATUSES.has(normalized as StoredCompanyStatus)
    ? (normalized as StoredCompanyStatus)
    : null;
}

// Projecao do estado de leitura (11 visoes) para o vocabulario persistido
// (6 estados). 'unknown' e platform_infra retornam null: nao ha o que gravar.
export function storedCompanyStatusFromAccessState(
  state: CompanyAccessStateKey,
): StoredCompanyStatus | null {
  if (state === 'exempt' || state === 'manual') return 'courtesy';
  if (state === 'paying') return 'active';
  if (state === 'trial' || state === 'trial_ending') return 'trial';
  if (state === 'grace' || state === 'overdue') return 'overdue';
  if (state === 'pending_checkout') return 'pending_checkout';
  if (state === 'suspended') return 'suspended';
  return null;
}

// Leitura a partir do campo unico persistido. As datas continuam decidindo
// vencimentos na leitura (trial vencido, cortesia vencida, graça vencida) —
// o fluxo de escrita (evaluate) materializa essas transicoes depois.
function resolveFromStoredStatus(
  stored: StoredCompanyStatus,
  company: CompanyAccessSnapshot,
  nowMs: number,
): CompanyAccessState {
  const trialEndsAt = parseDateTime(company.trialEndsAt);
  const billingGraceEndsAt = parseDateTime(company.billingGraceEndsAt);
  const courtesyEndsAt = parseDateTime(company.courtesyEndsAt);

  if (stored === 'suspended') return buildResult('suspended');

  if (stored === 'pending_checkout') return buildResult('pending_checkout');

  if (stored === 'trial') {
    if (trialEndsAt && trialEndsAt.getTime() < nowMs) {
      return buildResult('suspended', 'trial_expired');
    }
    const ending = Boolean(trialEndsAt && trialEndsAt.getTime() - nowMs <= TRIAL_ENDING_WINDOW_MS);
    return buildResult(ending ? 'trial_ending' : 'trial');
  }

  if (stored === 'courtesy') {
    if (courtesyEndsAt && courtesyEndsAt.getTime() < nowMs) {
      // Cortesia com prazo vencido: volta a cobrar.
      return buildResult('overdue', 'courtesy_expired');
    }
    // Sem prazo = permanente (visao 'exempt'); com prazo = temporaria ('manual').
    return buildResult(courtesyEndsAt ? 'manual' : 'exempt');
  }

  if (stored === 'overdue') {
    const graceActive = Boolean(billingGraceEndsAt && billingGraceEndsAt.getTime() >= nowMs);
    return buildResult(graceActive ? 'grace' : 'overdue');
  }

  return buildResult('paying');
}

export function resolveCompanyAccessState(
  company: CompanyAccessSnapshot | null | undefined,
  nowMs = Date.now(),
): CompanyAccessState {
  if (isPlatformInfraCompany(company)) {
    return buildResult('platform_infra', 'platform_infra_company');
  }

  if (!company) return buildResult('suspended', 'inactive');

  const stored = normalizeStoredCompanyStatus(company.status);
  if (stored) return resolveFromStoredStatus(stored, company, nowMs);

  // Pos-DROP, status e NOT NULL no banco (default pending_checkout) — este
  // caminho so existe para snapshots em memoria/testes sem o campo.
  // Protecao de paywall: trial vencido nunca libera por omissao.
  const trialEndsAt = parseDateTime(company.trialEndsAt);
  if (trialEndsAt && trialEndsAt.getTime() < nowMs) {
    return buildResult('suspended', 'trial_expired');
  }
  if (company.isActive !== true) return buildResult('suspended', 'inactive');

  const paymentMethod = String(company.paymentMethod || '').trim().toUpperCase();
  return buildResult('unknown', !paymentMethod || paymentMethod === 'NONE' ? 'no_payment_method' : null);
}

export function isCompanyAccessReleased(state: CompanyAccessStateKey) {
  return RELEASED_STATES.has(state);
}
