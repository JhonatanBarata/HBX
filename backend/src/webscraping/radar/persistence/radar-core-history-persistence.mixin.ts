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
  buildWaLink,
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

export class RadarCoreHistoryPersistenceMixin {
  [key: string]: any;
  private async getHistoryPlaceColumnSupport(): Promise<HistoryPlaceColumnSupport> {
    const [source, score, opportunityReason] = await Promise.all([
      this.prisma.hasColumn('WebscrapingSearchPlace', 'source'),
      this.prisma.hasColumn('WebscrapingSearchPlace', 'score'),
      this.prisma.hasColumn('WebscrapingSearchPlace', 'opportunityReason'),
    ]);
    return { source, score, opportunityReason };
  }

  private buildHistoryPlaceSelect(columnSupport: HistoryPlaceColumnSupport) {
    return {
      id: true,
      placeId: true,
      rank: true,
      name: true,
      phone: true,
      phoneDigits: true,
      rating: true,
      reviews: true,
      address: true,
      website: true,
      ...(columnSupport.source ? { source: true } : {}),
      ...(columnSupport.score ? { score: true } : {}),
      ...(columnSupport.opportunityReason ? { opportunityReason: true } : {}),
    };
  }

  private buildGlobalCacheValidUntil(date = new Date()) {
    return new Date(date.getTime() + GLOBAL_CACHE_TTL_HOURS * 60 * 60 * 1000);
  }

  private async findHistoryBySignature(
    companyId: number,
    searchSignature: string,
    historyIdHint?: string,
    input?: NormalizedSearchInput,
  ): Promise<SearchHistoryRow | null> {
    const historyPlaceSelect = this.buildHistoryPlaceSelect(await this.getHistoryPlaceColumnSupport());
    if (historyIdHint) {
      const hinted = await this.findHistoryById(companyId, historyIdHint);
      if (hinted) return hinted as SearchHistoryRow;
    }

    const row = await this.prisma.webscrapingSearchHistory.findUnique({
      where: {
        companyId_searchSignature: {
          companyId,
          searchSignature,
        },
      },
      select: {
        id: true,
        userId: true,
        city: true,
        segment: true,
        quantity: true,
        filtersJson: true,
        searchSignature: true,
        resultCount: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        places: {
          orderBy: [{ rank: 'asc' }],
          select: historyPlaceSelect,
        },
      },
    });
    if (row) return row as SearchHistoryRow;

    if (!input) return null;

    const targetDedupeKey = this.buildHistoryDedupeKey({
      city: input.city,
      state: input.state,
      segment: input.segment,
      filtersJson: input.filtersJson,
      searchSignature: input.searchSignature,
      filters: input.filters,
    });
    const candidates = await this.prisma.webscrapingSearchHistory.findMany({
      where: { companyId },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 80,
      select: {
        id: true,
        userId: true,
        city: true,
        segment: true,
        quantity: true,
        filtersJson: true,
        searchSignature: true,
        resultCount: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        places: {
          orderBy: [{ rank: 'asc' }],
          select: historyPlaceSelect,
        },
      },
    }).catch(() => []);
    const exactCandidate = candidates.find((candidate: any) => this.buildHistoryDedupeKey({
      city: candidate.city,
      state: this.extractSignaturePart(candidate.searchSignature, 'state').toUpperCase(),
      segment: candidate.segment,
      filtersJson: candidate.filtersJson,
      searchSignature: candidate.searchSignature,
    }) === targetDedupeKey) as SearchHistoryRow | undefined;
    if (exactCandidate) return exactCandidate;

    return null;
  }

  private async findHistoryById(companyId: number, historyId: string): Promise<SearchHistoryRow | null> {
    const historyPlaceSelect = this.buildHistoryPlaceSelect(await this.getHistoryPlaceColumnSupport());
    const row = await this.prisma.webscrapingSearchHistory.findFirst({
      where: {
        id: String(historyId || '').trim(),
        companyId,
      },
      select: {
        id: true,
        userId: true,
        city: true,
        segment: true,
        quantity: true,
        filtersJson: true,
        searchSignature: true,
        resultCount: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        places: {
          orderBy: [{ rank: 'asc' }],
          select: historyPlaceSelect,
        },
      },
    });
    return (row as SearchHistoryRow | null) || null;
  }

