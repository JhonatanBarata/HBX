import { applyRadarCoreMixins } from './radar-core-mixins';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
import { WebwhatsBridgeService } from '../../messaging/webwhats-bridge.service';
import { buildRadarLeadEnrichment, RADAR_LEAD_ENRICHMENT_VERSION } from '../radar-lead-enrichment';
import { calculateLeadQualityV2, resolveRadarVisibilityFromQualityV2, type LeadQualityV2, type LeadQualityV2SalesProfile } from '../lead-quality-v2';
import { RadarDeliveryOrchestratorService } from './05-delivery/radar-delivery-orchestrator.service';
import { RadarPostDeliveryUpdateService } from './05-delivery/radar-post-delivery-update.service';
import { RadarPostDeliveryVendasUpdateService } from './05-delivery/radar-post-delivery-vendas-update.service';
import { RadarVendasSyncService } from './05-delivery/radar-vendas-sync.service';
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
import { RadarMissionQueueService } from './missions/radar-mission-queue.service';
import { RadarPonteStatusService } from './missions/radar-ponte-status.service';
import { RadarCnpjPublicSourceService } from './01-search/radar-cnpj-public-source.service';
import { RadarLocalDirectorySourceService } from './01-search/radar-local-directory-source.service';
import { RadarVerticalSourceService } from './01-search/radar-vertical-source.service';
import { RadarDuplicateFilterService, type RadarDuplicateSortHost } from './02-filter/radar-duplicate-filter.service';
import { RadarQualityGateService, type RadarQualityGateHost } from './02-filter/radar-quality-gate.service';
import { RadarRunItemFilterService, type RadarRunItemFilterHost } from './02-filter/radar-run-item-filter.service';
import { RadarWebSourceGateService } from './02-filter/radar-web-source-gate.service';
import { RadarScoreEnrichmentService, type RadarScoreEnrichmentHost } from './03-enrichment/radar-score-enrichment.service';
import { RadarDuplicateFieldDonationService } from './03-enrichment/radar-duplicate-field-donation.service';
import { GoogleSearchProviderService } from './providers/google-search/google-search-provider.service';
import { RadarGoogleResponseService } from './providers/google-search/radar-google-response.service';
import { RadarHbxEngineErrorsService } from './providers/hbx-engine/radar-hbx-engine-errors.service';
import { RadarSharedNormalizerService } from './shared/radar-shared-normalizer.service';
import { CnpjBaseQueryService } from './providers/cnpj-public/cnpj-base-query.service';
import { NucleoCadastroService } from '../../nucleo/nucleo-cadastro.service';
import { RadarLeadProcessStoreService } from './05-delivery/radar-lead-process-store.service';

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
  ACRE_CITIES_FALLBACK,
  RADAR_RESERVATION_TTL_MS,
  RADAR_REGION_MAX_RADIUS_KM,
  RADAR_PROTECTED_STATUSES,
  buildRadarNeighborSegments,
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
export class RadarWebscrapingCoreService implements OnModuleInit {
  [key: string]: any;
  private readonly logger = new Logger('WebscrapingService');
  private searchRunQueuePumpActive = false;
  private radarWhatsappCheckModeByRunId = new Map<string, RadarWhatsappCheckMode>();
  // Lazy (não entra no construtor: mudar a assinatura quebraria o super() posicional
  // de webscraping.service.ts, fora do escopo do radar).
  private radarDuplicateFieldDonation?: RadarDuplicateFieldDonationService;
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
    @Optional() private readonly radarCnpjPublicSource?: RadarCnpjPublicSourceService,
    @Optional() private readonly radarLocalDirectorySource?: RadarLocalDirectorySourceService,
    @Optional() private readonly radarVerticalSource?: RadarVerticalSourceService,
    @Optional() private readonly radarDuplicateFilter?: RadarDuplicateFilterService,
    @Optional() private readonly radarQualityGate?: RadarQualityGateService,
    @Optional() private readonly radarWebSourceGate?: RadarWebSourceGateService,
    @Optional() private readonly radarRunItemFilter?: RadarRunItemFilterService,
    @Optional() private readonly radarScoreEnrichment?: RadarScoreEnrichmentService,
    @Optional() private readonly googleSearchProvider?: GoogleSearchProviderService,
    @Optional() private readonly radarGoogleResponse?: RadarGoogleResponseService,
    @Optional() private readonly radarHbxEngineErrors?: RadarHbxEngineErrorsService,
    @Optional() private readonly cnpjBaseQuery?: CnpjBaseQueryService,
  ) {}

  onModuleInit() {
    // O backend inicia somente manutenção das execuções solicitadas por clientes.
    // Enriquecimento local depende do HBX Owner e não nasce neste processo.
    setTimeout(() => {
      void this.processNextQueuedSearchRun();
    }, 2_000);
    setTimeout(() => {
      // Nunca toque numa saga viva de outra réplica durante rolling deploy.
      // Apenas operações sem heartbeat por 2 minutos entram no recovery; cada
      // run ainda precisa adquirir o lease distribuído no banco.
      void this.recoverStaleRadarLeadClaimOperations({
        updatedBefore: new Date(Date.now() - 2 * 60 * 1000),
      }).catch((error: any) => {
        this.logger.error(`[radar-claim-recovery] falha no boot: ${String(error?.message || error)}`);
      });
    }, 3_000);
  }

  private getEnginePool() {
    if (!this.hbxEnginePool) {
      this.hbxEnginePool = new HbxEnginePoolService(this.prisma);
    }
    return this.hbxEnginePool;
  }

  // SPRINT 4 MOTOR-RFB-FILA (02/07): fila de missões acessível aos mixins (mesmo padrão lazy do
  // getEnginePool — instância `new` não registra timers de lifecycle; o sweeper vive na instância DI).
  private radarMissionQueueLazy: RadarMissionQueueService | null = null;
  private getMissionQueue() {
    if (!this.radarMissionQueueLazy) {
      this.radarMissionQueueLazy = new RadarMissionQueueService(this.prisma);
    }
    return this.radarMissionQueueLazy;
  }

  // CHIP E3 (05/07): status de IA por lote de leads (vitrine + estoque de Vendas), mesmo padrão
  // lazy do getMissionQueue — instância própria, sem timers de lifecycle (o serviço não tem).
  private radarPonteStatusLazy: RadarPonteStatusService | null = null;
  private getRadarPonteStatus() {
    if (!this.radarPonteStatusLazy) {
      this.radarPonteStatusLazy = new RadarPonteStatusService(this.prisma);
    }
    return this.radarPonteStatusLazy;
  }

  private getRadarRunRepository() {
    return this.radarRunRepository || new RadarRunRepositoryService(this.prisma);
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

  private radarLeadProcessStoreLazy: RadarLeadProcessStoreService | null = null;
  private getRadarLeadProcessStore() {
    if (!this.radarLeadProcessStoreLazy) {
      this.radarLeadProcessStoreLazy = new RadarLeadProcessStoreService(this.prisma);
    }
    return this.radarLeadProcessStoreLazy;
  }

  // NÚCLEO-CRM N2 (04/07): serviço da espinha (Conta+Contato) acessível aos mixins pelo
  // MESMO padrão lazy do resto (não entra no construtor — a assinatura é super() posicional
  // de webscraping.service.ts). `new NucleoCadastroService(this.prisma)` não registra
  // lifecycle/timers; é só upsert idempotente sobre CustomerProfile/Contato.
  private nucleoCadastroLazy: NucleoCadastroService | null = null;
  private getNucleoCadastro(): NucleoCadastroService {
    if (!this.nucleoCadastroLazy) {
      this.nucleoCadastroLazy = new NucleoCadastroService(this.prisma);
    }
    return this.nucleoCadastroLazy;
  }

  private getRadarSharedNormalizer() {
    return this.radarSharedNormalizer || new RadarSharedNormalizerService();
  }

  private getRadarSearchRunConfig() {
    return this.radarSearchRunConfig || new RadarSearchRunConfigService();
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

  private getRadarWebSourceGate() {
    return this.radarWebSourceGate || new RadarWebSourceGateService();
  }

  private getRadarRunItemFilter() {
    return this.radarRunItemFilter || new RadarRunItemFilterService();
  }

  private getRadarDuplicateFieldDonation() {
    if (!this.radarDuplicateFieldDonation) {
      this.radarDuplicateFieldDonation = new RadarDuplicateFieldDonationService();
    }
    return this.radarDuplicateFieldDonation;
  }

  private getRadarScoreEnrichment() {
    return this.radarScoreEnrichment || new RadarScoreEnrichmentService();
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
      normalizeRadiusKm: (value) => this.normalizeRadiusKm(value),
      getHbxRunBatchLimit: (targetQuantity) => this.getHbxRunBatchLimit(targetQuantity),
      getHbxRunMaxAttempts: (targetQuantity, batchLimit) => this.getHbxRunMaxAttempts(targetQuantity, batchLimit),
      buildSearchRunInsufficientMessage: (foundCount, attempts) => this.buildSearchRunInsufficientMessage(foundCount, attempts),
      buildRadarNeighborSegments: (segment, limit) => buildRadarNeighborSegments(segment, limit),
      buildExpansionSuggestionHeadline: (city, segment, deliveredCount) => this.getRadarSearchRunConfig().buildExpansionSuggestionHeadline(city, segment, deliveredCount),
      buildExpansionWidenReachLabel: (nextRadiusKm) => this.getRadarSearchRunConfig().buildExpansionWidenReachLabel(nextRadiusKm),
      buildExpansionWidenSegmentLabel: (neighborSegments) => this.getRadarSearchRunConfig().buildExpansionWidenSegmentLabel(neighborSegments),
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

}

applyRadarCoreMixins(RadarWebscrapingCoreService);
