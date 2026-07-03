import { isTenantCompany } from '../common/company-kind';
import {
  buildTeamAccessRows,
  isTeamAccessKey,
  moduleAccessRowsFromMap,
  normalizeTeamAccessKey,
  normalizeTeamAccessMap,
  type TeamAccessMap,
} from './team-access-catalog';

export const TEAM_POLICY_VERSION = 1;
export const TEAM_POLICY_DEFAULT_REQUIRED_CHANNELS = {
  whatsapp: false,
  instagram: false,
  facebook: false,
  email: false,
  website: false,
};
export const TEAM_POLICY_UNLIMITED_LIMIT = 999999;

export type RuntimeTeamPolicyLimitMode = 'inherit' | 'limited' | 'unlimited' | 'blocked';
export type RuntimeTeamPolicyLimit = {
  applies: boolean;
  mode: RuntimeTeamPolicyLimitMode;
  limit: number | null;
  configuredLimit: number | null;
};

export type RuntimeTeamPolicy = {
  id: string;
  userId: number;
  companyId: number | null;
  status: string | null;
  subjectKind: string | null;
  modulesJson?: string | null;
  moduleAccessMap: Map<string, boolean>;
  accessMap: Map<string, boolean>;
  requiredChannels: typeof TEAM_POLICY_DEFAULT_REQUIRED_CHANNELS;
  requiredChannelList: string[];
  raw: any;
};

function normalizeRole(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function clampPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric * 100) / 100));
}

function normalizeLegacyEnrichmentOverride(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Math.trunc(Number(value || 0));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(500, numeric));
}

export function normalizeTeamPolicyModuleKey(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function parseJsonValue(value: unknown, fallback: any) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

export function parseTeamPolicyModuleAccessMap(value: unknown) {
  const parsed = parseJsonValue(value, []);
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.entries(parsed).map(([key, allowed]) => ({ key, allowed }))
      : [];
  const map = new Map<string, boolean>();
  for (const row of rows) {
    const key = normalizeTeamPolicyModuleKey((row as any)?.key);
    if (!key || key.includes('.')) continue;
    map.set(key, Boolean((row as any)?.allowed));
  }
  return map;
}

export function parseTeamPolicyAccessMap(value: unknown) {
  const parsed = parseJsonValue(value, []);
  const normalized = normalizeTeamAccessMap(parsed);
  return new Map<string, boolean>(Object.entries(normalized));
}

export function serializeTeamPolicyModuleAndAccessRows(input: {
  modules?: unknown;
  access?: TeamAccessMap | null;
}) {
  const rows = [
    ...moduleAccessRowsFromMap(input.modules || []),
    ...buildTeamAccessRows(input.access || {}),
  ].sort((a, b) => a.key.localeCompare(b.key));
  return JSON.stringify(rows);
}

export function resolveTeamPolicyModuleAllowed(policy: RuntimeTeamPolicy | null | undefined, moduleKey: unknown) {
  const key = normalizeTeamPolicyModuleKey(moduleKey);
  if (!policy || !key || !policy.moduleAccessMap.has(key)) return undefined;
  return Boolean(policy.moduleAccessMap.get(key));
}

export function resolveTeamPolicyAccessAllowed(policy: RuntimeTeamPolicy | null | undefined, accessKey: unknown) {
  const key = normalizeTeamAccessKey(accessKey);
  if (!policy || !key || !isTeamAccessKey(key) || !policy.accessMap.has(key)) return undefined;
  return Boolean(policy.accessMap.get(key));
}

export function parseTeamPolicyRequiredChannels(value: unknown) {
  const parsed = parseJsonValue(value, {});
  return {
    whatsapp: Boolean(parsed?.whatsapp),
    instagram: Boolean(parsed?.instagram),
    facebook: Boolean(parsed?.facebook),
    email: Boolean(parsed?.email),
    website: Boolean(parsed?.website),
  };
}

export function getTeamPolicyRequiredChannelList(policyOrChannels: RuntimeTeamPolicy | Record<string, unknown> | null | undefined) {
  const channels = (policyOrChannels as RuntimeTeamPolicy)?.requiredChannels || policyOrChannels || {};
  return (['whatsapp', 'instagram', 'facebook', 'email', 'website'] as const)
    .filter((channel) => Boolean((channels as any)?.[channel]));
}

export function normalizeTeamPolicyLimitMode(value: unknown): RuntimeTeamPolicyLimitMode {
  const normalized = String(value || 'inherit').trim().toLowerCase();
  if (normalized === 'limited' || normalized === 'unlimited' || normalized === 'blocked') return normalized;
  return 'inherit';
}

function normalizePolicyLimitValue(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(TEAM_POLICY_UNLIMITED_LIMIT, numeric));
}

