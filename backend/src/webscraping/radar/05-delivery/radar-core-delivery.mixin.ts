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

export class RadarCoreDeliveryMixin {
  [key: string]: any;
  private buildNormalizedSearchInputFromRadarFilters(filters: NormalizedRadarFilters): NormalizedSearchInput {
    return this.getRadarSearchInput().buildNormalizedSearchInputFromRadarFilters(filters, this.buildRadarSearchInputHost());
  }

  private isTerminalRadarSearchRunStatus(status: string | null | undefined) {
    return this.isTerminalSearchRunStatus(status);
  }

  private resolveRadarRunOperationalState(run: any, status: WebscrapingSearchRunStatus, message: string | null): {
    state: RadarOperationalState;
    reason: string | null;
    message: string | null;
  } {
    return this.getRadarRunPresenter().resolveRadarRunOperationalState(run, status, message);
  }

  private buildRadarSearchRunMessage(run: any, deliveredCount: number, requestedQuantity: number) {
    return this.getRadarRunPresenter().buildRadarSearchRunMessage(
      run,
      deliveredCount,
      requestedQuantity,
      (status) => this.normalizeSearchRunStatus(status),
    );
  }

  private buildRadarFiltersFromSearchRun(run: any) {
    return this.getRadarSearchInput().buildRadarFiltersFromSearchRun(run, this.buildRadarSearchInputHost());
  }

