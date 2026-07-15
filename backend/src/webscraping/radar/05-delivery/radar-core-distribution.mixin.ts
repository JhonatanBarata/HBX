// @ts-nocheck
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  randomUUID,
  XLSX,
  probeWebscrapingRuntime,
  buildHbxPresentationEmailDraft,
  buildLocalHbxEngineUrls,
  getConfiguredHbxEngineCount,
  isHbxEngineLocalhostUrl,
  COMMERCIAL_PLAN_QUOTAS,
  COMMERCIAL_PLAN_KEYS,
  GOOGLE_DAILY_LIMIT_REACHED_MESSAGE,
  resolveCommercialPlanKeyForCapabilities,
  buildRadarLeadEnrichment,
  RADAR_LEAD_ENRICHMENT_VERSION,
  calculateLeadQualityV2,
  resolveRadarVisibilityFromQualityV2,
  PLACES_NEW_TEXT_SEARCH_URL,
  PLACES_NEW_DETAILS_URL,
  PLACES_TEXT_SEARCH_URL,
  PLACES_DETAILS_URL,
  MAX_QUANTITY,
  HBX_PJ_MAX_QUANTITY,
  HBX_PEOPLE_MAX_QUANTITY,
  DEFAULT_HBX_SCRAPING_ENGINE_URL,
  GLOBAL_CACHE_TTL_HOURS,
  RECENT_HISTORY_LIMIT,
  IBGE_CITIES_URL,
  CITY_CACHE_TTL_MS,
  MASS_DATA_INTERNAL_SEGMENTS,
  ACRE_CITIES_FALLBACK,
  AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK,
  AUTONOMOUS_MASS_DATA_DEFAULT_TASKS,
  AUTONOMOUS_MASS_DATA_MAX_TASKS,
  DEFAULT_MASS_DATA_ENGINE_URLS,
  TURBO_OPERATIONAL_CONFIG_KEY,
  RADAR_RESERVATION_TTL_MS,
  RADAR_REGION_MAX_RADIUS_KM,
  RADAR_PROTECTED_STATUSES,
  isGlobalBlockStatus,
  SEGMENT_STOPWORDS,
  SEGMENT_ALIASES,
  HBX_CATEGORY_SEGMENTS,
  GENERIC_DIRECTORY_NAMES,
  GENERIC_DIRECTORY_PREFIXES,
  GENERIC_DIRECTORY_CONTAINS,
  GENERIC_CATEGORY_HEADS,
  VERTICAL_TOKEN_GROUPS,
  GooglePlacesApiError,
  HbxBatchError,
  normalizePhoneDigits,
  isLikelyValidBrPhone,
  isLikelyWhatsapp,
  toNumberOrNull,
  clampQuantity,
  normalizeLookupValue,
  normalizeWebsiteKey,
  RADAR_THIRD_PARTY_SOCIAL_PROFILE_HINTS,
  normalizeSocialProfileKey,
  looksLikeThirdPartySocialProfile,
  RADAR_SOCIAL_BLOCKED_PATH_PARTS,
  RADAR_SOCIAL_CATEGORY_TOKENS,
  RADAR_SOCIAL_STOP_TOKENS,
  RADAR_SOCIAL_WEAK_TOKENS,
  RADAR_WEBSITE_GENERIC_HOST_TOKENS,
  socialHandleFromUrl,
  cityInitialsKey,
  socialTokenVariants,
  socialCategoryTokenVariants,
  hasTrustedEngineSocialSignal,
  socialProfileLooksCompatibleWithLead,
  getWebsiteHost,
  websiteHostLooksCompatibleWithLead,
  inferWebsiteStatus,
  RADAR_BAD_EMAIL_LOCAL_PARTS,
  RADAR_BAD_EMAIL_DOMAINS,
  RADAR_BAD_EMAIL_TLDS,
  normalizeBusinessEmail,
  parseJsonArray,
  parseJsonObject,
  isFallbackEligible,
  coerceBoolean,
  normalizeEngine,
  normalizeEnginePurpose,
  isAutomaticEnginePurpose,
  normalizeTargetType,
  parsePositiveInteger,
  maxQuantityFor,
  safeInteger,
  clampInteger,
  parsePositiveIntegerEnv,
  minutesAgo,
  formatCityWithState,
} from '../radar-core-method-imports';
import {
  TEAM_POLICY_UNLIMITED_LIMIT,
  resolveTeamPolicyStoredLimit,
} from '../../../team/team-policy-persistence';

import type {
  AutonomousMassDataCandidate,
  AutonomousMassDataStrategyMode,
  AutonomousMassDataWork,
  AutonomousMassDataWorkReason,
  ExternalRuntimeStatus,
  GlobalCacheRow,
  HbxBatchStatus,
  HbxDeliveryClassification,
  HbxDeliveryProduct,
  HbxEngineLease,
  HbxEnginePurpose,
  HbxEngineSearchOutput,
  HbxRuntimeDiagnostic,
  HistoryPlaceColumnSupport,
  HbxTargetType,
  HbxVisibilityTier,
  LeadQualityResult,
  LeadQualityStatus,
  LeadQualityV2,
  LeadQualityV2SalesProfile,
  MasterMassDataCampaignInput,
  NativeRuntimeDiagnostic,
  NormalizedRadarFilters,
  NormalizedSearchInput,
  NormalizeSearchInputOptions,
  PlaceDetails,
  RadarCampaignInput,
  RadarChannelFilter,
  RadarChannelMatchMode,
  RadarFiltersInput,
  RadarLeadEventType,
  RadarLeadStatus,
  RadarOperationalState,
  RadarOpportunityLevel,
  RadarSearchRunMetrics,
  RadarSearchRunMetricsPatch,
  RadarWebsiteStatus,
  RadarWhatsappCheckMode,
  RadarWhatsappCheckStatus,
  RegionalCity,
  RuntimeStatus,
  SearchContactsInput,
  SearchExecutionContext,
  SearchExecutionOptions,
  SearchHistoryRow,
  SearchPlacesCandidate,
  SearchRunStatus,
  SearchSource,
  UsageEventType,
  UsageExecutionMeta,
  WebscrapingContactResult,
  WebscrapingEngine,
  WebscrapingHistorySummary,
  WebscrapingOperationalConfigInput,
  WebscrapingRuntimeDiagnostic,
  WebscrapingRuntimeResponse,
  WebscrapingSearchFilters,
  WebscrapingSearchResponse,
  WebscrapingSearchRunItemStatus,
  WebscrapingSearchRunResponse,
  WebscrapingSearchRunStatus,
} from '../radar-core-method-imports';

export class RadarCoreDistributionMixin {
  [key: string]: any;
  private normalizeRadarAutoDistributionStatus(value: unknown, fallback = 'draft') {
    const status = String(value || fallback || 'draft').trim().toLowerCase();
    return ['draft', 'active', 'paused'].includes(status) ? status : 'draft';
  }

  private normalizeRadarAutoDistributionText(value: unknown, maxLength = 120) {
    const text = String(value || '').trim();
    return text ? text.slice(0, maxLength) : null;
  }

  private normalizeRadarAutoDistributionInt(value: unknown, fallback: number, min: number, max: number) {
    const numeric = Math.trunc(Number(value));
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  }

  private getSaoPauloDayKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private getSaoPauloDayBounds(dayKey = this.getSaoPauloDayKey()) {
    const [year, month, day] = String(dayKey || '').split('-').map((part) => Math.trunc(Number(part || 0)));
    const startUtc = new Date(Date.UTC(year || 1970, Math.max(0, (month || 1) - 1), day || 1, 3, 0, 0, 0));
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
    return { start: startUtc, end: endUtc };
  }

  private normalizeDailyDistributionLimit(value: unknown, fallback = 20) {
    return this.normalizeRadarAutoDistributionInt(value, fallback, 0, TEAM_POLICY_UNLIMITED_LIMIT);
  }

