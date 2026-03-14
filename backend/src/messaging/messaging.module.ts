import { Module } from '@nestjs/common';
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

@Module({
  imports: [PrismaModule, ModulesAccessModule, PaymentsModule],
  providers: [MessagingService, ConversationSessionsService, MessageOrchestratorService, OrderDraftsService, ConversationsService, WhatsAppStatusService, WhatsAppAuditService],
  controllers: [MessagingController, ConversationsController, WhatsAppController],
  exports: [WhatsAppStatusService, ConversationsService, WhatsAppAuditService],
})
export class MessagingModule {}
