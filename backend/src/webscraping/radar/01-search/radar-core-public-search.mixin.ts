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

export class RadarCorePublicSearchMixin {
  [key: string]: any;
  private async canAcquireHbxEngineFromPool() {
    return Boolean((this.prisma as any).hbxEngineLock?.updateMany)
      && await this.prisma.hasTable('HbxEngineLock').catch(() => false);
  }

  async getRuntime(user: any): Promise<WebscrapingRuntimeResponse> {
    const native = this.inspectNativeRuntime();
    const hbx = await this.inspectHbxRuntime();
    const quota = await this.buildRuntimeQuota(user);
    if (!this.canSeeDiagnostics(user)) {
      return { native, hbx, quota };
    }

    let legacy: WebscrapingRuntimeDiagnostic | null = null;
    try {
      legacy = await probeWebscrapingRuntime();
    } catch {
      legacy = null;
    }

    return {
      native,
      hbx,
      quota,
      diagnostics: {
        checkedAt: new Date().toISOString(),
        nativeTechnicalMessage: this.buildNativeTechnicalMessage(native),
        hbxTechnicalMessage: this.buildHbxTechnicalMessage(hbx),
        legacy,
      },
    };
  }

  inspectNativeRuntime(): NativeRuntimeDiagnostic {
    const apiKey = this.getApiKey(false);
    if (!apiKey) {
      return {
        status: 'degraded',
        code: 'configuration_pending',
        message: 'Modulo temporariamente em configuracao.',
        googleApiKeyConfigured: false,
      };
    }

    return {
      status: 'online',
      code: 'ok',
      message: 'Busca nativa pronta para prospeccao.',
      googleApiKeyConfigured: true,
    };
  }

  async inspectHbxRuntime(): Promise<HbxRuntimeDiagnostic> {
    const engineUrl = this.getHbxScrapingEngineUrl();
    const healthUrl = `${engineUrl}/health`;

    try {
      const response = await fetch(healthUrl, {
        headers: { Accept: 'application/json,text/plain' },
        signal: AbortSignal.timeout(4000),
      });
      await response.text().catch(() => '');

      if (!response.ok) {
        return {
          status: 'offline',
          code: 'hbx_health_http_error',
          message: `Motor HBX respondeu HTTP ${response.status} no healthcheck.`,
          healthUrl,
          httpStatus: response.status,
        };
      }

      return {
        status: 'online',
        code: 'ok',
        message: 'Motor HBX Scraping online.',
        healthUrl,
        httpStatus: response.status,
      };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'TimeoutError';
      return {
        status: 'offline',
        code: isAbort ? 'hbx_health_timeout' : 'hbx_health_unreachable',
        message: isAbort
          ? 'Motor HBX Scraping nao respondeu ao healthcheck dentro do limite.'
          : 'Nao foi possivel alcancar o Motor HBX Scraping.',
        healthUrl,
        httpStatus: null,
      };
    }
  }

