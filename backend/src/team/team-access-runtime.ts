import { ForbiddenException } from '@nestjs/common';
import { isPlatformInfraCompany } from '../common/company-kind';
import {
  buildDefaultTeamAccessMapForRole,
  buildTeamAccessMapFromModuleAccess,
  getTeamAccessCatalog,
  hasTeamAccess,
  mergeTeamAccessMaps,
  type TeamAccessMap,
} from './team-access-catalog';
import {
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyAccessAllowed,
  resolveTeamPolicySubjectKind,
  type RuntimeTeamPolicy,
} from './team-policy-persistence';

export type EffectiveTeamAccess = {
  userId: number;
  companyId: number | null;
  role: string;
  subjectKind: string;
  isSystemMaster: boolean;
  isAdmin: boolean;
  isSeller: boolean;
  company: any | null;
  masterContext: any | null;
  accessMap: TeamAccessMap;
  moduleAccessMap: TeamAccessMap;
  explicitAccessMap: TeamAccessMap;
};

export type VendasAccessContext = EffectiveTeamAccess & {
  companyId: number;
  canViewOwnCards: boolean;
  canViewCompanyCards: boolean;
  canCreateManualCards: boolean;
  canEditCards: boolean;
  canTransferCards: boolean;
  canCloseCards: boolean;
  canReopenCards: boolean;
  canDeleteCards: boolean;
  canChangeStatus: boolean;
  canMarkActivationPending: boolean;
  canMarkTrialStarted: boolean;
  canMarkConfirmed: boolean;
  canMarkInactive: boolean;
  canCommentTimeline: boolean;
  canScheduleReturn: boolean;
  canSendRadarCardsToVendas: boolean;
  canManualEnrichRadar: boolean;
  canSendWhatsappManual: boolean;
  canSendEmail: boolean;
  canUseCompanyReplyTo: boolean;
  canUseCompanyWhatsappNumber: boolean;
  canSellProducts: boolean;
  canApplyProductDiscount: boolean;
  canViewProductPrice: boolean;
  canChangeProductPrice: boolean;
  canViewOwnCommission: boolean;
  canViewTeamCommission: boolean;
  canMarkCommissionPaid: boolean;
  canCancelCommission: boolean;
};

export type ProductsAccessContext = EffectiveTeamAccess & {
  companyId: number;
  canViewProducts: boolean;
  canSellProducts: boolean;
  canEditProducts: boolean;
  canApplyProductDiscount: boolean;
  canViewProductPrice: boolean;
  canChangeProductPrice: boolean;
};