  private async findRadarPoolRowsForRunItems(companyId: number, items: any[], limit: number) {
    if (!(await this.supportsRadarPersistence())) return [];
    const foundItems = (Array.isArray(items) ? items : []).filter((item) => String(item?.status || '') === 'found');
    const phoneOrder = foundItems.map((item) => normalizePhoneDigits(item?.phoneDigits || item?.phone)).filter(Boolean);
    const placeOrder = foundItems.map((item) => String(item?.placeId || '').trim()).filter(Boolean);
    const phoneSet = new Set(phoneOrder);
    const placeSet = new Set(placeOrder);
    if (!phoneSet.size && !placeSet.size) return [];
    const or: any[] = [];
    if (phoneSet.size) or.push({ phoneDigits: { in: Array.from(phoneSet) } });
    if (placeSet.size) or.push({ placeId: { in: Array.from(placeSet) } });
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { OR: or },
      take: Math.min(Math.max(limit * 4, 100), 1000),
      include: {
        companyStates: {
          where: { companyId },
          take: 1,
          select: {
            status: true,
            vendasLeadId: true,
            lastActionAt: true,
            noAnswerCount: true,
            contactedCount: true,
            lastContactAt: true,
            complaintReason: true,
            deniedReason: true,
            assignedUserId: true,
            assignedByUserId: true,
            assignedAt: true,
          },
        },
        events: {
          where: { OR: [{ companyId }, { companyId: null }] },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            id: true,
            eventType: true,
            note: true,
            createdAt: true,
          },
        },
      },
    }).catch(() => []);
    const usableRows = rows.filter((row: any) => {
      const state = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      return !this.isRadarProtectedStatus(state?.status || row?.status);
    });
    const byPhone = new Map<string, any>();
    const byPlace = new Map<string, any>();
    for (const row of usableRows) {
      const phone = normalizePhoneDigits(row?.phoneDigits || row?.phone);
      const placeId = String(row?.placeId || '').trim();
      if (phone && !byPhone.has(phone)) byPhone.set(phone, row);
      if (placeId && !byPlace.has(placeId)) byPlace.set(placeId, row);
    }
    const ordered: any[] = [];
    const seen = new Set<string>();
    for (const item of foundItems) {
      const phone = normalizePhoneDigits(item?.phoneDigits || item?.phone);
      const placeId = String(item?.placeId || '').trim();
      const row = (phone && byPhone.get(phone)) || (placeId && byPlace.get(placeId));
      if (!row?.id || seen.has(String(row.id))) continue;
      seen.add(String(row.id));
      ordered.push(row);
      if (ordered.length >= limit) break;
    }
    return ordered;
  }

  private summarizeAutoImportFailures(failures: Array<{ reason: string }>) {
    return this.getRadarVendasSyncService().summarizeAutoImportFailures(failures);
  }

  private async syncRadarSearchRunItemsToPool(context: SearchExecutionContext, run: any) {
    if (!(await this.supportsRadarPersistence())) return;
    const normalized = this.normalizeSearchInput({
      city: String(run?.city || ''),
      state: String(run?.state || ''),
      segment: String(run?.segment || ''),
      radiusKm: this.normalizeRadiusKm(parseJsonObject(run?.metricsJson)?.radiusKm),
      originLat: this.normalizeCoordinate(parseJsonObject(run?.metricsJson)?.originLat),
      originLng: this.normalizeCoordinate(parseJsonObject(run?.metricsJson)?.originLng),
      quantity: Math.max(1, safeInteger(run?.targetQuantity)),
      engine: 'hbx',
      targetType: normalizeTargetType(run?.targetType),
      salesProfile: parseJsonObject(run?.metricsJson)?.salesProfile || null,
      ...this.buildChannelFiltersJson(parseJsonObject(parseJsonObject(run?.metricsJson)?.channelFilters || {})),
    });
    const qualityInput = {
      city: normalized.city,
      state: normalized.state,
      segment: normalized.segment,
      targetType: normalized.targetType,
      regionalCities: normalized.regionalCities,
      preferredChannels: normalized.preferredChannels,
      requiredChannels: normalized.requiredChannels,
      channelMatchMode: normalized.channelMatchMode,
      salesProfile: normalized.salesProfile,
    } as NormalizedRadarFilters;
    const foundItems = (Array.isArray(run?.items) ? run.items : [])
      .filter((item: any) => this.isRunItemPrimaryDeliverable(item, qualityInput));
    if (!foundItems.length) return;
    const contacts = foundItems
      .map((item: any) => this.mapRunItemToContact(item))
      .filter((item: WebscrapingContactResult) => this.hasUsablePublicContactChannel(item as any));

    if (contacts.some((item) => String(item.source || '') !== 'radar_database')) {
      const groups = new Map<string, WebscrapingContactResult[]>();
      for (const contact of contacts) {
        const city = String((contact as any).city || normalized.city || '').trim();
        const state = String((contact as any).state || normalized.state || '').trim().toUpperCase();
        const segment = String((contact as any).segment || normalized.segment || '').trim();
        const key = `${state}|${normalizeLookupValue(city)}|${normalizeLookupValue(segment)}`;
        const current = groups.get(key) || [];
        current.push(contact);
        groups.set(key, current);
      }
      for (const groupContacts of groups.values()) {
        const first = groupContacts[0] as any;
        const groupInput = this.normalizeSearchInput({
          city: first.city || normalized.city,
          state: first.state || normalized.state,
          segment: first.segment || normalized.segment,
          radiusKm: normalized.radiusKm,
          originLat: normalized.originLat,
          originLng: normalized.originLng,
          quantity: Math.max(1, groupContacts.length),
          engine: 'hbx',
          targetType: normalized.targetType,
          salesProfile: normalized.salesProfile,
          preferredChannels: normalized.preferredChannels,
          requiredChannels: normalized.requiredChannels,
          channelMatchMode: normalized.channelMatchMode,
        });
        await this.persistRadarLeadPoolBatch(groupInput, groupContacts, 'hbx').catch((error: any) => {
          this.logger.warn(`[radar-run] falha ao sincronizar lote no RadarLeadPool run=${run?.id || '-'}: ${String(error?.message || error)}`);
        });
      }
    }

    const rowsInRun = await this.findRadarPoolRowsForRunItems(
      context.companyId,
      foundItems,
      Math.max(safeInteger(run?.targetQuantity) * 2, 100),
    );
    const maxToClaim = Math.max(0, safeInteger(run?.targetQuantity));
    await this.markRadarDelivered(context.companyId, context.userId, rowsInRun.slice(0, maxToClaim)).catch((error: any) => {
      this.logger.warn(`[radar-run] falha ao reservar cards do run=${run?.id || '-'}: ${String(error?.message || error)}`);
    });
  }

  private async getVendasPendingCountForRadarContext(companyId: number) {
    return this.getRadarVendasSyncService().getPendingCount(companyId);
  }

  private getRadarRunVendasStockTarget(run: any) {
    return this.getRadarVendasSyncService().getRunStockTarget(run);
  }

  private getRadarLimitPauseRetryDelayMs(reason?: string | null) {
    return this.getRadarVendasSyncService().getLimitPauseRetryDelayMs(reason);
  }

  private isSearchRunPausedByLimit(run: any) {
    return this.getRadarVendasSyncService().isSearchRunPausedByLimit(
      run,
      (status) => this.normalizeSearchRunStatus(status),
    );
  }

  private async getRadarCardQuotaRemaining(companyId: number, userId: number) {
    if (!this.commercialUsageLimits) return Number.POSITIVE_INFINITY;
    const usage = await this.commercialUsageLimits.getUsageSnapshot(companyId, userId).catch(() => null);
    const cardLimits = usage ? (usage as any).cards || {} : {};
    const values = [
      Number(cardLimits.remaining),
      cardLimits.perUserLimit != null
        ? Number(cardLimits.userLimit || 0) - Number(cardLimits.userUsed || 0)
        : Number(cardLimits.remaining),
    ].filter((value) => Number.isFinite(value));
    if (!values.length) return Number.POSITIVE_INFINITY;
    return Math.min(...values);
  }

  private async canResumePausedSearchRun(run: any) {
    if (!this.isSearchRunPausedByLimit(run)) return false;
    const companyId = safeInteger(run?.companyId);
    const userId = safeInteger(run?.userId);
    if (!companyId || !userId) return false;
    const target = this.getRadarRunVendasStockTarget(run);
    if (target > 0) {
      const pendingCount = await this.getVendasPendingCountForRadarContext(companyId);
      if (pendingCount >= target) return false;
    }
    const quotaRemaining = await this.getRadarCardQuotaRemaining(companyId, userId);
    return !Number.isFinite(quotaRemaining) || quotaRemaining > 0;
  }

  private async resumePausedSearchRunIfPossible(run: any) {
    if (!(await this.canResumePausedSearchRun(run))) return false;
    const now = new Date();
    await this.updateSearchRunMetrics(run.id, {
      radarPauseReleasedAt: now.toISOString(),
      status: 'queued',
    }).catch(() => null);
    await this.prisma.webscrapingSearchRun.updateMany({
      where: {
        id: run.id,
        status: 'sleeping',
      },
      data: {
        status: 'queued',
        lastBatchStatus: 'resumed_after_limit',
        errorMessage: 'Espaco liberado. Radar retomando esta mesma pesquisa.',
        nextRetryAt: now,
        assignedEngineId: null,
        assignedEngineUrl: null,
        assignedEngineIndex: null,
        finishedAt: null,
      },
    }).catch(() => null);
    this.scheduleSearchRunPump(0);
    return true;
  }

  private async resumeDuePausedRadarSearchRuns() {
    const now = new Date();
    const delegate = (this.prisma as any).webscrapingSearchRun;
    if (!delegate?.findMany) return;
    const pausedRuns = await delegate.findMany({
      where: {
        status: 'sleeping',
        assignedEngineId: null,
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      orderBy: [
        { nextRetryAt: 'asc' },
        { updatedAt: 'asc' },
      ],
      take: 20,
    }).catch(() => []);
    for (const run of pausedRuns || []) {
      if (!this.isSearchRunPausedByLimit(run)) continue;
      const resumed = await this.resumePausedSearchRunIfPossible(run);
      if (resumed) continue;
      const retryDelayMs = this.getRadarLimitPauseRetryDelayMs(run?.lastBatchStatus);
      await this.prisma.webscrapingSearchRun.updateMany({
        where: {
          id: run.id,
          status: 'sleeping',
        },
        data: {
          nextRetryAt: new Date(Date.now() + retryDelayMs),
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
        },
      }).catch(() => null);
    }
  }

  private async pauseSearchRunForLimit(run: any, reason: string, message: string) {
    const runId = String(run?.id || '').trim();
    if (!runId) return false;
    const nextRetryAt = new Date(Date.now() + this.getRadarLimitPauseRetryDelayMs(reason));
    await this.updateSearchRunMetrics(runId, {
      radarPauseReason: reason,
      radarPausedAt: new Date().toISOString(),
      radarPauseRetryAt: nextRetryAt.toISOString(),
      status: 'sleeping',
    }).catch(() => null);
    await this.prisma.webscrapingSearchRun.update({
      where: { id: runId },
      data: {
        status: 'sleeping',
        lastBatchStatus: reason,
        errorMessage: message,
        nextRetryAt,
        assignedEngineId: null,
        assignedEngineUrl: null,
        assignedEngineIndex: null,
        finishedAt: null,
      },
    }).catch(() => null);
    this.scheduleSearchRunPump(nextRetryAt.getTime() - Date.now());
    return true;
  }

  private async stopSearchRunIfVendasStockLimitReached(run: any, reason = 'vendas_stock_limit') {
    const runId = String(run?.id || '').trim();
    const companyId = safeInteger(run?.companyId);
    if (!runId || !companyId) return false;
    const target = this.getRadarRunVendasStockTarget(run);
    if (target <= 0) return false;
    const pendingCount = await this.getVendasPendingCountForRadarContext(companyId);
    if (pendingCount < target) return false;
    return this.pauseSearchRunForLimit(run, reason, `Radar pausado. Vendas ja esta com ${pendingCount} de ${target} card(s). Vou retomar esta mesma pesquisa quando houver espaco.`);
  }

  private isRadarAutoImportLimitError(error: any) {
    return this.getRadarVendasSyncService().isAutoImportLimitError(error);
  }

  private async stopSearchRunAutoImportBlocked(run: any, reason = 'vendas_card_limit') {
    const runId = String(run?.id || '').trim();
    if (!runId) return false;
    const message = 'Radar pausado pelo limite de cards. Vou retomar esta mesma pesquisa quando houver cota ou espaco.';
    await this.updateSearchRunMetrics(runId, {
      autoImportBlocked: true,
      autoImportBlockedReason: reason,
      autoImportBlockedAt: new Date().toISOString(),
      radarPauseReason: reason,
      radarPausedAt: new Date().toISOString(),
      status: 'sleeping',
    }).catch(() => null);
    return this.pauseSearchRunForLimit(run, reason, message);
  }

  private async assertRadarCanFeedVendas(context: SearchExecutionContext) {
    return this.getRadarVendasSyncService().assertCanFeed(context);
  }

  private async autoImportRadarSearchRunToVendas(user: any, runId: string) {
    return this.getRadarVendasSyncService().autoImportSearchRunToVendas(
      user,
      runId,
      this.buildRadarVendasSyncHost(),
    );
  }

  private async buildPausedRadarSearchRunResponse(run: any) {
    const filters = this.buildRadarFiltersFromSearchRun(run);
    const requestedQuantity = Math.max(1, safeInteger(run?.targetQuantity));
    const stockTarget = this.getRadarRunVendasStockTarget(run);
    const pendingCount = stockTarget > 0
      ? await this.getVendasPendingCountForRadarContext(safeInteger(run?.companyId))
      : null;
    const deliveredCount = pendingCount == null
      ? safeInteger(run?.importedCount)
      : safeInteger(pendingCount);
    const message = String(run?.errorMessage || '').trim()
      || 'Radar pausado. Vou retomar esta mesma pesquisa quando houver espaco.';
    return {
      id: run.id,
      runId: run.id,
      status: 'sleeping' as WebscrapingSearchRunStatus,
      items: [],
      total: requestedQuantity,
      code: 'RADAR_SEARCH_PAUSED',
      message,
      retryable: true,
      targetQuantity: requestedQuantity,
      foundCount: safeInteger(run?.foundCount),
      errorMessage: message,
      meta: {
        requestedQuantity,
        deliveredCount,
        databaseCount: 0,
        fetchedCount: 0,
        requiredChannels: filters.requiredChannels,
        channelMatchMode: filters.channelMatchMode,
        requiredChannelRejectedCount: 0,
        progress: requestedQuantity > 0
          ? Math.min(99, Math.round((Math.max(deliveredCount, safeInteger(run?.foundCount)) / requestedQuantity) * 100))
          : 0,
        terminal: false,
        paused: true,
        pauseReason: String(run?.lastBatchStatus || ''),
        operationalState: 'pausado' as RadarOperationalState,
        operationalReason: String(run?.lastBatchStatus || 'radar_paused'),
        operationalMessage: message,
        status: 'sleeping' as WebscrapingSearchRunStatus,
        runId: run.id,
        nextRetryAt: run?.nextRetryAt instanceof Date ? run.nextRetryAt.toISOString() : null,
        attemptCount: safeInteger(run?.attemptCount),
        autoImport: {
          ran: false,
          importedCount: safeInteger(run?.importedCount),
          pendingCount,
          remaining: null,
          blocked: true,
          failures: [{ reason: String(run?.lastBatchStatus || 'paused') }],
        },
        filters: {
          state: filters.state,
          city: filters.city,
          segment: filters.segment,
          radiusKm: filters.radiusKm,
          regionalCities: filters.regionalCities.map((item) => ({
            city: item.city,
            state: item.state,
            distanceKm: item.distanceKm,
          })),
          selectedSegments: this.splitHbxBatchSegments(filters.segment),
          targetType: filters.targetType,
          preferredChannels: filters.preferredChannels,
          requiredChannels: filters.requiredChannels,
          channelMatchMode: filters.channelMatchMode,
        },
      },
    };
  }

  private async buildRadarSearchRunResponse(user: any, runId: string, options?: { skipAutoImport?: boolean }) {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    const run = await this.prisma.webscrapingSearchRun.findFirst({
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
    if (!run) throw new NotFoundException('Pesquisa do Radar nao encontrada.');

    if (this.normalizeSearchRunStatus(run.status) !== 'canceled' && !this.isSearchRunPausedByLimit(run)) {
      await this.syncRadarSearchRunItemsToPool(context, run).catch((error: any) => {
        this.logger.warn(`[radar-run] sync ignorado run=${run.id}: ${String(error?.message || error)}`);
      });
    }
    const freshRun = await this.prisma.webscrapingSearchRun.findFirst({
      where: { id: run.id, companyId: context.companyId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const effectiveRun = freshRun || run;
    if (this.normalizeSearchRunStatus(effectiveRun.status) === 'sleeping' && this.isSearchRunPausedByLimit(effectiveRun)) {
      const resumed = await this.resumePausedSearchRunIfPossible(effectiveRun);
      if (!resumed) {
        return this.buildPausedRadarSearchRunResponse(effectiveRun);
      }
      return this.buildRadarSearchRunResponse(user, runId, options);
    }
    const stockTarget = this.getRadarRunVendasStockTarget(effectiveRun);
    const pendingCount = stockTarget > 0
      ? await this.getVendasPendingCountForRadarContext(context.companyId)
      : 0;
    const hasFoundRunItemsBeforeStockGate = (effectiveRun.items || []).some((item: any) => String(item?.status || '') === 'found');
    const hasImportedRunItemsBeforeStockGate = safeInteger(effectiveRun.importedCount) > 0 || safeInteger(effectiveRun.foundCount) > 0;
    if (stockTarget > 0 && pendingCount >= stockTarget && !hasFoundRunItemsBeforeStockGate && !hasImportedRunItemsBeforeStockGate) {
      await this.stopSearchRunIfVendasStockLimitReached(effectiveRun, 'vendas_stock_limit_response');
      const paused = await this.prisma.webscrapingSearchRun.findUnique({ where: { id: effectiveRun.id } }).catch(() => null);
      return this.buildPausedRadarSearchRunResponse(paused || effectiveRun);
    }
    const metrics = parseJsonObject(effectiveRun.metricsJson);
    const filters = this.buildRadarFiltersFromSearchRun(effectiveRun);
    const requestedQuantity = Math.max(1, safeInteger(effectiveRun.targetQuantity));
    const allFoundRunItems = (effectiveRun.items || []).filter((item: any) => String(item?.status || '') === 'found');
    const primaryFoundItems = allFoundRunItems.filter((item: any) => this.isRunItemPrimaryDeliverable(item, filters));
    const foundItems = allFoundRunItems.filter((item: any) => this.isRunItemQualityDeliverable(item, filters));
    const requiredChannelRejectedCount = 0;
    const candidateLookupLimit = requestedQuantity;
    let orderedRows = await this.findRadarPoolRowsForRunItems(
      context.companyId,
      primaryFoundItems,
      candidateLookupLimit,
    );
    const status = this.normalizeSearchRunStatus(effectiveRun.status);
    const terminal = this.isTerminalRadarSearchRunStatus(status);
    const autoImportProcessedCount = safeInteger(effectiveRun.importedCount);
    const hasAutoImportPendingCards = primaryFoundItems.length > 0 && primaryFoundItems.length > autoImportProcessedCount;
    const lastBatchStatus = String((effectiveRun as any)?.lastBatchStatus || '').toLowerCase();
    const pausedByLimit = status === 'sleeping' && this.isSearchRunPausedByLimit(effectiveRun);
    const autoImportBlocked = !pausedByLimit && (Boolean(metrics?.autoImportBlocked)
      || status === 'completed_insufficient_results'
      || lastBatchStatus.includes('limit')
      || lastBatchStatus === 'radar_rest_disabled');
    if (autoImportBlocked && hasAutoImportPendingCards) {
      const message = String(effectiveRun.errorMessage || 'Radar parado. A pesquisa antiga nao sera retomada automaticamente.');
      return {
        id: effectiveRun.id,
        runId: effectiveRun.id,
        status,
        items: [],
        total: 0,
        code: 'RADAR_SEARCH_COMPLETED',
        message,
        retryable: false,
        targetQuantity: requestedQuantity,
        foundCount: safeInteger(effectiveRun.foundCount),
        errorMessage: message,
        meta: {
          requestedQuantity,
          deliveredCount: 0,
          databaseCount: 0,
          fetchedCount: 0,
          requiredChannels: filters.requiredChannels,
          channelMatchMode: filters.channelMatchMode,
          requiredChannelRejectedCount: 0,
          progress: 100,
          terminal: true,
          operationalState: 'parado' as RadarOperationalState,
          operationalReason: lastBatchStatus || 'auto_import_blocked',
          operationalMessage: message,
          status,
          runId: effectiveRun.id,
          nextRetryAt: null,
          attemptCount: safeInteger(effectiveRun.attemptCount),
          autoImport: {
            ran: false,
            importedCount: safeInteger(effectiveRun.importedCount),
            pendingCount: null,
            remaining: null,
            blocked: true,
            failures: [{ reason: lastBatchStatus || 'auto_import_blocked' }],
          },
          filters: {
            state: filters.state,
            city: filters.city,
            segment: filters.segment,
            radiusKm: filters.radiusKm,
            regionalCities: filters.regionalCities.map((item) => ({
              city: item.city,
              state: item.state,
              distanceKm: item.distanceKm,
            })),
            selectedSegments: this.splitHbxBatchSegments(filters.segment),
          },
        },
      };
    }
    const autoImport = !autoImportBlocked && !options?.skipAutoImport && hasAutoImportPendingCards
      ? await this.autoImportRadarSearchRunToVendas(user, effectiveRun.id).catch((error: any) => {
          this.logger.warn(`[radar-vendas] auto-import ignorado run=${effectiveRun.id}: ${String(error?.message || error)}`);
          return null;
        })
      : null;
    if (autoImport?.blocked) {
      const pausedRun = await this.prisma.webscrapingSearchRun.findUnique({ where: { id: effectiveRun.id } }).catch(() => null);
      if (pausedRun && this.isSearchRunPausedByLimit(pausedRun)) {
        return this.buildPausedRadarSearchRunResponse(pausedRun);
      }
      const message = 'Radar parado pelo limite de cards. Nada sera entregue depois automaticamente.';
      return {
        id: effectiveRun.id,
        runId: effectiveRun.id,
        status: 'completed_insufficient_results',
        items: [],
        total: 0,
        code: 'RADAR_SEARCH_COMPLETED',
        message,
        retryable: false,
        targetQuantity: requestedQuantity,
        foundCount: safeInteger(effectiveRun.foundCount),
        errorMessage: message,
        meta: {
          requestedQuantity,
          deliveredCount: 0,
          databaseCount: 0,
          fetchedCount: 0,
          requiredChannels: filters.requiredChannels,
          channelMatchMode: filters.channelMatchMode,
          requiredChannelRejectedCount: 0,
          progress: 100,
          terminal: true,
          operationalState: 'parado' as RadarOperationalState,
          operationalReason: 'auto_import_blocked',
          operationalMessage: message,
          status: 'completed_insufficient_results',
          runId: effectiveRun.id,
          nextRetryAt: null,
          attemptCount: safeInteger(effectiveRun.attemptCount),
          autoImport,
          filters: {
            state: filters.state,
            city: filters.city,
            segment: filters.segment,
            radiusKm: filters.radiusKm,
            regionalCities: filters.regionalCities.map((item) => ({
              city: item.city,
              state: item.state,
              distanceKm: item.distanceKm,
            })),
            selectedSegments: this.splitHbxBatchSegments(filters.segment),
          },
        },
      };
    }
    if (autoImport?.processedCount || autoImport?.importedCount) {
      orderedRows = await this.findRadarPoolRowsForRunItems(
        context.companyId,
        primaryFoundItems,
        candidateLookupLimit,
      );
    }
    const includeSmartFields = await this.canUseRadarSmartLeadFields(context.companyId);
    const rowPublicItems = orderedRows.map((row) => this.buildRadarLeadPublic(row, { includeSmartFields }));
    const seenPhones = new Set(
      rowPublicItems
        .map((item: any) => normalizePhoneDigits(item?.phoneDigits || item?.phone))
        .filter(Boolean),
    );
    const seenPlaces = new Set(
      rowPublicItems
        .map((item: any) => String(item?.placeId || '').trim())
        .filter(Boolean),
    );
    const seenNames = new Set(
      rowPublicItems
        .map((item: any) => normalizeLookupValue(`${item?.name || ''}-${item?.city || filters.city}-${item?.state || filters.state}`))
        .filter(Boolean),
    );
    const fallbackSourceItems = primaryFoundItems;
    const fallbackRunItems = fallbackSourceItems.filter((item: any) => {
      const contact = this.mapRunItemToContact(item);
      const phone = normalizePhoneDigits(contact.phoneDigits || contact.phone || item?.phoneDigits || item?.phone);
      const place = String(contact.placeId || item?.placeId || '').trim();
      const nameKey = normalizeLookupValue(`${contact.name || item?.name || ''}-${(contact as any).city || item?.city || filters.city}-${(contact as any).state || item?.state || filters.state}`);
      if (phone && seenPhones.has(phone)) return false;
      if (place && seenPlaces.has(place)) return false;
      if (nameKey && seenNames.has(nameKey)) return false;
      if (phone) seenPhones.add(phone);
      if (place) seenPlaces.add(place);
      if (nameKey) seenNames.add(nameKey);
      return true;
    }).slice(0, Math.max(0, requestedQuantity - rowPublicItems.length));
    const fallbackPublicItems = fallbackRunItems.map((item: any, index: number) => {
      const contact = this.mapRunItemToContact(item) as any;
      const localFilters = {
        ...filters,
        city: String(contact.city || item?.city || filters.city || '').trim(),
        state: String(contact.state || item?.state || filters.state || '').trim(),
        segment: String(contact.segment || item?.segment || filters.segment || '').trim(),
        normalizedCity: normalizeLookupValue(contact.city || item?.city || filters.city || ''),
        normalizedSegment: normalizeLookupValue(contact.segment || item?.segment || filters.segment || ''),
      } as NormalizedRadarFilters;
      return {
        ...this.buildDirectRadarLeadPublic(contact, localFilters, rowPublicItems.length + index),
        id: `run:${effectiveRun.id}:${item.id}`,
        radarRunId: effectiveRun.id,
        radarRunItemId: item.id,
        premiumFeatureStatus: includeSmartFields ? 'enrichment_pending' : 'locked',
        premiumLocked: !includeSmartFields,
        premiumTeaser: true,
      };
    });
    const publicCandidates = [...rowPublicItems, ...fallbackPublicItems].slice(0, requestedQuantity);
    const whatsappMode = this.radarWhatsappCheckModeByRunId.get(effectiveRun.id) || 'off';
    const whatsapp = await this.applyRadarWhatsappCheck(
      context,
      publicCandidates,
      whatsappMode,
    );
    const items = includeSmartFields ? whatsapp.items : whatsapp.items.map((item: any) => this.maskRadarSmartFieldsForList(item));
    const deliveredCount = items.length;
    const databaseCount = foundItems.filter((item: any) => String(item.source || '') === 'radar_database').length;
    const fetchedCount = Math.max(0, deliveredCount - databaseCount);
    const progress = requestedQuantity > 0
      ? Math.min(100, Math.round((Math.max(deliveredCount, safeInteger(effectiveRun.foundCount)) / requestedQuantity) * 100))
      : 100;
    const qualitySummary = this.buildSearchRunQualitySummary(effectiveRun, deliveredCount);
    const message = this.buildRadarSearchRunMessage(effectiveRun, deliveredCount, requestedQuantity);
    const operational = this.resolveRadarRunOperationalState(effectiveRun, status, message);
    if (terminal) {
      await this.updateSearchRunMetrics(effectiveRun.id, {
        status,
        durationMs: safeInteger(qualitySummary.durationMs),
      }).catch(() => null);
    }

    return {
      id: effectiveRun.id,
      runId: effectiveRun.id,
      status,
      items,
      total: terminal ? deliveredCount : requestedQuantity,
      code: terminal ? 'RADAR_SEARCH_COMPLETED' : 'RADAR_SEARCH_RUNNING',
      message,
      retryable: !terminal,
      targetQuantity: requestedQuantity,
      foundCount: Math.max(deliveredCount, safeInteger(effectiveRun.foundCount)),
      errorMessage: message || effectiveRun.errorMessage || null,
      meta: {
        requestedQuantity,
        deliveredCount,
        databaseCount,
        fetchedCount,
        requiredChannels: filters.requiredChannels,
        channelMatchMode: filters.channelMatchMode,
        requiredChannelRejectedCount,
        progress,
        terminal,
        operationalState: operational.state,
        operationalReason: operational.reason,
        operationalMessage: operational.message,
        status,
        runId: effectiveRun.id,
        nextRetryAt: effectiveRun.nextRetryAt instanceof Date ? effectiveRun.nextRetryAt.toISOString() : null,
        attemptCount: safeInteger(effectiveRun.attemptCount),
        autoImport: autoImport || {
          ran: false,
          importedCount: safeInteger(effectiveRun.importedCount),
          pendingCount: null,
          remaining: null,
          failures: [],
        },
        filters: {
          state: filters.state,
          city: filters.city,
          segment: filters.segment,
          radiusKm: filters.radiusKm,
          regionalCities: filters.regionalCities.map((item) => ({
            city: item.city,
            state: item.state,
            distanceKm: item.distanceKm,
          })),
          selectedSegments: this.splitHbxBatchSegments(filters.segment),
          targetType: filters.targetType,
          preferredChannels: filters.preferredChannels,
          requiredChannels: filters.requiredChannels,
          channelMatchMode: filters.channelMatchMode,
        },
        searchScope: metrics?.searchScope || {
          currentCity: filters.city,
          currentState: filters.state,
          currentSegment: this.splitHbxBatchSegments(filters.segment)[0] || filters.segment,
          cityIndex: 1,
          cityCount: Math.max(1, filters.regionalCities.length || 1),
          segmentIndex: 1,
          segmentCount: Math.max(1, this.splitHbxBatchSegments(filters.segment).length || 1),
          queryIndex: 0,
          queryCount: 0,
          taskIndex: 0,
          taskCount: 0,
          radiusKm: filters.radiusKm,
        },
        qualitySummary,
        whatsappCheck: whatsapp.meta,
      },
    };
  }

  async startRadarSearchRunForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters(input);
    if (!filters.normalizedCity || !filters.normalizedSegment) {
      throw new BadRequestException('Cidade e segmento sao obrigatorios para pesquisar no Radar.');
    }
    await this.assertSearchRunPersistence();
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    let quotaBlocked = false;
    let quotaRemaining: number | null = null;
    let quotaBlockedCode: string | null = null;
    let quotaBlockedMessage: string | null = null;
    if (this.commercialUsageLimits) {
      const usage = await this.commercialUsageLimits.getUsageSnapshot(context.companyId, context.userId).catch(() => null);
      const cardLimits = usage ? (usage as any).cards || {} : {};
      const dailyRemaining = Number(cardLimits.dailyRemaining);
      const monthlyRemaining = Number(cardLimits.remaining);
      const perUserRemaining = cardLimits.perUserLimit != null
        ? Number(cardLimits.userLimit || 0) - Number(cardLimits.userUsed || 0)
        : monthlyRemaining;
      const effectiveQuotaRemaining = Math.min(
        ...[dailyRemaining, monthlyRemaining, perUserRemaining].filter((value) => Number.isFinite(value)),
      );
      if (Number.isFinite(effectiveQuotaRemaining)) {
        if (effectiveQuotaRemaining <= 0) {
          quotaBlocked = true;
          quotaRemaining = 0;
        } else {
          filters.quantity = Math.max(1, Math.min(filters.quantity, Math.max(0, Math.trunc(effectiveQuotaRemaining))));
          quotaRemaining = Math.max(0, Math.trunc(effectiveQuotaRemaining));
        }
      }
      const sellerQuota = await this.commercialUsageLimits
        .limitRequestedCardsBySellerActiveQuota(context.companyId, context.userId, filters.quantity)
        .catch(() => null);
      if (sellerQuota?.quota?.seller) {
        if (Number(sellerQuota.limit || 0) <= 0) {
          quotaBlocked = true;
          quotaRemaining = 0;
          quotaBlockedCode = sellerQuota.quota.code || 'SELLER_CARD_QUOTA_REACHED';
          quotaBlockedMessage = 'Seu limite de cards ativos foi atingido. Finalize, transfira ou peça mais cards ao responsável.';
        } else {
          filters.quantity = Math.max(1, Math.min(filters.quantity, Math.trunc(Number(sellerQuota.limit || 0))));
          quotaRemaining = quotaRemaining == null
            ? Math.trunc(Number(sellerQuota.limit || 0))
            : Math.min(quotaRemaining, Math.trunc(Number(sellerQuota.limit || 0)));
        }
      }
    }
    filters.limit = Math.max(filters.limit, filters.quantity);

    const normalized = this.buildNormalizedSearchInputFromRadarFilters(filters);
    const matchingRun = await this.findActiveRadarRunForFilters(context, filters);
    await this.cancelIncompatibleActiveRadarRuns(context, filters, matchingRun?.id || null);
    if (matchingRun?.id) {
      await this.resumePausedSearchRunIfPossible(matchingRun).catch(() => false);
      return this.buildRadarSearchRunResponse(user, matchingRun.id);
    }

    const vendasGate = await this.assertRadarCanFeedVendas(context);
    const vendasStockTarget = Math.max(1, safeInteger(filters.stockOverride ? filters.desiredStock : filters.quantity));
    if (safeInteger(vendasGate.pendingCount) >= vendasStockTarget || quotaBlocked) {
      const now = new Date();
      const pauseReason = quotaBlocked ? 'vendas_card_limit_start' : 'vendas_stock_limit_start';
      const pauseMessage = quotaBlocked
        ? quotaBlockedMessage || 'Radar pausado. Limite de cards atingido; vou retomar esta mesma pesquisa quando houver cota.'
        : `Radar pausado. Vendas ja esta com ${safeInteger(vendasGate.pendingCount)} de ${vendasStockTarget} card(s). Vou retomar esta mesma pesquisa quando houver espaco.`;
      const retryAt = new Date(Date.now() + this.getRadarLimitPauseRetryDelayMs(pauseReason));
      const run = await this.prisma.webscrapingSearchRun.create({
        data: {
          companyId: context.companyId,
          userId: context.userId,
          status: 'sleeping',
          city: normalized.city,
          state: normalized.state || null,
          segment: normalized.segment,
          engine: 'hbx',
          targetType: normalized.targetType,
          targetQuantity: normalized.quantity,
          startedAt: null,
          finishedAt: null,
          errorMessage: pauseMessage,
          lastBatchStatus: pauseReason,
          nextRetryAt: retryAt,
          metricsJson: JSON.stringify({
            activeSearchSignature: this.buildRadarActiveSearchSignature(filters),
            vendasStockTarget,
            vendasStockBefore: safeInteger(vendasGate.pendingCount),
            desiredStock: filters.desiredStock,
            minimumStock: filters.minimumStock,
            quotaRemaining,
            quotaBlockedCode,
            radarPauseReason: pauseReason,
            radarPausedAt: now.toISOString(),
            radarPauseRetryAt: retryAt.toISOString(),
            radiusKm: filters.radiusKm,
            originLat: filters.originLat,
            originLng: filters.originLng,
            scoreRange: filters.scoreRange,
            regionalCities: filters.regionalCities.map((item) => ({
              city: item.city,
              state: item.state,
              distanceKm: item.distanceKm,
            })),
            selectedSegments: this.splitHbxBatchSegments(filters.segment),
            searchScope: {
              currentCity: filters.city,
              currentState: filters.state,
              currentSegment: this.splitHbxBatchSegments(filters.segment)[0] || filters.segment,
              cityIndex: 1,
              cityCount: Math.max(1, filters.regionalCities.length || 1),
              segmentIndex: 1,
              segmentCount: Math.max(1, this.splitHbxBatchSegments(filters.segment).length || 1),
              queryIndex: 0,
              queryCount: 0,
              taskIndex: 0,
              taskCount: 0,
              radiusKm: filters.radiusKm,
              regionalCities: filters.regionalCities.map((item) => ({
                city: item.city,
                state: item.state,
                distanceKm: item.distanceKm,
              })),
              selectedSegments: this.splitHbxBatchSegments(filters.segment),
            },
            channelFilters: this.buildChannelFiltersJson({
              preferredChannels: filters.preferredChannels,
              requiredChannels: filters.requiredChannels,
              channelMatchMode: filters.channelMatchMode,
            }),
            ...(filters.salesProfile ? { salesProfile: filters.salesProfile } : {}),
          }),
        },
      });
      this.radarWhatsappCheckModeByRunId.set(run.id, filters.whatsappCheckMode);
      this.scheduleSearchRunPump(retryAt.getTime() - Date.now());
      return this.buildRadarSearchRunResponse(user, run.id);
    }

    let stockRows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: Math.max(filters.quantity, filters.minimumStock, 100),
      requirePhone: false,
      availableOnly: true,
    });
    let relaxedStockLookup = false;
    if (!stockRows.length && filters.salesProfile) {
      stockRows = await this.queryRadarRowsForCompany(context.companyId, {
        ...filters,
        salesProfile: null,
      }, {
        limit: Math.max(filters.quantity, filters.minimumStock, 100),
        requirePhone: false,
        availableOnly: true,
      });
      relaxedStockLookup = stockRows.length > 0;
    }
    let immediateRows = stockRows.slice(0, filters.quantity);
    const includeSmartFields = await this.canUseRadarSmartLeadFields(context.companyId);
    if (filters.whatsappCheckMode === 'only_valid' && immediateRows.length) {
      const whatsappPrecheck = await this.applyRadarWhatsappCheck(
        context,
        immediateRows.map((row) => this.buildRadarLeadPublic(row, { includeSmartFields })),
        'only_valid',
      );
      const confirmedIds = new Set(whatsappPrecheck.items.map((item: any) => String(item?.id || '')).filter(Boolean));
      immediateRows = immediateRows.filter((row) => confirmedIds.has(String(row?.id || '')));
    }
    let claimedRows = immediateRows;
    if (immediateRows.length) {
      claimedRows = await this.markRadarDelivered(context.companyId, context.userId, immediateRows).catch((error: any) => {
        this.logger.warn(`[radar-run] falha ao reservar estoque inicial company=${context.companyId}: ${String(error?.message || error)}`);
        return immediateRows;
      });
      if (!claimedRows.length) claimedRows = immediateRows;
    }

    const now = new Date();
    const completedFromDatabase = claimedRows.length >= filters.quantity;
    const run = await this.prisma.webscrapingSearchRun.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        status: completedFromDatabase ? 'completed' : 'queued',
        city: normalized.city,
        state: normalized.state || null,
        segment: normalized.segment,
        engine: 'hbx',
        targetType: normalized.targetType,
        targetQuantity: normalized.quantity,
        startedAt: claimedRows.length ? now : null,
        finishedAt: completedFromDatabase ? now : null,
        errorMessage: completedFromDatabase
          ? 'Entregue do banco Radar/HBX. A frota HBX nao foi acionada.'
          : claimedRows.length
            ? `Entreguei ${claimedRows.length} card(s) do banco. Radar trabalhando para completar a pesquisa.`
            : 'Sem cards prontos no banco. Busca enviada para a fila HBX.',
        metricsJson: JSON.stringify({
          activeSearchSignature: this.buildRadarActiveSearchSignature(filters),
          vendasStockTarget,
          vendasStockBefore: safeInteger(vendasGate.pendingCount),
          desiredStock: filters.desiredStock,
          minimumStock: filters.minimumStock,
          radiusKm: filters.radiusKm,
          originLat: filters.originLat,
          originLng: filters.originLng,
          scoreRange: filters.scoreRange,
          regionalCities: filters.regionalCities.map((item) => ({
            city: item.city,
            state: item.state,
            distanceKm: item.distanceKm,
          })),
          selectedSegments: this.splitHbxBatchSegments(filters.segment),
          searchScope: {
            currentCity: filters.city,
            currentState: filters.state,
            currentSegment: this.splitHbxBatchSegments(filters.segment)[0] || filters.segment,
            cityIndex: 1,
            cityCount: Math.max(1, filters.regionalCities.length || 1),
            segmentIndex: 1,
            segmentCount: Math.max(1, this.splitHbxBatchSegments(filters.segment).length || 1),
            queryIndex: 0,
            queryCount: 0,
            taskIndex: 0,
            taskCount: 0,
            radiusKm: filters.radiusKm,
            regionalCities: filters.regionalCities.map((item) => ({
              city: item.city,
              state: item.state,
              distanceKm: item.distanceKm,
            })),
            selectedSegments: this.splitHbxBatchSegments(filters.segment),
          },
          channelFilters: this.buildChannelFiltersJson({
            preferredChannels: filters.preferredChannels,
            requiredChannels: filters.requiredChannels,
            channelMatchMode: filters.channelMatchMode,
          }),
          relaxedStockLookup,
          ...(filters.salesProfile ? { salesProfile: filters.salesProfile } : {}),
        }),
      },
    });
    this.radarWhatsappCheckModeByRunId.set(run.id, filters.whatsappCheckMode);

    if (claimedRows.length) {
      const savedCounts = await this.saveSearchRunResults(
        context,
        normalized,
        run.id,
        this.restoreRadarPoolResults(claimedRows).slice(0, filters.quantity),
        'radar_database',
      );
      await this.recalculateSearchRunCounters(run.id);
      await this.updateSearchRunMetrics(run.id, {
        sourceEngine: 'radar_database',
        cacheHit: true,
        status: completedFromDatabase ? 'completed' : 'queued',
      }).catch(() => null);
    }

    if (completedFromDatabase) {
      await this.persistSearchRunHistoryIfPossible(run.id, normalized, context).catch(() => null);
    } else {
      this.scheduleSearchRunPump(0);
    }

    return this.buildRadarSearchRunResponse(user, run.id);
  }

  async getRadarSearchRunForUser(user: any, runId: string) {
    return this.buildRadarSearchRunResponse(user, runId);
  }

  async getLatestRadarSearchRunForUser(user: any) {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    const run = await this.prisma.webscrapingSearchRun.findFirst({
      where: {
        companyId: context.companyId,
        engine: 'hbx',
        status: { in: ['queued', 'running', 'sleeping', 'paused'] as any },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    if (!run) return null;
    return this.buildRadarSearchRunResponse(user, run.id);
  }

  async cancelRadarSearchRunForUser(user: any, runId: string) {
    await this.cancelSearchRunForUser(user, runId);
    return this.buildRadarSearchRunResponse(user, runId, { skipAutoImport: true });
  }

  private async findActiveRadarRunForFilters(context: SearchExecutionContext, filters: NormalizedRadarFilters) {
    const delegate = (this.prisma as any).webscrapingSearchRun;
    if (!delegate?.findMany) return null;
    const activeRuns = await delegate.findMany({
      where: {
        companyId: context.companyId,
        engine: 'hbx',
        status: { in: ['queued', 'running', 'sleeping'] as any },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 20,
    }).catch(() => []);
    return (activeRuns || []).find((run: any) => this.radarRunMatchesFilters(run, filters)) || null;
  }

  private async cancelIncompatibleActiveRadarRuns(context: SearchExecutionContext, filters: NormalizedRadarFilters, keepRunId?: string | null) {
    const delegate = (this.prisma as any).webscrapingSearchRun;
    if (!delegate?.findMany) return { canceledCount: 0 };
    const activeRuns = await delegate.findMany({
      where: {
        companyId: context.companyId,
        engine: 'hbx',
        status: { in: ['queued', 'running', 'sleeping'] as any },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 50,
    }).catch(() => []);
    let canceledCount = 0;
    for (const run of activeRuns || []) {
      const runId = String(run?.id || '').trim();
      if (!runId || (keepRunId && runId === keepRunId)) continue;
      if (this.radarRunMatchesFilters(run, filters)) continue;
      await this.prisma.webscrapingSearchRun.updateMany({
        where: {
          id: runId,
          companyId: context.companyId,
          status: { in: ['queued', 'running', 'sleeping'] as any },
        },
        data: {
          status: 'canceled',
          lastBatchStatus: 'replaced_by_new_search',
          errorMessage: 'Pesquisa encerrada porque uma nova busca com outros filtros foi iniciada.',
          nextRetryAt: null,
          assignedEngineId: null,
          assignedEngineUrl: null,
          assignedEngineIndex: null,
          finishedAt: new Date(),
        },
      }).catch(() => null);
      if (run?.assignedEngineId) {
        await this.getEnginePool().releaseEngine(String(run.assignedEngineId)).catch(() => null);
      }
      await this.releaseRadarReservationsForSearchRun(context, runId, 'Pesquisa substituida por nova busca.').catch((error: any) => {
        this.logger.warn(`[radar-run] falha ao liberar reservas do run substituido=${runId}: ${String(error?.message || error)}`);
      });
      canceledCount += 1;
    }
    return { canceledCount };
  }

  private async releaseRadarReservationsForSearchRun(context: SearchExecutionContext, runId: string, note?: string | null) {
    if (!(await this.supportsRadarOwnershipPersistence())) return { releasedCount: 0 };
    const run = await this.prisma.webscrapingSearchRun.findFirst({
      where: { id: String(runId || '').trim(), companyId: context.companyId },
      include: { items: { where: { status: 'found' as any }, orderBy: { createdAt: 'asc' } } },
    }).catch(() => null);
    const foundItems = Array.isArray(run?.items) ? run.items : [];
    if (!foundItems.length) return { releasedCount: 0 };
    const rows = await this.findRadarPoolRowsForRunItems(
      context.companyId,
      foundItems,
      Math.max(foundItems.length, 100),
    );
    let releasedCount = 0;
    const now = new Date();
    for (const row of rows) {
      if (!this.isReleasableRadarReservation(row)) continue;
      const previousStatus = this.normalizeRadarLeadStatus(row.status);
      const updated = await (this.prisma as any).radarLeadPool.updateMany({
        where: {
          id: row.id,
          ownerCompanyId: context.companyId,
          status: { in: ['clean', 'new', 'reserved', 'delivered'] as any },
        },
        data: {
          ownerCompanyId: null,
          claimedAt: null,
          status: 'clean',
          lastSeenAt: now,
        },
      }).catch(() => ({ count: 0 }));
      if (!updated?.count) continue;
      await (this.prisma as any).radarLeadCompanyState.updateMany({
        where: {
          companyId: context.companyId,
          radarLeadId: row.id,
          status: { in: ['clean', 'new', 'reserved', 'delivered'] as any },
          vendasLeadId: null,
        },
        data: {
          status: 'new',
          lastActionAt: now,
        },
      }).catch(() => null);
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'ownership_released',
        note: note || 'Reserva liberada ao parar a pesquisa.',
        statusFrom: previousStatus,
        statusTo: 'clean',
      });
      releasedCount += 1;
    }
    return { releasedCount };
  }

  private async markRadarDelivered(
    companyId: number,
    userId: number,
    rows: any[],
    options: { assignedUserId?: number | null; assignedByUserId?: number | null } = {},
  ) {
    const context = { companyId, userId } as SearchExecutionContext;
    const assignedUserId = Math.trunc(Number(options.assignedUserId || 0)) || null;
    const assignedByUserId = assignedUserId ? Math.trunc(Number(options.assignedByUserId || userId || 0)) || null : null;
    const claimedRows: any[] = [];
    for (const row of rows) {
      const existing = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      if (['imported_to_vendas', 'sent_to_vendas'].includes(String(existing?.status || '')) || this.isRadarProtectedStatus(existing?.status || row?.status)) continue;
      const quality = this.extractLeadQualityFromObject(row) || this.extractLeadQualityFromObject(row?.enrichmentJson) || this.extractLeadQualityFromObject(row?.metadataJson);
      if (quality && !this.isApprovedLeadQuality(quality)) continue;
      await this.claimRadarLeadForCompany(context, row, {
        poolStatus: 'reserved',
        companyStatus: existing?.status && !['new', 'clean'].includes(String(existing.status)) ? this.normalizeRadarLeadStatus(existing.status) : 'reserved',
        eventType: 'ownership_reserved',
        note: 'Card puxado no Radar Digital.',
        assignedUserId,
        assignedByUserId,
      }).then(() => {
        claimedRows.push(row);
      }).catch((error: any) => {
        this.logger.warn(`[radar] card nao reservado company=${companyId} lead=${row?.id || '-'}: ${String(error?.message || error)}`);
      });
    }
    return claimedRows;
  }

  async pullRadarLeadsForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters(input);
    if (!filters.normalizedCity || !filters.normalizedSegment) {
      throw new BadRequestException('Cidade e segmento sao obrigatorios para puxar cards do Radar.');
    }
    if (!(await this.supportsRadarPersistence())) {
      try {
        return await this.searchRadarDirectForUser(user, filters, 'radar_database_unavailable');
      } catch (error: any) {
        return {
          items: [],
          total: 0,
          code: 'RADAR_DIRECT_UNAVAILABLE',
          message: 'Pesquisa concluida. Nao ha cards publicos suficientes para esse filtro agora.',
          retryable: false,
          meta: {
            requestedQuantity: filters.quantity,
            deliveredCount: 0,
            filters: {
              state: filters.state,
              city: filters.city,
              segment: filters.segment,
              targetType: filters.targetType,
            },
            direct: {
              ran: true,
              reason: 'radar_database_unavailable_direct_search_failed',
              technicalMessage: this.extractHbxErrorMessage(error),
            },
          },
        };
      }
    }
    if (this.commercialUsageLimits) {
      const sellerQuota = await this.commercialUsageLimits
        .limitRequestedCardsBySellerActiveQuota(context.companyId, context.userId, filters.quantity)
        .catch(() => null);
      if (sellerQuota?.quota?.seller) {
        if (Number(sellerQuota.limit || 0) <= 0) {
          throw new ConflictException({
            ok: false,
            code: sellerQuota.quota.code || 'SELLER_CARD_QUOTA_REACHED',
            message: 'Seu limite de cards ativos foi atingido. Finalize, transfira ou peça mais cards ao responsável.',
            activeCount: sellerQuota.quota.activeCount,
            effectiveLimit: sellerQuota.quota.effectiveLimit,
            availableSlots: 0,
            quota: sellerQuota.quota,
          });
        }
        filters.quantity = Math.max(1, Math.min(filters.quantity, Math.trunc(Number(sellerQuota.limit || 0))));
        filters.limit = Math.max(filters.limit, filters.quantity);
      }
    }

    let rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: Math.max(filters.quantity, filters.minimumStock, 100),
      requirePhone: false,
      availableOnly: true,
    });
    const cleanStockBefore = rows.length;
    let replenish: any = {
      ran: false,
      cleanStockBefore,
      cleanStockAfter: cleanStockBefore,
      fetchedCount: 0,
    };
    let replenishErrorMessage: string | null = null;

    if (cleanStockBefore < Math.max(filters.minimumStock, filters.quantity)) {
      try {
        replenish = await this.replenishRadarStockForUser(user, {
          ...input,
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
          desiredStock: filters.desiredStock,
          minimumStock: filters.minimumStock,
          engine: filters.engine,
          targetType: filters.targetType,
        });
      } catch (error: any) {
        const errorMessage = this.extractHbxErrorMessage(error);
        replenishErrorMessage = 'Motores em aquecimento/cooldown. Entreguei os cards disponiveis do banco; tente novamente em instantes.';
        replenish = {
          ran: true,
          reason: 'replenish_failed_using_database',
          cleanStockBefore,
          cleanStockAfter: cleanStockBefore,
          fetchedCount: 0,
          errorMessage: replenishErrorMessage,
          technicalMessage: errorMessage,
        };
        this.logger.warn(
          `[radar] reposicao falhou; usando estoque existente company=${context.companyId} city=${filters.normalizedCity} state=${filters.state} segment=${filters.normalizedSegment} targetType=${filters.targetType}: ${errorMessage}`,
        );
      }
      rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
        limit: Math.max(filters.quantity, filters.minimumStock, 100),
        requirePhone: false,
        availableOnly: true,
      });
    }

    let deliveredRows = rows.slice(0, filters.quantity);
    const includeSmartFields = await this.canUseRadarSmartLeadFields(context.companyId);
    if (filters.whatsappCheckMode === 'only_valid' && deliveredRows.length) {
      const whatsappPrecheck = await this.applyRadarWhatsappCheck(
        context,
        deliveredRows.map((row) => this.buildRadarLeadPublic(row, { includeSmartFields })),
        'only_valid',
      );
      const confirmedIds = new Set(whatsappPrecheck.items.map((item: any) => String(item?.id || '')).filter(Boolean));
      deliveredRows = deliveredRows.filter((row) => confirmedIds.has(String(row?.id || '')));
    }

    if (!deliveredRows.length && replenishErrorMessage) {
      try {
        return await this.searchRadarDirectForUser(user, filters, 'radar_database_empty_after_replenish_error', replenish.technicalMessage || replenishErrorMessage);
      } catch (error: any) {
        return {
          items: [],
          total: 0,
          code: 'NO_ENGINE_AVAILABLE',
          message: 'Motores ocupados. Nao havia cards disponiveis no banco para esse filtro.',
          retryable: true,
          meta: {
            requestedQuantity: filters.quantity,
            deliveredCount: 0,
            filters: {
              state: filters.state,
              city: filters.city,
              segment: filters.segment,
              targetType: filters.targetType,
            },
            replenish,
            direct: {
              ran: true,
              reason: 'direct_search_failed_after_replenish_error',
              technicalMessage: this.extractHbxErrorMessage(error),
            },
            availableFilters: this.buildRadarAvailableFilters(await this.queryRadarRowsForCompany(context.companyId, {
              ...filters,
              city: '',
              state: '',
              segment: '',
              normalizedCity: '',
              normalizedSegment: '',
            }, { limit: 2000 })),
          },
        };
      }
    }

    if (!deliveredRows.length) {
      try {
        return await this.searchRadarDirectForUser(user, filters, 'radar_database_empty_after_replenish');
      } catch (error: any) {
        return {
          items: [],
          total: 0,
          code: 'RADAR_NO_RESULTS',
          message: 'Pesquisa concluida. Nao ha cards publicos suficientes para esse filtro agora.',
          retryable: false,
          meta: {
            requestedQuantity: filters.quantity,
            deliveredCount: 0,
            filters: {
              state: filters.state,
              city: filters.city,
              segment: filters.segment,
              targetType: filters.targetType,
            },
            replenish,
            direct: {
              ran: true,
              reason: 'direct_search_finished_without_cards',
              technicalMessage: this.extractHbxErrorMessage(error),
            },
            availableFilters: this.buildRadarAvailableFilters(await this.queryRadarRowsForCompany(context.companyId, {
              ...filters,
              city: '',
              state: '',
              segment: '',
              normalizedCity: '',
              normalizedSegment: '',
            }, { limit: 2000 })),
          },
        };
      }
    }
    
    let claimedRows = deliveredRows;
    const assignToUserId = this.isHbxOperationSellerUser(user) ? context.userId : null;
    try {
      claimedRows = await this.markRadarDelivered(context.companyId, context.userId, deliveredRows, {
        assignedUserId: assignToUserId,
        assignedByUserId: assignToUserId ? context.userId : null,
      });
      if (!claimedRows.length && deliveredRows.length) {
        claimedRows = deliveredRows;
      }
    } catch (error: any) {
      this.logger.error(`[radar] failed to mark delivered: ${error?.message || error}`);
      claimedRows = deliveredRows;
    }

    let items: any[] = [];
    let whatsapp: Awaited<ReturnType<RadarWebscrapingCoreService['applyRadarWhatsappCheck']>> | null = null;
    try {
      const publicItems = claimedRows.map((row) => this.buildRadarLeadPublic({
        ...row,
        ownerCompanyId: context.companyId,
        claimedAt: new Date(),
        status: 'reserved',
        companyStates: [{
          status: 'reserved',
          assignedUserId: assignToUserId,
          assignedByUserId: assignToUserId ? context.userId : null,
        }],
      }, { includeSmartFields }));
      whatsapp = await this.applyRadarWhatsappCheck(context, publicItems, filters.whatsappCheckMode);
      items = includeSmartFields ? whatsapp.items : whatsapp.items.map((item: any) => this.maskRadarSmartFieldsForList(item));
    } catch (error: any) {
      this.logger.error(`[radar] failed to build public leads: ${error?.message || error}`);
      items = claimedRows.map((row) => ({
        placeId: row?.placeId || `radar:${row?.id}`,
        name: String(row?.name || 'Empresa sem nome'),
        phone: row?.phone || row?.phoneDigits || '',
      }));
      whatsapp = await this.applyRadarWhatsappCheck(context, items, filters.whatsappCheckMode);
      items = whatsapp.items;
    }

    return {
      items,
      total: items.length,
      meta: {
        requestedQuantity: filters.quantity,
        deliveredCount: claimedRows.length,
        filters: {
          state: filters.state,
          city: filters.city,
          segment: filters.segment,
          targetType: filters.targetType,
        },
        cleanStockBefore,
        cleanStockAfter: rows.length,
        minimumStock: filters.minimumStock,
        desiredStock: filters.desiredStock,
        replenish,
        whatsappCheck: whatsapp?.meta || null,
        availableFilters: this.buildRadarAvailableFilters(await this.queryRadarRowsForCompany(context.companyId, {
          ...filters,
          city: '',
          state: '',
          segment: '',
          normalizedCity: '',
          normalizedSegment: '',
        }, { limit: 2000 })),
      },
    };
  }

  private async getRadarStockConfig(filters: NormalizedRadarFilters) {
    if (filters.stockOverride) {
      return {
        desiredStock: filters.desiredStock,
        minimumStock: filters.minimumStock,
        engine: filters.engine,
        targetType: filters.targetType,
      };
    }
    if (!(await this.prisma.hasTable('RadarStockConfig'))) {
      return {
        desiredStock: filters.desiredStock,
        minimumStock: filters.minimumStock,
        engine: filters.engine,
        targetType: filters.targetType,
      };
    }
    const existing = await (this.prisma as any).radarStockConfig.findUnique({
      where: {
        normalizedCity_state_normalizedSegment: {
          normalizedCity: filters.normalizedCity,
          state: filters.state || '',
          normalizedSegment: filters.normalizedSegment,
        },
      },
    }).catch(() => null);
    if (!existing) {
      await (this.prisma as any).radarStockConfig.create({
        data: {
          normalizedCity: filters.normalizedCity,
          state: filters.state || '',
          normalizedSegment: filters.normalizedSegment,
          desiredStock: filters.desiredStock,
          minimumStock: filters.minimumStock,
          engine: filters.engine,
          targetType: filters.targetType,
          filtersJson: JSON.stringify({
            minRating: filters.minRating,
            minReviews: filters.minReviews,
            noWebsite: filters.noWebsite,
            weakWebsite: filters.weakWebsite,
            opportunityLevel: filters.opportunityLevel,
          }),
        },
      }).catch(() => null);
      return {
        desiredStock: filters.desiredStock,
        minimumStock: filters.minimumStock,
        engine: filters.engine,
        targetType: filters.targetType,
      };
    }
    return {
      desiredStock: Math.max(1, Math.trunc(Number(existing.desiredStock || filters.desiredStock))),
      minimumStock: Math.max(1, Math.trunc(Number(existing.minimumStock || filters.minimumStock))),
      engine: normalizeEngine(existing.engine || filters.engine),
      targetType: normalizeTargetType(existing.targetType || filters.targetType),
    };
  }

  async replenishRadarStockForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters(input);
    if (!filters.normalizedCity || !filters.normalizedSegment) {
      throw new BadRequestException('Cidade e segmento sao obrigatorios para repor o estoque do Radar.');
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const stockConfig = await this.getRadarStockConfig(filters);
    const effectiveFilters = {
      ...filters,
      desiredStock: stockConfig.desiredStock,
      minimumStock: stockConfig.minimumStock,
      engine: stockConfig.engine,
      targetType: stockConfig.targetType,
    };
    const beforeRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity),
      requirePhone: false,
    });
    const allKnownRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity, 1000),
      requirePhone: false,
      includeHidden: true,
    });
    const cleanStockBefore = beforeRows.length;
    if (cleanStockBefore >= effectiveFilters.minimumStock) {
      return {
        ran: false,
        reason: 'stock_above_minimum',
        cleanStockBefore,
        cleanStockAfter: cleanStockBefore,
        fetchedCount: 0,
        desiredStock: effectiveFilters.desiredStock,
        minimumStock: effectiveFilters.minimumStock,
      };
    }

    const fetchedResults: WebscrapingContactResult[] = [];
    const seenPhones = new Set(allKnownRows.map((row) => normalizePhoneDigits(row?.phoneDigits || row?.phone)).filter(Boolean));
    const seenSocialProfiles = new Set(
      allKnownRows
        .flatMap((row) => [row?.instagramUrl, row?.facebookUrl])
        .map((url) => String(url || '').trim().replace(/\/+$/, '').toLowerCase())
        .filter(Boolean),
    );
    const shortage = Math.max(0, effectiveFilters.desiredStock - cleanStockBefore);
    let attempts = 0;
    while (fetchedResults.length < shortage && attempts < 6) {
      attempts += 1;
      const batchQuantity = Math.min(maxQuantityFor(effectiveFilters.engine, effectiveFilters.targetType), shortage - fetchedResults.length);
      const response = await this.searchContactsForUser(
        user,
        {
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
          quantity: Math.max(1, batchQuantity),
          engine: effectiveFilters.engine,
          targetType: effectiveFilters.targetType,
          minRating: filters.minRating,
          minReviews: filters.minReviews,
          excludePhoneDigits: Array.from(seenPhones),
          preferredChannels: filters.preferredChannels,
          requiredChannels: filters.requiredChannels,
          channelMatchMode: filters.channelMatchMode,
        },
        {
          skipRadarLookup: true,
          skipPrivateHistory: true,
          skipTechnicalCache: true,
          recordUsage: false,
          purpose: 'radar_digital',
        },
      );
      const mappedResults = (response.results || []).map((result) => ({
        ...result,
        placeId: result.placeId || `radar_external:${normalizePhoneDigits(result.phoneDigits || result.phone) || result.name}`,
      })) as WebscrapingContactResult[];
      let acceptedInBatch = 0;
      for (const result of mappedResults) {
        const phone = normalizePhoneDigits(result.phoneDigits || result.phone);
        const socialKeys = [result.instagramUrl, result.facebookUrl]
          .map((url) => String(url || '').trim().replace(/\/+$/, '').toLowerCase())
          .filter(Boolean);
        const hasUsablePublicContact = this.hasUsablePublicContactChannel(result as any);
        if (!hasUsablePublicContact || (phone && seenPhones.has(phone)) || socialKeys.some((key) => seenSocialProfiles.has(key))) continue;
        if (phone) seenPhones.add(phone);
        socialKeys.forEach((key) => seenSocialProfiles.add(key));
        fetchedResults.push(result);
        acceptedInBatch += 1;
      }
      if (acceptedInBatch === 0) break;
    }

    if (fetchedResults.length) {
      try {
        await this.persistRadarLeadPoolBatch(
          {
            ...this.normalizeSearchInput({
              city: filters.city,
              state: filters.state,
              segment: filters.segment,
              quantity: Math.min(fetchedResults.length, maxQuantityFor(effectiveFilters.engine, effectiveFilters.targetType)),
              engine: effectiveFilters.engine,
              targetType: effectiveFilters.targetType,
              minRating: filters.minRating,
              minReviews: filters.minReviews,
              preferredChannels: filters.preferredChannels,
              requiredChannels: filters.requiredChannels,
              channelMatchMode: filters.channelMatchMode,
            }),
            city: filters.city,
            state: filters.state,
            segment: filters.segment,
            normalizedCity: filters.normalizedCity,
            normalizedSegment: filters.normalizedSegment,
          },
          fetchedResults,
          effectiveFilters.engine,
        );
      } catch (error: any) {
        this.logger.error(`[radar] failed to persist batch: ${error?.message || error}`);
      }
    }

    const afterRows = await this.queryRadarRowsForCompany(context.companyId, effectiveFilters, {
      limit: Math.max(effectiveFilters.desiredStock, effectiveFilters.minimumStock, effectiveFilters.quantity),
      requirePhone: false,
    });

    return {
      ran: true,
      reason: 'stock_below_minimum',
      cleanStockBefore,
      cleanStockAfter: afterRows.length,
      fetchedCount: fetchedResults.length,
      desiredStock: effectiveFilters.desiredStock,
      minimumStock: effectiveFilters.minimumStock,
      attempts,
    };
  }

  private async persistRadarLeadPoolBatch(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    sourceEngine: string,
    options: { campaignId?: string | null; strictLocalDdd?: boolean; sourceUrl?: string | null } = {},
  ) {
    if (!(await this.supportsRadarPersistence())) return { approvedCount: 0, duplicateCount: 0, rejectedCount: 0, savedCount: 0 };
    const delegate = (this.prisma as any).radarLeadPool;
    const now = new Date();
    const expectedDdds = this.buildExpectedDdds(input);
    const strictLocalDdd = options.strictLocalDdd === true;
    const counts = { approvedCount: 0, duplicateCount: 0, rejectedCount: 0, savedCount: 0 };
    for (const result of this.mergeDedupedContacts(results)) {
      const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
      const ddd = this.extractDdd(phoneDigits || result.phone);
      const resultCity = String((result as any).city || input.city || '').trim();
      const resultState = String((result as any).state || input.state || '').trim().toUpperCase();
      const resultSegment = String((result as any).segment || input.segment || '').trim();
      const resultNormalizedCity = normalizeLookupValue(resultCity || input.city || '');
      const resultNormalizedSegment = normalizeLookupValue(resultSegment || input.segment || '');
      const resultExpectedDdds = this.buildExpectedDdds({
        city: resultCity || input.city,
        state: resultState || input.state,
        segment: resultSegment || input.segment,
      });
      const resultWebsiteForIdentity = String((result as any).website || '').trim();
      const safeResultWebsiteForIdentity = resultWebsiteForIdentity
        && !this.isBlockedLeadOfficialWebsite(resultWebsiteForIdentity)
        && websiteHostLooksCompatibleWithLead(result, resultWebsiteForIdentity)
        ? resultWebsiteForIdentity
        : '';
      const socialIdentity = normalizeLookupValue(result.instagramUrl || result.facebookUrl || safeResultWebsiteForIdentity || '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const placeId = result.placeId && !String(result.placeId).startsWith('radar:') && !String(result.placeId).startsWith('radar_external:')
        ? String(result.placeId)
        : socialIdentity
          ? `hbx:${input.targetType}:social:${socialIdentity}`
          : null;
      if (!phoneDigits && !placeId) continue;
      const quality = this.getCandidateQuality({ ...(result as any), phoneDigits }, input);
      const dddMismatch = strictLocalDdd && resultExpectedDdds.length > 0 && ddd && !resultExpectedDdds.includes(ddd);
      const opportunityScore = this.buildOpportunityScore(result, quality);
      const opportunityReason = result.opportunityReason || this.buildOpportunityReason(result, input);
      const evidenceJson = this.parseMaybeJsonObject((result as any).evidenceJson);
      const rejectReasons = Array.isArray((result as any).rejectReasons)
        ? (result as any).rejectReasons
        : parseJsonArray((result as any).rejectReasons);
      const qualityV2 = this.extractLeadQualityV2FromObject(result as any);
      const delivery = this.classifyCardDelivery({ ...(result as any), phoneDigits }, input, quality, qualityV2);
      const existing = await delegate.findFirst({
        where: {
          OR: [
            ...(phoneDigits ? [{ phoneDigits }] : []),
            ...(placeId ? [{ placeId }] : []),
          ],
        },
      }).catch(() => null);
      const listDeliverable = this.isListDeliverableCard({ ...(result as any), phoneDigits }, input, quality, qualityV2);
      if (!listDeliverable) {
        counts.rejectedCount += 1;
        if (existing?.id && !this.isRadarProtectedStatus(existing.status)) {
          const rejectedEnrichment = this.parseMaybeJsonObject(existing.enrichmentJson);
          const rejectedMetadata = this.parseMaybeJsonObject(existing.metadataJson);
          await delegate.update({
            where: { id: existing.id },
            data: {
              status: 'rejected',
              rejectionReason: quality.status,
              opportunityScore: Math.min(opportunityScore, 25),
              evidenceJson: Object.keys(evidenceJson).length ? JSON.stringify(evidenceJson) : existing.evidenceJson || null,
              rejectReasons: JSON.stringify(Array.from(new Set([quality.status, ...rejectReasons].filter(Boolean)))),
              qualityReason: delivery.qualityReason || quality.reasons?.[0] || quality.status,
              visibilityTier: delivery.visibilityTier,
              deliveryProduct: delivery.deliveryProduct,
              enrichmentJson: JSON.stringify({ ...rejectedEnrichment, quality, delivery }),
              metadataJson: JSON.stringify({
                ...rejectedMetadata,
                targetType: input.targetType,
                expectedDdds,
                lastSourceEngine: sourceEngine,
                quality,
                delivery,
              }),
              lastSeenAt: now,
            },
          }).catch(() => null);
          counts.savedCount += 1;
        }
        continue;
      }
      if (existing?.id) counts.duplicateCount += 1;
      if (dddMismatch) counts.rejectedCount += 1;
      else counts.approvedCount += 1;
      const sourceEngines = Array.from(new Set([...parseJsonArray(existing?.sourceEngines), sourceEngine, result.source].filter(Boolean).map(String)));
      const existingWasDddMismatch = String(existing?.status || '') === 'rejected' && String(existing?.rejectionReason || '') === 'ddd_mismatch';
      const nextStatus = dddMismatch ? 'rejected' : existingWasDddMismatch ? 'clean' : existing?.status || 'clean';
      const nextRejectionReason = dddMismatch ? 'ddd_mismatch' : existingWasDddMismatch ? null : existing?.rejectionReason || null;
      const resultIdentity = {
        ...(result as any),
        name: result.name || existing?.name || '',
        city: resultCity || existing?.city || input.city || '',
        state: resultState || existing?.state || input.state || '',
        segment: resultSegment || input.segment || existing?.segment || '',
      };
      const resultInstagramRaw = String((result as any).instagramUrl || '').trim();
      const resultFacebookRaw = String((result as any).facebookUrl || '').trim();
      const existingInstagramRaw = String(existing?.instagramUrl || '').trim();
      const existingFacebookRaw = String(existing?.facebookUrl || '').trim();
      const resultInstagramUrl = resultInstagramRaw
        && !looksLikeThirdPartySocialProfile(resultInstagramRaw)
        && socialProfileLooksCompatibleWithLead(resultIdentity, resultInstagramRaw)
        ? resultInstagramRaw
        : null;
      const resultFacebookUrl = resultFacebookRaw
        && !looksLikeThirdPartySocialProfile(resultFacebookRaw)
        && socialProfileLooksCompatibleWithLead(resultIdentity, resultFacebookRaw)
        ? resultFacebookRaw
        : null;
      const existingInstagramUrl = existingInstagramRaw
        && !looksLikeThirdPartySocialProfile(existingInstagramRaw)
        && socialProfileLooksCompatibleWithLead(existing, existingInstagramRaw)
        ? existingInstagramRaw
        : null;
      const existingFacebookUrl = existingFacebookRaw
        && !looksLikeThirdPartySocialProfile(existingFacebookRaw)
        && socialProfileLooksCompatibleWithLead(existing, existingFacebookRaw)
        ? existingFacebookRaw
        : null;
      const mergedInstagramUrl = resultInstagramUrl || existingInstagramUrl;
      const mergedFacebookUrl = resultFacebookUrl || existingFacebookUrl;
      const resultWebsiteRaw = String((result as any).website || '').trim();
      const existingWebsiteRaw = String(existing?.website || '').trim();
      const resultWebsite = resultWebsiteRaw
        && !this.isBlockedLeadOfficialWebsite(resultWebsiteRaw)
        && websiteHostLooksCompatibleWithLead(result, resultWebsiteRaw)
        ? resultWebsiteRaw
        : null;
      const existingWebsite = existingWebsiteRaw
        && !this.isBlockedLeadOfficialWebsite(existingWebsiteRaw)
        && websiteHostLooksCompatibleWithLead(existing, existingWebsiteRaw)
        ? existingWebsiteRaw
        : null;
      const mergedWebsite = resultWebsite || existingWebsite || null;
      const mergedEmail = normalizeBusinessEmail((result as any).email || existing?.email || '');
      const mergedGoogleMapsUrl = String((result as any).googleMapsUrl || (result as any).mapsUrl || existing?.googleMapsUrl || '').trim() || null;
      const mergedWhatsappStatus = String(
        (result as any).whatsappStatus
        || (result as any).whatsappCheckStatus
        || this.parseMaybeJsonObject((result as any).enrichmentJson)?.whatsappStatus
        || this.parseMaybeJsonObject(existing?.enrichmentJson)?.whatsappStatus
        || '',
      ).trim() || null;
      const websiteStatus = inferWebsiteStatus(mergedWebsite);
      const mergedSocialStatus = mergedInstagramUrl || mergedFacebookUrl
        ? 'found'
        : String((result as any).socialStatus || existing?.socialStatus || '').trim() || null;
      const mergedSocialConfidence = mergedInstagramUrl || mergedFacebookUrl
        ? Math.max(80, safeInteger((result as any).socialConfidence || existing?.socialConfidence))
        : safeInteger((result as any).socialConfidence || existing?.socialConfidence);
      const mergedResult = {
        ...(result as any),
        website: mergedWebsite,
        email: mergedEmail,
        instagramUrl: mergedInstagramUrl,
        facebookUrl: mergedFacebookUrl,
        googleMapsUrl: mergedGoogleMapsUrl,
        whatsappStatus: mergedWhatsappStatus,
        whatsappCheckStatus: mergedWhatsappStatus,
        socialStatus: mergedSocialStatus,
        socialConfidence: mergedSocialConfidence,
      };
      const data = {
        companyId: existing?.companyId || null,
        placeId: placeId || existing?.placeId || null,
        name: result.name || existing?.name || 'Empresa sem nome',
        phone: result.phone || existing?.phone || phoneDigits || null,
        phoneDigits: phoneDigits || existing?.phoneDigits || null,
        ddd: ddd || existing?.ddd || null,
        expectedDddsJson: resultExpectedDdds.length ? JSON.stringify(resultExpectedDdds) : expectedDdds.length ? JSON.stringify(expectedDdds) : existing?.expectedDddsJson || null,
        address: result.address || existing?.address || null,
        city: resultCity || existing?.city || input.city || null,
        state: resultState || existing?.state || input.state || null,
        normalizedCity: resultNormalizedCity || input.normalizedCity,
        segment: resultSegment || existing?.segment || input.segment || null,
        normalizedSegment: resultNormalizedSegment || input.normalizedSegment,
        website: mergedWebsite,
        websiteStatus,
        rating: result.rating == null ? existing?.rating ?? null : result.rating,
        reviews: Math.max(safeInteger(result.reviews), safeInteger(existing?.reviews)),
        source: result.source || existing?.source || sourceEngine || null,
        sourceEngine: sourceEngine || existing?.sourceEngine || null,
        sourceUrl: options.sourceUrl || (result as any).sourceUrl || (result as any)._pageUrl || existing?.sourceUrl || null,
        sourceEngines: JSON.stringify(sourceEngines),
        evidenceJson: Object.keys(evidenceJson).length ? JSON.stringify(evidenceJson) : existing?.evidenceJson || null,
        rejectReasons: rejectReasons.length ? JSON.stringify(rejectReasons) : existing?.rejectReasons || null,
        qualityReason: (result as any).qualityReason || delivery.qualityReason || existing?.qualityReason || null,
        visibilityTier: (result as any).visibilityTier || delivery.visibilityTier || existing?.visibilityTier || null,
        deliveryProduct: delivery.deliveryProduct || existing?.deliveryProduct || null,
        opportunityScore,
        opportunityReason,
        status: nextStatus,
        rejectionReason: nextRejectionReason,
        campaignId: options.campaignId || existing?.campaignId || null,
        metadataJson: JSON.stringify({
          ...this.parseMaybeJsonObject(existing?.metadataJson),
          targetType: input.targetType,
          expectedDdds: resultExpectedDdds.length ? resultExpectedDdds : expectedDdds,
          searchCity: input.city,
          searchState: input.state,
          searchSegment: input.segment,
          resultCity: resultCity || null,
          resultState: resultState || null,
          resultSegment: resultSegment || null,
          lastSourceEngine: sourceEngine,
          quality,
          delivery,
        }),
        lastSeenAt: now,
      };
      const enrichment = buildRadarLeadEnrichment({
        ...(existing || {}),
        ...data,
        ...mergedResult,
        status: nextStatus,
        sourceUrl: options.sourceUrl || existing?.sourceUrl || null,
        rawPayload: mergedResult as any,
        salesProfile: this.buildLeadQualitySalesProfileFromFilters(input),
        now,
      });
      const enrichmentJson = this.parseMaybeJsonObject(enrichment.enrichmentJson);
      const finalQualityV2 = this.extractLeadQualityV2FromObject(enrichmentJson) || qualityV2;
      const finalCandidate = {
        ...mergedResult,
        ...data,
        email: enrichment.email || mergedEmail || existing?.email || null,
        instagramUrl: enrichment.instagramUrl || mergedInstagramUrl,
        facebookUrl: enrichment.facebookUrl || mergedFacebookUrl,
        googleMapsUrl: enrichment.googleMapsUrl || mergedGoogleMapsUrl || existing?.googleMapsUrl || null,
        whatsappStatus: mergedWhatsappStatus,
        whatsappCheckStatus: mergedWhatsappStatus,
        phoneDigits,
      };
      const finalDelivery = this.classifyCardDelivery(finalCandidate, input, quality, finalQualityV2);
      const preservedSignals = {
        ...(this.parseMaybeJsonObject(enrichmentJson.signals) || {}),
        ...(mergedWebsite ? { website: mergedWebsite } : {}),
        ...(mergedInstagramUrl ? { instagramUrl: mergedInstagramUrl } : {}),
        ...(mergedFacebookUrl ? { facebookUrl: mergedFacebookUrl } : {}),
        ...(mergedEmail ? { emailCandidate: mergedEmail } : {}),
        ...(mergedGoogleMapsUrl ? { googleMapsUrl: mergedGoogleMapsUrl } : {}),
        ...(mergedWhatsappStatus ? { whatsappStatus: mergedWhatsappStatus } : {}),
      };
      Object.assign(data, {
        email: enrichment.email || mergedEmail || existing?.email || null,
        emailStatus: enrichment.emailStatus,
        emailSource: enrichment.emailSource,
        emailConfidence: enrichment.emailConfidence,
        instagramUrl: enrichment.instagramUrl || mergedInstagramUrl || null,
        facebookUrl: enrichment.facebookUrl || mergedFacebookUrl || null,
        socialStatus: enrichment.instagramUrl || enrichment.facebookUrl || mergedInstagramUrl || mergedFacebookUrl ? 'found' : enrichment.socialStatus,
        socialConfidence: enrichment.instagramUrl || enrichment.facebookUrl || mergedInstagramUrl || mergedFacebookUrl ? Math.max(80, enrichment.socialConfidence, mergedSocialConfidence) : enrichment.socialConfidence,
        googleMapsUrl: enrichment.googleMapsUrl || mergedGoogleMapsUrl || existing?.googleMapsUrl || null,
        businessCategory: enrichment.businessCategory || existing?.businessCategory || null,
        openingHoursStatus: enrichment.openingHoursStatus || existing?.openingHoursStatus || null,
        recommendedChannel: enrichment.recommendedChannel,
        painType: enrichment.painType,
        painLabel: enrichment.painLabel,
        painPitch: enrichment.painPitch,
        opportunityReason: enrichment.opportunityReason || data.opportunityReason,
        metadataJson: JSON.stringify({
          ...this.parseMaybeJsonObject(existing?.metadataJson),
          targetType: input.targetType,
          expectedDdds: resultExpectedDdds.length ? resultExpectedDdds : expectedDdds,
          searchCity: input.city,
          searchState: input.state,
          searchSegment: input.segment,
          resultCity: resultCity || null,
          resultState: resultState || null,
          resultSegment: resultSegment || null,
          lastSourceEngine: sourceEngine,
          quality,
          delivery: finalDelivery,
        }),
        enrichmentJson: JSON.stringify({ ...enrichmentJson, signals: preservedSignals, quality, delivery: finalDelivery }),
        enrichmentScore: enrichment.enrichmentScore,
        enrichmentConfidence: enrichment.enrichmentConfidence,
        lastEnrichedAt: enrichment.lastEnrichedAt,
        enrichmentVersion: enrichment.enrichmentVersion,
      });
      if (existing?.id) {
        await delegate.update({
          where: { id: existing.id },
          data,
        }).catch(() => null);
      } else {
        await delegate.create({
          data: {
            ...data,
            firstSeenAt: now,
          },
        }).catch(() => null);
      }
      counts.savedCount += 1;
    }
    return counts;
  }

  private async recordRadarLeadEvent(input: {
    leadId: string;
    companyId?: number | null;
    userId?: number | null;
    eventType: RadarLeadEventType;
    note?: string | null;
    statusFrom?: string | null;
    statusTo?: string | null;
  }) {
    if (!(await this.prisma.hasTable('RadarLeadEvent'))) return null;
    return (this.prisma as any).radarLeadEvent.create({
      data: {
        leadId: input.leadId,
        companyId: input.companyId || null,
        eventType: input.eventType,
        note: String(input.note || '').trim() || null,
        statusFrom: input.statusFrom || null,
        statusTo: input.statusTo || null,
        createdByUserId: input.userId || null,
      },
    }).catch(() => null);
  }

  private inferCommercialEmailFromRadarLead(row: any) {
    const metadata = parseJsonObject(row?.metadataJson);
    const explicitEmail = String(metadata?.email || metadata?.contactEmail || metadata?.recipientEmail || '').trim().toLowerCase();
    if (explicitEmail && explicitEmail.includes('@')) return explicitEmail;
    const website = String(row?.website || '').trim();
    if (!website) return '';
    try {
      const parsed = new URL(website.startsWith('http') ? website : `https://${website}`);
      const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      return host ? `comercial@${host}` : '';
    } catch {
      const host = website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]?.toLowerCase();
      return host ? `comercial@${host}` : '';
    }
  }

  private async logCommercialEmailMessage(input: Record<string, any>) {
    if (!(await this.prisma.hasTable('CommercialEmailMessageLog').catch(() => false))) return null;
    return (this.prisma as any).commercialEmailMessageLog.create({
      data: {
        companyId: input.companyId || null,
        userId: input.userId || null,
        radarLeadId: input.radarLeadId || null,
        vendasLeadId: input.vendasLeadId || null,
        recipientEmail: String(input.recipientEmail || '').trim().toLowerCase(),
        recipientName: String(input.recipientName || '').trim() || null,
        subject: String(input.subject || '').trim(),
        text: input.text || null,
        html: input.html || null,
        status: String(input.status || 'draft').trim(),
        transport: input.transport || null,
        messageId: input.messageId || null,
        errorCode: input.errorCode ? String(input.errorCode) : null,
        errorMessage: input.errorMessage || null,
        attachmentName: input.attachmentName || null,
        sentAt: input.sentAt ? new Date(input.sentAt) : null,
      },
    }).catch(() => null);
  }

  private async assertRadarEmailAllowsManualSend(recipientEmail: string) {
    const email = String(recipientEmail || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Informe o e-mail de destino.');
    if (!(await this.prisma.hasTable('CommercialEmailMessageLog').catch(() => false))) return email;
    const blocked = await (this.prisma as any).commercialEmailMessageLog.findFirst({
      where: { recipientEmail: email, status: { in: ['opted_out', 'do_not_contact'] } },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    }).catch(() => null);
    if (blocked) throw new BadRequestException('Este e-mail estÃ¡ marcado como nÃ£o contactar.');
    return email;
  }

  async previewRadarPresentationEmailForUser(user: any, radarLeadId: string, body?: any) {
    const context = this.resolveContext(user);
    if (!this.hbxPresentationEmails) throw new ServiceUnavailableException('Servico de e-mail indisponivel.');
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    if (this.isRadarProtectedStatus(row?.companyStates?.[0]?.status || row?.status)) {
      throw new BadRequestException('Este card estÃ¡ marcado como negativo/bloqueado e nÃ£o pode receber sugestÃ£o ativa de envio.');
    }
    const recipientEmail = String(body?.recipientEmail || this.inferCommercialEmailFromRadarLead(row) || '').trim().toLowerCase();
    const draft = buildHbxPresentationEmailDraft({
      leadName: row.name,
      city: row.city,
      state: row.state,
      segment: row.segment,
      website: row.website,
      contactEmail: recipientEmail,
      sellerName: user?.name || user?.displayName || user?.email || 'HBX',
      companyName: 'HBX',
    });
    const preview = await this.hbxPresentationEmails.previewPresentationToContact({
      companyId: context.companyId,
      userId: context.userId,
      recipientName: body?.recipientName || row.name || 'cliente',
      recipientEmail,
      companyName: row.name || null,
      subject: body?.subject || draft.subject,
      text: body?.text || draft.body,
      html: body?.html,
      source: 'manual',
    });
    await this.logCommercialEmailMessage({
      companyId: context.companyId,
      userId: context.userId,
      radarLeadId: row.id,
      recipientEmail: preview.recipientEmail || recipientEmail || 'pendente@hbx.local',
      recipientName: preview.recipientName,
      subject: preview.subject,
      text: preview.text,
      html: preview.html,
      status: 'draft',
      attachmentName: preview.attachment?.originalName || null,
    });
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: 'presentation_email_previewed',
      note: JSON.stringify({ recipientEmail: preview.recipientEmail || null, subject: preview.subject }),
    });
    return preview;
  }

  async sendRadarPresentationEmailForUser(user: any, radarLeadId: string, body?: any) {
    const context = this.resolveContext(user);
    if (!this.hbxPresentationEmails) throw new ServiceUnavailableException('Servico de e-mail indisponivel.');
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    if (this.isRadarProtectedStatus(row?.companyStates?.[0]?.status || row?.status)) {
      await this.commercialUsageLimits?.recordPresentationEmailResult(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail: body?.recipientEmail || null,
        status: 'blocked',
        reason: 'policy',
      });
      throw new BadRequestException('Este card estÃ¡ marcado como negativo/bloqueado e nÃ£o pode receber sugestÃ£o ativa de envio.');
    }
    let recipientEmail = '';
    try {
      recipientEmail = await this.assertRadarEmailAllowsManualSend(body?.recipientEmail || this.inferCommercialEmailFromRadarLead(row));
    } catch (policyError: any) {
      await this.commercialUsageLimits?.recordPresentationEmailResult(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail: body?.recipientEmail || null,
        status: 'blocked',
        reason: 'policy',
        errorMessage: String(policyError?.message || policyError),
      });
      throw policyError;
    }
    await this.commercialUsageLimits?.assertCanSendPresentationEmail(context.companyId, context.userId);
    const recipientName = String(body?.recipientName || row.name || 'cliente').trim();
    const subject = String(body?.subject || '').trim();
    const text = String(body?.text || '').trim();
    if (!subject) throw new BadRequestException('Informe o assunto do e-mail.');
    if (!text) throw new BadRequestException('Informe o corpo do e-mail.');

    try {
      await this.commercialUsageLimits?.recordPresentationEmailAttempt(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail,
        subject,
      });
      const result = await this.hbxPresentationEmails.sendPresentationToContact({
        companyId: context.companyId,
        userId: context.userId,
        recipientName,
        recipientEmail,
        companyName: row.name || null,
        subject,
        text,
        html: body?.html,
        source: 'manual',
      });
      const messageId = result.delivery?.messageId || null;
      const transport = result.delivery?.transport || null;
      await this.logCommercialEmailMessage({
        companyId: context.companyId,
        userId: context.userId,
        radarLeadId: row.id,
        recipientEmail,
        recipientName,
        subject: result.subject,
        text,
        html: body?.html || null,
        status: 'sent',
        transport,
        messageId,
        sentAt: result.sentAt,
        attachmentName: result.attachment?.originalName || null,
      });
      const delivery: any = result.delivery || {};
      const accepted = Array.isArray(delivery.accepted) ? delivery.accepted.map((value: any) => String(value || '').toLowerCase()) : [];
      const consumesQuota = Boolean(result.delivery?.ok === true || messageId || accepted.includes(recipientEmail.toLowerCase()));
      await this.commercialUsageLimits?.recordPresentationEmailResult(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail,
        subject: result.subject,
        status: consumesQuota ? 'sent' : 'failed',
        transport,
        messageId,
        reason: consumesQuota ? 'provider_confirmed' : 'provider_not_confirmed',
      });
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'presentation_email_sent',
        note: JSON.stringify({ recipientEmail, subject: result.subject, sentAt: result.sentAt, messageId, transport }),
      });
      return result;
    } catch (error: any) {
      const errorMessage = String(error?.response?.message || error?.message || 'Falha ao enviar apresentacao.');
      await this.logCommercialEmailMessage({
        companyId: context.companyId,
        userId: context.userId,
        radarLeadId: row.id,
        recipientEmail,
        recipientName,
        subject,
        text,
        html: body?.html || null,
        status: 'failed',
        errorCode: error?.status || error?.code || null,
        errorMessage,
      });
      await this.commercialUsageLimits?.recordPresentationEmailResult(context.companyId, context.userId, {
        radarLeadId: row.id,
        recipientEmail,
        subject,
        status: 'failed',
        reason: 'provider_error',
        errorCode: error?.status || error?.code || null,
        errorMessage,
      });
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'presentation_email_failed',
        note: JSON.stringify({ recipientEmail, subject, errorCode: error?.status || error?.code || null, errorMessage }),
      });
      throw error;
    }
  }

  private isReleasableRadarReservation(row: any) {
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
    if (!ownerCompanyId || !(row?.claimedAt instanceof Date)) return false;
    const poolStatus = this.normalizeRadarLeadStatus(row?.status);
    if (!['clean', 'new', 'reserved', 'delivered'].includes(poolStatus)) return false;
    const companyStates = Array.isArray(row?.companyStates) ? row.companyStates : [];
    const state = companyStates.find((item: any) => Number(item?.companyId) === ownerCompanyId) || null;
    const stateStatus = this.normalizeRadarLeadStatus(state?.status || poolStatus);
    if (!['clean', 'new', 'reserved', 'delivered'].includes(stateStatus)) return false;
    if (state?.vendasLeadId || state?.privateNotes || state?.lastContactAt) return false;
    if (safeInteger(state?.noAnswerCount) > 0 || safeInteger(state?.contactedCount) > 0) return false;
    return true;
  }

  private async releaseExpiredRadarReservations(options: { companyId?: number | null; limit?: number } = {}) {
    if (!(await this.supportsRadarOwnershipPersistence())) return { releasedCount: 0 };
    const cutoff = new Date(Date.now() - RADAR_RESERVATION_TTL_MS);
    const where: any = {
      ownerCompanyId: options.companyId ? Number(options.companyId) : { not: null },
      claimedAt: { lt: cutoff },
      status: { in: ['clean', 'new', 'reserved', 'delivered'] as any },
    };
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where,
      take: Math.min(Math.max(Math.trunc(Number(options.limit || 100) || 100), 1), 500),
      include: {
        companyStates: {
          select: {
            companyId: true,
            status: true,
            vendasLeadId: true,
            privateNotes: true,
            noAnswerCount: true,
            contactedCount: true,
            lastContactAt: true,
          },
        },
      },
    }).catch(() => []);
    let releasedCount = 0;
    const now = new Date();
    for (const row of rows || []) {
      if (!this.isReleasableRadarReservation(row)) continue;
      const ownerCompanyId = Math.trunc(Number(row.ownerCompanyId || 0)) || 0;
      if (!ownerCompanyId) continue;
      const previousStatus = this.normalizeRadarLeadStatus(row.status);
      const updated = await (this.prisma as any).radarLeadPool.updateMany({
        where: {
          id: row.id,
          ownerCompanyId,
          claimedAt: row.claimedAt,
        },
        data: {
          ownerCompanyId: null,
          claimedAt: null,
          status: 'clean',
          lastSeenAt: now,
        },
      }).catch(() => ({ count: 0 }));
      if (!updated?.count) continue;
      await (this.prisma as any).radarLeadCompanyState.updateMany({
        where: {
          companyId: ownerCompanyId,
          radarLeadId: row.id,
          status: { in: ['clean', 'new', 'reserved', 'delivered'] as any },
          vendasLeadId: null,
        },
        data: {
          status: 'new',
          lastActionAt: now,
        },
      }).catch(() => null);
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: ownerCompanyId,
        eventType: 'ownership_released',
        note: 'Reserva liberada automaticamente apÃ³s 72h sem aÃ§Ã£o.',
        statusFrom: previousStatus,
        statusTo: 'clean',
      });
      releasedCount += 1;
    }
    return { releasedCount };
  }

  private async claimRadarLeadForCompany(
    context: SearchExecutionContext,
    row: any,
    input: {
      poolStatus: RadarLeadStatus;
      companyStatus: RadarLeadStatus;
      eventType: RadarLeadEventType;
      note?: string | null;
      vendasLeadId?: string | null;
      assignedUserId?: number | null;
      assignedByUserId?: number | null;
      countUsage?: boolean;
    },
  ) {
    const now = new Date();
    const previousStatus = this.normalizeRadarLeadStatus(row?.companyStates?.[0]?.status || row?.status);
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const existingCompanyState = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    const alreadyClaimedByCompany = Number(row?.ownerCompanyId || 0) === context.companyId || Boolean(existingCompanyState?.id);
    if (input.countUsage === true && !alreadyClaimedByCompany) {
      await this.commercialUsageLimits?.assertCanImportCard(context.companyId, context.userId);
    }
    if (ownershipEnabled) {
      const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
      if (ownerCompanyId && ownerCompanyId !== context.companyId) {
        throw new ForbiddenException('Este card jÃ¡ estÃ¡ na carteira de outra empresa.');
      }
      const claimed = await (this.prisma as any).radarLeadPool.updateMany({
        where: {
          id: row.id,
          OR: [
            { ownerCompanyId: null },
            { ownerCompanyId: context.companyId },
          ],
        },
        data: {
          ownerCompanyId: context.companyId,
          claimedAt: now,
          status: input.poolStatus,
          lastSeenAt: now,
        },
      });
      if (!claimed?.count) {
        throw new ForbiddenException('Este card acabou de ser puxado por outra empresa.');
      }
    } else {
      await (this.prisma as any).radarLeadPool.update({
        where: { id: row.id },
        data: {
          status: input.poolStatus,
          lastSeenAt: now,
        },
      }).catch(() => null);
    }

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
        vendasLeadId: input.vendasLeadId || null,
        status: input.companyStatus,
        assignedUserId: input.assignedUserId || null,
        assignedByUserId: input.assignedByUserId || null,
        assignedAt: input.assignedUserId ? now : null,
        lastActionAt: now,
      },
      update: {
        vendasLeadId: input.vendasLeadId || undefined,
        status: input.companyStatus,
        assignedUserId: input.assignedUserId || undefined,
        assignedByUserId: input.assignedByUserId || undefined,
        assignedAt: input.assignedUserId ? now : undefined,
        lastActionAt: now,
      },
    });

    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: input.eventType,
      note: input.note || null,
      statusFrom: previousStatus,
      statusTo: input.companyStatus,
    });
    if (input.countUsage === true && !alreadyClaimedByCompany) {
      await this.commercialUsageLimits?.recordCardImport(context.companyId, context.userId, {
        source: 'radar_claim',
        radarLeadId: row.id,
        status: input.companyStatus,
      });
    }
    return { claimedAt: now };
  }

  async addRadarLeadEventForUser(
    user: any,
    radarLeadId: string,
    input: { eventType?: RadarLeadEventType | string; note?: string | null } = {},
  ) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    this.assertRadarLeadVisibleForUser(user, context, row);
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
    if (ownershipEnabled && ownerCompanyId && ownerCompanyId !== context.companyId) {
      throw new ForbiddenException('Este card jÃ¡ estÃ¡ na carteira de outra empresa.');
    }

    const eventType = String(input.eventType || '').trim().toLowerCase() as RadarLeadEventType;
    if (!['denied', 'complaint', 'no_answer', 'hidden', 'contacted'].includes(eventType)) {
      throw new BadRequestException('Evento do Radar invalido.');
    }

    const previousStatus = this.resolveRadarLeadStatus(row);
    const nextStatus: RadarLeadStatus =
      eventType === 'hidden'
        ? 'hidden'
        : eventType === 'contacted'
          ? previousStatus
          : eventType as RadarLeadStatus;
    const now = new Date();
    const note = String(input.note || '').trim();
    const alreadyContacted = safeInteger(row?.contactedCount) > 0 || safeInteger(row?.companyStates?.[0]?.contactedCount) > 0;
    let usageDebit: { debited: boolean; alreadyDebited: boolean } | null = null;
    if (eventType === 'contacted' && !alreadyContacted) {
      usageDebit = await this.commercialUsageLimits?.recordCardCommercialUseOnce(context.companyId, context.userId, {
        source: 'radar_contact_click',
        usageKey: `radar:${row.id}`,
        radarLeadId: row.id,
        status: 'contacted',
      }) || null;
    }
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
        status: nextStatus,
        lastActionAt: now,
        lastContactAt: eventType === 'contacted' || eventType === 'no_answer' ? now : null,
        noAnswerCount: eventType === 'no_answer' ? 1 : 0,
        contactedCount: eventType === 'contacted' ? 1 : 0,
        complaintReason: eventType === 'complaint' ? note || null : null,
        deniedReason: eventType === 'denied' ? note || null : null,
      },
      update: {
        status: nextStatus,
        lastActionAt: now,
        ...(eventType === 'no_answer' ? { noAnswerCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'contacted' ? { contactedCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'complaint' ? { complaintReason: note || null } : {}),
        ...(eventType === 'denied' ? { deniedReason: note || null } : {}),
      },
    });
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        ...(ownershipEnabled ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
        status: nextStatus,
        lastSeenAt: now,
        ...(eventType === 'no_answer' ? { noAnswerCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'contacted' ? { contactedCount: { increment: 1 }, globalContactedCount: { increment: 1 }, lastContactAt: now } : {}),
        ...(eventType === 'complaint' ? { complaintReason: note || null, globalNegativeCount: { increment: 1 } } : {}),
        ...(eventType === 'denied' ? { deniedReason: note || null, globalNegativeCount: { increment: 1 } } : {}),
        ...(this.isRadarProtectedStatus(nextStatus) ? { recommendedChannel: 'discard', enrichmentScore: 0 } : {}),
      },
    }).catch(() => null);
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType,
      note: usageDebit?.debited ? [note, 'Uso comercial debitado no primeiro contato.'].filter(Boolean).join(' ') : note,
      statusFrom: previousStatus,
      statusTo: nextStatus,
    });
    return this.getRadarLeadForUser(user, row.id);
  }

  private async markRadarPostDeliveryUpdateRetryable(
    radarLeadId: string,
    error: any,
    stage: string = 'post_delivery_update',
  ) {
    if (!(await this.supportsRadarPersistence())) return;
    const id = String(radarLeadId || '').trim();
    if (!id) return;
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id },
      select: {
        id: true,
        metadataJson: true,
        enrichmentJson: true,
      },
    }).catch(() => null);
    if (!row) return;
    const retryable = this.getRadarDeliveryOrchestrator().markPostDeliveryFailure({
      metadata: this.parseMaybeJsonObject(row.metadataJson),
      enrichment: this.parseMaybeJsonObject(row.enrichmentJson),
      stage,
      error,
      now: new Date(),
    });
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        metadataJson: JSON.stringify(retryable.metadata),
        enrichmentJson: JSON.stringify(retryable.enrichment),
      },
    }).catch(() => null);
  }

  private async markRadarPostDeliveryUpdateCompleted(radarLeadId: string) {
    if (!(await this.supportsRadarPersistence())) return;
    const id = String(radarLeadId || '').trim();
    if (!id) return;
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id },
      select: {
        id: true,
        metadataJson: true,
        enrichmentJson: true,
      },
    }).catch(() => null);
    if (!row) return;
    const metadata = this.parseMaybeJsonObject(row.metadataJson);
    const enrichment = this.parseMaybeJsonObject(row.enrichmentJson);
    const now = new Date();
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        metadataJson: JSON.stringify({
          ...metadata,
          postDeliveryUpdate: this.getRadarPostDeliveryUpdate().buildCompletedState(metadata.postDeliveryUpdate, now),
        }),
        enrichmentJson: JSON.stringify({
          ...enrichment,
          postDeliveryUpdate: this.getRadarPostDeliveryUpdate().buildCompletedState(enrichment.postDeliveryUpdate || metadata.postDeliveryUpdate, now),
        }),
      },
    }).catch(() => null);
  }

  async importRadarLeadToVendasForUser(
    user: any,
    radarLeadId: string,
    options: {
      skipWhatsappValidation?: boolean;
      debitOnImport?: boolean;
      assignedUserId?: number | null;
      assignedByUserId?: number | null;
    } = {},
  ) {
    if (!this.vendasService) {
      throw new ServiceUnavailableException('Servico de Vendas indisponivel para importacao.');
    }
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    this.assertRadarLeadVisibleForUser(user, context, row);
    let leadRow = row;
    if (this.isRadarProtectedStatus(leadRow?.companyStates?.[0]?.status || leadRow?.status)) {
      throw new BadRequestException('Card protegido nao pode ser enviado para Vendas.');
    }
    const quality = this.extractLeadQualityFromObject(leadRow)
      || this.extractLeadQualityFromObject(leadRow?.enrichmentJson)
      || this.extractLeadQualityFromObject(leadRow?.metadataJson)
      || this.evaluateLeadQuality(leadRow, {
        requestedSegment: String(leadRow?.segment || ''),
        requestedCity: leadRow?.city || null,
        requestedState: leadRow?.state || null,
        targetType: normalizeTargetType(this.parseMaybeJsonObject(leadRow?.metadataJson)?.targetType),
      });
    const metadata = this.parseMaybeJsonObject(leadRow?.metadataJson);
    const importQualityInput = {
      city: String(leadRow?.city || ''),
      state: String(leadRow?.state || ''),
      segment: String(leadRow?.segment || ''),
      targetType: normalizeTargetType(metadata?.targetType),
      requiredChannels: [],
      preferredChannels: [],
      channelMatchMode: 'prefer',
      salesProfile: null,
    } as NormalizedRadarFilters;
    const qualityV2 = this.extractLeadQualityV2FromObject(leadRow)
      || this.extractLeadQualityV2FromObject(leadRow?.enrichmentJson)
      || this.extractLeadQualityV2FromObject(leadRow?.metadataJson);
    if (!this.isListDeliverableCard(leadRow, importQualityInput, quality, qualityV2)) {
      throw new BadRequestException('Card nao passou na qualidade minima para esse segmento. Descartados nao consomem limite.');
    }
    const deliveryClassification = this.classifyCardDelivery(leadRow, importQualityInput, quality, qualityV2);
    if (!this.isCardDeliveryEligibleForVendas(deliveryClassification, leadRow, qualityV2)) {
      throw new BadRequestException('Card nao esta elegivel para Vendas neste modo de qualidade.');
    }
    const assignedUserId = Math.trunc(Number(options.assignedUserId || 0)) || null;
    const assignedByUserId = assignedUserId
      ? Math.trunc(Number(options.assignedByUserId || context.userId || 0)) || null
      : null;

    await this.claimRadarLeadForCompany(context, leadRow, {
      poolStatus: 'in_attendance',
      companyStatus: 'in_attendance',
      eventType: 'ownership_reserved',
      note: assignedUserId
        ? `Card reservado para envio ao mÃ³dulo Vendas do vendedor ${assignedUserId}.`
        : 'Card reservado para envio ao mÃ³dulo Vendas.',
      assignedUserId,
      assignedByUserId,
      countUsage: false,
    });

    const includeSmartFields = await this.canUseRadarSmartLeadFields(context.companyId);
    const imported = await this.vendasService.importWebscrapingLeadsForUser(user, {
      sourceHistoryId: `radar:${leadRow.id}`,
      assignedUserId: assignedUserId || undefined,
      skipWhatsappValidation: Boolean(options.skipWhatsappValidation),
      debitOnImport: Boolean(options.debitOnImport),
      leads: [
        {
          sourceHistoryId: `radar:${leadRow.id}`,
          placeId: leadRow.placeId || undefined,
          name: leadRow.name,
          phone: leadRow.phone || leadRow.phoneDigits,
          phoneDigits: leadRow.phoneDigits || normalizePhoneDigits(leadRow.phone),
          email: includeSmartFields ? leadRow.email || undefined : undefined,
          emailStatus: includeSmartFields ? leadRow.emailStatus || undefined : undefined,
          emailSource: includeSmartFields ? leadRow.emailSource || undefined : undefined,
          emailConfidence: includeSmartFields ? leadRow.emailConfidence ?? undefined : undefined,
          address: leadRow.address || undefined,
          website: leadRow.website || undefined,
          websiteStatus: includeSmartFields ? leadRow.websiteStatus || undefined : undefined,
          rating: leadRow.rating ?? undefined,
          reviews: leadRow.reviews ?? undefined,
          city: leadRow.city || undefined,
          state: leadRow.state || undefined,
          segment: leadRow.segment || undefined,
          instagramUrl: includeSmartFields ? leadRow.instagramUrl || undefined : undefined,
          facebookUrl: includeSmartFields ? leadRow.facebookUrl || undefined : undefined,
          socialStatus: includeSmartFields ? leadRow.socialStatus || undefined : undefined,
          socialConfidence: includeSmartFields ? leadRow.socialConfidence ?? undefined : undefined,
          primarySocial: includeSmartFields
            ? leadRow.instagramUrl && leadRow.facebookUrl
              ? 'both'
              : leadRow.instagramUrl
                ? 'instagram'
                : leadRow.facebookUrl
                  ? 'facebook'
                  : undefined
            : undefined,
          googleMapsUrl: includeSmartFields ? leadRow.googleMapsUrl || undefined : undefined,
          businessCategory: includeSmartFields ? leadRow.businessCategory || undefined : undefined,
          openingHoursStatus: includeSmartFields ? leadRow.openingHoursStatus || undefined : undefined,
          recommendedChannel: includeSmartFields ? leadRow.recommendedChannel || undefined : undefined,
          painType: includeSmartFields ? leadRow.painType || undefined : undefined,
          painLabel: includeSmartFields ? leadRow.painLabel || undefined : undefined,
          painPitch: includeSmartFields ? leadRow.painPitch || undefined : undefined,
          enrichmentScore: includeSmartFields ? leadRow.enrichmentScore ?? undefined : undefined,
          enrichmentConfidence: includeSmartFields ? leadRow.enrichmentConfidence ?? undefined : undefined,
          opportunityScore: leadRow.opportunityScore ?? undefined,
          opportunityReason: includeSmartFields ? leadRow.opportunityReason || undefined : undefined,
          source: leadRow.source || undefined,
          sourceEngine: leadRow.sourceEngine || undefined,
          sourceUrl: leadRow.sourceUrl || undefined,
          enrichmentJson: includeSmartFields && leadRow.enrichmentJson
            ? this.buildCompactVendasEnrichmentJson(leadRow, quality, qualityV2, deliveryClassification)
            : undefined,
          quality: includeSmartFields ? quality : undefined,
          ...deliveryClassification,
          shortNote: includeSmartFields ? leadRow.opportunityReason || undefined : 'Lead herdado do Radar Digital.',
          scriptText: includeSmartFields ? leadRow.painPitch || leadRow.opportunityReason || undefined : undefined,
        },
      ],
    } as any);
    const vendasLeadId = imported?.leads?.[0]?.id || null;
    const now = new Date();
    const existingMetadata = this.parseMaybeJsonObject(leadRow?.metadataJson);
    const existingEnrichment = this.parseMaybeJsonObject(leadRow?.enrichmentJson);
    const deliveredState = this.getRadarDeliveryOrchestrator().buildDeliveredState({
      lead: leadRow,
      imported,
      vendasLeadId,
      metadata: existingMetadata,
      enrichment: existingEnrichment,
      now,
    });
    let nextDeliveryMetadata = {
      ...existingMetadata,
      ...deliveredState.metadataPatch,
    };
    let nextDeliveryEnrichment = {
      ...existingEnrichment,
      ...deliveredState.enrichmentPatch,
    };
    await (this.prisma as any).$transaction([
      (this.prisma as any).radarLeadCompanyState.upsert({
        where: {
          companyId_radarLeadId: {
            companyId: context.companyId,
            radarLeadId: leadRow.id,
          },
        },
        create: {
          companyId: context.companyId,
          radarLeadId: leadRow.id,
          vendasLeadId,
          status: 'sent_to_vendas',
          assignedUserId,
          assignedByUserId,
          assignedAt: assignedUserId ? now : null,
          lastActionAt: now,
        },
        update: {
          vendasLeadId,
          status: 'sent_to_vendas',
          assignedUserId: assignedUserId || undefined,
          assignedByUserId: assignedByUserId || undefined,
          assignedAt: assignedUserId ? now : undefined,
          lastActionAt: now,
        },
      }),
      (this.prisma as any).radarLeadPool.update({
        where: { id: leadRow.id },
        data: {
          ...(await this.supportsRadarOwnershipPersistence() ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
          status: 'sent_to_vendas',
          globalImportedCount: { increment: 1 },
          lastSeenAt: now,
          metadataJson: JSON.stringify(nextDeliveryMetadata),
          enrichmentJson: JSON.stringify(nextDeliveryEnrichment),
        },
      }),
    ]).catch(() => null);
    await this.recordRadarLeadEvent({
      leadId: leadRow.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: 'imported_to_vendas',
      statusFrom: this.normalizeRadarLeadStatus(leadRow.status),
      statusTo: 'sent_to_vendas',
    });
    return {
      ok: true,
      radarLeadId: leadRow.id,
      vendasLeadId,
      import: imported,
    };
  }

  async distributeRadarLeadsToVendedoresForUser(
    user: any,
    input: { leadIds?: string[]; userIds?: number[]; skipWhatsappValidation?: boolean } = {},
  ) {
    if (!this.canUseWebscrapingRole(user)) {
      throw new ForbiddenException('Apenas ADMIN pode distribuir cards do Radar para vendedores.');
    }
    const context = this.resolveContext(user);
    const leadIds = Array.from(new Set(
      (Array.isArray(input.leadIds) ? input.leadIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )).slice(0, 100);
    if (!leadIds.length) throw new BadRequestException('Selecione pelo menos um card para distribuir.');

    const requestedUserIds = Array.from(new Set(
      (Array.isArray(input.userIds) ? input.userIds : [])
        .map((id) => Math.trunc(Number(id || 0)))
        .filter((id) => Number.isInteger(id) && id > 0),
    )).slice(0, 50);
    if (!requestedUserIds.length) throw new BadRequestException('Selecione pelo menos um vendedor.');

    const sellers = await this.prisma.user.findMany({
      where: {
        id: { in: requestedUserIds },
        companyId: context.companyId,
        isActive: true,
        isSystemMaster: false,
        role: { in: ['USER', 'ADMIN'] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        commissionPercent: true,
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }, { id: 'asc' }],
    });
    if (!sellers.length) {
      throw new BadRequestException('Nenhum vendedor ativo foi encontrado para esta empresa.');
    }
    const sellerById = new Map(sellers.map((seller) => [seller.id, seller]));
    const orderedSellers = requestedUserIds.map((id) => sellerById.get(id)).filter(Boolean) as typeof sellers;
    const targets = orderedSellers.length ? orderedSellers : sellers;
    const activeRule = await this.prisma.radarAutoDistributionRule.findUnique({
      where: { companyId_scope: { companyId: context.companyId, scope: 'company' } },
    }).catch(() => null);
    const dailyLimitPerSeller = this.normalizeDailyDistributionLimit((activeRule as any)?.dailyLimitPerSeller, 20);
    const dayKey = this.getSaoPauloDayKey();
    const dailyStateBySeller = new Map<number, Awaited<ReturnType<typeof this.getDailyDistributionSnapshot>>>();
    const dailyLimitBySeller = new Map<number, number>();
    const activeQuotaBySeller = new Map<number, any>();
    for (const target of targets) {
      const sellerDailyLimit = this.resolveSellerDistributionDailyLimit(target, dailyLimitPerSeller);
      dailyLimitBySeller.set(Number(target.id), sellerDailyLimit);
      dailyStateBySeller.set(
        Number(target.id),
        await this.getDailyDistributionSnapshot(context.companyId, Number(target.id), sellerDailyLimit, dayKey),
      );
      activeQuotaBySeller.set(
        Number(target.id),
        this.commercialUsageLimits
          ? await this.commercialUsageLimits.getSellerActiveCardQuotaSnapshot(context.companyId, Number(target.id)).catch(() => null)
          : null,
      );
    }

    let distributedCount = 0;
    let failedCount = 0;
    const assignments: Array<{
      radarLeadId: string;
      vendasLeadId?: string | null;
      userId: number;
      userName: string;
      commissionPercent: number;
    }> = [];
    const failures: Array<{ radarLeadId: string; error: string }> = [];

    for (let index = 0; index < leadIds.length; index += 1) {
      const radarLeadId = leadIds[index];
      let target: (typeof targets)[number] | null = null;
      for (let offset = 0; offset < targets.length; offset += 1) {
        const candidate = targets[(index + offset) % targets.length];
        const state = candidate ? dailyStateBySeller.get(Number(candidate.id)) : null;
        const activeQuota = candidate ? activeQuotaBySeller.get(Number(candidate.id)) : null;
        const hasActiveSlot = !activeQuota?.seller || Number(activeQuota.availableSlots || 0) > 0;
        if (candidate && (!state || state.remainingToday > 0) && hasActiveSlot) {
          target = candidate;
          break;
        }
      }
      if (!target) {
        failedCount += 1;
        failures.push({
          radarLeadId,
          error: 'Todos os vendedores atingiram limite diÃ¡rio ou limite de cards ativos.',
        });
        continue;
      }
      const dailyState = dailyStateBySeller.get(Number(target.id));
      const targetDailyLimit = dailyLimitBySeller.get(Number(target.id)) ?? dailyLimitPerSeller;
      const activeQuota = activeQuotaBySeller.get(Number(target.id));
      if (dailyState?.remainingToday <= 0) {
        failedCount += 1;
        await this.recordDailyDistributionSkip(context.companyId, Number(target.id), targetDailyLimit, 'limite_diario_atingido', dayKey);
        failures.push({
          radarLeadId,
          error: 'Limite diÃ¡rio do vendedor atingido.',
        });
        continue;
      }
      if (activeQuota?.seller && Number(activeQuota.availableSlots || 0) <= 0) {
        failedCount += 1;
        await this.recordDailyDistributionSkip(context.companyId, Number(target.id), targetDailyLimit, 'limite_cards_ativos_atingido', dayKey);
        failures.push({
          radarLeadId,
          error: 'Limite de cards ativos do vendedor atingido.',
        });
        continue;
      }
      try {
        const result = await this.importRadarLeadToVendasForUser(user, radarLeadId, {
          skipWhatsappValidation: Boolean(input.skipWhatsappValidation),
          debitOnImport: true,
          assignedUserId: target.id,
          assignedByUserId: context.userId,
        });
        await this.incrementDailyDistributionDelivery(context.companyId, target.id, targetDailyLimit, dayKey);
        if (dailyState) {
          dailyState.deliveredToday += 1;
          dailyState.remainingToday = Math.max(0, dailyState.remainingToday - 1);
        }
        if (activeQuota?.seller) {
          activeQuota.activeCount = Math.max(0, Number(activeQuota.activeCount || 0) + 1);
          activeQuota.availableSlots = Math.max(0, Number(activeQuota.availableSlots || 0) - 1);
        }
        distributedCount += 1;
        assignments.push({
          radarLeadId,
          vendasLeadId: result?.vendasLeadId || null,
          userId: target.id,
          userName: String(target.name || target.username || target.email || `Vendedor ${target.id}`).trim(),
          commissionPercent: Math.max(0, Math.min(100, Number(target.commissionPercent || 0) || 0)),
        });
      } catch (error: any) {
        failedCount += 1;
        failures.push({
          radarLeadId,
          error: String(error?.message || error || 'Falha ao distribuir card.'),
        });
      }
    }

    if (!distributedCount && failures.length) {
      throw new BadRequestException(`Nenhum card foi distribuÃ­do. Primeira falha: ${failures[0]?.error || 'erro desconhecido'}`);
    }

    return {
      ok: true,
      distributedCount,
      failedCount,
      assignments,
      failures,
      message:
        failedCount > 0
          ? `${distributedCount} card(s) distribuÃ­dos. ${failedCount} falharam ou foram protegidos.`
          : `${distributedCount} card(s) distribuÃ­dos entre ${targets.length} vendedor(es).`,
    };
  }
}
