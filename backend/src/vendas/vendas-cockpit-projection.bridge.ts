import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConversationsService,
  type VendasCockpitProjectionHookInput,
} from '../messaging/conversations.service';
import { VendasLeadCockpitProjectorService } from './vendas-lead-cockpit-projector.service';

@Injectable()
export class VendasCockpitProjectionBridge implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly projector: VendasLeadCockpitProjectorService,
  ) {}

  onModuleInit() {
    this.conversations.setVendasCockpitProjectionHook((input) => this.project(input));
  }

  onModuleDestroy() {
    this.conversations.setVendasCockpitProjectionHook(null);
  }

  private async project(input: VendasCockpitProjectionHookInput) {
    const snapshot = await this.projector.rebuildConversation(input.companyId, input.conversationId);
    if (
      input.event === 'inbound' &&
      input.validHumanInbound &&
      Number(input.messageId || 0) > 0 &&
      snapshot?.leadId
    ) {
      await this.projector.signalValidHumanInbound(
        input.companyId,
        snapshot.leadId,
        input.conversationId,
        Number(input.messageId),
      );
    }
  }
}
