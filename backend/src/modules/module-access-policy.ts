import {
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';
import { resolveCompanyAccessState } from './company-access-state';

export const PRIMARY_COMMERCIAL_MODULE_KEYS = ['atendimento', 'vendas', 'webscraping'] as const;
export const ROUTE_GUARDED_MODULE_KEYS = ['atendimento', 'vendas', 'webscraping', 'website'] as const;

export type ModuleAccessCompanySnapshot = {
  companyKind?: string | null;
  slug?: string | null;
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
  accessState: 'pending_checkout' | 'trial' | 'paid' | 'manual' | 'exempt' | 'grace' | 'open' | 'blocked';
  active: boolean;
  pendingCheckout: boolean;
  planKey: ActiveCommercialPlanKey;
  moduleKeys: Set<string>;
  blockedCode: string | null;
  blockedReason: string | null;
};

export type ModuleBlockPresentation = {
  blockedReason: string | null;
  blockedCode: string | null;
  criticalEngine: string | null;
};

const BILLING_BLOCKED_CODES = new Set(['pending_checkout', 'subscription_inactive', 'billing_overdue']);

// Cobrança é assunto exclusivo do contratante (ADMIN). Para qualquer outro
// papel, motivo financeiro de bloqueio vira mensagem neutra: funcionário ou
// vendedor não pode saber se o dono pagou ou não. O bloqueio em si permanece.
export function presentModuleBlockForRole(
  role: unknown,
  block: ModuleBlockPresentation,
): ModuleBlockPresentation {
  const normalizedRole = String(role || '').trim().toUpperCase();
  if (normalizedRole === 'ADMIN' || !block.blockedCode) return block;

  if (BILLING_BLOCKED_CODES.has(block.blockedCode)) {
    return {
      blockedReason: 'Acesso pausado pela administracao da conta.',
      blockedCode: 'company_access_paused',
      criticalEngine: null,
    };
  }

  if (block.blockedCode === 'plan_required') {
    return {
      blockedReason: 'Modulo nao habilitado para esta conta.',
      blockedCode: 'module_not_enabled',
      criticalEngine: null,
    };
  }

  return block;
}

function hasSelectedPlan(value: unknown) {
  return Boolean(String(value || '').trim());
}

// Projecao do estado canonico (company-access-state.ts) para o contrato de
// modulos. Nenhuma regra de cobranca e re-derivada aqui: este arquivo so
// decide planKey/moduleKeys e traduz o vocabulario.
export function resolveCompanyModuleAccessPolicy(
  company: ModuleAccessCompanySnapshot | null | undefined,
  nowMs = Date.now(),
): CompanyModuleAccessPolicy {
  const access = resolveCompanyAccessState(company, nowMs);

  if (access.state === 'platform_infra') {
    return {
      accessState: 'blocked',
      active: false,
      pendingCheckout: false,
      planKey: COMMERCIAL_PLAN_KEYS.PADRAO,
      moduleKeys: new Set<string>(),
      blockedCode: 'platform_infra_company',
      blockedReason: 'Empresa de infraestrutura nao recebe modulos comerciais.',
    };
  }

  const trialState = access.state === 'trial' || access.state === 'trial_ending';
  const manualLikeState = access.state === 'manual' || access.state === 'exempt';
  const planKey = trialState
    ? COMMERCIAL_PLAN_KEYS.PADRAO
    : manualLikeState && !hasSelectedPlan(company?.selectedPlanKey)
      ? COMMERCIAL_PLAN_KEYS.PADRAO
      : normalizeCommercialPlanKey(company?.selectedPlanKey);

  if (access.state === 'pending_checkout') {
    return {
      accessState: 'pending_checkout',
      active: false,
      pendingCheckout: true,
      planKey,
      moduleKeys: new Set<string>(),
      blockedCode: 'pending_checkout',
      blockedReason: 'Finalize a contratação para liberar os módulos comerciais.',
    };
  }

  if (access.state === 'overdue') {
    return {
      accessState: 'blocked',
      active: false,
      pendingCheckout: false,
      planKey,
      moduleKeys: new Set<string>(),
      blockedCode: 'billing_overdue',
      blockedReason: 'Pagamento em atraso. Regularize para liberar este modulo.',
    };
  }

  if (!access.canUse) {
    return {
      accessState: 'blocked',
      active: false,
      pendingCheckout: false,
      planKey,
      moduleKeys: new Set<string>(),
      blockedCode: 'subscription_inactive',
      blockedReason: 'Plano inativo. Regularize o acesso para liberar este modulo.',
    };
  }

  const accessState =
    access.state === 'paying'
      ? 'paid'
      : trialState
        ? 'trial'
        : access.state === 'manual'
          ? 'manual'
          : access.state === 'exempt'
            ? 'exempt'
            : access.state === 'grace'
              ? 'grace'
              : 'open';

  return {
    accessState,
    active: true,
    pendingCheckout: false,
    planKey,
    moduleKeys: new Set<string>(COMMERCIAL_PLAN_MODULE_KEYS[planKey] || []),
    blockedCode: null,
    blockedReason: null,
  };
}
