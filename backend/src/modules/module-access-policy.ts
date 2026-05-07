import {
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';

export const PRIMARY_COMMERCIAL_MODULE_KEYS = ['atendimento', 'vendas', 'webscraping'] as const;
export const ROUTE_GUARDED_MODULE_KEYS = ['atendimento', 'vendas', 'webscraping', 'website'] as const;

export type ModuleAccessCompanySnapshot = {
  isActive?: boolean | null;
  onboardingStatus?: string | null;
  paymentStatus?: string | null;
  subscriptionStatus?: string | null;
  premiumAccess?: boolean | null;
  selectedPlanKey?: string | null;
  trialEndsAt?: Date | string | null;
  billingGraceEndsAt?: Date | string | null;
};

export type CompanyModuleAccessPolicy = {
  accessState: 'pending_checkout' | 'trial' | 'paid' | 'manual' | 'grace' | 'open' | 'blocked';
  active: boolean;
  pendingCheckout: boolean;
  planKey: ActiveCommercialPlanKey;
  moduleKeys: Set<string>;
  blockedCode: string | null;
  blockedReason: string | null;
};

function parseDateTime(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasSelectedPlan(value: unknown) {
  return Boolean(String(value || '').trim());
}

export function resolveCompanyModuleAccessPolicy(
  company: ModuleAccessCompanySnapshot | null | undefined,
  nowMs = Date.now(),
): CompanyModuleAccessPolicy {
  const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
  const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
  const onboardingStatus = String(company?.onboardingStatus || '').trim().toLowerCase();
  const trialEndsAt = parseDateTime(company?.trialEndsAt);
  const billingGraceEndsAt = parseDateTime(company?.billingGraceEndsAt);
  const isActive = Boolean(company?.isActive);
  const trialStillValid = !trialEndsAt || trialEndsAt.getTime() >= nowMs;
  const graceActive = Boolean(
    isActive &&
    subscriptionStatus === 'grace' &&
    billingGraceEndsAt &&
    billingGraceEndsAt.getTime() >= nowMs,
  );
  const trialActive = Boolean(
    isActive &&
    trialStillValid &&
    (paymentStatus === 'TRIAL' || subscriptionStatus === 'trialing' || onboardingStatus === 'active_trial'),
  );
  const paidActive = Boolean(
    isActive &&
    (paymentStatus === 'PAID' || subscriptionStatus === 'active' || subscriptionStatus === 'authorized'),
  );
  const manualActive = Boolean(
    isActive &&
    (paymentStatus === 'MANUAL' || subscriptionStatus === 'manual' || Boolean(company?.premiumAccess)),
  );
  const premiumOverride = Boolean(company?.premiumAccess || paymentStatus === 'MANUAL' || subscriptionStatus === 'manual');
  const expiredOrCanceled = Boolean(
    !premiumOverride &&
    (
      paymentStatus === 'EXPIRED' ||
      paymentStatus === 'DISABLED' ||
      subscriptionStatus === 'expired' ||
      subscriptionStatus === 'canceled' ||
      onboardingStatus === 'suspended' ||
      (trialEndsAt && trialEndsAt.getTime() < nowMs && !paidActive && !manualActive)
    ),
  );
  const pendingCheckout = Boolean(
    !trialActive &&
    !paidActive &&
    !manualActive &&
    !graceActive &&
    (paymentStatus === 'PENDING' || subscriptionStatus === 'pending_checkout' || onboardingStatus === 'pending_checkout'),
  );
  const active = Boolean(isActive && !expiredOrCanceled);
  const planKey = trialActive
    ? COMMERCIAL_PLAN_KEYS.PADRAO
    : manualActive && !hasSelectedPlan(company?.selectedPlanKey)
      ? COMMERCIAL_PLAN_KEYS.PADRAO
      : normalizeCommercialPlanKey(company?.selectedPlanKey);
  const moduleKeys = new Set<string>(
    active
      ? [...(COMMERCIAL_PLAN_MODULE_KEYS[planKey] || []), ...ROUTE_GUARDED_MODULE_KEYS]
      : [],
  );

  if (!active) {
    return {
      accessState: 'blocked',
      active: false,
      pendingCheckout: false,
      planKey,
      moduleKeys,
      blockedCode: 'subscription_inactive',
      blockedReason: 'Plano inativo. Regularize o acesso para liberar este modulo.',
    };
  }

  return {
    accessState: pendingCheckout
      ? 'pending_checkout'
      : trialActive
        ? 'trial'
        : manualActive
          ? 'manual'
          : graceActive
            ? 'grace'
            : paidActive
              ? 'paid'
              : 'open',
    active: true,
    pendingCheckout,
    planKey,
    moduleKeys,
    blockedCode: null,
    blockedReason: null,
  };
}
