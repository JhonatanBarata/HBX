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

// R2 (CREDITOS — kill-switch puro do master, atras de HBX_MODULES_KILLSWITCH_ONLY,
// default OFF): 1 entrada por SystemModule assignable a empresa. `enabled=null`
// = sem post-it da empresa (CompanyModule) -> segue `defaultEnabled` do master;
// `enabled=true/false` = override explicito da empresa (post-it), sempre manda.
export type KillSwitchModuleEntry = {
  key: string;
  companyAssignable: boolean;
  defaultEnabled: boolean;
  enabled: boolean | null;
};

export type KillSwitchModuleSnapshot = {
  modules: KillSwitchModuleEntry[];
};

// R2: helper PURO (sem banco) que aplica o kill-switch do master sobre um
// snapshot ja carregado pelo chamador (modules.service.ts monta o snapshot
// lendo SystemModule/CompanyModule e injeta aqui). Regra: modulo comercial
// disponivel = companyAssignable && (override===true || (override===null &&
// defaultEnabled)). Nao deriva mais de COMMERCIAL_PLAN_MODULE_KEYS.
export function resolveKillSwitchModuleKeys(snapshot: KillSwitchModuleSnapshot | null | undefined): Set<string> {
  const result = new Set<string>();
  for (const moduleItem of snapshot?.modules || []) {
    if (!moduleItem?.companyAssignable) continue;
    const key = String(moduleItem.key || '').trim().toLowerCase();
    if (!key) continue;
    const enabled = moduleItem.enabled === null || moduleItem.enabled === undefined
      ? Boolean(moduleItem.defaultEnabled)
      : Boolean(moduleItem.enabled);
    if (enabled) result.add(key);
  }
  return result;
}

// FASE 2 (REMOÇÃO) — kill-switch deixou de ser opt-in: é o único comportamento.
// Função mantida só por compatibilidade de import (não gateia mais nada em
// resolveCompanyModuleAccessPolicy); a env HBX_MODULES_KILLSWITCH_ONLY não é
// mais lida em nenhum ponto de decisão. Não usar em código novo.
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
//
// R2 (kill-switch, atras de HBX_MODULES_KILLSWITCH_ONLY default OFF):
// `moduleSnapshot` e OPCIONAL e so tem efeito quando a flag esta ON — quem
// chama (modules.service.ts) ja resolveu SystemModule/CompanyModule e injeta
// aqui. Com a flag OFF (ou sem snapshot), o calculo e IDENTICO ao anterior
// (moduleKeys deriva so de COMMERCIAL_PLAN_MODULE_KEYS[planKey]) — a funcao
// permanece PURA (nenhum acesso a banco daqui).
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

  // R2 (FASE 2 — REMOÇÃO, definitivo): módulo é kill-switch PURO do master.
  // Não deriva mais de plano/tier (COMMERCIAL_PLAN_MODULE_KEYS morreu como
  // driver de acesso). `HBX_MODULES_KILLSWITCH_ONLY` deixou de gatear — o
  // caminho por snapshot é o ÚNICO agora; a env fica só como interruptor de
  // emergência caso o chamador ainda não tenha migrado para passar o
  // snapshot (fallback abaixo cobre esse caso defensivamente, não por flag).
  const moduleKeys = moduleSnapshot
    ? resolveKillSwitchModuleKeys(moduleSnapshot)
    : new Set<string>(COMMERCIAL_PLAN_MODULE_KEYS[planKey] || []);

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
