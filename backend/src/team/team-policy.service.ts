import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommercialUsageLimitsService } from '../commercial-plans/commercial-usage-limits.service';
import { isTenantCompany } from '../common/company-kind';
import { isGerenteActor, resolveActorKind } from '../access/actor-kind';
import { ModulesService } from '../modules/modules.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildDefaultTeamAccessMapForRole,
  buildTeamAccessMapFromModuleAccess,
  getTeamAccessCatalog,
  getTeamAccessGroups,
  hasTeamAccess,
  listMissingBackendEnforcement,
  mergeTeamAccessMaps,
  normalizeTeamAccessMap,
  type TeamAccessMap,
} from './team-access-catalog';
import {
  buildPresetAccessMap,
  getTeamAccessPresets,
  resolveTeamAccessPreset,
} from './team-access-presets';
import {
  ensureUserTeamPolicyForUser,
  loadUserTeamPolicyRuntime,
  parseTeamPolicyAccessMap,
  parseTeamPolicyModuleAccessMap,
  resolveTeamPolicyAccessAllowed,
  serializeTeamPolicyModuleAndAccessRows,
} from './team-policy-persistence';
import type {
  TeamPolicy,
  TeamPolicyActorKind,
  TeamPolicyLimit,
  TeamPolicyLimitMode,
  TeamPolicyModule,
  TeamPolicyVisibility,
} from './team-policy.types';

type TeamPolicySellerVisibilityKey =
  | 'sellerCanViewOwnPolicy'
  | 'sellerCanViewCommission'
  | 'sellerCanViewSellerNetwork'
  | 'sellerCanViewLimits';

type TeamPolicyPatch = {
  modules?: Array<{ key?: unknown; allowed?: unknown }>;
  access?: Record<string, unknown>;
  accessMap?: Record<string, unknown>;
  accessPresetKey?: unknown;
  presetKey?: unknown;
  presetId?: unknown;
  compensation?: {
    commissionPercent?: unknown;
    commissionDueBusinessDays?: unknown;
  };
  sellerNetwork?: {
    canRecruitSellers?: unknown;
    sellerReferralCommissionPercent?: unknown;
    referredByUserId?: unknown;
    referredByCommissionPercentSnapshot?: unknown;
  };
  limits?: {
    cardDeliveryDaily?: TeamPolicyLimitPatch;
    activeCards?: TeamPolicyLimitPatch;
    monthlyCards?: TeamPolicyLimitPatch;
    vendasPullQuantity?: TeamPolicyLimitPatch;
  };
  radar?: {
    allowedSegments?: unknown;
    blockedSegments?: unknown;
    allowedCities?: unknown;
    allowedStates?: unknown;
    requiresLocation?: unknown;
    requiredChannels?: Record<string, unknown>;
  };
  visibility?: Partial<Record<TeamPolicySellerVisibilityKey, unknown>> & {
    adminCanEditLegacyFields?: unknown;
    masterCanUseUnlimited?: unknown;
  };
};

type TeamPolicyLimitPatch = {
  mode?: unknown;
  value?: unknown;
};

const UNLIMITED_NUMERIC_SENTINEL = 999999;
const TEAM_POLICY_OPERATIONAL_LIMIT_MAX = 500;
const TEAM_POLICY_PENDING_SCHEMA_FIELDS = [
  'commissionDueBusinessDays_per_user',
  'cardDeliveryDaily',
  'activeCards',
  'monthlyCards',
  'vendasPullQuantity',
  'allowedSegments',
  'blockedSegments',
  'allowedCities',
  'allowedStates',
  'requiredRadarFilters',
];
const TEAM_POLICY_SELLER_VISIBILITY_KEYS: TeamPolicySellerVisibilityKey[] = [
  'sellerCanViewOwnPolicy',
  'sellerCanViewCommission',
  'sellerCanViewSellerNetwork',
  'sellerCanViewLimits',
];

