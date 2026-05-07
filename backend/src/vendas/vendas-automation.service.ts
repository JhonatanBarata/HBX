import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InboxService } from '../inbox/inbox.service';
import { type AtendimentoBotConfig } from '../inbox/atendimento-config';
import { CommercialPlansService } from '../commercial-plans/commercial-plans.service';
import { ConversationsService } from '../messaging/conversations.service';
import { InboxRealtimeService } from '../messaging/inbox-realtime.service';
import { buildWhatsAppPhoneCandidates } from '../messaging/whatsapp-channel';
import { PrismaService } from '../prisma/prisma.service';
import { WebscrapingService, type WebscrapingContactResult } from '../webscraping/webscraping.service';
import { StartVendasProspectingDto, UpdateVendasProspectingConfigDto } from './dto/vendas.dto';
import { VendasService } from './vendas.service';

type LiveAutomationStatus =
  | 'parado'
  | 'buscando'
  | 'importando'
  | 'agendando'
  | 'enviando'
  | 'aguardando'
  | 'dormindo'
  | 'pausado'
  | 'erro';

type ProspectingSceneRules = {
  nextContactDelayMinutes: number;
  typingSeconds: number;
  typingVarianceSeconds: number;
  positiveIntentKeywords: string[];
  negativeIntentKeywords: string[];
  optOutMessage: string;
  optOutReplyEnabled: boolean;
};

type ProspectingSearchResult = Omit<WebscrapingContactResult, 'placeId'> & {
  placeId?: string | null;
};

type VendasProspeccaoStage =
  | 'pending_send'
  | 'scheduled_send'
  | 'sent_waiting'
  | 'reply_received'
  | 'expired_no_reply'
  | 'needs_review'
  | 'no_whatsapp'
  | 'negative_reply';

type VendasProspeccaoMetadata = {
  stage?: VendasProspeccaoStage | null;
  firstOutboundAt?: string | null;
  lastInboundAt?: string | null;
  replyDeadlineAt?: string | null;
  leadSegment?: string | null;
  campaignSegment?: string | null;
  mismatchReason?: string | null;
};

type SegmentMismatchFallbackDecision = {
  mode: 'auto_send' | 'draft_only' | 'block';
  message?: string;
  reason?: string;
  conversationId?: number | null;
};

type ProcessDueJobResult =
  | { outcome: 'sent_success'; campaignId: string; leadId: string; jobId: string; sentAt: Date }
  | { outcome: 'skipped'; campaignId: string; leadId: string; jobId: string; classification: string; shouldContinue: true }
  | { outcome: 'failed_no_credit'; campaignId: string; leadId: string; jobId: string; errorMessage: string; shouldContinue: true }
  | {
      outcome: 'blocked';
      campaignId: string;
      leadId: string;
      jobId: string;
      reason: string;
      nextAllowedSendAt?: Date | null;
      shouldContinue: false;
    }
  | { outcome: 'no_eligible_lead'; campaignId: string; leadId?: string | null; jobId?: string | null; reason: string; shouldContinue: false };

const BUFFER_JOB_STATUSES = ['pending', 'scheduled'] as const;
const SUCCESSFUL_SEND_JOB_STATUSES = ['sent', 'replied_positive', 'replied_negative', 'no_response_archived'] as const;
const DEFAULT_POSITIVE_KEYWORDS = ['tenho interesse', 'pode mandar', 'quero saber', 'me explica', 'quanto custa'];
const DEFAULT_NEGATIVE_KEYWORDS = ['nao tenho interesse', 'não tenho interesse', 'pare', 'remover', 'sem interesse', 'spam', 'nao me chame', 'não me chame'];
const OPT_OUT_INTENT_KEYWORDS = ['remover', 'pare', 'spam', 'nao me chame', 'não me chame'];
const HUMAN_HANDOFF_INTENT_KEYWORDS = ['humano', 'atendente', 'ligar', 'me chama'];
const DEFAULT_DAILY_LIMIT = 30;
const MAX_DUE_JOBS_PER_CYCLE = 50;
const DEFAULT_OPT_OUT_MESSAGE = 'Entendi. Vou arquivar este contato e nao chamaremos novamente.';
const DEFAULT_MESSAGE_TEMPLATE =
  'Oi, tudo bem? Aqui é {{funcionario}} da {{empresa}}. Vi a {{cliente}} em {{cidade}} e queria te explicar em 1 minuto uma solução para {{segmento}}. Faz sentido eu te mandar?';
const DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE =
  'Oi, tudo bem? Sou o Jhonatan, da HBX. Vi sua empresa no Google e queria te mostrar uma ferramenta que ajuda a organizar contatos, orçamentos e retornos pelo WhatsApp. Tenho 30 dias grátis, sem compromisso. Faz sentido eu te mostrar?';
const FIRST_OUTBOUND_CONTACT_STAGES = ['sent_waiting', 'reply_received', 'expired_no_reply', 'negative_reply'] as const;
const FIRST_OUTBOUND_CONTACT_JOB_STATUSES = ['sent', 'replied_positive', 'replied_negative', 'no_response_archived'] as const;
const NEGATIVE_OR_OPT_OUT_STATUS_KEYS = [
  'negative',
  'opt_out',
  'replied_negative',
  'negative_reply',
  'prospection_negative',
  'no_whatsapp',
] as const;
const NO_RESPONSE_ARCHIVE_MS = 24 * 60 * 60 * 1000;
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const businessTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), min), max);
}

function trimOrNull(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function hasOwnValue(input: unknown, key: string) {
  return Boolean(input && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, key));
}

function parseJsonObject(value: unknown) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeTextList(value: unknown, fallback: string[] = []) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|,/)
      : fallback;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of source) {
    const normalized = String(item || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function getBusinessDateParts(date: Date) {
  const values: Record<string, number> = {};
  for (const part of businessTimeFormatter.formatToParts(date)) {
    if (part.type === 'literal') continue;
    values[part.type] = Number(part.value);
  }
  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = values.hour === 24 ? 0 : values.hour;
  const minute = values.minute || 0;
  const second = values.second || 0;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function getBusinessTimeZoneOffsetMs(date: Date) {
  const parts = getBusinessDateParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function makeBusinessDate(year: number, month: number, day: number, hour: number, minute: number) {
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = getBusinessTimeZoneOffsetMs(new Date(utcGuess));
    utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset;
  }
  return new Date(utcGuess);
}

function parseJsonList(value: unknown, fallback: string[] = []) {
  if (!value) return fallback;
  try {
    return normalizeTextList(JSON.parse(String(value)), fallback);
  } catch {
    return normalizeTextList(value, fallback);
  }
}

function normalizePhoneDigits(raw: unknown) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return digits || null;
}

function normalizeContact(raw: unknown) {
  const digits = normalizePhoneDigits(raw);
  return digits ? `+${digits}` : null;
}

function normalizeKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSegmentKey(value: unknown) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isSegmentMismatch(leadSegment: unknown, campaignSegment: unknown) {
  const leadKey = normalizeSegmentKey(leadSegment);
  const campaignKey = normalizeSegmentKey(campaignSegment);
  if (!leadKey || !campaignKey) return false;
  if (leadKey === campaignKey) return false;
  return !leadKey.includes(campaignKey) && !campaignKey.includes(leadKey);
}

function containsNormalizedKeyword(normalizedText: string, keywords: string[]) {
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeKey(keyword);
    return Boolean(normalizedKeyword && normalizedText.includes(normalizedKeyword));
  });
}

function parseBooleanFlag(value: unknown) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const normalized = normalizeKey(value);
  return ['1', 'true', 'sim', 'yes', 'y', 'ativo', 'active', 'blocked', 'bloqueado'].includes(normalized);
}

function hasDateLikeValue(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  const normalized = String(value || '').trim();
  if (!normalized || ['null', 'undefined', 'false'].includes(normalized.toLowerCase())) return false;
  return Number.isFinite(new Date(normalized).getTime());
}

function normalizeWebsiteKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/\/+$/, '');
}

