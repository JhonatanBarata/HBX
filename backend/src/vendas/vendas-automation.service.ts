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

const BUFFER_JOB_STATUSES = ['pending', 'scheduled'] as const;
const DEFAULT_POSITIVE_KEYWORDS = ['tenho interesse', 'pode mandar', 'quero saber', 'me explica', 'quanto custa'];
const DEFAULT_NEGATIVE_KEYWORDS = ['nao tenho interesse', 'não tenho interesse', 'pare', 'remover', 'sem interesse', 'spam', 'nao me chame', 'não me chame'];
const OPT_OUT_INTENT_KEYWORDS = ['remover', 'pare', 'spam', 'nao me chame', 'não me chame'];
const HUMAN_HANDOFF_INTENT_KEYWORDS = ['humano', 'atendente', 'ligar', 'me chama'];
const DEFAULT_DAILY_LIMIT = 30;
const DEFAULT_OPT_OUT_MESSAGE = 'Entendi. Vou arquivar este contato e nao chamaremos novamente.';
const DEFAULT_MESSAGE_TEMPLATE =
  'Oi, tudo bem? Aqui é {{funcionario}} da {{empresa}}. Vi a {{cliente}} em {{cidade}} e queria te explicar em 1 minuto uma solução para {{segmento}}. Faz sentido eu te mandar?';
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

