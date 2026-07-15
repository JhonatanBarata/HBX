import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const VENDAS_LEAD_ENGAGEMENT_STATES = [
  'no_conversation',
  'no_messages',
  'queued',
  'sending',
  'awaiting_reply',
  'replied',
  'failed',
  'canceled',
] as const;

export type VendasLeadEngagementState = (typeof VENDAS_LEAD_ENGAGEMENT_STATES)[number];

export type VendasLeadCockpitSnapshot = {
  leadId: string;
  conversation: {
    id: string | null;
    exists: boolean;
  };
  engagement: {
    state: VendasLeadEngagementState;
    hasSuccessfulOutbound: boolean;
    hasInboundMessage: boolean;
    hasInboundReply: boolean;
    firstSuccessfulOutboundAt: Date | null;
    lastSuccessfulOutboundAt: Date | null;
    lastOutboundAt: Date | null;
    lastOutboundStatus: string | null;
    lastInboundAt: Date | null;
    lastMessageId: number | null;
    lastMessageAt: Date | null;
    lastMessageDirection: string | null;
    lastMessageStatus: string | null;
    lastMessagePreview: string | null;
    lastFailureAt: Date | null;
    failureReason: string | null;
  };
  version: number;
  updatedAt: Date | null;
};

type LeadProjectionInput = {
  id: string;
  companyId: number;
  phone: string | null;
  phoneNormalized: string | null;
};

type ProjectionOutbox = {
  status: string | null;
  deliveryStatus: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
};

type ProjectionMessage = {
  id: number;
  conversationId: number;
  direction: string;
  messageType: string;
  senderType?: string | null;
  body: string;
  status: string;
  error: string | null;
  variablesJson?: string | null;
  timestamp: Date;
  outboundMessage: ProjectionOutbox | null;
};

type ProjectionConversation = {
  id: number;
  companyId: number;
  vendasLeadId: string | null;
  metadata: string | null;
  contact: string;
  sourcePhoneNormalized: string | null;
  lastMessageAt: Date;
  updatedAt: Date;
  createdAt: Date;
  messages: ProjectionMessage[];
};

type ReplySignal = {
  leadId: string;
  description: string | null;
  idempotencyKey: string | null;
};

type ProjectionRecord = {
  leadId: string;
  companyId: number;
  conversationId: number | null;
  engagementState: VendasLeadEngagementState;
  hasInboundMessage: boolean;
  hasInboundReply: boolean;
  firstSuccessfulOutboundAt: Date | null;
  lastSuccessfulOutboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastOutboundStatus: string | null;
  lastInboundAt: Date | null;
  lastMessageId: number | null;
  lastMessageAt: Date | null;
  lastMessageDirection: string | null;
  lastMessageStatus: string | null;
  lastMessagePreview: string | null;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
  version: number;
  updatedAt: Date;
};

const HUMAN_INBOUND_EVENT = 'inbound_reply';
const HUMAN_INBOUND_SOURCE = 'vendas_cockpit_projector';
const HUMAN_INBOUND_RESULT = 'human_inbound_validated';
const PROJECTION_VERSION = 1;
const SUCCESSFUL_OUTBOUND_STATUSES = new Set(['SENT', 'DELIVERED', 'READ']);
const CANCELED_OUTBOUND_STATUSES = new Set(['CANCELED', 'CANCELLED']);
const TECHNICAL_MESSAGE_TYPES = new Set([
  'system_event',
  'status',
  'reaction',
  'deleted',
  'protocol',
  'receipt',
  'read_receipt',
  'delivery_receipt',
]);

function asDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeDirection(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'INBOUND' || normalized === 'OUTBOUND' ? normalized : null;
}

function normalizeStatus(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'PENDING') return 'QUEUED';
  if (normalized === 'CANCELLED') return 'CANCELED';
  return normalized;
}

function normalizePhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

function phoneForms(phone: string) {
  const local = phone.startsWith('55') ? phone.slice(2) : phone;
  return Array.from(new Set([phone, `+${phone}`, local, `+${local}`].filter(Boolean)));
}

function compareMessages(left: ProjectionMessage, right: ProjectionMessage) {
  const byTime = (asDate(left.timestamp)?.getTime() || 0) - (asDate(right.timestamp)?.getTime() || 0);
  return byTime || Number(left.id || 0) - Number(right.id || 0);
}

