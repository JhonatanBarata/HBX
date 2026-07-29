// @ts-nocheck
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
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
  looksLikeNonBusinessName,
  isRealisticBrPhone,
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
  buildRadarStageSnapshot,
  RADAR_BLOCKED_OFFICIAL_WEBSITE_DOMAINS,
} from '../radar-core-method-imports';
import { resolveEnrichmentPaidFlags } from '../../enrichment-cost/enrichment-paid-policy';
import { resolveCompanyAccessState } from '../../../modules/company-access-state';
import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../../../companies/master-whatsapp-company.constants';
import { confirmedSegments } from '../../../users/segment-affinity.util';
import { buildCnpjBaseQueryInputFromRadarFilters } from '../providers/cnpj-public/radar-base-availability.util';
import type { CnpjBaseQueryInput } from '../providers/cnpj-public/cnpj-base-query.service';
import { RadarSearchRateLimiterService } from '../search-rate-limit.service';
// S7 LEAD-CENTRICO (07-pool-raiz.md, item 1): marquinha/supressão global por
// contato — instanciado à mão (só depende de PrismaService), mesmo padrão de
// EventRuleService (cadencia-gatilho.service.ts), pra não abrir dependência
// de módulo Nest entre Webscraping e Vendas só por causa disto.
import { VendasContactSuppressionService } from '../../../vendas/vendas-contact-suppression.service';

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
import { deriveRowSignals, parseSignalsJson } from '../03-enrichment/lead-signals.util';
import { RadarPublicDataService } from '../03-enrichment/radar-public-data.service';
import { IcpFingerprintService } from '../../icp/icp-fingerprint.service';
import { buildRadarSourceChainFromEngines, radarEnrichedByLanesOf } from '../shared/radar-source-lanes';

let cityCache: {
  loadedAt: number;
  items: string[];
} | null = null;

export class RadarCorePresentationMixin {
  [key: string]: any;
  private _radarPublicData?: RadarPublicDataService;
  private _icpFingerprint?: IcpFingerprintService;
  private getRadarPublicData(): RadarPublicDataService {
    return this._radarPublicData || (this._radarPublicData = new RadarPublicDataService());
  }
  private getIcpFingerprint(): IcpFingerprintService {
    return this._icpFingerprint || (this._icpFingerprint = new IcpFingerprintService());
  }
  private mapRunItemToContact(item: any): WebscrapingContactResult {
    return this.getRadarRunPresenter().mapRunItemToContact(item, this.buildRadarRunPresenterHost());
  }

  private buildSearchRunResponse(run: any, capacity?: { operationalStatus: 'healthy' | 'degraded'; message: string | null }): WebscrapingSearchRunResponse {
    return this.getRadarRunPresenter().buildSearchRunResponse(run, capacity, this.buildRadarRunPresenterHost());
  }

  private resolveContext(user: any): SearchExecutionContext {
    const masterContextCompanyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : 0);
    const companyId = masterContextCompanyId || Number(user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    return { companyId, userId, user };
  }

  private canUseWebscrapingRole(user: any) {
    const role = String(user?.role || '').trim().toUpperCase();
    // USERMASTER (dono do tenant) = admin: usa o Radar/webscraping, igual a ADMIN.
    return Boolean(user?.isSystemMaster) || role === 'ADMIN' || role === 'USERMASTER';
  }

  private isCompanySellerUser(user: any) {
    const role = String(user?.role || '').trim().toUpperCase();
    if (role !== 'USER' || Boolean(user?.isSystemMaster) || Boolean(user?.masterContext?.active)) return false;
    return Boolean(user?.companyId || user?.company?.id);
  }

  private canSeeDiagnostics(user: any) {
    return this.canUseWebscrapingRole(user);
  }

  private startOfToday(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private startOfTomorrow(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  }

  private resolveGoogleSearchesPerDay(company: any) {
    const planKey = resolveCommercialPlanKeyForCapabilities(company || {});
    return COMMERCIAL_PLAN_QUOTAS[planKey]?.googleSearchesPerDay ?? COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PADRAO].googleSearchesPerDay;
  }

  // Projecao do estado canonico (PR-002 A.4): morre a copia local do motor
  // de acesso (tinha ate regra de graça propria divergente).
  private companyHasPaidFeatureAccess(company: any) {
    return resolveCompanyAccessState(company).canUse;
  }

  private async supportsUsageLogPersistence() {
    return this.prisma.hasTable('WebscrapingUsageLog');
  }

