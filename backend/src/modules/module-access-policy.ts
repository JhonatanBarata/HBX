import {
  COMMERCIAL_PLAN_KEYS,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';
import { resolveCompanyAccessState } from './company-access-state';

export const PRIMARY_COMMERCIAL_MODULE_KEYS = ['atendimento', 'vendas', 'webscraping'] as const;
export const ROUTE_GUARDED_MODULE_KEYS = ['atendimento', 'vendas', 'webscraping', 'website'] as const;

// PR10072026 W1 — módulos de decisão POR EMPRESA: para estas chaves o gate
// (canUserAccessModule) checa SÓ a camada empresa (teto do master × enabled da
// empresa) e PULA o molho de cargo/per-usuário — o entregador USER não pode
// quebrar o acesso à logística por não estar no molho de vendedor.
export const COMPANY_LEVEL_MODULE_KEYS = ['logistica'] as const;

export function isCompanyLevelModuleKey(moduleKey: string): boolean {
  const key = String(moduleKey || '').trim().toLowerCase();
  return (COMPANY_LEVEL_MODULE_KEYS as readonly string[]).includes(key);
}

// PR10072026 W1 — HELPER ÚNICO do efetivo de um post-it (linha de CompanyModule):
// `masterEnabled` = TETO (só o /master escreve) && `enabled` = camada da EMPRESA
// (OOBE/admin). Linha ausente NÃO passa por aqui (segue SystemModule.defaultEnabled
// no chamador). masterEnabled null/undefined (linha pré-migração em memória) conta
// como true — mesmo backfill da migration.
export type CompanyModuleEffectiveRow = {
  enabled?: boolean | null;
  masterEnabled?: boolean | null;
};

export function effectiveCompanyModuleEnabled(row: CompanyModuleEffectiveRow | null | undefined): boolean {
  if (!row) return false;
  const masterEnabled = row.masterEnabled === null || row.masterEnabled === undefined
    ? true
    : Boolean(row.masterEnabled);
  return masterEnabled && Boolean(row.enabled);
}

export type ModuleAccessCompanySnapshot = {
  companyKind?: string | null;
  slug?: string | null;
  status?: string | null;
  // MASTER-REFAB S6 (10/07 noite): tipo explícito de conta — repassado pro
  // resolveCompanyAccessState (company-access-state.ts), fonte única do bloqueio.
  accountType?: string | null;
  selectedPlanKey?: string | null;
  trialEndsAt?: Date | string | null;
  billingGraceEndsAt?: Date | string | null;
  courtesyEndsAt?: Date | string | null;
  courtesyReason?: string | null;
};

// Uma entrada por SystemModule atribuível à empresa. `enabled=null`
// = sem post-it da empresa (CompanyModule) -> segue `defaultEnabled` do master;
// `enabled=true/false` = override explicito da empresa (post-it), sempre manda.
// PR10072026 W1: `masterEnabled` = TETO do master na linha (false mata o módulo
// independente do override da empresa/default); null/undefined = sem linha ou
// pré-migração → conta como true.
export type KillSwitchModuleEntry = {
  key: string;
  companyAssignable: boolean;
  defaultEnabled: boolean;
  enabled: boolean | null;
  masterEnabled?: boolean | null;
};

export type KillSwitchModuleSnapshot = {
  modules: KillSwitchModuleEntry[];
};

// Helper PURO (sem banco) que aplica o kill-switch do master sobre um
// snapshot ja carregado pelo chamador (modules.service.ts monta o snapshot
// lendo SystemModule/CompanyModule e injeta aqui). Regra: modulo comercial
// disponivel = companyAssignable && masterEnabled!==false && (override===true
// || (override===null && defaultEnabled)). Não deriva de plano/tier.
export function resolveKillSwitchModuleKeys(snapshot: KillSwitchModuleSnapshot | null | undefined): Set<string> {
  const result = new Set<string>();
  for (const moduleItem of snapshot?.modules || []) {
    if (!moduleItem?.companyAssignable) continue;
    // PR10072026 W1: teto do master OFF → módulo indisponível, ponto final.
    if (moduleItem.masterEnabled === false) continue;
    const key = String(moduleItem.key || '').trim().toLowerCase();
    if (!key) continue;
    const enabled = moduleItem.enabled === null || moduleItem.enabled === undefined
      ? Boolean(moduleItem.defaultEnabled)
      : Boolean(moduleItem.enabled);
    if (enabled) result.add(key);
  }
  return result;
}

// Kill-switch deixou de ser opt-in: é o único comportamento.
// Esta função existe para diagnóstico de configuração, não para selecionar
// uma política alternativa.
export function isModulesKillSwitchOnlyEnabled(): boolean {
  return true;
}

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
  // USERMASTER (dono do tenant) = contratante: ve o motivo real de bloqueio, igual a ADMIN.
  if (normalizedRole === 'ADMIN' || normalizedRole === 'USERMASTER' || !block.blockedCode) return block;

  if (BILLING_BLOCKED_CODES.has(block.blockedCode)) {
    return {
      blockedReason: 'Acesso pausado pela administracao da conta.',
      blockedCode: 'company_access_paused',
      criticalEngine: null,
    };
  }

  return block;
}

function hasSelectedPlan(value: unknown) {
  return Boolean(String(value || '').trim());
}

// Projeção do estado canônico (company-access-state.ts) para o contrato de
// módulos. `selectedPlanKey` permanece apenas como metadado histórico de
// cobrança no payload; ele nunca decide capacidade. Sem snapshot do
// kill-switch a decisão é fail-closed, sem fallback para plano/tier.
export function resolveCompanyModuleAccessPolicy(
  company: ModuleAccessCompanySnapshot | null | undefined,
  nowMs = Date.now(),
  moduleSnapshot?: KillSwitchModuleSnapshot | null,
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
      blockedReason: 'Acesso da empresa inativo. Regularize a conta para liberar este modulo.',
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

  // Módulo é kill-switch PURO do master. Ausência de snapshot nunca ressuscita
  // a antiga caixa de plano: falha fechada até o chamador fornecer a fonte
  // canônica SystemModule + CompanyModule.
  const moduleKeys = moduleSnapshot
    ? resolveKillSwitchModuleKeys(moduleSnapshot)
    : new Set<string>();

  return {
    accessState,
    active: true,
    pendingCheckout: false,
    planKey,
    moduleKeys,
    blockedCode: null,
    blockedReason: null,
  };
}
