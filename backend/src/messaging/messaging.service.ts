import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import crypto from 'crypto';
import { CreateAutoReplyRuleDto, UpdateAutoReplyRuleDto } from './dto/auto-reply.dto';
import { ConversationSessionsService } from './conversation-sessions.service';
import { MessageOrchestratorService } from './message-orchestrator.service';
import { OrderDraftsService } from './order-drafts.service';
import { ConversationsService, type ConversationStatePatch } from './conversations.service';
import { resolveWhatsAppCredentials } from './whatsapp-credentials.util';
import { WhatsAppAuditService } from './whatsapp-audit.service';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import {
  DEFAULT_RECOVERY_BOT_CONFIG,
  RECOVERY_BOT_ACTION_IDS,
  type RecoveryBotButton,
  type RecoveryBotButtonActionId,
  type RecoveryBotConfig,
  normalizeRecoveryBotConfig,
} from '../hbx-recovery/recovery-bot-config';
import {
  ATENDIMENTO_BUTTON_ID_PREFIX,
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  META_TEMPLATES_REQUIRED_MESSAGE,
  buildAtendimentoAgendaActionId,
  isAtendimentoBotSetupComplete,
  isAtendimentoRecoveryActionId,
  normalizeAtendimentoAgendaConfig,
  normalizeAtendimentoBotConfig,
  parseAtendimentoAgendaActionId,
  resolveProviderCapabilitiesFromCompany,
  sanitizeAtendimentoBotConfigForTenant,
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaGroup,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
  type ProviderCapabilities,
} from '../inbox/atendimento-config';
import {
  applyMasterWhatsAppCredentials,
  resolveCompanyMercadoPagoAccess,
  isTenantOwnedMpSource,
} from '../modules/master-global-integrations.util';
import {
  classifyProspectingAutoReply,
  sanitizeFirstContactMessage,
  type ProspectingAutoReplyClassification,
} from '../vendas/prospecting-safety';
import {
  clampInteger as clampTimingInteger,
  computeHumanTimingPhases,
  computeSilenceRemainderMs,
  randomSilenceFloorMs,
} from '../vendas/prospecting-bot-timing';
import { IntentEngineService } from '../bot/intent/intent-engine.service';
import { BotConfigStoreService } from '../bot/config/bot-config-store.service';
import { LegacyRulesInboundHandler } from '../bot/pipeline/legacy-rules.handler';
import {
  buildStructuredWhatsAppLog,
  buildWhatsAppPhoneCandidates,
  extractInboundTextFromPayload,
  normalizeMetaProviderError,
  normalizeWhatsAppMessageType,
  normalizeWhatsAppPhone,
  type WhatsAppInboundNormalized,
} from './whatsapp-channel';
import { CadastrosService } from '../cadastros/cadastros.service';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';
import { WebwhatsBridgeService, type WebwhatsFetchedMessage, type WebwhatsQuotedInput } from './webwhats-bridge.service';
import { InboxRealtimeService } from './inbox-realtime.service';
import { WaSendThrottleService } from './wa-send-throttle.service';
import { WhatsAppConnectionProjectionService } from './whatsapp-connection-projection.service';
import { CreditActionUsageService } from '../credits/credit-action-usage.service';
import { ConversationAssistantRuntimeService } from '../assistente/conversation-assistant-runtime.service';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { HbxPresentationEmailService, type HbxPresentationEmailResult } from '../mail/hbx-presentation-email.service';
import {
  addBusinessHours,
  detectHbxPresentationEmailIntent,
  normalizeHbxEmail,
  type HbxPresentationEmailIntent,
} from '../mail/hbx-email-intent.util';
import { CommercialContactControlService } from '../vendas/commercial-contact-control.service';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function jitterMs(maxJitterMs: number): number {
  return Math.floor(Math.random() * Math.max(0, maxJitterMs));
}

function exponentialBackoffMs(attemptNo: number, opts?: { baseMs?: number; capMs?: number }): number {
  // attemptNo is 1-based
  const baseMs = opts?.baseMs ?? 5000;
  const capMs = opts?.capMs ?? 10 * 60 * 1000;
  const exp = Math.pow(2, clamp(attemptNo - 1, 0, 30));
  return clamp(baseMs * exp, baseMs, capMs);
}

// INTENTENGINE Sprint 5 (PR-1): exportados para o LegacyRulesInboundHandler consumir os
// MESMOS helpers do trecho legado (extração 1:1 — sem cópia que possa divergir).
export function normalizeText(text: string, caseInsensitive: boolean): string {
  const trimmed = (text ?? '').trim();
  return caseInsensitive ? trimmed.toLowerCase() : trimmed;
}

export function computeGreeting(timezone: string | null | undefined): string {
  const tz = timezone || 'America/Sao_Paulo';
  const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: tz }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === 'hour')?.value;
  const hour = Number(hourPart ?? '0');
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getLocalHour(timezone: string | null | undefined): number {
  const tz = timezone || 'America/Sao_Paulo';
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === 'hour')?.value;
  return Number(hourPart ?? '0');
}

function isWithinHourWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return true;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

function getAtendimentoGreetingConfig(config?: Partial<AtendimentoBotConfig> | null) {
  const greeting = config?.smartVariables?.greeting || {};
  const normalizeHour = (value: unknown, fallback: number) => {
    const normalized = Math.trunc(Number(value));
    return Number.isFinite(normalized) ? clamp(normalized, 0, 23) : fallback;
  };
  return {
    timezone: String(greeting.timezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo',
    morning: String(greeting.morning || 'Bom dia').trim() || 'Bom dia',
    afternoon: String(greeting.afternoon || 'Boa tarde').trim() || 'Boa tarde',
    night: String(greeting.night || 'Boa noite').trim() || 'Boa noite',
    morningStartHour: normalizeHour(greeting.morningStartHour, 3),
    afternoonStartHour: normalizeHour(greeting.afternoonStartHour, 12),
    nightStartHour: normalizeHour(greeting.nightStartHour, 18),
  };
}

function computeAtendimentoGreeting(config?: Partial<AtendimentoBotConfig> | null): string {
  const greeting = getAtendimentoGreetingConfig(config);
  const hour = getLocalHour(greeting.timezone);
  if (hour >= greeting.nightStartHour || hour < greeting.morningStartHour) return greeting.night;
  if (hour >= greeting.afternoonStartHour) return greeting.afternoon;
  return greeting.morning;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
  config?: Partial<AtendimentoBotConfig> | null,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    if (key === 'cumprimentacao') return vars[key] ?? computeAtendimentoGreeting(config);
    return vars[key] ?? '';
  });
}

const RECOVERY_FLOW_ID = 'cobranca_recovery_whatsapp_hibrido';
const RECOVERY_STEP = {
  TEMPLATE_SENT: 'aguardando_resposta_template',
  MAIN_MENU: 'cobranca_menu_principal',
  DECLINE_MENU: 'cobranca_menu_recusa',
  FOLLOWUP_PICK: 'escolhendo_periodo_followup',
  VIEWING_AMOUNT: 'exibindo_valor',
  CHOOSING_INSTALLMENTS: 'escolhendo_parcelamento',
  CONFIRMING_INSTALLMENTS: 'confirmando_parcelamento',
  LINK_GENERATED_CASH: 'link_gerado_avista',
  LINK_GENERATED_INSTALLMENTS: 'link_gerado_parcelado',
  WAITING_PAYMENT: 'aguardando_pagamento',
  HUMAN: 'atendimento_humano',
  REFUSED: 'recusado',
  FOLLOWUP_SCHEDULED: 'followup_agendado',
  CLOSED: 'encerrado',
} as const;

const RECOVERY_BUTTON_ID_PREFIX = 'hbx_recovery_';
const ATENDIMENTO_FLOW_ID = 'atendimento_whatsapp_hibrido';
const ATENDIMENTO_STEP = {
  WELCOME: 'welcome',
  MAIN_MENU: 'menu_principal',
  RECOVERY_GATE: 'recovery_detectado',
  POST_ACTION: 'pos_acao',
  HUMAN: 'atendimento_humano',
  AGENDA: 'agenda_compartilhada',
  CLOSED: 'encerrado',
  COLLECTING_NAME_CONFIRM: 'coletando_confirmacao_nome',
  COLLECTING_NAME: 'coletando_nome',
} as const;
const HBX_GATE_STEP = 'hbxGateContext';
const HBX_DYNAMIC_MENU_STEP = 'hbx_menu_dinamico';
const HBX_AGENDA_STEP = 'hbx_agenda_simples';
const HBX_CANCEL_STEP = 'hbx_cancelamento_agenda';
const HBX_EMAIL_FOLLOW_UP_DRAFT = 'Oi {{nome}}, tudo bem? Conseguiu ver a apresentação do HBX que te enviei por e-mail?';
const HBX_EMAIL_RECENT_DUPLICATE_MS = 24 * 60 * 60 * 1000;

type HbxDynamicMenuOption = {
  index: number;
  label: string;
  actionKey: string;
  routeTarget: string;
  actionId?: string | null;
  buttonId: string;
};

type HbxAgendaOption = {
  index: number;
  label: string;
  isoDate: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
};

type VendasAgendaQueueMetadata = {
  active?: boolean;
  leadId?: string | null;
  sourceModule?: string | null;
  sourceBlock?: string | null;
  queueTarget?: string | null;
  routeTarget?: string | null;
  status?: string | null;
  nextAction?: string | null;
  returnAt?: string | null;
  draftMessage?: string | null;
  draftPending?: boolean;
  syncedAt?: string | null;
  deactivatedAt?: string | null;
  lastManualSendAt?: string | null;
  manualSent?: boolean;
  manualSentAt?: string | null;
  botEligible?: boolean;
  botEntryPending?: boolean;
  whatsappAvailabilityStatus?: string | null;
};

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private readonly commercialContactControl: CommercialContactControlService;
  private pollHandle: NodeJS.Timeout | null = null;
  private readonly startedAtMs = Date.now();
  // INTENTENGINE S4: reaper roda no boot e depois a cada N ciclos do poll de 5s existente
  // (nenhum timer novo). 24 ciclos ~= 2min — barato o bastante pra não competir com o
  // processamento normal da fila, frequente o bastante pra não deixar SENDING travado por muito tempo.
  private pollCycleCount = 0;
  private readonly reaperEveryNCycles = 24;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: ConversationSessionsService,
    private readonly orchestrator: MessageOrchestratorService,
    private readonly drafts: OrderDraftsService,
    private readonly conversations: ConversationsService,
    private readonly whatsappAudit: WhatsAppAuditService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly cadastrosService: CadastrosService,
    private readonly customerProfileService: CustomerProfileService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
    private readonly inboxRealtime: InboxRealtimeService,
    private readonly intentEngine: IntentEngineService,
    private readonly waSendThrottle: WaSendThrottleService,
    @Optional() private readonly hbxPresentationEmails?: HbxPresentationEmailService,
    @Optional() private readonly botConfigStore?: BotConfigStoreService,
    // INTENTENGINE Sprint 5 (PR-1): handler do trecho legado (session orchestrator +
    // AutoReplyRule). @Optional() para não quebrar quem instancia o serviço direto nos
    // testes — quando ausente, `processPersistedInbound` monta um a partir das deps locais.
    @Optional() private readonly legacyRulesHandler?: LegacyRulesInboundHandler,
    // WEBWHATS-ARQ3 S3: writer ÚNICO da projeção de estado de conexão. @Optional() pelo mesmo
    // motivo (testes instanciam direto); ausente = carimbo de projeção é no-op, sem regressão.
    @Optional() private readonly connectionProjection?: WhatsAppConnectionProjectionService,
    // Só origens automáticas confirmadas pelo provedor usam a ação "Automação".
    @Optional() private readonly creditActionUsage?: CreditActionUsageService,
    // Assistente configurável por tenant. Opcional mantém os testes diretos e
    // instalações com a flag de publicação desligada sem mudança de runtime.
    @Optional() private readonly conversationAssistant?: ConversationAssistantRuntimeService,
  ) {
    // Guarda transitoria local: evita ampliar o grafo de DI antes do modelo canonico.
    this.commercialContactControl = new CommercialContactControlService(this.prisma, this.conversations);
  }

  onModuleInit() {
    this.webwhatsBridge.setInboundRelay(async (input) => {
      await this.handleWebwhatsSyncedInbound(input);
    });
    this.webwhatsBridge.setOutboundPersistedRelay(async (input) => {
      const normalizedStatus = String(input.status || '').trim().toUpperCase();
      await this.conversations.dispatchVendasCockpitProjection({
        companyId: input.companyId,
        conversationId: input.conversationId,
        event: normalizedStatus === 'FAILED' ? 'failed' : normalizedStatus === 'SENT' ? 'sent' : 'delivery',
        messageId: input.companyMessageId,
      });
    });
    // INTENTENGINE S4: reaper de SENDING órfão roda 1x no boot (cobre o caso mais comum —
    // processo reiniciado com mensagens travadas de antes) antes do primeiro poll.
    setImmediate(() => {
      this.reapStuckSendingMessages().catch((e) => this.logger.error(e?.message || e));
    });
    // lightweight worker; avoids extra infra
    this.pollHandle = setInterval(() => {
      this.processDueMessages().catch((e) => this.logger.error(e?.message || e));
      this.pollCycleCount += 1;
      if (this.pollCycleCount % this.reaperEveryNCycles === 0) {
        this.reapStuckSendingMessages().catch((e) => this.logger.error(e?.message || e));
      }
    }, 5000);
  }

  onModuleDestroy() {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = null;
    this.webwhatsBridge.setInboundRelay(null);
    this.webwhatsBridge.setOutboundPersistedRelay(null);
  }

  private get cloudApiBaseUrl(): string {
    return (process.env.WHATSAPP_CLOUD_API_BASE_URL || 'https://graph.facebook.com/v20.0').replace(/\/$/, '');
  }

  private shouldSendRecoveryHumanAck(company: { timezone?: string | null } | null | undefined) {
    const startHour = clamp(Number(process.env.WHATSAPP_HUMAN_ACK_START_HOUR || '8'), 0, 23);
    const endHour = clamp(Number(process.env.WHATSAPP_HUMAN_ACK_END_HOUR || '21'), 0, 23);
    const localHour = getLocalHour(company?.timezone);
    return isWithinHourWindow(localHour, startHour, endHour);
  }

  private get verifyToken(): string {
    return (
      process.env.WHATSAPP_VERIFY_TOKEN ||
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_VERIFY_TOKEN ||
      ''
    );
  }

  private get appSecret(): string {
    return process.env.WHATSAPP_APP_SECRET || '';
  }

  private get enabled(): boolean {
    return (process.env.WHATSAPP_ENABLED || 'true').toLowerCase() === 'true';
  }

  private get startupBotDispatchGuardMs(): number {
    const configured = Number(process.env.WHATSAPP_BOT_STARTUP_DISPATCH_GUARD_MS || '120000');
    if (!Number.isFinite(configured)) return 120000;
    return Math.max(0, Math.trunc(configured));
  }

  private isInsideStartupBotGuard() {
    const guardMs = this.startupBotDispatchGuardMs;
    return guardMs > 0 && Date.now() - this.startedAtMs < guardMs;
  }

  private isBotManagedOutbound(sourceModule: string | null | undefined, senderType: string | null | undefined) {
    const source = String(sourceModule || '').trim().toLowerCase();
    const sender = String(senderType || '').trim().toLowerCase();
    return sender === 'bot' || source.includes('_bot') || source.endsWith('bot') || source.includes('bot_');
  }

  private async resolveDispatchBotSuppression(input: {
    companyId: number;
    conversationId: number | null;
    to: string;
    sourceModule?: string | null;
    senderType?: string | null;
  }) {
    if (!this.isBotManagedOutbound(input.sourceModule, input.senderType)) return null;
    if (this.isInsideStartupBotGuard()) return 'backend_reiniciado_guard_publicacao';
    const conversationId = Number(input.conversationId || 0);
    if (!conversationId) return null;

    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId: input.companyId, channel: 'whatsapp' },
      select: {
        id: true,
        contact: true,
        botActive: true,
        humanAssigned: true,
        currentFlow: true,
        currentStep: true,
        flowResult: true,
        metadata: true,
      },
    });
    if (!conversation) return 'conversa_nao_encontrada';

    const metadata = this.parseConversationMetadata(conversation.metadata);
    const blockedAt = this.normalizeIsoDateTime(metadata?.atendimentoBlockedAt || metadata?.recoveryBlockedAt);
    if (conversation.humanAssigned) return 'conversa_em_atendimento_humano';
    if (conversation.botActive === false) return 'bot_desativado_na_conversa';
    if (metadata?.botOff === true || metadata?.atendimentoBotOff === true) return 'bot_off_na_conversa';
    if (this.isPersonalWhatsappContact(metadata)) return 'contato_pessoal';
    if (blockedAt) return 'conversa_bloqueada';

    const phoneNormalized = this.normalizeDigits(input.to || conversation.contact);
    if (phoneNormalized) {
      const profile = await this.prisma.customerProfile.findFirst({
        where: { companyId: input.companyId, phoneNormalized },
        select: { botOff: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
      if (profile?.botOff === true) return 'bot_off_no_perfil';
    }

    if (String(input.sourceModule || '').trim().toLowerCase() === 'atendimento_bot') {
      const tenantContext = await this.resolveAtendimentoBotSanitizationContext(input.companyId);
      const configuredBot = await this.getAtendimentoBotConfig(input.companyId, tenantContext);
      const botAiEnabled = await this.isBotArmedForCompany(input.companyId);
      if (!botAiEnabled || !isAtendimentoBotSetupComplete(configuredBot) || !configuredBot.routingRules.globalBotEnabled) {
        return 'bot_atendimento_global_desativado';
      }
    }
    if (String(input.sourceModule || '').trim().toLowerCase() === 'conversation_assistant') {
      const runtimeEnabled = ['true', '1', 'yes', 'on'].includes(
        String(process.env.HBX_ASSISTENTE_PUBLISH_ENABLED || '').trim().toLowerCase(),
      );
      const config = runtimeEnabled
        ? await this.prisma.assistenteConfig.findUnique({
            where: { companyId: input.companyId },
            select: { published: true },
          })
        : null;
      if (!runtimeEnabled || !config?.published) return 'assistente_despublicada';
    }

    return null;
  }

  private async cancelOutboundBeforeDispatch(input: {
    outboundMessageId: number;
    attemptId: number;
    companyId: number;
    companyMessageId?: number | null;
    conversationId: number | null;
    to: string;
    messageType: string;
    sourceModule?: string | null;
    reason: string;
  }) {
    const now = new Date();
    const error = `Envio automatico cancelado: ${input.reason}`;
    await this.prisma.outboundAttempt.update({
      where: { id: input.attemptId },
      data: {
        finishedAt: now,
        success: false,
        error,
        responseBody: 'dispatch_suppressed',
      },
    });
    await this.prisma.outboundMessage.update({
      where: { id: input.outboundMessageId },
      data: {
        status: 'CANCELED',
        failedAt: null,
        lastError: error,
        deliveryStatus: 'canceled',
      },
    });
    await this.prisma.companyMessage.updateMany({
      where: { outboundMessageId: input.outboundMessageId },
      data: { status: 'CANCELED', error },
    });
    await this.commercialContactControl.syncAutomationStepFromOutbound({
      companyId: input.companyId,
      outboundMessageId: input.outboundMessageId,
      status: 'canceled',
      errorCode: input.reason,
      errorMessage: error,
    }).catch(() => null);
    await this.logWhatsAppEvent({
      companyId: input.companyId,
      scope: 'dispatch',
      event: 'outbound_suppressed',
      level: 'WARN',
      message: `Envio automatico cancelado para ${input.to}`,
      conversationId: input.conversationId,
      phone: input.to,
      messageType: input.messageType,
      result: 'suppressed',
      reason: input.reason,
      extra: {
        outboundMessageId: input.outboundMessageId,
        sourceModule: input.sourceModule || null,
      },
    });
    if (input.conversationId) {
      await this.conversations.dispatchVendasCockpitProjection?.({
        companyId: input.companyId,
        conversationId: input.conversationId,
        event: 'canceled',
        messageId: input.companyMessageId || null,
      });
    }
  }

  private async supportsWhatsAppEndpointTable() {
    return this.prisma.hasTable('CompanyWhatsAppEndpoint');
  }

  private async supportsOutboundEndpointColumn() {
    return this.prisma.hasColumn('OutboundMessage', 'whatsappEndpointId');
  }

  private async findCompanyWithOptionalEndpoints(companyId: number) {
    const company = (await this.supportsWhatsAppEndpointTable())
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

    const resolved = await applyMasterWhatsAppCredentials(this.prisma, company);
    return resolved.company || null;
  }

  private async resolveAtendimentoBotSanitizationContext(companyId: number): Promise<{
    providerCapabilities: ProviderCapabilities;
    recoveryEnabled: boolean;
  }> {
    const [company, recoveryModule] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          whatsappConnectionMode: true,
          // Guarda de suspensao: campos lidos por resolveCompanyAccessState.
          companyKind: true,
          slug: true,
          status: true,
          accountType: true,
          trialEndsAt: true,
          billingGraceEndsAt: true,
          courtesyEndsAt: true,
        },
      }),
      // PR10072026 W1: efetivo = masterEnabled && enabled (teto do master conta).
      this.prisma.companyModule?.findFirst
        ? this.prisma.companyModule.findFirst({
            where: {
              companyId,
              enabled: true,
              masterEnabled: true,
              systemModule: { key: 'hbx_recovery' },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    // Empresa suspensa/overdue/pending_checkout nao roda recovery no inbound.
    // W1 removeu o wipe que desligava os modulos; a guarda de acesso passa a ser aqui.
    const acesso = resolveCompanyAccessState(company as any);
    return {
      providerCapabilities: resolveProviderCapabilitiesFromCompany(company),
      recoveryEnabled: Boolean(recoveryModule?.id) && acesso.canUse,
    };
  }

  private async isBotArmedForCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { botArmedAt: true },
    });
    return Boolean(company?.botArmedAt);
  }

  private computeWebhookSignature(rawBody: Buffer): string {
    const hmac = crypto.createHmac('sha256', this.appSecret);
    hmac.update(rawBody);
    return `sha256=${hmac.digest('hex')}`;
  }

  verifyWebhookSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    if (!this.appSecret) return true; // verification optional
    if (!rawBody || !rawBody.length) return false;
    const expected = this.computeWebhookSignature(rawBody);
    const got = String(signatureHeader || '');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
    } catch {
      return false;
    }
  }

  getWebhookVerifyToken(): string {
    return this.verifyToken;
  }

  private async logWhatsAppEvent(input: {
    companyId?: number | null;
    scope: string;
    event: string;
    level?: 'INFO' | 'WARN' | 'ERROR';
    message: string;
    customerId?: string | null;
    conversationId?: number | null;
    phone?: string | null;
    templateName?: string | null;
    messageType?: string | null;
    flowStep?: string | null;
    result?: string | null;
    reason?: string | null;
    extra?: Record<string, unknown> | null;
  }) {
    const metadata = buildStructuredWhatsAppLog({
      companyId: input.companyId,
      customerId: input.customerId,
      conversationId: input.conversationId,
      phone: input.phone,
      templateName: input.templateName,
      messageType: input.messageType,
      flowStep: input.flowStep,
      result: input.result,
      reason: input.reason,
      extra: input.extra || null,
    });
    await this.whatsappAudit.log({
      companyId: Number(input.companyId || 0),
      scope: input.scope,
      event: input.event,
      level: input.level,
      message: input.message,
      metadata,
    });
  }

  private normalizeProviderDispatchError(error: any, fallback: string) {
    return normalizeMetaProviderError(error, fallback);
  }

  private requireCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Company context required');
    return companyId;
  }

  private normalizeDigits(value: string): string {
    return String(value || '').replace(/\D/g, '');
  }

  private getPublicApiBaseUrl(): string {
    const explicit = process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL || '';
    if (String(explicit).trim()) return String(explicit).trim().replace(/\/+$/, '');
    return `http://localhost:${Number(process.env.APP_PORT || 3000)}`;
  }

  // INTENTENGINE S3: idem — sai da tabela emprestada, entra pelo BotConfigStoreService.
  private async getRecoveryBotConfig(companyId: number): Promise<RecoveryBotConfig> {
    const payload = this.botConfigStore
      ? await this.botConfigStore.get(companyId, 'recovery_bot')
      : null;
    if (!payload) return DEFAULT_RECOVERY_BOT_CONFIG;
    return normalizeRecoveryBotConfig(payload as any);
  }

  private async resolveRecoveryDebtCaseId(companyId: number, customer: any) {
    const customerProfileId = String(customer?.customerProfileId || '').trim();
    if (!customerProfileId) return null;

    const existing = await this.prisma.debtCase.findFirst({
      where: {
        companyId,
        customerProfileId,
        sourceProvider: 'HBX_RECOVERY',
        status: 'open',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    if (existing?.id) return String(existing.id);

    const created = await this.prisma.debtCase.create({
      data: {
        companyId,
        customerProfileId,
        sourceProvider: 'HBX_RECOVERY',
        amount: Number(customer?.openAmount || 0),
        dueDate: customer?.createdAt ? new Date(customer.createdAt) : null,
        status: 'open',
        rawPayloadJson: JSON.stringify({
          source: 'messaging.recovery.autoPayment',
          recoveryCustomerId: String(customer?.id || ''),
        }),
      },
      select: { id: true },
    });
    return String(created.id);
  }

  private formatCurrencyBRL(value: number) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private formatDatePtBR(date: Date) {
    return date.toLocaleDateString('pt-BR');
  }

  private isRecoveryInitialTemplateMessage(message: {
    sourceModule?: string | null;
    messageType?: string | null;
    contactId?: string | null;
  }) {
    return (
      String(message?.sourceModule || '').trim() === 'hbx_recovery_bot' &&
      String(message?.messageType || '').trim().toLowerCase() === 'template' &&
      String(message?.contactId || '').trim().length > 0
    );
  }

  private recoveryTemplateLastContactLabel(
    status: 'sent' | 'delivered' | 'read' | 'failed',
    at: Date,
  ) {
    const dateLabel = this.formatDatePtBR(at);
    if (status === 'failed') return `Falha no template inicial em ${dateLabel}`;
    if (status === 'read') return `Template inicial lido em ${dateLabel}`;
    if (status === 'delivered') return `Template inicial entregue em ${dateLabel}`;
    return `Template inicial aceito pela Meta em ${dateLabel}`;
  }

  private async updateRecoveryTemplateLastContact(
    message: {
      companyId: number;
      contactId?: string | null;
      sourceModule?: string | null;
      messageType?: string | null;
    },
    status: 'sent' | 'delivered' | 'read' | 'failed',
    at: Date,
  ) {
    if (!this.isRecoveryInitialTemplateMessage(message)) return;
    const customerId = String(message.contactId || '').trim();
    if (!customerId) return;
    await this.prisma.hbxRecoveryCustomer.updateMany({
      where: {
        companyId: Number(message.companyId || 0),
        id: customerId,
      },
      data: {
        lastContact: this.recoveryTemplateLastContactLabel(status, at),
      },
    });
  }

  private async updateRecoveryTemplateLastContactByProviderMessage(
    providerMessageId: string,
    status: 'delivered' | 'read' | 'failed',
    at: Date,
  ) {
    const outbound = await this.prisma.outboundMessage.findUnique({
      where: { providerMessageId },
      select: {
        companyId: true,
        contactId: true,
        sourceModule: true,
        messageType: true,
      },
    });
    if (!outbound) return;
    await this.updateRecoveryTemplateLastContact(outbound, status, at);
  }

  private async buildRecoveryTemplateVars(companyId: number, customer: any) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const createdAt = customer?.createdAt ? new Date(customer.createdAt) : new Date();
    return {
      operador_nome: 'Equipe HBX',
      empresa_cobradora: String(company?.name || 'HBX Solutions'),
      cliente_nome: String(customer?.clientName || '').trim() || 'contato responsavel',
      empresa_nome: String(customer?.name || ''),
      valor_em_aberto: this.formatCurrencyBRL(Number(customer?.openAmount || 0)),
      dia_registro: this.formatDatePtBR(createdAt),
    };
  }

  private getRecoveryRootInteractive(config: RecoveryBotConfig, prompt: string) {
    return {
      type: 'button',
      body: { text: prompt },
      footer: { text: config.rootFooter },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'hbx_recovery_option_pix', title: config.optionPixLabel } },
          { type: 'reply', reply: { id: 'hbx_recovery_option_card', title: config.optionCardLabel } },
          { type: 'reply', reply: { id: 'hbx_recovery_option_agent', title: config.optionAgentLabel } },
        ],
      },
    };
  }

  private getRecoveryPaymentOptionsInteractive(config: RecoveryBotConfig) {
    return {
      type: 'button',
      body: { text: 'Perfeito. Escolha como deseja seguir o pagamento:' },
      footer: { text: config.rootFooter },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'hbx_recovery_payment_pix', title: 'Gerar Pix' } },
          { type: 'reply', reply: { id: 'hbx_recovery_payment_card', title: 'Pagamento cartao' } },
          { type: 'reply', reply: { id: 'hbx_recovery_payment_agent', title: 'Falar atendente' } },
        ],
      },
    };
  }

  private getRecoveryHumanTopicsInteractive(config: RecoveryBotConfig) {
    return {
      type: 'list',
      body: { text: config.topicsPrompt },
      footer: { text: config.rootFooter },
      action: {
        button: config.topicsButtonLabel,
        sections: [
          {
            title: 'Assuntos',
            rows: config.topics.map((topic) => ({
              id: topic.id,
              title: topic.title,
              description: topic.description,
            })),
          },
        ],
      },
    };
  }

  private normalizeActionLabel(value: string) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[!?.,;:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildButtonFallbackText<TButton extends { title?: string | null }>(
    body: string,
    buttons: TButton[],
  ) {
    const normalizedBody = String(body || '').trim();
    const labels = (buttons || [])
      .map((button) => String(button?.title || '').trim())
      .filter(Boolean);
    if (!labels.length) return normalizedBody;
    return `${normalizedBody}\n\n${labels.map((label, index) => `${index + 1}. ${label}`).join('\n')}`.trim();
  }

  private buildInteractiveFallbackText(payload: Record<string, any> | null | undefined, fallbackBody: string) {
    const body = String(payload?.body?.text || fallbackBody || '').trim();
    const labels: string[] = [];
    for (const button of Array.isArray(payload?.action?.buttons) ? payload.action.buttons : []) {
      const title = String(button?.reply?.title || button?.title || '').trim();
      if (title) labels.push(title);
    }
    for (const section of Array.isArray(payload?.action?.sections) ? payload.action.sections : []) {
      for (const row of Array.isArray(section?.rows) ? section.rows : []) {
        const title = String(row?.title || '').trim();
        if (title) labels.push(title);
      }
    }
    if (!labels.length) return body;
    return `${body}\n\n${labels.map((label, index) => `${index + 1}. ${label}`).join('\n')}`.trim();
  }

  private flattenRecoveryButtons(config: RecoveryBotConfig) {
    return [
      ...(config.mainMenuButtons || []),
      ...(config.declineMenuButtons || []),
      ...(config.followupButtons || []),
      ...(config.valueButtons || []),
      ...(config.installmentButtons || []),
      ...(config.installmentConfirmButtons || []),
      ...(config.postLinkButtons || []),
    ];
  }

  private flattenAtendimentoButtons(config: AtendimentoBotConfig) {
    return [
      ...(config.welcomeButtons || []),
      ...(config.returningCustomerButtons || []),
      ...(config.mainMenuButtons || []),
      ...(config.recoveryDetectedButtons || []),
      ...(config.postActionButtons || []),
    ];
  }

  private pickNumberedButtonAction<TButton extends { actionId?: string | null }>(
    rawText: string | null | undefined,
    buttons: TButton[],
  ) {
    const index = Number(String(rawText || '').trim());
    if (!Number.isInteger(index) || index < 1) return '';
    return String((buttons || [])[index - 1]?.actionId || '').trim().toLowerCase();
  }

  private getRecoveryButtonsForStep(config: RecoveryBotConfig, step?: string | null): RecoveryBotButton[] {
    const normalized = String(step || '').trim().toLowerCase();
    if (normalized === RECOVERY_STEP.DECLINE_MENU) return config.declineMenuButtons || [];
    if (normalized === RECOVERY_STEP.FOLLOWUP_PICK) return config.followupButtons || [];
    if (normalized === RECOVERY_STEP.VIEWING_AMOUNT) return config.valueButtons || [];
    if (normalized === RECOVERY_STEP.CHOOSING_INSTALLMENTS) return config.installmentButtons || [];
    if (normalized === RECOVERY_STEP.CONFIRMING_INSTALLMENTS) return config.installmentConfirmButtons || [];
    if (normalized === RECOVERY_STEP.LINK_GENERATED_CASH || normalized === RECOVERY_STEP.LINK_GENERATED_INSTALLMENTS) {
      return config.postLinkButtons || [];
    }
    return config.mainMenuButtons || [];
  }

  private getAtendimentoButtonsForStep(config: AtendimentoBotConfig, step?: string | null): AtendimentoBotButton[] {
    const normalized = String(step || '').trim().toLowerCase();
    if (normalized === ATENDIMENTO_STEP.RECOVERY_GATE) return config.recoveryDetectedButtons || [];
    if (normalized === ATENDIMENTO_STEP.POST_ACTION) return config.postActionButtons || [];
    if (normalized === ATENDIMENTO_STEP.AGENDA) return config.postActionButtons || [];
    if (normalized === ATENDIMENTO_STEP.WELCOME) return config.welcomeButtons || [];
    return config.mainMenuButtons || [];
  }

  private toRecoveryButtonId(buttonId: string) {
    return `${RECOVERY_BUTTON_ID_PREFIX}${String(buttonId || '').trim()}`;
  }

  private fromRecoveryButtonId(rawId: string): string {
    const normalized = String(rawId || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.startsWith(RECOVERY_BUTTON_ID_PREFIX)) {
      return normalized.slice(RECOVERY_BUTTON_ID_PREFIX.length);
    }
    return normalized;
  }

  private mapLegacyRecoveryActionId(rawActionId: string): string {
    const normalized = String(rawActionId || '').trim().toLowerCase();
    if (!normalized) return '';
    const legacyMap: Record<string, string> = {
      template_yes: 'template_yes',
      template_no: 'template_no',
      hbx_recovery_template_yes: 'template_yes',
      hbx_recovery_template_no: 'template_no',
      hbx_recovery_option_pix: 'view_amount',
      hbx_recovery_option_card: 'choose_installments',
      hbx_recovery_option_agent: 'talk_human',
      hbx_recovery_view_amount: 'view_amount',
      hbx_recovery_installments: 'choose_installments',
      hbx_recovery_pay_full: 'pay_full',
      hbx_recovery_talk_later: 'talk_later',
      hbx_recovery_close_topic: 'close_topic',
      hbx_recovery_followup_today: 'followup_today',
      hbx_recovery_followup_tomorrow: 'followup_tomorrow',
      hbx_recovery_followup_week: 'followup_week',
      hbx_recovery_installment_2: 'installment_2',
      hbx_recovery_installment_3: 'installment_3',
      hbx_recovery_installment_4: 'installment_4',
      hbx_recovery_installment_5: 'installment_5',
      hbx_recovery_generate_installment_link: 'generate_installment_link',
      hbx_recovery_paid_claim: 'paid_claim',
      hbx_recovery_payment_pix: 'pay_full',
      hbx_recovery_payment_card: 'choose_installments',
      hbx_recovery_payment_agent: 'talk_human',
    };
    if (legacyMap[normalized]) return legacyMap[normalized];
    const stripped = this.fromRecoveryButtonId(normalized);
    if (RECOVERY_BOT_ACTION_IDS.includes(stripped as RecoveryBotButtonActionId)) {
      return stripped;
    }
    return stripped;
  }

  private resolveRecoveryActionIdFromButtonId(config: RecoveryBotConfig, rawButtonId: string) {
    const normalized = this.fromRecoveryButtonId(rawButtonId);
    if (!normalized) return '';
    const matchedButton = this.flattenRecoveryButtons(config).find(
      (button) => String(button.buttonId || '').trim().toLowerCase() === normalized,
    );
    if (matchedButton?.actionId) {
      return String(matchedButton.actionId || '').trim().toLowerCase();
    }
    return '';
  }

  private buildRecoveryActionAliasMap(config: RecoveryBotConfig) {
    const aliasMap: Record<string, string> = {
      sim: 'template_yes',
      'nao obrigado': 'template_no',
      'nao, obrigado': 'template_no',
      nao: 'template_no',
    };

    const mergeButtons = (buttons: RecoveryBotButton[]) => {
      for (const button of buttons) {
        const label = this.normalizeActionLabel(button.title);
        if (!label) continue;
        aliasMap[label] = button.actionId;
      }
    };

    mergeButtons(config.mainMenuButtons || []);
    mergeButtons(config.declineMenuButtons || []);
    mergeButtons(config.followupButtons || []);
    mergeButtons(config.valueButtons || []);
    mergeButtons(config.installmentButtons || []);
    mergeButtons(config.installmentConfirmButtons || []);
    mergeButtons(config.postLinkButtons || []);

    // Fallback aliases for common template labels and older wording.
    aliasMap['pagar agora'] = aliasMap['pagar agora'] || 'pay_full';
    aliasMap['parcelar'] = aliasMap['parcelar'] || 'choose_installments';
    aliasMap['pagar no credito'] = aliasMap['pagar no credito'] || 'choose_installments';
    aliasMap['cartao de credito'] = aliasMap['cartao de credito'] || 'choose_installments';
    aliasMap['credito'] = aliasMap['credito'] || 'choose_installments';
    aliasMap['falar com atendente'] = aliasMap['falar com atendente'] || 'talk_human';
    aliasMap['fale conosco'] = aliasMap['fale conosco'] || 'talk_human';
    aliasMap['preciso de ajuda'] = aliasMap['preciso de ajuda'] || 'talk_human';
    aliasMap['ja paguei'] = aliasMap['ja paguei'] || 'paid_claim';
    aliasMap['gerar link'] = aliasMap['gerar link'] || 'generate_installment_link';
    aliasMap['alterar parcelas'] = aliasMap['alterar parcelas'] || 'choose_installments';
    aliasMap['gerar link no credito'] = aliasMap['gerar link no credito'] || 'choose_installments';
    aliasMap['hoje mais tarde'] = aliasMap['hoje mais tarde'] || 'followup_today';
    aliasMap['amanha'] = aliasMap['amanha'] || 'followup_tomorrow';
    aliasMap['esta semana'] = aliasMap['esta semana'] || 'followup_week';
    aliasMap['revisar e pagar'] = aliasMap['revisar e pagar'] || 'pay_full';
    aliasMap['review and pay'] = aliasMap['review and pay'] || 'pay_full';

    for (const action of config.actionCatalog || []) {
      const label = this.normalizeActionLabel(String(action.title || ''));
      if (label) aliasMap[label] = String(action.actionId || '').trim().toLowerCase();
    }

    return aliasMap;
  }

  private getRecoveryActionGuide(config: RecoveryBotConfig, actionId: string) {
    const normalized = String(actionId || '').trim().toLowerCase();
    return (config.actionCatalog || []).find(
      (action) => String(action.actionId || '').trim().toLowerCase() === normalized,
    );
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

  private getWebwhatsWebhookSecret() {
    return String(
      process.env.WHATSAPP_MODAL_WEBHOOK_SECRET ||
        process.env.WEBWHATS_WEBHOOK_SECRET ||
        process.env.WHATSAPP_WEBWHATS_WEBHOOK_SECRET ||
        '',
    ).trim();
  }

  private getHeaderValue(headers: Record<string, any> | undefined, name: string) {
    const expected = name.toLowerCase();
    const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === expected);
    const value = entry?.[1];
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
  }

  private verifyWebwhatsWebhookSecret(input: {
    headers?: Record<string, any>;
    query?: Record<string, any>;
    payload?: any;
  }) {
    const expected = this.getWebwhatsWebhookSecret();
    if (!expected) return true;
    const authorization = this.getHeaderValue(input.headers, 'authorization').replace(/^Bearer\s+/i, '').trim();
    const candidates = [
      this.getHeaderValue(input.headers, 'x-webwhats-secret'),
      this.getHeaderValue(input.headers, 'x-hbx-webhook-secret'),
      this.getHeaderValue(input.headers, 'x-webhook-secret'),
      authorization,
      String(input.query?.secret || input.query?.token || '').trim(),
      String(input.payload?.secret || input.payload?.token || '').trim(),
    ].filter(Boolean);
    return candidates.some((candidate) => candidate === expected);
  }

  private safeWebhookPayload(value: unknown, depth = 0): unknown {
    if (depth > 8) return '[max-depth]';
    if (value === null || value === undefined) return value;
    if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
    if (typeof value === 'string') {
      const compact = value.trim();
      if (compact.length > 600 && /^[a-zA-Z0-9+/=\s:_-]+$/.test(compact)) {
        return `[redacted-large-string:${compact.length}]`;
      }
      if (compact.length > 4000) return `${compact.slice(0, 4000)}...[truncated:${compact.length}]`;
      return value;
    }
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.slice(0, 80).map((item) => this.safeWebhookPayload(item, depth + 1));
    }
    const result: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('token') ||
        normalizedKey.includes('secret') ||
        normalizedKey.includes('apikey') ||
        normalizedKey.includes('api_key') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('password')
      ) {
        result[key] = '[redacted]';
        continue;
      }
      result[key] = this.safeWebhookPayload(raw, depth + 1);
    }
    return result;
  }

  private stringifySafeWebhookPayload(payload: unknown) {
    try {
      return JSON.stringify(this.safeWebhookPayload(payload));
    } catch {
      return JSON.stringify({ error: 'payload_unserializable' });
    }
  }

  private extractWebwhatsEventName(payload: any) {
    return String(
      payload?.event ||
        payload?.eventName ||
        payload?.type ||
        payload?.action ||
        payload?.data?.event ||
        payload?.data?.eventName ||
        'webwhats_event',
    ).trim() || 'webwhats_event';
  }

  private parseCompanyIdCandidate(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    const direct = Number(normalized);
    if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
    const match = normalized.match(/(?:^|[^a-z0-9])company[-_: ]?(\d+)(?:$|[^a-z0-9])/i);
    if (match?.[1]) return Number(match[1]);
    return null;
  }

  private findWebwhatsCompanyId(payload: any, query?: Record<string, any>) {
    const payloadCandidates = [
      payload?.companyId,
      payload?.company_id,
      payload?.tenantId,
      payload?.instance,
      payload?.instanceName,
      payload?.instanceId,
      payload?.session,
      payload?.data?.companyId,
      payload?.data?.company_id,
      payload?.data?.tenantId,
      payload?.data?.instance,
      payload?.data?.instanceName,
      payload?.data?.instanceId,
      payload?.data?.session,
    ];
    for (const candidate of payloadCandidates) {
      const parsed = this.parseCompanyIdCandidate(candidate);
      if (parsed) return parsed;
    }

    const stack: unknown[] = [payload];
    let inspected = 0;
    while (stack.length && inspected < 160) {
      inspected += 1;
      const current = stack.shift();
      if (!current || typeof current !== 'object') continue;
      if (Array.isArray(current)) {
        stack.push(...current.slice(0, 20));
        continue;
      }
      for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
        if (/company|tenant|instance|session/i.test(key)) {
          const parsed = this.parseCompanyIdCandidate(value);
          if (parsed) return parsed;
        }
        if (value && typeof value === 'object') stack.push(value);
      }
    }

    const fallbackCandidates = [
      query?.companyId,
      query?.company_id,
    ];
    for (const candidate of fallbackCandidates) {
      const parsed = this.parseCompanyIdCandidate(candidate);
      if (parsed) return parsed;
    }

    return null;
  }

  // POR USUÁRIO: extrai o instanceName cru do webhook (`company-{id}` ou `company-{id}-user-{n}`)
  // p/ atribuir o inbound à sessão do user DONO do número — não à sessão genérica da empresa.
  private findWebwhatsTenantKey(payload: any, query?: Record<string, any>): string | null {
    const isTenantKey = (value: unknown) =>
      /^company-\d+(?:-user-\d+)?$/i.test(String(value || '').trim());
    const direct = [
      payload?.instance,
      payload?.instanceName,
      payload?.session,
      payload?.data?.instance,
      payload?.data?.instanceName,
      payload?.data?.session,
      query?.instance,
      query?.instanceName,
    ];
    for (const candidate of direct) {
      const normalized = String(candidate || '').trim();
      if (isTenantKey(normalized)) return normalized;
    }

    const stack: unknown[] = [payload];
    let inspected = 0;
    while (stack.length && inspected < 160) {
      inspected += 1;
      const current = stack.shift();
      if (!current || typeof current !== 'object') continue;
      if (Array.isArray(current)) {
        stack.push(...current.slice(0, 20));
        continue;
      }
      for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
        if (/instance|session/i.test(key) && isTenantKey(value)) {
          return String(value).trim();
        }
        if (value && typeof value === 'object') stack.push(value);
      }
    }
    return null;
  }

  // GATEWAY-WA S2: valida o tenantKey que o consumer da outbox conhece pela fila. Só aceita
  // `company-{id}` ou `company-{id}-user-{n}` da MESMA empresa resolvida — evita que um evento
  // de fila com instanceName inconsistente contamine a atribuição por-usuário.
  private normalizeWebwhatsTenantKeyOverride(raw: string | null | undefined, companyId: number): string | null {
    const normalized = String(raw || '').trim();
    const match = normalized.match(/^company-(\d+)(?:-user-\d+)?$/i);
    if (!match?.[1]) return null;
    if (Number(match[1]) !== Number(companyId)) return null;
    return normalized;
  }

  private parseWebwhatsUserIdFromTenantKey(tenantKey: string | null, companyId: number) {
    const match = String(tenantKey || '').trim().match(/^company-(\d+)-user-(\d+)$/i);
    if (!match?.[1] || !match?.[2]) return null;
    if (Number(match[1]) !== Number(companyId)) return null;
    const userId = Number(match[2]);
    return Number.isFinite(userId) && userId > 0 ? Math.floor(userId) : null;
  }

  private firstWebwhatsString(...values: unknown[]) {
    for (const value of values) {
      const normalized = String(value || '').trim();
      if (normalized) return normalized;
    }
    return null;
  }

  private normalizeWebwhatsSessionPhone(value: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    const digits = normalized.split('@')[0].replace(/\D/g, '');
    return digits.length >= 8 ? digits : null;
  }

  private parseWebwhatsSessionMetadata(value: unknown) {
    if (!value) return {};
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }

  private getWebwhatsConnectionState(payload: any) {
    return this.firstWebwhatsString(
      payload?.data?.state,
      payload?.data?.status,
      payload?.data?.connectionStatus,
      payload?.instance?.state,
      payload?.instance?.status,
      payload?.instance?.connectionStatus,
      payload?.state,
      payload?.status,
      payload?.connectionStatus,
    )?.toLowerCase() || null;
  }

  private getWebwhatsConnectionPhone(payload: any) {
    return this.firstWebwhatsString(
      payload?.data?.wuid,
      payload?.data?.ownerJid,
      payload?.data?.owner,
      payload?.data?.phone,
      payload?.data?.phoneNumber,
      payload?.data?.number,
      payload?.data?.sender,
      payload?.instance?.ownerJid,
      payload?.instance?.owner,
      payload?.instance?.phone,
      payload?.instance?.phoneNumber,
      payload?.instance?.number,
      payload?.ownerJid,
      payload?.owner,
      payload?.phone,
      payload?.phoneNumber,
      payload?.number,
      payload?.sender,
    );
  }

  private isWebwhatsConnectedState(state: string | null) {
    return Boolean(state && ['connected', 'open', 'ready', 'active', 'authenticated', 'logged_in', 'online'].includes(state));
  }

  private isWebwhatsDisconnectedState(eventName: string, state: string | null) {
    const normalizedEvent = String(eventName || '').trim().toLowerCase();
    return (
      normalizedEvent === 'logout_instance' ||
      Boolean(state && ['disconnected', 'close', 'closed', 'stopped', 'logged_out', 'terminated', 'offline', 'not_connected'].includes(state))
    );
  }

  private async reconcileWebwhatsConnectionWebhook(input: {
    companyId: number;
    tenantKey: string | null;
    eventName: string;
    payload: any;
  }) {
    const companyId = Number(input.companyId || 0);
    const tenantKey = String(input.tenantKey || '').trim();
    if (!companyId || !tenantKey) return null;

    const state = this.getWebwhatsConnectionState(input.payload);
    const connected = this.isWebwhatsConnectedState(state);
    const disconnected = this.isWebwhatsDisconnectedState(input.eventName, state);
    if (!connected && !disconnected) return null;

    const now = new Date();
    const userId = this.parseWebwhatsUserIdFromTenantKey(tenantKey, companyId);
    const rawPhone = this.getWebwhatsConnectionPhone(input.payload);
    const phoneNormalized = this.normalizeWebwhatsSessionPhone(rawPhone);
    const displayPhone = rawPhone || (phoneNormalized ? `${phoneNormalized}@s.whatsapp.net` : null);

    if (disconnected) {
      const result = await this.prisma.whatsAppConnectionSession.updateMany({
        where: {
          companyId,
          provider: 'webwhats',
          tenantKey,
          status: 'active',
        },
        data: {
          status: 'disconnected',
          disconnectedAt: now,
          // WEBWHATS-ARQ3 S3: carimbo da projeção junto com a transição (push = fonte fresca).
          // motorState 'close' + carimbo AGORA fazem o painel Equipe/selo pararem de mentir
          // "Conectado" imediatamente, sem depender do próximo poll.
          lastReconciledAt: now,
          motorState: 'close',
        },
      });
      return { action: 'disconnected', count: result.count };
    }

    const buildMeta = (prev?: unknown) =>
      JSON.stringify({
        ...this.parseWebwhatsSessionMetadata(prev),
        source: 'webhook_connection_update',
        eventName: input.eventName,
        rawStatus: state,
        profileName: this.firstWebwhatsString(input.payload?.data?.profileName, input.payload?.profileName),
        recordedAt: now.toISOString(),
      });

    const currentActive = await this.prisma.whatsAppConnectionSession.findFirst({
      where: { companyId, provider: 'webwhats', tenantKey, status: 'active' },
      orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, phoneNormalized: true, displayPhone: true, metadataJson: true, userId: true },
    });

    const byPhone = phoneNormalized
      ? await this.prisma.whatsAppConnectionSession.findFirst({
          where: { companyId, provider: 'webwhats', tenantKey, phoneNormalized },
          orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, displayPhone: true, metadataJson: true, userId: true },
        })
      : null;

    let session: { id: string };
    if (byPhone?.id) {
      const data: any = {
        tenantKey,
        status: 'active',
        connectedAt: now,
        disconnectedAt: null,
        wipedAt: null,
        metadataJson: buildMeta(byPhone.metadataJson),
      };
      if (displayPhone && !byPhone.displayPhone) data.displayPhone = displayPhone;
      if (userId && !byPhone.userId) data.userId = userId;
      session = await this.prisma.whatsAppConnectionSession.update({
        where: { id: String(byPhone.id) },
        data,
        select: { id: true },
      });
    } else if (currentActive?.id && (!currentActive.phoneNormalized || !phoneNormalized)) {
      const data: any = {
        tenantKey,
        status: 'active',
        connectedAt: now,
        disconnectedAt: null,
        wipedAt: null,
        metadataJson: buildMeta(currentActive.metadataJson),
      };
      if (phoneNormalized && !currentActive.phoneNormalized) data.phoneNormalized = phoneNormalized;
      if (displayPhone && !currentActive.displayPhone) data.displayPhone = displayPhone;
      if (userId && !currentActive.userId) data.userId = userId;
      session = await this.prisma.whatsAppConnectionSession.update({
        where: { id: String(currentActive.id) },
        data,
        select: { id: true },
      });
    } else {
      session = await this.prisma.whatsAppConnectionSession.create({
        data: {
          companyId,
          provider: 'webwhats',
          tenantKey,
          phoneNormalized,
          displayPhone,
          status: 'active',
          connectedAt: now,
          metadataJson: buildMeta(),
          userId,
        },
        select: { id: true },
      });
    }

    await this.prisma.whatsAppConnectionSession.updateMany({
      where: {
        companyId,
        provider: 'webwhats',
        tenantKey,
        status: 'active',
        NOT: { id: String(session.id) },
      },
      data: {
        status: 'disconnected',
        disconnectedAt: now,
        // WEBWHATS-ARQ3 S3: as sessões desbancadas também são fantasmas em potencial → carimba
        // close para que nenhum leitor as trate como vivas.
        lastReconciledAt: now,
        motorState: 'close',
      },
    });

    // WEBWHATS-ARQ3 S3 — carimbo da projeção na sessão VENCEDORA (writer único). motorState
    // 'open' + lastReconciledAt=agora tornam esta a verdade fresca que os painéis leem. O
    // reconcile* acima já setou connectedAt=now nesta sessão (push sempre bumpa em close→open),
    // então não pedimos re-bump aqui. Best-effort — nunca derruba o processamento do webhook.
    await this.connectionProjection?.stampProjection(String(session.id), 'open', { at: now });

    // Trava de ponteiro (espelha o PR4 no whatsapp-modal, que só cobria o status-poll):
    // no modo individual o currentWhatsappConnectionSessionId NÃO pode cair na sessão de um
    // VENDEDOR — senão operações company-scoped (automação/bot/envio sem userId) saem pela
    // linha dele. Este é o caminho do WEBHOOK (re-link/CONNECTION_UPDATE), que setava o
    // ponteiro pra QUALQUER sessão que reconectava (foi como o user-33 capturou o ponteiro
    // da company 5 no re-link pós-deploy). Só aponta quando é seguro.
    if (await this.webhookPointerAllowedForSession(companyId, userId)) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: { currentWhatsappConnectionSessionId: String(session.id) },
      });
    }

    return { action: 'active', sessionId: String(session.id), phoneNormalized };
  }

  // Espelha a noção de "dono" do PR4 (admin-dono/master). No individual, só a sessão de um
  // admin-dono — ou a company-main (sem userId) — pode virar o ponteiro da empresa. Vendedor
  // reconectando o próprio chip NÃO sequestra mais o ponteiro company-scoped.
  private async webhookPointerAllowedForSession(companyId: number, userId: number | null): Promise<boolean> {
    if (!userId) return true; // company-main (sem user) pode virar ponteiro
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { whatsappAttendanceMode: true },
    });
    const mode =
      String((company as any)?.whatsappAttendanceMode || '').trim().toLowerCase() === 'shared'
        ? 'shared'
        : 'individual';
    if (mode === 'shared') return true; // compartilhado = número único da empresa
    const user = await this.prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { role: true, isSystemMaster: true, canViewBilling: true },
    });
    if (!user) return false;
    if (user.isSystemMaster) return true;
    // USERMASTER (dono do tenant) = admin-dono, igual ao ADMIN com billing.
    const role = String(user.role || '').trim().toUpperCase();
    return (role === 'ADMIN' || role === 'USERMASTER') && user.canViewBilling !== false;
  }

  private normalizeWebwhatsJid(value: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (normalized.includes('@')) return normalized;
    const digits = normalized.replace(/\D/g, '');
    if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
    return normalized;
  }

  private getWebwhatsRemoteJid(raw: any) {
    return this.normalizeWebwhatsJid(
      raw?.key?.remoteJid ||
        raw?.remoteJid ||
        raw?.remoteJidAlt ||
        raw?.chatId ||
        raw?.chat?.id ||
        raw?.jid ||
        raw?.from ||
        raw?.to ||
        raw?.number,
    );
  }

  private normalizeWebwhatsMessageContent(raw: any) {
    const direct = raw?.message;
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      if (direct.message && direct.key) return direct.message;
      if (
        direct.conversation ||
        direct.extendedTextMessage ||
        direct.imageMessage ||
        direct.videoMessage ||
        direct.ptvMessage ||
        direct.documentMessage ||
        direct.documentWithCaptionMessage ||
        direct.audioMessage ||
        direct.stickerMessage ||
        direct.reactionMessage ||
        direct.protocolMessage ||
        direct.buttonsResponseMessage ||
        direct.listResponseMessage ||
        direct.templateButtonReplyMessage
      ) {
        return direct;
      }
    }
    if (typeof direct === 'string' && direct.trim()) return { conversation: direct.trim() };
    if (raw?.text?.body) return { conversation: String(raw.text.body).trim() };
    if (typeof raw?.text === 'string' && raw.text.trim()) return { conversation: raw.text.trim() };
    if (typeof raw?.body === 'string' && raw.body.trim()) return { conversation: raw.body.trim() };
    if (typeof raw?.content === 'string' && raw.content.trim()) return { conversation: raw.content.trim() };
    if (raw?.imageMessage || raw?.videoMessage || raw?.documentMessage || raw?.audioMessage || raw?.stickerMessage) {
      return Object.fromEntries(
        Object.entries({
          imageMessage: raw.imageMessage,
          videoMessage: raw.videoMessage,
          documentMessage: raw.documentMessage,
          audioMessage: raw.audioMessage,
          stickerMessage: raw.stickerMessage,
        }).filter(([, value]) => Boolean(value)),
      );
    }
    if (raw?.image || raw?.video || raw?.document || raw?.audio || raw?.sticker) {
      return Object.fromEntries(
        Object.entries({
          imageMessage: raw.image,
          videoMessage: raw.video,
          documentMessage: raw.document,
          audioMessage: raw.audio,
          stickerMessage: raw.sticker,
        }).filter(([, value]) => Boolean(value)),
      );
    }
    if (raw?.reaction) {
      return {
        reactionMessage: {
          text: raw.reaction?.text || raw.reaction?.emoji || raw.reaction,
          key: { id: raw.reaction?.message_id || raw.reaction?.messageId || raw.reaction?.key?.id },
        },
      };
    }
    if (raw?.protocolMessage) return { protocolMessage: raw.protocolMessage };
    return {};
  }

  private inferWebwhatsMessageType(raw: any, message: Record<string, any>) {
    const declared = String(raw?.messageType || raw?.type || raw?.kind || '').trim().toLowerCase();
    if (declared.includes('image')) return 'image';
    if (declared.includes('video') || declared.includes('ptv')) return 'video';
    if (declared.includes('document') || declared.includes('file')) return 'document';
    if (declared.includes('audio') || declared.includes('voice')) return 'audio';
    if (declared.includes('sticker')) return 'sticker';
    if (declared.includes('reaction')) return 'reaction';
    if (declared.includes('delete') || declared.includes('revoke') || declared.includes('protocol')) return 'deleted';
    if (message.imageMessage) return 'image';
    if (message.videoMessage || message.ptvMessage) return 'video';
    if (message.documentMessage || message.documentWithCaptionMessage) return 'document';
    if (message.audioMessage) return 'audio';
    if (message.stickerMessage) return 'sticker';
    if (message.reactionMessage) return 'reaction';
    if (message.protocolMessage) return 'deleted';
    return 'text';
  }

  private normalizeWebwhatsMessageRecord(rawInput: any): WebwhatsFetchedMessage | null {
    const raw = rawInput?.message?.key ? rawInput.message : rawInput;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const message = this.normalizeWebwhatsMessageContent(raw);
    const remoteJid = this.getWebwhatsRemoteJid(raw);
    const keyId = String(raw?.key?.id || raw?.id || raw?.messageId || raw?.message_id || '').trim();
    if (!remoteJid && !keyId && !Object.keys(message).length) return null;
    const fromMe =
      raw?.key?.fromMe === undefined || raw?.key?.fromMe === null
        ? Boolean(raw?.fromMe || raw?.from_me)
        : Boolean(raw.key.fromMe);
    return {
      id: keyId || null,
      key: {
        id: keyId || null,
        fromMe,
        remoteJid: remoteJid || undefined,
        remoteJidAlt: this.normalizeWebwhatsJid(raw?.key?.remoteJidAlt || raw?.remoteJidAlt) || undefined,
        participant: String(raw?.key?.participant || raw?.participant || '').trim() || undefined,
      },
      pushName:
        String(raw?.pushName || raw?.notifyName || raw?.contactName || raw?.contact?.name || raw?._contactName || '').trim() ||
        null,
      messageType: this.inferWebwhatsMessageType(raw, message),
      message,
      messageTimestamp: raw?.messageTimestamp || raw?.timestamp || raw?.createdAt || raw?.dateTime || null,
      status: String(raw?.status || raw?.deliveryStatus || '').trim() || null,
      MessageUpdate: Array.isArray(raw?.MessageUpdate) ? raw.MessageUpdate : null,
    };
  }

  private extractWebwhatsMessageCandidates(payload: any) {
    const candidates: any[] = [];
    const pushCandidate = (candidate: any) => {
      if (!candidate) return;
      if (Array.isArray(candidate)) {
        candidates.push(...candidate);
        return;
      }
      candidates.push(candidate);
    };
    pushCandidate(payload?.messages);
    pushCandidate(payload?.records);
    pushCandidate(payload?.data?.messages);
    pushCandidate(payload?.data?.records);
    pushCandidate(payload?.data?.message);
    pushCandidate(payload?.message);
    pushCandidate(payload?.data);
    pushCandidate(payload);

    const byKey = new Map<string, WebwhatsFetchedMessage>();
    for (const candidate of candidates) {
      const normalized = this.normalizeWebwhatsMessageRecord(candidate);
      if (!normalized) continue;
      const key = String(normalized.key?.id || normalized.id || normalized.messageTimestamp || JSON.stringify(normalized.key || {}));
      byKey.set(key, normalized);
    }
    return Array.from(byKey.values());
  }

  private extractWebwhatsStatusCandidates(payload: any) {
    const eventName = this.extractWebwhatsEventName(payload).toLowerCase();
    const candidates: any[] = [];
    const pushCandidate = (candidate: any) => {
      if (!candidate) return;
      if (Array.isArray(candidate)) {
        candidates.push(...candidate);
        return;
      }
      candidates.push(candidate);
    };
    pushCandidate(payload?.statuses);
    pushCandidate(payload?.status);
    pushCandidate(payload?.data?.statuses);
    pushCandidate(payload?.data?.status);
    if (eventName.includes('status') || eventName.includes('update')) {
      pushCandidate(payload?.data);
      pushCandidate(payload);
    }

    const normalizedCandidates = candidates
      .map((candidate) => {
        if (!candidate || typeof candidate !== 'object') return null;
        const providerMessageId = String(
          candidate?.id ||
            candidate?.messageId ||
            candidate?.message_id ||
            candidate?.key?.id ||
            candidate?.message?.key?.id ||
            candidate?.keyId ||
            candidate?.data?.keyId ||
            candidate?.update?.keyId ||
            '',
        ).trim();
        const status = String(candidate?.status || candidate?.deliveryStatus || candidate?.update?.status || '').trim().toLowerCase();
        if (!providerMessageId || !status) return null;
        const tsMs = Number(candidate?.timestamp || candidate?.messageTimestamp || 0);
        const timestamp = tsMs
          ? new Date(tsMs > 1_000_000_000_000 ? tsMs : tsMs * 1000)
          : new Date();
        return { providerMessageId, status, timestamp, rawPayload: candidate };
      })
      .filter(Boolean) as Array<{
        providerMessageId: string;
        status: string;
        timestamp: Date;
        rawPayload: any;
      }>;

    const updateCandidates = this.extractWebwhatsMessageCandidates(payload)
      .flatMap((message) => {
        const providerMessageId = String(message?.key?.id || message?.id || '').trim();
        if (!providerMessageId) return [];
        const baseTimestampMs = Number(message?.messageTimestamp || 0);
        const baseTimestamp = baseTimestampMs
          ? new Date(baseTimestampMs > 1_000_000_000_000 ? baseTimestampMs : baseTimestampMs * 1000)
          : new Date();

        return (Array.isArray(message?.MessageUpdate) ? message.MessageUpdate : [])
          .map((entry) => {
            const status = String(entry?.status || '').trim().toLowerCase();
            if (!status) return null;
            return {
              providerMessageId,
              status,
              timestamp: baseTimestamp,
              rawPayload: {
                message,
                update: entry,
              },
            };
          })
          .filter(Boolean) as Array<{
            providerMessageId: string;
            status: string;
            timestamp: Date;
            rawPayload: any;
          }>;
      });

    const deduped = new Map<string, {
      providerMessageId: string;
      status: string;
      timestamp: Date;
      rawPayload: any;
    }>();

    for (const candidate of [...normalizedCandidates, ...updateCandidates]) {
      deduped.set(`${candidate.providerMessageId}:${candidate.status}`, candidate);
    }

    return Array.from(deduped.values());
  }

  private getAtendimentoBlockedState(metadata: Record<string, any>) {
    const blockedAt = String(metadata?.atendimentoBlockedAt || '').trim() || null;
    const blockedReason = String(metadata?.atendimentoBlockedReason || '').trim() || null;
    return {
      isBlocked: Boolean(blockedAt),
      blockedAt,
      blockedReason,
    };
  }

  private clearAtendimentoBlockedMetadata(metadata: Record<string, any>) {
    const next = { ...(metadata || {}) };
    delete next.atendimentoBlockedAt;
    delete next.atendimentoBlockedReason;
    delete next.atendimentoBlockedByUserId;
    return next;
  }

  private normalizePhoneForCustomer(raw: string): string {
    return String(raw || '').replace(/\D/g, '').slice(-13);
  }

  private normalizeCustomerProfileName(raw: string | null | undefined) {
    const normalized = String(raw || '').trim();
    return normalized ? normalized.slice(0, 120) : null;
  }

  private normalizeIsoDateTime(value: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private readVendasAgendaQueueMetadata(metadata: Record<string, any>): VendasAgendaQueueMetadata | null {
    const queue = metadata?.vendasAgendaQueue;
    if (!queue || typeof queue !== 'object' || Array.isArray(queue)) return null;
    return queue as VendasAgendaQueueMetadata;
  }

  private isPersonalWhatsappContact(metadata: Record<string, any>) {
    const queue = this.readVendasAgendaQueueMetadata(metadata);
    return Boolean(
      metadata?.inboxPersonalContact === true ||
      metadata?.personalContact === true ||
      metadata?.whatsappPersonalContact === true,
    );
  }

  private promoteVendasProspectionMetadataToAtendimento(metadata: Record<string, any>) {
    return metadata;
  }

  private isAtendimentoBotOff(
    metadata: Record<string, any>,
    queue?: VendasAgendaQueueMetadata | null,
    profileBotOff?: boolean | null,
  ) {
    return (
      profileBotOff === true
      || metadata?.botOff === true
      || metadata?.atendimentoBotOff === true
      || (queue as any)?.botOff === true
    );
  }

  private resolveInboundBotOffState(metadata: Record<string, any>) {
    const explicitFalse = metadata?.botOff === false || metadata?.atendimentoBotOff === false;
    if (explicitFalse) {
      return { botOff: false as boolean | undefined, botOffReason: null, botOffAt: null as Date | null };
    }

    const blockedAt = this.normalizeIsoDateTime(metadata?.atendimentoBlockedAt);
    const explicitTrue =
      metadata?.botOff === true
      || metadata?.atendimentoBotOff === true
      || this.isPersonalWhatsappContact(metadata)
      || Boolean(blockedAt);
    if (!explicitTrue) {
      return { botOff: undefined, botOffReason: null, botOffAt: null as Date | null };
    }

    return {
      botOff: true,
      botOffReason:
        String(
          metadata?.botOffReason
          || metadata?.atendimentoBotOffReason
          || metadata?.atendimentoBlockedReason
          || '',
        ).trim() || null,
      botOffAt: blockedAt ? new Date(blockedAt) : new Date(),
    };
  }

  private normalizeVendasAutomationIntentText(value: unknown) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private readJsonRecord(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }

  private readJsonTextList(value: unknown, fallback: string[] = []) {
    let source: unknown = value;
    if (typeof value === 'string') {
      try {
        source = JSON.parse(value);
      } catch {
        source = value.split(/\r?\n|,/);
      }
    }
    const items = Array.isArray(source) ? source : fallback;
    return Array.from(
      new Set(
        items
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    );
  }

  private readVendasVariantList(campaign: any, key: string, fallback: string[]) {
    const filters = this.readJsonRecord(campaign?.filtersJson);
    const value = filters[key];
    const source = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/\r?\n/)
        : fallback;
    return Array.from(
      new Set(
        source
          .map((item) => sanitizeFirstContactMessage(String(item || '').trim()))
          .filter(Boolean)
          // Variantes pausadas pelo dono (marca de controle no início) ficam salvas
          // mas o motor NÃO dispara — espelha VARIANT_PAUSE_MARK do front.
          .filter((s) => !s.startsWith(String.fromCharCode(1))),
      ),
    ).slice(0, 20);
  }

  private getVendasBrasiliaGreeting() {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }).format(new Date()));
    if (hour >= 18 || hour < 3) return 'Boa noite';
    if (hour >= 12) return 'Boa tarde';
    return 'Bom dia';
  }

  private renderVendasVariant(template: string, job: any, extraValues: Record<string, string> = {}) {
    const leadName = String(job?.lead?.name || 'sua empresa').trim();
    const values: Record<string, string> = {
      cumprimentacao: this.getVendasBrasiliaGreeting(),
      cliente: leadName,
      empresaresumo: leadName.replace(/\s+(ltda|me|mei|eireli|epp|s\/a|sa)$/i, '').trim(),
      clienteresumo: leadName.replace(/\s+(ltda|me|mei|eireli|epp|s\/a|sa)$/i, '').trim(),
      empresa: 'nossa empresa',
      funcionario: 'time comercial',
      cidade: String(job?.lead?.city || job?.campaign?.city || '').trim(),
      estado: String(job?.lead?.state || job?.campaign?.state || '').trim(),
      segmento: String(job?.lead?.segment || job?.campaign?.segment || '').trim(),
      ...extraValues,
    };
    return sanitizeFirstContactMessage(
      String(template || '')
        .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => values[key] || '')
        .trim(),
    );
  }

  private pickVendasVariant(campaign: any, job: any, key: string, fallback: string[], extraValues: Record<string, string> = {}) {
    const variants = this.readVendasVariantList(campaign, key, fallback);
    const variant = variants[Math.floor(Math.random() * variants.length)] || fallback[0] || '';
    return this.renderVendasVariant(variant, job, extraValues);
  }

  private pickVendasScheduledReplyVariant(job: any, label: string, extraValues: Record<string, string> = {}) {
    const fallback = [
      'Perfeito, {{retorno_label}} eu te chamo por aqui ou te ligo rapidinho.',
      'Combinado, {{retorno_label}} eu retorno com você.',
      'Fechado, deixei anotado para {{retorno_label}}.',
    ];
    const variants = this.readVendasVariantList(job?.campaign, 'scheduledReplyVariants', fallback);
    const variant = variants[Math.floor(Math.random() * variants.length)] || fallback[0];
    return this.renderVendasVariant(variant, job, {
      ...extraValues,
      retorno_label: label,
      horario_retorno: label,
    });
  }

  private async buildVendasTemplateExtraValues(job: any) {
    const [company, user] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: Number(job?.campaign?.companyId || 0) } }).catch(() => null),
      Number(job?.campaign?.createdByUserId || 0)
        ? this.prisma.user.findFirst({
            where: {
              id: Number(job.campaign.createdByUserId),
              companyId: Number(job?.campaign?.companyId || 0),
            },
          }).catch(() => null)
        : Promise.resolve(null),
    ]);
    return {
      empresa: String(company?.name || 'nossa empresa').trim(),
      funcionario: String(user?.name || user?.username || 'time comercial').trim(),
    };
  }

  private isVendasPreMessageAwaitingHuman(metadata: Record<string, any>) {
    const automation = this.readJsonRecord(metadata?.vendasAutomation);
    const queue = this.readJsonRecord(metadata?.vendasAgendaQueue);
    return (
      (automation.preMessageAwaitingReply === true || queue.preMessageAwaitingReply === true) &&
      automation.preMessagePitchSent !== true &&
      queue.preMessagePitchSent !== true
    );
  }

  private isVendasPreMessageEnabledForCampaign(campaign: any) {
    const filters = this.readJsonRecord(campaign?.filtersJson);
    return campaign?.preMessageEnabled === true || filters.preMessageEnabled === true;
  }

  private isVendasPreMessageAwaitingHumanForJob(metadata: Record<string, any>, job: any) {
    if (this.isVendasPreMessageAwaitingHuman(metadata)) return true;
    const automation = this.readJsonRecord(metadata?.vendasAutomation);
    const queue = this.readJsonRecord(metadata?.vendasAgendaQueue);
    const alreadySentPitch = automation.preMessagePitchSent === true || queue.preMessagePitchSent === true;
    if (alreadySentPitch) return false;
    if (!this.isVendasPreMessageEnabledForCampaign(job?.campaign)) return false;
    const lastResult = this.normalizeVendasAutomationIntentText(job?.lead?.lastResult);
    return lastResult.includes('pre mensagem automatica') || lastResult.includes('pre-mensagem automatica');
  }

  private getVendasBotReplyIntervalReductionPercent(campaign: any) {
    const filters = this.readJsonRecord(campaign?.filtersJson);
    const value = Math.trunc(Number(filters.botReplyIntervalReductionPercent || 0));
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  private async reduceNextVendasAutomationIntervalAfterBot(campaign: any, currentJobId: string, now: Date) {
    const reductionPercent = this.getVendasBotReplyIntervalReductionPercent(campaign);
    if (reductionPercent <= 0) return null;
    const nextJob = await this.prisma.vendasAutomationJob.findFirst({
      where: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        id: { not: currentJobId },
        status: { in: ['pending', 'scheduled'] as any },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, scheduledAt: true },
    });
    if (!nextJob?.id) return null;
    const fallbackTarget = new Date(now.getTime() + Math.max(1, Number(campaign.intervalMinutes || 15)) * 60000);
    const currentTarget = nextJob.scheduledAt instanceof Date && nextJob.scheduledAt.getTime() > now.getTime()
      ? nextJob.scheduledAt
      : fallbackTarget;
    const remainingMs = Math.max(0, currentTarget.getTime() - now.getTime());
    const nextDelayMs = reductionPercent >= 100 ? 0 : Math.round(remainingMs * (1 - reductionPercent / 100));
    const scheduledAt = new Date(now.getTime() + nextDelayMs);
    await this.prisma.vendasAutomationJob.update({ where: { id: nextJob.id }, data: { scheduledAt } });
    return scheduledAt;
  }

  private async sendVendasPitchAfterPreMessage(input: any, job: any) {
    const now = new Date();
    const company = await this.prisma.company.findUnique({ where: { id: job.campaign.companyId } }).catch(() => null);
    const variants = this.readVendasVariantList(job.campaign, 'firstContactVariants', [
      '{{cumprimentacao}}, tudo bem? Me chamo Jhonatan. Trabalho ajudando empresas a melhorar processos e automatizar tarefas repetitivas do dia a dia. Teria interesse em saber um pouco mais?',
    ]);
    const variant = variants[Math.floor(Math.random() * variants.length)] || variants[0] || '';
    const body = this.renderVendasVariant(variant, job, {
      empresa: String(company?.name || 'nossa empresa').trim(),
      funcionario: 'time comercial',
    });
    if (!body) return null;
    const metadata = this.readJsonRecord(input.metadata);
    const queue = this.readJsonRecord(metadata.vendasAgendaQueue);
    const automation = this.readJsonRecord(metadata.vendasAutomation);
    const prospeccao = this.readJsonRecord(metadata.vendasProspeccao);
    const nextMetadata = {
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
      vendasProspeccao: {
        ...prospeccao,
        stage: 'sent_waiting',
        lastInboundAt: input.timestamp instanceof Date ? input.timestamp.toISOString() : now.toISOString(),
        replyDeadlineAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        leadSegment: job.lead?.segment || prospeccao.leadSegment || null,
        campaignSegment: job.campaign?.segment || prospeccao.campaignSegment || null,
        mismatchReason: null,
      },
    };
    await this.conversations.queueOutboundForCompany(input.companyId, {
      conversationId: input.conversationId,
      to: input.from,
      contactId: input.from,
      body,
      messageType: 'text',
      sourceModule: 'vendas_prospeccao_bot',
      senderType: 'bot',
      variables: {
        purpose: 'conversation_reply',
        botType: 'prospeccao',
        campaignId: job.campaignId,
        jobId: job.id,
        leadId: job.leadId,
        firstContact: true,
        preMessageFollowUp: true,
        // PR05072026 (timing humano): mesma fase 3 do followUp de interesse — este
        // envio também acontece logo após a IA decidir (resposta humana ao pitch).
        typingDelayMs: this.computeVendasFollowUpTypingDelayMs(job.campaign, body),
      },
      flowState: {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.MAIN_MENU,
        botActive: true,
        humanAssigned: false,
        flowResult: null,
        metadata: nextMetadata,
      },
    });
    this.publishVendasAutomationEvent({
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

  private containsVendasAutomationKeyword(normalizedText: string, keywords: string[]) {
    return keywords.some((keyword) => {
      const normalizedKeyword = this.normalizeVendasAutomationIntentText(keyword);
      return Boolean(normalizedKeyword && normalizedText.includes(normalizedKeyword));
    });
  }

  private normalizeSelfAlertPhone(value: unknown) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
      digits = `55${digits}`;
    }
    if (digits.length < 10 || digits.length > 15) return null;
    return `+${digits}`;
  }

  private async resolveWebwhatsSelfAlertTarget(companyId: number, conversationId?: number | null, metadata?: Record<string, any> | null) {
    const metadataCandidates = [
      metadata?.sourcePhoneNormalized,
      metadata?.whatsappConnectionPhoneNormalized,
      metadata?.whatsappModalPhone,
      metadata?.whatsappTemporaryDisplayNumber,
    ];
    if (conversationId) {
      const conversation = await this.prisma.companyConversation.findFirst({
        where: { id: Number(conversationId), companyId },
        select: {
          sourcePhoneNormalized: true,
          metadata: true,
          whatsappConnectionSession: {
            select: {
              phoneNormalized: true,
              displayPhone: true,
            },
          },
        },
      });
      const conversationMetadata = this.readJsonRecord(conversation?.metadata);
      metadataCandidates.push(
        conversation?.whatsappConnectionSession?.phoneNormalized,
        conversation?.whatsappConnectionSession?.displayPhone,
        conversation?.sourcePhoneNormalized,
        conversationMetadata.sourcePhoneNormalized,
        conversationMetadata.whatsappConnectionPhoneNormalized,
      );
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        whatsappModalPhone: true,
        whatsappTemporaryDisplayNumber: true,
        whatsappDisplayNumber: true,
        whatsappNumber: true,
        currentWhatsappConnectionSession: {
          select: {
            phoneNormalized: true,
            displayPhone: true,
          },
        },
      },
    });
    metadataCandidates.push(
      company?.currentWhatsappConnectionSession?.phoneNormalized,
      company?.currentWhatsappConnectionSession?.displayPhone,
      company?.whatsappModalPhone,
      company?.whatsappTemporaryDisplayNumber,
      company?.whatsappDisplayNumber,
      company?.whatsappNumber,
    );
    for (const candidate of metadataCandidates) {
      const normalized = this.normalizeSelfAlertPhone(candidate);
      if (normalized) return normalized;
    }
    return null;
  }

  private async notifyWebwhatsSelfAlert(input: {
    companyId: number;
    conversationId?: number | null;
    metadata?: Record<string, any> | null;
    title: string;
    text: string;
    reasons?: string[];
    leadName?: string | null;
    leadPhone?: string | null;
  }) {
    try {
      const target = await this.resolveWebwhatsSelfAlertTarget(input.companyId, input.conversationId, input.metadata);
      if (!target) {
        this.logger.warn(`[hbot-alert] sem numero proprio conectado para alerta company=${input.companyId}`);
        return;
      }
      const trimmedText = String(input.text || '').replace(/\s+/g, ' ').trim();
      const preview = trimmedText.length > 280 ? `${trimmedText.slice(0, 277)}...` : trimmedText;
      const lines = [
        `HBX Alerta: ${input.title}`,
        input.leadName ? `Cliente: ${input.leadName}` : null,
        input.leadPhone ? `Telefone: ${input.leadPhone}` : null,
        input.conversationId ? `Conversa: ${input.conversationId}` : null,
        input.reasons?.length ? `Sinais: ${input.reasons.join(', ')}` : null,
        `Mensagem: "${preview || '(sem texto)'}"`,
        'Acao: bot pausado. Revisar em Prospecção.',
      ].filter(Boolean);
      await this.webwhatsBridge.sendText(input.companyId, {
        to: target,
        text: lines.join('\n'),
      });
    } catch (error) {
      this.logger.warn(`[hbot-alert] falha ao enviar alerta para si mesmo: ${String((error as any)?.message || error)}`);
    }
  }

  private vendasCampaignOptOutReplyEnabled(campaign: any) {
    return this.readJsonRecord(campaign?.filtersJson).optOutReplyEnabled === true;
  }

  private publishVendasAutomationEvent(input: {
    companyId: number;
    type: string;
    status: string;
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

  private async findVendasAutomationJobForInbound(input: {
    companyId: number;
    conversationId: number;
    from: string;
    metadata: Record<string, any>;
  }) {
    const automation = this.readJsonRecord(input.metadata?.vendasAutomation);
    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const jobDelegate = (this.prisma as any).vendasAutomationJob;
    if (typeof jobDelegate?.findFirst !== 'function') return null;
    const jobId = String(automation.jobId || queue.automationJobId || '').trim();
    if (jobId) {
      const job = await jobDelegate.findFirst({
        where: { id: jobId, companyId: input.companyId, status: { in: ['sent', 'replied_positive'] } },
        include: { campaign: true, lead: true },
      });
      if (job) return job;
    }

    const phoneDigits = this.customerProfileService.normalizePhone(input.from);
    const candidates = phoneDigits
      ? buildWhatsAppPhoneCandidates(phoneDigits)
          .map((value) => this.customerProfileService.normalizePhone(value))
          .filter((value): value is string => Boolean(value))
      : [];

    return jobDelegate.findFirst({
      where: {
        companyId: input.companyId,
        status: { in: ['sent', 'replied_positive'] },
        OR: [
          { conversationId: input.conversationId },
          ...(candidates.length ? [{ lead: { phoneNormalized: { in: candidates } } }] : []),
        ],
      },
      include: { campaign: true, lead: true },
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private getSaoPauloDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || '0');
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
    };
  }

  private buildSaoPauloDate(parts: { year: number; month: number; day: number; hour: number; minute: number }) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour + 3, parts.minute, 0, 0));
  }

  private normalizeScheduleIntentText(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}:h\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseProspectionScheduleRequest(text: string, baseDate: Date) {
    const normalized = this.normalizeScheduleIntentText(text);
    if (!normalized) return null;
    const hasScheduleCue = /\b(amanha|hoje|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|hora|horario|ligar|liga|chama|chamar|pode ser|as|umas|uns)\b/.test(normalized);
    if (!hasScheduleCue) return null;

    const period = /\b(manha|cedo)\b/.test(normalized)
      ? 'morning'
      : /\b(tarde)\b/.test(normalized)
        ? 'afternoon'
        : /\b(noite)\b/.test(normalized)
          ? 'night'
          : null;
    const timeMatch = normalized.match(/\b(?:as|umas|uns|por volta das|la pelas|pelas)?\s*(\d{1,2})(?:[:h](\d{2}))?\b/);
    let hour = timeMatch ? Number(timeMatch[1]) : NaN;
    let minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      if (period === 'morning') hour = 9;
      else if (period === 'afternoon') hour = 14;
      else if (period === 'night') hour = 18;
    }
    if (!Number.isFinite(hour) || hour < 0 || hour > 23 || !Number.isFinite(minute) || minute < 0 || minute > 59) {
      return null;
    }

    const base = this.getSaoPauloDateParts(baseDate);
    const baseLocal = this.buildSaoPauloDate({ ...base, hour: 0, minute: 0 });
    let dayOffset: number | null = null;
    if (/\bdepois de amanha\b/.test(normalized)) dayOffset = 2;
    else if (/\bamanha\b/.test(normalized)) dayOffset = 1;
    else if (/\bhoje\b/.test(normalized)) dayOffset = 0;

    const weekdays: Record<string, number> = {
      domingo: 0,
      segunda: 1,
      terca: 2,
      quarta: 3,
      quinta: 4,
      sexta: 5,
      sabado: 6,
    };
    const weekdayEntry = Object.entries(weekdays).find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized));
    if (dayOffset === null && weekdayEntry) {
      const target = weekdayEntry[1];
      const current = baseLocal.getUTCDay();
      dayOffset = (target - current + 7) % 7;
      if (dayOffset === 0) dayOffset = 7;
    }
    if (dayOffset === null) {
      const candidateToday = this.buildSaoPauloDate({ ...base, hour, minute });
      dayOffset = candidateToday.getTime() > baseDate.getTime() + 30 * 60 * 1000 ? 0 : 1;
    }

    const targetDay = new Date(baseLocal.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const scheduledAt = this.buildSaoPauloDate({
      year: targetDay.getUTCFullYear(),
      month: targetDay.getUTCMonth() + 1,
      day: targetDay.getUTCDate(),
      hour,
      minute,
    });
    if (scheduledAt.getTime() <= baseDate.getTime()) return null;
    return {
      scheduledAt,
      dayOffset,
      hour,
      minute,
    };
  }

  private formatProspectionScheduleLabel(parsed: { scheduledAt: Date; dayOffset: number; hour: number; minute: number }) {
    const time = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
    if (parsed.dayOffset === 0) return `hoje às ${time}`;
    if (parsed.dayOffset === 1) return `amanhã às ${time}`;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed.scheduledAt);
  }

  private async handleVendasProspectionScheduleReply(input: any, job: any) {
    const parsed = this.parseProspectionScheduleRequest(input.text, input.timestamp instanceof Date ? input.timestamp : new Date());
    if (!parsed) return null;
    const label = this.formatProspectionScheduleLabel(parsed);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.vendasAutomationJob.update({
        where: { id: job.id },
        data: {
          classification: 'call_scheduled',
          conversationId: input.conversationId,
        },
      });
      await tx.vendasLead.updateMany({
        where: {
          id: job.leadId,
          companyId: input.companyId,
          OR: [
            { pipelineStage: { in: ['prospeccao', 'qualificacao'] } },
            { pipelineStage: null, status: { in: ['novo', 'contato'] } },
          ],
        },
        data: {
          pipelineStage: 'qualificacao',
          status: 'contato',
          lastResult: 'Ligação agendada pelo WhatsApp',
          nextAction: `Ligar/retornar ${label}`,
          returnAt: parsed.scheduledAt,
        },
      });
      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: job.leadId,
          eventType: 'return_scheduled',
          title: 'Ligação agendada pelo WhatsApp',
          description: `Cliente combinou retorno ${label}.`,
          sourceType: 'vendas_prospeccao_bot',
          statusTo: 'contato',
          resultLabel: 'Retorno agendado',
          returnAt: parsed.scheduledAt,
        },
      });
    });

    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const automation = this.readJsonRecord(input.metadata?.vendasAutomation);
    const prospeccao = this.readJsonRecord(input.metadata?.vendasProspeccao);
    const nextMetadata = {
      ...this.clearAtendimentoBlockedMetadata(input.metadata),
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      botActive: false,
      humanAssigned: false,
      prospectionAttentionRequired: true,
      prospectionAttentionTone: 'green',
      scheduledCallAt: parsed.scheduledAt.toISOString(),
      scheduledCallLabel: label,
      vendasAutomation: {
        ...automation,
        campaignId: job.campaignId,
        jobId: job.id,
        leadId: job.leadId,
        status: 'call_scheduled',
        scheduledCallAt: parsed.scheduledAt.toISOString(),
        scheduledCallLabel: label,
      },
      vendasAgendaQueue: {
        ...queue,
        active: true,
        leadId: job.leadId,
        sourceModule: 'vendas',
        sourceBlock: 'scheduled',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        status: 'retorno_agendado',
        nextAction: `Ligar/retornar ${label}`,
        returnAt: parsed.scheduledAt.toISOString(),
        draftMessage: null,
        draftPending: false,
        botEligible: false,
        botEntryPending: false,
        botActive: false,
        humanAssigned: false,
        attentionRequired: true,
        attentionTone: 'green',
        scheduledCallAt: parsed.scheduledAt.toISOString(),
        scheduledCallLabel: label,
        respondedAt: now.toISOString(),
        syncedAt: now.toISOString(),
      },
      vendasProspeccao: {
        ...prospeccao,
        stage: 'reply_received',
        lastInboundAt: input.timestamp instanceof Date ? input.timestamp.toISOString() : now.toISOString(),
        scheduledCallAt: parsed.scheduledAt.toISOString(),
      },
    };
    const scheduledReplyBody = this.pickVendasScheduledReplyVariant(job, label, await this.buildVendasTemplateExtraValues(job));
    await input.setInboundMeta('vendas_prospeccao_retorno_agendado', false);
    await this.conversations.queueOutboundForCompany(input.companyId, {
      conversationId: input.conversationId,
      to: input.from,
      contactId: input.from,
      body: scheduledReplyBody,
      messageType: 'text',
      sourceModule: 'vendas_prospeccao_bot',
      senderType: 'bot',
      variables: {
        purpose: 'conversation_reply',
        botType: 'prospeccao',
        campaignId: job.campaignId,
        jobId: job.id,
        leadId: job.leadId,
        scheduledCallAt: parsed.scheduledAt.toISOString(),
        scheduledCallLabel: label,
      },
      flowState: {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.HUMAN,
        botActive: false,
        humanAssigned: false,
        flowResult: 'prospection_call_scheduled',
        metadata: nextMetadata,
      },
    });
    this.publishVendasAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: `Retorno agendado ${label}.`,
      type: 'call_scheduled',
    });
    return { handled: true, classification: 'call_scheduled', scheduledAt: parsed.scheduledAt.toISOString() };
  }

  private resolveHbxPresentationRecipientName(job: any, metadata: Record<string, any>) {
    return String(
      job?.lead?.name ||
        metadata?.cliente ||
        metadata?.customerName ||
        metadata?.name ||
        job?.lead?.phone ||
        'cliente',
    ).replace(/\s+/g, ' ').trim() || 'cliente';
  }

  private formatHbxEmailNoteDate(date: Date) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.day}/${byType.month} as ${byType.hour}:${byType.minute}`;
  }

  private appendHbxEmailCustomerNote(currentNotes: unknown, sentAt: Date) {
    const base = String(currentNotes || '').trim();
    const line = `Apresentacao HBX enviada por e-mail em ${this.formatHbxEmailNoteDate(sentAt)}.`;
    if (base.includes(line)) return base || line;
    return [base, line].filter(Boolean).join('\n');
  }

  private isRecentHbxEmailDuplicate(metadata: Record<string, any>, recipientEmail: string, now: Date) {
    const flow = this.readJsonRecord(metadata?.hbxEmailFlow);
    const sentAt = new Date(String(flow.sentAt || ''));
    const flowEmail = normalizeHbxEmail(flow.recipientEmail);
    return (
      String(flow.status || '').trim().toLowerCase() === 'sent' &&
      Boolean(flowEmail) &&
      flowEmail === recipientEmail &&
      Number.isFinite(sentAt.getTime()) &&
      now.getTime() - sentAt.getTime() <= HBX_EMAIL_RECENT_DUPLICATE_MS
    );
  }

  private buildHbxEmailPendingMetadata(input: {
    metadata: Record<string, any>;
    job: any;
    status: 'awaiting_email' | 'invalid_email' | 'failed';
    recipientEmail?: string | null;
    errorMessage?: string | null;
    invalidEmailCandidates?: string[];
    at: Date;
  }) {
    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const nowIso = input.at.toISOString();
    return {
      ...this.clearAtendimentoBlockedMetadata(input.metadata),
      sourceModule: 'vendas',
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      hbxEmailFlow: {
        ...this.readJsonRecord(input.metadata?.hbxEmailFlow),
        status: input.status,
        recipientEmail: input.recipientEmail || null,
        requestedAt: nowIso,
        errorMessage: input.errorMessage || null,
        invalidEmailCandidates: input.invalidEmailCandidates || [],
        source: 'bot_intent',
      },
      vendasAgendaQueue: {
        ...queue,
        active: true,
        leadId: String(input.job?.leadId || input.job?.lead?.id || queue.leadId || '').trim() || null,
        sourceModule: 'vendas',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        status: input.status === 'failed' ? 'email_falhou' : 'email_pendente',
        nextAction: input.status === 'failed'
          ? 'Atendimento humano para envio da apresentacao HBX'
          : 'Aguardar e-mail para envio da apresentacao HBX',
        draftPending: false,
        botEligible: false,
        botEntryPending: false,
        syncedAt: nowIso,
      },
    };
  }

  private async queueHbxEmailBotReply(input: {
    companyId: number;
    conversationId: number;
    to: string;
    body: string;
    metadata?: Record<string, unknown>;
    humanAssigned?: boolean;
    variables?: Record<string, unknown>;
  }) {
    return this.conversations.queueOutboundForCompany(input.companyId, {
      conversationId: input.conversationId,
      to: input.to,
      contactId: input.to,
      body: input.body,
      messageType: 'text',
      sourceModule: 'vendas_prospeccao_email_bot',
      senderType: 'bot',
      variables: {
        intent: 'SEND_HBX_PRESENTATION_EMAIL',
        ...(input.variables || {}),
      },
      flowState: {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.HUMAN,
        botActive: false,
        humanAssigned: Boolean(input.humanAssigned),
        flowResult: input.humanAssigned ? 'prospection_email_failed' : null,
        metadata: input.metadata || undefined,
      },
    });
  }

  private async updateHbxEmailProfileAndLead(input: {
    companyId: number;
    job: any;
    recipientEmail: string;
    sentAt: Date;
    followUpAt: Date;
  }) {
    const customerProfileDelegate = (this.prisma as any).customerProfile;
    const vendasLeadDelegate = (this.prisma as any).vendasLead;
    const profileId = String(input.job?.lead?.customerProfileId || '').trim();
    const phoneNormalized = this.customerProfileService.normalizePhone(input.job?.lead?.phoneNormalized || input.job?.lead?.phone);

    if (
      (profileId || phoneNormalized) &&
      typeof customerProfileDelegate?.findFirst === 'function' &&
      typeof customerProfileDelegate?.update === 'function'
    ) {
      const profile = await customerProfileDelegate.findFirst({
        where: {
          companyId: input.companyId,
          OR: [
            ...(profileId ? [{ id: profileId }] : []),
            ...(phoneNormalized ? [{ phoneNormalized }] : []),
          ],
        },
        select: { id: true, notes: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
      if (profile?.id) {
        await customerProfileDelegate.update({
          where: { id: profile.id },
          data: {
            email: input.recipientEmail,
            notes: this.appendHbxEmailCustomerNote(profile.notes, input.sentAt),
          },
        });
      }
    }

    if (typeof vendasLeadDelegate?.update === 'function' && input.job?.leadId) {
      const leadData: Record<string, unknown> = {
        email: input.recipientEmail,
        nextAction: 'Perguntar se viu o e-mail da apresentacao HBX',
        returnAt: input.followUpAt,
        lastContactAt: input.sentAt,
        lastResult: 'Apresentacao HBX enviada por e-mail',
      };
      if (String(input.job?.lead?.status || '').trim().toLowerCase() !== 'encerrado') {
        leadData.status = 'retorno';
      }
      await vendasLeadDelegate.update({
        where: { id: input.job.leadId },
        data: leadData,
      });
    }
  }

  private buildHbxEmailSuccessMetadata(input: {
    metadata: Record<string, any>;
    job: any;
    recipientName: string;
    recipientEmail: string;
    secondaryEmails?: string[];
    delivery: HbxPresentationEmailResult;
    followUpAt: Date;
    inboundAt: Date;
  }) {
    const nowIso = input.delivery.sentAt;
    const followUpIso = input.followUpAt.toISOString();
    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const prospeccao = this.readJsonRecord(input.metadata?.vendasProspeccao);
    return {
      ...this.clearAtendimentoBlockedMetadata(input.metadata),
      sourceModule: 'vendas',
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      hbxEmailFlow: {
        status: 'sent',
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        sentAt: nowIso,
        messageId: input.delivery.delivery.messageId,
        source: 'bot_intent',
        secondaryEmails: input.secondaryEmails || [],
        followUpAt: followUpIso,
        followUpStatus: 'pending',
        copyRecipients: input.delivery.copyRecipients,
      },
      vendasAgendaQueue: {
        ...queue,
        active: true,
        leadId: String(input.job?.leadId || input.job?.lead?.id || queue.leadId || '').trim() || null,
        sourceModule: 'vendas',
        sourceBlock: 'scheduled',
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        status: 'email_enviado',
        nextAction: 'Perguntar se viu o e-mail da apresentação HBX',
        returnAt: followUpIso,
        draftMessage: HBX_EMAIL_FOLLOW_UP_DRAFT,
        draftPending: true,
        manualSent: true,
        manualSentAt: nowIso,
        lastManualSendAt: nowIso,
        botEligible: false,
        botEntryPending: false,
        syncedAt: nowIso,
      },
      vendasProspeccao: {
        ...prospeccao,
        stage: 'reply_received',
        lastInboundAt: input.inboundAt.toISOString(),
        leadSegment: input.job?.lead?.segment || prospeccao.leadSegment || null,
        campaignSegment: input.job?.campaign?.segment || prospeccao.campaignSegment || null,
        mismatchReason: null,
      },
    };
  }

  private async handleHbxPresentationEmailIntent(input: {
    companyId: number;
    conversationId: number;
    inboundMessageId: number;
    from: string;
    text: string;
    timestamp: Date;
    metadata: Record<string, any>;
    setInboundMeta: (sourceModule: string, isComplaint: boolean) => Promise<void>;
  }, job: any, intent: HbxPresentationEmailIntent) {
    if (!intent.intent) return null;

    const now = input.timestamp instanceof Date ? input.timestamp : new Date();
    const recipientName = this.resolveHbxPresentationRecipientName(job, input.metadata);

    if (!intent.extractedEmail) {
      const invalid = intent.invalidEmailCandidates.length > 0;
      const body = invalid
        ? 'Esse e-mail parece invalido. Pode me passar o e-mail completo para envio?'
        : 'Perfeito. Qual e-mail devo usar para te enviar a apresentação do HBX?';
      await input.setInboundMeta(invalid ? 'vendas_prospeccao_email_invalido' : 'vendas_prospeccao_email_pendente', false);
      await this.queueHbxEmailBotReply({
        companyId: input.companyId,
        conversationId: input.conversationId,
        to: input.from,
        body,
        metadata: this.buildHbxEmailPendingMetadata({
          metadata: input.metadata,
          job,
          status: invalid ? 'invalid_email' : 'awaiting_email',
          invalidEmailCandidates: intent.invalidEmailCandidates,
          at: now,
        }),
        variables: {
          confidence: intent.confidence,
          needsEmail: true,
          invalidEmailCandidates: intent.invalidEmailCandidates,
        },
      });
      return { handled: true, classification: invalid ? 'email_invalid' : 'email_missing' };
    }

    const recipientEmail = intent.extractedEmail;
    if (this.isRecentHbxEmailDuplicate(input.metadata, recipientEmail, now)) {
      await input.setInboundMeta('vendas_prospeccao_email_duplicado', false);
      await this.queueHbxEmailBotReply({
        companyId: input.companyId,
        conversationId: input.conversationId,
        to: input.from,
        body: `A apresentação do HBX já foi enviada para ${recipientEmail}. Qualquer dúvida, pode me chamar por aqui.`,
        variables: {
          confidence: intent.confidence,
          recipientEmail,
          duplicate: true,
        },
      });
      return { handled: true, classification: 'email_duplicate_recent' };
    }

    if (!this.hbxPresentationEmails) return null;

    let delivery: HbxPresentationEmailResult;
    try {
      delivery = await this.hbxPresentationEmails.sendPresentationToContact({
        companyId: input.companyId,
        conversationId: input.conversationId,
        customerProfileId: job?.lead?.customerProfileId || null,
        recipientName,
        recipientEmail,
        source: 'bot',
      });
    } catch (error: any) {
      await input.setInboundMeta('vendas_prospeccao_email_falhou', false);
      await this.queueHbxEmailBotReply({
        companyId: input.companyId,
        conversationId: input.conversationId,
        to: input.from,
        body: 'Tive um problema para enviar a apresentação por e-mail agora. Vou encaminhar para atendimento humano continuar por aqui.',
        humanAssigned: true,
        metadata: this.buildHbxEmailPendingMetadata({
          metadata: input.metadata,
          job,
          status: 'failed',
          recipientEmail,
          errorMessage: String(error?.message || error || 'Falha no envio do e-mail.'),
          at: now,
        }),
        variables: {
          confidence: intent.confidence,
          recipientEmail,
          error: String(error?.message || error || ''),
        },
      });
      return { handled: true, classification: 'email_failed' };
    }

    if (!delivery.ok) {
      await input.setInboundMeta('vendas_prospeccao_email_falhou', false);
      await this.queueHbxEmailBotReply({
        companyId: input.companyId,
        conversationId: input.conversationId,
        to: input.from,
        body: 'Tive um problema para enviar a apresentação por e-mail agora. Vou encaminhar para atendimento humano continuar por aqui.',
        humanAssigned: true,
        metadata: this.buildHbxEmailPendingMetadata({
          metadata: input.metadata,
          job,
          status: 'failed',
          recipientEmail,
          errorMessage: delivery.delivery.errorMessage || 'Provedor de e-mail nao confirmou o envio.',
          at: now,
        }),
        variables: {
          confidence: intent.confidence,
          recipientEmail,
          errorCode: delivery.delivery.errorCode,
        },
      });
      return { handled: true, classification: 'email_failed' };
    }

    const sentAt = new Date(delivery.sentAt);
    const followUpAt = addBusinessHours(sentAt, 48);
    const metadata = this.buildHbxEmailSuccessMetadata({
      metadata: input.metadata,
      job,
      recipientName,
      recipientEmail,
      secondaryEmails: intent.extractedEmails.slice(1),
      delivery,
      followUpAt,
      inboundAt: now,
    });

    await this.updateHbxEmailProfileAndLead({
      companyId: input.companyId,
      job,
      recipientEmail,
      sentAt,
      followUpAt,
    });
    await this.updateAtendimentoConversationState(
      input.companyId,
      input.conversationId,
      {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.HUMAN,
        botActive: false,
        humanAssigned: false,
        flowResult: 'prospection_email_sent',
      },
      metadata,
    );
    await input.setInboundMeta('vendas_prospeccao_email_enviado', false);
    await this.queueHbxEmailBotReply({
      companyId: input.companyId,
      conversationId: input.conversationId,
      to: input.from,
      body: `Agradeço o retorno. Acabei de enviar a apresentação do HBX para ${recipientEmail}.\nQualquer dúvida, pode me chamar por aqui.`,
      variables: {
        confidence: intent.confidence,
        recipientEmail,
        messageId: delivery.delivery.messageId,
        followUpAt: followUpAt.toISOString(),
      },
    });

    this.publishVendasAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: 'Apresentacao HBX enviada por e-mail. Retorno agendado.',
      type: 'hbx_email_sent',
    });

    return { handled: true, classification: 'email_sent' };
  }

  /**
   * PR05072026 (timing humano) — piso aleatório humano da fase 1 (2-6s default),
   * configurável via env para calibração/teste. NÃO é o teto da fase 1 — é só o
   * mínimo aplicado quando a classificação foi instantânea (caminho keyword). Env
   * ausente/inválida cai no default do módulo (`randomSilenceFloorMs()`); testes
   * pinam `HBX_PROSPECTING_SILENCE_FLOOR_MAX_MS=0` para não esperar de verdade.
   */
  private resolveVendasSilenceFloorMs(): number {
    const min = Number(process.env.HBX_PROSPECTING_SILENCE_FLOOR_MIN_MS);
    const max = Number(process.env.HBX_PROSPECTING_SILENCE_FLOOR_MAX_MS);
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= 0) {
      return randomSilenceFloorMs(min, max);
    }
    return randomSilenceFloorMs();
  }

  /**
   * PR05072026 (timing humano) — fase 2 "viu": marca a mensagem inbound do lead
   * como lida via Webwhats (`markMessagesAsRead`, rota já existente no motor).
   * BEST-EFFORT: qualquer falha (motor fora, jid ausente, sessão não-Webwhats)
   * só loga warn — nunca bloqueia a classificação/resposta, que já foi decidida.
   */
  private async markVendasAutomationInboundAsReadBestEffort(input: {
    companyId: number;
    conversationId: number;
    inboundMessageId: number;
  }): Promise<void> {
    try {
      const message = await this.prisma.companyMessage.findUnique({
        where: { id: input.inboundMessageId },
        select: {
          rawPayload: true,
          providerMessageId: true,
          whatsappConnectionSessionId: true,
          sourceTenantKey: true,
        },
      });
      if (!message) return;
      const rawPayload = this.parseConversationMetadata(message.rawPayload as any);
      const rawIdFromPayload = String(rawPayload?.key?.id || '').trim();
      const rawIdFromProviderId = String(message.providerMessageId || '').split(':').pop()?.trim() || '';
      const rawId = rawIdFromPayload || rawIdFromProviderId;
      if (!rawId) return;
      const remoteJid = String(rawPayload?.key?.remoteJid || '').trim() || null;

      const conversation = await this.prisma.companyConversation.findFirst({
        where: { id: input.conversationId, companyId: input.companyId },
        select: { metadata: true },
      });
      const conversationMetadata = this.parseConversationMetadata(conversation?.metadata as any);
      const selector = {
        sessionId: message.whatsappConnectionSessionId ?? null,
        tenantKey: message.sourceTenantKey ?? null,
      };

      await this.webwhatsBridge.markMessagesAsRead(
        input.companyId,
        {
          conversationId: input.conversationId,
          remoteJid: remoteJid || String(conversationMetadata?.whatsappRemoteJid || '').trim() || null,
          messages: [{ id: rawId, fromMe: false, remoteJid }],
        },
        selector,
      );
    } catch (error: any) {
      this.logger.warn(
        `[prospeccao] marcar como lida (timing humano) falhou company=${input.companyId} conversation=${input.conversationId}: ${String(error?.message || error)}`,
      );
    }
  }

  /**
   * PR05072026 (timing humano) — fase 3 "digitando": ms de presence "composing"
   * proporcional ao tamanho de `body`, clampado nos knobs `typingSeconds`/
   * `typingVarianceSeconds` JÁ EXISTENTES da campanha (mesmos usados pelo delay de
   * primeiro contato em vendas-automation.service.ts). Sem knobs configurados
   * (undefined/null) cai no default 8s + variância 12s — mesmo default do primeiro
   * contato — para não silenciar o typing por omissão em campanhas antigas.
   */
  private computeVendasFollowUpTypingDelayMs(campaign: any, body: string): number {
    const typingSecondsKnob = clampTimingInteger(campaign?.typingSeconds, 8, 0, 45);
    const typingVarianceSecondsKnob = clampTimingInteger(campaign?.typingVarianceSeconds, 12, 0, 30);
    const { typingMs } = computeHumanTimingPhases({
      aiElapsedMs: 0,
      responseBody: String(body || ''),
      typingSecondsKnob,
      typingVarianceSecondsKnob,
    });
    return typingMs;
  }

  private async handleVendasAutomationInbound(input: {
    companyId: number;
    conversationId: number;
    inboundMessageId: number;
    from: string;
    text: string;
    timestamp: Date;
    metadata: Record<string, any>;
    setInboundMeta: (sourceModule: string, isComplaint: boolean) => Promise<void>;
  }) {
    const job = await this.findVendasAutomationJobForInbound(input);
    if (!job?.campaign || !job?.lead) return null;
    if (String(job.status || '') === 'replied_positive') {
      return this.handleVendasProspectionScheduleReply(input, job);
    }
    if (String(job.status || '') !== 'sent') return null;
    const automation = this.readJsonRecord(input.metadata?.vendasAutomation);
    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const automationStatus = this.normalizeVendasAutomationIntentText(automation.status);
    const queueStatus = this.normalizeVendasAutomationIntentText(queue.status);
    const awaitingPreMessageHumanReply = this.isVendasPreMessageAwaitingHumanForJob(input.metadata, job);
    const filters = this.readJsonRecord(job.campaign.filtersJson);
    const positiveKeywords = this.readJsonTextList(job.campaign.positiveIntentKeywordsJson, [
      'tenho interesse',
      'pode mandar',
      'quero saber',
      'me explica',
      'quanto custa',
    ]).map((item) => this.normalizeVendasAutomationIntentText(item));
    const negativeKeywords = this.readJsonTextList(job.campaign.negativeIntentKeywordsJson, [
      'nao tenho interesse',
      'não tenho interesse',
      'sem interesse',
      'pare',
      'remover',
      'spam',
      'nao me chame',
      'não me chame',
      'bloqueia',
      'não autorizei',
    ]).map((item) => this.normalizeVendasAutomationIntentText(item));
    const whatIsItKeywords = this.readJsonTextList(filters.whatIsItIntentKeywords, [
      'o que é',
      'oque é',
      'sobre o que',
      'como funciona',
      'me explica',
      'explica melhor',
      'do que se trata',
    ]).map((item) => this.normalizeVendasAutomationIntentText(item));
    const neutralKeywords = this.readJsonTextList(filters.neutralIntentKeywords, [
      'vou ver',
      'mais tarde',
      'depois',
      'manda depois',
      'me chama depois',
      'entendi',
      'ok',
    ]).map((item) => this.normalizeVendasAutomationIntentText(item));
    const callbackKeywords = this.readJsonTextList(filters.callbackIntentKeywords, [
      'depois',
      'mais tarde',
      'outro horario',
      'outro dia',
      'amanha',
      'semana que vem',
      'pode ligar depois',
      'me chama depois',
      'manda depois',
      'agora nao',
    ]).map((item) => this.normalizeVendasAutomationIntentText(item));
    const humanHandoffKeywords = this.readJsonTextList(filters.humanHandoffIntentKeywords, [
      'humano',
      'atendente',
      'consultor',
      'ligar',
      'me liga',
      'me chama',
      'pode ligar',
    ]).map((item) => this.normalizeVendasAutomationIntentText(item));

    // PR05072026 (timing humano) — fase 1 "antes de ver": SILÊNCIO TOTAL (sem read,
    // sem presence) enquanto a IA classifica. A resposta só é decidida quando esta
    // fase acaba. Duração = tempo real da classificação (IA pode levar até o timeout
    // configurado em HBX_LLM_CLASSIFIER_TIMEOUT_MS — sem teto novo aqui), com um piso
    // aleatório humano só para o caminho keyword (~0ms, responderia instantâneo sem
    // o piso). O ÚNICO clamp de timing fica na fase 3 (digitando), não aqui.
    const aiStartedAt = Date.now();
    const { intent, autoReply: autoReplyClassification } = await this.intentEngine.classifyIntentWithFallback(
      {
        text: input.text,
        positiveKeywords,
        negativeKeywords,
        whatIsItKeywords,
        neutralKeywords,
        callbackKeywords,
        humanHandoffKeywords,
      },
      // Caminho VIVO de produção (inbound real da prospecção) → grava a decisão.
      { companyId: input.companyId, conversationId: input.conversationId, flow: 'prospeccao' },
    );
    const aiElapsedMs = Date.now() - aiStartedAt;
    const silenceMs = computeSilenceRemainderMs(aiElapsedMs, this.resolveVendasSilenceFloorMs());
    if (silenceMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, silenceMs));
    }
    // Fase 2 "viu": marca como lida SÓ ao fim do silêncio — best-effort (nunca
    // bloqueia a classificação/resposta já decidida por falha de read receipt).
    await this.markVendasAutomationInboundAsReadBestEffort(input).catch(() => null);

    const terminalStatus = new Set(['negative', 'opt_out', 'replied_negative', 'no_response_archived']);
    const alreadyClosed =
      terminalStatus.has(automationStatus) ||
      terminalStatus.has(queueStatus) ||
      input.metadata?.blacklist === true ||
      input.metadata?.blacklisted === true ||
      input.metadata?.optOut === true ||
      queue.blacklist === true ||
      queue.blacklisted === true ||
      queue.optOut === true ||
      queue.doNotContact === true ||
      String(job.lead.status || '') === 'encerrado' ||
      job.lead.closedAt ||
      job.lead.wasClosedBefore;
    if (alreadyClosed) return null;

    if (intent.kind === 'negative' || intent.kind === 'opt_out') {
      await input.setInboundMeta(intent.kind === 'opt_out' ? 'vendas_prospeccao_opt_out' : 'vendas_prospeccao_negativo', false);
      await this.markVendasAutomationNegative({ ...input, optOut: intent.kind === 'opt_out' }, job);
      return { handled: true, classification: intent.kind };
    }

    const blockedStatus = new Set([
      'interested',
      'neutral',
      'human_assigned',
      'auto_reply_detected',
      'bot_menu_detected',
      'out_of_hours_auto_reply',
      'awaiting_human',
    ]);
    const blocked =
      blockedStatus.has(automationStatus) ||
      blockedStatus.has(queueStatus) ||
      input.metadata?.humanAssigned === true ||
      queue.humanAssigned === true;
    const hardBlocked = input.metadata?.humanAssigned === true || queue.humanAssigned === true;
    if (hardBlocked || (blocked && !awaitingPreMessageHumanReply)) return null;

    if (autoReplyClassification) {
      await input.setInboundMeta('vendas_prospeccao_auto_reply', false);
      await this.markVendasAutomationAutoReply({ ...input, classification: autoReplyClassification }, job);
      return { handled: true, classification: autoReplyClassification };
    }

    if (awaitingPreMessageHumanReply) {
      // A pré-mensagem só filtra bot: qualquer resposta humana libera o pitch.
      await input.setInboundMeta('vendas_prospeccao_pre_mensagem_humana', false);
      await this.prisma.$transaction((tx) => this.advanceVendasLeadFromProspectingOnHumanInbound(tx, {
        companyId: input.companyId,
        leadId: job.leadId,
        inboundMessageId: input.inboundMessageId,
        jobId: job.id,
        now: input.timestamp instanceof Date ? input.timestamp : new Date(),
        lastResult: 'Resposta humana recebida',
      }));
      await this.sendVendasPitchAfterPreMessage(input, job);
      return { handled: true, classification: 'pre_message_human_reply' };
    }

    const hbxEmailIntent = detectHbxPresentationEmailIntent(input.text);
    const hbxEmailHandled = await this.handleHbxPresentationEmailIntent(input, job, hbxEmailIntent);
    if (hbxEmailHandled) return hbxEmailHandled;

    if (intent.kind === 'ambiguous_intent' || intent.confidence < 0.5) {
      await input.setInboundMeta('vendas_prospeccao_duvida', false);
      await this.markVendasAutomationNeutral({ ...input, intentReview: intent }, job);
      await this.notifyWebwhatsSelfAlert({
        companyId: input.companyId,
        conversationId: input.conversationId,
        metadata: input.metadata,
        title: intent.kind === 'ambiguous_intent' ? 'Prospecção em dúvida' : 'Baixa confiança',
        text: input.text,
        reasons: intent.reasons,
        leadName: job.lead?.name || null,
        leadPhone: job.lead?.phoneNormalized || job.lead?.phone || input.from || null,
      });
      return { handled: true, classification: intent.kind === 'ambiguous_intent' ? 'ambiguous_intent' : 'low_confidence' };
    }

    if (intent.kind === 'positive' || intent.kind === 'what_is_it') {
      await input.setInboundMeta('vendas_prospeccao_interessado', false);
      await this.markVendasAutomationInterested({ ...input, replyKind: intent.kind }, job);
      return { handled: true, classification: intent.kind };
    }

    if (intent.kind === 'human_requested') {
      await input.setInboundMeta('vendas_prospeccao_humano', false);
      await this.markVendasAutomationNeutral({ ...input, humanRequested: true }, job);
      return { handled: true, classification: 'human_requested' };
    }

    await input.setInboundMeta('vendas_prospeccao_neutro', false);
    await this.markVendasAutomationNeutral({ ...input, intentReview: intent.confidence < 0.5 ? intent : undefined }, job);
    return { handled: true, classification: intent.reasons.includes('low_confidence') ? 'low_confidence' : 'neutral' };
  }

  private async advanceVendasLeadFromProspectingOnHumanInbound(
    tx: any,
    input: {
      companyId: number;
      leadId: string;
      inboundMessageId?: number | null;
      jobId: string;
      now: Date;
      lastResult: string;
    },
  ) {
    const moved = await tx.vendasLead.updateMany({
      where: {
        id: input.leadId,
        companyId: input.companyId,
        OR: [
          { pipelineStage: 'prospeccao' },
          { pipelineStage: null, status: 'novo' },
        ],
      },
      data: {
        pipelineStage: 'qualificacao',
        // Compatibilidade do Kanban legado: `contato` representa Qualificacao.
        status: 'contato',
        lastResult: input.lastResult,
        returnAt: input.now,
      },
    });
    if (Number(moved?.count || 0) !== 1) return false;

    if (typeof tx?.vendasLeadTimelineEvent?.createMany === 'function') {
      await tx.vendasLeadTimelineEvent.createMany({
        data: [{
          leadId: input.leadId,
          eventType: 'stage_changed',
          title: 'Lead avançou para Qualificação',
          description: 'Resposta humana válida recebida na prospecção pelo WhatsApp.',
          sourceType: 'vendas_prospeccao_bot',
          statusFrom: 'novo',
          statusTo: 'contato',
          resultLabel: input.lastResult,
          idempotencyKey: `vendas-prospeccao:human-qualified:${input.jobId}:${Number(input.inboundMessageId || 0)}`,
        }],
        skipDuplicates: true,
      });
    }
    return true;
  }

  private async markVendasAutomationInterested(input: any, job: any) {
    const now = new Date();
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendasAutomationJob.updateMany({
        where: { id: job.id, companyId: input.companyId, status: 'sent' },
        data: {
          status: 'replied_positive',
          repliedAt: now,
          classification: 'positive',
          conversationId: input.conversationId,
        },
      });
      if (Number(updated?.count || 0) !== 1) return false;
      await tx.vendasAutomationJob.updateMany({
        where: {
          companyId: input.companyId,
          leadId: job.leadId,
          id: { not: job.id },
          status: { in: ['pending', 'scheduled'] },
        },
        data: { status: 'canceled', archivedAt: now, errorMessage: 'Lead respondeu com interesse.' },
      });
      await this.advanceVendasLeadFromProspectingOnHumanInbound(tx, {
        companyId: input.companyId,
        leadId: job.leadId,
        inboundMessageId: input.inboundMessageId,
        jobId: job.id,
        now,
        lastResult: 'Interessado',
      });
      return true;
    });
    if (!claimed) return;

    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const automation = this.readJsonRecord(input.metadata?.vendasAutomation);
    const prospeccao = this.readJsonRecord(input.metadata?.vendasProspeccao);
    const followUpMessage = this.pickVendasVariant(
      job.campaign,
      job,
      input.replyKind === 'what_is_it' ? 'whatIsItReplyVariants' : 'positiveReplyVariants',
      input.replyKind === 'what_is_it'
        ? [
            'Claro. É sobre consultoria e implantação de melhorias na rotina da empresa. Eu analiso processos manuais, retrabalho, controles espalhados e tarefas repetitivas, e vejo o que pode ser organizado ou automatizado.',
            'É um trabalho para ajudar empresas a ganhar tempo e reduzir bagunça operacional. Eu entendo como a empresa funciona hoje e proponho soluções práticas: automações, sistemas simples, organização de fluxo ou ajustes no processo.',
            'Basicamente eu ajudo a empresa a parar de depender tanto de planilha solta, memória, mensagem perdida e tarefa manual. Primeiro eu entendo o problema, depois implanto o que fizer sentido para aquela operação.',
            'É uma consultoria bem prática. Eu olho áreas como atendimento, vendas, administrativo, retornos, cadastros, controles e tarefas repetitivas, e vejo onde dá para simplificar ou automatizar.',
            'É sobre melhorar a operação da empresa. Não é uma solução única para todo mundo: eu entendo o gargalo, desenho uma forma mais organizada de trabalhar e implanto algo que ajude no dia a dia.',
          ]
        : [
            'Boa! A ideia é entender como funciona a rotina de vocês hoje, onde tem retrabalho, tarefa manual ou informação perdida, e ver se dá para resolver com uma automação ou ajuste simples no processo. Posso te ligar rapidinho?',
            'Perfeito. Primeiro eu entendo o cenário da empresa, porque cada operação tem um gargalo diferente. Pode ser atendimento, vendas, financeiro, planilhas, retornos, cadastros, tarefas internas… aí vejo o que faria sentido implantar. Posso te chamar numa ligação rápida?',
            'Show. Meu trabalho não é empurrar uma ferramenta pronta. Eu entendo o processo, vejo onde a empresa está perdendo tempo e monto uma solução em cima da necessidade real. Posso te ligar 2 minutinhos para entender melhor?',
            'Legal. Normalmente eu converso com o gestor ou responsável pela operação, faço algumas perguntas sobre a rotina e identifico onde uma melhoria simples já poderia economizar tempo. Pode ser uma ligação rápida?',
            'Boa. A ideia é bem prática: entender o que hoje é manual, repetitivo ou bagunçado, e ver se vale implantar alguma automação, organização ou sistema simples para facilitar. Posso te ligar rapidinho?',
          ],
      await this.buildVendasTemplateExtraValues(job),
    );
    const nextMetadata = {
      ...this.clearAtendimentoBlockedMetadata(input.metadata),
      botActive: false,
      humanAssigned: false,
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      hbotBlockedReason: 'prospection_attention_required',
      prospectionAttentionRequired: true,
      prospectionAttentionTone: 'green',
      vendasAutomation: {
        ...automation,
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
        status: 'contato',
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
      vendasProspeccao: {
        ...prospeccao,
        stage: 'reply_received',
        lastInboundAt: input.timestamp instanceof Date ? input.timestamp.toISOString() : now.toISOString(),
        leadSegment: job.lead?.segment || prospeccao.leadSegment || null,
        campaignSegment: job.campaign?.segment || prospeccao.campaignSegment || null,
        mismatchReason: null,
      },
    };
    const nextState = {
      currentFlow: ATENDIMENTO_FLOW_ID,
      currentStep: ATENDIMENTO_STEP.MAIN_MENU,
      botActive: false,
      humanAssigned: false,
      flowResult: 'prospection_interested',
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
            purpose: 'conversation_reply',
            botType: 'prospeccao',
            campaignId: job.campaignId,
            jobId: job.id,
            leadId: job.leadId,
            replyKind: input.replyKind || 'positive',
            automaticFollowUp: true,
            // PR05072026 (timing humano): fase 3 "digitando" proporcional ao tamanho
            // desta resposta, já clampada nos knobs typingSeconds/typingVarianceSeconds
            // da campanha — o dispatch worker só repassa ao motor (sendText delay).
            typingDelayMs: this.computeVendasFollowUpTypingDelayMs(job.campaign, followUpMessage),
          },
          flowState: {
            ...nextState,
            metadata: nextMetadata,
          },
        });
      } catch (error: any) {
        this.logger.warn(`Falha ao enviar resposta positiva da prospeccao job=${job.id}: ${String(error?.message || error)}`);
        await this.updateAtendimentoConversationState(input.companyId, input.conversationId, nextState, {
          ...nextMetadata,
          vendasAutomation: {
            ...this.readJsonRecord(nextMetadata.vendasAutomation),
            followUpSent: false,
            followUpError: String(error?.message || error),
          },
          vendasAgendaQueue: {
            ...this.readJsonRecord(nextMetadata.vendasAgendaQueue),
            nextAction: 'Prospecção: falha ao enviar resposta automática',
          },
        });
      }
    } else {
      await this.updateAtendimentoConversationState(input.companyId, input.conversationId, nextState, nextMetadata);
    }
    this.logger.log(`[prospeccao] inbound detectado, mantendo em prospeccao conversation=${input.conversationId}`);
    this.publishVendasAutomationEvent({
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

  private async markVendasAutomationNegative(input: any, job: any) {
    const now = new Date();
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendasAutomationJob.updateMany({
        where: { id: job.id, companyId: input.companyId, status: 'sent' },
        data: {
          status: 'replied_negative',
          repliedAt: now,
          archivedAt: now,
          classification: input.optOut ? 'opt_out' : 'negative',
          conversationId: input.conversationId,
        },
      });
      if (Number(updated?.count || 0) !== 1) return false;
      await tx.vendasAutomationJob.updateMany({
        where: {
          companyId: input.companyId,
          leadId: job.leadId,
          id: { not: job.id },
          status: { in: ['pending', 'scheduled'] },
        },
        data: { status: 'canceled', archivedAt: now, errorMessage: 'Lead respondeu negativamente.' },
      });
      await tx.vendasLead.updateMany({
        where: { id: job.leadId, companyId: input.companyId },
        data: {
          status: 'encerrado',
          outcome: input.optOut ? 'opt_out' : 'no_interest',
          wasClosedBefore: true,
          closedAt: now,
          lastResult: input.optOut ? 'Opt-out' : 'Sem interesse',
        },
      });
      await tx.vendasLeadTimelineEvent.createMany({
        data: [{
          leadId: job.leadId,
          eventType: 'lead_closed',
          title: 'Resposta negativa',
          description: this.buildLeadClosureTimelineDescription({
            conversationId: input.conversationId,
            inboundMessageId: input.inboundMessageId,
            detectedText: input.text,
            sourceModule: 'vendas_prospeccao_bot',
            closureReason: input.optOut ? 'opt_out' : 'negative',
            createdAt: now,
          }),
          sourceType: 'vendas_prospeccao_bot',
          statusTo: 'encerrado',
          resultLabel: input.optOut ? 'Opt-out' : 'Sem interesse',
          idempotencyKey: `vendas-prospeccao:negative:${job.id}:${Number(input.inboundMessageId || 0)}`,
        }],
        skipDuplicates: true,
      });
      return true;
    });
    if (!claimed) return;

    const optOutMessage = this.pickVendasVariant(
      job.campaign,
      job,
      'optOutVariants',
      [
        String(job.campaign.optOutMessage || '').trim() || 'Entendi. Vou arquivar este contato e nao chamaremos novamente.',
        'Tudo bem. Vou remover este contato da prospecção.',
        'Entendido. Não vamos chamar novamente por aqui.',
      ],
      await this.buildVendasTemplateExtraValues(job),
    );
    if (this.vendasCampaignOptOutReplyEnabled(job.campaign) && optOutMessage) {
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
            purpose: 'conversation_reply',
            botType: 'prospeccao',
            campaignId: job.campaignId,
            jobId: job.id,
            leadId: job.leadId,
            optOut: input.optOut === true,
          },
          flowState: { botActive: false, humanAssigned: false, flowResult: 'prospection_negative' },
        });
      } catch (error: any) {
        this.logger.warn(`Falha ao enviar opt-out da prospeccao job=${job.id}: ${String(error?.message || error)}`);
      }
    }

    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const automation = this.readJsonRecord(input.metadata?.vendasAutomation);
    const prospeccao = this.readJsonRecord(input.metadata?.vendasProspeccao);
    await this.updateAtendimentoConversationState(
      input.companyId,
      input.conversationId,
      {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.CLOSED,
        botActive: false,
        humanAssigned: false,
        flowResult: 'prospection_negative',
      },
      {
        ...input.metadata,
        optOut: input.optOut === true,
        doNotContact: true,
        blacklisted: input.optOut === true,
        vendasAutomation: {
          ...automation,
          campaignId: job.campaignId,
          jobId: job.id,
          leadId: job.leadId,
          status: input.optOut ? 'opt_out' : 'negative',
          outcome: input.optOut ? 'opt_out' : 'no_interest',
          optOut: input.optOut === true,
          doNotContact: true,
          blacklisted: input.optOut === true,
          negativeAt: now.toISOString(),
        },
        vendasAgendaQueue: {
          ...queue,
          active: false,
          leadId: job.leadId,
          status: 'encerrado',
          outcome: input.optOut ? 'opt_out' : 'no_interest',
          draftPending: false,
          botEligible: false,
          botEntryPending: false,
          optOut: input.optOut === true,
          doNotContact: true,
          blacklisted: input.optOut === true,
          syncedAt: now.toISOString(),
          deactivatedAt: now.toISOString(),
        },
        vendasProspeccao: {
          ...prospeccao,
          stage: 'negative_reply',
          lastInboundAt: input.timestamp instanceof Date ? input.timestamp.toISOString() : now.toISOString(),
          leadSegment: job.lead?.segment || prospeccao.leadSegment || null,
          campaignSegment: job.campaign?.segment || prospeccao.campaignSegment || null,
          mismatchReason: null,
        },
      },
    );
    this.logger.log(`[prospeccao] inbound negativo marcado no card/lead conversation=${input.conversationId}`);
    this.publishVendasAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: 'Lead arquivado por resposta negativa.',
      type: 'lead_archived',
    });
    await this.pauseVendasCampaignAfterRealNegativeLimit(job.campaign, now).catch(() => null);
  }

  private async pauseVendasCampaignAfterRealNegativeLimit(campaign: any, now: Date) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const count = await this.prisma.vendasAutomationJob.count({
      where: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        OR: [
          { status: 'replied_negative', repliedAt: { gte: start, lt: end } },
          { classification: 'negative_or_opt_out', archivedAt: { gte: start, lt: end } },
        ],
      },
    });
    if (count < 3) return;
    const text = `Campanha pausada por segurança: ${count} negativas/opt-outs reais hoje.`;
    await this.prisma.vendasAutomationCampaign.updateMany({
      where: { id: campaign.id, companyId: campaign.companyId },
      data: { status: 'paused', lastStatusText: text, lastError: text },
    });
    this.publishVendasAutomationEvent({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      status: 'pausado',
      text,
      type: 'real_negative_safety_pause',
    });
  }

  private buildLeadClosureTimelineDescription(input: {
    conversationId?: number | string | null;
    inboundMessageId?: number | string | null;
    detectedText?: string | null;
    sourceModule?: string | null;
    closureReason?: string | null;
    createdAt: Date;
  }) {
    const inboundMessageId = Number(input.inboundMessageId || 0) || null;
    return JSON.stringify({
      kind: 'lead_closure_conversation',
      conversationId: Number(input.conversationId || 0) || null,
      anchorMessageId: inboundMessageId,
      inboundMessageId,
      detectedText: String(input.detectedText || '').trim().slice(0, 1000) || null,
      sourceModule: String(input.sourceModule || '').trim() || null,
      createdAt: input.createdAt.toISOString(),
      closureReason: String(input.closureReason || '').trim() || null,
    });
  }

  private async pauseVendasCampaignAfterAutoReplyStreak(campaign: any, now: Date) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const jobs = await this.prisma.vendasAutomationJob.findMany({
      where: {
        campaignId: campaign.id,
        companyId: campaign.companyId,
        sentAt: { gte: start, lt: end },
        classification: { in: ['auto_reply_detected', 'bot_menu_detected', 'out_of_hours_auto_reply', 'awaiting_human'] as any },
      },
      orderBy: { sentAt: 'desc' },
      take: 5,
      select: { classification: true },
    }).catch(() => []);
    if (jobs.length < 5) return;
    const text = 'Campanha pausada por segurança: 5 auto-respostas seguidas. Aguardando humano/fora de horário.';
    await this.prisma.vendasAutomationCampaign.updateMany({
      where: { id: campaign.id, companyId: campaign.companyId },
      data: { status: 'paused', lastStatusText: text, lastError: text },
    });
    this.publishVendasAutomationEvent({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      status: 'pausado',
      text,
      type: 'auto_reply_streak_safety_pause',
    });
  }

  private async markVendasAutomationAutoReply(input: any, job: any) {
    const now = new Date();
    const classification = String(input.classification || 'auto_reply_detected') as ProspectingAutoReplyClassification;
    await this.prisma.vendasAutomationJob.update({
      where: { id: job.id },
      data: { classification, repliedAt: now, conversationId: input.conversationId },
    });
    await this.prisma.vendasAutomationJob.updateMany({
      where: {
        companyId: input.companyId,
        leadId: job.leadId,
        id: { not: job.id },
        status: { in: ['pending', 'scheduled'] },
      },
      data: { status: 'canceled', archivedAt: now, errorMessage: 'Autoatendimento detectado. Aguardando humano.' },
    });
    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const automation = this.readJsonRecord(input.metadata?.vendasAutomation);
    const prospeccao = this.readJsonRecord(input.metadata?.vendasProspeccao);
    await this.updateAtendimentoConversationState(
      input.companyId,
      input.conversationId,
      {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.HUMAN,
        botActive: false,
        humanAssigned: false,
        flowResult: 'prospection_auto_reply',
      },
      {
        ...this.clearAtendimentoBlockedMetadata(input.metadata),
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        vendasAutomation: {
          ...automation,
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
        vendasProspeccao: {
          ...prospeccao,
          // Auto-resposta e sinal tecnico, nao resposta humana e nao muda etapa.
          stage: prospeccao.stage || 'sent_waiting',
          lastInboundAt: input.timestamp instanceof Date ? input.timestamp.toISOString() : now.toISOString(),
          leadSegment: job.lead?.segment || prospeccao.leadSegment || null,
          campaignSegment: job.campaign?.segment || prospeccao.campaignSegment || null,
          mismatchReason: null,
        },
      },
    );
    this.publishVendasAutomationEvent({
      companyId: input.companyId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      conversationId: input.conversationId,
      status: 'aguardando',
      text: classification === 'out_of_hours_auto_reply' ? 'Fora de horário detectado. Não insistir agora.' : 'Autoatendimento detectado. Aguardando humano.',
      type: classification,
    });
    const nextScheduledAt = await this.reduceNextVendasAutomationIntervalAfterBot(job.campaign, job.id, now).catch(() => null);
    if (nextScheduledAt) {
      this.publishVendasAutomationEvent({
        companyId: input.companyId,
        campaignId: job.campaignId,
        jobId: job.id,
        leadId: job.leadId,
        conversationId: input.conversationId,
        status: 'aguardando',
        text: 'Autoatendimento detectado. Próximo disparo adiantado.',
        type: 'auto_reply_next_interval_reduced',
      });
    }
    await this.pauseVendasCampaignAfterAutoReplyStreak(job.campaign, now).catch(() => null);
  }

  private async markVendasAutomationNeutral(input: any, job: any) {
    const now = new Date();
    const intentReview = input.intentReview && typeof input.intentReview === 'object' ? input.intentReview : null;
    const jobClassification = intentReview?.kind === 'ambiguous_intent'
      ? 'ambiguous_intent'
      : intentReview?.confidence < 0.5
        ? 'low_confidence'
        : 'neutral';
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendasAutomationJob.updateMany({
        where: { id: job.id, companyId: input.companyId, status: 'sent' },
        data: {
          status: 'canceled',
          classification: jobClassification,
          repliedAt: now,
          archivedAt: now,
          conversationId: input.conversationId,
          errorMessage: 'Resposta humana recebida; automação encerrada.',
        },
      });
      if (Number(updated?.count || 0) !== 1) return false;
      await this.advanceVendasLeadFromProspectingOnHumanInbound(tx, {
        companyId: input.companyId,
        leadId: job.leadId,
        inboundMessageId: input.inboundMessageId,
        jobId: job.id,
        now,
        lastResult: input.humanRequested ? 'Solicitou atendimento humano' : 'Resposta recebida',
      });
      return true;
    });
    if (!claimed) return;
    const queue = this.readJsonRecord(input.metadata?.vendasAgendaQueue);
    const automation = this.readJsonRecord(input.metadata?.vendasAutomation);
    const prospeccao = this.readJsonRecord(input.metadata?.vendasProspeccao);
    await this.updateAtendimentoConversationState(
      input.companyId,
      input.conversationId,
      {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.MAIN_MENU,
        botActive: false,
        humanAssigned: false,
        flowResult: 'prospection_neutral',
      },
      {
        ...this.clearAtendimentoBlockedMetadata(input.metadata),
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
          ...automation,
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
          status: 'contato',
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
        vendasProspeccao: {
          ...prospeccao,
          stage: 'reply_received',
          lastInboundAt: input.timestamp instanceof Date ? input.timestamp.toISOString() : now.toISOString(),
          leadSegment: job.lead?.segment || prospeccao.leadSegment || null,
          campaignSegment: job.campaign?.segment || prospeccao.campaignSegment || null,
          mismatchReason: null,
        },
      },
    );
    this.logger.log(`[prospeccao] inbound detectado, mantendo em prospeccao conversation=${input.conversationId}`);
    this.publishVendasAutomationEvent({
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

  private async resolveAtendimentoIdentityState(input: {
    companyId: number;
    phone: string;
    metadata?: Record<string, any> | null;
    fallbackName?: string | null;
  }) {
    const metadata = input.metadata || {};
    const phoneNormalized = this.customerProfileService.normalizePhone(input.phone);
    const metadataName = this.normalizeCustomerProfileName(
      metadata?.cliente || metadata?.customerName || metadata?.name,
    );
    const findPreferredProfileByPhoneNormalized =
      (this.customerProfileService as any).findPreferredProfileByPhoneNormalized;
    const profile =
      phoneNormalized && typeof findPreferredProfileByPhoneNormalized === 'function'
        ? await findPreferredProfileByPhoneNormalized.call(
            this.customerProfileService,
            input.companyId,
            phoneNormalized,
          )
        : null;

    const registry = phoneNormalized
      ? await this.prisma.atendimentoCustomer.findUnique({
          where: {
            companyId_phoneNormalized: {
              companyId: input.companyId,
              phoneNormalized,
            },
          },
          select: {
            name: true,
            registrationStatus: true,
            customerProfile: {
              select: {
                name: true,
              },
            },
          },
        })
      : null;

    const registrationStatus = String(registry?.registrationStatus || '').trim().toLowerCase();
    const registryName = this.normalizeCustomerProfileName(registry?.name || null);
    const profileConfirmedName = this.normalizeCustomerProfileName(
      profile?.name || registry?.customerProfile?.name || null,
    );
    const profileName = this.normalizeCustomerProfileName(profile?.profileName || null);
    const fallbackName = this.normalizeCustomerProfileName(input.fallbackName || null);
    const profileNameConfirmed = profile?.nameConfirmed === true || Boolean(profileConfirmedName);
    const isConfirmed =
      Boolean(metadataName)
      || profileNameConfirmed
      || registrationStatus === 'confirmed'
      || registrationStatus === 'manual';
    const confirmedName =
      metadataName
      || (profileNameConfirmed ? profileConfirmedName : null)
      || (isConfirmed ? registryName || profileConfirmedName : null)
      || null;

    return {
      profileId: profile?.id ? String(profile.id) : null,
      name: confirmedName || profileName || fallbackName || registryName || profileConfirmedName || null,
      confirmedName,
      isConfirmed,
      registrationStatus: registrationStatus || null,
      botOff: profile?.botOff === true,
      botOffReason: String(profile?.botOffReason || '').trim() || null,
    };
  }

  private async tryEnterVendasAgendaBotGate(input: {
    companyId: number;
    from: string;
    conversationId: number;
    inboundMessageId: number;
    timestamp: Date;
    company: { id: number; name: string; timezone?: string | null };
    metadata: Record<string, any>;
    config: AtendimentoBotConfig;
    inboundProfileName?: string | null;
    setInboundMeta: (sourceModule: string, isComplaint: boolean) => Promise<void>;
  }) {
    const queue = this.readVendasAgendaQueueMetadata(input.metadata);
    if (!queue?.active || queue.botEntryPending !== true) return null;

    const sourceModule = String(queue.sourceModule || '').trim().toLowerCase();
    if (sourceModule && sourceModule !== 'vendas') return null;

    const sourceBlock = String(queue.sourceBlock || '').trim().toLowerCase();
    if (sourceBlock && sourceBlock !== 'today') return null;

    const manualSentAt = this.normalizeIsoDateTime(queue.manualSentAt || queue.lastManualSendAt);
    if (!queue.manualSent && !manualSentAt) return null;
    if (manualSentAt && input.timestamp.getTime() <= new Date(manualSentAt).getTime()) return null;

    const syncedAt = new Date().toISOString();
    const prospeccao = this.readJsonRecord(input.metadata?.vendasProspeccao);
    const nextProspeccao = {
      ...prospeccao,
      stage: 'reply_received',
      lastInboundAt: input.timestamp.toISOString(),
      firstOutboundAt: prospeccao.firstOutboundAt || manualSentAt || null,
      replyDeadlineAt: prospeccao.replyDeadlineAt || null,
      mismatchReason: null,
    };
    const identity = await this.resolveAtendimentoIdentityState({
      companyId: input.companyId,
      phone: input.from,
      metadata: input.metadata,
      fallbackName: input.inboundProfileName || null,
    });
    const botOffActive = this.isAtendimentoBotOff(input.metadata, queue, identity.botOff);
    const nextQueue: VendasAgendaQueueMetadata = {
      ...queue,
      queueTarget: queue.queueTarget || 'prospeccao',
      routeTarget: queue.routeTarget || queue.queueTarget || 'prospeccao',
      manualSent: true,
      manualSentAt: manualSentAt || syncedAt,
      lastManualSendAt: this.normalizeIsoDateTime(queue.lastManualSendAt || manualSentAt) || syncedAt,
      botEligible: !botOffActive,
      botEntryPending: false,
      syncedAt,
    };

    if (botOffActive) {
      await input.setInboundMeta('atendimento_human', false);
      await this.updateAtendimentoConversationState(
        input.companyId,
        input.conversationId,
        {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.HUMAN,
          botActive: false,
          humanAssigned: true,
          flowResult: null,
        },
        {
          ...this.clearAtendimentoBlockedMetadata(input.metadata),
          vendasAgendaQueue: nextQueue,
          vendasProspeccao: nextProspeccao,
        },
      );
      return { handled: true, humanMode: true, botSuppressed: true, botOff: true };
    }

    const metadataPatch: Record<string, unknown> = {
      ...this.clearAtendimentoBlockedMetadata(input.metadata),
      vendasAgendaQueue: nextQueue,
      vendasProspeccao: nextProspeccao,
      ...(identity.confirmedName ? { cliente: identity.confirmedName } : {}),
    };

    await input.setInboundMeta('atendimento_bot', false);

    if (!identity.isConfirmed) {
      await this.conversations.queueOutboundForCompany(input.companyId, {
        to: input.from,
        contactId: input.from,
        body: 'Oi, tudo bem? Antes de continuar, como posso te chamar?',
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.COLLECTING_NAME,
          botActive: true,
          humanAssigned: false,
          flowResult: null,
        },
      });
      await this.updateAtendimentoConversationState(
        input.companyId,
        input.conversationId,
        {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.COLLECTING_NAME,
          botActive: true,
          humanAssigned: false,
          flowResult: null,
        },
        metadataPatch,
      );
      return { handled: true, vendasAgendaBotGate: true, nameGate: true };
    }

    const vars = this.buildAtendimentoTemplateVars({
      companyName: input.company.name,
      phone: input.from,
      metadata: metadataPatch,
      recoveryCustomer: null,
    });
    await this.queueAtendimentoButtonPrompt({
      companyId: input.companyId,
      to: input.from,
      contactId: input.from,
      conversationId: input.conversationId,
      body: renderTemplate(input.config.mainMenuPrompt, vars, input.config),
      step: ATENDIMENTO_STEP.MAIN_MENU,
      buttons: input.config.mainMenuButtons,
      variables: metadataPatch,
    });
    return { handled: true, vendasAgendaBotGate: true, botEligible: true };
  }

  private extractInboundContactName(rawPayload: any, fallbackMetadata?: Record<string, any> | null) {
    const candidates = [
      rawPayload?._contactName,
      rawPayload?.pushName,
      rawPayload?.contactName,
      rawPayload?.contact?.name,
      rawPayload?.contact?.displayName,
      rawPayload?.contact?.formattedName,
      rawPayload?.contact?.fullName,
      rawPayload?.contact?.shortName,
      rawPayload?.contact?.notifyName,
      rawPayload?.contact?.verifiedName,
      rawPayload?.contact?.businessName,
      rawPayload?.chat?.name,
      rawPayload?.chat?.displayName,
      rawPayload?.chat?.formattedName,
      rawPayload?.chat?.fullName,
      rawPayload?.chat?.shortName,
      fallbackMetadata?.whatsappContactName,
      fallbackMetadata?.waNickname,
      fallbackMetadata?.whatsappName,
      fallbackMetadata?.whatsappProfileName,
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeCustomerProfileName(
        candidate === undefined || candidate === null ? null : String(candidate),
      );
      if (normalized) return normalized;
    }

    return null;
  }

  private shouldPromoteAtendimentoProfile(registrationStatus?: string | null) {
    const normalized = String(registrationStatus || '').trim().toLowerCase();
    return normalized === 'confirmed' || normalized === 'manual';
  }

  private async resolveAtendimentoCustomerProfile(input: {
    companyId: number;
    phone: string;
    name?: string | null;
    registrationOrigin?: string;
    registrationStatus?: string;
    nameSource?: string | null;
    inboundAt?: Date | null;
    metadata?: Record<string, any> | null;
  }) {
    const normalizedName = this.normalizeCustomerProfileName(input.name);
    const nameConfirmed = this.shouldPromoteAtendimentoProfile(input.registrationStatus);
    const botOffState = this.resolveInboundBotOffState(input.metadata || {});
    const statefulUpsert = (this.customerProfileService as any).upsertAtendimentoProfileState;

    if (typeof statefulUpsert === 'function') {
      return statefulUpsert.call(this.customerProfileService, {
        companyId: input.companyId,
        phone: input.phone,
        profileName: nameConfirmed ? null : normalizedName,
        confirmedName: nameConfirmed ? normalizedName : null,
        nameSource:
          String(input.nameSource || '').trim()
          || (nameConfirmed ? 'confirmed_inbound' : normalizedName ? 'whatsapp_profile' : null),
        nameConfirmed,
        inboundAt: input.inboundAt || new Date(),
        botOff: botOffState.botOff,
        botOffReason: botOffState.botOffReason,
        botOffAt: botOffState.botOffAt,
      });
    }

    const phoneNormalized = this.customerProfileService.normalizePhone(input.phone);
    if (!phoneNormalized) return null;

    return this.customerProfileService.upsertProfile({
      companyId: input.companyId,
      phone: input.phone,
      name: normalizedName,
      externalSource: input.registrationOrigin || 'whatsapp_bot',
      status: nameConfirmed ? 'active' : 'provisional',
    });
  }

  private async upsertAtendimentoCustomerLocal(input: {
    companyId: number;
    phone: string;
    name?: string | null;
    registrationOrigin?: string;
    registrationStatus?: string;
    conversationId?: number | null;
    nameSource?: string | null;
    inboundAt?: Date | null;
    metadata?: Record<string, any> | null;
  }) {
    let customerProfileId: string | null = null;
    let profile: any = null;

    try {
      profile = await this.resolveAtendimentoCustomerProfile(input);
      customerProfileId = profile?.id ? String(profile.id) : null;
    } catch (err) {
      this.logger.warn(`resolveAtendimentoCustomerProfile failed: ${(err as any)?.message}`);
    }

    try {
      await this.cadastrosService.upsertCustomerRegistry({
        ...input,
        customerProfileId,
        route: 'atendimento',
        lastMessageAt: input.inboundAt || new Date(),
      });
    } catch (err) {
      this.logger.warn(`upsertAtendimentoCustomerLocal failed: ${(err as any)?.message}`);
    }

    return {
      customerProfileId,
      profile,
    };
  }

  // INTENTENGINE S3: leitura sai da tabela emprestada (HbxRecoveryFlowStage com canal
  // mágico) e passa pelo BotConfigStoreService (BotConfig versionada, dual-read com
  // fallback pro canal legado). Ver docs/PLANEJAMENTOS/INTENTENGINE/INTENTENGINE-sprint3.md.

  private async getAtendimentoBotConfig(
    companyId: number,
    tenantContext?: { providerCapabilities: ProviderCapabilities; recoveryEnabled: boolean },
  ): Promise<AtendimentoBotConfig> {
    const context = tenantContext || (await this.resolveAtendimentoBotSanitizationContext(companyId));
    const payload = this.botConfigStore
      ? await this.botConfigStore.get(companyId, 'atendimento_bot')
      : null;
    return sanitizeAtendimentoBotConfigForTenant(
      normalizeAtendimentoBotConfig((payload as any) ?? null),
      context,
    );
  }

  private async getAtendimentoAgendaConfig(companyId: number): Promise<AtendimentoAgendaConfig> {
    const payload = this.botConfigStore
      ? await this.botConfigStore.get(companyId, 'atendimento_agenda')
      : null;
    if (!payload) return DEFAULT_ATENDIMENTO_AGENDA_CONFIG;
    return normalizeAtendimentoAgendaConfig(payload as any);
  }

  private async updateAtendimentoConversationState(
    companyId: number,
    conversationId: number,
    patch: ConversationStatePatch,
    metadataPatch?: Record<string, unknown> | null,
  ) {
    const current = await this.prisma.companyConversation.findFirst({
      where: { id: Number(conversationId), companyId, channel: 'whatsapp' },
      select: { id: true, metadata: true },
    });
    if (!current?.id) return null;
    const mergedMetadata =
      metadataPatch === undefined
        ? undefined
        : metadataPatch === null
          ? null
          : { ...this.parseConversationMetadata(current.metadata), ...metadataPatch };
    return this.conversations.updateConversationState(companyId, conversationId, {
      ...patch,
      currentFlow: patch.currentFlow || ATENDIMENTO_FLOW_ID,
      lastInteractionAt: patch.lastInteractionAt || new Date(),
      metadata: mergedMetadata,
    });
  }

  private async appendAtendimentoSystemEvent(input: {
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
      data: { lastInteractionAt: now },
    });
  }

  private toAtendimentoButtonId(buttonId: string) {
    return `${ATENDIMENTO_BUTTON_ID_PREFIX}${String(buttonId || '').trim()}`;
  }

  private fromAtendimentoButtonId(rawId: string) {
    const normalized = String(rawId || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.startsWith(ATENDIMENTO_BUTTON_ID_PREFIX)) {
      return normalized.slice(ATENDIMENTO_BUTTON_ID_PREFIX.length);
    }
    return normalized;
  }

  private getAtendimentoActionGuide(config: AtendimentoBotConfig, actionId: string) {
    const normalized = String(actionId || '').trim().toLowerCase();
    return (config.actionCatalog || []).find(
      (action) => String(action.actionId || '').trim().toLowerCase() === normalized,
    );
  }

  private isAtendimentoButtonSectionAction(
    buttons: AtendimentoBotButton[] | null | undefined,
    actionId: string,
  ) {
    const normalized = String(actionId || '').trim().toLowerCase();
    if (!normalized) return false;
    return (buttons || []).some(
      (button) => String(button.actionId || '').trim().toLowerCase() === normalized,
    );
  }

  private resolveAtendimentoActionIdFromButtonId(
    config: AtendimentoBotConfig,
    rawButtonId: string,
  ) {
    const normalized = this.fromAtendimentoButtonId(rawButtonId);
    if (!normalized) return '';
    const matchedButton = this.flattenAtendimentoButtons(config).find(
      (button) => String(button.buttonId || '').trim().toLowerCase() === normalized,
    );
    if (matchedButton?.actionId) {
      return String(matchedButton.actionId || '').trim().toLowerCase();
    }
    return normalized;
  }

  private buildAtendimentoActionAliasMap(
    config: AtendimentoBotConfig,
    agendaConfig: AtendimentoAgendaConfig,
  ) {
    const aliasMap: Record<string, string> = {
      atendente: 'talk_human',
      humano: 'talk_human',
      menu: 'show_main_menu',
      voltar: 'show_main_menu',
      encerrar: 'close_topic',
      debito: 'enter_recovery',
    };

    const mergeButtons = (buttons: AtendimentoBotButton[]) => {
      for (const button of buttons || []) {
        const label = this.normalizeActionLabel(button.title);
        if (!label) continue;
        aliasMap[label] = String(button.actionId || '').trim().toLowerCase();
      }
    };

    mergeButtons(config.welcomeButtons || []);
    mergeButtons(config.returningCustomerButtons || []);
    mergeButtons(config.mainMenuButtons || []);
    mergeButtons(config.recoveryDetectedButtons || []);
    mergeButtons(config.postActionButtons || []);

    for (const group of agendaConfig.groups || []) {
      const label = this.normalizeActionLabel(group.buttonLabel || group.title);
      if (!label) continue;
      aliasMap[label] = buildAtendimentoAgendaActionId(group.id);
    }

    for (const action of config.actionCatalog || []) {
      const label = this.normalizeActionLabel(String(action.title || ''));
      if (label) aliasMap[label] = String(action.actionId || '').trim().toLowerCase();
    }

    return aliasMap;
  }

  private normalizeAtendimentoActionId(
    rawActionId: string,
    config: AtendimentoBotConfig,
    rawPayload: any,
    normalizedText: string,
    agendaConfig: AtendimentoAgendaConfig,
    currentStep?: string | null,
  ) {
    const direct = this.resolveAtendimentoActionIdFromButtonId(config, rawActionId);
    if (direct) return direct;
    const aliasMap = this.buildAtendimentoActionAliasMap(config, agendaConfig);
    const normalizedPayloadText = this.normalizeActionLabel(extractInboundTextFromPayload(rawPayload));
    if (normalizedPayloadText && aliasMap[normalizedPayloadText]) return aliasMap[normalizedPayloadText];
    const numberedAction = this.pickNumberedButtonAction(
      normalizedText,
      this.getAtendimentoButtonsForStep(config, currentStep),
    );
    if (numberedAction) return numberedAction;
    if (normalizedText && aliasMap[this.normalizeActionLabel(normalizedText)]) {
      return aliasMap[this.normalizeActionLabel(normalizedText)];
    }
    return '';
  }

  /**
   * INTENTENGINE — Sprint 2: nível SEMÂNTICO de resolução, chamado só depois
   * que `normalizeAtendimentoActionId` (nível léxico: botão/número/aliasMap)
   * já devolveu vazio. Oferece ao LLM SÓ o catálogo já sanitizado do tenant
   * (`config.actionCatalog` — nunca a lista bruta) e usa o `actionId` retornado
   * SOMENTE quando a confiança bate o limiar (`classifyAtendimentoAction` já
   * aplica o corte). Qualquer falha (flag off, timeout, JSON inválido, baixa
   * confiança) devolve string vazia — o caller cai no menu, comportamento atual
   * intacto.
   */
  private async resolveAtendimentoActionIdFromNlu(input: {
    companyId: number;
    conversationId: number;
    text: string;
    config: AtendimentoBotConfig;
  }): Promise<string> {
    const { companyId, conversationId, text, config } = input;
    const actions = (config.actionCatalog || [])
      .filter((action) => action?.actionId && action.enabled !== false)
      .map((action) => ({
        actionId: String(action.actionId || '').trim().toLowerCase(),
        title: String(action.title || ''),
        description: String(action.description || ''),
      }));
    if (!actions.length) return '';

    try {
      const classification = await this.intentEngine.classifyAtendimentoAction({
        text,
        actions,
        context: { companyId, conversationId: conversationId || null },
      });
      if (!classification) return '';
      // Trava de confiança aplicada de novo aqui (defesa em profundidade): mesmo
      // que o motor de intenção não aplique o corte, o caller do Atendimento
      // NUNCA executa uma ação com confiança abaixo do limiar configurado.
      const minConfidence = Number.parseFloat(String(process.env.HBX_ATENDIMENTO_NLU_MIN_CONF || ''));
      const threshold = Number.isFinite(minConfidence) ? minConfidence : 0.75;
      if (classification.confidence < threshold) return '';
      return classification.actionId || '';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`NLU atendimento falhou ao resolver acao (best-effort, caindo no menu): ${message}`);
      return '';
    }
  }

  private getAtendimentoButtonsInteractive(
    body: string,
    buttons: AtendimentoBotButton[],
    footer?: string,
  ) {
    const normalizedButtons = (buttons || [])
      .filter((button) => button?.buttonId && button?.actionId && button?.title)
      .slice(0, 10);
    if (!normalizedButtons.length) return null;
    if (normalizedButtons.length <= 3) {
      return {
        type: 'button',
        body: { text: body },
        footer: { text: String(footer || 'Atendimento') },
        action: {
          buttons: normalizedButtons.map((button) => ({
            type: 'reply',
            reply: { id: this.toAtendimentoButtonId(button.buttonId), title: button.title },
          })),
        },
      };
    }
    return {
      type: 'list',
      body: { text: body },
      footer: { text: String(footer || 'Atendimento') },
      action: {
        button: 'Escolher opcao',
        sections: [
          {
            title: 'Opcoes',
            rows: normalizedButtons.map((button) => ({
              id: this.toAtendimentoButtonId(button.buttonId),
              title: button.title,
              description: '',
            })),
          },
        ],
      },
    };
  }

  private async queueAtendimentoButtonPrompt(input: {
    companyId: number;
    to: string;
    contactId: string;
    conversationId: number;
    body: string;
    step: string;
    buttons: AtendimentoBotButton[];
    variables?: Record<string, unknown>;
  }) {
    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(input.companyId);
    const interactivePayload = tenantContext.providerCapabilities.canUseOfficialButtons
      ? this.getAtendimentoButtonsInteractive(input.body, input.buttons)
      : null;
    const fallbackText = this.buildButtonFallbackText(input.body, input.buttons);
    const messageBody = interactivePayload ? input.body : fallbackText;
    const shouldSuppress = await this.hasRecentDuplicateAtendimentoReply({
      companyId: input.companyId,
      contactId: input.contactId,
      conversationId: input.conversationId,
      body: messageBody,
    });
    if (shouldSuppress) {
      return;
    }
    await this.conversations.queueOutboundForCompany(input.companyId, {
      to: input.to,
      contactId: input.contactId,
      body: messageBody,
      messageType: interactivePayload ? 'interactive' : 'text',
      interactivePayload: interactivePayload || undefined,
      sourceModule: 'atendimento_bot',
      senderType: 'bot',
      variables: {
        ...(input.variables || {}),
        interactiveFallbackText: fallbackText,
      },
      flowState: {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: input.step,
        botActive: true,
        humanAssigned: false,
        flowResult: null,
      },
    });
    await this.updateAtendimentoConversationState(
      input.companyId,
      input.conversationId,
      {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: input.step,
        botActive: true,
        humanAssigned: false,
        flowResult: null,
      },
      input.variables || {},
    );
  }

  private async hasRecentDuplicateAtendimentoReply(input: {
    companyId: number;
    contactId: string;
    conversationId?: number | null;
    body: string;
  }) {
    const normalizedBody = String(input.body || '').trim();
    const normalizedContactId = String(input.contactId || '').trim();
    if (!normalizedBody || !normalizedContactId) return false;
    const recentWindowStart = new Date(Date.now() - 90 * 1000);
    const duplicate = await this.prisma.companyMessage.findFirst({
      where: {
        companyId: input.companyId,
        direction: 'OUTBOUND',
        contactId: normalizedContactId,
        body: normalizedBody,
        sourceModule: { in: ['atendimento_bot', 'atendimento_router', 'atendimento_human'] },
        timestamp: { gte: recentWindowStart },
        ...(input.conversationId ? { conversationId: Number(input.conversationId) } : {}),
      },
      select: { id: true },
      orderBy: { timestamp: 'desc' },
    });
    return Boolean(duplicate?.id);
  }

  private buildAtendimentoTemplateVars(input: {
    companyName: string;
    phone: string;
    metadata?: Record<string, any>;
    recoveryCustomer?: any;
    agendaGroup?: AtendimentoAgendaGroup | null;
    agendaPreview?: string;
  }) {
    const metadata = input.metadata || {};
    const customerName = String(
      metadata.cliente ||
        metadata.customerName ||
        metadata.name ||
        input.recoveryCustomer?.clientName ||
        input.recoveryCustomer?.name ||
        input.phone,
    ).trim();
    const nomeBase = customerName || 'cliente';
    return {
      cliente: nomeBase,
      // primeiro nome do contato (primeira palavra do nome) — sempre derivável.
      primeiro_nome: nomeBase.split(/\s+/)[0] || nomeBase,
      empresa: String(input.companyName || 'HBX Solutions').trim() || 'HBX Solutions',
      funcionario: String(metadata.funcionario || '').trim(),
      // telefone do contato (o número da conversa) — sempre presente.
      telefone: String(input.phone || '').trim(),
      valor_formatado: this.formatCurrencyBRL(Number(input.recoveryCustomer?.openAmount || 0)),
      agenda_nome: String(input.agendaGroup?.title || '').trim(),
      agenda_slots: String(input.agendaPreview || '').trim(),
    };
  }

  private weekdayLabel(dayOfWeek: number) {
    return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][Math.max(0, Math.min(6, dayOfWeek))] || 'Dia';
  }

  private buildAgendaPreview(group: AtendimentoAgendaGroup | null | undefined) {
    const slots = (group?.slots || [])
      .filter((slot) => slot.enabled && (group?.workdays || []).includes(slot.dayOfWeek))
      .sort((left, right) => {
        if (left.dayOfWeek !== right.dayOfWeek) return left.dayOfWeek - right.dayOfWeek;
        return String(left.startTime || '').localeCompare(String(right.startTime || ''));
      })
      .slice(0, 6);
    if (!slots.length) return '';
    return slots
      .map((slot) => `${this.weekdayLabel(Number(slot.dayOfWeek || 0))} ${slot.startTime}-${slot.endTime}`)
      .join(' | ');
  }

  private renderAtendimentoAgendaMessage(
    config: AtendimentoBotConfig,
    group: AtendimentoAgendaGroup | null | undefined,
    vars: Record<string, string>,
  ) {
    if (!group) return '';
    const preview = this.buildAgendaPreview(group);
    if (!preview) {
      return renderTemplate(group.emptyMessage || 'Nenhum horario disponivel no momento.', vars, config);
    }
    return renderTemplate(group.introMessage || config.postActionPrompt, {
      ...vars,
      agenda_nome: group.title,
      agenda_slots: preview,
    }, config).concat(`\n\n${preview}`);
  }

  private appointmentDelegate() {
    return (this.prisma as any).atendimentoAppointment;
  }

  private normalizeAppointmentPhone(raw: string | null | undefined) {
    return String(raw || '').replace(/\D/g, '').slice(-13);
  }

  private getAgendaPrimarySlot(group: AtendimentoAgendaGroup | null | undefined) {
    return (group?.slots || []).find((slot) => slot.enabled) || null;
  }

  private isAgendaConfigured(group: AtendimentoAgendaGroup | null | undefined) {
    if (!group?.isActive) return false;
    if (!String(group.linkedUserName || group.linkedEmail || '').trim()) return false;
    return Boolean(this.getAgendaPrimarySlot(group));
  }

  private getGlaucoAgendaGroup(config: AtendimentoAgendaConfig) {
    const groups = (config.groups || []).filter((group) => group.isActive);
    return (
      groups.find((group) => String(group.id || '').trim().toLowerCase() === 'agenda_glauco') ||
      groups.find((group) => String(group.title || group.buttonLabel || '').toLowerCase().includes('glauco')) ||
      groups[0] ||
      null
    );
  }

  private getDatePartsInTimezone(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    return {
      year: pick('year'),
      month: pick('month'),
      day: pick('day'),
      hour: pick('hour'),
      minute: pick('minute'),
    };
  }

  private toLocalDateKey(date: Date, timezone: string) {
    const parts = this.getDatePartsInTimezone(date, timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  private buildDateInTimezone(dateKey: string, time: string, timezone: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const [hour, minute] = String(time || '00:00').split(':').map(Number);
    const guessedUtc = new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0, 0));
    const rendered = this.getDatePartsInTimezone(guessedUtc, timezone);
    const desiredMs = Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0, 0);
    const renderedMs = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      0,
      0,
    );
    return new Date(guessedUtc.getTime() + (desiredMs - renderedMs));
  }

  private getLocalDayBounds(dateKey: string, timezone: string) {
    const start = this.buildDateInTimezone(dateKey, '00:00', timezone);
    const [year, month, day] = dateKey.split('-').map(Number);
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0, 0));
    const nextKey = this.toLocalDateKey(nextDate, timezone);
    return {
      start,
      end: this.buildDateInTimezone(nextKey, '00:00', timezone),
    };
  }

  private formatAgendaDateLabel(date: Date, timezone: string) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone || 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    }).format(date);
  }

  private async findFutureAtendimentoAppointment(companyId: number, phone: string, agendaGroupId?: string | null) {
    const delegate = this.appointmentDelegate();
    if (!delegate) return null;
    const customerPhone = this.normalizeAppointmentPhone(phone);
    if (!customerPhone) return null;
    return delegate.findFirst({
      where: {
        companyId,
        customerPhone,
        status: 'confirmed',
        startsAt: { gt: new Date() },
        ...(agendaGroupId ? { agendaGroupId } : {}),
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  private async buildSimpleAgendaOptions(input: {
    companyId: number;
    group: AtendimentoAgendaGroup;
    config: AtendimentoAgendaConfig;
    excludeAppointmentId?: number | null;
    fromDate?: Date;
  }): Promise<HbxAgendaOption[]> {
    const delegate = this.appointmentDelegate();
    const timezone = input.config.timezone || 'America/Sao_Paulo';
    const slot = this.getAgendaPrimarySlot(input.group);
    if (!delegate || !slot || !this.isAgendaConfigured(input.group)) return [];
    const workdays = input.group.workdays?.length ? input.group.workdays : [1, 2, 3, 4, 5];
    const holidays = new Set(input.config.holidays || []);
    const capacity = Math.max(1, Number(input.group.capacityPerDay || 1));
    const maxOptions = Math.max(1, Number(input.group.suggestedSlotsCount || 5));
    const searchWindow = Math.max(maxOptions, Number(input.group.searchWindowDays || 14));
    const options: HbxAgendaOption[] = [];
    const now = input.fromDate || new Date();

    for (let offset = 0; offset <= searchWindow + 14 && options.length < maxOptions; offset += 1) {
      const probe = new Date(now);
      probe.setDate(probe.getDate() + offset);
      const dateKey = this.toLocalDateKey(probe, timezone);
      if (holidays.has(dateKey)) continue;
      const dayOfWeek = this.buildDateInTimezone(dateKey, '12:00', timezone).getDay();
      if (!workdays.includes(dayOfWeek)) continue;

      const startsAt = this.buildDateInTimezone(dateKey, slot.startTime, timezone);
      const endsAt = this.buildDateInTimezone(dateKey, slot.endTime, timezone);
      if (startsAt <= now) continue;
      const bounds = this.getLocalDayBounds(dateKey, timezone);
      const used = await delegate.count({
        where: {
          companyId: input.companyId,
          agendaGroupId: input.group.id,
          status: 'confirmed',
          startsAt: { gte: bounds.start, lt: bounds.end },
          ...(input.excludeAppointmentId ? { id: { not: Number(input.excludeAppointmentId) } } : {}),
        },
      });
      if (used >= capacity) continue;
      options.push({
        index: options.length + 1,
        label: `${this.formatAgendaDateLabel(startsAt, timezone)}, ${slot.startTime} às ${slot.endTime}`,
        isoDate: dateKey,
        startTime: slot.startTime,
        endTime: slot.endTime,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    }
    return options;
  }

  private buildReceptionGreeting(config: AtendimentoBotConfig, timezone?: string | null) {
    const greeting = config.smartVariables?.greeting || {};
    const now = new Date();
    const hour = Number(
      new Intl.DateTimeFormat('pt-BR', {
        timeZone: greeting.timezone || timezone || 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false,
      }).format(now),
    );
    if (hour >= Number(greeting.nightStartHour ?? 18)) return greeting.night || 'Boa noite';
    if (hour >= Number(greeting.afternoonStartHour ?? 12)) return greeting.afternoon || 'Boa tarde';
    return greeting.morning || 'Bom dia';
  }

  private async buildHbxGateContext(input: {
    companyId: number;
    from: string;
    company: { name: string; timezone?: string | null };
    conversation: any;
    metadata: Record<string, any>;
    recoveryCustomer?: any | null;
    tenantContext: { providerCapabilities: ProviderCapabilities; recoveryEnabled: boolean };
    agendaConfig: AtendimentoAgendaConfig;
    config: AtendimentoBotConfig;
    inboundProfileName?: string | null;
  }) {
    const group = this.getGlaucoAgendaGroup(input.agendaConfig);
    const futureAppointment = await this.findFutureAtendimentoAppointment(input.companyId, input.from, group?.id || null);
    const agendaOptions = group
      ? await this.buildSimpleAgendaOptions({ companyId: input.companyId, group, config: input.agendaConfig })
      : [];
    const hasRecoveryContext =
      input.tenantContext.recoveryEnabled && Number(input.recoveryCustomer?.openAmount || 0) > 0;
    const agendaEnabled = Boolean(group && this.isAgendaConfigured(group));
    const hasFutureAppointment = Boolean(futureAppointment?.id && new Date(futureAppointment.startsAt).getTime() > Date.now());
    const hbxGateContext = {
      isKnownCustomer: Boolean(
        String(input.metadata?.cliente || input.metadata?.customerName || input.inboundProfileName || '').trim() ||
          input.recoveryCustomer?.id,
      ),
      isPersonalContact: this.isPersonalWhatsappContact(input.metadata),
      hasFutureAppointment,
      futureAppointment: futureAppointment
        ? {
            id: futureAppointment.id,
            agendaGroupId: futureAppointment.agendaGroupId,
            startsAt: futureAppointment.startsAt,
            endsAt: futureAppointment.endsAt,
            responsibleName: futureAppointment.responsibleName,
          }
        : null,
      hasRecoveryContext,
      recoveryEnabled: input.tenantContext.recoveryEnabled,
      agendaEnabled,
      hasAvailableAgendaSlots: agendaOptions.length > 0,
      isSupplier: input.metadata?.supplierContact === true,
      isTeamOrOwnerContact: input.metadata?.talkToOwner === true,
      canShowAgenda: Boolean(agendaEnabled && agendaOptions.length > 0 && !hasFutureAppointment),
      canShowReschedule: Boolean(hasFutureAppointment && group?.isActive),
      canShowCancelAppointment: hasFutureAppointment,
      canShowRecovery: Boolean(hasRecoveryContext),
      canShowSupport: true,
      canShowTalkToOwner: true,
      canShowSupplier: true,
      canShowPersonal: false,
      provider: input.tenantContext.providerCapabilities.provider,
      agendaGroupId: group?.id || null,
      step: HBX_GATE_STEP,
    };
    return { hbxGateContext, group, agendaOptions, futureAppointment };
  }

  private buildDynamicReceptionMenu(context: Record<string, any>): HbxDynamicMenuOption[] {
    const options: Array<Omit<HbxDynamicMenuOption, 'index' | 'buttonId'>> = [];
    if (context.canShowAgenda) {
      options.push({ label: 'Agendar com Glauco', actionKey: 'schedule_service', routeTarget: 'atendimento', actionId: 'schedule_service' });
    }
    if (context.canShowReschedule) {
      options.push({ label: 'Reagendar atendimento', actionKey: 'reschedule_service', routeTarget: 'atendimento', actionId: 'reschedule_service' });
    }
    if (context.canShowCancelAppointment) {
      options.push({ label: 'Cancelar agendamento', actionKey: 'cancel_appointment', routeTarget: 'atendimento', actionId: 'cancel_appointment' });
    }
    if (context.canShowSupport) {
      options.push({ label: 'Suporte tecnico', actionKey: 'technical_support', routeTarget: 'atendimento', actionId: 'technical_support' });
    }
    if (context.canShowRecovery) {
      options.push({ label: 'Financeiro', actionKey: 'enter_recovery', routeTarget: 'recovery', actionId: 'enter_recovery' });
    }
    if (context.canShowTalkToOwner) {
      options.push({ label: 'Falar direto com Glauco', actionKey: 'talk_owner', routeTarget: 'conversas', actionId: 'talk_owner' });
    }
    if (context.canShowSupplier) {
      options.push({ label: 'Fornecedor / parceria', actionKey: 'supplier_contact', routeTarget: 'conversas', actionId: 'supplier_contact' });
    }
    return options.map((option, index) => ({
      ...option,
      index: index + 1,
      buttonId: `hbx_dynamic_${index + 1}`,
    }));
  }

  private resolveDynamicMenuActionKey(metadata: Record<string, any>, rawActionId: string, normalizedText: string, rawPayload: any) {
    const options = Array.isArray(metadata?.hbxDynamicMenuOptions)
      ? (metadata.hbxDynamicMenuOptions as HbxDynamicMenuOption[])
      : [];
    if (!options.length) return '';
    const raw = this.fromAtendimentoButtonId(rawActionId || this.extractInteractiveReplyId(rawPayload));
    const textLabel = this.normalizeActionLabel(normalizedText || extractInboundTextFromPayload(rawPayload));
    const numeric = Number(String(normalizedText || '').trim());
    const matched = options.find((option) => {
      return (
        (raw && (raw === option.buttonId || raw === option.actionKey || raw === option.actionId)) ||
        (Number.isInteger(numeric) && numeric === option.index) ||
        (textLabel && textLabel === this.normalizeActionLabel(option.label))
      );
    });
    return String(matched?.actionKey || matched?.actionId || '').trim().toLowerCase();
  }

  private containsNegativeOptOut(text: string) {
    const normalized = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return /\b(nao quero|pare|parar|remover|me remove|nao tenho interesse|spam|nao chama mais|nao me chame|sair|stop)\b/.test(normalized);
  }

  private async markConversationDoNotContactFromBot(input: {
    companyId: number;
    conversationId: number;
    phone: string;
    reason: string;
    metadata?: Record<string, any> | null;
    inboundMessageId?: number | null;
    detectedText?: string | null;
    sourceModule?: string | null;
  }) {
    const now = new Date();
    const metadata = input.metadata || {};
    await this.customerProfileService.upsertAtendimentoProfileState({
      companyId: input.companyId,
      phone: input.phone,
      botOff: true,
      botOffReason: input.reason,
      botOffAt: now,
    } as any);
    await this.updateAtendimentoConversationState(
      input.companyId,
      input.conversationId,
      {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.HUMAN,
        botActive: false,
        humanAssigned: true,
        flowResult: 'negative_optout',
      },
      {
        ...metadata,
        hbxGateType: 'negative_optout',
        optOut: true,
        doNotContact: true,
        negativeOptOutAt: now.toISOString(),
        botOff: true,
        botOffReason: input.reason,
        botOffAt: now.toISOString(),
      },
    );
    const phoneDigits = this.customerProfileService.normalizePhone(input.phone);
    const phoneCandidates = phoneDigits
      ? Array.from(new Set(
          buildWhatsAppPhoneCandidates(phoneDigits)
            .map((value) => this.customerProfileService.normalizePhone(value))
            .filter(Boolean),
        ))
      : [];
    const lead = phoneCandidates.length
      ? await this.prisma.vendasLead.findFirst({
          where: { companyId: input.companyId, phoneNormalized: { in: phoneCandidates } },
          orderBy: [{ updatedAt: 'desc' }],
          select: { id: true },
        })
      : null;
    if (lead?.id) {
      await this.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          eventType: 'lead_closed',
          title: 'Não ligar mais',
          description: this.buildLeadClosureTimelineDescription({
            conversationId: input.conversationId,
            inboundMessageId: input.inboundMessageId || null,
            detectedText: input.detectedText || input.reason,
            sourceModule: input.sourceModule || 'atendimento_bot',
            closureReason: 'do_not_call',
            createdAt: now,
          }),
          sourceType: input.sourceModule || 'atendimento_bot',
          statusTo: 'encerrado',
          resultLabel: 'Não ligar mais',
        },
      });
    }
  }

  private async markAtendimentoNegativeOptOut(input: {
    companyId: number;
    conversationId: number;
    from: string;
    metadata: Record<string, any>;
    inboundMessageId?: number | null;
    detectedText?: string | null;
  }) {
    await this.markConversationDoNotContactFromBot({
      companyId: input.companyId,
      conversationId: input.conversationId,
      phone: input.from,
      reason: 'Não ligar mais',
      metadata: input.metadata,
      inboundMessageId: input.inboundMessageId || null,
      detectedText: input.detectedText || null,
      sourceModule: 'atendimento_bot',
    });
    await this.appendAtendimentoSystemEvent({
      companyId: input.companyId,
      conversationId: input.conversationId,
      contactId: input.from,
      text: 'Contato marcou opt-out/negativo. Automacoes comerciais futuras devem ser impedidas.',
      eventType: 'atendimento_negative_optout',
    });
  }

  private async queueDynamicReceptionMenu(input: {
    companyId: number;
    conversationId: number;
    from: string;
    company: { name: string; timezone?: string | null };
    config: AtendimentoBotConfig;
    metadata: Record<string, any>;
    hbxGateContext: Record<string, any>;
  }) {
    const options = this.buildDynamicReceptionMenu(input.hbxGateContext);
    if (!options.length) {
      await this.routeAtendimentoToHumanQueue({
        companyId: input.companyId,
        conversationId: input.conversationId,
        from: input.from,
        config: input.config,
        metadata: {
          ...input.metadata,
          hbxGateContext: input.hbxGateContext,
          hbxGateLastCheckedAt: new Date().toISOString(),
        },
        reason: 'sem_opcao_dinamica_executavel',
      });
      return;
    }
    const vars = this.buildAtendimentoTemplateVars({
      companyName: input.company.name,
      phone: input.from,
      metadata: {
        ...input.metadata,
        cumprimentacao: this.buildReceptionGreeting(input.config, input.company.timezone),
      },
      recoveryCustomer: null,
    });
    const body = renderTemplate(
      input.config.mainMenuPrompt || '{{cumprimentacao}}! Sou o assistente da {{empresa}}.\nComo posso te ajudar?',
      {
        ...vars,
        cumprimentacao: this.buildReceptionGreeting(input.config, input.company.timezone),
      },
      input.config,
    );
    await this.queueAtendimentoButtonPrompt({
      companyId: input.companyId,
      to: input.from,
      contactId: input.from,
      conversationId: input.conversationId,
      body,
      step: HBX_DYNAMIC_MENU_STEP,
      buttons: options.map((option) => ({
        buttonId: option.buttonId,
        actionId: option.actionKey,
        title: option.label,
      })),
      variables: {
        ...input.metadata,
        hbxGateContext: input.hbxGateContext,
        hbxGateLastCheckedAt: new Date().toISOString(),
        hbxDynamicMenu: true,
        hbxDynamicMenuCreatedAt: new Date().toISOString(),
        hbxDynamicMenuOptions: options,
      },
    });
  }

  private parsePendingAgendaChoice(metadata: Record<string, any>, normalizedText: string) {
    const pending = metadata?.hbxAgendaPending && typeof metadata.hbxAgendaPending === 'object'
      ? metadata.hbxAgendaPending
      : null;
    if (!pending || !Array.isArray(pending.options)) return null;
    const numeric = Number(String(normalizedText || '').trim());
    if (!Number.isInteger(numeric)) return null;
    const option = pending.options.find((item: HbxAgendaOption) => Number(item.index) === numeric);
    return option ? { pending, option } : null;
  }

  private async queueSimpleAgendaOptions(input: {
    companyId: number;
    conversationId: number;
    from: string;
    config: AtendimentoBotConfig;
    agendaConfig: AtendimentoAgendaConfig;
    group: AtendimentoAgendaGroup;
    metadata: Record<string, any>;
    intent: 'schedule' | 'reschedule';
    appointmentId?: number | null;
  }) {
    const options = await this.buildSimpleAgendaOptions({
      companyId: input.companyId,
      group: input.group,
      config: input.agendaConfig,
      excludeAppointmentId: input.appointmentId,
    });
    if (!options.length) {
      await this.conversations.queueOutboundForCompany(input.companyId, {
        to: input.from,
        contactId: input.from,
        body: input.group.emptyMessage || 'Nao encontrei horario livre nos proximos dias. Vou deixar essa conversa para o Glauco ajustar manualmente.',
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.HUMAN,
          botActive: false,
          humanAssigned: true,
          flowResult: null,
          metadata: {
            ...input.metadata,
            hbxGateType: input.intent === 'reschedule' ? 'reschedule' : 'agenda',
            agendaIntent: true,
          },
        },
      });
      return;
    }
    const lines = options.map((option) => `${option.index}. ${option.label}`).join('\n');
    const prefix = input.intent === 'reschedule'
      ? 'Tenho estas novas opções para reagendar com o Glauco:'
      : 'Tenho estas opções para falar com o Glauco:';
    await this.conversations.queueOutboundForCompany(input.companyId, {
      to: input.from,
      contactId: input.from,
      body: `${prefix}\n\n${lines}\n\nResponda com o número da melhor opção.`,
      messageType: 'text',
      sourceModule: 'atendimento_bot',
      senderType: 'bot',
      variables: { options },
      flowState: {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: HBX_AGENDA_STEP,
        botActive: true,
        humanAssigned: false,
        flowResult: null,
        metadata: {
          ...input.metadata,
          hbxGateType: input.intent === 'reschedule' ? 'reschedule' : 'agenda',
          agendaIntent: true,
          hbxAgendaPending: {
            intent: input.intent,
            agendaGroupId: input.group.id,
            appointmentId: input.appointmentId || null,
            options,
            createdAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  private async confirmSimpleAgendaChoice(input: {
    companyId: number;
    conversationId: number;
    from: string;
    company: { name: string };
    metadata: Record<string, any>;
    agendaConfig: AtendimentoAgendaConfig;
    group: AtendimentoAgendaGroup;
    option: HbxAgendaOption;
    intent: 'schedule' | 'reschedule';
    appointmentId?: number | null;
  }) {
    const refreshedOptions = await this.buildSimpleAgendaOptions({
      companyId: input.companyId,
      group: input.group,
      config: input.agendaConfig,
      excludeAppointmentId: input.appointmentId,
    });
    const stillAvailable = refreshedOptions.find((option) => option.isoDate === input.option.isoDate);
    if (!stillAvailable) {
      await this.conversations.queueOutboundForCompany(input.companyId, {
        to: input.from,
        contactId: input.from,
        body: 'Esse horario acabou de ficar indisponivel. Vou te mostrar novas opcoes livres.',
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        flowState: { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: HBX_AGENDA_STEP, botActive: true, humanAssigned: false },
      });
      await this.queueSimpleAgendaOptions({
        companyId: input.companyId,
        conversationId: input.conversationId,
        from: input.from,
        config: DEFAULT_ATENDIMENTO_BOT_CONFIG,
        agendaConfig: input.agendaConfig,
        group: input.group,
        metadata: input.metadata,
        intent: input.intent,
        appointmentId: input.appointmentId,
      });
      return;
    }

    const delegate = this.appointmentDelegate();
    const customerName = String(input.metadata?.cliente || input.metadata?.customerName || input.from).trim();
    const data = {
      companyId: input.companyId,
      conversationId: input.conversationId,
      customerName,
      customerPhone: this.normalizeAppointmentPhone(input.from),
      agendaGroupId: input.group.id,
      responsibleName: input.group.linkedUserName || input.group.title || 'Glauco',
      responsibleEmail: input.group.linkedEmail || null,
      startsAt: new Date(stillAvailable.startsAt),
      endsAt: new Date(stillAvailable.endsAt),
      timezone: input.agendaConfig.timezone || 'America/Sao_Paulo',
      status: 'confirmed',
      source: 'whatsapp_atendimento',
      calendarSyncStatus: 'not_configured',
      metadata: JSON.stringify({
        hbx: true,
        reminderMinutes: Number(input.group.reminderMinutes || 60),
        googleCalendarConfigured: false,
      }),
    };
    const appointment = input.intent === 'reschedule' && input.appointmentId
      ? await delegate.update({
          where: { id: Number(input.appointmentId) },
          data: {
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            responsibleName: data.responsibleName,
            responsibleEmail: data.responsibleEmail,
            calendarSyncStatus: 'not_configured',
            metadata: data.metadata,
          },
        })
      : await delegate.create({ data });
    const finalMessage = input.intent === 'reschedule'
      ? `Pronto, reagendei seu atendimento com o Glauco para ${this.formatAgendaDateLabel(data.startsAt, data.timezone)} das ${stillAvailable.startTime} às ${stillAvailable.endTime}.`
      : `Perfeito, seu horário com o Glauco ficou reservado para ${this.formatAgendaDateLabel(data.startsAt, data.timezone)} das ${stillAvailable.startTime} às ${stillAvailable.endTime}. Vou deixar tudo registrado por aqui.`;
    const nextMetadata = {
      ...input.metadata,
      hbxGateType: input.intent === 'reschedule' ? 'reschedule' : 'agenda',
      agendaIntent: true,
      hbxLastAppointmentId: appointment.id,
      hbxLastAppointmentStatus: 'confirmed',
      hbxAgendaPending: null,
      hbxAppointmentHistory: [
        ...((Array.isArray(input.metadata?.hbxAppointmentHistory) ? input.metadata.hbxAppointmentHistory : []) as unknown[]).slice(-10),
        {
          action: input.intent === 'reschedule' ? 'rescheduled' : 'confirmed',
          appointmentId: appointment.id,
          at: new Date().toISOString(),
          startsAt: data.startsAt.toISOString(),
          endsAt: data.endsAt.toISOString(),
        },
      ],
    };
    await this.conversations.queueOutboundForCompany(input.companyId, {
      to: input.from,
      contactId: input.from,
      body: finalMessage,
      messageType: 'text',
      sourceModule: 'atendimento_bot',
      senderType: 'bot',
      flowState: {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.HUMAN,
        botActive: false,
        humanAssigned: true,
        flowResult: null,
        metadata: nextMetadata,
      },
    });
    await this.appendAtendimentoSystemEvent({
      companyId: input.companyId,
      conversationId: input.conversationId,
      contactId: input.from,
      text: input.intent === 'reschedule'
        ? `Agendamento reagendado para ${data.startsAt.toISOString()}.`
        : `Agendamento confirmado para ${data.startsAt.toISOString()}.`,
      eventType: input.intent === 'reschedule' ? 'appointment_rescheduled' : 'appointment_confirmed',
      variables: { appointmentId: appointment.id, calendarSyncStatus: 'not_configured' },
    });
  }

  private async cancelFutureAppointment(input: {
    companyId: number;
    conversationId: number;
    from: string;
    metadata: Record<string, any>;
    appointment: any;
  }) {
    await this.appointmentDelegate().update({
      where: { id: Number(input.appointment.id) },
      data: {
        status: 'canceled',
        calendarSyncStatus: input.appointment.googleCalendarEventId ? 'pending' : 'not_configured',
      },
    });
    await this.conversations.queueOutboundForCompany(input.companyId, {
      to: input.from,
      contactId: input.from,
      body: 'Pronto, cancelei seu agendamento com o Glauco. Se quiser marcar outro dia, é só me chamar.',
      messageType: 'text',
      sourceModule: 'atendimento_bot',
      senderType: 'bot',
      flowState: {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.HUMAN,
        botActive: false,
        humanAssigned: true,
        flowResult: null,
        metadata: {
          ...input.metadata,
          hbxGateType: 'cancel_appointment',
          hbxCancelAppointmentId: null,
          hbxLastAppointmentId: input.appointment.id,
          hbxLastAppointmentStatus: 'canceled',
          hbxAppointmentHistory: [
            ...((Array.isArray(input.metadata?.hbxAppointmentHistory) ? input.metadata.hbxAppointmentHistory : []) as unknown[]).slice(-10),
            { action: 'canceled', appointmentId: input.appointment.id, at: new Date().toISOString() },
          ],
        },
      },
    });
    await this.appendAtendimentoSystemEvent({
      companyId: input.companyId,
      conversationId: input.conversationId,
      contactId: input.from,
      text: `Agendamento ${input.appointment.id} cancelado pelo cliente.`,
      eventType: 'appointment_canceled',
      variables: { appointmentId: input.appointment.id },
    });
  }

  private async routeAtendimentoToHumanQueue(input: {
    companyId: number;
    conversationId: number;
    from: string;
    config: AtendimentoBotConfig;
    metadata?: Record<string, any>;
    reason: string;
  }) {
    const mergedMetadata = this.clearAtendimentoBlockedMetadata(input.metadata || {});
    await this.conversations.queueOutboundForCompany(input.companyId, {
      to: input.from,
      contactId: input.from,
      body: input.config.humanAckMessage,
      messageType: 'text',
      sourceModule: 'atendimento_human',
      senderType: 'system',
      flowState: {
        currentFlow: ATENDIMENTO_FLOW_ID,
        currentStep: ATENDIMENTO_STEP.HUMAN,
        botActive: false,
        humanAssigned: true,
        flowResult: null,
        metadata: mergedMetadata,
      },
    });
    await this.appendAtendimentoSystemEvent({
      companyId: input.companyId,
      conversationId: input.conversationId,
      contactId: input.from,
      text: `Conversa encaminhada para atendimento humano (${input.reason}).`,
      eventType: 'atendimento_human_handoff',
      sourceModule: 'atendimento_human',
      variables: { reason: input.reason },
    });
  }

  private async startRecoveryFromAtendimento(input: {
    companyId: number;
    conversationId: number;
    from: string;
    customer: any;
    metadata?: Record<string, any>;
  }) {
    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(input.companyId);
    if (!tenantContext.recoveryEnabled) {
      const atendimentoConfig = await this.getAtendimentoBotConfig(input.companyId, tenantContext);
      await this.routeAtendimentoToHumanQueue({
        companyId: input.companyId,
        conversationId: input.conversationId,
        from: input.from,
        config: atendimentoConfig,
        metadata: input.metadata,
        reason: 'recovery_sem_plano',
      });
      return;
    }
    await this.queueRecoveryInteractiveMenu(
      input.companyId,
      input.from,
      String(input.customer.id),
      input.customer,
    );
    await this.updateRecoveryConversationState(
      input.companyId,
      input.conversationId,
      {
        currentFlow: RECOVERY_FLOW_ID,
        currentStep: RECOVERY_STEP.MAIN_MENU,
        botActive: true,
        humanAssigned: false,
        flowResult: null,
      },
      {
        ...this.clearAtendimentoBlockedMetadata(input.metadata || {}),
        atendimentoRecoveryIntroPending: false,
        recoveryCustomerId: String(input.customer.id),
      },
    );
    await this.appendRecoverySystemEvent({
      companyId: input.companyId,
      conversationId: input.conversationId,
      contactId: String(input.customer.id),
      text: 'Cliente direcionado do Atendimento para o menu do HBX Recovery.',
      eventType: 'recovery_started_from_atendimento',
      sourceModule: 'atendimento_router',
    });
  }

  private getRecoveryBlockedState(metadata: Record<string, any>) {
    const blockedAt = String(metadata?.recoveryBlockedAt || '').trim() || null;
    const blockedReason = String(metadata?.recoveryBlockedReason || '').trim() || null;
    return {
      isBlocked: Boolean(blockedAt),
      blockedAt,
      blockedReason,
    };
  }

  private async updateRecoveryConversationState(
    companyId: number,
    conversationId: number,
    patch: ConversationStatePatch,
    metadataPatch?: Record<string, unknown> | null,
  ) {
    const current = await this.prisma.companyConversation.findFirst({
      where: { id: Number(conversationId), companyId, channel: 'whatsapp' },
      select: { id: true, metadata: true },
    });
    if (!current?.id) return null;
    const mergedMetadata =
      metadataPatch === undefined
        ? undefined
        : metadataPatch === null
          ? null
          : { ...this.parseConversationMetadata(current.metadata), ...metadataPatch };
    return this.conversations.updateConversationState(companyId, conversationId, {
      ...patch,
      currentFlow: patch.currentFlow || RECOVERY_FLOW_ID,
      lastInteractionAt: patch.lastInteractionAt || new Date(),
      metadata: mergedMetadata,
    });
  }

  private async appendRecoverySystemEvent(input: {
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
        sourceModule: input.sourceModule || 'hbx_recovery_system',
        variablesJson: JSON.stringify({
          ...(input.variables || {}),
          eventType: input.eventType,
        }),
        provider: 'INTERNAL',
      },
    });
    await this.prisma.companyConversation.update({
      where: { id: input.conversationId },
      data: { lastInteractionAt: now },
    });
  }

  private getRecoveryButtonsInteractive(
    body: string,
    buttons: RecoveryBotButton[],
    footer?: string,
  ) {
    const normalizedButtons = (buttons || [])
      .filter((button) => button?.buttonId && button?.actionId && button?.title)
      .slice(0, 10);
    if (!normalizedButtons.length) return null;
    if (normalizedButtons.length <= 3) {
      return {
        type: 'button',
        body: { text: body },
        footer: { text: String(footer || 'HBX Recovery') },
        action: {
          buttons: normalizedButtons.map((button) => ({
            type: 'reply',
            reply: { id: this.toRecoveryButtonId(button.buttonId), title: button.title },
          })),
        },
      };
    }
    return {
      type: 'list',
      body: { text: body },
      footer: { text: String(footer || 'HBX Recovery') },
      action: {
        button: 'Escolher opcao',
        sections: [
          {
            title: 'Opcoes',
            rows: normalizedButtons.map((button) => ({
              id: this.toRecoveryButtonId(button.buttonId),
              title: button.title,
              description: '',
            })),
          },
        ],
      },
    };
  }

  private async queueRecoveryButtonPrompt(input: {
    companyId: number;
    to: string;
    contactId: string;
    conversationId: number;
    body: string;
    step: string;
    buttons: RecoveryBotButton[];
    variables?: Record<string, unknown>;
  }) {
    const interactivePayload = this.getRecoveryButtonsInteractive(input.body, input.buttons);
    const fallbackText = this.buildButtonFallbackText(input.body, input.buttons);
    await this.conversations.queueOutboundForCompany(input.companyId, {
      to: input.to,
      contactId: input.contactId,
      body: interactivePayload ? input.body : fallbackText,
      messageType: interactivePayload ? 'interactive' : 'text',
      interactivePayload: interactivePayload || undefined,
      sourceModule: 'hbx_recovery_bot',
      senderType: 'bot',
      variables: {
        ...(input.variables || {}),
        interactiveFallbackText: fallbackText,
      },
      flowState: {
        currentFlow: RECOVERY_FLOW_ID,
        currentStep: input.step,
        botActive: true,
      },
    });
    await this.updateRecoveryConversationState(
      input.companyId,
      input.conversationId,
      {
        currentFlow: RECOVERY_FLOW_ID,
        currentStep: input.step,
        botActive: true,
      },
      input.variables || {},
    );
  }

  private parseInstallmentCount(actionId: string, normalizedText: string): number {
    const directMap: Record<string, number> = {
      installment_2: 2,
      installment_3: 3,
      installment_4: 4,
      installment_5: 5,
    };
    if (directMap[actionId]) return directMap[actionId];
    const match = normalizedText.match(/^([2-5])\s*x$/i);
    if (match) return Number(match[1]);
    return 0;
  }

  private calculateInstallment(customerOpenAmount: number, installmentCount: number) {
    const base = Math.max(0, Number(customerOpenAmount || 0));
    const count = Math.max(1, Math.min(12, Math.round(Number(installmentCount || 1))));
    const interestPct = Math.max(0, Number(process.env.HBX_RECOVERY_INSTALLMENT_INTEREST_PCT || 0));
    const factor = 1 + interestPct / 100;
    const total = Number((base * factor).toFixed(2));
    const installmentValue = Number((total / count).toFixed(2));
    return { installmentCount: count, totalAmount: total, installmentValue, interestPct };
  }

  private async findRecoveryCustomerByPhone(companyId: number, phoneRaw: string) {
    const digits = this.normalizeDigits(phoneRaw);
    if (!digits) return null;
    return this.prisma.hbxRecoveryCustomer.findFirst({
      where: {
        companyId,
        openAmount: { gt: 0 },
        whatsappNumber: { endsWith: digits },
      },
    });
  }

  private async resolveCompanyForIncomingNumber(
    phoneNumberIdRaw?: string | null,
    displayPhoneRaw?: string | null,
  ) {
    const phoneNumberId = String(phoneNumberIdRaw || '').trim();
    const displayPhone = normalizeWhatsAppPhone(displayPhoneRaw);
    const displayDigits = this.normalizeDigits(displayPhoneRaw || displayPhone);
    const supportsEndpointTable = await this.supportsWhatsAppEndpointTable();
    const endpointDelegate = supportsEndpointTable ? (this.prisma as any).companyWhatsAppEndpoint : null;
    const companyInclude = supportsEndpointTable
      ? {
          whatsappEndpoints: {
            orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
          },
        }
      : null;
    const displayWhere: any[] = [];
    if (displayPhone) {
      displayWhere.push({ whatsappDisplayNumber: displayPhone }, { whatsappNumber: displayPhone });
    }
    if (displayDigits) {
      displayWhere.push(
        { whatsappDisplayNumber: { endsWith: displayDigits } },
        { whatsappNumber: { endsWith: displayDigits } },
      );
    }

    let endpoint = null as any;
    if (phoneNumberId && endpointDelegate?.findFirst) {
      endpoint = await endpointDelegate.findFirst({
        where: { whatsappPhoneNumberId: phoneNumberId },
        include: { company: companyInclude ? { include: companyInclude } : true },
      });
    }
    if (!endpoint && displayWhere.length > 0 && endpointDelegate?.findFirst) {
      endpoint = await endpointDelegate.findFirst({
        where: { OR: displayWhere },
        include: { company: companyInclude ? { include: companyInclude } : true },
      });
    }
    if (endpoint?.company) {
      return { company: endpoint.company, endpoint };
    }

    let company = null as any;
    if (phoneNumberId) {
      company = companyInclude
        ? await this.prisma.company.findFirst({
            where: { whatsappPhoneNumberId: phoneNumberId },
            include: companyInclude,
          })
        : await this.prisma.company.findFirst({
            where: { whatsappPhoneNumberId: phoneNumberId },
          });
    }
    if (!company && displayWhere.length > 0) {
      company = companyInclude
        ? await this.prisma.company.findFirst({
            where: { OR: displayWhere },
            include: companyInclude,
          })
        : await this.prisma.company.findFirst({
            where: { OR: displayWhere },
          });
    }

    return { company, endpoint: null };
  }

  private async resolveCompanyForWebwhatsEvent(payload: any, query?: Record<string, any>) {
    const companyId = this.findWebwhatsCompanyId(payload, query);
    if (companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (company) return { company, source: 'company_id' };
    }

    const displayPhone = String(
      payload?.displayPhone ||
        payload?.display_phone_number ||
        payload?.owner ||
        payload?.ownerJid ||
        payload?.wuid ||
        payload?.data?.displayPhone ||
        payload?.data?.display_phone_number ||
        payload?.data?.owner ||
        payload?.data?.ownerJid ||
        payload?.data?.wuid ||
        '',
    ).trim();
    if (displayPhone) {
      const resolved = await this.resolveCompanyForIncomingNumber(null, displayPhone);
      if (resolved.company) return { company: resolved.company, source: 'display_phone', endpoint: resolved.endpoint };
    }

    return { company: null, source: 'unresolved', endpoint: null };
  }

  private buildWebwhatsProviderMessageIdCandidates(companyId: number, providerMessageId: string, tenantKey?: string | null) {
    const normalized = String(providerMessageId || '').trim();
    if (!normalized) return [];
    const candidates = new Set<string>();
    candidates.add(normalized);
    if (!normalized.toLowerCase().startsWith('webwhats:')) {
      // Always add the canonical company-scoped id (legacy sessions / company-{id} tenantKey).
      candidates.add(`webwhats:company-${companyId}:${normalized}`);
      // Also add the per-user tenantKey variant (company-{id}-user-{userId}) when available,
      // since OUTBOUNDs are stored with the exact tenantKey that was active at send time.
      const normalizedTenantKey = String(tenantKey || '').trim();
      if (normalizedTenantKey && normalizedTenantKey !== `company-${companyId}`) {
        candidates.add(`webwhats:${normalizedTenantKey}:${normalized}`);
      }
    }
    return Array.from(candidates);
  }

  private normalizeProviderDeliveryStatus(statusRaw: string) {
    const status = String(statusRaw || '').trim().toLowerCase();
    if (['read', 'played'].includes(status)) return 'read';
    if (['delivery_ack', 'delivered', 'server_ack'].includes(status)) return 'delivered';
    if (['sent', 'pending', 'sending'].includes(status)) return 'sent';
    if (['failed', 'error'].includes(status)) return 'failed';
    return status || 'received';
  }

  private async applyProviderDeliveryStatus(input: {
    companyId: number;
    providerMessageId: string;
    status: string;
    timestamp: Date;
    rawPayload: any;
    scope: string;
    tenantKey?: string | null;
  }) {
    const status = this.normalizeProviderDeliveryStatus(input.status);
    const providerIds = this.buildWebwhatsProviderMessageIdCandidates(input.companyId, input.providerMessageId, input.tenantKey);
    if (!providerIds.length) {
      return { updatedMessages: 0, updatedOutbound: 0, status, conversationIds: [] as number[] };
    }

    const outboundUpdate: any = {
      deliveryStatus: status,
      lastWebhookAt: new Date(),
      lastWebhookPayload: this.stringifySafeWebhookPayload(input.rawPayload),
    };
    if (status === 'delivered') {
      outboundUpdate.deliveredAt = input.timestamp;
      outboundUpdate.status = 'DELIVERED';
    }
    if (status === 'read') {
      outboundUpdate.readAt = input.timestamp;
      outboundUpdate.status = 'READ';
    }
    if (status === 'failed') {
      outboundUpdate.failedAt = input.timestamp;
      outboundUpdate.status = 'FAILED';
      outboundUpdate.lastError = String(
        input.rawPayload?.error
          || input.rawPayload?.reason
          || input.rawPayload?.errors?.[0]?.title
          || 'Falha no envio via WhatsApp',
      ).trim();
    }
    if (status === 'sent') {
      outboundUpdate.status = 'SENT';
      outboundUpdate.sentAt = input.timestamp;
    }

    const messageUpdate: any = {};
    if (status === 'delivered') messageUpdate.status = 'DELIVERED';
    if (status === 'read') messageUpdate.status = 'READ';
    if (status === 'failed') {
      messageUpdate.status = 'FAILED';
      messageUpdate.error = outboundUpdate.lastError;
    }
    if (status === 'sent') messageUpdate.status = 'SENT';
    if (status === 'sent' || status === 'delivered' || status === 'read') messageUpdate.error = null;

    if (status === 'sent' || status === 'delivered' || status === 'read') {
      outboundUpdate.failedAt = null;
      outboundUpdate.lastError = null;
    }

    const protectedStatuses = status === 'sent'
      ? ['DELIVERED', 'READ', 'FAILED']
      : status === 'delivered'
        ? ['READ', 'FAILED']
        : status === 'failed'
          ? ['DELIVERED', 'READ']
          : [];
    const providerWhere: any = {
      companyId: input.companyId,
      providerMessageId: { in: providerIds },
      ...(protectedStatuses.length > 0 ? { status: { notIn: protectedStatuses } } : {}),
    };

    const touchedMessages = Object.keys(messageUpdate).length
      ? await this.prisma.companyMessage.findMany({
          where: providerWhere,
          select: { conversationId: true },
        })
      : [];
    const conversationIds = Array.from(
      new Set(
        touchedMessages
          .map((message) => Number(message.conversationId))
          .filter((conversationId) => Number.isFinite(conversationId) && conversationId > 0),
      ),
    );

    const [outboundResult, messageResult] = await Promise.all([
      this.prisma.outboundMessage.updateMany({
        where: providerWhere,
        data: outboundUpdate,
      }),
      Object.keys(messageUpdate).length
        ? this.prisma.companyMessage.updateMany({
            where: providerWhere,
            data: messageUpdate,
          })
        : Promise.resolve({ count: 0 }),
    ]);

    await this.logWhatsAppEvent({
      companyId: input.companyId,
      scope: input.scope,
      event: 'status_received',
      message: `Status ${status} recebido do provedor WhatsApp`,
      messageType: 'status',
      result: status,
      extra: {
        providerMessageId: input.providerMessageId,
        providerIds,
        outboundRows: outboundResult.count,
        companyMessageRows: messageResult.count,
      },
    });

    for (const conversationId of conversationIds) {
      await this.conversations.dispatchVendasCockpitProjection?.({
        companyId: input.companyId,
        conversationId,
        event: status === 'failed' ? 'failed' : status === 'sent' ? 'sent' : 'delivery',
      });
    }

    return {
      updatedOutbound: outboundResult.count,
      updatedMessages: messageResult.count,
      status,
      conversationIds,
    };
  }

  private async queueRecoveryInteractiveMenu(companyId: number, to: string, contactId: string, customer?: any) {
    const config = await this.getRecoveryBotConfig(companyId);
    const targetCustomer =
      customer ||
      (await this.prisma.hbxRecoveryCustomer.findFirst({
        where: { id: String(contactId), companyId },
      }));
    const vars = await this.buildRecoveryTemplateVars(companyId, targetCustomer || {});
    return this.conversations.queueOutboundForCompany(companyId, {
      to,
      contactId,
      body: 'Menu HBX Recovery',
      messageType: 'interactive',
      interactivePayload: this.getRecoveryRootInteractive(
        config,
        renderTemplate(config.rootPrompt, vars),
      ),
      sourceModule: 'hbx_recovery_bot',
      senderType: 'bot',
      flowState: { currentFlow: RECOVERY_FLOW_ID, currentStep: RECOVERY_STEP.MAIN_MENU, botActive: true },
    });
  }

  private async queueRecoveryHumanTopics(companyId: number, to: string, contactId: string) {
    const config = await this.getRecoveryBotConfig(companyId);
    return this.conversations.queueOutboundForCompany(companyId, {
      to,
      contactId,
      body: 'Assuntos HBX Recovery',
      messageType: 'interactive',
      interactivePayload: this.getRecoveryHumanTopicsInteractive(config),
      sourceModule: 'hbx_recovery_bot',
      senderType: 'bot',
      flowState: { currentFlow: RECOVERY_FLOW_ID, currentStep: RECOVERY_STEP.HUMAN, botActive: false, humanAssigned: true },
    });
  }

  private async queueRecoveryPaymentOptions(companyId: number, to: string, contactId: string) {
    const config = await this.getRecoveryBotConfig(companyId);
    return this.conversations.queueOutboundForCompany(companyId, {
      to,
      contactId,
      body: 'Opcoes de pagamento HBX Recovery',
      messageType: 'interactive',
      interactivePayload: this.getRecoveryPaymentOptionsInteractive(config),
      sourceModule: 'hbx_recovery_bot',
      senderType: 'bot',
      flowState: { currentFlow: RECOVERY_FLOW_ID, currentStep: RECOVERY_STEP.MAIN_MENU, botActive: true },
    });
  }

  // S2 (arquitetura nº14) — Ledger de eventos do bot. Fire-and-forget: uma falha de
  // escrita da trilha NUNCA pode derrubar a geração/envio do link de cobrança do bot.
  // A unificação total com o gerador da API foi ADIADA pro S4 (o bot sai do messaging lá);
  // por ora ambos os geradores escrevem o mesmo ledger, cada um no seu lugar.
  private async recordRecoveryPaymentEvent(input: {
    companyId: number;
    paymentId: string;
    type: 'created' | 'link_sent' | 'failed';
    amount?: number;
    payload?: unknown;
  }) {
    const paymentId = String(input?.paymentId || '').trim();
    if (!paymentId) return;
    try {
      await (this.prisma as any).hbxRecoveryPaymentEvent.create({
        data: {
          companyId: input.companyId,
          paymentId,
          type: input.type,
          source: 'bot',
          amount: Number.isFinite(Number(input.amount)) ? Number(Number(input.amount).toFixed(2)) : 0,
          actorUserId: null,
          payloadJson: input.payload === undefined ? null : JSON.stringify(input.payload ?? null),
        },
      });
    } catch (error) {
      this.logger.warn(
        `[recovery-ledger] falha ao gravar evento ${input.type} do bot payment=${paymentId}: ${String((error as any)?.message || error)}`,
      );
    }
  }

  private async createAndSendRecoveryPaymentLink(
    companyId: number,
    customer: any,
    mode: 'pix' | 'card',
    opts?: {
      conversationId?: number;
      chargeType?: 'avista' | 'parcelado' | 'cartao';
      installmentCount?: number;
      totalAmount?: number;
    },
  ) {
    const resolved = await resolveCompanyMercadoPagoAccess(this.prisma, companyId);
    const company = resolved.company;
    const accessToken = String(resolved.accessToken || '').trim();
    // FINANCEIRO-UNIVERSAL P0 — só cobra pela conta MP do PRÓPRIO lojista (source
    // 'company'); fonte master levaria o pagamento pra conta da HBX sem consentimento
    // (vetado pelo dono). Sem conta própria → degrada pelo MESMO caminho gracioso do
    // "sem token" (encaminha p/ humano), sem quebrar a conversa nem gerar link.
    if (!company || !accessToken || !isTenantOwnedMpSource(resolved.source)) {
      if (this.shouldSendRecoveryHumanAck(company)) {
        await this.conversations.queueOutboundForCompany(companyId, {
          to: customer.whatsappNumber,
          contactId: customer.id,
          body: 'Nao foi possivel gerar o link agora. Vou encaminhar para atendimento humano.',
          messageType: 'text',
          sourceModule: 'hbx_recovery_human',
        });
      } else {
        this.logger.warn(
          `Recovery payment fallback ack suprimido fora do horario para customerId=${customer.id}`,
        );
      }
      return { ok: false };
    }

    const openAmount = Math.max(0, Number(customer.openAmount || 0));
    if (openAmount <= 0) {
      await this.conversations.queueOutboundForCompany(companyId, {
        to: customer.whatsappNumber,
        contactId: customer.id,
        body: 'Nao ha saldo em aberto para esse cadastro.',
        messageType: 'text',
        sourceModule: 'hbx_recovery_bot',
      });
      return { ok: false };
    }

    const selectedInstallments = Math.max(1, Math.min(12, Number(opts?.installmentCount || 1)));
    const computed = this.calculateInstallment(openAmount, selectedInstallments);
    const chargeType = opts?.chargeType || (selectedInstallments > 1 ? 'parcelado' : 'avista');
    const totalAmount =
      typeof opts?.totalAmount === 'number' && Number.isFinite(opts.totalAmount) && opts.totalAmount > 0
        ? Number(opts.totalAmount.toFixed(2))
        : chargeType === 'parcelado'
          ? computed.totalAmount
          : openAmount;
    const installmentValue =
      selectedInstallments > 1
        ? Number((totalAmount / selectedInstallments).toFixed(2))
        : Number(totalAmount.toFixed(2));
    const linkExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const notificationUrl = `${this.getPublicApiBaseUrl()}/webhooks/mercadopago?company_id=${companyId}`;
    const externalReference = `hbx-recovery-auto-${companyId}-${customer.id}-${Date.now()}`;
    const debtCaseId = await this.resolveRecoveryDebtCaseId(companyId, customer);

    const payment = await this.prisma.hbxRecoveryPayment.create({
      data: {
        companyId,
        customerId: customer.id,
        debtCaseId,
        conversationId: opts?.conversationId ? Number(opts.conversationId) : null,
        amount: totalAmount,
        currency: 'BRL',
        description: `HBX Recovery - ${customer.name}`,
        chargeType,
        installmentCount: selectedInstallments,
        installmentValue,
        linkExpiresAt,
        serviceDate: customer?.createdAt ? new Date(customer.createdAt) : null,
        serviceDescription: 'Regularizacao de pendencia financeira',
        status: 'preparing',
        lifecycle: 'in_progress',
        externalReference,
        notificationUrl,
      },
    });

    await this.recordRecoveryPaymentEvent({
      companyId,
      paymentId: payment.id,
      type: 'created',
      amount: totalAmount,
      payload: { mode, chargeType, installmentCount: selectedInstallments, externalReference },
    });

    try {
      const config = await this.getRecoveryBotConfig(companyId);
      const preferencePayload: any = {
        external_reference: externalReference,
        notification_url: notificationUrl,
        metadata: {
          company_id: companyId,
          recovery_customer_id: customer.id,
          payment_request_id: payment.id,
          requested_mode: mode,
          charge_type: chargeType,
          installment_count: selectedInstallments,
          conversation_id: opts?.conversationId ? Number(opts.conversationId) : null,
        },
        payer: {
          name: customer.name,
          phone: { number: this.normalizeDigits(customer.whatsappNumber) },
        },
        items: [
          {
            id: customer.id,
            title: `Cobranca HBX Recovery - ${customer.name}`,
            description: 'Regularizacao de pendencia',
            quantity: 1,
            unit_price: totalAmount,
            currency_id: 'BRL',
          },
        ],
        expires: true,
        date_of_expiration: linkExpiresAt.toISOString(),
      };
      if (selectedInstallments > 1) {
        preferencePayload.payment_methods = {
          installments: selectedInstallments,
          default_installments: selectedInstallments,
        };
      }

      const preference = await this.mercadoPagoClient.createPreference(
        accessToken,
        preferencePayload,
        crypto.randomUUID(),
      );

      const paymentUrl = String(preference?.init_point || preference?.sandbox_init_point || '').trim();
      if (!paymentUrl) throw new Error('URL de pagamento nao retornada pelo Mercado Pago');

      await this.prisma.hbxRecoveryPayment.update({
        where: { id: payment.id },
        data: {
          status: 'pending',
          lifecycle: 'in_progress',
          paymentUrl,
          mpPreferenceId: preference?.id ? String(preference.id) : null,
          providerPayload: JSON.stringify({ preference }),
        },
      });

      await this.recordRecoveryPaymentEvent({
        companyId,
        paymentId: payment.id,
        type: 'link_sent',
        amount: totalAmount,
        payload: { paymentUrl, mpPreferenceId: preference?.id ? String(preference.id) : null, mode },
      });

      const msgTemplate = mode === 'card' ? config.installmentLinkMessageTemplate : config.cashLinkMessageTemplate;
      const msg = renderTemplate(msgTemplate, {
        cliente: customer.clientName || customer.name,
        link_pagamento: paymentUrl,
        quantidade_parcelas: String(selectedInstallments),
        valor_parcela_formatado: this.formatCurrencyBRL(installmentValue),
        valor_formatado: this.formatCurrencyBRL(totalAmount),
      });
      await this.conversations.queueOutboundForCompany(companyId, {
        to: customer.whatsappNumber,
        contactId: customer.id,
        body: msg,
        messageType: 'text',
        sourceModule: 'hbx_recovery_bot',
        senderType: 'bot',
        variables: {
          cliente: customer.clientName || customer.name,
          link_pagamento: paymentUrl,
          quantidade_parcelas: selectedInstallments,
          valor_parcela_formatado: this.formatCurrencyBRL(installmentValue),
          valor_formatado: this.formatCurrencyBRL(totalAmount),
        },
        flowState: opts?.conversationId
          ? {
              currentFlow: RECOVERY_FLOW_ID,
              currentStep:
                chargeType === 'parcelado'
                  ? RECOVERY_STEP.LINK_GENERATED_INSTALLMENTS
                  : RECOVERY_STEP.LINK_GENERATED_CASH,
              botActive: true,
            }
          : undefined,
      });

      if (opts?.conversationId) {
        await this.queueRecoveryButtonPrompt({
          companyId,
          to: customer.whatsappNumber,
          contactId: customer.id,
          conversationId: Number(opts.conversationId),
          body: config.postLinkPrompt,
          step: RECOVERY_STEP.WAITING_PAYMENT,
          buttons: config.postLinkButtons,
          variables: {
            link_pagamento: paymentUrl,
            status_pagamento: 'aguardando_pagamento',
          },
        });
      }
      return { ok: true, paymentUrl };
    } catch (error: any) {
      await this.prisma.hbxRecoveryPayment.update({
        where: { id: payment.id },
        data: {
          status: 'failed',
          lifecycle: 'cancelled',
          providerPayload: JSON.stringify({ error: String(error?.message || 'falha') }),
        },
      });
      await this.recordRecoveryPaymentEvent({
        companyId,
        paymentId: payment.id,
        type: 'failed',
        amount: totalAmount,
        payload: { error: String(error?.message || 'falha'), mode },
      });
      await this.conversations.queueOutboundForCompany(companyId, {
        to: customer.whatsappNumber,
        contactId: customer.id,
        body: 'Nao consegui gerar o link automaticamente. Encaminhei para tratativa humana.',
        messageType: 'text',
        sourceModule: 'hbx_recovery_human',
        senderType: 'system',
      });
      if (opts?.conversationId) {
        await this.updateRecoveryConversationState(companyId, Number(opts.conversationId), {
          currentStep: RECOVERY_STEP.HUMAN,
          botActive: false,
          humanAssigned: true,
        });
      }
      return { ok: false };
    }
  }

  private extractInteractiveReplyId(rawPayload: any): string {
    return String(
      rawPayload?.interactive?.button_reply?.id ||
        rawPayload?.interactive?.list_reply?.id ||
        rawPayload?.button?.payload ||
        '',
    )
      .trim()
      .toLowerCase();
  }

  private normalizeRecoveryActionId(
    rawActionId: string,
    config: RecoveryBotConfig,
    rawPayload?: any,
    normalizedText?: string,
    currentStep?: string | null,
  ): string {
    const directButtonAction = this.resolveRecoveryActionIdFromButtonId(config, rawActionId);
    if (directButtonAction) return directButtonAction;

    const direct = this.mapLegacyRecoveryActionId(rawActionId);
    if (RECOVERY_BOT_ACTION_IDS.includes(direct as RecoveryBotButtonActionId)) {
      return direct;
    }

    const directGuide = this.getRecoveryActionGuide(config, rawActionId);
    if (directGuide?.enabled) return String(directGuide.actionId || '').trim().toLowerCase();

    const aliasMap = this.buildRecoveryActionAliasMap(config);
    const directByLabel = aliasMap[this.normalizeActionLabel(rawActionId)];
    if (directByLabel) return directByLabel;

    const numberedAction = this.pickNumberedButtonAction(
      normalizedText,
      this.getRecoveryButtonsForStep(config, currentStep),
    );
    if (numberedAction) return numberedAction;

    if (String(rawPayload?.type || '').trim().toLowerCase() !== 'button') {
      const freeTextAction = aliasMap[this.normalizeActionLabel(normalizedText || '')];
      return freeTextAction || '';
    }

    const fromButtonText = this.normalizeActionLabel(String(normalizedText || ''));
    return aliasMap[fromButtonText] || '';
  }

  private async routeRecoveryToHumanQueue(input: {
    companyId: number;
    from: string;
    customerId: string;
    inboundMessageId: number;
    conversationId?: number;
    reason: string;
  }) {
    const config = await this.getRecoveryBotConfig(input.companyId);
    await this.prisma.companyMessage.update({
      where: { id: input.inboundMessageId },
      data: { isComplaint: true, sourceModule: 'hbx_recovery_human' },
    });
    await this.prisma.hbxRecoveryCustomer.update({
      where: { id: input.customerId },
      data: { lastContact: `Tratativa humana (${input.reason}) em ${new Date().toLocaleString('pt-BR')}` },
    });
    const company = await this.prisma.company.findUnique({
      where: { id: input.companyId },
      select: { timezone: true },
    });
    if (this.shouldSendRecoveryHumanAck(company)) {
      await this.conversations.queueOutboundForCompany(input.companyId, {
        to: input.from,
        contactId: input.customerId,
        body: config.humanAckMessage,
        messageType: 'text',
        sourceModule: 'hbx_recovery_human',
        senderType: 'system',
        flowState: {
          currentFlow: RECOVERY_FLOW_ID,
          currentStep: RECOVERY_STEP.HUMAN,
          botActive: false,
          humanAssigned: true,
        },
        variables: { motivo_fila_humana: input.reason },
      });
    } else {
      this.logger.warn(
        `Recovery human ack suprimido fora do horario para customerId=${input.customerId} reason=${input.reason}`,
      );
    }
    if (input.conversationId) {
      await this.updateRecoveryConversationState(
        input.companyId,
        Number(input.conversationId),
        {
          currentStep: RECOVERY_STEP.HUMAN,
          botActive: false,
          humanAssigned: true,
        },
        { escalation_reason: input.reason },
      );
      await this.appendRecoverySystemEvent({
        companyId: input.companyId,
        conversationId: Number(input.conversationId),
        contactId: input.customerId,
        text: `Conversa encaminhada para atendimento humano (${input.reason}).`,
        eventType: 'recovery_human_handoff',
        sourceModule: 'hbx_recovery_human',
        variables: { reason: input.reason },
      });
    }
  }

  private async handleRecoveryInbound(input: {
    companyId: number;
    from: string;
    text: string;
    conversationId: number;
    inboundMessageId: number;
    customer: any;
    rawPayload?: any;
  }) {
    const { companyId, from, text, conversationId, inboundMessageId, customer, rawPayload } = input;
    const config = await this.getRecoveryBotConfig(companyId);
    const normalizedText = String(text || '').trim().toLowerCase();
    const rawActionId = this.extractInteractiveReplyId(rawPayload);
    const safeConversationId = Number(conversationId || 0);
    const conversation = safeConversationId
      ? await this.prisma.companyConversation.findFirst({
          where: { id: safeConversationId, companyId, channel: 'whatsapp' },
          select: {
            id: true,
            metadata: true,
            currentStep: true,
            flowResult: true,
            botActive: true,
            humanAssigned: true,
          },
        })
      : null;
    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(companyId);
    if (!tenantContext.recoveryEnabled) {
      await this.prisma.companyMessage.update({
        where: { id: inboundMessageId },
        data: { sourceModule: 'atendimento_human', isComplaint: false },
      });
      const atendimentoConfig = await this.getAtendimentoBotConfig(companyId, tenantContext);
      await this.routeAtendimentoToHumanQueue({
        companyId,
        conversationId: safeConversationId,
        from,
        config: atendimentoConfig,
        metadata: this.parseConversationMetadata(conversation?.metadata),
        reason: 'recovery_sem_plano',
      });
      return { handled: true, recoveryBlocked: true };
    }

    // Gate de recovery ao vivo (kill-switch): chavinha desligada = bot não responde.
    // A conversa continua aberta, mas a automação para.
    {
      const companyLiveFlags = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { recoveryBotLiveAt: true },
      }).catch(() => null);
      if (!companyLiveFlags?.recoveryBotLiveAt) {
        await this.prisma.companyMessage.update({
          where: { id: inboundMessageId },
          data: { sourceModule: 'hbx_recovery_paused', isComplaint: false },
        }).catch(() => null);
        this.logger.log(`[recovery] recoveryBotLiveAt null — resposta automática bloqueada companyId=${companyId} conversationId=${safeConversationId}`);
        return { handled: false, recoveryBotPaused: true };
      }
    }

    const interactiveId = this.normalizeRecoveryActionId(
      rawActionId,
      config,
      rawPayload,
      normalizedText,
      conversation?.currentStep,
    );
    const flowMeta = this.parseConversationMetadata(conversation?.metadata);
    const blockedState = this.getRecoveryBlockedState(flowMeta);

    const setInboundMeta = async (sourceModule: string, isComplaint: boolean) => {
      await this.prisma.companyMessage.update({
        where: { id: inboundMessageId },
        data: { sourceModule, isComplaint },
      });
    };

    const customerName = customer.clientName || customer.name;
    const inboundMessageType = normalizeWhatsAppMessageType(rawPayload?.type);

    if (blockedState.isBlocked) {
      await setInboundMeta('hbx_recovery_blocked', false);
      await this.logWhatsAppEvent({
        companyId,
        scope: 'recovery',
        event: 'blocked_recovery_inbound',
        message: 'Mensagem inbound recebida em conversa bloqueada do HBX Recovery.',
        customerId: customer.id,
        conversationId: safeConversationId,
        phone: from,
        messageType: inboundMessageType,
        flowStep: conversation?.currentStep || RECOVERY_STEP.CLOSED,
        result: 'ignored',
      });
      return { handled: true, blocked: true };
    }

    let conversationState = conversation;
    const isClosedConversation =
      ['encerrado', 'manual_closed', 'encerrado_operador', 'paid_manual'].includes(
        String(conversation?.flowResult || '').trim().toLowerCase(),
      ) || String(conversation?.currentStep || '').trim().toLowerCase() === RECOVERY_STEP.CLOSED;

    if (conversation?.id && isClosedConversation) {
      await this.updateRecoveryConversationState(
        companyId,
        safeConversationId,
        {
          currentStep: RECOVERY_STEP.HUMAN,
          flowResult: null,
          botActive: false,
          humanAssigned: true,
          assignedUserId: null,
        },
        {
          recoveryBlockedAt: null,
          recoveryBlockedByUserId: null,
          recoveryBlockedReason: null,
        },
      );
      await this.appendRecoverySystemEvent({
        companyId,
        conversationId: safeConversationId,
        contactId: customer.id,
        text: 'Cliente enviou nova mensagem e a conversa foi reaberta automaticamente.',
        eventType: 'interaction_reopened_auto',
        sourceModule: 'hbx_recovery_human',
      });
      conversationState = {
        ...conversation,
        currentStep: RECOVERY_STEP.HUMAN,
        flowResult: null,
        botActive: false,
        humanAssigned: true,
      } as typeof conversation;
    }

    if (conversationState?.humanAssigned || conversationState?.botActive === false) {
      await setInboundMeta('hbx_recovery_human', Boolean(normalizedText));
      await this.logWhatsAppEvent({
        companyId,
        scope: 'recovery',
        event: 'human_mode_inbound',
        message: 'Mensagem inbound persistida com atendimento humano ativo, sem automacao do bot',
        customerId: customer.id,
        conversationId: safeConversationId,
        phone: from,
        messageType: inboundMessageType,
        flowStep: conversationState?.currentStep || RECOVERY_STEP.HUMAN,
        result: 'received',
      });
      return { handled: true, humanMode: true };
    }

    const queueMainMenu = async () => {
      const prompt = renderTemplate(config.mainMenuPrompt, {
        cliente: customerName,
      });
      await this.queueRecoveryButtonPrompt({
        companyId,
        to: from,
        contactId: customer.id,
        conversationId: safeConversationId,
        body: prompt,
        step: RECOVERY_STEP.MAIN_MENU,
        buttons: config.mainMenuButtons,
        variables: {
          cliente: customerName,
        },
      });
    };

    if (interactiveId === 'template_yes') {
      await setInboundMeta('hbx_recovery_bot', false);
      await queueMainMenu();
      await this.appendRecoverySystemEvent({
        companyId,
        conversationId: safeConversationId,
        contactId: customer.id,
        text: 'Cliente confirmou interesse no fluxo de cobranca.',
        eventType: 'template_yes',
        sourceModule: 'hbx_recovery_bot',
      });
      return { handled: true };
    }

    if (interactiveId === 'template_no') {
      await setInboundMeta('hbx_recovery_bot', false);
      await this.queueRecoveryButtonPrompt({
        companyId,
        to: from,
        contactId: customer.id,
        conversationId: safeConversationId,
        body: config.declineMenuPrompt,
        step: RECOVERY_STEP.DECLINE_MENU,
        buttons: config.declineMenuButtons,
      });
      await this.appendRecoverySystemEvent({
        companyId,
        conversationId: safeConversationId,
        contactId: customer.id,
        text: 'Cliente selecionou nao no template inicial.',
        eventType: 'template_no',
        sourceModule: 'hbx_recovery_bot',
      });
      return { handled: true };
    }

    if (interactiveId === 'talk_later') {
      await setInboundMeta('hbx_recovery_bot', false);
      await this.queueRecoveryButtonPrompt({
        companyId,
        to: from,
        contactId: customer.id,
        conversationId: safeConversationId,
        body: config.followupPrompt,
        step: RECOVERY_STEP.FOLLOWUP_PICK,
        buttons: config.followupButtons,
      });
      return { handled: true };
    }

    const customActionGuide = this.getRecoveryActionGuide(config, interactiveId);
    if (
      customActionGuide?.enabled &&
      !(RECOVERY_BOT_ACTION_IDS as readonly string[]).includes(interactiveId)
    ) {
      await setInboundMeta(
        customActionGuide.route === 'atendimento' ? 'hbx_recovery_human' : 'hbx_recovery_bot',
        customActionGuide.route === 'atendimento',
      );

      if (customActionGuide.route === 'atendimento') {
        await this.routeRecoveryToHumanQueue({
          companyId,
          from,
          customerId: customer.id,
          inboundMessageId,
          conversationId: safeConversationId,
          reason: customActionGuide.title,
        });
        return { handled: true };
      }

      const reply =
        String(customActionGuide.responseMessage || '').trim() ||
        String(customActionGuide.description || '').trim() ||
        `Recebi sua solicitacao sobre ${customActionGuide.title}.`;
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: customer.id,
        body: renderTemplate(reply, {
          cliente: customerName,
          valor_formatado: this.formatCurrencyBRL(Number(customer.openAmount || 0)),
        }),
        messageType: 'text',
        sourceModule: 'hbx_recovery_bot',
        senderType: 'bot',
        flowState: {
          currentFlow: RECOVERY_FLOW_ID,
          currentStep: conversation?.currentStep || RECOVERY_STEP.MAIN_MENU,
          botActive: true,
        },
      });
      await queueMainMenu();
      return { handled: true };
    }

    if (
      interactiveId === 'followup_today' ||
      interactiveId === 'followup_tomorrow' ||
      interactiveId === 'followup_week'
    ) {
      await setInboundMeta('hbx_recovery_bot', false);
      const followupLabel =
        interactiveId === 'followup_today'
          ? 'hoje_mais_tarde'
          : interactiveId === 'followup_tomorrow'
            ? 'amanha'
            : 'esta_semana';
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: customer.id,
        body: `Perfeito. Vou registrar sua preferencia (${followupLabel.replace(/_/g, ' ')}) e retornaremos nesse periodo.`,
        messageType: 'text',
        sourceModule: 'hbx_recovery_bot',
        senderType: 'bot',
        flowState: {
          currentFlow: RECOVERY_FLOW_ID,
          currentStep: RECOVERY_STEP.FOLLOWUP_SCHEDULED,
          botActive: true,
          humanAssigned: false,
          flowResult: 'followup_agendado',
        },
        variables: { followup_preferencia: followupLabel },
      });
      await this.updateRecoveryConversationState(
        companyId,
        safeConversationId,
        {
          currentStep: RECOVERY_STEP.FOLLOWUP_SCHEDULED,
          botActive: true,
          humanAssigned: false,
          flowResult: 'followup_agendado',
        },
        { followup_preferencia: followupLabel },
      );
      return { handled: true };
    }

    if (interactiveId === 'close_topic') {
      await setInboundMeta('hbx_recovery_bot', false);
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: customer.id,
        body: config.closeTopicMessage,
        messageType: 'text',
        sourceModule: 'hbx_recovery_bot',
        senderType: 'bot',
        flowState: {
          currentFlow: RECOVERY_FLOW_ID,
          currentStep: RECOVERY_STEP.REFUSED,
          flowResult: 'refused_contact',
          botActive: false,
          humanAssigned: false,
        },
      });
      return { handled: true };
    }

    if (interactiveId === 'view_amount') {
      await setInboundMeta('hbx_recovery_bot', false);
      const serviceDate = customer?.createdAt
        ? this.formatDatePtBR(new Date(customer.createdAt))
        : this.formatDatePtBR(new Date());
      const serviceDescription = String(customer?.lastContact || 'servico realizado').trim();
      const valueMessage = renderTemplate(config.valueMessageTemplate, {
        cliente: customerName,
        valor_formatado: this.formatCurrencyBRL(Number(customer.openAmount || 0)),
        descricao_servico: serviceDescription || 'servico realizado',
        data_servico: serviceDate,
      });
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: customer.id,
        body: valueMessage,
        messageType: 'text',
        sourceModule: 'hbx_recovery_bot',
        senderType: 'bot',
        flowState: {
          currentFlow: RECOVERY_FLOW_ID,
          currentStep: RECOVERY_STEP.VIEWING_AMOUNT,
          botActive: true,
        },
      });
      await this.queueRecoveryButtonPrompt({
        companyId,
        to: from,
        contactId: customer.id,
        conversationId: safeConversationId,
        body: 'Como deseja seguir?',
        step: RECOVERY_STEP.VIEWING_AMOUNT,
        buttons: config.valueButtons,
      });
      return { handled: true };
    }

    if (interactiveId === 'choose_installments') {
      await setInboundMeta('hbx_recovery_bot', false);
      await this.createAndSendRecoveryPaymentLink(companyId, customer, 'card', {
        conversationId: safeConversationId,
        chargeType: 'cartao',
        installmentCount: 1,
        totalAmount: Number(customer.openAmount || 0),
      });
      return { handled: true };
    }

    const selectedInstallments = this.parseInstallmentCount(interactiveId, normalizedText);
    if (selectedInstallments >= 2) {
      await setInboundMeta('hbx_recovery_bot', false);
      const plan = this.calculateInstallment(Number(customer.openAmount || 0), selectedInstallments);
      await this.queueRecoveryButtonPrompt({
        companyId,
        to: from,
        contactId: customer.id,
        conversationId: safeConversationId,
        body: renderTemplate(config.installmentConfirmTemplate, {
          cliente: customerName,
          quantidade_parcelas: String(plan.installmentCount),
          valor_parcela_formatado: this.formatCurrencyBRL(plan.installmentValue),
          valor_formatado: this.formatCurrencyBRL(plan.totalAmount),
        }),
        step: RECOVERY_STEP.CONFIRMING_INSTALLMENTS,
        buttons: config.installmentConfirmButtons,
        variables: {
          quantidade_parcelas: plan.installmentCount,
          valor_parcela_formatado: this.formatCurrencyBRL(plan.installmentValue),
          valor_formatado: this.formatCurrencyBRL(plan.totalAmount),
        },
      });
      await this.updateRecoveryConversationState(
        companyId,
        safeConversationId,
        {
          currentStep: RECOVERY_STEP.CONFIRMING_INSTALLMENTS,
          botActive: true,
        },
        {
          installmentCount: plan.installmentCount,
          installmentValue: plan.installmentValue,
          totalAmount: plan.totalAmount,
        },
      );
      return { handled: true };
    }

    if (interactiveId === 'generate_installment_link') {
      await setInboundMeta('hbx_recovery_bot', false);
      await this.createAndSendRecoveryPaymentLink(companyId, customer, 'card', {
        conversationId: safeConversationId,
        chargeType: 'cartao',
        installmentCount: 1,
        totalAmount: Number(customer.openAmount || 0),
      });
      return { handled: true };
    }

    if (interactiveId === 'pay_full') {
      await setInboundMeta('hbx_recovery_bot', false);
      await this.createAndSendRecoveryPaymentLink(companyId, customer, 'pix', {
        conversationId: safeConversationId,
        chargeType: 'avista',
        installmentCount: 1,
        totalAmount: Number(customer.openAmount || 0),
      });
      return { handled: true };
    }

    if (interactiveId === 'paid_claim') {
      await setInboundMeta('hbx_recovery_human', true);
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { timezone: true },
      });
      if (this.shouldSendRecoveryHumanAck(company)) {
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from,
          contactId: customer.id,
          body: config.paidClaimMessage,
          messageType: 'text',
          sourceModule: 'hbx_recovery_human',
          senderType: 'system',
          flowState: {
            currentFlow: RECOVERY_FLOW_ID,
            currentStep: RECOVERY_STEP.HUMAN,
            botActive: false,
            humanAssigned: true,
          },
        });
      } else {
        this.logger.warn(
          `Recovery paid-claim ack suprimido fora do horario para customerId=${customer.id}`,
        );
      }
      await this.appendRecoverySystemEvent({
        companyId,
        conversationId: safeConversationId,
        contactId: customer.id,
        text: 'Cliente informou pagamento manualmente e foi encaminhado para validacao humana.',
        eventType: 'paid_claimed',
      });
      return { handled: true };
    }

    if (interactiveId === 'talk_human') {
      await setInboundMeta('hbx_recovery_human', true);
      await this.routeRecoveryToHumanQueue({
        companyId,
        from,
        customerId: customer.id,
        inboundMessageId,
        conversationId: safeConversationId,
        reason: interactiveId || 'pedido_atendente',
      });
      return { handled: true };
    }

    // Texto livre ou resposta fora do menu -> fila humana (tratativas/reclamacoes)
    if (normalizedText) {
      await this.routeRecoveryToHumanQueue({
        companyId,
        from,
        customerId: customer.id,
        inboundMessageId,
        conversationId: safeConversationId,
        reason: 'texto_livre',
      });
      return { handled: true };
    }

    await queueMainMenu();
    return { handled: true };
  }

  private async handleAtendimentoInbound(input: {
    companyId: number;
    from: string;
    text: string;
    conversationId: number;
    inboundMessageId: number;
    timestamp: Date;
    company: { id: number; name: string; timezone?: string | null };
    recoveryCustomer?: any | null;
    rawPayload?: any;
  }) {
    const { companyId, from, text, conversationId, inboundMessageId, company, recoveryCustomer, rawPayload } = input;
    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(companyId);
    const configuredBot = await this.getAtendimentoBotConfig(companyId, tenantContext);
    const botAiEnabled = await this.isBotArmedForCompany(companyId);
    const setupComplete = isAtendimentoBotSetupComplete(configuredBot);
    const config = botAiEnabled && setupComplete
      ? configuredBot
      : {
          ...configuredBot,
          routingRules: {
            ...configuredBot.routingRules,
            globalBotEnabled: false,
          },
        };
    const agendaConfig = await this.getAtendimentoAgendaConfig(companyId);
    const normalizedText = String(text || '').trim().toLowerCase();
    const rawActionId = this.extractInteractiveReplyId(rawPayload);
    const safeConversationId = Number(conversationId || 0);

    const conversation = safeConversationId
      ? await this.prisma.companyConversation.findFirst({
          where: { id: safeConversationId, companyId, channel: 'whatsapp' },
          select: {
            id: true,
            metadata: true,
            currentFlow: true,
            currentStep: true,
            flowResult: true,
            botActive: true,
            humanAssigned: true,
          },
        })
      : null;

    let metadata = this.parseConversationMetadata(conversation?.metadata);
    const blockedState = this.getAtendimentoBlockedState(metadata);
    const inboundProfileName = this.extractInboundContactName(rawPayload, metadata);

    if (this.isPersonalWhatsappContact(metadata)) {
      await this.prisma.companyMessage.update({
        where: { id: inboundMessageId },
        data: { sourceModule: 'whatsapp_personal', isComplaint: false },
      });
      if (safeConversationId) {
        await this.updateAtendimentoConversationState(
          companyId,
          safeConversationId,
          {
            botActive: false,
            humanAssigned: true,
            flowResult: 'personal_contact',
          },
          metadata,
        );
      }
      return { handled: true, personalContact: true, botSuppressed: true };
    }

    metadata = this.promoteVendasProspectionMetadataToAtendimento(metadata);

    // Upsert customer record on every inbound message
    await this.upsertAtendimentoCustomerLocal({
      companyId,
      phone: from,
      name: inboundProfileName || undefined,
      nameSource: inboundProfileName ? 'whatsapp_profile' : undefined,
      conversationId: safeConversationId || null,
      inboundAt: input.timestamp,
      metadata,
    });

    const gate = await this.buildHbxGateContext({
      companyId,
      from,
      company,
      conversation,
      metadata,
      recoveryCustomer,
      tenantContext,
      agendaConfig,
      config,
      inboundProfileName,
    });
    metadata = {
      ...metadata,
      hbxGateContext: gate.hbxGateContext,
      hbxGateLastCheckedAt: new Date().toISOString(),
    };

    const isClosedConversation =
      ['manual_closed', 'encerrado_operador'].includes(
        String(conversation?.flowResult || '').trim().toLowerCase(),
      ) || String(conversation?.currentStep || '').trim().toLowerCase() === ATENDIMENTO_STEP.CLOSED;
    const isRecoveryConversation =
      String(conversation?.currentFlow || '').trim().toLowerCase().includes('recovery') ||
      String(conversation?.currentStep || '').trim().toLowerCase().includes('cobranca');
    let actionId = this.resolveDynamicMenuActionKey(metadata, rawActionId, normalizedText, rawPayload);
    if (!actionId) {
      actionId = this.normalizeAtendimentoActionId(
        rawActionId,
        config,
        rawPayload,
        normalizedText,
        agendaConfig,
        conversation?.currentStep,
      );
    }
    if (!actionId && normalizedText && botAiEnabled && this.intentEngine.isAtendimentoNluEnabled()) {
      actionId = await this.resolveAtendimentoActionIdFromNlu({
        companyId,
        conversationId: safeConversationId,
        text,
        config,
      });
    }
    const actionGuide = this.getAtendimentoActionGuide(config, actionId);
    const messageCount = safeConversationId
      ? await this.prisma.companyMessage.count({
          where: { companyId, conversationId: safeConversationId },
        })
      : 0;
    const hasHistory = messageCount > 1;
    const setInboundMeta = async (sourceModule: string, isComplaint: boolean) => {
      await this.prisma.companyMessage.update({
        where: { id: inboundMessageId },
        data: { sourceModule, isComplaint },
      });
    };
    const queueMainMenuForVars = async (
      templateVars: Record<string, string>,
      metadataVars?: Record<string, unknown>,
    ) => {
      await this.queueAtendimentoButtonPrompt({
        companyId,
        to: from,
        contactId: from,
        conversationId: safeConversationId,
        body: renderTemplate(config.mainMenuPrompt, templateVars, config),
        step: ATENDIMENTO_STEP.MAIN_MENU,
        buttons: config.mainMenuButtons,
        variables: metadataVars || templateVars,
      });
    };

    if (blockedState.isBlocked) {
      await setInboundMeta('atendimento_blocked', false);
      await this.logWhatsAppEvent({
        companyId,
        scope: 'atendimento',
        event: 'blocked_atendimento_inbound',
        message: 'Mensagem inbound recebida em conversa bloqueada do Atendimento.',
        conversationId: safeConversationId,
        phone: from,
        messageType: normalizeWhatsAppMessageType(rawPayload?.type),
        flowStep: conversation?.currentStep || ATENDIMENTO_STEP.CLOSED,
        result: 'ignored',
      });
      return { handled: true, blocked: true };
    }

    const vendasAutomationInbound = await this.handleVendasAutomationInbound({
      companyId,
      conversationId: safeConversationId,
      inboundMessageId,
      from,
      text,
      timestamp: input.timestamp,
      metadata,
      setInboundMeta,
    });
    if (vendasAutomationInbound?.handled) {
      return vendasAutomationInbound;
    }

    if (
      isClosedConversation &&
      config.routingRules.globalBotEnabled &&
      config.routingRules.autoReopenClosedConversation &&
      conversation?.id
    ) {
      await this.updateAtendimentoConversationState(
        companyId,
        safeConversationId,
        {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.WELCOME,
          flowResult: null,
          botActive: true,
          humanAssigned: false,
        },
        this.clearAtendimentoBlockedMetadata(metadata),
      );
      await this.appendAtendimentoSystemEvent({
        companyId,
        conversationId: safeConversationId,
        contactId: from,
        text: 'Cliente voltou a falar e a conversa foi reaberta automaticamente.',
        eventType: 'atendimento_reopened_auto',
      });
    }

    if (!config.routingRules.globalBotEnabled) {
      if (conversation?.id && conversation.botActive !== false) {
        await this.updateAtendimentoConversationState(
          companyId,
          safeConversationId,
          {
            currentFlow: ATENDIMENTO_FLOW_ID,
            currentStep: conversation.currentStep || ATENDIMENTO_STEP.HUMAN,
            botActive: false,
            humanAssigned: false,
            flowResult: null,
          },
          this.clearAtendimentoBlockedMetadata(metadata),
        );
      }
      await setInboundMeta('atendimento_human', Boolean(normalizedText));
      return { handled: true, humanMode: true, botSuppressed: true };
    }

    const vendasAgendaBotGate = await this.tryEnterVendasAgendaBotGate({
      companyId,
      from,
      conversationId: safeConversationId,
      inboundMessageId,
      timestamp: input.timestamp,
      company,
      metadata,
      config,
      inboundProfileName,
      setInboundMeta,
    });
    if (vendasAgendaBotGate?.handled) {
      return vendasAgendaBotGate;
    }

    if (
      !tenantContext.recoveryEnabled &&
      (isRecoveryConversation || isAtendimentoRecoveryActionId(actionId) || actionGuide?.kind === 'recovery_handoff')
    ) {
      await setInboundMeta('atendimento_human', true);
      await this.routeAtendimentoToHumanQueue({
        companyId,
        conversationId: safeConversationId,
        from,
        config,
        metadata,
        reason: 'recovery_sem_plano',
      });
      return { handled: true, recoveryBlocked: true };
    }

    if (recoveryCustomer && isRecoveryConversation) {
      await this.handleRecoveryInbound({
        companyId,
        from,
        text,
        conversationId: safeConversationId,
        inboundMessageId,
        customer: recoveryCustomer,
        rawPayload,
      });
      return { handled: true, delegatedToRecovery: true };
    }

    if (
      recoveryCustomer &&
      config.routingRules.checkRecoveryBeforeReply &&
      config.routingRules.autoRouteDebtorsToRecovery &&
      metadata.atendimentoRecoveryIntroPending
    ) {
      const recoveryVars = this.buildAtendimentoTemplateVars({
        companyName: company.name,
        phone: from,
        metadata,
        recoveryCustomer,
      });
      const actionFromRecoveryMenu = this.isAtendimentoButtonSectionAction(
        config.recoveryDetectedButtons,
        actionId,
      );
      const recoveryGateClearedVars = {
        ...recoveryVars,
        atendimentoRecoveryIntroPending: false,
        recoveryCustomerId: String(recoveryCustomer.id),
      };

      if (actionId === 'enter_recovery') {
        await setInboundMeta('atendimento_router', false);
        await this.startRecoveryFromAtendimento({
          companyId,
          conversationId: safeConversationId,
          from,
          customer: recoveryCustomer,
          metadata,
        });
        return { handled: true, delegatedToRecovery: true };
      }

      if (actionId === 'talk_human') {
        await setInboundMeta('hbx_recovery_human', true);
        await this.routeRecoveryToHumanQueue({
          companyId,
          from,
          customerId: String(recoveryCustomer.id),
          inboundMessageId,
          conversationId: safeConversationId,
          reason: 'atendimento_recovery_gate_human',
        });
        return { handled: true, delegatedToRecovery: true };
      }

      if (actionId === 'close_topic') {
        await setInboundMeta('atendimento_router', false);
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from,
          contactId: from,
          body: renderTemplate(config.closeTopicMessage, recoveryVars, config),
          messageType: 'text',
          sourceModule: 'atendimento_router',
          senderType: 'bot',
          flowState: {
            currentFlow: ATENDIMENTO_FLOW_ID,
            currentStep: ATENDIMENTO_STEP.CLOSED,
            flowResult: 'manual_closed',
            botActive: false,
            humanAssigned: false,
          },
        });
        return { handled: true };
      }

      if (
        actionFromRecoveryMenu &&
        (actionId === 'continue_attendance' || actionGuide?.kind === 'show_menu')
      ) {
        await setInboundMeta('atendimento_bot', false);
        await queueMainMenuForVars(recoveryVars, recoveryGateClearedVars);
        return { handled: true, recoveryGate: true, continuedAtendimento: true };
      }

      const recoveryAgendaGroupId = parseAtendimentoAgendaActionId(actionId);
      if (actionFromRecoveryMenu && (recoveryAgendaGroupId || actionGuide?.kind === 'agenda')) {
        const targetGroup =
          (agendaConfig.groups || []).find((group) => group.id === (actionGuide?.agendaGroupId || recoveryAgendaGroupId)) ||
          null;
        const agendaPreview = this.buildAgendaPreview(targetGroup);
        const agendaVars = this.buildAtendimentoTemplateVars({
          companyName: company.name,
          phone: from,
          metadata: recoveryGateClearedVars,
          agendaGroup: targetGroup,
          agendaPreview,
          recoveryCustomer,
        });
        await setInboundMeta('atendimento_bot', false);
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from,
          contactId: from,
          body: this.renderAtendimentoAgendaMessage(config, targetGroup, agendaVars),
          messageType: 'text',
          sourceModule: 'atendimento_bot',
          senderType: 'bot',
          variables: agendaVars,
          flowState: {
            currentFlow: ATENDIMENTO_FLOW_ID,
            currentStep: ATENDIMENTO_STEP.AGENDA,
            botActive: true,
            humanAssigned: false,
            flowResult: null,
          },
        });
        if ((config.postActionButtons || []).length) {
          await this.queueAtendimentoButtonPrompt({
            companyId,
            to: from,
            contactId: from,
            conversationId: safeConversationId,
            body: renderTemplate(config.postActionPrompt, agendaVars, config),
            step: ATENDIMENTO_STEP.POST_ACTION,
            buttons: config.postActionButtons,
            variables: agendaVars,
          });
        } else {
          await this.updateAtendimentoConversationState(
            companyId,
            safeConversationId,
            {
              currentFlow: ATENDIMENTO_FLOW_ID,
              currentStep: ATENDIMENTO_STEP.AGENDA,
              botActive: true,
              humanAssigned: false,
              flowResult: null,
            },
            recoveryGateClearedVars,
          );
        }
        return { handled: true, recoveryGate: true, agenda: true };
      }

      if (actionFromRecoveryMenu && actionGuide?.enabled && actionGuide.kind === 'reply') {
        await setInboundMeta('atendimento_bot', false);
        const reply =
          String(actionGuide.responseMessage || '').trim() ||
          String(actionGuide.description || '').trim() ||
          `Recebi sua solicitacao sobre ${actionGuide.title}.`;
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from,
          contactId: from,
          body: renderTemplate(reply, recoveryVars, config),
          messageType: 'text',
          sourceModule: 'atendimento_bot',
          senderType: 'bot',
          variables: recoveryGateClearedVars,
          flowState: {
            currentFlow: ATENDIMENTO_FLOW_ID,
            currentStep: ATENDIMENTO_STEP.RECOVERY_GATE,
            botActive: true,
            humanAssigned: false,
            flowResult: null,
          },
        });
        if ((config.postActionButtons || []).length) {
          await this.queueAtendimentoButtonPrompt({
            companyId,
            to: from,
            contactId: from,
            conversationId: safeConversationId,
            body: renderTemplate(config.postActionPrompt, recoveryVars, config),
            step: ATENDIMENTO_STEP.POST_ACTION,
            buttons: config.postActionButtons,
            variables: recoveryGateClearedVars,
          });
        } else {
          await this.updateAtendimentoConversationState(
            companyId,
            safeConversationId,
            {
              currentFlow: ATENDIMENTO_FLOW_ID,
              currentStep: ATENDIMENTO_STEP.RECOVERY_GATE,
              botActive: true,
              humanAssigned: false,
              flowResult: null,
            },
            recoveryGateClearedVars,
          );
        }
        return { handled: true, recoveryGate: true, recoveryAction: actionId };
      }

      if (metadata.atendimentoRecoveryIntroPending) {
        await this.handleRecoveryInbound({
          companyId,
          from,
          text,
          conversationId: safeConversationId,
          inboundMessageId,
          customer: recoveryCustomer,
          rawPayload,
        });
        return { handled: true, delegatedToRecovery: true };
      }

      await setInboundMeta('atendimento_router', false);
      await this.queueAtendimentoButtonPrompt({
        companyId,
        to: from,
        contactId: from,
        conversationId: safeConversationId,
        body: renderTemplate(config.recoveryDetectedMessage, recoveryVars, config),
        step: ATENDIMENTO_STEP.RECOVERY_GATE,
        buttons: config.recoveryDetectedButtons,
        variables: {
          ...recoveryVars,
          atendimentoRecoveryIntroPending: true,
          recoveryCustomerId: String(recoveryCustomer.id),
        },
      });
      await this.updateAtendimentoConversationState(
        companyId,
        safeConversationId,
        {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.RECOVERY_GATE,
          botActive: true,
          humanAssigned: false,
          flowResult: null,
        },
        {
          ...metadata,
          atendimentoRecoveryIntroPending: true,
          recoveryCustomerId: String(recoveryCustomer.id),
        },
      );
      return { handled: true, recoveryGate: true };
    }

    if (conversation?.humanAssigned || conversation?.botActive === false) {
      await setInboundMeta('atendimento_human', Boolean(normalizedText));
      await this.logWhatsAppEvent({
        companyId,
        scope: 'atendimento',
        event: 'human_mode_inbound',
        message: 'Mensagem inbound persistida com atendimento humano ativo, sem automacao do bot.',
        conversationId: safeConversationId,
        phone: from,
        messageType: normalizeWhatsAppMessageType(rawPayload?.type),
        flowStep: conversation?.currentStep || ATENDIMENTO_STEP.HUMAN,
        result: 'received',
      });
      return { handled: true, humanMode: true };
    }

    if (!normalizedText && !rawActionId) {
      await setInboundMeta('atendimento_bot', false);
      await this.logWhatsAppEvent({
        companyId,
        scope: 'atendimento',
        event: 'atendimento_inbound_empty_ignored',
        message: 'Inbound sem texto e sem acao interativa foi ignorado para evitar auto-loop.',
        conversationId: safeConversationId,
        phone: from,
        messageType: normalizeWhatsAppMessageType(rawPayload?.type),
        flowStep: conversation?.currentStep || ATENDIMENTO_STEP.WELCOME,
        result: 'ignored',
      });
      return { handled: true, ignoredEmptyInbound: true };
    }

    if (this.containsNegativeOptOut(text)) {
      await setInboundMeta('atendimento_optout', true);
      await this.markAtendimentoNegativeOptOut({
        companyId,
        conversationId: safeConversationId,
        from,
        metadata,
        inboundMessageId,
        detectedText: text,
      });
      return { handled: true, negativeOptOut: true };
    }

    const pendingAgendaChoice = this.parsePendingAgendaChoice(metadata, normalizedText);
    if (pendingAgendaChoice && gate.group) {
      await setInboundMeta('atendimento_bot', false);
      await this.confirmSimpleAgendaChoice({
        companyId,
        conversationId: safeConversationId,
        from,
        company,
        metadata,
        agendaConfig,
        group: gate.group,
        option: pendingAgendaChoice.option,
        intent: pendingAgendaChoice.pending.intent === 'reschedule' ? 'reschedule' : 'schedule',
        appointmentId: pendingAgendaChoice.pending.appointmentId || null,
      });
      return { handled: true, agendaChoice: true };
    }

    if (metadata.hbxCancelAppointmentId && /^(sim|s|confirmo|confirmar|pode cancelar|cancelar)$/i.test(text.trim())) {
      const appointment = await this.findFutureAtendimentoAppointment(companyId, from, gate.group?.id || null);
      if (!appointment || Number(appointment.id) !== Number(metadata.hbxCancelAppointmentId)) {
        await setInboundMeta('atendimento_bot', false);
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from,
          contactId: from,
          body: 'Não encontrei um agendamento futuro ativo para cancelar.',
          messageType: 'text',
          sourceModule: 'atendimento_bot',
          senderType: 'bot',
          flowState: {
            currentFlow: ATENDIMENTO_FLOW_ID,
            currentStep: ATENDIMENTO_STEP.HUMAN,
            botActive: false,
            humanAssigned: true,
            flowResult: null,
            metadata: { ...metadata, hbxCancelAppointmentId: null },
          },
        });
        return { handled: true, cancelAppointment: false };
      }
      await setInboundMeta('atendimento_bot', false);
      await this.cancelFutureAppointment({
        companyId,
        conversationId: safeConversationId,
        from,
        metadata,
        appointment,
      });
      return { handled: true, cancelAppointment: true };
    }

    if (actionId === 'enter_recovery' && recoveryCustomer && tenantContext.recoveryEnabled) {
      await setInboundMeta('atendimento_router', false);
      await this.startRecoveryFromAtendimento({
        companyId,
        conversationId: safeConversationId,
        from,
        customer: recoveryCustomer,
        metadata,
      });
      return { handled: true, delegatedToRecovery: true };
    }

    if (actionId === 'schedule_service') {
      await setInboundMeta('atendimento_bot', false);
      if (!gate.group || !gate.hbxGateContext.canShowAgenda) {
        await this.queueDynamicReceptionMenu({
          companyId,
          conversationId: safeConversationId,
          from,
          company,
          config,
          metadata,
          hbxGateContext: gate.hbxGateContext,
        });
        return { handled: true, agendaUnavailable: true };
      }
      await this.queueSimpleAgendaOptions({
        companyId,
        conversationId: safeConversationId,
        from,
        config,
        agendaConfig,
        group: gate.group,
        metadata,
        intent: 'schedule',
      });
      return { handled: true, agenda: true };
    }

    if (actionId === 'reschedule_service') {
      await setInboundMeta('atendimento_bot', false);
      const appointment = await this.findFutureAtendimentoAppointment(companyId, from, gate.group?.id || null);
      if (!appointment || !gate.group) {
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from,
          contactId: from,
          body: 'Não encontrei um agendamento futuro ativo para reagendar. Posso te mostrar novos horários disponíveis.',
          messageType: 'text',
          sourceModule: 'atendimento_bot',
          senderType: 'bot',
          flowState: {
            currentFlow: ATENDIMENTO_FLOW_ID,
            currentStep: ATENDIMENTO_STEP.MAIN_MENU,
            botActive: true,
            humanAssigned: false,
            flowResult: null,
            metadata,
          },
        });
        if (gate.group && gate.hbxGateContext.canShowAgenda) {
          await this.queueSimpleAgendaOptions({
            companyId,
            conversationId: safeConversationId,
            from,
            config,
            agendaConfig,
            group: gate.group,
            metadata,
            intent: 'schedule',
          });
        }
        return { handled: true, rescheduleUnavailable: true };
      }
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: from,
        body: `Encontrei seu agendamento atual com o Glauco para ${this.formatAgendaDateLabel(appointment.startsAt, appointment.timezone || agendaConfig.timezone)} das ${this.getDatePartsInTimezone(appointment.startsAt, appointment.timezone || agendaConfig.timezone).hour}:${this.getDatePartsInTimezone(appointment.startsAt, appointment.timezone || agendaConfig.timezone).minute} às ${this.getDatePartsInTimezone(appointment.endsAt, appointment.timezone || agendaConfig.timezone).hour}:${this.getDatePartsInTimezone(appointment.endsAt, appointment.timezone || agendaConfig.timezone).minute}.`,
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        flowState: { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: HBX_AGENDA_STEP, botActive: true, humanAssigned: false, flowResult: null },
      });
      await this.queueSimpleAgendaOptions({
        companyId,
        conversationId: safeConversationId,
        from,
        config,
        agendaConfig,
        group: gate.group,
        metadata,
        intent: 'reschedule',
        appointmentId: appointment.id,
      });
      return { handled: true, reschedule: true };
    }

    if (actionId === 'cancel_appointment') {
      await setInboundMeta('atendimento_bot', false);
      const appointment = await this.findFutureAtendimentoAppointment(companyId, from, gate.group?.id || null);
      if (!appointment) {
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from,
          contactId: from,
          body: 'Não encontrei um agendamento futuro ativo para cancelar.',
          messageType: 'text',
          sourceModule: 'atendimento_bot',
          senderType: 'bot',
          flowState: { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.MAIN_MENU, botActive: true, humanAssigned: false, flowResult: null, metadata },
        });
        return { handled: true, cancelAppointment: false };
      }
      const timezone = appointment.timezone || agendaConfig.timezone || 'America/Sao_Paulo';
      const start = this.getDatePartsInTimezone(appointment.startsAt, timezone);
      const end = this.getDatePartsInTimezone(appointment.endsAt, timezone);
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: from,
        body: `Encontrei seu agendamento com o Glauco para ${this.formatAgendaDateLabel(appointment.startsAt, timezone)} das ${start.hour}:${start.minute} às ${end.hour}:${end.minute}. Responda "sim" para confirmar o cancelamento.`,
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: HBX_CANCEL_STEP,
          botActive: true,
          humanAssigned: false,
          flowResult: null,
          metadata: { ...metadata, hbxGateType: 'cancel_appointment', hbxCancelAppointmentId: appointment.id },
        },
      });
      return { handled: true, cancelAppointment: 'confirming' };
    }

    if (actionId === 'talk_owner') {
      await setInboundMeta('atendimento_human', true);
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: from,
        body: 'Perfeito, vou deixar essa conversa para o Glauco responder diretamente.',
        messageType: 'text',
        sourceModule: 'atendimento_human',
        senderType: 'bot',
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.HUMAN,
          botActive: false,
          humanAssigned: true,
          flowResult: null,
          metadata: {
            ...metadata,
            hbxGateType: 'talk_to_owner',
            talkToOwner: true,
          },
        },
      });
      return { handled: true, talkToOwner: true };
    }

    if (actionId === 'supplier_contact') {
      await setInboundMeta('atendimento_human', true);
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: from,
        body: 'Perfeito, vou deixar essa conversa para o Glauco avaliar a parceria.',
        messageType: 'text',
        sourceModule: 'atendimento_human',
        senderType: 'bot',
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.HUMAN,
          botActive: false,
          humanAssigned: true,
          flowResult: null,
          metadata: {
            ...metadata,
            hbxGateType: 'supplier',
            supplierContact: true,
          },
        },
      });
      return { handled: true, supplierContact: true };
    }

    if (actionId === 'technical_support') {
      await setInboundMeta('atendimento_bot', false);
      const supportMetadata = {
        ...metadata,
        hbxGateType: 'technical_support',
        technicalSupport: true,
      };
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: from,
        body: 'Me conte em poucas palavras qual problema técnico você precisa resolver.',
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        variables: supportMetadata,
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.MAIN_MENU,
          botActive: true,
          humanAssigned: false,
          flowResult: null,
          metadata: supportMetadata,
        },
      });
      return { handled: true, technicalSupport: true };
    }

    const vars = this.buildAtendimentoTemplateVars({
      companyName: company.name,
      phone: from,
      metadata,
      recoveryCustomer: null,
    });

    const queueMainMenu = async () =>
      this.queueDynamicReceptionMenu({
        companyId,
        conversationId: safeConversationId,
        from,
        company,
        config,
        metadata,
        hbxGateContext: gate.hbxGateContext,
      });

    if (actionId === 'show_main_menu') {
      await setInboundMeta('atendimento_bot', false);
      await this.queueDynamicReceptionMenu({
        companyId,
        conversationId: safeConversationId,
        from,
        company,
        config,
        metadata,
        hbxGateContext: gate.hbxGateContext,
      });
      return { handled: true };
    }

    if (actionId === 'talk_human' || actionGuide?.kind === 'human_handoff') {
      await setInboundMeta('atendimento_human', true);
      await this.routeAtendimentoToHumanQueue({
        companyId,
        conversationId: safeConversationId,
        from,
        config,
        metadata,
        reason: actionGuide?.title || actionId || 'pedido_humano',
      });
      return { handled: true };
    }

    if (actionId === 'close_topic' || actionGuide?.kind === 'close') {
      await setInboundMeta('atendimento_bot', false);
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: from,
        body: renderTemplate(config.closeTopicMessage, vars, config),
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.CLOSED,
          flowResult: 'manual_closed',
          botActive: false,
          humanAssigned: false,
        },
      });
      return { handled: true };
    }

    const agendaGroupId = parseAtendimentoAgendaActionId(actionId);
    if (agendaGroupId || actionGuide?.kind === 'agenda') {
      const targetGroup =
        (agendaConfig.groups || []).find((group) => group.id === (actionGuide?.agendaGroupId || agendaGroupId)) ||
        null;
      const agendaPreview = this.buildAgendaPreview(targetGroup);
      const agendaVars = this.buildAtendimentoTemplateVars({
        companyName: company.name,
        phone: from,
        metadata,
        agendaGroup: targetGroup,
        agendaPreview,
      });
      await setInboundMeta('atendimento_bot', false);
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: from,
        body: this.renderAtendimentoAgendaMessage(config, targetGroup, agendaVars),
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        variables: agendaVars,
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.AGENDA,
          botActive: true,
          humanAssigned: false,
          flowResult: null,
        },
      });
      if ((config.postActionButtons || []).length) {
        await this.queueAtendimentoButtonPrompt({
          companyId,
          to: from,
          contactId: from,
          conversationId: safeConversationId,
          body: renderTemplate(config.postActionPrompt, agendaVars, config),
          step: ATENDIMENTO_STEP.POST_ACTION,
          buttons: config.postActionButtons,
          variables: agendaVars,
        });
      }
      return { handled: true };
    }

    if (actionGuide?.enabled && actionGuide.kind === 'recovery_handoff' && recoveryCustomer) {
      await setInboundMeta('atendimento_router', false);
      await this.startRecoveryFromAtendimento({
        companyId,
        conversationId: safeConversationId,
        from,
        customer: recoveryCustomer,
        metadata,
      });
      return { handled: true, delegatedToRecovery: true };
    }

    if (actionGuide?.enabled && actionGuide.kind === 'reply') {
      await setInboundMeta('atendimento_bot', false);
      const reply =
        String(actionGuide.responseMessage || '').trim() ||
        String(actionGuide.description || '').trim() ||
        `Recebi sua solicitacao sobre ${actionGuide.title}.`;
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from,
        contactId: from,
        body: renderTemplate(reply, vars, config),
        messageType: 'text',
        sourceModule: 'atendimento_bot',
        senderType: 'bot',
        variables: vars,
        flowState: {
          currentFlow: ATENDIMENTO_FLOW_ID,
          currentStep: ATENDIMENTO_STEP.MAIN_MENU,
          botActive: true,
          humanAssigned: false,
          flowResult: null,
        },
      });
      if ((config.postActionButtons || []).length) {
        await this.queueAtendimentoButtonPrompt({
          companyId,
          to: from,
          contactId: from,
          conversationId: safeConversationId,
          body: renderTemplate(config.postActionPrompt, vars, config),
          step: ATENDIMENTO_STEP.POST_ACTION,
          buttons: config.postActionButtons,
          variables: vars,
        });
      }
      return { handled: true };
    }

    if (actionGuide?.enabled && actionGuide.kind === 'show_menu') {
      await setInboundMeta('atendimento_bot', false);
      await queueMainMenu();
      return { handled: true };
    }

    // ------- Name-collection flow steps -------

    // Step: user is confirming a suggested name (Yes / Inform another)
    if (conversation?.currentStep === ATENDIMENTO_STEP.COLLECTING_NAME_CONFIRM) {
      await setInboundMeta('atendimento_bot', false);
      const rawBtn = this.extractInteractiveReplyId(rawPayload);
      const btnAction = this.fromAtendimentoButtonId(rawBtn);
      const suggestedName = String(metadata?.atendimentoRegSuggestedName || '').trim();
      if (btnAction === 'reg_confirm_yes' && suggestedName) {
        await this.upsertAtendimentoCustomerLocal({
          companyId, phone: from, name: suggestedName,
          registrationStatus: 'confirmed', conversationId: safeConversationId,
          nameSource: 'confirmed_inbound',
          inboundAt: input.timestamp,
          metadata,
        });
        const updatedMetadata: Record<string, unknown> = { ...metadata, cliente: suggestedName };
        delete updatedMetadata.atendimentoRegSuggestedName;
        await this.updateAtendimentoConversationState(
          companyId, safeConversationId,
          { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.MAIN_MENU, botActive: true, humanAssigned: false, flowResult: null },
          updatedMetadata,
        );
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from, contactId: from,
          body: 'Cadastro realizado com sucesso. Podemos continuar seu atendimento.',
          messageType: 'text', sourceModule: 'atendimento_bot', senderType: 'bot',
          flowState: { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.MAIN_MENU, botActive: true, humanAssigned: false, flowResult: null },
        });
        await queueMainMenu();
        return { handled: true };
      } else {
        // User wants to enter a different name
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from, contactId: from,
          body: 'Qual nome devo cadastrar para seu atendimento?',
          messageType: 'text', sourceModule: 'atendimento_bot', senderType: 'bot',
          flowState: { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.COLLECTING_NAME, botActive: true, humanAssigned: false, flowResult: null },
        });
        const metaWithoutSuggested: Record<string, unknown> = { ...metadata };
        delete metaWithoutSuggested.atendimentoRegSuggestedName;
        await this.updateAtendimentoConversationState(
          companyId, safeConversationId,
          { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.COLLECTING_NAME, botActive: true, humanAssigned: false, flowResult: null },
          metaWithoutSuggested,
        );
        return { handled: true };
      }
    }

    // Step: user typed their name as free text
    if (conversation?.currentStep === ATENDIMENTO_STEP.COLLECTING_NAME && normalizedText) {
      await setInboundMeta('atendimento_bot', false);
      const confirmedName = text.trim().slice(0, 120);
      await this.upsertAtendimentoCustomerLocal({
        companyId, phone: from, name: confirmedName,
        registrationStatus: 'confirmed', conversationId: safeConversationId,
        nameSource: 'confirmed_inbound',
        inboundAt: input.timestamp,
        metadata,
      });
      await this.updateAtendimentoConversationState(
        companyId, safeConversationId,
        { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.MAIN_MENU, botActive: true, humanAssigned: false, flowResult: null },
        { ...metadata, cliente: confirmedName },
      );
      await this.conversations.queueOutboundForCompany(companyId, {
        to: from, contactId: from,
        body: 'Cadastro realizado com sucesso. Podemos continuar seu atendimento.',
        messageType: 'text', sourceModule: 'atendimento_bot', senderType: 'bot',
        flowState: { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.MAIN_MENU, botActive: true, humanAssigned: false, flowResult: null },
      });
      await queueMainMenu();
      return { handled: true };
    }

    // Action: quick registration triggered from main menu button
    if (actionId === 'start_quick_registration') {
      await setInboundMeta('atendimento_bot', false);
      const suggestedName = this.extractInboundContactName(rawPayload, metadata);
      if (suggestedName) {
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from, contactId: from,
          body: `Posso cadastrar seu nome como *${suggestedName}*?`,
          messageType: 'interactive',
          interactivePayload: {
            type: 'button',
            body: { text: `Posso cadastrar seu nome como *${suggestedName}*?` },
            footer: { text: 'Atendimento' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: this.toAtendimentoButtonId('reg_confirm_yes'), title: 'Sim, pode salvar' } },
                { type: 'reply', reply: { id: this.toAtendimentoButtonId('reg_confirm_no'), title: 'Informar outro' } },
              ],
            },
          },
          sourceModule: 'atendimento_bot', senderType: 'bot',
          flowState: { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.COLLECTING_NAME_CONFIRM, botActive: true, humanAssigned: false, flowResult: null },
        });
        await this.updateAtendimentoConversationState(
          companyId, safeConversationId,
          { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.COLLECTING_NAME_CONFIRM, botActive: true, humanAssigned: false, flowResult: null },
          { ...metadata, atendimentoRegSuggestedName: suggestedName },
        );
      } else {
        await this.conversations.queueOutboundForCompany(companyId, {
          to: from, contactId: from,
          body: 'Qual nome devo cadastrar para seu atendimento?',
          messageType: 'text', sourceModule: 'atendimento_bot', senderType: 'bot',
          flowState: { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.COLLECTING_NAME, botActive: true, humanAssigned: false, flowResult: null },
        });
        await this.updateAtendimentoConversationState(
          companyId, safeConversationId,
          { currentFlow: ATENDIMENTO_FLOW_ID, currentStep: ATENDIMENTO_STEP.COLLECTING_NAME, botActive: true, humanAssigned: false, flowResult: null },
          metadata,
        );
      }
      return { handled: true };
    }

    // ------- End name-collection flow -------

    await setInboundMeta('atendimento_bot', Boolean(normalizedText));
    await queueMainMenu();
    return { handled: true };
  }

  async enqueueMessage(user: any, payload: { to: string; body?: string; messageType?: string; templateName?: string; templateLanguage?: string; templateComponents?: unknown[] }) {
    const companyId = this.requireCompanyIdFromUser(user);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Company with id ${companyId} not found`);

    const queued = await this.conversations.queueOutboundForCompany(companyId, {
      to: payload.to,
      body: payload.body,
      messageType: payload.messageType,
      templateName: payload.templateName,
      templateLanguage: payload.templateLanguage,
      templateComponents: payload.templateComponents,
      sourceModule: 'atendimento',
    });
    return this.prisma.outboundMessage.findUnique({
      where: { id: queued.outboundMessageId },
      select: {
        id: true,
        companyId: true,
        contactId: true,
        to: true,
        body: true,
        messageType: true,
        templateName: true,
        templateLanguage: true,
        templateComponents: true,
        sourceModule: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastError: true,
        provider: true,
        providerMessageId: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        deliveryStatus: true,
        createdAt: true,
        message: {
          select: {
            id: true,
            conversationId: true,
          },
        },
      },
    });
  }

  async listOutboundMessages(user: any, opts?: { take?: number }) {
    const companyId = this.requireCompanyIdFromUser(user);
    const take = Math.min(Math.max(opts?.take ?? 50, 1), 200);
    return this.prisma.outboundMessage.findMany({
      where: { companyId },
      orderBy: { id: 'desc' },
      take,
      select: {
        id: true,
        companyId: true,
        contactId: true,
        to: true,
        body: true,
        messageType: true,
        templateName: true,
        templateLanguage: true,
        templateComponents: true,
        sourceModule: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastError: true,
        provider: true,
        providerMessageId: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        deliveryStatus: true,
        createdAt: true,
        attempts: { orderBy: { id: 'desc' }, take: 10 },
      },
    });
  }

  async getOutboundMessage(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const msg = await this.prisma.outboundMessage.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        contactId: true,
        to: true,
        body: true,
        messageType: true,
        templateName: true,
        templateLanguage: true,
        templateComponents: true,
        sourceModule: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastError: true,
        provider: true,
        providerMessageId: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        deliveryStatus: true,
        createdAt: true,
        attempts: { orderBy: { id: 'desc' } },
      },
    });
    if (!msg || msg.companyId !== companyId) throw new NotFoundException('Message not found');
    return msg;
  }

  async processDueMessages() {
    const now = new Date();
    const due = await this.prisma.outboundMessage.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { id: 'asc' },
      take: 10,
      select: { id: true },
    });
    for (const msg of due) {
      await this.sendOne(msg.id);
    }
  }

  // INTENTENGINE S4 (docs/PLANEJAMENTOS/INTENTENGINE/INTENTENGINE-sprint4.md): FURO 1 —
  // se o processo morre entre o lock (PENDING→SENDING em sendOne) e o resultado (deploy/
  // restart do `npm run publish` reinicia o backend), a linha ficava SENDING pra sempre.
  // Reaper roda no boot + a cada N ciclos do poll existente (nenhum timer novo). `OutboundMessage`
  // não tem `updatedAt` — o proxy de "há quanto tempo está SENDING" é o `startedAt` do
  // OutboundAttempt mais recente (criado por sendOne logo após o lock, antes de qualquer
  // chamada ao provider).
  //
  // Decisão conservadora (anti-duplicata pro cliente = anti-ban, regra do WHATSAPP.md):
  // - SEM outboundAttempt algum pra essa mensagem → nenhuma tentativa chegou a ser
  //   registrada (o lock não seguiu até criar o attempt) — seguro re-enfileirar:
  //   status=PENDING, nextAttemptAt=now+backoff.
  // - COM outboundAttempt mais recente aberto (finishedAt null) → sendOne SEMPRE cria o
  //   attempt antes de chamar o provider, então "aberto" aqui significa que o processo
  //   morreu em algum ponto entre o disparo e a gravação do resultado — pode TER sido
  //   entregue. Reenviar arriscaria 2ª mensagem pro cliente: marca FAILED com
  //   lastError='stuck_unknown_outcome' e deixa visível pro humano decidir (melhor 1
  //   mensagem perdida visível que 2 enviadas invisíveis).
  private get outboxStuckMinutes(): number {
    const raw = Number(process.env.HBX_OUTBOX_STUCK_MINUTES);
    return Number.isFinite(raw) && raw > 0 ? raw : 10;
  }

  async reapStuckSendingMessages(): Promise<{ requeued: number; failed: number }> {
    const cutoff = new Date(Date.now() - this.outboxStuckMinutes * 60 * 1000);
    const stuck = await this.prisma.outboundMessage.findMany({
      where: { status: 'SENDING' },
      select: {
        id: true,
        companyId: true,
        createdAt: true,
        attemptCount: true,
        attempts: { orderBy: { id: 'desc' }, take: 1 },
        message: { select: { id: true, conversationId: true } },
      },
    });

    let requeued = 0;
    let failed = 0;

    for (const msg of stuck) {
      const lastAttempt = msg.attempts[0];
      // Referência de idade: startedAt do attempt em aberto ou, na ausência de qualquer
      // attempt, o createdAt da própria mensagem (fallback defensivo — não deveria ocorrer
      // no fluxo normal, já que sendOne cria o attempt logo após o lock).
      const referenceAt = lastAttempt?.startedAt ?? msg.createdAt;
      if (referenceAt.getTime() > cutoff.getTime()) {
        continue; // SENDING recente, dentro da janela — pode estar em andamento, não mexe.
      }

      if (lastAttempt && lastAttempt.finishedAt) {
        // Não deveria acontecer (SENDING com o último attempt já finalizado) — outro
        // caminho do código já teria movido o status pra frente. Por segurança, não mexe.
        continue;
      }

      if (!lastAttempt) {
        // Nenhuma tentativa chegou a ser registrada: nada foi de fato disparado ao provider.
        const delayMs = exponentialBackoffMs(msg.attemptCount + 1) + jitterMs(750);
        await this.prisma.outboundMessage.update({
          where: { id: msg.id },
          data: { status: 'PENDING', nextAttemptAt: new Date(Date.now() + delayMs) },
        });
        await this.prisma.companyMessage.updateMany({
          where: { outboundMessageId: msg.id },
          data: { status: 'QUEUED' },
        });
        await this.commercialContactControl.syncAutomationStepFromOutbound({
          companyId: msg.companyId,
          outboundMessageId: msg.id,
          status: 'queued',
        }).catch(() => null);
        if (Number(msg.message?.conversationId || 0) > 0) {
          await this.conversations.dispatchVendasCockpitProjection({
            companyId: msg.companyId,
            conversationId: Number(msg.message?.conversationId),
            event: 'queued',
            messageId: Number(msg.message?.id || 0) || null,
          });
        }
        this.logger.warn(
          `Outbox reaper: messageId=${msg.id} SENDING travada sem nenhum attempt registrado — reenfileirada (PENDING)`,
        );
        requeued += 1;
        continue;
      }

      // Attempt registrado sem finishedAt: desfecho desconhecido (pode ter sido enviada).
      await this.prisma.outboundAttempt.update({
        where: { id: lastAttempt.id },
        data: { finishedAt: new Date(), success: false, error: 'stuck_unknown_outcome' },
      });
      await this.prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { status: 'FAILED', failedAt: new Date(), lastError: 'stuck_unknown_outcome', deliveryStatus: 'failed' },
      });
      await this.prisma.companyMessage.updateMany({
        where: { outboundMessageId: msg.id },
        data: { status: 'FAILED', error: 'stuck_unknown_outcome' },
      });
      await this.commercialContactControl.syncAutomationStepFromOutbound({
        companyId: msg.companyId,
        outboundMessageId: msg.id,
        status: 'failed',
        errorCode: 'stuck_unknown_outcome',
        errorMessage: 'stuck_unknown_outcome',
      }).catch(() => null);
      if (Number(msg.message?.conversationId || 0) > 0) {
        await this.conversations.dispatchVendasCockpitProjection({
          companyId: msg.companyId,
          conversationId: Number(msg.message?.conversationId),
          event: 'failed',
          messageId: Number(msg.message?.id || 0) || null,
        });
      }
      this.logger.warn(
        `Outbox reaper: messageId=${msg.id} SENDING travada com desfecho desconhecido — marcada FAILED (stuck_unknown_outcome) para revisão humana`,
      );
      failed += 1;
    }

    if (requeued > 0 || failed > 0) {
      this.logger.warn(`Outbox reaper: requeued=${requeued} failed=${failed}`);
    }
    return { requeued, failed };
  }

  private parseJsonPayload<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return (parsed ?? fallback) as T;
    } catch {
      return fallback;
    }
  }

  // BUGFIX (09/07, incidente Josefino) — BUG 3: `logistica.service.ts` marcava
  // `Entrega.whatsappStatus='enviado'` no ENFILEIRAMENTO (queueOutboundForCompany
  // só grava o OutboundMessage como PENDING; o envio de verdade é ASSÍNCRONO, aqui
  // em sendOne). Se o envio real FALHASSE depois, a Entrega continuava mentindo
  // 'enviado' para sempre — foi exatamente o caso em prod (OutboundMessage FAILED
  // "Webwhats Bad Request", Entrega.whatsappStatus='enviado').
  //
  // `dispararWhatsappEntregue` já carimba `variables.module='logistica'` +
  // `variables.entregaId` no enqueue (queueOutboundForCompany grava isso no
  // `CompanyMessage.variablesJson`, correlacionado 1:1 com o OutboundMessage via
  // `outboundMessageId`) — `sendOne` já lê esse payload em `dispatchVariables`.
  // Este hook só ESPELHA o desfecho REAL (SENT/FAILED) na Entrega quando o outbound
  // é da logística; para qualquer outro módulo é um no-op imediato (retorna antes
  // de tocar o Prisma). Best-effort PURO: nunca lança — uma falha aqui NUNCA pode
  // afetar o envio/retry do WhatsApp (a razão de existir deste worker).
  private async syncLogisticaEntregaWhatsappOutcome(
    variables: Record<string, any> | null | undefined,
    outcome: 'enviado' | 'falhou',
    motivo?: string | null,
  ): Promise<void> {
    try {
      if (String(variables?.module || '') !== 'logistica') return;
      const entregaId = String(variables?.entregaId || '').trim();
      if (!entregaId) return;
      await this.prisma.entrega.update({
        where: { id: entregaId },
        data: {
          whatsappStatus: outcome,
          whatsappMotivo: outcome === 'falhou' ? String(motivo || 'erro').slice(0, 200) : null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`[messaging] syncLogisticaEntregaWhatsappOutcome falhou: ${String(e?.message || e)}`);
    }
  }

  private normalizeWebwhatsAttachmentKind(value: unknown): 'image' | 'video' | 'document' | 'audio' | 'sticker' | null {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'image') return 'image';
    if (normalized === 'video') return 'video';
    if (normalized === 'document' || normalized === 'file') return 'document';
    if (normalized === 'audio') return 'audio';
    if (normalized === 'sticker') return 'sticker';
    return null;
  }

  private extractWebwhatsAttachment(variables: Record<string, any>) {
    const nested =
      variables?.attachment && typeof variables.attachment === 'object' && !Array.isArray(variables.attachment)
        ? (variables.attachment as Record<string, any>)
        : {};
    const explicitKind = this.normalizeWebwhatsAttachmentKind(
      nested.kind || nested.type || variables?.attachmentKind,
    );
    const mimeType = String(nested.mimeType || variables?.attachmentMimeType || '').trim() || null;
    const fileName = String(nested.fileName || variables?.attachmentFileName || '').trim() || null;
    const url = String(
      nested.url || nested.mediaUrl || nested.attachmentUrl || variables?.attachmentUrl || '',
    ).trim();
    const previewUrl = String(nested.previewUrl || variables?.attachmentPreviewUrl || '').trim() || null;

    let inferredKind = explicitKind;
    const sourceForInference = `${mimeType || ''} ${fileName || ''} ${url}`.toLowerCase();
    if (!inferredKind) {
      if (mimeType === 'image/webp' || /\.webp(\?|$)/.test(sourceForInference)) {
        inferredKind = 'sticker';
      } else if (mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|bmp|svg)(\?|$)/.test(sourceForInference)) {
        inferredKind = 'image';
      } else if (mimeType?.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/.test(sourceForInference)) {
        inferredKind = 'video';
      } else if (mimeType?.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|opus|aac|webm)(\?|$)/.test(sourceForInference)) {
        inferredKind = 'audio';
      } else if (url || fileName) {
        inferredKind = 'document';
      }
    }

    if (!inferredKind || !url) return null;
    return {
      kind: inferredKind,
      url,
      previewUrl,
      mimeType,
      fileName,
    };
  }

  // BRIDGE DO "RESPONDER CITANDO" (02-QUOTED-BRIDGE): o inbox.service ja resolveu { key, message }
  // e gravou em variables.quoted (mesmo lugar de onde extractWebwhatsAttachment le o anexo) — aqui
  // so valida o formato minimo exigido pelo motor (key.id obrigatorio, message objeto) antes de
  // repassar pro sendText/sendMedia da bridge.
  private extractWebwhatsQuoted(variables: Record<string, any>): WebwhatsQuotedInput | null {
    const quoted = variables?.quoted;
    if (!quoted || typeof quoted !== 'object' || Array.isArray(quoted)) return null;
    const key = (quoted as any).key;
    const message = (quoted as any).message;
    const keyId = String(key?.id || '').trim();
    if (!keyId || !message || typeof message !== 'object' || Array.isArray(message)) return null;
    return {
      key: {
        id: keyId,
        ...(key?.remoteJid ? { remoteJid: String(key.remoteJid) } : {}),
        ...(key?.fromMe !== undefined && key?.fromMe !== null ? { fromMe: Boolean(key.fromMe) } : {}),
        ...(key?.participant ? { participant: String(key.participant) } : {}),
      },
      message,
    };
  }

  private stripAttachmentReferenceFromBody(
    bodyRaw: string | null | undefined,
    attachment: { url: string; previewUrl?: string | null },
  ) {
    const body = String(bodyRaw || '').trim();
    if (!body) return '';

    const referenceLines = new Set(
      [attachment.url, attachment.previewUrl]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    );
    if (!referenceLines.size) return body;

    const filteredLines = body
      .split(/\r?\n/)
      .filter((line) => !referenceLines.has(String(line || '').trim()));

    return filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // GATEWAY-WA S3: idade da sessão (connectedAt) alimenta a curva de warm-up do freio. Sem
  // sessionId (automação/legado) devolve null → o freio trata como chip MADURO. Best-effort:
  // erro de banco não trava o envio (null = maduro).
  private async resolveSendThrottleConnectedAt(sessionId: string | null | undefined): Promise<Date | null> {
    const id = String(sessionId || '').trim();
    if (!id) return null;
    try {
      const session = await this.prisma.whatsAppConnectionSession.findUnique({
        where: { id },
        select: { connectedAt: true },
      });
      return session?.connectedAt ?? null;
    } catch {
      return null;
    }
  }

  // Cobra a ação pública "Automação" para mensagens automáticas confirmadas.
  // enviada com sucesso. Allowlist EXPLÍCITA por sourceModule — humano (atendimento_human/
  // manual, respostas do funil 'vendas', etc.) NUNCA entra; fora da lista = não cobra
  // (fail-safe da regra "humano não conta"). Idempotente por outboundMessage.id (retry do
  // dispatch não conta 2x). A cobrança é idempotente pela mensagem de saída.
  private isCreditAutomationMessage(msg: {
    sourceModule: string | null;
    message?: { senderType?: string | null } | null;
  }): boolean {
    // Guarda DURA da regra "humano não conta" (revisão 10/07): o recovery rotula mensagem de
    // OPERADOR como sourceModule `hbx_recovery_human` — o prefixo sozinho pegaria humano.
    // senderType 'human' e sufixos _human/_manual saem SEMPRE, antes da allowlist.
    const senderType = String(msg?.message?.senderType || '').trim().toLowerCase();
    if (senderType === 'human') return false;
    const source = String(msg?.sourceModule || '').trim().toLowerCase();
    if (source.endsWith('_human') || source.endsWith('_manual')) return false;
    return (
      source === 'vendas_prospeccao_bot' ||
      source === 'vendas_prospeccao_email_bot' ||
      source === 'prospeccao_bot' ||
      source === 'atendimento_bot' ||
      source === 'conversation_assistant' ||
      source.startsWith('hbx_recovery')
    );
  }

  private async sendOne(messageId: number) {
    // lock: flip to SENDING only if still PENDING
    const locked = await this.prisma.outboundMessage.updateMany({
      where: { id: messageId, status: 'PENDING' },
      data: { status: 'SENDING' },
    });
    if (locked.count === 0) return;

    await this.prisma.companyMessage.updateMany({ where: { outboundMessageId: messageId }, data: { status: 'SENDING' } });
    await this.commercialContactControl.syncAutomationStepFromOutbound({
      companyId: Number((await this.prisma.outboundMessage.findUnique({ where: { id: messageId }, select: { companyId: true } }))?.companyId || 0),
      outboundMessageId: messageId,
      status: 'dispatching',
    }).catch(() => null);

    const supportsOutboundEndpointColumn = await this.supportsOutboundEndpointColumn();
    const msg = await this.prisma.outboundMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        companyId: true,
        contactId: true,
        to: true,
        body: true,
        messageType: true,
        templateName: true,
        templateLanguage: true,
        templateComponents: true,
        sourceModule: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastError: true,
        provider: true,
        providerMessageId: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        deliveryStatus: true,
        createdAt: true,
        message: {
          select: {
            id: true,
            conversationId: true,
            senderType: true,
            variablesJson: true,
            // POR USUÁRIO: a sessão/instância DONA desta saída — o envio fala com o número
            // certo (do vendedor/admin), não com o ponteiro genérico da empresa.
            whatsappConnectionSessionId: true,
            sourceTenantKey: true,
          },
        },
      },
    });
    if (!msg) return;
    const conversationId = Number(msg.message?.conversationId || 0) || null;
    const company = await this.findCompanyWithOptionalEndpoints(msg.companyId);
    if (!company) return;

    const attemptNo = msg.attemptCount + 1;
    const attempt = await this.prisma.outboundAttempt.create({
      data: { messageId: msg.id, attemptNo, startedAt: new Date(), success: false },
    });

    const startedAtMs = Date.now();
    if (conversationId) {
      await this.conversations.dispatchVendasCockpitProjection?.({
        companyId: msg.companyId,
        conversationId,
        event: 'sending',
        messageId: Number(msg.message?.id || 0) || null,
      });
    }

    let automaticReservation: { allowed: boolean; release?: () => Promise<void> } | null = null;
    try {
      let messageType = String(msg.messageType || 'text').toLowerCase();
      let dispatchBody = String(msg.body || '');
      // POR USUÁRIO: o envio mira a SESSÃO dona desta mensagem (gravada na criação do
      // companyMessage), não o ponteiro genérico da empresa — senão a resposta de um vendedor
      // sairia pelo número de outro. Sem sessão (automação/legado) cai no ponteiro da empresa.
      const webwhatsSelector = {
        sessionId: msg.message?.whatsappConnectionSessionId ?? null,
        tenantKey: msg.message?.sourceTenantKey ?? null,
      };
      const dispatchVariables = this.parseJsonPayload<Record<string, any>>(msg.message?.variablesJson, {});
      const commercialDispatchDecision = await this.commercialContactControl.validateBeforeCommercialDispatch({
        companyId: msg.companyId,
        conversationId,
        sourceModule: msg.sourceModule,
        senderType: msg.message?.senderType,
        variablesJson: msg.message?.variablesJson,
        outboundCreatedAt: msg.createdAt,
      });
      if (commercialDispatchDecision.allowed === false) {
        await this.cancelOutboundBeforeDispatch({
          outboundMessageId: msg.id,
          attemptId: attempt.id,
          companyId: msg.companyId,
          conversationId,
          to: msg.to,
          messageType,
          sourceModule: msg.sourceModule,
          reason: commercialDispatchDecision.reason,
          companyMessageId: Number(msg.message?.id || 0) || null,
        });
        this.logger.warn(
          `WhatsApp commercial send suppressed messageId=${msg.id} reason=${commercialDispatchDecision.reason}`,
        );
        return;
      }
      const suppressionReason = await this.resolveDispatchBotSuppression({
        companyId: msg.companyId,
        conversationId,
        to: msg.to,
        sourceModule: msg.sourceModule,
        senderType: msg.message?.senderType,
      });
      if (suppressionReason) {
        await this.cancelOutboundBeforeDispatch({
          outboundMessageId: msg.id,
          attemptId: attempt.id,
          companyId: msg.companyId,
          conversationId,
          to: msg.to,
          messageType,
          sourceModule: msg.sourceModule,
          reason: suppressionReason,
          companyMessageId: Number(msg.message?.id || 0) || null,
        });
        this.logger.warn(`WhatsApp automatic send suppressed messageId=${msg.id} reason=${suppressionReason}`);
        return;
      }

      // GATEWAY-WA S3: FREIO DE ENVIO POR CHIP. Só age com HBX_WA_SEND_THROTTLE_ENABLED=true
      // (default OFF → decision.allow sempre true = comportamento atual). Envio ligado a conversa
      // com inbound recente é ISENTO (responder quem te chamou é seguro). Estouro do teto REAGENDA
      // (volta a PENDING com nextAttemptAt futuro) — NUNCA descarta. Roda antes de qualquer
      // despacho e depois da supressão (não queima cota em mensagem que seria cancelada).
      const throttleDecision = await this.waSendThrottle.evaluate({
        companyId: msg.companyId,
        sessionId: webwhatsSelector.sessionId,
        tenantKey: webwhatsSelector.tenantKey,
        connectedAt: await this.resolveSendThrottleConnectedAt(webwhatsSelector.sessionId),
        conversationId,
      });
      if (throttleDecision.allow === false) {
        const next = new Date(Date.now() + throttleDecision.retryAfterMs);
        // Fecha o attempt SEM marcar sucesso e SEM incrementar attemptCount (segurar não é
        // tentativa de entrega — não pode empurrar a mensagem para FAILED por maxAttempts).
        await this.prisma.outboundAttempt.update({
          where: { id: attempt.id },
          data: { finishedAt: new Date(), success: false, error: `throttled:${throttleDecision.reason}` },
        });
        await this.prisma.outboundMessage.update({
          where: { id: msg.id },
          data: { status: 'PENDING', nextAttemptAt: next },
        });
        await this.prisma.companyMessage.updateMany({
          where: { outboundMessageId: msg.id },
          data: { status: 'QUEUED' },
        });
        await this.commercialContactControl.syncAutomationStepFromOutbound({
          companyId: msg.companyId,
          outboundMessageId: msg.id,
          status: 'queued',
        }).catch(() => null);
        if (conversationId) {
          await this.conversations.dispatchVendasCockpitProjection?.({
            companyId: msg.companyId,
            conversationId,
            event: 'queued',
            messageId: Number(msg.message?.id || 0) || null,
          });
        }
        await this.logWhatsAppEvent({
          companyId: msg.companyId,
          scope: 'dispatch',
          event: 'outbound_throttled',
          level: 'WARN',
          message: `Envio segurado pelo freio de chip (${throttleDecision.reason})`,
          conversationId,
          phone: msg.to,
          messageType: msg.messageType || 'text',
          result: 'pending',
          reason: throttleDecision.reason,
          extra: {
            outboundMessageId: msg.id,
            sessionId: webwhatsSelector.sessionId,
            tenantKey: webwhatsSelector.tenantKey,
            retryInSeconds: Math.round(throttleDecision.retryAfterMs / 1000),
            nextAttemptAt: next.toISOString(),
          },
        });
        this.logger.warn(
          `WhatsApp send THROTTLED messageId=${msg.id} reason=${throttleDecision.reason} retryIn=${Math.round(throttleDecision.retryAfterMs / 1000)}s`,
        );
        return;
      }

      if (this.creditActionUsage && this.isCreditAutomationMessage(msg)) {
        automaticReservation = await this.creditActionUsage.authorize({
          companyId: msg.companyId,
          actionKey: 'whatsapp_auto_send',
          refId: `wa:${msg.id}`,
          metadata: { channel: 'whatsapp', sourceModule: msg.sourceModule || null },
        });
        if (!automaticReservation.allowed) {
          await this.cancelOutboundBeforeDispatch({
            outboundMessageId: msg.id,
            attemptId: attempt.id,
            companyId: msg.companyId,
            conversationId,
            to: msg.to,
            messageType: String(msg.messageType || 'text'),
            sourceModule: msg.sourceModule,
            reason: 'credit_unavailable',
            companyMessageId: Number(msg.message?.id || 0) || null,
          });
          return;
        }
      }

      const attachment = this.extractWebwhatsAttachment(dispatchVariables);
      const quoted = this.extractWebwhatsQuoted(dispatchVariables);
      const providerCapabilities = resolveProviderCapabilitiesFromCompany(company);
      // POR USUÁRIO: webwhats está disponível se o status da empresa diz CONNECTED (legado/admin)
      // OU se há sessão viva p/ ESTE selector (per-user — connect per-user não seta o status
      // da empresa, então o gate por status sozinho barraria o envio do vendedor).
      const webwhatsAvailable =
        providerCapabilities.provider === 'evolution' &&
        (
          this.webwhatsBridge.isDispatchAvailable((company as any)?.whatsappModalStatus) ||
          (await this.webwhatsBridge.hasOperationalSession(msg.companyId, webwhatsSelector))
        );
      if (messageType === 'template' && !providerCapabilities.canUseTemplates) {
        throw new Error(META_TEMPLATES_REQUIRED_MESSAGE);
      }
      if (messageType === 'interactive' && !providerCapabilities.canUseOfficialButtons) {
        const interactivePayload = this.parseJsonPayload<Record<string, any>>(msg.templateComponents, {});
        dispatchBody = this.buildInteractiveFallbackText(interactivePayload, dispatchBody);
        messageType = 'text';
      }

      const markWebwhatsSent = async (input: {
        requestBody: Record<string, unknown>;
        response: any;
        providerMessageId: string | null;
      }) => {
        await this.prisma.outboundAttempt.update({
          where: { id: attempt.id },
          data: {
            finishedAt: new Date(),
            success: true,
            httpStatus: 200,
            requestBody: JSON.stringify(input.requestBody),
            responseBody: JSON.stringify(input.response ?? null),
          },
        });
        await this.prisma.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            attemptCount: attemptNo,
            lastError: null,
            provider: 'WEBWHATS',
            providerMessageId: input.providerMessageId || undefined,
            deliveryStatus: 'sent',
          },
        });
        await this.prisma.companyMessage.updateMany({
          where: { outboundMessageId: msg.id },
          data: {
            status: 'SENT',
            provider: 'WEBWHATS',
            providerMessageId: input.providerMessageId || undefined,
            error: null,
          },
        });
        await this.commercialContactControl.syncAutomationStepFromOutbound({
          companyId: msg.companyId,
          outboundMessageId: msg.id,
          status: 'succeeded',
        }).catch(() => null);
        await this.updateRecoveryTemplateLastContact(msg, 'sent', new Date());
        await this.syncLogisticaEntregaWhatsappOutcome(dispatchVariables, 'enviado');
        await this.logWhatsAppEvent({
          companyId: msg.companyId,
          scope: 'dispatch',
          event: 'outbound_sent',
          message: `Mensagem enviada para ${msg.to} via Webwhats`,
          conversationId,
          phone: msg.to,
          messageType: attachment?.kind || msg.messageType || 'text',
          result: 'sent',
          extra: {
            outboundMessageId: msg.id,
            provider: 'WEBWHATS',
            providerMessageId: input.providerMessageId || null,
            attemptNo,
            sourceModule: msg.sourceModule || null,
            requestBody: input.requestBody,
            providerResponse: input.response ?? null,
          },
        });
        if (conversationId) {
          await this.conversations.dispatchVendasCockpitProjection?.({
            companyId: msg.companyId,
            conversationId,
            event: 'sent',
            messageId: Number(msg.message?.id || 0) || null,
          });
        }
      };

      if (attachment) {
        if (!webwhatsAvailable) {
          throw new Error('Envio de midia requer WhatsApp modal conectado.');
        }
        try {
          const caption = this.stripAttachmentReferenceFromBody(msg.body, attachment) || undefined;
          const isVoiceAudio = attachment.kind === 'audio';
          const webwhatsResult = isVoiceAudio
            ? await this.webwhatsBridge.sendWhatsAppAudio(msg.companyId, {
                to: msg.to,
                conversationId,
                audio: attachment.url,
              }, webwhatsSelector)
            : await this.webwhatsBridge.sendMedia(msg.companyId, {
                to: msg.to,
                conversationId,
                mediaType: attachment.kind,
                media: attachment.url,
                caption,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                quoted,
              }, webwhatsSelector);
          await markWebwhatsSent({
            requestBody: {
              number: webwhatsResult.target,
              mediatype: isVoiceAudio ? 'voice' : attachment.kind,
              mediaSource: attachment.url,
              caption: isVoiceAudio ? null : caption || null,
              fileName: attachment.fileName || null,
              mimetype: attachment.mimeType || null,
            },
            response: webwhatsResult.response,
            providerMessageId: webwhatsResult.providerMessageId,
          });
          this.logger.log(
            `Webwhats sent ${isVoiceAudio ? 'voice audio' : 'media'} messageId=${msg.id} providerMessageId=${webwhatsResult.providerMessageId || '(missing)'} in ${Date.now() - startedAtMs}ms`,
          );
          return;
        } catch (webwhatsError) {
          this.logger.warn(
            `Webwhats media send falhou para messageId=${msg.id}: ${this.normalizeProviderDispatchError(webwhatsError, 'Falha ao enviar midia via Webwhats')}`,
          );
          throw webwhatsError;
        }
      }

      if (messageType === 'text' && webwhatsAvailable) {
        try {
          // PR05072026 (timing humano): quando o remetente calculou o "digitando"
          // proporcional ao tamanho da resposta (bot de prospecção pós-classificação
          // IA), o valor já clampado nos knobs da campanha vem em `variables.typingDelayMs`
          // — este worker só repassa ao motor. Ausente/0 = comportamento atual (sem delay).
          const typingDelayMs = Number(dispatchVariables?.typingDelayMs);
          const webwhatsResult = await this.webwhatsBridge.sendText(msg.companyId, {
            to: msg.to,
            text: dispatchBody,
            conversationId,
            quoted,
            ...(Number.isFinite(typingDelayMs) && typingDelayMs > 0 ? { typingDelayMs } : {}),
          }, webwhatsSelector);
          await markWebwhatsSent({
            requestBody: { number: webwhatsResult.target, text: dispatchBody },
            response: webwhatsResult.response,
            providerMessageId: webwhatsResult.providerMessageId,
          });
          this.logger.log(
            `Webwhats sent messageId=${msg.id} providerMessageId=${webwhatsResult.providerMessageId || '(missing)'} in ${Date.now() - startedAtMs}ms`,
          );
          return;
        } catch (webwhatsError) {
          this.logger.warn(
            `Webwhats send fallback acionado para messageId=${msg.id}: ${this.normalizeProviderDispatchError(webwhatsError, 'Falha ao enviar via Webwhats')}`,
          );
          if (!this.enabled || providerCapabilities.provider === 'evolution') {
            throw webwhatsError;
          }
        }
      }

      if (messageType === 'interactive' && webwhatsAvailable) {
        try {
          const interactivePayload = this.parseJsonPayload<Record<string, any>>(msg.templateComponents, {});
          const webwhatsResult = await this.webwhatsBridge.sendInteractive(msg.companyId, {
            to: msg.to,
            conversationId,
            payload: interactivePayload,
          }, webwhatsSelector);
          await markWebwhatsSent({
            requestBody: webwhatsResult.requestBody || { number: webwhatsResult.target, interactive: interactivePayload },
            response: webwhatsResult.response,
            providerMessageId: webwhatsResult.providerMessageId,
          });
          this.logger.log(
            `Webwhats sent interactive messageId=${msg.id} providerMessageId=${webwhatsResult.providerMessageId || '(missing)'} in ${Date.now() - startedAtMs}ms`,
          );
          return;
        } catch (webwhatsError) {
          this.logger.warn(
            `Webwhats interactive send fallback acionado para messageId=${msg.id}: ${this.normalizeProviderDispatchError(webwhatsError, 'Falha ao enviar interacao via Webwhats')}`,
          );
          if (!this.enabled || providerCapabilities.provider === 'evolution') {
            throw webwhatsError;
          }
        }
      }

      if (providerCapabilities.provider === 'evolution') {
        throw new Error('WEBWHATS_NOT_CONNECTED');
      }

      if (!this.enabled) {
        await automaticReservation?.release?.().catch(() => undefined);
        automaticReservation = null;
        await this.prisma.outboundAttempt.update({
          where: { id: attempt.id },
          data: {
            finishedAt: new Date(),
            success: true,
            httpStatus: 200,
            requestBody: JSON.stringify({ dryRun: true, to: msg.to, body: dispatchBody, messageType }),
            responseBody: 'WHATSAPP_ENABLED=false (dry-run)',
          },
        });
        await this.prisma.outboundMessage.update({
          where: { id: msg.id },
          data: { status: 'SENT', sentAt: new Date(), attemptCount: attemptNo, lastError: null, deliveryStatus: 'sent' },
        });
        await this.prisma.companyMessage.updateMany({ where: { outboundMessageId: msg.id }, data: { status: 'SENT', error: null } });
        await this.commercialContactControl.syncAutomationStepFromOutbound({
          companyId: msg.companyId,
          outboundMessageId: msg.id,
          status: 'succeeded',
        }).catch(() => null);
        await this.updateRecoveryTemplateLastContact(msg, 'sent', new Date());
        await this.syncLogisticaEntregaWhatsappOutcome(dispatchVariables, 'enviado');
        if (conversationId) {
          await this.conversations.dispatchVendasCockpitProjection?.({
            companyId: msg.companyId,
            conversationId,
            event: 'sent',
            messageId: Number(msg.message?.id || 0) || null,
          });
        }
        return;
      }

      if (attachment) {
        throw new Error('Envio de midia requer Webwhats ativo; fallback pela Cloud API ainda nao esta implementado.');
      }

      if (messageType !== 'text' && messageType !== 'template' && messageType !== 'interactive') {
        throw new Error(`Tipo de mensagem outbound nao suportado: ${messageType}`);
      }

      const creds = resolveWhatsAppCredentials(company, {
        endpointId: supportsOutboundEndpointColumn
          ? String((msg as any).whatsappEndpointId || '').trim() || undefined
          : undefined,
        sourceModule: String(msg.sourceModule || '').trim().toLowerCase() || undefined,
      });
      if (!creds.phoneNumberId || !creds.accessToken) {
        throw new Error('WHATSAPP_COMPANY_CREDENTIALS_MISSING');
      }

      const endpoint = `${this.cloudApiBaseUrl}/${encodeURIComponent(creds.phoneNumberId)}/messages`;
      const requestBody: any = {
        messaging_product: 'whatsapp',
        to: msg.to,
      };
      if (messageType === 'template') {
        requestBody.type = 'template';
        requestBody.template = {
          name: String(msg.templateName || '').trim(),
          language: { code: String(msg.templateLanguage || 'pt_BR').trim() || 'pt_BR' },
        };
        const components = this.parseJsonPayload<any[]>(msg.templateComponents, []);
        if (components.length) requestBody.template.components = components;
      } else if (messageType === 'interactive') {
        requestBody.type = 'interactive';
        const interactivePayload = this.parseJsonPayload<Record<string, any>>(msg.templateComponents, {});
        requestBody.interactive = interactivePayload;
      } else {
        requestBody.type = 'text';
        requestBody.text = { body: dispatchBody };
      }

      this.logger.log(`WhatsApp send attempt ${attemptNo} -> messageId=${msg.id} to=${msg.to}`);

      const res = await axios.post(endpoint, requestBody, {
        timeout: 20000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
        },
        validateStatus: () => true,
      });

      const ok = res.status >= 200 && res.status < 300;
      const responseText = JSON.stringify(res.data ?? null);
      await this.prisma.outboundAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          success: ok,
          httpStatus: res.status,
          requestBody: JSON.stringify(requestBody),
          responseBody: responseText,
        },
      });

      if (ok) {
        const providerMessageId = String(res.data?.messages?.[0]?.id ?? '');
        await this.prisma.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            attemptCount: attemptNo,
            lastError: null,
            provider: 'WHATSAPP_CLOUD',
            providerMessageId: providerMessageId || undefined,
            deliveryStatus: 'sent',
          },
        });
        await this.prisma.companyMessage.updateMany({
          where: { outboundMessageId: msg.id },
          data: { status: 'SENT', providerMessageId: providerMessageId || undefined, error: null },
        });
        await this.commercialContactControl.syncAutomationStepFromOutbound({
          companyId: msg.companyId,
          outboundMessageId: msg.id,
          status: 'succeeded',
        }).catch(() => null);
        await this.updateRecoveryTemplateLastContact(msg, 'sent', new Date());
        await this.syncLogisticaEntregaWhatsappOutcome(dispatchVariables, 'enviado');
        await this.logWhatsAppEvent({
          companyId: msg.companyId,
          scope: 'dispatch',
          event: 'outbound_sent',
          message: `Mensagem enviada para ${msg.to}`,
          conversationId: null,
          phone: msg.to,
          messageType: msg.messageType || 'text',
          result: 'sent',
          extra: {
            outboundMessageId: msg.id,
            providerMessageId: providerMessageId || null,
            attemptNo,
            sourceModule: msg.sourceModule || null,
            requestBody,
            providerResponse: res.data ?? null,
          },
        });
        if (conversationId) {
          await this.conversations.dispatchVendasCockpitProjection?.({
            companyId: msg.companyId,
            conversationId,
            event: 'sent',
            messageId: Number(msg.message?.id || 0) || null,
          });
        }
        this.logger.log(
          `WhatsApp sent messageId=${msg.id} providerMessageId=${providerMessageId || '(missing)'} in ${Date.now() - startedAtMs}ms`,
        );
        return;
      }

      const errorMessage = this.normalizeProviderDispatchError(
        { response: { status: res.status, data: res.data } },
        'Falha ao enviar mensagem para o WhatsApp',
      );
      const retryAfterHeader = (res.headers?.['retry-after'] ?? res.headers?.['Retry-After']) as any;
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;

      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable) {
        const providerError = `${errorMessage} body=${responseText}`;
        await this.prisma.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            attemptCount: attemptNo,
            lastError: providerError,
            deliveryStatus: 'failed',
          },
        });
        await this.prisma.companyMessage.updateMany({ where: { outboundMessageId: msg.id }, data: { status: 'FAILED', error: providerError } });
        await this.commercialContactControl.syncAutomationStepFromOutbound({
          companyId: msg.companyId,
          outboundMessageId: msg.id,
          status: 'failed',
          errorCode: `provider_http_${res.status}`,
          errorMessage: providerError,
        }).catch(() => null);
        await this.updateRecoveryTemplateLastContact(msg, 'failed', new Date());
        await this.syncLogisticaEntregaWhatsappOutcome(dispatchVariables, 'falhou', providerError);
        await automaticReservation?.release?.().catch(() => undefined);
        automaticReservation = null;
        await this.logWhatsAppEvent({
          companyId: msg.companyId,
          scope: 'dispatch',
          event: 'outbound_failed',
          level: 'ERROR',
          message: `Falha sem retry para ${msg.to}`,
          phone: msg.to,
          messageType: msg.messageType || 'text',
          result: 'failed',
          reason: errorMessage,
          extra: {
            outboundMessageId: msg.id,
            attemptNo,
            httpStatus: res.status,
            providerBody: res.data ?? null,
            sourceModule: msg.sourceModule || null,
            requestBody,
          },
        });
        if (conversationId) {
          await this.conversations.dispatchVendasCockpitProjection?.({
            companyId: msg.companyId,
            conversationId,
            event: 'failed',
            messageId: Number(msg.message?.id || 0) || null,
          });
        }
        return;
      }

      // retryable path
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? clamp(retryAfterSeconds * 1000, 1000, 60 * 60 * 1000)
        : exponentialBackoffMs(attemptNo) + jitterMs(750);
      throw Object.assign(new Error(errorMessage), { retryDelayMs: delayMs, providerBody: responseText });
    } catch (e: any) {
      const errorMessage = this.normalizeProviderDispatchError(e, 'Falha ao enviar mensagem para o WhatsApp');

      await this.prisma.outboundAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: new Date(),
          success: false,
          error: errorMessage,
          responseBody: e?.providerBody ?? undefined,
        },
      });

      const updated = await this.prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { attemptCount: attemptNo, lastError: errorMessage },
      });

      if (attemptNo >= updated.maxAttempts) {
        await this.prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', failedAt: new Date(), deliveryStatus: 'failed' } });
        await this.prisma.companyMessage.updateMany({ where: { outboundMessageId: msg.id }, data: { status: 'FAILED', error: errorMessage } });
        await this.commercialContactControl.syncAutomationStepFromOutbound({
          companyId: msg.companyId,
          outboundMessageId: msg.id,
          status: 'failed',
          errorCode: 'provider_retries_exhausted',
          errorMessage,
        }).catch(() => null);
        await this.updateRecoveryTemplateLastContact(msg, 'failed', new Date());
        // `dispatchVariables` foi declarado dentro do `try` (fora de escopo aqui) —
        // relê o mesmo payload já carregado em `msg.message.variablesJson`.
        await this.syncLogisticaEntregaWhatsappOutcome(
          this.parseJsonPayload<Record<string, any>>(msg.message?.variablesJson, {}),
          'falhou',
          errorMessage,
        );
        await automaticReservation?.release?.().catch(() => undefined);
        automaticReservation = null;
        await this.logWhatsAppEvent({
          companyId: msg.companyId,
          scope: 'dispatch',
          event: 'outbound_failed',
          level: 'ERROR',
          message: `Falha apos retries para ${msg.to}`,
          phone: msg.to,
          messageType: msg.messageType || 'text',
          result: 'failed',
          reason: errorMessage,
          extra: {
            outboundMessageId: msg.id,
            attemptNo,
            sourceModule: msg.sourceModule || null,
          },
        });
        if (conversationId) {
          await this.conversations.dispatchVendasCockpitProjection?.({
            companyId: msg.companyId,
            conversationId,
            event: 'failed',
            messageId: Number(msg.message?.id || 0) || null,
          });
        }
        this.logger.warn(`WhatsApp FAILED messageId=${msg.id} after ${attemptNo} attempts: ${errorMessage}`);
        return;
      }

      const delayMs = Number(e?.retryDelayMs) > 0 ? Number(e.retryDelayMs) : exponentialBackoffMs(attemptNo) + jitterMs(750);
      const next = new Date(Date.now() + delayMs);
      await this.prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'PENDING', nextAttemptAt: next } });
      await this.prisma.companyMessage.updateMany({ where: { outboundMessageId: msg.id }, data: { status: 'QUEUED', error: errorMessage } });
      await this.commercialContactControl.syncAutomationStepFromOutbound({
        companyId: msg.companyId,
        outboundMessageId: msg.id,
        status: 'queued',
        errorCode: 'provider_retry_scheduled',
        errorMessage,
      }).catch(() => null);
      if (conversationId) {
        await this.conversations.dispatchVendasCockpitProjection?.({
          companyId: msg.companyId,
          conversationId,
          event: 'queued',
          messageId: Number(msg.message?.id || 0) || null,
        });
      }
      await this.logWhatsAppEvent({
        companyId: msg.companyId,
        scope: 'dispatch',
        event: 'outbound_retry_scheduled',
        level: 'WARN',
        message: `Retry agendado para ${msg.to}`,
        phone: msg.to,
        messageType: msg.messageType || 'text',
        result: 'pending',
        reason: errorMessage,
        extra: {
          outboundMessageId: msg.id,
          attemptNo,
          retryInSeconds: Math.round(delayMs / 1000),
          nextAttemptAt: next.toISOString(),
        },
      });
      this.logger.warn(`WhatsApp retry scheduled messageId=${msg.id} in ${Math.round(delayMs / 1000)}s: ${errorMessage}`);
    }
  }

  async handleWebwhatsWebhookEvent(
    payload: any,
    opts: {
      rawBody?: Buffer;
      headers?: Record<string, any>;
      query?: Record<string, any>;
    } = {},
  ) {
    const eventName = this.extractWebwhatsEventName(payload);
    const secretOk = this.verifyWebwhatsWebhookSecret({
      headers: opts.headers,
      query: opts.query,
      payload,
    });
    const parsedCompanyId = this.findWebwhatsCompanyId(payload, opts.query);

    if (!secretOk) {
      await this.prisma.whatsAppWebhookEvent.create({
        data: {
          kind: 'webwhats_rejected',
          companyId: parsedCompanyId || undefined,
          payload: this.stringifySafeWebhookPayload({
            eventName,
            reason: 'invalid_secret',
            payload,
          }),
        },
      });
      this.logger.warn(`Webwhats webhook rejected by secret event=${eventName}`);
      return { ok: false, discarded: true, reason: 'invalid_secret' };
    }

    // GATEWAY-WA S2: o MIOLO (tudo APÓS a verificação de secret) vive em `processWebwhatsEventCore`
    // para ser reaproveitado por DOIS caminhos: o webhook HTTP (aqui) e o consumer da outbox
    // durável (`WebwhatsOutboxConsumerService`). Refactor PURO — o webhook segue idêntico: só
    // valida o secret e delega. A idempotência de ingestão (upsert por providerMessageId) absorve
    // a dupla entrega (evento chega pelo webhook E pela outbox durante a transição).
    return this.processWebwhatsEventCore(payload, { query: opts.query });
  }

  /**
   * GATEWAY-WA S2 — miolo do processamento de um evento do motor Webwhats, chamável tanto pelo
   * webhook HTTP (`handleWebwhatsWebhookEvent`, após validar o secret) quanto pelo consumer da
   * outbox durável. COMPORTAMENTO IDÊNTICO ao fluxo original do webhook: resolver empresa →
   * tenantKey → reconciliar conexão → aplicar statuses → ingerir mensagens → realtime → bot.
   *
   * `opts.tenantKeyOverride`: o consumer da outbox conhece o `instanceName` do evento pela própria
   * fila; passar aqui garante a atribuição por-usuário mesmo se a extração do payload variar. O
   * webhook HTTP não usa (deixa a extração normal do payload/query resolver).
   */
  async processWebwhatsEventCore(
    payload: any,
    opts: { query?: Record<string, any>; tenantKeyOverride?: string | null } = {},
  ) {
    const eventName = this.extractWebwhatsEventName(payload);
    const parsedCompanyId = this.findWebwhatsCompanyId(payload, opts.query);

    const resolved = await this.resolveCompanyForWebwhatsEvent(payload, opts.query);
    const company = resolved.company as any;

    await this.prisma.whatsAppWebhookEvent.create({
      data: {
        kind: 'webwhats_event',
        companyId: company?.id || parsedCompanyId || undefined,
        payload: this.stringifySafeWebhookPayload({
          eventName,
          resolvedCompanyId: company?.id || parsedCompanyId || null,
          companyResolution: resolved.source,
          payload,
        }),
      },
    });

    if (!company?.id) {
      this.logger.warn(`Webwhats webhook recebido sem empresa resolvida event=${eventName}`);
      return {
        ok: true,
        discarded: true,
        reason: 'company_unresolved',
        eventName,
      };
    }

    // POR USUÁRIO: extraído antes dos handlers para que o evento, status e mensagem usem o
    // tenantKey cru do webhook (`company-{id}-user-{n}`), nunca a sessão genérica da empresa.
    // GATEWAY-WA S2: o consumer da outbox passa `tenantKeyOverride` (o instanceName que a fila já
    // conhece) — só é honrado se for um tenantKey válido da empresa resolvida.
    const overrideTenantKey = this.normalizeWebwhatsTenantKeyOverride(opts.tenantKeyOverride, Number(company.id));
    const webwhatsTenantKey = overrideTenantKey || this.findWebwhatsTenantKey(payload, opts.query);
    const connectionReconcileResult = await this.reconcileWebwhatsConnectionWebhook({
      companyId: Number(company.id),
      tenantKey: webwhatsTenantKey,
      eventName,
      payload,
    });

    const messages = this.extractWebwhatsMessageCandidates(payload);
    const statuses = this.extractWebwhatsStatusCandidates(payload);
    await this.logWhatsAppEvent({
      companyId: company.id,
      scope: 'webwhats_webhook',
      event: 'webhook_received',
      message: `Webhook WebWhats recebido: ${eventName}`,
      result: 'received',
      extra: {
        eventName,
        companyResolution: resolved.source,
        tenantKey: webwhatsTenantKey,
        connectionReconcileResult,
        messageCandidates: messages.length,
        statusCandidates: statuses.length,
      },
    });

    let statusesHandled = 0;
    let messagesHandled = 0;
    let failures = 0;

    for (const status of statuses) {
      try {
        const statusResult = await this.applyProviderDeliveryStatus({
          companyId: company.id,
          providerMessageId: status.providerMessageId,
          status: status.status,
          timestamp: status.timestamp,
          rawPayload: status.rawPayload,
          scope: 'webwhats_webhook',
          tenantKey: webwhatsTenantKey,
        });
        statusesHandled++;
        for (const conversationId of statusResult.conversationIds) {
          this.inboxRealtime.publish({
            companyId: company.id,
            kind: 'status',
            conversationId,
            at: new Date().toISOString(),
          });
        }
      } catch (error: any) {
        failures++;
        const message = String(error?.message || error || 'Falha ao aplicar status WebWhats.');
        this.logger.warn(`Webwhats status failed company=${company.id}: ${message}`);
        await this.logWhatsAppEvent({
          companyId: company.id,
          scope: 'webwhats_webhook',
          event: 'status_failed',
          level: 'ERROR',
          message,
          messageType: 'status',
          result: 'failed',
          extra: {
            providerMessageId: status.providerMessageId,
            eventName,
          },
        });
      }
    }

    for (const message of messages) {
      try {
        const result = await this.webwhatsBridge.ingestWebhookMessage(company.id, message, {
          remoteJid: message.key?.remoteJid || null,
          remoteJidAlt: message.key?.remoteJidAlt || null,
          displayName: message.pushName || null,
          tenantKey: webwhatsTenantKey,
        });
        messagesHandled++;
        this.inboxRealtime.publish({
          companyId: company.id,
          kind: 'message',
          conversationId: result.conversationId,
          messageId: result.companyMessageId,
          at: new Date().toISOString(),
        });
        await this.logWhatsAppEvent({
          companyId: company.id,
          scope: 'webwhats_webhook',
          event: 'message_persisted',
          message: `Mensagem WebWhats ${message.messageType || 'text'} persistida`,
          conversationId: result.conversationId || null,
          phone: result.remoteJidAlt || result.remoteJid || null,
          messageType: message.messageType || 'text',
          result: 'persisted',
          extra: {
            eventName,
            companyMessageId: result.companyMessageId,
            providerMessageId: message.key?.id || message.id || null,
            remoteJid: result.remoteJid,
            remoteJidAlt: result.remoteJidAlt,
          },
        });
      } catch (error: any) {
        failures++;
        const providerMessageId = String(message.key?.id || message.id || '').trim() || null;
        const errorMessage = String(error?.message || error || 'Falha ao persistir mensagem WebWhats.');
        this.logger.warn(
          `Webwhats message failed company=${company.id} providerMessageId=${providerMessageId || '(missing)'}: ${errorMessage}`,
        );
        await this.logWhatsAppEvent({
          companyId: company.id,
          scope: 'webwhats_webhook',
          event: 'message_failed',
          level: 'ERROR',
          message: errorMessage,
          phone: message.key?.remoteJid || null,
          messageType: message.messageType || 'text',
          result: 'failed',
          extra: {
            eventName,
            providerMessageId,
            remoteJid: message.key?.remoteJid || null,
          },
        });
      }
    }

    return {
      ok: failures === 0,
      eventName,
      companyId: company.id,
      connectionReconcileResult,
      messagesHandled,
      statusesHandled,
      failures,
    };
  }

  async handleWhatsAppWebhook(payload: any, opts: { rawBody?: Buffer; signature?: string } = {}) {
    const rawBody = opts.rawBody;
    const signature = opts.signature;

    const signatureOk = this.verifyWebhookSignature(rawBody, signature);
    if (!signatureOk) {
      this.logger.warn('WhatsApp webhook signature invalid');
      await this.logWhatsAppEvent({
        scope: 'webhook',
        event: 'signature_invalid',
        level: 'WARN',
        message: 'Webhook do WhatsApp descartado por assinatura invalida',
        result: 'discarded',
      });
      // Do not persist orphan events; just discard with log
      return { ok: false };
    }

    const entry = Array.isArray(payload?.entry) ? payload.entry : [];
    let statusesHandled = 0;
    let messagesHandled = 0;

    for (const ent of entry) {
      const changes = Array.isArray(ent?.changes) ? ent.changes : [];
      for (const ch of changes) {
        const value = ch?.value;
        const metadata = value?.metadata;
        const phoneNumberId = metadata?.phone_number_id ? String(metadata.phone_number_id) : '';
        const displayPhone = metadata?.display_phone_number ? String(metadata.display_phone_number) : '';

        const resolvedInboundTarget = await this.resolveCompanyForIncomingNumber(
          phoneNumberId,
          displayPhone,
        );
        const company = resolvedInboundTarget.company;
        const inboundEndpoint = resolvedInboundTarget.endpoint;

        // Delivery statuses
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const st of statuses) {
          const providerMessageId = st?.id ? String(st.id) : '';
          const status = st?.status ? String(st.status) : '';
          const ts = st?.timestamp ? Number(st.timestamp) * 1000 : Date.now();
          const at = new Date(ts);

          if (!company) {
            this.logger.warn(`WhatsApp status ignored (unmapped company). phone_number_id=${phoneNumberId} display=${displayPhone}`);
            await this.logWhatsAppEvent({
              scope: 'webhook',
              event: 'status_unmapped_company',
              level: 'WARN',
              message: 'Status do WhatsApp recebido sem empresa mapeada',
              phone: displayPhone || phoneNumberId,
              messageType: 'status',
              result: 'discarded',
              extra: { phoneNumberId, displayPhone, providerMessageId },
            });
          } else {
            await this.prisma.whatsAppWebhookEvent.create({
              data: {
                kind: 'statuses',
                companyId: company.id,
                providerMessageId: providerMessageId || undefined,
                payload: JSON.stringify(st ?? null),
              },
            });
          }

          if (providerMessageId && company) {
            const statusResult = await this.applyProviderDeliveryStatus({
              companyId: company.id,
              providerMessageId,
              status,
              timestamp: at,
              rawPayload: st,
              scope: 'webhook',
            });
            if (status === 'failed' || status === 'delivered' || status === 'read') {
              await this.updateRecoveryTemplateLastContactByProviderMessage(
                providerMessageId,
                status as 'failed' | 'delivered' | 'read',
                at,
              );
            }
            for (const conversationId of statusResult.conversationIds) {
              this.inboxRealtime.publish({
                companyId: company.id,
                kind: 'status',
                conversationId,
                at: new Date().toISOString(),
              });
            }
            await this.logWhatsAppEvent({
              companyId: company.id,
              scope: 'webhook',
              event: 'status_received',
              message: `Status ${status || 'unknown'} recebido da Meta`,
              phone: displayPhone,
              messageType: 'status',
              result: status || 'received',
              extra: {
                providerMessageId,
                phoneNumberId,
                displayPhone,
                whatsappEndpointId: inboundEndpoint?.id || null,
                endpointModuleKey: inboundEndpoint?.moduleKey || null,
              },
            });
          }

          statusesHandled++;
        }

        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const contactNameByWaId = new Map<string, string>();
        for (const c of contacts) {
          const waId = String(c?.wa_id || '').replace(/\D/g, '');
          const profileName = String(c?.profile?.name || '').trim();
          if (waId && profileName) {
            contactNameByWaId.set(waId, profileName);
          }
        }

        // Inbound messages
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const m of messages) {
          if (!company) {
            this.logger.warn(`WhatsApp inbound ignored (unmapped company). phone_number_id=${phoneNumberId} display=${displayPhone}`);
            await this.logWhatsAppEvent({
              scope: 'webhook',
              event: 'inbound_unmapped_company',
              level: 'WARN',
              message: 'Mensagem inbound do WhatsApp recebida sem empresa mapeada',
              phone: m?.from ? String(m.from) : displayPhone,
              messageType: normalizeWhatsAppMessageType(m?.type),
              result: 'discarded',
              extra: { phoneNumberId, displayPhone, providerMessageId: m?.id ? String(m.id) : null },
            });
            continue;
          }

          await this.prisma.whatsAppWebhookEvent.create({
            data: {
              kind: 'messages',
              companyId: company.id,
              providerMessageId: m?.id ? String(m.id) : undefined,
              payload: JSON.stringify(m ?? null),
            },
          });

          const from = m?.from ? String(m.from) : '';
          const type = normalizeWhatsAppMessageType(m?.type);
          const text = extractInboundTextFromPayload(m);
          const contactProfileName = String(
            contactNameByWaId.get(String(from).replace(/\D/g, '')) || '',
          ).trim();
          if (!from) continue;

          const tsMs = m?.timestamp ? Number(String(m.timestamp)) * 1000 : NaN;
          const receivedAt = Number.isFinite(tsMs) ? new Date(tsMs) : new Date();
          const providerMessageId = m?.id ? String(m.id) : undefined;
          await this.handleInboundMessage({
            companyId: company.id,
            customerPhone: from,
            conversationId: null,
            direction: 'inbound',
            senderType: 'customer',
            messageType: type === 'template' ? 'text' : type,
            text,
            rawPayload: {
              ...(m || {}),
              _contactName: contactProfileName || undefined,
            },
            externalMessageId: providerMessageId || null,
            timestamp: receivedAt,
            receivedOnEndpointId: inboundEndpoint?.id || null,
            receivedOnPhoneNumberId:
              phoneNumberId ||
              String(inboundEndpoint?.whatsappPhoneNumberId || '').trim() ||
              null,
            receivedOnDisplayNumber:
              displayPhone ||
              String(inboundEndpoint?.whatsappDisplayNumber || '').trim() ||
              String(inboundEndpoint?.whatsappNumber || '').trim() ||
              null,
            receivedOnModuleKey: String(inboundEndpoint?.moduleKey || '').trim().toLowerCase() || null,
            receivedOnEndpointLabel: String(inboundEndpoint?.label || '').trim() || null,
          });
          messagesHandled++;
        }
      }
    }

    return { ok: true, statusesHandled, messagesHandled };
  }

  async createRule(user: any, dto: CreateAutoReplyRuleDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Company with id ${companyId} not found`);
    if (!dto.responses?.length) throw new BadRequestException('responses required');

    return this.prisma.autoReplyRule.create({
      data: {
        companyId,
        enabled: dto.enabled ?? true,
        priority: dto.priority ?? 0,
        matchType: dto.matchType as any,
        pattern: dto.pattern,
        caseInsensitive: dto.caseInsensitive ?? true,
        responses: {
          create: dto.responses.map((r) => ({ order: r.order, delaySeconds: r.delaySeconds ?? 0, template: r.template })),
        },
      },
      include: { responses: true },
    });
  }

  async listRules(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.prisma.autoReplyRule.findMany({ where: { companyId }, include: { responses: true }, orderBy: [{ priority: 'desc' }, { id: 'asc' }] });
  }

  async updateRule(user: any, id: number, dto: UpdateAutoReplyRuleDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const rule = await this.prisma.autoReplyRule.findUnique({ where: { id } });
    if (!rule || rule.companyId !== companyId) throw new NotFoundException('Rule not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.responses) {
        await tx.autoReplyResponse.deleteMany({ where: { ruleId: id } });
        await tx.autoReplyResponse.createMany({
          data: dto.responses.map((r) => ({ ruleId: id, order: r.order, delaySeconds: r.delaySeconds ?? 0, template: r.template })),
        });
      }
      await tx.autoReplyRule.update({
        where: { id },
        data: {
          enabled: dto.enabled,
          priority: dto.priority,
          matchType: (dto.matchType as any) ?? undefined,
          pattern: dto.pattern,
          caseInsensitive: dto.caseInsensitive,
        },
      });
      return tx.autoReplyRule.findUnique({ where: { id }, include: { responses: true } });
    });
  }

  async deleteRule(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const rule = await this.prisma.autoReplyRule.findUnique({ where: { id } });
    if (!rule || rule.companyId !== companyId) throw new NotFoundException('Rule not found');
    await this.prisma.autoReplyResponse.deleteMany({ where: { ruleId: id } });
    await this.prisma.autoReplyRule.delete({ where: { id } });
    return { success: true };
  }

  async handleInboundProxyMessage(dto: {
    whatsappPhoneNumberId: string;
    from: string;
    text: string;
    receivedAt?: string;
    inboundType?: string;
    rawPayload?: any;
  }) {
    const phoneNumberId = String(dto.whatsappPhoneNumberId || '').trim();
    if (!phoneNumberId) {
      this.logger.warn('Inbound proxy ignored (missing whatsappPhoneNumberId)');
      return { ok: false };
    }

    const resolvedInboundTarget = await this.resolveCompanyForIncomingNumber(phoneNumberId, null);
    const company = resolvedInboundTarget.company;
    const inboundEndpoint = resolvedInboundTarget.endpoint;
    if (!company) {
      this.logger.warn(`Inbound proxy ignored (unmapped company). phone_number_id=${phoneNumberId}`);
      return { ok: true, discarded: true };
    }

    const receivedAt = dto.receivedAt ? new Date(String(dto.receivedAt)) : undefined;
    const inboundType = normalizeWhatsAppMessageType(dto.inboundType);
    await this.handleInboundMessage({
      companyId: company.id,
      customerPhone: dto.from,
      conversationId: null,
      direction: 'inbound',
      senderType: 'customer',
      messageType: inboundType === 'template' ? 'text' : inboundType,
      text: String(dto.text || '').trim(),
      rawPayload: dto.rawPayload,
      externalMessageId: null,
      timestamp: receivedAt || new Date(),
      receivedOnEndpointId: inboundEndpoint?.id || null,
      receivedOnPhoneNumberId:
        phoneNumberId || String(inboundEndpoint?.whatsappPhoneNumberId || '').trim() || null,
      receivedOnDisplayNumber:
        String(inboundEndpoint?.whatsappDisplayNumber || '').trim() ||
        String(inboundEndpoint?.whatsappNumber || '').trim() ||
        null,
      receivedOnModuleKey: String(inboundEndpoint?.moduleKey || '').trim().toLowerCase() || null,
      receivedOnEndpointLabel: String(inboundEndpoint?.label || '').trim() || null,
    });
    return { ok: true };
  }

  private async updateInboundConversationMetadata(input: {
    conversationId: number | null | undefined;
    rawPayload?: any;
    timestamp: Date;
    inboundContactName?: string | null;
    receivedOnEndpointId?: string | null;
    receivedOnPhoneNumberId?: string | null;
    receivedOnDisplayNumber?: string | null;
    receivedOnModuleKey?: string | null;
    receivedOnEndpointLabel?: string | null;
  }) {
    const conversationId = Number(input.conversationId || 0);
    if (conversationId <= 0) return;

    const conversation = await this.prisma.companyConversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    const metadata = this.parseConversationMetadata(conversation?.metadata);
    const remoteJid = String(input.rawPayload?.key?.remoteJid || '').trim() || null;
    const remoteJidAlt = String(
      input.rawPayload?.key?.remoteJidAlt || input.rawPayload?.key?.participantAlt || '',
    ).trim() || null;
    const inboundContactName = this.normalizeCustomerProfileName(input.inboundContactName || null);

    await this.prisma.companyConversation.update({
      where: { id: conversationId },
      data: {
        metadata: JSON.stringify({
          ...metadata,
          ...(inboundContactName
            ? {
                whatsappName: inboundContactName,
                waNickname: inboundContactName,
                whatsappProfileName: inboundContactName,
                whatsappContactName: inboundContactName,
              }
            : {}),
          ...(remoteJid ? { whatsappRemoteJid: remoteJid } : {}),
          ...(remoteJidAlt ? { whatsappRemoteJidAlt: remoteJidAlt } : {}),
          ...(input.receivedOnEndpointId !== undefined
            ? { whatsappEntryEndpointId: String(input.receivedOnEndpointId || '').trim() || null }
            : {}),
          ...(input.receivedOnPhoneNumberId !== undefined
            ? { whatsappEntryPhoneNumberId: String(input.receivedOnPhoneNumberId || '').trim() || null }
            : {}),
          ...(input.receivedOnDisplayNumber !== undefined
            ? { whatsappEntryDisplayNumber: String(input.receivedOnDisplayNumber || '').trim() || null }
            : {}),
          ...(input.receivedOnModuleKey !== undefined
            ? { whatsappEntryModuleKey: String(input.receivedOnModuleKey || '').trim().toLowerCase() || null }
            : {}),
          ...(input.receivedOnEndpointLabel !== undefined
            ? { whatsappEntryEndpointLabel: String(input.receivedOnEndpointLabel || '').trim() || null }
            : {}),
          whatsappLastInboundAt: input.timestamp.toISOString(),
        }),
      },
    });
  }

  private async processPersistedInbound(input: {
    company: { id: number; name: string; timezone?: string | null };
    from: string;
    text: string;
    inboundType: ReturnType<typeof normalizeWhatsAppMessageType>;
    rawPayload?: any;
    timestamp: Date;
    externalMessageId?: string | null;
    inboundRow: { id: number; conversationId: number | null };
    scope: string;
    provider: string;
    sourceModule: string;
    receivedOnEndpointId?: string | null;
    receivedOnPhoneNumberId?: string | null;
    receivedOnDisplayNumber?: string | null;
    receivedOnModuleKey?: string | null;
  }) {
    const companyId = Number(input.company.id || 0);
    const from = normalizeWhatsAppPhone(input.from);
    const text = String(input.text || '').trim();
    const inboundConversationId = Number(input.inboundRow?.conversationId || 0);

    await this.logWhatsAppEvent({
      companyId,
      scope: input.scope,
      event: 'inbound_persisted',
      message: `Mensagem inbound ${input.inboundType} persistida`,
      conversationId: inboundConversationId || null,
      phone: from,
      messageType: input.inboundType,
      result: 'received',
      extra: {
        provider: input.provider,
        sourceModule: input.sourceModule,
        providerMessageId: input.externalMessageId || null,
        companyMessageId: Number(input.inboundRow?.id || 0) || null,
        whatsappEndpointId: String(input.receivedOnEndpointId || '').trim() || null,
        receivedOnModuleKey: String(input.receivedOnModuleKey || '').trim().toLowerCase() || null,
        receivedOnDisplayNumber: String(input.receivedOnDisplayNumber || '').trim() || null,
      },
    });

    const isHistoricalWebwhatsSync =
      String(input.scope || '').trim().toLowerCase() === 'webwhats_sync' &&
      input.timestamp instanceof Date &&
      Number.isFinite(input.timestamp.getTime()) &&
      Date.now() - input.timestamp.getTime() > 2 * 60 * 1000;
    if (isHistoricalWebwhatsSync) {
      await this.logWhatsAppEvent({
        companyId,
        scope: input.scope,
        event: 'inbound_historical_sync_suppressed',
        message: 'Mensagem historica do QR sincronizada sem acionar bot automatico.',
        conversationId: inboundConversationId || null,
        phone: from,
        messageType: input.inboundType,
        result: 'bot_suppressed',
        extra: {
          provider: input.provider,
          sourceModule: input.sourceModule,
          providerMessageId: input.externalMessageId || null,
          messageTimestamp: input.timestamp.toISOString(),
        },
      });
      if (inboundConversationId > 0 && Number(input.inboundRow?.id || 0) > 0) {
        await this.conversations.dispatchVendasCockpitProjection({
          companyId,
          conversationId: inboundConversationId,
          event: 'inbound',
          messageId: Number(input.inboundRow.id),
          validHumanInbound: false,
        });
      }
      return { matched: false, source: 'webwhats_sync_historical', botSuppressed: true };
    }

    const isStartupWebwhatsSync =
      String(input.scope || '').trim().toLowerCase() === 'webwhats_sync' &&
      this.isInsideStartupBotGuard();
    if (isStartupWebwhatsSync) {
      await this.logWhatsAppEvent({
        companyId,
        scope: input.scope,
        event: 'inbound_startup_sync_suppressed',
        message: 'Mensagem do Webwhats sincronizada logo apos restart sem acionar bot automatico.',
        conversationId: inboundConversationId || null,
        phone: from,
        messageType: input.inboundType,
        result: 'bot_suppressed',
        extra: {
          provider: input.provider,
          sourceModule: input.sourceModule,
          providerMessageId: input.externalMessageId || null,
          startupGuardMs: this.startupBotDispatchGuardMs,
        },
      });
      if (inboundConversationId > 0 && Number(input.inboundRow?.id || 0) > 0) {
        await this.conversations.dispatchVendasCockpitProjection({
          companyId,
          conversationId: inboundConversationId,
          event: 'inbound',
          messageId: Number(input.inboundRow.id),
          validHumanInbound: false,
        });
      }
      return { matched: false, source: 'webwhats_sync_startup', botSuppressed: true };
    }

    const isValidHumanInbound = ['text', 'button', 'interactive', 'image', 'video', 'document', 'audio']
      .includes(input.inboundType) && classifyProspectingAutoReply(text) === null;
    if (isValidHumanInbound && inboundConversationId > 0 && Number(input.inboundRow?.id || 0) > 0) {
      // Barreira obrigatoria antes de IA e gatilhos: um inbound real invalida os
      // proximos contatos comerciais. O metodo e idempotente pelo id da mensagem.
      await this.commercialContactControl.interruptForInbound({
        companyId,
        conversationId: inboundConversationId,
        inboundMessageId: Number(input.inboundRow.id),
        from,
        timestamp: input.timestamp,
      });
    }
    if (inboundConversationId > 0 && Number(input.inboundRow?.id || 0) > 0) {
      await this.conversations.dispatchVendasCockpitProjection?.({
        companyId,
        conversationId: inboundConversationId,
        event: 'inbound',
        messageId: Number(input.inboundRow.id),
        validHumanInbound: isValidHumanInbound,
      });
    }

    // WORM-13 (13b) — apenas resposta humana valida aciona a cadencia. Recibo,
    // sincronizacao historica e auto-reply nao podem mover estado comercial.
    if (isValidHumanInbound) {
      void this.conversations.dispatchCadenciaInbound({
        companyId,
        fromPhone: from,
        conversationId: inboundConversationId || null,
        text,
      });
    }

    const recoveryCustomer = await this.findRecoveryCustomerByPhone(companyId, from);
    if (isValidHumanInbound && !recoveryCustomer && this.conversationAssistant) {
      const prepared = await this.conversationAssistant.prepareReply({
        companyId,
        conversationId: inboundConversationId,
        inboundMessageId: Number(input.inboundRow?.id || 0),
        text,
      });
      if (prepared.handled) {
        if (prepared.runId && prepared.reply) {
          try {
            const queued = await this.conversations.queueOutboundForCompany(companyId, {
              conversationId: inboundConversationId,
              to: from,
              contactId: from,
              body: prepared.reply,
              messageType: 'text',
              sourceModule: 'conversation_assistant',
              senderType: 'bot',
              variables: {
                purpose: 'conversation_reply',
                assistantRunId: prepared.runId,
                inboundMessageId: Number(input.inboundRow?.id || 0),
                vendasLeadId: prepared.vendasLeadId || null,
              },
              flowState: { botActive: true, humanAssigned: false, flowResult: null },
            });
            await this.conversationAssistant.markQueued({
              companyId,
              runId: prepared.runId,
              outboundMessageId: Number(queued.outboundMessageId),
              source: prepared.source || null,
            });
            await this.logWhatsAppEvent({
              companyId,
              scope: 'conversation_assistant',
              event: 'assistant_reply_queued',
              message: `Resposta de ${prepared.publicName || 'assistente'} enfileirada.`,
              conversationId: inboundConversationId,
              phone: from,
              messageType: 'text',
              result: 'queued',
              extra: {
                assistantRunId: prepared.runId,
                inboundMessageId: Number(input.inboundRow?.id || 0),
                outboundMessageId: Number(queued.outboundMessageId),
              },
            });
          } catch (error) {
            await this.conversationAssistant.markQueueFailed({
              companyId,
              runId: prepared.runId,
              error,
            }).catch(() => null);
            this.logger.warn(
              `Falha ao enfileirar resposta da assistente company=${companyId} conversation=${inboundConversationId}: ${String((error as any)?.message || error)}`,
            );
          }
        }
        // Claim, falha ou duplicata da Assistente não cai também no Atendimento:
        // apenas um motor conversacional pode responder ao mesmo inbound.
        return {
          matched: true,
          source: 'conversation_assistant',
          assistantRunId: prepared.runId || null,
          duplicate: prepared.duplicate === true,
          failed: prepared.failed === true,
        };
      }
    }
    if (['text', 'button', 'interactive', 'image', 'video', 'document', 'audio'].includes(input.inboundType)) {
      const atendimentoResult = await this.handleAtendimentoInbound({
        companyId,
        from,
        text,
        conversationId: inboundConversationId,
        inboundMessageId: Number(input.inboundRow?.id || 0),
        timestamp: input.timestamp,
        company: {
          id: input.company.id,
          name: String(input.company.name || 'HBX Solutions'),
          timezone: input.company.timezone,
        },
        recoveryCustomer,
        rawPayload: input.rawPayload,
      });
      if (atendimentoResult?.handled) {
        const delegatedToRecovery = Boolean((atendimentoResult as any)?.delegatedToRecovery);
        return {
          matched: true,
          source: delegatedToRecovery ? 'hbx_recovery' : 'atendimento',
          customerId: recoveryCustomer?.id || null,
        };
      }
    }

    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(companyId);
    if (
      tenantContext.recoveryEnabled &&
      recoveryCustomer &&
      ['text', 'button', 'interactive', 'image', 'video', 'document', 'audio'].includes(input.inboundType)
    ) {
      await this.handleRecoveryInbound({
        companyId,
        from,
        text,
        conversationId: inboundConversationId,
        inboundMessageId: Number(input.inboundRow?.id || 0),
        customer: recoveryCustomer,
        rawPayload: input.rawPayload,
      });
      return { matched: true, source: 'hbx_recovery', customerId: recoveryCustomer.id };
    }

    // INTENTENGINE Sprint 5 (PR-1): o trecho legado final (session orchestrator +
    // AutoReplyRule) foi extraído 1:1 para o LegacyRulesInboundHandler. Delegamos aqui e
    // devolvemos o MESMO shape de antes. `legacyRulesHandler` é @Optional() no construtor;
    // quando ausente (testes que instanciam o serviço direto), montamos um a partir das
    // dependências que este próprio serviço já possui — comportamento idêntico.
    const legacyHandler =
      this.legacyRulesHandler ??
      new LegacyRulesInboundHandler(this.prisma, this.sessions, this.orchestrator, this.drafts, this.conversations);
    const legacyResult = await legacyHandler.handle({
      company: input.company,
      companyId,
      from,
      text,
      inboundType: input.inboundType,
      conversationId: inboundConversationId,
      inboundRow: input.inboundRow,
      timestamp: input.timestamp,
      scope: input.scope,
      provider: input.provider,
      sourceModule: input.sourceModule,
      rawPayload: input.rawPayload,
      externalMessageId: input.externalMessageId ?? null,
    });
    return legacyResult.result;
  }

  private async handleWebwhatsSyncedInbound(input: {
    companyId: number;
    conversationId: number;
    companyMessageId: number;
    customerPhone: string;
    text: string;
    timestamp: Date;
    rawPayload?: any;
    externalMessageId?: string | null;
    inboundType: string;
    contactName?: string | null;
  }) {
    const companyId = Number(input.companyId || 0);
    if (!companyId) return { matched: false, discarded: true };

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, timezone: true },
    });
    if (!company) return { matched: false, discarded: true };

    const inboundRow = await this.prisma.companyMessage.findFirst({
      where: { id: Number(input.companyMessageId || 0), companyId },
      select: { id: true, conversationId: true },
    });
    if (!inboundRow) return { matched: false, discarded: true };

    await this.updateInboundConversationMetadata({
      conversationId: Number(inboundRow.conversationId || input.conversationId || 0),
      rawPayload: input.rawPayload,
      timestamp: input.timestamp,
      inboundContactName: String(input.contactName || '').trim() || null,
    });

    return this.processPersistedInbound({
      company: {
        id: company.id,
        name: String(company.name || 'HBX Solutions'),
        timezone: company.timezone,
      },
      from: input.customerPhone,
      text: String(input.text || '').trim(),
      inboundType: normalizeWhatsAppMessageType(input.inboundType),
      rawPayload: input.rawPayload,
      timestamp: input.timestamp,
      externalMessageId: input.externalMessageId || null,
      inboundRow: {
        id: Number(inboundRow.id || 0),
        conversationId: Number(inboundRow.conversationId || 0) || null,
      },
      scope: 'webwhats_sync',
      provider: 'WEBWHATS',
      sourceModule: 'webwhats_sync',
    });
  }

  private async handleInboundMessage(input: WhatsAppInboundNormalized) {
    const companyId = Number(input.companyId || 0);
    const from = normalizeWhatsAppPhone(input.customerPhone);
    const text = String(input.text || '').trim();
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Company with id ${companyId} not found`);

    const inboundType = normalizeWhatsAppMessageType(input.messageType);
    const inboundContactName = this.extractInboundContactName(input.rawPayload, null);
    const inboundRow = await this.conversations.recordInboundMessage({
      companyId,
      from,
      body: text,
      receivedAt: input.timestamp,
      providerMessageId: input.externalMessageId || undefined,
      rawPayload: input.rawPayload,
      messageType: inboundType,
      senderType: 'client',
      sourceModule: 'whatsapp_webhook',
    });
    await this.updateInboundConversationMetadata({
      conversationId: Number(inboundRow?.conversationId || 0),
      rawPayload: input.rawPayload,
      timestamp: input.timestamp,
      inboundContactName,
      receivedOnEndpointId: String(input.receivedOnEndpointId || '').trim() || null,
      receivedOnPhoneNumberId: String(input.receivedOnPhoneNumberId || '').trim() || null,
      receivedOnDisplayNumber: String(input.receivedOnDisplayNumber || '').trim() || null,
      receivedOnModuleKey: String(input.receivedOnModuleKey || '').trim().toLowerCase() || null,
      receivedOnEndpointLabel: String(input.receivedOnEndpointLabel || '').trim() || null,
    });

    if (inboundRow?.isNew === false) {
      const conversationId = Number(inboundRow?.conversationId || 0);
      if (conversationId > 0) {
        await this.conversations.dispatchVendasCockpitProjection({
          companyId,
          conversationId,
          event: 'inbound',
          messageId: Number(inboundRow?.id || 0) || null,
          validHumanInbound: false,
        });
      }
      await this.logWhatsAppEvent({
        companyId,
        scope: 'webhook',
        event: 'inbound_duplicate_suppressed',
        message: 'Replay de mensagem inbound ignorado apos persistencia idempotente.',
        conversationId: conversationId || null,
        phone: from,
        messageType: inboundType,
        result: 'duplicate',
        extra: { providerMessageId: input.externalMessageId || null },
      });
      return { matched: false, source: 'webhook_duplicate', duplicate: true };
    }

    return this.processPersistedInbound({
      company: {
        id: company.id,
        name: String(company.name || 'HBX Solutions'),
        timezone: company.timezone,
      },
      from,
      text,
      inboundType,
      rawPayload: input.rawPayload,
      timestamp: input.timestamp,
      externalMessageId: input.externalMessageId || null,
      inboundRow: {
        id: Number(inboundRow?.id || 0),
        conversationId: Number(inboundRow?.conversationId || 0) || null,
      },
      scope: 'webhook',
      provider: 'WHATSAPP_CLOUD',
      sourceModule: 'whatsapp_webhook',
      receivedOnEndpointId: String(input.receivedOnEndpointId || '').trim() || null,
      receivedOnPhoneNumberId: String(input.receivedOnPhoneNumberId || '').trim() || null,
      receivedOnDisplayNumber: String(input.receivedOnDisplayNumber || '').trim() || null,
      receivedOnModuleKey: String(input.receivedOnModuleKey || '').trim().toLowerCase() || null,
    });
  }
}
