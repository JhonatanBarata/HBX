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
  MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
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
    return this.normalizeRadarAutoDistributionInt(value, fallback, 0, 500);
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
    const territories = this.parseMasterRadarTerritories(row?.filtersJson);
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
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }, { id: 'asc' }],
    });
    return (sellers || [])
      .filter((seller: any) => !this.isSellerDistributionPaused(seller))
      .sort((a: any, b: any) => this.sellerDistributionPriorityWeight(a) - this.sellerDistributionPriorityWeight(b));
  }

  async getRadarAutoDistributionRuleForUser(user: any) {
    if (!this.canUseWebscrapingRole(user)) {
      throw new ForbiddenException('Apenas ADMIN pode configurar distribuiÃ§Ã£o automÃ¡tica do Radar.');
    }
    const context = this.resolveContext(user);
    const [rule, activeSellers] = await Promise.all([
      this.prisma.radarAutoDistributionRule.findUnique({
        where: { companyId_scope: { companyId: context.companyId, scope: 'company' } },
      }),
      this.listActiveDistributionSellers(context.companyId),
    ]);
    return {
      ok: true,
      activeSellerCount: activeSellers.length,
      rule: this.radarAutoDistributionPayload(rule || {
        scope: 'company',
        status: 'draft',
        includeAdmin: false,
        adminTargetStock: 0,
        targetStockPerSeller: 30,
        adminDailyLimit: 0,
        dailyLimitPerSeller: 20,
      }, activeSellers),
    };
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
      throw new ForbiddenException('Apenas ADMIN pode configurar distribuiÃ§Ã£o automÃ¡tica do Radar.');
    }
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
      throw new BadRequestException('Um ou mais vendedores selecionados estÃ£o inativos ou nÃ£o pertencem a esta empresa.');
    }
    if (status === 'active' && !includeAdmin && activeSellers.length === 0) {
      throw new BadRequestException('Cadastre pelo menos um vendedor ativo ou inclua o Admin no recebimento.');
    }
    if (status === 'active' && (!preferredState || !preferredCity || !segment)) {
      throw new BadRequestException('Escolha estado, cidade e segmento antes de ativar a distribuiÃ§Ã£o automÃ¡tica.');
    }
    const activeSellerIds = new Set(activeSellers.map((seller) => Number(seller.id || 0)));
    const sourceTerritories = Array.isArray(input.territories)
      ? input.territories
      : this.parseMasterRadarTerritories(existing?.filtersJson);
    const normalizedTerritories = this.parseMasterRadarTerritories(sourceTerritories)
      .filter((item) => activeSellerIds.has(Number(item.userId || 0)))
      .map((item) => ({ userId: item.userId, cities: item.cities.slice(0, 20) }))
      .filter((item) => item.cities.length > 0);
    const selectedCityKey = `${normalizeLookupValue(preferredCity || '')}:${String(preferredState || '').trim().toUpperCase()}`;
    if (status === 'active' && !includeAdmin && normalizedTerritories.length) {
      const hasSellerCoveringSelectedCity = normalizedTerritories.some((territory) =>
        territory.cities.some((city) => `${normalizeLookupValue(city.city)}:${String(city.state || '').trim().toUpperCase()}` === selectedCityKey),
      );
      if (!hasSellerCoveringSelectedCity) {
        throw new BadRequestException('Nenhum vendedor cobre a cidade escolhida. Ajuste o territÃ³rio ou inclua o Admin no recebimento.');
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
        ? 'Vendedor sÃ³ recebe se a cidade da regra estiver no territÃ³rio dele.'
        : 'Sem territÃ³rio fixo: todos os vendedores ativos entram no rodÃ­zio.',
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
        ? 'DistribuiÃ§Ã£o automÃ¡tica ativada. O robÃ´ vai manter os estoques configurados.'
        : 'ConfiguraÃ§Ã£o de distribuiÃ§Ã£o automÃ¡tica salva.',
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

  private buildRadarAutoDistributionFilterInput(rule: any, quantity: number): RadarFiltersInput {
    const safeQuantity = Math.max(1, Math.min(100, Math.trunc(Number(quantity || 1) || 1)));
    return {
      state: String(rule?.preferredState || '').trim().toUpperCase(),
      city: String(rule?.preferredCity || '').trim(),
      segment: String(rule?.segment || '').trim(),
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

  private async resolveRadarAutoDistributionAdminUser(rule: any) {
    const companyId = Math.trunc(Number(rule?.companyId || 0));
    if (!companyId) return null;
    const preferredUserId = Math.trunc(Number(rule?.adminUserId || rule?.updatedByUserId || rule?.createdByUserId || 0)) || 0;
    const select = {
      id: true,
      companyId: true,
      role: true,
      isSystemMaster: true,
      isActive: true,
      name: true,
      email: true,
      username: true,
    } as const;
    if (preferredUserId) {
      const preferred = await this.prisma.user.findFirst({
        where: { id: preferredUserId, companyId, isActive: true },
        select,
      }).catch(() => null);
      if (preferred) return preferred;
    }
    return this.prisma.user.findFirst({
      where: {
        companyId,
        isActive: true,
        role: 'ADMIN',
      },
      select,
      orderBy: [{ id: 'asc' }],
    }).catch(() => null);
  }

  private buildRadarAutoDistributionUser(adminUser: any) {
    return {
      id: Number(adminUser?.id || 0),
      companyId: Number(adminUser?.companyId || 0),
      role: String(adminUser?.role || 'ADMIN'),
      isSystemMaster: Boolean(adminUser?.isSystemMaster),
    };
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
      throw new BadRequestException('DistribuiÃ§Ã£o automÃ¡tica precisa estar ativa.');
    }
    const filtersInput = this.buildRadarAutoDistributionFilterInput(rule, 1);
    const normalizedFilters = this.normalizeRadarFilters(filtersInput);
    if (!normalizedFilters.normalizedCity || !normalizedFilters.normalizedSegment) {
      throw new BadRequestException('DistribuiÃ§Ã£o automÃ¡tica sem cidade ou segmento configurado.');
    }

    const selectedTargetIds = this.parseRadarAutoDistributionTargetIds(rule?.targetUserIdsJson);
    const activeSellers = await this.listActiveDistributionSellers(
      context.companyId,
      selectedTargetIds.length ? selectedTargetIds : undefined,
    );
    const sellerTerritories = this.parseMasterRadarTerritories(rule?.filtersJson);
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
          ? 'Sem territÃ³rio configurado'
          : !territoryMatches
            ? 'Fora do territÃ³rio desta cidade'
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
        needed: 0,
        delivered: 0,
      });
    }
    if (!recipients.length) {
      throw new BadRequestException('Nenhum destino ativo para distribuiÃ§Ã£o automÃ¡tica.');
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
        recipient.noDeliveryReason = 'Limite diÃ¡rio atingido';
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

    let replenish: any = null;
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
      const filters = this.normalizeRadarFilters(this.buildRadarAutoDistributionFilterInput(rule, queue.length));
      let rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
        limit: Math.min(300, Math.max(queue.length * 3, queue.length, 30)),
        requirePhone: false,
        availableOnly: true,
      });
      if (rows.length < queue.length) {
        try {
          replenish = await this.replenishRadarStockForUser(user, this.buildRadarAutoDistributionFilterInput(rule, queue.length));
        } catch (error: any) {
          replenish = {
            ran: true,
            reason: 'replenish_failed_using_database',
            errorMessage: this.extractHbxErrorMessage(error),
          };
          this.logger.warn(`[radar-auto-distribution] reposicao falhou company=${context.companyId}: ${String(error?.message || error)}`);
        }
        rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
          limit: Math.min(300, Math.max(queue.length * 4, queue.length, 30)),
          requirePhone: false,
          availableOnly: true,
        });
      }

      let queueIndex = 0;
      for (const row of rows) {
        if (queueIndex >= queue.length || blockedByLimit) break;
        const target = queue[queueIndex];
        try {
          const imported = await this.importRadarLeadToVendasForUser(user, row.id, {
            skipWhatsappValidation: true,
            debitOnImport: true,
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
        ? `${deliveredCount} card(s) distribuÃ­dos. Parei porque o limite do plano foi atingido.`
        : shortageCount > 0
          ? `${deliveredCount} card(s) distribuÃ­dos. Ainda faltam ${shortageCount} para completar todos os estoques.`
          : `${deliveredCount} card(s) distribuÃ­dos automaticamente.`
      : totalNeeded <= 0
        ? dailyBlockedCount > 0
          ? 'DistribuiÃ§Ã£o sem entrega: vendedor(es) bloqueados por limite diÃ¡rio ou territÃ³rio.'
          : 'Todos os vendedores jÃ¡ estÃ£o no estoque configurado.'
        : blockedByLimit
          ? 'DistribuiÃ§Ã£o automÃ¡tica pausada pelo limite do plano.'
          : 'Sem cards disponÃ­veis agora para essa regra. O robÃ´ tentarÃ¡ novamente.';

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
      throw new ForbiddenException('Apenas ADMIN pode executar distribuiÃ§Ã£o automÃ¡tica do Radar.');
    }
    const context = this.resolveContext(user);
    const rule = await this.prisma.radarAutoDistributionRule.findUnique({
      where: { companyId_scope: { companyId: context.companyId, scope: 'company' } },
    });
    if (!rule) throw new BadRequestException('Configure a distribuiÃ§Ã£o automÃ¡tica antes de executar.');
    return this.executeRadarAutoDistributionRule(user, rule, {
      limit: input?.limit,
      triggeredBy: 'manual',
    });
  }

  private async processActiveRadarAutoDistributions() {
    if (this.radarAutoDistributionPumpActive) return;
    this.radarAutoDistributionPumpActive = true;
    try {
      const dueBefore = new Date(Date.now() - 2 * 60_000);
      const rules = await this.prisma.radarAutoDistributionRule.findMany({
        where: {
          scope: { in: ['company', 'hbx_master'] },
          status: 'active',
          OR: [
            { lastRunAt: null },
            { lastRunAt: { lte: dueBefore } },
          ],
        },
        orderBy: [{ lastRunAt: 'asc' }, { updatedAt: 'asc' }],
        take: 8,
      }).catch(() => []);
      for (const rule of rules || []) {
        if (String(rule?.scope || '') === 'hbx_master') {
          const masterUser = await this.resolveMasterRadarDistributionWorkerUser(rule);
          if (!masterUser) continue;
          await this.executeMasterRadarAutoDistributionRule(masterUser, rule, {
            limit: 40,
            triggeredBy: 'worker',
          }).catch((error: any) => {
            this.logger.warn(`[radar-auto-distribution] execucao HBX ignorada rule=${rule?.id || '-'} company=${rule?.companyId || '-'}: ${String(error?.message || error)}`);
          });
          continue;
        }
        const adminUser = await this.resolveRadarAutoDistributionAdminUser(rule);
        if (!adminUser) continue;
        await this.executeRadarAutoDistributionRule(this.buildRadarAutoDistributionUser(adminUser), rule, {
          limit: 40,
          triggeredBy: 'worker',
        }).catch((error: any) => {
          this.logger.warn(`[radar-auto-distribution] execucao ignorada rule=${rule?.id || '-'} company=${rule?.companyId || '-'}: ${String(error?.message || error)}`);
        });
      }
    } finally {
      this.radarAutoDistributionPumpActive = false;
    }
  }

  private parseMasterRadarTerritories(value: unknown): Array<{ userId: number; cities: Array<{ city: string; state: string }> }> {
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

  private async resolveMasterRadarDistributionWorkerUser(rule: any) {
    const companyId = Math.trunc(Number(rule?.companyId || 0));
    if (!companyId) return null;
    const preferredUserId = Math.trunc(Number(rule?.updatedByUserId || rule?.createdByUserId || 0)) || 0;
    const select = {
      id: true,
      companyId: true,
      role: true,
      isSystemMaster: true,
      isActive: true,
    } as const;
    const preferred = preferredUserId
      ? await this.prisma.user.findFirst({
          where: { id: preferredUserId, isActive: true, isSystemMaster: true },
          select,
        }).catch(() => null)
      : null;
    const user = preferred || await this.prisma.user.findFirst({
      where: { isActive: true, isSystemMaster: true },
      select,
      orderBy: { id: 'asc' },
    }).catch(() => null);
    if (!user?.id) return null;
    return {
      id: Number(user.id),
      companyId,
      role: String(user.role || 'USERMASTER'),
      isSystemMaster: true,
      masterContext: {
        active: true,
        companyId,
        mode: 'master_operational',
      },
    };
  }

  private async resolveMasterRadarDistributionCompanyId(user: any) {
    const directCompanyId = Math.trunc(Number(user?.companyId || 0)) || null;
    const masterCompany = await this.prisma.company.findFirst({
      where: { slug: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG },
      select: { id: true },
    }).catch(() => null);
    if (masterCompany?.id) return Number(masterCompany.id);
    if (directCompanyId) return directCompanyId;
    const masterUser = await this.prisma.user.findFirst({
      where: { isSystemMaster: true, companyId: { not: null } },
      select: { companyId: true },
      orderBy: { id: 'asc' },
    }).catch(() => null);
    return Math.trunc(Number(masterUser?.companyId || 0)) || 0;
  }

  private async listMasterRadarDistributionSellers(companyId: number): Promise<any[]> {
    const where = {
      companyId,
      isActive: true,
      isSystemMaster: false,
      role: { in: ['USER', 'ADMIN'] },
    };
    const orderBy = [{ name: 'asc' }, { email: 'asc' }, { id: 'asc' }];
    const baseSelect = {
      id: true,
      name: true,
      email: true,
      username: true,
      phone: true,
      commissionPercent: true,
      canRegisterHbxSellers: true,
      sellerReferralCommissionPercent: true,
      referredByUserId: true,
      preferredSegmentsJson: true,
    };
    const distributionSelect = {
      ...baseSelect,
      sellerDistributionMode: true,
      sellerDistributionPausedUntil: true,
      sellerDistributionDailyLimitOverride: true,
      sellerDistributionNote: true,
    };
    const sellers = await (this.prisma.user as any).findMany({
      where,
      select: distributionSelect,
      orderBy,
    }).catch(async (error: any) => {
      this.logger.warn(`[radar-auto-distribution] campos de distribuicao do vendedor indisponiveis no schema local: ${String(error?.message || error)}`);
      return (this.prisma.user as any).findMany({
        where,
        select: baseSelect,
        orderBy,
      }).catch((fallbackError: any) => {
        this.logger.warn(`[radar-auto-distribution] falha ao listar vendedores HBX company=${companyId}: ${String(fallbackError?.message || fallbackError)}`);
        return [];
      });
    });
    return (sellers || [])
      .filter((seller: any) => !this.isSellerDistributionPaused(seller))
      .sort((a: any, b: any) => this.sellerDistributionPriorityWeight(a) - this.sellerDistributionPriorityWeight(b));
  }

  private async estimateRadarPotentialForCities(cities: Array<{ city: string; state: string }>) {
    const uniqueCities = Array.from(new Map(
      (cities || [])
        .map((item) => ({
          city: String(item?.city || '').trim(),
          state: String(item?.state || '').trim().toUpperCase(),
          normalizedCity: normalizeLookupValue(item?.city || ''),
        }))
        .filter((item) => item.city && item.state && item.normalizedCity)
        .map((item) => [`${item.normalizedCity}:${item.state}`, item]),
    ).values()).slice(0, 120);
    const output = new Map<string, number>();
    const radarLeadPool = (this.prisma as any).radarLeadPool;
    if (!radarLeadPool?.count) return output;
    for (const item of uniqueCities) {
      const count = await radarLeadPool.count({
        where: {
          normalizedCity: item.normalizedCity,
          state: item.state,
          status: { notIn: [...RADAR_PROTECTED_STATUSES, 'rejected', 'duplicate', 'sent_to_vendas'] as any },
        },
      }).catch(() => 0);
      output.set(`${item.normalizedCity}:${item.state}`, Math.max(0, Math.trunc(Number(count || 0) || 0)));
    }
    return output;
  }

  private async listMasterRadarCitySuggestions() {
    const radarLeadPool = (this.prisma as any).radarLeadPool;
    if (!radarLeadPool?.findMany) return [];
    const rows = await radarLeadPool.findMany({
      where: {
        city: { not: null },
        state: { not: null },
        status: { notIn: [...RADAR_PROTECTED_STATUSES, 'rejected', 'duplicate', 'sent_to_vendas'] as any },
      },
      select: {
        city: true,
        state: true,
        normalizedCity: true,
      },
      orderBy: [{ opportunityScore: 'desc' }, { lastSeenAt: 'desc' }],
      take: 1500,
    }).catch(() => []);
    const stats = new Map<string, { city: string; state: string; normalizedCity: string; availableCards: number }>();
    for (const row of rows || []) {
      const city = String(row?.city || '').trim();
      const state = String(row?.state || '').trim().toUpperCase();
      const normalizedCity = String(row?.normalizedCity || normalizeLookupValue(city)).trim();
      if (!city || !state || !normalizedCity) continue;
      const key = `${normalizedCity}:${state}`;
      const current = stats.get(key) || { city, state, normalizedCity, availableCards: 0 };
      current.availableCards += 1;
      stats.set(key, current);
    }
    return Array.from(stats.values())
      .sort((left, right) => right.availableCards - left.availableCards || left.city.localeCompare(right.city, 'pt-BR'))
      .slice(0, 60);
  }

  private buildMasterRadarCityBalance(
    citySuggestions: Array<{ city: string; state: string; normalizedCity?: string; availableCards?: number }>,
    territories: Array<{ userId: number; cities: Array<{ city: string; state: string }> }>,
    potentialByCity: Map<string, number>,
    targetStockPerSeller: number,
  ) {
    const normalizedTargetStock = Math.max(1, Math.trunc(Number(targetStockPerSeller || 30) || 30));
    const assignedByCity = new Map<string, { city: string; state: string; userIds: Set<number> }>();
    for (const territory of territories || []) {
      const userId = Math.trunc(Number(territory?.userId || 0));
      if (!userId) continue;
      const seenForSeller = new Set<string>();
      for (const cityItem of territory.cities || []) {
        const city = String(cityItem?.city || '').trim();
        const state = String(cityItem?.state || '').trim().toUpperCase();
        const normalizedCity = normalizeLookupValue(city);
        if (!city || !state || !normalizedCity) continue;
        const key = `${normalizedCity}:${state}`;
        if (seenForSeller.has(key)) continue;
        seenForSeller.add(key);
        const current = assignedByCity.get(key) || { city, state, userIds: new Set<number>() };
        current.userIds.add(userId);
        assignedByCity.set(key, current);
      }
    }

    const cityMap = new Map<string, { city: string; state: string; normalizedCity: string; availableCards: number }>();
    for (const item of citySuggestions || []) {
      const city = String(item?.city || '').trim();
      const state = String(item?.state || '').trim().toUpperCase();
      const normalizedCity = String(item?.normalizedCity || normalizeLookupValue(city)).trim();
      if (!city || !state || !normalizedCity) continue;
      cityMap.set(`${normalizedCity}:${state}`, {
        city,
        state,
        normalizedCity,
        availableCards: Math.max(0, Math.trunc(Number(item?.availableCards || 0) || 0)),
      });
    }
    for (const [key, assigned] of assignedByCity.entries()) {
      if (cityMap.has(key)) continue;
      const [normalizedCity] = key.split(':');
      cityMap.set(key, {
        city: assigned.city,
        state: assigned.state,
        normalizedCity,
        availableCards: Math.max(0, Math.trunc(Number(potentialByCity.get(key) || 0) || 0)),
      });
    }

    return Array.from(cityMap.values()).map((cityItem) => {
      const key = `${cityItem.normalizedCity}:${cityItem.state}`;
      const assignedSellerCount = assignedByCity.get(key)?.userIds.size || 0;
      const availableCards = Math.max(0, Math.trunc(Number(cityItem.availableCards || 0) || 0));
      const recommendedSellerCount = availableCards > 0
        ? Math.max(1, Math.ceil(availableCards / normalizedTargetStock))
        : assignedSellerCount > 0 ? 1 : 0;
      const sellerGap = recommendedSellerCount - assignedSellerCount;
      const pressureScore = availableCards > 0
        ? Number((availableCards / Math.max(1, assignedSellerCount || recommendedSellerCount || 1)).toFixed(2))
        : 0;
      const coverageStatus = assignedSellerCount <= 0 && recommendedSellerCount > 0
        ? 'uncovered'
        : sellerGap > 0
          ? 'needs_sellers'
          : assignedSellerCount > recommendedSellerCount + 1
            ? 'overcovered'
            : 'balanced';
      const actionLabel = coverageStatus === 'uncovered'
        ? 'Sem vendedor fixo'
        : coverageStatus === 'needs_sellers'
          ? `Faltam ${sellerGap} vendedor(es)`
          : coverageStatus === 'overcovered'
            ? 'Pode redistribuir'
            : 'Cobertura ok';
      return {
        city: cityItem.city,
        state: cityItem.state,
        normalizedCity: cityItem.normalizedCity,
        availableCards,
        assignedSellerCount,
        recommendedSellerCount,
        sellerGap,
        pressureScore,
        coverageStatus,
        actionLabel,
      };
    }).sort((left, right) => {
      const rank: Record<string, number> = {
        uncovered: 0,
        needs_sellers: 1,
        overcovered: 2,
        balanced: 3,
      };
      return (rank[left.coverageStatus] ?? 9) - (rank[right.coverageStatus] ?? 9)
        || Math.abs(right.sellerGap) - Math.abs(left.sellerGap)
        || right.availableCards - left.availableCards
        || left.city.localeCompare(right.city, 'pt-BR');
    }).slice(0, 80);
  }

  private async queryMasterRadarTerritoryRows(
    companyId: number,
    cities: Array<{ city: string; state: string }>,
    limit: number,
    excludeIds: string[] = [],
  ) {
    if (!(await this.supportsRadarPersistence())) return [];
    const normalizedCities = Array.from(new Map(
      (cities || [])
        .map((item) => ({
          city: String(item?.city || '').trim(),
          state: String(item?.state || '').trim().toUpperCase(),
          normalizedCity: normalizeLookupValue(item?.city || ''),
        }))
        .filter((item) => item.city && item.state && item.normalizedCity)
        .map((item) => [`${item.normalizedCity}:${item.state}`, item]),
    ).values()).slice(0, 80);
    if (!normalizedCities.length) return [];
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    if (ownershipEnabled) {
      await this.releaseExpiredRadarReservations({ companyId }).catch((error: any) => {
        this.logger.warn(`[radar-auto-distribution] falha ao liberar reservas HBX company=${companyId}: ${String(error?.message || error)}`);
      });
    }
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit || 20) || 20)));
    const safeExcludeIds = Array.from(new Set((excludeIds || []).map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 500);
    const and: any[] = [
      {
        OR: normalizedCities.map((item) => ({
          normalizedCity: item.normalizedCity,
          state: item.state,
        })),
      },
      {
        companyStates: {
          none: {
            companyId,
            status: { in: [...RADAR_PROTECTED_STATUSES, 'imported_to_vendas', 'sent_to_vendas'] as any },
          },
        },
      },
      {
        status: { notIn: [...RADAR_PROTECTED_STATUSES, 'rejected', 'duplicate', 'sent_to_vendas'] as any },
      },
    ];
    if (ownershipEnabled) {
      and.push({ ownerCompanyId: null });
    }
    if (safeExcludeIds.length) {
      and.push({ id: { notIn: safeExcludeIds } });
    }
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { AND: and },
      orderBy: [
        { opportunityScore: 'desc' },
        { reviews: 'desc' },
        { rating: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      include: {
        companyStates: {
          where: { companyId },
          take: 1,
          select: {
            status: true,
            vendasLeadId: true,
            assignedUserId: true,
            assignedByUserId: true,
            assignedAt: true,
          },
        },
      },
      take: Math.min(safeLimit * 4, 1000),
    }).catch(() => []);
    return this.dedupeRadarRows((rows || []).filter((row: any) => (
      this.resolveRadarLeadTargetType(row) === 'pj'
      && this.hasUsablePublicContactChannel(row)
    ))).slice(0, safeLimit);
  }

  private async executeMasterRadarAutoDistributionRule(
    user: any,
    rule: any,
    options: { limit?: number; triggeredBy?: 'manual' | 'worker' } = {},
  ) {
    if (!this.vendasService) {
      throw new ServiceUnavailableException('Servico de Vendas indisponivel para distribuicao HBX Master.');
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const context = this.resolveContext(user);
    const status = this.normalizeRadarAutoDistributionStatus(rule?.status);
    if (status !== 'active') {
      throw new BadRequestException('DistribuiÃ§Ã£o HBX Master precisa estar ativa.');
    }
    const territories = this.parseMasterRadarTerritories(rule?.filtersJson).filter((item) => item.cities.length > 0);
    if (!territories.length) {
      throw new BadRequestException('Nenhum territÃ³rio HBX Master configurado.');
    }
    const activeSellers = await this.listMasterRadarDistributionSellers(context.companyId);
    const sellerById = new Map(activeSellers.map((seller) => [Number(seller.id || 0), seller]));
    const targetStockPerSeller = Math.max(1, Math.trunc(Number(rule?.targetStockPerSeller || 30) || 30));
    const dailyLimitPerSeller = this.normalizeDailyDistributionLimit((rule as any)?.dailyLimitPerSeller, 20);
    const dayKey = this.getSaoPauloDayKey();
    const recipients = [] as Array<{
      userId: number;
      label: string;
      cities: Array<{ city: string; state: string }>;
      targetStock: number;
      currentStock: number;
      dailyLimit: number;
      deliveredToday: number;
      dailyRemaining: number;
      noDeliveryReason?: string | null;
      remaining: number;
      delivered: number;
      candidates: any[];
      cursor: number;
      exhausted: boolean;
    }>;

    for (const territory of territories) {
      const seller = sellerById.get(Number(territory.userId || 0));
      if (!seller) continue;
      const sellerDailyLimit = this.resolveSellerDistributionDailyLimit(seller, dailyLimitPerSeller);
      const currentStock = await this.countRadarAutoDistributionOpenStock(context.companyId, Number(seller.id || 0));
      const dailySnapshot = await this.getDailyDistributionSnapshot(context.companyId, Number(seller.id || 0), sellerDailyLimit, dayKey);
      const activeQuota = this.commercialUsageLimits
        ? await this.commercialUsageLimits.getSellerActiveCardQuotaSnapshot(context.companyId, Number(seller.id || 0)).catch(() => null)
        : null;
      const stockRemaining = Math.max(0, targetStockPerSeller - currentStock);
      const dailyRemaining = Math.max(0, Math.trunc(Number(dailySnapshot.remainingToday || 0) || 0));
      const activeRemaining = (activeQuota as any)?.seller ? Math.max(0, Math.trunc(Number((activeQuota as any).availableSlots || 0))) : stockRemaining;
      const remaining = Math.min(stockRemaining, dailyRemaining, activeRemaining);
      const noDeliveryReason = stockRemaining > 0 && dailyRemaining <= 0
        ? 'Limite diÃ¡rio atingido'
        : stockRemaining > 0 && (activeQuota as any)?.seller && activeRemaining <= 0
          ? 'Limite de cards ativos atingido'
          : null;
      if (noDeliveryReason) {
        await this.recordDailyDistributionSkip(
          context.companyId,
          Number(seller.id || 0),
          sellerDailyLimit,
          noDeliveryReason.includes('ativos') ? 'limite_cards_ativos_atingido' : 'limite_diario_atingido',
          dayKey,
        );
      }
      recipients.push({
        userId: Number(seller.id || 0),
        label: String(seller.name || seller.username || seller.email || `Vendedor ${seller.id}`).trim(),
        cities: territory.cities,
        targetStock: targetStockPerSeller,
        currentStock,
        dailyLimit: sellerDailyLimit,
        deliveredToday: Math.max(0, Math.trunc(Number(dailySnapshot.deliveredToday || 0) || 0)),
        dailyRemaining,
        noDeliveryReason,
        remaining,
        delivered: 0,
        candidates: [],
        cursor: 0,
        exhausted: remaining <= 0,
      });
    }

    if (!recipients.length) {
      throw new BadRequestException('Nenhum vendedor HBX ativo encontrado para os territÃ³rios configurados.');
    }

    const totalNeeded = recipients.reduce((sum, recipient) => sum + recipient.remaining, 0);
    const runLimit = Math.min(totalNeeded, this.normalizeRadarAutoDistributionRunLimit(options.limit, 50));
    const seenLeadIds = new Set<string>();
    const assignments: Array<{
      radarLeadId: string;
      vendasLeadId?: string | null;
      userId: number;
      userName: string;
      city?: string | null;
      state?: string | null;
      segment?: string | null;
    }> = [];
    const failures: Array<{ radarLeadId?: string | null; target?: string | null; error: string }> = [];
    let blockedByLimit = false;

    if (runLimit > 0) {
      for (const recipient of recipients) {
        if (recipient.remaining <= 0) continue;
        recipient.candidates = await this.queryMasterRadarTerritoryRows(
          context.companyId,
          recipient.cities,
          Math.min(160, Math.max(recipient.remaining * 6, 24)),
          Array.from(seenLeadIds),
        );
        if (!recipient.candidates.length) recipient.exhausted = true;
      }

      while (assignments.length < runLimit && recipients.some((recipient) => recipient.remaining > 0 && !recipient.exhausted) && !blockedByLimit) {
        let progressed = false;
        for (const recipient of recipients) {
          if (assignments.length >= runLimit || recipient.remaining <= 0 || recipient.exhausted || blockedByLimit) continue;
          while (recipient.cursor < recipient.candidates.length) {
            const row = recipient.candidates[recipient.cursor];
            recipient.cursor += 1;
            const leadId = String(row?.id || '').trim();
            if (!leadId || seenLeadIds.has(leadId)) continue;
            seenLeadIds.add(leadId);
            try {
              const imported = await this.importRadarLeadToVendasForUser(user, leadId, {
                skipWhatsappValidation: true,
                debitOnImport: true,
                assignedUserId: recipient.userId,
                assignedByUserId: context.userId,
              });
              await this.incrementDailyDistributionDelivery(context.companyId, recipient.userId, recipient.dailyLimit, dayKey);
              recipient.delivered += 1;
              recipient.deliveredToday += 1;
              recipient.dailyRemaining = Math.max(0, recipient.dailyRemaining - 1);
              recipient.remaining = Math.max(0, recipient.remaining - 1);
              assignments.push({
                radarLeadId: leadId,
                vendasLeadId: imported?.vendasLeadId || null,
                userId: recipient.userId,
                userName: recipient.label,
                city: row?.city || null,
                state: row?.state || null,
                segment: row?.segment || null,
              });
              progressed = true;
              break;
            } catch (error: any) {
              const reason = String(error?.response?.message || error?.message || error || 'Falha ao distribuir card HBX.');
              failures.push({ radarLeadId: leadId, target: recipient.label, error: reason });
              this.logger.warn(`[radar-auto-distribution] HBX lead ignorado company=${context.companyId} lead=${leadId} target=${recipient.userId}: ${reason}`);
              if (this.isRadarAutoImportLimitError(error)) {
                blockedByLimit = true;
                break;
              }
            }
          }
          if (recipient.cursor >= recipient.candidates.length && recipient.remaining > 0) {
            recipient.exhausted = true;
          }
        }
        if (!progressed && !blockedByLimit) break;
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
      ? shortageCount > 0
        ? `${deliveredCount} card(s) HBX distribuÃ­dos. Ainda faltam ${shortageCount} para completar os estoques.`
        : `${deliveredCount} card(s) HBX distribuÃ­dos por cidade fixa.`
      : totalNeeded <= 0
        ? dailyBlockedCount > 0
          ? 'DistribuiÃ§Ã£o HBX nÃ£o acumulativa: vendedor(es) jÃ¡ atingiram o limite diÃ¡rio.'
          : 'Todos os vendedores HBX jÃ¡ estÃ£o no estoque configurado.'
        : 'Sem cards disponÃ­veis nas cidades fixas agora. A fÃ¡brica pode abastecer o banco e o robÃ´ tenta novamente.';

    return {
      ok: true,
      ran: true,
      mode: 'hbx_master',
      triggeredBy: options.triggeredBy || 'manual',
      requestedCount: totalNeeded,
      queuedCount: runLimit,
      distributedCount: deliveredCount,
      failedCount: failures.length,
      shortageCount,
      blockedByLimit,
      assignments,
      failures: failures.slice(0, 12),
      targets: recipients.map((recipient) => ({
        type: 'seller',
        userId: recipient.userId,
        name: recipient.label,
        targetStock: recipient.targetStock,
        stockBefore: recipient.currentStock,
        dailyLimit: recipient.dailyLimit,
        deliveredTodayBefore: Math.max(0, recipient.deliveredToday - recipient.delivered),
        dailyRemainingAfterEstimate: recipient.dailyRemaining,
        noDeliveryReason: recipient.noDeliveryReason || null,
        delivered: recipient.delivered,
        stockAfterEstimate: recipient.currentStock + recipient.delivered,
        cities: recipient.cities,
      })),
      message,
    };
  }

  async getMasterRadarAutoDistributionPanel(user: any) {
    if (!user?.isSystemMaster) throw new ForbiddenException('Acesso exclusivo do MASTER.');
    const companyId = await this.resolveMasterRadarDistributionCompanyId(user);
    if (!companyId) throw new ServiceUnavailableException('Empresa operacional do MASTER nao encontrada.');
    const radarAutoDistributionRule = (this.prisma as any).radarAutoDistributionRule;
    const [rule, sellers, citySuggestions] = await Promise.all([
      radarAutoDistributionRule?.findUnique
        ? radarAutoDistributionRule.findUnique({
            where: { companyId_scope: { companyId, scope: 'hbx_master' } },
          }).catch(() => null)
        : Promise.resolve(null),
      this.listMasterRadarDistributionSellers(companyId),
      this.listMasterRadarCitySuggestions(),
    ]);
    const territories = this.parseMasterRadarTerritories(rule?.filtersJson);
    const allTerritoryCities = territories.flatMap((item) => item.cities);
    const potentialByCity = await this.estimateRadarPotentialForCities(allTerritoryCities);
    const territoryByUserId = new Map(territories.map((item) => [item.userId, item]));
    const targetStockPerSeller = Math.max(1, Math.trunc(Number(rule?.targetStockPerSeller || 30) || 30));
    const dailyLimitPerSeller = this.normalizeDailyDistributionLimit((rule as any)?.dailyLimitPerSeller, 20);
    const dayKey = this.getSaoPauloDayKey();
    const cityBalance = this.buildMasterRadarCityBalance(citySuggestions, territories, potentialByCity, targetStockPerSeller);
    const sellerStateEntries = await Promise.all(
      sellers.map(async (seller) => {
        const sellerId = Number(seller.id || 0);
        const sellerDailyLimit = this.resolveSellerDistributionDailyLimit(seller, dailyLimitPerSeller);
        const [currentStock, dailySnapshot] = await Promise.all([
          this.countRadarAutoDistributionOpenStock(companyId, sellerId),
          this.getDailyDistributionSnapshot(companyId, sellerId, sellerDailyLimit, dayKey),
        ]);
        return [sellerId, { currentStock, dailySnapshot, sellerDailyLimit }] as const;
      }),
    ) as Array<readonly [number, { currentStock: number; dailySnapshot: any; sellerDailyLimit: number }]>;
    const stateByUserId = new Map<number, { currentStock: number; dailySnapshot: any; sellerDailyLimit: number }>(sellerStateEntries);
    const sellerPayload = sellers.map((seller) => {
      const territory = territoryByUserId.get(Number(seller.id || 0)) || { userId: Number(seller.id || 0), cities: [] };
      const cities = territory.cities.map((item) => {
        const key = `${normalizeLookupValue(item.city)}:${String(item.state || '').toUpperCase()}`;
        return {
          ...item,
          availableCards: potentialByCity.get(key) || 0,
        };
      });
      const availableCards = cities.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.availableCards || 0) || 0)), 0);
      const sellerState = stateByUserId.get(Number(seller.id || 0));
      const currentStock = Math.max(0, Math.trunc(Number(sellerState?.currentStock || 0) || 0));
      const deliveredToday = Math.max(0, Math.trunc(Number(sellerState?.dailySnapshot?.deliveredToday || 0) || 0));
      const sellerDailyLimit = Math.max(0, Math.trunc(Number(sellerState?.sellerDailyLimit ?? dailyLimitPerSeller) || 0));
      const dailyRemaining = Math.max(0, Math.trunc(Number(sellerState?.dailySnapshot?.remainingToday ?? sellerDailyLimit) || 0));
      const remainingStock = Math.max(0, targetStockPerSeller - currentStock);
      const isMapped = cities.length > 0;
      return {
        id: Number(seller.id || 0),
        name: seller.name || seller.username || seller.email || `Vendedor ${seller.id}`,
        email: seller.email || null,
        phone: seller.phone || null,
        commissionPercent: Number(seller.commissionPercent || 0) || 0,
        canRegisterHbxSellers: Boolean(seller.canRegisterHbxSellers),
        inheritedCommissionPercent: Number(seller.sellerReferralCommissionPercent || 0) || 0,
        referredByUserId: Number(seller.referredByUserId || 0) || null,
        preferredSegmentsJson: seller.preferredSegmentsJson || null,
        cities,
        availableCards,
        targetStock: targetStockPerSeller,
        currentStock,
        remainingStock,
        dailyLimit: sellerDailyLimit,
        deliveredToday,
        dailyRemaining,
        noDeliveryReason: remainingStock > 0 && dailyRemaining <= 0 ? 'Limite diÃ¡rio atingido' : null,
        distributionStatus: !isMapped ? 'unmapped' : remainingStock > 0 ? 'needs_cards' : 'full',
      };
    });
    const currentStock = sellerPayload.reduce((sum, seller) => sum + seller.currentStock, 0);
    const missingCards = sellerPayload.reduce((sum, seller) => sum + seller.remainingStock, 0);
    const deliveredToday = sellerPayload.reduce((sum, seller) => sum + seller.deliveredToday, 0);
    const dailyRemaining = sellerPayload.reduce((sum, seller) => sum + seller.dailyRemaining, 0);
    const dailyTarget = sellerPayload.reduce((sum, seller) => sum + seller.dailyLimit, 0);
    return {
      ok: true,
      companyId,
      mode: 'hbx_master',
      status: this.normalizeRadarAutoDistributionStatus(rule?.status),
      segmentMode: 'free',
      territoryMode: 'fixed_cities',
      targetStockPerSeller,
      dailyLimitPerSeller,
      sellers: sellerPayload,
      citySuggestions,
      cityBalance,
      summary: {
        sellerCount: sellerPayload.length,
        coveredSellerCount: sellerPayload.filter((seller) => seller.cities.length > 0).length,
        fullSellerCount: sellerPayload.filter((seller) => seller.distributionStatus === 'full').length,
        pendingSellerCount: sellerPayload.filter((seller) => seller.distributionStatus === 'needs_cards').length,
        unmappedSellerCount: sellerPayload.filter((seller) => seller.distributionStatus === 'unmapped').length,
        cityCount: sellerPayload.reduce((sum, seller) => sum + seller.cities.length, 0),
        availableCards: sellerPayload.reduce((sum, seller) => sum + seller.availableCards, 0),
        targetStock: sellerPayload.length * targetStockPerSeller,
        currentStock,
        missingCards,
        dailyTarget,
        deliveredToday,
        dailyRemaining,
        recommendedSellerSlots: cityBalance.reduce((sum, city) => sum + Math.max(0, city.recommendedSellerCount), 0),
        assignedCitySlots: cityBalance.reduce((sum, city) => sum + Math.max(0, city.assignedSellerCount), 0),
        uncoveredCityCount: cityBalance.filter((city) => city.coverageStatus === 'uncovered').length,
        overloadedCityCount: cityBalance.filter((city) => city.coverageStatus === 'needs_sellers').length,
        balancedCityCount: cityBalance.filter((city) => city.coverageStatus === 'balanced').length,
      },
      lastActivatedAt: rule?.lastActivatedAt instanceof Date ? rule.lastActivatedAt.toISOString() : null,
      lastRunAt: rule?.lastRunAt instanceof Date ? rule.lastRunAt.toISOString() : null,
      updatedAt: rule?.updatedAt instanceof Date ? rule.updatedAt.toISOString() : null,
    };
  }

  async saveMasterRadarAutoDistributionPanel(user: any, input: {
    status?: string;
    targetStockPerSeller?: number;
    dailyLimitPerSeller?: number;
    territories?: Array<{ userId?: number; cities?: Array<{ city?: string; state?: string }> }>;
  } = {}) {
    if (!user?.isSystemMaster) throw new ForbiddenException('Acesso exclusivo do MASTER.');
    const companyId = await this.resolveMasterRadarDistributionCompanyId(user);
    if (!companyId) throw new ServiceUnavailableException('Empresa operacional do MASTER nao encontrada.');
    const existing = await this.prisma.radarAutoDistributionRule.findUnique({
      where: { companyId_scope: { companyId, scope: 'hbx_master' } },
    }).catch(() => null);
    const status = this.normalizeRadarAutoDistributionStatus(input.status, existing?.status || 'draft');
    const targetStockPerSeller = this.normalizeRadarAutoDistributionInt(
      input.targetStockPerSeller,
      Math.max(1, Math.trunc(Number(existing?.targetStockPerSeller || 30) || 30)),
      1,
      500,
    );
    const dailyLimitPerSeller = this.normalizeDailyDistributionLimit(
      input.dailyLimitPerSeller,
      Math.max(0, Math.trunc(Number((existing as any)?.dailyLimitPerSeller || 20) || 20)),
    );
    const sellers = await this.listMasterRadarDistributionSellers(companyId);
    const sellerIds = new Set(sellers.map((seller) => Number(seller.id || 0)));
    const territories = Array.isArray(input.territories)
      ? input.territories
      : this.parseMasterRadarTerritories(existing?.filtersJson);
    const normalizedTerritories = territories.map((item) => {
      const userId = Math.trunc(Number(item?.userId || 0));
      const cities = Array.from(new Map(
        (Array.isArray(item?.cities) ? item.cities : [])
          .map((cityItem: any) => ({
            city: String(cityItem?.city || '').trim(),
            state: String(cityItem?.state || '').trim().toUpperCase(),
          }))
          .filter((cityItem) => cityItem.city && cityItem.state)
          .map((cityItem) => [`${normalizeLookupValue(cityItem.city)}:${cityItem.state}`, cityItem]),
      ).values()).slice(0, 80);
      return { userId, cities };
    }).filter((item) => item.userId > 0 && sellerIds.has(item.userId));
    if (status === 'active' && !normalizedTerritories.some((item) => item.cities.length > 0)) {
      throw new BadRequestException('Defina pelo menos uma cidade fixa antes de ativar a distribuiÃ§Ã£o HBX Master.');
    }
    const targetUserIds = normalizedTerritories
      .filter((item) => item.cities.length > 0)
      .map((item) => item.userId);
    const filtersJson = JSON.stringify({
      territoryMode: 'fixed_cities',
      segmentMode: 'free',
      rule: 'MASTER escolhe cidades; vendedor escolhe segmento no Vendas.',
      territories: normalizedTerritories,
    });
    const now = new Date();
    await this.prisma.radarAutoDistributionRule.upsert({
      where: { companyId_scope: { companyId, scope: 'hbx_master' } },
      create: {
        companyId,
        scope: 'hbx_master',
        status,
        includeAdmin: false,
        adminUserId: null,
        adminTargetStock: 0,
        targetStockPerSeller,
        dailyLimitPerSeller,
        targetUserIdsJson: targetUserIds.length ? JSON.stringify(targetUserIds) : null,
        filtersJson,
        createdByUserId: Math.trunc(Number(user?.id || 0)) || null,
        updatedByUserId: Math.trunc(Number(user?.id || 0)) || null,
        lastActivatedAt: status === 'active' ? now : null,
      },
      update: {
        status,
        includeAdmin: false,
        adminUserId: null,
        adminTargetStock: 0,
        targetStockPerSeller,
        dailyLimitPerSeller,
        targetUserIdsJson: targetUserIds.length ? JSON.stringify(targetUserIds) : null,
        filtersJson,
        updatedByUserId: Math.trunc(Number(user?.id || 0)) || null,
        ...(status === 'active' && existing?.status !== 'active' ? { lastActivatedAt: now } : {}),
      },
    });
    const panel = await this.getMasterRadarAutoDistributionPanel(user);
    return {
      ...panel,
      message: status === 'active'
        ? 'TerritÃ³rios HBX Master ativados. As cidades ficam fixas por vendedor; os segmentos ficam livres no Vendas e o limite diÃ¡rio nÃ£o acumula.'
        : 'TerritÃ³rios HBX Master salvos.',
    };
  }

  async runMasterRadarAutoDistributionForUser(user: any, input: { limit?: number } = {}) {
    if (!user?.isSystemMaster) throw new ForbiddenException('Acesso exclusivo do MASTER.');
    const companyId = await this.resolveMasterRadarDistributionCompanyId(user);
    if (!companyId) throw new ServiceUnavailableException('Empresa operacional do MASTER nao encontrada.');
    const rule = await this.prisma.radarAutoDistributionRule.findUnique({
      where: { companyId_scope: { companyId, scope: 'hbx_master' } },
    }).catch(() => null);
    if (!rule) throw new BadRequestException('Configure os territÃ³rios HBX Master antes de alimentar vendedores.');
    const runner = {
      id: Number(user?.id || 0),
      companyId,
      role: String(user?.role || 'USERMASTER'),
      isSystemMaster: true,
      masterContext: {
        active: true,
        companyId,
        mode: 'master_operational',
      },
    };
    return this.executeMasterRadarAutoDistributionRule(runner, rule, {
      limit: input?.limit,
      triggeredBy: 'manual',
    });
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
    for (const row of rows || []) {
      if (this.isHbxOperationSellerUser(user)) {
        const assignedToUser = (Array.isArray(row?.companyStates) ? row.companyStates : [])
          .some((state: any) => Number(state?.assignedUserId || 0) === context.userId);
        if (!assignedToUser) continue;
      }
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
          opportunityReason: 'Criado para proteger histÃ³rico operacional de Vendas.',
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
        privateNotes: input.source || 'Vendas AutomaÃ§Ã£o',
      });
    }
    return this.markRadarLeadNegativeForUser(user, row.id, {
      status: input.status,
      reason: input.reason || input.status,
      privateNotes: input.source || 'Vendas AutomaÃ§Ã£o',
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
      throw new ForbiddenException('Este card jÃ¡ estÃ¡ na carteira de outra empresa.');
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
          : normalizedStatus === 'opt_out' || normalizedStatus === 'optout' || normalizedStatus === 'do_not_contact' || normalizedStatus === 'nao_quer_contato' || normalizedStatus === 'nÃ£o_quer_contato'
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
      await (this.prisma as any).radarLeadPool.update({
        where: { id: row.id },
        data: {
          ...(ownershipEnabled ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
          status,
          deniedReason: ['negative', 'denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : undefined,
          complaintReason: status === 'complaint' ? String(input.reason || '').trim() || null : undefined,
          recommendedChannel: 'discard',
          enrichmentScore: 0,
          globalNegativeCount: { increment: 1 },
          lastSeenAt: now,
        },
      }).catch(() => null);
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
}