  async listBrazilianCities(query?: string, limit = 80) {
    const items = await this.loadBrazilianCities();
    const normalizedQuery = normalizeLookupValue(String(query || ''));
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 0), 1), 6000);

    const filtered = normalizedQuery
      ? items
          .map((city) => ({
            city,
            normalized: normalizeLookupValue(city),
          }))
          .filter((item) => item.normalized.includes(normalizedQuery))
          .sort((left, right) => {
            const leftStarts = left.normalized.startsWith(normalizedQuery) ? 0 : 1;
            const rightStarts = right.normalized.startsWith(normalizedQuery) ? 0 : 1;
            return leftStarts - rightStarts || left.city.localeCompare(right.city, 'pt-BR');
          })
          .map((item) => item.city)
      : items;

    return {
      items: filtered.slice(0, safeLimit),
      total: filtered.length,
    };
  }

  async startSearchRunForUser(user: any, input: SearchContactsInput) {
    const context = this.resolveContext(user);
    const normalized = this.normalizeSearchInput({
      ...input,
      engine: 'hbx',
      targetType: input?.targetType || 'pj',
    });
    await this.assertSearchRunPersistence();

    const canReadRadarDatabase = normalized.targetType === 'pj'
      ? await this.supportsRadarPersistence().catch(() => false)
      : false;
    const databaseResults = canReadRadarDatabase
      ? await this.listRadarContactsForSearch(context, normalized).catch(() => [])
      : [];

    if (databaseResults.length >= normalized.quantity) {
      const now = new Date();
      const run = await this.prisma.webscrapingSearchRun.create({
        data: {
          companyId: context.companyId,
          userId: context.userId,
          status: 'completed',
          city: normalized.city,
          state: normalized.state || null,
          segment: normalized.segment,
          engine: normalized.engine,
          targetType: normalized.targetType,
          targetQuantity: normalized.quantity,
          startedAt: now,
          finishedAt: now,
          errorMessage: 'Entregue do banco Radar. O motor de busca nao foi acionado.',
          metricsJson: this.buildSearchRunMetricsJson(normalized),
        },
        select: {
          id: true,
          status: true,
          city: true,
          state: true,
          segment: true,
          engine: true,
          targetType: true,
          targetQuantity: true,
          createdAt: true,
        },
      });

      const savedCounts = await this.saveSearchRunResults(
        context,
        normalized,
        run.id,
        databaseResults.slice(0, normalized.quantity),
        'radar_database',
      );
      await this.recalculateSearchRunCounters(run.id);
      await this.updateSearchRunMetrics(run.id, {
        sourceEngine: 'radar_database',
        cacheHit: true,
        status: 'completed',
      }).catch(() => null);
      await this.persistSearchRunHistoryIfPossible(run.id, normalized, context).catch(() => null);

      return {
        runId: run.id,
        id: run.id,
        status: run.status as WebscrapingSearchRunStatus,
        query: {
          city: run.city,
          state: run.state || null,
          segment: run.segment,
          quantity: run.targetQuantity,
          engine: normalizeEngine(run.engine),
          targetType: normalizeTargetType(run.targetType),
          filters: normalized.filters,
        },
        createdAt: run.createdAt.toISOString(),
      };
    }

    const run = await this.prisma.webscrapingSearchRun.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        status: 'queued',
        city: normalized.city,
        state: normalized.state || null,
        segment: normalized.segment,
        engine: normalized.engine,
        targetType: normalized.targetType,
        targetQuantity: normalized.quantity,
        metricsJson: this.buildSearchRunMetricsJson(normalized),
      },
      select: {
        id: true,
        status: true,
        city: true,
        state: true,
        segment: true,
        engine: true,
        targetType: true,
        targetQuantity: true,
        createdAt: true,
      },
    });

    setTimeout(() => {
      void this.processNextQueuedSearchRun();
    }, 0);

    return {
      runId: run.id,
      id: run.id,
      status: run.status as WebscrapingSearchRunStatus,
      query: {
        city: run.city,
        state: run.state || null,
        segment: run.segment,
        quantity: run.targetQuantity,
        engine: normalizeEngine(run.engine),
        targetType: normalizeTargetType(run.targetType),
        filters: normalized.filters,
      },
      createdAt: run.createdAt.toISOString(),
    };
  }

  async getSearchRunForUser(user: any, runId: string): Promise<WebscrapingSearchRunResponse> {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    // LIMPEZA-DESTRUTIVA L3: pesquisa e da EMPRESA, nao do vendedor que a iniciou —
    // qualquer papel da empresa pode ver o run.
    let run = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        id: String(runId || '').trim(),
        companyId: context.companyId,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Pesquisa nao encontrada.');
    run = await this.requeueStaleAssignedSearchRunIfNeeded(run);
    const capacity = await this.getEnginePool().getCurrentCapacityLevel().catch(() => null);
    return this.buildSearchRunResponse(run, capacity || undefined);
  }

  async cancelSearchRunForUser(user: any, runId: string): Promise<WebscrapingSearchRunResponse> {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    // LIMPEZA-DESTRUTIVA L3: qualquer papel da empresa pode cancelar o run (lagoa unica).
    const current = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        id: String(runId || '').trim(),
        companyId: context.companyId,
      },
      select: {
        id: true,
        status: true,
        assignedEngineId: true,
      },
    });
    if (!current) throw new NotFoundException('Pesquisa nao encontrada.');

    if (!this.isTerminalSearchRunStatus(current.status)) {
      await this.prisma.webscrapingSearchRun.update({
        where: { id: current.id },
        data: {
          status: 'canceled',
          finishedAt: new Date(),
          errorMessage: 'Pesquisa cancelada pelo usuario.',
          nextRetryAt: null,
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
        },
      });
      if (current.assignedEngineId) {
        await this.getEnginePool().releaseEngine(String(current.assignedEngineId)).catch(() => null);
      }
      await this.releaseRadarReservationsForSearchRun(context, current.id, 'Pesquisa parada pelo usuario.').catch((error: any) => {
        this.logger.warn(`[radar-run] falha ao limpar reservas do run cancelado=${current.id}: ${String(error?.message || error)}`);
      });
    }

    return this.getSearchRunForUser(user, current.id);
  }

  async searchContactsForUser(
    user: any,
    input: SearchContactsInput,
    options: SearchExecutionOptions = {},
  ): Promise<WebscrapingSearchResponse> {
    const context = this.resolveContext(user);
    let purpose = normalizeEnginePurpose(options.purpose);
    const requestedEngine = normalizeEngine(input?.engine);
    const safeInput: SearchContactsInput = isAutomaticEnginePurpose(purpose) && requestedEngine === 'google'
      ? { ...input, engine: 'hbx' }
      : input;
    if (safeInput !== input) {
      this.logger.warn(`[engine-scheduler] google blocked for ${purpose} purpose`);
      this.logger.warn('[autonomous-bank] skipped google for autonomous bank');
    }
    const hbxPrimaryInput = safeInput;
    const normalized = this.normalizeSearchInput(hbxPrimaryInput);
    this.logSearchSelection(normalized);
    const hasExplicitExclusions = normalized.excludePhoneDigits.length > 0;
    const allowStoredLeadLookup = normalized.freshness !== 'live';
    const radarEnabled = allowStoredLeadLookup && !options.skipRadarLookup && normalized.targetType === 'pj'
      ? await this.supportsRadarPersistence()
      : false;
    const radarResults = radarEnabled
      ? await this.listRadarContactsForSearch(context, normalized)
      : [];
    const historyEnabled = allowStoredLeadLookup && !options.skipPrivateHistory && await this.supportsHistoryPersistence();
    const existingHistory = historyEnabled
      ? await this.findHistoryBySignature(context.companyId, normalized.searchSignature, options.historyIdHint, normalized)
      : null;
    const companyStoredResults = hasExplicitExclusions
      ? []
      : this.sortContacts(this.restoreStoredResults(existingHistory))
        .filter((result) => this.matchesFilters(result, normalized.filters));
    const storedMerge = this.getRadarResultMerger().mergeSources([
      { source: 'radar_database', results: radarResults },
      { source: 'company_history', results: companyStoredResults },
    ]);
    const storedResults = this.sortContacts(storedMerge.results)
      .filter((result) => this.matchesFilters(result, normalized.filters));
    const globalCacheEnabled = allowStoredLeadLookup && !options.skipTechnicalCache && await this.supportsGlobalCachePersistence();
    const globalCacheEntry = globalCacheEnabled
      ? await this.findGlobalCacheBySignature(normalized.cacheSignature)
      : null;
    const cachedPublicResults = this.sortContacts(this.restoreGlobalCacheResults(globalCacheEntry))
      .filter((result) => this.matchesFilters(result, normalized.filters));

    if (this.countDeliverableResults(normalized, storedResults) >= normalized.quantity) {
      if (existingHistory) {
        await this.touchHistory(existingHistory.id, context.userId);
      }
      const response = this.buildSearchResponse(normalized, storedResults.slice(0, normalized.quantity), {
        historyId: existingHistory?.id || null,
        source: this.buildStoredResultSource(radarResults, companyStoredResults),
        reusedCount: Math.min(storedResults.length, normalized.quantity),
        fetchedCount: 0,
        technicalCacheUsed: false,
        technicalCacheReusedCount: 0,
        technicalCacheValidUntil: null,
      });
      if (options.recordUsage !== false) {
        await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      }
      this.logSearchResult(normalized, response.results.length);
      return response;
    }

    if (normalized.engine === 'hbx') {
      const results = [...storedResults];
      const seenPhones = new Set([
        ...storedResults.map((item) => item.phoneDigits).filter(Boolean),
        ...normalized.excludePhoneDigits,
      ]);
      let fetchedCount = 0;
      let hbxResults: WebscrapingContactResult[] = [];
      let hbxStatus: SearchRunStatus = 'completed';
      let hbxMessage: string | null = null;
      let hbxError: unknown = null;
      let hbxTelemetry: Partial<HbxEngineSearchOutput> = {};

      const canUsePool = !options.hbxEngineUrl && await this.canAcquireHbxEngineFromPool();
      const maxEngineAttempts = (purpose === 'radar_pull' || purpose === 'radar_digital') && canUsePool ? this.getRadarPullEngineAttempts() : 1;
      let avoidEngineIdOrUrl = '';

      for (let engineAttempt = 1; engineAttempt <= maxEngineAttempts; engineAttempt += 1) {
        let acquiredLease: HbxEngineLease | null = null;
        let hbxEngineUrl = options.hbxEngineUrl;
        try {
          if (!hbxEngineUrl && canUsePool) {
            acquiredLease = await this.getEnginePool().acquireEngine(
              `sync:${purpose}:${context.companyId}:${context.userId}:${Date.now()}:${engineAttempt}`,
              context.companyId,
              context.userId,
              { purpose, avoidEngineIdOrUrl },
            );
            if (!acquiredLease) {
              throw new ServiceUnavailableException('Aguardando motor HBX livre.');
            }
            hbxEngineUrl = acquiredLease.url;
          }
          const engineInput: NormalizedSearchInput = {
            ...normalized,
            requiredChannels: [],
            channelMatchMode: 'prefer',
          };
          const hbxOutput = await this.searchHbxEngine(
            engineInput,
            Array.from(seenPhones),
            hbxEngineUrl,
            purpose === 'radar_pull' || purpose === 'radar_digital'
              ? { timeoutMs: this.getRadarClientRequestTimeoutMs(), batchLimit: normalized.quantity }
              : {},
          );
          hbxResults = await this.filterProtectedRadarContacts(context, hbxOutput.results);
          hbxStatus = hbxOutput.status;
          hbxMessage = hbxOutput.message;
          hbxTelemetry = hbxOutput;
          hbxError = null;
          await this.recordSourceQualityFromEngineMetrics(hbxOutput.sourceMetrics).catch(() => null);
          if (acquiredLease) {
            await this.getEnginePool().releaseEngine(acquiredLease.engineId).catch(() => null);
          }
          break;
        } catch (error) {
          hbxError = error;
          const errorMessage = this.extractHbxErrorMessage(error);
          if (acquiredLease) {
            avoidEngineIdOrUrl = acquiredLease.engineId;
            await this.getEnginePool().markEngineBatchError(acquiredLease.engineId, error).catch(() => null);
            await this.getEnginePool().releaseEngine(acquiredLease.engineId).catch(() => null);
            this.logger.warn(
              `[radar] motor HBX falhou; engine=${acquiredLease.engineId} url=${acquiredLease.url} purpose=${purpose} city=${normalized.city} state=${normalized.state} segment=${normalized.segment} targetType=${normalized.targetType} companyId=${context.companyId}: ${errorMessage}`,
            );
          } else {
            this.logger.warn(
              `[radar] motor HBX indisponivel purpose=${purpose} city=${normalized.city} state=${normalized.state} segment=${normalized.segment} targetType=${normalized.targetType} companyId=${context.companyId}: ${errorMessage}`,
            );
          }
          if (
            options.hbxEngineUrl ||
            !canUsePool ||
            !this.isRetryableHbxError(error) ||
            engineAttempt >= maxEngineAttempts
          ) {
            break;
          }
        }
      }

      if (hbxError && (purpose === 'radar_pull' || purpose === 'radar_digital')) {
        const errorMessage = this.extractHbxErrorMessage(hbxError);
        this.logger.warn(
          `[radar] todos os motores tentados falharam city=${normalized.city} state=${normalized.state} segment=${normalized.segment} targetType=${normalized.targetType} companyId=${context.companyId}: ${errorMessage}`,
        );
      }

      for (const mapped of hbxResults) {
        if (this.countDeliverableResults(normalized, results) >= normalized.quantity) break;
        if (!this.shouldKeepNewContact(mapped, results, seenPhones)) continue;
        if (!this.matchesFilters(mapped, normalized.filters)) continue;
        if (mapped.phoneDigits) seenPhones.add(mapped.phoneDigits);
        results.push(mapped);
        fetchedCount += 1;
      }

      let orderedResults = this.sortContacts(results);
      const sourceEnginesUsed = new Set<string>(['hbx']);
      const sourceDiagnostics: any[] = [];
      let googleFallbackCount = 0;
      if (this.countDeliverableResults(normalized, orderedResults) < normalized.quantity && this.shouldUseGoogleFallbackAfterHbx(normalized, options)) {
        try {
          const fallbackResponse = await this.searchContactsForUser(
            user,
            {
              ...safeInput,
              engine: 'google',
              quantity: Math.max(1, normalized.quantity - orderedResults.length),
              excludePhoneDigits: Array.from(seenPhones),
            },
            {
              ...options,
              purpose: 'manual',
              hbxEngineUrl: undefined,
              skipRadarLookup: true,
              skipPrivateHistory: true,
              skipTechnicalCache: false,
              usageEventType: 'GOOGLE_SEARCH_EXECUTED',
            },
          );
          sourceEnginesUsed.add('google');
          for (const fallbackResult of fallbackResponse.results as WebscrapingContactResult[]) {
            if (this.countDeliverableResults(normalized, results) >= normalized.quantity) break;
            const candidate = { ...fallbackResult, source: fallbackResult.source || 'google' } as WebscrapingContactResult;
            if (!this.shouldKeepNewContact(candidate, results, seenPhones)) continue;
            if (!this.matchesFilters(candidate, normalized.filters)) continue;
            if (candidate.phoneDigits) seenPhones.add(candidate.phoneDigits);
            results.push(candidate);
            fetchedCount += 1;
            googleFallbackCount += 1;
          }
          orderedResults = this.sortContacts(results);
        } catch (error) {
          this.logger.warn(`[radar] fallback Google falhou apos HBX: ${String((error as any)?.message || error)}`);
        }
      }
      const deliverableCountBeforeOptional = this.countDeliverableResults(normalized, orderedResults);
      const hasPoorCardsForOptionalEnrichment = orderedResults.some((result: any) => {
        const phoneDigits = normalizePhoneDigits(result?.phoneDigits || result?.phone);
        if (!phoneDigits || phoneDigits.length < 10) return false;
        return !String(result?.website || '').trim()
          || !String(result?.email || '').trim()
          || !String(result?.instagramUrl || result?.facebookUrl || '').trim();
      });
      if (
        String(process.env.HBX_RADAR_SEARCH_STRATEGY_ENGINE_ENABLED || '').trim().toLowerCase() === 'true'
        && (deliverableCountBeforeOptional < normalized.quantity || hasPoorCardsForOptionalEnrichment)
      ) {
        const orchestration = this.getRadarSearchOrchestrator().plan(normalized, { purpose });
        const optionalExecution = await this.getRadarSourceExecutor().execute({
          context,
          normalized,
          currentResults: orderedResults,
          seenPhones,
          options,
          sourcePlan: orchestration.sources,
          remainingQuantity: Math.max(0, normalized.quantity - deliverableCountBeforeOptional),
          purpose,
          host: {
            prisma: this.prisma,
            logger: this.logger,
            searchHbxEngine: (nextInput, existing, engineUrl, executionOptions) => this.searchHbxEngine(nextInput, existing, engineUrl, executionOptions),
            getRadarInternalReprocessSource: () => this.getRadarInternalReprocessSource(),
            getGoogleSearchProvider: () => this.getGoogleSearchProvider(),
            getRadarSourceExpansion: () => this.getRadarSourceExpansion(),
            getRadarSearchStrategy: () => this.getRadarSearchStrategy(),
            getRadarSearchOrchestrator: () => this.getRadarSearchOrchestrator(),
            getRadarWebsiteCrawlSource: () => this.getRadarWebsiteCrawlSource(),
            getRadarCnpjPublicSource: () => this.getRadarCnpjPublicSource(),
            getRadarLocalDirectorySource: () => this.getRadarLocalDirectorySource(),
            getRadarVerticalSource: () => this.getRadarVerticalSource(),
            getRadarClientRequestTimeoutMs: () => this.getRadarClientRequestTimeoutMs(),
          },
        });
        sourceDiagnostics.push(...optionalExecution.sourceDiagnostics);
        optionalExecution.sourceEnginesUsed.forEach((source) => sourceEnginesUsed.add(source));
        optionalExecution.updatedSeenPhones.forEach((phone) => seenPhones.add(phone));
        if (optionalExecution.optionalResults.length > 0) {
          const optionalMerge = this.getRadarResultMerger().mergeSources([
            { source: 'current', results },
            ...optionalExecution.optionalSources,
          ]);
          results.splice(0, results.length, ...optionalMerge.results);
          orderedResults = this.sortContacts(results);
        }
      }
      const historyResults = hasExplicitExclusions
        ? this.sortContacts(this.mergeDedupedContacts([...storedResults, ...results]))
        : orderedResults;
      const persistableHistoryResults = historyResults.filter((result) => this.hasUsablePublicContactChannel(result as any));
      if (!options.skipRadarPersist && orderedResults.length > 0) {
        await this.persistRadarLeadPoolBatch(normalized, orderedResults, normalized.engine);
      }
      const historyId = historyEnabled
        ? await this.persistHistory(context, normalized, persistableHistoryResults, existingHistory?.id || null)
        : existingHistory?.id || null;
      const source: SearchSource = fetchedCount > 0
        ? (storedResults.length > 0 || googleFallbackCount > 0 ? 'hybrid' : 'hbx')
        : storedResults.length > 0
          ? this.buildStoredResultSource(radarResults, companyStoredResults)
          : 'hbx';
      if (hbxError && orderedResults.length === 0) {
        throw hbxError;
      }
      const status: SearchRunStatus = hbxError ? 'partial_error' : hbxStatus;
      const message = hbxError
        ? `Busca parcial: ${orderedResults.length} cards encontrados antes do erro.`
        : hbxMessage;
      const response = this.buildSearchResponse(normalized, orderedResults, {
        historyId,
        source,
        reusedCount: Math.min(storedResults.length, normalized.quantity),
        fetchedCount,
        totalStoredCount: historyResults.length,
        status,
        message,
        technicalCacheUsed: false,
        technicalCacheReusedCount: 0,
        technicalCacheValidUntil: null,
        sourceEngines: Array.from(sourceEnginesUsed),
        urlsDiscovered: hbxTelemetry.urlsDiscovered,
        pagesFetched: hbxTelemetry.pagesFetched,
        parsedContacts: hbxTelemetry.parsedContacts,
        queriesGenerated: hbxTelemetry.queriesGenerated,
        sourceMetrics: hbxTelemetry.sourceMetrics,
        missingRequiredChannel: hbxTelemetry.missingRequiredChannel,
        approved: hbxTelemetry.approvedCount,
        skipped: hbxTelemetry.rejectedCount,
        duplicate: hbxTelemetry.duplicateCount,
        sourceDiagnostics,
      });
      if (options.recordUsage !== false) {
        await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      }
      this.logSearchResult(normalized, response.results.length);
      return response;
    }

    const results = [...storedResults];
    const seenPhones = new Set(results.map((item) => item.phoneDigits).filter(Boolean));
    const seenPlaces = new Set(results.map((item) => item.placeId).filter(Boolean));
    let fetchedCount = 0;
    let technicalCacheReusedCount = 0;

    if (cachedPublicResults.length > 0) {
      for (const cached of cachedPublicResults) {
        if (results.length >= normalized.quantity) break;
        if (!cached.placeId || seenPlaces.has(cached.placeId)) continue;
        if (!cached.phoneDigits || seenPhones.has(cached.phoneDigits)) continue;
        if (!this.matchesFilters(cached, normalized.filters)) continue;

        seenPlaces.add(cached.placeId);
        seenPhones.add(cached.phoneDigits);
        results.push(cached);
        technicalCacheReusedCount += 1;
      }
    }

    if (technicalCacheReusedCount > 0 && globalCacheEntry) {
      await this.touchGlobalCache(globalCacheEntry.id);
    }

    if (results.length >= normalized.quantity) {
      const orderedCachedResults = this.sortContacts(results).slice(0, normalized.quantity);
      if (!options.skipRadarPersist && orderedCachedResults.length > 0) {
        await this.persistRadarLeadPoolBatch(normalized, orderedCachedResults, 'global_cache');
      }
      const historyId = historyEnabled
        ? await this.persistHistory(context, normalized, orderedCachedResults, existingHistory?.id || null)
        : existingHistory?.id || null;
      const source: SearchSource = technicalCacheReusedCount > 0
        ? (storedResults.length > 0 ? 'hybrid' : 'global_cache')
        : this.buildStoredResultSource(radarResults, companyStoredResults);
      const response = this.buildSearchResponse(normalized, orderedCachedResults, {
        historyId,
        source,
        reusedCount: Math.min(storedResults.length + technicalCacheReusedCount, normalized.quantity),
        fetchedCount: 0,
        technicalCacheUsed: technicalCacheReusedCount > 0,
        technicalCacheReusedCount,
        technicalCacheValidUntil:
          globalCacheEntry?.cacheValidUntil instanceof Date ? globalCacheEntry.cacheValidUntil.toISOString() : null,
      });
      if (options.recordUsage !== false) {
        await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      }
      this.logSearchResult(normalized, response.results.length);
      return response;
    }

    const apiKey = this.getApiKey(results.length === 0);
    if (!apiKey) {
      const orderedCachedResults = this.sortContacts(results).slice(0, normalized.quantity);
      const historyId = historyEnabled && orderedCachedResults.length > 0
        ? await this.persistHistory(context, normalized, orderedCachedResults, existingHistory?.id || null)
        : existingHistory?.id || null;
      if (orderedCachedResults.length > 0) {
        const source: SearchSource = technicalCacheReusedCount > 0
          ? storedResults.length > 0
            ? 'hybrid'
            : 'global_cache'
          : this.buildStoredResultSource(radarResults, companyStoredResults);
        const response = this.buildSearchResponse(normalized, orderedCachedResults, {
          historyId,
          source,
          reusedCount: Math.min(storedResults.length + technicalCacheReusedCount, normalized.quantity),
          fetchedCount: 0,
          technicalCacheUsed: technicalCacheReusedCount > 0,
          technicalCacheReusedCount,
          technicalCacheValidUntil:
            globalCacheEntry?.cacheValidUntil instanceof Date ? globalCacheEntry.cacheValidUntil.toISOString() : null,
        });
        if (options.recordUsage !== false) {
          await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
        }
        this.logSearchResult(normalized, response.results.length);
        return response;
      }
      throw this.buildConfigurationUnavailableError();
    }

    if (options.usageEventType !== 'GOOGLE_EMERGENCY_EXECUTED') {
      await this.assertGoogleDailyQuota(context, normalized);
    }

    for (const candidateLimit of this.buildCandidateSteps(normalized.quantity)) {
      if (results.length >= normalized.quantity) break;
      const candidates = await this.searchPlaces(`${normalized.segment} em ${normalized.city}`, candidateLimit);

      for (const candidate of candidates) {
        if (results.length >= normalized.quantity) break;
        if (!candidate.placeId || seenPlaces.has(candidate.placeId)) continue;

        seenPlaces.add(candidate.placeId);
        const details = await this.getPlaceDetails(candidate.placeId);
        const mapped = this.mapContactResult(candidate, details);
        if (!mapped) continue;
        if (seenPhones.has(mapped.phoneDigits)) continue;
        if (!this.matchesFilters(mapped, normalized.filters)) continue;

        seenPhones.add(mapped.phoneDigits);
        results.push(mapped);
        fetchedCount += 1;
      }
    }

    const orderedResults = this.sortContacts(results).slice(0, normalized.quantity);
    if (!options.skipRadarPersist && orderedResults.length > 0) {
      await this.persistRadarLeadPoolBatch(normalized, orderedResults, normalized.engine);
    }
    if (globalCacheEnabled && (fetchedCount > 0 || (!globalCacheEntry && orderedResults.length > 0))) {
      await this.persistGlobalCache(normalized, orderedResults, globalCacheEntry?.id || null);
    }
    const historyId = historyEnabled
      ? await this.persistHistory(context, normalized, orderedResults, existingHistory?.id || null)
      : null;
    const source: SearchSource = fetchedCount > 0
      ? (storedResults.length > 0 || technicalCacheReusedCount > 0 ? 'hybrid' : 'google')
      : technicalCacheReusedCount > 0
        ? (storedResults.length > 0 ? 'hybrid' : 'global_cache')
        : storedResults.length > 0
          ? this.buildStoredResultSource(radarResults, companyStoredResults)
          : 'google';

    const response = this.buildSearchResponse(normalized, orderedResults, {
      historyId,
      source,
      reusedCount: Math.min(storedResults.length + technicalCacheReusedCount, normalized.quantity),
      fetchedCount,
      technicalCacheUsed: technicalCacheReusedCount > 0,
      technicalCacheReusedCount,
      technicalCacheValidUntil:
        globalCacheEntry?.cacheValidUntil instanceof Date
          ? globalCacheEntry.cacheValidUntil.toISOString()
          : fetchedCount > 0 || (!globalCacheEntry && orderedResults.length > 0)
            ? this.buildGlobalCacheValidUntil().toISOString()
            : null,
    });
    if (options.recordUsage !== false) {
      await this.recordUsageLog(
        context,
        normalized,
        options.usageEventType || 'GOOGLE_SEARCH_EXECUTED',
        response.results.length,
        null,
        response.meta,
      );
    }
    this.logSearchResult(normalized, response.results.length);
    return response;
  }

  async listRecentHistoryForUser(user: any, limit = RECENT_HISTORY_LIMIT) {
    const context = this.resolveContext(user);
    const historyEnabled = await this.supportsHistoryPersistence();
    const globalCacheEnabled = await this.supportsGlobalCachePersistence();
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 0), 1), RECENT_HISTORY_LIMIT);
    if (historyEnabled) {
      await this.pruneCompanyHistory(context.companyId, RECENT_HISTORY_LIMIT);
    }
    const readLimit = Math.max(safeLimit * 3, RECENT_HISTORY_LIMIT);
    const [rows, globalRows] = await Promise.all([
      historyEnabled
        ? this.prisma.webscrapingSearchHistory.findMany({
            where: { companyId: context.companyId },
            orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: readLimit,
            select: {
              id: true,
              city: true,
              segment: true,
              quantity: true,
              resultCount: true,
              filtersJson: true,
              searchSignature: true,
              createdAt: true,
              updatedAt: true,
              lastUsedAt: true,
              places: {
                orderBy: [{ rank: 'asc' }],
                take: 3,
                select: {
                  name: true,
                },
              },
            },
          })
        : Promise.resolve([] as any[]),
      globalCacheEnabled
        ? this.prisma.webscrapingGlobalCacheEntry.findMany({
            where: {
              cacheValidUntil: {
                gt: new Date(),
              },
            },
            orderBy: [{ lastServedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: readLimit,
            include: {
              places: {
                orderBy: [{ rank: 'asc' }],
                take: 3,
              },
            },
          })
        : Promise.resolve([] as any[]),
    ]);

    const itemsWithKeys = [
      ...rows.map((row) => {
        const options = this.parseSearchOptionsJson(row.filtersJson, row.searchSignature);
        const state = options.state || this.extractSignaturePart(row.searchSignature, 'state').toUpperCase();
        return {
          id: row.id,
          city: formatCityWithState(row.city, state) || 'Brasil',
          segment: row.segment,
          quantity: row.quantity,
          resultCount: row.resultCount,
          filters: options.filters,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          lastUsedAt: row.lastUsedAt.toISOString(),
          preview: row.places.map((place) => place.name).filter(Boolean),
          scope: 'company' as const,
          sourceLabel: options.engine === 'hbx' ? 'Historico HBX Scraping' : 'Historico da empresa',
          cacheValidUntil: null,
          dedupeKey: this.buildHistoryDedupeKey({
            city: row.city,
            state,
            segment: row.segment,
            filtersJson: row.filtersJson,
            searchSignature: row.searchSignature,
          }),
        };
      }),
      ...globalRows.map((row) => ({
        id: `global:${row.id}`,
        city: row.normalizedCity,
        segment: row.normalizedSegment,
        quantity: Math.min(Math.max(Math.trunc(row.resultCount || 0), 1), MAX_QUANTITY),
        resultCount: row.resultCount,
        filters: this.parseFiltersJson(row.filtersJson),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        lastUsedAt: row.lastServedAt.toISOString(),
        preview: row.places.map((place) => place.name).filter(Boolean),
        scope: 'global' as const,
        sourceLabel: 'Historico global',
        cacheValidUntil: row.cacheValidUntil.toISOString(),
        dedupeKey: this.buildHistoryDedupeKey({
          city: row.normalizedCity,
          segment: row.normalizedSegment,
          filtersJson: row.filtersJson,
          searchSignature: row.cacheSignature,
        }),
      })),
    ]
      .sort((left, right) => new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime());

    const uniqueItems = new Map<string, (typeof itemsWithKeys)[number]>();
    for (const item of itemsWithKeys) {
      const current = uniqueItems.get(item.dedupeKey);
      if (!current || (current.scope === 'global' && item.scope === 'company')) {
        uniqueItems.set(item.dedupeKey, item);
      }
    }

    const items = Array.from(uniqueItems.values())
      .sort((left, right) => new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime())
      .slice(0, safeLimit)
      .map(({ dedupeKey: _dedupeKey, ...item }) => item);

    return { items };
  }

  async reuseHistorySearchForUser(user: any, historyId: string) {
    const context = this.resolveContext(user);
    const normalizedHistoryId = String(historyId || '').trim();
    const isGlobalHistory = normalizedHistoryId.startsWith('global:');

    if (isGlobalHistory) {
      const globalCacheEnabled = await this.supportsGlobalCachePersistence();
      if (!globalCacheEnabled) {
        throw new NotFoundException('Historico global indisponivel neste ambiente.');
      }

      const row = await this.findGlobalCacheById(normalizedHistoryId.slice('global:'.length));
      if (!row) {
        throw new NotFoundException('Pesquisa global nao encontrada.');
      }

      const parsedOptions = this.parseSearchOptionsJson(row.filtersJson, row.cacheSignature);
      const filters = parsedOptions.filters;
      const normalized = this.normalizeSearchInput(
        {
          city: row.normalizedCity,
          state: parsedOptions.state,
          segment: row.normalizedSegment,
          quantity: Math.min(Math.max(Math.trunc(row.resultCount || 0), 1), MAX_QUANTITY),
          engine: parsedOptions.engine,
          targetType: parsedOptions.targetType,
          minRating: filters.minRating,
          minReviews: filters.minReviews,
          onlyWithWebsite: filters.onlyWithWebsite,
          preferredChannels: parsedOptions.preferredChannels,
          requiredChannels: parsedOptions.requiredChannels,
          channelMatchMode: parsedOptions.channelMatchMode,
          freshness: parsedOptions.freshness,
          salesProfile: parsedOptions.salesProfile,
        },
        { allowMissingHbxState: true },
      );
      const storedResults = this.sortContacts(this.restoreGlobalCacheResults(row))
        .filter((result) => this.matchesFilters(result, normalized.filters))
        .slice(0, normalized.quantity);

      await this.touchGlobalCache(row.id);

      const response = this.buildSearchResponse(normalized, storedResults, {
        historyId: `global:${row.id}`,
        source: 'global_cache',
        reusedCount: storedResults.length,
        fetchedCount: 0,
        technicalCacheUsed: true,
        technicalCacheReusedCount: storedResults.length,
        technicalCacheValidUntil: row.cacheValidUntil.toISOString(),
      });
      await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
      return response;
    }

    const historyEnabled = await this.supportsHistoryPersistence();
    if (!historyEnabled) {
      throw new NotFoundException('Historico indisponivel neste ambiente.');
    }

    const row = await this.findHistoryById(context.companyId, normalizedHistoryId);
    if (!row) {
      throw new NotFoundException('Pesquisa anterior nao encontrada.');
    }

    const parsedOptions = this.parseSearchOptionsJson(row.filtersJson, row.searchSignature);
    const filters = parsedOptions.filters;
    const normalized = this.normalizeSearchInput(
      {
        city: row.city,
        state: parsedOptions.state || this.extractSignaturePart(row.searchSignature, 'state').toUpperCase(),
        segment: row.segment,
        quantity: row.quantity,
        engine: parsedOptions.engine,
        targetType: parsedOptions.targetType,
        minRating: filters.minRating,
        minReviews: filters.minReviews,
        onlyWithWebsite: filters.onlyWithWebsite,
        preferredChannels: parsedOptions.preferredChannels,
        requiredChannels: parsedOptions.requiredChannels,
        channelMatchMode: parsedOptions.channelMatchMode,
        freshness: parsedOptions.freshness,
        salesProfile: parsedOptions.salesProfile,
      },
      { allowMissingHbxState: true },
    );
    const storedResults = this.sortContacts(this.restoreStoredResults(row))
      .filter((result) => this.matchesFilters(result, normalized.filters))
      .slice(0, normalized.quantity);

    await this.touchHistory(row.id, context.userId);

    const response = this.buildSearchResponse(normalized, storedResults, {
      historyId: row.id,
      source: 'history',
      reusedCount: storedResults.length,
      fetchedCount: 0,
      technicalCacheUsed: false,
      technicalCacheReusedCount: 0,
      technicalCacheValidUntil: null,
    });
    await this.recordUsageLog(context, normalized, 'EXECUTED', response.results.length, null, response.meta);
    return response;
  }

  async searchMoreHistoryForUser(user: any, historyId: string, quantity = HBX_PJ_MAX_QUANTITY) {
    const context = this.resolveContext(user);
    const historyEnabled = await this.supportsHistoryPersistence();
    if (!historyEnabled) {
      throw new NotFoundException('Historico indisponivel neste ambiente.');
    }

    const row = await this.findHistoryById(context.companyId, String(historyId || '').trim());
    if (!row) {
      throw new NotFoundException('Pesquisa anterior nao encontrada.');
    }

    const parsedOptions = this.parseSearchOptionsJson(row.filtersJson, row.searchSignature);
    if (parsedOptions.engine !== 'hbx') {
      throw new BadRequestException('Buscar mais sem repetir esta disponivel apenas para HBX Scraping.');
    }

    const filters = parsedOptions.filters;
    const normalized = this.normalizeSearchInput(
      {
        city: row.city,
        state: parsedOptions.state || this.extractSignaturePart(row.searchSignature, 'state').toUpperCase(),
        segment: row.segment,
        quantity,
        engine: parsedOptions.engine,
        targetType: parsedOptions.targetType,
        minRating: filters.minRating,
        minReviews: filters.minReviews,
        onlyWithWebsite: filters.onlyWithWebsite,
        preferredChannels: parsedOptions.preferredChannels,
        requiredChannels: parsedOptions.requiredChannels,
        channelMatchMode: parsedOptions.channelMatchMode,
        freshness: parsedOptions.freshness,
        salesProfile: parsedOptions.salesProfile,
      },
      { allowMissingHbxState: parsedOptions.targetType === 'pj' },
    );

    const storedResults = this.sortContacts(this.restoreStoredResults(row));
    const excludePhoneDigits = Array.from(
      new Set(storedResults.map((item) => normalizePhoneDigits(item.phoneDigits || item.phone)).filter(Boolean)),
    );

    let newResults: WebscrapingContactResult[] = [];
    let hbxStatus: SearchRunStatus = 'completed';
    let hbxMessage: string | null = null;
    let hbxError: unknown = null;
    try {
      const hbxOutput = await this.searchHbxEngine({
        ...normalized,
        requiredChannels: [],
        channelMatchMode: 'prefer',
      }, excludePhoneDigits);
      const hbxResults = hbxOutput.results;
      hbxStatus = hbxOutput.status;
      hbxMessage = hbxOutput.message;
      const allSeenPhones = new Set(excludePhoneDigits);
      const accepted: WebscrapingContactResult[] = [];
      for (const candidate of hbxResults) {
        if (accepted.length >= normalized.quantity) break;
        if (!this.shouldKeepNewContact(candidate, [...storedResults, ...accepted], allSeenPhones)) continue;
        allSeenPhones.add(candidate.phoneDigits);
        accepted.push(candidate);
      }
      newResults = this.sortContacts(accepted);
    } catch (error) {
      hbxError = error;
    }

    if (hbxError && storedResults.length === 0 && newResults.length === 0) {
      throw hbxError;
    }

    const mergedResults = this.sortContacts(this.mergeDedupedContacts([...storedResults, ...newResults]));
    const savedHistoryId = await this.persistHistory(context, normalized, mergedResults, row.id);
    const status: SearchRunStatus = hbxError ? 'partial_error' : hbxStatus;
    const message = hbxError
      ? `Busca parcial: ${newResults.length} cards encontrados antes do erro.`
      : hbxMessage || (newResults.length < normalized.quantity
          ? `Busca concluida com ${newResults.length} cards novos sem repetir.`
          : null);

    const response = this.buildSearchResponse(normalized, newResults, {
      historyId: savedHistoryId,
      source: newResults.length > 0 ? 'hbx' : 'history',
      reusedCount: 0,
      fetchedCount: newResults.length,
      totalStoredCount: mergedResults.length,
      status,
      message,
      technicalCacheUsed: false,
      technicalCacheReusedCount: 0,
      technicalCacheValidUntil: null,
    });
    await this.recordUsageLog(context, normalized, 'EXECUTED', newResults.length, message, response.meta);
    return response;
  }

  async exportContactsForUser(user: any, input: SearchContactsInput) {
    const response = await this.searchContactsForUser(user, input);
    const workbook = XLSX.utils.book_new();
    const rows = response.results.map((result) => ({
      Nome: result.name,
      Telefone: result.phone,
      Nota: result.rating ?? '',
      'Avaliações': result.reviews,
      Endereco: result.address,
      Website: result.website ? 'Abrir site' : '',
      'Roteiro pronto': this.buildScriptText(result, response.query.city, response.query.segment, user),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 18 },
      { wch: 10 },
      { wch: 12 },
      { wch: 42 },
      { wch: 14 },
      { wch: 68 },
    ];

    response.results.forEach((result, index) => {
      const rowIndex = index + 2;
      const scriptText = this.buildScriptText(result, response.query.city, response.query.segment, user);
      const whatsappTarget = this.buildWhatsAppTarget(result.phoneDigits || result.phone, scriptText);

      if (whatsappTarget) {
        const cell = worksheet[`B${rowIndex}`] || { t: 's', v: result.phone };
        cell.t = 's';
        cell.v = result.phone;
        cell.l = { Target: whatsappTarget, Tooltip: 'Abrir conversa no WhatsApp' };
        worksheet[`B${rowIndex}`] = cell;
      }

      if (result.website) {
        const cell = worksheet[`F${rowIndex}`] || { t: 's', v: 'Abrir site' };
        cell.t = 's';
        cell.v = 'Abrir site';
        cell.l = { Target: result.website, Tooltip: 'Abrir site' };
        worksheet[`F${rowIndex}`] = cell;
      }
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');

    return {
      buffer: XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
        compression: true,
      }) as Buffer,
      filename: this.buildExportFilename(response.query.segment, response.query.city),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