function containsNormalizedKeyword(normalizedText: string, keywords: string[]) {
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeKey(keyword);
    return Boolean(normalizedKeyword && normalizedText.includes(normalizedKeyword));
  });
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
    const [todayPending, overdue, future, sent, positives, archived, failed, sending, nextJob] = await Promise.all([
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
        select: { id: true, scheduledAt: true },
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
    const counters = { todayPending, overdue, future, sent, positives, archived, failed };
    const status = this.inferLiveStatus(campaign, counters, sending);
    const nextScheduledText = nextScheduledAt ? this.formatNextScheduledText(nextScheduledAt) : null;
    return {
      status,
      text:
        status === 'aguardando' && nextScheduledText
          ? nextScheduledText
          : campaign.lastStatusText || (todayPending > 0 ? `${todayPending} contatos na fila hoje.` : 'Aguardando respostas.'),
      active: campaign.status === 'running',
      campaign: this.serializeCampaign(campaign),
      counters,
      nextScheduledAt: nextScheduledAt ? nextScheduledAt.toISOString() : null,
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
    const campaign = current
      ? await this.prisma.vendasAutomationCampaign.update({
          where: { id: current.id },
          data: {
            ...data,
            searchSignature,
            status: 'running',
            createdByUserId: current.createdByUserId || context.userId,
            lastStatusText: `Buscando ${searchLabel}.`,
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
            lastStatusText: `Buscando ${searchLabel}.`,
          },
        });

    this.publishAutomationEvent({
      companyId: context.companyId,
      campaignId: campaign.id,
      status: 'buscando',
      text: campaign.lastStatusText || 'Buscando novos contatos...',
      type: 'campaign_started',
    });

    void this.scrapeImportAndSchedule(campaign.id, user, 'start').catch((error) => {
      void this.markCampaignStage(campaign.id, context.companyId, 'erro', 'Erro na prospecção automática.', {
        error: String(error?.message || error),
        type: 'campaign_error',
      });
    });

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
      scriptText: this.renderMessageTemplate(campaign.messageTemplate, {
        lead: { ...result, city: search.query.city, segment: search.query.segment },
        campaign,
        user: runtimeUser,
      }),
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

  private async scheduleJobsForCampaign(campaignId: string) {
    const campaign = await this.prisma.vendasAutomationCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== 'running') return;
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
      where: { campaignId: campaign.id, status: { notIn: ['failed', 'skipped', 'canceled'] } },
      select: { leadId: true },
    });
    const usedLeadIds = new Set(existingLeadIds.map((item) => item.leadId));
    const sourceSignature =
      [String(campaign.segment || '').trim(), String(campaign.city || '').trim()].filter(Boolean).join('|') || null;
    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId: campaign.companyId,
        sourceType: 'webscraping',
        status: { not: 'encerrado' },
        wasClosedBefore: false,
        closedAt: null,
        ...(sourceSignature ? { sourceSignature } : {}),
        phoneNormalized: { not: null },
        id: { notIn: Array.from(usedLeadIds) },
        attemptCount: { lt: Math.max(1, Number(campaign.maxAttemptsPerLead || 1)) },
      },
      orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }],
      take: slotsToFill,
    });
    const latestScheduled = await this.prisma.vendasAutomationJob.findFirst({
      where: { campaignId: campaign.id, scheduledAt: { not: null } },
      orderBy: { scheduledAt: 'desc' },
      select: { scheduledAt: true },
    });
    let cursor = this.moveToWorkingWindow(
      latestScheduled?.scheduledAt instanceof Date ? latestScheduled.scheduledAt : new Date(),
      campaign,
    );
    const data: any[] = [];
    for (const lead of leads) {
      cursor = this.moveToWorkingWindow(new Date(cursor.getTime() + Number(campaign.intervalMinutes || 12) * 60000), campaign);
      data.push({
        campaignId: campaign.id,
        companyId: campaign.companyId,
        leadId: lead.id,
        status: 'scheduled',
        scheduledAt: cursor,
        attemptNumber: Math.max(1, Number(lead.attemptCount || 0) + 1),
      });
    }
    if (data.length) {
      await this.prisma.vendasAutomationJob.createMany({ data, skipDuplicates: true });
    }
    await this.markCampaignStage(
      campaign.id,
      campaign.companyId,
      'aguardando',
      data.length ? `${pendingCount + data.length} contatos na fila.` : 'Aguardando novos contatos válidos.',
      { type: 'jobs_scheduled' },
    );
  }

  private async runWorkerCycle() {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      await this.archiveNoResponseJobs();
      await this.refillCampaignsIfNeeded();
      const dueJobs = await this.prisma.vendasAutomationJob.findMany({
        where: {
          status: 'scheduled',
          scheduledAt: { lte: new Date() },
          campaign: { status: 'running' },
        },
        include: { campaign: true, lead: true },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        take: 20,
      });
      const processedCompanies = new Set<number>();
      for (const job of dueJobs) {
        if (processedCompanies.has(job.companyId)) continue;
        processedCompanies.add(job.companyId);
        await this.processDueJob(job as any);
      }
    } finally {
      this.workerRunning = false;
    }
  }

  private async refillCampaignsIfNeeded() {
    const campaigns = await this.prisma.vendasAutomationCampaign.findMany({
      where: { status: 'running' },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    });
    for (const campaign of campaigns) {
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
    await this.prisma.$transaction(async (tx) => {
      await tx.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'no_response_archived', archivedAt: now, classification: 'no_response' },
      });
      await tx.vendasLead.updateMany({
        where: { id: job.leadId, companyId: job.companyId, status: { not: 'encerrado' } },
        data: { status: 'encerrado', wasClosedBefore: true, closedAt: now, lastResult: 'Sem resposta automática' },
      });
      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: job.leadId,
          eventType: 'lead_closed',
          title: 'Lead arquivado sem resposta',
          description: 'Prospecção fria encerrada sem nova insistência automática.',
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

  private async processDueJob(job: any) {
    const now = new Date();
    const campaign = job.campaign;
    if (!this.isInsideWorkingHours(now, campaign)) {
      const next = this.moveToWorkingWindow(now, campaign);
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { scheduledAt: next },
      });
      await this.markCampaignStage(
        campaign.id,
        campaign.companyId,
        'aguardando',
        `Próximo envio em ${next.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIME_ZONE })}.`,
        { type: 'next_send_scheduled' },
      );
      return;
    }
    const sentToday = await this.prisma.vendasAutomationJob.count({
      where: {
        campaignId: campaign.id,
        sentAt: { gte: this.startOfDay(now) },
        status: { in: ['sent', 'replied_positive', 'replied_negative', 'no_response_archived'] },
      },
    });
    if (sentToday >= Number(campaign.dailyLimit || DEFAULT_DAILY_LIMIT)) {
      const nextDay = this.addBusinessCalendarDays(now, 1);
      const next = this.parseTimeOnDate(this.moveToBusinessDay(nextDay), campaign.workingHoursStart || '09:00');
      await this.prisma.vendasAutomationJob.update({ where: { id: job.id }, data: { scheduledAt: next } });
      await this.markCampaignStage(campaign.id, campaign.companyId, 'aguardando', 'Limite diário atingido. Próximos envios amanhã.', {
        type: 'daily_limit_reached',
      });
      return;
    }
    const lead = job.lead;
    if (
      !lead ||
      String(lead.status || '') === 'encerrado' ||
      lead.closedAt ||
      lead.wasClosedBefore ||
      Number(lead.attemptCount || 0) >= Number(campaign.maxAttemptsPerLead || 1)
    ) {
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'skipped', archivedAt: now, errorMessage: 'Lead encerrado, bloqueado ou ja contatado.' },
      });
      return;
    }
    const contact = normalizeContact(lead.phoneNormalized || lead.phone);
    if (!contact) {
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'skipped', archivedAt: now, errorMessage: 'Lead sem telefone valido.' },
      });
      return;
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
    const body = this.renderMessageTemplate(campaign.messageTemplate, { lead, campaign, user: runtimeUser });
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
      });
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
    } catch (error: any) {
      await this.prisma.vendasAutomationJob.update({
        where: { id: job.id },
        data: { status: 'failed', errorMessage: String(error?.message || error) },
      });
      await this.markCampaignStage(campaign.id, campaign.companyId, 'erro', 'Falha ao enviar contato.', {
        error: String(error?.message || error),
        type: 'send_failed',
      });
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
  }) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: input.conversationId, companyId: input.companyId },
    });
    const metadata = parseJsonObject(conversation?.metadata);
    const queue = parseJsonObject((metadata as any).vendasAgendaQueue);
    const syncedAt = new Date().toISOString();
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
          sentAt: input.sentAt.toISOString(),
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
          manualSentAt: input.sentAt.toISOString(),
          lastManualSendAt: input.sentAt.toISOString(),
          botEligible: true,
          botEntryPending: true,
          syncedAt,
        },
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
    const blockedStatus = ['negative', 'opt_out', 'replied_negative', 'no_response_archived', 'interested', 'neutral', 'human_assigned'];
    const isBlocked =
      blockedStatus.includes(automationStatus) ||
      blockedStatus.includes(queueStatus) ||
      input.metadata?.humanAssigned === true ||
      input.metadata?.blacklist === true ||
      input.metadata?.blacklisted === true ||
      input.metadata?.optOut === true ||
      (queue as any).humanAssigned === true ||
      (queue as any).blacklist === true ||
      (queue as any).blacklisted === true ||
      (queue as any).optOut === true ||
      (queue as any).doNotContact === true ||
      String(job.lead.status || '') === 'encerrado' ||
      job.lead.closedAt ||
      job.lead.wasClosedBefore;
    if (isBlocked) return null;

    const normalized = normalizeKey(input.text);
    const positives = parseJsonList(job.campaign.positiveIntentKeywordsJson, DEFAULT_POSITIVE_KEYWORDS).map(normalizeKey);
    const negatives = parseJsonList(job.campaign.negativeIntentKeywordsJson, DEFAULT_NEGATIVE_KEYWORDS).map(normalizeKey);
    const optOut = containsNormalizedKeyword(normalized, OPT_OUT_INTENT_KEYWORDS);
    const humanHandoff = containsNormalizedKeyword(normalized, HUMAN_HANDOFF_INTENT_KEYWORDS);
    const negative = optOut || containsNormalizedKeyword(normalized, negatives);
    const positive = !negative && !humanHandoff && containsNormalizedKeyword(normalized, positives);

    if (negative) {
      await input.setInboundMeta(optOut ? 'vendas_prospeccao_opt_out' : 'vendas_prospeccao_negativo', false);
      await this.markNegative({ ...input, job, optOut });
      return { handled: true, classification: optOut ? 'opt_out' : 'negative' };
    }

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