@Injectable()
export class VendasAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VendasAutomationService.name);
  private workerTimer: NodeJS.Timeout | null = null;
  private workerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxService: InboxService,
    private readonly webscrapingService: WebscrapingService,
    private readonly vendasService: VendasService,
    private readonly conversations: ConversationsService,
    private readonly inboxRealtime: InboxRealtimeService,
    private readonly commercialPlansService: CommercialPlansService,
  ) {}

  onModuleInit() {
    this.workerTimer = setInterval(() => {
      void this.runWorkerCycle().catch((error) => {
        this.logger.warn(`Worker de prospeccao falhou: ${String(error?.message || error)}`);
      });
    }, 15000);
  }

  onModuleDestroy() {
    if (this.workerTimer) clearInterval(this.workerTimer);
    this.workerTimer = null;
  }

  private resolveUserContext(user: any) {
    const masterContextCompanyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : 0);
    const companyId = masterContextCompanyId || Number(user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    return { companyId, userId };
  }

  private async assertEntitlement(user: any) {
    await this.commercialPlansService.assertBotAiEntitlementForUser(user);
  }

  private publishAutomationEvent(input: {
    companyId: number;
    type: string;
    status: LiveAutomationStatus;
    text: string;
    campaignId?: string | null;
    jobId?: string | null;
    leadId?: string | null;
    conversationId?: number | null;
  }) {
    this.inboxRealtime.publish({
      companyId: input.companyId,
      kind: 'automation',
      conversationId: input.conversationId || null,
      automation: {
        type: input.type,
        status: input.status,
        text: input.text,
        campaignId: input.campaignId || null,
        jobId: input.jobId || null,
        leadId: input.leadId || null,
      },
      at: new Date().toISOString(),
    });
  }

  private async markCampaignStage(
    campaignId: string,
    companyId: number,
    status: LiveAutomationStatus,
    text: string,
    extra?: { error?: string | null; type?: string | null },
  ) {
    await this.prisma.vendasAutomationCampaign.updateMany({
      where: { id: campaignId, companyId },
      data: {
        lastStatusText: text,
        lastError: extra?.error || null,
        ...(status === 'erro' ? { status: 'error' } : {}),
      },
    });
    this.publishAutomationEvent({
      companyId,
      campaignId,
      status,
      text,
      type: extra?.type || status,
    });
  }

  private addHoursIso(value: string | Date | null | undefined, hours: number) {
    const parsed = value instanceof Date ? value : new Date(String(value || ''));
    if (!Number.isFinite(parsed.getTime())) return null;
    return new Date(parsed.getTime() + hours * 60 * 60 * 1000).toISOString();
  }

  private buildProspectionState(
    stage: VendasProspeccaoStage,
    input: {
      current?: Record<string, unknown> | null;
      lead?: any;
      campaign?: any;
      firstOutboundAt?: string | Date | null;
      lastInboundAt?: string | Date | null;
      replyDeadlineAt?: string | Date | null;
      mismatchReason?: string | null;
    },
  ): VendasProspeccaoMetadata {
    const current = (input.current || {}) as VendasProspeccaoMetadata;
    const hasOwn = (key: keyof typeof input) => Object.prototype.hasOwnProperty.call(input, key);
    const firstOutboundAtRaw =
      input.firstOutboundAt ?? current.firstOutboundAt ?? null;
    const firstOutboundAt =
      firstOutboundAtRaw instanceof Date
        ? firstOutboundAtRaw.toISOString()
        : trimOrNull(firstOutboundAtRaw);
    const replyDeadlineRaw = hasOwn('replyDeadlineAt')
      ? input.replyDeadlineAt
      : current.replyDeadlineAt || this.addHoursIso(firstOutboundAt, 24);
    const lastInboundRaw = hasOwn('lastInboundAt') ? input.lastInboundAt : current.lastInboundAt || null;
    return {
      ...current,
      stage,
      firstOutboundAt,
      lastInboundAt: lastInboundRaw instanceof Date ? lastInboundRaw.toISOString() : trimOrNull(lastInboundRaw),
      replyDeadlineAt: replyDeadlineRaw instanceof Date ? replyDeadlineRaw.toISOString() : trimOrNull(replyDeadlineRaw),
      leadSegment: trimOrNull(input.lead?.segment) || current.leadSegment || null,
      campaignSegment: trimOrNull(input.campaign?.segment) || current.campaignSegment || null,
      mismatchReason: hasOwn('mismatchReason')
        ? trimOrNull(input.mismatchReason)
        : current.mismatchReason || null,
    };
  }

  private buildLeadPhoneCandidates(value: unknown) {
    const digits = normalizePhoneDigits(value);
    if (!digits) return [];
    const candidates = new Set<string>();
    for (const candidate of buildWhatsAppPhoneCandidates(digits)) {
      if (candidate) candidates.add(candidate);
    }
    candidates.add(`+${digits}`);
    candidates.add(digits);
    return [...candidates];
  }

  private async findOrCreateProspectionConversation(companyId: number, lead: any, options?: { create?: boolean }) {
    const phoneRaw = lead?.phoneNormalized || lead?.phone;
    const contact = normalizeContact(phoneRaw);
    if (!contact) return null;
    const candidates = this.buildLeadPhoneCandidates(phoneRaw);
    const candidateDigits = Array.from(
      new Set(
        candidates
          .map((candidate) => normalizePhoneDigits(candidate))
          .filter((candidate): candidate is string => Boolean(candidate)),
      ),
    );
    const existing = await this.prisma.companyConversation.findFirst({
      where: {
        companyId,
        channel: 'whatsapp',
        OR: [
          ...(candidates.length ? [{ contact: { in: candidates } }] : []),
          ...candidateDigits.map((candidate) => ({ contact: { contains: candidate } })),
          ...candidateDigits.map((candidate) => ({ contact: { endsWith: candidate } })),
          ...candidates.map((candidate) => ({ metadata: { contains: candidate } })),
        ],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    });
    if (existing || options?.create === false) return existing;
    return this.conversations.getOrCreateConversationForContact(companyId, contact);
  }

  private isKnownWithoutWhatsappMetadata(metadata: Record<string, unknown>) {
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    const statuses = [
      (metadata as any).whatsappAvailabilityStatus,
      (queue as any).whatsappAvailabilityStatus,
    ].map((value) => String(value || '').trim().toLowerCase());
    return statuses.includes('unavailable') || String((prospeccao as any).stage || '').trim().toLowerCase() === 'no_whatsapp';
  }

  private async shouldBlockAutomationForKnownNoWhatsapp(companyId: number, lead: any) {
    const conversation = await this.findOrCreateProspectionConversation(companyId, lead, { create: false });
    if (!conversation?.metadata) return { blocked: false, conversationId: conversation?.id ? Number(conversation.id) : null };
    const metadata = parseJsonObject(conversation.metadata);
    return {
      blocked: this.isKnownWithoutWhatsappMetadata(metadata),
      conversationId: Number(conversation.id),
    };
  }

  private async loadProspectionMetadataForLead(companyId: number, lead: any) {
    const conversation = await this.findOrCreateProspectionConversation(companyId, lead, { create: false });
    return {
      conversationId: conversation?.id ? Number(conversation.id) : null,
      metadata: parseJsonObject(conversation?.metadata),
    };
  }

  private async hasFirstOutboundContactAlready(input: {
    companyId: number;
    lead: any;
    currentJobId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const metadata =
      input.metadata === undefined
        ? (await this.loadProspectionMetadataForLead(input.companyId, input.lead)).metadata
        : parseJsonObject(input.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const automation = parseJsonObject((metadata as any).vendasAutomation);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    const stageCandidates = [
      (prospeccao as any).stage,
      (queue as any).stage,
      (automation as any).status,
    ].map(normalizeKey);

    if (hasDateLikeValue((prospeccao as any).firstOutboundAt)) return true;
    if (hasDateLikeValue((automation as any).sentAt)) return true;
    if (parseBooleanFlag((queue as any).manualSent)) return true;
    if (hasDateLikeValue((queue as any).manualSentAt)) return true;
    if (hasDateLikeValue((queue as any).lastManualSendAt)) return true;
    if (stageCandidates.some((stage) => (FIRST_OUTBOUND_CONTACT_STAGES as readonly string[]).includes(stage))) return true;
    if (hasDateLikeValue(input.lead?.lastContactAt)) return true;
    if (Number(input.lead?.attemptCount || 0) > 0) return true;
    if (['contato', 'retorno', 'qualificado', 'encerrado'].includes(normalizeKey(input.lead?.status))) return true;

    const currentJobId = trimOrNull(input.currentJobId);
    const previousContactJob = await this.prisma.vendasAutomationJob.findFirst({
      where: {
        companyId: input.companyId,
        leadId: input.lead.id,
        ...(currentJobId ? { id: { not: currentJobId } } : {}),
        OR: [
          { sentAt: { not: null } },
          { status: { in: [...FIRST_OUTBOUND_CONTACT_JOB_STATUSES] as any } },
        ],
      },
      select: { id: true },
      orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }],
    });
    return Boolean(previousContactJob?.id);
  }

  private hasOptOutKeywordInMetadata(metadata: Record<string, unknown>, lead: any) {
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const automation = parseJsonObject((metadata as any).vendasAutomation);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    const textCandidates = [
      (metadata as any).lastInboundText,
      (metadata as any).lastInboundMessage,
      (metadata as any).latestInboundText,
      (metadata as any).replyText,
      (metadata as any).lastReply,
      (metadata as any).lastCustomerReply,
      (metadata as any).classificationReason,
      (metadata as any).negativeReason,
      (queue as any).lastInboundText,
      (queue as any).lastReply,
      (queue as any).classificationReason,
      (automation as any).lastInboundText,
      (automation as any).classificationReason,
      (prospeccao as any).lastInboundText,
      lead?.lastResult,
    ];
    return textCandidates.some((candidate) => {
      const normalized = normalizeKey(candidate);
      return Boolean(
        normalized &&
          (containsNormalizedKeyword(normalized, OPT_OUT_INTENT_KEYWORDS) ||
            containsNormalizedKeyword(normalized, DEFAULT_NEGATIVE_KEYWORDS)),
      );
    });
  }

  private async hasNegativeOrOptOut(input: {
    companyId: number;
    lead: any;
    currentJobId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const metadata =
      input.metadata === undefined
        ? (await this.loadProspectionMetadataForLead(input.companyId, input.lead)).metadata
        : parseJsonObject(input.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const automation = parseJsonObject((metadata as any).vendasAutomation);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    const statusCandidates = [
      (metadata as any).status,
      (metadata as any).classification,
      (metadata as any).replyClassification,
      (metadata as any).flowResult,
      (queue as any).status,
      (queue as any).stage,
      (queue as any).classification,
      (automation as any).status,
      (automation as any).classification,
      (prospeccao as any).stage,
      input.lead?.status,
      input.lead?.lastResult,
    ].map(normalizeKey);
    if (
      statusCandidates.some(
        (status) =>
          (NEGATIVE_OR_OPT_OUT_STATUS_KEYS as readonly string[]).includes(status) ||
          status.includes('negativ') ||
          status.includes('opt out') ||
          status.includes('optout') ||
          status.includes('sem interesse') ||
          status.includes('nao tenho interesse'),
      )
    ) {
      return true;
    }

    const availabilityCandidates = [
      (metadata as any).whatsappAvailabilityStatus,
      (queue as any).whatsappAvailabilityStatus,
      (automation as any).whatsappAvailabilityStatus,
    ].map((value) => String(value || '').trim().toLowerCase());
    if (availabilityCandidates.includes('unavailable')) return true;
    if (this.isKnownWithoutWhatsappMetadata(metadata)) return true;

    const flagCandidates = [
      (metadata as any).optOut,
      (metadata as any).doNotContact,
      (metadata as any).blacklisted,
      (metadata as any).blacklist,
      (queue as any).optOut,
      (queue as any).doNotContact,
      (queue as any).blacklisted,
      (queue as any).blacklist,
      (automation as any).optOut,
      (automation as any).doNotContact,
      (automation as any).blacklisted,
      (automation as any).blacklist,
      input.lead?.optOut,
      input.lead?.doNotContact,
      input.lead?.blacklisted,
      input.lead?.blacklist,
      input.lead?.wasClosedBefore,
    ];
    if (flagCandidates.some(parseBooleanFlag)) return true;
    if (input.lead?.closedAt) return true;
    if (this.hasOptOutKeywordInMetadata(metadata, input.lead)) return true;

    const currentJobId = trimOrNull(input.currentJobId);
    const negativeJob = await this.prisma.vendasAutomationJob.findFirst({
      where: {
        companyId: input.companyId,
        leadId: input.lead.id,
        ...(currentJobId ? { id: { not: currentJobId } } : {}),
        OR: [
          { status: 'replied_negative' },
          { classification: { in: ['negative', 'opt_out'] } },
        ],
      },
      select: { id: true },
      orderBy: [{ repliedAt: 'desc' }, { updatedAt: 'desc' }],
    });
    return Boolean(negativeJob?.id);
  }

  private shouldCreateDraftOnlyForSegmentMismatchFallback(metadata: Record<string, unknown>, lead: any) {
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const automation = parseJsonObject((metadata as any).vendasAutomation);
    const explicitPermissionFlags = [
      (metadata as any).requiresOptIn,
      (metadata as any).optInRequired,
      (metadata as any).consentRequired,
      (metadata as any).permissionRequired,
      (metadata as any).autoSendBlocked,
      (metadata as any).manualFirstContactOnly,
      (queue as any).requiresOptIn,
      (queue as any).optInRequired,
      (queue as any).consentRequired,
      (queue as any).permissionRequired,
      (queue as any).autoSendBlocked,
      (queue as any).manualFirstContactOnly,
      (automation as any).requiresOptIn,
      (automation as any).permissionRequired,
      lead?.requiresOptIn,
      lead?.optInRequired,
      lead?.consentRequired,
      lead?.permissionRequired,
      lead?.autoSendBlocked,
      lead?.manualFirstContactOnly,
    ];
    if (explicitPermissionFlags.some(parseBooleanFlag)) return true;

    const permissionStatuses = [
      (metadata as any).optInStatus,
      (metadata as any).consentStatus,
      (metadata as any).permissionStatus,
      (queue as any).optInStatus,
      (queue as any).consentStatus,
      (queue as any).permissionStatus,
      (automation as any).optInStatus,
      (automation as any).permissionStatus,
      lead?.optInStatus,
      lead?.consentStatus,
      lead?.permissionStatus,
    ].map(normalizeKey);
    return permissionStatuses.some((status) =>
      ['required', 'missing', 'not_granted', 'pending', 'sem opt in', 'sem permissao', 'opt in required'].includes(status),
    );
  }

  private getProspectionValidationBlock(metadata: Record<string, unknown>, lead: any) {
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const automation = parseJsonObject((metadata as any).vendasAutomation);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    const statusCandidates = [
      (metadata as any).status,
      (metadata as any).classification,
      (queue as any).status,
      (queue as any).stage,
      (automation as any).status,
      (automation as any).classification,
      (prospeccao as any).stage,
      lead?.status,
      lead?.lastResult,
    ].map(normalizeKey);
    const reviewFlags = [
      (metadata as any).needsReview,
      (metadata as any).manualReviewRequired,
      (metadata as any).reviewRequired,
      (queue as any).needsReview,
      (queue as any).manualReviewRequired,
      (queue as any).reviewRequired,
      (automation as any).needsReview,
      (automation as any).manualReviewRequired,
      lead?.needsReview,
      lead?.manualReviewRequired,
    ];
    if (
      reviewFlags.some(parseBooleanFlag) ||
      statusCandidates.some((status) =>
        ['needs_review', 'needs review', 'manual_review_required', 'manual review required', 'revisao_manual', 'em revisao', 'revisao'].includes(status),
      )
    ) {
      return { classification: 'needs_review', errorMessage: 'Lead marcado para revisão antes do envio automático.' };
    }

    const blockedFlags = [
      (metadata as any).blocked,
      (metadata as any).isBlocked,
      (metadata as any).atendimentoBlocked,
      (queue as any).blocked,
      (queue as any).isBlocked,
      (automation as any).blocked,
      lead?.blocked,
      lead?.isBlocked,
    ];
    if (
      blockedFlags.some(parseBooleanFlag) ||
      hasDateLikeValue((metadata as any).blockedAt) ||
      hasDateLikeValue((metadata as any).atendimentoBlockedAt) ||
      statusCandidates.some((status) => ['blocked', 'bloqueado', 'blocked_manual'].includes(status))
    ) {
      return { classification: 'blocked', errorMessage: 'Lead ou conversa bloqueada para automação.' };
    }

    const queueTarget = normalizeKey((queue as any).queueTarget || (metadata as any).queueTarget || (queue as any).routeTarget || (metadata as any).routeTarget);
    if (queueTarget && queueTarget !== 'prospeccao') {
      return { classification: 'lead_status_not_eligible', errorMessage: 'Lead não está disponível na fila Prospecção.' };
    }
    if (queueTarget === 'prospeccao' && (queue as any).active === false) {
      return { classification: 'lead_status_not_eligible', errorMessage: 'Lead inativo na fila Prospecção.' };
    }
    return null;
  }

  private async resolveSegmentMismatchFallbackDecision(input: {
    companyId: number;
    campaign: any;
    lead: any;
    currentJobId?: string | null;
  }): Promise<SegmentMismatchFallbackDecision> {
    const contact = normalizeContact(input.lead?.phoneNormalized || input.lead?.phone);
    if (!contact) return { mode: 'block', reason: 'invalid_whatsapp' };

    const { metadata, conversationId } = await this.loadProspectionMetadataForLead(input.companyId, input.lead);
    if (await this.hasNegativeOrOptOut({ ...input, metadata })) {
      return { mode: 'block', reason: 'negative_or_opt_out', conversationId };
    }
    if (await this.hasFirstOutboundContactAlready({ ...input, metadata })) {
      return { mode: 'block', reason: 'first_contact_already_sent', conversationId };
    }
    if (this.shouldCreateDraftOnlyForSegmentMismatchFallback(metadata, input.lead)) {
      return {
        mode: 'draft_only',
        reason: 'missing_opt_in_or_permission',
        message: DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
        conversationId,
      };
    }
    return {
      mode: 'auto_send',
      reason: 'segment_mismatch_fallback',
      message: DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
      conversationId,
    };
  }

  private publishSegmentMismatchFallbackEvent(input: {
    companyId: number;
    campaignId: string;
    leadId: string;
    jobId?: string | null;
    conversationId?: number | null;
  }) {
    this.publishAutomationEvent({
      companyId: input.companyId,
      campaignId: input.campaignId,
      jobId: input.jobId || null,
      leadId: input.leadId,
      conversationId: input.conversationId || null,
      status: 'aguardando',
      text: 'Segmento divergente: usando mensagem genérica segura.',
      type: 'segment_mismatch_fallback',
    });
  }

  private async updateProspectionConversationStage(input: {
    companyId: number;
    lead: any;
    campaign?: any;
    jobId?: string | null;
    stage: VendasProspeccaoStage;
    scheduledAt?: Date | null;
    firstOutboundAt?: Date | string | null;
    lastInboundAt?: Date | string | null;
    draftMessage?: string | null;
    mismatchReason?: string | null;
    queueTarget?: 'prospeccao' | 'atendimento' | 'excluidos';
    routeTarget?: 'prospeccao' | 'atendimento' | 'excluidos';
    active?: boolean;
    botEligible?: boolean;
    botEntryPending?: boolean;
  }) {
    const conversation = await this.findOrCreateProspectionConversation(input.companyId, input.lead);
    if (!conversation?.id) return null;
    const metadata = parseJsonObject(conversation.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const automation = parseJsonObject((metadata as any).vendasAutomation);
    const currentProspeccao = parseJsonObject((metadata as any).vendasProspeccao);
    const now = new Date().toISOString();
    const queueTarget = input.queueTarget || 'prospeccao';
    const routeTarget = input.routeTarget || queueTarget;
    const firstOutboundAt =
      input.firstOutboundAt instanceof Date
        ? input.firstOutboundAt.toISOString()
        : trimOrNull(input.firstOutboundAt);
    const scheduledAt = input.scheduledAt instanceof Date ? input.scheduledAt.toISOString() : trimOrNull(input.scheduledAt);
    const shouldArchive = queueTarget === 'excluidos';
    const nextQueue = {
      ...queue,
      active: input.active ?? queueTarget === 'prospeccao',
      leadId: input.lead.id,
      sourceModule: 'vendas',
      sourceBlock: 'today',
      queueTarget,
      routeTarget,
      status:
        input.stage === 'needs_review'
          ? 'needs_review'
          : input.stage === 'scheduled_send'
            ? 'scheduled'
            : input.stage === 'sent_waiting'
              ? 'contato'
              : input.stage === 'expired_no_reply' || input.stage === 'negative_reply' || input.stage === 'no_whatsapp'
                ? 'encerrado'
                : queue.status || 'novo',
      nextAction:
        input.stage === 'needs_review'
          ? 'Revisar segmento antes de enviar'
          : input.stage === 'scheduled_send'
            ? 'Agendado para envio'
            : input.stage === 'sent_waiting'
              ? 'Aguardar resposta'
              : queue.nextAction || null,
      returnAt: scheduledAt || queue.returnAt || null,
      draftMessage: input.draftMessage ?? queue.draftMessage ?? null,
      draftPending: input.stage === 'pending_send' || input.stage === 'scheduled_send',
      manualSent: input.stage === 'sent_waiting' || queue.manualSent === true,
      manualSentAt: firstOutboundAt || queue.manualSentAt || null,
      lastManualSendAt: firstOutboundAt || queue.lastManualSendAt || null,
      botEligible: input.botEligible ?? (input.stage !== 'needs_review' && queueTarget === 'prospeccao'),
      botEntryPending: input.botEntryPending ?? (input.stage === 'sent_waiting'),
      automationJobId: input.jobId || queue.automationJobId || null,
      mismatchReason: input.mismatchReason || null,
      manualQueueOverride: shouldArchive ? 'archived' : queue.manualQueueOverride || null,
      whatsappAvailabilityStatus: input.stage === 'no_whatsapp' ? 'unavailable' : queue.whatsappAvailabilityStatus || null,
      syncedAt: now,
      ...(shouldArchive ? { deactivatedAt: now } : {}),
    };
    const nextProspeccao = this.buildProspectionState(input.stage, {
      current: currentProspeccao,
      lead: input.lead,
      campaign: input.campaign,
      firstOutboundAt,
      lastInboundAt: input.lastInboundAt,
      replyDeadlineAt: firstOutboundAt ? this.addHoursIso(firstOutboundAt, 24) : null,
      mismatchReason: input.mismatchReason ?? null,
    });
    await this.conversations.updateConversationState(input.companyId, Number(conversation.id), {
      metadata: {
        ...metadata,
        sourceModule: 'vendas',
        queueTarget,
        routeTarget,
        vendasAutomation: {
          ...automation,
          campaignId: input.campaign?.id || automation.campaignId || null,
          jobId: input.jobId || automation.jobId || null,
          leadId: input.lead.id,
          status: input.stage,
          scheduledAt: scheduledAt || automation.scheduledAt || null,
          sentAt: firstOutboundAt || automation.sentAt || null,
        },
        vendasAgendaQueue: nextQueue,
        vendasProspeccao: nextProspeccao,
        ...(input.stage === 'no_whatsapp' ? { whatsappAvailabilityStatus: 'unavailable' } : {}),
        ...(shouldArchive
          ? {
              inboxManualQueueOverride: 'archived',
              inboxLocalDeleted: true,
              inboxLocalDeletedAt: now,
            }
          : {}),
      },
      lastInteractionAt: new Date(),
    });
    return Number(conversation.id);
  }

  private async markSegmentMismatchBeforeSend(job: any, campaign: any, lead: any, classification = 'segment_mismatch_blocked') {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.vendasAutomationJob.update({
        where: { id: job.id },
        data: {
          status: 'skipped',
          archivedAt: now,
          classification,
          errorMessage: 'Segmento divergente entre lead e campanha.',
        },
      });
      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          eventType: 'automation_review_required',
          title: 'Envio automático bloqueado',
          description: `Segmento divergente: ${trimOrNull(lead.segment) || '-'} / campanha ${trimOrNull(campaign.segment) || '-'}.`,
          sourceType: 'vendas_prospeccao_bot',
          resultLabel: 'Revisar segmento',
        },
      });
    });
    const conversationId = await this.updateProspectionConversationStage({
      companyId: campaign.companyId,
      lead,
      campaign,
      jobId: job.id,
      stage: 'needs_review',
      scheduledAt: job.scheduledAt || null,
      mismatchReason: 'segment_mismatch',
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      active: true,
    });
    this.logger.warn(
      `[prospeccao] segmento divergente, envio automatico bloqueado conversation=${conversationId || '-'} job=${job.id}`,
    );
    this.publishAutomationEvent({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      jobId: job.id,
      leadId: lead.id,
      conversationId,
      status: 'aguardando',
      text: 'Envio bloqueado por segmento divergente.',
      type: 'segment_mismatch',
    });
  }

  private async ensureSegmentMismatchReviewJob(campaign: any, lead: any) {
    const existing = await this.prisma.vendasAutomationJob.findFirst({
      where: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        leadId: lead.id,
        status: 'skipped',
        classification: 'segment_mismatch_blocked',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (existing) {
      await this.updateProspectionConversationStage({
        companyId: campaign.companyId,
        lead,
        campaign,
        jobId: existing.id,
        stage: 'needs_review',
        scheduledAt: existing.scheduledAt || null,
        mismatchReason: 'segment_mismatch',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        active: true,
      });
      return existing;
    }
    const mismatchJob = await this.prisma.vendasAutomationJob.create({
      data: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        leadId: lead.id,
        status: 'skipped',
        scheduledAt: null,
        attemptNumber: Math.max(1, Number(lead.attemptCount || 0) + 1),
      },
    });
    await this.markSegmentMismatchBeforeSend(mismatchJob, campaign, lead);
    return mismatchJob;
  }

  private getProspectingSceneRules(config: AtendimentoBotConfig | null | undefined): ProspectingSceneRules {
    const rule = (config?.sceneRules || []).find(
      (item: any) =>
        String(item?.sceneId || '').trim() === 'first_contact_rules_prospeccao' &&
        String(item?.conditionType || '').trim() === 'first_contact_rules',
    );
    const metadata = parseJsonObject((rule as any)?.metadata);
    return {
      nextContactDelayMinutes: clampInteger(metadata.nextContactDelayMinutes, 12, 1, 180),
      typingSeconds: clampInteger(metadata.typingSeconds, 8, 0, 45),
      typingVarianceSeconds: clampInteger(metadata.typingVarianceSeconds, 6, 0, 30),
      positiveIntentKeywords: normalizeTextList(metadata.positiveIntentKeywords, DEFAULT_POSITIVE_KEYWORDS),
      negativeIntentKeywords: normalizeTextList(
        metadata.negativeIntentKeywords || metadata.stopIntentKeywords,
        DEFAULT_NEGATIVE_KEYWORDS,
      ),
      optOutMessage: trimOrNull(metadata.optOutMessage) || DEFAULT_OPT_OUT_MESSAGE,
      optOutReplyEnabled: metadata.optOutReplyEnabled === true,
    };
  }

  private normalizeProspectingConfig(
    payload: Partial<UpdateVendasProspectingConfigDto> | null | undefined,
    botConfig?: AtendimentoBotConfig | null,
    existing?: any,
  ) {
    const scene = this.getProspectingSceneRules(botConfig);
    const filters = parseJsonObject(payload?.filtersJson ?? existing?.filtersJson);
    const optOutReplyEnabled =
      payload?.optOutReplyEnabled === undefined
        ? Boolean(filters.optOutReplyEnabled ?? scene.optOutReplyEnabled)
        : payload.optOutReplyEnabled === true;
    const nextFilters = { ...filters, optOutReplyEnabled };
    const minLeadBuffer = clampInteger(payload?.minLeadBuffer, existing?.minLeadBuffer ?? 15, 1, 500);
    const desiredLeadBuffer = Math.max(
      minLeadBuffer,
      clampInteger(payload?.desiredLeadBuffer, existing?.desiredLeadBuffer ?? 60, 1, 500),
    );
    return {
      city: hasOwnValue(payload, 'city')
        ? trimOrNull(payload?.city) || ''
        : trimOrNull(existing?.city) || '',
      state: hasOwnValue(payload, 'state')
        ? trimOrNull(payload?.state)?.toUpperCase() || null
        : trimOrNull(existing?.state),
      segment: hasOwnValue(payload, 'segment')
        ? trimOrNull(payload?.segment) || ''
        : trimOrNull(existing?.segment) || '',
      engine: payload?.engine
        ? (String(payload.engine).trim() === 'google' ? 'google' : 'hbx')
        : trimOrNull(existing?.engine) || 'hbx',
      targetType:
        ['pf', 'agenda_pf'].includes(String(payload?.targetType || existing?.targetType || '').trim())
          ? String(payload?.targetType || existing?.targetType)
          : 'pj',
      filtersJson: JSON.stringify(nextFilters),
      messageTemplate:
        trimOrNull(payload?.messageTemplate) ||
        trimOrNull(existing?.messageTemplate) ||
        DEFAULT_MESSAGE_TEMPLATE,
      intervalMinutes: clampInteger(
        payload?.intervalMinutes,
        existing?.intervalMinutes ?? scene.nextContactDelayMinutes,
        1,
        180,
      ),
      dailyLimit: clampInteger(payload?.dailyLimit, existing?.dailyLimit ?? DEFAULT_DAILY_LIMIT, 1, 300),
      minLeadBuffer,
      desiredLeadBuffer,
      maxAttemptsPerLead: clampInteger(payload?.maxAttemptsPerLead, existing?.maxAttemptsPerLead ?? 1, 1, 3),
      workingHoursStart: this.normalizeTime(payload?.workingHoursStart || existing?.workingHoursStart, '09:00'),
      workingHoursEnd: this.normalizeTime(payload?.workingHoursEnd || existing?.workingHoursEnd, '17:30'),
      typingSeconds: clampInteger(payload?.typingSeconds, existing?.typingSeconds ?? scene.typingSeconds, 0, 45),
      typingVarianceSeconds: clampInteger(
        payload?.typingVarianceSeconds,
        existing?.typingVarianceSeconds ?? scene.typingVarianceSeconds,
        0,
        30,
      ),
      positiveIntentKeywordsJson: JSON.stringify(
        normalizeTextList(payload?.positiveIntentKeywords, parseJsonList(existing?.positiveIntentKeywordsJson, scene.positiveIntentKeywords)),
      ),
      negativeIntentKeywordsJson: JSON.stringify(
        normalizeTextList(payload?.negativeIntentKeywords, parseJsonList(existing?.negativeIntentKeywordsJson, scene.negativeIntentKeywords)),
      ),
      optOutMessage: trimOrNull(payload?.optOutMessage) || trimOrNull(existing?.optOutMessage) || scene.optOutMessage,
      websiteFallbackEnabled: false,
    };
  }

  private normalizeTime(value: unknown, fallback: string) {
    const normalized = String(value || '').trim();
    return /^\d{2}:\d{2}$/.test(normalized) ? normalized : fallback;
  }

  private buildSearchSignature(config: any) {
    const filters = parseJsonObject(config.filtersJson);
    return [
      `engine:${config.engine || 'hbx'}`,
      `target:${config.targetType || 'pj'}`,
      `city:${normalizeKey(config.city)}`,
      `state:${String(config.state || '').trim().toUpperCase()}`,
      `segment:${normalizeKey(config.segment)}`,
      `filters:${JSON.stringify(filters)}`,
    ].join('|');
  }

  private hasCampaignSearchChanged(existing: any, nextSearchSignature: string) {
    if (!existing?.id) return false;
    const currentSignature = trimOrNull(existing.searchSignature);
    if (currentSignature) return currentSignature !== nextSearchSignature;
    return this.buildSearchSignature(existing) !== nextSearchSignature;
  }

  private async cancelQueuedJobsAfterSearchChange(campaignId: string) {
    await this.prisma.vendasAutomationJob.updateMany({
      where: { campaignId, status: { in: ['pending', 'scheduled', 'sending'] } },
      data: {
        status: 'canceled',
        archivedAt: new Date(),
        errorMessage: 'Busca da campanha alterada. Fila anterior cancelada.',
      },
    });
  }

  private formatProspectingSearchLabel(config: any) {
    const segment = trimOrNull(config?.segment) || 'contatos';
    const city = trimOrNull(config?.city);
    const state = trimOrNull(config?.state)?.toUpperCase();
    if (city) return `${segment} em ${city}${state ? `/${state}` : ''}`;
    if (state) return `${segment} no estado ${state}`;
    return `${segment} no Brasil`;
  }

  private formatNextScheduledText(date: Date) {
    const target = getBusinessDateParts(date);
    const today = getBusinessDateParts(new Date());
    const targetDay = Date.UTC(target.year, target.month - 1, target.day);
    const todayDay = Date.UTC(today.year, today.month - 1, today.day);
    const diffDays = Math.round((targetDay - todayDay) / 86400000);
    const time = `${String(target.hour).padStart(2, '0')}:${String(target.minute).padStart(2, '0')}`;
    if (diffDays === 0) return `Próximo envio hoje às ${time}`;
    if (diffDays === 1) return `Próximo envio amanhã às ${time}`;
    return `Próximo envio em ${String(target.day).padStart(2, '0')}/${String(target.month).padStart(2, '0')} às ${time}`;
  }

  private formatSleepingUntilText(date: Date) {
    const target = getBusinessDateParts(date);
    const today = getBusinessDateParts(new Date());
    const targetDay = Date.UTC(target.year, target.month - 1, target.day);
    const todayDay = Date.UTC(today.year, today.month - 1, today.day);
    const diffDays = Math.round((targetDay - todayDay) / 86400000);
    const time = `${String(target.hour).padStart(2, '0')}:${String(target.minute).padStart(2, '0')}`;
    const dayLabel = diffDays === 0 ? 'hoje' : diffDays === 1 ? 'amanhã' : `em ${String(target.day).padStart(2, '0')}/${String(target.month).padStart(2, '0')}`;
    return `Bot dormindo. Fora do horário operacional; retomamos ${dayLabel} às ${time}.`;
  }

  private async latestCampaign(companyId: number) {
    return this.prisma.vendasAutomationCampaign.findFirst({
      where: { companyId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getLiveStatusForUser(user: any) {
    const context = this.resolveUserContext(user);
    await this.assertEntitlement(user);
    const campaign = await this.latestCampaign(context.companyId);
    if (!campaign) {
      return {
        status: 'parado' satisfies LiveAutomationStatus,
        text: 'Nenhuma campanha ativa.',
        active: false,
        campaign: null,
        counters: { todayPending: 0, overdue: 0, future: 0, sent: 0, positives: 0, archived: 0, failed: 0 },
        nextScheduledAt: null,
      };
    }
    return this.buildLiveStatus(campaign);
  }

  private inferLiveStatus(campaign: any, counters: Record<string, number>, sendingCount: number): LiveAutomationStatus {
    if (campaign.status === 'paused') return 'pausado';
    if (campaign.status === 'error') return 'erro';
    if (['canceled', 'done'].includes(String(campaign.status || ''))) return 'parado';
    if (campaign.status === 'running' && !this.isInsideWorkingHours(new Date(), campaign)) return 'dormindo';
    const statusText = normalizeKey(campaign.lastStatusText);
    if (statusText.includes('buscando')) return 'buscando';
    if (statusText.includes('importando')) return 'importando';
    if (statusText.includes('agendando')) return 'agendando';
    if (sendingCount > 0 || statusText.includes('enviando')) return 'enviando';
    if ((counters.todayPending || 0) + (counters.overdue || 0) + (counters.future || 0) > 0) return 'aguardando';
    return 'aguardando';
  }

  private async buildLiveStatus(campaign: any) {
    const today = getBusinessDateParts(new Date());
    const todayStart = makeBusinessDate(today.year, today.month, today.day, 0, 0);
    const tomorrowStart = makeBusinessDate(today.year, today.month, today.day + 1, 0, 0);
    const pendingWhere = { campaignId: campaign.id, status: { in: [...BUFFER_JOB_STATUSES] as any } };
    const [todayPending, overdue, future, sent, positives, archived, failed, sending, nextJob, sentToday, skippedJobsToday, needsReviewCount, noWhatsappCount, failedJobsToday, lastSkipJob, lastSuccessfulSendAt] = await Promise.all([
      this.prisma.vendasAutomationJob.count({
        where: { ...pendingWhere, scheduledAt: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { ...pendingWhere, scheduledAt: { lt: todayStart } },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { ...pendingWhere, scheduledAt: { gte: tomorrowStart } },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: { in: ['sent', 'replied_positive', 'replied_negative', 'no_response_archived'] } },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: 'replied_positive' },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: { in: ['replied_negative', 'no_response_archived', 'skipped', 'canceled'] } },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: 'failed' },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: 'sending' },
      }),
      this.prisma.vendasAutomationJob.findFirst({
        where: { campaignId: campaign.id, status: 'scheduled', scheduledAt: { not: null } },
        orderBy: { scheduledAt: 'asc' },
        select: { id: true, scheduledAt: true, lead: { select: { name: true } } },
      }),
      this.countSuccessfulSendsToday(campaign.id, campaign.companyId),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: 'skipped', archivedAt: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, classification: { in: ['needs_review', 'manual_review_required'] as any } },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, classification: { in: ['no_whatsapp', 'invalid_whatsapp'] as any } },
      }),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: 'failed', archivedAt: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.vendasAutomationJob.findFirst({
        where: { campaignId: campaign.id, status: 'skipped' },
        orderBy: [{ archivedAt: 'desc' }, { updatedAt: 'desc' }],
        select: { classification: true, errorMessage: true },
      }),
      this.getLastSuccessfulSendAt(campaign.id, campaign.companyId),
    ]);
    let nextScheduledAt = nextJob?.scheduledAt instanceof Date ? nextJob.scheduledAt : null;
    if (nextJob?.id && nextScheduledAt && !this.isInsideWorkingHours(nextScheduledAt, campaign)) {
      nextScheduledAt = this.moveToWorkingWindow(nextScheduledAt, campaign);
      await this.prisma.vendasAutomationJob.update({
        where: { id: nextJob.id },
        data: { scheduledAt: nextScheduledAt },
      });
    }
    const nextAllowedDate = await this.getNextAllowedSendAt(campaign);
    const dailyLimit = Number(campaign.dailyLimit || DEFAULT_DAILY_LIMIT);
    const pendingJobs = (todayPending || 0) + (overdue || 0) + (future || 0);
    const scheduledJobs = pendingJobs;
    const cooldownActive = Boolean(nextAllowedDate && nextAllowedDate.getTime() > Date.now());
    const counters = {
      todayPending,
      overdue,
      future,
      sent,
      positives,
      archived,
      failed,
      sentToday,
      dailyLimit,
      remainingToday: Math.max(0, dailyLimit - sentToday),
      pendingJobs,
      scheduledJobs,
      skippedJobsToday,
      needsReviewCount,
      noWhatsappCount,
      failedJobsToday,
    };
    const status = this.inferLiveStatus(campaign, counters, sending);
    const nextWorkingWindow = status === 'dormindo' ? this.moveToWorkingWindow(new Date(), campaign) : null;
    const nextScheduledText = nextScheduledAt ? this.formatNextScheduledText(nextScheduledAt) : null;
    return {
      status,
      text:
        status === 'dormindo'
          ? this.formatSleepingUntilText(nextWorkingWindow || new Date())
          :
        status === 'aguardando' && nextScheduledText
          ? nextScheduledText
          : campaign.lastStatusText || (todayPending > 0 ? `${todayPending} contatos na fila hoje.` : 'Aguardando respostas.'),
      active: campaign.status === 'running' && status !== 'dormindo',
      campaign: this.serializeCampaign(campaign),
      counters,
      nextScheduledAt: nextScheduledAt ? nextScheduledAt.toISOString() : null,
      sentToday,
      dailyLimit,
      remainingToday: Math.max(0, dailyLimit - sentToday),
      nextAllowedSendAt: nextAllowedDate ? nextAllowedDate.toISOString() : null,
      cooldownActive,
      pendingJobs,
      scheduledJobs,
      skippedJobsToday,
      needsReviewCount,
      noWhatsappCount,
      failedJobsToday,
      lastSkipReason: lastSkipJob?.classification || lastSkipJob?.errorMessage || null,
      lastSuccessfulSendAt: lastSuccessfulSendAt ? lastSuccessfulSendAt.toISOString() : null,
      nextEligibleLeadName: String((nextJob as any)?.lead?.name || '').trim() || null,
      lastError: campaign.lastError || null,
    };
  }

  private serializeCampaign(campaign: any) {
    if (!campaign) return null;
    const filtersJson = parseJsonObject(campaign.filtersJson);
    return {
      id: campaign.id,
      status: campaign.status,
      city: campaign.city,
      state: campaign.state,
      segment: campaign.segment,
      engine: campaign.engine,
      targetType: campaign.targetType,
      filtersJson,
      searchSignature: campaign.searchSignature,
      messageTemplate: campaign.messageTemplate,
      intervalMinutes: campaign.intervalMinutes,
      dailyLimit: campaign.dailyLimit,
      minLeadBuffer: campaign.minLeadBuffer,
      desiredLeadBuffer: campaign.desiredLeadBuffer,
      maxAttemptsPerLead: campaign.maxAttemptsPerLead,
      workingHoursStart: campaign.workingHoursStart,
      workingHoursEnd: campaign.workingHoursEnd,
      typingSeconds: campaign.typingSeconds,
      typingVarianceSeconds: campaign.typingVarianceSeconds,
      positiveIntentKeywords: parseJsonList(campaign.positiveIntentKeywordsJson, DEFAULT_POSITIVE_KEYWORDS),
      negativeIntentKeywords: parseJsonList(campaign.negativeIntentKeywordsJson, DEFAULT_NEGATIVE_KEYWORDS),
      optOutMessage: campaign.optOutMessage || DEFAULT_OPT_OUT_MESSAGE,
      optOutReplyEnabled: filtersJson.optOutReplyEnabled === true,
      websiteFallbackEnabled: false,
      lastScrapeAt: campaign.lastScrapeAt instanceof Date ? campaign.lastScrapeAt.toISOString() : null,
      lastStatusText: campaign.lastStatusText || null,
      lastError: campaign.lastError || null,
      createdAt: campaign.createdAt instanceof Date ? campaign.createdAt.toISOString() : null,
      updatedAt: campaign.updatedAt instanceof Date ? campaign.updatedAt.toISOString() : null,
    };
  }

  async patchProspectingConfigForUser(user: any, dto: UpdateVendasProspectingConfigDto) {
    const context = this.resolveUserContext(user);
    await this.assertEntitlement(user);
    const botConfig = await this.inboxService.getBotConfig(user);
    const current = await this.latestCampaign(context.companyId);
    const data = this.normalizeProspectingConfig(dto || {}, botConfig, current);
    const searchSignature = this.buildSearchSignature(data);
    const searchChanged = this.hasCampaignSearchChanged(current, searchSignature);
    const campaign = current
      ? await this.prisma.vendasAutomationCampaign.update({
          where: { id: current.id },
          data: {
            ...data,
            searchSignature,
            status: current.status === 'running' ? 'running' : 'paused',
            createdByUserId: current.createdByUserId || context.userId,
            lastStatusText: current.status === 'running' ? current.lastStatusText : 'Configuração salva. Pronta para iniciar.',
            lastError: null,
          },
        })
      : await this.prisma.vendasAutomationCampaign.create({
          data: {
            ...data,
            searchSignature,
            companyId: context.companyId,
            createdByUserId: context.userId,
            status: 'paused',
            lastStatusText: 'Configuração salva. Pronta para iniciar.',
          },
        });
    if (searchChanged) {
      await this.cancelQueuedJobsAfterSearchChange(campaign.id);
    }
    this.publishAutomationEvent({
      companyId: context.companyId,
      campaignId: campaign.id,
      status: campaign.status === 'paused' ? 'pausado' : 'aguardando',
      text: campaign.lastStatusText || 'Configuração salva.',
      type: 'config_updated',
    });
    return this.buildLiveStatus(campaign);
  }

  async startProspectingForUser(user: any, dto: StartVendasProspectingDto) {
    const context = this.resolveUserContext(user);
    await this.assertEntitlement(user);
    const botConfig = await this.inboxService.getBotConfig(user);
    const current = await this.latestCampaign(context.companyId);
    const data = this.normalizeProspectingConfig(dto || {}, botConfig, current);
    if (!data.segment) {
      throw new BadRequestException('Informe o segmento para iniciar a prospecção automática.');
    }
    if (data.targetType === 'pj' && !data.city) {
      throw new BadRequestException('Informe a cidade para iniciar a prospecção automática.');
    }
    const searchSignature = this.buildSearchSignature(data);
    const searchLabel = this.formatProspectingSearchLabel(data);
    const now = new Date();
    const startsInsideWorkingHours = this.isInsideWorkingHours(now, data);
    const initialStatusText = startsInsideWorkingHours
      ? `Buscando ${searchLabel}.`
      : this.formatSleepingUntilText(this.moveToWorkingWindow(now, data));
    const searchChanged = this.hasCampaignSearchChanged(current, searchSignature);
    const campaign = current
      ? await this.prisma.vendasAutomationCampaign.update({
          where: { id: current.id },
          data: {
            ...data,
            searchSignature,
            status: 'running',
            createdByUserId: current.createdByUserId || context.userId,
            lastStatusText: initialStatusText,
            lastError: null,
          },
        })
      : await this.prisma.vendasAutomationCampaign.create({
          data: {
            ...data,
            searchSignature,
            companyId: context.companyId,
            createdByUserId: context.userId,
            status: 'running',
            lastStatusText: initialStatusText,
          },
        });
    if (searchChanged) {
      await this.cancelQueuedJobsAfterSearchChange(campaign.id);
    }

    this.publishAutomationEvent({
      companyId: context.companyId,
      campaignId: campaign.id,
      status: startsInsideWorkingHours ? 'buscando' : 'dormindo',
      text: campaign.lastStatusText || (startsInsideWorkingHours ? 'Buscando novos contatos...' : initialStatusText),
      type: 'campaign_started',
    });

    if (startsInsideWorkingHours) {
      void this.scrapeImportAndSchedule(campaign.id, user, 'start').catch((error) => {
        void this.markCampaignStage(campaign.id, context.companyId, 'erro', 'Erro na prospecção automática.', {
          error: String(error?.message || error),
          type: 'campaign_error',
        });
      }).finally(() => {
        void this.runWorkerCycle().catch(() => null);
      });
    }

    return this.buildLiveStatus(campaign);
  }

  async pauseProspectingForUser(user: any) {
    return this.setCampaignStatusForUser(user, 'paused', 'Campanha pausada.', 'campaign_paused');
  }

  async resumeProspectingForUser(user: any) {
    const context = this.resolveUserContext(user);
    await this.assertEntitlement(user);
    const campaign = await this.latestCampaign(context.companyId);
    if (!campaign) throw new BadRequestException('Nenhuma campanha de prospecção encontrada.');
    const nextScheduledAt = this.moveToWorkingWindow(new Date(), campaign);
    const updated = await this.prisma.$transaction(async (tx) => {
      const nextJob = await tx.vendasAutomationJob.findFirst({
        where: { campaignId: campaign.id, status: { in: ['pending', 'scheduled'] } },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (nextJob?.id) {
        await tx.vendasAutomationJob.update({
          where: { id: nextJob.id },
          data: { status: 'scheduled', scheduledAt: nextScheduledAt },
        });
      }
      return tx.vendasAutomationCampaign.update({
        where: { id: campaign.id },
        data: {
          status: 'running',
          lastStatusText: this.formatNextScheduledText(nextScheduledAt),
          lastError: null,
        },
      });
    });
    this.publishAutomationEvent({
      companyId: context.companyId,
      campaignId: updated.id,
      status: 'aguardando',
      text: this.formatNextScheduledText(nextScheduledAt),
      type: 'campaign_resumed',
    });
    const status = await this.buildLiveStatus(updated);
    void this.runWorkerCycle().catch(() => null);
    return status;
  }

  async cancelProspectingForUser(user: any) {
    const context = this.resolveUserContext(user);
    await this.assertEntitlement(user);
    const campaign = await this.latestCampaign(context.companyId);
    if (!campaign) throw new BadRequestException('Nenhuma campanha de prospecção encontrada.');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.vendasAutomationJob.updateMany({
        where: { campaignId: campaign.id, status: { in: ['pending', 'scheduled', 'sending'] } },
        data: { status: 'canceled', archivedAt: new Date(), errorMessage: 'Campanha cancelada.' },
      });
      return tx.vendasAutomationCampaign.update({
        where: { id: campaign.id },
        data: { status: 'canceled', lastStatusText: 'Campanha cancelada.', lastError: null },
      });
    });
    this.publishAutomationEvent({
      companyId: context.companyId,
      campaignId: updated.id,
      status: 'parado',
      text: 'Campanha cancelada.',
      type: 'campaign_canceled',
    });
    return this.buildLiveStatus(updated);
  }

  private async setCampaignStatusForUser(user: any, status: 'running' | 'paused', text: string, type: string) {
    const context = this.resolveUserContext(user);
    await this.assertEntitlement(user);
    const campaign = await this.latestCampaign(context.companyId);
    if (!campaign) throw new BadRequestException('Nenhuma campanha de prospecção encontrada.');
    const updated = await this.prisma.vendasAutomationCampaign.update({
      where: { id: campaign.id },
      data: { status, lastStatusText: text, lastError: null },
    });
    this.publishAutomationEvent({
      companyId: context.companyId,
      campaignId: updated.id,
      status: status === 'paused' ? 'pausado' : 'aguardando',
      text,
      type,
    });
    return this.buildLiveStatus(updated);
  }

  private async buildAutomationUser(campaign: any) {
    const userId = Number(campaign.createdByUserId || 0);
    const user = userId
      ? await this.prisma.user.findFirst({
          where: { id: userId, companyId: campaign.companyId },
          include: { company: true },
        })
      : null;
    if (user?.id) return user;
    return {
      id: userId || 1,
      companyId: campaign.companyId,
      company: await this.prisma.company.findUnique({ where: { id: campaign.companyId } }),
    };
  }

  private async isHBotActiveForCampaign(campaign: any) {
    if (typeof (this.inboxService as any)?.getBotConfig !== 'function') return true;
    try {
      const runtimeUser = await this.buildAutomationUser(campaign);
      const config = await this.inboxService.getBotConfig(runtimeUser);
      return config?.routingRules?.globalBotEnabled === true;
    } catch (error: any) {
      this.logger.warn(`Falha ao validar HBot ativo campaign=${campaign.id}: ${String(error?.message || error)}`);
      return false;
    }
  }

  private renderMessageTemplate(template: string, input: { lead: any; campaign: any; user: any }) {
    const companyName = String(input.user?.company?.name || input.user?.masterContext?.companyName || '').trim() || 'nossa empresa';
    const employeeName = String(input.user?.name || '').trim() || 'time comercial';
    const values: Record<string, string> = {
      cliente: String(input.lead?.name || 'sua empresa').trim(),
      empresa: companyName,
      funcionario: employeeName,
      cidade: String(input.lead?.city || input.campaign.city || '').trim(),
      estado: String(input.campaign.state || '').trim(),
      segmento: String(input.lead?.segment || input.campaign.segment || '').trim(),
      website: String(input.lead?.website || '').trim(),
    };
    return String(template || DEFAULT_MESSAGE_TEMPLATE)
      .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => values[key] || '')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private resolveOutboundTemplate(campaign: any, lead: any, metadata?: Record<string, unknown> | null) {
    const queue = parseJsonObject((metadata as any)?.vendasAgendaQueue);
    return (
      trimOrNull((queue as any).draftMessage) ||
      trimOrNull((queue as any).inheritedDraftMessage) ||
      trimOrNull(lead?.scriptText) ||
      trimOrNull(lead?.roteiro) ||
      trimOrNull(lead?.messageTemplate) ||
      trimOrNull(campaign?.messageTemplate) ||
      DEFAULT_MESSAGE_TEMPLATE
    );
  }

  private renderOutboundMessage(campaign: any, lead: any, user: any, metadata?: Record<string, unknown> | null) {
    const body = this.renderMessageTemplate(this.resolveOutboundTemplate(campaign, lead, metadata), { lead, campaign, user });
    return trimOrNull(body) || this.renderMessageTemplate(DEFAULT_MESSAGE_TEMPLATE, { lead, campaign, user });
  }

  private async dedupeSearchResults(companyId: number, results: ProspectingSearchResult[]) {
    const phones = new Set<string>();
    const websites = new Set<string>();
    const nameAddressPairs: Array<{ name: string; address: string }> = [];
    const seenBatchPhones = new Set<string>();
    const seenBatchWebsites = new Set<string>();
    const seenBatchNameAddress = new Set<string>();

    for (const result of results) {
      const phone = normalizePhoneDigits((result as any).phoneDigits || result.phone);
      if (phone) phones.add(phone);
      const website = normalizeWebsiteKey(result.website);
      if (website) websites.add(website);
      const name = normalizeKey(result.name);
      const address = normalizeKey(result.address);
      if (name && address) nameAddressPairs.push({ name, address });
    }

    const duplicateFilters = [
      ...(phones.size ? [{ phoneNormalized: { in: Array.from(phones) } }] : []),
      ...Array.from(websites)
        .slice(0, 100)
        .map((website) => ({ website: { contains: website, mode: 'insensitive' as const } })),
      ...nameAddressPairs.slice(0, 100).map((pair) => ({
        name: { equals: pair.name, mode: 'insensitive' as const },
        address: { equals: pair.address, mode: 'insensitive' as const },
      })),
    ];
    const existing = duplicateFilters.length
      ? await this.prisma.vendasLead.findMany({
          where: { companyId, OR: duplicateFilters },
          select: { phoneNormalized: true, website: true, name: true, address: true },
        })
      : [];

    const existingPhones = new Set(existing.map((lead) => normalizePhoneDigits(lead.phoneNormalized)).filter(Boolean));
    const existingWebsites = new Set(existing.map((lead) => normalizeWebsiteKey(lead.website)).filter(Boolean));
    const existingNameAddress = new Set(
      existing
        .map((lead) => {
          const name = normalizeKey(lead.name);
          const address = normalizeKey(lead.address);
          return name && address ? `${name}|${address}` : '';
        })
        .filter(Boolean),
    );

    return results.filter((result) => {
      const phone = normalizePhoneDigits((result as any).phoneDigits || result.phone);
      const website = normalizeWebsiteKey(result.website);
      const nameAddress = `${normalizeKey(result.name)}|${normalizeKey(result.address)}`;

      if (phone && (existingPhones.has(phone) || seenBatchPhones.has(phone))) return false;
      if (website && (existingWebsites.has(website) || seenBatchWebsites.has(website))) return false;
      if (nameAddress !== '|' && (existingNameAddress.has(nameAddress) || seenBatchNameAddress.has(nameAddress))) return false;

      if (phone) seenBatchPhones.add(phone);
      if (website) seenBatchWebsites.add(website);
      if (nameAddress !== '|') seenBatchNameAddress.add(nameAddress);
      return true;
    });
  }

  private async scrapeImportAndSchedule(campaignId: string, user?: any, reason: 'start' | 'refill' = 'start') {
    const campaign = await this.prisma.vendasAutomationCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== 'running') return;
    const now = new Date();
    if (!this.isInsideWorkingHours(now, campaign)) {
      const next = this.moveToWorkingWindow(now, campaign);
      await this.markCampaignStage(campaign.id, campaign.companyId, 'dormindo', this.formatSleepingUntilText(next), {
        type: 'outside_working_hours',
      });
      return;
    }
    const runtimeUser = user || (await this.buildAutomationUser(campaign));
    const searchLabel = `${campaign.segment} em ${campaign.city}${campaign.state ? `/${campaign.state}` : ''}`;
    await this.markCampaignStage(campaign.id, campaign.companyId, 'buscando', `Buscando ${searchLabel}.`, {
      type: reason === 'refill' ? 'scrape_refill_started' : 'scrape_started',
    });
    const filters = parseJsonObject(campaign.filtersJson);
    const search = await this.webscrapingService.searchContactsForUser(runtimeUser, {
      city: campaign.city,
      state: campaign.state || null,
      segment: campaign.segment,
      quantity: campaign.engine === 'hbx' ? 100 : Math.min(20, campaign.desiredLeadBuffer || 60),
      engine: campaign.engine === 'google' ? 'google' : 'hbx',
      targetType: ['pf', 'agenda_pf'].includes(String(campaign.targetType || '')) ? campaign.targetType as any : 'pj',
      minRating: Number(filters.minRating || 0) || null,
      minReviews: Number(filters.minReviews || 0) || null,
      onlyWithWebsite: filters.onlyWithWebsite === true,
    });
    await this.prisma.vendasAutomationCampaign.update({
      where: { id: campaign.id },
      data: { lastScrapeAt: new Date(), searchSignature: search.query ? this.buildSearchSignature(campaign) : campaign.searchSignature },
    });
    this.publishAutomationEvent({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      status: 'buscando',
      text: `Busca retornou ${search.results.length} contatos.`,
      type: 'scrape_completed',
    });

    const dedupedResults = await this.dedupeSearchResults(campaign.companyId, search.results);
    await this.markCampaignStage(campaign.id, campaign.companyId, 'importando', `Importando ${dedupedResults.length} novos cards...`, {
      type: 'import_started',
    });
    const leads = dedupedResults.map((result: ProspectingSearchResult) => ({
      name: result.name,
      phone: result.phone,
      phoneDigits: result.phoneDigits,
      address: result.address || undefined,
      website: result.website || undefined,
      rating: result.rating ?? undefined,
      reviews: result.reviews ?? undefined,
      city: search.query.city || campaign.city,
      segment: search.query.segment || campaign.segment,
      shortNote: result.opportunityReason || undefined,
      scriptText: this.renderOutboundMessage(
        campaign,
        { ...result, city: search.query.city, segment: search.query.segment },
        runtimeUser,
      ),
      sourceHistoryId: search.meta.historyId || undefined,
    }));
    if (leads.length) {
      await this.vendasService.importWebscrapingLeadsForUser(runtimeUser, {
        sourceHistoryId: search.meta.historyId || undefined,
        leads,
      });
    }
    this.publishAutomationEvent({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      status: 'importando',
      text: `Importação concluída com ${leads.length} contato(s).`,
      type: 'leads_imported',
    });
    await this.scheduleJobsForCampaign(campaign.id);
  }

  private parseTimeOnDate(date: Date, hhmm: string) {
    const [hourRaw, minuteRaw] = this.normalizeTime(hhmm, '09:00').split(':');
    const parts = getBusinessDateParts(date);
    return makeBusinessDate(parts.year, parts.month, parts.day, Number(hourRaw), Number(minuteRaw));
  }

  private isBusinessDay(date: Date) {
    const day = getBusinessDateParts(date).weekday;
    return day >= 1 && day <= 5;
  }

  private addBusinessCalendarDays(date: Date, days: number) {
    const parts = getBusinessDateParts(date);
    return makeBusinessDate(parts.year, parts.month, parts.day + days, parts.hour, parts.minute);
  }

  private moveToBusinessDay(date: Date) {
    const next = new Date(date);
    while (!this.isBusinessDay(next)) {
      const moved = this.addBusinessCalendarDays(next, 1);
      next.setTime(moved.getTime());
    }
    return next;
  }

  private moveToWorkingWindow(date: Date, campaign: any) {
    if (!this.isBusinessDay(date)) {
      return this.parseTimeOnDate(this.moveToBusinessDay(date), campaign.workingHoursStart || '09:00');
    }
    const start = this.parseTimeOnDate(date, campaign.workingHoursStart || '09:00');
    const end = this.parseTimeOnDate(date, campaign.workingHoursEnd || '17:30');
    if (date.getTime() < start.getTime()) return start;
    if (date.getTime() <= end.getTime()) return date;
    const nextDay = this.addBusinessCalendarDays(date, 1);
    return this.parseTimeOnDate(this.moveToBusinessDay(nextDay), campaign.workingHoursStart || '09:00');
  }

  private getCampaignIntervalMs(campaign: any) {
    return Math.max(1, Number(campaign.intervalMinutes || 12)) * 60000;
  }

  private async buildScheduleCursorForCampaign(campaign: any) {
    const intervalMs = this.getCampaignIntervalMs(campaign);
    const now = new Date();
    const [latestActiveScheduled, lastSuccessfulSendAt] = await Promise.all([
      this.prisma.vendasAutomationJob.findFirst({
        where: {
          campaignId: campaign.id,
          status: { in: [...BUFFER_JOB_STATUSES] as any },
          scheduledAt: { not: null },
        },
        orderBy: { scheduledAt: 'desc' },
        select: { scheduledAt: true },
      }),
      this.getLastSuccessfulSendAt(campaign.id, campaign.companyId),
    ]);
    let firstSlotTime = now.getTime();
    if (latestActiveScheduled?.scheduledAt instanceof Date && latestActiveScheduled.scheduledAt.getTime() > now.getTime()) {
      firstSlotTime = Math.max(firstSlotTime, latestActiveScheduled.scheduledAt.getTime() + intervalMs);
    }
    if (lastSuccessfulSendAt) {
      firstSlotTime = Math.max(firstSlotTime, lastSuccessfulSendAt.getTime() + intervalMs);
    }
    const firstSlot = this.moveToWorkingWindow(new Date(firstSlotTime), campaign);
    return new Date(firstSlot.getTime() - intervalMs);
  }

  private async getNextAllowedSendAt(campaign: any, currentJobId?: string | null) {
    const intervalMs = this.getCampaignIntervalMs(campaign);
    const lastSuccessfulSendAt = await this.getLastSuccessfulSendAt(campaign.id, campaign.companyId, currentJobId);
    if (!lastSuccessfulSendAt) return null;
    const nextAllowed = new Date(lastSuccessfulSendAt.getTime() + intervalMs);
    if (nextAllowed.getTime() <= Date.now()) return null;
    return this.moveToWorkingWindow(nextAllowed, campaign);
  }

  private async replenishCampaignAfterSkip(campaign: any, statusText: string) {
    await this.scheduleJobsForCampaign(campaign.id).catch((error) => {
      this.logger.warn(`Falha ao repor fila apos skip campaign=${campaign.id}: ${String(error?.message || error)}`);
    });
    const pendingCount = await this.prisma.vendasAutomationJob.count({
      where: { campaignId: campaign.id, status: { in: [...BUFFER_JOB_STATUSES] as any } },
    }).catch(() => 0);
    if (pendingCount <= 0) {
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', statusText, {
        type: 'job_skipped',
      }).catch(() => null);
    }
  }

  private async findActiveProspectionLeadIds(companyId: number) {
    if (typeof this.prisma.companyConversation.findMany !== 'function') return new Set<string>();
    const conversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        metadata: { contains: '"vendasAgendaQueue"' },
      },
      select: { metadata: true },
    }).catch(() => []);
    const leadIds = new Set<string>();
    for (const conversation of conversations) {
      const metadata = parseJsonObject(conversation.metadata);
      const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
      const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
      const leadId = trimOrNull((queue as any).leadId || (prospeccao as any).leadId);
      if (!leadId) continue;
      const queueTarget = normalizeKey((queue as any).queueTarget || (metadata as any).queueTarget || (queue as any).routeTarget || (metadata as any).routeTarget);
      const availability = String((queue as any).whatsappAvailabilityStatus || (metadata as any).whatsappAvailabilityStatus || '').trim().toLowerCase();
      const stage = normalizeKey((prospeccao as any).stage || (queue as any).status || (queue as any).stage);
      if ((queue as any).active !== true) continue;
      if (queueTarget && queueTarget !== 'prospeccao') continue;
      if (availability === 'unavailable') continue;
      if (['needs_review', 'manual_review_required'].includes(stage)) continue;
      if (parseBooleanFlag((queue as any).manualSent) || hasDateLikeValue((queue as any).manualSentAt) || hasDateLikeValue((queue as any).lastManualSendAt)) continue;
      leadIds.add(leadId);
    }
    return leadIds;
  }

  private async scheduleJobsForCampaign(campaignId: string) {
    const campaign = await this.prisma.vendasAutomationCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== 'running') return;
    const runtimeUser = await this.buildAutomationUser(campaign);
    await this.markCampaignStage(campaign.id, campaign.companyId, 'agendando', 'Agendando próximos envios...', {
      type: 'schedule_started',
    });
    const pendingCount = await this.prisma.vendasAutomationJob.count({
      where: { campaignId: campaign.id, status: { in: [...BUFFER_JOB_STATUSES] as any } },
    });
    const slotsToFill = Math.max(0, Number(campaign.desiredLeadBuffer || 60) - pendingCount);
    if (slotsToFill <= 0) {
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', `${pendingCount} contatos na fila.`, {
        type: 'queue_ready',
      });
      return;
    }
    const existingLeadIds = await this.prisma.vendasAutomationJob.findMany({
      where: { campaignId: campaign.id },
      select: { leadId: true },
    });
    const usedLeadIds = new Set(existingLeadIds.map((item) => item.leadId));
    const sourceSignature =
      [String(campaign.segment || '').trim(), String(campaign.city || '').trim()].filter(Boolean).join('|') || null;
    const activeProspectionLeadIds = await this.findActiveProspectionLeadIds(campaign.companyId);
    const sourceFilters: any[] = [
      {
        sourceType: 'webscraping',
        ...(sourceSignature ? { sourceSignature } : {}),
      },
    ];
    if (activeProspectionLeadIds.size) {
      sourceFilters.push({ id: { in: Array.from(activeProspectionLeadIds) } });
    }
    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId: campaign.companyId,
        status: { not: 'encerrado' },
        wasClosedBefore: false,
        closedAt: null,
        OR: sourceFilters,
        phoneNormalized: { not: null },
        id: { notIn: Array.from(usedLeadIds) },
        attemptCount: { lt: Math.max(1, Number(campaign.maxAttemptsPerLead || 1)) },
      },
      orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }],
      take: slotsToFill,
    });
    const intervalMs = this.getCampaignIntervalMs(campaign);
    let cursor = await this.buildScheduleCursorForCampaign(campaign);
    const data: any[] = [];
    const fallbackLeadIds = new Set<string>();
    let draftOnlyCount = 0;
    for (const lead of leads) {
      if (isSegmentMismatch(lead.segment, campaign.segment)) {
        const decision = await this.resolveSegmentMismatchFallbackDecision({
          companyId: campaign.companyId,
          campaign,
          lead,
        });
        if (decision.mode === 'block') {
          await this.ensureSegmentMismatchReviewJob(campaign, lead).catch((error) => {
            this.logger.warn(`Falha ao marcar divergencia de segmento lead=${lead.id}: ${String(error?.message || error)}`);
          });
          continue;
        }
        if (decision.mode === 'draft_only') {
          const conversationId = await this.updateProspectionConversationStage({
            companyId: campaign.companyId,
            lead,
            campaign,
            stage: 'pending_send',
            draftMessage: decision.message || DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
            mismatchReason: 'segment_mismatch_fallback',
            queueTarget: 'prospeccao',
            routeTarget: 'prospeccao',
            active: true,
            botEligible: false,
            botEntryPending: false,
          }).catch((error) => {
            this.logger.warn(`Falha ao preparar fallback manual lead=${lead.id}: ${String(error?.message || error)}`);
            return null;
          });
          draftOnlyCount += 1;
          this.publishSegmentMismatchFallbackEvent({
            companyId: campaign.companyId,
            campaignId: campaign.id,
            leadId: lead.id,
            conversationId: conversationId || decision.conversationId || null,
          });
          continue;
        }
        fallbackLeadIds.add(String(lead.id));
      }
      cursor = this.moveToWorkingWindow(new Date(cursor.getTime() + intervalMs), campaign);
      data.push({
        campaignId: campaign.id,
        companyId: campaign.companyId,
        leadId: lead.id,
        status: 'scheduled',
        scheduledAt: cursor,
        attemptNumber: Math.max(1, Number(lead.attemptCount || 0) + 1),
        ...(fallbackLeadIds.has(String(lead.id)) ? { classification: 'segment_mismatch_fallback' } : {}),
      });
    }
    if (data.length) {
      await this.prisma.vendasAutomationJob.createMany({ data, skipDuplicates: true });
      for (const item of data) {
        const lead = leads.find((candidate) => candidate.id === item.leadId);
        if (!lead) continue;
        const usesFallback = fallbackLeadIds.has(String(lead.id));
        const conversationId = await this.updateProspectionConversationStage({
          companyId: campaign.companyId,
          lead,
          campaign,
          stage: 'scheduled_send',
          scheduledAt: item.scheduledAt,
          draftMessage: usesFallback ? DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE : this.renderOutboundMessage(campaign, lead, runtimeUser),
          mismatchReason: usesFallback ? 'segment_mismatch_fallback' : null,
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          active: true,
        }).catch((error) => {
          this.logger.warn(`Falha ao marcar envio agendado lead=${lead.id}: ${String(error?.message || error)}`);
          return null;
        });
        if (usesFallback) {
          this.publishSegmentMismatchFallbackEvent({
            companyId: campaign.companyId,
            campaignId: campaign.id,
            leadId: lead.id,
            conversationId,
          });
        }
      }
    }
    await this.markCampaignStage(
      campaign.id,
      campaign.companyId,
      'aguardando',
      data.length
        ? `${pendingCount + data.length} contatos na fila.`
        : draftOnlyCount
          ? `${draftOnlyCount} card(s) prontos para primeiro contato.`
          : 'Aguardando novos contatos válidos.',
      { type: 'jobs_scheduled' },
    );
  }

  async enqueueLeadsForActiveCampaignForUser(user: any, leadIds: string[]) {
    try {
      const context = this.resolveUserContext(user);
      const requestedLeadIds = Array.from(
        new Set(
          (Array.isArray(leadIds) ? leadIds : [])
            .map((leadId) => String(leadId || '').trim())
            .filter(Boolean),
        ),
      );
      if (!requestedLeadIds.length) {
        return { ok: true, queuedCount: 0, skippedCount: 0, reason: 'no_leads' };
      }

      const campaign = await this.prisma.vendasAutomationCampaign.findFirst({
        where: { companyId: context.companyId, status: 'running' },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
      if (!campaign) {
        return { ok: true, queuedCount: 0, skippedCount: requestedLeadIds.length, reason: 'no_active_campaign' };
      }

      const existingJobs = await this.prisma.vendasAutomationJob.findMany({
        where: {
          campaignId: campaign.id,
          leadId: { in: requestedLeadIds },
          status: { notIn: ['failed', 'skipped', 'canceled'] },
        },
        select: { leadId: true },
      });
      const alreadyQueuedLeadIds = new Set(existingJobs.map((job) => String(job.leadId)));
      const agendaConversations = await this.prisma.companyConversation.findMany({
        where: {
          companyId: context.companyId,
          channel: 'whatsapp',
          metadata: { contains: '"vendasAgendaQueue"' },
        },
        select: { metadata: true },
      });
      const activeProspectingLeadIds = new Set<string>();
      const requestedLeadIdSet = new Set(requestedLeadIds);
      for (const conversation of agendaConversations) {
        const metadata = parseJsonObject(conversation.metadata);
        const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
        const leadId = trimOrNull((queue as any).leadId);
        if (!leadId || !requestedLeadIdSet.has(leadId)) continue;
        const queueTarget = String((queue as any).queueTarget || (queue as any).routeTarget || '').trim().toLowerCase();
        const availability = String((queue as any).whatsappAvailabilityStatus || '').trim().toLowerCase();
        if ((queue as any).active === true && queueTarget !== 'excluidos' && availability !== 'unavailable') {
          activeProspectingLeadIds.add(leadId);
        }
      }
      const maxAttempts = Math.max(1, Number(campaign.maxAttemptsPerLead || 1));
      const candidateLeadIds = requestedLeadIds.filter(
        (leadId) => activeProspectingLeadIds.has(leadId) && !alreadyQueuedLeadIds.has(leadId),
      );
      const leads = await this.prisma.vendasLead.findMany({
        where: {
          companyId: context.companyId,
          id: { in: candidateLeadIds },
          status: { not: 'encerrado' },
          wasClosedBefore: false,
          closedAt: null,
          phoneNormalized: { not: null },
          attemptCount: { lt: maxAttempts },
        },
        orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      });

      if (!leads.length) {
        return {
          ok: true,
          campaignId: campaign.id,
          queuedCount: 0,
          skippedCount: requestedLeadIds.length,
          reason: 'no_eligible_leads',
        };
      }

      const runtimeUser = await this.buildAutomationUser(campaign);
      const intervalMs = this.getCampaignIntervalMs(campaign);
      let cursor = await this.buildScheduleCursorForCampaign(campaign);

      const data: any[] = [];
      const fallbackLeadIds = new Set<string>();
      let draftOnlyCount = 0;
      for (const lead of leads) {
        if (isSegmentMismatch(lead.segment, campaign.segment)) {
          const decision = await this.resolveSegmentMismatchFallbackDecision({
            companyId: campaign.companyId,
            campaign,
            lead,
          });
          if (decision.mode === 'block') {
            await this.ensureSegmentMismatchReviewJob(campaign, lead).catch((error) => {
              this.logger.warn(`Falha ao marcar divergencia de segmento lead=${lead.id}: ${String(error?.message || error)}`);
            });
            continue;
          }
          if (decision.mode === 'draft_only') {
            const conversationId = await this.updateProspectionConversationStage({
              companyId: campaign.companyId,
              lead,
              campaign,
              stage: 'pending_send',
              draftMessage: decision.message || DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
              mismatchReason: 'segment_mismatch_fallback',
              queueTarget: 'prospeccao',
              routeTarget: 'prospeccao',
              active: true,
              botEligible: false,
              botEntryPending: false,
            }).catch((error) => {
              this.logger.warn(`Falha ao preparar fallback manual lead=${lead.id}: ${String(error?.message || error)}`);
              return null;
            });
            draftOnlyCount += 1;
            this.publishSegmentMismatchFallbackEvent({
              companyId: campaign.companyId,
              campaignId: campaign.id,
              leadId: lead.id,
              conversationId: conversationId || decision.conversationId || null,
            });
            continue;
          }
          fallbackLeadIds.add(String(lead.id));
        }
        cursor = this.moveToWorkingWindow(new Date(cursor.getTime() + intervalMs), campaign);
        data.push({
          campaignId: campaign.id,
          companyId: campaign.companyId,
          leadId: lead.id,
          status: 'scheduled',
          scheduledAt: cursor,
          attemptNumber: Math.max(1, Number(lead.attemptCount || 0) + 1),
          ...(fallbackLeadIds.has(String(lead.id)) ? { classification: 'segment_mismatch_fallback' } : {}),
        });
      }

      if (data.length) {
        await this.prisma.vendasAutomationJob.createMany({ data });
        for (const item of data) {
          const lead = leads.find((candidate) => candidate.id === item.leadId);
          if (!lead) continue;
          const usesFallback = fallbackLeadIds.has(String(lead.id));
          const conversationId = await this.updateProspectionConversationStage({
            companyId: campaign.companyId,
            lead,
            campaign,
            stage: 'scheduled_send',
            scheduledAt: item.scheduledAt,
            draftMessage: usesFallback ? DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE : this.renderOutboundMessage(campaign, lead, runtimeUser),
            mismatchReason: usesFallback ? 'segment_mismatch_fallback' : null,
            queueTarget: 'prospeccao',
            routeTarget: 'prospeccao',
            active: true,
          }).catch((error) => {
            this.logger.warn(`Falha ao marcar envio agendado lead=${lead.id}: ${String(error?.message || error)}`);
            return null;
          });
          if (usesFallback) {
            this.publishSegmentMismatchFallbackEvent({
              companyId: campaign.companyId,
              campaignId: campaign.id,
              leadId: lead.id,
              conversationId,
            });
          }
        }
        await this.markCampaignStage(
          campaign.id,
          campaign.companyId,
          'aguardando',
          `${data.length} card(s) adicionados manualmente na fila automática.`,
          { type: 'manual_leads_queued' },
        );
        void this.runWorkerCycle().catch(() => null);
      } else if (draftOnlyCount) {
        await this.markCampaignStage(
          campaign.id,
          campaign.companyId,
          'aguardando',
          `${draftOnlyCount} card(s) prontos para primeiro contato.`,
          { type: 'manual_leads_ready_for_first_contact' },
        );
      }

      return {
        ok: true,
        campaignId: campaign.id,
        queuedCount: data.length,
        skippedCount: Math.max(0, requestedLeadIds.length - data.length - draftOnlyCount),
        reason: 'queued',
      };
    } catch (error: any) {
      this.logger.warn(`Falha ao enfileirar cards manuais na automação: ${String(error?.message || error)}`);
      return {
        ok: false,
        queuedCount: 0,
        skippedCount: Array.isArray(leadIds) ? leadIds.length : 0,
        reason: 'error',
        error: String(error?.message || error),
      };
    }
  }

  private async findNextDueJob(blockedCompanyIds?: Set<number>) {
    const blocked = Array.from(blockedCompanyIds || []);
    return this.prisma.vendasAutomationJob.findFirst({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: new Date() },
        campaign: { status: 'running' },
        ...(blocked.length ? { companyId: { notIn: blocked } } : {}),
      },
      include: { campaign: true, lead: true },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async findNextDueJobForCampaign(campaignId: string) {
    return this.prisma.vendasAutomationJob.findFirst({
      where: {
        campaignId,
        status: 'scheduled',
        scheduledAt: { lte: new Date() },
        campaign: { status: 'running' },
      },
      select: { id: true },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async prepareCampaignBuffersDuringCooldown() {
    const now = new Date();
    const campaigns = await this.prisma.vendasAutomationCampaign.findMany({
      where: { status: 'running' },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    });
    for (const campaign of campaigns) {
      if (!this.isInsideWorkingHours(now, campaign)) continue;
      const nextJob = await this.prisma.vendasAutomationJob.findFirst({
        where: {
          campaignId: campaign.id,
          status: 'scheduled',
          scheduledAt: { gt: now },
        },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      });
      if (!(nextJob?.scheduledAt instanceof Date)) continue;
      const pending = await this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: { in: [...BUFFER_JOB_STATUSES] as any } },
      });
      if (pending >= Number(campaign.desiredLeadBuffer || 60)) continue;
      this.logger.log(
        `[vendas-automation] cooldown active campaignId=${campaign.id} nextAllowedSendAt=${nextJob.scheduledAt.toISOString()} preparingBuffer=true`,
      );
      await this.scheduleJobsForCampaign(campaign.id).catch((error) => {
        this.logger.warn(`Preparo durante cooldown falhou campaign=${campaign.id}: ${String(error?.message || error)}`);
      });
    }
  }

  private async runWorkerCycle() {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      await this.archiveNoResponseJobs();
      await this.refillCampaignsIfNeeded();
      const blockedCompanies = new Set<number>();
      let skippedThisCycle = 0;
      let lastCampaignId: string | null = null;
      for (let index = 0; index < MAX_DUE_JOBS_PER_CYCLE; index += 1) {
        const job = await this.findNextDueJob(blockedCompanies);
        if (!job) {
          if (lastCampaignId) await this.logNoEligibleLeads(lastCampaignId, skippedThisCycle).catch(() => null);
          break;
        }
        lastCampaignId = String(job.campaignId || job.campaign?.id || '');
        const result = await this.processDueJob(job as any);
        if (result.outcome === 'skipped' || result.outcome === 'failed_no_credit') {
          skippedThisCycle += 1;
          const nextJob = await this.findNextDueJobForCampaign(result.campaignId);
          if (nextJob?.id) {
            this.logger.log(`[vendas-automation] continuing after skip: campaignId=${result.campaignId}, nextJobId=${nextJob.id}`);
          }
          if (result.shouldContinue) continue;
        }
        blockedCompanies.add(Number(job.companyId));
      }
      await this.prepareCampaignBuffersDuringCooldown();
    } finally {
      this.workerRunning = false;
    }
  }

  private async logNoEligibleLeads(campaignId: string, skippedThisCycle: number) {
    const [pending, needsReview, noWhatsapp] = await Promise.all([
      this.prisma.vendasAutomationJob.count({
        where: { campaignId, status: { in: [...BUFFER_JOB_STATUSES] as any } },
      }).catch(() => 0),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId, classification: { in: ['needs_review', 'manual_review_required'] as any } },
      }).catch(() => 0),
      this.prisma.vendasAutomationJob.count({
        where: { campaignId, classification: { in: ['no_whatsapp', 'invalid_whatsapp'] as any } },
      }).catch(() => 0),
    ]);
    this.logger.log(
      `[vendas-automation] no eligible leads campaignId=${campaignId} skippedThisCycle=${skippedThisCycle} pending=${pending} needsReview=${needsReview} noWhatsapp=${noWhatsapp}`,
    );
  }

  private async refillCampaignsIfNeeded() {
    const now = new Date();
    const campaigns = await this.prisma.vendasAutomationCampaign.findMany({
      where: { status: 'running' },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    });
    for (const campaign of campaigns) {
      if (!this.isInsideWorkingHours(now, campaign)) {
        const next = this.moveToWorkingWindow(now, campaign);
        await this.markCampaignStage(campaign.id, campaign.companyId, 'dormindo', this.formatSleepingUntilText(next), {
          type: 'outside_working_hours',
        }).catch((error) => {
          this.logger.warn(`Falha ao marcar campanha dormindo campaign=${campaign.id}: ${String(error?.message || error)}`);
        });
        continue;
      }
      const pending = await this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: { in: [...BUFFER_JOB_STATUSES] as any } },
      });
      if (pending >= Number(campaign.minLeadBuffer || 15)) continue;
      await this.scrapeImportAndSchedule(campaign.id, undefined, 'refill').catch((error) => {
        this.logger.warn(`Refill falhou campaign=${campaign.id}: ${String(error?.message || error)}`);
      });
    }
  }

  private async archiveNoResponseJobs() {
    const cutoff = new Date(Date.now() - NO_RESPONSE_ARCHIVE_MS);
    const jobs = await this.prisma.vendasAutomationJob.findMany({
      where: {
        status: 'sent',
        sentAt: { lte: cutoff },
      },
      include: { campaign: true, lead: true },
      take: 40,
    });
    for (const job of jobs) {
      await this.archiveNoResponseJob(job as any).catch((error) => {
        this.logger.warn(`Arquivamento sem resposta falhou job=${job.id}: ${String(error?.message || error)}`);
      });
    }
  }

  private async archiveNoResponseJob(job: any) {
    const now = new Date();
    this.logger.log(`[prospeccao] 24h sem resposta, movendo para excluidos conversation=${job.conversationId || '-'} job=${job.id}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'no_response_archived', archivedAt: now, classification: 'no_response' },
      });
      await tx.vendasLead.updateMany({
        where: { id: job.leadId, companyId: job.companyId, status: { not: 'encerrado' } },
        data: { status: 'encerrado', wasClosedBefore: true, closedAt: now, lastResult: 'Sem resposta em 24h' },
      });
      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: job.leadId,
          eventType: 'lead_closed',
          title: 'Lead arquivado sem resposta',
          description: 'Sem resposta em 24h. Prospecção fria encerrada sem nova insistência automática.',
          sourceType: 'vendas_prospeccao_bot',
          statusTo: 'encerrado',
          resultLabel: 'Sem resposta',
        },
      });
    });
    if (job.conversationId) {
      const conversation = await this.prisma.companyConversation.findFirst({
        where: { id: Number(job.conversationId), companyId: job.companyId },
      });
      const metadata = parseJsonObject(conversation?.metadata);
      const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
      const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
      await this.conversations.updateConversationState(job.companyId, Number(job.conversationId), {
        botActive: false,
        humanAssigned: false,
        flowResult: 'no_response_archived',
        metadata: {
          ...metadata,
          queueTarget: 'excluidos',
          routeTarget: 'excluidos',
          inboxManualQueueOverride: 'archived',
          inboxLocalDeleted: true,
          inboxLocalDeletedAt: now.toISOString(),
          inboxLocalDeletedReason: 'Sem resposta em 24h',
          vendasAgendaQueue: {
            ...queue,
            active: false,
            draftPending: false,
            botEligible: false,
            botEntryPending: false,
            queueTarget: 'excluidos',
            routeTarget: 'excluidos',
            manualQueueOverride: 'archived',
            syncedAt: now.toISOString(),
            deactivatedAt: now.toISOString(),
          },
          vendasProspeccao: this.buildProspectionState('expired_no_reply', {
            current: prospeccao,
            lead: job.lead,
            campaign: job.campaign,
            firstOutboundAt: job.sentAt || prospeccao.firstOutboundAt || null,
            replyDeadlineAt: this.addHoursIso(job.sentAt || prospeccao.firstOutboundAt || null, 24),
            mismatchReason: null,
          }),
        },
      });
    }
    this.publishAutomationEvent({
      companyId: job.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: job.conversationId || null,
      status: 'aguardando',
      text: 'Lead sem resposta arquivado.',
      type: 'lead_archived',
    });
  }

  private isInsideWorkingHours(date: Date, campaign: any) {
    if (!this.isBusinessDay(date)) return false;
    const start = this.parseTimeOnDate(date, campaign.workingHoursStart || '09:00');
    const end = this.parseTimeOnDate(date, campaign.workingHoursEnd || '17:30');
    return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
  }

  private startOfDay(date: Date) {
    return this.parseTimeOnDate(date, '00:00');
  }

  private startOfNextDay(date: Date) {
    const parts = getBusinessDateParts(date);
    return makeBusinessDate(parts.year, parts.month, parts.day + 1, 0, 0);
  }

  private countSuccessfulSendsToday(campaignId: string, companyId: number, now = new Date()) {
    return this.prisma.vendasAutomationJob.count({
      where: {
        campaignId,
        companyId,
        sentAt: { gte: this.startOfDay(now), lt: this.startOfNextDay(now) },
        status: { in: [...SUCCESSFUL_SEND_JOB_STATUSES] as any },
      },
    });
  }

  private async getLastSuccessfulSendAt(campaignId: string, companyId: number, currentJobId?: string | null) {
    const latestSent = await this.prisma.vendasAutomationJob.findFirst({
      where: {
        campaignId,
        companyId,
        ...(currentJobId ? { id: { not: currentJobId } } : {}),
        sentAt: { not: null },
        status: { in: [...SUCCESSFUL_SEND_JOB_STATUSES] as any },
      },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return latestSent?.sentAt instanceof Date ? latestSent.sentAt : null;
  }

  private async processDueJob(job: any): Promise<ProcessDueJobResult> {
    const now = new Date();
    const campaign = job.campaign;
    const lead = job.lead;
    const campaignId = String(campaign?.id || job.campaignId || '');
    const leadId = String(lead?.id || job.leadId || '');
    const jobId = String(job.id);

    const skippedResult = async (classification: string, errorMessage: string): Promise<ProcessDueJobResult> => {
      this.logger.log(
        `[vendas-automation] skip lead campaignId=${campaignId} jobId=${jobId} leadId=${leadId || '-'} reason=${classification} doesNotConsumeDailyLimit=true doesNotConsumeCooldown=true`,
      );
      await this.replenishCampaignAfterSkip(campaign, errorMessage);
      return { outcome: 'skipped', campaignId, leadId, jobId, classification, shouldContinue: true };
    };

    const deferredResult = (reason: string, nextAllowedSendAt?: Date | null): ProcessDueJobResult => ({
      outcome: 'blocked',
      campaignId,
      leadId,
      jobId,
      reason,
      nextAllowedSendAt,
      shouldContinue: false,
    });

    if (!(await this.isHBotActiveForCampaign(campaign))) {
      await this.markCampaignStage(campaign.id, campaign.companyId, 'pausado', 'HBot desligado. Ative o bot para enviar novos contatos.', {
        type: 'hbot_inactive',
      });
      return deferredResult('hbot_inactive', null);
    }

    if (!this.isInsideWorkingHours(now, campaign)) {
      const next = this.moveToWorkingWindow(now, campaign);
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { scheduledAt: next },
      });
      await this.markCampaignStage(
        campaign.id,
        campaign.companyId,
        'dormindo',
        this.formatSleepingUntilText(next),
        { type: 'next_send_scheduled' },
      );
      return deferredResult('outside_working_hours', next);
    }

    if (
      !lead ||
      ['contato', 'retorno', 'qualificado', 'encerrado'].includes(normalizeKey(lead.status)) ||
      lead.closedAt ||
      lead.wasClosedBefore ||
      Number(lead.attemptCount || 0) > 0 ||
      Number(lead.attemptCount || 0) >= Number(campaign.maxAttemptsPerLead || 1)
    ) {
      const errorMessage = 'Lead encerrado, bloqueado ou ja contatado.';
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'skipped', archivedAt: now, classification: 'first_contact_already_sent', errorMessage },
      });
      return skippedResult('first_contact_already_sent', errorMessage);
    }

    const contact = normalizeContact(lead.phoneNormalized || lead.phone);
    if (!contact) {
      const errorMessage = 'Lead sem telefone valido.';
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'skipped', archivedAt: now, classification: 'invalid_whatsapp', errorMessage },
      });
      await this.updateProspectionConversationStage({
        companyId: campaign.companyId,
        lead,
        campaign,
        jobId: job.id,
        stage: 'no_whatsapp',
        queueTarget: 'excluidos',
        routeTarget: 'excluidos',
        active: false,
      }).catch(() => null);
      return skippedResult('invalid_whatsapp', errorMessage);
    }

    const noWhatsappState = await this.shouldBlockAutomationForKnownNoWhatsapp(campaign.companyId, lead);
    if (noWhatsappState.blocked) {
      const errorMessage = 'Numero sem WhatsApp confirmado. Envio automatico bloqueado.';
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: {
          status: 'skipped',
          archivedAt: now,
          classification: 'no_whatsapp',
          errorMessage,
        },
      });
      await this.updateProspectionConversationStage({
        companyId: campaign.companyId,
        lead,
        campaign,
        jobId: job.id,
        stage: 'no_whatsapp',
        queueTarget: 'excluidos',
        routeTarget: 'excluidos',
        active: false,
      }).catch(() => null);
      this.logger.log(`[prospeccao] envio bloqueado: lead sem WhatsApp confirmado conversation=${noWhatsappState.conversationId || '-'} job=${job.id}`);
      this.publishAutomationEvent({
        companyId: campaign.companyId,
        campaignId: campaign.id,
        jobId: job.id,
        leadId: lead.id,
        conversationId: noWhatsappState.conversationId,
        status: 'aguardando',
        text: 'Contato sem WhatsApp confirmado. Envio automático bloqueado.',
        type: 'no_whatsapp_send_blocked',
      });
      return skippedResult('no_whatsapp', errorMessage);
    }

    const { metadata: prospectionMetadata, conversationId: prospectionConversationId } =
      await this.loadProspectionMetadataForLead(campaign.companyId, lead);
    const validationBlock = this.getProspectionValidationBlock(prospectionMetadata, lead);
    if (validationBlock) {
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: {
          status: 'skipped',
          archivedAt: now,
          classification: validationBlock.classification,
          errorMessage: validationBlock.errorMessage,
        },
      });
      if (validationBlock.classification === 'needs_review') {
        await this.updateProspectionConversationStage({
          companyId: campaign.companyId,
          lead,
          campaign,
          jobId: job.id,
          stage: 'needs_review',
          scheduledAt: job.scheduledAt || null,
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          active: true,
          botEligible: false,
          botEntryPending: false,
        }).catch(() => null);
      }
      this.publishAutomationEvent({
        companyId: campaign.companyId,
        campaignId: campaign.id,
        jobId: job.id,
        leadId: lead.id,
        conversationId: prospectionConversationId,
        status: 'aguardando',
        text: validationBlock.errorMessage,
        type: validationBlock.classification,
      });
      return skippedResult(validationBlock.classification, validationBlock.errorMessage);
    }

    if (await this.hasNegativeOrOptOut({ companyId: campaign.companyId, lead, currentJobId: job.id, metadata: prospectionMetadata })) {
      const errorMessage = 'Lead com negativa ou opt-out. Envio automatico bloqueado.';
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: {
          status: 'skipped',
          archivedAt: now,
          classification: 'negative_or_opt_out',
          errorMessage,
        },
      });
      const conversationId = await this.updateProspectionConversationStage({
        companyId: campaign.companyId,
        lead,
        campaign,
        jobId: job.id,
        stage: 'negative_reply',
        queueTarget: 'excluidos',
        routeTarget: 'excluidos',
        active: false,
        botEligible: false,
        botEntryPending: false,
      }).catch(() => null);
      this.publishAutomationEvent({
        companyId: campaign.companyId,
        campaignId: campaign.id,
        jobId: job.id,
        leadId: lead.id,
        conversationId,
        status: 'aguardando',
        text: 'Lead com negativa ou opt-out. Envio automático bloqueado.',
        type: 'negative_or_opt_out_send_blocked',
      });
      return skippedResult('negative_or_opt_out', errorMessage);
    }

    let bodyOverride: string | null = null;
    let mismatchReason: string | null = null;
    if (isSegmentMismatch(lead.segment, campaign.segment)) {
      const decision = await this.resolveSegmentMismatchFallbackDecision({
        companyId: campaign.companyId,
        campaign,
        lead,
        currentJobId: job.id,
      });
      if (decision.mode === 'block') {
        const blockReason = trimOrNull(decision.reason) || 'segment_mismatch_blocked';
        const classification = ['first_contact_already_sent', 'negative_or_opt_out', 'invalid_whatsapp'].includes(blockReason)
          ? blockReason
          : 'segment_mismatch_blocked';
        await this.markSegmentMismatchBeforeSend(job, campaign, lead, classification);
        return skippedResult(classification, 'Segmento divergente entre lead e campanha.');
      }
      if (decision.mode === 'draft_only') {
        const errorMessage = 'Segmento divergente; mensagem generica pronta para envio manual.';
        await this.prisma.vendasAutomationJob.update({
          where: { id: job.id },
          data: {
            status: 'skipped',
            archivedAt: now,
            classification: 'segment_mismatch_fallback_draft',
            errorMessage,
          },
        });
        const conversationId = await this.updateProspectionConversationStage({
          companyId: campaign.companyId,
          lead,
          campaign,
          jobId: job.id,
          stage: 'pending_send',
          draftMessage: decision.message || DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
          mismatchReason: 'segment_mismatch_fallback',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          active: true,
          botEligible: false,
          botEntryPending: false,
        });
        this.publishSegmentMismatchFallbackEvent({
          companyId: campaign.companyId,
          campaignId: campaign.id,
          jobId: job.id,
          leadId: lead.id,
          conversationId: conversationId || decision.conversationId || null,
        });
        return skippedResult('segment_mismatch_fallback_draft', errorMessage);
      }
      bodyOverride = decision.message || DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE;
      mismatchReason = 'segment_mismatch_fallback';
      const conversationId = await this.updateProspectionConversationStage({
        companyId: campaign.companyId,
        lead,
        campaign,
        jobId: job.id,
        stage: 'scheduled_send',
        scheduledAt: job.scheduledAt || null,
        draftMessage: bodyOverride,
        mismatchReason,
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        active: true,
      }).catch(() => decision.conversationId || null);
      if (String(job.classification || '') !== 'segment_mismatch_fallback') {
        this.publishSegmentMismatchFallbackEvent({
          companyId: campaign.companyId,
          campaignId: campaign.id,
          jobId: job.id,
          leadId: lead.id,
          conversationId,
        });
      }
    }

    if (!mismatchReason && await this.hasFirstOutboundContactAlready({ companyId: campaign.companyId, lead, currentJobId: job.id })) {
      const errorMessage = 'Primeiro contato ja enviado para este lead.';
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'skipped', archivedAt: now, classification: 'first_contact_already_sent', errorMessage },
      });
      const conversationId = await this.updateProspectionConversationStage({
        companyId: campaign.companyId,
        lead,
        campaign,
        jobId: job.id,
        stage: 'needs_review',
        scheduledAt: job.scheduledAt || null,
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        active: true,
        botEligible: false,
        botEntryPending: false,
      }).catch(() => null);
      this.publishAutomationEvent({
        companyId: campaign.companyId,
        campaignId: campaign.id,
        jobId: job.id,
        leadId: lead.id,
        conversationId,
        status: 'aguardando',
        text: 'Primeiro contato já enviado. Lead mantido para revisão.',
        type: 'first_contact_already_sent',
      });
      return skippedResult('first_contact_already_sent', errorMessage);
    }

    if (!mismatchReason) {
      if (this.shouldCreateDraftOnlyForSegmentMismatchFallback(prospectionMetadata, lead)) {
        const runtimeUser = await this.buildAutomationUser(campaign);
        const draftMessage = this.renderOutboundMessage(campaign, lead, runtimeUser, prospectionMetadata);
        const errorMessage = 'Lead sem permissao para envio automatico. Draft preparado para envio manual.';
        await this.prisma.vendasAutomationJob.update({
          where: { id: job.id },
          data: { status: 'skipped', archivedAt: now, classification: 'missing_opt_in_or_permission', errorMessage },
        });
        const nextConversationId = await this.updateProspectionConversationStage({
          companyId: campaign.companyId,
          lead,
          campaign,
          jobId: job.id,
          stage: 'pending_send',
          draftMessage,
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          active: true,
          botEligible: false,
          botEntryPending: false,
        }).catch(() => prospectionConversationId || null);
        this.publishAutomationEvent({
          companyId: campaign.companyId,
          campaignId: campaign.id,
          jobId: job.id,
          leadId: lead.id,
          conversationId: nextConversationId,
          status: 'aguardando',
          text: 'Lead sem permissão de envio automático. Draft mantido para revisão.',
          type: 'automatic_send_not_allowed',
        });
        return skippedResult('missing_opt_in_or_permission', errorMessage);
      }
    }

    const sentToday = await this.countSuccessfulSendsToday(campaign.id, campaign.companyId, now);
    if (sentToday >= Number(campaign.dailyLimit || DEFAULT_DAILY_LIMIT)) {
      this.logger.log(
        `[vendas-automation] daily limit reached campaignId=${campaign.id} sentToday=${sentToday} dailyLimit=${Number(campaign.dailyLimit || DEFAULT_DAILY_LIMIT)}`,
      );
      const nextDay = this.addBusinessCalendarDays(now, 1);
      const next = this.parseTimeOnDate(this.moveToBusinessDay(nextDay), campaign.workingHoursStart || '09:00');
      await this.prisma.vendasAutomationJob.update({ where: { id: job.id }, data: { scheduledAt: next } });
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', 'Limite diário atingido. Próximos envios amanhã.', {
        type: 'daily_limit_reached',
      });
      return deferredResult('daily_limit_reached', next);
    }

    const nextAllowedSendAt = await this.getNextAllowedSendAt(campaign, job.id);
    if (nextAllowedSendAt) {
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { scheduledAt: nextAllowedSendAt },
      });
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', this.formatNextScheduledText(nextAllowedSendAt), {
        type: 'send_cooldown_active',
      });
      this.logger.log(
        `[vendas-automation] cooldown active campaignId=${campaign.id} nextAllowedSendAt=${nextAllowedSendAt.toISOString()} preparingBuffer=true`,
      );
      await this.scheduleJobsForCampaign(campaign.id).catch((error) => {
        this.logger.warn(`Preparo durante cooldown falhou campaign=${campaign.id}: ${String(error?.message || error)}`);
      });
      return deferredResult('send_cooldown_active', nextAllowedSendAt);
    }

    await this.prisma.vendasAutomationJob.update({ where: { id: job.id }, data: { status: 'sending' } });
    await this.markCampaignStage(campaign.id, campaign.companyId, 'enviando', `Enviando para ${lead.name || contact}.`, {
      type: 'send_started',
    });
    const delayMs =
      (Number(campaign.typingSeconds || 0) + Math.floor(Math.random() * (Number(campaign.typingVarianceSeconds || 0) + 1))) * 1000;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const runtimeUser = await this.buildAutomationUser(campaign);
    const body = bodyOverride || this.renderOutboundMessage(campaign, lead, runtimeUser, prospectionMetadata);
    try {
      const queued = await this.conversations.queueOutboundForCompany(campaign.companyId, {
        to: contact,
        contactId: contact,
        body,
        messageType: 'text',
        sourceModule: 'vendas_prospeccao_bot',
        senderType: 'bot',
        variables: {
          botType: 'prospeccao',
          campaignId: campaign.id,
          jobId: job.id,
          leadId: lead.id,
          firstContact: true,
        },
        flowState: {
          botActive: true,
          humanAssigned: false,
          flowResult: null,
        },
      });
      const sentAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.vendasAutomationJob.update({
          where: { id: job.id },
          data: {
            status: 'sent',
            sentAt,
            conversationId: Number(queued.conversationId),
            errorMessage: null,
            ...(mismatchReason ? { classification: mismatchReason } : {}),
          },
        });
        await tx.vendasLead.update({
          where: { id: lead.id },
          data: {
            status: 'contato',
            lastContactAt: sentAt,
            attemptCount: { increment: 1 },
            lastResult: 'Primeiro contato automático',
          },
        });
        await tx.vendasLeadTimelineEvent.create({
          data: {
            leadId: lead.id,
            eventType: 'contact_made',
            title: 'Primeiro contato automático enviado',
            description: 'Mensagem inicial da prospecção automática enfileirada pelo backend.',
            sourceType: 'vendas_prospeccao_bot',
            statusTo: 'contato',
            resultLabel: 'Automação',
            createdByUserId: campaign.createdByUserId || null,
          },
        });
      });
      await this.attachAutomationMetadata({
        companyId: campaign.companyId,
        conversationId: Number(queued.conversationId),
        campaign,
        lead,
        jobId: job.id,
        sentAt,
        draftMessage: body,
        mismatchReason,
      });
      this.logger.log(`[prospeccao] outbound automatico enviado, mantendo em prospeccao conversation=${Number(queued.conversationId)} job=${job.id}`);
      const sentTodayAfter = sentToday + 1;
      const nextAllowedAfterSend = this.moveToWorkingWindow(new Date(sentAt.getTime() + this.getCampaignIntervalMs(campaign)), campaign);
      this.logger.log(
        `[vendas-automation] sent lead campaignId=${campaign.id} jobId=${job.id} leadId=${lead.id} sentToday=${sentTodayAfter} dailyLimit=${Number(campaign.dailyLimit || DEFAULT_DAILY_LIMIT)} nextAllowedSendAt=${nextAllowedAfterSend.toISOString()}`,
      );
      this.publishAutomationEvent({
        companyId: campaign.companyId,
        campaignId: campaign.id,
        jobId: job.id,
        leadId: lead.id,
        conversationId: Number(queued.conversationId),
        status: 'aguardando',
        text: 'Contato enviado. Aguardando resposta.',
        type: 'message_sent',
      });
      await this.scheduleJobsForCampaign(campaign.id).catch((error) => {
        this.logger.warn(`Falha ao repor fila apos envio campaign=${campaign.id}: ${String(error?.message || error)}`);
      });
      return { outcome: 'sent_success', campaignId, leadId, jobId, sentAt };
    } catch (error: any) {
      const errorMessage = String(error?.message || error);
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'failed', archivedAt: new Date(), errorMessage },
      });
      this.logger.warn(
        `[vendas-automation] provider failed campaignId=${campaignId} jobId=${jobId} leadId=${leadId || '-'} doesNotConsumeDailyLimit=true doesNotConsumeCooldown=true error=${errorMessage}`,
      );
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', 'Falha ao enviar contato. Continuando fila.', {
        error: errorMessage,
        type: 'send_failed',
      });
      await this.replenishCampaignAfterSkip(campaign, 'Falha ao enviar contato. Continuando fila.');
      return { outcome: 'failed_no_credit', campaignId, leadId, jobId, errorMessage, shouldContinue: true };
    }
  }

  private async attachAutomationMetadata(input: {
    companyId: number;
    conversationId: number;
    campaign: any;
    lead: any;
    jobId: string;
    sentAt: Date;
    draftMessage: string;
    mismatchReason?: string | null;
  }) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: input.conversationId, companyId: input.companyId },
    });
    const metadata = parseJsonObject(conversation?.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    const syncedAt = new Date().toISOString();
    const sentAtIso = input.sentAt.toISOString();
    await this.conversations.updateConversationState(input.companyId, input.conversationId, {
      metadata: {
        ...metadata,
        sourceModule: 'vendas',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        vendasAutomation: {
          campaignId: input.campaign.id,
          jobId: input.jobId,
          leadId: input.lead.id,
          status: 'sent',
          sentAt: sentAtIso,
          mismatchReason: input.mismatchReason || null,
        },
        vendasAgendaQueue: {
          ...queue,
          active: true,
          leadId: input.lead.id,
          sourceModule: 'vendas',
          sourceBlock: 'today',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          status: 'contato',
          nextAction: 'Aguardar resposta',
          returnAt: null,
          draftMessage: input.draftMessage,
          draftPending: false,
          manualSent: true,
          manualSentAt: sentAtIso,
          lastManualSendAt: sentAtIso,
          botEligible: true,
          botEntryPending: true,
          mismatchReason: input.mismatchReason || null,
          syncedAt,
        },
        vendasProspeccao: this.buildProspectionState('sent_waiting', {
          current: prospeccao,
          lead: input.lead,
          campaign: input.campaign,
          firstOutboundAt: input.sentAt,
          replyDeadlineAt: this.addHoursIso(input.sentAt, 24),
          mismatchReason: input.mismatchReason || null,
        }),
      },
      lastInteractionAt: input.sentAt,
    });
  }

  async classifyProspectingInbound(input: {
    companyId: number;
    conversationId: number;
    messageId: number;
    from: string;
    text: string;
    timestamp: Date;
    metadata: Record<string, any>;
    setInboundMeta: (sourceModule: string, isComplaint: boolean) => Promise<void>;
  }) {
    const automation = parseJsonObject(input.metadata?.vendasAutomation);
    const queue = parseJsonObject(input.metadata?.vendasAgendaQueue);
    const jobId = trimOrNull(automation.jobId) || trimOrNull((queue as any).automationJobId);
    let job = jobId
      ? await this.prisma.vendasAutomationJob.findFirst({
          where: { id: jobId, companyId: input.companyId, status: 'sent' },
          include: { campaign: true, lead: true },
        })
      : null;
    if (!job) {
      const phoneDigits = normalizePhoneDigits(input.from);
      const candidates = phoneDigits ? buildWhatsAppPhoneCandidates(phoneDigits).map((value) => normalizePhoneDigits(value)).filter(Boolean) : [];
      job = await this.prisma.vendasAutomationJob.findFirst({
        where: {
          companyId: input.companyId,
          status: 'sent',
          OR: [
            { conversationId: input.conversationId },
            ...(candidates.length ? [{ lead: { phoneNormalized: { in: candidates as string[] } } }] : []),
          ],
        },
        include: { campaign: true, lead: true },
        orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      });
    }
    if (!job?.campaign || !job?.lead) return null;
    if (String(job.status || '') !== 'sent') return null;
    const automationStatus = normalizeKey((automation as any).status);
    const queueStatus = normalizeKey((queue as any).status);
    const normalized = normalizeKey(input.text);
    const positives = parseJsonList(job.campaign.positiveIntentKeywordsJson, DEFAULT_POSITIVE_KEYWORDS).map(normalizeKey);
    const negatives = parseJsonList(job.campaign.negativeIntentKeywordsJson, DEFAULT_NEGATIVE_KEYWORDS).map(normalizeKey);
    const optOut = containsNormalizedKeyword(normalized, OPT_OUT_INTENT_KEYWORDS);
    const humanHandoff = containsNormalizedKeyword(normalized, HUMAN_HANDOFF_INTENT_KEYWORDS);
    const negative = optOut || containsNormalizedKeyword(normalized, negatives);
    const positive = !negative && !humanHandoff && containsNormalizedKeyword(normalized, positives);
    const terminalStatus = ['negative', 'opt_out', 'replied_negative', 'no_response_archived'];
    const alreadyClosed =
      terminalStatus.includes(automationStatus) ||
      terminalStatus.includes(queueStatus) ||
      input.metadata?.blacklist === true ||
      input.metadata?.blacklisted === true ||
      input.metadata?.optOut === true ||
      (queue as any).blacklist === true ||
      (queue as any).blacklisted === true ||
      (queue as any).optOut === true ||
      (queue as any).doNotContact === true ||
      String(job.lead.status || '') === 'encerrado' ||
      job.lead.closedAt ||
      job.lead.wasClosedBefore;
    if (alreadyClosed) return null;

    if (negative) {
      await input.setInboundMeta(optOut ? 'vendas_prospeccao_opt_out' : 'vendas_prospeccao_negativo', false);
      await this.markNegative({ ...input, job, optOut });
      return { handled: true, classification: optOut ? 'opt_out' : 'negative' };
    }

    const blockedStatus = ['interested', 'neutral', 'human_assigned'];
    const isBlocked =
      blockedStatus.includes(automationStatus) ||
      blockedStatus.includes(queueStatus) ||
      input.metadata?.humanAssigned === true ||
      (queue as any).humanAssigned === true;
    if (isBlocked) return null;

    if (positive) {
      await input.setInboundMeta('vendas_prospeccao_interessado', false);
      await this.markInterested({ ...input, job });
      return { handled: true, classification: 'positive' };
    }

    if (humanHandoff) {
      await input.setInboundMeta('vendas_prospeccao_humano', false);
      await this.markNeutral({ ...input, job, humanRequested: true });
      return { handled: true, classification: 'human_requested' };
    }

    await input.setInboundMeta('vendas_prospeccao_neutro', false);
    await this.markNeutral({ ...input, job });
    return { handled: true, classification: 'neutral' };
  }

  private async markInterested(input: any) {
    const now = new Date();
    const job = input.job;
    await this.prisma.$transaction(async (tx) => {
      await tx.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'replied_positive', repliedAt: now, classification: 'positive', conversationId: input.conversationId },
      });
      await tx.vendasAutomationJob.updateMany({
        where: { companyId: input.companyId, leadId: job.leadId, id: { not: job.id }, status: { in: ['pending', 'scheduled'] } },
        data: { status: 'canceled', archivedAt: now, errorMessage: 'Lead respondeu com interesse.' },
      });
      await tx.vendasLead.update({
        where: { id: job.leadId },
        data: { status: 'qualificado', lastResult: 'Interessado', returnAt: now },
      });
      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: job.leadId,
          eventType: 'result_recorded',
          title: 'Interessado encontrado',
          description: 'Resposta positiva detectada pela prospecção automática.',
          sourceType: 'vendas_prospeccao_bot',
          statusTo: 'qualificado',
          resultLabel: 'Interessado',
        },
      });
    });
    const metadata = parseJsonObject(input.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    await this.conversations.updateConversationState(input.companyId, input.conversationId, {
      botActive: false,
      humanAssigned: true,
      flowResult: 'prospection_interested',
      metadata: {
        ...metadata,
        queueTarget: 'atendimento',
        routeTarget: 'atendimento',
        vendasAutomation: {
          ...parseJsonObject((metadata as any).vendasAutomation),
          campaignId: job.campaignId,
          jobId: job.id,
          leadId: job.leadId,
          status: 'interested',
          interestedAt: now.toISOString(),
        },
        vendasAgendaQueue: {
          ...queue,
          active: true,
          leadId: job.leadId,
          queueTarget: 'atendimento',
          routeTarget: 'atendimento',
          status: 'qualificado',
          nextAction: 'Atendimento humano',
          draftPending: false,
          botEligible: false,
          botEntryPending: false,
          respondedAt: now.toISOString(),
          syncedAt: now.toISOString(),
          interested: true,
        },
        vendasProspeccao: this.buildProspectionState('reply_received', {
          current: prospeccao,
          lead: job.lead,
          campaign: job.campaign,
          lastInboundAt: input.timestamp || now,
          mismatchReason: null,
        }),
      },
    });
    this.publishAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: 'Interessado encontrado',
      type: 'lead_interested',
    });
    this.inboxRealtime.publish({
      companyId: input.companyId,
      kind: 'conversation',
      conversationId: input.conversationId,
      at: now.toISOString(),
    });
  }

  private async markNegative(input: any) {
    const now = new Date();
    const job = input.job;
    await this.prisma.$transaction(async (tx) => {
      await tx.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'replied_negative', repliedAt: now, archivedAt: now, classification: 'negative', conversationId: input.conversationId },
      });
      await tx.vendasAutomationJob.updateMany({
        where: { companyId: input.companyId, leadId: job.leadId, id: { not: job.id }, status: { in: ['pending', 'scheduled'] } },
        data: { status: 'canceled', archivedAt: now, errorMessage: 'Lead respondeu negativamente.' },
      });
      await tx.vendasLead.update({
        where: { id: job.leadId },
        data: {
          status: 'encerrado',
          wasClosedBefore: true,
          closedAt: now,
          lastResult: 'Resposta negativa',
        },
      });
      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: job.leadId,
          eventType: 'lead_closed',
          title: 'Resposta negativa',
          description: 'Lead recusou contato. Recontato automático bloqueado.',
          sourceType: 'vendas_prospeccao_bot',
          statusTo: 'encerrado',
          resultLabel: 'Negativo',
        },
      });
    });
    const campaignFilters = parseJsonObject(job.campaign.filtersJson);
    const shouldReplyOptOut = campaignFilters.optOutReplyEnabled === true;
    const optOutMessage = String(job.campaign.optOutMessage || DEFAULT_OPT_OUT_MESSAGE).trim();
    if (shouldReplyOptOut && optOutMessage) {
      try {
        await this.conversations.queueOutboundForCompany(input.companyId, {
          conversationId: input.conversationId,
          to: input.from,
          contactId: input.from,
          body: optOutMessage,
          messageType: 'text',
          sourceModule: 'vendas_prospeccao_bot',
          senderType: 'bot',
          variables: {
            botType: 'prospeccao',
            campaignId: job.campaignId,
            jobId: job.id,
            leadId: job.leadId,
            optOut: true,
          },
          flowState: { botActive: false, humanAssigned: false, flowResult: 'prospection_negative' },
        });
      } catch (error: any) {
        this.logger.warn(`Falha ao enviar opt-out da prospeccao job=${job.id}: ${String(error?.message || error)}`);
      }
    }
    const metadata = parseJsonObject(input.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    await this.conversations.updateConversationState(input.companyId, input.conversationId, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'prospection_negative',
      metadata: {
        ...metadata,
        queueTarget: 'excluidos',
        routeTarget: 'excluidos',
        inboxManualQueueOverride: 'archived',
        inboxLocalDeleted: true,
        inboxLocalDeletedAt: now.toISOString(),
        optOut: true,
        doNotContact: true,
        blacklisted: true,
        vendasAutomation: {
          ...parseJsonObject((metadata as any).vendasAutomation),
          campaignId: job.campaignId,
          jobId: job.id,
          leadId: job.leadId,
          status: input.optOut ? 'opt_out' : 'negative',
          optOut: true,
          doNotContact: true,
          blacklisted: true,
          negativeAt: now.toISOString(),
        },
        vendasAgendaQueue: {
          ...queue,
          active: false,
          leadId: job.leadId,
          queueTarget: 'excluidos',
          routeTarget: 'excluidos',
          status: 'encerrado',
          draftPending: false,
          botEligible: false,
          botEntryPending: false,
          optOut: true,
          doNotContact: true,
          blacklisted: true,
          manualQueueOverride: 'archived',
          syncedAt: now.toISOString(),
          deactivatedAt: now.toISOString(),
        },
        vendasProspeccao: this.buildProspectionState('negative_reply', {
          current: prospeccao,
          lead: job.lead,
          campaign: job.campaign,
          lastInboundAt: input.timestamp || now,
          mismatchReason: null,
        }),
      },
    });
    this.publishAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: 'Lead arquivado por resposta negativa.',
      type: 'lead_archived',
    });
  }

  private async markNeutral(input: any) {
    const now = new Date();
    const job = input.job;
    await this.prisma.vendasAutomationJob.update({
      where: { id: job.id },
      data: { classification: 'neutral', repliedAt: now, conversationId: input.conversationId },
    });
    const metadata = parseJsonObject(input.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    await this.conversations.updateConversationState(input.companyId, input.conversationId, {
      botActive: false,
      humanAssigned: true,
      flowResult: 'prospection_neutral',
      metadata: {
        ...metadata,
        queueTarget: 'atendimento',
        routeTarget: 'atendimento',
        vendasAutomation: {
          ...parseJsonObject((metadata as any).vendasAutomation),
          campaignId: job.campaignId,
          jobId: job.id,
          leadId: job.leadId,
          status: input.humanRequested ? 'human_assigned' : 'neutral',
          humanAssigned: true,
          neutralAt: now.toISOString(),
        },
        vendasAgendaQueue: {
          ...queue,
          active: true,
          leadId: job.leadId,
          queueTarget: 'atendimento',
          routeTarget: 'atendimento',
          nextAction: 'Atendimento humano',
          draftPending: false,
          botEligible: false,
          botEntryPending: false,
          humanAssigned: true,
          respondedAt: now.toISOString(),
          syncedAt: now.toISOString(),
        },
        vendasProspeccao: this.buildProspectionState('reply_received', {
          current: prospeccao,
          lead: job.lead,
          campaign: job.campaign,
          lastInboundAt: input.timestamp || now,
          mismatchReason: null,
        }),
      },
    });
    this.publishAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: 'Resposta recebida. Enviado para Atendimento.',
      type: 'lead_neutral',
    });
  }
}
