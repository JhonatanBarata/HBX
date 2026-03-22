import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppStatusService } from './whatsapp-status.service';
import {
  buildWhatsAppPhoneCandidates,
  normalizeWhatsAppPhone,
} from './whatsapp-channel';
import { resolveWhatsAppCredentials } from './whatsapp-credentials.util';
import { applyMasterWhatsAppCredentials } from '../modules/master-global-integrations.util';

function requireCompanyIdFromUser(user: any): number {
  const companyId = Number(user?.companyId);
  if (!companyId) throw new ForbiddenException('Company context required');
  return companyId;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function normalizeWhatsAppContact(raw: string): string {
  const normalized = normalizeWhatsAppPhone(raw);
  if (normalized) return normalized;
  return String(raw || '').trim();
}

export type QueueOutboundPayload = {
  conversationId?: number;
  to: string;
  body?: string;
  at?: Date;
  messageType?: 'text' | 'template' | 'interactive' | string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  interactivePayload?: Record<string, any>;
  sourceModule?: string;
  contactId?: string;
  senderType?: 'bot' | 'human' | 'client' | 'system' | string;
  variables?: Record<string, unknown>;
  flowState?: ConversationStatePatch;
  whatsappEndpointId?: string;
  preferredModuleKey?: string;
};

export type ConversationStatePatch = {
  currentFlow?: string;
  currentStep?: string;
  flowResult?: string | null;
  botActive?: boolean;
  humanAssigned?: boolean;
  assignedUserId?: number | null;
  metadata?: Record<string, unknown> | null;
  lastInteractionAt?: Date;
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappStatus: WhatsAppStatusService,
  ) {}

  private async supportsWhatsAppEndpointTable() {
    return this.prisma.hasTable('CompanyWhatsAppEndpoint');
  }

  private async supportsOutboundEndpointColumn() {
    return this.prisma.hasColumn('OutboundMessage', 'whatsappEndpointId');
  }

  private pickPreferredConversation(candidates: any[], normalizedContact: string) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const normalizedDigits = String(normalizedContact || '').replace(/\D/g, '');
    const humanAssigned = candidates.find((row) => row?.humanAssigned);
    if (humanAssigned) return humanAssigned;

    const exact = candidates.find((row) => String(row?.contact || '').trim() === normalizedContact);
    if (exact) return exact;

    const digitMatch = candidates.find((row) => {
      const candidateDigits = String(row?.contact || '').replace(/\D/g, '');
      return candidateDigits && normalizedDigits && candidateDigits === normalizedDigits;
    });
    if (digitMatch) return digitMatch;

    return candidates[0];
  }

  private parseConversationMetadata(raw: string | null | undefined) {
    if (!raw) return {} as Record<string, any>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }

  private async getOrCreateConversation(input: { companyId: number; contact: string; channel?: string; at?: Date }) {
    const companyId = Number(input.companyId);
    const channel = String(input.channel || 'whatsapp');
    const contact =
      channel === 'whatsapp'
        ? normalizeWhatsAppContact(input.contact)
        : String(input.contact || '').trim();
    if (!companyId) throw new ForbiddenException('Company context required');
    if (!contact) throw new BadRequestException('Contact is required');

    const at = input.at ?? new Date();
    if (channel === 'whatsapp') {
      const candidates = buildWhatsAppPhoneCandidates(contact);
      const digits = contact.replace(/\D/g, '');
      if (digits || candidates.length) {
        const existingRows = await this.prisma.companyConversation.findMany({
          where: {
            companyId,
            channel,
            OR: [
              { contact: contact },
              ...candidates.map((candidate) => ({ contact: candidate })),
              ...(digits ? [{ contact: { endsWith: digits } }] : []),
            ],
          },
          orderBy: { lastMessageAt: 'desc' },
        });
        const existing = this.pickPreferredConversation(existingRows, contact);
        if (existing) {
          const conflictingTarget = existingRows.find(
            (row) => row.id !== existing.id && String(row.contact || '').trim() === contact,
          );
          return this.prisma.companyConversation.update({
            where: { id: existing.id },
            data: {
              contact: conflictingTarget ? String(existing.contact || '').trim() : contact,
              lastMessageAt: at,
              lastInteractionAt: at,
            },
          });
        }
      }
    }
    return this.prisma.companyConversation.upsert({
      where: { companyId_channel_contact: { companyId, channel, contact } },
      create: { companyId, channel, contact, lastMessageAt: at, lastInteractionAt: at },
      update: { lastMessageAt: at, lastInteractionAt: at },
    });
  }

  private normalizeConversationStatePatch(patch: ConversationStatePatch | undefined) {
    if (!patch) return {};
    const data: any = {};
    if (patch.currentFlow !== undefined) data.currentFlow = String(patch.currentFlow || '').trim() || 'cobranca_recovery';
    if (patch.currentStep !== undefined) data.currentStep = String(patch.currentStep || '').trim() || 'novo';
    if (patch.flowResult !== undefined) data.flowResult = patch.flowResult === null ? null : String(patch.flowResult || '').trim() || null;
    if (patch.botActive !== undefined) data.botActive = Boolean(patch.botActive);
    if (patch.humanAssigned !== undefined) data.humanAssigned = Boolean(patch.humanAssigned);
    if (patch.assignedUserId !== undefined) {
      const parsed = Number(patch.assignedUserId || 0);
      data.assignedUserId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    if (patch.metadata !== undefined) data.metadata = patch.metadata === null ? null : JSON.stringify(patch.metadata || {});
    if (patch.lastInteractionAt !== undefined) data.lastInteractionAt = patch.lastInteractionAt || new Date();
    return data;
  }

  async updateConversationState(companyIdInput: number, conversationIdInput: number, patch: ConversationStatePatch) {
    const companyId = Number(companyIdInput);
    const conversationId = Number(conversationIdInput);
    if (!companyId || !conversationId) throw new BadRequestException('companyId e conversationId sao obrigatorios.');
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa nao encontrada para esta empresa.');
    const data = this.normalizeConversationStatePatch(patch);
    if (!Object.keys(data).length) return this.prisma.companyConversation.findUnique({ where: { id: conversationId } });
    return this.prisma.companyConversation.update({
      where: { id: conversationId },
      data,
    });
  }

  async getOrCreateConversationForContact(
    companyIdInput: number,
    contactRaw: string,
    patch?: ConversationStatePatch,
  ) {
    const companyId = Number(companyIdInput);
    const contact = String(contactRaw || '').trim();
    if (!companyId) throw new BadRequestException('companyId obrigatorio.');
    if (!contact) throw new BadRequestException('contact obrigatorio.');
    const now = new Date();
    const conversation = await this.getOrCreateConversation({
      companyId,
      contact,
      channel: 'whatsapp',
      at: now,
    });
    const data = this.normalizeConversationStatePatch(patch);
    if (!Object.keys(data).length) return conversation;
    return this.prisma.companyConversation.update({
      where: { id: conversation.id },
      data,
    });
  }

  async listConversations(user: any, opts?: { take?: number }) {
    const companyId = requireCompanyIdFromUser(user);
    const take = Math.min(Math.max(opts?.take ?? 50, 1), 200);
    return this.prisma.companyConversation.findMany({
      where: { companyId },
      orderBy: { lastMessageAt: 'desc' },
      take,
    });
  }

  async listConversationMessages(user: any, conversationId: number, opts?: { take?: number }) {
    const companyId = requireCompanyIdFromUser(user);
    const conv = await this.prisma.companyConversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.companyId !== companyId) throw new NotFoundException('Conversation not found');

    const take = Math.min(Math.max(opts?.take ?? 200, 1), 500);
    return this.prisma.companyMessage.findMany({
      where: { companyId, conversationId },
      orderBy: { timestamp: 'asc' },
      take,
    });
  }

  async recordInboundMessage(input: {
    companyId: number;
    from: string;
    body: string;
    receivedAt?: Date;
    providerMessageId?: string;
    rawPayload?: any;
    messageType?: string;
    senderType?: string;
    variables?: Record<string, unknown>;
    sourceModule?: string;
  }) {
    const companyId = Number(input.companyId);
    const from = normalizeWhatsAppContact(input.from);
    const body = String(input.body || '');
    const at = input.receivedAt ?? new Date();

    const conversation = await this.getOrCreateConversation({ companyId, contact: from, channel: 'whatsapp', at });
    const messageType = String(input.messageType || 'text').trim().toLowerCase() || 'text';
    const senderType = String(input.senderType || 'client').trim().toLowerCase() || 'client';
    const sourceModule = String(input.sourceModule || 'whatsapp_webhook').trim() || 'whatsapp_webhook';
    const variablesJson = input.variables === undefined ? undefined : JSON.stringify(input.variables || {});

    const createData = {
      companyId,
      conversationId: conversation.id,
      contactId: from,
      direction: 'INBOUND',
      messageType,
      body,
      senderType,
      status: 'RECEIVED',
      timestamp: at,
      sourceModule,
      variablesJson,
      provider: 'WHATSAPP_CLOUD',
      providerMessageId: input.providerMessageId || undefined,
      rawPayload: input.rawPayload === undefined ? undefined : JSON.stringify(input.rawPayload),
    } as const;

    if (input.providerMessageId) {
      return this.prisma.companyMessage.upsert({
        where: { providerMessageId: String(input.providerMessageId) },
        create: createData,
        update: {
          body,
          status: 'RECEIVED',
          timestamp: at,
          contactId: from,
          messageType,
          senderType,
          sourceModule,
          variablesJson,
          conversationId: conversation.id,
          companyId,
        },
      });
    }

    return this.prisma.companyMessage.create({ data: createData });
  }

  private normalizeMessageType(value: string | null | undefined): 'text' | 'template' | 'interactive' {
    const normalized = String(value || 'text').trim().toLowerCase();
    if (normalized === 'template') return 'template';
    if (normalized === 'interactive') return 'interactive';
    return 'text';
  }

  private async hasOpenCustomerServiceWindow(companyId: number, conversationId: number): Promise<boolean> {
    const lastInbound = await this.prisma.companyMessage.findFirst({
      where: { companyId, conversationId, direction: 'INBOUND' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    if (!lastInbound?.timestamp) return false;
    return Date.now() - new Date(lastInbound.timestamp).getTime() <= TWENTY_FOUR_HOURS_MS;
  }

  async queueOutboundForCompany(companyIdInput: number, payload: QueueOutboundPayload) {
    const companyId = Number(companyIdInput);
    const to = normalizeWhatsAppContact(payload?.to || '');
    const at = payload?.at ?? new Date();
    const messageType = this.normalizeMessageType(payload?.messageType);
    const templateName = String(payload?.templateName || '').trim();
    const templateLanguage = String(payload?.templateLanguage || 'pt_BR').trim();
    const sourceModule = String(payload?.sourceModule || 'atendimento').trim().toLowerCase() || 'atendimento';
    const senderType =
      String(
        payload?.senderType ||
          (sourceModule.includes('human') ? 'human' : sourceModule.includes('bot') ? 'bot' : 'system'),
      )
        .trim()
        .toLowerCase() || 'system';
    const bodyFromPayload = String(payload?.body || '').trim();
    const body = messageType === 'template' ? (bodyFromPayload || `[template:${templateName || 'unknown'}]`) : bodyFromPayload;
    const contactId = String(payload?.contactId || to).trim();
    const variablesJson = payload?.variables === undefined ? null : JSON.stringify(payload.variables || {});

    if (!companyId) throw new ForbiddenException('Company context required');
    if (!to) throw new BadRequestException('to is required');

    const companyRow = (await this.supportsWhatsAppEndpointTable())
      ? await this.prisma.company.findUnique({
          where: { id: companyId },
          include: {
            whatsappEndpoints: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        })
      : await this.prisma.company.findUnique({
          where: { id: companyId },
        });
    const { company } = await applyMasterWhatsAppCredentials(this.prisma, companyRow);
    if (!company) throw new NotFoundException(`Company with id ${companyId} not found`);

    let conversation = null as any;
    if (Number(payload?.conversationId || 0) > 0) {
      conversation = await this.prisma.companyConversation.findFirst({
        where: { id: Number(payload.conversationId), companyId, channel: 'whatsapp' },
      });
    }
    if (!conversation) {
      conversation = await this.getOrCreateConversation({ companyId, contact: to, channel: 'whatsapp', at });
    }
    const conversationMetadata = this.parseConversationMetadata(conversation?.metadata);
    const resolvedCreds = resolveWhatsAppCredentials(company, {
      endpointId:
        String(payload?.whatsappEndpointId || '').trim() ||
        String(conversationMetadata.whatsappEntryEndpointId || '').trim() ||
        undefined,
      preferredModuleKey:
        String(payload?.preferredModuleKey || '').trim().toLowerCase() ||
        String(conversationMetadata.whatsappEntryModuleKey || '').trim().toLowerCase() ||
        undefined,
      sourceModule,
    });
    if (!resolvedCreds.phoneNumberId) {
      throw new BadRequestException('WhatsApp nao configurado para esta empresa.');
    }

    await this.whatsappStatus.ensureConnected(companyId, {
      endpointId: resolvedCreds.endpointId || undefined,
      preferredModuleKey:
        String(payload?.preferredModuleKey || '').trim().toLowerCase() || undefined,
      sourceModule,
    });
    const openWindow = await this.hasOpenCustomerServiceWindow(companyId, conversation.id);

    if (!openWindow && messageType !== 'template') {
      throw new BadRequestException('Fora da janela de 24h. Use template aprovado pela Meta.');
    }
    if (messageType === 'template' && !templateName) {
      throw new BadRequestException('templateName obrigatorio para envio template.');
    }
    if (messageType === 'interactive' && !payload?.interactivePayload) {
      throw new BadRequestException('interactivePayload obrigatorio para envio interactive.');
    }
    if (!body) {
      throw new BadRequestException('body is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const outboundData: any = {
        companyId,
        contactId: contactId || to,
        to,
        body,
        messageType,
        templateName: messageType === 'template' ? templateName : null,
        templateLanguage: messageType === 'template' ? templateLanguage : null,
        templateComponents:
          messageType === 'template'
            ? JSON.stringify(payload?.templateComponents || [])
            : messageType === 'interactive'
              ? JSON.stringify(payload?.interactivePayload || {})
              : null,
        sourceModule,
        status: 'PENDING',
        attemptCount: 0,
        maxAttempts: 3,
        nextAttemptAt: at,
      };
      if (await this.supportsOutboundEndpointColumn()) {
        outboundData.whatsappEndpointId = resolvedCreds.endpointId || null;
      }

      const outbound = await tx.outboundMessage.create({
        data: outboundData,
      });

      const message = await tx.companyMessage.create({
        data: {
          companyId,
          conversationId: conversation.id,
          contactId: contactId || to,
          direction: 'OUTBOUND',
          messageType,
          body,
          senderType,
          variablesJson,
          status: 'QUEUED',
          timestamp: at,
          sourceModule,
          provider: 'WHATSAPP_CLOUD',
          outboundMessageId: outbound.id,
        },
      });

      const statePatch = this.normalizeConversationStatePatch(payload?.flowState);
      await tx.companyConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: at,
          lastInteractionAt: at,
          ...statePatch,
        },
      });

      return {
        conversationId: conversation.id,
        messageId: message.id,
        outboundMessageId: outbound.id,
        status: outbound.status,
      };
    });
  }

  async queueOutboundMessage(user: any, input: QueueOutboundPayload) {
    const companyId = requireCompanyIdFromUser(user);
    return this.queueOutboundForCompany(companyId, input);
  }
}
