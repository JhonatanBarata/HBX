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
import { WebscrapingService, type WebscrapingContactResult, type WebscrapingSearchResponse } from '../webscraping/webscraping.service';
import { StartVendasProspectingDto, UpdateVendasProspectingConfigDto } from './dto/vendas.dto';
import {
  SAFE_FIRST_CONTACT_TEMPLATE,
  SAFE_FIRST_CONTACT_VARIANTS,
  classifyProspectingAutoReply,
  classifyProspectingIntent,
  normalizeFirstContactForComparison,
  sanitizeFirstContactMessage,
  type ProspectingAutoReplyClassification,
} from './prospecting-safety';
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
  intervalVarianceMinutes: number;
  typingSeconds: number;
  typingVarianceSeconds: number;
  positiveIntentKeywords: string[];
  negativeIntentKeywords: string[];
  whatIsItIntentKeywords: string[];
  neutralIntentKeywords: string[];
  scheduledReplyVariants: string[];
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
const DEFAULT_NEGATIVE_KEYWORDS = ['não tenho interesse', 'não quero', 'remover', 'pare', 'não me chame', 'spam', 'bloqueia', 'não autorizei'];
const OPT_OUT_INTENT_KEYWORDS = ['remover', 'pare', 'spam', 'nao me chame', 'não me chame', 'bloqueia', 'bloqueie'];
const HUMAN_HANDOFF_INTENT_KEYWORDS = ['humano', 'atendente', 'ligar', 'me chama'];
const WHAT_IS_IT_INTENT_KEYWORDS = ['o que é', 'oque é', 'sobre o que', 'como funciona', 'me explica', 'explica melhor', 'do que se trata'];
const DEFAULT_NEUTRAL_KEYWORDS = ['vou ver', 'mais tarde', 'depois', 'manda depois', 'me chama depois', 'entendi', 'ok'];
const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_INTERVAL_VARIANCE_MINUTES = 30;
const DEFAULT_BOT_REPLY_INTERVAL_REDUCTION_PERCENT = 0;
const DEFAULT_DAILY_LIMIT = 10;
const ABSOLUTE_DAILY_SEND_CAP = 80;
const MAX_DUE_JOBS_PER_CYCLE = 50;
const DEFAULT_OPT_OUT_MESSAGE = 'Entendi. Vou arquivar este contato e nao chamaremos novamente.';
const LEGACY_DEFAULT_MESSAGE_TEMPLATE =
  'Oi, tudo bem? Aqui é {{funcionario}} da {{empresa}}. Vi a {{cliente}} em {{cidade}} e queria te explicar em 1 minuto uma solução para {{segmento}}. Faz sentido eu te mandar?';
const LEGACY_SEGMENT_MISMATCH_FALLBACK_MESSAGE =
  'Oi, tudo bem? Sou o Jhonatan, da HBX. Vi sua empresa no Google e queria te mostrar uma ferramenta que ajuda a organizar contatos, orçamentos e retornos pelo WhatsApp. Tenho 7 dias grátis, sem compromisso. Faz sentido eu te mostrar?';
const LEGACY_GENERICA_CASO_ERRO_MESSAGE =
  'Oi, tudo bem? Meu nome é Jhonatan, eu trabalho com empresas organizadoras de vendas, orçamentos, prospectar clientes e retornos pelo WhatsApp.\n' +
  'Tem interesse em conhecer? Eu tenho 7 dias grátis no plano, totalmente sem compromisso.\n' +
  '';
const GENERICA_CASO_ERRO_MESSAGE =
  'Oi, tudo bem? Meu nome é Jhonatan, trabalho com uma plataforma para organizar vendas, orçamentos, prospecção de clientes e retornos pelo WhatsApp.\n' +
  'Tenho 7 dias grátis, sem compromisso. Faz sentido eu te mostrar?\n' +
  '';
const DEFAULT_MESSAGE_TEMPLATE = SAFE_FIRST_CONTACT_TEMPLATE;
const DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE = SAFE_FIRST_CONTACT_TEMPLATE;
const DEFAULT_FIRST_CONTACT_VARIANTS = [
  '{{cumprimentacao}}, tudo bem? Me chamo Jhonatan. Trabalho ajudando empresas a melhorar processos e automatizar tarefas repetitivas do dia a dia. Posso te explicar rapidinho e ver se faz sentido aí?',
  '{{cumprimentacao}}, tudo certo? Aqui é o Jhonatan. Eu ajudo empresas a organizar melhor a rotina, reduzir retrabalho e implantar soluções simples para ganhar tempo na operação. Posso te mandar uma ideia rápida?',
  '{{cumprimentacao}}! Sou o Jhonatan. Trabalho com consultoria e implantação de automações para empresas que querem parar de perder tempo com processos manuais, controles soltos e tarefas repetidas. Faz sentido eu te explicar em 1 minuto?',
  '{{cumprimentacao}}, tudo bem? Me chamo Jhonatan. Eu olho a rotina da empresa, entendo onde está dando retrabalho e ajudo a implantar soluções práticas para deixar o dia a dia mais organizado. Posso te explicar rapidinho?',
  '{{cumprimentacao}}, tudo bem? Trabalho com melhoria de processos para empresas: atendimento, vendas, administrativo, retornos, controles internos e automações conforme a necessidade. Posso te mostrar por alto como funciona?',
];
const DEFAULT_POSITIVE_REPLY_VARIANTS = [
  'Boa! A ideia é entender como funciona a rotina de vocês hoje, onde tem retrabalho, tarefa manual ou informação perdida, e ver se dá para resolver com uma automação ou ajuste simples no processo. Posso te ligar rapidinho?',
  'Perfeito. Primeiro eu entendo o cenário da empresa, porque cada operação tem um gargalo diferente. Pode ser atendimento, vendas, financeiro, planilhas, retornos, cadastros, tarefas internas… aí vejo o que faria sentido implantar. Posso te chamar numa ligação rápida?',
  'Show. Meu trabalho não é empurrar uma ferramenta pronta. Eu entendo o processo, vejo onde a empresa está perdendo tempo e monto uma solução em cima da necessidade real. Posso te ligar 2 minutinhos para entender melhor?',
  'Legal. Normalmente eu converso com o gestor ou responsável pela operação, faço algumas perguntas sobre a rotina e identifico onde uma melhoria simples já poderia economizar tempo. Pode ser uma ligação rápida?',
  'Boa. A ideia é bem prática: entender o que hoje é manual, repetitivo ou bagunçado, e ver se vale implantar alguma automação, organização ou sistema simples para facilitar. Posso te ligar rapidinho?',
];
const DEFAULT_WHAT_IS_IT_REPLY_VARIANTS = [
  'Claro. É sobre consultoria e implantação de melhorias na rotina da empresa. Eu analiso processos manuais, retrabalho, controles espalhados e tarefas repetitivas, e vejo o que pode ser organizado ou automatizado.',
  'É um trabalho para ajudar empresas a ganhar tempo e reduzir bagunça operacional. Eu entendo como a empresa funciona hoje e proponho soluções práticas: automações, sistemas simples, organização de fluxo ou ajustes no processo.',
  'Basicamente eu ajudo a empresa a parar de depender tanto de planilha solta, memória, mensagem perdida e tarefa manual. Primeiro eu entendo o problema, depois implanto o que fizer sentido para aquela operação.',
  'É uma consultoria bem prática. Eu olho áreas como atendimento, vendas, administrativo, retornos, cadastros, controles e tarefas repetitivas, e vejo onde dá para simplificar ou automatizar.',
  'É sobre melhorar a operação da empresa. Não é uma solução única para todo mundo: eu entendo o gargalo, desenho uma forma mais organizada de trabalhar e implanto algo que ajude no dia a dia.',
];
const DEFAULT_SCHEDULED_REPLY_VARIANTS = [
  'Perfeito, {{retorno_label}} eu te chamo por aqui ou te ligo rapidinho.',
  'Combinado, {{retorno_label}} eu retorno com você.',
  'Fechado, deixei anotado para {{retorno_label}}.',
];
const DEFAULT_PRE_MESSAGE_VARIANTS = [
  '{{cumprimentacao}}, tudo bem?',
];
const DEFAULT_OPT_OUT_VARIANTS = [
  DEFAULT_OPT_OUT_MESSAGE,
  'Tudo bem. Vou remover este contato da prospecção.',
  'Entendido. Não vamos chamar novamente por aqui.',
  'Certo, vou arquivar e bloquear novos contatos automáticos.',
  'Sem problema. Seu contato fica removido da nossa prospecção.',
];
const DEFAULT_NEUTRAL_HANDOFF_VARIANTS = [
  'Vou passar para uma pessoa do atendimento continuar com você.',
  'Vou deixar isso com o atendimento humano para responder melhor.',
  'Certo. Um humano continua daqui para frente.',
  'Vou encaminhar para o time humano verificar.',
  'Obrigado pelo retorno. Vou deixar o atendimento humano seguir.',
];
const FIRST_CONTACT_REPEAT_LIMIT = 3;
const REAL_NEGATIVE_PAUSE_LIMIT = 3;
const AUTO_REPLY_STREAK_PAUSE_LIMIT = 5;
const EMPTY_REFILL_RETRY_MS = 10 * 60 * 1000;
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
const COMPANY_LEGAL_SUFFIXES = new Set(['ltda', 'me', 'mei', 'eireli', 'epp', 'sa', 's/a', 'ss']);
const COMPANY_LEADING_GENERIC = new Set(['empresa', 'empresas', 'companhia', 'cia']);
const COMPANY_DESCRIPTOR_AFTER_GENERIC = new Set([
  'maquina',
  'maquinas',
  'equipamento',
  'equipamentos',
  'comercio',
  'comercial',
  'servico',
  'servicos',
  'industria',
]);
const COMPANY_CONNECTORS = new Set(['e', 'de', 'da', 'do', 'das', 'dos']);

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

function normalizeTemplateText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isStaleProspectingRadarConfigText(value: unknown) {
  const normalized = normalizeKey(value);
  if (!normalized) return false;
  return (
    normalized.includes('campanha sem') &&
    (normalized.includes('cidade') || normalized.includes('segmento')) &&
    normalized.includes('revise a configuracao da prospeccao')
  );
}

