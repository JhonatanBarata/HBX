import { applyRadarCoreMixins } from './radar-core-mixins';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { probeWebscrapingRuntime, type WebscrapingRuntimeDiagnostic } from '../../modules/webscraping-runtime.util';
import { PrismaService } from '../../prisma/prisma.service';
import { buildHbxPresentationEmailDraft, VendasService } from '../../vendas/vendas.service';
import { HbxPresentationEmailService } from '../../mail/hbx-presentation-email.service';
import { CommercialUsageLimitsService } from '../../commercial-plans/commercial-usage-limits.service';
import { MasterContextService } from '../../master-context/master-context.service';
import { buildLocalHbxEngineUrls, getConfiguredHbxEngineCount, HbxEnginePoolService, isHbxEngineLocalhostUrl, type HbxEngineLease, type HbxEnginePurpose } from '../hbx-engine-pool.service';
import {
  COMMERCIAL_PLAN_QUOTAS,
  COMMERCIAL_PLAN_KEYS,
  GOOGLE_DAILY_LIMIT_REACHED_MESSAGE,
  resolveCommercialPlanKeyForCapabilities,
} from '../../commercial-plans/commercial-plan-catalog';
import { WebwhatsBridgeService } from '../../messaging/webwhats-bridge.service';
import { buildRadarLeadEnrichment, RADAR_LEAD_ENRICHMENT_VERSION } from '../radar-lead-enrichment';
import { calculateLeadQualityV2, resolveRadarVisibilityFromQualityV2, type LeadQualityV2, type LeadQualityV2SalesProfile } from '../lead-quality-v2';
import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../../companies/master-whatsapp-company.constants';
import { RadarSocialLookupService, type RadarSocialLookupHost } from './04-socials/radar-social-lookup.service';
import { RadarDeliveryOrchestratorService } from './05-delivery/radar-delivery-orchestrator.service';
import { RadarPostDeliveryUpdateService } from './05-delivery/radar-post-delivery-update.service';
import { RadarPostDeliveryVendasUpdateService } from './05-delivery/radar-post-delivery-vendas-update.service';
import { RadarVendasSyncService, type RadarVendasSyncHost } from './05-delivery/radar-vendas-sync.service';
import { RadarLeadPresenterService, type RadarLeadPresenterHost } from './06-presentation/radar-lead-presenter.service';
import { RadarRunPresenterService, type RadarRunPresenterHost } from './06-presentation/radar-run-presenter.service';
import { RadarRunRepositoryService } from './persistence/radar-run-repository.service';
import { RadarResultMergerService } from './01-search/radar-result-merger.service';
import { RadarSearchGeoService, type RadarSearchGeoHost } from './01-search/radar-search-geo.service';
import { RadarSearchInputService, type RadarSearchInputHost } from './01-search/radar-search-input.service';
import { RadarSearchOrchestratorService } from './01-search/radar-search-orchestrator.service';
import { RadarSearchRunConfigService } from './01-search/radar-search-run-config.service';
import { RadarSourceExpansionService } from './01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './01-search/radar-source-planner.service';
import { RadarInternalReprocessSourceService } from './01-search/radar-internal-reprocess-source.service';
import { RadarSourceExecutorService } from './01-search/radar-source-executor.service';
import { RadarCnpjPublicSourceService } from './01-search/radar-cnpj-public-source.service';
import { RadarLocalDirectorySourceService } from './01-search/radar-local-directory-source.service';
import { RadarVerticalSourceService } from './01-search/radar-vertical-source.service';
import { RadarWebsiteCrawlSourceService } from './01-search/radar-website-crawl-source.service';
import { RadarDuplicateFilterService, type RadarDuplicateSortHost } from './02-filter/radar-duplicate-filter.service';
import { RadarQualityGateService, type RadarQualityGateHost } from './02-filter/radar-quality-gate.service';
import { RadarRunItemFilterService, type RadarRunItemFilterHost } from './02-filter/radar-run-item-filter.service';
import { RadarScoreEnrichmentService, type RadarScoreEnrichmentHost } from './03-enrichment/radar-score-enrichment.service';
import { RadarWebEnrichmentJobService, type RadarWebEnrichmentJobHost } from './03-enrichment/radar-web-enrichment-job.service';
import { GoogleSearchProviderService } from './providers/google-search/google-search-provider.service';
import { RadarGoogleResponseService } from './providers/google-search/radar-google-response.service';
import { RadarHbxEngineErrorsService } from './providers/hbx-engine/radar-hbx-engine-errors.service';
import { RadarSharedNormalizerService } from './shared/radar-shared-normalizer.service';