function normalizePositiveId(value: unknown) {
  const parsed = Math.trunc(Number(value || 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRole(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function normalizePolicySubjectKind(value: unknown) {
  return String(value || '').trim().toLowerCase() || 'unknown';
}

function resolveRuntimeCompanyId(user: any) {
  const assumedCompanyId = user?.masterContext?.active
    ? normalizePositiveId(user.masterContext.companyId)
    : null;
  if (assumedCompanyId) return assumedCompanyId;
  if (user?.isSystemMaster) return null;
  return normalizePositiveId(user?.companyId ?? user?.company?.id);
}

function normalizeModuleAccessRowsFromUser(user: any) {
  // Tabela legada UserModuleAccess removida (DROP): le so do payload do
  // usuario (modules/moduleAccessMap) usado em memoria/testes.
  const rows: Array<{ key: string; allowed: boolean }> = [];
  if (Array.isArray(user?.modules)) {
    for (const row of user.modules) {
      const key = String(row?.key ?? row?.systemModule?.key ?? row?.module?.key ?? '').trim();
      if (!key) continue;
      rows.push({ key, allowed: Boolean(row?.allowed ?? row?.userAllowed ?? row?.accessible) });
    }
  }

  if (user?.moduleAccessMap && typeof user.moduleAccessMap === 'object') {
    for (const [key, allowed] of Object.entries(user.moduleAccessMap)) {
      rows.push({ key, allowed: Boolean(allowed) });
    }
  }

  return rows;
}

function moduleRowsFromPolicy(policy: RuntimeTeamPolicy | null) {
  return Array.from(policy?.moduleAccessMap?.entries?.() || [])
    .map(([key, allowed]) => ({ key, allowed: Boolean(allowed) }));
}

function explicitAccessMapFromPolicy(policy: RuntimeTeamPolicy | null): TeamAccessMap {
  const accessMap: TeamAccessMap = {};
  if (!policy) return accessMap;
  for (const item of getTeamAccessCatalog()) {
    const allowed = resolveTeamPolicyAccessAllowed(policy, item.key);
    if (allowed !== undefined) accessMap[item.key] = allowed;
  }
  return accessMap;
}

async function hydrateUserForTeamAccess(prisma: any, user: any) {
  const userId = normalizePositiveId(user?.id);
  if (!userId || !prisma?.user?.findUnique) return user || {};

  const loaded = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isSystemMaster: true,
      companyId: true,
      isActive: true,
      deactivatedAt: true,
      company: {
        select: {
          id: true,
          name: true,
          companyKind: true,
        },
      },
    },
  }).catch(() => null);

  if (!loaded) return user || {};
  return {
    ...loaded,
    ...(user || {}),
    company: loaded.company || user?.company
      ? { ...(loaded.company || {}), ...(user?.company || {}) }
      : null,
  };
}

// Team policy e a unica fonte persistida de permissao (PR-002 A.5).
// Linhas de modulo vindas do proprio payload do usuario (ex.: snapshots em
// memoria/testes) ainda sao respeitadas; a tabela legada nao e mais lida.
async function loadCurrentModuleAccessRows(_prisma: any, user: any) {
  return normalizeModuleAccessRowsFromUser(user);
}

async function resolveEffectiveTeamAccessUncached(prisma: any, user: any): Promise<EffectiveTeamAccess> {
  const hydratedUser = await hydrateUserForTeamAccess(prisma, user);
  const userId = normalizePositiveId(hydratedUser?.id);
  if (!userId) throw new ForbiddenException('Usuario nao identificado.');

  const role = normalizeRole(hydratedUser?.role);
  const isSystemMaster = Boolean(hydratedUser?.isSystemMaster);
  const company = hydratedUser?.company || null;
  const companyId = resolveRuntimeCompanyId(hydratedUser);
  const subjectKind = normalizePolicySubjectKind(
    resolveTeamPolicySubjectKind({ ...hydratedUser, role, isSystemMaster }, company),
  );

  // Autorizacao nao degrada erro de leitura da policy para "policy ausente":
  // falha de banco deve bloquear o request, nunca restaurar defaults de papel.
  const policy = await loadUserTeamPolicyRuntime(prisma, userId, { failOnReadError: true });
  const currentModuleRows = await loadCurrentModuleAccessRows(prisma, hydratedUser);
  const currentModuleAccessMap = buildTeamAccessMapFromModuleAccess(currentModuleRows);
  const policyModuleAccessMap = buildTeamAccessMapFromModuleAccess(moduleRowsFromPolicy(policy));
  const moduleAccessMap = mergeTeamAccessMaps(currentModuleAccessMap, policyModuleAccessMap);
  const explicitAccessMap = explicitAccessMapFromPolicy(policy);
  const accessMap = mergeTeamAccessMaps(
    buildDefaultTeamAccessMapForRole(subjectKind),
    currentModuleAccessMap,
    policyModuleAccessMap,
    explicitAccessMap,
  );

  return {
    userId,
    companyId,
    role,
    subjectKind,
    isSystemMaster,
    isAdmin: isSystemMaster || role === 'ADMIN' || role === 'USERMASTER',
    isSeller: !isSystemMaster && role === 'USER',
    company,
    masterContext: hydratedUser?.masterContext || null,
    accessMap,
    moduleAccessMap,
    explicitAccessMap,
  };
}

// ---------------------------------------------------------------------------
// RBAC Sprint 3 — AccessContext 1× por request.
//
// resolveEffectiveTeamAccess faz 2+ queries (hydrateUser + loadUserTeamPolicy)
// e um request de Vendas o chamava mais de uma vez (resolveVendasAccessContext,
// depois asserts/has espalhados) → N× as mesmas queries no caminho quente.
//
// Cache: WeakMap<user, { prisma, promise }>. A chave é o PRÓPRIO objeto `user`
// do request (req.user, hidratado pelo JwtStrategy) — vive exatamente o tempo do
// request e é coletado com ele. NADA persiste entre requests (WeakMap não é
// iterável e não segura a chave viva). Guardamos a Promise (não o valor) para
// coalescer chamadas concorrentes no mesmo tick.
//
// Amarramos a entrada ao `prisma` que a gerou: num request real `prisma` é o
// mesmo singleton em todas as chamadas → 1 resolve. Se a MESMA referência de
// `user` for reusada com OUTRO `prisma` (padrão dos testes, que simula outro
// estado de banco), o cache MISS de propósito e resolve de novo — sem estado
// falso vazando entre cenários.
//
// Invalidação: nenhuma. Vida = request. Se a política mudar, é outro request,
// outro `user`, outra entrada.
type TeamAccessCacheEntry = { prisma: any; promise: Promise<EffectiveTeamAccess> };
const teamAccessRequestCache = new WeakMap<object, TeamAccessCacheEntry>();

// Contador de instrumentação (dev/test): quantas vezes o resolve REAL (uncached)
// rodou. Prova a queda de queries por request. Não usar em produção para lógica.
let effectiveTeamAccessResolveCount = 0;
export function __getEffectiveTeamAccessResolveCount() {
  return effectiveTeamAccessResolveCount;
}
export function __resetEffectiveTeamAccessResolveCount() {
  effectiveTeamAccessResolveCount = 0;
}

export async function resolveEffectiveTeamAccess(prisma: any, user: any): Promise<EffectiveTeamAccess> {
  // Só cacheia quando `user` é objeto (é sempre, em request real). Sem objeto
  // não há chave WeakMap possível → resolve direto.
  if (!user || typeof user !== 'object') {
    effectiveTeamAccessResolveCount += 1;
    return resolveEffectiveTeamAccessUncached(prisma, user);
  }

  const cached = teamAccessRequestCache.get(user as object);
  if (cached && cached.prisma === prisma) return cached.promise;

  effectiveTeamAccessResolveCount += 1;
  const promise = resolveEffectiveTeamAccessUncached(prisma, user).catch((err) => {
    // Falha não fica grudada no cache — o próximo acesso tenta de novo.
    const current = teamAccessRequestCache.get(user as object);
    if (current && current.promise === promise) teamAccessRequestCache.delete(user as object);
    throw err;
  });
  teamAccessRequestCache.set(user as object, { prisma, promise });
  return promise;
}

export async function hasEffectiveTeamAccess(prisma: any, user: any, key: unknown) {
  const context = await resolveEffectiveTeamAccess(prisma, user);
  return hasTeamAccess(context.accessMap, key);
}

export async function assertEffectiveTeamAccess(
  prisma: any,
  user: any,
  key: unknown,
  message = 'Acesso bloqueado pela politica da equipe.',
) {
  const context = await resolveEffectiveTeamAccess(prisma, user);
  if (!hasTeamAccess(context.accessMap, key)) throw new ForbiddenException(message);
  return context;
}

export async function resolveVendasAccessContext(prisma: any, user: any): Promise<VendasAccessContext> {
  const context = await resolveEffectiveTeamAccess(prisma, user);
  const has = (key: string) => hasTeamAccess(context.accessMap, key);
  const activeMasterContext = Boolean(context.masterContext?.active);

  if (context.isSystemMaster && !activeMasterContext) {
    throw new ForbiddenException('Contexto de tenant obrigatorio para operar Vendas.');
  }
  if (!activeMasterContext && isPlatformInfraCompany(context.company)) {
    throw new ForbiddenException('Contexto de tenant obrigatorio para operar Vendas.');
  }
  if (!context.companyId) {
    throw new ForbiddenException('Empresa nao identificada.');
  }
  if (!has('vendas.access')) {
    throw new ForbiddenException('Acesso ao Vendas bloqueado pela politica da equipe.');
  }
  if (!has('workspace.vendas.access')) {
    throw new ForbiddenException('Perfil operacional sem acesso ao workspace Vendas.');
  }

  return {
    ...context,
    companyId: context.companyId,
    canViewOwnCards: has('vendas.cards.viewOwn'),
    canViewCompanyCards: has('vendas.cards.viewCompany'),
    canCreateManualCards: has('vendas.cards.createManual'),
    canEditCards: has('vendas.cards.edit'),
    canTransferCards: has('vendas.cards.transfer') || has('vendas.cards.assign'),
    canCloseCards: has('vendas.cards.close'),
    canReopenCards: has('vendas.cards.reopen'),
    canDeleteCards: has('vendas.cards.delete'),
    canChangeStatus: has('vendas.status.change'),
    canMarkActivationPending: has('vendas.sale.markActivationPending'),
    canMarkTrialStarted: has('vendas.sale.markTrialStarted'),
    canMarkConfirmed: has('vendas.sale.markConfirmed'),
    canMarkInactive: has('vendas.sale.markInactive'),
    canCommentTimeline: has('vendas.timeline.comment'),
    canScheduleReturn: has('vendas.return.schedule'),
    canSendRadarCardsToVendas: has('radar.cards.sendToVendas'),
    canManualEnrichRadar: has('radar.enrichment.manual'),
    canSendWhatsappManual: has('communication.whatsapp.sendManual'),
    canSendEmail: has('communication.email.send'),
    canUseCompanyReplyTo: has('communication.email.useCompanyReplyTo'),
    canUseCompanyWhatsappNumber: has('communication.whatsapp.useCompanyNumber'),
    canSellProducts: has('products.sell'),
    canApplyProductDiscount: has('products.discount'),
    canViewProductPrice: has('products.viewPrice'),
    canChangeProductPrice: has('products.changePrice'),
    canViewOwnCommission: has('commission.viewOwn'),
    canViewTeamCommission: has('commission.viewTeam'),
    canMarkCommissionPaid: has('commission.markPaid'),
    canCancelCommission: has('commission.cancel'),
  };
}

export async function resolveProductsAccessContext(prisma: any, user: any): Promise<ProductsAccessContext> {
  const context = await resolveEffectiveTeamAccess(prisma, user);
  const has = (key: string) => hasTeamAccess(context.accessMap, key);
  const activeMasterContext = Boolean(context.masterContext?.active);

  if (context.isSystemMaster && !activeMasterContext) {
    throw new ForbiddenException('Contexto de tenant obrigatorio para operar Produtos.');
  }
  if (!activeMasterContext && isPlatformInfraCompany(context.company)) {
    throw new ForbiddenException('Contexto de tenant obrigatorio para operar Produtos.');
  }
  if (!context.companyId) {
    throw new ForbiddenException('Empresa nao identificada.');
  }

  return {
    ...context,
    companyId: context.companyId,
    canViewProducts: has('products.view'),
    canSellProducts: has('products.sell'),
    canEditProducts: has('products.edit'),
    canApplyProductDiscount: has('products.discount'),
    canViewProductPrice: has('products.viewPrice'),
    canChangeProductPrice: has('products.changePrice'),
  };
}