function compareConversations(left: ProjectionConversation, right: ProjectionConversation) {
  const leftAt = asDate(left.lastMessageAt)?.getTime() || asDate(left.updatedAt)?.getTime() || asDate(left.createdAt)?.getTime() || 0;
  const rightAt = asDate(right.lastMessageAt)?.getTime() || asDate(right.updatedAt)?.getTime() || asDate(right.createdAt)?.getTime() || 0;
  return rightAt - leftAt || Number(right.id || 0) - Number(left.id || 0);
}

function previewMessage(body: unknown) {
  const normalized = String(body || '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 500) : null;
}

function isTechnicalMessage(message: ProjectionMessage) {
  const messageType = String(message.messageType || '').trim().toLowerCase();
  const senderType = String(message.senderType || '').trim().toLowerCase();
  // `system` tambem e o default legado de alguns outbounds reais. Se existe
  // outbox, o dispatcher/provedor precisa aparecer no cockpit; evento interno
  // sem outbox continua tecnico.
  if (senderType === 'system' && !message.outboundMessage) return true;
  if (TECHNICAL_MESSAGE_TYPES.has(messageType)) return true;
  try {
    const variables = message.variablesJson ? JSON.parse(message.variablesJson) : null;
    return variables?.isDeleted === true;
  } catch {
    return false;
  }
}

function readMetadataLeadId(raw: unknown) {
  if (!raw) return null;
  try {
    const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const candidates = [
      (metadata as any).vendasLeadId,
      (metadata as any).leadId,
      (metadata as any).vendasAgendaQueue?.leadId,
      (metadata as any).vendasAutomation?.leadId,
      (metadata as any).vendasProspeccao?.leadId,
    ];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

function readReplySignal(signal: ReplySignal) {
  try {
    const parsed = signal.description ? JSON.parse(signal.description) : null;
    const messageId = Number(parsed?.messageId || 0);
    const conversationId = Number(parsed?.conversationId || 0);
    if (messageId > 0) {
      return { messageId, conversationId: conversationId > 0 ? conversationId : null };
    }
  } catch {
    // A chave idempotente ainda permite reconstrução caso a descrição tenha sido truncada.
  }

  const match = String(signal.idempotencyKey || '').match(/human-inbound:(\d+):(\d+)$/);
  if (!match) return null;
  return { conversationId: Number(match[1]), messageId: Number(match[2]) };
}

function effectiveOutboundStatus(message: ProjectionMessage) {
  const messageStatus = normalizeStatus(message.status);
  const deliveryStatus = normalizeStatus(message.outboundMessage?.deliveryStatus);
  const outboxStatus = normalizeStatus(message.outboundMessage?.status);
  const statuses = [messageStatus, deliveryStatus, outboxStatus].filter((status): status is string => Boolean(status));

  // O webhook de entrega é o sinal mais novo quando informa falha. Para sucesso,
  // preservamos o estágio mais avançado observado entre Message e outbox.
  if (deliveryStatus === 'FAILED') return 'FAILED';
  const successRank = { SENT: 1, DELIVERED: 2, READ: 3 } as const;
  const successful = statuses
    .filter((status) => SUCCESSFUL_OUTBOUND_STATUSES.has(status))
    .sort((left, right) => successRank[right as keyof typeof successRank] - successRank[left as keyof typeof successRank]);
  if (successful.length) return successful[0];
  if (statuses.some((status) => CANCELED_OUTBOUND_STATUSES.has(status))) return 'CANCELED';
  if (statuses.includes('FAILED')) return 'FAILED';
  if (statuses.includes('SENDING') || statuses.includes('PROCESSING')) return 'SENDING';
  return 'QUEUED';
}

function outboundSuccessAt(message: ProjectionMessage) {
  if (!SUCCESSFUL_OUTBOUND_STATUSES.has(effectiveOutboundStatus(message))) return null;
  return (
    asDate(message.outboundMessage?.sentAt) ||
    asDate(message.outboundMessage?.deliveredAt) ||
    asDate(message.outboundMessage?.readAt) ||
    asDate(message.timestamp)
  );
}

function engagementStateForOutbound(message: ProjectionMessage): VendasLeadEngagementState {
  const status = effectiveOutboundStatus(message);
  if (CANCELED_OUTBOUND_STATUSES.has(status)) return 'canceled';
  if (status === 'FAILED') return 'failed';
  if (status === 'SENDING' || status === 'PROCESSING') return 'sending';
  if (SUCCESSFUL_OUTBOUND_STATUSES.has(status)) return 'awaiting_reply';
  return 'queued';
}

function deriveProjection(
  lead: LeadProjectionInput,
  conversation: ProjectionConversation | null,
  replySignals: ReplySignal[],
  now = new Date(),
): ProjectionRecord {
  if (!conversation) {
    return {
      leadId: lead.id,
      companyId: lead.companyId,
      conversationId: null,
      engagementState: 'no_conversation',
      hasInboundMessage: false,
      hasInboundReply: false,
      firstSuccessfulOutboundAt: null,
      lastSuccessfulOutboundAt: null,
      lastOutboundAt: null,
      lastOutboundStatus: null,
      lastInboundAt: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessageDirection: null,
      lastMessageStatus: null,
      lastMessagePreview: null,
      lastFailureAt: null,
      lastFailureReason: null,
      version: PROJECTION_VERSION,
      updatedAt: now,
    };
  }

  const messages = (conversation.messages || [])
    .filter((message) => normalizeDirection(message.direction) !== null && !isTechnicalMessage(message))
    .sort(compareMessages);
  const inbound = messages.filter((message) => normalizeDirection(message.direction) === 'INBOUND');
  const outbound = messages.filter((message) => normalizeDirection(message.direction) === 'OUTBOUND');
  const messageById = new Map(messages.map((message) => [Number(message.id), message]));
  const validatedInboundIds = new Set<number>();

  for (const signal of replySignals) {
    const reference = readReplySignal(signal);
    if (!reference) continue;
    const message = messageById.get(reference.messageId);
    if (!message || normalizeDirection(message.direction) !== 'INBOUND') continue;
    if (reference.conversationId && reference.conversationId !== conversation.id) continue;
    validatedInboundIds.add(reference.messageId);
  }

  const successfulOutbound = outbound
    .map((message) => ({ message, at: outboundSuccessAt(message) }))
    .filter((entry): entry is { message: ProjectionMessage; at: Date } => Boolean(entry.at))
    .sort((left, right) => left.at.getTime() - right.at.getTime() || compareMessages(left.message, right.message));
  const failedOutbound = outbound
    .filter((message) => effectiveOutboundStatus(message) === 'FAILED')
    .map((message) => ({
      message,
      at: asDate(message.outboundMessage?.failedAt) || asDate(message.timestamp),
      reason: String(message.error || message.outboundMessage?.lastError || '').trim() || null,
    }))
    .filter((entry): entry is { message: ProjectionMessage; at: Date; reason: string | null } => Boolean(entry.at))
    .sort((left, right) => left.at.getTime() - right.at.getTime() || compareMessages(left.message, right.message));

  const latestMessage = messages.at(-1) || null;
  const latestInbound = inbound.at(-1) || null;
  const latestOutbound = outbound.at(-1) || null;
  const latestFailure = failedOutbound.at(-1) || null;
  const actionableMessages = messages.filter(
    (message) => normalizeDirection(message.direction) === 'OUTBOUND' || validatedInboundIds.has(Number(message.id)),
  );
  const latestActionable = actionableMessages.at(-1) || null;

  let engagementState: VendasLeadEngagementState = 'no_messages';
  if (latestActionable && normalizeDirection(latestActionable.direction) === 'INBOUND') {
    engagementState = 'replied';
  } else if (latestActionable) {
    engagementState = engagementStateForOutbound(latestActionable);
  }

  return {
    leadId: lead.id,
    companyId: lead.companyId,
    conversationId: conversation.id,
    engagementState,
    hasInboundMessage: inbound.length > 0,
    hasInboundReply: validatedInboundIds.size > 0,
    firstSuccessfulOutboundAt: successfulOutbound.at(0)?.at || null,
    lastSuccessfulOutboundAt: successfulOutbound.at(-1)?.at || null,
    lastOutboundAt: asDate(latestOutbound?.timestamp),
    lastOutboundStatus: latestOutbound ? effectiveOutboundStatus(latestOutbound) : null,
    lastInboundAt: asDate(latestInbound?.timestamp),
    lastMessageId: latestMessage?.id || null,
    lastMessageAt: asDate(latestMessage?.timestamp),
    lastMessageDirection: latestMessage ? normalizeDirection(latestMessage.direction)?.toLowerCase() || null : null,
    lastMessageStatus: latestMessage
      ? normalizeDirection(latestMessage.direction) === 'OUTBOUND'
        ? effectiveOutboundStatus(latestMessage)
        : normalizeStatus(latestMessage.status)
      : null,
    lastMessagePreview: previewMessage(latestMessage?.body),
    lastFailureAt: latestFailure?.at || null,
    lastFailureReason: latestFailure?.reason || null,
    version: PROJECTION_VERSION,
    updatedAt: now,
  };
}

@Injectable()
export class VendasLeadCockpitProjectorService {
  constructor(private readonly prisma: PrismaService) {}

  async getCockpitStatesForLeads(
    companyId: number,
    leadIds: string[],
  ): Promise<Map<string, VendasLeadCockpitSnapshot>> {
    const ids = Array.from(new Set((leadIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    const snapshots = new Map<string, VendasLeadCockpitSnapshot>();
    if (!ids.length) return snapshots;

    const leads = (await this.prisma.vendasLead.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, companyId: true, phone: true, phoneNormalized: true },
    })) as LeadProjectionInput[];
    if (!leads.length) return snapshots;

    const validIds = leads.map((lead) => lead.id);
    const persisted = await this.prisma.vendasLeadCockpitState.findMany({
      where: { companyId, leadId: { in: validIds } },
    });
    for (const row of persisted as any[]) snapshots.set(row.leadId, this.snapshotFromRow(row));

    const missingLeads = leads.filter((lead) => !snapshots.has(lead.id));
    if (!missingLeads.length) return snapshots;

    const rebuilt = await this.buildProjectionBatch(companyId, missingLeads);
    const rows = Array.from(rebuilt.values());
    for (const row of rows) snapshots.set(row.leadId, this.snapshotFromRow(row));
    return snapshots;
  }

  async rebuildLead(companyId: number, leadIdRaw: string, conversationId?: number) {
    const leadId = String(leadIdRaw || '').trim();
    const lead = (await this.prisma.vendasLead.findFirst({
      where: { id: leadId, companyId },
      select: { id: true, companyId: true, phone: true, phoneNormalized: true },
    })) as LeadProjectionInput | null;
    if (!lead) throw new NotFoundException('Lead nao encontrado.');

    const forcedConversationIds = new Map<string, number>();
    const forcedId = Number(conversationId || 0);
    if (forcedId > 0) {
      const forcedConversation = await this.prisma.companyConversation.findFirst({
        where: { id: forcedId, companyId, channel: 'whatsapp' },
        select: { id: true, vendasLeadId: true, metadata: true },
      });
      if (!forcedConversation) throw new NotFoundException('Conversa nao encontrada.');
      const metadataLeadId = readMetadataLeadId(forcedConversation.metadata);
      const linkedLeadId = String(forcedConversation.vendasLeadId || metadataLeadId || '').trim();
      if (linkedLeadId && linkedLeadId !== lead.id) {
        throw new BadRequestException('A conversa pertence a outro lead.');
      }
      forcedConversationIds.set(lead.id, forcedId);
    }

    const rebuilt = await this.buildProjectionBatch(companyId, [lead], forcedConversationIds);
    const row = rebuilt.get(lead.id) as ProjectionRecord;
    const saved = await this.prisma.vendasLeadCockpitState.upsert({
      where: { leadId: lead.id },
      create: this.createData(row),
      update: this.updateData(row),
    });
    return this.snapshotFromRow(saved);
  }

  async rebuildConversation(companyId: number, conversationIdRaw: number) {
    const conversationId = Number(conversationIdRaw || 0);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId, channel: 'whatsapp' },
      select: {
        id: true,
        vendasLeadId: true,
        metadata: true,
        contact: true,
        sourcePhoneNormalized: true,
      },
    });
    if (!conversation) throw new NotFoundException('Conversa nao encontrada.');

    let leadId = String(conversation.vendasLeadId || '').trim() || null;
    if (!leadId) {
      const projected = await this.prisma.vendasLeadCockpitState.findFirst({
        where: { companyId, conversationId },
        select: { leadId: true },
      });
      leadId = String(projected?.leadId || '').trim() || null;
    }
    if (!leadId) {
      const job = await this.prisma.vendasAutomationJob.findFirst({
        where: { companyId, conversationId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: { leadId: true },
      });
      leadId = String(job?.leadId || '').trim() || null;
    }
    if (!leadId) leadId = readMetadataLeadId(conversation.metadata);
    if (!leadId) {
      const phone = normalizePhone(conversation.sourcePhoneNormalized || conversation.contact);
      if (phone) {
        const [matchingLeads, matchingConversations] = await Promise.all([
          this.prisma.vendasLead.findMany({
            where: { companyId, phoneNormalized: phone },
            select: { id: true },
            take: 2,
          }),
          this.prisma.companyConversation.findMany({
            where: {
              companyId,
              channel: 'whatsapp',
              OR: [
                { sourcePhoneNormalized: phone },
                { contact: { in: phoneForms(phone) } },
              ],
            },
            select: { id: true },
            take: 2,
          }),
        ]);
        if (matchingLeads.length === 1 && matchingConversations.length === 1) leadId = matchingLeads[0].id;
      }
    }
    if (!leadId) return null;
    return this.rebuildLead(companyId, leadId, conversationId);
  }

  async signalValidHumanInbound(
    companyId: number,
    leadIdRaw: string,
    conversationIdRaw: number,
    messageIdRaw: number,
  ) {
    const leadId = String(leadIdRaw || '').trim();
    const conversationId = Number(conversationIdRaw || 0);
    const messageId = Number(messageIdRaw || 0);
    const lead = await this.prisma.vendasLead.findFirst({
      where: { id: leadId, companyId },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');

    const message = await this.prisma.companyMessage.findFirst({
      where: { id: messageId, companyId, conversationId },
      select: {
        id: true,
        direction: true,
        timestamp: true,
        conversation: { select: { id: true, companyId: true, channel: true, vendasLeadId: true, metadata: true } },
      },
    });
    if (!message) throw new NotFoundException('Mensagem nao encontrada.');
    if (normalizeDirection(message.direction) !== 'INBOUND') {
      throw new BadRequestException('Somente mensagem inbound pode confirmar resposta humana.');
    }
    if (message.conversation.companyId !== companyId) {
      throw new NotFoundException('Mensagem nao encontrada.');
    }
    if (String(message.conversation.channel || '').toLowerCase() !== 'whatsapp') {
      throw new BadRequestException('A mensagem nao pertence a uma conversa WhatsApp.');
    }
    const metadataLeadId = readMetadataLeadId(message.conversation.metadata);
    const linkedLeadId = String(message.conversation.vendasLeadId || metadataLeadId || '').trim();
    if (linkedLeadId && linkedLeadId !== leadId) {
      throw new BadRequestException('A conversa pertence a outro lead.');
    }

    const idempotencyKey = `vendas-cockpit:human-inbound:${conversationId}:${messageId}`;
    await this.prisma.vendasLeadTimelineEvent.createMany({
      data: [
        {
          leadId,
          eventType: HUMAN_INBOUND_EVENT,
          title: 'Resposta humana validada no WhatsApp',
          description: JSON.stringify({
            kind: 'vendas_cockpit_valid_human_inbound',
            conversationId,
            messageId,
            messageTimestamp: asDate(message.timestamp)?.toISOString() || null,
          }),
          sourceType: HUMAN_INBOUND_SOURCE,
          resultLabel: HUMAN_INBOUND_RESULT,
          idempotencyKey,
        },
      ],
      skipDuplicates: true,
    });
    return this.rebuildLead(companyId, leadId, conversationId);
  }

  private async buildProjectionBatch(
    companyId: number,
    leads: LeadProjectionInput[],
    forcedConversationIds = new Map<string, number>(),
  ) {
    const result = new Map<string, ProjectionRecord>();
    if (!leads.length) return result;

    const leadIds = leads.map((lead) => lead.id);
    const jobs = await this.prisma.vendasAutomationJob.findMany({
      where: { companyId, leadId: { in: leadIds }, conversationId: { not: null } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { leadId: true, conversationId: true },
    });
    const jobConversationByLead = new Map<string, number>();
    for (const job of jobs) {
      const id = Number(job.conversationId || 0);
      if (id > 0 && !jobConversationByLead.has(job.leadId)) jobConversationByLead.set(job.leadId, id);
    }

    const phones = Array.from(
      new Set(leads.map((lead) => normalizePhone(lead.phoneNormalized)).filter((value): value is string => Boolean(value))),
    );
    const contacts = Array.from(new Set(phones.flatMap((phone) => phoneForms(phone))));
    const explicitMetadataFilters = leadIds.flatMap((leadId) => [
      { metadata: { contains: `\"leadId\":\"${leadId}\"` } },
      { metadata: { contains: `\"vendasLeadId\":\"${leadId}\"` } },
    ]);
    const referencedConversationIds = Array.from(
      new Set([
        ...Array.from(forcedConversationIds.values()),
        ...Array.from(jobConversationByLead.values()),
      ]),
    );
    const orFilters: any[] = [
      { vendasLeadId: { in: leadIds } },
      ...explicitMetadataFilters,
    ];
    if (referencedConversationIds.length) orFilters.push({ id: { in: referencedConversationIds } });
    if (phones.length) orFilters.push({ sourcePhoneNormalized: { in: phones } });
    if (contacts.length) orFilters.push({ contact: { in: contacts } });

    const conversations = (await this.prisma.companyConversation.findMany({
      where: { companyId, channel: 'whatsapp', OR: orFilters },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        companyId: true,
        vendasLeadId: true,
        metadata: true,
        contact: true,
        sourcePhoneNormalized: true,
        lastMessageAt: true,
        updatedAt: true,
        createdAt: true,
        messages: {
          orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            conversationId: true,
            direction: true,
            messageType: true,
            senderType: true,
            body: true,
            status: true,
            error: true,
            variablesJson: true,
            timestamp: true,
            outboundMessage: {
              select: {
                status: true,
                deliveryStatus: true,
                sentAt: true,
                deliveredAt: true,
                readAt: true,
                failedAt: true,
                lastError: true,
              },
            },
          },
        },
      },
    })) as ProjectionConversation[];

    const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    const canonicalByLead = new Map<string, ProjectionConversation[]>();
    const metadataByLead = new Map<string, ProjectionConversation[]>();
    const conversationsByPhone = new Map<string, ProjectionConversation[]>();
    for (const conversation of conversations) {
      if (conversation.vendasLeadId && leadIds.includes(conversation.vendasLeadId)) {
        const bucket = canonicalByLead.get(conversation.vendasLeadId) || [];
        bucket.push(conversation);
        canonicalByLead.set(conversation.vendasLeadId, bucket);
      }
      const metadataLeadId = readMetadataLeadId(conversation.metadata);
      if (metadataLeadId && leadIds.includes(metadataLeadId)) {
        const bucket = metadataByLead.get(metadataLeadId) || [];
        bucket.push(conversation);
        metadataByLead.set(metadataLeadId, bucket);
      }
      const phone = normalizePhone(conversation.sourcePhoneNormalized || conversation.contact);
      if (phone) {
        const bucket = conversationsByPhone.get(phone) || [];
        bucket.push(conversation);
        conversationsByPhone.set(phone, bucket);
      }
    }
    for (const bucket of canonicalByLead.values()) bucket.sort(compareConversations);
    for (const bucket of metadataByLead.values()) bucket.sort(compareConversations);
    for (const bucket of conversationsByPhone.values()) bucket.sort(compareConversations);

    const phoneOwners = phones.length
      ? await this.prisma.vendasLead.findMany({
          where: { companyId, phoneNormalized: { in: phones } },
          select: { id: true, phoneNormalized: true },
        })
      : [];
    const leadOwnersByPhone = new Map<string, string[]>();
    for (const owner of phoneOwners) {
      const phone = normalizePhone(owner.phoneNormalized);
      if (!phone) continue;
      const bucket = leadOwnersByPhone.get(phone) || [];
      bucket.push(owner.id);
      leadOwnersByPhone.set(phone, bucket);
    }

    const selectedByLead = new Map<string, ProjectionConversation | null>();
    for (const lead of leads) {
      const forced = conversationById.get(forcedConversationIds.get(lead.id) || 0) || null;
      const canonical = canonicalByLead.get(lead.id)?.[0] || null;
      const job = conversationById.get(jobConversationByLead.get(lead.id) || 0) || null;
      const metadata = metadataByLead.get(lead.id)?.[0] || null;
      const phone = normalizePhone(lead.phoneNormalized);
      const phoneMatches = phone ? conversationsByPhone.get(phone) || [] : [];
      const phoneOwnersForTenant = phone ? leadOwnersByPhone.get(phone) || [] : [];
      const exactPhone = phoneMatches.length === 1 && phoneOwnersForTenant.length === 1 && phoneOwnersForTenant[0] === lead.id
        ? phoneMatches[0]
        : null;
      selectedByLead.set(lead.id, forced || canonical || job || metadata || exactPhone || null);
    }

    const replySignals = (await this.prisma.vendasLeadTimelineEvent.findMany({
      where: {
        leadId: { in: leadIds },
        eventType: HUMAN_INBOUND_EVENT,
        sourceType: HUMAN_INBOUND_SOURCE,
        resultLabel: HUMAN_INBOUND_RESULT,
      },
      select: { leadId: true, description: true, idempotencyKey: true },
    })) as ReplySignal[];
    const signalsByLead = new Map<string, ReplySignal[]>();
    for (const signal of replySignals) {
      const bucket = signalsByLead.get(signal.leadId) || [];
      bucket.push(signal);
      signalsByLead.set(signal.leadId, bucket);
    }

    const now = new Date();
    for (const lead of leads) {
      result.set(
        lead.id,
        deriveProjection(lead, selectedByLead.get(lead.id) || null, signalsByLead.get(lead.id) || [], now),
      );
    }
    return result;
  }

  private createData(row: ProjectionRecord) {
    return {
      leadId: row.leadId,
      companyId: row.companyId,
      conversationId: row.conversationId,
      engagementState: row.engagementState,
      hasInboundMessage: row.hasInboundMessage,
      hasInboundReply: row.hasInboundReply,
      firstSuccessfulOutboundAt: row.firstSuccessfulOutboundAt,
      lastSuccessfulOutboundAt: row.lastSuccessfulOutboundAt,
      lastOutboundAt: row.lastOutboundAt,
      lastOutboundStatus: row.lastOutboundStatus,
      lastInboundAt: row.lastInboundAt,
      lastMessageId: row.lastMessageId,
      lastMessageAt: row.lastMessageAt,
      lastMessageDirection: row.lastMessageDirection,
      lastMessageStatus: row.lastMessageStatus,
      lastMessagePreview: row.lastMessagePreview,
      lastFailureAt: row.lastFailureAt,
      lastFailureReason: row.lastFailureReason,
      version: row.version,
      createdAt: row.updatedAt,
      updatedAt: row.updatedAt,
    };
  }

  private updateData(row: ProjectionRecord) {
    const { leadId: _leadId, createdAt: _createdAt, ...data } = this.createData(row);
    return data;
  }

  private snapshotFromRow(row: any): VendasLeadCockpitSnapshot {
    const rawState = String(row?.engagementState || '').trim();
    const state = (VENDAS_LEAD_ENGAGEMENT_STATES as readonly string[]).includes(rawState)
      ? (rawState as VendasLeadEngagementState)
      : row?.conversationId
        ? 'no_messages'
        : 'no_conversation';
    return {
      leadId: String(row.leadId),
      conversation: {
        id: Number(row.conversationId || 0) > 0 ? String(row.conversationId) : null,
        exists: Number(row.conversationId || 0) > 0,
      },
      engagement: {
        state,
        hasSuccessfulOutbound: Boolean(row.firstSuccessfulOutboundAt),
        hasInboundMessage: Boolean(row.hasInboundMessage),
        hasInboundReply: Boolean(row.hasInboundReply),
        firstSuccessfulOutboundAt: asDate(row.firstSuccessfulOutboundAt),
        lastSuccessfulOutboundAt: asDate(row.lastSuccessfulOutboundAt),
        lastOutboundAt: asDate(row.lastOutboundAt),
        lastOutboundStatus: normalizeStatus(row.lastOutboundStatus),
        lastInboundAt: asDate(row.lastInboundAt),
        lastMessageId: Number(row.lastMessageId || 0) || null,
        lastMessageAt: asDate(row.lastMessageAt),
        lastMessageDirection: normalizeDirection(row.lastMessageDirection)?.toLowerCase() || null,
        lastMessageStatus: normalizeStatus(row.lastMessageStatus),
        lastMessagePreview: row.lastMessagePreview ? String(row.lastMessagePreview) : null,
        lastFailureAt: asDate(row.lastFailureAt),
        failureReason: state === 'failed' && row.lastFailureReason ? String(row.lastFailureReason) : null,
      },
      version: Number(row.version || PROJECTION_VERSION),
      updatedAt: asDate(row.updatedAt),
    };
  }
}