import {
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
  RuntimeStatus,
  ExternalRuntimeStatus,
  SearchSource,
  WebscrapingEngine,
  HbxTargetType,
  LeadQualityStatus,
  LeadQualityResult,
  HbxVisibilityTier,
  HbxDeliveryProduct,
  HbxDeliveryClassification,
  SearchRunStatus,
  WebscrapingSearchRunStatus,
  RadarOperationalState,
  WebscrapingSearchRunItemStatus,
  HbxBatchStatus,
  HbxEngineSearchOutput,
  RadarSearchRunMetrics,
  RadarSearchRunMetricsPatch,
  SEGMENT_STOPWORDS,
  SEGMENT_ALIASES,
  HBX_CATEGORY_SEGMENTS,
  GENERIC_DIRECTORY_NAMES,
  GENERIC_DIRECTORY_PREFIXES,
  GENERIC_DIRECTORY_CONTAINS,
  GENERIC_CATEGORY_HEADS,
  VERTICAL_TOKEN_GROUPS,
  NativeRuntimeDiagnostic,
  HbxRuntimeDiagnostic,
  WebscrapingRuntimeResponse,
  WebscrapingSearchFilters,
  WebscrapingContactResult,
  WebscrapingSearchResponse,
  WebscrapingSearchRunResponse,
  WebscrapingHistorySummary,
  SearchContactsInput,
  SearchPlacesCandidate,
  PlaceDetails,
  SearchExecutionContext,
  NormalizedSearchInput,
  SearchExecutionOptions,
  RegionalCity,
  NormalizeSearchInputOptions,
  UsageEventType,
  UsageExecutionMeta,
  RadarWebsiteStatus,
  RadarOpportunityLevel,
  RadarWhatsappCheckMode,
  RadarWhatsappCheckStatus,
  RadarFiltersInput,
  RadarLeadEventType,
  RadarLeadStatus,
  RadarCampaignInput,
  WebscrapingOperationalConfigInput,
  MasterMassDataCampaignInput,
  AutonomousMassDataStrategyMode,
  AutonomousMassDataWorkReason,
  AutonomousMassDataWork,
  AutonomousMassDataCandidate,
  NormalizedRadarFilters,
  RadarChannelFilter,
  RadarChannelMatchMode,
  SearchHistoryRow,
  GlobalCacheRow,
  HistoryPlaceColumnSupport,
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
} from './shared/radar-core-shared';
export * from './shared/radar-core-shared';

let cityCache: {
  loadedAt: number;
  items: string[];
} | null = null;

