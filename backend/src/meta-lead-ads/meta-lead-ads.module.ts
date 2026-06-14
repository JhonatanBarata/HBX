import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { VendasModule } from '../vendas/vendas.module';
import { MetaGraphClient } from './meta-graph.client';
import { MetaLeadAdsService } from './meta-lead-ads.service';
import { MetaLeadAdsWebhookController } from './meta-lead-ads.webhook.controller';
import { MetaLeadAdsAdminController } from './meta-lead-ads-admin.controller';

@Module({
  imports: [PrismaModule, IntegrationsModule, VendasModule],
  controllers: [MetaLeadAdsWebhookController, MetaLeadAdsAdminController],
  providers: [MetaGraphClient, MetaLeadAdsService],
  exports: [MetaLeadAdsService],
})
export class MetaLeadAdsModule {}
