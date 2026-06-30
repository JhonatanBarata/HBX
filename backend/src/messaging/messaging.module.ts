import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { ConversationSessionsService } from './conversation-sessions.service';
import { MessageOrchestratorService } from './message-orchestrator.service';
import { OrderDraftsService } from './order-drafts.service';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppStatusService } from './whatsapp-status.service';
import { ModulesAccessModule } from '../modules/modules.module';
import { WhatsAppAuditService } from './whatsapp-audit.service';
import { PaymentsModule } from '../payments/payments.module';
import { CadastrosModule } from '../cadastros/cadastros.module';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';
import { WebwhatsBridgeService } from './webwhats-bridge.service';
import { InboxRealtimeService } from './inbox-realtime.service';
import { MailModule } from '../mail/mail.module';
import { MasterPaymentNotificationsController } from './master-payment-notifications.controller';
import { WhatsappConsentLedgerService } from './whatsapp-consent-ledger.service';
import { AiIntentClassifierModule } from '../vendas/ai-intent-classifier.module';

@Module({
  imports: [PrismaModule, forwardRef(() => ModulesAccessModule), PaymentsModule, CadastrosModule, CustomerProfileModule, MailModule, AiIntentClassifierModule],
  providers: [MessagingService, ConversationSessionsService, MessageOrchestratorService, OrderDraftsService, ConversationsService, WhatsAppStatusService, WhatsAppAuditService, WebwhatsBridgeService, InboxRealtimeService, WhatsappConsentLedgerService],
  controllers: [MessagingController, ConversationsController, WhatsAppController, MasterPaymentNotificationsController],
  exports: [WhatsAppStatusService, ConversationsService, WhatsAppAuditService, WebwhatsBridgeService, InboxRealtimeService, WhatsappConsentLedgerService],
})
export class MessagingModule {}