function computeBrasiliaGreeting() {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: BUSINESS_TIME_ZONE,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  if (hour >= 18 || hour < 3) return 'Boa noite';
  if (hour >= 12) return 'Boa tarde';
  return 'Bom dia';
}

function normalizeCompanyToken(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:()[\]{}]/g, '')
    .trim()
    .toLowerCase();
}

function smartCompanyTitle(value: string) {
  const compact = normalizeTemplateText(value);
  if (!compact) return '';
  const shouldTitle = compact === compact.toUpperCase() || compact === compact.toLowerCase();
  if (!shouldTitle) return compact;
  return compact
    .split(' ')
    .map((word, index) => {
      const normalized = normalizeCompanyToken(word);
      if (index > 0 && COMPANY_CONNECTORS.has(normalized)) return normalized;
      return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR');
    })
    .join(' ');
}

function summarizeCompanyName(value: string) {
  const words = String(value || '')
    .replace(/[|/\\_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  while (words.length && COMPANY_LEGAL_SUFFIXES.has(normalizeCompanyToken(words[words.length - 1]))) {
    words.pop();
  }

  const selected: string[] = [];
  let removedGenericPrefix = false;
  for (const word of words) {
    const normalized = normalizeCompanyToken(word);
    if (!selected.length && (COMPANY_LEADING_GENERIC.has(normalized) || COMPANY_CONNECTORS.has(normalized))) {
      removedGenericPrefix = true;
      continue;
    }
    if (!selected.length && removedGenericPrefix && COMPANY_DESCRIPTOR_AFTER_GENERIC.has(normalized)) {
      continue;
    }
    selected.push(word);
  }

  while (selected.length && COMPANY_CONNECTORS.has(normalizeCompanyToken(selected[0]))) selected.shift();
  while (selected.length && COMPANY_CONNECTORS.has(normalizeCompanyToken(selected[selected.length - 1]))) selected.pop();

  const compact = selected.slice(0, 4).join(' ') || words.slice(0, 3).join(' ');
  return smartCompanyTitle(compact);
}

function isSystemGeneratedProspectingTemplate(value: unknown) {
  const normalized = normalizeTemplateText(value);
  if (!normalized) return true;
  return [
    LEGACY_DEFAULT_MESSAGE_TEMPLATE,
    LEGACY_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
    LEGACY_GENERICA_CASO_ERRO_MESSAGE,
    GENERICA_CASO_ERRO_MESSAGE,
    SAFE_FIRST_CONTACT_TEMPLATE,
    ...SAFE_FIRST_CONTACT_VARIANTS,
  ].some((template) => normalizeTemplateText(template) === normalized);
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

function normalizeVariantList(value: unknown, fallback: string[] = []) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n/)
      : fallback;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of source) {
    const normalized = sanitizeFirstContactMessage(String(item || '').trim());
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result.slice(0, 20);
}

function pickRandomItem<T>(items: T[]) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
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
      nextContactDelayMinutes: clampInteger(metadata.nextContactDelayMinutes, DEFAULT_INTERVAL_MINUTES, 1, 180),
      intervalVarianceMinutes: clampInteger(metadata.intervalVarianceMinutes, DEFAULT_INTERVAL_VARIANCE_MINUTES, 0, 180),
      typingSeconds: clampInteger(metadata.typingSeconds, 8, 0, 45),
      typingVarianceSeconds: clampInteger(metadata.typingVarianceSeconds, 12, 0, 30),
      positiveIntentKeywords: normalizeTextList(metadata.positiveIntentKeywords, DEFAULT_POSITIVE_KEYWORDS),
      negativeIntentKeywords: normalizeTextList(
        metadata.negativeIntentKeywords || metadata.stopIntentKeywords,
        DEFAULT_NEGATIVE_KEYWORDS,
      ),
      whatIsItIntentKeywords: normalizeTextList(metadata.whatIsItIntentKeywords, WHAT_IS_IT_INTENT_KEYWORDS),
      neutralIntentKeywords: normalizeTextList(metadata.neutralIntentKeywords, DEFAULT_NEUTRAL_KEYWORDS),
      scheduledReplyVariants: normalizeVariantList(metadata.scheduledReplyVariants, DEFAULT_SCHEDULED_REPLY_VARIANTS),
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
    const intervalVarianceMinutes = clampInteger(
      payload?.intervalVarianceMinutes ?? filters.intervalVarianceMinutes,
      clampInteger((parseJsonObject(existing?.filtersJson) as any).intervalVarianceMinutes, scene.intervalVarianceMinutes, 0, 180),
      0,
      180,
    );
    const nextFilters = {
      ...filters,
      optOutReplyEnabled,
      intervalVarianceMinutes,
      preMessageEnabled:
        payload?.preMessageEnabled === undefined
          ? Boolean(filters.preMessageEnabled ?? false)
          : payload.preMessageEnabled === true,
      preMessageVariants: normalizeVariantList(
        hasOwnValue(payload, 'preMessageVariants') ? (payload as any)?.preMessageVariants : filters.preMessageVariants,
        normalizeVariantList((parseJsonObject(existing?.filtersJson) as any).preMessageVariants, DEFAULT_PRE_MESSAGE_VARIANTS),
      ),
      botReplyIntervalReductionPercent: clampInteger(
        (payload as any)?.botReplyIntervalReductionPercent ?? filters.botReplyIntervalReductionPercent,
        clampInteger(
          (parseJsonObject(existing?.filtersJson) as any).botReplyIntervalReductionPercent,
          DEFAULT_BOT_REPLY_INTERVAL_REDUCTION_PERCENT,
          0,
          100,
        ),
        0,
        100,
      ),
      firstContactVariants: normalizeVariantList(
        hasOwnValue(payload, 'firstContactVariants') ? payload?.firstContactVariants : filters.firstContactVariants,
        normalizeVariantList((parseJsonObject(existing?.filtersJson) as any).firstContactVariants, DEFAULT_FIRST_CONTACT_VARIANTS),
      ),
      positiveReplyVariants: normalizeVariantList(
        hasOwnValue(payload, 'positiveReplyVariants') ? payload?.positiveReplyVariants : filters.positiveReplyVariants,
        normalizeVariantList((parseJsonObject(existing?.filtersJson) as any).positiveReplyVariants, DEFAULT_POSITIVE_REPLY_VARIANTS),
      ),
      whatIsItReplyVariants: normalizeVariantList(
        hasOwnValue(payload, 'whatIsItReplyVariants') ? payload?.whatIsItReplyVariants : filters.whatIsItReplyVariants,
        normalizeVariantList((parseJsonObject(existing?.filtersJson) as any).whatIsItReplyVariants, DEFAULT_WHAT_IS_IT_REPLY_VARIANTS),
      ),
      scheduledReplyVariants: normalizeVariantList(
        hasOwnValue(payload, 'scheduledReplyVariants') ? (payload as any)?.scheduledReplyVariants : filters.scheduledReplyVariants,
        normalizeVariantList((parseJsonObject(existing?.filtersJson) as any).scheduledReplyVariants, scene.scheduledReplyVariants),
      ),
      optOutVariants: normalizeVariantList(
        hasOwnValue(payload, 'optOutVariants') ? payload?.optOutVariants : filters.optOutVariants,
        normalizeVariantList((parseJsonObject(existing?.filtersJson) as any).optOutVariants, DEFAULT_OPT_OUT_VARIANTS),
      ),
      neutralHandoffVariants: normalizeVariantList(
        hasOwnValue(payload, 'neutralHandoffVariants') ? payload?.neutralHandoffVariants : filters.neutralHandoffVariants,
        normalizeVariantList((parseJsonObject(existing?.filtersJson) as any).neutralHandoffVariants, DEFAULT_NEUTRAL_HANDOFF_VARIANTS),
      ),
      whatIsItIntentKeywords: normalizeTextList(
        hasOwnValue(payload, 'whatIsItIntentKeywords') ? (payload as any)?.whatIsItIntentKeywords : filters.whatIsItIntentKeywords,
        normalizeTextList((parseJsonObject(existing?.filtersJson) as any).whatIsItIntentKeywords, scene.whatIsItIntentKeywords),
      ),
      neutralIntentKeywords: normalizeTextList(
        hasOwnValue(payload, 'neutralIntentKeywords') ? (payload as any)?.neutralIntentKeywords : filters.neutralIntentKeywords,
        normalizeTextList((parseJsonObject(existing?.filtersJson) as any).neutralIntentKeywords, scene.neutralIntentKeywords),
      ),
    };
    const minLeadBuffer = clampInteger(payload?.minLeadBuffer, existing?.minLeadBuffer ?? DEFAULT_DAILY_LIMIT, 1, 500);
    const desiredLeadBuffer = Math.max(
      minLeadBuffer,
      clampInteger(payload?.desiredLeadBuffer, existing?.desiredLeadBuffer ?? DEFAULT_DAILY_LIMIT, 1, 500),
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
      messageTemplate: this.resolveCampaignMessageTemplate(payload, existing),
      intervalMinutes: clampInteger(
        payload?.intervalMinutes,
        existing?.intervalMinutes ?? scene.nextContactDelayMinutes,
        1,
        180,
      ),
      dailyLimit: clampInteger(payload?.dailyLimit, existing?.dailyLimit ?? DEFAULT_DAILY_LIMIT, 1, ABSOLUTE_DAILY_SEND_CAP),
      minLeadBuffer,
      desiredLeadBuffer,
      maxAttemptsPerLead: clampInteger(payload?.maxAttemptsPerLead, existing?.maxAttemptsPerLead ?? 1, 1, 3),
      workingHoursStart: this.normalizeTime(payload?.workingHoursStart || existing?.workingHoursStart, '08:00'),
      workingHoursEnd: this.normalizeTime(payload?.workingHoursEnd || existing?.workingHoursEnd, '18:00'),
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

  private resolveCampaignMessageTemplate(payload: any, existing?: any) {
    const payloadTemplate = hasOwnValue(payload, 'messageTemplate') ? trimOrNull(payload?.messageTemplate) : null;
    if (payloadTemplate && !isSystemGeneratedProspectingTemplate(payloadTemplate)) {
      return sanitizeFirstContactMessage(payloadTemplate) || DEFAULT_MESSAGE_TEMPLATE;
    }
    const existingTemplate = trimOrNull(existing?.messageTemplate);
    if (existingTemplate && !isSystemGeneratedProspectingTemplate(existingTemplate)) {
      return sanitizeFirstContactMessage(existingTemplate) || DEFAULT_MESSAGE_TEMPLATE;
    }
    return DEFAULT_MESSAGE_TEMPLATE;
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
    const [todayPending, overdue, future, sent, positives, archived, failed, sending, nextJob, sentToday, skippedJobsToday, needsReviewCount, noWhatsappCount, failedJobsToday, lastSkipJob, lastSuccessfulSendAt, yellowCount, redCount] = await Promise.all([
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
        where: { campaignId: campaign.id, status: { in: [...BUFFER_JOB_STATUSES] as any }, scheduledAt: { not: null } },
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
      this.prisma.vendasAutomationJob.count({
        where: {
          campaignId: campaign.id,
          OR: [
            { classification: { in: ['neutral', 'auto_reply_detected', 'bot_menu_detected', 'out_of_hours_auto_reply', 'awaiting_human', 'needs_review', 'manual_review_required'] as any } },
            { status: 'failed' },
          ],
        },
      }),
      this.prisma.vendasAutomationJob.count({
        where: {
          campaignId: campaign.id,
          OR: [
            { status: { in: ['replied_negative', 'no_response_archived'] as any } },
            { classification: { in: ['negative', 'opt_out', 'negative_or_opt_out', 'no_response', 'no_whatsapp', 'invalid_whatsapp'] as any } },
          ],
        },
      }),
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
    const dailyLimit = this.getCampaignDailyCapacity(campaign);
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
      prospectingGreen: positives,
      prospectingYellow: yellowCount,
      prospectingRed: redCount,
    };
    const status = this.inferLiveStatus(campaign, counters, sending);
    const nextWorkingWindow = status === 'dormindo' ? this.moveToWorkingWindow(new Date(), campaign) : null;
    const nextScheduledText = nextScheduledAt ? this.formatNextScheduledText(nextScheduledAt) : null;
    const lastStatusText = isStaleProspectingRadarConfigText(campaign.lastStatusText)
      ? null
      : campaign.lastStatusText;
    const lastError = isStaleProspectingRadarConfigText(campaign.lastError)
      ? null
      : campaign.lastError;
    return {
      status,
      text:
        status === 'dormindo'
          ? this.formatSleepingUntilText(nextWorkingWindow || new Date())
          :
        status === 'aguardando' && nextScheduledText
          ? nextScheduledText
          : lastStatusText || (todayPending > 0 ? `${todayPending} contatos na fila hoje.` : 'Aguardando cards do Vendas com WhatsApp para continuar a Prospecção.'),
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
      lastError: lastError || null,
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
      preMessageEnabled: filtersJson.preMessageEnabled === true,
      preMessageVariants: normalizeVariantList(filtersJson.preMessageVariants, DEFAULT_PRE_MESSAGE_VARIANTS),
      intervalMinutes: campaign.intervalMinutes,
      intervalVarianceMinutes: clampInteger(filtersJson.intervalVarianceMinutes, DEFAULT_INTERVAL_VARIANCE_MINUTES, 0, 180),
      botReplyIntervalReductionPercent: clampInteger(
        filtersJson.botReplyIntervalReductionPercent,
        DEFAULT_BOT_REPLY_INTERVAL_REDUCTION_PERCENT,
        0,
        100,
      ),
      dailyLimit: this.getCampaignDailyCapacity(campaign),
      minLeadBuffer: campaign.minLeadBuffer,
      desiredLeadBuffer: campaign.desiredLeadBuffer,
      maxAttemptsPerLead: campaign.maxAttemptsPerLead,
      workingHoursStart: campaign.workingHoursStart,
      workingHoursEnd: campaign.workingHoursEnd,
      typingSeconds: campaign.typingSeconds,
      typingVarianceSeconds: campaign.typingVarianceSeconds,
      positiveIntentKeywords: parseJsonList(campaign.positiveIntentKeywordsJson, DEFAULT_POSITIVE_KEYWORDS),
      negativeIntentKeywords: parseJsonList(campaign.negativeIntentKeywordsJson, DEFAULT_NEGATIVE_KEYWORDS),
      whatIsItIntentKeywords: normalizeTextList(filtersJson.whatIsItIntentKeywords, WHAT_IS_IT_INTENT_KEYWORDS),
      neutralIntentKeywords: normalizeTextList(filtersJson.neutralIntentKeywords, DEFAULT_NEUTRAL_KEYWORDS),
      firstContactVariants: normalizeVariantList(filtersJson.firstContactVariants, DEFAULT_FIRST_CONTACT_VARIANTS),
      positiveReplyVariants: normalizeVariantList(filtersJson.positiveReplyVariants, DEFAULT_POSITIVE_REPLY_VARIANTS),
      whatIsItReplyVariants: normalizeVariantList(filtersJson.whatIsItReplyVariants, DEFAULT_WHAT_IS_IT_REPLY_VARIANTS),
      scheduledReplyVariants: normalizeVariantList(filtersJson.scheduledReplyVariants, DEFAULT_SCHEDULED_REPLY_VARIANTS),
      optOutVariants: normalizeVariantList(filtersJson.optOutVariants, DEFAULT_OPT_OUT_VARIANTS),
      neutralHandoffVariants: normalizeVariantList(filtersJson.neutralHandoffVariants, DEFAULT_NEUTRAL_HANDOFF_VARIANTS),
      optOutMessage: campaign.optOutMessage || DEFAULT_OPT_OUT_MESSAGE,
      optOutReplyEnabled: filtersJson.optOutReplyEnabled === true,
      websiteFallbackEnabled: false,
      lastScrapeAt: campaign.lastScrapeAt instanceof Date ? campaign.lastScrapeAt.toISOString() : null,
      lastStatusText: isStaleProspectingRadarConfigText(campaign.lastStatusText) ? null : campaign.lastStatusText || null,
      lastError: isStaleProspectingRadarConfigText(campaign.lastError) ? null : campaign.lastError || null,
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
    const savedStatusText = current?.status === 'running'
      ? isStaleProspectingRadarConfigText(current.lastStatusText)
        ? 'Configuração salva. Preparando fila com cards do Vendas que têm WhatsApp.'
        : current.lastStatusText || 'Configuração salva. Preparando fila com cards do Vendas que têm WhatsApp.'
      : 'Configuração salva. Pronta para iniciar.';
    const campaign = current
      ? await this.prisma.vendasAutomationCampaign.update({
          where: { id: current.id },
          data: {
            ...data,
            searchSignature,
            status: current.status === 'running' ? 'running' : 'paused',
            createdByUserId: current.createdByUserId || context.userId,
            lastStatusText: savedStatusText,
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
    if (campaign.status === 'running') {
      void this.primeExistingProspectingQueue(campaign.id).catch((error) => {
        const errorMessage = String(error?.message || error);
        this.logger.warn(`Falha ao preparar fila apos salvar prospeccao campaign=${campaign.id}: ${errorMessage}`);
        void this.markCampaignStage(
          campaign.id,
          context.companyId,
          'aguardando',
          'Falha ao preparar a fila. Campanha segue ativa e tentará novamente pelos cards do Vendas.',
          {
            error: errorMessage,
            type: 'config_queue_failed',
          },
        ).catch(() => null);
      });
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
    await this.commercialPlansService.assertAssistedSetupCompleteForCompany(context.companyId);
    const botConfig = await this.inboxService.getBotConfig(user);
    const current = await this.latestCampaign(context.companyId);
    const data = this.normalizeProspectingConfig(dto || {}, botConfig, current);
    const searchSignature = this.buildSearchSignature(data);
    const searchLabel = this.formatProspectingSearchLabel(data);
    const now = new Date();
    const startsInsideWorkingHours = this.isInsideWorkingHours(now, data);
    const initialStatusText = startsInsideWorkingHours
      ? `Preparando fila de Prospecção${searchLabel ? `: ${searchLabel}` : ''}.`
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
      text: campaign.lastStatusText || (startsInsideWorkingHours ? 'Preparando fila de Prospecção...' : initialStatusText),
      type: 'campaign_started',
    });

    if (startsInsideWorkingHours) {
      void this.primeExistingProspectingQueue(campaign.id).catch((error) => {
        const errorMessage = String(error?.message || error);
        this.logger.warn(`Falha ao preparar fila inicial de prospeccao campaign=${campaign.id}: ${errorMessage}`);
        void this.markCampaignStage(
          campaign.id,
          context.companyId,
          'aguardando',
          'Falha ao preparar a fila inicial. Campanha segue ativa e tentará novamente pelos cards do Vendas.',
          {
            error: errorMessage,
            type: 'initial_queue_failed',
          },
        ).catch(() => null);
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
    await this.commercialPlansService.assertAssistedSetupCompleteForCompany(context.companyId);
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
    const leadName = String(input.lead?.name || 'sua empresa').trim();
    const values: Record<string, string> = {
      cumprimentacao: computeBrasiliaGreeting(),
      cliente: leadName,
      empresaresumo: summarizeCompanyName(leadName),
      clienteresumo: summarizeCompanyName(leadName),
      empresa: companyName,
      funcionario: employeeName,
      cidade: String(input.lead?.city || input.campaign.city || '').trim(),
      estado: String(input.lead?.state || input.campaign.state || '').trim(),
      segmento: String(input.lead?.segment || input.campaign.segment || '').trim(),
      website: String(input.lead?.website || '').trim(),
    };
    return String(template || DEFAULT_MESSAGE_TEMPLATE)
      .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => values[key] || '')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private getCampaignVariantList(campaign: any, key: string, fallback: string[]) {
    const filters = parseJsonObject(campaign?.filtersJson);
    if (key === 'firstContactVariants' && !hasOwnValue(filters, key)) {
      const existingTemplate = trimOrNull(campaign?.messageTemplate);
      if (existingTemplate && !isSystemGeneratedProspectingTemplate(existingTemplate)) {
        return normalizeVariantList(existingTemplate, fallback);
      }
    }
    return normalizeVariantList((filters as any)[key], fallback);
  }

  private renderRandomCampaignVariant(campaign: any, lead: any, user: any, key: string, fallback: string[]) {
    const variant = pickRandomItem(this.getCampaignVariantList(campaign, key, fallback)) || fallback[0] || DEFAULT_MESSAGE_TEMPLATE;
    return sanitizeFirstContactMessage(this.renderMessageTemplate(variant, { lead, campaign, user }));
  }

  private isPreMessageEnabled(campaign: any) {
    const filters = parseJsonObject(campaign?.filtersJson);
    return filters.preMessageEnabled === true;
  }

  private renderPreMessage(campaign: any, lead: any, user: any) {
    const variant = pickRandomItem(this.getCampaignVariantList(campaign, 'preMessageVariants', DEFAULT_PRE_MESSAGE_VARIANTS)) || DEFAULT_PRE_MESSAGE_VARIANTS[0];
    const rendered = sanitizeFirstContactMessage(this.renderMessageTemplate(variant, { lead, campaign, user }));
    return trimOrNull(rendered) || sanitizeFirstContactMessage(this.renderMessageTemplate(DEFAULT_PRE_MESSAGE_VARIANTS[0], { lead, campaign, user }));
  }

  private resolveOutboundTemplate(campaign: any, lead: any, metadata?: Record<string, unknown> | null) {
    const queue = parseJsonObject((metadata as any)?.vendasAgendaQueue);
    const queueTemplate = trimOrNull((queue as any).draftMessage) || trimOrNull((queue as any).inheritedDraftMessage);
    if (queueTemplate) return isSystemGeneratedProspectingTemplate(queueTemplate) ? DEFAULT_MESSAGE_TEMPLATE : queueTemplate;
    const leadTemplate = trimOrNull(lead?.scriptText) || trimOrNull(lead?.roteiro) || trimOrNull(lead?.messageTemplate);
    if (leadTemplate) return isSystemGeneratedProspectingTemplate(leadTemplate) ? DEFAULT_MESSAGE_TEMPLATE : leadTemplate;
    const variant = pickRandomItem(this.getCampaignVariantList(campaign, 'firstContactVariants', DEFAULT_FIRST_CONTACT_VARIANTS));
    if (variant) return variant;
    const template = trimOrNull(campaign?.messageTemplate) || DEFAULT_MESSAGE_TEMPLATE;
    return isSystemGeneratedProspectingTemplate(template) ? DEFAULT_MESSAGE_TEMPLATE : template;
  }

  private renderOutboundMessage(campaign: any, lead: any, user: any, metadata?: Record<string, unknown> | null) {
    const body = this.renderMessageTemplate(this.resolveOutboundTemplate(campaign, lead, metadata), { lead, campaign, user });
    const safeBody = sanitizeFirstContactMessage(body);
    if (trimOrNull(safeBody)) return safeBody;
    return sanitizeFirstContactMessage(this.renderMessageTemplate(DEFAULT_MESSAGE_TEMPLATE, { lead, campaign, user }));
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

  private async primeExistingProspectingQueue(campaignId: string) {
    const campaign = await this.prisma.vendasAutomationCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== 'running') return;
    await this.markCampaignStage(campaign.id, campaign.companyId, 'agendando', 'Preparando contatos já disponíveis na Prospecção...', {
      type: 'initial_queue_started',
    });
    await this.scheduleJobsForCampaign(campaign.id);
    await this.runWorkerCycle();
  }

  private async scrapeImportAndSchedule(campaignId: string, user?: any, reason: 'start' | 'refill' = 'start') {
    const campaign = await this.prisma.vendasAutomationCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== 'running') return;
    const campaignCity = trimOrNull(campaign.city);
    const campaignSegment = trimOrNull(campaign.segment);
    if (!campaignCity || !campaignSegment) {
      const text = 'Sem filtros do Radar. Mantendo a Prospecção nos cards do Vendas com WhatsApp.';
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', text, {
        type: 'radar_filters_skipped',
      });
      return;
    }
    const now = new Date();
    if (!this.isInsideWorkingHours(now, campaign)) {
      const next = this.moveToWorkingWindow(now, campaign);
      await this.markCampaignStage(campaign.id, campaign.companyId, 'dormindo', this.formatSleepingUntilText(next), {
        type: 'outside_working_hours',
      });
      return;
    }
    const runtimeUser = user || (await this.buildAutomationUser(campaign));
    const searchLabel = `${campaignSegment} em ${campaignCity}${campaign.state ? `/${campaign.state}` : ''}`;
    await this.markCampaignStage(campaign.id, campaign.companyId, 'buscando', `Consultando fonte Radar: ${searchLabel}.`, {
      type: reason === 'refill' ? 'scrape_refill_started' : 'scrape_started',
    });
    const filters = parseJsonObject(campaign.filtersJson);
    let search: WebscrapingSearchResponse;
    try {
      const operationLimit = Math.min(100, Math.max(1, Math.trunc(Number(campaign.desiredLeadBuffer || DEFAULT_DAILY_LIMIT))));
      const pulled = await this.webscrapingService.pullRadarLeadsForUser(runtimeUser, {
        city: campaignCity,
        state: campaign.state || null,
        segment: campaignSegment,
        quantity: operationLimit,
        minimumStock: Math.min(operationLimit, Math.max(1, Number(campaign.minLeadBuffer || DEFAULT_DAILY_LIMIT))),
        desiredStock: operationLimit,
        engine: campaign.engine === 'google' ? 'google' : 'hbx',
        targetType: ['pf', 'agenda_pf'].includes(String(campaign.targetType || '')) ? campaign.targetType as any : 'pj',
        minRating: Number(filters.minRating || 0) || null,
        minReviews: Number(filters.minReviews || 0) || null,
        withWebsite: filters.onlyWithWebsite === true,
      });
      search = {
        query: {
          city: campaignCity,
          state: campaign.state || null,
          segment: campaignSegment,
          quantity: operationLimit,
          engine: campaign.engine === 'google' ? 'google' : 'hbx',
          targetType: ['pf', 'agenda_pf'].includes(String(campaign.targetType || '')) ? campaign.targetType as any : 'pj',
          filters: {
            minRating: Number(filters.minRating || 0) || null,
            minReviews: Number(filters.minReviews || 0) || null,
            onlyWithWebsite: filters.onlyWithWebsite === true,
          },
        },
        meta: {
          historyId: 'radar-digital:pull',
          source: 'radar_database',
          reusedCount: Number(pulled?.meta?.deliveredCount || 0),
          fetchedCount: Number(pulled?.meta?.deliveredCount || 0),
          technicalCacheUsed: false,
          technicalCacheReusedCount: 0,
          technicalCacheValidUntil: null,
        },
        results: (pulled.items || []).map((item: any) => ({
          placeId: item.placeId || `radar:${item.id}`,
          name: item.name,
          phone: item.phone || item.phoneDigits,
          phoneDigits: item.phoneDigits || item.phone,
          rating: item.rating ?? null,
          reviews: item.reviews ?? null,
          address: item.address || null,
          website: item.website || null,
          source: 'radar_database',
          score: item.opportunityScore ?? null,
          opportunityScore: item.opportunityScore ?? null,
          opportunityReason: item.opportunityReason || null,
          radarLeadId: item.id,
        })),
      } as any;
    } catch (error: any) {
      const errorMessage = String(error?.message || error || 'Falha na busca de contatos.');
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', `Busca de contatos falhou: ${errorMessage}`, {
        error: errorMessage,
        type: reason === 'refill' ? 'scrape_refill_failed' : 'scrape_failed',
      });
      throw error;
    }
    await this.prisma.vendasAutomationCampaign.update({
      where: { id: campaign.id },
      data: { lastScrapeAt: new Date(), searchSignature: search.query ? this.buildSearchSignature(campaign) : campaign.searchSignature },
    });
    this.publishAutomationEvent({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      status: 'buscando',
      text: `Radar entregou ${search.results.length} contato(s).`,
      type: 'scrape_completed',
    });

    const dedupedResults = await this.dedupeSearchResults(campaign.companyId, search.results);
    await this.markCampaignStage(campaign.id, campaign.companyId, 'importando', `Preparando ${dedupedResults.length} card(s) do Radar...`, {
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
      sourceHistoryId: (result as any).radarLeadId ? `radar:${(result as any).radarLeadId}` : search.meta.historyId || undefined,
    }));
    if (leads.length) {
      await this.vendasService.importWebscrapingLeadsForUser(runtimeUser, {
        sourceHistoryId: search.meta.historyId || undefined,
        leads,
      });
      await this.webscrapingService.markRadarLeadsSentToVendasForUser(
        runtimeUser,
        dedupedResults.map((result: any) => String(result.radarLeadId || '').trim()).filter(Boolean),
      ).catch((error: any) => {
        this.logger.warn(`Falha ao marcar Radar como enviado para Vendas campaign=${campaign.id}: ${String(error?.message || error)}`);
      });
    }
    this.publishAutomationEvent({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      status: 'importando',
      text: `Fonte Radar pronta com ${leads.length} contato(s).`,
      type: 'leads_imported',
    });
    await this.scheduleJobsForCampaign(campaign.id);
  }

  private parseTimeOnDate(date: Date, hhmm: string) {
    const [hourRaw, minuteRaw] = this.normalizeTime(hhmm, '08:00').split(':');
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
      return this.parseTimeOnDate(this.moveToBusinessDay(date), campaign.workingHoursStart || '08:00');
    }
    const start = this.parseTimeOnDate(date, campaign.workingHoursStart || '08:00');
    const end = this.parseTimeOnDate(date, campaign.workingHoursEnd || '18:00');
    if (date.getTime() < start.getTime()) return start;
    if (date.getTime() <= end.getTime()) return date;
    const nextDay = this.addBusinessCalendarDays(date, 1);
    return this.parseTimeOnDate(this.moveToBusinessDay(nextDay), campaign.workingHoursStart || '08:00');
  }

  private getCampaignIntervalMs(campaign: any) {
    return Math.max(1, Number(campaign.intervalMinutes || DEFAULT_INTERVAL_MINUTES)) * 60000;
  }

  private getCampaignIntervalVarianceMinutes(campaign: any) {
    const filters = parseJsonObject(campaign?.filtersJson);
    return clampInteger((filters as any).intervalVarianceMinutes, DEFAULT_INTERVAL_VARIANCE_MINUTES, 0, 180);
  }

  private getRandomizedCampaignIntervalMs(campaign: any) {
    const baseMinutes = Math.max(1, Number(campaign.intervalMinutes || DEFAULT_INTERVAL_MINUTES));
    const varianceMinutes = this.getCampaignIntervalVarianceMinutes(campaign);
    const randomizedMinutes = baseMinutes + (varianceMinutes > 0 ? Math.floor(Math.random() * (varianceMinutes + 1)) : 0);
    return randomizedMinutes * 60000;
  }

  private getCampaignDailyCapacity(campaign: any, now = new Date()) {
    const start = this.parseTimeOnDate(now, campaign.workingHoursStart || '08:00');
    const end = this.parseTimeOnDate(now, campaign.workingHoursEnd || '18:00');
    const windowMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
    const baseMinutes = Math.max(1, Number(campaign.intervalMinutes || DEFAULT_INTERVAL_MINUTES));
    const averageInterval = baseMinutes + this.getCampaignIntervalVarianceMinutes(campaign) / 2;
    const capacity = Math.max(1, Math.floor(windowMinutes / Math.max(1, averageInterval)));
    return Math.min(capacity, ABSOLUTE_DAILY_SEND_CAP);
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
    await this.markCampaignStage(campaign.id, campaign.companyId, 'agendando', 'Preparando fila com cards do Vendas que têm WhatsApp...', {
      type: 'schedule_started',
    });
    const pendingCount = await this.prisma.vendasAutomationJob.count({
      where: { campaignId: campaign.id, status: { in: [...BUFFER_JOB_STATUSES] as any } },
    });
    const bufferTarget = Math.min(this.getCampaignDailyCapacity(campaign), Math.max(1, Number(campaign.desiredLeadBuffer || DEFAULT_DAILY_LIMIT)));
    const slotsToFill = Math.max(0, bufferTarget - pendingCount);
    if (slotsToFill <= 0) {
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', `${pendingCount} contatos na fila.`, {
        type: 'queue_ready',
      });
      return;
    }
    const existingLeadIds = await this.prisma.vendasAutomationJob.findMany({
      where: {
        campaignId: campaign.id,
        status: { notIn: ['failed', 'canceled'] },
      },
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
      { sourceType: 'manual' },
    ];
    if (activeProspectionLeadIds.size) {
      sourceFilters.push({ id: { in: Array.from(activeProspectionLeadIds) } });
    }
    let usedBroaderLeadPool = false;
    let leads = await this.prisma.vendasLead.findMany({
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
    if (!leads.length) {
      usedBroaderLeadPool = true;
      await this.markCampaignStage(campaign.id, campaign.companyId, 'agendando', 'Sem card exato na fila. Procurando outros cards do Vendas com WhatsApp...', {
        type: 'schedule_similar_pool_started',
      });
      const broaderSourceFilters: any[] = [{ sourceType: 'webscraping' }, { sourceType: 'manual' }];
      if (activeProspectionLeadIds.size) {
        broaderSourceFilters.push({ id: { in: Array.from(activeProspectionLeadIds) } });
      }
      leads = await this.prisma.vendasLead.findMany({
        where: {
          companyId: campaign.companyId,
          status: { not: 'encerrado' },
          wasClosedBefore: false,
          closedAt: null,
          OR: broaderSourceFilters,
          phoneNormalized: { not: null },
          id: { notIn: Array.from(usedLeadIds) },
          attemptCount: { lt: Math.max(1, Number(campaign.maxAttemptsPerLead || 1)) },
        },
        orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }],
        take: slotsToFill,
      });
    }
    let cursor = await this.buildScheduleCursorForCampaign(campaign);
    let hasScheduledInBatch = false;
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
          const draftMessage = sanitizeFirstContactMessage(this.renderMessageTemplate(
            decision.message || DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
            { lead, campaign, user: runtimeUser },
          ));
          const conversationId = await this.updateProspectionConversationStage({
            companyId: campaign.companyId,
            lead,
            campaign,
            stage: 'pending_send',
            draftMessage,
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
      cursor = hasScheduledInBatch
        ? this.moveToWorkingWindow(new Date(cursor.getTime() + this.getRandomizedCampaignIntervalMs(campaign)), campaign)
        : this.moveToWorkingWindow(cursor, campaign);
      hasScheduledInBatch = true;
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
        const draftMessage = usesFallback
          ? sanitizeFirstContactMessage(this.renderMessageTemplate(DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE, { lead, campaign, user: runtimeUser }))
          : this.isPreMessageEnabled(campaign)
            ? this.renderPreMessage(campaign, lead, runtimeUser)
          : this.renderOutboundMessage(campaign, lead, runtimeUser);
        const conversationId = await this.updateProspectionConversationStage({
          companyId: campaign.companyId,
          lead,
          campaign,
          stage: 'scheduled_send',
          scheduledAt: item.scheduledAt,
          draftMessage,
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
        : pendingCount > 0
          ? `${pendingCount} contatos na fila.`
        : draftOnlyCount
          ? `${draftOnlyCount} card(s) prontos para primeiro contato.`
          : usedBroaderLeadPool
            ? 'Sem cards do Vendas com WhatsApp disponíveis agora.'
            : 'Aguardando cards do Vendas com WhatsApp para continuar a Prospecção.',
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
      let cursor = await this.buildScheduleCursorForCampaign(campaign);
      let hasScheduledInBatch = false;

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
            const draftMessage = sanitizeFirstContactMessage(this.renderMessageTemplate(
              decision.message || DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
              { lead, campaign, user: runtimeUser },
            ));
            const conversationId = await this.updateProspectionConversationStage({
              companyId: campaign.companyId,
              lead,
              campaign,
              stage: 'pending_send',
              draftMessage,
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
        cursor = hasScheduledInBatch
          ? this.moveToWorkingWindow(new Date(cursor.getTime() + this.getRandomizedCampaignIntervalMs(campaign)), campaign)
          : this.moveToWorkingWindow(cursor, campaign);
        hasScheduledInBatch = true;
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
          const draftMessage = usesFallback
            ? sanitizeFirstContactMessage(this.renderMessageTemplate(DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE, { lead, campaign, user: runtimeUser }))
            : this.isPreMessageEnabled(campaign)
              ? this.renderPreMessage(campaign, lead, runtimeUser)
            : this.renderOutboundMessage(campaign, lead, runtimeUser);
          const conversationId = await this.updateProspectionConversationStage({
            companyId: campaign.companyId,
            lead,
            campaign,
            stage: 'scheduled_send',
            scheduledAt: item.scheduledAt,
            draftMessage,
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
      const bufferTarget = Math.min(this.getCampaignDailyCapacity(campaign), Math.max(1, Number(campaign.desiredLeadBuffer || DEFAULT_DAILY_LIMIT)));
      if (pending >= bufferTarget) continue;
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
      await this.refillCampaignsIfNeeded();
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
      if (pending > 0) continue;
      const dueJobs = await this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: 'scheduled', scheduledAt: { lte: now } },
      });
      if (dueJobs > 0) continue;
      const lastScrapeAt = campaign.lastScrapeAt instanceof Date ? campaign.lastScrapeAt : null;
      const statusText = normalizeKey(campaign.lastStatusText);
      if (
        lastScrapeAt &&
        now.getTime() - lastScrapeAt.getTime() < EMPTY_REFILL_RETRY_MS &&
        statusText.includes('bot parado')
      ) {
        continue;
      }
      await this.scheduleJobsForCampaign(campaign.id).catch((error) => {
        this.logger.warn(`Preparo da fila de Vendas falhou campaign=${campaign.id}: ${String(error?.message || error)}`);
      });
      const pendingAfterSchedule = await this.prisma.vendasAutomationJob.count({
        where: { campaignId: campaign.id, status: { in: [...BUFFER_JOB_STATUSES] as any } },
      });
      if (pendingAfterSchedule > 0) continue;
      const campaignCity = trimOrNull(campaign.city);
      const campaignSegment = trimOrNull(campaign.segment);
      if (!campaignCity || !campaignSegment) {
        await this.markCampaignStage(
          campaign.id,
          campaign.companyId,
          'aguardando',
          'Aguardando cards do Vendas com WhatsApp para continuar a Prospecção.',
          { type: 'waiting_vendas_cards' },
        ).catch((error) => {
          this.logger.warn(`Falha ao marcar campanha aguardando cards campaign=${campaign.id}: ${String(error?.message || error)}`);
        });
        continue;
      }
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
    const start = this.parseTimeOnDate(date, campaign.workingHoursStart || '08:00');
    const end = this.parseTimeOnDate(date, campaign.workingHoursEnd || '18:00');
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

  private async countRealNegativeBlocksToday(campaign: any, now = new Date()) {
    return this.prisma.vendasAutomationJob.count({
      where: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        OR: [
          {
            status: 'replied_negative',
            repliedAt: { gte: this.startOfDay(now), lt: this.startOfNextDay(now) },
          },
          {
            classification: 'negative_or_opt_out',
            archivedAt: { gte: this.startOfDay(now), lt: this.startOfNextDay(now) },
          },
        ],
      },
    });
  }

  private async pauseCampaignForSafety(campaign: any, text: string, type: string) {
    await this.prisma.vendasAutomationCampaign.updateMany({
      where: { id: campaign.id, companyId: campaign.companyId },
      data: { status: 'paused', lastStatusText: text, lastError: text },
    });
    this.publishAutomationEvent({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      status: 'pausado',
      text,
      type,
    });
  }

  private async pauseCampaignIfRealNegativeLimitReached(campaign: any, now = new Date()) {
    const count = await this.countRealNegativeBlocksToday(campaign, now).catch(() => 0);
    if (count < REAL_NEGATIVE_PAUSE_LIMIT) return false;
    await this.pauseCampaignForSafety(
      campaign,
      `Campanha pausada por segurança: ${count} negativas/opt-outs reais hoje.`,
      'real_negative_safety_pause',
    );
    return true;
  }

  private async pauseCampaignIfAutoReplyStreakReached(campaign: any, now = new Date()) {
    const jobs = await this.prisma.vendasAutomationJob.findMany({
      where: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        sentAt: { gte: this.startOfDay(now), lt: this.startOfNextDay(now) },
        classification: {
          in: ['auto_reply_detected', 'bot_menu_detected', 'out_of_hours_auto_reply', 'awaiting_human'] as any,
        },
      },
      orderBy: { sentAt: 'desc' },
      take: AUTO_REPLY_STREAK_PAUSE_LIMIT,
      select: { classification: true },
    }).catch(() => []);
    if (jobs.length < AUTO_REPLY_STREAK_PAUSE_LIMIT) return false;
    await this.pauseCampaignForSafety(
      campaign,
      'Campanha pausada por segurança: 5 auto-respostas seguidas. Aguardando humano/fora de horário.',
      'auto_reply_streak_safety_pause',
    );
    return true;
  }

  private async getSafeFirstContactBody(input: {
    campaign: any;
    lead: any;
    user: any;
    metadata?: Record<string, unknown> | null;
    bodyOverride?: string | null;
    now?: Date;
  }) {
    const baseBody = input.bodyOverride
      ? sanitizeFirstContactMessage(this.renderMessageTemplate(input.bodyOverride, {
          lead: input.lead,
          campaign: input.campaign,
          user: input.user,
        }))
      : this.renderOutboundMessage(input.campaign, input.lead, input.user, input.metadata);
    const fallback = this.renderMessageTemplate(DEFAULT_MESSAGE_TEMPLATE, {
      lead: input.lead,
      campaign: input.campaign,
      user: input.user,
    });
    const candidate = trimOrNull(baseBody) || sanitizeFirstContactMessage(fallback);
    return this.varyRepeatedFirstContactMessage(input.campaign, input.lead, input.user, candidate, input.now || new Date());
  }

  private async varyRepeatedFirstContactMessage(campaign: any, lead: any, user: any, body: string, now: Date) {
    const todayMessages = await this.getAutomaticFirstContactMessagesToday(campaign.companyId, now);
    const usage = new Map<string, number>();
    for (const message of todayMessages) {
      const key = normalizeFirstContactForComparison(message);
      if (!key) continue;
      usage.set(key, (usage.get(key) || 0) + 1);
    }
    const currentKey = normalizeFirstContactForComparison(body);
    if ((usage.get(currentKey) || 0) < FIRST_CONTACT_REPEAT_LIMIT) return sanitizeFirstContactMessage(body);

    for (const variant of this.getCampaignVariantList(campaign, 'firstContactVariants', DEFAULT_FIRST_CONTACT_VARIANTS)) {
      const rendered = sanitizeFirstContactMessage(this.renderMessageTemplate(variant, { lead, campaign, user }));
      const key = normalizeFirstContactForComparison(rendered);
      if ((usage.get(key) || 0) < FIRST_CONTACT_REPEAT_LIMIT) return rendered;
    }

    return null;
  }

  private async getAutomaticFirstContactMessagesToday(companyId: number, now: Date) {
    const conversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        metadata: { contains: '"vendasAutomation"' },
      },
      select: { metadata: true },
    }).catch(() => []);
    const start = this.startOfDay(now).getTime();
    const end = this.startOfNextDay(now).getTime();
    const messages: string[] = [];
    for (const conversation of conversations) {
      const metadata = parseJsonObject((conversation as any).metadata);
      const automation = parseJsonObject((metadata as any).vendasAutomation);
      const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
      const sentAt = new Date(String((automation as any).sentAt || (queue as any).manualSentAt || ''));
      if (!Number.isFinite(sentAt.getTime()) || sentAt.getTime() < start || sentAt.getTime() >= end) continue;
      const message = trimOrNull((queue as any).draftMessage);
      if (message) messages.push(message);
    }
    return messages;
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

  private async markRadarDispositionForLead(campaign: any, lead: any, status: string, reason: string) {
    try {
      const runtimeUser = await this.buildAutomationUser(campaign);
      await this.webscrapingService.markRadarContactDispositionForUser(runtimeUser, {
        phone: lead?.phoneNormalized || lead?.phone,
        phoneDigits: lead?.phoneNormalized || lead?.phone,
        name: lead?.name || null,
        city: lead?.city || campaign?.city || null,
        state: campaign?.state || null,
        segment: lead?.segment || campaign?.segment || null,
        status,
        reason,
        source: 'vendas_automation',
      });
    } catch (error: any) {
      this.logger.warn(`Falha ao sincronizar descarte no Radar lead=${lead?.id || '-'}: ${String(error?.message || error)}`);
    }
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

    try {
      await this.commercialPlansService.assertAssistedSetupCompleteForCompany(Number(campaign.companyId));
    } catch {
      await this.markCampaignStage(
        campaign.id,
        campaign.companyId,
        'pausado',
        'Implantação assistida pendente. A HBX configura mensagens, limites, horários e handoff humano antes de liberar automação completa.',
        { type: 'assisted_setup_required' },
      );
      return deferredResult('assisted_setup_required', null);
    }

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
      await this.markRadarDispositionForLead(campaign, lead, 'invalid_whatsapp', errorMessage);
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
      await this.markRadarDispositionForLead(campaign, lead, 'no_whatsapp', errorMessage);
      return skippedResult('no_whatsapp', errorMessage);
    }

    const radarProtectionUser = await this.buildAutomationUser(campaign);
    const radarProtection = await this.webscrapingService.getRadarContactProtectionForUser(radarProtectionUser, {
      phone: lead.phoneNormalized || lead.phone,
      phoneDigits: lead.phoneNormalized || lead.phone,
    }).catch(() => ({ blocked: false, status: null, reason: null }));
    if (radarProtection?.blocked) {
      const errorMessage = `Radar bloqueou o envio: ${String(radarProtection.reason || radarProtection.status || 'lead protegido')}.`;
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: {
          status: 'skipped',
          archivedAt: now,
          classification: 'radar_protected',
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
        text: 'Radar bloqueou este lead por histórico negativo, bloqueio ou opt-out.',
        type: 'radar_protected',
      });
      return skippedResult('radar_protected', errorMessage);
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
      await this.markRadarDispositionForLead(campaign, lead, 'opt_out', errorMessage);
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
        const runtimeUser = await this.buildAutomationUser(campaign);
        const draftMessage = sanitizeFirstContactMessage(this.renderMessageTemplate(
          decision.message || DEFAULT_SEGMENT_MISMATCH_FALLBACK_MESSAGE,
          { lead, campaign, user: runtimeUser },
        ));
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
          draftMessage,
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
      const runtimeUser = await this.buildAutomationUser(campaign);
      const draftMessage = sanitizeFirstContactMessage(this.renderMessageTemplate(bodyOverride, { lead, campaign, user: runtimeUser }));
      const conversationId = await this.updateProspectionConversationStage({
        companyId: campaign.companyId,
        lead,
        campaign,
        jobId: job.id,
        stage: 'scheduled_send',
        scheduledAt: job.scheduledAt || null,
        draftMessage,
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
    const dailyCapacity = this.getCampaignDailyCapacity(campaign, now);
    if (sentToday >= dailyCapacity) {
      this.logger.log(
        `[vendas-automation] daily capacity reached campaignId=${campaign.id} sentToday=${sentToday} dailyCapacity=${dailyCapacity}`,
      );
      const nextDay = this.addBusinessCalendarDays(now, 1);
      const next = this.parseTimeOnDate(this.moveToBusinessDay(nextDay), campaign.workingHoursStart || '08:00');
      await this.prisma.vendasAutomationJob.update({ where: { id: job.id }, data: { scheduledAt: next } });
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', 'Capacidade diária da janela atingida. Próximos envios amanhã.', {
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

    if (await this.pauseCampaignIfRealNegativeLimitReached(campaign, now)) {
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { scheduledAt: this.moveToWorkingWindow(new Date(now.getTime() + this.getCampaignIntervalMs(campaign)), campaign) },
      });
      return deferredResult('real_negative_safety_pause');
    }

    const runtimeUser = await this.buildAutomationUser(campaign);
    const preMessageEnabled = this.isPreMessageEnabled(campaign);
    const body = preMessageEnabled
      ? this.renderPreMessage(campaign, lead, runtimeUser)
      : await this.getSafeFirstContactBody({
          campaign,
          lead,
          user: runtimeUser,
          metadata: prospectionMetadata,
          bodyOverride,
          now,
        });
    if (!body) {
      const errorMessage = 'Mensagem inicial repetida demais hoje. Campanha pausada para revisão do texto.';
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'skipped', archivedAt: now, classification: 'repeated_first_contact_review', errorMessage },
      });
      await this.pauseCampaignForSafety(campaign, errorMessage, 'repeated_first_contact_safety_pause');
      return deferredResult('repeated_first_contact_review');
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
          preMessage: preMessageEnabled,
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
            lastResult: preMessageEnabled ? 'Pré-mensagem automática' : 'Primeiro contato automático',
          },
        });
        await tx.vendasLeadTimelineEvent.create({
          data: {
            leadId: lead.id,
            eventType: 'contact_made',
            title: preMessageEnabled ? 'Pré-mensagem automática enviada' : 'Primeiro contato automático enviado',
            description: preMessageEnabled
              ? 'Filtro inicial da prospecção automática enfileirado pelo backend.'
              : 'Mensagem inicial da prospecção automática enfileirada pelo backend.',
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
        preMessageSent: preMessageEnabled,
      });
      this.logger.log(`[prospeccao] outbound automatico enviado, mantendo em prospeccao conversation=${Number(queued.conversationId)} job=${job.id}`);
      const sentTodayAfter = sentToday + 1;
      const nextAllowedAfterSend = this.moveToWorkingWindow(new Date(sentAt.getTime() + this.getCampaignIntervalMs(campaign)), campaign);
      this.logger.log(
        `[vendas-automation] sent lead campaignId=${campaign.id} jobId=${job.id} leadId=${lead.id} sentToday=${sentTodayAfter} dailyCapacity=${dailyCapacity} nextAllowedSendAt=${nextAllowedAfterSend.toISOString()}`,
      );
      this.publishAutomationEvent({
        companyId: campaign.companyId,
        campaignId: campaign.id,
        jobId: job.id,
        leadId: lead.id,
        conversationId: Number(queued.conversationId),
        status: 'aguardando',
        text: preMessageEnabled ? 'Pré-mensagem enviada. Aguardando resposta humana.' : 'Contato enviado. Aguardando resposta.',
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
    preMessageSent?: boolean;
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
          preMessageSent: input.preMessageSent === true,
          preMessageAwaitingReply: input.preMessageSent === true,
          preMessagePitchSent: false,
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
          preMessageSent: input.preMessageSent === true,
          preMessageAwaitingReply: input.preMessageSent === true,
          preMessagePitchSent: false,
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

  private isAwaitingPreMessageHumanReply(metadata: Record<string, any>) {
    const automation = parseJsonObject(metadata?.vendasAutomation);
    const queue = parseJsonObject(metadata?.vendasAgendaQueue);
    return (
      ((automation as any).preMessageAwaitingReply === true || (queue as any).preMessageAwaitingReply === true) &&
      (automation as any).preMessagePitchSent !== true &&
      (queue as any).preMessagePitchSent !== true
    );
  }

  private isPreMessageEnabledForCampaign(campaign: any) {
    const filters = parseJsonObject(campaign?.filtersJson);
    return campaign?.preMessageEnabled === true || (filters as any).preMessageEnabled === true;
  }

  private isAwaitingPreMessageHumanReplyForJob(metadata: Record<string, any>, job: any) {
    if (this.isAwaitingPreMessageHumanReply(metadata)) return true;
    const automation = parseJsonObject(metadata?.vendasAutomation);
    const queue = parseJsonObject(metadata?.vendasAgendaQueue);
    if ((automation as any).preMessagePitchSent === true || (queue as any).preMessagePitchSent === true) return false;
    if (!this.isPreMessageEnabledForCampaign(job?.campaign)) return false;
    const lastResult = normalizeKey(job?.lead?.lastResult);
    return lastResult.includes('pre mensagem automatica') || lastResult.includes('pre-mensagem automatica');
  }

  private getBotReplyIntervalReductionPercent(campaign: any) {
    const filters = parseJsonObject(campaign?.filtersJson);
    return clampInteger(
      (filters as any).botReplyIntervalReductionPercent,
      DEFAULT_BOT_REPLY_INTERVAL_REDUCTION_PERCENT,
      0,
      100,
    );
  }

  private async accelerateNextJobAfterAutoReply(campaign: any, currentJobId: string, now: Date) {
    const reductionPercent = this.getBotReplyIntervalReductionPercent(campaign);
    if (reductionPercent <= 0) return null;
    const nextJob = await this.prisma.vendasAutomationJob.findFirst({
      where: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        id: { not: currentJobId },
        status: { in: [...BUFFER_JOB_STATUSES] as any },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, scheduledAt: true },
    });
    if (!nextJob?.id) return null;
    const currentTarget = nextJob.scheduledAt instanceof Date && nextJob.scheduledAt.getTime() > now.getTime()
      ? nextJob.scheduledAt
      : new Date(now.getTime() + this.getCampaignIntervalMs(campaign));
    const remainingMs = Math.max(0, currentTarget.getTime() - now.getTime());
    const nextDelayMs = reductionPercent >= 100 ? 0 : Math.round(remainingMs * (1 - reductionPercent / 100));
    const nextScheduledAt = this.moveToWorkingWindow(new Date(now.getTime() + nextDelayMs), campaign);
    await this.prisma.vendasAutomationJob.update({
      where: { id: nextJob.id },
      data: { scheduledAt: nextScheduledAt },
    });
    return nextScheduledAt;
  }

  private async sendPitchAfterPreMessage(input: any, job: any) {
    const now = new Date();
    const runtimeUser = await this.buildAutomationUser(job.campaign);
    const body = this.renderOutboundMessage(job.campaign, job.lead, runtimeUser, input.metadata);
    if (!body) return null;
    const metadata = parseJsonObject(input.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const automation = parseJsonObject((metadata as any).vendasAutomation);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    await this.conversations.queueOutboundForCompany(input.companyId, {
      conversationId: input.conversationId,
      to: input.from,
      contactId: input.from,
      body,
      messageType: 'text',
      sourceModule: 'vendas_prospeccao_bot',
      senderType: 'bot',
      variables: {
        botType: 'prospeccao',
        campaignId: job.campaignId,
        jobId: job.id,
        leadId: job.leadId,
        firstContact: true,
        preMessageFollowUp: true,
      },
      flowState: {
        botActive: true,
        humanAssigned: false,
        flowResult: null,
        metadata: {
          ...metadata,
          vendasAutomation: {
            ...automation,
            status: 'sent',
            preMessageAwaitingReply: false,
            preMessagePitchSent: true,
            preMessageHumanReplyAt: input.timestamp instanceof Date ? input.timestamp.toISOString() : now.toISOString(),
            pitchSentAt: now.toISOString(),
          },
          vendasAgendaQueue: {
            ...queue,
            status: 'contato',
            nextAction: 'Aguardar resposta do pitch',
            draftMessage: body,
            draftPending: false,
            botEligible: true,
            botEntryPending: true,
            preMessageAwaitingReply: false,
            preMessagePitchSent: true,
            preMessageHumanReplyAt: input.timestamp instanceof Date ? input.timestamp.toISOString() : now.toISOString(),
            pitchSentAt: now.toISOString(),
            syncedAt: now.toISOString(),
          },
          vendasProspeccao: this.buildProspectionState('sent_waiting', {
            current: prospeccao,
            lead: job.lead,
            campaign: job.campaign,
            firstOutboundAt: job.sentAt || now,
            replyDeadlineAt: this.addHoursIso(now, 24),
            mismatchReason: null,
          }),
        },
      },
    });
    this.publishAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: 'Resposta humana detectada. Pitch enviado.',
      type: 'pre_message_human_reply',
    });
    return body;
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
    const awaitingPreMessageHumanReply = this.isAwaitingPreMessageHumanReplyForJob(input.metadata, job);
    const positives = parseJsonList(job.campaign.positiveIntentKeywordsJson, DEFAULT_POSITIVE_KEYWORDS).map(normalizeKey);
    const negatives = parseJsonList(job.campaign.negativeIntentKeywordsJson, DEFAULT_NEGATIVE_KEYWORDS).map(normalizeKey);
    const filtersJson = parseJsonObject(job.campaign.filtersJson);
    const whatIsItKeywords = normalizeTextList(filtersJson.whatIsItIntentKeywords, WHAT_IS_IT_INTENT_KEYWORDS).map(normalizeKey);
    const neutralKeywords = normalizeTextList(filtersJson.neutralIntentKeywords, DEFAULT_NEUTRAL_KEYWORDS).map(normalizeKey);
    const intent = classifyProspectingIntent({
      text: input.text,
      positiveKeywords: positives,
      negativeKeywords: negatives,
      whatIsItKeywords,
      neutralKeywords,
    });
    const autoReplyClassification = classifyProspectingAutoReply(input.text);
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

    if (intent.kind === 'negative' || intent.kind === 'opt_out') {
      await input.setInboundMeta(intent.kind === 'opt_out' ? 'vendas_prospeccao_opt_out' : 'vendas_prospeccao_negativo', false);
      await this.markNegative({ ...input, job, optOut: intent.kind === 'opt_out' });
      return { handled: true, classification: intent.kind };
    }

    const blockedStatus = ['interested', 'neutral', 'human_assigned', 'auto_reply_detected', 'bot_menu_detected', 'out_of_hours_auto_reply', 'awaiting_human'];
    const isBlocked =
      blockedStatus.includes(automationStatus) ||
      blockedStatus.includes(queueStatus) ||
      input.metadata?.humanAssigned === true ||
      (queue as any).humanAssigned === true;
    const hardBlocked = input.metadata?.humanAssigned === true || (queue as any).humanAssigned === true;
    if (hardBlocked || (isBlocked && !awaitingPreMessageHumanReply)) return null;

    if (autoReplyClassification) {
      await input.setInboundMeta('vendas_prospeccao_auto_reply', false);
      await this.markAutoReply({ ...input, job, classification: autoReplyClassification });
      return { handled: true, classification: autoReplyClassification };
    }

    if (awaitingPreMessageHumanReply) {
      // A pré-mensagem só filtra bot: qualquer resposta humana libera o pitch.
      await input.setInboundMeta('vendas_prospeccao_pre_mensagem_humana', false);
      await this.sendPitchAfterPreMessage(input, job);
      return { handled: true, classification: 'pre_message_human_reply' };
    }

    if (intent.kind === 'ambiguous_intent' || intent.confidence < 0.5) {
      await input.setInboundMeta('vendas_prospeccao_duvida', false);
      await this.markNeutral({ ...input, job, intentReview: intent });
      return { handled: true, classification: intent.kind === 'ambiguous_intent' ? 'ambiguous_intent' : 'low_confidence' };
    }

    if (intent.kind === 'positive' || intent.kind === 'what_is_it') {
      await input.setInboundMeta('vendas_prospeccao_interessado', false);
      await this.markInterested({ ...input, job, replyKind: intent.kind });
      return { handled: true, classification: intent.kind };
    }

    if (intent.kind === 'human_requested') {
      await input.setInboundMeta('vendas_prospeccao_humano', false);
      await this.markNeutral({ ...input, job, humanRequested: true });
      return { handled: true, classification: 'human_requested' };
    }

    await input.setInboundMeta('vendas_prospeccao_neutro', false);
    await this.markNeutral({ ...input, job, intentReview: intent.confidence < 0.5 ? intent : undefined });
    return { handled: true, classification: intent.reasons.includes('low_confidence') ? 'low_confidence' : 'neutral' };
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
    const runtimeUser = await this.buildAutomationUser(job.campaign);
    const followUpMessage = this.renderRandomCampaignVariant(
      job.campaign,
      job.lead,
      runtimeUser,
      input.replyKind === 'what_is_it' ? 'whatIsItReplyVariants' : 'positiveReplyVariants',
      input.replyKind === 'what_is_it' ? DEFAULT_WHAT_IS_IT_REPLY_VARIANTS : DEFAULT_POSITIVE_REPLY_VARIANTS,
    );
    const nextMetadata = {
      ...metadata,
      botActive: false,
      humanAssigned: false,
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      hbotBlockedReason: 'prospection_attention_required',
      prospectionAttentionRequired: true,
      prospectionAttentionTone: 'green',
      vendasAutomation: {
        ...parseJsonObject((metadata as any).vendasAutomation),
        campaignId: job.campaignId,
        jobId: job.id,
        leadId: job.leadId,
        status: 'interested',
        disposition: 'positive',
        awaitingProspectionReview: true,
        attentionRequired: true,
        attentionTone: 'green',
        interestedAt: now.toISOString(),
        followUpSent: Boolean(followUpMessage),
      },
      vendasAgendaQueue: {
        ...queue,
        active: true,
        leadId: job.leadId,
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        status: 'qualificado',
        nextAction: followUpMessage
          ? 'Prospecção: resposta automática enviada, aguardando retorno'
          : 'Prospecção: interessado aguardando operador',
        draftMessage: null,
        draftPending: false,
        botEligible: false,
        botEntryPending: false,
        botActive: false,
        humanAssigned: false,
        awaitingProspectionReview: true,
        attentionRequired: true,
        attentionTone: 'green',
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
    };
    const nextState = {
      botActive: false,
      humanAssigned: false,
      flowResult: 'prospection_interested',
      metadata: nextMetadata,
    };
    if (followUpMessage) {
      try {
        await this.conversations.queueOutboundForCompany(input.companyId, {
          conversationId: input.conversationId,
          to: input.from,
          contactId: input.from,
          body: followUpMessage,
          messageType: 'text',
          sourceModule: 'vendas_prospeccao_bot',
          senderType: 'bot',
          variables: {
            botType: 'prospeccao',
            campaignId: job.campaignId,
            jobId: job.id,
            leadId: job.leadId,
            replyKind: input.replyKind || 'positive',
            automaticFollowUp: true,
          },
          flowState: nextState,
        });
      } catch (error: any) {
        this.logger.warn(`Falha ao enviar resposta positiva da prospeccao job=${job.id}: ${String(error?.message || error)}`);
        await this.conversations.updateConversationState(input.companyId, input.conversationId, {
          ...nextState,
          metadata: {
            ...nextMetadata,
            vendasAutomation: {
              ...parseJsonObject((nextMetadata as any).vendasAutomation),
              followUpSent: false,
              followUpError: String(error?.message || error),
            },
            vendasAgendaQueue: {
              ...parseJsonObject((nextMetadata as any).vendasAgendaQueue),
              nextAction: 'Prospecção: falha ao enviar resposta automática',
            },
          },
        });
      }
    } else {
      await this.conversations.updateConversationState(input.companyId, input.conversationId, nextState);
    }
    await this.markRadarDispositionForLead(job.campaign, job.lead, 'interested', 'positive');
    this.publishAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: 'Interessado encontrado. Aguardando Prospecção.',
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
        data: { status: 'replied_negative', repliedAt: now, archivedAt: now, classification: input.optOut ? 'opt_out' : 'negative', conversationId: input.conversationId },
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
    const runtimeUser = await this.buildAutomationUser(job.campaign);
    const optOutMessage = this.renderRandomCampaignVariant(
      job.campaign,
      job.lead,
      runtimeUser,
      'optOutVariants',
      normalizeVariantList(job.campaign.optOutMessage, DEFAULT_OPT_OUT_VARIANTS),
    );
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
    await this.markRadarDispositionForLead(job.campaign, job.lead, input.optOut ? 'opt_out' : 'negative', input.optOut ? 'opt_out' : 'resposta_negativa');
    await this.pauseCampaignIfRealNegativeLimitReached(job.campaign, now).catch(() => null);
  }

  private async markAutoReply(input: any) {
    const now = new Date();
    const job = input.job;
    const classification = String(input.classification || 'auto_reply_detected') as ProspectingAutoReplyClassification;
    await this.prisma.vendasAutomationJob.update({
      where: { id: job.id },
      data: { classification, repliedAt: now, conversationId: input.conversationId },
    });
    await this.prisma.vendasAutomationJob.updateMany({
      where: { companyId: input.companyId, leadId: job.leadId, id: { not: job.id }, status: { in: ['pending', 'scheduled'] } },
      data: { status: 'canceled', archivedAt: now, errorMessage: 'Autoatendimento detectado. Aguardando humano.' },
    });
    await this.prisma.vendasLead.update({
      where: { id: job.leadId },
      data: {
        status: 'retorno',
        lastResult: classification === 'out_of_hours_auto_reply' ? 'Fora de horário; aguardando humano' : 'Autoatendimento detectado; aguardando humano',
        returnAt: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      },
    }).catch(() => null);

    const metadata = parseJsonObject(input.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    await this.conversations.updateConversationState(input.companyId, input.conversationId, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'prospection_auto_reply',
      metadata: {
        ...metadata,
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        vendasAutomation: {
          ...parseJsonObject((metadata as any).vendasAutomation),
          campaignId: job.campaignId,
          jobId: job.id,
          leadId: job.leadId,
          status: classification,
          autoReplyDetected: true,
          awaitingHuman: true,
          awaitingProspectionReview: true,
          attentionRequired: true,
          attentionTone: 'yellow',
          autoReplyAt: now.toISOString(),
        },
        vendasAgendaQueue: {
          ...queue,
          active: true,
          leadId: job.leadId,
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          status: 'awaiting_human',
          nextAction: classification === 'out_of_hours_auto_reply' ? 'Fora de horário; não insistir agora' : 'Autoatendimento detectado; aguardando humano',
          draftPending: false,
          botEligible: false,
          botEntryPending: false,
          awaitingHuman: true,
          awaitingProspectionReview: true,
          attentionRequired: true,
          attentionTone: 'yellow',
          autoReplyDetected: true,
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
      text: classification === 'out_of_hours_auto_reply' ? 'Fora de horário detectado. Não insistir agora.' : 'Autoatendimento detectado. Aguardando humano.',
      type: classification,
    });
    const nextScheduledAt = await this.accelerateNextJobAfterAutoReply(job.campaign, job.id, now).catch(() => null);
    if (nextScheduledAt) {
      this.publishAutomationEvent({
        companyId: input.companyId,
        campaignId: job.campaignId,
        jobId: job.id,
        leadId: job.leadId,
        conversationId: input.conversationId,
        status: 'aguardando',
        text: `Autoatendimento detectado. ${this.formatNextScheduledText(nextScheduledAt)}.`,
        type: 'auto_reply_next_interval_reduced',
      });
    }
    await this.pauseCampaignIfAutoReplyStreakReached(job.campaign, now).catch(() => null);
  }

  private async markNeutral(input: any) {
    const now = new Date();
    const job = input.job;
    const intentReview = input.intentReview && typeof input.intentReview === 'object' ? input.intentReview : null;
    const jobClassification = intentReview?.kind === 'ambiguous_intent'
      ? 'ambiguous_intent'
      : intentReview?.confidence < 0.5
        ? 'low_confidence'
        : 'neutral';
    await this.prisma.vendasAutomationJob.update({
      where: { id: job.id },
      data: { classification: jobClassification, repliedAt: now, conversationId: input.conversationId },
    });
    const metadata = parseJsonObject(input.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const prospeccao = parseJsonObject((metadata as any).vendasProspeccao);
    await this.conversations.updateConversationState(input.companyId, input.conversationId, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'prospection_neutral',
      metadata: {
        ...metadata,
        botActive: false,
        humanAssigned: false,
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        hbotBlockedReason: 'prospection_attention_required',
        prospectionAttentionRequired: true,
        prospectionAttentionTone: 'yellow',
        prospectionReviewReason: intentReview?.reasons?.join(', ') || null,
        prospectionIntentConfidence: intentReview?.confidence ?? null,
        vendasAutomation: {
          ...parseJsonObject((metadata as any).vendasAutomation),
          campaignId: job.campaignId,
          jobId: job.id,
          leadId: job.leadId,
          status: input.humanRequested ? 'human_requested' : 'neutral',
          classification: jobClassification,
          reviewReason: intentReview?.reasons?.join(', ') || null,
          confidence: intentReview?.confidence ?? null,
          humanAssigned: false,
          awaitingProspectionReview: true,
          attentionRequired: true,
          attentionTone: 'yellow',
          neutralAt: now.toISOString(),
        },
        vendasAgendaQueue: {
          ...queue,
          active: true,
          leadId: job.leadId,
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          nextAction: jobClassification === 'ambiguous_intent'
            ? 'Prospecção: resposta ambígua, bot pausado para revisão'
            : 'Prospecção: resposta não encaixou no fluxo, bot pausado',
          draftMessage: null,
          draftPending: false,
          classification: jobClassification,
          reviewReason: intentReview?.reasons?.join(', ') || null,
          confidence: intentReview?.confidence ?? null,
          botEligible: false,
          botEntryPending: false,
          botActive: false,
          humanAssigned: false,
          awaitingProspectionReview: true,
          attentionRequired: true,
          attentionTone: 'yellow',
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
      text: jobClassification === 'ambiguous_intent'
        ? 'Resposta ambigua. Bot pausado para revisao.'
        : 'Resposta recebida. Aguardando Prospecção.',
      type: jobClassification === 'ambiguous_intent' ? 'ambiguous_intent' : 'lead_neutral',
    });
  }
}