@Injectable()
export class RadarWebscrapingCoreService implements OnModuleInit, OnModuleDestroy {
  [key: string]: any;
  private readonly logger = new Logger('WebscrapingService');
  private searchRunQueuePumpActive = false;
  private radarCampaignPumpActive = false;
  private radarFactoryPumpActive = false;
  private radarAutoDistributionPumpActive = false;
  private radarCampaignTimer: NodeJS.Timeout | null = null;
  private radarFactoryTimer: NodeJS.Timeout | null = null;
  private radarAutoDistributionTimer: NodeJS.Timeout | null = null;
  private radarWhatsappCheckModeByRunId = new Map<string, RadarWhatsappCheckMode>();
  private readonly leadPlusSignalEnrichmentInFlight = new Set<string>();
  private readonly requiredChannelEnrichmentInFlight = new Set<string>();
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private hbxEnginePool?: HbxEnginePoolService,
    @Optional() private readonly webwhatsBridge?: WebwhatsBridgeService,
    @Optional() @Inject(forwardRef(() => VendasService))
    private readonly vendasService?: VendasService,
    @Optional() private readonly hbxPresentationEmails?: HbxPresentationEmailService,
    @Optional() private readonly commercialUsageLimits?: CommercialUsageLimitsService,
    @Optional() private readonly masterContextService?: MasterContextService,
    @Optional() private readonly radarRunRepository?: RadarRunRepositoryService,
    @Optional() private readonly radarSocialLookup?: RadarSocialLookupService,
    @Optional() private readonly radarLeadPresenter?: RadarLeadPresenterService,
    @Optional() private readonly radarRunPresenter?: RadarRunPresenterService,
    @Optional() private readonly radarPostDeliveryUpdate?: RadarPostDeliveryUpdateService,
    @Optional() private readonly radarPostDeliveryVendasUpdate?: RadarPostDeliveryVendasUpdateService,
    @Optional() private readonly radarDeliveryOrchestrator?: RadarDeliveryOrchestratorService,
    @Optional() private readonly radarVendasSync?: RadarVendasSyncService,
    @Optional() private readonly radarSharedNormalizer?: RadarSharedNormalizerService,
    @Optional() private readonly radarSearchGeo?: RadarSearchGeoService,
    @Optional() private readonly radarSearchInput?: RadarSearchInputService,
    @Optional() private readonly radarSearchStrategy?: RadarSearchStrategyService,
    @Optional() private readonly radarSourcePlanner?: RadarSourcePlannerService,
    @Optional() private readonly radarSourceExpansion?: RadarSourceExpansionService,
    @Optional() private readonly radarResultMerger?: RadarResultMergerService,
    @Optional() private readonly radarSearchOrchestrator?: RadarSearchOrchestratorService,
    @Optional() private readonly radarSearchRunConfig?: RadarSearchRunConfigService,
    @Optional() private readonly radarInternalReprocessSource?: RadarInternalReprocessSourceService,
    @Optional() private readonly radarSourceExecutor?: RadarSourceExecutorService,
    @Optional() private readonly radarCnpjPublicSource?: RadarCnpjPublicSourceService,
    @Optional() private readonly radarLocalDirectorySource?: RadarLocalDirectorySourceService,
    @Optional() private readonly radarVerticalSource?: RadarVerticalSourceService,
    @Optional() private readonly radarWebsiteCrawlSource?: RadarWebsiteCrawlSourceService,
    @Optional() private readonly radarDuplicateFilter?: RadarDuplicateFilterService,
    @Optional() private readonly radarQualityGate?: RadarQualityGateService,
    @Optional() private readonly radarRunItemFilter?: RadarRunItemFilterService,
    @Optional() private readonly radarScoreEnrichment?: RadarScoreEnrichmentService,
    @Optional() private readonly radarWebEnrichmentJob?: RadarWebEnrichmentJobService,
    @Optional() private readonly googleSearchProvider?: GoogleSearchProviderService,
    @Optional() private readonly radarGoogleResponse?: RadarGoogleResponseService,
    @Optional() private readonly radarHbxEngineErrors?: RadarHbxEngineErrorsService,
  ) {}

  onModuleInit() {
    this.radarCampaignTimer = setInterval(() => {
      void this.processNextRadarCampaigns();
    }, 30_000);
    this.radarFactoryTimer = setInterval(() => {
      void this.ensureNightFactoryWork();
    }, 60_000);
    this.radarAutoDistributionTimer = setInterval(() => {
      void this.processActiveRadarAutoDistributions();
    }, 60_000);
    setTimeout(() => {
      void this.recoverRadarCampaignWork();
    }, 1_000);
    setTimeout(() => {
      void this.processNextQueuedSearchRun();
    }, 2_000);
    setTimeout(() => {
      void this.processNextRadarCampaigns();
    }, 2_000);
    setTimeout(() => {
      void this.ensureNightFactoryWork();
    }, 4_000);
    setTimeout(() => {
      void this.processActiveRadarAutoDistributions();
    }, 7_000);
  }

  onModuleDestroy() {
    if (this.radarCampaignTimer) {
      clearInterval(this.radarCampaignTimer);
      this.radarCampaignTimer = null;
    }
    if (this.radarFactoryTimer) {
      clearInterval(this.radarFactoryTimer);
      this.radarFactoryTimer = null;
    }
    if (this.radarAutoDistributionTimer) {
      clearInterval(this.radarAutoDistributionTimer);
      this.radarAutoDistributionTimer = null;
    }
  }

  private getEnginePool() {
    if (!this.hbxEnginePool) {
      this.hbxEnginePool = new HbxEnginePoolService(this.prisma);
    }
    return this.hbxEnginePool;
  }

  private getRadarRunRepository() {
    return this.radarRunRepository || new RadarRunRepositoryService(this.prisma);
  }

  private getRadarSocialLookupService() {
    return this.radarSocialLookup || new RadarSocialLookupService(this.getRadarRunRepository());
  }

  private getRadarRunPresenter() {
    return this.radarRunPresenter || new RadarRunPresenterService();
  }

  private getRadarLeadPresenter() {
    return this.radarLeadPresenter || new RadarLeadPresenterService();
  }

  private getRadarVendasSyncService() {
    return this.radarVendasSync || new RadarVendasSyncService(this.prisma, this.vendasService);
  }

  private getRadarPostDeliveryUpdate() {
    return this.radarPostDeliveryUpdate || new RadarPostDeliveryUpdateService();
  }

  private getRadarPostDeliveryVendasUpdate() {
    return this.radarPostDeliveryVendasUpdate || new RadarPostDeliveryVendasUpdateService();
  }

  private getRadarDeliveryOrchestrator() {
    return this.radarDeliveryOrchestrator || new RadarDeliveryOrchestratorService(this.getRadarPostDeliveryUpdate());
  }

  private getRadarSharedNormalizer() {
    return this.radarSharedNormalizer || new RadarSharedNormalizerService();
  }

  private getRadarSearchRunConfig() {
    return this.radarSearchRunConfig || new RadarSearchRunConfigService();
  }

  private getRadarInternalReprocessSource() {
    return this.radarInternalReprocessSource || new RadarInternalReprocessSourceService();
  }

  private getRadarSourceExecutor() {
    return this.radarSourceExecutor || new RadarSourceExecutorService();
  }

  private getRadarWebsiteCrawlSource() {
    return this.radarWebsiteCrawlSource || new RadarWebsiteCrawlSourceService();
  }

  private getRadarCnpjPublicSource() {
    return this.radarCnpjPublicSource || new RadarCnpjPublicSourceService();
  }

  private getRadarLocalDirectorySource() {
    return this.radarLocalDirectorySource || new RadarLocalDirectorySourceService();
  }

  private getRadarVerticalSource() {
    return this.radarVerticalSource || new RadarVerticalSourceService();
  }

  private getRadarSearchGeo() {
    return this.radarSearchGeo || new RadarSearchGeoService();
  }

  private getRadarSearchInput() {
    return this.radarSearchInput || new RadarSearchInputService();
  }

  private getRadarSearchStrategy() {
    return this.radarSearchStrategy || new RadarSearchStrategyService();
  }

  private getRadarSourcePlanner() {
    return this.radarSourcePlanner || new RadarSourcePlannerService();
  }

  private getRadarSourceExpansion() {
    return this.radarSourceExpansion || new RadarSourceExpansionService();
  }

  private getRadarResultMerger() {
    return this.radarResultMerger || new RadarResultMergerService();
  }

  private getRadarSearchOrchestrator() {
    return this.radarSearchOrchestrator || new RadarSearchOrchestratorService(
      this.getRadarSearchStrategy(),
      this.getRadarSourcePlanner(),
      this.getRadarSourceExpansion(),
    );
  }

  private getRadarDuplicateFilter() {
    return this.radarDuplicateFilter || new RadarDuplicateFilterService();
  }

  private getRadarQualityGate() {
    return this.radarQualityGate || new RadarQualityGateService();
  }

  private getRadarRunItemFilter() {
    return this.radarRunItemFilter || new RadarRunItemFilterService();
  }

  private getRadarScoreEnrichment() {
    return this.radarScoreEnrichment || new RadarScoreEnrichmentService();
  }

  private getRadarWebEnrichmentJobService() {
    return this.radarWebEnrichmentJob || new RadarWebEnrichmentJobService(this.getRadarRunRepository());
  }

  private getGoogleSearchProvider() {
    return this.googleSearchProvider || new GoogleSearchProviderService();
  }

  private getRadarGoogleResponse() {
    return this.radarGoogleResponse || new RadarGoogleResponseService();
  }

  private getRadarHbxEngineErrors() {
    return this.radarHbxEngineErrors || new RadarHbxEngineErrorsService();
  }

  private buildRadarScoreEnrichmentHost(): RadarScoreEnrichmentHost {
    return {
      parseMaybeJsonObject: (value) => this.parseMaybeJsonObject(value),
      inferWebsiteStatus: (value) => inferWebsiteStatus(value),
      isLikelyValidBrPhone: (value) => isLikelyValidBrPhone(value),
      isLikelyWhatsapp: (value) => isLikelyWhatsapp(value),
    };
  }

  private buildRadarDuplicateSortHost(): RadarDuplicateSortHost {
    return {
      extractLeadQualityV2FromObject: (value) => this.extractLeadQualityV2FromObject(value),
      buildOpportunityScore: (result) => this.buildOpportunityScore(result),
    };
  }

  private buildRadarRunItemFilterHost(): RadarRunItemFilterHost {
    return {
      isBlockedLeadOfficialWebsite: (value) => this.isBlockedLeadOfficialWebsite(value),
      requiredChannelsForInput: (input) => this.requiredChannelsForInput(input),
      hasUsablePublicContactChannel: (candidate) => this.hasUsablePublicContactChannel(candidate),
      buildSyntheticRunPlaceId: (runId, result, index) => this.buildSyntheticRunPlaceId(runId, result, index),
      buildRunCompositeKey: (input) => this.buildRunCompositeKey(input),
    };
  }

  private buildRadarQualityGateHost(): RadarQualityGateHost {
    return {
      isGenericDirectoryName: (name, context) => this.isGenericDirectoryName(name, context),
      nameConflictsWithRequestedSegment: (name, segment) => this.nameConflictsWithRequestedSegment(name, segment),
      hasUsablePublicContactChannel: (candidate) => this.hasUsablePublicContactChannel(candidate),
      isBlockedLeadOfficialWebsite: (value) => this.isBlockedLeadOfficialWebsite(value),
    };
  }

  private buildRadarSearchGeoHost(): RadarSearchGeoHost {
    return {
      normalizeCoordinate: (value) => this.normalizeCoordinate(value),
      normalizeRadiusKm: (value) => this.normalizeRadiusKm(value),
    };
  }

  private buildRadarSearchInputHost(): RadarSearchInputHost {
    return {
      normalizeRadarFilters: (input) => this.normalizeRadarFilters(input),
      normalizeSearchInput: (input) => this.normalizeSearchInput(input),
      normalizeRadiusKm: (value) => this.normalizeRadiusKm(value),
      normalizeCoordinate: (value) => this.normalizeCoordinate(value),
      getRequiredChannelCandidateWindow: (targetQuantity) => this.getRequiredChannelCandidateWindow(targetQuantity),
    };
  }

  private buildRadarSocialLookupHost(): RadarSocialLookupHost {
    return {
      searchHbxEngine: (input, existing, engineUrl, options) => this.searchHbxEngine(input, existing, engineUrl, options),
      normalizeRadarSocialUrl: (value, network) => this.normalizeRadarSocialUrl(value, network),
      pickRadarSocialUrl: (item, network) => this.pickRadarSocialUrl(item, network),
    };
  }

  private buildRadarWebEnrichmentJobHost(): RadarWebEnrichmentJobHost {
    return {
      searchHbxEngine: (input, existing, engineUrl, options) => this.searchHbxEngine(input, existing, engineUrl, options),
      getRadarWebsiteCrawlSource: () => this.getRadarWebsiteCrawlSource(),
      recordVendasEnrichmentStatus: async (context, row, status, payload = {}) => {
        const result = await this.getRadarPostDeliveryVendasUpdate().recordEnrichmentStatus({
          prisma: this.prisma,
          context,
          row,
          status,
          payload,
        });
        if (result.status === 'partial_error') {
          await this.markRadarPostDeliveryUpdateRetryable(row?.id, result.error || 'Falha ao registrar enriquecimento no Vendas.', 'post_delivery_update');
        }
      },
      syncVendasAfterRadarEnrichment: async (context, row, data, reason) => {
        const compactEnrichment = {
          source: 'radar_web_enrichment',
          reason: reason || null,
          enrichmentStatus: 'completed',
          website: data.website || null,
          email: data.email || null,
          instagramUrl: data.instagramUrl || null,
          facebookUrl: data.facebookUrl || null,
          possibleSocialCandidates: Array.isArray(data.possibleSocialCandidates) ? data.possibleSocialCandidates : [],
          confirmedSocialCandidates: Array.isArray(data.confirmedSocialCandidates) ? data.confirmedSocialCandidates : [],
          socialStatus: data.socialStatus || null,
          socialConfidence: data.socialConfidence || null,
          recommendedChannel: data.recommendedChannel || null,
          opportunityReason: data.opportunityReason || null,
        };
        const result = await this.getRadarPostDeliveryVendasUpdate().syncAfterRadarEnrichment({
          prisma: this.prisma,
          context,
          row,
          data: {
            ...data,
            enrichmentStatus: 'completed',
          },
          compactEnrichment,
        });
        if (result.status === 'partial_error') {
          await this.markRadarPostDeliveryUpdateRetryable(row?.id, result.error || 'Falha ao atualizar Vendas apos enriquecimento.', 'post_delivery_update');
        } else if (result.status === 'completed') {
          await this.markRadarPostDeliveryUpdateCompleted(row?.id);
        }
      },
      logger: this.logger,
    };
  }

  private buildRadarRunPresenterHost(): RadarRunPresenterHost {
    return {
      parseMaybeJsonObject: (value) => this.parseMaybeJsonObject(value),
      extractLeadQualityV2FromObject: (value) => this.extractLeadQualityV2FromObject(value),
      extractLeadQualityFromObject: (value) => this.extractLeadQualityFromObject(value),
      buildRunInputFromRow: (run) => this.buildRunInputFromRow(run),
      normalizeSearchRunStatus: (status) => this.normalizeSearchRunStatus(status),
      normalizeRunItemStatus: (status) => this.normalizeRunItemStatus(status),
      normalizeRadarChannels: (value) => this.normalizeRadarChannels(value),
      normalizeChannelMatchMode: (value) => this.normalizeChannelMatchMode(value),
      isRunItemQualityDeliverable: (item, input) => this.isRunItemQualityDeliverable(item, input),
      attachDeliveryClassification: (item, input, quality, qualityV2) => this.attachDeliveryClassification(item, input, quality, qualityV2),
      stripListPremiumFields: (item, input) => this.stripListPremiumFields(item, input),
      normalizeRadiusKm: (value) => this.normalizeRadiusKm(value),
      getHbxRunBatchLimit: (targetQuantity) => this.getHbxRunBatchLimit(targetQuantity),
      getHbxRunMaxAttempts: (targetQuantity, batchLimit) => this.getHbxRunMaxAttempts(targetQuantity, batchLimit),
      buildSearchRunInsufficientMessage: (foundCount, attempts) => this.buildSearchRunInsufficientMessage(foundCount, attempts),
      resolveRadarRunOperationalState: (run, status, message) => this.resolveRadarRunOperationalState(run, status, message),
    };
  }

  private buildRadarLeadPresenterHost(): RadarLeadPresenterHost {
    return {
      extractDdd: (value) => this.extractDdd(value),
      resolveRadarLeadStatus: (row) => this.resolveRadarLeadStatus(row),
      isRadarProtectedStatus: (value) => this.isRadarProtectedStatus(value),
    };
  }

  private buildRadarVendasSyncHost(): RadarVendasSyncHost {
    return {
      getPendingCount: (companyId) => this.getVendasPendingCountForRadarContext(companyId),
      resolveContext: (user) => this.resolveContext(user),
      syncRadarSearchRunItemsToPool: (context, run) => this.syncRadarSearchRunItemsToPool(context, run),
      buildRadarFiltersFromSearchRun: (run) => this.buildRadarFiltersFromSearchRun(run),
      isRunItemPrimaryDeliverable: (item, filters) => this.isRunItemPrimaryDeliverable(item, filters),
      findRadarPoolRowsForRunItems: (companyId, items, limit) => this.findRadarPoolRowsForRunItems(companyId, items, limit),
      normalizeRadarLeadStatus: (value) => this.normalizeRadarLeadStatus(value),
      isRadarProtectedStatus: (value) => this.isRadarProtectedStatus(value),
      importRadarLeadToVendasForUser: (user, radarLeadId, input) => this.importRadarLeadToVendasForUser(user, radarLeadId, input),
      stopSearchRunIfVendasStockLimitReached: (run, reason) => this.stopSearchRunIfVendasStockLimitReached(run, reason),
      stopSearchRunAutoImportBlocked: (run, reason) => this.stopSearchRunAutoImportBlocked(run, reason),
    };
  }


}

applyRadarCoreMixins(RadarWebscrapingCoreService);
