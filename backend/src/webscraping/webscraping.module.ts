import { forwardRef, Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { VendasModule } from '../vendas/vendas.module';
import { MailModule } from '../mail/mail.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { MasterContextModule } from '../master-context/master-context.module';
import { HbxEnginePoolService } from './hbx-engine-pool.service';
import { RadarRunRepositoryService } from './radar/radar-run-repository.service';
import { RadarRunPresenterService } from './radar/radar-run-presenter.service';
import { RadarSocialLookupService } from './radar/radar-social-lookup.service';
import { RadarVendasSyncService } from './radar/radar-vendas-sync.service';
import { MasterWebscrapingController, WebscrapingController } from './webscraping.controller';
import { WebscrapingService } from './webscraping.service';

@Module({
  imports: [ModulesAccessModule, MessagingModule, MailModule, CommercialPlansModule, MasterContextModule, forwardRef(() => VendasModule)],
  controllers: [WebscrapingController, MasterWebscrapingController],
  providers: [WebscrapingService, HbxEnginePoolService, RadarRunRepositoryService, RadarRunPresenterService, RadarSocialLookupService, RadarVendasSyncService],
  exports: [WebscrapingService, HbxEnginePoolService],
})
export class WebscrapingModule {}
