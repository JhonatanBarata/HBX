import { forwardRef, Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { VendasModule } from '../vendas/vendas.module';
import { MailModule } from '../mail/mail.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { MasterContextModule } from '../master-context/master-context.module';
import { HbxEngineDockerAdapterService } from './hbx-engine-docker-adapter.service';
import { HbxEngineGovernorService } from './hbx-engine-governor.service';
import { HbxEnginePoolService } from './hbx-engine-pool.service';
import { HbxEngineTelemetryService } from './hbx-engine-telemetry.service';
import { EnrichmentCostModule } from './enrichment-cost/enrichment-cost.module';
import { LeadHarvestModule } from './lead-harvest/lead-harvest.module';
import { RadarSocialLookupService } from './radar/04-socials/radar-social-lookup.service';
import { RadarSocialJobService } from './radar/04-socials/radar-social-job.service';
import { RadarSocialOrchestratorService } from './radar/04-socials/radar-social-orchestrator.service';
import { RadarSocialResultWriterService } from './radar/04-socials/radar-social-result-writer.service';
import { RadarVendasSyncService } from './radar/05-delivery/radar-vendas-sync.service';
import { RadarLeadPresenterService } from './radar/06-presentation/radar-lead-presenter.service';
import { RadarRunPresenterService } from './radar/06-presentation/radar-run-presenter.service';
import { RadarSearchRunConfigService } from './radar/01-search/radar-search-run-config.service';
import { RadarInternalReprocessSourceService } from './radar/01-search/radar-internal-reprocess-source.service';
import { RadarSourceExecutorService } from './radar/01-search/radar-source-executor.service';
import { RadarCnpjPublicSourceService } from './radar/01-search/radar-cnpj-public-source.service';
import { RadarLocalDirectorySourceService } from './radar/01-search/radar-local-directory-source.service';
import { RadarVerticalSourceService } from './radar/01-search/radar-vertical-source.service';
import { RadarWebsiteCrawlSourceService } from './radar/01-search/radar-website-crawl-source.service';
import { RadarSearchGeoService } from './radar/01-search/radar-search-geo.service';
import { RadarSearchInputService } from './radar/01-search/radar-search-input.service';
import { RadarResultMergerService } from './radar/01-search/radar-result-merger.service';
import { RadarSearchOrchestratorService } from './radar/01-search/radar-search-orchestrator.service';
import { RadarSourceExpansionService } from './radar/01-search/radar-source-expansion.service';
import { RadarSearchStrategyService } from './radar/01-search/radar-search-strategy.service';
import { RadarSourcePlannerService } from './radar/01-search/radar-source-planner.service';
import { RadarMissionQueueService } from './radar/missions/radar-mission-queue.service';
import { RadarMissionsController } from './radar/missions/radar-missions.controller';
import { MissionResultApplyService } from './radar/missions/mission-result-apply.service';
import { RadarFabricaService } from './radar/fabrica/radar-fabrica.service';
import { RadarFabricaController } from './radar/fabrica/radar-fabrica.controller';
import { RadarSearchSessionService } from './radar/sessions/radar-search-session.service';
import { RadarSessionsController } from './radar/sessions/radar-sessions.controller';
import { RadarDuplicateFilterService } from './radar/02-filter/radar-duplicate-filter.service';
import { RadarQualityGateService } from './radar/02-filter/radar-quality-gate.service';
import { RadarRunItemFilterService } from './radar/02-filter/radar-run-item-filter.service';
import { RadarEnrichmentJobPipelineService } from './radar/03-enrichment/radar-enrichment-job-pipeline.service';
import { RadarOpportunitySignalService } from './radar/03-enrichment/radar-opportunity-signal.service';
import { RadarPublicDataService } from './radar/03-enrichment/radar-public-data.service';
import { RadarScoreEnrichmentService } from './radar/03-enrichment/radar-score-enrichment.service';
import { RadarWebEnrichmentService } from './radar/03-enrichment/radar-web-enrichment.service';
import { RadarWebEnrichmentJobService } from './radar/03-enrichment/radar-web-enrichment-job.service';
import { AiSaneamentoService } from './radar/03-enrichment/ai-saneamento.service';
import { AiContactExtractionService } from './radar/03-enrichment/ai-contact-extraction.service';
import { IcpFingerprintService } from './icp/icp-fingerprint.service';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';
import { GoogleSearchQueryBuilder } from './radar/providers/google-search/google-search-query-builder';
import { GoogleSearchResultNormalizer } from './radar/providers/google-search/google-search-result-normalizer';
import { RadarGoogleResponseService } from './radar/providers/google-search/radar-google-response.service';
import { RadarHbxEngineErrorsService } from './radar/providers/hbx-engine/radar-hbx-engine-errors.service';
import { CnpjPublicDatasetService } from './radar/providers/cnpj-public/cnpj-public-dataset.service';
import { CnpjPublicProviderService } from './radar/providers/cnpj-public/cnpj-public-provider.service';
import { CnpjDiscoveryService } from './radar/providers/cnpj-public/cnpj-discovery.service';
import { CnpjBaseQueryService } from './radar/providers/cnpj-public/cnpj-base-query.service';
import { CnpjRfbReconcileService } from './radar/providers/cnpj-public/cnpj-rfb-reconcile.service';
import { CnpjBaseController } from './radar/providers/cnpj-public/cnpj-base.controller';
import { RadarCountService } from './radar/providers/cnpj-public/radar-count.service';
import { LocalDirectoryProviderService } from './radar/providers/local-directories/local-directory-provider.service';
import { VerticalSourceProviderService } from './radar/providers/vertical-sources/vertical-source-provider.service';
import { WebsiteCrawlProviderService } from './radar/providers/website-crawl/website-crawl-provider.service';
import { RadarDeliveryOrchestratorService } from './radar/05-delivery/radar-delivery-orchestrator.service';
import { RadarPostDeliveryUpdateService } from './radar/05-delivery/radar-post-delivery-update.service';
import { RadarPostDeliveryVendasUpdateService } from './radar/05-delivery/radar-post-delivery-vendas-update.service';
import { RadarPostDeliveryAiSaneamentoService } from './radar/05-delivery/radar-post-delivery-ai-saneamento.service';
import { LeadContactWriteService } from './radar/persistence/lead-contact-write.service';
import { LeadPersonWriteService } from './radar/persistence/lead-person-write.service';
import { RadarRunRepositoryService } from './radar/persistence/radar-run-repository.service';
import { RadarDiagnosticService } from './radar/shared/radar-diagnostic.service';
import { RadarSharedNormalizerService } from './radar/shared/radar-shared-normalizer.service';
import { WebscrapingInternalRadarController } from './webscraping-internal-radar.controller';
import { MasterWebscrapingController, WebscrapingController } from './webscraping.controller';
import { WebscrapingService } from './webscraping.service';

const RADAR_SHARED_SERVICES = [
  RadarDiagnosticService,
  RadarSharedNormalizerService,
];

const RADAR_PERSISTENCE_SERVICES = [
  RadarRunRepositoryService,
  LeadContactWriteService,
  LeadPersonWriteService,
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
  RadarInternalReprocessSourceService,
  RadarSourceExecutorService,
  RadarCnpjPublicSourceService,
  RadarLocalDirectorySourceService,
  RadarVerticalSourceService,
  RadarWebsiteCrawlSourceService,
];

const RADAR_FILTER_SERVICES = [
  RadarDuplicateFilterService,
  RadarQualityGateService,
  RadarRunItemFilterService,
];

const RADAR_ENRICHMENT_SERVICES = [
  RadarEnrichmentJobPipelineService,
  RadarOpportunitySignalService,
  RadarPublicDataService,
  RadarScoreEnrichmentService,
  RadarWebEnrichmentService,
  RadarWebEnrichmentJobService,
  AiSaneamentoService,
  AiContactExtractionService,
  IcpFingerprintService,
];

const RADAR_SOCIAL_SERVICES = [
  RadarSocialJobService,
  RadarSocialResultWriterService,
  RadarSocialOrchestratorService,
  RadarSocialLookupService,
];

const RADAR_DELIVERY_SERVICES = [
  RadarPostDeliveryUpdateService,
  RadarPostDeliveryVendasUpdateService,
  RadarDeliveryOrchestratorService,
  RadarVendasSyncService,
  RadarPostDeliveryAiSaneamentoService,
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
  CnpjPublicDatasetService,
  CnpjPublicProviderService,
  CnpjDiscoveryService,
  CnpjBaseQueryService,
  CnpjRfbReconcileService,
  RadarCountService,
  LocalDirectoryProviderService,
  VerticalSourceProviderService,
  WebsiteCrawlProviderService,
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
  imports: [ModulesAccessModule, MessagingModule, MailModule, CommercialPlansModule, MasterContextModule, LeadHarvestModule, EnrichmentCostModule, forwardRef(() => VendasModule)],
  controllers: [WebscrapingController, MasterWebscrapingController, WebscrapingInternalRadarController, RadarMissionsController, RadarFabricaController, RadarSessionsController, CnpjBaseController],
  providers: [WebscrapingService, HbxEnginePoolService, HbxEngineDockerAdapterService, HbxEngineTelemetryService, HbxEngineGovernorService, RadarMissionQueueService, MissionResultApplyService, RadarFabricaService, RadarSearchSessionService, ...RADAR_SERVICES],
  exports: [WebscrapingService, HbxEnginePoolService, HbxEngineGovernorService, RadarMissionQueueService, RadarFabricaService],
})
export class WebscrapingModule {}
