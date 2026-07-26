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
  buildRadarNeighborSegments,
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
import { incrementAffinity } from '../../../users/segment-affinity.util';
import { isBillingOwnerActor } from '../../../access/actor-kind';
import {
  materializeNucleoFromRadarLead as materializeNucleoIngestaoFromRadarLead,
  nucleoIngestaoEnabled,
} from '../../../nucleo/nucleo-ingestao';

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
import {
  getTeamPolicyRequiredChannelList,
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyAccessAllowed,
} from '../../../team/team-policy-persistence';
import { RadarCnpjL4EnrichmentService } from '../03-enrichment/radar-cnpj-l4-enrichment.service';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';
import { buildRankedRadarContacts } from '../persistence/radar-ranked-contacts';
import { radarDiscoveryEnginesOf } from '../shared/radar-source-lanes';
import { buildRadarLeadInclusionReasons } from '../shared/radar-inclusion-reasons.util';

export class RadarCoreDeliveryMixin {
  private _cnpjL4Enrichment: RadarCnpjL4EnrichmentService | null = null;
  private getCnpjL4Enrichment(): RadarCnpjL4EnrichmentService {
    if (!this._cnpjL4Enrichment) this._cnpjL4Enrichment = new RadarCnpjL4EnrichmentService();
    return this._cnpjL4Enrichment;
  }
  private _leadContactWrite: LeadContactWriteService | null = null;
  private getLeadContactWrite(): LeadContactWriteService {
    if (!this._leadContactWrite) this._leadContactWrite = new LeadContactWriteService();
    return this._leadContactWrite;
  }
  [key: string]: any;
  private async getTeamPolicyRequiredRadarChannels(userIdRaw: unknown): Promise<RadarChannelFilter[]> {
    const userId = Math.trunc(Number(userIdRaw || 0));
    if (!userId) return [];
    const policy = await loadUserTeamPolicyRuntime(this.prisma, userId).catch(() => null);
    return this.normalizeRadarChannels(getTeamPolicyRequiredChannelList(policy));
  }

  private async assertSellerTeamPolicyAccess(user: any, accessKey: string, message: string) {
    if (!this.isCompanySellerUser(user)) return;
    const userId = Math.trunc(Number(user?.id || 0));
    if (!userId) return;
    const policy = await loadUserTeamPolicyRuntime(this.prisma, userId).catch(() => null);
    if (resolveTeamPolicyAccessAllowed(policy, accessKey) === false) {
      throw new ForbiddenException(message);
    }
  }

  // RBAC Sprint 1: enforcement de chaves criticas que atingem tambem o GERENTE
  // (role=ADMIN com canViewBilling=false). O toggle do Gerencial deixa de ser
  // decorativo: um `false` explicito na politica bloqueia INCLUSIVE ADMIN. O
  // system_master nunca e bloqueado (nao tem politica persistida; guard extra
  // por seguranca). Caminhos de sistema/cron NAO passam por aqui (sem user).
  private async assertTeamPolicyAccessAnyRole(user: any, accessKey: string, message: string) {
    if (user?.isSystemMaster) return;
    const userId = Math.trunc(Number(user?.id || 0));
    if (!userId) return;
    const policy = await loadUserTeamPolicyRuntime(this.prisma, userId).catch(() => null);
    if (resolveTeamPolicyAccessAllowed(policy, accessKey) === false) {
      throw new ForbiddenException(message);
    }
  }

  private async applyTeamPolicyRadarFilters<T extends { requiredChannels?: any; channelMatchMode?: any }>(
    context: SearchExecutionContext,
    filters: T,
  ): Promise<T> {
    const required = await this.getTeamPolicyRequiredRadarChannels(context.userId);
    if (!required.length) return filters;
    const mergedRequired = Array.from(new Set([
      ...this.normalizeRadarChannels((filters as any).requiredChannels || []),
      ...required,
    ]));
    return {
      ...filters,
      requiredChannels: mergedRequired,
      channelMatchMode: 'all_required',
    };
  }

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
    const normalized = await this.applyTeamPolicyRadarFilters(context, this.normalizeSearchInput({
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
    }));
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

