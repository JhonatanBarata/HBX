import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockMessageDto } from './dto/mock-message.dto';
import { ConversationsService } from '../messaging/conversations.service';
import { WhatsAppAuditService } from '../messaging/whatsapp-audit.service';
import {
  DEFAULT_RECOVERY_BOT_CONFIG,
  normalizeRecoveryBotConfig,
  RECOVERY_BOT_CONFIG_CHANNEL,
  RECOVERY_BOT_CONFIG_TITLE,
  type RecoveryRoutingRules,
} from '../hbx-recovery/recovery-bot-config';
import {
  buildStructuredWhatsAppLog,
  buildWhatsAppPhoneCandidates,
  normalizeWhatsAppPhone,
} from '../messaging/whatsapp-channel';
import {
  ATENDIMENTO_AGENDA_CONFIG_CHANNEL,
  ATENDIMENTO_AGENDA_CONFIG_TITLE,
  ATENDIMENTO_BOT_CONFIG_CHANNEL,
  ATENDIMENTO_BOT_CONFIG_TITLE,
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  normalizeAtendimentoAgendaConfig,
  normalizeAtendimentoBotConfig,
  type AtendimentoAgendaConfig,
  type AtendimentoBotConfig,
} from './atendimento-config';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly whatsappAudit: WhatsAppAuditService,
  ) {}

  private async logInboxEvent(input: {
    companyId: number;
    event: string;
    message: string;
    conversationId?: number | null;
    phone?: string | null;
    messageType?: string | null;
    result?: string | null;
    extra?: Record<string, unknown> | null;
  }) {
    await this.whatsappAudit.log({
      companyId: input.companyId,
      scope: 'inbox',
      event: input.event,
      message: input.message,
      metadata: buildStructuredWhatsAppLog({
        companyId: input.companyId,
        conversationId: input.conversationId,
        phone: input.phone,
        messageType: input.messageType,
        result: input.result,
        extra: input.extra || null,
      }),
    });
  }

  private requireCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Company context required');
    return companyId;
  }

  private requireTrimmed(value: string, field: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private parseConversationMetadata(raw: string | null | undefined): Record<string, any> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }

  private getAtendimentoBlockedState(metadataRaw: string | Record<string, any> | null | undefined) {
    const metadata =
      metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
        ? metadataRaw
        : this.parseConversationMetadata(String(metadataRaw || ''));
    const blockedAt = String(metadata?.atendimentoBlockedAt || '').trim() || null;
    const blockedReason = String(metadata?.atendimentoBlockedReason || '').trim() || null;
    return {
      isBlocked: Boolean(blockedAt),
      blockedAt,
      blockedReason,
    };
  }

  private clearAtendimentoBlockedMetadata(metadataRaw: Record<string, any> | null | undefined) {
    const metadata = { ...(metadataRaw || {}) };
    delete metadata.atendimentoBlockedAt;
    delete metadata.atendimentoBlockedReason;
    delete metadata.atendimentoBlockedByUserId;
    return metadata;
  }

  private toInboxStatus(conversation: {
    humanAssigned?: boolean | null;
    botActive?: boolean | null;
    flowResult?: string | null;
    metadata?: string | null;
  }) {
    if (this.getAtendimentoBlockedState(conversation?.metadata).isBlocked) return 'blocked';
    if (String(conversation?.flowResult || '').trim().toLowerCase() === 'manual_closed') return 'closed';
    if (conversation?.humanAssigned) return 'open';
    if (conversation?.botActive === false) return 'closed';
    return 'new';
  }

  private async resolveConversationDisplayName(companyId: number, contact: string, metadataRaw?: string | null) {
    const metadata = this.parseConversationMetadata(metadataRaw);
    const metadataName = String(metadata?.cliente || metadata?.customerName || metadata?.name || '').trim();
    if (metadataName) return metadataName;
    const digits = String(contact || '').replace(/\D/g, '');
    if (!digits) return null;
    const customer = await this.prisma.hbxRecoveryCustomer.findFirst({
      where: { companyId, whatsappNumber: { endsWith: digits } },
      select: { clientName: true, name: true },
    });
    return String(customer?.clientName || customer?.name || '').trim() || null;
  }

  private async getConfigRow(companyId: number, channel: string, title: string) {
    return this.prisma.hbxRecoveryFlowStage.findFirst({
      where: { companyId, channel, title },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, template: true },
    });
  }

  private async saveConfigRow(companyId: number, channel: string, title: string, payload: unknown) {
    const row = await this.getConfigRow(companyId, channel, title);
    const data = {
      companyId,
      title,
      channel,
      template: JSON.stringify(payload || {}),
      daysAfter: 0,
      enabled: false,
      sortOrder: 0,
    };
    if (row?.id) {
      await this.prisma.hbxRecoveryFlowStage.update({
        where: { id: row.id },
        data,
      });
      return;
    }
    await this.prisma.hbxRecoveryFlowStage.create({ data });
  }

  private async getBotConfigByCompanyId(companyId: number): Promise<AtendimentoBotConfig> {
    const row = await this.getConfigRow(
      companyId,
      ATENDIMENTO_BOT_CONFIG_CHANNEL,
      ATENDIMENTO_BOT_CONFIG_TITLE,
    );
    if (!row?.template) return DEFAULT_ATENDIMENTO_BOT_CONFIG;
    try {
      return normalizeAtendimentoBotConfig(JSON.parse(row.template));
    } catch {
      return DEFAULT_ATENDIMENTO_BOT_CONFIG;
    }
  }

  private async getAgendaConfigByCompanyId(companyId: number): Promise<AtendimentoAgendaConfig> {
    const row = await this.getConfigRow(
      companyId,
      ATENDIMENTO_AGENDA_CONFIG_CHANNEL,
      ATENDIMENTO_AGENDA_CONFIG_TITLE,
    );
    if (!row?.template) return DEFAULT_ATENDIMENTO_AGENDA_CONFIG;
    try {
      return normalizeAtendimentoAgendaConfig(JSON.parse(row.template));
    } catch {
      return DEFAULT_ATENDIMENTO_AGENDA_CONFIG;
    }
  }

  private async getRecoveryRoutingRules(companyId: number): Promise<RecoveryRoutingRules> {
    const row = await this.prisma.hbxRecoveryFlowStage.findFirst({
      where: {
        companyId,
        channel: RECOVERY_BOT_CONFIG_CHANNEL,
        title: RECOVERY_BOT_CONFIG_TITLE,
      },
      orderBy: { updatedAt: 'desc' },
      select: { template: true },
    });
    if (!row?.template) return { ...DEFAULT_RECOVERY_BOT_CONFIG.routingRules };
    try {
      return normalizeRecoveryBotConfig(JSON.parse(row.template)).routingRules;
    } catch {
      return { ...DEFAULT_RECOVERY_BOT_CONFIG.routingRules };
    }
  }

  private async resolveRecoveryRoutingContext(
    companyId: number,
    conversation: any,
    routingRules: RecoveryRoutingRules,
  ) {
    const metadata = this.parseConversationMetadata(conversation?.metadata);
    const metadataCustomerId = String(
      metadata?.recoveryCustomerId || metadata?.customerId || metadata?.customer_id || '',
    ).trim();
    const digits = String(conversation?.contact || '').replace(/\D/g, '');
    const latestSourceModule = String(conversation?.messages?.[0]?.sourceModule || '')
      .trim()
      .toLowerCase();

    const recoveryCustomer = metadataCustomerId
      ? await this.prisma.hbxRecoveryCustomer.findFirst({
          where: { companyId, id: metadataCustomerId },
          select: { id: true, name: true, clientName: true, openAmount: true },
        })
      : digits
        ? await this.prisma.hbxRecoveryCustomer.findFirst({
            where: { companyId, whatsappNumber: { endsWith: digits } },
            select: { id: true, name: true, clientName: true, openAmount: true },
          })
        : null;

    const hasRecoveryDebt = Number(recoveryCustomer?.openAmount || 0) > 0;
    const recoveryFlow =
      String(conversation?.currentFlow || '').trim().toLowerCase().includes('recovery') ||
      latestSourceModule.startsWith('hbx_recovery');

    let routeTarget: 'recovery' | 'atendimento' = 'atendimento';
    let routeReason = 'Atendimento manual padrao.';

    if (conversation?.humanAssigned && routingRules.preferInboxForManualQueue) {
      routeTarget = 'atendimento';
      routeReason = 'Cliente aguardando tratativa humana na fila manual.';
    } else if (hasRecoveryDebt && routingRules.preferRecoveryForDebtors) {
      routeTarget = 'recovery';
      routeReason = 'Cliente com debito em aberto e contexto ativo de cobranca.';
    } else if (recoveryFlow && routingRules.preferRecoveryForNegotiations) {
      routeTarget = 'recovery';
      routeReason = 'Conversa originada ou mantida pelo fluxo do HBX Recovery.';
    }

    return {
      routeTarget,
      routeReason,
      recoveryCustomerId: recoveryCustomer?.id ? String(recoveryCustomer.id) : null,
      recoveryCustomerName: String(
        recoveryCustomer?.clientName || recoveryCustomer?.name || '',
      ).trim() || null,
      recoveryOpenAmount: Number(recoveryCustomer?.openAmount || 0),
      recoveryCurrentStep: String(conversation?.currentStep || '').trim() || null,
      recoverySuggestedPath: routeTarget === 'recovery' ? '/hbx-recovery' : '/dashboard/inbox',
      latestSourceModule: latestSourceModule || null,
    };
  }

  private async mapConversation(
    companyId: number,
    conversation: any,
    routingRules: RecoveryRoutingRules,
  ) {
    const displayName = await this.resolveConversationDisplayName(
      companyId,
      String(conversation.contact || ''),
      conversation.metadata,
    );
    const routeContext = await this.resolveRecoveryRoutingContext(companyId, conversation, routingRules);
    const blockedState = this.getAtendimentoBlockedState(conversation.metadata);
    return {
      id: String(conversation.id),
      status: this.toInboxStatus(conversation),
      assignedTo: conversation.humanAssigned ? 'humano' : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      routeTarget: routeContext.routeTarget,
      routeReason: routeContext.routeReason,
      recoveryCustomerId: routeContext.recoveryCustomerId,
      recoveryCustomerName: routeContext.recoveryCustomerName,
      recoveryOpenAmount: routeContext.recoveryOpenAmount,
      recoveryCurrentStep: routeContext.recoveryCurrentStep,
      recoverySuggestedPath: routeContext.recoverySuggestedPath,
      latestSourceModule: routeContext.latestSourceModule,
      isBlocked: blockedState.isBlocked,
      blockedAt: blockedState.blockedAt,
      blockedReason: blockedState.blockedReason,
      metadata: this.parseConversationMetadata(conversation.metadata),
      customer: {
        id: String(conversation.id),
        phone: String(conversation.contact || ''),
        name: displayName,
      },
      messages: (conversation.messages || []).map((message: any) => ({
        id: String(message.id),
        direction: String(message.direction || '').trim().toLowerCase(),
        content: String(message.body || ''),
        createdAt: message.timestamp,
        messageType: String(message.messageType || 'text').trim().toLowerCase(),
        senderType: String(message.senderType || 'system').trim().toLowerCase(),
        status: String(message.status || 'RECEIVED').trim().toUpperCase(),
        sourceModule: String(message.sourceModule || '').trim().toLowerCase() || null,
        error: message.error ? String(message.error) : null,
      })),
    };
  }

  private async ensureConversation(companyId: number, id: number) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id, companyId, channel: 'whatsapp' },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async appendInboxSystemEvent(input: {
    companyId: number;
    conversationId: number;
    contactId: string;
    text: string;
    eventType: string;
    sourceModule?: string;
    variables?: Record<string, unknown>;
  }) {
    const now = new Date();
    await this.prisma.companyMessage.create({
      data: {
        companyId: input.companyId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        direction: 'OUTBOUND',
        messageType: 'system_event',
        body: input.text,
        senderType: 'system',
        status: 'SENT',
        timestamp: now,
        sourceModule: input.sourceModule || 'atendimento_internal',
        variablesJson: JSON.stringify({
          ...(input.variables || {}),
          eventType: input.eventType,
        }),
        provider: 'INTERNAL',
      },
    });
    await this.prisma.companyConversation.update({
      where: { id: input.conversationId },
      data: { lastInteractionAt: now, lastMessageAt: now },
    });
  }

  async listConversations(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const rows = await this.prisma.companyConversation.findMany({
      where: { companyId, channel: 'whatsapp' },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });
    return Promise.all(rows.map((row) => this.mapConversation(companyId, row, routingRules)));
  }

  private async getConversationByIdForCompany(companyId: number, id: number) {
    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id, companyId, channel: 'whatsapp' },
      include: {
        messages: { orderBy: { timestamp: 'asc' } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.mapConversation(companyId, conversation, routingRules);
  }

  async getConversationById(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.getConversationByIdForCompany(companyId, id);
  }

  async getBotConfig(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.getBotConfigByCompanyId(companyId);
  }

  async updateBotConfig(user: any, payload: unknown) {
    const companyId = this.requireCompanyIdFromUser(user);
    const normalized = normalizeAtendimentoBotConfig(payload || {});
    await this.saveConfigRow(
      companyId,
      ATENDIMENTO_BOT_CONFIG_CHANNEL,
      ATENDIMENTO_BOT_CONFIG_TITLE,
      normalized,
    );
    return normalized;
  }

  async getAgendaConfig(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.getAgendaConfigByCompanyId(companyId);
  }

  async updateAgendaConfig(user: any, payload: unknown) {
    const companyId = this.requireCompanyIdFromUser(user);
    const normalized = normalizeAtendimentoAgendaConfig(payload || {});
    await this.saveConfigRow(
      companyId,
      ATENDIMENTO_AGENDA_CONFIG_CHANNEL,
      ATENDIMENTO_AGENDA_CONFIG_TITLE,
      normalized,
    );
    return normalized;
  }

  async updateConversationStatus(user: any, id: number, status: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, id);
    const normalized = String(status || '').trim().toLowerCase();
    const currentMetadata = this.parseConversationMetadata(conversation.metadata);
    const clearedMetadata = this.clearAtendimentoBlockedMetadata(currentMetadata);

    await this.prisma.companyConversation.update({
      where: { id },
      data: {
        botActive: normalized === 'new',
        humanAssigned: normalized === 'open',
        flowResult:
          normalized === 'closed'
            ? 'manual_closed'
            : normalized === 'blocked'
              ? 'blocked_manual'
              : null,
        metadata:
          normalized === 'blocked'
            ? JSON.stringify({
                ...clearedMetadata,
                atendimentoBlockedAt: new Date().toISOString(),
                atendimentoBlockedReason: 'Bloqueado manualmente pelo operador.',
                atendimentoBlockedByUserId: Number(user?.id || 0) || null,
              })
            : JSON.stringify(clearedMetadata),
      },
    });
    await this.logInboxEvent({
      companyId,
      event: 'conversation_status_updated',
      message: `Status manual atualizado para ${normalized}`,
      conversationId: id,
      result: normalized,
    });
    return this.getConversationByIdForCompany(companyId, id);
  }

  async blockConversation(user: any, conversationId: number, reasonRaw?: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const metadata = this.parseConversationMetadata(conversation.metadata);
    const reason = String(reasonRaw || '').trim() || 'Bloqueado manualmente pelo operador.';
    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'blocked_manual',
      metadata: {
        ...metadata,
        atendimentoBlockedAt: new Date().toISOString(),
        atendimentoBlockedReason: reason,
        atendimentoBlockedByUserId: Number(user?.id || 0) || null,
      },
    });
    await this.appendInboxSystemEvent({
      companyId,
      conversationId: conversation.id,
      contactId: String(conversation.contact || '').trim(),
      text: `Cliente bloqueado no Atendimento (${reason}).`,
      eventType: 'atendimento_blocked',
      variables: { reason },
    });
    await this.logInboxEvent({
      companyId,
      event: 'conversation_blocked',
      message: `Cliente bloqueado no Atendimento (${reason})`,
      conversationId,
      phone: String(conversation.contact || '').trim(),
      result: 'blocked',
    });
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  async unblockConversation(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const metadata = this.clearAtendimentoBlockedMetadata(
      this.parseConversationMetadata(conversation.metadata),
    );
    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: true,
      humanAssigned: false,
      flowResult: null,
      metadata,
    });
    await this.appendInboxSystemEvent({
      companyId,
      conversationId: conversation.id,
      contactId: String(conversation.contact || '').trim(),
      text: 'Cliente desbloqueado no Atendimento.',
      eventType: 'atendimento_unblocked',
    });
    await this.logInboxEvent({
      companyId,
      event: 'conversation_unblocked',
      message: 'Cliente desbloqueado no Atendimento.',
      conversationId,
      phone: String(conversation.contact || '').trim(),
      result: 'unblocked',
    });
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  async sendMessage(user: any, conversationId: number, content: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (this.getAtendimentoBlockedState(conversation.metadata).isBlocked) {
      throw new BadRequestException('Conversa bloqueada. Desbloqueie antes de responder.');
    }

    const normalizedContent = this.requireTrimmed(content, 'content');
    const toPhone = this.requireTrimmed(String(conversation.contact || ''), 'customer phone');

    await this.conversations.queueOutboundForCompany(companyId, {
      conversationId,
      to: toPhone,
      body: normalizedContent,
      messageType: 'text',
      sourceModule: 'atendimento_human',
      senderType: 'human',
      contactId: toPhone,
      flowState: {
        humanAssigned: true,
        botActive: false,
        flowResult: null,
      },
    });

    await this.logInboxEvent({
      companyId,
      event: 'manual_outbound_queued',
      message: `Mensagem manual enfileirada para ${toPhone}`,
      conversationId,
      phone: toPhone,
      messageType: 'text',
      result: 'queued',
      extra: { sourceModule: 'atendimento_human' },
    });

    return this.getConversationByIdForCompany(companyId, conversationId);
  }

  async mockMessage(user: any, dto: MockMessageDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const phone = this.requireTrimmed(dto.phone, 'phone');
    const content = this.requireTrimmed(dto.message, 'message');
    await this.conversations.recordInboundMessage({
      companyId,
      from: phone,
      body: content,
    });
    const candidates = buildWhatsAppPhoneCandidates(phone);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: {
        companyId,
        channel: 'whatsapp',
        OR: [
          { contact: normalizeWhatsAppPhone(phone) },
          ...candidates.map((candidate) => ({ contact: candidate })),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conversation) throw new NotFoundException('Conversation not found after mock inbound');
    await this.logInboxEvent({
      companyId,
      event: 'mock_inbound_recorded',
      message: `Mensagem mock persistida para ${phone}`,
      conversationId: conversation.id,
      phone,
      messageType: 'text',
      result: 'received',
    });
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }
}
