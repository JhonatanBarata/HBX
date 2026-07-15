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
import { IntentEngineModule } from '../bot/intent/intent-engine.module';
import { BotModule } from '../bot/bot.module';
import { VendasController } from './vendas.controller';
import { VendasPublicController } from './vendas-public.controller';
import { VendasAutomationService } from './vendas-automation.service';
import { VendasConversationService } from './vendas-conversation.service';
import { VendasCockpitProjectionBridge } from './vendas-cockpit-projection.bridge';
import { VendasLeadCockpitProjectorService } from './vendas-lead-cockpit-projector.service';
import { VendasService } from './vendas.service';

@Module({
  imports: [PrismaModule, CadastrosModule, CustomerProfileModule, ModulesAccessModule, MessagingModule, InboxModule, CommercialPlansModule, CommissionsModule, MailModule, AuthModule, MasterAlertModule, IntentEngineModule, BotModule, forwardRef(() => WebscrapingModule)],
  controllers: [VendasController, VendasPublicController],
  providers: [
    VendasService,
    VendasAutomationService,
    VendasConversationService,
    VendasLeadCockpitProjectorService,
    VendasCockpitProjectionBridge,
  ],
  exports: [
    VendasService,
    VendasAutomationService,
    VendasConversationService,
    VendasLeadCockpitProjectorService,
  ],
})
export class VendasModule {}
