import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockMessageDto } from './dto/mock-message.dto';
import { ConversationsService } from '../messaging/conversations.service';
import { WhatsAppAuditService } from '../messaging/whatsapp-audit.service';
import {
  buildStructuredWhatsAppLog,
  buildWhatsAppPhoneCandidates,
  normalizeWhatsAppPhone,
} from '../messaging/whatsapp-channel';

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

  private toInboxStatus(conversation: {
    humanAssigned?: boolean | null;
    botActive?: boolean | null;
    flowResult?: string | null;
  }) {
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

  private async mapConversation(companyId: number, conversation: any) {
    const displayName = await this.resolveConversationDisplayName(
      companyId,
      String(conversation.contact || ''),
      conversation.metadata,
    );
    return {
      id: String(conversation.id),
      status: this.toInboxStatus(conversation),
      assignedTo: conversation.humanAssigned ? 'humano' : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
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
        error: message.error ? String(message.error) : null,
      })),
    };
  }

  private async ensureConversation(companyId: number, id: number) {
    const conversation = await this.prisma.companyConversation.findFirst({ where: { id, companyId, channel: 'whatsapp' } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async listConversations(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
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
    return Promise.all(rows.map((row) => this.mapConversation(companyId, row)));
  }

  private async getConversationByIdForCompany(companyId: number, id: number) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id, companyId, channel: 'whatsapp' },
      include: {
        messages: { orderBy: { timestamp: 'asc' } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.mapConversation(companyId, conversation);
  }

  async getConversationById(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.getConversationByIdForCompany(companyId, id);
  }

  async updateConversationStatus(user: any, id: number, status: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    await this.ensureConversation(companyId, id);
    const normalized = String(status || '').trim().toLowerCase();
    await this.prisma.companyConversation.update({
      where: { id },
      data: {
        botActive: normalized === 'new',
        humanAssigned: normalized === 'open',
        flowResult: normalized === 'closed' ? 'manual_closed' : null,
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

  async sendMessage(user: any, conversationId: number, content: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

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
        OR: [{ contact: normalizeWhatsAppPhone(phone) }, ...candidates.map((candidate) => ({ contact: candidate }))],
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