export function resolveTeamPolicyStoredLimit(policy: RuntimeTeamPolicy | any | null | undefined, prefix: string): RuntimeTeamPolicyLimit {
  const raw = (policy as RuntimeTeamPolicy)?.raw || policy || null;
  const mode = normalizeTeamPolicyLimitMode(raw?.[`${prefix}Mode`]);
  if (!raw || mode === 'inherit') {
    return { applies: false, mode: 'inherit', limit: null, configuredLimit: null };
  }
  if (mode === 'unlimited') {
    return {
      applies: true,
      mode,
      limit: TEAM_POLICY_UNLIMITED_LIMIT,
      configuredLimit: 0,
    };
  }
  if (mode === 'blocked') {
    return {
      applies: true,
      mode,
      limit: 0,
      configuredLimit: 0,
    };
  }
  const value = normalizePolicyLimitValue(raw?.[`${prefix}Limit`]);
  if (value === null) {
    return { applies: false, mode: 'inherit', limit: null, configuredLimit: null };
  }
  return {
    applies: true,
    mode: value <= 0 ? 'blocked' : 'limited',
    limit: value,
    configuredLimit: value,
  };
}

export async function loadUserTeamPolicyRuntime(prisma: any, userIdRaw: unknown): Promise<RuntimeTeamPolicy | null> {
  const userId = Math.trunc(Number(userIdRaw || 0));
  if (!userId) return null;
  if (!prisma?.userTeamPolicy?.findUnique) return null;
  const row = await prisma.userTeamPolicy.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      companyId: true,
      status: true,
      subjectKind: true,
      modulesJson: true,
      enrichmentDailyMode: true,
      enrichmentDailyLimit: true,
      cardDeliveryDailyMode: true,
      cardDeliveryDailyLimit: true,
      activeCardsMode: true,
      activeCardsLimit: true,
      monthlyCardsMode: true,
      monthlyCardsLimit: true,
      vendasPullQuantityMode: true,
      vendasPullQuantityLimit: true,
      allowedSegmentsJson: true,
      blockedSegmentsJson: true,
      allowedCitiesJson: true,
      allowedStatesJson: true,
      requiresLocation: true,
      requiredChannelsJson: true,
      visibilityJson: true,
    },
  }).catch(() => null);
  if (!row) return null;
  const requiredChannels = parseTeamPolicyRequiredChannels(row.requiredChannelsJson);
  return {
    id: String(row.id || ''),
    userId: Number(row.userId || userId),
    companyId: Number(row.companyId || 0) || null,
    status: row.status || null,
    subjectKind: row.subjectKind || null,
    modulesJson: row.modulesJson || null,
    moduleAccessMap: parseTeamPolicyModuleAccessMap(row.modulesJson),
    accessMap: parseTeamPolicyAccessMap(row.modulesJson),
    requiredChannels,
    requiredChannelList: getTeamPolicyRequiredChannelList(requiredChannels),
    raw: row,
  };
}

export function resolveTeamPolicySubjectKind(user: any, company?: any) {
  const role = normalizeRole(user?.role);
  if (user?.isSystemMaster) return 'system_master';
  // USERMASTER de tenant (dono/admin da empresa, NAO isSystemMaster) e admin da
  // empresa: mapeia para 'company_admin' para receber os defaults de admin
  // (buildDefaultTeamAccessMapForRole ja trata 'company_admin' como admin).
  // Sem isso o USERMASTER caia em 'unknown' e herdava defaults de VENDEDOR
  // (vendas.cards.viewCompany=false), deixando o funil do dono vazio.
  if (role === 'ADMIN' || role === 'USERMASTER') return 'company_admin';
  if (role === 'USER') return 'common_seller';
  return 'unknown';
}

