import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { VendasModule } from '../vendas/vendas.module';
import { MessagingModule } from '../messaging/messaging.module';
import { WebsiteLeadCaptureController } from './website-lead-capture.controller';
import { WebsiteLeadCaptureService } from './website-lead-capture.service';

@Module({
  imports: [PrismaModule, IntegrationsModule, VendasModule, MessagingModule],
  controllers: [WebsiteLeadCaptureController],
  providers: [WebsiteLeadCaptureService],
  exports: [WebsiteLeadCaptureService],
})
export class WebsiteLeadCaptureModule {}
