import { Module } from '@nestjs/common';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WebsiteCrawlProviderService } from '../webscraping/radar/providers/website-crawl/website-crawl-provider.service';
import { CnpjBaseQueryService } from '../webscraping/radar/providers/cnpj-public/cnpj-base-query.service';
import { NightFactoryController } from './night-factory.controller';
import { NightFactoryPublicController } from './night-factory-public.controller';
import { NightFactoryService } from './night-factory.service';
import { NightFactoryWorker } from './night-factory.worker';
import { NightOrderController } from './night-order.controller';
import { NightOrderService } from './night-order.service';

@Module({
  imports: [PrismaModule, CommercialPlansModule],
  controllers: [NightFactoryController, NightFactoryPublicController, NightOrderController],
  providers: [NightFactoryService, NightFactoryWorker, NightOrderService, WebsiteCrawlProviderService, CnpjBaseQueryService],
  exports: [NightFactoryService, NightOrderService],
})
export class NightFactoryModule {}