  private isSellerDistributionPaused(seller: any) {
    const mode = String(seller?.sellerDistributionMode || '').trim().toLowerCase();
    if (mode !== 'paused') return false;
    const pausedUntil = seller?.sellerDistributionPausedUntil instanceof Date
      ? seller.sellerDistributionPausedUntil
      : seller?.sellerDistributionPausedUntil
        ? new Date(seller.sellerDistributionPausedUntil)
        : null;
    return !pausedUntil || Number.isNaN(pausedUntil.getTime()) || pausedUntil.getTime() > Date.now();
  }

  private resolveSellerDistributionDailyLimit(seller: any, fallback: number) {
    const policyLimit = resolveTeamPolicyStoredLimit(seller?.teamPolicy, 'cardDeliveryDaily');
    if (policyLimit.applies) {
      return policyLimit.mode === 'unlimited'
        ? TEAM_POLICY_UNLIMITED_LIMIT
        : this.normalizeDailyDistributionLimit(policyLimit.limit, fallback);
    }
    const rawOverride = seller?.sellerDistributionDailyLimitOverride;
    if (rawOverride === null || rawOverride === undefined) return this.normalizeDailyDistributionLimit(fallback, 20);
    return this.normalizeDailyDistributionLimit(rawOverride, fallback);
  }

  private sellerDistributionPriorityWeight(seller: any) {
    const mode = String(seller?.sellerDistributionMode || 'learning').trim().toLowerCase();
    if (mode === 'priority') return 0;
    if (mode === 'normal') return 1;
    if (mode === 'learning') return 2;
    return 3;
  }

  private async getDailyDistributionSnapshot(companyId: number, userId: number | null, dailyLimitRaw: unknown, dayKey = this.getSaoPauloDayKey()) {
    const dailyLimit = this.normalizeDailyDistributionLimit(dailyLimitRaw, 20);
    const { start, end } = this.getSaoPauloDayBounds(dayKey);
    const [assignedToday, usageRows] = await Promise.all([
      this.prisma.vendasLead.count({
        where: {
          companyId,
          assignedUserId: userId ? userId : null,
          assignedAt: { gte: start, lt: end },
        },
      }).catch(() => 0),
      userId
        ? this.prisma.$queryRaw<Array<{ deliveredCount?: number | null; lastSkipReason?: string | null }>>`
            SELECT "deliveredCount", "lastSkipReason"
            FROM "RadarDistributionDailyUsage"
            WHERE "companyId" = ${companyId}
              AND "userId" = ${userId}
              AND "dayKey" = ${dayKey}
            LIMIT 1
          `.catch(() => [])
        : this.prisma.$queryRaw<Array<{ deliveredCount?: number | null; lastSkipReason?: string | null }>>`
            SELECT "deliveredCount", "lastSkipReason"
            FROM "RadarDistributionDailyUsage"
            WHERE "companyId" = ${companyId}
              AND "userId" IS NULL
              AND "dayKey" = ${dayKey}
            ORDER BY "updatedAt" DESC
            LIMIT 1
          `.catch(() => []),
    ]);
    const usageDelivered = Math.max(0, Math.trunc(Number(usageRows?.[0]?.deliveredCount || 0) || 0));
    const deliveredToday = Math.max(assignedToday, usageDelivered);
    const remainingToday = Math.max(0, dailyLimit - deliveredToday);
    return {
      dayKey,
      dailyLimit,
      deliveredToday,
      remainingToday,
      blocked: remainingToday <= 0,
      reason: remainingToday <= 0 ? (dailyLimit <= 0 ? 'limite_diario_zero' : 'limite_diario_atingido') : null,
      lastSkipReason: usageRows?.[0]?.lastSkipReason || null,
    };
  }

  private async incrementDailyDistributionDelivery(companyId: number, userId: number | null, dailyLimitRaw: unknown, dayKey = this.getSaoPauloDayKey()) {
    const dailyLimit = this.normalizeDailyDistributionLimit(dailyLimitRaw, 20);
    const now = new Date();
    if (!userId) {
      const updated = await this.prisma.$executeRaw`
        UPDATE "RadarDistributionDailyUsage"
        SET
          "dailyLimit" = ${dailyLimit},
          "deliveredCount" = "deliveredCount" + 1,
          "lastDeliveryAt" = ${now},
          "updatedAt" = ${now}
        WHERE "companyId" = ${companyId}
          AND "userId" IS NULL
          AND "dayKey" = ${dayKey}
      `.catch(() => 0);
      if (updated) return;
      await this.prisma.$executeRaw`
        INSERT INTO "RadarDistributionDailyUsage" (
          "id", "companyId", "userId", "dayKey", "dailyLimit", "deliveredCount", "lastDeliveryAt", "createdAt", "updatedAt"
        )
        VALUES (${randomUUID()}, ${companyId}, NULL, ${dayKey}, ${dailyLimit}, 1, ${now}, ${now}, ${now})
      `.catch(() => null);
      return;
    }
    await this.prisma.$executeRaw`
      INSERT INTO "RadarDistributionDailyUsage" (
        "id", "companyId", "userId", "dayKey", "dailyLimit", "deliveredCount", "lastDeliveryAt", "createdAt", "updatedAt"
      )
      VALUES (${randomUUID()}, ${companyId}, ${userId}, ${dayKey}, ${dailyLimit}, 1, ${now}, ${now}, ${now})
      ON CONFLICT ("companyId", "userId", "dayKey")
      DO UPDATE SET
        "dailyLimit" = EXCLUDED."dailyLimit",
        "deliveredCount" = "RadarDistributionDailyUsage"."deliveredCount" + 1,
        "lastDeliveryAt" = EXCLUDED."lastDeliveryAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `.catch(() => null);
  }

  private async recordDailyDistributionSkip(
    companyId: number,
    userId: number | null,
    dailyLimitRaw: unknown,
    reason: string,
    dayKey = this.getSaoPauloDayKey(),
  ) {
    const dailyLimit = this.normalizeDailyDistributionLimit(dailyLimitRaw, 20);
    const now = new Date();
    if (!userId) {
      const updated = await this.prisma.$executeRaw`
        UPDATE "RadarDistributionDailyUsage"
        SET
          "dailyLimit" = ${dailyLimit},
          "skippedCount" = "skippedCount" + 1,
          "lastSkipReason" = ${reason},
          "updatedAt" = ${now}
        WHERE "companyId" = ${companyId}
          AND "userId" IS NULL
          AND "dayKey" = ${dayKey}
      `.catch(() => 0);
      if (updated) return;
      await this.prisma.$executeRaw`
        INSERT INTO "RadarDistributionDailyUsage" (
          "id", "companyId", "userId", "dayKey", "dailyLimit", "skippedCount", "lastSkipReason", "createdAt", "updatedAt"
        )
        VALUES (${randomUUID()}, ${companyId}, NULL, ${dayKey}, ${dailyLimit}, 1, ${reason}, ${now}, ${now})
      `.catch(() => null);
      return;
    }
    await this.prisma.$executeRaw`
      INSERT INTO "RadarDistributionDailyUsage" (
        "id", "companyId", "userId", "dayKey", "dailyLimit", "skippedCount", "lastSkipReason", "createdAt", "updatedAt"
      )
      VALUES (${randomUUID()}, ${companyId}, ${userId}, ${dayKey}, ${dailyLimit}, 1, ${reason}, ${now}, ${now})
      ON CONFLICT ("companyId", "userId", "dayKey")
      DO UPDATE SET
        "dailyLimit" = EXCLUDED."dailyLimit",
        "skippedCount" = "RadarDistributionDailyUsage"."skippedCount" + 1,
        "lastSkipReason" = EXCLUDED."lastSkipReason",
        "updatedAt" = EXCLUDED."updatedAt"
    `.catch(() => null);
  }

