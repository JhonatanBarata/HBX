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
import { IntentEngineModule } from '../bot/intent/intent-engine.module';
// GATEWAY-WA (S1 frota, S2 outbox, S3 freio de envio).
import { WaSendThrottleService } from './wa-send-throttle.service';
import { WebwhatsOutboxConsumerService } from './webwhats-outbox-consumer.service';
import { WebwhatsFleetHealthService } from './webwhats-fleet-health.service';
import { WebwhatsFleetHealthController } from './webwhats-fleet-health.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => ModulesAccessModule), PaymentsModule, CadastrosModule, CustomerProfileModule, MailModule, IntentEngineModule],
  providers: [MessagingService, ConversationSessionsService, MessageOrchestratorService, OrderDraftsService, ConversationsService, WhatsAppStatusService, WhatsAppAuditService, WebwhatsBridgeService, InboxRealtimeService, WhatsappConsentLedgerService, WaSendThrottleService, WebwhatsOutboxConsumerService, WebwhatsFleetHealthService],
  controllers: [MessagingController, ConversationsController, WhatsAppController, MasterPaymentNotificationsController, WebwhatsFleetHealthController],
  exports: [WhatsAppStatusService, ConversationsService, WhatsAppAuditService, WebwhatsBridgeService, InboxRealtimeService, WhatsappConsentLedgerService, WaSendThrottleService],
})
export class MessagingModule {}
