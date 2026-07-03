import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { VendasModule } from '../vendas/vendas.module';
import { MetaGraphClient } from './meta-graph.client';
import { MetaLeadAdsService } from './meta-lead-ads.service';
import { MetaLeadAdsWorker } from './meta-lead-ads.worker';
import { MetaLeadAdsWebhookController } from './meta-lead-ads.webhook.controller';
import { MetaLeadAdsAdminController } from './meta-lead-ads-admin.controller';

@Module({
  imports: [PrismaModule, IntegrationsModule, VendasModule],
  controllers: [MetaLeadAdsWebhookController, MetaLeadAdsAdminController],
  // MetaLeadAdsWorker (ARQ11 S1): drena a fila durável (retry) + reconciliação diária.
  providers: [MetaGraphClient, MetaLeadAdsService, MetaLeadAdsWorker],
  exports: [MetaLeadAdsService],
})
export class MetaLeadAdsModule {}
