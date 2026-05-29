import { forwardRef, Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { VendasModule } from '../vendas/vendas.module';
import { MailModule } from '../mail/mail.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { MasterContextModule } from '../master-context/master-context.module';
import { HbxEnginePoolService } from './hbx-engine-pool.service';
import { RadarSocialLookupService } from './radar/04-socials/radar-social-lookup.service';
import { RadarVendasSyncService } from './radar/05-delivery/radar-vendas-sync.service';
import { RadarLeadPresenterService } from './radar/06-presentation/radar-lead-presenter.service';
import { RadarRunPresenterService } from './radar/06-presentation/radar-run-presenter.service';
import { RadarSearchRunConfigService } from './radar/01-search/radar-search-run-config.service';
import { RadarDuplicateFilterService } from './radar/02-filter/radar-duplicate-filter.service';
import { RadarScoreEnrichmentService } from './radar/03-enrichment/radar-score-enrichment.service';
import { RadarGoogleResponseService } from './radar/providers/google-search/radar-google-response.service';
import { RadarHbxEngineErrorsService } from './radar/providers/hbx-engine/radar-hbx-engine-errors.service';
import { RadarRunRepositoryService } from './radar/persistence/radar-run-repository.service';
import { RadarSharedNormalizerService } from './radar/shared/radar-shared-normalizer.service';
import { MasterWebscrapingController, WebscrapingController } from './webscraping.controller';
import { WebscrapingService } from './webscraping.service';

const RADAR_SHARED_SERVICES = [
  RadarSharedNormalizerService,
];

const RADAR_PERSISTENCE_SERVICES = [
  RadarRunRepositoryService,
];

const RADAR_SEARCH_SERVICES = [
  RadarSearchRunConfigService,
];

const RADAR_FILTER_SERVICES = [
  RadarDuplicateFilterService,
];

const RADAR_ENRICHMENT_SERVICES = [
  RadarScoreEnrichmentService,
];

const RADAR_SOCIAL_SERVICES = [
  RadarSocialLookupService,
];

const RADAR_DELIVERY_SERVICES = [
  RadarVendasSyncService,
];

const RADAR_PRESENTATION_SERVICES = [
  RadarLeadPresenterService,
  RadarRunPresenterService,
];

const RADAR_PROVIDER_SERVICES = [
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