  private isExecutedUsageEvent(eventType: UsageEventType) {
    return eventType === 'EXECUTED' || eventType === 'GOOGLE_SEARCH_EXECUTED' || eventType === 'GOOGLE_EMERGENCY_EXECUTED';
  }

  private async findGlobalCacheBySignature(cacheSignature: string): Promise<GlobalCacheRow | null> {
    const row = await this.prisma.webscrapingGlobalCacheEntry.findUnique({
      where: {
        cacheSignature: String(cacheSignature || '').trim(),
      },
      include: {
        places: {
          orderBy: [{ rank: 'asc' }],
        },
      },
    });

    if (!row) return null;
    if (!(row.cacheValidUntil instanceof Date) || row.cacheValidUntil.getTime() <= Date.now()) {
      return null;
    }
    return row as GlobalCacheRow;
  }

  private async findGlobalCacheById(cacheId: string): Promise<GlobalCacheRow | null> {
    const row = await this.prisma.webscrapingGlobalCacheEntry.findUnique({
      where: {
        id: String(cacheId || '').trim(),
      },
      include: {
        places: {
          orderBy: [{ rank: 'asc' }],
        },
      },
    });

    if (!row) return null;
    if (!(row.cacheValidUntil instanceof Date) || row.cacheValidUntil.getTime() <= Date.now()) {
      return null;
    }
    return row as GlobalCacheRow;
  }

  private async touchHistory(historyId: string, userId: number) {
    await this.prisma.webscrapingSearchHistory.update({
      where: { id: historyId },
      data: {
        userId,
        lastUsedAt: new Date(),
      },
    }).catch(() => null);
  }

  private async touchGlobalCache(cacheId: string) {
    await this.prisma.webscrapingGlobalCacheEntry.update({
      where: { id: cacheId },
      data: {
        lastServedAt: new Date(),
      },
    }).catch(() => null);
  }

  private async pruneCompanyHistory(companyId: number, limit = RECENT_HISTORY_LIMIT) {
    const rows = await this.prisma.webscrapingSearchHistory.findMany({
      where: { companyId },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 240,
      select: {
        id: true,
        city: true,
        segment: true,
        filtersJson: true,
        searchSignature: true,
      },
    }).catch(() => []);

    if (!rows.length) return;

    const seen = new Set<string>();
    const deleteIds: string[] = [];
    let kept = 0;

    for (const row of rows) {
      const dedupeKey = this.buildHistoryDedupeKey({
        city: row.city,
        state: this.extractSignaturePart(row.searchSignature, 'state').toUpperCase(),
        segment: row.segment,
        filtersJson: row.filtersJson,
        searchSignature: row.searchSignature,
      });
      if (seen.has(dedupeKey) || kept >= limit) {
        deleteIds.push(row.id);
        continue;
      }
      seen.add(dedupeKey);
      kept += 1;
    }

    if (deleteIds.length) {
      await this.prisma.webscrapingSearchHistory.deleteMany({
        where: {
          companyId,
          id: { in: deleteIds },
        },
      }).catch(() => null);
    }
  }

