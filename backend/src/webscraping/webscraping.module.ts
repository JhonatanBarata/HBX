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
import { RadarRunPresenterService } from './radar/06-presentation/radar-run-presenter.service';
import { RadarRunRepositoryService } from './radar/persistence/radar-run-repository.service';
import { MasterWebscrapingController, WebscrapingController } from './webscraping.controller';
import { WebscrapingService } from './webscraping.service';

const RADAR_SERVICES = [
  RadarRunRepositoryService,
  RadarRunPresenterService,
  RadarSocialLookupService,
  RadarVendasSyncService,
];

@Module({
  imports: [ModulesAccessModule, MessagingModule, MailModule, CommercialPlansModule, MasterContextModule, forwardRef(() => VendasModule)],
  controllers: [WebscrapingController, MasterWebscrapingController],
  providers: [WebscrapingService, HbxEnginePoolService, ...RADAR_SERVICES],
  exports: [WebscrapingService, HbxEnginePoolService],
})
export class WebscrapingModule {}
