import { forwardRef, Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { VendasModule } from '../vendas/vendas.module';
import { MailModule } from '../mail/mail.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { MasterContextModule } from '../master-context/master-context.module';
import { HbxEnginePoolService } from './hbx-engine-pool.service';
import { RadarSocialLookupService } from './radar/04-socials/radar-social-lookup.service';
import { RadarSocialJobService } from './radar/04-socials/radar-social-job.service';
import { RadarSocialOrchestratorService } from './radar/04-socials/radar-social-orchestrator.service';
import { RadarSocialResultWriterService } from './radar/04-socials/radar-social-result-writer.service';
import { RadarVendasSyncService } from './radar/05-delivery/radar-vendas-sync.service';
import { RadarLeadPresenterService } from './radar/06-presentation/radar-lead-presenter.service';
import { RadarRunPresenterService } from './radar/06-presentation/radar-run-presenter.service';
import { RadarSearchRunConfigService } from './radar/01-search/radar-search-run-config.service';
import { RadarSearchGeoService } from './radar/01-search/radar-search-geo.service';
import { RadarSearchInputService } from './radar/01-search/radar-search-input.service';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';
import { RadarDuplicateFilterService } from './radar/02-filter/radar-duplicate-filter.service';
import { RadarQualityGateService } from './radar/02-filter/radar-quality-gate.service';
import { RadarRunItemFilterService } from './radar/02-filter/radar-run-item-filter.service';
import { RadarScoreEnrichmentService } from './radar/03-enrichment/radar-score-enrichment.service';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';
import { GoogleSearchQueryBuilder } from './radar/providers/google-search/google-search-query-builder';
import { GoogleSearchResultNormalizer } from './radar/providers/google-search/google-search-result-normalizer';
import { RadarGoogleResponseService } from './radar/providers/google-search/radar-google-response.service';
import { RadarHbxEngineErrorsService } from './radar/providers/hbx-engine/radar-hbx-engine-errors.service';
import { RadarDeliveryOrchestratorService } from './radar/05-delivery/radar-delivery-orchestrator.service';
import { RadarPostDeliveryUpdateService } from './radar/05-delivery/radar-post-delivery-update.service';
import { RadarRunRepositoryService } from './radar/persistence/radar-run-repository.service';
import { RadarDiagnosticService } from './radar/shared/radar-diagnostic.service';
import { RadarSharedNormalizerService } from './radar/shared/radar-shared-normalizer.service';
import { MasterWebscrapingController, WebscrapingController } from './webscraping.controller';
import { WebscrapingService } from './webscraping.service';

const RADAR_SHARED_SERVICES = [
  RadarDiagnosticService,
  RadarSharedNormalizerService,
];

const RADAR_PERSISTENCE_SERVICES = [
  RadarRunRepositoryService,
];

const RADAR_SEARCH_SERVICES = [
  RadarSearchGeoService,
  RadarSearchInputService,
  RadarSearchStrategyService,
  RadarSourcePlannerService,
  RadarSourceExpansionService,
  RadarResultMergerService,
  RadarSearchOrchestratorService,
  RadarSearchRunConfigService,
];

const RADAR_FILTER_SERVICES = [
  RadarDuplicateFilterService,
  RadarQualityGateService,
  RadarRunItemFilterService,
];

const RADAR_ENRICHMENT_SERVICES = [
  RadarScoreEnrichmentService,
];

const RADAR_SOCIAL_SERVICES = [
  RadarSocialJobService,
  RadarSocialResultWriterService,
  RadarSocialOrchestratorService,
  RadarSocialLookupService,
];

const RADAR_DELIVERY_SERVICES = [
  RadarPostDeliveryUpdateService,
  RadarDeliveryOrchestratorService,
  RadarVendasSyncService,
];

const RADAR_PRESENTATION_SERVICES = [
  RadarLeadPresenterService,
  RadarRunPresenterService,
];

const RADAR_PROVIDER_SERVICES = [
  GoogleSearchQueryBuilder,
  GoogleSearchResultNormalizer,
  GoogleSearchProviderService,
  RadarGoogleResponseService,
  RadarHbxEngineErrorsService,
];

const RADAR_SERVICES = [
  ...RADAR_SHARED_SERVICES,
  ...RADAR_PERSISTENCE_SERVICES,
  ...RADAR_SEARCH_SERVICES,
  ...RADAR_FILTER_SERVICES,
  ...RADAR_ENRICHMENT_SERVICES,
  ...RADAR_SOCIAL_SERVICES,
  ...RADAR_DELIVERY_SERVICES,
  ...RADAR_PRESENTATION_SERVICES,
  ...RADAR_PROVIDER_SERVICES,
];

@Module({
  imports: [ModulesAccessModule, MessagingModule, MailModule, CommercialPlansModule, MasterContextModule, forwardRef(() => VendasModule)],
  controllers: [WebscrapingController, MasterWebscrapingController],
  providers: [WebscrapingService, HbxEnginePoolService, ...RADAR_SERVICES],
  exports: [WebscrapingService, HbxEnginePoolService],
})
export class WebscrapingModule {}
