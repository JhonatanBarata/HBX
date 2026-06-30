import { forwardRef, Module } from '@nestjs/common';
import { CadastrosModule } from '../cadastros/cadastros.module';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';
import { InboxModule } from '../inbox/inbox.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { CommercialPlansModule } from '../commercial-plans/commercial-plans.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { WebscrapingModule } from '../webscraping/webscraping.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { MasterAlertModule } from '../master-alert/master-alert.module';
import { AiIntentClassifierModule } from './ai-intent-classifier.module';
import { VendasController } from './vendas.controller';
import { VendasPublicController } from './vendas-public.controller';
import { VendasAutomationService } from './vendas-automation.service';
import { VendasService } from './vendas.service';

@Module({
  imports: [PrismaModule, CadastrosModule, CustomerProfileModule, ModulesAccessModule, MessagingModule, InboxModule, CommercialPlansModule, CommissionsModule, MailModule, AuthModule, MasterAlertModule, AiIntentClassifierModule, forwardRef(() => WebscrapingModule)],
  controllers: [VendasController, VendasPublicController],
  providers: [VendasService, VendasAutomationService],
  exports: [VendasService, VendasAutomationService],
})
export class VendasModule {}
