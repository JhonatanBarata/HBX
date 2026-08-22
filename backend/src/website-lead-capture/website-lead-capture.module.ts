import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { VendasModule } from '../vendas/vendas.module';
import { MessagingModule } from '../messaging/messaging.module';
import { MailModule } from '../mail/mail.module';
import { WebsiteLeadCaptureController } from './website-lead-capture.controller';
import { AppContatoHbxController } from './app-contato-hbx.controller';
import { WebsiteLeadCaptureService } from './website-lead-capture.service';

// PR22082026-CLIENTE-ME-ACHA: MailModule entra pro e-mail de suporte do pedido de contato
// vindo do app (AppContatoHbxController). Mesmo service, segunda porta.
@Module({
  imports: [PrismaModule, IntegrationsModule, VendasModule, MessagingModule, MailModule],
  controllers: [WebsiteLeadCaptureController, AppContatoHbxController],
  providers: [WebsiteLeadCaptureService],
  exports: [WebsiteLeadCaptureService],
})
export class WebsiteLeadCaptureModule {}