  private async persistHistory(
    context: SearchExecutionContext,
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    existingHistoryId: string | null,
  ) {
    const now = new Date();
    const dedupedResults = this.mergeDedupedContacts(results);
    const historyPlaceColumns = await this.getHistoryPlaceColumnSupport();
    const placeRows = dedupedResults.map((result, index) => ({
      placeId: result.placeId,
      rank: index + 1,
      name: result.name,
      phone: result.phone,
      phoneDigits: result.phoneDigits,
      rating: result.rating,
      reviews: safeInteger(result.reviews),
      address: result.address || '',
      website: result.website || '',
      ...(historyPlaceColumns.source ? { source: result.source || null } : {}),
      ...(historyPlaceColumns.score ? { score: result.score == null ? null : result.score } : {}),
      ...(historyPlaceColumns.opportunityReason
        ? { opportunityReason: result.opportunityReason || this.buildOpportunityReason(result, input) }
        : {}),
    }));

    const saved = await this.prisma.webscrapingSearchHistory.upsert({
      where: {
        companyId_searchSignature: {
          companyId: context.companyId,
          searchSignature: input.searchSignature,
        },
      },
      create: {
        companyId: context.companyId,
        userId: context.userId,
        city: input.city,
        segment: input.segment,
        quantity: input.quantity,
        filtersJson: input.filtersJson,
        searchSignature: input.searchSignature,
        resultCount: dedupedResults.length,
        lastUsedAt: now,
        places: {
          create: placeRows,
        },
      },
      update: {
        userId: context.userId,
        city: input.city,
        segment: input.segment,
        quantity: input.quantity,
        filtersJson: input.filtersJson,
        resultCount: dedupedResults.length,
        lastUsedAt: now,
        places: {
          deleteMany: {},
          create: placeRows,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingHistoryId && existingHistoryId !== saved.id) {
      await this.prisma.webscrapingSearchHistory.delete({
        where: { id: existingHistoryId },
      }).catch(() => null);
    }

    await this.pruneCompanyHistory(context.companyId, RECENT_HISTORY_LIMIT);

    return saved.id;
  }

  private async persistGlobalCache(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    existingCacheId: string | null,
  ) {
    const now = new Date();
    const cacheValidUntil = this.buildGlobalCacheValidUntil(now);
    const placeRows = results.map((result, index) => ({
      placeId: result.placeId,
      rank: index + 1,
      name: result.name,
      phone: result.phone,
      phoneDigits: result.phoneDigits,
      rating: result.rating,
      reviews: safeInteger(result.reviews),
      address: result.address || '',
      website: result.website || '',
    }));

    const saved = await this.prisma.webscrapingGlobalCacheEntry.upsert({
      where: {
        cacheSignature: input.cacheSignature,
      },
      create: {
        cacheSignature: input.cacheSignature,
        normalizedCity: input.normalizedCity,
        normalizedSegment: input.normalizedSegment,
        filtersJson: input.filtersJson,
        resultCount: results.length,
        cacheValidUntil,
        lastFetchedAt: now,
        lastServedAt: now,
        places: {
          create: placeRows,
        },
      },
      update: {
        normalizedCity: input.normalizedCity,
        normalizedSegment: input.normalizedSegment,
        filtersJson: input.filtersJson,
        resultCount: results.length,
        cacheValidUntil,
        lastFetchedAt: now,
        lastServedAt: now,
        places: {
          deleteMany: {},
          create: placeRows,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingCacheId && existingCacheId !== saved.id) {
      await this.prisma.webscrapingGlobalCacheEntry.delete({
        where: { id: existingCacheId },
      }).catch(() => null);
    }

    return saved.id;
  }

  private buildSpeakerName(user: any) {
    return String(user?.name || user?.username || '').trim() || '[SEU NOME]';
  }

  private buildCompanyName(user: any) {
    return String(
      (user?.masterContext?.active ? user?.masterContext?.companyName : user?.company?.name)
      || user?.company?.name
      || '',
    ).trim() || '[SUA EMPRESA]';
  }

  private buildScriptText(
    result: Omit<WebscrapingContactResult, 'placeId'>,
    city: string,
    segment: string,
    user: any,
  ) {
    return [
      `Oi, tudo bem? Aqui é ${this.buildSpeakerName(user)} da ${this.buildCompanyName(user)}.`,
      `Vi a ${result.name} em ${city} e trabalho com solução para ${segment.toLowerCase()}.`,
      'Posso te explicar em 1 minuto e ver se faz sentido para vocês?',
    ].join(' ');
  }

  private buildExportFilename(segment: string, city: string) {
    const normalize = (value: string) =>
      normalizeLookupValue(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const date = new Date().toISOString().slice(0, 10);
    return `prospeccao-${normalize(segment)}-${normalize(city)}-${date}.xlsx`;
  }

  private buildWhatsAppTarget(phone: string, scriptText: string) {
    return buildWaLink(phone, { text: scriptText }) || '';
  }
}