  private async buildRuntimeQuota(user: any) {
    const context = this.resolveContext(user);
    if (!this.canUseWebscrapingRole(user)) {
      return {
        remainingSearches: 0,
        dailyLimit: 0,
        isTrialLimited: true,
        accessMode: 'blocked' as const,
      };
    }
    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      select: {
        status: true,
        // MASTER-REFAB S6 (10/07 noite): resolveCompanyAccessState lê accountType antes de
        // status/datas — sem ele aqui, empresa enterprise bloqueada (overdue/trial vencido)
        // normalizava pro default 'credit' e reganhava acesso à busca por engano.
        accountType: true,
        isActive: true,
        selectedPlanKey: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
        courtesyEndsAt: true,
        courtesyReason: true,
      },
    });

    const dailyLimit = company ? this.resolveGoogleSearchesPerDay(company) : 0;

    if (!company) {
      return {
        remainingSearches: 0,
        dailyLimit: 0,
        isTrialLimited: false,
        accessMode: 'blocked' as const,
      };
    }

    if (!this.companyHasPaidFeatureAccess(company)) {
      return {
        remainingSearches: 0,
        dailyLimit: 0,
        isTrialLimited: true,
        accessMode: 'blocked' as const,
      };
    }

    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) {
      return {
        remainingSearches: dailyLimit,
        dailyLimit,
        isTrialLimited: true,
        accessMode: 'plan' as const,
      };
    }

    const dayStart = this.startOfToday();
    const nextDayStart = this.startOfTomorrow();
    const todayGoogleExecutions = await this.prisma.webscrapingUsageLog.count({
      where: {
        companyId: context.companyId,
        eventType: 'GOOGLE_SEARCH_EXECUTED',
        createdAt: {
          gte: dayStart,
          lt: nextDayStart,
        },
      },
    });

    return {
      remainingSearches: Math.max(0, dailyLimit - todayGoogleExecutions),
      dailyLimit,
      isTrialLimited: true,
      accessMode: 'plan' as const,
    };
  }

  private async assertGoogleDailyQuota(context: SearchExecutionContext, input: NormalizedSearchInput) {
    if (!this.canUseWebscrapingRole(context.user)) {
      throw new ForbiddenException({
        code: 'webscraping_role_blocked',
        message: 'O webscraping fica restrito ao ADMIN da empresa. Usuarios comuns nao usam o motor nem veem este modulo.',
      });
    }
    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) return;

    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      select: {
        id: true,
        status: true,
        accountType: true,
        isActive: true,
        selectedPlanKey: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
        courtesyEndsAt: true,
        courtesyReason: true,
      },
    });

    const dailyLimit = company ? this.resolveGoogleSearchesPerDay(company) : 0;

    if (!company) return;
    if (!this.companyHasPaidFeatureAccess(company)) {
      await this.recordUsageLog(
        context,
        input,
        'BLOCKED_DAILY_LIMIT',
        0,
        'Empresa vencida ou sem acesso ativo. Regularize o plano para usar recursos pagos do HBX.',
      );
      throw new ForbiddenException({
        code: 'company_paid_access_required',
        message: 'Empresa vencida ou sem acesso ativo. Regularize o plano para usar recursos pagos do HBX.',
      });
    }

    const dayStart = this.startOfToday();
    const nextDayStart = this.startOfTomorrow();
    const todayGoogleExecutions = await this.prisma.webscrapingUsageLog.count({
      where: {
        companyId: context.companyId,
        eventType: 'GOOGLE_SEARCH_EXECUTED',
        createdAt: {
          gte: dayStart,
          lt: nextDayStart,
        },
      },
    });

    if (dailyLimit > 0 && todayGoogleExecutions < dailyLimit) {
      return;
    }

    const planKey = resolveCommercialPlanKeyForCapabilities(company);
    const message = planKey === COMMERCIAL_PLAN_KEYS.LITE
      ? 'O HBX List não inclui buscas Google diárias. Os motores gratuitos continuam liberados. Para buscas Google, escolha o HBX Lead Plus ou HBX Full — Bot e IA.'
      : `${GOOGLE_DAILY_LIMIT_REACHED_MESSAGE} Seu plano permite ${dailyLimit} busca(s) Google por dia.`;
    await this.recordUsageLog(context, input, 'BLOCKED_DAILY_LIMIT', 0, message);
    throw new ForbiddenException({
      code: 'google_daily_limit_reached',
      message,
    });
  }

  private async recordUsageLog(
    context: SearchExecutionContext,
    input: NormalizedSearchInput,
    eventType: UsageEventType,
    resultCount: number,
    message?: string | null,
    executionMeta?: UsageExecutionMeta | null,
  ) {
    const usageLogEnabled = await this.supportsUsageLogPersistence();
    if (!usageLogEnabled) return;

    const executedEvent = this.isExecutedUsageEvent(eventType);

    await this.prisma.webscrapingUsageLog.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        eventType,
        city: input.city,
        segment: input.segment,
        quantity: input.quantity,
        resultCount: Math.max(0, Math.trunc(resultCount || 0)),
        source: executedEvent ? executionMeta?.source || null : null,
        reusedCount:
          executedEvent ? Math.max(0, Math.trunc(executionMeta?.reusedCount || 0)) : 0,
        fetchedCount:
          executedEvent ? Math.max(0, Math.trunc(executionMeta?.fetchedCount || 0)) : 0,
        technicalCacheUsed: executedEvent ? Boolean(executionMeta?.technicalCacheUsed) : false,
        technicalCacheReusedCount:
          executedEvent
            ? Math.max(0, Math.trunc(executionMeta?.technicalCacheReusedCount || 0))
            : 0,
        searchSignature: input.searchSignature,
        message: String(message || '').trim() || null,
      },
    }).catch(() => null);
  }

  private buildNativeTechnicalMessage(runtime: NativeRuntimeDiagnostic) {
    if (!runtime.googleApiKeyConfigured) {
      return 'GOOGLE_PLACES_API_KEY ou WEBSCRAPING_GOOGLE_PLACES_API_KEY ausente no backend nativo.';
    }
    return 'Busca nativa habilitada e pronta para consultar Google Places.';
  }

  private buildHbxTechnicalMessage(runtime: HbxRuntimeDiagnostic) {
    if (runtime.status === 'online') {
      return `Motor HBX respondendo em ${runtime.healthUrl}.`;
    }
    return `${runtime.message} Verifique HBX_SCRAPING_ENGINE_URL ou o container hbx-scraping-engine.`;
  }

  private buildConfigurationUnavailableError() {
    return new ServiceUnavailableException({
      code: 'configuration_pending',
      message: 'Modulo temporariamente em configuracao.',
    });
  }

  private async loadBrazilianCities() {
    const now = Date.now();
    if (cityCache && now - cityCache.loadedAt < CITY_CACHE_TTL_MS) {
      return cityCache.items;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(IBGE_CITIES_URL, { signal: controller.signal });
    } catch {
      throw new ServiceUnavailableException({
        code: 'cities_unavailable',
        message: 'Nao foi possivel carregar a lista de cidades do IBGE.',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'cities_unavailable',
        message: 'Nao foi possivel carregar a lista de cidades do IBGE.',
      });
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new ServiceUnavailableException({
        code: 'cities_unavailable',
        message: 'Resposta inesperada ao carregar cidades do IBGE.',
      });
    }

    const items = payload
      .map((city: any) => {
        const name = String(city?.nome || '').trim();
        const uf = String(city?.microrregiao?.mesorregiao?.UF?.sigla || '').trim();
        return name && uf ? `${name} - ${uf}` : '';
      })
      .filter(Boolean)
      .sort((left: string, right: string) => left.localeCompare(right, 'pt-BR'));

    cityCache = {
      loadedAt: now,
      items,
    };

    return items;
  }

  private resolveCityState(cityInput: unknown, stateInput?: unknown) {
    const rawCity = String(cityInput || '').trim();
    const explicitState = String(stateInput || '').trim().toUpperCase();
    const cityWithUf = rawCity.match(/^(.*?)\s*[-,/]\s*([A-Za-z]{2})$/);

    if (cityWithUf) {
      return {
        city: cityWithUf[1].trim(),
        state: explicitState || cityWithUf[2].trim().toUpperCase(),
      };
    }

    return {
      city: rawCity,
      state: explicitState,
    };
  }

  private normalizeRadiusKm(value: unknown) {
    return this.getRadarSharedNormalizer().normalizeRadiusKm(value, RADAR_REGION_MAX_RADIUS_KM);
  }

  private normalizeCoordinate(value: unknown) {
    return this.getRadarSharedNormalizer().normalizeCoordinate(value);
  }

  private haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    return this.getRadarSearchGeo().haversineDistanceKm(lat1, lng1, lat2, lng2);
  }

  private findBrazilCityCoordinate(city: string, state: string) {
    return this.getRadarSearchGeo().findBrazilCityCoordinate(city, state);
  }

  private resolveSearchOrigin(input: {
    city: string;
    state: string;
    originLat?: number | null;
    originLng?: number | null;
  }) {
    return this.getRadarSearchGeo().resolveSearchOrigin(input, this.buildRadarSearchGeoHost());
  }

  private resolveRegionalCities(input: {
    city: string;
    state: string;
    radiusKm: number;
    originLat?: number | null;
    originLng?: number | null;
  }): RegionalCity[] {
    return this.getRadarSearchGeo().resolveRegionalCities(input, this.buildRadarSearchGeoHost());
  }

  private normalizeSearchInput(
    input: SearchContactsInput,
    options: NormalizeSearchInputOptions = {},
  ): NormalizedSearchInput {
    const engine = normalizeEngine(input.engine);
    const targetType = normalizeTargetType(input.targetType);
    const rawCity = String(input.city || '').trim();
    const parsedCityState = engine === 'hbx'
      ? this.resolveCityState(rawCity, input.state)
      : { city: rawCity, state: String(input.state || '').trim().toUpperCase() };
    const city = parsedCityState.city;
    const state = parsedCityState.state;
    const segment = String(input.segment || '').trim();
    const quantity = clampQuantity(input.quantity, maxQuantityFor(engine, targetType));
    const radiusKm = this.normalizeRadiusKm(input.radiusKm);
    const resolvedOrigin = this.resolveSearchOrigin({
      city,
      state,
      originLat: input.originLat,
      originLng: input.originLng,
    });
    const originLat = resolvedOrigin?.lat ?? null;
    const originLng = resolvedOrigin?.lng ?? null;
    const regionalCities = engine === 'hbx'
      ? this.resolveRegionalCities({ city, state, radiusKm, originLat, originLng })
      : [];

    if (!city) {
      if (!(engine === 'hbx' && targetType === 'pj')) {
        throw new BadRequestException('Cidade obrigatoria.');
      }
    }

    if (engine === 'hbx' && targetType !== 'pj' && !state && !options.allowMissingHbxState) {
      throw new BadRequestException('Estado obrigatorio para o motor HBX.');
    }

    if (!segment && !(engine === 'hbx' && targetType === 'agenda_pf')) {
      throw new BadRequestException('Segmento obrigatorio.');
    }

    const filters: WebscrapingSearchFilters = {
      minRating: this.normalizeMinRating(input.minRating),
      minReviews: this.normalizeMinReviews(input.minReviews),
      onlyWithWebsite: false,
      radiusKm,
    };
    const salesProfile = this.normalizeLeadQualitySalesProfileInput(input);
    const channelFilters = {
      ...this.buildChannelFiltersJson({
      preferredChannels: input.preferredChannels || salesProfile?.preferredChannels,
      requiredChannels: input.requiredChannels || salesProfile?.requiredChannels,
      channelMatchMode: input.channelMatchMode,
      }),
    };
    const freshness = this.normalizeFreshness(input.freshness);
    const filtersJson = JSON.stringify({
      ...filters,
      ...channelFilters,
      ...(salesProfile ? { salesProfile } : {}),
      engine,
      targetType,
      state,
      freshness,
      radiusKm,
      originLat,
      originLng,
      regionalCities: regionalCities.map((item) => ({
        city: item.city,
        state: item.state,
        distanceKm: item.distanceKm,
      })),
    });
    const excludePhoneDigits = Array.from(
      new Set(
        (Array.isArray(input.excludePhoneDigits) ? input.excludePhoneDigits : [])
          .map((phone) => normalizePhoneDigits(phone))
          .filter(Boolean) as string[],
      ),
    );
    const normalizedCity = normalizeLookupValue(city);
    const normalizedSegment = normalizeLookupValue(segment);

    return {
      city,
      state,
      segment,
      radiusKm,
      originLat,
      originLng,
      regionalCities,
      quantity,
      engine,
      targetType,
      filters,
      filtersJson,
      cacheSignature: [
        `engine:${engine}`,
        `targetType:${targetType}`,
        `city:${normalizedCity}`,
        `state:${normalizeLookupValue(state)}`,
        `segment:${normalizedSegment}`,
        `radiusKm:${radiusKm}`,
        `region:${regionalCities.map((item) => `${item.state}:${item.normalizedCity}`).join(',')}`,
        `filters:${filtersJson}`,
      ].join('|'),
      searchSignature: [
        `engine:${engine}`,
        `targetType:${targetType}`,
        `city:${normalizedCity}`,
        `state:${normalizeLookupValue(state)}`,
        `segment:${normalizedSegment}`,
        `radiusKm:${radiusKm}`,
        `region:${regionalCities.map((item) => `${item.state}:${item.normalizedCity}`).join(',')}`,
        ...(engine === 'hbx' ? [] : [`quantity:${quantity}`]),
        `filters:${filtersJson}`,
      ].join('|'),
      normalizedCity,
      normalizedSegment,
      excludePhoneDigits,
      salesProfile,
      preferredChannels: channelFilters.preferredChannels,
      requiredChannels: channelFilters.requiredChannels,
      channelMatchMode: channelFilters.channelMatchMode,
      freshness,
    };
  }

  private normalizeMinRating(value: unknown) {
    const numeric = toNumberOrNull(value);
    if (numeric == null) return null;
    return Math.min(Math.max(Number(numeric.toFixed(1)), 0), 5);
  }

  private normalizeMinReviews(value: unknown) {
    const numeric = toNumberOrNull(value);
    if (numeric == null) return null;
    return Math.max(0, Math.trunc(numeric));
  }

  private parseFiltersJson(raw: string | null | undefined): WebscrapingSearchFilters {
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        minRating: this.normalizeMinRating(parsed?.minRating),
        minReviews: this.normalizeMinReviews(parsed?.minReviews),
        onlyWithWebsite: false,
      };
    } catch {
      return {
        minRating: null,
        minReviews: null,
        onlyWithWebsite: false,
      };
    }
  }

  private parseSearchOptionsJson(raw: string | null | undefined, signature?: string | null) {
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      const parsedState = String(parsed?.state || '').trim().toUpperCase();
      const parsedEngine = parsed?.engine == null || parsed.engine === ''
        ? this.extractSignaturePart(signature, 'engine')
        : parsed.engine;
      const parsedTargetType = parsed?.targetType == null || parsed.targetType === ''
        ? this.extractSignaturePart(signature, 'targetType')
        : parsed.targetType;
      const channelFilters = this.buildChannelFiltersJson({
        preferredChannels: parsed?.preferredChannels,
        requiredChannels: parsed?.requiredChannels,
        channelMatchMode: parsed?.channelMatchMode,
      });
      const salesProfile = this.normalizeLeadQualitySalesProfileInput(parsed || {});
      return {
        filters: {
          minRating: this.normalizeMinRating(parsed?.minRating),
          minReviews: this.normalizeMinReviews(parsed?.minReviews),
          onlyWithWebsite: false,
        },
        engine: normalizeEngine(parsedEngine),
        targetType: normalizeTargetType(parsedTargetType),
        state: parsedState || this.extractSignaturePart(signature, 'state').toUpperCase(),
        preferredChannels: channelFilters.preferredChannels,
        requiredChannels: channelFilters.requiredChannels,
        channelMatchMode: channelFilters.channelMatchMode,
        freshness: this.normalizeFreshness(parsed?.freshness),
        salesProfile,
      };
    } catch {
      return {
        filters: {
          minRating: null,
          minReviews: null,
          onlyWithWebsite: false,
        },
        engine: 'google' as WebscrapingEngine,
        targetType: 'pj' as HbxTargetType,
        state: this.extractSignaturePart(signature, 'state').toUpperCase(),
        preferredChannels: [] as RadarChannelFilter[],
        requiredChannels: [] as RadarChannelFilter[],
        channelMatchMode: 'prefer' as RadarChannelMatchMode,
        freshness: 'hybrid' as const,
        salesProfile: null,
      };
    }
  }

  private buildHistoryDedupeKey(input: {
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    filtersJson?: string | null;
    searchSignature?: string | null;
    filters?: WebscrapingSearchFilters | null;
  }) {
    const parsed = this.parseSearchOptionsJson(input.filtersJson, input.searchSignature);
    const filters = input.filters || parsed.filters;
    const state = String(input.state || parsed.state || '').trim().toUpperCase();
    return [
      `engine:${parsed.engine}`,
      `targetType:${parsed.targetType}`,
      `city:${normalizeLookupValue(String(input.city || ''))}`,
      `state:${normalizeLookupValue(state)}`,
      `segment:${normalizeLookupValue(String(input.segment || ''))}`,
      `filters:${JSON.stringify(filters)}`,
    ].join('|');
  }

  private extractSignaturePart(signature: string | null | undefined, key: string) {
    const prefix = `${key}:`;
    const part = String(signature || '')
      .split('|')
      .find((item) => item.startsWith(prefix));
    return part ? part.slice(prefix.length).trim() : '';
  }

  private normalizeRadarChannel(value: unknown): RadarChannelFilter | null {
    return this.getRadarSharedNormalizer().normalizeRadarChannel(value);
  }

  private normalizeRadarChannels(value: unknown): RadarChannelFilter[] {
    return this.getRadarSharedNormalizer().normalizeRadarChannels(value);
  }

  private normalizeChannelMatchMode(value: unknown): RadarChannelMatchMode {
    return this.getRadarSharedNormalizer().normalizeChannelMatchMode(value);
  }

  private normalizeFreshness(value: unknown): 'live' | 'database_first' | 'hybrid' {
    return this.getRadarSharedNormalizer().normalizeFreshness(value);
  }

  private buildChannelFiltersJson(input: {
    preferredChannels?: string[];
    requiredChannels?: string[];
    channelMatchMode?: string | null;
  }): {
    preferredChannels: RadarChannelFilter[];
    requiredChannels: RadarChannelFilter[];
    channelMatchMode: RadarChannelMatchMode;
  } {
    const preferredChannels = this.normalizeRadarChannels(input?.preferredChannels || []);
    const requiredChannels = this.normalizeRadarChannels(input?.requiredChannels || []);
    const channelMatchMode = requiredChannels.length
      ? this.normalizeChannelMatchMode(input?.channelMatchMode)
      : 'prefer';
    return {
      preferredChannels,
      requiredChannels,
      channelMatchMode,
    };
  }

  private sanitizeLeadProfileText(value: unknown, maxLength = 160) {
    const normalized = String(value || '').trim();
    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private normalizeLeadProfileLabels(value: unknown, limit = 30, maxLength = 80): string[] {
    const raw = Array.isArray(value)
      ? value
      : value && typeof value === 'object' && Array.isArray((value as any).labels)
        ? (value as any).labels
        : [];
    return Array.from(new Set<string>(
      raw
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => item.slice(0, maxLength)),
    )).slice(0, limit);
  }

  private normalizeLeadProfileObject(value: unknown): Record<string, any> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const output: Record<string, any> = {};
    for (const [key, raw] of Object.entries(value as Record<string, any>).slice(0, 40)) {
      const cleanKey = String(key || '').trim().slice(0, 80);
      if (!cleanKey) continue;
      if (typeof raw === 'boolean') output[cleanKey] = raw;
      else if (typeof raw === 'number' && Number.isFinite(raw)) output[cleanKey] = raw;
      else if (typeof raw === 'string') output[cleanKey] = raw.trim().slice(0, 120);
    }
    return Object.keys(output).length ? output : undefined;
  }

  private normalizeLeadQualitySalesProfileInput(input: Partial<SearchContactsInput | RadarFiltersInput> | null | undefined): LeadQualityV2SalesProfile | null {
    if (!input) return null;
    const nested = input.salesProfile && typeof input.salesProfile === 'object' && !Array.isArray(input.salesProfile)
      ? input.salesProfile as Partial<LeadQualityV2SalesProfile>
      : {};
    const whatDoYouSell = this.sanitizeLeadProfileText((input as any).whatDoYouSell ?? nested.whatDoYouSell, 160);
    const offerCategory = this.sanitizeLeadProfileText((input as any).offerCategory ?? nested.offerCategory, 120);
    const targetAudience = this.normalizeLeadProfileLabels((input as any).targetAudience ?? nested.targetAudience);
    const targetSegments = this.normalizeLeadProfileLabels((input as any).targetSegments ?? nested.targetSegments);
    const avoidSegmentsInput = (input as any).avoidSegments ?? nested.avoidSegments;
    const avoidSegments = this.normalizeLeadProfileLabels(avoidSegmentsInput);
    const hardRejectSegments = this.normalizeLeadProfileLabels(
      avoidSegmentsInput && typeof avoidSegmentsInput === 'object' && !Array.isArray(avoidSegmentsInput)
        ? (avoidSegmentsInput as any).hardReject
        : (input as any).hardRejectSegments ?? nested.hardRejectSegments,
    );
    const leadPreferences = this.normalizeLeadProfileObject((input as any).leadPreferences ?? nested.leadPreferences);
    const negativeRules = this.normalizeLeadProfileObject((input as any).negativeRules ?? nested.negativeRules);
    const profile: LeadQualityV2SalesProfile = {
      ...(whatDoYouSell ? { whatDoYouSell } : {}),
      ...(offerCategory ? { offerCategory } : {}),
      ...(targetAudience.length ? { targetAudience } : {}),
      ...(targetSegments.length ? { targetSegments } : {}),
      ...(avoidSegments.length ? { avoidSegments } : {}),
      ...(hardRejectSegments.length ? { hardRejectSegments } : {}),
      ...(leadPreferences ? { leadPreferences } : {}),
      ...(negativeRules ? { negativeRules } : {}),
    };
    return Object.keys(profile).length ? profile : null;
  }

  private buildLeadQualitySalesProfileFromFilters(input: Partial<NormalizedRadarFilters | NormalizedSearchInput>): LeadQualityV2SalesProfile | null {
    const segment = String((input as any)?.segment || '').trim();
    const city = String((input as any)?.city || '').trim();
    const state = String((input as any)?.state || '').trim().toUpperCase();
    const explicitProfile = this.normalizeLeadQualitySalesProfileInput((input as any)?.salesProfile || input as any);
    const channelFilters = this.buildChannelFiltersJson({
      preferredChannels: (input as any)?.preferredChannels || explicitProfile?.preferredChannels,
      requiredChannels: (input as any)?.requiredChannels || explicitProfile?.requiredChannels,
      channelMatchMode: (input as any)?.channelMatchMode,
    });
    const requestedTargetSegments = segment ? this.splitHbxBatchSegments(segment) : [];
    return {
      ...(explicitProfile || {}),
      ...channelFilters,
      targetSegments: Array.from(new Set([...(explicitProfile?.targetSegments || []), ...requestedTargetSegments])),
      preferredCities: (input as any)?.regionalCities?.length
        ? (input as any).regionalCities.map((item: RegionalCity) => item.city).slice(0, 10)
        : city ? [city] : [],
      preferredStates: state ? [state] : [],
    };
  }

  private buildSearchResponse(
    input: NormalizedSearchInput,
    results: WebscrapingContactResult[],
    meta: {
      historyId: string | null;
      source: SearchSource;
      sourceEngines?: string[];
      reusedCount: number;
      fetchedCount: number;
      totalStoredCount?: number;
      status?: SearchRunStatus;
      message?: string | null;
      technicalCacheUsed: boolean;
      technicalCacheReusedCount: number;
      technicalCacheValidUntil: string | null;
      urlsDiscovered?: number;
      pagesFetched?: number;
      parsedContacts?: number;
      queriesGenerated?: string[];
      sourceMetrics?: Array<Record<string, any>>;
      sourceDiagnostics?: Array<Record<string, any>>;
      missingRequiredChannel?: number;
      approved?: number;
      skipped?: number;
      duplicate?: number;
    },
  ): WebscrapingSearchResponse {
    const orchestration = this.getRadarSearchOrchestrator().plan(input);
    const publicResults = this.buildDeliverableResultEntries(input, results)
      .map(({ result, quality, qualityV2 }) => {
        const { placeId: _placeId, ...publicResult } = result;
        const opportunityScore = this.buildOpportunityScore(result, quality);
        const classified = this.attachDeliveryClassification({
          ...buildRadarStageSnapshot({
            ...publicResult,
            leadStatus: 'qualified',
            deliveryStatus: 'deliverable',
            enrichmentStatus: publicResult.enrichmentStatus || 'partial',
          }),
          ...publicResult,
          quality,
          qualityV2,
          score: publicResult.score == null ? opportunityScore : publicResult.score,
          opportunityScore,
          opportunityReason: publicResult.opportunityReason || this.buildOpportunityReason(result, input),
        }, input, quality, qualityV2);
        return this.stripListPremiumFields(classified, input);
      });
    return {
      query: {
        city: input.city,
        state: input.state || null,
        segment: input.segment,
        quantity: input.quantity,
        engine: input.engine,
        targetType: input.targetType,
        filters: input.filters,
      },
      meta: {
        searchStrategy: {
          mode: ({
            fast: 'rapido',
            quality: 'qualidade',
            deep: 'profundo',
            night_factory: 'fabrica_noturna',
          } as any)[orchestration.strategy.mode] || orchestration.strategy.mode,
          reason: orchestration.strategy.reason,
          targetCards: orchestration.strategy.targetCards,
          maxProviderRounds: orchestration.strategy.maxProviderRounds,
        },
        sourcePlan: orchestration.sources.map((source: any) => ({
          source: source.source,
          enabled: source.enabled,
          implemented: source.implemented,
          stopWhenEnough: source.stopWhenEnough,
        })),
        activeSources: orchestration.activeSources,
        pendingSources: orchestration.pendingSources,
        sourceExpansion: orchestration.expansion,
        ...meta,
        requestedCount: input.quantity,
        candidateCount: results.length,
        deliveredCount: publicResults.length,
        filteredOutCount: Math.max(0, results.length - publicResults.length),
        sourceEngines: meta.sourceEngines || this.buildResponseSourceEngines(meta.source, results),
        requiredChannels: input.requiredChannels,
        channelMatchMode: input.channelMatchMode,
      },
      results: publicResults,
    };
  }

  private buildResponseSourceEngines(source: SearchSource, results: WebscrapingContactResult[]) {
    const values = new Set<string>();
    if (source === 'hbx') values.add('hbx');
    if (source === 'google') values.add('google');
    if (source === 'global_cache') values.add('global_cache');
    if (source === 'radar_database' || source === 'history') values.add(source);
    for (const result of results) {
      for (const value of [result.sourceEngine, result.source, ...(Array.isArray((result as any).sourceEngines) ? (result as any).sourceEngines : [])]) {
        const normalized = normalizeLookupValue(String(value || ''));
        if (normalized.includes('google')) values.add('google');
        else if (normalized.includes('hbx')) values.add('hbx');
        else if (normalized) values.add(normalized);
      }
    }
    if (source === 'hybrid' && !values.size) values.add('hbx');
    return Array.from(values);
  }

  private restoreStoredResults(history: SearchHistoryRow | null): WebscrapingContactResult[] {
    if (!history?.places?.length) return [];
    return history.places.map((place) => ({
      placeId: place.placeId,
      name: place.name,
      phone: place.phone,
      phoneDigits: place.phoneDigits,
      rating: place.rating == null ? null : Number(place.rating),
      reviews: Math.max(0, Math.trunc(place.reviews || 0)),
      address: place.address || null,
      website: place.website || null,
      source: place.source || null,
      score: toNumberOrNull(place.score),
      opportunityScore: toNumberOrNull(place.score),
      opportunityReason: place.opportunityReason || null,
    }));
  }

  private restoreGlobalCacheResults(entry: GlobalCacheRow | null): WebscrapingContactResult[] {
    if (!entry?.places?.length) return [];
    return entry.places.map((place) => ({
      placeId: place.placeId,
      name: place.name,
      phone: place.phone,
      phoneDigits: place.phoneDigits,
      rating: place.rating == null ? null : Number(place.rating),
      reviews: Math.max(0, Math.trunc(place.reviews || 0)),
      address: place.address || null,
      website: place.website || null,
    }));
  }

  private matchesFilters(result: WebscrapingContactResult, filters: WebscrapingSearchFilters) {
    if (filters.minRating != null && (result.rating == null || result.rating < filters.minRating)) {
      return false;
    }
    if (filters.minReviews != null && (result.reviews || 0) < filters.minReviews) {
      return false;
    }
    return true;
  }

  private buildOpportunityScore(result: WebscrapingContactResult, quality?: LeadQualityResult | null) {
    return this.getRadarScoreEnrichment().buildOpportunityScore(
      result,
      quality,
      this.buildRadarScoreEnrichmentHost(),
    );
  }

  private buildOpportunityReason(result: WebscrapingContactResult, input: NormalizedSearchInput) {
    return this.getRadarScoreEnrichment().buildOpportunityReason(
      result,
      input,
      this.buildRadarScoreEnrichmentHost(),
    );
  }

  private buildContactDedupeKeys(result: WebscrapingContactResult) {
    return this.getRadarDuplicateFilter().buildContactDedupeKeys(result);
  }

  private contactMatchesSeenKeys(result: WebscrapingContactResult, seenKeys: Set<string>) {
    return this.getRadarDuplicateFilter().contactMatchesSeenKeys(result, seenKeys);
  }

  private shouldKeepNewContact(
    candidate: WebscrapingContactResult,
    existing: WebscrapingContactResult[],
    seenPhones: Set<string>,
  ) {
    if (candidate.phoneDigits && seenPhones.has(candidate.phoneDigits)) return false;
    if (looksLikeNonBusinessName(candidate.name, {
      hasCompanyAnchor: Boolean((candidate as any).cnpj),
    })) return false;
    if (!this.hasUsablePublicContactChannel(candidate as any)) return false;
    const seenKeys = new Set<string>();
    for (const item of existing) {
      for (const key of this.buildContactDedupeKeys(item)) seenKeys.add(key);
    }
    return !this.contactMatchesSeenKeys(candidate, seenKeys);
  }

  private async filterProtectedRadarContacts(context: SearchExecutionContext, results: WebscrapingContactResult[]) {
    if (!results.length || !(await this.supportsRadarPersistence().catch(() => false))) return results;
    const delegate = (this.prisma as any).radarLeadPool;
    const kept: WebscrapingContactResult[] = [];
    for (const result of results) {
      const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
      const phoneAlternates = Array.from(new Set([
        phoneDigits,
        phoneDigits?.startsWith('55') ? phoneDigits.slice(2) : phoneDigits ? `55${phoneDigits}` : '',
      ].filter(Boolean) as string[]));
      const or: any[] = [
        ...(result.placeId ? [{ placeId: result.placeId }] : []),
        ...phoneAlternates.map((phone) => ({ phoneDigits: phone })),
        ...(result.instagramUrl ? [{ instagramUrl: String(result.instagramUrl).trim() }] : []),
        ...(result.facebookUrl ? [{ facebookUrl: String(result.facebookUrl).trim() }] : []),
        ...(result.website ? [{ website: String(result.website).trim() }] : []),
      ];
      if (!or.length) {
        kept.push(result);
        continue;
      }
      const row = await delegate.findFirst({
        where: { OR: or },
        include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
      }).catch(() => null);
      const companyState = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
      if (row && this.isRadarProtectedStatus(companyState?.status || row.status)) continue;
      kept.push(result);
    }
    return kept;
  }

  private mergeDedupedContacts(results: WebscrapingContactResult[]) {
    return this.getRadarDuplicateFilter().mergeDedupedContacts(results);
  }

  private sortContacts(results: WebscrapingContactResult[]) {
    return this.getRadarDuplicateFilter().sortContacts(results, this.buildRadarDuplicateSortHost());
  }

  private buildCandidateSteps(quantity: number) {
    return Array.from(
      new Set([
        Math.min(Math.max(quantity * 2, quantity + 2), MAX_QUANTITY),
        Math.min(Math.max(quantity * 3, quantity + 4), MAX_QUANTITY),
        MAX_QUANTITY,
      ]),
    ).sort((left, right) => left - right);
  }

  private async supportsHistoryPersistence() {
    const [historyTable, placeTable] = await Promise.all([
      this.prisma.hasTable('WebscrapingSearchHistory'),
      this.prisma.hasTable('WebscrapingSearchPlace'),
    ]);
    return historyTable && placeTable;
  }

  private async supportsGlobalCachePersistence() {
    const [cacheTable, placeTable] = await Promise.all([
      this.prisma.hasTable('WebscrapingGlobalCacheEntry'),
      this.prisma.hasTable('WebscrapingGlobalCachePlace'),
    ]);
    return cacheTable && placeTable;
  }

  private async supportsRadarPersistence() {
    if (!(this.prisma as any).radarLeadPool || !(this.prisma as any).radarLeadCompanyState) {
      return false;
    }
    const [poolTable, stateTable, statusColumn] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool'),
      this.prisma.hasTable('RadarLeadCompanyState'),
      this.prisma.hasColumn('RadarLeadPool', 'status'),
    ]);
    return poolTable && stateTable && statusColumn;
  }

  private radarExclusiveOwnershipEnabled() {
    // MODELO DO DONO (refinado 14/06/2026): a lagoa é compartilhada NO TEMPO, NÃO
    // simultaneamente. Enquanto a empresa A segura o lead ele NÃO aparece pra B
    // (posse exclusiva via ownerCompanyId). Quando A solta — recusa LEVE ("sem
    // interesse"), 72h sem ação, ou descarte — o lead VOLTA pra lagoa e a B pode
    // pegar (o cara recusou refrigerante, mas pode topar a cerveja). Quem negativou
    // NUNCA mais vê (bloqueio por empresa via RadarLeadCompanyState). Só recusa DURA
    // ("número não existe / não atende") mata pra todos. Ligado por padrão; desligar
    // só com RADAR_EXCLUSIVE_OWNERSHIP=false (debug do modelo simultâneo).
    return String(process.env.RADAR_EXCLUSIVE_OWNERSHIP ?? 'true').trim().toLowerCase() !== 'false';
  }

  private async supportsRadarOwnershipPersistence() {
    if (!this.radarExclusiveOwnershipEnabled()) return false;
    if (!(await this.supportsRadarPersistence())) return false;
    const [ownerColumn, claimedColumn] = await Promise.all([
      this.prisma.hasColumn('RadarLeadPool', 'ownerCompanyId'),
      this.prisma.hasColumn('RadarLeadPool', 'claimedAt'),
    ]);
    return ownerColumn && claimedColumn;
  }

  private async supportsRadarCampaignPersistence() {
    if (!(this.prisma as any).webscrapingCampaign || !(this.prisma as any).webscrapingCampaignBatch) {
      return false;
    }
    const [campaignTable, batchTable, eventTable] = await Promise.all([
      this.prisma.hasTable('WebscrapingCampaign'),
      this.prisma.hasTable('WebscrapingCampaignBatch'),
      this.prisma.hasTable('RadarLeadEvent'),
    ]);
    return campaignTable && batchTable && eventTable;
  }

  private async supportsMassDataCampaignPersistence() {
    return this.supportsRadarCampaignPersistence()
      .then(async (base) => base && Boolean((this.prisma as any).webscrapingCampaignTask) && await this.prisma.hasTable('WebscrapingCampaignTask'))
      .catch(() => false);
  }

  private normalizeRadarLeadStatus(value: unknown): RadarLeadStatus {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'imported_to_vendas' || normalized === 'sent_to_vendas') return 'sent_to_vendas';
    if (normalized === 'reservado' || normalized === 'reserved') return 'reserved';
    if (normalized === 'em_atendimento' || normalized === 'atendimento') return 'in_attendance';
    if (normalized === 'interessado' || normalized === 'interested') return 'interested';
    if (normalized === 'positivo' || normalized === 'positive') return 'positive';
    if (normalized === 'disponivel' || normalized === 'disponível' || normalized === 'available') return 'clean';
    if (normalized === 'won') return 'converted';
    if (normalized === 'optout' || normalized === 'do_not_contact') return 'opt_out';
    if (normalized === 'lost' || normalized === 'sem_interesse') return 'negative';
    if (normalized === 'descartado') return 'discarded';
    if (['clean', 'new', 'reserved', 'delivered', 'approved', 'in_attendance', 'interested', 'positive', 'converted', 'denied', 'negative', 'blocked', 'opt_out', 'discarded', 'complaint', 'no_answer', 'voicemail', 'no_whatsapp', 'invalid_whatsapp', 'duplicate', 'rejected', 'hidden'].includes(normalized)) {
      return normalized as RadarLeadStatus;
    }
    return 'clean';
  }

  private isRadarProtectedStatus(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    const status = this.normalizeRadarLeadStatus(normalized);
    return (RADAR_PROTECTED_STATUSES as readonly string[]).includes(normalized) ||
      (RADAR_PROTECTED_STATUSES as readonly string[]).includes(status);
  }

  private resolveRadarLeadStatus(row: any): RadarLeadStatus {
    const companyState = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    if (companyState?.status) return this.normalizeRadarLeadStatus(companyState.status);
    // Sem estado DESTA empresa: status de WORKFLOW (atendimento/enviado) é por-empresa
    // e pode ter sido deixado por OUTRA empresa — não vaza o rótulo cross-empresa.
    // Mostra neutro (a regra de disponibilidade já usa companyStates, não o rótulo).
    const globalStatus = this.normalizeRadarLeadStatus(row?.status || 'clean');
    if (['sent_to_vendas', 'in_attendance', 'imported_to_vendas'].includes(globalStatus)) return 'clean';
    return globalStatus;
  }

  private resolveRadarLeadTargetType(row: any): HbxTargetType {
    const metadataJson = String(row?.metadataJson || '').trim();
    if (metadataJson) {
      try {
        const parsed = JSON.parse(metadataJson);
        const targetType = normalizeTargetType(parsed?.targetType);
        if (targetType === 'pf' || targetType === 'agenda_pf') return targetType;
        if (String(parsed?.targetType || '').trim()) return 'pj';
      } catch {
        // Metadata is optional and historically best-effort.
      }
    }
    const placeId = String(row?.placeId || '').trim().toLowerCase();
    if (placeId.startsWith('hbx:agenda_pf:')) return 'agenda_pf';
    if (placeId.startsWith('hbx:pf:')) return 'pf';
    return 'pj';
  }

  private extractDdd(value: string | null | undefined) {
    const digits = normalizePhoneDigits(value);
    return digits.length >= 10 ? digits.slice(0, 2) : '';
  }

  private extractExpectedDddsFromSegment(segment: string) {
    const matches = String(segment || '').match(/\bDDD\s*(\d{2})\b/gi) || [];
    return Array.from(new Set(matches.map((match) => match.replace(/\D/g, '').slice(0, 2)).filter(Boolean)));
  }

  private buildExpectedDdds(input: { segment?: string | null; city?: string | null; state?: string | null }) {
    const explicit = this.extractExpectedDddsFromSegment(String(input.segment || ''));
    if (explicit.length) return explicit;
    const cityKey = normalizeLookupValue(String(input.city || ''));
    const state = String(input.state || '').trim().toUpperCase();
    const known: Record<string, string> = {
      americana: '19',
      'americo brasiliense': '16',
      araraquara: '16',
      araras: '19',
      campinas: '19',
      conchal: '19',
      cordeiropolis: '19',
      ibate: '16',
      limeira: '19',
      matao: '16',
      piracicaba: '19',
      'porto ferreira': '19',
      'rio claro': '19',
      'ribeirao preto': '16',
      'santa gertrudes': '19',
      'sao carlos': '16',
      'sao paulo': '11',
    };
    const ddd = known[cityKey] || known[cityKey.replace(/\s+-\s+[a-z]{2}$/i, '')] || '';
    if (ddd) return [ddd];
    if (state === 'SP') return [];
    return [];
  }

  private normalizeRadarFilters(input: RadarFiltersInput = {}): NormalizedRadarFilters {
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim().toUpperCase();
    const segment = String(input.segment || '').trim();
    const radiusKm = this.normalizeRadiusKm(input.radiusKm);
    const resolvedOrigin = this.resolveSearchOrigin({
      city,
      state,
      originLat: input.originLat,
      originLng: input.originLng,
    });
    const originLat = resolvedOrigin?.lat ?? null;
    const originLng = resolvedOrigin?.lng ?? null;
    const regionalCities = this.resolveRegionalCities({ city, state, radiusKm, originLat, originLng });
    const highOpportunity = coerceBoolean(input.highOpportunity);
    const rawOpportunityLevel = String(input.opportunityLevel || '').trim().toLowerCase();
    const opportunityLevel: RadarOpportunityLevel =
      highOpportunity || rawOpportunityLevel === 'high' || rawOpportunityLevel === 'alta'
        ? 'high'
        : rawOpportunityLevel === 'medium' || rawOpportunityLevel === 'media' || rawOpportunityLevel === 'média'
          ? 'medium'
          : rawOpportunityLevel === 'low' || rawOpportunityLevel === 'baixa'
          ? 'low'
            : null;
    const channelFilters = this.buildChannelFiltersJson({
      preferredChannels: input.preferredChannels || undefined,
      requiredChannels: input.requiredChannels || undefined,
      channelMatchMode: input.channelMatchMode,
    });
    const preferredChannels = channelFilters.preferredChannels;
    const requiredChannels = channelFilters.requiredChannels;
    const channelMatchMode = channelFilters.channelMatchMode;
    const freshness = this.normalizeFreshness(input.freshness);
    const salesProfile = this.normalizeLeadQualitySalesProfileInput(input);

    return {
      city,
      state,
      segment,
      radiusKm,
      originLat,
      originLng,
      regionalCities,
      normalizedCity: normalizeLookupValue(city),
      normalizedSegment: normalizeLookupValue(segment),
      quantity: Math.min(Math.max(Math.trunc(Number(input.quantity || 20) || 20), 1), 100),
      limit: Math.min(Math.max(Math.trunc(Number(input.limit || input.quantity || 50) || 50), 1), 300),
      page: Math.min(Math.max(Math.trunc(Number(input.page || 1) || 1), 1), 1000),
      filterKey: String(input.filterKey || '').trim(),
      status: String(input.status || '').trim().toLowerCase(),
      ddd: String(input.ddd || '').replace(/\D/g, '').slice(0, 2),
      scoreRange: String(input.scoreRange || '').trim().toLowerCase(),
      source: String(input.source || '').trim(),
      minRating: this.normalizeMinRating(input.minRating),
      minReviews: this.normalizeMinReviews(input.minReviews),
      noWebsite: coerceBoolean(input.noWebsite),
      withWebsite: coerceBoolean(input.withWebsite),
      weakWebsite: coerceBoolean(input.weakWebsite),
      validPhone: coerceBoolean(input.validPhone),
      likelyWhatsapp: coerceBoolean(input.likelyWhatsapp),
      opportunityLevel,
      includeHidden: coerceBoolean(input.includeHidden),
      engine: normalizeEngine(input.engine),
      targetType: normalizeTargetType(input.targetType),
      desiredStock: Math.min(Math.max(Math.trunc(Number(input.desiredStock || 300) || 300), 1), 1000),
      minimumStock: Math.min(Math.max(Math.trunc(Number(input.minimumStock || 80) || 80), 1), 500),
      stockOverride: input.desiredStock != null || input.minimumStock != null,
      whatsappCheckMode: this.normalizeRadarWhatsappCheckMode(input.whatsappCheckMode),
      preferredChannels,
      requiredChannels,
      channelMatchMode,
      freshness,
      salesProfile,
    };
  }

  private normalizeRadarWhatsappCheckMode(value: unknown): RadarWhatsappCheckMode {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'enrich' || normalized === 'only_valid') return normalized;
    // Default configuravel: liga a verificacao de existencia nos runs SEM mode explicito
    // (a fabrica nao manda mode -> cai aqui). 'enrich' anota whatsappStatus sem derrubar;
    // 'only_valid' filtra os nao-confirmados. Inocuo enquanto o chip do motor nao conectar.
    const envDefault = String(process.env.HBX_RADAR_WHATSAPP_CHECK_MODE || '').trim().toLowerCase();
    if (envDefault === 'enrich' || envDefault === 'only_valid') return envDefault as RadarWhatsappCheckMode;
    return 'off';
  }

  private buildStoredResultSource(radarResults: WebscrapingContactResult[], companyStoredResults: WebscrapingContactResult[]): SearchSource {
    if (radarResults.length > 0 && companyStoredResults.length > 0) return 'hybrid';
    if (radarResults.length > 0) return 'radar_database';
    return 'history';
  }

  private buildRadarOpportunityWhere(level: RadarOpportunityLevel) {
    if (level === 'high') return { gte: 70 };
    if (level === 'medium') return { gte: 45, lt: 70 };
    if (level === 'low') return { lt: 45 };
    return null;
  }

  private buildRadarWhere(
    filters: NormalizedRadarFilters,
    companyId?: number | null,
    options: {
      excludePhoneDigits?: string[];
      requirePhone?: boolean;
      includeHidden?: boolean;
      ownershipEnabled?: boolean;
      availableOnly?: boolean;
    } = {},
  ) {
    const where: any = {};
    const and: any[] = [];

    if (filters.regionalCities.length > 1) {
      and.push({
        OR: filters.regionalCities.map((item) => ({
          normalizedCity: item.normalizedCity,
          state: item.state,
        })),
      });
    } else {
      if (filters.normalizedCity) where.normalizedCity = filters.normalizedCity;
      if (filters.state) where.state = filters.state;
    }
    const normalizedSegments = this.splitHbxBatchSegments(filters.segment)
      .map((segment) => normalizeLookupValue(segment))
      .filter(Boolean);
    if (normalizedSegments.length > 1) where.normalizedSegment = { in: normalizedSegments };
    else if (filters.normalizedSegment) where.normalizedSegment = filters.normalizedSegment;
    if (filters.minRating != null) where.rating = { gte: filters.minRating };
    if (filters.minReviews != null) where.reviews = { gte: filters.minReviews };
    if (filters.ddd) where.ddd = filters.ddd;
    if (filters.status) where.status = filters.status;
    if (filters.source) {
      and.push({
        OR: [
          { source: { contains: filters.source, mode: 'insensitive' } },
          { sourceEngine: { contains: filters.source, mode: 'insensitive' } },
          { sourceEngines: { contains: filters.source } },
        ],
      });
    }
    const minimumScore = Math.max(0, Math.min(100, Math.trunc(Number(filters.scoreRange || 0) || 0)));
    if (minimumScore > 0) where.opportunityScore = { gte: minimumScore };
    else if (filters.scoreRange === 'high') where.opportunityScore = { gte: 70 };
    else if (filters.scoreRange === 'medium') where.opportunityScore = { gte: 45, lt: 70 };
    else if (filters.scoreRange === 'low') where.opportunityScore = { lt: 45 };

    if (filters.targetType === 'pf' || filters.targetType === 'agenda_pf') {
      and.push({
        OR: [
          { metadataJson: { contains: `"targetType":"${filters.targetType}"` } },
          { placeId: { startsWith: `hbx:${filters.targetType}:` } },
        ],
      });
    }

    if (filters.noWebsite) {
      where.websiteStatus = 'none';
    } else if (filters.weakWebsite) {
      where.websiteStatus = { in: ['weak', 'social_only'] };
    } else if (filters.withWebsite) {
      where.websiteStatus = { not: 'none' };
    }

    const opportunityWhere = this.buildRadarOpportunityWhere(filters.opportunityLevel);
    if (opportunityWhere) where.opportunityScore = opportunityWhere;

    if ((filters.validPhone || options.requirePhone) && !this.canDeliverRequiredSocialWithoutPhone(filters)) {
      and.push({ phoneDigits: { not: null } });
    }

    if (companyId && options.ownershipEnabled) {
      if (options.availableOnly) {
        and.push({ ownerCompanyId: null });
      } else {
        and.push({
          OR: [
            { ownerCompanyId: null },
            { ownerCompanyId: companyId },
          ],
        });
      }
    }

    // LIMPEZA-DESTRUTIVA L3: assignedUserId morreu como filtro de visibilidade/posse aqui —
    // nenhum caller mais passa esse recorte; a lagoa é da empresa, igual pra todo papel.

    const excludePhoneDigits = Array.from(new Set((options.excludePhoneDigits || []).map((phone) => normalizePhoneDigits(phone)).filter(Boolean)));
    if (excludePhoneDigits.length) {
      and.push({
        OR: [
          { phoneDigits: null },
          { phoneDigits: { notIn: excludePhoneDigits } },
        ],
      });
    }

    const protectedStatusRequested = this.isRadarProtectedStatus(filters.status) || this.isRadarProtectedStatus(filters.filterKey);
    if (companyId && !(options.includeHidden || filters.includeHidden || protectedStatusRequested)) {
      and.push({
        companyStates: {
          none: {
            companyId,
            status: { in: [...RADAR_PROTECTED_STATUSES, 'imported_to_vendas', 'sent_to_vendas'] as any },
          },
        },
      });
      and.push({
        status: { notIn: [...RADAR_PROTECTED_STATUSES, 'rejected', 'duplicate'] as any },
      });
    }

    if (and.length) where.AND = and;
    return where;
  }

  private filterRadarRowsInMemory(rows: any[], filters: NormalizedRadarFilters) {
    return rows.filter((row) => {
      if (this.resolveRadarLeadTargetType(row) !== filters.targetType) return false;
      if (filters.likelyWhatsapp && !isLikelyWhatsapp(row?.phoneDigits || row?.phone)) return false;
      if (filters.validPhone && !isLikelyValidBrPhone(row?.phoneDigits || row?.phone)) return false;
      if (!this.matchesRadarChannelFilters(row, filters)) return false;
      const status = this.resolveRadarLeadStatus(row);
      const ddd = String(row?.ddd || this.extractDdd(row?.phoneDigits || row?.phone));
      const expectedDdds = parseJsonArray(row?.expectedDddsJson);
      const score = safeInteger(row?.opportunityScore);
      const websiteStatus = String(row?.websiteStatus || inferWebsiteStatus(row?.website));
      const filterKey = filters.filterKey;
      if (filters.status && status !== this.normalizeRadarLeadStatus(filters.status)) return false;
      if (filterKey === 'new' || filterKey === 'clean') return status === 'clean' || status === 'new';
      if (filterKey === 'delivered') return status === 'delivered';
      if (filterKey === 'approved') return status === 'approved';
      if (filterKey === 'sent_to_vendas') return status === 'sent_to_vendas';
      if (filterKey === 'in_attendance') return status === 'in_attendance';
      if (filterKey === 'converted') return status === 'converted';
      if (filterKey === 'denied') return status === 'denied' || status === 'negative';
      if (filterKey === 'negative') return status === 'negative' || status === 'denied';
      if (filterKey === 'blocked') return status === 'blocked';
      if (filterKey === 'opt_out') return status === 'opt_out';
      if (filterKey === 'discarded') return status === 'discarded' || status === 'hidden';
      if (filterKey === 'complaint') return status === 'complaint';
      if (filterKey === 'no_answer') return status === 'no_answer';
      if (filterKey === 'no_whatsapp') return status === 'no_whatsapp' || status === 'invalid_whatsapp';
      if (filterKey === 'without_whatsapp') return !isLikelyWhatsapp(row?.phoneDigits || row?.phone);
      if (filterKey === 'likely_whatsapp') return isLikelyWhatsapp(row?.phoneDigits || row?.phone);
      if (filterKey === 'ddd_local') return expectedDdds.length > 0 && expectedDdds.includes(ddd);
      if (filterKey === 'ddd_mismatch') return status === 'rejected' && String(row?.rejectionReason || '') === 'ddd_mismatch';
      if (filterKey === 'score_high') return score >= 70;
      if (filterKey === 'score_medium') return score >= 45 && score < 70;
      if (filterKey === 'score_low') return score < 45;
      if (filterKey === 'no_website') return websiteStatus === 'none';
      if (filterKey === 'weak_website') return websiteStatus === 'weak' || websiteStatus === 'social_only';
      if (filterKey === 'with_website') return websiteStatus !== 'none';
      if (filterKey.startsWith('city:')) return normalizeLookupValue(String(row?.city || '')) === normalizeLookupValue(filterKey.slice(5));
      if (filterKey.startsWith('state:')) return String(row?.state || '').toUpperCase() === filterKey.slice(6).toUpperCase();
      if (filterKey.startsWith('segment:')) return normalizeLookupValue(String(row?.segment || '')) === normalizeLookupValue(filterKey.slice(8));
      if (filterKey.startsWith('source:')) {
        const sourceNeedle = normalizeLookupValue(filterKey.slice(7));
        const sourceValues = [row?.source, row?.sourceEngine, ...parseJsonArray(row?.sourceEngines)].map((value) => normalizeLookupValue(String(value || '')));
        return sourceValues.some((value) => value === sourceNeedle);
      }
      return true;
    });
  }

  private getRadarChannelAvailability(row: any): Record<RadarChannelFilter, boolean> {
    const parsedEnrichment = parseJsonObject(row?.enrichmentJson);
    const qualityAvailability = parseJsonObject(parsedEnrichment?.qualityV2?.channelAvailability || row?.qualityV2?.channelAvailability);
    const websiteValue = row?.website || parsedEnrichment?.website;
    const websiteStatusRaw = String(row?.websiteStatus || parsedEnrichment?.websiteStatus || '').trim().toLowerCase();
    const websiteStatus = websiteValue && (!websiteStatusRaw || websiteStatusRaw === 'none')
      ? inferWebsiteStatus(websiteValue)
      : (websiteStatusRaw || inferWebsiteStatus(websiteValue));
    const emailStatus = String(row?.emailStatus || parsedEnrichment?.emailStatus || '').trim().toLowerCase();
    const businessEmail = normalizeBusinessEmail(row?.email || parsedEnrichment?.email);
    const whatsappStatus = String(row?.whatsappStatus || row?.whatsappCheckStatus || parsedEnrichment?.whatsappStatus || '').trim().toLowerCase();
    const instagramUrl = row?.instagramUrl || parsedEnrichment?.instagramUrl;
    const facebookUrl = row?.facebookUrl || parsedEnrichment?.facebookUrl;
    const instagramAvailable = Boolean(instagramUrl)
      && !looksLikeThirdPartySocialProfile(instagramUrl)
      && socialProfileLooksCompatibleWithLead(row, instagramUrl);
    const facebookAvailable = Boolean(facebookUrl)
      && !looksLikeThirdPartySocialProfile(facebookUrl)
      && socialProfileLooksCompatibleWithLead(row, facebookUrl);
    const websiteBlocked = this.isBlockedLeadOfficialWebsite(websiteValue);
    const websiteCompatible = Boolean(websiteValue) && websiteHostLooksCompatibleWithLead(row, websiteValue);
    return {
      whatsapp: qualityAvailability.whatsapp === true || ['confirmed', 'available', 'valid', 'exists', 'true'].includes(whatsappStatus) || isLikelyWhatsapp(row?.phoneDigits || row?.phone),
      phone: qualityAvailability.phone === true || isLikelyValidBrPhone(row?.phoneDigits || row?.phone),
      email: qualityAvailability.email === true || Boolean(businessEmail) && ['confirmed', 'probable', ''].includes(emailStatus),
      website: !websiteBlocked && websiteCompatible && (qualityAvailability.website === true || Boolean(websiteValue) && !['broken', 'unreachable', 'none'].includes(websiteStatus)),
      instagram: (qualityAvailability.instagram === true || instagramAvailable) && instagramAvailable,
      facebook: (qualityAvailability.facebook === true || facebookAvailable) && facebookAvailable,
    };
  }

  private matchesRadarChannelFilters(row: any, filters: NormalizedRadarFilters) {
    const required = this.requiredChannelsForInput(filters);
    const mode = this.normalizeChannelMatchMode(filters?.channelMatchMode);
    if (!required.length || mode === 'prefer') return true;
    const availability = this.getRadarChannelAvailability(row);
    const matches = required.map((channel) => availability[channel] === true);
    return mode === 'all_required' ? matches.every(Boolean) : matches.some(Boolean);
  }

  private dedupeRadarRows(rows: any[]) {
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const row of rows) {
      const keys = [
        row?.phoneDigits ? `phone:${row.phoneDigits}` : '',
        row?.placeId ? `place:${row.placeId}` : '',
        row?.website ? `website:${normalizeWebsiteKey(row.website)}` : '',
      ].filter(Boolean);
      if (keys.some((key) => seen.has(key))) continue;
      keys.forEach((key) => seen.add(key));
      deduped.push(row);
    }
    return deduped;
  }

  private extractRadarLeadWhatsappStatus(row: any) {
    const direct = String(row?.whatsappStatus || row?.whatsappCheckStatus || '').trim().toLowerCase();
    if (direct) return direct;
    const recentEvents = Array.isArray(row?.events) ? row.events : [];
    const checkedEvent = recentEvents.find((event: any) => String(event?.eventType || '').trim().toLowerCase() === 'whatsapp_checked');
    const eventStatus = String(parseJsonObject(checkedEvent?.note)?.whatsappStatus || '').trim().toLowerCase();
    if (eventStatus) return eventStatus;
    const enrichmentStatus = String(parseJsonObject(row?.enrichmentJson)?.whatsappStatus || '').trim().toLowerCase();
    return enrichmentStatus || null;
  }

  private async loadLatestRadarLeadForEnrichmentMerge(row: any) {
    if (!row?.id || !(await this.supportsRadarPersistence())) return null;
    return (this.prisma as any).radarLeadPool.findUnique({
      where: { id: row.id },
      select: {
        email: true,
        emailStatus: true,
        emailSource: true,
        emailConfidence: true,
        website: true,
        websiteStatus: true,
        instagramUrl: true,
        facebookUrl: true,
        socialStatus: true,
        socialConfidence: true,
        googleMapsUrl: true,
        businessCategory: true,
        openingHoursStatus: true,
        opportunityReason: true,
        rating: true,
        reviews: true,
        address: true,
        metadataJson: true,
        enrichmentJson: true,
        lastEnrichedAt: true,
        enrichmentVersion: true,
      },
    }).catch(() => null);
  }

  private mergeLatestRadarLeadForEnrichment(row: any, latest: any) {
    return latest ? { ...row, ...latest } : row;
  }

  private needsRadarLeadEnrichmentRefresh(row: any) {
    if (!row?.id) return false;
    if (row?.enrichmentVersion !== RADAR_LEAD_ENRICHMENT_VERSION) return true;
    if (!row?.lastEnrichedAt || !row?.enrichmentJson) return true;
    if (!row?.recommendedChannel || !row?.painType || !row?.painLabel || !row?.opportunityReason) return true;
    if (!row?.emailStatus || !row?.websiteStatus) return true;
    return false;
  }

  private buildRadarLeadEnrichmentData(row: any, now = new Date()) {
    const companyState = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    const protectedStatus = this.isRadarProtectedStatus(companyState?.status || row?.status);
    const enrichment = buildRadarLeadEnrichment({
      ...row,
      companyStatus: companyState?.status || row?.status,
      websiteStatus: row?.websiteStatus || inferWebsiteStatus(row?.website),
      whatsappStatus: this.extractRadarLeadWhatsappStatus(row),
      now,
    });
    return {
      websiteStatus: row?.websiteStatus || inferWebsiteStatus(row?.website),
      email: enrichment.email || row?.email || null,
      emailStatus: enrichment.emailStatus,
      emailSource: enrichment.emailSource,
      emailConfidence: enrichment.emailConfidence,
      instagramUrl: enrichment.instagramUrl || row?.instagramUrl || null,
      facebookUrl: enrichment.facebookUrl || row?.facebookUrl || null,
      socialStatus: enrichment.socialStatus,
      socialConfidence: enrichment.socialConfidence,
      googleMapsUrl: enrichment.googleMapsUrl || row?.googleMapsUrl || null,
      businessCategory: enrichment.businessCategory || row?.businessCategory || null,
      openingHoursStatus: enrichment.openingHoursStatus || row?.openingHoursStatus || null,
      recommendedChannel: protectedStatus ? 'discard' : enrichment.recommendedChannel,
      painType: enrichment.painType,
      painLabel: enrichment.painLabel,
      painPitch: enrichment.painPitch,
      opportunityReason: enrichment.opportunityReason || row?.opportunityReason || null,
      enrichmentJson: enrichment.enrichmentJson,
      enrichmentScore: protectedStatus ? 0 : enrichment.enrichmentScore,
      enrichmentConfidence: enrichment.enrichmentConfidence,
      lastEnrichedAt: enrichment.lastEnrichedAt,
      enrichmentVersion: enrichment.enrichmentVersion,
    };
  }

  private async ensureRadarRowsEnriched(rows: any[]) {
    if (!Array.isArray(rows) || !rows.length) return [];
    if (!(await this.supportsRadarPersistence())) return rows;
    const now = new Date();
    const updatedRows: any[] = [];
    const pendingUpdates: Promise<any>[] = [];
    for (const row of rows) {
      if (!this.needsRadarLeadEnrichmentRefresh(row)) {
        updatedRows.push(row);
        continue;
      }
      const latestRow = await this.loadLatestRadarLeadForEnrichmentMerge(row);
      const baseRow = this.mergeLatestRadarLeadForEnrichment(row, latestRow);
      const data = this.buildRadarLeadEnrichmentData(baseRow, now);
      updatedRows.push({ ...baseRow, ...data });
      pendingUpdates.push(
        (this.prisma as any).radarLeadPool.update({
          where: { id: baseRow.id },
          data,
        }).catch(() => null),
      );
      if (pendingUpdates.length >= 25) {
        await Promise.all(pendingUpdates.splice(0, pendingUpdates.length));
      }
    }
    if (pendingUpdates.length) await Promise.all(pendingUpdates);
    return updatedRows;
  }

  private radarCommercialRank(row: any) {
    const status = this.resolveRadarLeadStatus(row);
    if (this.isRadarProtectedStatus(status) || this.isRadarProtectedStatus(row?.companyStates?.[0]?.status)) return -10000;
    const qualityV2 = this.extractLeadQualityV2FromObject(row) || this.extractLeadQualityV2FromObject(row?.enrichmentJson) || this.extractLeadQualityV2FromObject(row?.metadataJson);
    if (qualityV2?.decision === 'protect') return -10000;
    if (qualityV2?.decision === 'discard') {
      const reason = String(qualityV2.discardReason || '').trim();
      if (!['weak_contactability', 'location_mismatch'].includes(reason)) return -10000;
    }
    if (qualityV2) return safeInteger(qualityV2.finalRankScore) * 10 + Math.min(safeInteger(row?.reviews), 80);
    const channel = String(row?.recommendedChannel || parseJsonObject(row?.enrichmentJson)?.signals?.recommendedChannel || '').toLowerCase();
    const emailStatus = String(row?.emailStatus || parseJsonObject(row?.enrichmentJson)?.signals?.emailStatus || '').toLowerCase();
    const emailSource = String(row?.emailSource || '').toLowerCase();
    const whatsappStatus = String(this.extractRadarLeadWhatsappStatus(row) || '').toLowerCase();
    const channelWeight: Record<string, number> = { whatsapp: 650, email: 540, call: 390, review: 180, discard: -1000 };
    const whatsappWeight: Record<string, number> = { confirmed: 120, unverified: 20, missing: -80, invalid: -120 };
    const emailWeight: Record<string, number> = { confirmed: 90, probable: emailSource === 'inferred' ? 58 : 70, unverified: 12, missing: 0, invalid: -80 };
    const negativePenalty =
      safeInteger(row?.globalNegativeCount) * 80 +
      safeInteger(row?.noAnswerCount) * 12 +
      (['denied', 'complaint', 'hidden', 'discarded'].includes(status) ? 250 : 0) +
      safeInteger(row?._sourceQualityPenalty);
    return (
      (channelWeight[channel] ?? 0) +
      (whatsappWeight[whatsappStatus] ?? 0) +
      (emailWeight[emailStatus] ?? 0) +
      safeInteger(row?.enrichmentScore || row?.opportunityScore) * 2 +
      Math.min(safeInteger(row?.reviews), 80) -
      negativePenalty
    );
  }

  private sortRadarRowsByCommercialPriority(rows: any[]) {
    return [...rows].sort((left, right) => {
      const rankDelta = this.radarCommercialRank(right) - this.radarCommercialRank(left);
      if (rankDelta !== 0) return rankDelta;
      const scoreDelta = safeInteger(right?.enrichmentScore || right?.opportunityScore) - safeInteger(left?.enrichmentScore || left?.opportunityScore);
      if (scoreDelta !== 0) return scoreDelta;
      const importedDelta = safeInteger(left?.globalImportedCount) - safeInteger(right?.globalImportedCount);
      if (importedDelta !== 0) return importedDelta;
      return String(left?.name || '').localeCompare(String(right?.name || ''), 'pt-BR');
    });
  }

  private async attachSourceQualityPenalty(rows: any[]) {
    const delegate = (this.prisma as any).webscrapingSourceQuality;
    if (!delegate || !(await this.prisma.hasTable('WebscrapingSourceQuality').catch(() => false)) || !rows.length) return rows;
    const domains = Array.from(new Set(rows.map((row) => getWebsiteHost(row?.sourceUrl || row?.website)).filter(Boolean)));
    if (!domains.length) return rows;
    const qualityRows = await delegate.findMany({
      where: { domain: { in: domains } },
      select: { domain: true, sourceEngine: true, approvedCount: true, rejectedCount: true, approvalRate: true },
      take: 1000,
    }).catch(() => []);
    const byKey = new Map<string, any>();
    for (const quality of qualityRows || []) {
      byKey.set(`${quality.domain}|${quality.sourceEngine || ''}`, quality);
      if (!byKey.has(`${quality.domain}|*`)) byKey.set(`${quality.domain}|*`, quality);
    }
    return rows.map((row) => {
      const domain = getWebsiteHost(row?.sourceUrl || row?.website);
      const quality = byKey.get(`${domain}|${row?.sourceEngine || ''}`) || byKey.get(`${domain}|*`);
      const approved = safeInteger(quality?.approvedCount);
      const rejected = safeInteger(quality?.rejectedCount);
      const total = approved + rejected;
      const rate = Number.isFinite(Number(quality?.approvalRate))
        ? Number(quality.approvalRate)
        : total > 0 ? approved / total : 1;
      return {
        ...row,
        _sourceQualityPenalty: total >= 10 && rate < 0.25 ? 140 : total >= 5 && rate < 0.4 ? 70 : 0,
      };
    });
  }

  private filterRowsByLeadQuality(rows: any[], filters: NormalizedRadarFilters | NormalizedSearchInput) {
    return rows.filter((row) => {
      const qualityV2 = this.extractLeadQualityV2FromObject(row) || this.getCandidateQualityV2(row, filters);
      const quality = this.getCandidateQuality(row, filters);
      return this.isListDeliverableCard(row, filters, quality, qualityV2);
    });
  }

  private summarizeLeadQualityRejections(qualities: LeadQualityResult[]) {
    const rejected = qualities.filter((quality) => !this.isApprovedLeadQuality(quality));
    return {
      rejectedCount: rejected.length,
      rejectedBySegmentCount: rejected.filter((quality) => quality.status === 'segment_mismatch').length,
      rejectedGenericCount: rejected.filter((quality) => quality.status === 'generic_directory').length,
      rejectedWeakContactCount: rejected.filter((quality) => quality.status === 'weak_contact').length,
      rejectedInvalidCount: rejected.filter((quality) => quality.status === 'invalid').length,
    };
  }

  private async queryRadarRowsForCompany(
    companyId: number,
    filters: NormalizedRadarFilters,
    options: { limit?: number; excludePhoneDigits?: string[]; requirePhone?: boolean; includeHidden?: boolean; availableOnly?: boolean } = {},
  ) {
    if (!(await this.supportsRadarPersistence())) return [];
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    if (ownershipEnabled) {
      await this.releaseExpiredRadarReservations({ companyId }).catch((error: any) => {
        this.logger.warn(`[radar] falha ao liberar reservas expiradas company=${companyId}: ${String(error?.message || error)}`);
      });
    }
    const readLimit = Math.min(Math.max(Math.trunc(Number(options.limit || filters.limit) || filters.limit), 1), 1000);
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: this.buildRadarWhere(filters, companyId, {
        ...options,
        ownershipEnabled,
      }),
      orderBy: [
        { opportunityScore: 'desc' },
        { reviews: 'desc' },
        { rating: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: Math.min(readLimit * 4, 1000),
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
            vendasLead: {
              select: {
                status: true,
                returnAt: true,
                attemptCount: true,
                shortNote: true,
                lastResult: true,
                saleStatus: true,
                saleValue: true,
              },
            },
          },
        },
        events: {
          ...(companyId ? { where: { OR: [{ companyId }, { companyId: null }] } } : {}),
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
    const enrichedRows = await this.ensureRadarRowsEnriched(this.filterRadarRowsInMemory(rows, filters));
    const qualityWeightedRows = await this.attachSourceQualityPenalty(enrichedRows);
    return this.sortRadarRowsByCommercialPriority(this.dedupeRadarRows(this.filterRowsByLeadQuality(qualityWeightedRows, filters))).slice(0, readLimit);
  }

  private restoreRadarPoolResults(rows: any[]): WebscrapingContactResult[] {
    return rows.map((row) => ({
      placeId: row?.placeId || `radar:${row?.id}`,
      name: String(row?.name || 'Empresa sem nome'),
      phone: String(row?.phone || row?.phoneDigits || ''),
      phoneDigits: normalizePhoneDigits(row?.phoneDigits || row?.phone),
      rating: row?.rating == null ? null : Number(row.rating),
      reviews: safeInteger(row?.reviews),
      address: row?.address || null,
      website: row?.website || null,
      source: 'radar_database',
      city: row?.city || null,
      state: row?.state || null,
      segment: row?.segment || row?.businessCategory || null,
      score: safeInteger(row?.opportunityScore),
      opportunityScore: safeInteger(row?.opportunityScore),
      opportunityReason: row?.opportunityReason || null,
      evidenceJson: parseJsonObject(row?.evidenceJson) || null,
      rejectReasons: parseJsonArray(row?.rejectReasons),
      qualityReason: row?.qualityReason || null,
      visibilityTier: row?.visibilityTier || null,
      deliveryProduct: row?.deliveryProduct || null,
      instagramUrl: row?.instagramUrl || null,
      facebookUrl: row?.facebookUrl || null,
      socialStatus: row?.socialStatus || null,
      socialConfidence: safeInteger(row?.socialConfidence),
      googleMapsUrl: row?.googleMapsUrl || null,
      businessCategory: row?.businessCategory || null,
      category: row?.businessCategory || null,
      // F3 REFUNDAÇÃO (28/07): origem da categoria visível ('cnae'/'observed'/'unconfirmed')
      // persiste no metadataJson do pool — campo OPCIONAL, card antigo segue sem ele.
      businessCategoryStatus: parseJsonObject(row?.metadataJson)?.businessCategoryStatus || null,
      openingHoursStatus: row?.openingHoursStatus || null,
      enrichmentJson: row?.enrichmentJson || null,
      metadataJson: row?.metadataJson || null,
      qualityV2: this.extractLeadQualityV2FromObject(row) || this.extractLeadQualityV2FromObject(row?.enrichmentJson) || this.extractLeadQualityV2FromObject(row?.metadataJson),
      quality: this.extractLeadQualityFromObject(row) || this.extractLeadQualityFromObject(row?.enrichmentJson) || this.extractLeadQualityFromObject(row?.metadataJson),
    })).filter((row) => row.phoneDigits || row.instagramUrl || row.facebookUrl || row.website);
  }

  private async listRadarContactsForSearch(
    context: SearchExecutionContext,
    input: NormalizedSearchInput,
  ): Promise<WebscrapingContactResult[]> {
    const filters = this.normalizeRadarFilters({
      city: input.city,
      state: input.state,
      segment: input.segment,
      quantity: input.quantity,
      limit: Math.max(input.quantity * 3, 20),
      minRating: input.filters.minRating,
      minReviews: input.filters.minReviews,
      validPhone: false,
      preferredChannels: input.preferredChannels,
      requiredChannels: input.requiredChannels,
      channelMatchMode: input.channelMatchMode,
    });
    const rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: Math.max(input.quantity * 3, 20),
      excludePhoneDigits: input.excludePhoneDigits,
      requirePhone: false,
    });
    return this.sortContacts(this.restoreRadarPoolResults(rows)).slice(0, input.quantity);
  }

  private async getRadarPremiumAccessForCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: {
        status: true,
        isActive: true,
        selectedPlanKey: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
        courtesyEndsAt: true,
        courtesyReason: true,
      },
    }).catch(() => null);
    if (!company || !this.companyHasPaidFeatureAccess(company)) {
      return { active: false, planKey: null as string | null, canUsePremium: false };
    }
    const planKey = resolveCommercialPlanKeyForCapabilities(company);
    return {
      active: true,
      planKey,
      canUsePremium: planKey !== COMMERCIAL_PLAN_KEYS.LITE,
    };
  }

  private async canUseRadarSmartLeadFields(companyId: number) {
    return (await this.getRadarPremiumAccessForCompany(companyId)).canUsePremium;
  }

  private maskRadarSmartFieldsForList(item: any) {
    const validInstagram = item?.instagramUrl
      && !looksLikeThirdPartySocialProfile(item.instagramUrl)
      && socialProfileLooksCompatibleWithLead(item, item.instagramUrl);
    const validFacebook = item?.facebookUrl
      && !looksLikeThirdPartySocialProfile(item.facebookUrl)
      && socialProfileLooksCompatibleWithLead(item, item.facebookUrl);
    const safeWebsite = item?.website
      && !this.isBlockedLeadOfficialWebsite(item.website)
      && websiteHostLooksCompatibleWithLead(item, item.website)
      ? item.website
      : null;
    const safeEmail = normalizeBusinessEmail(item?.email);
    const hadPremiumSignal = Boolean(
      item?.recommendedChannel
      || item?.painType
      || item?.painLabel
      || item?.painPitch
      || item?.opportunityReason
      || item?.opportunityScore
      || item?.enrichmentScore
      || item?.qualityV2
      || item?.enrichmentJson,
    );
    return {
      ...item,
      email: safeEmail || item?.email || null,
      emailStatus: item?.emailStatus || (safeEmail ? 'probable' : 'missing'),
      emailSource: item?.emailSource || null,
      emailConfidence: item?.emailConfidence || 0,
      instagramUrl: validInstagram ? item.instagramUrl : null,
      facebookUrl: validFacebook ? item.facebookUrl : null,
      socialStatus: validInstagram || validFacebook ? item?.socialStatus || 'found' : item?.socialStatus || 'missing',
      socialConfidence: validInstagram || validFacebook ? item?.socialConfidence || 0 : 0,
      googleMapsUrl: item?.googleMapsUrl || null,
      businessCategory: item?.businessCategory || null,
      openingHoursStatus: item?.openingHoursStatus || null,
      whatsappStatus: item?.whatsappStatus || item?.whatsappCheckStatus || 'unverified',
      whatsappCheckStatus: item?.whatsappCheckStatus || item?.whatsappStatus || 'unverified',
      website: safeWebsite,
      rating: item?.rating ?? null,
      reviews: item?.reviews ?? null,
      recommendedChannel: null,
      painType: null,
      painLabel: null,
      painPitch: null,
      enrichmentScore: 0,
      enrichmentConfidence: 0,
      enrichmentJson: null,
      qualityV2: null,
      quality: null,
      lastEnrichedAt: null,
      opportunityReason: null,
      evidenceJson: null,
      rejectReasons: [],
      qualityReason: null,
      sourceConfidence: null,
      actionPlan: null,
      premiumLocked: true,
      premiumFeatureStatus: 'locked',
      premiumTeaser: hadPremiumSignal,
    };
  }

  // sourceChain (P1, 02/07; reformado 03/07): tabela de lanes ÚNICA em shared/radar-source-lanes
  // (conhece os rótulos reais do motor Python, ex.: hbx_scraping:free_pj). Engines + source do
  // card entram juntos; a coluna sourceEngine (engine da CORRIDA, ex.: 'hbx') fica de fora de
  // propósito — era a carona que pintava lead da Receita como "rfb+web" sem web ter descoberto.
  // Sem fonte mapeável devolve null — campo ausente, opcional.
  private buildRadarLeadSourceChain(sourceEngines: string[], fallbackSource?: string | null): string | null {
    const engines = Array.isArray(sourceEngines) ? sourceEngines : [];
    return buildRadarSourceChainFromEngines([...engines, fallbackSource]);
  }

  // enrichedBy (03/07): monta os campos OPCIONAIS de enriquecimento do card a partir dos rótulos
  // crus persistidos em metadataJson.enrichmentEngines. `enrichedBy` = lanes amigáveis (rfb/web);
  // `enrichmentEngines` = rótulos crus pra auditoria. Sem enriquecimento → objeto vazio (spread
  // não adiciona nada, card antigo continua idêntico).
  private buildRadarLeadEnrichedBy(enrichmentEngines: unknown): { enrichedBy?: string[]; enrichmentEngines?: string[] } {
    const engines = Array.isArray(enrichmentEngines)
      ? enrichmentEngines.map((engine) => String(engine || '').trim()).filter(Boolean)
      : [];
    if (!engines.length) return {};
    const enrichedBy = radarEnrichedByLanesOf(engines);
    return {
      enrichmentEngines: Array.from(new Set(engines)),
      ...(enrichedBy.length ? { enrichedBy } : {}),
    };
  }

  /**
   * WORM-16: PESSOAS estruturadas do card. Fonte primária = meta.people (persistido pelo L4 a
   * partir do QSA da Receita, com cargo). Fallback ADITIVO p/ blobs antigos sem `people`:
   * sintetiza do ownerName/ownerNames (o 1º ganha o ownerPhone). Nunca inventa nome — só
   * reprojeta o que já está no blob. Retorna [] quando não há nenhuma pessoa.
   */
  private buildRadarLeadPeople(meta: Record<string, any>): Array<{ name: string; role: string | null; source: string; phoneDigits: string | null }> {
    const seen = new Set<string>();
    const norm = (n: unknown) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const out: Array<{ name: string; role: string | null; source: string; phoneDigits: string | null }> = [];
    const ownerPhoneDigits = String((meta as any)?.ownerPhone || '').replace(/\D/g, '') || null;

    const push = (name: unknown, role: unknown, source: string, phoneDigits: string | null) => {
      const clean = String(name || '').trim();
      const key = norm(clean);
      if (!clean || key.length < 2 || seen.has(key)) return;
      seen.add(key);
      out.push({ name: clean, role: String(role || '').trim() || null, source, phoneDigits });
    };

    const structured = Array.isArray((meta as any)?.people) ? (meta as any).people : [];
    for (const person of structured) {
      push(person?.name, person?.role, String(person?.source || 'receita_qsa'), out.length === 0 ? ownerPhoneDigits : null);
    }
    // Fallback dos blobs antigos: ownerName + ownerNames viram Pessoa sem cargo.
    if (!out.length) {
      const names = [
        ...((meta as any)?.ownerName ? [String((meta as any).ownerName)] : []),
        ...(Array.isArray((meta as any)?.ownerNames) ? (meta as any).ownerNames : []),
      ];
      for (const name of names) push(name, null, 'receita_qsa', out.length === 0 ? ownerPhoneDigits : null);
    }
    return out;
  }

  // HOT-07 (empresa recém-aberta): janela de urgência p/ badge + prioridade na
  // entrega. Reusa o `diasAberto` já calculado em RadarPublicDataService a
  // partir de CnpjPublicCompany.openedAt (persistido em signalsJson) — não
  // recalcula, só decide a janela de exibição/priorização (30d, mais estrita
  // que o sinal `recem_aberto` de 180d usado no card do Radar).
  private static readonly FRESH_COMPANY_WINDOW_DAYS = 30;

  private resolveFreshCompanyState(row: any): { isFreshCompany: boolean; daysSinceOpened: number | null } {
    const stored = parseSignalsJson(row?.signalsJson);
    const days = stored.diasAberto;
    if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) {
      return { isFreshCompany: false, daysSinceOpened: null };
    }
    return {
      isFreshCompany: days <= RadarCorePresentationMixin.FRESH_COMPANY_WINDOW_DAYS,
      daysSinceOpened: days,
    };
  }

  // FIX-ENRICHMENT-STATUS-SHELF (05/07): normaliza o vocabulário da fila (RadarLeadEnrichment.
  // enrichmentStatus: queued|running|enriched|failed|skipped) pro vocabulário que o front entende
  // (pending|completed|failed) — o card não deve conhecer o schema interno da fila. Sem status de
  // fila (nenhuma linha ou lookup indisponível neste ambiente), degrada pro que já existia antes
  // desta mudança: `enrichmentJson` com chaves OU `lastEnrichedAt` preenchido → completed; senão
  // null (badge "enriquecendo agora" fica apagado, igual ao comportamento anterior a este fix).
  private resolveRadarLeadEnrichmentStatus(row: any, queueStatus?: string | null): 'pending' | 'completed' | 'failed' | null {
    const normalizedQueueStatus = String(queueStatus || '').trim().toLowerCase();
    if (normalizedQueueStatus === 'queued' || normalizedQueueStatus === 'running') return 'pending';
    if (normalizedQueueStatus === 'enriched' || normalizedQueueStatus === 'skipped') return 'completed';
    if (normalizedQueueStatus === 'failed') return 'failed';
    const enrichmentParsed = parseJsonObject(row?.enrichmentJson);
    if (enrichmentParsed && Object.keys(enrichmentParsed).length) return 'completed';
    if (row?.lastEnrichedAt instanceof Date) return 'completed';
    return null;
  }

  // FIX-ENRICHMENT-STATUS-SHELF (05/07): lookup em massa da fila (RadarLeadEnrichment) pra UMA
  // página de cards. RadarLeadEnrichment é 1:1 (radarLeadId @unique), mas o único escritor
  // (night-factory.service.ts) grava radarLeadId=sourceLeadPoolId=RadarLeadPool.id — casa pelas
  // DUAS colunas via OR (mesmo padrão do cleanup em radar-core-master-database.mixin.ts:611) pra
  // não depender de qual coluna acabou populada. Degrade DUPLO (hasTable + try/catch): os testes
  // existentes mockam prisma SEM esse modelo — `(this.prisma as any).radarLeadEnrichment` pode ser
  // `undefined` e lançar TypeError SÍNCRONO antes mesmo do await; hasTable sozinho não protege
  // contra isso, por isso o try/catch por fora. Falha aqui NUNCA impede a listagem — só o badge
  // de status cai pro fallback (json/lastEnrichedAt) dentro de resolveRadarLeadEnrichmentStatus.
  private async fetchRadarLeadEnrichmentQueueStatusMap(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim())));
    if (!uniqueIds.length) return map;
    try {
      if (!(await this.prisma.hasTable('RadarLeadEnrichment').catch(() => false))) return map;
      const rows = await (this.prisma as any).radarLeadEnrichment.findMany({
        where: { OR: [{ radarLeadId: { in: uniqueIds } }, { sourceLeadPoolId: { in: uniqueIds } }] },
        select: { radarLeadId: true, sourceLeadPoolId: true, enrichmentStatus: true },
      });
      for (const row of Array.isArray(rows) ? rows : []) {
        const status = String(row?.enrichmentStatus || '').trim();
        if (!status) continue;
        if (row?.radarLeadId) map.set(String(row.radarLeadId), status);
        if (row?.sourceLeadPoolId) map.set(String(row.sourceLeadPoolId), status);
      }
    } catch {
      // Degrade gracioso: sem lookup de fila, buildRadarLeadPublic cai no fallback json/lastEnrichedAt.
      return map;
    }
    return map;
  }

  private buildRadarLeadPublic(row: any, options: { includeSmartFields?: boolean; maskContact?: boolean; enrichmentQueueStatus?: string | null; viewerCompanyId?: number; ownershipEnabled?: boolean } = {}) {
    // VITRINE (carrossel do Radar): mostra a empresa e a presença digital (site,
    // Instagram, Facebook) pra encher o olho, mas MASCARA o contato direto
    // (telefone/e-mail) — revela só quando o lead é PUXADO no Leads. Sinais de
    // presença viram booleanos (hasPhone/hasEmail/hasWhatsapp) sem o valor cru.
    const companyState = Array.isArray(row?.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    const status = this.resolveRadarLeadStatus(row);
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || null;
    // Contato é PULL-GATED (decisão do dono 06/07): revela SÓ pra empresa DONA do lead
    // (ownerCompanyId === viewerCompanyId = já puxou/pagou). Máscara explícita (vitrine)
    // OU, com posse habilitada, qualquer lead não-possuído pelo espectador. Fecha os furos
    // de vazamento sem débito (detalhe :id / lista não-vitrine / database — auditoria 06/07).
    const viewerCompanyId = Math.trunc(Number(options.viewerCompanyId || 0)) || null;
    // Possuído pelo espectador = ownerCompanyId casa OU (legado) já existe companyState desta
    // empresa pro lead sem coluna de posse gravada. Nos fluxos atuais claim/pull/evento gravam
    // ownerCompanyId JUNTO do state, então o ramo legado só pega lead puxado ANTES da coluna
    // ownerCompanyId existir (jun/26) — evita mascarar contato que a empresa já pagou.
    const ownedByViewer =
      Boolean(ownerCompanyId && viewerCompanyId && ownerCompanyId === viewerCompanyId) ||
      Boolean(!ownerCompanyId && companyState);
    const maskContact = options.maskContact === true || (options.ownershipEnabled === true && !ownedByViewer);
    const claimedAt = row?.claimedAt instanceof Date ? row.claimedAt.toISOString() : null;
    const ddd = String(row?.ddd || this.extractDdd(row?.phoneDigits || row?.phone));
    const recentEvents = Array.isArray(row?.events) ? row.events : [];
    const enrichmentParsed = parseJsonObject(row?.enrichmentJson);
    const includeSmartFields = options.includeSmartFields !== false;
    const protectedChannel = this.isRadarProtectedStatus(companyState?.status || row?.status);
    const whatsappStatus = this.extractRadarLeadWhatsappStatus(row) || 'unverified';
    const qualityV2 = this.extractLeadQualityV2FromObject(row) || this.extractLeadQualityV2FromObject(row?.enrichmentJson) || this.extractLeadQualityV2FromObject(row?.metadataJson);
    const quality = this.extractLeadQualityFromObject(row) || this.extractLeadQualityFromObject(row?.enrichmentJson) || this.extractLeadQualityFromObject(row?.metadataJson);
    const evidenceJson = this.parseMaybeJsonObject(row?.evidenceJson || enrichmentParsed?.evidenceJson);
    const meta = this.parseMaybeJsonObject(row?.metadataJson) || {};
    const rejectReasons = parseJsonArray(row?.rejectReasons);
    const safeWebsite = row?.website
      && !this.isBlockedLeadOfficialWebsite(row.website)
      && websiteHostLooksCompatibleWithLead(row, row.website)
      ? row.website
      : null;
    const safeWebsiteStatus = safeWebsite && (!row?.websiteStatus || String(row.websiteStatus).toLowerCase() === 'none')
      ? inferWebsiteStatus(safeWebsite)
      : (safeWebsite ? row?.websiteStatus || inferWebsiteStatus(safeWebsite) : 'none');
    const safeEmail = normalizeBusinessEmail(row?.email || enrichmentParsed?.emailCandidate);
    const safeInstagramUrl = row?.instagramUrl
      && !looksLikeThirdPartySocialProfile(row.instagramUrl)
      && socialProfileLooksCompatibleWithLead(row, row.instagramUrl)
      ? row.instagramUrl
      : null;
    const safeFacebookUrl = row?.facebookUrl
      && !looksLikeThirdPartySocialProfile(row.facebookUrl)
      && socialProfileLooksCompatibleWithLead(row, row.facebookUrl)
      ? row.facebookUrl
      : null;
    const safeSocialStatus = safeInstagramUrl || safeFacebookUrl ? row?.socialStatus || enrichmentParsed?.signals?.socialStatus || 'found' : 'missing';
    const safeSocialConfidence = safeInstagramUrl || safeFacebookUrl ? safeInteger(row?.socialConfidence) : 0;
    // Calculado ANTES da máscara. É o único contrato de disponibilidade que a
    // vitrine precisa; não contém telefone, e-mail, URL ou pessoa.
    const channelPresence = {
      whatsapp: whatsappStatus === 'confirmed'
        || Object.values((meta as any)?.phonesWhatsapp || {}).some((value) => value === true),
      telefone: Boolean(row?.phoneDigits || row?.phone || (Array.isArray((meta as any)?.phones) && (meta as any).phones.length)),
      email: Boolean(safeEmail || (Array.isArray((meta as any)?.emails) && (meta as any).emails.length)),
      instagram: Boolean(safeInstagramUrl),
      facebook: Boolean(safeFacebookUrl),
      site: Boolean(safeWebsite),
    };
    const possibleSocialCandidates = Array.isArray(row?.possibleSocialCandidates)
      ? row.possibleSocialCandidates
      : Array.isArray(enrichmentParsed?.signals?.possibleSocialCandidates)
        ? enrichmentParsed.signals.possibleSocialCandidates
        : [];
    const confirmedSocialCandidates = Array.isArray(row?.confirmedSocialCandidates)
      ? row.confirmedSocialCandidates
      : Array.isArray(enrichmentParsed?.signals?.confirmedSocialCandidates)
        ? enrichmentParsed.signals.confirmedSocialCandidates
        : [];
    const smartFields = includeSmartFields ? {
      email: safeEmail || null,
      emailStatus: safeEmail ? row?.emailStatus || enrichmentParsed?.signals?.emailStatus || 'probable' : 'missing',
      emailSource: row?.emailSource || null,
      emailConfidence: safeEmail ? safeInteger(row?.emailConfidence) : 0,
      instagramUrl: safeInstagramUrl,
      facebookUrl: safeFacebookUrl,
      socialStatus: safeSocialStatus,
      socialConfidence: safeSocialConfidence,
      possibleSocialCandidates,
      confirmedSocialCandidates,
      googleMapsUrl: row?.googleMapsUrl || null,
      businessCategory: row?.businessCategory || null,
      // F3 REFUNDAÇÃO (28/07): a vitrine usa este flag pra mostrar "não confirmado" em vez do
      // texto da busca quando não há fato (CNAE/observação). Opcional — card antigo sem ele.
      businessCategoryStatus: meta?.businessCategoryStatus || null,
      openingHoursStatus: row?.openingHoursStatus || null,
      recommendedChannel: protectedChannel
        ? 'discard'
        : row?.recommendedChannel || enrichmentParsed?.signals?.recommendedChannel || null,
      painType: row?.painType || enrichmentParsed?.signals?.painType || null,
      painLabel: row?.painLabel || null,
      painPitch: row?.painPitch || null,
      enrichmentScore: safeInteger(row?.enrichmentScore),
      enrichmentConfidence: safeInteger(row?.enrichmentConfidence),
      enrichmentJson: enrichmentParsed && Object.keys(enrichmentParsed).length ? enrichmentParsed : null,
      lastEnrichedAt: row?.lastEnrichedAt instanceof Date ? row.lastEnrichedAt.toISOString() : null,
      enrichmentVersion: row?.enrichmentVersion || null,
      whatsappStatus,
      whatsappCheckStatus: whatsappStatus,
    } : {
      email: safeEmail || null,
      emailStatus: safeEmail ? row?.emailStatus || enrichmentParsed?.signals?.emailStatus || 'probable' : 'missing',
      emailSource: null,
      emailConfidence: 0,
      instagramUrl: null,
      facebookUrl: null,
      socialStatus: safeSocialStatus,
      socialConfidence: 0,
      possibleSocialCandidates: [],
      confirmedSocialCandidates: [],
      googleMapsUrl: null,
      businessCategory: null,
      openingHoursStatus: null,
      recommendedChannel: protectedChannel ? 'discard' : null,
      painType: null,
      painLabel: null,
      painPitch: null,
      enrichmentScore: 0,
      enrichmentConfidence: 0,
      enrichmentJson: null,
      lastEnrichedAt: null,
      enrichmentVersion: row?.enrichmentVersion || null,
      whatsappStatus,
      whatsappCheckStatus: whatsappStatus,
    };
    const qualityInput = {
      city: String(row?.city || ''),
      state: String(row?.state || ''),
      segment: String(row?.segment || ''),
      targetType: normalizeTargetType(this.parseMaybeJsonObject(row?.metadataJson)?.targetType),
      requiredChannels: [],
      preferredChannels: [],
      channelMatchMode: 'prefer',
      salesProfile: null,
    } as NormalizedRadarFilters;
    const publicLead = {
      id: String(row?.id || ''),
      placeId: row?.placeId || null,
      name: row?.name || '',
      phone: row?.phone || '',
      phoneDigits: row?.phoneDigits || '',
      ddd,
      expectedDdds: parseJsonArray(row?.expectedDddsJson),
      address: row?.address || null,
      city: row?.city || null,
      state: row?.state || null,
      segment: row?.segment || null,
      cnpj: (meta as any)?.cnpj || row?.cnpj || null,
      cnae: (meta as any)?.cnae || row?.cnae || null,
      razaoSocial: (meta as any)?.razaoSocial || (meta as any)?.legalName || row?.legalName || null,
      cnaeDescription: (meta as any)?.cnaeDescription || null,
      ownerName: (meta as any)?.ownerName || null,
      ownerNames: Array.isArray((meta as any)?.ownerNames) ? (meta as any).ownerNames : [],
      // Worker 1 "CNPJ → dono": telefone + redes sociais PESSOAIS do dono (do metadataJson).
      ownerPhone: (meta as any)?.ownerPhone || null,
      ownerInstagram: (meta as any)?.ownerInstagram || null,
      ownerFacebook: (meta as any)?.ownerFacebook || null,
      ownerSocialCandidates: Array.isArray((meta as any)?.ownerSocialCandidates) ? (meta as any).ownerSocialCandidates : [],
      // WORM-16: PESSOAS estruturadas (nome + cargo + fonte). Deriva de meta.people (persistido
      // pelo L4/QSA) e cai no fallback ownerName/ownerNames quando o blob antigo não tem `people`.
      // Campo OPCIONAL — card antigo sem `people` continua renderizando (a seção some).
      people: this.buildRadarLeadPeople(meta),
      // Worker 2 "Email finder": e-mails 1/2/3 e telefones 1/2/3 achados no crawl (teto 3).
      // `phonesWhatsapp` = mapa digits→bool da verificação WhatsApp (motor dedicado). O DISPLAY
      // só exibe telefone com `true`; sem mapa = nenhum extra aparece (card idêntico). Cru nunca descartado.
      emails: Array.isArray((meta as any)?.emails) ? (meta as any).emails.slice(0, 3) : [],
      phones: Array.isArray((meta as any)?.phones) ? (meta as any).phones.slice(0, 3) : [],
      phonesWhatsapp: ((meta as any)?.phonesWhatsapp && typeof (meta as any).phonesWhatsapp === 'object')
        ? (meta as any).phonesWhatsapp
        : {},
      companySituation: (meta as any)?.companySituation || null,
      website: safeWebsite,
      websiteStatus: safeWebsiteStatus,
      ...smartFields,
      // FIX-ENRICHMENT-STATUS-SHELF (05/07): badge "enriquecendo agora" do front (page.client.tsx
      // :1122) — normalizado pending|completed|failed (fila) ou fallback json/lastEnrichedAt.
      // Não é premium-gated: é status de fila, não dado sensível do enriquecimento em si.
      enrichmentStatus: this.resolveRadarLeadEnrichmentStatus(row, options.enrichmentQueueStatus ?? null),
      rating: row?.rating == null ? null : Number(row.rating),
      reviews: safeInteger(row?.reviews),
      source: row?.source || null,
      sourceEngine: row?.sourceEngine || null,
      sourceUrl: row?.sourceUrl || null,
      sourceEngines: parseJsonArray(row?.sourceEngines),
      // sourceChain (P1, 02/07 — cutover ordem fixa): cadeia amigavel rfb/web/rfb+web pra
      // exibir no card ("de onde veio"). Campo OPCIONAL — ausente em leads antigos sem
      // sourceEngines mapeavel, card continua renderizando normal.
      sourceChain: this.buildRadarLeadSourceChain(parseJsonArray(row?.sourceEngines), row?.source),
      // enrichedBy (03/07): quem só ENRIQUECEU o card (separado da DESCOBERTA no sourceChain).
      // Vem de metadataJson.enrichmentEngines (gravado no delivery). Campo OPCIONAL — leads
      // antigos sem essa marca não expõem `enrichedBy`, card renderiza normal.
      ...this.buildRadarLeadEnrichedBy((meta as any)?.enrichmentEngines),
      opportunityScore: safeInteger(row?.opportunityScore),
      opportunityReason: includeSmartFields ? row?.opportunityReason || null : null,
      opportunitySignals: includeSmartFields ? deriveRowSignals(row) : [],
      // HOT-07 (empresa recém-aberta): badge de urgência + prioridade na fila de
      // entrega. isFreshCompany = abriu há ≤30 dias (openedAt do CnpjPublicCompany,
      // já calculado em RadarPublicDataService). Campo OPCIONAL — ausente/false
      // em leads sem CNPJ casado, card renderiza normal sem o badge.
      ...this.resolveFreshCompanyState(row),
      evidenceJson: includeSmartFields && Object.keys(evidenceJson).length ? evidenceJson : null,
      rejectReasons: includeSmartFields ? rejectReasons : [],
      qualityReason: includeSmartFields ? row?.qualityReason || null : null,
      // Motivo de inclusão (S2 LEAD-CENTRICO, 25/07): por que este card entrou (cnae_compativel/
      // nome_combina_segmento/sem_segmento_pedido + cidade_uf_ok/telefone_presente/etc — ver
      // radar-inclusion-reasons.util.ts). Gravado em metadataJson no delivery; card antigo sem
      // o campo devolve lista vazia (badge simplesmente não aparece).
      inclusionReasons: includeSmartFields && Array.isArray((meta as any)?.inclusionReasons) ? (meta as any).inclusionReasons : [],
      visibilityTier: row?.visibilityTier || null,
      deliveryProduct: row?.deliveryProduct || null,
      qualityV2: includeSmartFields ? qualityV2 : null,
      quality: includeSmartFields ? quality : null,
      status,
      ownerCompanyId,
      claimedAt,
      ownershipStatus: this.isRadarProtectedStatus(companyState?.status || row?.status)
        ? 'negative'
        : ownerCompanyId
          ? 'mine'
          : status === 'sent_to_vendas' || status === 'in_attendance'
            ? 'in_attendance'
            : 'available',
      rejectionReason: row?.rejectionReason || null,
      complaintReason: companyState?.complaintReason || row?.complaintReason || null,
      deniedReason: companyState?.deniedReason || row?.deniedReason || null,
      noAnswerCount: safeInteger(companyState?.noAnswerCount ?? row?.noAnswerCount),
      contactedCount: safeInteger(companyState?.contactedCount ?? row?.contactedCount),
      assignedUserId: companyState?.assignedUserId || null,
      assignedByUserId: companyState?.assignedByUserId || null,
      assignedAt: companyState?.assignedAt instanceof Date ? companyState.assignedAt.toISOString() : null,
      lastContactAt: (companyState?.lastContactAt || row?.lastContactAt) instanceof Date
        ? (companyState?.lastContactAt || row?.lastContactAt).toISOString()
        : null,
      campaignId: row?.campaignId || null,
      historySummary: recentEvents.slice(0, 3).map((event: any) => ({
        id: String(event?.id || ''),
        eventType: String(event?.eventType || ''),
        note: event?.note || null,
        createdAt: event?.createdAt instanceof Date ? event.createdAt.toISOString() : null,
      })),
      globalNegativeCount: safeInteger(row?.globalNegativeCount),
      globalImportedCount: safeInteger(row?.globalImportedCount),
      globalContactedCount: safeInteger(row?.globalContactedCount),
      firstSeenAt: row?.firstSeenAt instanceof Date ? row.firstSeenAt.toISOString() : null,
      lastSeenAt: row?.lastSeenAt instanceof Date ? row.lastSeenAt.toISOString() : null,
      companyStatus: companyState?.status || status,
      vendasLeadId: companyState?.vendasLeadId || null,
      // Dados de pipeline (VendasLead) — presentes quando o lead foi puxado pra carteira.
      vendasStatus: companyState?.vendasLead?.status || null,
      vendasReturnAt: companyState?.vendasLead?.returnAt instanceof Date ? companyState.vendasLead.returnAt.toISOString() : null,
      vendasAttemptCount: companyState?.vendasLead != null ? safeInteger(companyState.vendasLead.attemptCount) : null,
      vendasShortNote: companyState?.vendasLead?.shortNote || null,
      vendasLastResult: companyState?.vendasLead?.lastResult || null,
      vendasSaleStatus: companyState?.vendasLead?.saleStatus || null,
      vendasSaleValue: companyState?.vendasLead?.saleValue != null ? Number(companyState.vendasLead.saleValue) : null,
      // Sinais de presença (sempre): a vitrine mostra ✓ sem o valor cru.
      channelPresence,
      hasPhone: channelPresence.telefone,
      hasEmail: channelPresence.email,
      hasWhatsapp: channelPresence.whatsapp,
      // Máscara do contato direto na vitrine (revela ao puxar).
      ...(maskContact ? {
        phone: '',
        phoneDigits: '',
        email: null,
        emailSource: null,
        emails: [],
        phones: [],
        phonesWhatsapp: {},
        website: null,
        instagramUrl: null,
        facebookUrl: null,
        googleMapsUrl: null,
        sourceUrl: null,
        possibleSocialCandidates: [],
        confirmedSocialCandidates: [],
        ownerName: null,
        ownerNames: [],
        ownerPhone: null,
        ownerInstagram: null,
        ownerFacebook: null,
        ownerSocialCandidates: [],
        people: [],
        enrichmentJson: null,
        evidenceJson: null,
        extractedFields: null,
        quality: null,
        qualityV2: null,
        qualityReason: null,
        rejectReasons: [],
        inclusionReasons: [],
        opportunityReason: null,
        historySummary: [],
        rejectionReason: null,
        complaintReason: null,
        deniedReason: null,
        vendasShortNote: null,
        vendasLastResult: null,
      } : {}),
      premiumLocked: !includeSmartFields,
      premiumFeatureStatus: includeSmartFields ? 'available' : 'locked',
      premiumTeaser: !includeSmartFields && Boolean(safeEmail || safeInstagramUrl || safeFacebookUrl || row?.recommendedChannel || row?.enrichmentScore || qualityV2),
    };
    return this.attachDeliveryClassification(
      publicLead,
      qualityInput,
      includeSmartFields ? quality || null : null,
      includeSmartFields ? qualityV2 || null : null,
    );
  }

  private buildDirectRadarLeadPublic(result: Omit<WebscrapingContactResult, 'placeId'> & { placeId?: string | null }, input: NormalizedRadarFilters, index: number) {
    const directSourceChain = buildRadarSourceChainFromEngines([
      ...(Array.isArray((result as any).sourceEngines) ? (result as any).sourceEngines : []),
      (result as any).source,
      (result as any).sourceEngine,
    ]);
    const phoneDigits = normalizePhoneDigits(result.phoneDigits || result.phone);
    const quality = this.extractLeadQualityFromObject(result as any) || (result as any).quality || this.getCandidateQuality(result as any, input);
    const opportunityScore = result.opportunityScore ?? result.score ?? this.buildOpportunityScore(result as WebscrapingContactResult, quality);
    const sourceEngine = input.engine || 'hbx';
    const enrichment = buildRadarLeadEnrichment({
      ...(result as any),
      phoneDigits,
      city: input.city,
      state: input.state,
      segment: input.segment,
      website: result.website,
      websiteStatus: inferWebsiteStatus(result.website),
      opportunityScore,
      rawPayload: result as any,
      salesProfile: this.buildLeadQualitySalesProfileFromFilters(input),
    });
    const publicLead = {
      id: `direct:${input.targetType}:${phoneDigits || normalizeLookupValue(`${result.name || 'card'}-${index + 1}`)}`,
      placeId: result.placeId || null,
      name: result.name || 'Empresa sem nome',
      phone: result.phone || phoneDigits || '',
      phoneDigits,
      ddd: this.extractDdd(phoneDigits || result.phone),
      expectedDdds: this.buildExpectedDdds(input),
      address: result.address || null,
      city: input.city || null,
      state: input.state || null,
      segment: input.segment || null,
      website: result.website || null,
      websiteStatus: inferWebsiteStatus(result.website),
      email: enrichment.email,
      emailStatus: enrichment.emailStatus,
      emailSource: enrichment.emailSource,
      emailConfidence: enrichment.emailConfidence,
      instagramUrl: enrichment.instagramUrl,
      facebookUrl: enrichment.facebookUrl,
      socialStatus: enrichment.socialStatus,
      socialConfidence: enrichment.socialConfidence,
      googleMapsUrl: enrichment.googleMapsUrl,
      businessCategory: enrichment.businessCategory,
      recommendedChannel: enrichment.recommendedChannel,
      painType: enrichment.painType,
      painLabel: enrichment.painLabel,
      painPitch: enrichment.painPitch,
      enrichmentScore: enrichment.enrichmentScore,
      enrichmentConfidence: enrichment.enrichmentConfidence,
      enrichmentJson: enrichment.enrichmentJson,
      lastEnrichedAt: enrichment.lastEnrichedAt.toISOString(),
      enrichmentVersion: enrichment.enrichmentVersion,
      rating: result.rating == null ? null : Number(result.rating),
      reviews: safeInteger(result.reviews),
      source: result.source || sourceEngine,
      sourceEngine,
      sourceUrl: null,
      sourceEngines: [sourceEngine, result.source].filter(Boolean),
      // sourceChain/enrichedBy no card AO VIVO (03/07): mesma régua central rfb/web. Descoberta
      // = engines reais do resultado + source + engine da corrida (aqui a corrida DESCOBRIU no
      // ato, não é re-toque de lead antigo). Campos OPCIONAIS — spread não adiciona se null/vazio.
      ...(directSourceChain ? { sourceChain: directSourceChain } : {}),
      ...this.buildRadarLeadEnrichedBy((result as any).enrichmentEngines),
      evidenceJson: (result as any).evidenceJson || null,
      rejectReasons: Array.isArray((result as any).rejectReasons) ? (result as any).rejectReasons : parseJsonArray((result as any).rejectReasons),
      qualityReason: (result as any).qualityReason || null,
      visibilityTier: (result as any).visibilityTier || null,
      deliveryProduct: (result as any).deliveryProduct || null,
      opportunityScore: safeInteger(opportunityScore),
      qualityV2: parseJsonObject(enrichment.enrichmentJson)?.qualityV2 || null,
      quality,
      opportunityReason: result.opportunityReason || enrichment.opportunityReason || this.buildOpportunityReason(result as WebscrapingContactResult, {
        city: input.city,
        state: input.state,
        segment: input.segment,
        radiusKm: input.radiusKm,
        originLat: input.originLat,
        originLng: input.originLng,
        regionalCities: input.regionalCities,
        quantity: input.quantity,
        engine: input.engine,
        targetType: input.targetType,
        filters: {
          minRating: input.minRating,
          minReviews: input.minReviews,
          onlyWithWebsite: input.withWebsite,
        },
        filtersJson: '{}',
        searchSignature: '',
        cacheSignature: '',
        normalizedCity: input.normalizedCity,
        normalizedSegment: input.normalizedSegment,
        excludePhoneDigits: [],
        salesProfile: input.salesProfile,
        preferredChannels: input.preferredChannels,
        requiredChannels: input.requiredChannels,
        channelMatchMode: input.channelMatchMode,
        freshness: input.freshness,
      }),
      status: 'clean',
      ownerCompanyId: null,
      claimedAt: null,
      ownershipStatus: 'available',
      rejectionReason: null,
      complaintReason: null,
      deniedReason: null,
      noAnswerCount: 0,
      contactedCount: 0,
      assignedUserId: null,
      assignedByUserId: null,
      assignedAt: null,
      lastContactAt: null,
      campaignId: null,
      historySummary: [],
      globalNegativeCount: 0,
      globalImportedCount: 0,
      globalContactedCount: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      companyStatus: 'clean',
      vendasLeadId: null,
    };
    return this.attachDeliveryClassification(publicLead, input, quality || null, publicLead.qualityV2 || null);
  }

  private withRadarWhatsappStatus(item: any, status: RadarWhatsappCheckStatus) {
    return {
      ...item,
      whatsappStatus: status,
      whatsappCheckStatus: status,
    };
  }

  private async canUseRadarWebwhatsCheck(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { selectedPlanKey: true },
    }).catch(() => null);
    const planKey = resolveCommercialPlanKeyForCapabilities(company || {});
    return planKey !== COMMERCIAL_PLAN_KEYS.LITE;
  }

  private async resolveRadarWhatsappEngineCompanyId(): Promise<number | null> {
    try {
      const engine = await this.prisma.company.findUnique({
        where: { slug: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG },
        select: { id: true },
      });
      return engine?.id ?? null;
    } catch {
      return null;
    }
  }

  // protected: o enricher (applyDiscoveredContactsForMaster) reusa esta MESMA verificação
  // em lote (motor WhatsApp dedicado, sessão já conectada — NUNCA reconecta) p/ checar os
  // multi-telefones capturados. 1 request por lote; degrada p/ [] se o motor não estiver no ar.
  protected async radarCheckWhatsappNumbers(
    numbers: Array<string | null | undefined>,
    requesterCompanyId?: number,
  ) {
    if (!this.webwhatsBridge) return [];
    // Regra do dono (07/07): o check usa o chip da PRÓPRIA empresa solicitante quando ela tem
    // sessão ativa — distribui o volume pela frota e tira o chip do master do papel de
    // verificador único da plataforma. Sem sessão ativa (ou falha na chamada) cai pro engine
    // do master, o comportamento de sempre. A checagem prévia no banco evita abrir o disjuntor
    // GLOBAL do zap-check por causa de empresa que simplesmente não tem chip conectado.
    const requesterId = Number(requesterCompanyId || 0) || null;
    if (requesterId) {
      const hasActiveSession = await (this.prisma as any).whatsAppConnectionSession
        .findFirst({
          where: { companyId: requesterId, provider: 'webwhats', status: 'active' },
          select: { id: true },
        })
        .catch(() => null);
      if (hasActiveSession) {
        try {
          return await this.webwhatsBridge.checkWhatsappNumbers(requesterId, numbers);
        } catch {
          /* sessão caiu entre o SELECT e o check → segue pro engine do master */
        }
      }
    }
    const engineId = await this.resolveRadarWhatsappEngineCompanyId();
    if (!engineId) return [];
    return await this.webwhatsBridge.checkWhatsappNumbers(engineId, numbers);
  }

  private async applyRadarWhatsappCheck(
    context: SearchExecutionContext,
    items: any[],
    requestedMode: RadarWhatsappCheckMode,
  ) {
    const baseMeta = {
      requestedMode,
      effectiveMode: requestedMode,
      checked: false,
      message: null as string | null,
    };
    const safeItems = Array.isArray(items) ? items : [];
    if (requestedMode === 'off') {
      return {
        items: safeItems.map((item) => this.withRadarWhatsappStatus(item, 'unverified')),
        meta: { ...baseMeta, effectiveMode: 'off' as RadarWhatsappCheckMode },
      };
    }

    const canUseWebwhats = this.webwhatsBridge && await this.canUseRadarWebwhatsCheck(context.companyId);
    if (!canUseWebwhats) {
      return {
        items: safeItems.map((item) => this.withRadarWhatsappStatus(item, 'unverified')),
        meta: {
          ...baseMeta,
          effectiveMode: 'enrich' as RadarWhatsappCheckMode,
          message: 'Validação WebWhats disponível nos planos superiores. Entreguei os cards sem bloquear a busca.',
        },
      };
    }

    try {
      const lookupResults = await this.radarCheckWhatsappNumbers(
        safeItems.map((item) => item?.phoneDigits || item?.phone || null),
        Number(context?.companyId || 0) || undefined,
      );
      const byPhone = new Map<string, boolean>();
      for (const result of lookupResults || []) {
        const phone = normalizePhoneDigits(result?.normalizedNumber || result?.input);
        if (phone && !byPhone.has(phone)) byPhone.set(phone, Boolean(result?.exists));
      }

      const enriched = safeItems.map((item) => {
        const phone = normalizePhoneDigits(item?.phoneDigits || item?.phone);
        const status: RadarWhatsappCheckStatus = !phone
          ? 'missing'
          : byPhone.has(phone)
            ? byPhone.get(phone)
              ? 'confirmed'
              : 'missing'
            : 'unverified';
        const radarEnrichment = buildRadarLeadEnrichment({
          ...item,
          whatsappStatus: status,
          companyStatus: item?.companyStatus || item?.status,
        });
        return this.withRadarWhatsappStatus({
          ...item,
          email: radarEnrichment.email || item?.email || null,
          emailStatus: radarEnrichment.emailStatus,
          emailSource: radarEnrichment.emailSource,
          emailConfidence: radarEnrichment.emailConfidence,
          recommendedChannel: radarEnrichment.recommendedChannel,
          painType: radarEnrichment.painType,
          painLabel: radarEnrichment.painLabel,
          painPitch: radarEnrichment.painPitch,
          opportunityReason: radarEnrichment.opportunityReason || item?.opportunityReason,
          enrichmentScore: radarEnrichment.enrichmentScore,
          enrichmentConfidence: radarEnrichment.enrichmentConfidence,
          enrichmentJson: parseJsonObject(radarEnrichment.enrichmentJson),
          lastEnrichedAt: radarEnrichment.lastEnrichedAt.toISOString(),
          enrichmentVersion: radarEnrichment.enrichmentVersion,
        }, status);
      });
      return {
        items: requestedMode === 'only_valid'
          ? enriched.filter((item) => item.whatsappCheckStatus === 'confirmed')
          : enriched,
        meta: { ...baseMeta, checked: true },
      };
    } catch (error: any) {
      this.logger.warn(`[radar] validacao WebWhats ignorada company=${context.companyId}: ${String(error?.message || error)}`);
      return {
        items: safeItems.map((item) => this.withRadarWhatsappStatus(item, 'unverified')),
        meta: {
          ...baseMeta,
          effectiveMode: 'enrich' as RadarWhatsappCheckMode,
          message: 'Não consegui validar WhatsApp agora. Entreguei os cards sem bloquear a busca.',
        },
      };
    }
  }

  private async searchRadarDirectForUser(user: any, filters: NormalizedRadarFilters, reason: string, technicalMessage?: string | null) {
    const response = await this.searchContactsForUser(
      user,
      {
        city: filters.city,
        state: filters.state,
        segment: filters.segment,
        quantity: filters.quantity,
        engine: filters.engine,
        targetType: filters.targetType,
        minRating: filters.minRating,
        minReviews: filters.minReviews,
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
    const context = this.resolveContext(user);
    const rawResults = response.results || [];
    const qualityPairs = rawResults.map((result) => ({
      result,
      quality: this.getCandidateQuality(result as any, filters),
    }));
    const approvedPairs = qualityPairs.filter(({ quality }) => this.isApprovedLeadQuality(quality));
    const rejectionMeta = this.summarizeLeadQualityRejections(qualityPairs.map((item) => item.quality));
    const whatsapp = await this.applyRadarWhatsappCheck(
      context,
      approvedPairs.map(({ result, quality }, index) => this.buildDirectRadarLeadPublic({ ...(result as any), quality }, filters, index)),
      filters.whatsappCheckMode,
    );
    const items = whatsapp.items;
    const includeSmartFields = await this.canUseRadarSmartLeadFields(context.companyId);
    const publicItems = includeSmartFields ? items : items.map((item: any) => this.maskRadarSmartFieldsForList(item));
    return {
      items: publicItems,
      total: publicItems.length,
      code: publicItems.length ? 'RADAR_DIRECT_RESULTS' : 'RADAR_NO_RESULTS',
      message: publicItems.length
        ? `Entreguei ${publicItems.length} card(s) uteis. Descartei ${rejectionMeta.rejectedCount} por baixa aderencia. Descartados nao consomem limite.`
        : rawResults.length
          ? 'O motor encontrou registros, mas nenhum passou na qualidade minima para esse segmento. Descartados nao consomem limite.'
          : 'Pesquisa concluida. Nao ha cards publicos suficientes para esse filtro agora.',
      retryable: false,
      meta: {
        requestedQuantity: filters.quantity,
        rawFoundCount: rawResults.length,
        approvedCount: approvedPairs.length,
        ...rejectionMeta,
        qualityGate: true,
        deliveredCount: publicItems.length,
        filters: {
          state: filters.state,
          city: filters.city,
          segment: filters.segment,
          targetType: filters.targetType,
          preferredChannels: filters.preferredChannels,
          requiredChannels: filters.requiredChannels,
          channelMatchMode: filters.channelMatchMode,
        },
        direct: {
          ran: true,
          reason,
          source: response.meta.source,
          fetchedCount: response.meta.fetchedCount,
          status: response.meta.status || 'completed',
          message: response.meta.message || null,
          technicalMessage: technicalMessage || null,
        },
        whatsappCheck: whatsapp.meta,
      },
    };
  }

  private buildRadarFacet(key: string, label: string, count: number, tone = 'neutral') {
    return this.getRadarLeadPresenter().buildRadarFacet(key, label, count, tone);
  }

  private buildRadarAvailableFilters(rows: any[]) {
    return this.getRadarLeadPresenter().buildRadarAvailableFilters(rows, this.buildRadarLeadPresenterHost());
  }

  private buildRadarFacets(rows: any[]) {
    return this.getRadarLeadPresenter().buildRadarFacets(rows, this.buildRadarLeadPresenterHost());
  }

  private buildRadarEnrichmentSummary(rows: any[]) {
    return this.getRadarLeadPresenter().buildRadarEnrichmentSummary(rows, this.buildRadarLeadPresenterHost());
  }

  // Lê a lista de segmentos preferidos de um JSON tolerante: object canônico
  // { segments, cityRegion } OU bare-array legado (["dentista"]). Usado pra montar
  // o "mix" de preferências (empresa + vendedores) — 14/06.
  private extractPreferredSegmentList(json: any): string[] {
    const obj = this.parseMaybeJsonObject(json);
    if (obj && Array.isArray((obj as any).segments)) {
      return (obj as any).segments.map((s: any) => String(s || '').trim()).filter(Boolean);
    }
    const arr = parseJsonArray(json);
    return Array.isArray(arr) ? arr.map((s: any) => String(s || '').trim()).filter(Boolean) : [];
  }

  // MIX de preferências (dono, 14/06; achatado por papel — LIMPEZA-DESTRUTIVA L6,
  // 05/07): o Radar/Leads exibe "misturadas" as preferências da EMPRESA (ramo-alvo)
  // + de QUEM ESTÁ LOGADO (própria afinidade) + de todos os vendedores ativos da
  // empresa. Devolve o conjunto normalizado de segmentos preferidos pra usar como
  // BOOST (não filtro — não esconde nada; só sobe o relevante). Igual pra qualquer
  // papel (antes: vendedor via só a própria; admin via só o mix agregado — não é
  // mais bifurcação por role, todos veem a própria + o mix).
  private async resolveRadarPreferenceSegments(user: any, context: SearchExecutionContext): Promise<Set<string>> {
    const set = new Set<string>();
    const add = (seg: any) => { const n = normalizeLookupValue(String(seg || '')); if (n) set.add(n); };
    try {
      const company = await this.prisma.company.findUnique({
        where: { id: context.companyId },
        select: { prospectingSegmentsJson: true } as any,
      }).catch(() => null);
      for (const s of this.extractPreferredSegmentList((company as any)?.prospectingSegmentsJson)) add(s);

      const me = await this.prisma.user.findUnique({
        where: { id: context.userId },
        select: { segmentAffinityJson: true, preferredSegmentsJson: true } as any,
      }).catch(() => null);
      for (const s of confirmedSegments((me as any)?.segmentAffinityJson, 3)) add(s);
      // HOT-07: preferência EXPLÍCITA de quem está logado (cadastro), não só a
      // afinidade observada — é o campo que o lead recém-aberto precisa
      // casar para furar a fila.
      for (const s of this.extractPreferredSegmentList((me as any)?.preferredSegmentsJson)) add(s);

      const sellers = await this.prisma.user.findMany({
        where: { companyId: context.companyId, isActive: true, isSystemMaster: false },
        select: { segmentAffinityJson: true, preferredSegmentsJson: true } as any,
        take: 200,
      }).catch(() => []);
      for (const row of sellers || []) {
        for (const s of confirmedSegments((row as any)?.segmentAffinityJson, 3)) add(s);
        for (const s of this.extractPreferredSegmentList((row as any)?.preferredSegmentsJson)) add(s);
      }
    } catch {
      // preferência é só boost de ordenação; falha aqui nunca quebra a lista.
    }
    return set;
  }

  // Partição estável: leads FRESCOS (HOT-07, ≤30d) que casam com a preferência
  // primeiro, depois o resto do(s) segmento(s) preferido(s), depois o resto —
  // preservando a ordem comercial já calculada dentro de cada grupo. É BOOST
  // (reordena), nunca filtro — nenhum lead é escondido.
  private boostRadarRowsByPreference(rows: any[], preferenceSet: Set<string>) {
    if (!preferenceSet.size) return rows;
    const freshPreferred: any[] = [];
    const preferred: any[] = [];
    const rest: any[] = [];
    for (const row of rows) {
      const seg = normalizeLookupValue(String(row?.normalizedSegment || row?.segment || ''));
      const isPreferred = Boolean(seg && preferenceSet.has(seg));
      if (isPreferred && this.resolveFreshCompanyState(row).isFreshCompany) {
        freshPreferred.push(row);
      } else if (isPreferred) {
        preferred.push(row);
      } else {
        rest.push(row);
      }
    }
    return freshPreferred.concat(preferred, rest);
  }

  async listRadarLeadsForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters({ ...input, engine: undefined });
    // LIMPEZA-DESTRUTIVA L3 (dono 04/07): vitrine E funil são a MESMA lagoa da empresa
    // pra TODOS os papéis — vendedor, admin e master veem o mesmo conjunto de cards.
    // assignedUserId deixou de ser filtro de visibilidade (é só informativo, "Responsável"
    // = quem puxou). Só leads disponíveis (availableOnly) na vitrine; contato mascarado
    // segue na camada de apresentação (LEI DO VENDEDOR, preço só pra admin).
    const vitrine = String((input as any).scope || '').trim().toLowerCase() === 'vitrine';
    if (!(await this.supportsRadarPersistence())) {
      return { items: [], total: 0, facets: [], meta: { available: false, message: 'Banco do Radar ainda nao foi migrado neste ambiente.' } };
    }
    const baseFilters = { ...filters, filterKey: '', status: '' };
    const availabilityFilters = this.normalizeRadarFilters({
      ...input,
      engine: undefined,
      city: '',
      state: '',
      segment: '',
      filterKey: '',
      status: '',
    });
    let availableRows = await this.queryRadarRowsForCompany(context.companyId, availabilityFilters, {
      limit: 2000,
      includeHidden: filters.includeHidden,
      availableOnly: vitrine,
    });
    let allRows = await this.queryRadarRowsForCompany(context.companyId, baseFilters, {
      limit: 2000,
      includeHidden: filters.includeHidden,
      availableOnly: vitrine,
    });
    // S7 LEAD-CENTRICO (07-pool-raiz.md, item 1): ponto de SELEÇÃO do Radar —
    // candidato com contato (telefone/e-mail) suprimido/resfriando por OUTRA
    // empresa (marquinha global) some da vitrine/funil ANTES de virar card,
    // contador logado (visibilidade porta-a-porta). Não toca o COUNT em SQL
    // de `totalAvailable` (buildRadarWhere não conhece a marquinha ainda —
    // limitação conhecida, documentada no relatório do sprint); a lista
    // efetivamente exibida (allRows/availableRows/facets/paginação) já sai
    // limpa.
    if (allRows.length || availableRows.length) {
      const suppression = new VendasContactSuppressionService(this.prisma);
      const [allFiltered, availableFiltered] = await Promise.all([
        suppression.filterSuppressed(allRows, (row: any) => ({ phone: row?.phoneDigits || row?.phone, email: row?.email })),
        suppression.filterSuppressed(availableRows, (row: any) => ({ phone: row?.phoneDigits || row?.phone, email: row?.email })),
      ]);
      if (allFiltered.suppressedCount > 0) {
        this.logger.log(`[radar-suppression] vitrine: ${allFiltered.suppressedCount} lead(s) pulado(s) por marquinha global (company=${context.companyId}).`);
      }
      allRows = allFiltered.allowed;
      availableRows = availableFiltered.allowed;
    }
    const filteredRows = filters.filterKey || filters.status || filters.ddd || filters.source || filters.scoreRange
      ? this.filterRadarRowsInMemory(allRows, filters)
      : allRows;
    // CONTAGEM REAL (PR17062026046-C): o total exibido vinha de filteredRows.length, mas o
    // read é capado em 1000 linhas (top score) — então o número TRAVAVA e não subia quando a
    // lagoa crescia (import). Quando NÃO há filtro só-em-memória (filterKey/status/ddd/source/
    // scoreRange), conta de verdade no SQL (sem teto). A página exibida segue lida/capada;
    // só o total honesto (meta.totalAvailable) vira count. Falha de count → cai no length.
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const hasInMemoryOnlyFilter = Boolean(filters.filterKey || filters.status || filters.ddd || filters.source || filters.scoreRange);
    const totalAvailable = hasInMemoryOnlyFilter
      ? filteredRows.length
      : await (this.prisma as any).radarLeadPool.count({
          where: this.buildRadarWhere(baseFilters, context.companyId, {
            availableOnly: vitrine,
            ownershipEnabled,
            requirePhone: false,
          }),
        }).catch(() => filteredRows.length);
    // MIX de preferências (dono 14/06): quando o usuário NÃO pediu um segmento
    // específico, sobe pro topo o que casa com o ramo da empresa ∪ a preferência
    // dos vendedores. É BOOST (reordena), não filtro — não esconde nada.
    const preferenceSet = filters.normalizedSegment
      ? new Set<string>()
      : await this.resolveRadarPreferenceSegments(user, context);
    const orderedRows = this.boostRadarRowsByPreference(filteredRows, preferenceSet);
    const offset = (filters.page - 1) * filters.limit;
    const pageRows = orderedRows.slice(offset, offset + filters.limit);
    // FIX-ENRICHMENT-STATUS-SHELF (05/07): status da fila SÓ da página exibida (nunca das até
    // 2000 linhas de allRows/filteredRows) — o shelf pinta o badge "enriquecendo agora" por card.
    const enrichmentQueueStatusById = await this.fetchRadarLeadEnrichmentQueueStatusMap(
      pageRows.map((row: any) => String(row?.id || '')),
    );
    const includeSmartFields = await this.canUseRadarSmartLeadFields(context.companyId);
    const enrichmentSummary = this.buildRadarEnrichmentSummary(allRows);
    // VENDAS-REFAB S3 (04/07) — "Total no Brasil"/"Leads na base (Radar)" liam SÓ o pool local
    // (radarLeadPool, ~893 aqui em cima) fingindo ser a base RFB inteira (~28M). Descoberta =
    // LISTA (CnpjPublicCompany) + WEB enriquece — o número "disponível/total" tem que vir da
    // LISTA, filtrado pelo mesmo filtro ativo (cidade/UF/segmento/CNAE/contato). Só computa na
    // VITRINE (é isso que o front pergunta pro topo do Vendas/Dashboard); nunca lança, nunca
    // inventa número fixo — sem a base carregada neste ambiente, `baseAvailable=false` e quem
    // consome cai pro `totalAvailable` do pool (fallback já existente no front).
    const baseCount = vitrine && this.cnpjBaseQuery
      ? await this.cnpjBaseQuery.countBase(buildCnpjBaseQueryInputFromRadarFilters(filters)).catch(() => ({ available: false, count: null }))
      : { available: false, count: null };
    return {
      items: pageRows.map((row) => this.buildRadarLeadPublic(row, {
        includeSmartFields,
        maskContact: vitrine,
        viewerCompanyId: context.companyId,
        ownershipEnabled,
        enrichmentQueueStatus: enrichmentQueueStatusById.get(String(row?.id || '')) ?? null,
      })),
      total: filteredRows.length,
      facets: this.buildRadarFacets(allRows),
      meta: {
        available: true,
        vitrine,
        totalAvailable,
        // Contrato S4: baseAvailable=true => baseTotal é o número REAL da base 28M (RFB) já
        // filtrado (cidade/UF/segmento-ou-CNAE/tem-telefone/tem-celular). false => base não
        // carregada neste ambiente (ex.: local); front deve exibir totalAvailable como fallback.
        baseAvailable: baseCount.available,
        baseTotal: baseCount.count,
        page: filters.page,
        limit: filters.limit,
        filterKey: filters.filterKey || null,
        preferenceBoostApplied: preferenceSet.size > 0,
        availableFilters: this.buildRadarAvailableFilters(availableRows),
        enrichmentSummary,
        whatsappVerified: enrichmentSummary.whatsappVerified,
        filteredOut: enrichmentSummary.discardedOrBlocked,
      },
    };
  }

  /**
   * VENDAS-REFAB item 4 (04/07) — filtro AVANÇADO do "Buscar empresas" sobre a base 28M
   * (CnpjPublicCompany), aberto pra QUALQUER usuário da empresa (admin OU vendedor — self-serve
   * puro do item 5, ninguém precisa pedir pro Master). Só valida que existe empresa/usuário
   * (resolveContext) — a base fria é leitura pública, sem gravação, sem dado sensível de outra
   * empresa (dedup `excluirJaEntregues` já cruza por phoneDigits no RadarLeadPool, sem vazar
   * card de outra empresa: só usa a existência do telefone, nunca o conteúdo do card alheio).
   * Mesmo CnpjBaseQueryInput/query() do painel do Master (`modules/owner/cnpj-base/query`) —
   * único CONTRATO, dois pontos de entrada (ver docs/PLANEJAMENTOS/VENDAS-REFAB/CONTRATO-FILTRO.md).
   */
  async queryCnpjBaseForUser(user: any, input: CnpjBaseQueryInput) {
    const context = this.resolveContext(user);
    // GUARDRAILS S3 — throttle da busca grátis (anti-scraper varrendo a base 28M em loop).
    this.assertRadarSearchRateAllowed(user, context.companyId);
    if (!this.cnpjBaseQuery) {
      throw new ServiceUnavailableException('Base Receita (CnpjPublicCompany) indisponivel neste processo.');
    }
    return this.cnpjBaseQuery.query(input || {});
  }

  /**
   * GUARDRAILS S3 — janela deslizante por empresa (RadarSearchRateLimiterService). Master
   * (isSystemMaster) e a empresa-container platform_infra NUNCA são throttled. Fail-open: erro
   * interno no throttle nunca bloqueia a busca (só o 429 legítimo do próprio guardrail sobe).
   */
  private assertRadarSearchRateAllowed(user: any, companyId: number) {
    try {
      if (Boolean(user?.isSystemMaster)) return;
      const companyKind = String(user?.company?.companyKind || '').trim().toLowerCase();
      if (companyKind === 'platform_infra') return;
      const result = RadarSearchRateLimiterService.checkAndConsume(companyId);
      if (!result.allowed) {
        throw new HttpException('Muitas buscas em sequência. Aguarde um instante.', 429);
      }
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      console.warn(`radar_search_rate_limit_guardrail_failed company=${companyId} error=${String(error?.message || error)}`);
    }
  }

  async getRadarLeadForUser(user: any, radarLeadId: string) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: {
        companyStates: { where: { companyId: context.companyId }, take: 1 },
        events: {
          where: { OR: [{ companyId: context.companyId }, { companyId: null }] },
          orderBy: { createdAt: 'desc' },
          take: 80,
        },
      },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    // LIMPEZA-DESTRUTIVA L3: card e da EMPRESA — qualquer papel (vendedor, admin, master)
    // pode ver o detalhe, independente de quem esta como "Responsável" (assignedUserId).
    const [enrichedRow] = await this.ensureRadarRowsEnriched([row]);
    const leadRow = enrichedRow || row;
    const includeSmartFields = await this.canUseRadarSmartLeadFields(context.companyId);
    // Contato PULL-GATED (06/07): o detalhe :id devolvia contato cheio de QUALQUER lead do
    // pool sem débito nem checagem de posse (furo de scraping por id). Agora mascara salvo
    // se a empresa já é dona (puxou) — mesma regra da lista/database, centralizada no presenter.
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    // FIX-ENRICHMENT-STATUS-SHELF (05/07): mesmo lookup da listagem, só que pra 1 card (detalhe).
    const enrichmentQueueStatusById = await this.fetchRadarLeadEnrichmentQueueStatusMap([String(leadRow?.id || '')]);
    return {
      item: this.buildRadarLeadPublic(leadRow, {
        includeSmartFields,
        viewerCompanyId: context.companyId,
        ownershipEnabled,
        enrichmentQueueStatus: enrichmentQueueStatusById.get(String(leadRow?.id || '')) ?? null,
      }),
      events: (leadRow.events || []).map((event: any) => ({
        id: event.id,
        eventType: event.eventType,
        note: event.note || null,
        statusFrom: event.statusFrom || null,
        statusTo: event.statusTo || null,
        createdByUserId: event.createdByUserId || null,
        createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : null,
      })),
    };
  }

  /**
   * CHIP E3 (05/07) — status de IA por lote de leads: "na fila da IA"/"enriquecendo agora"/
   * "enriquecido" pra vitrine (leads/page.client.tsx) e estoque de Vendas. RBAC: só devolve
   * status dos leadIds que pertencem ao tenant do usuário — mesmo filtro ownerCompanyId/
   * companyStates do getRadarLeadForUser, aplicado aqui em LOTE (1 findMany, não N chamadas).
   * Flag da fila OFF (RadarPonteStatusService.enabled()) → 'none' pra tudo, sem tocar o banco
   * de missões (degrade invisível — a UI do cliente não muda enquanto a ponte não for ligada).
   */
  async getRadarAiStatusForUser(user: any, leadIds: string[]) {
    const context = this.resolveContext(user);
    const requested = Array.from(new Set((leadIds || []).map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 200);
    if (!requested.length) return { items: {} };
    if (!(await this.supportsRadarPersistence())) return { items: {} };

    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { id: { in: requested } },
      select: {
        id: true,
        ownerCompanyId: true,
        companyStates: { where: { companyId: context.companyId }, select: { id: true }, take: 1 },
      },
    }).catch(() => []);

    // A vitrine global já expõe estes IDs e precisa mostrar honestamente que o card ainda
    // está em liberação. Cards possuídos continuam limitados ao dono ou a um vínculo
    // RadarLeadCompanyState explícito do tenant.
    const allowedIds = (Array.isArray(rows) ? rows : [])
      .filter((row: any) => {
        const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
        const hasTenantState = Array.isArray(row?.companyStates) && row.companyStates.length > 0;
        return !ownerCompanyId || ownerCompanyId === context.companyId || hasTenantState;
      })
      .map((row: any) => String(row.id));

    if (!allowedIds.length) return { items: {} };
    const items = await this.getRadarPonteStatus().getStatusForLeads(allowedIds);
    return { items };
  }

  private async enrichRadarLeadViaLeadPlusEngine(
    context: SearchExecutionContext,
    row: any,
    filters?: Pick<NormalizedRadarFilters, 'preferredChannels' | 'requiredChannels'> | null,
  ) {
    let lease: HbxEngineLease | null = null;
    let engineUrl = this.getHbxScrapingEngineUrl();
    const runKey = `lead-plus-enrich:${context.companyId}:${context.userId}:${row?.id || Date.now()}`;
    try {
      if (await this.canAcquireHbxEngineFromPool()) {
        lease = await this.getEnginePool().acquireEngine(
          runKey,
          context.companyId,
          context.userId,
          { purpose: 'lead_plus_enrichment' },
        );
        if (lease) engineUrl = lease.url;
      }
      const currentWebsite = this.isBlockedLeadOfficialWebsite(row?.website) || !websiteHostLooksCompatibleWithLead(row, row?.website) ? null : row?.website || null;
      const body = {
        name: row?.name || '',
        phone: row?.phone || '',
        phoneDigits: row?.phoneDigits || '',
        city: row?.city || '',
        state: row?.state || '',
        segment: row?.segment || row?.businessCategory || '',
        website: currentWebsite,
        email: row?.email || null,
        instagramUrl: row?.instagramUrl || null,
        facebookUrl: row?.facebookUrl || null,
        preferredChannels: ['instagram', 'facebook', 'website', 'email'],
        requiredChannels: [],
        timeBudgetSeconds: 24,
        ...resolveEnrichmentPaidFlags(),
      };
      await this.recordVendasRadarEnrichmentStatus(context, row, 'processing', {
        website: body.website || null,
        instagramUrl: body.instagramUrl || null,
        facebookUrl: body.facebookUrl || null,
      });
      const timeoutMs = Math.max(5_000, this.getHbxBatchTimeoutMs());
      const response = await fetch(`${String(engineUrl).replace(/\/+$/, '')}/enrich-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.detail || payload?.message || `Lead+ enrichment HTTP ${response.status}`));
      }
      return payload && typeof payload === 'object' ? payload : null;
    } catch (error: any) {
      if (lease) await this.getEnginePool().markEngineBatchError(lease.engineId, error).catch(() => null);
      await this.recordVendasRadarEnrichmentStatus(context, row, 'failed', {
        error: String(error?.message || error).slice(0, 180),
      });
      this.logger.warn(`[lead-plus-enrichment] falha lead=${row?.id || 'unknown'}: ${String(error?.message || error)}`);
      return null;
    } finally {
      if (lease) await this.getEnginePool().releaseEngine(lease.engineId).catch(() => null);
    }
  }

  private isBlockedLeadOfficialWebsite(value: any) {
    const normalized = String(value || '').trim().toLowerCase();
    return Boolean(normalized && RADAR_BLOCKED_OFFICIAL_WEBSITE_DOMAINS.some((domain) => normalized.includes(domain)));
  }

  private compactLeadPlusEnrichmentPayload(leadPlus: any) {
    if (!leadPlus || typeof leadPlus !== 'object') return null;
    const stats = this.parseMaybeJsonObject(leadPlus?.stats);
    return {
      rating: leadPlus?.rating == null ? null : Number(leadPlus.rating),
      reviews: safeInteger(leadPlus?.reviews),
      address: String(leadPlus?.address || '').trim() || null,
      website: String(leadPlus?.website || '').trim() || null,
      email: String(leadPlus?.email || '').trim() || null,
      emailStatus: String(leadPlus?.emailStatus || '').trim() || null,
      emailSource: String(leadPlus?.emailSource || '').trim() || null,
      emailConfidence: safeInteger(leadPlus?.emailConfidence),
      instagramUrl: String(leadPlus?.instagramUrl || '').trim() || null,
      facebookUrl: String(leadPlus?.facebookUrl || '').trim() || null,
      googleMapsUrl: String(leadPlus?.googleMapsUrl || '').trim() || null,
      cnpj: String(leadPlus?.cnpj || '').trim() || null,
      socialStatus: String(leadPlus?.socialStatus || '').trim() || null,
      socialConfidence: safeInteger(leadPlus?.socialConfidence),
      stats: {
        identity: stats?.identity || null,
        processed: safeInteger(stats?.processed),
        enriched: safeInteger(stats?.enriched),
        missingRequired: safeInteger(stats?.missingRequired),
        elapsedMs: safeInteger(stats?.elapsedMs),
      },
    };
  }

  private buildCompactVendasEnrichmentJson(leadRow: any, quality: any, qualityV2: any, delivery: any) {
    const enrichment = parseJsonObject(leadRow?.enrichmentJson);
    const signals = parseJsonObject(enrichment?.signals);
    const metadata = parseJsonObject(leadRow?.metadataJson);
    return {
      version: enrichment?.version || enrichment?.enrichmentVersion || RADAR_LEAD_ENRICHMENT_VERSION,
      whatsappStatus: enrichment?.whatsappStatus || null,
      emailStatus: leadRow?.emailStatus || enrichment?.emailStatus || signals?.emailStatus || null,
      emailSource: leadRow?.emailSource || enrichment?.emailSource || null,
      socialStatus: leadRow?.socialStatus || enrichment?.socialStatus || null,
      socialConfidence: safeInteger(leadRow?.socialConfidence || enrichment?.socialConfidence),
      websiteStatus: leadRow?.websiteStatus || enrichment?.websiteStatus || null,
      recommendedChannel: leadRow?.recommendedChannel || enrichment?.recommendedChannel || signals?.recommendedChannel || null,
      quality: quality || null,
      qualityV2: qualityV2 || null,
      delivery: delivery || null,
      emails: Array.isArray(metadata?.emails) ? metadata.emails.slice(0, 3) : [],
      phones: Array.isArray(metadata?.phones) ? metadata.phones.slice(0, 3) : [],
      phonesWhatsapp: metadata?.phonesWhatsapp && typeof metadata.phonesWhatsapp === 'object'
        ? metadata.phonesWhatsapp
        : {},
      signals: {
        recommendedChannel: signals?.recommendedChannel || leadRow?.recommendedChannel || null,
        painType: signals?.painType || leadRow?.painType || null,
        opportunityReason: signals?.opportunityReason || leadRow?.opportunityReason || null,
      },
    };
  }

  private async resolveVendasLeadIdForRadarRow(context: SearchExecutionContext, row: any) {
    return this.getRadarPostDeliveryVendasUpdate().resolveVendasLeadId({
      prisma: this.prisma,
      context,
      row,
    });
  }

  private async recordVendasRadarEnrichmentStatus(
    context: SearchExecutionContext,
    row: any,
    status: 'queued' | 'processing' | 'completed' | 'failed',
    payload: Record<string, any> = {},
  ) {
    const result = await this.getRadarPostDeliveryVendasUpdate().recordEnrichmentStatus({
      prisma: this.prisma,
      context,
      row,
      status,
      payload,
    });
    if (result.status === 'partial_error') {
      await this.markRadarPostDeliveryUpdateRetryable(row?.id, result.error || 'Falha ao registrar status de enriquecimento.', 'post_delivery_update');
    }
  }

  private async syncVendasLeadAfterRadarEnrichment(
    context: SearchExecutionContext,
    row: any,
    data: Record<string, any>,
    enrichment: any,
    leadPlus: any,
  ) {
    const result = await this.getRadarPostDeliveryVendasUpdate().syncAfterRadarEnrichment({
      prisma: this.prisma,
      context,
      row,
      data,
      enrichment,
      leadPlus,
      compactEnrichment: this.buildCompactVendasEnrichmentJson({ ...row, ...data, enrichmentJson: enrichment.enrichmentJson }, null, null, null),
    });
    if (result.status === 'partial_error') {
      await this.markRadarPostDeliveryUpdateRetryable(row?.id, result.error || 'Falha ao atualizar Vendas apos enriquecimento.', 'post_delivery_update');
    } else if (result.status === 'completed') {
      await this.markRadarPostDeliveryUpdateCompleted(row?.id);
    }
  }

  private async applyLeadPlusEnrichmentToRadarRow(
    context: SearchExecutionContext,
    row: any,
    leadPlus: any,
    filters?: NormalizedRadarFilters | null,
  ) {
    if (!row?.id || !leadPlus || typeof leadPlus !== 'object') return row;
    const now = new Date();
    const latestRow = await this.loadLatestRadarLeadForEnrichmentMerge(row);
    const baseRow = this.mergeLatestRadarLeadForEnrichment(row, latestRow);
    const metadata = this.parseMaybeJsonObject(baseRow?.metadataJson);
    const companyState = Array.isArray(baseRow?.companyStates) && baseRow.companyStates.length ? baseRow.companyStates[0] : null;
    const protectedStatus = this.isRadarProtectedStatus(companyState?.status || baseRow?.status);
    const existingEmail = normalizeBusinessEmail(baseRow.email) || null;
    const leadPlusEmail = normalizeBusinessEmail(leadPlus?.email) || null;
    const leadPlusEmailStatus = ['confirmed', 'probable', 'missing', 'invalid', 'unverified'].includes(String(leadPlus?.emailStatus || ''))
      ? String(leadPlus.emailStatus)
      : baseRow.emailStatus;
    const leadPlusEmailSource = ['website', 'maps', 'inferred', 'manual', 'none'].includes(String(leadPlus?.emailSource || ''))
      ? String(leadPlus.emailSource)
      : baseRow.emailSource;
    const existingWebsite = this.isBlockedLeadOfficialWebsite(baseRow.website) || !websiteHostLooksCompatibleWithLead(baseRow, baseRow.website) ? null : baseRow.website || null;
    const leadPlusWebsiteRaw = String(leadPlus?.website || '').trim() || null;
    const leadPlusWebsite = leadPlusWebsiteRaw
      && !this.isBlockedLeadOfficialWebsite(leadPlusWebsiteRaw)
      && websiteHostLooksCompatibleWithLead({ ...baseRow, website: leadPlusWebsiteRaw }, leadPlusWebsiteRaw)
      ? leadPlusWebsiteRaw
      : null;
    const existingInstagram = String(baseRow.instagramUrl || '').trim()
      && !looksLikeThirdPartySocialProfile(baseRow.instagramUrl)
      && socialProfileLooksCompatibleWithLead(baseRow, baseRow.instagramUrl)
      ? String(baseRow.instagramUrl).trim()
      : null;
    const existingFacebook = String(baseRow.facebookUrl || '').trim()
      && !looksLikeThirdPartySocialProfile(baseRow.facebookUrl)
      && socialProfileLooksCompatibleWithLead(baseRow, baseRow.facebookUrl)
      ? String(baseRow.facebookUrl).trim()
      : null;
    const leadPlusInstagramRaw = String(leadPlus?.instagramUrl || '').trim();
    const leadPlusFacebookRaw = String(leadPlus?.facebookUrl || '').trim();
    const leadPlusInstagram = leadPlusInstagramRaw
      && !looksLikeThirdPartySocialProfile(leadPlusInstagramRaw)
      && socialProfileLooksCompatibleWithLead(baseRow, leadPlusInstagramRaw)
      ? leadPlusInstagramRaw
      : null;
    const leadPlusFacebook = leadPlusFacebookRaw
      && !looksLikeThirdPartySocialProfile(leadPlusFacebookRaw)
      && socialProfileLooksCompatibleWithLead(baseRow, leadPlusFacebookRaw)
      ? leadPlusFacebookRaw
      : null;
    const leadPlusSocialStatus = leadPlusInstagram || leadPlusFacebook || existingInstagram || existingFacebook ? 'found' : baseRow.socialStatus;
    const leadPlusRating = leadPlus?.rating == null ? baseRow.rating ?? null : Number(leadPlus.rating);
    const leadPlusReviews = leadPlus?.reviews == null ? safeInteger(baseRow.reviews) : safeInteger(leadPlus.reviews);
    const leadPlusAddress = String(leadPlus?.address || '').trim() || baseRow.address || null;
    const leadPlusGoogleMapsUrl = String(leadPlus?.googleMapsUrl || '').trim() || baseRow.googleMapsUrl || null;
    const requiredChannels = filters ? this.requiredChannelsForInput(filters) : [];
    const enrichment = buildRadarLeadEnrichment({
      ...baseRow,
      email: leadPlusEmail || existingEmail,
      emailStatus: leadPlusEmailStatus,
      emailSource: leadPlusEmailSource,
      emailConfidence: safeInteger(leadPlus?.emailConfidence || baseRow.emailConfidence),
      website: leadPlusWebsite || existingWebsite,
      websiteStatus: leadPlusWebsite || existingWebsite ? 'present' : 'none',
      rating: leadPlusRating,
      reviews: leadPlusReviews,
      address: leadPlusAddress,
      instagramUrl: leadPlusInstagram || existingInstagram,
      facebookUrl: leadPlusFacebook || existingFacebook,
      socialStatus: leadPlusSocialStatus,
      socialConfidence: safeInteger(leadPlus?.socialConfidence || baseRow.socialConfidence),
      googleMapsUrl: leadPlusGoogleMapsUrl,
      companyStatus: companyState?.status || baseRow.status,
      rawPayload: {
        ...metadata,
        leadPlusEnrichment: this.compactLeadPlusEnrichmentPayload(leadPlus),
        cnpj: String(leadPlus?.cnpj || '').trim() || metadata?.cnpj || null,
        requiredChannels,
      },
      salesProfile: filters ? this.buildLeadQualitySalesProfileFromFilters(filters) : null,
      now,
    });
    const data = {
      email: enrichment.email || existingEmail || null,
      emailStatus: enrichment.emailStatus,
      emailSource: enrichment.emailSource,
      emailConfidence: enrichment.emailConfidence,
      address: leadPlusAddress,
      rating: leadPlusRating,
      reviews: leadPlusReviews,
      website: leadPlusWebsite || existingWebsite || null,
      websiteStatus: leadPlusWebsite || existingWebsite ? 'present' : 'none',
      instagramUrl: enrichment.instagramUrl || existingInstagram || null,
      facebookUrl: enrichment.facebookUrl || existingFacebook || null,
      socialStatus: enrichment.socialStatus,
      socialConfidence: enrichment.socialConfidence,
      googleMapsUrl: enrichment.googleMapsUrl || leadPlusGoogleMapsUrl || baseRow.googleMapsUrl || null,
      businessCategory: enrichment.businessCategory || baseRow.businessCategory || null,
      openingHoursStatus: enrichment.openingHoursStatus || baseRow.openingHoursStatus || null,
      recommendedChannel: protectedStatus ? 'discard' : enrichment.recommendedChannel,
      painType: enrichment.painType,
      painLabel: enrichment.painLabel,
      painPitch: enrichment.painPitch,
      opportunityReason: enrichment.opportunityReason || baseRow.opportunityReason || null,
      enrichmentJson: enrichment.enrichmentJson,
      enrichmentScore: protectedStatus ? 0 : enrichment.enrichmentScore,
      enrichmentConfidence: enrichment.enrichmentConfidence,
      lastEnrichedAt: enrichment.lastEnrichedAt,
      enrichmentVersion: enrichment.enrichmentVersion,
      metadataJson: JSON.stringify({
        ...metadata,
        cnpj: String(leadPlus?.cnpj || '').trim() || metadata?.cnpj || null,
        requiredSocialEnrichment: {
          key: requiredChannels.join(','),
          attemptedAt: now.toISOString(),
          found: Boolean(enrichment.instagramUrl || enrichment.facebookUrl),
        },
        leadPlusSignalEnrichment: {
          key: this.leadPlusSignalEnrichmentKey(filters || null),
          attemptedAt: now.toISOString(),
          found: Boolean(enrichment.instagramUrl || enrichment.facebookUrl || enrichment.email || leadPlusWebsite || existingWebsite),
        },
      }),
      lastSeenAt: now,
    };
    await (this.prisma as any).radarLeadPool.update({ where: { id: baseRow.id }, data }).catch((error: any) => {
      this.logger.warn(`[radar-enrichment] falha ao salvar social lead=${baseRow.id}: ${String(error?.message || error)}`);
    });
    await this.syncVendasLeadAfterRadarEnrichment(context, baseRow, data, enrichment, leadPlus);
    return { ...baseRow, ...data };
  }

  private recentRequiredSocialAttempt(row: any, filters: NormalizedRadarFilters) {
    const metadata = this.parseMaybeJsonObject(row?.metadataJson);
    const attempt = this.parseMaybeJsonObject(metadata?.requiredSocialEnrichment);
    const key = this.requiredChannelsForInput(filters).join(',');
    const attemptedAt = Date.parse(String(attempt?.attemptedAt || ''));
    return Boolean(key && attempt?.key === key && attemptedAt && Date.now() - attemptedAt < 10 * 60 * 1000);
  }

  private leadPlusSignalEnrichmentKey(filters?: Pick<NormalizedRadarFilters, 'preferredChannels' | 'requiredChannels'> | null) {
    const preferred = this.normalizeRadarChannels(filters?.preferredChannels).sort().join('+') || 'default';
    const required = this.normalizeRadarChannels(filters?.requiredChannels).sort().join('+') || 'none';
    return `${preferred}:${required}`;
  }

  private recentLeadPlusSignalAttempt(row: any, filters?: NormalizedRadarFilters | null) {
    const metadata = this.parseMaybeJsonObject(row?.metadataJson);
    const attempt = this.parseMaybeJsonObject(metadata?.leadPlusSignalEnrichment);
    const attemptedAt = Date.parse(String(attempt?.attemptedAt || ''));
    return Boolean(
      attempt?.key === this.leadPlusSignalEnrichmentKey(filters || null)
      && attemptedAt
      && Date.now() - attemptedAt < 10 * 60 * 1000,
    );
  }

  private hasLeadPlusSignal(row: any) {
    return Boolean(
      String(row?.instagramUrl || '').trim()
      || String(row?.facebookUrl || '').trim()
      || String(row?.email || '').trim()
      || String(row?.website || '').trim()
    );
  }

  private hasReusableOnDemandLeadPlusEnrichment(row: any) {
    const metadata = this.parseMaybeJsonObject(row?.metadataJson);
    const manualAttempt = this.parseMaybeJsonObject(metadata?.leadPlusOnDemandEnrichment);
    if (manualAttempt?.attemptedAt) return true;
    const existingInstagram = String(row?.instagramUrl || '').trim();
    const existingFacebook = String(row?.facebookUrl || '').trim();
    return Boolean(
      existingInstagram
        && !looksLikeThirdPartySocialProfile(existingInstagram)
        && socialProfileLooksCompatibleWithLead(row, existingInstagram),
    ) || Boolean(
      existingFacebook
        && !looksLikeThirdPartySocialProfile(existingFacebook)
        && socialProfileLooksCompatibleWithLead(row, existingFacebook),
    );
  }

  private async assertCanUseOnDemandRadarEnrichment(context: SearchExecutionContext) {
    const access = await this.getRadarPremiumAccessForCompany(context.companyId);
    if (!access.active) {
      throw new ForbiddenException({
        code: 'COMPANY_PAID_ACCESS_REQUIRED',
        message: 'Regularize o plano para usar enriquecimento premium do Radar.',
        redirectTo: '/planos?intent=radar_premium',
      });
    }
    if (!access.canUsePremium) {
      throw new ForbiddenException({
        code: 'RADAR_PREMIUM_PLAN_REQUIRED',
        message: 'Enriquecimento com Instagram, Facebook, site e email está disponível no HBX Lead Plus ou superior.',
        redirectTo: '/planos?intent=radar_premium',
        requiredPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
        currentPlanKey: access.planKey,
      });
    }
    const usage = await this.commercialUsageLimits?.getUsageSnapshot(context.companyId, context.userId).catch(() => null);
    const enrichment = usage?.enrichment || {};
    if (usage && Number(enrichment.dailyRemaining ?? enrichment.remaining ?? 0) <= 0) {
      throw new ConflictException({
        code: 'RADAR_ENRICHMENT_QUOTA_REACHED',
        message: 'Créditos de enriquecimento de hoje acabaram. Cards novos seguem básicos até o reset diário.',
        usage,
      });
    }
    return { access, usage };
  }

  private async enrichRowsForLeadPlusSignals(
    context: SearchExecutionContext,
    rows: any[],
    filters: NormalizedRadarFilters,
    maxRows: number,
  ) {
    if (!Array.isArray(rows) || !rows.length || maxRows <= 0) return rows;
    let processed = 0;
    const enrichedRows: any[] = [];
    for (const row of rows) {
      if (!row?.id || processed >= maxRows) {
        enrichedRows.push(row);
        continue;
      }
      if (this.hasLeadPlusSignal(row) && this.recentLeadPlusSignalAttempt(row, filters)) {
        enrichedRows.push(row);
        continue;
      }
      processed += 1;
      const leadPlus = await this.enrichRadarLeadViaLeadPlusEngine(context, row, filters);
      enrichedRows.push(await this.applyLeadPlusEnrichmentToRadarRow(context, row, leadPlus, filters));
    }
    return enrichedRows;
  }

  private scheduleLeadPlusSignalEnrichment(
    context: SearchExecutionContext,
    rows: any[],
    filters: NormalizedRadarFilters,
    maxRows: number,
    reason: string,
  ) {
    if (!Array.isArray(rows) || !rows.length || maxRows <= 0) return;
    const ids = rows
      .slice(0, Math.max(1, maxRows))
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean);
    if (!ids.length) return;
    const key = `${context.companyId}:${this.leadPlusSignalEnrichmentKey(filters)}:${ids.join('|')}`;
    if (this.leadPlusSignalEnrichmentInFlight.has(key)) return;
    this.leadPlusSignalEnrichmentInFlight.add(key);
    setTimeout(() => {
      void this.enrichRowsForLeadPlusSignals(context, rows, filters, maxRows)
        .catch((error: any) => {
          this.logger.warn(`[radar-enrichment] enriquecimento em segundo plano falhou (${reason}): ${String(error?.message || error)}`);
        })
        .finally(() => {
          this.leadPlusSignalEnrichmentInFlight.delete(key);
        });
    }, 0);
  }

  private async enrichRowsForRequiredSocialChannels(
    context: SearchExecutionContext,
    rows: any[],
    filters: NormalizedRadarFilters,
    maxRows: number,
    stopAfterMatches = 0,
  ) {
    if (!this.hasRequiredEnrichmentChannelsFilter(filters) || !rows.length || maxRows <= 0) return rows;
    const candidates = rows
      .filter((row) => row?.id && !this.matchesRadarChannelFilters(row, filters) && !this.recentRequiredSocialAttempt(row, filters))
      .slice(0, Math.max(1, maxRows));
    if (!candidates.length) return rows;

    const enrichedById = new Map<string, any>();
    let matchedCount = rows.filter((row) => this.matchesRadarChannelFilters(row, filters)).length;
    const required = this.requiredChannelsForInput(filters);
    const strictSocialWebsite = required.includes('website') && required.some((channel) => channel === 'instagram' || channel === 'facebook');
    const concurrency = Math.min(strictSocialWebsite ? 2 : 4, Math.max(1, candidates.length));
    for (let index = 0; index < candidates.length; index += concurrency) {
      const chunk = candidates.slice(index, index + concurrency);
      const enrichedChunk = await Promise.all(chunk.map(async (row) => {
        const leadPlus = await this.enrichRadarLeadViaLeadPlusEngine(context, row, filters);
        return this.applyLeadPlusEnrichmentToRadarRow(context, row, leadPlus, filters);
      }));
      for (const enriched of enrichedChunk) {
        if (enriched?.id) enrichedById.set(String(enriched.id), enriched);
        if (enriched && this.matchesRadarChannelFilters(enriched, filters)) matchedCount += 1;
      }
      if (stopAfterMatches > 0 && matchedCount >= stopAfterMatches) break;
    }
    return rows.map((row) => enrichedById.get(String(row?.id || '')) || row);
  }

  private scheduleRequiredChannelEnrichment(
    context: SearchExecutionContext,
    rows: any[],
    filters: NormalizedRadarFilters,
    maxRows: number,
    reason: string,
  ) {
    if (!this.hasRequiredEnrichmentChannelsFilter(filters) || !Array.isArray(rows) || !rows.length || maxRows <= 0) return;
    const pendingRows = rows
      .filter((row) => row?.id && !this.matchesRadarChannelFilters(row, filters) && !this.recentRequiredSocialAttempt(row, filters))
      .slice(0, Math.max(1, maxRows));
    const ids = pendingRows.map((row) => String(row.id || '').trim()).filter(Boolean);
    if (!ids.length) return;
    const key = `${context.companyId}:${this.requiredChannelsForInput(filters).join('+')}:${ids.join('|')}`;
    if (this.requiredChannelEnrichmentInFlight.has(key)) return;
    this.requiredChannelEnrichmentInFlight.add(key);
    setTimeout(() => {
      void this.enrichRowsForRequiredSocialChannels(context, pendingRows, filters, maxRows)
        .catch((error: any) => {
          this.logger.warn(`[radar-enrichment] filtro obrigatorio em segundo plano falhou (${reason}): ${String(error?.message || error)}`);
        })
        .finally(() => {
          this.requiredChannelEnrichmentInFlight.delete(key);
        });
    }, 0);
  }

  async enrichRadarLeadForUser(user: any, radarLeadId: string) {
    const context = this.resolveContext(user);
    if (!this.canUseWebscrapingRole(user)) {
      throw new ForbiddenException({
        code: 'WEBSCRAPING_ROLE_BLOCKED',
        message: 'O enriquecimento do Radar fica restrito ao ADMIN da empresa.',
      });
    }
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: {
        companyStates: { where: { companyId: context.companyId }, take: 1 },
        events: {
          where: { companyId: context.companyId, eventType: 'whatsapp_checked' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }).catch(() => null);
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
    if (ownershipEnabled && ownerCompanyId && ownerCompanyId !== context.companyId) {
      throw new ForbiddenException('Este card pertence a outra empresa.');
    }
    await this.assertCanUseOnDemandRadarEnrichment(context);

    const now = new Date();
    const protectedStatus = this.isRadarProtectedStatus(row?.companyStates?.[0]?.status || row?.status);
    if (!protectedStatus && this.hasReusableOnDemandLeadPlusEnrichment(row)) {
      return {
        ok: true,
        cached: true,
        message: 'Card já enriquecido',
        item: this.buildRadarLeadPublic(row, { includeSmartFields: true }),
      };
    }
    let whatsappStatus = parseJsonObject(row?.enrichmentJson)?.whatsappStatus || null;
    const cachedWhatsappEvent = Array.isArray(row?.events) && row.events.length ? row.events[0] : null;
    const cachedAt = cachedWhatsappEvent?.createdAt instanceof Date ? cachedWhatsappEvent.createdAt.getTime() : 0;
    const cacheValid = cachedAt && now.getTime() - cachedAt < 30 * 24 * 60 * 60 * 1000;
    if (cacheValid) {
      whatsappStatus = parseJsonObject(cachedWhatsappEvent?.note)?.whatsappStatus || whatsappStatus;
    }

    const phoneDigits = normalizePhoneDigits(row.phoneDigits || row.phone);
    if (!protectedStatus && phoneDigits && !cacheValid && this.webwhatsBridge && (await this.canUseRadarWebwhatsCheck(context.companyId))) {
      try {
        const [lookup] = await this.radarCheckWhatsappNumbers([phoneDigits]);
        if (lookup) {
          whatsappStatus = lookup.exists ? 'confirmed' : 'missing';
          await this.recordRadarLeadEvent({
            leadId: row.id,
            companyId: context.companyId,
            userId: context.userId,
            eventType: 'whatsapp_checked',
            note: JSON.stringify({ whatsappStatus, phoneDigits, checkedAt: now.toISOString(), cacheDays: 30 }),
          });
        }
      } catch (error: any) {
        this.logger.warn(`[radar-enrichment] falha ao validar WhatsApp lead=${row.id}: ${String(error?.message || error)}`);
      }
    }

    const leadPlus = protectedStatus ? null : await this.enrichRadarLeadViaLeadPlusEngine(context, row);
    const latestRow = await this.loadLatestRadarLeadForEnrichmentMerge(row);
    const baseRow = this.mergeLatestRadarLeadForEnrichment(row, latestRow);
    const companyState = Array.isArray(baseRow.companyStates) && baseRow.companyStates.length ? baseRow.companyStates[0] : null;
    const existingEmail = normalizeBusinessEmail(baseRow.email) || null;
    const leadPlusEmail = normalizeBusinessEmail(leadPlus?.email) || null;
    const leadPlusEmailStatus = ['confirmed', 'probable', 'missing', 'invalid', 'unverified'].includes(String(leadPlus?.emailStatus || ''))
      ? String(leadPlus.emailStatus)
      : baseRow.emailStatus;
    const leadPlusEmailSource = ['website', 'maps', 'inferred', 'manual', 'none'].includes(String(leadPlus?.emailSource || ''))
      ? String(leadPlus.emailSource)
      : baseRow.emailSource;
    const existingInstagram = String(baseRow.instagramUrl || '').trim()
      && !looksLikeThirdPartySocialProfile(baseRow.instagramUrl)
      && socialProfileLooksCompatibleWithLead(baseRow, baseRow.instagramUrl)
      ? String(baseRow.instagramUrl).trim()
      : null;
    const existingFacebook = String(baseRow.facebookUrl || '').trim()
      && !looksLikeThirdPartySocialProfile(baseRow.facebookUrl)
      && socialProfileLooksCompatibleWithLead(baseRow, baseRow.facebookUrl)
      ? String(baseRow.facebookUrl).trim()
      : null;
    const leadPlusInstagramRaw = String(leadPlus?.instagramUrl || '').trim();
    const leadPlusFacebookRaw = String(leadPlus?.facebookUrl || '').trim();
    const existingWebsite = this.isBlockedLeadOfficialWebsite(baseRow.website) || !websiteHostLooksCompatibleWithLead(baseRow, baseRow.website) ? null : baseRow.website || null;
    const leadPlusWebsiteRaw = String(leadPlus?.website || '').trim() || null;
    const leadPlusWebsite = leadPlusWebsiteRaw
      && !this.isBlockedLeadOfficialWebsite(leadPlusWebsiteRaw)
      && websiteHostLooksCompatibleWithLead({ ...baseRow, website: leadPlusWebsiteRaw }, leadPlusWebsiteRaw)
      ? leadPlusWebsiteRaw
      : null;
    const leadPlusInstagram = leadPlusInstagramRaw
      && !looksLikeThirdPartySocialProfile(leadPlusInstagramRaw)
      && socialProfileLooksCompatibleWithLead(baseRow, leadPlusInstagramRaw)
      ? leadPlusInstagramRaw
      : null;
    const leadPlusFacebook = leadPlusFacebookRaw
      && !looksLikeThirdPartySocialProfile(leadPlusFacebookRaw)
      && socialProfileLooksCompatibleWithLead(baseRow, leadPlusFacebookRaw)
      ? leadPlusFacebookRaw
      : null;
    const leadPlusSocialStatus = leadPlusInstagram || leadPlusFacebook || existingInstagram || existingFacebook ? 'found' : baseRow.socialStatus;
    const leadPlusRating = leadPlus?.rating == null ? baseRow.rating ?? null : Number(leadPlus.rating);
    const leadPlusReviews = leadPlus?.reviews == null ? safeInteger(baseRow.reviews) : safeInteger(leadPlus.reviews);
    const leadPlusAddress = String(leadPlus?.address || '').trim() || baseRow.address || null;
    const leadPlusGoogleMapsUrl = String(leadPlus?.googleMapsUrl || '').trim() || baseRow.googleMapsUrl || null;
    const metadata = this.parseMaybeJsonObject(baseRow?.metadataJson);
    const enrichment = buildRadarLeadEnrichment({
      ...baseRow,
      email: leadPlusEmail || existingEmail,
      emailStatus: leadPlusEmailStatus,
      emailSource: leadPlusEmailSource,
      emailConfidence: safeInteger(leadPlus?.emailConfidence || baseRow.emailConfidence),
      website: leadPlusWebsite || existingWebsite,
      websiteStatus: leadPlusWebsite || existingWebsite ? 'present' : 'none',
      rating: leadPlusRating,
      reviews: leadPlusReviews,
      address: leadPlusAddress,
      instagramUrl: leadPlusInstagram || existingInstagram,
      facebookUrl: leadPlusFacebook || existingFacebook,
      socialStatus: leadPlusSocialStatus,
      socialConfidence: safeInteger(leadPlus?.socialConfidence || baseRow.socialConfidence),
      googleMapsUrl: leadPlusGoogleMapsUrl,
      companyStatus: companyState?.status || baseRow.status,
      whatsappStatus,
      rawPayload: {
        ...metadata,
        leadPlusEnrichment: this.compactLeadPlusEnrichmentPayload(leadPlus),
      },
      now,
    });
    const data = {
      email: enrichment.email || existingEmail || null,
      emailStatus: enrichment.emailStatus,
      emailSource: enrichment.emailSource,
      emailConfidence: enrichment.emailConfidence,
      address: leadPlusAddress,
      rating: leadPlusRating,
      reviews: leadPlusReviews,
      website: leadPlusWebsite || existingWebsite || null,
      websiteStatus: leadPlusWebsite || existingWebsite ? 'present' : 'none',
      instagramUrl: enrichment.instagramUrl || existingInstagram || null,
      facebookUrl: enrichment.facebookUrl || existingFacebook || null,
      socialStatus: enrichment.socialStatus,
      socialConfidence: enrichment.socialConfidence,
      googleMapsUrl: enrichment.googleMapsUrl || leadPlusGoogleMapsUrl || baseRow.googleMapsUrl || null,
      businessCategory: enrichment.businessCategory || baseRow.businessCategory || null,
      openingHoursStatus: enrichment.openingHoursStatus || baseRow.openingHoursStatus || null,
      recommendedChannel: protectedStatus ? 'discard' : enrichment.recommendedChannel,
      painType: enrichment.painType,
      painLabel: enrichment.painLabel,
      painPitch: enrichment.painPitch,
      opportunityReason: enrichment.opportunityReason || baseRow.opportunityReason || null,
      enrichmentJson: enrichment.enrichmentJson,
      enrichmentScore: protectedStatus ? 0 : enrichment.enrichmentScore,
      enrichmentConfidence: enrichment.enrichmentConfidence,
      lastEnrichedAt: enrichment.lastEnrichedAt,
      enrichmentVersion: enrichment.enrichmentVersion,
      metadataJson: JSON.stringify({
        ...metadata,
        cnpj: String(leadPlus?.cnpj || '').trim() || metadata?.cnpj || null,
        leadPlusOnDemandEnrichment: {
          priority: ['instagram', 'facebook', 'website', 'email'],
          attemptedAt: now.toISOString(),
          found: Boolean(enrichment.instagramUrl || enrichment.facebookUrl || leadPlusWebsite || existingWebsite || enrichment.email),
          instagram: Boolean(enrichment.instagramUrl),
          facebook: Boolean(enrichment.facebookUrl),
          website: Boolean(leadPlusWebsite || existingWebsite),
          email: Boolean(enrichment.email),
        },
        leadPlusEnrichment: this.compactLeadPlusEnrichmentPayload(leadPlus),
      }),
      lastSeenAt: now,
    };
    await (this.prisma as any).radarLeadPool.update({
      where: { id: baseRow.id },
      data,
    });
    await this.recordRadarLeadEvent({
      leadId: baseRow.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: 'enriched',
      note: `Card enriquecido (${RADAR_LEAD_ENRICHMENT_VERSION}).`,
    });
    await this.syncVendasLeadAfterRadarEnrichment(context, baseRow, data, enrichment, leadPlus);
    // 048-1B: waterfall de dados públicos (CNPJ) → grava sinais de hora/intenção
    if (this.getRadarPublicData().needsRefresh(baseRow)) {
      this.getRadarPublicData().enrichSignals(this.prisma, baseRow).catch(() => {/* aditivo */});
    }
    const updated = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: baseRow.id },
      include: {
        companyStates: { where: { companyId: context.companyId }, take: 1 },
        events: {
          where: { OR: [{ companyId: context.companyId }, { companyId: null }] },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });
    return {
      ok: true,
      message: 'Card enriquecido',
      item: this.buildRadarLeadPublic({
        ...(updated || baseRow),
        whatsappStatus: whatsappStatus || undefined,
      }, { includeSmartFields: await this.canUseRadarSmartLeadFields(context.companyId) }),
    };
  }

  async listRadarDatabaseForUser(user: any, input: RadarFiltersInput = {}) {
    const context = this.resolveContext(user);
    const filters = this.normalizeRadarFilters({ ...input, engine: undefined });
    if (!(await this.supportsRadarPersistence())) {
      return {
        items: [],
        total: 0,
        meta: {
          available: false,
          message: 'Banco do Radar ainda nao foi migrado neste ambiente.',
        },
      };
    }
    const rows = await this.queryRadarRowsForCompany(context.companyId, filters, {
      limit: filters.limit,
      includeHidden: filters.includeHidden,
    });
    const [includeSmartFields, fingerprint, ownershipEnabled] = await Promise.all([
      this.canUseRadarSmartLeadFields(context.companyId),
      this.getIcpFingerprint().getFingerprint(this.prisma, context.companyId).catch(() => null),
      this.supportsRadarOwnershipPersistence(),
    ]);
    const gemeosInsight = await this.getIcpFingerprint()
      .getGemeosInsight(this.prisma, context.companyId, fingerprint)
      .catch(() => null);
    const icpSvc = this.getIcpFingerprint();
    return {
      items: rows.map((row) => ({
        ...this.buildRadarLeadPublic(row, { includeSmartFields, viewerCompanyId: context.companyId, ownershipEnabled }),
        fitScore: includeSmartFields ? icpSvc.computeFit(row, fingerprint) : null,
      })),
      total: rows.length,
      meta: {
        available: true,
        gemeosInsight: gemeosInsight || null,
        filters: {
          city: filters.city,
          state: filters.state,
          segment: filters.segment,
          radiusKm: filters.radiusKm,
          regionalCities: filters.regionalCities.map((item) => ({
            city: item.city,
            state: item.state,
            distanceKm: item.distanceKm,
          })),
          noWebsite: filters.noWebsite,
          highOpportunity: filters.opportunityLevel === 'high',
          minRating: filters.minRating,
          minReviews: filters.minReviews,
        },
      },
    };
  }

  // Bloco 4 (PR17062026020-4): sugestões de segmentos com novos leads disponíveis
  // baseadas na afinidade confirmada (≥3 ações) de quem está logado. Barato: só count,
  // sem join caro. Falha → { suggestions: [] } (nunca 500). Igual pra qualquer papel
  // (LIMPEZA-DESTRUTIVA L6, 05/07: antes só rodava pro vendedor; admin também trabalha
  // leads e tem afinidade própria).
  async getPreferenceSuggestionsForUser(user: any) {
    try {
      const context = this.resolveContext(user);
      if (!(await this.supportsRadarPersistence())) return { suggestions: [] };

      const me = await this.prisma.user.findUnique({
        where: { id: context.userId },
        select: { segmentAffinityJson: true } as any,
      }).catch(() => null);

      const segments = confirmedSegments((me as any)?.segmentAffinityJson, 3);
      if (!segments.length) return { suggestions: [] };

      const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
      const suggestions: Array<{ segment: string; available: number }> = [];

      for (const seg of segments) {
        const baseWhere: any = {
          normalizedSegment: seg,
          status: { notIn: ['rejected', 'duplicate', ...RADAR_PROTECTED_STATUSES] },
          AND: [
            {
              companyStates: {
                none: {
                  companyId: context.companyId,
                  status: { in: [...RADAR_PROTECTED_STATUSES, 'imported_to_vendas', 'sent_to_vendas'] },
                },
              },
            },
          ],
        };
        if (ownershipEnabled) baseWhere.ownerCompanyId = null;

        const available: number = await (this.prisma as any).radarLeadPool.count({
          where: baseWhere,
        }).catch(() => 0);

        if (available > 0) suggestions.push({ segment: seg, available });
      }

      suggestions.sort((a, b) => b.available - a.available);
      return { suggestions: suggestions.slice(0, 3) };
    } catch {
      return { suggestions: [] };
    }
  }
}