  private parseRadarAutoDistributionTargetIds(value: unknown) {
    if (!value) return [] as number[];
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.from(new Set(
        (Array.isArray(parsed) ? parsed : [])
          .map((id) => Math.trunc(Number(id || 0)))
          .filter((id) => Number.isInteger(id) && id > 0),
      ));
    } catch {
      return [];
    }
  }

  private radarAutoDistributionPayload(row: any, activeSellers: any[] = []) {
    const targetUserIds = this.parseRadarAutoDistributionTargetIds(row?.targetUserIdsJson);
    const targetSet = new Set(targetUserIds);
    const targetUsers = targetUserIds.length
      ? activeSellers.filter((seller) => targetSet.has(Number(seller.id || 0)))
      : activeSellers;
    const territories = this.parseRadarTerritories(row?.filtersJson);
    const territoryByUserId = new Map(territories.map((item) => [Number(item.userId || 0), item]));
    return {
      id: row?.id || null,
      scope: row?.scope || 'company',
      status: this.normalizeRadarAutoDistributionStatus(row?.status),
      includeAdmin: Boolean(row?.includeAdmin),
      adminUserId: Number(row?.adminUserId || 0) || null,
      adminTargetStock: Math.max(0, Math.trunc(Number(row?.adminTargetStock || 0) || 0)),
      targetStockPerSeller: Math.max(1, Math.trunc(Number(row?.targetStockPerSeller || 30) || 30)),
      adminDailyLimit: Math.max(0, Math.trunc(Number(row?.adminDailyLimit || 0) || 0)),
      dailyLimitPerSeller: Math.max(0, Math.trunc(Number(row?.dailyLimitPerSeller || 20) || 20)),
      preferredState: row?.preferredState || null,
      preferredCity: row?.preferredCity || null,
      segment: row?.segment || null,
      categoryKey: row?.categoryKey || null,
      radiusKm: row?.radiusKm == null ? null : Math.max(0, Math.trunc(Number(row.radiusKm || 0) || 0)),
      targetMode: targetUserIds.length ? 'selected_sellers' : 'all_active_sellers',
      territoryMode: territories.some((item) => item.cities.length > 0) ? 'fixed_cities' : 'open',
      territories,
      targetUserIds,
      targetUsers: targetUsers.map((seller) => ({
        id: Number(seller.id || 0),
        name: seller.name || seller.username || seller.email || `Vendedor ${seller.id}`,
        email: seller.email || null,
        phone: seller.phone || null,
        commissionPercent: Number(seller.commissionPercent || 0) || 0,
        territoryCities: territoryByUserId.get(Number(seller.id || 0))?.cities || [],
      })),
      filters: {
        state: row?.preferredState || null,
        city: row?.preferredCity || null,
        segment: row?.segment || null,
        categoryKey: row?.categoryKey || null,
        radiusKm: row?.radiusKm == null ? null : Math.max(0, Math.trunc(Number(row.radiusKm || 0) || 0)),
      },
      lastActivatedAt: row?.lastActivatedAt instanceof Date ? row.lastActivatedAt.toISOString() : null,
      lastRunAt: row?.lastRunAt instanceof Date ? row.lastRunAt.toISOString() : null,
      createdAt: row?.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    };
  }

  private async listActiveDistributionSellers(companyId: number, userIds?: number[]) {
    const sellers = await (this.prisma.user as any).findMany({
      where: {
        companyId,
        isActive: true,
        isSystemMaster: false,
        role: { in: ['USER', 'ADMIN'] },
        ...(Array.isArray(userIds) && userIds.length ? { id: { in: userIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        commissionPercent: true,
        sellerDistributionMode: true,
        sellerDistributionPausedUntil: true,
        sellerDistributionDailyLimitOverride: true,
        sellerDistributionNote: true,
        preferredSegmentsJson: true,
        teamPolicy: {
          select: {
            cardDeliveryDailyMode: true,
            cardDeliveryDailyLimit: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }, { id: 'asc' }],
    });
    return (sellers || [])
      .filter((seller: any) => !this.isSellerDistributionPaused(seller))
      .sort((a: any, b: any) => this.sellerDistributionPriorityWeight(a) - this.sellerDistributionPriorityWeight(b));
  }

  // VENDAS-REFAB S2: cerca do vendedor = território (já existente) + segmento
  // preferido (`User.preferredSegmentsJson`). Lê o mesmo campo que o Radar/Leads
  // já usa como BOOST (resolveRadarPreferenceSegments, 06-presentation) — nunca
  // filtro, nunca trava a empresa: vendedor sem preferência recebe do segmento
  // da regra normalmente; vendedor COM preferência é priorizado nela primeiro.
  private resolveSellerPreferredSegments(seller: any): string[] {
    return this.extractPreferredSegmentList(seller?.preferredSegmentsJson)
      .map((segment: string) => normalizeLookupValue(segment))
      .filter(Boolean);
  }

  async saveRadarAutoDistributionRuleForUser(user: any, input: {
    status?: string;
    includeAdmin?: boolean;
    adminTargetStock?: number;
    targetStockPerSeller?: number;
    adminDailyLimit?: number;
    dailyLimitPerSeller?: number;
    preferredState?: string | null;
    preferredCity?: string | null;
    segment?: string | null;
    categoryKey?: string | null;
    radiusKm?: number | null;
    userIds?: number[];
    territories?: Array<{ userId?: number; cities?: Array<{ city?: string; state?: string }> }>;
  } = {}) {
    if (!this.canUseWebscrapingRole(user)) {
      throw new ForbiddenException('Apenas ADMIN pode configurar distribuição automática do Radar.');
    }
    // RBAC Sprint 1: `radar.distribution.manage` (criar/alterar regra) vale
    // inclusive para o GERENTE (role=ADMIN). Master nunca e bloqueado.
    // VENDAS-REFAB item 5: o cron automático (processActiveRadarAutoDistributions)
    // foi DESLIGADO — esta rota só roda por ação explícita (run sob demanda).
    await this.assertTeamPolicyAccessAnyRole(
      user,
      'radar.distribution.manage',
      'Gerir distribuicao automatica do Radar esta bloqueado pela politica da equipe.',
    );
    const context = this.resolveContext(user);
    const existing = await this.prisma.radarAutoDistributionRule.findUnique({
      where: { companyId_scope: { companyId: context.companyId, scope: 'company' } },
    });

    const status = this.normalizeRadarAutoDistributionStatus(input.status, existing?.status || 'draft');
    const includeAdmin = input.includeAdmin === undefined ? Boolean(existing?.includeAdmin) : Boolean(input.includeAdmin);
    const adminTargetStock = includeAdmin
      ? this.normalizeRadarAutoDistributionInt(input.adminTargetStock, Math.max(0, Math.trunc(Number(existing?.adminTargetStock || 0) || 0)), 0, 500)
      : 0;
    const targetStockPerSeller = this.normalizeRadarAutoDistributionInt(
      input.targetStockPerSeller,
      Math.max(1, Math.trunc(Number(existing?.targetStockPerSeller || 30) || 30)),
      1,
      500,
    );
    const adminDailyLimit = includeAdmin
      ? this.normalizeDailyDistributionLimit(input.adminDailyLimit, Math.max(0, Math.trunc(Number((existing as any)?.adminDailyLimit || 0) || 0)))
      : 0;
    const dailyLimitPerSeller = this.normalizeDailyDistributionLimit(
      input.dailyLimitPerSeller,
      Math.max(0, Math.trunc(Number((existing as any)?.dailyLimitPerSeller || 20) || 20)),
    );
    const preferredState = input.preferredState === undefined
      ? existing?.preferredState || null
      : this.normalizeRadarAutoDistributionText(String(input.preferredState || '').toUpperCase(), 24);
    const preferredCity = input.preferredCity === undefined
      ? existing?.preferredCity || null
      : this.normalizeRadarAutoDistributionText(input.preferredCity, 120);
    const segment = input.segment === undefined
      ? existing?.segment || null
      : this.normalizeRadarAutoDistributionText(input.segment, 160);
    const categoryKey = input.categoryKey === undefined
      ? existing?.categoryKey || null
      : this.normalizeRadarAutoDistributionText(input.categoryKey, 160);
    const radiusKm = input.radiusKm === undefined
      ? existing?.radiusKm ?? null
      : input.radiusKm == null
        ? null
        : this.normalizeRadarAutoDistributionInt(input.radiusKm, 0, 0, RADAR_REGION_MAX_RADIUS_KM);
    const targetUserIds = Array.isArray(input.userIds)
      ? Array.from(new Set(
          input.userIds
            .map((id) => Math.trunc(Number(id || 0)))
            .filter((id) => Number.isInteger(id) && id > 0),
        )).slice(0, 50)
      : this.parseRadarAutoDistributionTargetIds(existing?.targetUserIdsJson);

    const [selectedSellers, activeSellers] = await Promise.all([
      targetUserIds.length ? this.listActiveDistributionSellers(context.companyId, targetUserIds) : Promise.resolve([]),
      this.listActiveDistributionSellers(context.companyId),
    ]);
    if (targetUserIds.length && selectedSellers.length !== targetUserIds.length) {
      throw new BadRequestException('Um ou mais vendedores selecionados estão inativos ou não pertencem a esta empresa.');
    }
    if (status === 'active' && !includeAdmin && activeSellers.length === 0) {
      throw new BadRequestException('Cadastre pelo menos um vendedor ativo ou inclua o Admin no recebimento.');
    }
    if (status === 'active' && (!preferredState || !preferredCity || !segment)) {
      throw new BadRequestException('Escolha estado, cidade e segmento antes de ativar a distribuição automática.');
    }
    const activeSellerIds = new Set(activeSellers.map((seller) => Number(seller.id || 0)));
    const sourceTerritories = Array.isArray(input.territories)
      ? input.territories
      : this.parseRadarTerritories(existing?.filtersJson);
    const normalizedTerritories = this.parseRadarTerritories(sourceTerritories)
      .filter((item) => activeSellerIds.has(Number(item.userId || 0)))
      .map((item) => ({ userId: item.userId, cities: item.cities.slice(0, 20) }))
      .filter((item) => item.cities.length > 0);
    const selectedCityKey = `${normalizeLookupValue(preferredCity || '')}:${String(preferredState || '').trim().toUpperCase()}`;
    if (status === 'active' && !includeAdmin && normalizedTerritories.length) {
      const hasSellerCoveringSelectedCity = normalizedTerritories.some((territory) =>
        territory.cities.some((city) => `${normalizeLookupValue(city.city)}:${String(city.state || '').trim().toUpperCase()}` === selectedCityKey),
      );
      if (!hasSellerCoveringSelectedCity) {
        throw new BadRequestException('Nenhum vendedor cobre a cidade escolhida. Ajuste o território ou inclua o Admin no recebimento.');
      }
    }

    const filtersJson = JSON.stringify({
      state: preferredState,
      city: preferredCity,
      segment,
      categoryKey,
      radiusKm,
      territoryMode: normalizedTerritories.length ? 'fixed_cities' : 'open',
      rule: normalizedTerritories.length
        ? 'Vendedor só recebe se a cidade da regra estiver no território dele.'
        : 'Sem território fixo: todos os vendedores ativos entram no rodízio.',
      territories: normalizedTerritories,
    });
    const now = new Date();
    const data = {
      status,
      includeAdmin,
      adminUserId: includeAdmin ? context.userId : null,
      adminTargetStock,
      targetStockPerSeller,
      adminDailyLimit,
      dailyLimitPerSeller,
      preferredState,
      preferredCity,
      segment,
      categoryKey,
      radiusKm,
      targetUserIdsJson: targetUserIds.length ? JSON.stringify(targetUserIds) : null,
      filtersJson,
      updatedByUserId: context.userId,
      lastActivatedAt: status === 'active' && existing?.status !== 'active' ? now : existing?.lastActivatedAt || null,
    };

    const rule = await this.prisma.radarAutoDistributionRule.upsert({
      where: { companyId_scope: { companyId: context.companyId, scope: 'company' } },
      create: {
        companyId: context.companyId,
        scope: 'company',
        createdByUserId: context.userId,
        ...data,
      },
      update: data,
    });

    return {
      ok: true,
      message: status === 'active'
        ? 'Distribuição automática ativada. O robô vai manter os estoques configurados.'
        : 'Configuração de distribuição automática salva.',
      activeSellerCount: activeSellers.length,
      rule: this.radarAutoDistributionPayload(rule, activeSellers),
    };
  }

  private normalizeRadarAutoDistributionRunLimit(value: unknown, fallback = 50) {
    return this.normalizeRadarAutoDistributionInt(value, fallback, 1, 100);
  }

  private async countRadarAutoDistributionOpenStock(companyId: number, assignedUserId: number | null) {
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    if (!normalizedCompanyId) return 0;
    return this.prisma.vendasLead.count({
      where: {
        companyId: normalizedCompanyId,
        assignedUserId: assignedUserId ? assignedUserId : null,
        NOT: [
          { status: 'encerrado' },
          { closedAt: { not: null } },
        ],
      },
    }).catch(() => 0);
  }

  private buildRadarAutoDistributionFilterInput(rule: any, quantity: number, extraSegments: string[] = []): RadarFiltersInput {
    const safeQuantity = Math.max(1, Math.min(100, Math.trunc(Number(quantity || 1) || 1)));
    // VENDAS-REFAB S2: segmento da regra continua a base, mas a busca alarga a
    // rede pros segmentos preferidos dos vendedores da fila (união, sem
    // duplicar) — sem isso, pickRowForTarget nunca teria candidato pra bater
    // preferência de vendedor cujo segmento é diferente do segmento da regra.
    // Território/cidade seguem hard-filter (a cerca real); segmento é boost.
    const ruleSegment = String(rule?.segment || '').trim();
    const combinedSegments = Array.from(new Set(
      [ruleSegment, ...(extraSegments || [])]
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    )).slice(0, 20);
    return {
      state: String(rule?.preferredState || '').trim().toUpperCase(),
      city: String(rule?.preferredCity || '').trim(),
      segment: combinedSegments.length > 1 ? combinedSegments.join(', ') : ruleSegment,
      radiusKm: rule?.radiusKm == null ? undefined : Math.max(0, Math.trunc(Number(rule.radiusKm || 0) || 0)),
      quantity: safeQuantity,
      limit: Math.min(300, Math.max(safeQuantity * 3, 30)),
      minimumStock: Math.min(500, Math.max(safeQuantity, 20)),
      desiredStock: Math.min(1000, Math.max(safeQuantity * 2, 60)),
      engine: 'hbx',
      targetType: 'pj',
      whatsappCheckMode: 'off',
    } as RadarFiltersInput;
  }

  /**
   * Distribuição automática não é um checkout. Ela só pode mover para Vendas
   * cards que já foram adquiridos pelo tenant em uma claim explícita anterior.
   * Leads livres nunca entram nesta consulta e não há reposição por busca.
   */
  private async queryOwnedRadarRowsForAutoDistribution(
    companyId: number,
    filters: NormalizedRadarFilters,
    limit: number,
  ) {
    const readLimit = Math.min(300, Math.max(1, Math.trunc(Number(limit || 1) || 1)));
    const baseWhere = this.buildRadarWhere(filters, null, {
      includeHidden: true,
      ownershipEnabled: false,
      requirePhone: false,
    });
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: {
        AND: [
          baseWhere,
          { ownerCompanyId: companyId },
          { status: { notIn: [...RADAR_PROTECTED_STATUSES, 'sent_to_vendas', 'rejected', 'duplicate'] } },
          {
            companyStates: {
              none: {
                companyId,
                OR: [
                  { vendasLeadId: { not: null } },
                  { status: { in: ['sent_to_vendas', 'imported_to_vendas'] } },
                ],
              },
            },
          },
        ],
      },
      orderBy: [
        { opportunityScore: 'desc' },
        { reviews: 'desc' },
        { rating: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: Math.min(readLimit * 4, 1000),
      include: {
        contacts: { orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }] },
        companyStates: { where: { companyId }, take: 1 },
        events: {
          where: { OR: [{ companyId }, { companyId: null }] },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    }).catch(() => []);
    const filtered = this.filterRadarRowsInMemory(rows, filters);
    const qualityWeighted = await this.attachSourceQualityPenalty(filtered);
    return this.sortRadarRowsByCommercialPriority(
      this.dedupeRadarRows(this.filterRowsByLeadQuality(qualityWeighted, filters)),
    ).slice(0, readLimit);
  }

  private async executeRadarAutoDistributionRule(
    user: any,
    rule: any,
    options: { limit?: number; triggeredBy?: 'manual' | 'worker' } = {},
  ) {
    if (!this.vendasService) {
      throw new ServiceUnavailableException('Servico de Vendas indisponivel para distribuicao automatica.');
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const context = this.resolveContext(user);
    const status = this.normalizeRadarAutoDistributionStatus(rule?.status);
    if (status !== 'active') {
      throw new BadRequestException('Distribuição automática precisa estar ativa.');
    }
    const filtersInput = this.buildRadarAutoDistributionFilterInput(rule, 1);
    const normalizedFilters = this.normalizeRadarFilters(filtersInput);
    if (!normalizedFilters.normalizedCity || !normalizedFilters.normalizedSegment) {
      throw new BadRequestException('Distribuição automática sem cidade ou segmento configurado.');
    }

    const selectedTargetIds = this.parseRadarAutoDistributionTargetIds(rule?.targetUserIdsJson);
    const activeSellers = await this.listActiveDistributionSellers(
      context.companyId,
      selectedTargetIds.length ? selectedTargetIds : undefined,
    );
    const sellerTerritories = this.parseRadarTerritories(rule?.filtersJson);
    const territoryModeFixed = sellerTerritories.some((territory) => territory.cities.length > 0);
    const territoryByUserId = new Map(sellerTerritories.map((territory) => [Number(territory.userId || 0), territory]));
    const selectedCityKey = `${normalizeLookupValue(rule?.preferredCity || '')}:${String(rule?.preferredState || '').trim().toUpperCase()}`;
    const sellerById = new Map(activeSellers.map((seller) => [Number(seller.id || 0), seller]));
    const orderedSellers = selectedTargetIds.length
      ? selectedTargetIds.map((id) => sellerById.get(id)).filter(Boolean)
      : activeSellers;

    const recipients: Array<{
      key: string;
      type: 'admin' | 'seller';
      assignedUserId: number | null;
      label: string;
      targetStock: number;
      currentStock: number;
      dailyLimit: number;
      deliveredToday: number;
      dailyRemaining: number;
      noDeliveryReason?: string | null;
      territoryCities?: Array<{ city: string; state: string }>;
      preferredSegments?: string[];
      needed: number;
      delivered: number;
    }> = [];
    const adminTargetStock = Math.max(0, Math.trunc(Number(rule?.adminTargetStock || 0) || 0));
    const adminDailyLimit = this.normalizeDailyDistributionLimit((rule as any)?.adminDailyLimit, adminTargetStock);
    if (Boolean(rule?.includeAdmin) && adminTargetStock > 0) {
      recipients.push({
        key: 'admin',
        type: 'admin',
        assignedUserId: null,
        label: 'Admin',
        targetStock: adminTargetStock,
        currentStock: 0,
        dailyLimit: adminDailyLimit,
        deliveredToday: 0,
        dailyRemaining: adminDailyLimit,
        noDeliveryReason: null,
        territoryCities: [],
        preferredSegments: [],
        needed: 0,
        delivered: 0,
      });
    }
    const targetStockPerSeller = Math.max(1, Math.trunc(Number(rule?.targetStockPerSeller || 30) || 30));
    const dailyLimitPerSeller = this.normalizeDailyDistributionLimit((rule as any)?.dailyLimitPerSeller, 20);
    for (const seller of orderedSellers) {
      const sellerId = Number(seller?.id || 0);
      if (!sellerId) continue;
      const sellerDailyLimit = this.resolveSellerDistributionDailyLimit(seller, dailyLimitPerSeller);
      const territory = territoryByUserId.get(sellerId);
      const territoryCities = territory?.cities || [];
      const territoryMatches = territoryCities.some((city) => (
        `${normalizeLookupValue(city.city)}:${String(city.state || '').trim().toUpperCase()}` === selectedCityKey
      ));
      const territoryReason = territoryModeFixed
        ? !territoryCities.length
          ? 'Sem território configurado'
          : !territoryMatches
            ? 'Fora do território desta cidade'
            : null
        : null;
      recipients.push({
        key: `seller:${sellerId}`,
        type: 'seller',
        assignedUserId: sellerId,
        label: String(seller?.name || seller?.username || seller?.email || `Vendedor ${sellerId}`).trim(),
        targetStock: targetStockPerSeller,
        currentStock: 0,
        dailyLimit: sellerDailyLimit,
        deliveredToday: 0,
        dailyRemaining: sellerDailyLimit,
        noDeliveryReason: territoryReason,
        territoryCities,
        preferredSegments: this.resolveSellerPreferredSegments(seller),
        needed: 0,
        delivered: 0,
      });
    }
    if (!recipients.length) {
      throw new BadRequestException('Nenhum destino ativo para distribuição automática.');
    }

    const currentStocks = await Promise.all(
      recipients.map((recipient) => this.countRadarAutoDistributionOpenStock(context.companyId, recipient.assignedUserId)),
    );
    const dayKey = this.getSaoPauloDayKey();
    const dailySnapshots = await Promise.all(
      recipients.map((recipient) => this.getDailyDistributionSnapshot(context.companyId, recipient.assignedUserId, recipient.dailyLimit, dayKey)),
    );
    const activeQuotaSnapshots = await Promise.all(
      recipients.map((recipient) => recipient.assignedUserId && this.commercialUsageLimits
        ? this.commercialUsageLimits.getSellerActiveCardQuotaSnapshot(context.companyId, recipient.assignedUserId).catch(() => null)
        : Promise.resolve(null)),
    );
    recipients.forEach((recipient, index) => {
      recipient.currentStock = Math.max(0, Math.trunc(Number(currentStocks[index] || 0) || 0));
      recipient.deliveredToday = Math.max(0, Math.trunc(Number(dailySnapshots[index]?.deliveredToday || 0) || 0));
      recipient.dailyRemaining = Math.max(0, Math.trunc(Number(dailySnapshots[index]?.remainingToday ?? recipient.dailyLimit) || 0));
      const stockNeed = Math.max(0, recipient.targetStock - recipient.currentStock);
      const activeQuota = activeQuotaSnapshots[index] as any;
      const activeRemaining = activeQuota?.seller ? Math.max(0, Math.trunc(Number(activeQuota.availableSlots || 0))) : stockNeed;
      const blockedByReason = Boolean(recipient.noDeliveryReason);
      recipient.needed = blockedByReason ? 0 : Math.min(stockNeed, recipient.dailyRemaining, activeRemaining);
      if (!blockedByReason && stockNeed > 0 && recipient.dailyRemaining <= 0) {
        recipient.noDeliveryReason = 'Limite diário atingido';
        void this.recordDailyDistributionSkip(context.companyId, recipient.assignedUserId, recipient.dailyLimit, 'limite_diario_atingido', dayKey);
      } else if (!blockedByReason && stockNeed > 0 && activeQuota?.seller && activeRemaining <= 0) {
        recipient.noDeliveryReason = 'Limite de cards ativos atingido';
        void this.recordDailyDistributionSkip(context.companyId, recipient.assignedUserId, recipient.dailyLimit, 'limite_cards_ativos_atingido', dayKey);
      }
    });

    const totalNeeded = recipients.reduce((sum, recipient) => sum + recipient.needed, 0);
    const runLimit = this.normalizeRadarAutoDistributionRunLimit(options.limit, 50);
    const deliveryLimit = Math.min(totalNeeded, runLimit);
    const queue: typeof recipients = [];
    while (queue.length < deliveryLimit && recipients.some((recipient) => recipient.needed > 0)) {
      for (const recipient of recipients) {
        if (queue.length >= deliveryLimit) break;
        if (recipient.needed <= 0) continue;
        queue.push(recipient);
        recipient.needed -= 1;
      }
    }

    const replenish = {
      ran: false,
      reason: 'purchase_requires_explicit_claim',
    };
    const assignments: Array<{
      radarLeadId: string;
      vendasLeadId?: string | null;
      targetType: 'admin' | 'seller';
      userId?: number | null;
      userName: string;
    }> = [];
    const failures: Array<{ radarLeadId?: string | null; target?: string | null; error: string }> = [];
    let blockedByLimit = false;

    if (queue.length) {
      // União dos segmentos preferidos de quem está na fila (a cerca de cada
      // vendedor) — alarga a leitura do banco pra ter candidato real pra
      // pickRowForTarget priorizar; a fábrica externa (replenish) continua só
      // no segmento da regra, que é o gatilho comercial da campanha.
      const queueSegments = Array.from(new Set(
        queue.flatMap((recipient) => recipient.preferredSegments || []),
      ));
      const filters = this.normalizeRadarFilters(this.buildRadarAutoDistributionFilterInput(rule, queue.length, queueSegments));
      const rows = await this.queryOwnedRadarRowsForAutoDistribution(
        context.companyId,
        filters,
        Math.min(300, Math.max(queue.length * 4, queue.length, 30)),
      );

      // VENDAS-REFAB S2: a fila (`queue`) tem 1 slot por card-a-entregar, na ordem
      // round-robin dos recipients — mas o CARD que cada slot recebe agora é
      // escolhido pela preferência de segmento do vendedor daquele slot (a cerca),
      // não pela ordem crua da query. BOOST, nunca filtro: vendedor sem preferência
      // ou sem lead do seu segmento disponível recebe do pool geral normalmente —
      // ninguém fica sem card por causa da preferência de outro.
      const usedRowIds = new Set<string>();
      const pickRowForTarget = (target: (typeof queue)[number]) => {
        const preferred = target.preferredSegments;
        if (preferred && preferred.length) {
          const preferredMatch = rows.find((row: any) => (
            !usedRowIds.has(String(row.id))
            && preferred.includes(normalizeLookupValue(String(row?.normalizedSegment || row?.segment || '')))
          ));
          if (preferredMatch) return preferredMatch;
        }
        return rows.find((row: any) => !usedRowIds.has(String(row.id))) || null;
      };

      let queueIndex = 0;
      while (queueIndex < queue.length && !blockedByLimit) {
        const target = queue[queueIndex];
        const row = pickRowForTarget(target);
        if (!row) break;
        usedRowIds.add(String(row.id));
        try {
          const imported = await this.importRadarLeadToVendasForUser(user, row.id, {
            skipWhatsappValidation: true,
            debitOnImport: false,
            transferAlreadyOwnedWithoutDebit: true,
            assignedUserId: target.assignedUserId,
            assignedByUserId: target.assignedUserId ? context.userId : null,
          });
          await this.incrementDailyDistributionDelivery(context.companyId, target.assignedUserId, target.dailyLimit, dayKey);
          target.delivered += 1;
          target.deliveredToday += 1;
          target.dailyRemaining = Math.max(0, target.dailyRemaining - 1);
          queueIndex += 1;
          assignments.push({
            radarLeadId: row.id,
            vendasLeadId: imported?.vendasLeadId || null,
            targetType: target.type,
            userId: target.assignedUserId,
            userName: target.label,
          });
        } catch (error: any) {
          // Mantém o mesmo target (não avança queueIndex): a row falhou (ex.: já
          // importada por outro processo concorrente), mas o slot ainda precisa
          // de card — pickRowForTarget já marcou esta row como usada, então a
          // próxima iteração tenta outra row pra este mesmo target.
          const reason = String(error?.response?.message || error?.message || error || 'Falha ao distribuir card.');
          failures.push({
            radarLeadId: row?.id || null,
            target: target?.label || null,
            error: reason,
          });
          this.logger.warn(`[radar-auto-distribution] lead ignorado company=${context.companyId} lead=${row?.id || '-'} target=${target?.key || '-'} error=${reason}`);
          if (this.isRadarAutoImportLimitError(error)) {
            blockedByLimit = true;
            break;
          }
        }
      }
    }

    await this.prisma.radarAutoDistributionRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date() },
    }).catch(() => null);

    const deliveredCount = assignments.length;
    const shortageCount = Math.max(0, totalNeeded - deliveredCount);
    const dailyBlockedCount = recipients.filter((recipient) => recipient.noDeliveryReason).length;
    const message = deliveredCount > 0
      ? blockedByLimit
        ? `${deliveredCount} card(s) distribuídos. A capacidade operacional configurada foi atingida.`
        : shortageCount > 0
          ? `${deliveredCount} card(s) distribuídos. Ainda faltam ${shortageCount} para completar todos os estoques.`
          : `${deliveredCount} card(s) distribuídos automaticamente.`
      : totalNeeded <= 0
        ? dailyBlockedCount > 0
          ? 'Distribuição sem entrega: vendedor(es) bloqueados por limite diário ou território.'
          : 'Todos os vendedores já estão no estoque configurado.'
        : blockedByLimit
          ? 'Distribuição automática pausada pela capacidade operacional configurada.'
          : 'Sem cards já adquiridos disponíveis. Novas compras exigem uma puxada explícita na tela.';

    return {
      ok: true,
      ran: true,
      triggeredBy: options.triggeredBy || 'manual',
      requestedCount: totalNeeded,
      queuedCount: queue.length,
      distributedCount: deliveredCount,
      failedCount: failures.length,
      shortageCount,
      blockedByLimit,
      replenish,
      assignments,
      failures: failures.slice(0, 12),
      targets: recipients.map((recipient) => ({
        type: recipient.type,
        userId: recipient.assignedUserId,
        name: recipient.label,
        targetStock: recipient.targetStock,
        stockBefore: recipient.currentStock,
        dailyLimit: recipient.dailyLimit,
        deliveredTodayBefore: Math.max(0, recipient.deliveredToday - recipient.delivered),
        dailyRemainingAfterEstimate: recipient.dailyRemaining,
        noDeliveryReason: recipient.noDeliveryReason || null,
        territoryCities: recipient.territoryCities || [],
        delivered: recipient.delivered,
        stockAfterEstimate: recipient.currentStock + recipient.delivered,
      })),
      message,
    };
  }

  async runRadarAutoDistributionForUser(user: any, input: { limit?: number } = {}) {
    if (!this.canUseWebscrapingRole(user)) {
      throw new ForbiddenException('Apenas ADMIN pode executar distribuição automática do Radar.');
    }
    // RBAC Sprint 1: disparar a distribuicao automatica e acao de gestao
    // (`radar.distribution.manage`) — vale inclusive para o GERENTE (role=ADMIN).
    await this.assertTeamPolicyAccessAnyRole(
      user,
      'radar.distribution.manage',
      'Gerir distribuicao automatica do Radar esta bloqueado pela politica da equipe.',
    );
    const context = this.resolveContext(user);
    const rule = await this.prisma.radarAutoDistributionRule.findUnique({
      where: { companyId_scope: { companyId: context.companyId, scope: 'company' } },
    });
    if (!rule) throw new BadRequestException('Configure a distribuição automática antes de executar.');
    return this.executeRadarAutoDistributionRule(user, rule, {
      limit: input?.limit,
      triggeredBy: 'manual',
    });
  }

  // REMOVIDO (VENDAS-REFAB item 5, 04/07): processActiveRadarAutoDistributions
  // era o cron ~2min que varria regras `active` (scope company/tenant_distribution)
  // e disparava executeRadarAutoDistributionRule/executeRadarTenantDistributionRule
  // sozinho, sem ação humana — o pump "que alimenta o Vendas sozinho" que o dono
  // pediu pra tirar. `radarAutoDistributionPumpActive`/`radarAutoDistributionTimer`
  // seguem declarados em radar-webscraping-core.service.ts (onModuleDestroy ainda
  // limpa o timer se algum dia for setado de novo), mas nada mais os alimenta.
  //
  // LIMPEZA legado round-robin (08/07): o painel/rotas do MASTER
  // (radar-auto-distribution GET/PUT/POST + getRadarTenantAutoDistributionPanel/
  // saveRadarTenantAutoDistributionPanel/runRadarTenantDistributionForUser/
  // executeRadarTenantDistributionRule, scope='tenant_distribution') e a leitura
  // do painel do ADMIN (GET radar/auto-distribution + getRadarAutoDistributionRuleForUser)
  // foram REMOVIDOS — confirmados órfãos (nenhum front chama, nenhum cron dispara).
  // `saveRadarAutoDistributionRuleForUser`/`runRadarAutoDistributionForUser` (scope=
  // 'company') e `executeRadarAutoDistributionRule` FICAM: mesmo sem rota própria hoje,
  // é o único caminho que grava `targetStockPerSeller` scope='company', que
  // `commercial-plans/commercial-usage-limits.service.ts::getSellerActiveCardBaseLimit`
  // lê ao vivo pro teto de cards ativos do vendedor — remover exigiria decisão
  // separada sobre esse acoplamento. A tabela `RadarAutoDistributionRule` (schema)
  // fica órfã de propósito (drop de tabela é proibido); `vendas.service.ts::
  // getSellerAuditForUser` ainda LÊ scope='tenant_distribution' direto do banco pra
  // exibir território/limite diário no painel Equipe — sem gravador próprio a partir
  // de agora, esses valores ficam congelados no que já existir (nunca mais atualizados
  // por código).

  private parseRadarTerritories(value: unknown): Array<{ userId: number; cities: Array<{ city: string; state: string }> }> {
    const parsed = this.parseMaybeJsonObject(value);
    const source = Array.isArray(parsed?.territories) ? parsed.territories : Array.isArray(value) ? value : [];
    return (source as any[])
      .map((item) => {
        const userId = Math.trunc(Number(item?.userId || 0));
        const cities = Array.from(new Map<string, { city: string; state: string }>(
          (Array.isArray(item?.cities) ? item.cities : [])
            .map((cityItem: any) => ({
              city: String(cityItem?.city || '').trim(),
              state: String(cityItem?.state || '').trim().toUpperCase(),
            }))
            .filter((cityItem) => cityItem.city && cityItem.state)
            .map((cityItem) => [`${normalizeLookupValue(cityItem.city)}:${cityItem.state}`, cityItem]),
        ).values()).slice(0, 80);
        return { userId, cities };
      })
      .filter((item) => item.userId > 0);
  }

  async markRadarLeadsSentToVendasForUser(user: any, radarLeadIds: string[] = []) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) return { ok: false, updatedCount: 0 };
    const ids = Array.from(new Set((Array.isArray(radarLeadIds) ? radarLeadIds : []).map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 100);
    if (!ids.length) return { ok: true, updatedCount: 0 };
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { id: { in: ids } },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => []);
    const now = new Date();
    let updatedCount = 0;
    // LIMPEZA-DESTRUTIVA L3: card e da EMPRESA — qualquer papel pode marcar como enviado
    // pro Vendas, mesmo que "Responsável" (assignedUserId) seja outro colega.
    for (const row of rows || []) {
      const existing = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      if (this.isRadarProtectedStatus(existing?.status || row?.status)) continue;
      try {
        await this.claimRadarLeadForCompany(context, row, {
          poolStatus: 'sent_to_vendas',
          companyStatus: 'sent_to_vendas',
          eventType: 'imported_to_vendas',
          note: 'Card enviado para Vendas.',
        });
      } catch {
        continue;
      }
      await (this.prisma as any).radarLeadPool.update({
        where: { id: row.id },
        data: {
          ...(await this.supportsRadarOwnershipPersistence() ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
          status: 'sent_to_vendas',
          globalImportedCount: { increment: 1 },
          lastSeenAt: now,
        },
      }).catch(() => null);
      updatedCount += 1;
    }
    return { ok: true, updatedCount };
  }

  async getRadarContactProtectionForUser(user: any, input: { phone?: string | null; phoneDigits?: string | null }) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      return { blocked: false, reason: 'radar_unavailable' };
    }
    const phoneDigits = normalizePhoneDigits(input.phoneDigits || input.phone);
    if (!phoneDigits) return { blocked: false, reason: 'no_phone' };
    const row = await (this.prisma as any).radarLeadPool.findFirst({
      where: {
        OR: [
          { phoneDigits },
          { phoneDigits: phoneDigits.startsWith('55') ? phoneDigits.slice(2) : `55${phoneDigits}` },
        ],
      },
      include: {
        companyStates: { where: { companyId: context.companyId }, take: 1 },
      },
    }).catch(() => null);
    if (!row) return { blocked: false, reason: 'not_found' };
    const companyState = Array.isArray(row.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    const status = this.normalizeRadarLeadStatus(companyState?.status || row.status);
    const blocked = this.isRadarProtectedStatus(status);
    return {
      blocked,
      status,
      radarLeadId: row.id,
      reason: blocked ? companyState?.negativeReason || companyState?.deniedReason || row.deniedReason || row.complaintReason || status : null,
    };
  }

  async markRadarContactDispositionForUser(
    user: any,
    input: {
      phone?: string | null;
      phoneDigits?: string | null;
      name?: string | null;
      city?: string | null;
      state?: string | null;
      segment?: string | null;
      status: string;
      reason?: string | null;
      source?: string | null;
    },
  ) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) return { ok: false, reason: 'radar_unavailable' };
    const phoneDigits = normalizePhoneDigits(input.phoneDigits || input.phone);
    if (!phoneDigits) return { ok: false, reason: 'no_phone' };
    const now = new Date();
    let row = await (this.prisma as any).radarLeadPool.findFirst({
      where: { phoneDigits },
    }).catch(() => null);
    if (!row) {
      row = await (this.prisma as any).radarLeadPool.create({
        data: {
          name: String(input.name || 'Contato sem nome').trim() || 'Contato sem nome',
          phone: String(input.phone || phoneDigits).trim() || phoneDigits,
          phoneDigits,
          ddd: this.extractDdd(phoneDigits),
          city: String(input.city || '').trim() || null,
          state: String(input.state || '').trim().toUpperCase() || null,
          normalizedCity: normalizeLookupValue(String(input.city || '')),
          segment: String(input.segment || '').trim() || null,
          normalizedSegment: normalizeLookupValue(String(input.segment || '')),
          websiteStatus: 'unknown',
          source: input.source || 'vendas_automation',
          sourceEngine: 'vendas_automation',
          sourceEngines: JSON.stringify(['vendas_automation']),
          opportunityScore: 0,
          opportunityReason: 'Criado para proteger histórico operacional de Vendas.',
          status: 'clean',
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
    }
    const dispositionStatus = this.normalizeRadarLeadStatus(input.status);
    if (dispositionStatus === 'interested' || dispositionStatus === 'positive') {
      return this.markRadarLeadPositiveDispositionForUser(user, row.id, {
        status: dispositionStatus,
        reason: input.reason || input.status,
        privateNotes: input.source || 'Vendas Automação',
      });
    }
    return this.markRadarLeadNegativeForUser(user, row.id, {
      status: input.status,
      reason: input.reason || input.status,
      privateNotes: input.source || 'Vendas Automação',
    });
  }

  private async markRadarLeadPositiveDispositionForUser(
    user: any,
    radarLeadId: string,
    input: { status?: string; reason?: string; privateNotes?: string } = {},
  ) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const status = this.normalizeRadarLeadStatus(input.status || 'interested');
    const existing = await (this.prisma as any).radarLeadCompanyState.findUnique({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
    }).catch(() => null);
    const now = new Date();
    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        status,
        negativeReason: null,
        deniedReason: null,
        complaintReason: null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
      update: {
        status,
        negativeReason: null,
        deniedReason: null,
        complaintReason: null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
    });
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        ...(ownershipEnabled ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
        status,
        deniedReason: null,
        complaintReason: null,
        recommendedChannel: 'whatsapp',
        lastSeenAt: now,
      },
    }).catch(() => null);
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: 'status_changed',
      note: String(input.reason || '').trim() || null,
      statusFrom: this.normalizeRadarLeadStatus(existing?.status || row.status),
      statusTo: status,
    });
    return {
      ok: true,
      radarLeadId: row.id,
      status,
    };
  }

  // Recusa DURA = o contato é ruim pra TODO MUNDO (número não existe, sem WhatsApp,
  // número inválido, CAIXA POSTAL, opt-out, reclamação, bloqueio) → o lead some da
  // lagoa pra todas as empresas. Recusa LEVE ("sem interesse", recusou a oferta,
  // descartou, escondeu, NÃO ATENDEU) é só desta empresa → o lead VOLTA pra lagoa pros
  // outros. Dono 14/06: "pode não querer refrigerante mas topar a ligação da cerveja".
  // DERIVA da fonte única `radar-disposition-rules.ts` (matriz do dono PR24062026):
  //   - `no_answer` ("não atendeu") agora é LEVE (saiu do bloqueio global).
  //   - `voicemail` ("caixa postal") agora é DURA (entrou no bloqueio global).
  private isRadarGlobalKillStatus(status: string): boolean {
    return isGlobalBlockStatus(status);
  }

  async markRadarLeadNegativeForUser(user: any, radarLeadId: string, input: { status?: string; reason?: string; privateNotes?: string } = {}) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
    if (ownershipEnabled && ownerCompanyId && ownerCompanyId !== context.companyId) {
      throw new ForbiddenException('Este card já está na carteira de outra empresa.');
    }
    const normalizedStatus = String(input.status || '').trim().toLowerCase();
    const status: RadarLeadStatus =
      normalizedStatus === 'denied'
        ? 'denied'
        : normalizedStatus === 'complaint'
          ? 'complaint'
          : normalizedStatus === 'hidden'
            ? 'hidden'
            : normalizedStatus === 'discarded' || normalizedStatus === 'descartado'
        ? 'discarded'
        : normalizedStatus === 'blocked' || normalizedStatus === 'bloqueado'
          ? 'blocked'
          // caixa postal (voicemail) = único kill de LIGAÇÃO → status próprio, protegido,
          // bloqueia global (matriz do dono PR24062026). 'voicemail' ∈ RADAR_PROTECTED_STATUSES.
          : normalizedStatus === 'voicemail' || normalizedStatus === 'caixa_postal'
            ? 'voicemail'
          : normalizedStatus === 'opt_out' || normalizedStatus === 'optout' || normalizedStatus === 'do_not_contact' || normalizedStatus === 'nao_quer_contato' || normalizedStatus === 'não_quer_contato'
            ? 'opt_out'
            : normalizedStatus === 'no_whatsapp'
              ? 'no_whatsapp'
              : normalizedStatus === 'invalid_whatsapp'
                ? 'invalid_whatsapp'
              : 'negative';
    const existing = await (this.prisma as any).radarLeadCompanyState.findUnique({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
    }).catch(() => null);
    const now = new Date();
    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        status,
        negativeReason: String(input.reason || '').trim() || null,
        deniedReason: ['negative', 'denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : null,
        complaintReason: status === 'complaint' ? String(input.reason || '').trim() || null : null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
      update: {
        status,
        negativeReason: String(input.reason || '').trim() || null,
        deniedReason: ['negative', 'denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : null,
        complaintReason: status === 'complaint' ? String(input.reason || '').trim() || null : null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
    });
    if (!this.isRadarProtectedStatus(existing?.status)) {
      if (this.isRadarGlobalKillStatus(status)) {
        // DURA: morre pra todos. Marca o status global protegido — o buildRadarWhere
        // exclui da lagoa inteira (número/contato ruim não serve pra ninguém).
        await (this.prisma as any).radarLeadPool.update({
          where: { id: row.id },
          data: {
            ...(ownershipEnabled ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
            status,
            deniedReason: ['denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : undefined,
            complaintReason: status === 'complaint' ? String(input.reason || '').trim() || null : undefined,
            recommendedChannel: 'discard',
            enrichmentScore: 0,
            globalNegativeCount: { increment: 1 },
            lastSeenAt: now,
          },
        }).catch(() => null);
      } else {
        // LEVE: bloqueia só ESTA empresa (companyState já gravado acima) e LIBERA o
        // card de volta pra lagoa pros outros. Não toca canal/score (opinião de A não
        // vale pra B) e NUNCA ressuscita um lead já morto globalmente por outra empresa.
        const globallyDead = this.isRadarProtectedStatus(row?.status)
          || ['rejected', 'duplicate'].includes(String(row?.status || '').trim().toLowerCase());
        await (this.prisma as any).radarLeadPool.update({
          where: { id: row.id },
          data: {
            ...(ownershipEnabled ? { ownerCompanyId: null, claimedAt: null } : {}),
            ...(globallyDead ? {} : { status: 'clean' }),
            globalNegativeCount: { increment: 1 },
            lastSeenAt: now,
          },
        }).catch(() => null);
      }
    }
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: status === 'discarded'
        ? 'discarded'
        : status === 'hidden'
          ? 'hidden'
        : status === 'blocked'
          ? 'blocked'
        : status === 'opt_out'
          ? 'opt_out'
          : status === 'complaint'
            ? 'complaint'
            : status === 'no_whatsapp' || status === 'invalid_whatsapp'
              ? 'no_answer'
              : status === 'denied'
                ? 'denied'
                : 'negative',
      note: String(input.reason || '').trim() || null,
      statusFrom: this.normalizeRadarLeadStatus(existing?.status || row.status),
      statusTo: status,
    });
    return {
      ok: true,
      radarLeadId: row.id,
      status,
    };
  }

  // ── Standing order do vendedor: REMOVIDO (LIMPEZA-DESTRUTIVA L4, 04/07) ─────
  // Era self-serve inerte (pump já morto desde o VENDAS-REFAB item 5) — sem
  // endpoint, sem leitura/escrita de radarSellerStandingOrderJson. No modelo
  // atual, admin distribui CRÉDITO (camada CREDITOS), não busca automática por
  // vendedor. Coluna radarSellerStandingOrderJson no schema fica órfã (histórico).
}
