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
import { RadarSearchGeoService } from './radar/01-search/radar-search-geo.service';
import { RadarSearchInputService } from './radar/01-search/radar-search-input.service';
import { RadarSearchRunConfigService } from './radar/01-search/radar-search-run-config.service';
import { RadarDuplicateFilterService } from './radar/02-filter/radar-duplicate-filter.service';
import { RadarRunItemFilterService } from './radar/02-filter/radar-run-item-filter.service';
import { RadarScoreEnrichmentService } from './radar/03-enrichment/radar-score-enrichment.service';
import { RadarSocialLookupService } from './radar/04-socials/radar-social-lookup.service';
import { RadarVendasSyncService } from './radar/05-delivery/radar-vendas-sync.service';
import { RadarLeadPresenterService } from './radar/06-presentation/radar-lead-presenter.service';
import { RadarRunPresenterService } from './radar/06-presentation/radar-run-presenter.service';
import { RadarRunRepositoryService } from './radar/persistence/radar-run-repository.service';
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
    @Optional() radarVendasSync?: RadarVendasSyncService,
    @Optional() radarSharedNormalizer?: RadarSharedNormalizerService,
    @Optional() radarSearchGeo?: RadarSearchGeoService,
    @Optional() radarSearchInput?: RadarSearchInputService,
    @Optional() radarSearchRunConfig?: RadarSearchRunConfigService,
    @Optional() radarDuplicateFilter?: RadarDuplicateFilterService,
    @Optional() radarRunItemFilter?: RadarRunItemFilterService,
    @Optional() radarScoreEnrichment?: RadarScoreEnrichmentService,
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
      radarVendasSync,
      radarSharedNormalizer,
      radarSearchGeo,
      radarSearchInput,
      radarSearchRunConfig,
      radarDuplicateFilter,
      radarRunItemFilter,
      radarScoreEnrichment,
      radarGoogleResponse,
      radarHbxEngineErrors,
    );
  }
}