export function buildUserTeamPolicySnapshotData(user: any, options?: { source?: string }) {
  const company = user?.company || null;
  const subjectKind = resolveTeamPolicySubjectKind(user, company);
  const tenantCompany = Boolean(company && isTenantCompany(company));
  const legacyOverride = normalizeLegacyEnrichmentOverride(user?.sellerDistributionDailyLimitOverride);
  // Team policy e a unica fonte de permissao (PR-002 A.5 / DROP): o snapshot
  // parte dos defaults do papel + concessoes explicitas; nada da tabela
  // legada UserModuleAccess (removida).
  const modules: Array<{ key: string; allowed: boolean }> = [];
  const enrichmentDailyMode = tenantCompany && legacyOverride === 0
    ? 'unlimited'
    : tenantCompany && typeof legacyOverride === 'number' && legacyOverride > 0
      ? 'limited'
      : 'inherit';

  return {
    companyId: Number(user?.companyId || 0) || null,
    referredByUserId: Number(user?.referredByUserId || 0) || null,
    policyVersion: TEAM_POLICY_VERSION,
    status: user?.isActive === false || user?.deactivatedAt ? 'inactive' : 'active',
    source: String(options?.source || 'legacy_sync').trim() || 'legacy_sync',
    roleSnapshot: normalizeRole(user?.role) || null,
    subjectKind,
    modulesJson: serializeTeamPolicyModuleAndAccessRows({ modules }),
    commissionPercent: clampPercent(user?.commissionPercent),
    commissionDueBusinessDays: company?.commissionDueBusinessDays == null
      ? null
      : Math.max(0, Math.min(30, Math.trunc(Number(company.commissionDueBusinessDays || 0) || 0))),
    canRegisterHbxSellers: Boolean(user?.canRegisterHbxSellers),
    sellerReferralCommissionPercent: clampPercent(user?.sellerReferralCommissionPercent),
    referredByCommissionPercentSnapshot: clampPercent(user?.referredByCommissionPercentSnapshot),
    legacySellerDistributionDailyLimitOverride: legacyOverride,
    enrichmentDailyMode,
    enrichmentDailyLimit: enrichmentDailyMode === 'limited' ? legacyOverride : null,
    cardDeliveryDailyMode: 'inherit',
    cardDeliveryDailyLimit: null,
    activeCardsMode: 'inherit',
    activeCardsLimit: null,
    monthlyCardsMode: 'inherit',
    monthlyCardsLimit: null,
    vendasPullQuantityMode: 'inherit',
    vendasPullQuantityLimit: null,
    allowedSegmentsJson: '[]',
    blockedSegmentsJson: '[]',
    allowedCitiesJson: '[]',
    allowedStatesJson: '[]',
    requiresLocation: null,
    requiredChannelsJson: JSON.stringify(TEAM_POLICY_DEFAULT_REQUIRED_CHANNELS),
    visibilityJson: null,
  };
}

export async function ensureUserTeamPolicyForUser(
  prisma: any,
  userIdRaw: unknown,
  options?: { source?: string; overwrite?: boolean },
) {
  const userId = Math.trunc(Number(userIdRaw || 0));
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: {
        select: {
          id: true,
          slug: true,
          commissionDueBusinessDays: true,
        },
      },
    },
  });
  if (!user) return null;
  if (user.isSystemMaster) return null;

  const snapshot = buildUserTeamPolicySnapshotData(user, { source: options?.source });
  const syncUpdate = {
    companyId: snapshot.companyId,
    referredByUserId: snapshot.referredByUserId,
    policyVersion: snapshot.policyVersion,
    status: snapshot.status,
    source: snapshot.source,
    roleSnapshot: snapshot.roleSnapshot,
    subjectKind: snapshot.subjectKind,
    modulesJson: snapshot.modulesJson,
    commissionPercent: snapshot.commissionPercent,
    commissionDueBusinessDays: snapshot.commissionDueBusinessDays,
    canRegisterHbxSellers: snapshot.canRegisterHbxSellers,
    sellerReferralCommissionPercent: snapshot.sellerReferralCommissionPercent,
    referredByCommissionPercentSnapshot: snapshot.referredByCommissionPercentSnapshot,
    legacySellerDistributionDailyLimitOverride: snapshot.legacySellerDistributionDailyLimitOverride,
    enrichmentDailyMode: snapshot.enrichmentDailyMode,
    enrichmentDailyLimit: snapshot.enrichmentDailyLimit,
    requiresLocation: snapshot.requiresLocation,
    requiredChannelsJson: snapshot.requiredChannelsJson,
  };
  const existing = await prisma.userTeamPolicy.findUnique({
    where: { userId },
    select: { id: true },
  }).catch(() => null);

  if (existing && options?.overwrite === false) return existing;

  return prisma.userTeamPolicy.upsert({
    where: { userId },
    create: {
      userId,
      ...snapshot,
    },
    update: syncUpdate,
  });
}

export async function backfillMissingUserTeamPolicies(prisma: any, options?: { source?: string }) {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deactivatedAt: null,
      teamPolicy: { is: null },
    },
    select: { id: true },
  });

  for (const user of users) {
    await ensureUserTeamPolicyForUser(prisma, user.id, {
      source: options?.source || 'runtime_backfill',
    });
  }

  return { createdOrSynced: users.length };
}