@Injectable()
export class TeamPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modulesService: ModulesService,
    private readonly commercialUsageLimits: CommercialUsageLimitsService,
  ) {}

  private normalizeRole(value: unknown) {
    return String(value || '').trim().toUpperCase();
  }

  private normalizePercent(value: unknown, fieldName: string) {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new BadRequestException(`${fieldName} invalido`);
    return Math.min(100, Math.max(0, Math.round(numeric * 100) / 100));
  }

  private normalizePositiveId(value: unknown, fieldName: string) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const numeric = Math.trunc(Number(value));
    if (!Number.isFinite(numeric) || numeric <= 0) throw new BadRequestException(`${fieldName} invalido`);
    return numeric;
  }

  private normalizeBusinessDays(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = Math.trunc(Number(value));
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 30) {
      throw new BadRequestException('D+ invalido');
    }
    return numeric;
  }

  private normalizeBoolean(value: unknown) {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    if (['true', '1', 'sim', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'nao', 'no'].includes(normalized)) return false;
    throw new BadRequestException('Valor booleano invalido');
  }

  private normalizeLimitMode(value: unknown): TeamPolicyLimitMode | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === '\u221e' || normalized === 'infinite') return 'unlimited';
    if (['inherit', 'limited', 'unlimited', 'blocked'].includes(normalized)) {
      return normalized as TeamPolicyLimitMode;
    }
    throw new BadRequestException('Modo de limite invalido');
  }

  private normalizeLimitPatch(value: TeamPolicyLimitPatch | unknown, actorIsMaster: boolean) {
    const patch = value && typeof value === 'object' && !Array.isArray(value)
      ? value as TeamPolicyLimitPatch
      : { value };
    const rawValue = patch.value;
    const rawMode = this.normalizeLimitMode(patch.mode);
    const rawValueText = String(rawValue ?? '').trim().toLowerCase();
    const wantsUnlimited =
      rawMode === 'unlimited' ||
      rawValueText === '\u221e' ||
      rawValueText === 'unlimited' ||
      rawValueText === 'infinite';

    if (wantsUnlimited) {
      return actorIsMaster
        ? { mode: 'unlimited' as TeamPolicyLimitMode, value: null as number | null, legacyValue: 0 }
        : { mode: 'inherit' as TeamPolicyLimitMode, value: null as number | null, legacyValue: null };
    }

    if (rawMode === 'inherit' || rawValue === null || rawValue === '') {
      return { mode: 'inherit' as TeamPolicyLimitMode, value: null as number | null, legacyValue: null };
    }

    if (rawMode === 'blocked') {
      return { mode: 'blocked' as TeamPolicyLimitMode, value: 0, legacyValue: 0 };
    }

    const numeric = Math.trunc(Number(rawValue));
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new BadRequestException('Limite invalido');
    }
    const valueNumber = Math.min(TEAM_POLICY_OPERATIONAL_LIMIT_MAX, numeric);
    if (valueNumber === 0) {
      return actorIsMaster
        ? { mode: 'unlimited' as TeamPolicyLimitMode, value: null as number | null, legacyValue: 0 }
        : { mode: 'inherit' as TeamPolicyLimitMode, value: null as number | null, legacyValue: null };
    }

    return {
      mode: 'limited' as TeamPolicyLimitMode,
      value: valueNumber,
      legacyValue: valueNumber,
    };
  }

  private normalizeTextList(value: unknown) {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return values
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 100);
  }

  private normalizeCityList(value: unknown) {
    const values = Array.isArray(value) ? value : [];
    return values
      .map((item) => ({
        city: String(item?.city || '').trim(),
        state: item?.state ? String(item.state).trim().toUpperCase() : null,
      }))
      .filter((item) => item.city)
      .slice(0, 250);
  }

  private normalizeRequiredChannels(value: Record<string, unknown> | undefined) {
    if (!value || typeof value !== 'object') return undefined;
    return {
      whatsapp: Boolean(value.whatsapp),
      instagram: Boolean(value.instagram),
      facebook: Boolean(value.facebook),
      email: Boolean(value.email),
      website: Boolean(value.website),
    };
  }

  private normalizeAccessPatch(value: unknown): TeamAccessMap | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const normalized = normalizeTeamAccessMap(value);
    return Object.keys(normalized).length ? normalized : undefined;
  }

  private resolveAccessPresetKey(patch: TeamPolicyPatch | null | undefined) {
    const requested = patch?.accessPresetKey ?? patch?.presetKey ?? patch?.presetId;
    const preset = resolveTeamAccessPreset(requested);
    return preset?.key || null;
  }

  private storedModuleRowsFromPolicy(storedPolicy: any, patch?: TeamPolicyPatch) {
    if (Array.isArray(patch?.modules)) {
      return patch.modules
        .map((moduleItem) => ({
          key: String(moduleItem?.key || '').trim().toLowerCase(),
          allowed: Boolean(moduleItem?.allowed),
        }))
        .filter((moduleItem) => moduleItem.key);
    }
    return Array.from(parseTeamPolicyModuleAccessMap(storedPolicy?.modulesJson || null).entries())
      .map(([key, allowed]) => ({ key, allowed }));
  }

  private storedAccessMapFromPolicy(storedPolicy: any): TeamAccessMap {
    return Object.fromEntries(parseTeamPolicyAccessMap(storedPolicy?.modulesJson || null).entries());
  }

  private buildAccessMapFromModules(modules: TeamPolicyModule[] | Array<{ key?: unknown; allowed?: unknown }>) {
    return buildTeamAccessMapFromModuleAccess(
      (modules || []).map((moduleItem) => ({
        key: String(moduleItem?.key || '').trim(),
        allowed: Boolean(moduleItem?.allowed),
      })),
    );
  }

  private buildEffectiveAccessMap(target: any, modules: TeamPolicyModule[], storedPolicy: any): TeamAccessMap {
    const targetKind = this.getActorKind(target, target?.company);
    const defaults = buildDefaultTeamAccessMapForRole(targetKind);
    const currentModuleAccess = this.buildAccessMapFromModules(modules);
    const storedModuleAccess = buildTeamAccessMapFromModuleAccess(this.storedModuleRowsFromPolicy(storedPolicy));
    const explicitAccess = this.storedAccessMapFromPolicy(storedPolicy);
    return mergeTeamAccessMaps(defaults, currentModuleAccess, storedModuleAccess, explicitAccess);
  }

  // S8/A2 — "so passa o que tem": mapa de acesso EFETIVO do CONCEDENTE (quem
  // esta chamando updatePolicy), usado para interseccionar contra o que ele
  // tenta conceder a outro usuario (subset-delegation). Reusa a mesma fonte
  // de runtime que resolveTeamPolicyAccessAllowed usa em assertCanManage:
  // policy persistida do requester + default do papel dele quando a chave
  // nao tem override explicito. system_master/dono NAO chamam isto (sao raiz
  // — ver updatePolicy).
  private async resolveGranterAccessMap(requester: any): Promise<TeamAccessMap> {
    const granterKind = this.getActorKind(requester, requester?.company);
    const defaults = buildDefaultTeamAccessMapForRole(granterKind);
    const requesterPolicy = await loadUserTeamPolicyRuntime(this.prisma, requester?.id).catch(() => null);
    const explicitAccess = requesterPolicy
      ? Object.fromEntries(requesterPolicy.accessMap.entries())
      : {};
    return mergeTeamAccessMaps(defaults, explicitAccess);
  }

  private buildStoredAccessUpdate(storedPolicy: any, patch: TeamPolicyPatch) {
    const presetKey = this.resolveAccessPresetKey(patch);
    const presetAccess = presetKey ? buildPresetAccessMap(presetKey) : null;
    const accessPatch = this.normalizeAccessPatch(patch?.access ?? patch?.accessMap);
    if (!presetAccess && !accessPatch) return undefined;
    return mergeTeamAccessMaps(
      presetAccess ? {} : this.storedAccessMapFromPolicy(storedPolicy),
      presetAccess || null,
      accessPatch || null,
    );
  }

  private toStoredLimitFields(prefix: string, limitPatch: unknown, actorIsMaster: boolean) {
    const normalized = this.normalizeLimitPatch(limitPatch, actorIsMaster);
    return {
      [`${prefix}Mode`]: normalized.mode,
      [`${prefix}Limit`]: normalized.value,
    };
  }

  private normalizeStoredLimitMode(value: unknown): TeamPolicyLimitMode {
    const normalized = String(value || 'inherit').trim().toLowerCase();
    if (['inherit', 'limited', 'unlimited', 'blocked'].includes(normalized)) {
      return normalized as TeamPolicyLimitMode;
    }
    return 'inherit';
  }

  private finiteLimit(value: unknown) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= UNLIMITED_NUMERIC_SENTINEL ? null : Math.max(0, numeric || 0);
  }

  private buildLimit(input: {
    value?: unknown;
    used?: unknown;
    remaining?: unknown;
    resetAt?: string | null;
    source: TeamPolicyLimit['source'];
    forceMode?: TeamPolicyLimitMode;
  }): TeamPolicyLimit {
    const finiteValue = this.finiteLimit(input.value);
    const mode = input.forceMode || (finiteValue === null ? 'unlimited' : finiteValue === 0 ? 'blocked' : 'limited');
    return {
      mode,
      value: mode === 'unlimited' ? null : finiteValue,
      used: input.used === undefined ? null : Math.max(0, Math.trunc(Number(input.used || 0))),
      remaining: input.remaining === undefined
        ? null
        : this.finiteLimit(input.remaining),
      resetAt: input.resetAt || null,
      source: input.source,
    };
  }

  private applyStoredLimit(
    storedPolicy: any,
    modeKey: string,
    limitKey: string,
    fallback: TeamPolicyLimit,
  ): TeamPolicyLimit {
    const mode = this.normalizeStoredLimitMode(storedPolicy?.[modeKey]);
    if (!storedPolicy || mode === 'inherit') return fallback;
    if (mode === 'unlimited') {
      return {
        ...fallback,
        mode: 'unlimited',
        value: null,
        remaining: null,
        source: 'team_policy',
      };
    }
    if (mode === 'blocked') {
      return {
        ...fallback,
        mode: 'blocked',
        value: 0,
        remaining: 0,
        source: 'team_policy',
      };
    }
    const value = this.finiteLimit(storedPolicy?.[limitKey]);
    if (typeof value !== 'number') return fallback;
    return {
      ...fallback,
      mode: value <= 0 ? 'blocked' : 'limited',
      value,
      remaining: fallback.used == null ? fallback.remaining : Math.max(0, value - Math.max(0, Number(fallback.used || 0))),
      source: 'team_policy',
    };
  }

  private parseStringArrayJson(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  private parseCitiesJson(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed)
        ? parsed
            .map((item) => ({
              city: String(item?.city || '').trim(),
              state: item?.state ? String(item.state).trim().toUpperCase() : null,
            }))
            .filter((item) => item.city)
        : [];
    } catch {
      return [];
    }
  }

  private parseRequiredChannelsJson(value: unknown) {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return {
        whatsapp: Boolean(parsed?.whatsapp),
        instagram: Boolean(parsed?.instagram),
        facebook: Boolean(parsed?.facebook),
        email: Boolean(parsed?.email),
        website: Boolean(parsed?.website),
      };
    } catch {
      return {
        whatsapp: false,
        instagram: false,
        facebook: false,
        email: false,
        website: false,
      };
    }
  }

  private defaultSellerVisibility(): Pick<TeamPolicyVisibility, TeamPolicySellerVisibilityKey> {
    return {
      sellerCanViewOwnPolicy: true,
      sellerCanViewCommission: true,
      sellerCanViewSellerNetwork: true,
      sellerCanViewLimits: true,
    };
  }

  private parseVisibilityJson(value: unknown) {
    const visibility = this.defaultSellerVisibility();
    try {
      const parsed = JSON.parse(String(value || '{}'));
      if (!parsed || typeof parsed !== 'object') return visibility;
      TEAM_POLICY_SELLER_VISIBILITY_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          visibility[key] = Boolean(parsed[key]);
        }
      });
      return visibility;
    } catch {
      return visibility;
    }
  }

  private normalizeVisibilityPatch(value: TeamPolicyPatch['visibility'] | undefined) {
    if (!value || typeof value !== 'object') return undefined;
    const next: Partial<Record<TeamPolicySellerVisibilityKey, boolean>> = {};
    TEAM_POLICY_SELLER_VISIBILITY_KEYS.forEach((key) => {
      const normalized = this.normalizeBoolean(value[key]);
      if (normalized !== undefined) next[key] = normalized;
    });
    return Object.keys(next).length ? next : undefined;
  }

  // RBAC Sprint 3: fonte única em ../access/actor-kind (resolveActorKind).
  // Semântica idêntica ao inline anterior (caracterização em actor-kind.test.ts).
  private isGerente(requester: any): boolean {
    return isGerenteActor(requester);
  }

  private getActorKind(user: any, company?: any): TeamPolicyActorKind {
    const role = this.normalizeRole(user?.role);
    if (user?.isSystemMaster) return 'system_master';
    // USERMASTER de tenant (nao isSystemMaster) = admin da empresa: mesmo
    // mapeamento de resolveTeamPolicySubjectKind para os defaults admin serem
    // consistentes entre runtime e a policy exibida/salva.
    if (role === 'ADMIN' || role === 'USERMASTER') return 'company_admin';
    if (role === 'USER') return 'common_seller';
    return 'unknown';
  }

  private async findTargetUser(userId: number, options?: { ensurePolicy?: boolean }) {
    const normalizedUserId = Math.trunc(Number(userId || 0));
    if (!normalizedUserId) throw new BadRequestException('Usuario invalido');
    const user = await this.prisma.user.findUnique({
      where: { id: normalizedUserId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            companyKind: true,
            selectedPlanKey: true,
            commissionDueBusinessDays: true,
            timezone: true,
          },
        },
        referredByUser: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
        teamPolicy: {
          include: {
            preset: {
              select: {
                id: true,
                key: true,
                name: true,
              },
            },
            referredByUser: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
              },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuario nao encontrado');
    if (!user.teamPolicy && options?.ensurePolicy !== false) {
      await ensureUserTeamPolicyForUser(this.prisma, user.id, { source: 'runtime_backfill' });
      return this.findTargetUser(user.id, { ensurePolicy: false });
    }
    return user as any;
  }

  private assertCanRead(requester: any, target: any) {
    const requesterId = Math.trunc(Number(requester?.id || 0));
    if (requesterId && requesterId === Number(target.id)) return;
    if (requester?.isSystemMaster) return;
    const requesterRole = this.normalizeRole(requester?.role);
    const requesterCompanyId = Math.trunc(Number(requester?.companyId || 0));
    const targetCompanyId = Math.trunc(Number(target?.companyId || 0));
    // USERMASTER (dono do tenant) = admin: le a policy da propria equipe, igual a ADMIN.
    if ((requesterRole === 'ADMIN' || requesterRole === 'USERMASTER') && requesterCompanyId && requesterCompanyId === targetCompanyId) return;
    throw new ForbiddenException('Acesso restrito ao responsavel da equipe.');
  }

  private async assertCanManage(requester: any, target: any) {
    if (target?.isSystemMaster) {
      throw new ForbiddenException('Politica do MASTER nao e editada por este fluxo.');
    }
    if (requester?.isSystemMaster) return;

    const requesterRole = this.normalizeRole(requester?.role);
    const requesterCompanyId = Math.trunc(Number(requester?.companyId || 0));
    const targetCompanyId = Math.trunc(Number(target?.companyId || 0));
    const sameCompany = Boolean(requesterCompanyId && requesterCompanyId === targetCompanyId);
    if (!sameCompany) throw new ForbiddenException('Acesso restrito ao responsavel da equipe.');

    const requesterPolicy = await loadUserTeamPolicyRuntime(this.prisma, requester?.id).catch(() => null);
    const manageAccess = resolveTeamPolicyAccessAllowed(requesterPolicy, 'team.access.manage');
    // USERMASTER (dono do tenant) = admin: gerencia a policy da equipe, igual a ADMIN.
    if (requesterRole === 'ADMIN' || requesterRole === 'USERMASTER') {
      if (manageAccess === false) throw new ForbiddenException('Acesso ao Gerencial bloqueado pela politica da equipe.');
      return;
    }
    if (manageAccess === true) return;
    throw new ForbiddenException('Acesso restrito ao responsavel da equipe.');
  }

  private async buildModules(target: any): Promise<TeamPolicyModule[]> {
    const rows = await this.modulesService.listMyModules(Number(target.id)).catch(() => []);
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      key: String(row?.key || '').trim(),
      name: row?.name || null,
      allowed: Boolean(row?.userAllowed ?? row?.accessible),
      accessible: Boolean(row?.accessible),
      visible: row?.visible === undefined ? Boolean(row?.accessible) : Boolean(row.visible),
      source: 'module_service' as const,
    })).filter((row) => row.key);
  }

  private async buildUsageLimits(target: any) {
    const companyId = Math.trunc(Number(target?.companyId || 0));
    if (!companyId) {
      return {
        usage: null as any,
        activeCards: null as any,
      };
    }

    const [usage, activeCards] = await Promise.all([
      this.commercialUsageLimits.getUsageSnapshot(companyId, Number(target.id)).catch(() => null),
      this.commercialUsageLimits.getSellerActiveCardQuotaSnapshot(companyId, Number(target.id)).catch(() => null),
    ]);
    return { usage, activeCards };
  }

  private buildVendasPullLimit(input: { usage: any; activeCards: any }): TeamPolicyLimit {
    const candidates = [
      this.finiteLimit(input.usage?.cards?.dailyRemaining),
      this.finiteLimit(input.usage?.cards?.monthlyRemaining),
      this.finiteLimit(input.activeCards?.availableSlots),
    ].filter((value): value is number => typeof value === 'number');
    if (!candidates.length) {
      return this.buildLimit({
        value: UNLIMITED_NUMERIC_SENTINEL,
        source: 'not_persisted_yet',
        forceMode: 'unlimited',
      });
    }
    return this.buildLimit({
      value: Math.min(...candidates),
      source: 'not_persisted_yet',
    });
  }

  private buildVisibility(requester: any, storedPolicy?: any): TeamPolicyVisibility {
    const actorKind = this.getActorKind(requester, requester?.company);
    const master = actorKind === 'system_master';
    const admin = actorKind === 'company_admin';
    return {
      ...this.parseVisibilityJson(storedPolicy?.visibilityJson),
      adminCanEditLegacyFields: admin || master,
      masterCanUseUnlimited: master,
    };
  }

  private async buildPolicy(target: any, requester: any): Promise<TeamPolicy> {
    const [{ usage, activeCards }, modules] = await Promise.all([
      this.buildUsageLimits(target),
      this.buildModules(target),
    ]);
    const targetRole = this.normalizeRole(target?.role);
    const targetKind = this.getActorKind(target, target?.company);
    const sellerNetwork = targetRole === 'USER' && Boolean(target?.company && isTenantCompany(target.company));
    const activeCardsFallback = this.buildLimit({
      value: activeCards?.effectiveLimit ?? UNLIMITED_NUMERIC_SENTINEL,
      used: activeCards?.activeCount,
      remaining: activeCards?.availableSlots,
      source: 'active_card_quota',
      forceMode: activeCards?.seller === false ? 'unlimited' : undefined,
    });
    const cardDeliveryFallback = this.buildLimit({
      value: usage?.cards?.dailySafetyLimit ?? UNLIMITED_NUMERIC_SENTINEL,
      used: usage?.cards?.dailyUsed,
      remaining: usage?.cards?.dailyRemaining,
      resetAt: usage?.dailyResetAt || null,
      source: 'usage_snapshot',
    });
    const monthlyCardsFallback = this.buildLimit({
      value: usage?.cards?.monthlyLimit ?? UNLIMITED_NUMERIC_SENTINEL,
      used: usage?.cards?.monthlyUsed,
      remaining: usage?.cards?.monthlyRemaining,
      resetAt: usage?.resetAt || null,
      source: 'usage_snapshot',
    });
    const vendasPullFallback = this.buildVendasPullLimit({ usage, activeCards });
    const storedPolicy = target?.teamPolicy || null;
    const storedReferrer = storedPolicy?.referredByUser || target.referredByUser;
    const effectiveAccessMap = this.buildEffectiveAccessMap(target, modules, storedPolicy);

    return {
      version: 1,
      subject: {
        id: Number(target.id),
        companyId: Number(target.companyId || 0) || null,
        role: targetRole,
        kind: targetKind,
        isSystemMaster: Boolean(target.isSystemMaster),
        isActive: Boolean(target.isActive && !target.deactivatedAt),
        name: target.name || null,
        email: target.email || null,
        username: target.username || null,
      },
      modules,
      accessCatalog: getTeamAccessCatalog(),
      accessGroups: getTeamAccessGroups(),
      accessPresets: getTeamAccessPresets(),
      access: effectiveAccessMap,
      effectiveAccessMap,
      missingBackendEnforcement: listMissingBackendEnforcement(effectiveAccessMap),
      compensation: {
        commissionPercent: Math.max(0, Math.min(100, Number(storedPolicy?.commissionPercent ?? target.commissionPercent ?? 0) || 0)),
        commissionDueBusinessDays: Math.max(
          0,
          Math.min(30, Math.trunc(Number(storedPolicy?.commissionDueBusinessDays ?? target.company?.commissionDueBusinessDays ?? 3) || 3)),
        ),
      },
      sellerNetwork: {
        isSellerNetwork: sellerNetwork,
        canRecruitSellers: Boolean(storedPolicy?.canRegisterHbxSellers ?? target.canRegisterHbxSellers),
        sellerReferralCommissionPercent: Math.max(0, Math.min(100, Number(storedPolicy?.sellerReferralCommissionPercent ?? target.sellerReferralCommissionPercent ?? 0) || 0)),
        referredByUserId: Number(storedPolicy?.referredByUserId ?? target.referredByUserId ?? 0) || null,
        referredByCommissionPercentSnapshot: Math.max(0, Math.min(100, Number(storedPolicy?.referredByCommissionPercentSnapshot ?? target.referredByCommissionPercentSnapshot ?? 0) || 0)),
        referredByUser: storedReferrer
          ? {
              id: Number(storedReferrer.id),
              name: storedReferrer.name || null,
              username: storedReferrer.username || null,
              email: storedReferrer.email || null,
            }
          : null,
      },
      limits: {
        cardDeliveryDaily: this.applyStoredLimit(storedPolicy, 'cardDeliveryDailyMode', 'cardDeliveryDailyLimit', cardDeliveryFallback),
        activeCards: this.applyStoredLimit(storedPolicy, 'activeCardsMode', 'activeCardsLimit', activeCardsFallback),
        monthlyCards: this.applyStoredLimit(storedPolicy, 'monthlyCardsMode', 'monthlyCardsLimit', monthlyCardsFallback),
        vendasPullQuantity: this.applyStoredLimit(storedPolicy, 'vendasPullQuantityMode', 'vendasPullQuantityLimit', vendasPullFallback),
      },
      radar: {
        allowedSegments: this.parseStringArrayJson(storedPolicy?.allowedSegmentsJson),
        blockedSegments: this.parseStringArrayJson(storedPolicy?.blockedSegmentsJson),
        allowedCities: this.parseCitiesJson(storedPolicy?.allowedCitiesJson),
        allowedStates: this.parseStringArrayJson(storedPolicy?.allowedStatesJson),
        requiresLocation: storedPolicy?.requiresLocation === null || storedPolicy?.requiresLocation === undefined
          ? false
          : Boolean(storedPolicy.requiresLocation),
        requiredChannels: this.parseRequiredChannelsJson(storedPolicy?.requiredChannelsJson),
      },
      visibility: this.buildVisibility(requester, storedPolicy),
      persistence: {
        mode: storedPolicy ? 'persisted_with_legacy_fallback' : 'legacy_derived',
        policyId: storedPolicy?.id || null,
        presetId: storedPolicy?.presetId || null,
        source: storedPolicy?.source || null,
        persistedFields: [
          'UserTeamPolicy.modulesJson',
          'UserTeamPolicy.commissionPercent',
          'UserTeamPolicy.commissionDueBusinessDays',
          'UserTeamPolicy.sellerNetwork',
          'UserTeamPolicy.cardDeliveryDaily',
          'UserTeamPolicy.activeCards',
          'UserTeamPolicy.monthlyCards',
          'UserTeamPolicy.vendasPullQuantity',
          'UserTeamPolicy.radarFilters',
          'UserTeamPolicy.visibility',
          'UserTeamPolicy.accessMap',
          'User.commissionPercent',
          'User.canRecruitSellers (stored as canRegisterHbxSellers)',
          'User.sellerReferralCommissionPercent',
          'User.referredByUserId',
          'User.referredByCommissionPercentSnapshot',
        ],
        pendingSchemaFields: storedPolicy ? [] : TEAM_POLICY_PENDING_SCHEMA_FIELDS,
      },
    };
  }

  async getMyPolicy(requester: any) {
    const target = await this.findTargetUser(Number(requester?.id));
    this.assertCanRead(requester, target);
    return this.buildPolicy(target, requester);
  }

  async getPolicy(requester: any, targetUserId: number) {
    const target = await this.findTargetUser(targetUserId);
    this.assertCanRead(requester, target);
    return this.buildPolicy(target, requester);
  }

  async listPolicies(requester: any) {
    const requesterCompanyId = Math.trunc(Number(requester?.companyId || 0));
    const requesterRole = this.normalizeRole(requester?.role);
    if (!requester?.isSystemMaster && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito ao responsavel da equipe.');
    }
    if (!requesterCompanyId) throw new ForbiddenException('Contexto de empresa obrigatorio.');

    const users = await this.prisma.user.findMany({
      where: {
        companyId: requesterCompanyId,
        isSystemMaster: false,
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const policies = await Promise.all(users.map((user) => this.getPolicy(requester, user.id)));
    return { items: policies, total: policies.length };
  }

  private async validateSellerNetworkData(target: any, data: any) {
    const targetRole = this.normalizeRole(target?.role);
    const meaningful = Boolean(
      data.canRegisterHbxSellers ||
        Number(data.sellerReferralCommissionPercent || 0) > 0 ||
        Number(data.referredByUserId || 0) > 0 ||
        Number(data.referredByCommissionPercentSnapshot || 0) > 0,
    );
    if (targetRole !== 'USER') {
      if (meaningful) throw new BadRequestException('Rede de indicação só pode ser configurada para vendedor.');
      data.canRegisterHbxSellers = false;
      data.sellerReferralCommissionPercent = 0;
      data.referredByUserId = null;
      data.referredByCommissionPercentSnapshot = 0;
      return;
    }
  }

  private async applyReferrer(target: any, data: any, referredByUserId: number | null | undefined) {
    if (referredByUserId === undefined) return;
    if (referredByUserId === null) {
      data.referredByUserId = null;
      data.referredByCommissionPercentSnapshot = 0;
      return;
    }
    if (referredByUserId === Number(target.id)) {
      throw new BadRequestException('Um vendedor nao pode indicar a si mesmo.');
    }
    const referrer = await this.prisma.user.findFirst({
      where: {
        id: referredByUserId,
        companyId: Number(target.companyId),
        role: 'USER',
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
      },
      select: {
        id: true,
        sellerReferralCommissionPercent: true,
      },
    });
    if (!referrer) throw new BadRequestException('Indicador precisa ser vendedor ativo da empresa.');
    const referralPercent = this.normalizePercent(referrer.sellerReferralCommissionPercent, 'Comissao de heranca') ?? 0;
    data.referredByUserId = referrer.id;
    data.sellerReferralCommissionPercent = referralPercent;
    data.referredByCommissionPercentSnapshot = referralPercent;
  }

  private async buildLegacyUpdateData(requester: any, target: any, patch: TeamPolicyPatch) {
    const data: any = {};
    const compensation = patch?.compensation || {};
    const sellerNetwork = patch?.sellerNetwork || {};

    const commissionPercent = this.normalizePercent(compensation.commissionPercent, 'Comissao');
    if (commissionPercent !== undefined) data.commissionPercent = commissionPercent;

    const canRecruitSellers = this.normalizeBoolean(sellerNetwork.canRecruitSellers);
    if (canRecruitSellers !== undefined) data.canRegisterHbxSellers = canRecruitSellers;

    const sellerReferralCommissionPercent = this.normalizePercent(
      sellerNetwork.sellerReferralCommissionPercent,
      'Comissao de heranca',
    );
    if (sellerReferralCommissionPercent !== undefined) {
      data.sellerReferralCommissionPercent = sellerReferralCommissionPercent;
    }

    const referredByUserId = this.normalizePositiveId(sellerNetwork.referredByUserId, 'Indicador');
    await this.applyReferrer(target, data, referredByUserId);

    const snapshotPercent = this.normalizePercent(
      sellerNetwork.referredByCommissionPercentSnapshot,
      'Comissao de heranca',
    );
    if (snapshotPercent !== undefined && data.referredByUserId === undefined) {
      data.referredByCommissionPercentSnapshot = snapshotPercent;
    }

    await this.validateSellerNetworkData(target, data);
    return data;
  }

  private buildPolicyStorageUpdateData(requester: any, target: any, patch: TeamPolicyPatch) {
    const data: any = {};
    const compensation = patch?.compensation || {};
    const sellerNetwork = patch?.sellerNetwork || {};
    const limits = patch?.limits || {};
    const preset = resolveTeamAccessPreset(this.resolveAccessPresetKey(patch));
    const effectiveLimits = {
      ...(preset?.limits || {}),
      ...limits,
    };
    const radar = patch?.radar || {};
    const visibility = this.normalizeVisibilityPatch(patch?.visibility);
    const accessUpdate = this.buildStoredAccessUpdate(target?.teamPolicy, patch || {});

    const commissionPercent = this.normalizePercent(compensation.commissionPercent, 'Comissao');
    if (commissionPercent !== undefined) data.commissionPercent = commissionPercent;

    const commissionDueBusinessDays = this.normalizeBusinessDays(compensation.commissionDueBusinessDays);
    if (commissionDueBusinessDays !== undefined) data.commissionDueBusinessDays = commissionDueBusinessDays;

    const canRecruitSellers = this.normalizeBoolean(sellerNetwork.canRecruitSellers);
    if (canRecruitSellers !== undefined) data.canRegisterHbxSellers = canRecruitSellers;

    const sellerReferralCommissionPercent = this.normalizePercent(
      sellerNetwork.sellerReferralCommissionPercent,
      'Comissao de heranca',
    );
    if (sellerReferralCommissionPercent !== undefined) {
      data.sellerReferralCommissionPercent = sellerReferralCommissionPercent;
    }

    const referredByUserId = this.normalizePositiveId(sellerNetwork.referredByUserId, 'Indicador');
    if (referredByUserId !== undefined) data.referredByUserId = referredByUserId;

    const snapshotPercent = this.normalizePercent(
      sellerNetwork.referredByCommissionPercentSnapshot,
      'Comissao de heranca',
    );
    if (snapshotPercent !== undefined) data.referredByCommissionPercentSnapshot = snapshotPercent;

    if (effectiveLimits.cardDeliveryDaily !== undefined) {
      Object.assign(data, this.toStoredLimitFields('cardDeliveryDaily', effectiveLimits.cardDeliveryDaily, Boolean(requester?.isSystemMaster)));
    }
    if (effectiveLimits.activeCards !== undefined) {
      Object.assign(data, this.toStoredLimitFields('activeCards', effectiveLimits.activeCards, Boolean(requester?.isSystemMaster)));
    }
    if (effectiveLimits.monthlyCards !== undefined) {
      Object.assign(data, this.toStoredLimitFields('monthlyCards', effectiveLimits.monthlyCards, Boolean(requester?.isSystemMaster)));
    }
    if (effectiveLimits.vendasPullQuantity !== undefined) {
      Object.assign(data, this.toStoredLimitFields('vendasPullQuantity', effectiveLimits.vendasPullQuantity, Boolean(requester?.isSystemMaster)));
    }

    if (radar.allowedSegments !== undefined) {
      data.allowedSegmentsJson = JSON.stringify(this.normalizeTextList(radar.allowedSegments));
    }
    if (radar.blockedSegments !== undefined) {
      data.blockedSegmentsJson = JSON.stringify(this.normalizeTextList(radar.blockedSegments));
    }
    if (radar.allowedCities !== undefined) {
      data.allowedCitiesJson = JSON.stringify(this.normalizeCityList(radar.allowedCities));
    }
    if (radar.allowedStates !== undefined) {
      data.allowedStatesJson = JSON.stringify(this.normalizeTextList(radar.allowedStates).map((item) => item.toUpperCase()));
    }
    if (radar.requiresLocation !== undefined) {
      data.requiresLocation = this.normalizeBoolean(radar.requiresLocation);
    }
    const requiredChannels = this.normalizeRequiredChannels(radar.requiredChannels);
    if (requiredChannels !== undefined) {
      data.requiredChannelsJson = JSON.stringify(requiredChannels);
    }
    if (visibility !== undefined) {
      data.visibilityJson = JSON.stringify({
        ...this.parseVisibilityJson(target?.teamPolicy?.visibilityJson),
        ...visibility,
      });
    }
    if (accessUpdate !== undefined) {
      data.modulesJson = serializeTeamPolicyModuleAndAccessRows({
        modules: this.storedModuleRowsFromPolicy(target?.teamPolicy, patch),
        access: accessUpdate,
      });
    }
    if (preset?.key) {
      data.source = `team_policy_preset:${preset.key}`;
    }

    if (Object.keys(data).length) {
      data.source = data.source || 'team_policy_update';
    }
    return data;
  }

  private sanitizeAuditPatch(patch: TeamPolicyPatch) {
    return {
      hasModules: Array.isArray(patch?.modules),
      moduleCount: Array.isArray(patch?.modules) ? patch.modules.length : 0,
      hasCompensation: Boolean(patch?.compensation && Object.keys(patch.compensation).length),
      hasSellerNetwork: Boolean(patch?.sellerNetwork && Object.keys(patch.sellerNetwork).length),
      hasLimits: Boolean(patch?.limits && Object.keys(patch.limits).length),
      hasRadar: Boolean(patch?.radar && Object.keys(patch.radar).length),
      hasVisibility: Boolean(patch?.visibility && Object.keys(patch.visibility).length),
      hasAccess: Boolean(
        (patch?.access && Object.keys(patch.access).length) ||
          (patch?.accessMap && Object.keys(patch.accessMap).length) ||
          this.resolveAccessPresetKey(patch),
      ),
      accessPresetKey: this.resolveAccessPresetKey(patch),
      batch: Boolean((patch as any)?.audit?.batch),
      batchId: (patch as any)?.audit?.batchId ? String((patch as any).audit.batchId).slice(0, 120) : null,
      sourceUserId: Math.trunc(Number((patch as any)?.audit?.sourceUserId || 0)) || null,
    };
  }

  private buildPolicyAuditSnapshot(policy: TeamPolicy) {
    const modules = Object.fromEntries(
      (policy.modules || [])
        .map((moduleItem) => [String(moduleItem.key || '').trim(), Boolean(moduleItem.allowed)])
        .filter(([key]) => Boolean(key)),
    );
    const limits = Object.fromEntries(
      Object.entries(policy.limits || {}).map(([key, limit]) => [
        key,
        {
          mode: limit.mode,
          value: limit.value,
          used: limit.used ?? null,
          remaining: limit.remaining ?? null,
          source: limit.source,
        },
      ]),
    );
    return {
      subject: {
        id: policy.subject.id,
        companyId: policy.subject.companyId,
        role: policy.subject.role,
        kind: policy.subject.kind,
        isSystemMaster: policy.subject.isSystemMaster,
        isActive: policy.subject.isActive,
      },
      modules,
      access: policy.effectiveAccessMap || policy.access || {},
      compensation: policy.compensation,
      sellerNetwork: {
        canRecruitSellers: policy.sellerNetwork.canRecruitSellers,
        sellerReferralCommissionPercent: policy.sellerNetwork.sellerReferralCommissionPercent,
        referredByUserId: policy.sellerNetwork.referredByUserId,
        referredByCommissionPercentSnapshot: policy.sellerNetwork.referredByCommissionPercentSnapshot,
      },
      limits,
      radar: policy.radar,
      visibility: policy.visibility,
      missingBackendEnforcement: policy.missingBackendEnforcement || [],
      persistence: {
        mode: policy.persistence.mode,
        policyId: policy.persistence.policyId,
        source: policy.persistence.source,
      },
    };
  }

  private diffObjectKeys(before: Record<string, any>, after: Record<string, any>) {
    const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})])).sort();
    return keys
      .filter((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null))
      .map((key) => ({
        key,
        before: before?.[key] ?? null,
        after: after?.[key] ?? null,
      }));
  }

  private buildPolicyAuditDiff(before: ReturnType<TeamPolicyService['buildPolicyAuditSnapshot']>, after: ReturnType<TeamPolicyService['buildPolicyAuditSnapshot']>) {
    return {
      modulesChanged: this.diffObjectKeys(before.modules, after.modules),
      accessChanged: this.diffObjectKeys(before.access, after.access),
      limitsChanged: this.diffObjectKeys(before.limits, after.limits),
      compensationChanged: JSON.stringify(before.compensation) !== JSON.stringify(after.compensation),
      sellerNetworkChanged: JSON.stringify(before.sellerNetwork) !== JSON.stringify(after.sellerNetwork),
      radarChanged: JSON.stringify(before.radar) !== JSON.stringify(after.radar),
      visibilityChanged: JSON.stringify(before.visibility) !== JSON.stringify(after.visibility),
    };
  }

  private async writePolicyAuditLog(input: {
    requester: any;
    target: any;
    before: TeamPolicy;
    after: TeamPolicy;
    patch: TeamPolicyPatch;
  }) {
    const actorUserId = Math.trunc(Number(input.requester?.id || 0));
    const targetUserId = Math.trunc(Number(input.target?.id || input.after.subject.id || 0));
    if (!actorUserId || !targetUserId) return;

    const before = this.buildPolicyAuditSnapshot(input.before);
    const after = this.buildPolicyAuditSnapshot(input.after);
    const diff = this.buildPolicyAuditDiff(before, after);
    const patchSummary = this.sanitizeAuditPatch(input.patch || {});
    const companyId = Number(input.after.subject.companyId || input.target?.companyId || 0) || null;
    const metadata = {
      actor: {
        userId: actorUserId,
        role: this.normalizeRole(input.requester?.role),
        isSystemMaster: Boolean(input.requester?.isSystemMaster),
      },
      companyId,
      targetUserId,
      target: after.subject,
      before,
      after,
      diff,
      patch: patchSummary,
      batch: patchSummary.batch,
      modulesChanged: diff.modulesChanged.map((item) => item.key),
      accessChanged: diff.accessChanged.map((item) => item.key),
      limitsChanged: diff.limitsChanged.map((item) => item.key),
    };
    const metadataJson = JSON.stringify(metadata);
    const action = patchSummary.batch ? 'TEAM_POLICY_BATCH_UPDATED' : 'TEAM_POLICY_UPDATED';

    try {
      await this.prisma.$executeRaw`
        INSERT INTO "TeamPolicyAuditLog"
        ("id", "actorUserId", "companyId", "targetUserId", "action", "severity", "route", "metadata", "createdAt")
        VALUES (
          ${randomUUID()},
          ${actorUserId},
          ${companyId},
          ${targetUserId},
          ${action},
          ${'INFO'},
          ${'/team/policy/:userId'},
          ${metadataJson},
          ${new Date()}
        )
      `;
    } catch (error) {
      console.warn('[HBX team-policy] Falha ao gravar TeamPolicyAuditLog.', error);
    }

    if (!input.requester?.isSystemMaster) return;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "MasterSupportAuditLog"
        ("id", "masterUserId", "companyId", "assumedContextSessionId", "scope", "action", "severity", "route", "metadata", "createdAt")
        VALUES (
          ${randomUUID()},
          ${actorUserId},
          ${companyId},
          ${null},
          ${'team_policy'},
          ${action},
          ${'INFO'},
          ${'/team/policy/:userId'},
          ${metadataJson},
          ${new Date()}
        )
      `;
    } catch (error) {
      console.warn('[HBX team-policy] Falha ao gravar MasterSupportAuditLog.', error);
    }
  }

  async updatePolicy(requester: any, targetUserId: number, patch: TeamPolicyPatch) {
    const target = await this.findTargetUser(targetUserId);
    await this.assertCanManage(requester, target);

    // RBAC Sprint 1: aplicar preset de acesso exige team.access.applyPreset.
    // So dispara quando um preset valido e pedido. Master nunca e bloqueado
    // (assertCanManage ja retorna cedo para o system_master).
    if (!requester?.isSystemMaster && this.resolveAccessPresetKey(patch)) {
      const requesterPolicy = await loadUserTeamPolicyRuntime(this.prisma, requester?.id).catch(() => null);
      if (resolveTeamPolicyAccessAllowed(requesterPolicy, 'team.access.applyPreset') === false) {
        throw new ForbiddenException('Aplicar preset de acesso esta bloqueado pela politica da equipe.');
      }
    }

    if (this.isGerente(requester)) {
      // S8/A2: acesso granular (patch.access/accessMap) SAIU do bloqueio bruto —
      // gerente pode conceder chave de acesso, mas so dentro do proprio mapa
      // (subset-delegation, verificado logo abaixo). Preset continua exclusivo
      // do responsavel (atalho concede pacote inteiro, nao passa pela interseção
      // chave-a-chave); cobranca/limites/rede/radar/visibilidade seguem exclusivos.
      const hasNonModulePatch =
        patch?.accessPresetKey !== undefined ||
        patch?.presetKey !== undefined ||
        patch?.presetId !== undefined ||
        patch?.compensation !== undefined ||
        patch?.sellerNetwork !== undefined ||
        patch?.limits !== undefined ||
        patch?.radar !== undefined ||
        patch?.visibility !== undefined;
      if (hasNonModulePatch) {
        throw new ForbiddenException(
          'Gerente pode conceder apenas módulos e acessos — cobrança, limites e presets são exclusivos do responsável.',
        );
      }
    }

    // S8/A2 — subset-delegation: quem concede so pode LIGAR (allowed=true) chave
    // de acesso que ELE MESMO tem no mapa efetivo (grant ⊆ granter). Dono/master
    // sao raiz da arvore (concedem tudo, sem interseção). DESLIGAR (false) e
    // sempre livre — remover acesso nao exige que o concedente tenha a chave.
    const requesterKind = resolveActorKind(requester);
    const isRootGranter = Boolean(requester?.isSystemMaster) || requesterKind === 'dono';
    const accessPatch = this.normalizeAccessPatch(patch?.access ?? patch?.accessMap);
    if (accessPatch && !isRootGranter) {
      const granterAccessMap = await this.resolveGranterAccessMap(requester);
      const deniedKeys = Object.entries(accessPatch)
        .filter(([key, allowed]) => allowed === true && !hasTeamAccess(granterAccessMap, key))
        .map(([key]) => key);
      if (deniedKeys.length) {
        throw new ForbiddenException(
          `Você não pode conceder acesso que não possui: ${deniedKeys.sort().join(', ')}.`,
        );
      }
    }

    const beforePolicy = await this.buildPolicy(target, requester);

    const data = await this.buildLegacyUpdateData(requester, target, patch || {});
    const policyData = this.buildPolicyStorageUpdateData(requester, target, patch || {});
    if (Array.isArray(patch?.modules) && patch.modules.length) {
      await this.modulesService.updateCompanyUserModuleAccess(
        Number(requester.id),
        Number(target.id),
        patch.modules
          .map((moduleItem) => ({
            key: String(moduleItem?.key || '').trim(),
            allowed: Boolean(moduleItem?.allowed),
          }))
          .filter((moduleItem) => moduleItem.key),
      );
    }

    if (Object.keys(data).length) {
      await this.prisma.user.update({
        where: { id: Number(target.id) },
        data,
      });
    }

    await ensureUserTeamPolicyForUser(this.prisma, target.id, { source: 'team_policy_update', overwrite: false });
    if (Object.keys(policyData).length) {
      await this.prisma.userTeamPolicy.update({
        where: { userId: Number(target.id) },
        data: policyData,
      });
    }

    const afterPolicy = await this.getPolicy(requester, Number(target.id));
    await this.writePolicyAuditLog({
      requester,
      target,
      before: beforePolicy,
      after: afterPolicy,
      patch: patch || {},
    });
    return afterPolicy;
  }
}