    // LIMPEZA-DESTRUTIVA L1 (04/07): o run NUNCA reivindica pro funil, pra NENHUM papel
    // (inclusive USERMASTER/admin/master). Este método só enche a vitrine (pool com
    // ownerCompanyId=null) — o funil só recebe card por PUXADA MANUAL
    // (send-to-vendas / mark-sent-to-vendas). Ver docs/PLANEJAMENTOS/CREDITOS/LIMPEZA-DESTRUTIVA.md.
  }

  // LIMPEZA-DESTRUTIVA L2 (04/07, docs/PLANEJAMENTOS/CREDITOS/LIMPEZA-DESTRUTIVA.md):
  // `getRadarSellerQuotaForContext`/`isRadarSellerUserId`/`getVendasPendingCountForRadarContext`/
  // `getRadarRunVendasStockTarget` (o gate de estoque do Vendas) foram deletados — a busca
  // nunca mais pausa/para em função de quantos cards estão pendentes no funil. O único freio
  // de quantidade que sobra é a cota comercial da EMPRESA (CommercialUsageLimitsService,
  // decidida pelo Master) — verificada em startRadarSearchRunForUser via quotaBlocked.

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
    // LIMPEZA-DESTRUTIVA L2: o gate de estoque do Vendas saiu daqui — só a cota
    // comercial da EMPRESA decide se o run pausado pode retomar.
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

  // LIMPEZA-DESTRUTIVA L2 (04/07): `pauseSearchRunForLimit`, `stopSearchRunIfVendasStockLimitReached`
  // (o gate de estoque em si) e `stopSearchRunAutoImportBlocked` (órfão desde o L1 — 0
  // call-sites, dependia deste mesmo helper) foram deletados. `assertRadarCanFeedVendas`
  // também saiu: só existia pra alimentar o gate de estoque. Run nunca mais para/pausa por
  // causa do funil de Vendas; a única pausa de quantidade que sobrevive é a cota comercial
  // da empresa, tratada em startRadarSearchRunForUser (quotaBlocked) e no backoff normal de
  // motor (restSearchRunIfEligible, em radar-core-search-runner.mixin.ts).
  private isRadarAutoImportLimitError(error: any) {
    return this.getRadarVendasSyncService().isAutoImportLimitError(error);
  }

  private async buildPausedRadarSearchRunResponse(run: any) {
    const filters = await this.applyTeamPolicyRadarFilters({
      companyId: safeInteger(run?.companyId),
      userId: safeInteger(run?.userId),
      user: null,
    } as SearchExecutionContext, this.buildRadarFiltersFromSearchRun(run));
    const metrics = parseJsonObject(run?.metricsJson);
    const requestedQuantity = Math.max(1, safeInteger(run?.targetQuantity));
    // LIMPEZA-DESTRUTIVA L2: sem gate de estoque, a única pausa que chega aqui é a
    // cota comercial da empresa — não há mais "estoque pendente" pra reportar.
    const pendingCount: number | null = null;
    const stockTarget = 0;
    const deliveredCount = safeInteger(run?.importedCount);
    const message = String(run?.errorMessage || '').trim()
      || 'Radar pausado. Vou retomar esta mesma pesquisa quando houver espaco.';
    const pauseDiagnostics = await this.buildRadarPauseDiagnostics(run, {
      message,
      metrics,
      pendingCount,
      requestedQuantity,
      stockTarget,
    });
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
        pauseDiagnostics,
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

  private async buildRadarPauseDiagnostics(run: any, input: {
    message: string;
    metrics: Record<string, any>;
    pendingCount: number | null;
    requestedQuantity: number;
    stockTarget: number;
  }) {
    const intOrNull = (value: unknown) => {
      const parsed = Math.trunc(Number(value));
      return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    };
    const rawReason = String(run?.lastBatchStatus || input.metrics?.radarPauseReason || '').trim();
    const reason = rawReason || 'radar_paused';
    const code = String(input.metrics?.quotaBlockedCode || '').trim() || null;
    const companyId = safeInteger(run?.companyId);
    const userId = safeInteger(run?.userId);
    const [usage, sellerQuota] = await Promise.all([
      this.commercialUsageLimits && companyId
        ? this.commercialUsageLimits.getUsageSnapshot(companyId, userId || null).catch(() => null)
        : Promise.resolve(null),
      this.commercialUsageLimits && companyId && userId
        ? this.commercialUsageLimits.getSellerActiveCardQuotaSnapshot(companyId, userId).catch(() => null)
        : Promise.resolve(null),
    ]);
    const cards = (usage as any)?.cards || {};
    const dailyLimit = intOrNull(cards.dailySafetyLimit);
    const dailyUsed = intOrNull(cards.dailyUsed);
    const dailyRemaining = intOrNull(cards.dailyRemaining);
    const monthlyRemaining = intOrNull(cards.monthlyRemaining ?? cards.remaining);
    // LIMPEZA-DESTRUTIVA L2: sem gate de estoque do funil — currentStock/stockTarget
    // não existem mais como conceito (a pausa que sobra é cota/seller, não estoque).
    const currentStock: number | null = null;
    const stockTarget = 0;
    const stockRemaining: number | null = null;
    const sellerActiveCount = intOrNull((sellerQuota as any)?.activeCount);
    const sellerCapacity = intOrNull((sellerQuota as any)?.effectiveLimit);
    const sellerAvailableSlots = intOrNull((sellerQuota as any)?.availableSlots);
    const lowerReason = reason.toLowerCase();
    const lowerMessage = String(input.message || '').toLowerCase();
    const dailyLimitReached = dailyLimit != null && dailyRemaining != null && dailyLimit > 0 && dailyRemaining <= 0;
    const sellerPaused = code === 'SELLER_QUOTA_PAUSED' || Boolean((sellerQuota as any)?.paused);
    const sellerStockFull = code === 'SELLER_CARD_QUOTA_REACHED'
      || (sellerCapacity != null && sellerActiveCount != null && sellerCapacity > 0 && sellerActiveCount >= sellerCapacity)
      || (sellerAvailableSlots != null && sellerAvailableSlots <= 0 && Boolean((sellerQuota as any)?.seller));
    const commercialQuotaReached = !dailyLimitReached && monthlyRemaining != null && monthlyRemaining <= 0;
    const permissionBlocked = /permission|permiss|unauthor|forbidden|sem_regra|sem regra|distribu/i.test(`${reason} ${input.message}`);
    const kind = sellerPaused
      ? 'seller_paused'
      : sellerStockFull
        ? 'seller_stock_full'
        : dailyLimitReached
          ? 'daily_limit'
          : commercialQuotaReached
            ? 'commercial_quota'
            : permissionBlocked
              ? 'permission_or_distribution'
              : /quota|limite|limit|cota/i.test(`${lowerReason} ${lowerMessage}`)
                ? 'card_limit'
                : 'operational_pause';
    const titleByKind: Record<string, string> = {
      seller_paused: 'Distribuição pausada para este vendedor',
      seller_stock_full: 'Limite de cards ativos do vendedor atingido',
      daily_limit: 'Limite diário de cards atingido',
      commercial_quota: 'Cota comercial de cards atingida',
      permission_or_distribution: 'Distribuição ou permissão pendente',
      card_limit: 'Limite de cards atingido',
      operational_pause: 'Radar pausado aguardando retomada',
    };
    const actionByKind: Record<string, string> = {
      seller_paused: 'Peça ao responsável para liberar a distribuição.',
      seller_stock_full: 'Finalize, transfira ou descarte cards em Vendas para abrir espaço.',
      daily_limit: 'Aguarde o reset diário para receber novos cards.',
      commercial_quota: 'Peça ao responsável para revisar a cota comercial.',
      permission_or_distribution: 'Peça ao responsável para revisar regras de distribuição e permissão.',
      card_limit: 'Libere espaço ou aguarde a cota retornar.',
      operational_pause: 'Acompanhe a retomada automática ou pare o Radar para editar filtros.',
    };
    return {
      kind,
      title: titleByKind[kind] || titleByKind.operational_pause,
      message: input.message,
      action: actionByKind[kind] || actionByKind.operational_pause,
      reason,
      code,
      currentStock,
      stockTarget,
      stockRemaining,
      dailyLimit,
      dailyUsed,
      dailyRemaining,
      dailyResetAt: (usage as any)?.dailyResetAt || (usage as any)?.dayEnd || null,
      monthlyRemaining,
      sellerActiveCount,
      sellerCapacity,
      sellerAvailableSlots,
      nextRetryAt: run?.nextRetryAt instanceof Date
        ? run.nextRetryAt.toISOString()
        : String(input.metrics?.radarPauseRetryAt || '').trim() || null,
    };
  }

  // Próximo nível de alcance que a UI já oferece (Só a cidade=0 → 25 → 50 → 100 km).
  private nextRadarReachRadiusKm(currentRadiusKm: number): number | null {
    const ladder = [25, 50, 100];
    const current = Math.max(0, Math.trunc(Number(currentRadiusKm) || 0));
    for (const step of ladder) {
      if (step > current) return step;
    }
    return null;
  }

  // Esgotou a OFERTA (cidade/segmento secaram e entregou menos que o pedido) — NÃO é cota.
  // Devolve a sugestão de expansão (ampliar alcance / incluir segmentos vizinhos) ou null.
  // Só em estado terminal "parado"; "pausado" (cota) tem mensagem própria e não cai aqui.
  private buildRadarRunExpansionSuggestion(
    filters: NormalizedRadarFilters,
    deliveredCount: number,
    requestedQuantity: number,
    operationalState: string,
    status: string,
  ) {
    if (operationalState !== 'parado') return null;
    if (status !== 'completed_insufficient_results' && status !== 'partial_error') return null;
    const delivered = Math.max(0, safeInteger(deliveredCount));
    const requested = Math.max(1, safeInteger(requestedQuantity));
    if (delivered <= 0 || delivered >= requested) return null;

    const city = String(filters?.city || '').trim();
    const state = String(filters?.state || '').trim().toUpperCase() || null;
    const segment = String(filters?.segment || '').trim();
    if (!segment) return null;
    const currentRadiusKm = Math.max(0, Math.trunc(Number(filters?.radiusKm) || 0));
    const nextRadiusKm = this.nextRadarReachRadiusKm(currentRadiusKm);
    const neighborSegments = buildRadarNeighborSegments(segment, 4);
    if (!nextRadiusKm && neighborSegments.length === 0) return null;

    const config = this.getRadarSearchRunConfig();
    return {
      city,
      state,
      segment,
      deliveredCount: delivered,
      requestedQuantity: requested,
      currentRadiusKm,
      nextRadiusKm,
      neighborSegments,
      headline: config.buildExpansionSuggestionHeadline(city, segment, delivered),
      widenReachLabel: config.buildExpansionWidenReachLabel(nextRadiusKm),
      widenSegmentLabel: config.buildExpansionWidenSegmentLabel(neighborSegments),
    };
  }

  // `options.skipAutoImport` virou no-op pela LIMPEZA-DESTRUTIVA L1: o run nunca importa
  // pro funil de qualquer forma. Assinatura preservada só pra não mexer nos call-sites.
  private async buildRadarSearchRunResponse(user: any, runId: string, options?: { skipAutoImport?: boolean }) {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    // LIMPEZA-DESTRUTIVA L3: run de busca e da EMPRESA — sem escopo por vendedor.
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

    // LIMPEZA-DESTRUTIVA L1: sync só enche a vitrine, pra TODO papel — nunca reivindica.
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
    // LIMPEZA-DESTRUTIVA L2 (04/07): não há mais recheck de estoque do funil aqui — a
    // única pausa possível vem do quotaBlocked tratado em startRadarSearchRunForUser
    // (já refletido no status/lastBatchStatus do run persistido).
    const metrics = parseJsonObject(effectiveRun.metricsJson);
    const filters = await this.applyTeamPolicyRadarFilters(context, this.buildRadarFiltersFromSearchRun(effectiveRun));
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
    // LIMPEZA-DESTRUTIVA L1 (04/07): o run NUNCA importa/reivindica pro funil de Vendas,
    // pra NENHUM papel. `autoImport` fica sempre "ran: false" — só informativo pro front
    // (contrato preservado). A vitrine já foi enchida acima por syncRadarSearchRunItemsToPool.
    const autoImport: { ran: boolean; importedCount: number; pendingCount: null; remaining: null; failures: any[] } = {
      ran: false,
      importedCount: safeInteger(effectiveRun.importedCount),
      pendingCount: null,
      remaining: null,
      failures: [],
    };
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
        expansionSuggestion: this.buildRadarRunExpansionSuggestion(
          filters,
          Math.max(deliveredCount, primaryFoundItems.length),
          requestedQuantity,
          operational.state,
          status,
        ),
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
    await this.assertSellerTeamPolicyAccess(user, 'radar.search.run', 'Busca do Radar bloqueada pela politica da equipe.');
    const filters = await this.applyTeamPolicyRadarFilters(context, this.normalizeRadarFilters(input));
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
    let usageSnapshot: any = null;
    let quotaDailyLimit: number | null = null;
    let quotaDailyUsed: number | null = null;
    let quotaDailyRemaining: number | null = null;
    let quotaDailyResetAt: string | null = null;
    let quotaMonthlyRemaining: number | null = null;
    if (this.commercialUsageLimits) {
      usageSnapshot = await this.commercialUsageLimits.getUsageSnapshot(context.companyId, context.userId).catch(() => null);
      const cardLimits = usageSnapshot ? (usageSnapshot as any).cards || {} : {};
      const dailyRemaining = Number(cardLimits.dailyRemaining);
      const monthlyRemaining = Number(cardLimits.remaining);
      const perUserRemaining = cardLimits.perUserLimit != null
        ? Number(cardLimits.userLimit || 0) - Number(cardLimits.userUsed || 0)
        : monthlyRemaining;
      quotaDailyLimit = Number.isFinite(Number(cardLimits.dailySafetyLimit)) ? Math.max(0, Math.trunc(Number(cardLimits.dailySafetyLimit))) : null;
      quotaDailyUsed = Number.isFinite(Number(cardLimits.dailyUsed)) ? Math.max(0, Math.trunc(Number(cardLimits.dailyUsed))) : null;
      quotaDailyRemaining = Number.isFinite(dailyRemaining) ? Math.max(0, Math.trunc(dailyRemaining)) : null;
      quotaDailyResetAt = String((usageSnapshot as any)?.dailyResetAt || (usageSnapshot as any)?.dayEnd || '').trim() || null;
      quotaMonthlyRemaining = Number.isFinite(monthlyRemaining) ? Math.max(0, Math.trunc(monthlyRemaining)) : null;
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
          quotaBlockedMessage = quotaBlockedCode === 'SELLER_QUOTA_PAUSED'
            ? 'Distribuição pausada para este vendedor. Peça ao responsável para liberar a distribuição.'
            : 'Seu limite de cards ativos foi atingido. Finalize, transfira ou peça mais cards ao responsável.';
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

    // LIMPEZA-DESTRUTIVA L2 (04/07): o gate de estoque do Vendas (vendasGate/vendasStockTarget)
    // foi deletado. A busca só pausa no START pela cota comercial da EMPRESA (quotaBlocked,
    // decidida pelo Master) — nunca mais por quantidade de cards pendentes no funil.
    if (quotaBlocked) {
      const now = new Date();
      const pauseReason = 'vendas_card_limit_start';
      const pauseMessage = quotaBlockedMessage
        || (quotaDailyLimit != null && quotaDailyRemaining === 0
          ? `Limite diário de cards atingido. ${quotaDailyUsed ?? quotaDailyLimit} de ${quotaDailyLimit} usado(s) hoje. O Radar retoma no reset diário.`
          : 'Radar pausado. Limite de cards atingido; vou retomar esta mesma pesquisa quando houver cota.');
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
            desiredStock: filters.desiredStock,
            minimumStock: filters.minimumStock,
            quotaRemaining,
            quotaBlockedCode,
            quotaDailyLimit,
            quotaDailyUsed,
            quotaDailyRemaining,
            quotaDailyResetAt,
            quotaMonthlyRemaining,
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
    // LIMPEZA-DESTRUTIVA L1 (04/07): o START da busca NUNCA reivindica estoque pro funil,
    // pra NENHUM papel (inclusive USERMASTER/admin/master). O estoque existente já está
    // consultável na VITRINE (queryRadarRowsForCompany availableOnly=true, ownerCompanyId=null);
    // o usuário puxa na mão (pullRadarLeadsForUser / send-to-vendas). A busca só enfileira o run
    // e o motor trabalha pra completar/enriquecer a vitrine — não há mais "entrega imediata do banco"
    // nem markRadarDelivered aqui. Ver docs/PLANEJAMENTOS/CREDITOS/LIMPEZA-DESTRUTIVA.md.
    const availableStockCount = stockRows.length;
    const run = await this.prisma.webscrapingSearchRun.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        status: 'queued',
        city: normalized.city,
        state: normalized.state || null,
        segment: normalized.segment,
        engine: 'hbx',
        targetType: normalized.targetType,
        targetQuantity: normalized.quantity,
        startedAt: null,
        finishedAt: null,
        errorMessage: availableStockCount > 0
          ? `${availableStockCount} card(s) ja disponivel(is) na vitrine para puxar. Radar tambem trabalhando para trazer mais.`
          : 'Sem cards prontos na vitrine. Busca enviada para a fila do Radar.',
        metricsJson: JSON.stringify({
          activeSearchSignature: this.buildRadarActiveSearchSignature(filters),
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

    // LIMPEZA-DESTRUTIVA L1: sem entrega imediata do banco pro funil — o estoque fica na
    // vitrine e o run vai sempre pra fila; o motor trabalha e syncRadarSearchRunItemsToPool
    // mantém a vitrine cheia. Nada é reivindicado/salvo como "entregue" no START.
    this.scheduleSearchRunPump(0);

    return this.buildRadarSearchRunResponse(user, run.id);
  }

  async getRadarSearchRunForUser(user: any, runId: string) {
    return this.buildRadarSearchRunResponse(user, runId);
  }

  async getLatestRadarSearchRunForUser(user: any) {
    const context = this.resolveContext(user);
    await this.assertSearchRunPersistence();
    // LIMPEZA-DESTRUTIVA L3: ultimo run da EMPRESA, nao so do vendedor que pediu.
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
    // LIMPEZA-DESTRUTIVA L3: runs ativos da EMPRESA (lagoa unica), sem escopo por vendedor.
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
    // LIMPEZA-DESTRUTIVA L3: cancela runs incompativeis da EMPRESA inteira, sem escopo por vendedor.
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
    await this.assertSellerTeamPolicyAccess(user, 'radar.cards.pull', 'Puxar cards do Radar esta bloqueado pela politica da equipe.');
    const filters = await this.applyTeamPolicyRadarFilters(context, this.normalizeRadarFilters(input));
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
    // LIMPEZA-DESTRUTIVA L3: assignedUserId agora e so INFORMATIVO ("Responsavel" = quem
    // puxou) — grava pra QUALQUER papel que puxa (vendedor, admin, master), nunca so vendedor.
    const assignToUserId = context.userId;
    try {
      claimedRows = await this.markRadarDelivered(context.companyId, context.userId, deliveredRows, {
        assignedUserId: assignToUserId,
        assignedByUserId: assignToUserId,
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

  // Pull do vendedor (modelo B / PR13062026008): o PRÓPRIO vendedor puxa cards
  // da lagoa compartilhada (RadarLeadPool, companyId null) filtrando por
  // preferencia (segmento obrigatorio; cidade/UF opcionais) e eles caem DIRETO
  // na carteira dele em Vendas. Reaproveita o encanamento testado
  // (importRadarLeadToVendasForUser, assignedUserId=self), so que disparado pelo
  // vendedor para si mesmo, respeitando quota de cards ativos + teto diario.
  // O push admin→vendedor (distributeRadarLeadsToVendedoresForUser) foi REMOVIDO
  // (LIMPEZA-DESTRUTIVA L4, 04/07); radar/pull reserve-only (pullRadarLeadsForUser)
  // segue vivo e intocado.
  private async _bumpSegmentAffinity(userId: number, segment: string): Promise<void> {
    const n = normalizeLookupValue(String(segment || ''));
    if (!n || !userId) return;
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { segmentAffinityJson: true } as any,
    }).catch(() => null);
    const next = incrementAffinity((row as any)?.segmentAffinityJson, n);
    await this.prisma.user.update({
      where: { id: userId },
      data: { segmentAffinityJson: next } as any,
    }).catch(() => null);
  }

  async pullRadarLeadsToVendasForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    // Modelo PULL (dono, 14/06/2026): quem puxa card para a própria carteira é o
    // vendedor OU o admin/dono (que também trabalha leads). O "transferir p/ vendedor"
    // (push) deixou de ser o caminho — por isso o admin precisa puxar igual ao vendedor.
    const isSeller = this.isCompanySellerUser(user);
    const isAdmin = this.canUseWebscrapingRole(user);
    if (!isSeller && !isAdmin) {
      throw new ForbiddenException('Sem permissão para puxar cards do Radar.');
    }
    if (isSeller) {
      await this.assertSellerTeamPolicyAccess(user, 'radar.cards.pull', 'Puxar cards do Radar esta bloqueado pela politica da equipe.');
    }
    if (!this.vendasService) {
      throw new ServiceUnavailableException('Servico de Vendas indisponivel para puxar cards.');
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }

    const filters = await this.applyTeamPolicyRadarFilters(context, this.normalizeRadarFilters(input));
    if (!filters.normalizedSegment) {
      throw new BadRequestException('Escolha um segmento para puxar cards do Radar.');
    }

    const requested = Math.max(1, Math.min(Math.trunc(Number(filters.quantity || 1)) || 1, 50));
    const dayKey = this.getSaoPauloDayKey();
    const seller = await this.prisma.user.findUnique({
      where: { id: context.userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        commissionPercent: true,
        sellerDistributionDailyLimitOverride: true,
        teamPolicy: { select: { cardDeliveryDailyMode: true, cardDeliveryDailyLimit: true } },
      },
    }).catch(() => null);
    const dailyLimit = this.resolveSellerDistributionDailyLimit(seller, 20);
    const dailySnapshot = await this.getDailyDistributionSnapshot(context.companyId, context.userId, dailyLimit, dayKey);
    const activeQuota = this.commercialUsageLimits
      ? await this.commercialUsageLimits.getSellerActiveCardQuotaSnapshot(context.companyId, context.userId).catch(() => null)
      : null;

    const dailyRemaining = Math.max(0, Math.trunc(Number(dailySnapshot?.remainingToday ?? requested)) || 0);
    const activeRemaining = activeQuota?.seller ? Math.max(0, Math.trunc(Number(activeQuota.availableSlots || 0))) : requested;
    const allowed = Math.max(0, Math.min(requested, dailyRemaining, activeRemaining));
    if (allowed <= 0) {
      throw new ConflictException({
        ok: false,
        code: activeRemaining <= 0 ? 'SELLER_CARD_QUOTA_REACHED' : 'SELLER_DAILY_LIMIT_REACHED',
        message: activeRemaining <= 0
          ? 'Seu limite de cards ativos foi atingido. Finalize ou transfira cards antes de puxar mais.'
          : 'Voce atingiu o limite diario de cards. Tente novamente amanha.',
        dailyRemaining,
        activeRemaining,
      });
    }

    // O import tem portao de visibilidade do vendedor (so importa lead JA dele).
    // No pull o vendedor reivindica leads novos, entao executamos o import na
    // pele do ADMIN da empresa (mesma semantica do push), atribuindo ao vendedor.
    const adminRow = await this.prisma.user.findFirst({
      where: { companyId: context.companyId, role: 'ADMIN', isActive: true, isSystemMaster: false },
      select: { id: true, companyId: true, role: true, isSystemMaster: true },
      orderBy: [{ id: 'asc' }],
    }).catch(() => null);
    if (!adminRow) {
      throw new ServiceUnavailableException('Empresa sem administrador ativo para liberar o pull de leads.');
    }
    const importAsAdmin = { id: adminRow.id, companyId: adminRow.companyId, role: 'ADMIN', isSystemMaster: false };

    const queryLimit = Math.max(allowed * 3, 60);
    const requestedLeadIds = Array.isArray((input as any).leadIds) && (input as any).leadIds.length > 0
      ? (input as any).leadIds.slice(0, allowed * 2)
      : null;
    let rows = requestedLeadIds
      ? await (this.prisma as any).radarLeadPool.findMany({
          where: { id: { in: requestedLeadIds } },
          include: {
            companyStates: {
              where: { companyId: context.companyId }, take: 1,
              select: { status: true, vendasLeadId: true, lastActionAt: true, noAnswerCount: true, contactedCount: true, lastContactAt: true, complaintReason: true, deniedReason: true, assignedUserId: true, assignedByUserId: true, assignedAt: true },
            },
            events: {
              where: { OR: [{ companyId: context.companyId }, { companyId: null }] },
              orderBy: { createdAt: 'desc' }, take: 3,
              select: { id: true, eventType: true, note: true, createdAt: true },
            },
          },
        }).catch(() => [])
      : await this.queryRadarRowsForCompany(context.companyId, filters, { limit: queryLimit, requirePhone: false, availableOnly: true });
    let replenish: any = { ran: false, cleanStockBefore: rows.length };
    if (!requestedLeadIds && rows.length < allowed && filters.normalizedCity) {
      try {
        replenish = await this.replenishRadarStockForUser(user, {
          ...input,
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
        });
      } catch (error: any) {
        replenish = { ran: true, reason: 'replenish_failed_using_database', errorMessage: this.extractHbxErrorMessage(error) };
      }
      rows = await this.queryRadarRowsForCompany(context.companyId, filters, { limit: queryLimit, requirePhone: false, availableOnly: true });
    }

    const assignments: Array<{ radarLeadId: string; vendasLeadId: string | null; name: string | null; city: string | null; state: string | null; segment: string | null; opportunityScore: number | null }> = [];
    const failures: Array<{ radarLeadId: string | null; error: string }> = [];
    let pulled = 0;
    for (const row of rows) {
      if (pulled >= allowed) break;
      try {
        const result = await this.importRadarLeadToVendasForUser(importAsAdmin, row.id, {
          skipWhatsappValidation: true,
          debitOnImport: true,
          assignedUserId: context.userId,
          assignedByUserId: context.userId,
        });
        await this.incrementDailyDistributionDelivery(context.companyId, context.userId, dailyLimit, dayKey);
        pulled += 1;
        assignments.push({
          radarLeadId: row.id,
          vendasLeadId: result?.vendasLeadId || null,
          name: row.name || null,
          city: row.city || null,
          state: row.state || null,
          segment: row.segment || null,
          opportunityScore: row.opportunityScore ?? null,
        });
      } catch (error: any) {
        failures.push({ radarLeadId: row?.id || null, error: String(error?.response?.message || error?.message || error || 'Falha ao puxar card.') });
        if (this.isRadarAutoImportLimitError && this.isRadarAutoImportLimitError(error)) break;
      }
    }

    const commissionPercent = Math.max(0, Math.min(100, Number(seller?.commissionPercent || 0) || 0));
    if (pulled > 0) this._bumpSegmentAffinity(context.userId, filters.normalizedSegment).catch(() => null);
    return {
      ok: pulled > 0,
      pulledCount: pulled,
      requestedCount: requested,
      allowedCount: allowed,
      failedCount: failures.length,
      commissionPercent,
      dailyRemainingAfter: Math.max(0, dailyRemaining - pulled),
      activeRemainingAfter: activeQuota?.seller ? Math.max(0, activeRemaining - pulled) : null,
      assignments,
      failures: failures.slice(0, 8),
      replenish,
      filters: { segment: filters.segment, city: filters.city, state: filters.state },
      message: pulled > 0
        ? `${pulled} lead(s) puxado(s) para a sua carteira em Vendas.`
        : failures.length
          ? `Nenhum lead puxado. ${failures[0]?.error || ''}`.trim()
          : 'Sem leads disponiveis na lagoa para esse filtro agora. Tente outro segmento ou cidade.',
    };
  }

  async previewRadarLeadsForVendedor(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const isSeller = this.isCompanySellerUser(user);
    const isAdmin = this.canUseWebscrapingRole(user);
    if (!isSeller && !isAdmin) {
      throw new ForbiddenException('Sem permissão para visualizar leads do Radar.');
    }
    if (isSeller) {
      await this.assertSellerTeamPolicyAccess(user, 'radar.cards.pull', 'Puxar cards do Radar está bloqueado pela política da equipe.');
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda não foi migrado neste ambiente.');
    }

    const filters = await this.applyTeamPolicyRadarFilters(context, this.normalizeRadarFilters(input));
    if (!filters.normalizedSegment) {
      throw new BadRequestException('Escolha um segmento para visualizar leads do Radar.');
    }

    const requested = Math.max(1, Math.min(Math.trunc(Number(filters.quantity || 5)) || 5, 50));
    const dayKey = this.getSaoPauloDayKey();
    const seller = await this.prisma.user.findUnique({
      where: { id: context.userId },
      select: { id: true, sellerDistributionDailyLimitOverride: true, teamPolicy: { select: { cardDeliveryDailyMode: true, cardDeliveryDailyLimit: true } } },
    }).catch(() => null);
    const dailyLimit = this.resolveSellerDistributionDailyLimit(seller, 20);
    const dailySnapshot = await this.getDailyDistributionSnapshot(context.companyId, context.userId, dailyLimit, dayKey);
    const activeQuota = this.commercialUsageLimits
      ? await this.commercialUsageLimits.getSellerActiveCardQuotaSnapshot(context.companyId, context.userId).catch(() => null)
      : null;

    const dailyRemaining = Math.max(0, Math.trunc(Number(dailySnapshot?.remainingToday ?? requested)) || 0);
    const activeRemaining = activeQuota?.seller ? Math.max(0, Math.trunc(Number(activeQuota.availableSlots || 0))) : requested;
    const canPull = Math.max(0, Math.min(requested, dailyRemaining, activeRemaining));

    if (canPull <= 0) {
      return {
        ok: false,
        canPull: 0,
        code: activeRemaining <= 0 ? 'SELLER_CARD_QUOTA_REACHED' : 'SELLER_DAILY_LIMIT_REACHED',
        message: activeRemaining <= 0
          ? 'Seu limite de cards ativos foi atingido. Finalize ou transfira cards antes de puxar mais.'
          : 'Você atingiu o limite diário de cards. Tente novamente amanhã.',
        leads: [],
      };
    }

    const queryLimit = Math.max(canPull * 3, 60);
    const rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: queryLimit,
      requirePhone: false,
      availableOnly: true,
    });

    const leads = rows
      .slice(0, canPull)
      .map((row: any) => this.buildRadarLeadPublic(row, { maskContact: true }));

    return {
      ok: true,
      canPull,
      dailyRemaining,
      leads,
      filters: { segment: filters.segment, city: filters.city, state: filters.state },
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
    await this.assertSellerTeamPolicyAccess(user, 'radar.stock.replenish', 'Reposicao de estoque do Radar bloqueada pela politica da equipe.');
    const filters = await this.applyTeamPolicyRadarFilters(context, this.normalizeRadarFilters(input));
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
    options: { campaignId?: string | null; strictLocalDdd?: boolean; sourceUrl?: string | null; engineUrl?: string | null } = {},
  ) {
    if (!(await this.supportsRadarPersistence())) return { approvedCount: 0, duplicateCount: 0, rejectedCount: 0, savedCount: 0 };
    const resultsToPersist = await this.enrichSearchRunResultsBeforeSave(input, results, sourceEngine, options.engineUrl);
    const delegate = (this.prisma as any).radarLeadPool;
    const now = new Date();
    const expectedDdds = this.buildExpectedDdds(input);
    const strictLocalDdd = options.strictLocalDdd === true;
    const counts = { approvedCount: 0, duplicateCount: 0, rejectedCount: 0, savedCount: 0 };
    for (const result of this.mergeDedupedContacts(resultsToPersist)) {
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
      const existing = await delegate.findFirst({
        where: {
          OR: [
            ...(phoneDigits ? [{ phoneDigits }] : []),
            ...(placeId ? [{ placeId }] : []),
          ],
        },
      }).catch(() => null);
      // O pool e a memoria do lead: a decisao de entrega considera os canais ja
      // conhecidos do card, nao apenas o payload desta sincronizacao.
      const channelCandidate = {
        ...(existing || {}),
        ...(result as any),
        phoneDigits: phoneDigits || existing?.phoneDigits || null,
        email: (result as any).email || existing?.email || null,
        emailStatus: (result as any).emailStatus || existing?.emailStatus || null,
        website: (result as any).website || existing?.website || null,
        websiteStatus: (result as any).websiteStatus || existing?.websiteStatus || null,
        instagramUrl: (result as any).instagramUrl || existing?.instagramUrl || null,
        facebookUrl: (result as any).facebookUrl || existing?.facebookUrl || null,
        whatsappStatus: (result as any).whatsappStatus || (result as any).whatsappCheckStatus || existing?.whatsappStatus || null,
      };
      const delivery = this.classifyCardDelivery(channelCandidate, input, quality, qualityV2);
      const listDeliverable = this.isListDeliverableCard(channelCandidate, input, quality, qualityV2);
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
      if (!this.candidateHasRequiredChannels(channelCandidate, input, qualityV2)) {
        counts.rejectedCount += 1;
        continue;
      }
      if (existing?.id) counts.duplicateCount += 1;
      if (dddMismatch) counts.rejectedCount += 1;
      else counts.approvedCount += 1;
      // sourceEngines do pool = DESCOBERTA (03/07): engines reais do resultado + source próprio.
      // O engine da corrida (hbx/hbx_mass_data/hbx_campaign) NÃO entra mais — corrida processa,
      // não descobre; era ele que fabricava "rfb+web" fictício no medidor do :3107. Ele segue
      // registrado na coluna sourceEngine e em metadataJson.lastSourceEngine (nada se perde).
      const resultDiscoveryEngines = radarDiscoveryEnginesOf(result as Record<string, any>);
      const sourceEngines = Array.from(new Set([...parseJsonArray(existing?.sourceEngines), ...resultDiscoveryEngines].filter(Boolean).map(String)));
      // enrichmentEngines: quem só ENRIQUECEU (separado pelo pré-save) — acumula no metadataJson.
      const persistedEnrichmentEngines = Array.from(new Set([
        ...(Array.isArray(this.parseMaybeJsonObject(existing?.metadataJson)?.enrichmentEngines)
          ? this.parseMaybeJsonObject(existing?.metadataJson).enrichmentEngines.map(String)
          : []),
        ...(Array.isArray((result as any).enrichmentEngines) ? (result as any).enrichmentEngines.map(String) : []),
      ].filter(Boolean)));
      const existingWasDddMismatch = String(existing?.status || '') === 'rejected' && String(existing?.rejectionReason || '') === 'ddd_mismatch';
      // Quarentena pré-estoque (etapa 7 da árvore mestra, 02/07): SÓ no caminho que abastece o
      // ESTOQUE da fábrica (`hbx_mass_data`/`hbx_campaign` — night_factory/mass-data mixin), NUNCA
      // na lane síncrona do cliente (`hbx`). Se a etapa 7 (pós-entrega de OUTRO lead, mesma linha
      // já vista antes) marcou nota IA ≤3 em `metadataJson.aiSaneamento`, o card NÃO promove pra
      // 'clean' (pronto) — fica represado (não é descartado; sem migration: reusa o status
      // 'rejected' existente, já excluído de toda query de "disponível" via
      // `RADAR_PROTECTED_STATUSES`/`notIn:['rejected', ...]`). Reversível: se um saneamento futuro
      // subir a nota, ou o dono revisar manualmente, o card reabre normalmente.
      const isFactorySource = sourceEngine === 'hbx_mass_data' || sourceEngine === 'hbx_campaign';
      const existingAiNota = Number(this.parseMaybeJsonObject(existing?.metadataJson)?.aiSaneamento?.nota);
      const isQuarantinedByLowAiScore = isFactorySource
        && !dddMismatch
        && Number.isFinite(existingAiNota)
        && existingAiNota <= 3
        && String(existing?.status || '') !== 'sent_to_vendas'
        && !this.isRadarProtectedStatus(existing?.status);
      const nextStatus = dddMismatch
        ? 'rejected'
        : isQuarantinedByLowAiScore
          ? 'rejected'
          : existingWasDddMismatch
            ? 'clean'
            : existing?.status || 'clean';
      const nextRejectionReason = dddMismatch
        ? 'ddd_mismatch'
        : isQuarantinedByLowAiScore
          ? 'ai_score_low'
          : existingWasDddMismatch
            ? null
            : existing?.rejectionReason || null;
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
      const rankedContacts = buildRankedRadarContacts({
        primaryEmail: mergedEmail,
        primaryPhone: result.phone || phoneDigits || existing?.phone || existing?.phoneDigits,
        evidenceJson,
        existingMetadataJson: existing?.metadataJson,
        sourceEngine,
        emailConfidence: (result as any).emailConfidence || existing?.emailConfidence,
      });
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
          ...(rankedContacts.emails.length ? { emails: rankedContacts.emails } : {}),
          ...(rankedContacts.phones.length ? { phones: rankedContacts.phones } : {}),
          ...(persistedEnrichmentEngines.length ? { enrichmentEngines: persistedEnrichmentEngines } : {}),
          // Preserve CNPJ fields from motor (never overwrite existing non-null value with null)
          ...(((result as any).cnpj || this.parseMaybeJsonObject(existing?.metadataJson)?.cnpj) ? { cnpj: (result as any).cnpj || this.parseMaybeJsonObject(existing?.metadataJson)?.cnpj } : {}),
          ...(((result as any).cnae || this.parseMaybeJsonObject(existing?.metadataJson)?.cnae) ? { cnae: (result as any).cnae || this.parseMaybeJsonObject(existing?.metadataJson)?.cnae } : {}),
          ...(((result as any).cnaeDescription || this.parseMaybeJsonObject(existing?.metadataJson)?.cnaeDescription) ? { cnaeDescription: (result as any).cnaeDescription || this.parseMaybeJsonObject(existing?.metadataJson)?.cnaeDescription } : {}),
          ...(((result as any).razaoSocial || this.parseMaybeJsonObject(existing?.metadataJson)?.razaoSocial) ? { razaoSocial: (result as any).razaoSocial || this.parseMaybeJsonObject(existing?.metadataJson)?.razaoSocial } : {}),
          // Motivo de inclusão (S2 LEAD-CENTRICO, 25/07 — "se o sistema não explica por que a
          // empresa entrou, ele não sabe por que ela entrou"). Aditivo dentro do blob existente,
          // sem migration. Exposto em buildRadarLeadPublic e mostrado como badge no card.
          inclusionReasons: buildRadarLeadInclusionReasons({
            requestedSegment: input.segment,
            requestedCity: input.city,
            requestedState: input.state,
            resultCity,
            resultState,
            source: mergedResult.source,
            sourceEngine,
            phoneDigits,
            whatsappStatus: mergedWhatsappStatus,
            website: mergedWebsite,
            sourceEngines,
          }),
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
          ...(rankedContacts.emails.length ? { emails: rankedContacts.emails } : {}),
          ...(rankedContacts.phones.length ? { phones: rankedContacts.phones } : {}),
          ...(persistedEnrichmentEngines.length ? { enrichmentEngines: persistedEnrichmentEngines } : {}),
          // Preserve CNPJ fields (never overwrite existing non-null with null)
          ...(((result as any).cnpj || this.parseMaybeJsonObject(existing?.metadataJson)?.cnpj) ? { cnpj: (result as any).cnpj || this.parseMaybeJsonObject(existing?.metadataJson)?.cnpj } : {}),
          ...(((result as any).cnae || this.parseMaybeJsonObject(existing?.metadataJson)?.cnae) ? { cnae: (result as any).cnae || this.parseMaybeJsonObject(existing?.metadataJson)?.cnae } : {}),
          ...(((result as any).cnaeDescription || this.parseMaybeJsonObject(existing?.metadataJson)?.cnaeDescription) ? { cnaeDescription: (result as any).cnaeDescription || this.parseMaybeJsonObject(existing?.metadataJson)?.cnaeDescription } : {}),
          ...(((result as any).razaoSocial || this.parseMaybeJsonObject(existing?.metadataJson)?.razaoSocial) ? { razaoSocial: (result as any).razaoSocial || this.parseMaybeJsonObject(existing?.metadataJson)?.razaoSocial } : {}),
        }),
        enrichmentJson: JSON.stringify({ ...enrichmentJson, signals: preservedSignals, quality, delivery: finalDelivery }),
        enrichmentScore: enrichment.enrichmentScore,
        enrichmentConfidence: enrichment.enrichmentConfidence,
        lastEnrichedAt: enrichment.lastEnrichedAt,
        enrichmentVersion: enrichment.enrichmentVersion,
      });
      let savedId: string | null = existing?.id || null;
      if (existing?.id) {
        await delegate.update({
          where: { id: existing.id },
          data,
        }).catch(() => null);
        savedId = existing.id;
      } else {
        const created = await delegate.create({
          data: {
            ...data,
            firstSeenAt: now,
          },
          select: { id: true },
        }).catch(() => null);
        if (created?.id) savedId = created.id;
      }
      // L4 fire-and-forget: enrich CNPJ when available (grátis, BrasilAPI)
      const savedCnpj = String((result as any).cnpj || this.parseMaybeJsonObject(data.metadataJson)?.cnpj || '').replace(/\D/g, '');
      if (savedId && savedCnpj.length >= 14) {
        const l4Row = { id: savedId, metadataJson: data.metadataJson, evidenceJson: data.evidenceJson, cnpj: savedCnpj };
        this.getCnpjL4Enrichment().enrichRow(this.prisma, l4Row).catch(() => null);
      }
      // Escrita dupla ADITIVA em LeadContact (Sprint 5 MOTOR-RFB-FILA): todo contato que chega
      // no pool (busca + L2 síncrono) vira linha consultável/exportável — com gate de formato.
      // Fire-and-forget: nunca atrasa nem falha a persistência do lote.
      if (savedId) {
        const contactCandidates = [
          ...rankedContacts.candidates,
          ...((data as any).instagramUrl ? [{ kind: 'instagram' as const, value: String((data as any).instagramUrl), source: sourceEngine, confidence: safeInteger((data as any).socialConfidence) || 60 }] : []),
          ...((data as any).facebookUrl ? [{ kind: 'facebook' as const, value: String((data as any).facebookUrl), source: sourceEngine, confidence: safeInteger((data as any).socialConfidence) || 60 }] : []),
        ];
        if (contactCandidates.length) {
          this.getLeadContactWrite().writeContacts(this.prisma, savedId, contactCandidates).catch(() => null);
        }
      }
      // Faixa B (Plano 16072026): missão local nasce SOMENTE depois de existir RadarLeadPool.id.
      // A escrita é curta, idempotente e fire-and-forget; falha/restart é coberto pelo reconciliador
      // durável da fila. Negativos/rejeitados nunca são enviados de volta para pesquisa.
      if (savedId && nextStatus !== 'rejected' && !this.isRadarProtectedStatus(nextStatus)) {
        void this.getMissionQueue().enqueueLocalDeepEnrichment({
          radarLeadId: savedId,
          name: String((data as any).name || result?.name || ''),
          city: (data as any).city || null,
          state: (data as any).state || null,
          segment: (data as any).segment || null,
          website: (data as any).website || null,
          sourceUrl: (data as any).sourceUrl || null,
          identityKey: (data as any).placeId || (data as any).phoneDigits || null,
          runId: options.campaignId || null,
          priority: 0,
          priorityReason: 'new_lead',
        }).catch((error: any) => {
          this.logger.warn(`[local-deep-enrich] enqueue pós-persistência falhou sem afetar o Radar lead=${savedId}: ${String(error?.message || error)}`);
        });
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
    if (blocked) throw new BadRequestException('Este e-mail está marcado como não contactar.');
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
      throw new BadRequestException('Este card está marcado como negativo/bloqueado e não pode receber sugestão ativa de envio.');
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
      throw new BadRequestException('Este card está marcado como negativo/bloqueado e não pode receber sugestão ativa de envio.');
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
        note: 'Reserva liberada automaticamente após 72h sem ação.',
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
        throw new ForbiddenException('Este card já está na carteira de outra empresa.');
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
    // LIMPEZA-DESTRUTIVA L3: card e da EMPRESA — qualquer papel pode registrar evento,
    // independente de quem esta como "Responsável" (assignedUserId, so informativo).
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
    if (ownershipEnabled && ownerCompanyId && ownerCompanyId !== context.companyId) {
      throw new ForbiddenException('Este card já está na carteira de outra empresa.');
    }

    const eventType = String(input.eventType || '').trim().toLowerCase() as RadarLeadEventType;
    if (!['denied', 'complaint', 'no_answer', 'hidden', 'contacted', 'note'].includes(eventType)) {
      throw new BadRequestException('Evento do Radar invalido.');
    }

    const previousStatus = this.resolveRadarLeadStatus(row);
    // Nota neutra (LEADS-FINAL 02): registra no histórico e SÓ isso — NÃO reivindica posse,
    // NÃO cria companyState (senão o pull-gate do 04 leria como "possuído" e vazaria contato),
    // NÃO debita, NÃO muda status. Exige que a empresa JÁ seja dona (puxou): anotar não é claim.
    if (eventType === 'note') {
      const noteText = String(input.note || '').trim();
      if (!noteText) throw new BadRequestException('Nota vazia.');
      const ownedByViewer =
        (ownershipEnabled && ownerCompanyId === context.companyId) || Boolean(row?.companyStates?.[0]);
      if (!ownedByViewer) throw new ForbiddenException('Puxe o lead pra sua carteira antes de anotar.');
      await this.recordRadarLeadEvent({
        leadId: row.id,
        companyId: context.companyId,
        userId: context.userId,
        eventType: 'note',
        note: noteText,
        statusFrom: previousStatus,
        statusTo: previousStatus,
      });
      return this.getRadarLeadForUser(user, row.id);
    }
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

  /**
   * Zap-gate porta 8 — REESCRITO 03/07 (decisão do dono): NADA bloqueia por WhatsApp.
   * O motor só LÊ e SINALIZA. Resolve o whatsappStatus verdadeiro do card e ENTREGA sempre.
   * O antigo gate de bloqueio (com sua flag de env) foi REMOVIDO por inteiro — sem flag, sem legado.
   * O freio físico W4 (cache/rate/disjuntor) mora no serviço do check e continua intacto;
   * `confirmed` só vem do Webwhats de verdade (radarCheckWhatsappNumbers).
   */
  private async resolveRadarWhatsappStatusForDelivery(row: any): Promise<'confirmed' | 'missing' | 'unverified' | null> {
    const existing = String(
      this.parseMaybeJsonObject(row?.enrichmentJson)?.whatsappStatus
      || this.parseMaybeJsonObject(row?.metadataJson)?.whatsappStatus
      || '',
    ).trim().toLowerCase();
    if (existing === 'confirmed') return 'confirmed'; // já confirmado pelo Webwhats — não rebaixa nem re-checa

    const phoneDigits = normalizePhoneDigits(row?.phoneDigits || row?.phone);
    if (!phoneDigits) return (existing as any) || null; // sem telefone, nada a checar

    try {
      const results = await this.radarCheckWhatsappNumbers([phoneDigits]); // passa pelo freio W4 intacto
      const match = Array.isArray(results)
        ? results.find((item: any) => normalizePhoneDigits(item?.normalizedNumber || item?.input) === phoneDigits)
        : null;
      if (!match) return (existing as any) || 'unverified'; // motor indisponivel/sem sessao (degrada p/ [])
      if (match.exists === true) return 'confirmed';        // confirmação REAL do Webwhats
      if (match.exists === false) return 'missing';         // estado explícito "sem zap"
      return (existing as any) || 'unverified';
    } catch (error: any) {
      this.logger?.warn?.(`[radar-zap-gate] check indisponivel lead=${row?.id || '-'}: ${String(error?.message || error)}`);
      return (existing as any) || 'unverified'; // fail-open: nunca derruba a entrega
    }
  }

  /**
   * Grava o sinal de WhatsApp resolvido no `leadRow` em memória — sem rebaixar um `confirmed`
   * já persistido. Precisa rodar ANTES da montagem do payload do Vendas
   * (`buildCompactVendasEnrichmentJson`) e da transação final (que reconstrói
   * `nextDeliveryEnrichment/Metadata` a partir de `leadRow.metadataJson/enrichmentJson`), pra
   * herdar o sinal nos dois lugares sem update separado no `radarLeadPool`.
   */
  private applyRadarWhatsappStatusSignalToRow(row: any, status: 'confirmed' | 'missing' | 'unverified') {
    if (!row || !status) return;
    const enr = this.parseMaybeJsonObject(row.enrichmentJson);
    const meta = this.parseMaybeJsonObject(row.metadataJson);
    const current = String(enr?.whatsappStatus || meta?.whatsappStatus || '').trim().toLowerCase();
    if (current === 'confirmed' && status !== 'confirmed') return; // nunca rebaixa confirmação real
    enr.whatsappStatus = status;
    meta.whatsappStatus = status;
    row.enrichmentJson = JSON.stringify(enr);
    row.metadataJson = JSON.stringify(meta);
    row.whatsappStatus = status;
  }

  /**
   * Etapa 7 (IA 7b pós-entrega só-aditiva): agenda o saneamento em memória, sem bloquear a
   * resposta da entrega. `RadarPostDeliveryAiSaneamentoService.enqueue` já é no-op se a flag
   * `HBX_RADAR_AI_SANEAMENTO_ENABLED` estiver OFF (default) — chamada sempre segura.
   * `companyId` (CRÉDITO UNIVERSAL, PR11072026): empresa dona da importação, já validada por
   * `resolveContext` no caller — repassado como ação `ai_batch`, nunca inventado.
   */
  private enqueueRadarPostDeliveryAiSaneamento(row: any, companyId?: number | null) {
    const radarLeadId = String(row?.id || '').trim();
    const name = String(row?.name || '').trim();
    if (!radarLeadId || !name) return;
    this.getRadarPostDeliveryAiSaneamento().enqueue(
      {
        radarLeadId,
        name,
        city: row?.city || null,
        state: row?.state || null,
        segment: row?.segment || null,
        companyId: companyId ?? null,
      },
      {
        loadRadarLeadPoolRow: (id: string) => (this.prisma as any).radarLeadPool.findUnique({
          where: { id },
          select: { id: true, metadataJson: true },
        }).catch(() => null),
        updateRadarLeadPoolMetadata: async (id: string, metadataJson: string) => {
          await (this.prisma as any).radarLeadPool.update({
            where: { id },
            data: { metadataJson },
          }).catch(() => null);
        },
        logger: this.logger,
      },
    );
  }

  /**
   * Consolida os blobs de entrega sem apagar uma gravação local que tenha vencido a corrida
   * entre a leitura inicial do card e a criação do vínculo com Vendas. O compare-and-swap usa
   * exatamente os dois blobs lidos; se outro escritor mudar qualquer um deles, relê e recompõe
   * somente os patches de delivery. Repetir a operação é seguro e não dispara nenhum motor.
   */
  private async persistRadarDeliveredStateAfterLink(input: {
    context: SearchExecutionContext;
    radarLeadId: string;
    vendasLeadId: string;
    imported: any;
    now: Date;
  }) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const freshRow = await (this.prisma as any).radarLeadPool.findUnique({
        where: { id: input.radarLeadId },
        include: {
          companyStates: {
            where: { companyId: input.context.companyId },
            take: 1,
          },
        },
      });
      if (!freshRow) {
        throw new ServiceUnavailableException('Card do Radar desapareceu durante a consolidação da entrega.');
      }
      const linkedState = Array.isArray(freshRow.companyStates) ? freshRow.companyStates[0] : null;
      if (String(linkedState?.vendasLeadId || '') !== input.vendasLeadId) {
        throw new ServiceUnavailableException('Vínculo explícito entre Radar e Vendas não foi consolidado.');
      }

      const metadata = this.parseMaybeJsonObject(freshRow.metadataJson);
      const enrichment = this.parseMaybeJsonObject(freshRow.enrichmentJson);
      const deliveredState = this.getRadarDeliveryOrchestrator().buildDeliveredState({
        lead: freshRow,
        imported: input.imported,
        vendasLeadId: input.vendasLeadId,
        metadata,
        enrichment,
        now: input.now,
      });
      const nextMetadataJson = JSON.stringify({
        ...metadata,
        ...deliveredState.metadataPatch,
      });
      const nextEnrichmentJson = JSON.stringify({
        ...enrichment,
        ...deliveredState.enrichmentPatch,
      });
      const updated = await (this.prisma as any).radarLeadPool.updateMany({
        where: {
          id: input.radarLeadId,
          metadataJson: freshRow.metadataJson ?? null,
          enrichmentJson: freshRow.enrichmentJson ?? null,
        },
        data: {
          metadataJson: nextMetadataJson,
          enrichmentJson: nextEnrichmentJson,
        },
      });
      if (Number(updated?.count || 0) > 0) {
        return {
          row: {
            ...freshRow,
            metadataJson: nextMetadataJson,
            enrichmentJson: nextEnrichmentJson,
          },
          deliveredState,
        };
      }
    }

    throw new ServiceUnavailableException('Card do Radar mudou durante a consolidação; tente novamente.');
  }

  /**
   * Fecha a janela em que o commit local termina antes de o RadarLeadCompanyState existir:
   * depois do vínculo tenant-safe, relê o Radar e preenche no card de Vendas somente campos
   * vazios (ou métricas menores). Cada UPDATE repete companyId + id explícito e revalida a
   * condição no banco, então uma gravação local concorrente sempre vence. Telefone e
   * sourceHistoryId nunca são usados para localizar o card.
   */
  private async convergeFreshRadarLeadToLinkedVendas(input: {
    context: SearchExecutionContext;
    radarLeadId: string;
    vendasLeadId: string;
  }) {
    const freshRow = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: input.radarLeadId },
      include: {
        companyStates: {
          where: { companyId: input.context.companyId },
          take: 1,
        },
      },
    });
    const linkedState = Array.isArray(freshRow?.companyStates) ? freshRow.companyStates[0] : null;
    if (!freshRow || String(linkedState?.vendasLeadId || '') !== input.vendasLeadId) {
      throw new ServiceUnavailableException('Vínculo explícito entre Radar e Vendas não foi encontrado para convergência.');
    }

    const linkedVendas = await (this.prisma as any).vendasLead.findFirst({
      where: {
        id: input.vendasLeadId,
        companyId: input.context.companyId,
      },
      select: { id: true },
    });
    if (!linkedVendas) {
      throw new ServiceUnavailableException('Card de Vendas vinculado não pertence à empresa da entrega.');
    }

    const fillTextIfEmpty = async (field: 'email' | 'website' | 'address', rawValue: unknown) => {
      const value = String(rawValue || '').trim();
      if (!value) return;
      await (this.prisma as any).vendasLead.updateMany({
        where: {
          id: input.vendasLeadId,
          companyId: input.context.companyId,
          OR: [{ [field]: null }, { [field]: '' }],
        },
        data: { [field]: value },
      });
    };

    await fillTextIfEmpty('email', freshRow.email);
    await fillTextIfEmpty('website', freshRow.website);
    await fillTextIfEmpty('address', freshRow.address);

    const phone = String(freshRow.phone || '').trim();
    const phoneNormalized = normalizePhoneDigits(freshRow.phoneDigits || phone);
    const metadata = this.parseMaybeJsonObject(freshRow.metadataJson);
    const localMissionId = String(metadata?.localDeepEnrich?.missionId || '').trim();
    const phoneVariants = Array.from(new Set([
      String(freshRow.phoneDigits || '').trim(),
      phoneNormalized,
    ].filter(Boolean)));
    // O número só sobe como principal se o próprio commit local deixou a prova materializada
    // de WhatsApp confirmado. A consulta valida o valor; não resolve o card de Vendas por ele.
    const confirmedLocalWhatsapp = phone && localMissionId && phoneVariants.length
      && typeof (this.prisma as any).leadContact?.findFirst === 'function'
      ? await (this.prisma as any).leadContact.findFirst({
          where: {
            radarLeadId: input.radarLeadId,
            kind: 'whatsapp',
            valueNormalized: { in: phoneVariants },
            createdByMissionId: localMissionId,
          },
          select: { id: true },
        }).catch(() => null)
      : null;
    if (confirmedLocalWhatsapp && isLikelyValidBrPhone(phoneNormalized)) {
      try {
        await (this.prisma as any).vendasLead.updateMany({
          where: {
            id: input.vendasLeadId,
            companyId: input.context.companyId,
            AND: [
              { OR: [{ phone: null }, { phone: '' }] },
              { OR: [{ phoneNormalized: null }, { phoneNormalized: '' }] },
            ],
          },
          data: { phone, phoneNormalized },
        });
      } catch (error) {
        // Conflito de unicidade significa que o contato continua no LeadContact, como definido
        // no contrato local; qualquer outra falha é operacional e precisa subir para retry.
        if (String((error as any)?.code || '') !== 'P2002') throw error;
        this.logger.warn(`[radar-delivery] telefone local não promovido por conflito no Vendas lead=${input.radarLeadId}`);
      }
    }

    const rating = freshRow.rating == null || freshRow.rating === '' ? null : Number(freshRow.rating);
    if (rating != null && Number.isFinite(rating)) {
      await (this.prisma as any).vendasLead.updateMany({
        where: {
          id: input.vendasLeadId,
          companyId: input.context.companyId,
          OR: [{ rating: null }, { rating: { lt: rating } }],
        },
        data: { rating },
      });
    }
    const reviews = safeInteger(freshRow.reviews);
    if (reviews > 0) {
      await (this.prisma as any).vendasLead.updateMany({
        where: {
          id: input.vendasLeadId,
          companyId: input.context.companyId,
          reviews: { lt: reviews },
        },
        data: { reviews },
      });
    }

    return freshRow;
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
    await this.assertSellerTeamPolicyAccess(user, 'radar.cards.sendToVendas', 'Envio do Radar para Vendas bloqueado pela politica da equipe.');
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    // LIMPEZA-DESTRUTIVA L3: qualquer vendedor/admin/master da empresa pode puxar um card
    // que já esteja atribuído a OUTRO colega — assignedUserId nunca mais é trava de posse.
    let leadRow = row;
    if (this.isRadarProtectedStatus(leadRow?.companyStates?.[0]?.status || leadRow?.status)) {
      throw new BadRequestException('Card protegido nao pode ser enviado para Vendas.');
    }
    // Zap-gate porta 8 REESCRITO 03/07 (decisão do dono): NADA bloqueia entrega por WhatsApp.
    // O motor só LÊ e SINALIZA — grava o whatsappStatus verdadeiro no card; empresa sem zap é lead
    // útil e ENTREGA NORMAL. O front exibe o WhatsApp clicável quando existe.
    const resolvedWhatsappStatus = await this.resolveRadarWhatsappStatusForDelivery(leadRow);
    if (resolvedWhatsappStatus) this.applyRadarWhatsappStatusSignalToRow(leadRow, resolvedWhatsappStatus);
    // LIMPEZA-DESTRUTIVA L3: quando QUALQUER papel (vendedor, admin, master) puxa um card
    // livre para si (sem assignedUserId explícito), o campo é só INFORMATIVO ("Responsável"
    // = quem puxou) — usa context.userId. Callers de distribuição sempre passam
    // assignedUserId explícito, não são afetados.
    const explicitAssignedUserId = Math.trunc(Number(options.assignedUserId || 0)) || null;
    const assignedUserId = explicitAssignedUserId !== null
      ? explicitAssignedUserId
      : context.userId;
    const assignedByUserId = assignedUserId
      ? Math.trunc(Number(options.assignedByUserId || context.userId || 0)) || null
      : null;
    const requiredChannels = await this.getTeamPolicyRequiredRadarChannels(assignedUserId || context.userId);
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
      requiredChannels,
      preferredChannels: [],
      channelMatchMode: requiredChannels.length ? 'all_required' : 'prefer',
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
    // CRÉDITOS — ATOMICIDADE (fix "entrega parcial + 409" / puxar com saldo 0). A ordem antiga era
    // criar card → entregar → debitar → 409 sem desfazer, deixando card órfão no Vendas. Agora o
    // débito acontece ANTES de qualquer gravação: sem saldo, o gate REAL sobe ConflictException
    // AQUI (nenhum claim no Radar, nenhum card no Vendas), e o dono vê "Saldo de créditos esgotado"
    // (isBillingOwnerActor decide a mensagem; vendedor/gerente seguem no bloqueio neutro). Gate OFF
    // (2 chaves) = no-op transparente. O importWebscraping abaixo roda com debitOnImport:false — o
    // débito e o teto de cards-em-mãos já foram resolvidos aqui, então NÃO há débito duplo nem
    // dupla contagem do teto S4 do vendedor. Estorno atômico no catch se a gravação falhar depois.
    const wantsCreditDebit = Boolean(options.debitOnImport);
    const creditUsageKey = `radar:${leadRow.id}`;
    let creditReserved = false;
    if (wantsCreditDebit) {
      // (1) Teto operacional de cards-em-mãos do vendedor (mesmo gate do importador em lote —
      //     preservado aqui de propósito porque desligamos o debitOnImport downstream).
      if (typeof this.commercialUsageLimits?.assertSellerActiveCardSlots === 'function') {
        await this.commercialUsageLimits.assertSellerActiveCardSlots(
          context.companyId,
          assignedUserId || context.userId,
        );
      }
      // (2) Débito REAL do crédito, fail-closed, ANTES da gravação.
      if (typeof this.commercialUsageLimits?.reserveLeadDeliveryCredit === 'function') {
        const reservation = await this.commercialUsageLimits.reserveLeadDeliveryCredit(
          context.companyId,
          context.userId,
          { usageKey: creditUsageKey, isBillingAudienceUser: isBillingOwnerActor(user) },
        );
        creditReserved = Boolean(reservation?.applied) && Number(reservation?.debited || 0) > 0;
      }
    }

    let imported: any = null;
    try {
    await this.claimRadarLeadForCompany(context, leadRow, {
      poolStatus: 'in_attendance',
      companyStatus: 'in_attendance',
      eventType: 'ownership_reserved',
      note: assignedUserId
        ? `Card reservado para envio ao módulo Vendas do vendedor ${assignedUserId}.`
        : 'Card reservado para envio ao módulo Vendas.',
      assignedUserId,
      assignedByUserId,
      countUsage: false,
    });

    const includeSmartFields = await this.canUseRadarSmartLeadFields(context.companyId);
    imported = await this.vendasService.importWebscrapingLeadsForUser(user, {
      sourceHistoryId: `radar:${leadRow.id}`,
      assignedUserId: assignedUserId || undefined,
      skipWhatsappValidation: Boolean(options.skipWhatsappValidation),
      // Débito e teto de cards-em-mãos já resolvidos ANTES de gravar (bloco CRÉDITOS acima);
      // aqui é sempre false pra não debitar nem contar o teto S4 em dobro. Estorno no catch.
      debitOnImport: false,
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
    } catch (error) {
      // Estorno atômico: a gravação falhou DEPOIS do débito — devolve o crédito reservado
      // (best-effort, idempotente pela mesma usageKey). O caso "sem saldo" já barrou ANTES de
      // gravar, então aqui só cai falha real de entrega (ex.: erro de banco), nunca saldo zero.
      if (creditReserved && typeof this.commercialUsageLimits?.releaseLeadDeliveryCredit === 'function') {
        await this.commercialUsageLimits
          .releaseLeadDeliveryCredit(context.companyId, context.userId, { usageKey: creditUsageKey })
          .catch(() => undefined);
      }
      throw error;
    }
    const vendasLeadId = String(imported?.leads?.[0]?.id || '').trim();
    if (!vendasLeadId) {
      // A importação já passou pelo débito e pode ter criado o card. Sem o id explícito não há
      // como consolidar com segurança nem como procurar por telefone/sourceHistoryId.
      throw new ServiceUnavailableException('Vendas não devolveu o identificador necessário para consolidar a entrega.');
    }
    const now = new Date();
    // Mesma ordem de lock do commit local (RadarLeadPool -> RadarLeadCompanyState), evitando
    // deadlock. Falha aqui NÃO pode ser engolida: o card/uso já existe e o retry idempotente
    // precisa enxergar o erro para concluir o vínculo.
    await (this.prisma as any).$transaction([
      (this.prisma as any).radarLeadPool.update({
        where: { id: leadRow.id },
        data: {
          ...(await this.supportsRadarOwnershipPersistence() ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
          status: 'sent_to_vendas',
          globalImportedCount: { increment: 1 },
          lastSeenAt: now,
        },
      }),
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
    ]);
    const consolidated = await this.persistRadarDeliveredStateAfterLink({
      context,
      radarLeadId: leadRow.id,
      vendasLeadId,
      imported,
      now,
    });
    const deliveredState = consolidated.deliveredState;
    const freshLeadRow = await this.convergeFreshRadarLeadToLinkedVendas({
      context,
      radarLeadId: leadRow.id,
      vendasLeadId,
    });
    await this.getRadarPostDeliveryVendasUpdate().recordEnrichmentJobStates({
      prisma: this.prisma,
      context,
      row: freshLeadRow,
      vendasLeadId,
      jobs: deliveredState.jobs,
    }).catch(() => null);
    await this.recordRadarLeadEvent({
      leadId: leadRow.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: 'imported_to_vendas',
      statusFrom: this.normalizeRadarLeadStatus(leadRow.status),
      statusTo: 'sent_to_vendas',
    });
    if (!assignedUserId && leadRow?.segment) {
      this._bumpSegmentAffinity(context.userId, String(leadRow.segment)).catch(() => null);
    }
    // O mesmo trabalho local já existente ganha prioridade depois da entrega; a dedupe por
    // lead+workVersion impede uma segunda missão. Nunca participa da transação de débito/entrega.
    void this.getMissionQueue().enqueueLocalDeepEnrichment({
      radarLeadId: freshLeadRow.id,
      name: freshLeadRow.name,
      city: freshLeadRow.city || null,
      state: freshLeadRow.state || null,
      segment: freshLeadRow.segment || null,
      website: freshLeadRow.website || null,
      sourceUrl: freshLeadRow.sourceUrl || null,
      identityKey: freshLeadRow.placeId || freshLeadRow.phoneDigits || null,
      companyId: context.companyId,
      requestedByUserId: context.userId,
      priority: 100,
      priorityReason: 'delivered',
    }).catch((error: any) => {
      this.logger.warn(`[local-deep-enrich] prioridade pós-entrega falhou sem afetar Vendas lead=${freshLeadRow.id}: ${String(error?.message || error)}`);
    });
    // 4B: dispara DEPOIS da entrega e agora materializa missão durável; nunca atrasa nem falha
    // a resposta. companyId já foi validado por resolveContext e só autoriza a ação ai_batch.
    this.enqueueRadarPostDeliveryAiSaneamento(freshLeadRow, context.companyId);
    // NÚCLEO-CRM N2 — materializa Conta(PJ)+Contato(dono) na espinha a partir do CNPJ do lead
    // puxado da base 28M. Fire-and-forget, DEPOIS da entrega, atrás de `HBX_NUCLEO_INGESTAO_ENABLED`
    // (default OFF → no-op total). NUNCA quebra o pull (a função engole o próprio erro).
    void this.materializeNucleoFromRadarLead(context.companyId, freshLeadRow);
    return {
      ok: true,
      radarLeadId: leadRow.id,
      vendasLeadId,
      import: imported,
    };
  }

  // NÚCLEO-CRM N2 — hook aditivo da ingestão no PULL. O único choke onde um lead da base 28M
  // vira VendasLead é `importRadarLeadToVendasForUser` (acima); aqui, DEPOIS que ele já
  // respondeu, plugamos a materialização da espinha (Conta+Contato). Delega toda a lógica pro
  // helper puro/testável `materializeNucleoIngestaoFromRadarLead` (nucleo/nucleo-ingestao.ts),
  // que checa a flag `HBX_NUCLEO_INGESTAO_ENABLED` (default OFF) e recupera o CNPJ do pool row
  // (sourceUrl `internal://cnpj-base/<cnpj>` ou evidenceJson). Flag OFF: no-op total, pull
  // idêntico ao de hoje (protege o refab "Buscar empresas" do dono).
  private materializeNucleoFromRadarLead(companyId: number, leadRow: any): Promise<void> {
    // Sai barato quando a flag está OFF, sem instanciar serviço nem tocar env duas vezes.
    if (!nucleoIngestaoEnabled()) return Promise.resolve();
    return materializeNucleoIngestaoFromRadarLead(
      {
        // getNucleoCadastro() devolve o serviço inteiro; o Pick (upsertContaFromCnpj /
        // upsertContaFromRadarWebLead / upsertContatoPrincipal) é satisfeito por estrutura.
        cadastro: this.getNucleoCadastro(),
        loadCnpjPublic: async (cnpj: string) => {
          if (!(await this.prisma.hasTable('CnpjPublicCompany').catch(() => false))) return null;
          return (this.prisma as any).cnpjPublicCompany
            .findUnique({
              where: { cnpj },
              select: {
                cnpj: true,
                razaoSocial: true,
                nomeFantasia: true,
                ownerName: true,
                ownerQualification: true,
                address: true,
                city: true,
                state: true,
              },
            })
            .catch(() => null);
        },
        logger: this.logger,
      },
      companyId,
      leadRow,
    )
      .then(() => undefined)
      .catch(() => undefined);
  }

  // distributeRadarLeadsToVendedoresForUser (o "push" admin→vendedor de CARDS):
  // REMOVIDO (LIMPEZA-DESTRUTIVA L4, 04/07). No modelo novo admin distribui
  // CRÉDITO (CREDITOS S4), não card. pullRadarLeadsForUser (puxada manual do
  // próprio vendedor) e importRadarLeadToVendasForUser seguem intocados.
}
