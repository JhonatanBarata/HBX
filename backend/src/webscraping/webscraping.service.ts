import {
  Inject,
  Injectable,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { CommercialUsageLimitsService } from '../commercial-plans/commercial-usage-limits.service';
import { HbxPresentationEmailService } from '../mail/hbx-presentation-email.service';
import { MasterContextService } from '../master-context/master-context.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { HbxEnginePoolService } from './hbx-engine-pool.service';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarSearchGeoService } from './radar/01-search/radar-search-geo.service';
import { RadarSearchInputService } from './radar/01-search/radar-search-input.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarSearchRunConfigService } from './radar/01-search/radar-search-run-config.service';
import { RadarInternalReprocessSourceService } from './radar/01-search/radar-internal-reprocess-source.service';
import { RadarSourceExecutorService } from './radar/01-search/radar-source-executor.service';
import { RadarCnpjPublicSourceService } from './radar/01-search/radar-cnpj-public-source.service';
import { RadarLocalDirectorySourceService } from './radar/01-search/radar-local-directory-source.service';
import { RadarVerticalSourceService } from './radar/01-search/radar-vertical-source.service';
import { RadarWebsiteCrawlSourceService } from './radar/01-search/radar-website-crawl-source.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';
import { RadarDuplicateFilterService } from './radar/02-filter/radar-duplicate-filter.service';
import { RadarQualityGateService } from './radar/02-filter/radar-quality-gate.service';
import { RadarRunItemFilterService } from './radar/02-filter/radar-run-item-filter.service';
import { RadarScoreEnrichmentService } from './radar/03-enrichment/radar-score-enrichment.service';
import { RadarSocialLookupService } from './radar/04-socials/radar-social-lookup.service';
import { RadarDeliveryOrchestratorService } from './radar/05-delivery/radar-delivery-orchestrator.service';
import { RadarPostDeliveryUpdateService } from './radar/05-delivery/radar-post-delivery-update.service';
import { RadarPostDeliveryVendasUpdateService } from './radar/05-delivery/radar-post-delivery-vendas-update.service';
import { RadarVendasSyncService } from './radar/05-delivery/radar-vendas-sync.service';
import { RadarLeadPresenterService } from './radar/06-presentation/radar-lead-presenter.service';
import { RadarRunPresenterService } from './radar/06-presentation/radar-run-presenter.service';
import { RadarRunRepositoryService } from './radar/persistence/radar-run-repository.service';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';
import { RadarGoogleResponseService } from './radar/providers/google-search/radar-google-response.service';
import { RadarHbxEngineErrorsService } from './radar/providers/hbx-engine/radar-hbx-engine-errors.service';
import { RadarSharedNormalizerService } from './radar/shared/radar-shared-normalizer.service';
import { RadarWebscrapingCoreService } from './radar/radar-webscraping-core.service';

export * from './radar/radar-webscraping-core.service';

@Injectable()
export class WebscrapingService extends RadarWebscrapingCoreService {
  constructor(
    prisma: PrismaService,
    @Optional() hbxEnginePool?: HbxEnginePoolService,
    @Optional() webwhatsBridge?: WebwhatsBridgeService,
    @Optional() @Inject(forwardRef(() => VendasService))
    vendasService?: VendasService,
    @Optional() hbxPresentationEmails?: HbxPresentationEmailService,
    @Optional() commercialUsageLimits?: CommercialUsageLimitsService,
    @Optional() masterContextService?: MasterContextService,
    @Optional() radarRunRepository?: RadarRunRepositoryService,
    @Optional() radarSocialLookup?: RadarSocialLookupService,
    @Optional() radarLeadPresenter?: RadarLeadPresenterService,
    @Optional() radarRunPresenter?: RadarRunPresenterService,
    @Optional() radarPostDeliveryUpdate?: RadarPostDeliveryUpdateService,
    @Optional() radarPostDeliveryVendasUpdate?: RadarPostDeliveryVendasUpdateService,
    @Optional() radarDeliveryOrchestrator?: RadarDeliveryOrchestratorService,
    @Optional() radarVendasSync?: RadarVendasSyncService,
    @Optional() radarSharedNormalizer?: RadarSharedNormalizerService,
    @Optional() radarSearchGeo?: RadarSearchGeoService,
    @Optional() radarSearchInput?: RadarSearchInputService,
    @Optional() radarSearchStrategy?: RadarSearchStrategyService,
    @Optional() radarSourcePlanner?: RadarSourcePlannerService,
    @Optional() radarSourceExpansion?: RadarSourceExpansionService,
    @Optional() radarResultMerger?: RadarResultMergerService,
    @Optional() radarSearchOrchestrator?: RadarSearchOrchestratorService,
    @Optional() radarSearchRunConfig?: RadarSearchRunConfigService,
    @Optional() radarInternalReprocessSource?: RadarInternalReprocessSourceService,
    @Optional() radarSourceExecutor?: RadarSourceExecutorService,
    @Optional() radarCnpjPublicSource?: RadarCnpjPublicSourceService,
    @Optional() radarLocalDirectorySource?: RadarLocalDirectorySourceService,
    @Optional() radarVerticalSource?: RadarVerticalSourceService,
    @Optional() radarWebsiteCrawlSource?: RadarWebsiteCrawlSourceService,
    @Optional() radarDuplicateFilter?: RadarDuplicateFilterService,
    @Optional() radarQualityGate?: RadarQualityGateService,
    @Optional() radarRunItemFilter?: RadarRunItemFilterService,
    @Optional() radarScoreEnrichment?: RadarScoreEnrichmentService,
    @Optional() googleSearchProvider?: GoogleSearchProviderService,
    @Optional() radarGoogleResponse?: RadarGoogleResponseService,
    @Optional() radarHbxEngineErrors?: RadarHbxEngineErrorsService,
  ) {
    super(
      prisma,
      hbxEnginePool,
      webwhatsBridge,
      vendasService,
      hbxPresentationEmails,
      commercialUsageLimits,
      masterContextService,
      radarRunRepository,
      radarSocialLookup,
      radarLeadPresenter,
      radarRunPresenter,
      radarPostDeliveryUpdate,
      radarPostDeliveryVendasUpdate,
      radarDeliveryOrchestrator,
      radarVendasSync,
      radarSharedNormalizer,
      radarSearchGeo,
      radarSearchInput,
      radarSearchStrategy,
      radarSourcePlanner,
      radarSourceExpansion,
      radarResultMerger,
      radarSearchOrchestrator,
      radarSearchRunConfig,
      radarInternalReprocessSource,
      radarSourceExecutor,
      radarCnpjPublicSource,
      radarLocalDirectorySource,
      radarVerticalSource,
      radarWebsiteCrawlSource,
      radarDuplicateFilter,
      radarQualityGate,
      radarRunItemFilter,
      radarScoreEnrichment,
      googleSearchProvider,
      radarGoogleResponse,
      radarHbxEngineErrors,
    );
  }
}
