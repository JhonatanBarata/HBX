import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialPlansService } from '../commercial-plans/commercial-plans.service';
import { ConversationsService } from '../messaging/conversations.service';
import { WhatsAppAuditService } from '../messaging/whatsapp-audit.service';
import {
  DEFAULT_RECOVERY_BOT_CONFIG,
  normalizeRecoveryBotConfig,
  type RecoveryRoutingRules,
} from '../hbx-recovery/recovery-bot-config';
import { buildStructuredWhatsAppLog, normalizeWhatsAppPhone } from '../messaging/whatsapp-channel';
import {
  isModalSessionAvailable,
  isMetaConnected,
  buildMotorStateByCompany,
  buildMotorStateByCompanyUser,
} from '../messaging/whatsapp-connection-state';
// WEBWHATS-ARQ3 S3: leitor PURO da projeção canônica de estado de conexão (fonte única).
import { WhatsAppConnectionProjectionService } from '../messaging/whatsapp-connection-projection.service';
import {
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  buildAtendimentoAgendaActionId,
  isAtendimentoBotSetupComplete,
  normalizeAtendimentoAgendaConfig,
  normalizeAtendimentoBotConfig,
  resolveProviderCapabilitiesFromCompany,
  sanitizeAtendimentoBotConfigForTenant,
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaGroup,
  type AtendimentoAgendaSlot,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
  type ProviderCapabilities,
} from './atendimento-config';
import { CadastrosService } from '../cadastros/cadastros.service';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';
import { BotConfigStoreService } from '../bot/config/bot-config-store.service';
import {
  WebwhatsBridgeService,
  WebwhatsConversationSyncResult,
  WebwhatsFetchedMessage,
  WebwhatsLiveChatSnapshot,
  WebwhatsLiveConversationSnapshot,
  WebwhatsProviderError,
  WebwhatsSessionSelector,
} from '../messaging/webwhats-bridge.service';
import { InboxRealtimeService } from '../messaging/inbox-realtime.service';
import { resolveBackendPublicAssetPath } from '../public-assets';
// P1.3: mídia do inbox vive em storage privado e sai pro cliente como URL assinada.
import {
  buildSignedInboxMediaPath,
  extractInboxMediaFilename,
  getInboxMediaFileCandidates,
  getInboxPrivateMediaDir,
  inboxUploadExtensionForMime,
  matchesDeclaredMagicBytes,
  signInboxMediaUrlIfLocal,
  stripInboxMediaSignature,
} from '../uploads/inbox-media.util';
import { PersonaIaService } from '../vendas/persona-ia.service';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { WhatsAppModalService } from '../companies/whatsapp-modal.service';
import { buildVendasLeadIntelligence } from '../vendas/vendas-lead-enrichment';
import {
  VendasContactSuppressionService,
  normalizeSuppressionEmail,
  normalizeSuppressionPhone,
  type SuppressionReason,
} from '../vendas/vendas-contact-suppression.service';
import { parseSignalsJson } from '../webscraping/radar/03-enrichment/lead-signals.util';
import { resolveActorKind, isGerenteActor, isBillingOwnerActor, isAdminTierActor } from '../access/actor-kind';
import type { Request, Response } from 'express';

type BotConfigProviderCapabilities = {
  provider: ProviderCapabilities['provider'];
  canUseOfficialButtons: boolean;
};

type TrashPurgeDetectedReason =
  | 'SEM_INTERESSE_EXPLICITO'
  | 'NEGATIVO'
  | 'SEM_RESPOSTA_24H'
  | 'MOTIVO_NAO_IDENTIFICADO';

type TrashPurgeWords = {
  lastCustomerMessage: string | null;
  lastCustomerMessagesText: string | null;
  lastCustomerMessageAt: Date | null;
  detectedReason: TrashPurgeDetectedReason;
  confidence: number;
};

type TrashPurgeJobStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'paused_provider_unhealthy'
  | 'paused_after_restart'
  | 'canceled'
  | 'completed'
  | 'failed';

type WhatsAppProviderHealthStatus =
  | 'ready'
  | 'connected'
  | 'connecting'
  | 'qr_required'
  | 'disconnected'
  | 'auth_failure'
  | 'unknown';

type WhatsAppProviderHealth = {
  status: WhatsAppProviderHealthStatus;
  canSafelyDelete: boolean;
  reason: string;
  lastCheckedAt: string;
  rawStatus?: string | null;
  rawError?: string | null;
};

type InboxWhatsappSessionScope = {
  accessible: boolean;
  reason: 'webwhats_active' | 'webwhats_reconnecting' | 'webwhats_status_only' | 'meta_active' | 'no_whatsapp';
  currentSessionId: string | null;
  currentSession: any | null;
  mode: 'current' | 'meta' | 'none' | 'company';
  // company mode only
  sessionIds?: string[];
  sessions?: Array<{ id: string; phone: string | null; sellerName: string | null }>;
  // Sessões do PRÓPRIO viewer (qualquer modo). O front libera o compose só nas conversas
  // dessas sessões — quem não é dono da linha vê em modo leitura (ordem do dono: admin = só leitura).
  ownSessionIds?: string[];
  // company mode peneirado (GERENTE): vê/atua só no TIME (sessionIds), nunca no admin-dono/master.
  // Admin-dono/master = company sem restrição (restricted=false).
  restricted?: boolean;
  // Modelo de atendimento efetivo. 'shared' = TODOS veem o pool do número da empresa e o envio é
  // por ATRIBUIÇÃO (puxar); 'individual' = isolamento por sessão + envio só do dono da linha.
  attendanceMode?: 'shared' | 'individual';
  metaActive?: boolean;
  providerHealth?: WhatsAppProviderHealth | null;
};

// PR1 — Health endpoint único: A VERDADE que a tela deve usar pra dizer "conectado".
// Campos null quando não se aplica/sem fonte barata (ver getWhatsappHealth).
type WhatsappHealthSnapshot = {
  connectedForUi: boolean;        // operável de verdade = providerInstanceState==='open' && canSend
  canSend: boolean;               // o viewer tem linha PRÓPRIA ativa pra enviar
  canReceiveWebhook: boolean | null; // webhook configurado/enabled no motor (conservador — ver nota)
  providerReachable: boolean;     // o motor respondeu (reconciler não retornou erro transitório)
  providerInstanceState: 'open' | 'connecting' | 'close' | 'unknown';
  dbSessionActive: boolean;       // banco tem sessão active pro escopo
  currentSessionId: string | null;
  tenantKey: string | null;
  attendanceMode: 'shared' | 'individual';
  lastWebhookAt: string | null;   // sem coluna dedicada de webhook WhatsApp → null (ver nota)
  lastInboundAt: string | null;   // última CompanyMessage INBOUND da sessão (índice barato)
  lastProviderError: string | null;
  repairAction: 'none' | 'relinked_session' | 'forced_reconnect' | 'needs_qr';
};

const METICULOUS_TRASH_DEFAULT_DELAY_MS = 120000;
const METICULOUS_TRASH_MIN_PRODUCTION_DELAY_MS = 120000;
const METICULOUS_TRASH_DEFAULT_JITTER_MIN_MS = 5000;
const METICULOUS_TRASH_DEFAULT_JITTER_MAX_MS = 20000;
const METICULOUS_TRASH_NOTE_MARKER = 'SEM INTERESSE / NEGATIVO';

// GATEWAY-WA S5 (item 1): default OFF — o polling de rotina (syncRecentChats/
// syncConversationMessagesDetailed disparados a cada abertura/leitura de conversa) é hoje a
// REDE DE SEGURANÇA que backfilla o que o webhook/outbox perde. Só liga esta flag (ON = polling
// de rotina desligado) depois da outbox do S2 rodar em produção ≥2 semanas sem perda de evento
// (pré-requisito duro do doc do sprint). Com a flag OFF, comportamento idêntico ao atual.
// Fetch explícito (force, backfill manual, avatar, mídia) NUNCA é bloqueado por esta flag.
function isWaSyncPollingDisabled(): boolean {
  return String(process.env.HBX_WA_SYNC_POLLING_DISABLED || '').trim().toLowerCase() === 'true';
}

// ============================================================================
// HISTÓRICO SOBERANO DO HBX — 31/07/2026, ordem do dono.
//
// A lei tem DUAS metades e confundir uma com a outra é o erro caro:
//
//  1. "o histórico vai ficar full no HBX, nada de puxar chat antigo"
//     O HBX parou de importar o arquivo morto do aparelho. O histórico daqui
//     começa quando o chip conecta e cresce no NOSSO banco, pra sempre. Antes,
//     o primeiro espelhamento puxava 120 msgs × 80 páginas = até 9.600 mensagens
//     POR CONVERSA — a origem da bagunça que o dono via (conversa duplicada por
//     @lid, "nome" que era só número mascarado, mídia velha que não baixa) e de
//     um bootstrap lento que castigava o chip.
//
//  2. "mas não pode perder mensagens entre o cliente! isso é grave!"
//     A REDE DE SEGURANÇA CONTINUA LIGADA. Se o webhook do motor for engolido
//     (já aconteceu — ver INVARIANTES DO WEBHOOK), a reconciliação da janela
//     recente ao abrir a conversa traz o que faltou. Desligar isso junto com o
//     item 1 trocaria um incômodo visual por PERDA DE MENSAGEM: o oposto do
//     pedido. Por isso as duas coisas têm nomes e números separados aqui.
//
// Quem quiser o arquivo antigo de UMA conversa continua tendo o backfill
// MANUAL (POST /inbox/conversations/:id/backfill): explícito, humano, sob
// demanda. O que morreu foi a escavação AUTOMÁTICA de toda a caixa.
// ============================================================================

// Janela de cortesia do primeiro espelhamento: o suficiente pra conversa não
// nascer vazia na tela, longe de uma escavação. 1 página, sem paginar pra trás.
const HBX_BOOTSTRAP_RECENT_MESSAGES = 30;
const HBX_BOOTSTRAP_MAX_PAGES = 1;

// Rede de segurança anti-perda (metade 2 da lei). Quantas mensagens recentes a
// reconciliação confere ao abrir a conversa. NÃO É histórico: é conferência de
// entrega. Mexer aqui pra baixo aumenta o risco de mensagem sumida.
const HBX_SAFETY_NET_RECENT_MESSAGES = 20;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private readonly backgroundInboxSyncAt = new Map<number | string, number>();
  private readonly fullMirrorJobs = new Map<string, Promise<unknown>>();
  private readonly meticulousTrashTimers = new Map<string, NodeJS.Timeout>();
  private readonly serviceStartedAt = new Date();
  // Painel "Equipe" (getWhatsappAdminPanel): mesmo padrão do C3 (ModulesService.listMasterOverview)
  // — cache 60s pra não martelar o motor a cada abertura do popup "Modelo de atendimento".
  private motorInstancesCache: { at: number; value: any[] | null } | null = null;
  private static readonly MOTOR_INSTANCES_TTL_MS = 60_000;
  // ESCRITA DA SUPRESSÃO (30/07/2026): instância PREGUIÇOSA (getter no prototype), não
  // campo de construtor — vários testes deste módulo montam o serviço com
  // `Object.create(InboxService.prototype)`, que pula o construtor e deixaria o campo
  // undefined. O getter existe no prototype, então funciona nos dois modos.
  private contactSuppressionInstance: VendasContactSuppressionService | null = null;

  private get contactSuppression(): VendasContactSuppressionService {
    if (!this.contactSuppressionInstance) {
      this.contactSuppressionInstance = new VendasContactSuppressionService(this.prisma);
    }
    return this.contactSuppressionInstance;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly whatsappAudit: WhatsAppAuditService,
    private readonly cadastrosService: CadastrosService,
    private readonly customerProfileService: CustomerProfileService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
    private readonly inboxRealtime: InboxRealtimeService,
    private readonly commercialPlansService: CommercialPlansService,
    private readonly whatsappModal: WhatsAppModalService,
    @Optional() private readonly botConfigStore?: BotConfigStoreService,
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

  // C3 (TESTE-GERAL/CORRECOES.md), mesma lacuna aplicada aqui: leitura do MOTOR
  // AO VIVO (SÓ LEITURA, `/instance/fetchInstances` via WebwhatsBridgeService.
  // listMotorInstances) — cache 60s local a este service (cada módulo tem sua
  // própria instância de WebwhatsBridgeService, cache não é compartilhável entre
  // DI graphs). Motor desligado/indisponível → null (cacheado também, pra não
  // martelar um motor caído dentro da janela de TTL).
  private async getMotorInstancesCached(): Promise<any[] | null> {
    const cached = this.motorInstancesCache;
    if (cached && Date.now() - cached.at < InboxService.MOTOR_INSTANCES_TTL_MS) {
      return cached.value;
    }
    const value = await this.webwhatsBridge.listMotorInstances();
    this.motorInstancesCache = { at: Date.now(), value };
    return value;
  }

  private requireCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Company context required');
    return companyId;
  }

  private assertAdministrativeAction(user: any) {
    // RBAC Sprint 3: master OU qualquer ADMIN (dono/gerente) via fonte única.
    if (isAdminTierActor(user)) return;
    throw new ForbiddenException({
      code: 'USER_ADMIN_ACTION_NOT_ALLOWED',
      message: 'USER não pode executar esta ação administrativa. Contate seu ADMIN ou o suporte da empresa.',
    });
  }

  private assertSystemMasterAction(user: any) {
    if (Boolean(user?.isSystemMaster)) return;
    throw new ForbiddenException('Somente o suporte HBX pode executar esta ação.');
  }

  // RBAC Sprint 3: master OU qualquer ADMIN (dono/gerente) via fonte única.
  private isAggregateUser(user: any): boolean {
    return isAdminTierActor(user);
  }

  // GERENTE = ADMIN sem acesso ao financeiro (canViewBilling === false). Fonte única em
  // ../access/actor-kind. Vê o TIME de vendedores, mas NUNCA o admin-dono/master
  // (ordem do dono: "admin nunca vaza pra nenhum user — nem gerente, nem vendedor").
  private isGerenteUser(user: any): boolean {
    return isGerenteActor(user);
  }

  // Dona "admin" de uma sessão = master OU ADMIN-dono (com billing). A sessão dessa gente é
  // o que fica de fora da visão do gerente/vendedor. Gerente (ADMIN sem billing) NÃO é dono →
  // a linha dele entra no time. Fonte única: isBillingOwnerActor = master|dono.
  private isAdminOwnerSessionUser(
    sessionUser: { role?: string | null; isSystemMaster?: boolean | null; canViewBilling?: boolean | null } | null | undefined,
  ): boolean {
    if (!sessionUser) return false;
    return isBillingOwnerActor(sessionUser);
  }

  private normalizeVendasPhone(value: unknown) {
    const digits = this.customerProfileService.normalizePhone(value);
    if (!digits) return null;
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
      return `55${digits}`;
    }
    return digits;
  }

  private buildVendasPhoneCandidates(value: unknown) {
    const digits = this.normalizeVendasPhone(value);
    if (!digits) return [];
    const candidates = new Set([digits]);
    if (digits.startsWith('55')) candidates.add(digits.slice(2));
    return Array.from(candidates).filter(Boolean);
  }

  private async archiveVendasLeadFromConversation(input: {
    companyId: number;
    userId?: number | null;
    conversation: any;
    metadata: Record<string, any>;
    reason: string;
  }) {
    const queue =
      input.metadata?.vendasAgendaQueue &&
      typeof input.metadata.vendasAgendaQueue === 'object' &&
      !Array.isArray(input.metadata.vendasAgendaQueue)
        ? (input.metadata.vendasAgendaQueue as Record<string, unknown>)
        : null;
    const leadId = String(queue?.leadId || '').trim();
    const phoneCandidates = this.buildVendasPhoneCandidates(input.conversation?.contact);
    const lead = leadId
      ? await this.prisma.vendasLead.findFirst({
          where: { id: leadId, companyId: input.companyId },
          select: { id: true, status: true, closedAt: true },
        })
      : phoneCandidates.length
        ? await this.prisma.vendasLead.findFirst({
            where: {
              companyId: input.companyId,
              phoneNormalized: { in: phoneCandidates },
            },
            orderBy: [{ updatedAt: 'desc' }],
            select: { id: true, status: true, closedAt: true },
          })
        : null;

    if (!lead) return null;

    const now = new Date();
    try {
      await this.prisma.vendasLead.update({
        where: { id: lead.id },
        data: {
          status: 'encerrado',
          wasClosedBefore: true,
          closedAt: lead.closedAt || now,
          lastResult: 'Encerrado no Atendimento',
        },
      });
    } catch (error) {
      try {
        await this.logInboxEvent({
          companyId: input.companyId,
          event: 'conversation_vendas_archive_failed',
          message: 'Falha ao arquivar card de Vendas durante encerramento no Atendimento.',
          conversationId: Number(input.conversation?.id || 0) || null,
          phone: String(input.conversation?.contact || '').trim(),
          result: 'warning',
          extra: {
            leadId: lead.id,
            error: error instanceof Error ? error.message : 'unknown_error',
          },
        });
      } catch {
        // do not block inbox deletion because audit logging failed
      }
      return null;
    }

    try {
      await this.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          eventType: 'lead_closed',
          title: 'Lead arquivado pelo Atendimento',
          description: input.reason,
          sourceType: 'atendimento',
          statusFrom: String(lead.status || 'novo'),
          statusTo: 'encerrado',
          resultLabel: 'Encerrado no Atendimento',
          returnAt: null,
          createdByUserId: Number(input.userId || 0) || null,
        },
      });
    } catch (error) {
      try {
        await this.logInboxEvent({
          companyId: input.companyId,
          event: 'conversation_vendas_archive_timeline_failed',
          message: 'Card de Vendas foi arquivado, mas a timeline nao foi registrada.',
          conversationId: Number(input.conversation?.id || 0) || null,
          phone: String(input.conversation?.contact || '').trim(),
          result: 'warning',
          extra: {
            leadId: lead.id,
            error: error instanceof Error ? error.message : 'unknown_error',
          },
        });
      } catch {
        // do not block inbox deletion because audit logging failed
      }
    }

    return lead.id;
  }

  openRealtimeStream(user: any, req: Request, res: Response) {
    const companyId = this.requireCompanyIdFromUser(user);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write(': inbox-stream-ready\n\n');

    const unsubscribe = this.inboxRealtime.subscribe(companyId, (event) => {
      res.write(`event: inbox\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      try {
        // comentário SSE (inofensivo) + EVENTO REAL de ping: o front usa o
        // ping como sinal verificável de vida pra detectar stream que "morre
        // calado" atrás do proxy (res.ok resolve mas nada flui).
        res.write(': keepalive\n\n');
        res.write(`event: ping\n`);
        res.write(`data: {"at":"${new Date().toISOString()}"}\n\n`);
      } catch {
        // ignore write failures; close handler will clean up
      }
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) {
        res.end();
      }
    };

    req.on('close', cleanup);
    req.on('end', cleanup);
    req.on('error', cleanup);
  }

  // Hidratação de mídia da janela recente (a thread tem anexo sem arquivo local).
  // Não é histórico: só completa o que já está na tela. `fullSync` desligado em
  // 31/07 pela metade 1 da lei do histórico soberano — hidratar mídia visível
  // nunca precisou reimportar a conversa inteira.
  private async syncPersistedInboxConversation(companyId: number, conversationId: number) {
    try {
      const selector = await this.buildWebwhatsConversationSelector(companyId, conversationId);
      await this.webwhatsBridge.syncConversationMessagesDetailed(companyId, conversationId, {
        limit: HBX_SAFETY_NET_RECENT_MESSAGES,
        fullSync: false,
        maxPages: 1,
        force: false,
      }, selector);
      return null;
    } catch (error: any) {
      const message = String(error?.message || error || 'Falha ao sincronizar conversa do WhatsApp.');
      this.logger.warn(
        `Inbox syncPersistedInboxConversation falhou company=${companyId} conversation=${conversationId}: ${message}`,
      );
      return message;
    }
  }

  // ⚠️ REDE DE SEGURANÇA ANTI-PERDA DE MENSAGEM (metade 2 da lei do histórico
  // soberano — ver topo do arquivo). Isto NÃO é "puxar chat antigo": é conferir,
  // ao abrir a conversa, se alguma mensagem RECENTE do cliente ficou de fora
  // porque o webhook do motor foi engolido. Já aconteceu em produção.
  // NÃO REMOVER junto com o corte de histórico. O teste
  // "rede de segurança continua conferindo a janela recente" existe pra gritar
  // se alguém tentar.
  private async syncLatestInboxConversationWindow(companyId: number, conversationId: number) {
    // GATEWAY-WA S5: mesma flag do trigger acima — rotina automática de leitura, não fetch
    // explícito. Backfill manual (força) não passa por este método.
    if (isWaSyncPollingDisabled()) return null;
    const key = `conversation-latest:${companyId}:${conversationId}`;
    const lastRunAt = Number(this.backgroundInboxSyncAt.get(key) || 0);
    if (Date.now() - lastRunAt < 8000) return null;
    this.backgroundInboxSyncAt.set(key, Date.now());
    try {
      const selector = await this.buildWebwhatsConversationSelector(companyId, conversationId);
      await this.webwhatsBridge.syncConversationMessagesDetailed(companyId, conversationId, {
        limit: HBX_SAFETY_NET_RECENT_MESSAGES,
        fullSync: false,
        maxPages: 1,
        force: true,
      }, selector);
      return null;
    } catch (error: any) {
      const message = String(error?.message || error || 'Falha ao sincronizar janela recente da conversa.');
      this.logger.warn(
        `Inbox syncLatestInboxConversationWindow falhou company=${companyId} conversation=${conversationId}: ${message}`,
      );
      return message;
    }
  }

  private triggerBackgroundInboxConversationSync(companyId: number, conversationId: number) {
    // GATEWAY-WA S5: com a flag ON, esta rotina automática (dispara a cada leitura de
    // conversa/bootstrap) é pulada — o backfill manual (endpoint explícito) continua
    // chamando syncConversationMessagesDetailed direto, sem passar por aqui.
    if (isWaSyncPollingDisabled()) return;
    const key = `conversation:${companyId}:${conversationId}`;
    const lastRunAt = Number(this.backgroundInboxSyncAt.get(key) || 0);
    if (Date.now() - lastRunAt < 45000) return;
    this.backgroundInboxSyncAt.set(key, Date.now());
    void this.syncPersistedInboxConversation(companyId, conversationId)
      .then((syncError) => {
        if (syncError) return;
        this.inboxRealtime.publish({
          companyId,
          kind: 'conversation',
          conversationId,
          at: new Date().toISOString(),
        });
      })
      .catch((error: any) => {
        const message = String(error?.message || error || 'Falha ao atualizar conversa da Inbox em background.');
        this.logger.warn(
          `Inbox background conversation sync falhou company=${companyId} conversation=${conversationId}: ${message}`,
        );
      });
  }

  private assertCanManageAgenda(user: any) {
    // RBAC Sprint 3: master OU qualquer ADMIN (dono/gerente) via fonte única.
    if (isAdminTierActor(user)) return;
    throw new ForbiddenException('Somente administradores podem editar a agenda.');
  }

  private requireTrimmed(value: string, field: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(error) && typeof error === 'object' && (error as any).code === 'P2002';
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

  private parseBooleanMetadataFlag(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value || '').trim().toLowerCase();
    return ['true', '1', 'yes', 'sim'].includes(normalized);
  }

  private normalizeConnectionPhone(value: unknown) {
    const digits = String(value || '').replace(/\D+/g, '');
    if (!digits) return null;
    if (digits.length >= 12) return digits;
    if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
      return `55${digits}`;
    }
    return digits;
  }

  // Ops de CONVERSA falam com a instância DONA da conversa (a sessão gravada nela),
  // independente do papel — admin respondendo no chat de um vendedor sai pelo número dele.
  private async buildWebwhatsConversationSelector(
    companyId: number,
    conversationId: number,
  ): Promise<WebwhatsSessionSelector | undefined> {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: Number(conversationId || 0), companyId: Number(companyId) },
      select: { whatsappConnectionSessionId: true },
    });
    const sessionId = conversation?.whatsappConnectionSessionId
      ? String(conversation.whatsappConnectionSessionId)
      : null;
    return sessionId ? { sessionId } : undefined;
  }

  private async ensureWebwhatsSessionFromCompany(company: any, userId?: number) {
    // 050-4: quando userId presente, busca a sessão DESTE usuário (não da empresa).
    if (userId) {
      return this.prisma.whatsAppConnectionSession.findFirst({
        where: {
          companyId: Number(company.id),
          provider: 'webwhats',
          status: 'active',
          userId: Number(userId),
        },
        orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
      });
    }

    const sessionAvailable = isModalSessionAvailable(company?.whatsappModalStatus);
    if (!sessionAvailable) return null;
    const current = company?.currentWhatsappConnectionSession;
    // 050-1: aceita qualquer tenantKey válido (company-{id} legado ou company-{id}-user-{uid}).
    if (
      current &&
      String(current.provider || '').trim().toLowerCase() === 'webwhats' &&
      String(current.status || '').trim().toLowerCase() === 'active' &&
      String(current.tenantKey || '').trim().startsWith(`company-${Number(company.id)}`)
    ) {
      return current;
    }

    // READ-ONLY: o ciclo de vida da sessão é do connect (whatsapp-modal.service). O inbox
    // só LÊ a sessão atual — não cria, não relabela, não repara.
    return this.prisma.whatsAppConnectionSession.findFirst({
      where: {
        companyId: Number(company.id),
        provider: 'webwhats',
        status: 'active',
      },
      orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async resolveCompanyAttendanceMode(companyId: number): Promise<'shared' | 'individual'> {
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { whatsappAttendanceMode: true },
    });
    return String(c?.whatsappAttendanceMode || '').trim().toLowerCase() === 'shared' ? 'shared' : 'individual';
  }

  // RBAC Sprint 3: master OU ADMIN-dono (com billing) via fonte única = isBillingOwnerActor.
  private isCompanyAdminOwner(user: any): boolean {
    return isBillingOwnerActor(user);
  }

  // Número limpo pra exibir no painel (tira o "@s.whatsapp.net" e formata BR).
  private cleanDisplayPhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const d = String(raw).split('@')[0].replace(/\D/g, '');
    if (!d) return null;
    if (d.length === 13 && d.startsWith('55')) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12 && d.startsWith('55')) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
    return d;
  }

  // Modo COMPARTILHADO: TODO atendente (vendedor/gerente/admin) vê o pool do WhatsApp da empresa
  // (a sessão principal — nunca chamar de "do admin"). Sem isolamento por sessão de propósito; o
  // controle de "quem responde" é por ATRIBUIÇÃO (assignedUserId / puxar), não por dono da linha.
  private async resolveSharedInboxScope(companyId: number): Promise<InboxWhatsappSessionScope> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        whatsappModalStatus: true,
        whatsappStatus: true,
        currentWhatsappConnectionSessionId: true,
        currentWhatsappConnectionSession: true,
      },
    });
    const metaActive = isMetaConnected(company?.whatsappStatus);
    const principal = company ? await this.ensureWebwhatsSessionFromCompany(company, undefined) : null;
    const sessionIds = principal?.id ? [String(principal.id)] : [];
    const sessions = principal?.id
      ? [{ id: String(principal.id), phone: principal.displayPhone || principal.phoneNormalized || null, sellerName: 'WhatsApp da empresa' }]
      : [];
    const accessible = sessionIds.length > 0 || metaActive;
    return {
      accessible,
      reason: sessionIds.length > 0 ? 'webwhats_active' : (metaActive ? 'meta_active' : 'no_whatsapp'),
      currentSessionId: null,
      currentSession: null,
      mode: 'company',
      sessionIds,
      sessions,
      ownSessionIds: [],
      restricted: false,
      attendanceMode: 'shared',
      metaActive,
    };
  }

  private async resolveInboxWhatsappSessionScope(
    companyId: number,
    opts?: { userId?: number; aggregate?: boolean; user?: any },
  ): Promise<InboxWhatsappSessionScope> {
    // Modo COMPARTILHADO sobrepõe o role: todos veem o pool do número da empresa (vendedor incluso).
    if ((await this.resolveCompanyAttendanceMode(companyId)) === 'shared') {
      return this.resolveSharedInboxScope(companyId);
    }
    // ADMIN/master/gerente → visão agregada. Gate de role aqui: aggregate só chega true quando o
    // caller verificou a role (ADMIN || master). O GERENTE (ADMIN sem billing) também é aggregate,
    // mas a lista dele é PENEIRADA: exclui as sessões do admin-dono/master (não vaza pro user).
    if (opts?.aggregate) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { whatsappStatus: true },
      });
      const metaActive = isMetaConnected(company?.whatsappStatus);
      const activeSessions = await this.prisma.whatsAppConnectionSession.findMany({
        where: { companyId, provider: 'webwhats', status: 'active' },
        orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          userId: true,
          phoneNormalized: true,
          displayPhone: true,
          user: { select: { id: true, name: true, username: true, role: true, isSystemMaster: true, canViewBilling: true } },
        },
      });
      // Gerente vê o TIME, nunca o admin-dono/master. Admin-dono/master veem tudo.
      const gerente = this.isGerenteUser(opts?.user);
      const visibleSessions = gerente
        ? activeSessions.filter((s) => !this.isAdminOwnerSessionUser(s.user as any))
        : activeSessions;
      const sessionIds = visibleSessions.map((s) => String(s.id));
      const sessions = visibleSessions.map((s) => ({
        id: String(s.id),
        phone: s.displayPhone || s.phoneNormalized || null,
        sellerName: (s.user as any)?.name || (s.user as any)?.username || null,
      }));
      const viewerId = Number(opts?.userId || opts?.user?.id || 0) || 0;
      const ownSessionIds = viewerId
        ? activeSessions.filter((s) => Number((s as any).userId || 0) === viewerId).map((s) => String(s.id))
        : [];
      const accessible = sessionIds.length > 0 || metaActive;
      return {
        accessible,
        reason: sessionIds.length > 0 ? 'webwhats_active' : (metaActive ? 'meta_active' : 'no_whatsapp'),
        currentSessionId: null,
        currentSession: null,
        mode: 'company',
        sessionIds,
        sessions,
        ownSessionIds,
        restricted: gerente,
        attendanceMode: 'individual',
        metaActive,
      };
    }

    // USER/default: escopo da sessão do usuário (ou empresa se sem userId).
    const userId = opts?.userId ?? (Number(opts?.user?.id || 0) || undefined);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        whatsappModalStatus: true,
        whatsappModalPhone: true,
        whatsappModalConnectedAt: true,
        whatsappStatus: true,
        currentWhatsappConnectionSessionId: true,
        currentWhatsappConnectionSession: true,
      },
    });
    const currentSession = company ? await this.ensureWebwhatsSessionFromCompany(company, userId) : null;
    const metaActive = isMetaConnected(company?.whatsappStatus);
    const modalStatus = String(company?.whatsappModalStatus || '').trim().toUpperCase();
    const modalSessionAvailable = isModalSessionAvailable(company?.whatsappModalStatus);
    // 050-4: per-user scope → acessível só se ESTE usuário tiver sessão (ou Meta ativo).
    // Sem userId (admin/empresa): comportamento legado (status da empresa conta).
    const accessible = userId
      ? Boolean(currentSession?.id || metaActive)
      : Boolean(currentSession?.id || modalSessionAvailable || metaActive);
    return {
      accessible,
      reason: currentSession?.id
        ? modalStatus === 'RECONNECTING'
          ? 'webwhats_reconnecting'
          : 'webwhats_active'
        : modalSessionAvailable
          ? modalStatus === 'RECONNECTING'
            ? 'webwhats_reconnecting'
            : 'webwhats_status_only'
        : metaActive
          ? 'meta_active'
          : 'no_whatsapp',
      currentSessionId: currentSession?.id ? String(currentSession.id) : null,
      currentSession,
      // Nunca mais 'all' (mostrava TODAS as sessões = 2º vetor de vazamento). Sessão
      // webwhats atual = 'current' (só ela); só Meta = 'meta' (conversas sem sessão);
      // nada conectado = 'none' (inbox vazio, jamais "mostra tudo").
      mode: currentSession?.id ? 'current' : (metaActive ? 'meta' : 'none'),
      ownSessionIds: currentSession?.id ? [String(currentSession.id)] : [],
      attendanceMode: 'individual',
    };
  }

  private assertInboxWhatsappAccessible(scope: InboxWhatsappSessionScope) {
    if (scope.accessible) return;
    throw new ServiceUnavailableException('Atendimento indisponível sem WhatsApp/celular vinculado.');
  }

  // Identidade no envio, MODO-CIENTE (ordem do dono). Retorna o modo efetivo p/ o caller (ex.:
  // auto-puxar no shared). Vale só pro envio MANUAL do Atendimento; automação (bot/recovery/vendas)
  // usa outra porta e não passa aqui.
  //  - INDIVIDUAL: só o DONO da linha responde; admin/gerente em conversa alheia = leitura.
  //  - SHARED: pool da empresa; responde quem PUXOU (assignedUserId). Sem dono → livre (auto-puxa).
  //    Atribuída a outro → bloqueia. Admin-dono/master sempre pode (transferir/liberar).
  // Conversa sem sessão webwhats (Meta/legado) no individual mantém o comportamento atual.
  private async assertCanSendInConversation(
    user: any,
    conversation:
      | { companyId?: number | null; whatsappConnectionSessionId?: string | null; assignedUserId?: number | null }
      | null
      | undefined,
  ): Promise<'shared' | 'individual'> {
    const viewerId = Number(user?.id || 0) || 0;
    const companyId = Number(conversation?.companyId || 0) || undefined;
    const attendanceMode = companyId ? await this.resolveCompanyAttendanceMode(companyId) : 'individual';
    if (!viewerId) return attendanceMode;

    if (attendanceMode === 'shared') {
      if (this.isCompanyAdminOwner(user)) return attendanceMode;
      const assignedUserId = Number(conversation?.assignedUserId || 0) || 0;
      if (!assignedUserId || assignedUserId === viewerId) return attendanceMode;
      const owner = await this.prisma.user.findUnique({ where: { id: assignedUserId }, select: { name: true } });
      const who = owner?.name ? ` com ${owner.name}` : ' com outro atendente';
      throw new ForbiddenException(`Atendimento já está${who}. Assuma o atendimento para responder.`);
    }

    // INDIVIDUAL: dono da linha.
    const sessionId = conversation?.whatsappConnectionSessionId
      ? String(conversation.whatsappConnectionSessionId)
      : null;
    if (!sessionId) return attendanceMode;
    const session = await this.prisma.whatsAppConnectionSession.findFirst({
      where: { id: sessionId, ...(companyId ? { companyId } : {}) },
      select: { userId: true, user: { select: { name: true } } },
    });
    if (session && Number(session.userId || 0) === viewerId) return attendanceMode;
    const owner = (session?.user as any)?.name ? ` (${(session?.user as any).name})` : '';
    throw new ForbiddenException(
      `Só o dono da linha${owner} responde por aqui. Você está visualizando como supervisão.`,
    );
  }

  private isRowVisibleForWhatsappSessionScope(row: any, scope: InboxWhatsappSessionScope) {
    if (!scope.accessible) return false;
    const rowSessionId = row?.whatsappConnectionSessionId ? String(row.whatsappConnectionSessionId) : null;
    // Sessão webwhats atual → SÓ as conversas dela (isolamento por número).
    if (scope.mode === 'current') return Boolean(scope.currentSessionId) && rowSessionId === scope.currentSessionId;
    // Só Meta (Cloud API, sem webwhats) → conversas sem sessão webwhats (id null).
    if (scope.mode === 'meta') return rowSessionId === null;
    // Visão agregada: GERENTE (restricted) vê só o TIME (sessões listadas) + só-Meta. O
    // ADMIN-dono/master vê a EMPRESA INTEIRA — independente de a sessão estar 'active' AGORA.
    // Sem isso, todo re-link/deploy (publish reinicia o webwhats e re-linka os chips → a
    // sessão pisca de status no banco) escondia o histórico de quem caiu pra 'disconnected',
    // mesmo o motor estando 'open'. Espelha o escopo das MUTAÇÕES (ensureConversation já usa
    // só companyId pro admin-dono) — leitura e escrita do dono enxergam o mesmo conjunto.
    if (scope.mode === 'company') {
      if (scope.restricted) {
        if (rowSessionId !== null) return scope.sessionIds?.includes(rowSessionId) ?? false;
        return Boolean(scope.metaActive);
      }
      return true;
    }
    return false;
  }

  private buildWhatsappSessionMetadata(scope: InboxWhatsappSessionScope) {
    return {
      accessible: scope.accessible,
      reason: scope.reason,
      mode: scope.mode,
      currentSessionId: scope.currentSessionId,
      providerHealth: scope.providerHealth || null,
      currentSession: scope.currentSession
        ? {
            id: String(scope.currentSession.id),
            provider: String(scope.currentSession.provider || 'webwhats'),
            phoneNormalized: scope.currentSession.phoneNormalized || null,
            displayPhone: scope.currentSession.displayPhone || null,
            connectedAt: scope.currentSession.connectedAt || null,
        }
        : null,
      // company mode: lista de sessões ativas para o front rotular de quem é cada conversa.
      sessions: scope.mode === 'company' ? (scope.sessions ?? []) : undefined,
      // Sessões do próprio viewer (qualquer modo): o front libera o compose só nas conversas
      // dessas sessões; nas demais, modo leitura (admin/gerente = supervisão).
      ownSessionIds: scope.ownSessionIds ?? [],
      // Modelo efetivo: o front decide se libera o compose por DONO-DA-LINHA (individual) ou por
      // ATRIBUIÇÃO/puxar (shared).
      attendanceMode: scope.attendanceMode ?? 'individual',
    };
  }

  async getWhatsappSessionDiagnostics(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, { aggregate: this.isAggregateUser(user), user });
    sessionScope.providerHealth = await this.getWhatsAppProviderHealth(companyId);
    const providerWarning = sessionScope.accessible
      ? null
      : {
          code: 'WHATSAPP_REQUIRED',
          message: 'Atendimento indisponível sem WhatsApp/celular vinculado.',
        };
    return {
      providerWarning,
      whatsappSession: this.buildWhatsappSessionMetadata(sessionScope),
    };
  }

  // PR1 — A VERDADE ÚNICA do "tem WhatsApp pra operar?". A tela deve usar SÓ `connectedForUi`
  // (= motor 'open' && o viewer tem linha própria ativa pra enviar). Tudo derivado do que já
  // existe — REUSA o reconciler do PR4 (via whatsappModal.getCompanyStatus, 1 chamada ao motor
  // no máximo, com throttle por tenantKey) e o escopo de sessão do inbox. Sem fetchInstances.
  async getWhatsappHealth(user: any): Promise<WhatsappHealthSnapshot> {
    const companyId = this.requireCompanyIdFromUser(user);
    const viewerId = Number(user?.id || 0) || undefined;
    const scope = await this.resolveInboxWhatsappSessionScope(companyId, {
      userId: viewerId,
      aggregate: this.isAggregateUser(user),
      user,
    });
    const attendanceMode: 'shared' | 'individual' = scope.attendanceMode === 'shared' ? 'shared' : 'individual';

    // canSend / dbSessionActive: linha PRÓPRIA do viewer no individual; pool da empresa no shared.
    // Reaproveita ownSessionIds/sessionIds do scope (mesma lógica de quem pode compor no inbox).
    const ownActive = (scope.ownSessionIds?.length ?? 0) > 0;
    const companyActive = (scope.sessionIds?.length ?? 0) > 0 || Boolean(scope.currentSessionId);
    const canSend = attendanceMode === 'shared' ? companyActive : ownActive;
    const dbSessionActive = attendanceMode === 'shared' ? companyActive : ownActive;
    const currentSessionId =
      scope.currentSessionId
      || (scope.ownSessionIds?.length ? String(scope.ownSessionIds[0]) : null)
      || (scope.sessionIds?.length ? String(scope.sessionIds[0]) : null);

    // Motor = fonte da verdade. UMA chamada no máximo: getCompanyStatus internamente passa pelo
    // reconciler do PR4 (recoverUserSessionIfProviderOpen) e usa fetchLiveSnapshot (connectionState),
    // nunca fetchInstances. No individual mandamos o userId pra mirar o tenantKey por-vendedor.
    const modalUserId = attendanceMode === 'individual' ? viewerId : undefined;
    let providerReachable = false;
    let providerInstanceState: WhatsappHealthSnapshot['providerInstanceState'] = 'unknown';
    let lastProviderError: string | null = null;
    let tenantKey: string | null = null;
    let promotedToConnected = false;
    try {
      const modal = await this.whatsappModal.getCompanyStatus(companyId, modalUserId);
      tenantKey = modal?.data?.tenantKey || null;
      lastProviderError = modal?.data?.lastError || null;
      // O motor respondeu se o provider está saudável (não disabled/misconfigured/unavailable).
      const providerHealth = modal?.data?.providerHealth;
      providerReachable = providerHealth === 'healthy';
      providerInstanceState = this.mapProviderInstanceState(modal?.status, modal?.data?.rawStatus);
      // Banco caído + motor 'open' = o reconciler promoveu a sessão (re-link). Sinaliza repair.
      promotedToConnected = providerInstanceState === 'open' && !dbSessionActive;
    } catch {
      // getCompanyStatus já trata o transitório internamente; um throw aqui = motor inacessível.
      providerReachable = false;
      providerInstanceState = 'unknown';
    }

    // tenantKey de fallback (motor não respondeu): usa o da sessão atual, se houver.
    if (!tenantKey && currentSessionId) {
      const sess = await this.prisma.whatsAppConnectionSession.findUnique({
        where: { id: currentSessionId },
        select: { tenantKey: true },
      });
      tenantKey = sess?.tenantKey || null;
    }

    // canReceiveWebhook: NÃO há helper barato de /webhook/find pronto no inbox e a regra do PR
    // proíbe criar chamada nova pesada. Derivo de forma conservadora: o motor só fica 'open' depois
    // de o webhook estar plugado no fluxo de start, então open+sessão ⇒ true; sem isso ⇒ null
    // (desconhecido, não "false" — não temos como afirmar). Nunca consultamos o endpoint aqui.
    const canReceiveWebhook: boolean | null =
      providerInstanceState === 'open' && dbSessionActive ? true : null;

    // lastInboundAt: última CompanyMessage INBOUND da sessão (índice [companyId, session, timestamp]).
    // Query barata e travada na sessão atual; sem sessão → null.
    let lastInboundAt: string | null = null;
    if (currentSessionId) {
      const inbound = await this.prisma.companyMessage.findFirst({
        where: { companyId, whatsappConnectionSessionId: currentSessionId, direction: 'INBOUND' },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      lastInboundAt = inbound?.timestamp ? inbound.timestamp.toISOString() : null;
    }

    // lastWebhookAt: NÃO existe coluna dedicada de webhook WhatsApp no schema (os lastWebhookAt
    // existentes são de cobrança/Financeiro). Sem fonte barata e fiel → null (conservador).
    const lastWebhookAt: string | null = null;

    // A regra: a tela mostra "conectado" SÓ quando dá pra operar de verdade.
    const connectedForUi = providerInstanceState === 'open' && canSend === true;

    // repairAction (conservador): precisa parear quando não há sessão e o motor não está open;
    // relinked quando o motor está open mas o banco ainda não tinha sessão ativa (reconciler promoveu).
    let repairAction: WhatsappHealthSnapshot['repairAction'] = 'none';
    if (promotedToConnected) {
      repairAction = 'relinked_session';
    } else if (!dbSessionActive && providerInstanceState !== 'open') {
      repairAction = 'needs_qr';
    }

    return {
      connectedForUi,
      canSend,
      canReceiveWebhook,
      providerReachable,
      providerInstanceState,
      dbSessionActive,
      currentSessionId,
      tenantKey,
      attendanceMode,
      lastWebhookAt,
      lastInboundAt,
      lastProviderError,
      repairAction,
    };
  }

  // Mapeia o status do motor (WhatsAppModalStatus / rawStatus) → estado canônico da instância.
  // 'open' só pra connected; 'connecting' pra starting/reconnecting/waiting_qr; 'close' pra
  // disconnected/offline/error; 'unknown' no resto.
  private mapProviderInstanceState(
    status?: string | null,
    rawStatus?: string | null,
  ): WhatsappHealthSnapshot['providerInstanceState'] {
    const raw = String(rawStatus || '').trim().toLowerCase();
    if (raw === 'open') return 'open';
    if (raw === 'connecting') return 'connecting';
    if (raw === 'close') return 'close';
    const s = String(status || '').trim().toLowerCase();
    if (s === 'connected') return 'open';
    if (s === 'starting' || s === 'reconnecting' || s === 'waiting_qr') return 'connecting';
    if (s === 'disconnected' || s === 'offline' || s === 'error') return 'close';
    return 'unknown';
  }

  // Painel "Modelo de atendimento" = só o ADMIN-DONO/master (gerente NÃO: ele não conecta nem
  // escolhe o modo — spec do dono). Linguagem: "WhatsApp da empresa", nunca "do admin".
  private assertCompanyAdminOwner(user: any) {
    if (this.isCompanyAdminOwner(user)) return;
    throw new ForbiddenException('Apenas o admin da empresa acessa o Modelo de atendimento.');
  }

  // Decora o estado DERIVADO da projeção (banco) com a leitura do MOTOR AO VIVO,
  // igual ao C3 do painel master/Empresas: motor `open` confirma `live` mesmo se
  // a projeção ainda não recarimbou; motor `close/closed` derruba um `live: true`
  // que a projeção (carimbo fresco mas sem confirmação recente) ainda não pegou —
  // é justamente a lacuna do "webhook atrasou e ninguém abriu a tela de conexão
  // nesse meio-tempo" (getWhatsappAdminPanel nunca disparava o reconciler). Motor
  // indisponível/sem instância pra esta chave → no-op (fallback honesto pra projeção).
  private decorateDerivedWithMotor(
    derived: { live: boolean; motorState: string; seenAgoSeconds: number | null; stale: boolean },
    motorState: string | undefined,
  ) {
    if (!motorState) return derived;
    if (motorState === 'open') {
      if (derived.live) return derived;
      return { ...derived, live: true, motorState: 'open', stale: false };
    }
    if ((motorState === 'close' || motorState === 'closed') && derived.live) {
      return { ...derived, live: false, motorState: 'close' };
    }
    return derived;
  }

  // Etapa 1 (read-only): alimenta o painel admin de uma vez (sem gambiarra no front).
  async getWhatsappAdminPanel(user: any) {
    this.assertCompanyAdminOwner(user);
    const companyId = this.requireCompanyIdFromUser(user);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        whatsappAttendanceMode: true,
        currentWhatsappConnectionSession: {
          select: {
            id: true,
            displayPhone: true,
            phoneNormalized: true,
            status: true,
            connectedAt: true,
            // WEBWHATS-ARQ3 S3 — projeção canônica (frescor + estado do motor).
            lastReconciledAt: true,
            motorState: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    const rawMode = String(company?.whatsappAttendanceMode || '').trim().toLowerCase();
    const mode = rawMode === 'shared' || rawMode === 'individual' ? rawMode : null;
    const effectiveMode = mode ?? 'individual';

    // WEBWHATS-ARQ3 S3 — a VERDADE do "conectado?" agora sai da PROJEÇÃO (motor ao vivo carimbado),
    // não de `status === 'active'` cru. Isso mata o "Conectado fantasma": sessão que ficou 'active'
    // no banco mas cujo socket morreu (motorState 'close' OU carimbo velho) não mente mais.
    //
    // Lacuna que sobrava (achado da campanha TESTE-GERAL, mesma classe do C3): este endpoint só
    // lia a PROJEÇÃO — nunca consultava o motor. A projeção só recarimba via webhook (push) ou via
    // o reconciler pull de OUTRA rota (status do modal de conexão); se o webhook atrasar/falhar e
    // ninguém tiver aberto aquela tela dentro da janela de frescor (180s), o painel podia mostrar
    // "conectado" com o chip já caído no motor. Decoramos aqui com uma leitura SÓ-LEITURA do motor
    // (cache 60s, mesmo padrão do C3 em ModulesService.listMasterOverview) — motor `open` confirma
    // vivo, motor `close/closed` derruba o fantasma; motor indisponível = no-op (fallback honesto).
    const nowMs = Date.now();
    const motorInstances = await this.getMotorInstancesCached();
    const motorStateByCompany = motorInstances ? buildMotorStateByCompany(motorInstances) : new Map<number, string>();
    const motorStateByCompanyUser = motorInstances ? buildMotorStateByCompanyUser(motorInstances) : new Map<string, string>();

    const principal = company?.currentWhatsappConnectionSession || null;
    const principalDerivedRaw = WhatsAppConnectionProjectionService.derive(principal as any, nowMs);
    const principalUserId = Number((principal?.user as any)?.id || 0);
    // Sessão principal por-usuário (individual gravado sem sufixo aplicável) tenta a chave do
    // usuário primeiro; sem usuário (compartilhado legado) cai no agregado da empresa.
    const principalMotorState = principalUserId
      ? motorStateByCompanyUser.get(`${companyId}:${principalUserId}`) ?? motorStateByCompany.get(companyId)
      : motorStateByCompany.get(companyId);
    const principalDerived = this.decorateDerivedWithMotor(principalDerivedRaw, principalMotorState);
    const companyWhatsapp = {
      connected: principalDerived.live,
      phone: this.cleanDisplayPhone(principal?.displayPhone || principal?.phoneNormalized || null),
      connectedByUserId: (principal?.user as any)?.id ? String((principal!.user as any).id) : null,
      connectedByName: (principal?.user as any)?.name || null,
      lastActivityAt: principal?.connectedAt || null,
      sessionId: principal?.id ? String(principal.id) : null,
      // Frescor da projeção — o front mostra "visto há Xs" e sabe quando não confiar cegamente.
      seenAgoSeconds: principalDerived.seenAgoSeconds,
      motorState: principalDerived.motorState,
      stale: principalDerived.stale,
    };

    const sessions = await this.prisma.whatsAppConnectionSession.findMany({
      where: { companyId, provider: 'webwhats', status: 'active' },
      select: {
        id: true,
        userId: true,
        displayPhone: true,
        phoneNormalized: true,
        status: true,
        connectedAt: true,
        lastReconciledAt: true,
        motorState: true,
      },
    });
    const sessionByUser = new Map<
      number,
      { id: string; phone: string | null; connectedAt: Date | null; seenAgoSeconds: number | null; motorState: string; stale: boolean; live: boolean }
    >();
    for (const s of sessions) {
      const uid = Number(s.userId || 0);
      if (uid && !sessionByUser.has(uid)) {
        const derivedRaw = WhatsAppConnectionProjectionService.derive(s as any, nowMs);
        // Granularidade "Equipe" = POR USUÁRIO: instância do motor `company-{id}-user-{uid}`.
        const derived = this.decorateDerivedWithMotor(derivedRaw, motorStateByCompanyUser.get(`${companyId}:${uid}`));
        sessionByUser.set(uid, {
          id: String(s.id),
          phone: this.cleanDisplayPhone(s.displayPhone || s.phoneNormalized || null),
          connectedAt: s.connectedAt || null,
          seenAgoSeconds: derived.seenAgoSeconds,
          motorState: derived.motorState,
          stale: derived.stale,
          live: derived.live,
        });
      }
    }

    const convBySession = await this.prisma.companyConversation.groupBy({
      by: ['whatsappConnectionSessionId'],
      where: { companyId, channel: 'whatsapp' },
      _count: { _all: true },
    });
    const openBySessionId = new Map<string, number>();
    for (const row of convBySession) {
      if (row.whatsappConnectionSessionId) openBySessionId.set(String(row.whatsappConnectionSessionId), row._count._all);
    }

    const assignedByUser = await this.prisma.companyConversation.groupBy({
      by: ['assignedUserId'],
      where: { companyId, channel: 'whatsapp', humanAssigned: true },
      _count: { _all: true },
    });
    const assignedCountByUser = new Map<number, number>();
    for (const row of assignedByUser) {
      if (row.assignedUserId) assignedCountByUser.set(Number(row.assignedUserId), row._count._all);
    }

    const users = await this.prisma.user.findMany({
      where: { companyId, isActive: true, role: { in: ['USER', 'ADMIN', 'USERMASTER'] } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isSystemMaster: true,
        canViewBilling: true,
      },
    });

    const team = users.map((u) => {
      // RBAC Sprint 3: rótulo do time derivado da fonte única (resolveActorKind).
      const kind = resolveActorKind(u);
      const roleLabel = kind === 'master' || kind === 'dono' ? 'admin' : kind === 'gerente' ? 'gerente' : 'vendedor';
      const sess = sessionByUser.get(Number(u.id)) || null;
      return {
        userId: String(u.id),
        name: u.name || u.username || `#${u.id}`,
        role: roleLabel,
        canAttendSharedInbox: true,
        // WEBWHATS-ARQ3 S3 — selo HONESTO: só "Conectado" quando a projeção diz vivo (motor
        // não-close + carimbo fresco). Um chip morto que ficou 'active' no banco NÃO aparece
        // mais como Conectado (mata o fantasma que fazia a vendedora perder o dia).
        whatsappConnected: Boolean(sess?.live),
        // Existe uma sessão ATIVA no banco para este user? (independe de estar viva). Deixa o
        // painel oferecer "Derrubar conexão" também no ÓRFÃO (RUIM#2): projeção velha/close mas
        // linha ainda 'active' — a rotina disconnectCompanySession limpa motor + projeção juntos.
        whatsappHasSession: Boolean(sess?.id),
        whatsappPhone: sess?.phone || null,
        whatsappConnectedAt: sess?.connectedAt || null,
        // Frescor por atendente (o front mostra "visto há Xs").
        whatsappSeenAgoSeconds: sess?.seenAgoSeconds ?? null,
        whatsappMotorState: sess?.motorState ?? null,
        whatsappStale: Boolean(sess?.stale),
        openConversations: sess?.id ? openBySessionId.get(sess.id) || 0 : 0,
        currentAssignedConversations: assignedCountByUser.get(Number(u.id)) || 0,
      };
    });

    return { mode, effectiveMode, companyWhatsapp, team };
  }

  // Admin "derruba" o chip de um atendente pelo painel da Equipe (modo individual):
  // logout+delete limpo da sessão dele no motor. O atendente reconecta quando quiser
  // (acesso ao Atendimento já é o gate). Não mexe em permissão — ela não existe mais.
  async disconnectMemberWhatsapp(user: any, targetUserId: number) {
    this.assertCompanyAdminOwner(user);
    const companyId = this.requireCompanyIdFromUser(user);
    const target = await this.prisma.user.findFirst({
      where: { id: Number(targetUserId) || 0, companyId },
      select: { id: true, name: true, username: true },
    });
    if (!target) throw new BadRequestException('Atendente inválido.');
    await this.whatsappModal.disconnectCompanySession(companyId, target.id);
    return { ok: true, userId: String(target.id) };
  }

  private buildWhatsappSessionConversationAliases(conversation: any) {
    const metadata = this.parseConversationMetadata(conversation?.metadata);
    const values = [
      conversation?.contact,
      metadata?.whatsappRemoteJid,
      metadata?.whatsappRemoteJidAlt,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    const contacts = new Set<string>();
    const metadataTokens = new Set<string>();
    for (const value of values) {
      if (value.includes('@g.us') || value.includes('@broadcast')) continue;
      if (value.includes('@')) {
        metadataTokens.add(value);
        const digits = value.split('@')[0]?.replace(/\D/g, '') || '';
        if (digits.length >= 10) {
          contacts.add(`+${digits}`);
          contacts.add(digits);
          metadataTokens.add(digits);
        }
        continue;
      }
      contacts.add(value);
      const phone = this.normalizeConversationPhone(value);
      if (phone) {
        contacts.add(`+${phone}`);
        contacts.add(phone);
        metadataTokens.add(phone);
        if (phone.startsWith('55')) {
          contacts.add(`+${phone.slice(2)}`);
          contacts.add(phone.slice(2));
          metadataTokens.add(phone.slice(2));
        }
      }
    }
    return {
      contacts: Array.from(contacts).filter(Boolean),
      metadataTokens: Array.from(metadataTokens).filter(Boolean),
    };
  }

  private getNestedMetadataRecord(value: unknown): Record<string, any> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, any>;
  }

  private parseLooseJsonRecord(value: unknown): Record<string, any> | null {
    const nested = this.getNestedMetadataRecord(value);
    if (nested) return nested;
    if (typeof value !== 'string') return null;
    try {
      const parsed = JSON.parse(value);
      return this.getNestedMetadataRecord(parsed);
    } catch {
      return null;
    }
  }

  private isConversationMetadataInTrash(metadata: Record<string, any>, flowResult?: string | null) {
    const vendasAgendaQueue = this.getNestedMetadataRecord(metadata?.vendasAgendaQueue);
    const manualQueue = String(
      metadata?.inboxManualQueueOverride || vendasAgendaQueue?.manualQueueOverride || '',
    ).trim().toLowerCase();
    const queueTarget = String(
      metadata?.queueTarget || metadata?.routeTarget || vendasAgendaQueue?.queueTarget || vendasAgendaQueue?.routeTarget || '',
    ).trim().toLowerCase();

    return (
      manualQueue === 'archived' ||
      queueTarget === 'excluidos' ||
      queueTarget === 'excluded' ||
      [
        'local_deleted',
        'manual_closed',
        'encerrado',
        'encerrado_operador',
        'bot_closed',
      ].includes(String(flowResult || '').trim().toLowerCase()) ||
      [
        metadata?.inboxLocalDeleted,
        metadata?.localDeleted,
        metadata?.whatsappArchived,
        metadata?.chatArchived,
        metadata?.isArchived,
        metadata?.archived,
        metadata?.whatsappChatArchived,
      ].some((value) => this.parseBooleanMetadataFlag(value))
    );
  }

  private isConversationKnownWithoutWhatsapp(metadata: Record<string, any>) {
    const vendasAgendaQueue = this.getNestedMetadataRecord(metadata?.vendasAgendaQueue);
    const vendasProspeccao = this.getNestedMetadataRecord(metadata?.vendasProspeccao);
    const status = String(
      metadata?.whatsappAvailabilityStatus ||
        metadata?.vendasWhatsappAvailabilityStatus ||
        vendasAgendaQueue?.whatsappAvailabilityStatus ||
        '',
    ).trim().toLowerCase();
    return status === 'unavailable' || String(vendasProspeccao?.stage || '').trim().toLowerCase() === 'no_whatsapp';
  }

  private isConversationPersonalContact(metadata: Record<string, any>) {
    const vendasAgendaQueue = this.getNestedMetadataRecord(metadata?.vendasAgendaQueue);
    return [
      metadata?.inboxPersonalContact,
      metadata?.personalContact,
      metadata?.whatsappPersonalContact,
    ].some((value) => this.parseBooleanMetadataFlag(value));
  }

  private canTrashDeleteFallbackToLocal(error: unknown) {
    const providerError = error instanceof WebwhatsProviderError ? error : null;
    const code = String((providerError as any)?.code || (error as any)?.code || '').trim().toUpperCase();
    if (code === 'WEBWHATS_NOT_CONNECTED') return false;
    const message = String(
      providerError?.providerMessage ||
        providerError?.message ||
        (error instanceof Error ? error.message : ''),
    ).toLowerCase();

    return (
      code.includes('REMOTE_JID_MISSING') ||
      code.includes('CONVERSATION_NOT_FOUND') ||
      code.includes('CHAT_REMOTE_JID_MISSING') ||
      message.includes('última mensagem real') ||
      message.includes('ultima mensagem real') ||
      message.includes('last message') ||
      message.includes('chat ja nao existia') ||
      message.includes('chat já não existia') ||
      message.includes('chat não encontrada') ||
      message.includes('chat nao encontrada') ||
      message.includes('chat not found') ||
      message.includes('already deleted') ||
      message.includes('already removed') ||
      message.includes('nao encontrad') ||
      message.includes('não encontrad')
    );
  }

  private hasPersistedWhatsAppDisplayName(metadataRaw: string | null | undefined) {
    const metadata = this.parseConversationMetadata(metadataRaw);
    return Boolean(
      this.normalizeDisplayNameCandidate(
        metadata?.whatsappContactName ||
          metadata?.whatsappProfileName ||
          metadata?.waNickname ||
          metadata?.whatsappName ||
          null,
      ),
    );
  }

  private hasPersistedWhatsAppAvatar(metadataRaw: string | null | undefined) {
    const metadata = this.parseConversationMetadata(metadataRaw);
    return Boolean(
      String(
        metadata?.whatsappAvatarUrl || metadata?.profilePicUrl || metadata?.avatarUrl || '',
      ).trim(),
    );
  }

  private normalizeMessageMetadataText(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private isTransientWhatsAppMediaUrl(value: string) {
    try {
      const parsed = new URL(value);
      return /(^|\.)whatsapp\.net$/i.test(parsed.hostname) && !/^pps\.whatsapp\.net$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  private normalizeExistingLocalMediaAssetUrl(value: string) {
    const normalized = this.normalizeMessageMetadataText(value);
    if (!normalized) return null;
    const localPath = normalized.startsWith('/') ? normalized : `/${normalized}`;
    if (!localPath.startsWith('/uploads/')) return localPath;
    // P1.3: mídia do inbox mora no storage privado (com fallback pro public legado
    // durante a transição) — o resolve público não a enxerga mais.
    const inboxFilename = extractInboxMediaFilename(localPath);
    if (inboxFilename) {
      const candidates = getInboxMediaFileCandidates(inboxFilename) || [];
      return candidates.some((candidate) => existsSync(candidate)) ? localPath : null;
    }
    const diskPath = resolveBackendPublicAssetPath(localPath);
    if (!diskPath || !existsSync(diskPath)) return null;
    return localPath;
  }

  private isInlineBase64MediaValue(value: string) {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    if (/^data:[^,]+;base64,/i.test(normalized)) return true;
    const compact = normalized.replace(/\s+/g, '');
    return compact.length > 512 && /^[a-z0-9+/]+={0,2}$/i.test(compact) && !/[./\\:_-]/.test(compact);
  }

  private buildMediaPlaceholderForResponse(messageType: unknown) {
    const normalizedType = String(messageType || '')
      .trim()
      .toLowerCase();
    if (normalizedType.includes('image')) return '[Imagem recebida]';
    if (normalizedType.includes('video')) return '[Video recebido]';
    if (normalizedType.includes('audio')) return '[Audio recebido]';
    if (normalizedType.includes('sticker')) return '[Figurinha recebida]';
    if (normalizedType.includes('document')) return '[Documento recebido]';
    return '[Midia recebida]';
  }

  private normalizeConversationMessageContentForResponse(value: unknown, messageType: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return this.isInlineBase64MediaValue(normalized)
      ? this.buildMediaPlaceholderForResponse(messageType)
      : normalized;
  }

  // P1.3: na SAÍDA dos payloads, path de mídia do inbox vira URL ASSINADA (o valor
  // armazenado continua o path cru; assinatura/host velhos são descartados e a
  // assinatura sai sempre fresca).
  private normalizeStoredMediaAssetUrl(value: unknown) {
    const normalized = this.normalizeStoredMediaAssetUrlRaw(value);
    if (!normalized) return null;
    return signInboxMediaUrlIfLocal(normalized);
  }

  private normalizeStoredMediaAssetUrlRaw(value: unknown) {
    const normalized = this.normalizeMessageMetadataText(value);
    if (!normalized) return null;
    if (this.isInlineBase64MediaValue(normalized)) return null;
    if (/^https?:\/\//i.test(normalized)) {
      if (this.isTransientWhatsAppMediaUrl(normalized)) {
        return null;
      }
      try {
        const parsed = new URL(normalized);
        const uploadsIndex = parsed.pathname.indexOf('/uploads/');
        if (uploadsIndex >= 0) {
          const localPath = `${parsed.pathname.slice(uploadsIndex)}${parsed.search || ''}${parsed.hash || ''}`;
          return this.normalizeExistingLocalMediaAssetUrl(localPath) ? normalized : null;
        }
      } catch {
        return normalized;
      }
      return normalized;
    }

    if (normalized.startsWith('/')) {
      return this.normalizeExistingLocalMediaAssetUrl(normalized);
    }

    const relative = normalized
      .replace(/^\.?\//, '')
      .replace(/^public\//i, '')
      .trim();
    if (!relative) return null;

    if (relative.startsWith('uploads/')) {
      return this.normalizeExistingLocalMediaAssetUrl(`/${relative}`);
    }

    if (/^[^\\/?#:*"<>|]+\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|m4v|mp3|ogg|oga|wav|m4a|opus|aac|pdf|docx?|xlsx?|csv|txt)$/i.test(relative)) {
      return this.normalizeExistingLocalMediaAssetUrl(`/uploads/inbox/${relative}`);
    }

    return normalized;
  }

  private unwrapMessagePayload(payloadRaw: unknown): Record<string, any> {
    const payload =
      payloadRaw && typeof payloadRaw === 'object' && !Array.isArray(payloadRaw)
        ? (payloadRaw as Record<string, any>)
        : {};
    const nested =
      payload.ephemeralMessage?.message ||
      payload.viewOnceMessage?.message ||
      payload.viewOnceMessageV2?.message ||
      payload.viewOnceMessageV2Extension?.message ||
      payload.documentWithCaptionMessage?.message ||
      null;
    if (nested && typeof nested === 'object') {
      return this.unwrapMessagePayload(nested);
    }
    return payload;
  }

  private normalizeConversationMessageType(
    messageTypeRaw: unknown,
    rawPayload: Record<string, any>,
    variables: Record<string, any>,
  ) {
    if (variables?.isDeleted || variables?.deletedAt) {
      return 'deleted';
    }

    const attachmentKind = String((variables?.attachment as any)?.kind || variables?.attachmentKind || '')
      .trim()
      .toLowerCase();
    if (['image', 'video', 'document', 'audio', 'sticker'].includes(attachmentKind)) {
      return attachmentKind;
    }

    const normalized = String(messageTypeRaw || '').trim().toLowerCase();
    if (normalized.includes('image')) return 'image';
    if (normalized.includes('video') || normalized.includes('ptv')) return 'video';
    if (normalized.includes('document')) return 'document';
    if (normalized.includes('audio')) return 'audio';
    if (normalized.includes('sticker')) return 'sticker';
    if (normalized.includes('reaction')) return 'reaction';
    if (normalized.includes('protocol') || normalized.includes('deleted') || normalized.includes('revoke')) {
      return 'deleted';
    }
    if (normalized.includes('interactive') || normalized.includes('button') || normalized.includes('list')) {
      return 'interactive';
    }

    const payload = this.unwrapMessagePayload(rawPayload?.message || rawPayload);
    if (String((payload as any).protocolMessage?.type || '').trim().toUpperCase() === 'REVOKE') {
      return 'deleted';
    }
    if ((payload as any).imageMessage) return 'image';
    if ((payload as any).videoMessage || (payload as any).ptvMessage) return 'video';
    if ((payload as any).documentMessage) return 'document';
    if ((payload as any).audioMessage) return 'audio';
    if ((payload as any).stickerMessage) return 'sticker';
    if ((payload as any).reactionMessage) return 'reaction';
    if (
      (payload as any).interactiveMessage ||
      (payload as any).buttonsMessage ||
      (payload as any).buttonsResponseMessage ||
      (payload as any).listMessage ||
      (payload as any).listResponseMessage ||
      (payload as any).templateButtonReplyMessage
    ) {
      return 'interactive';
    }

    return normalized || 'text';
  }

  private isMetadataRecord(value: unknown): value is Record<string, any> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private normalizeInteractiveMetadataText(value: unknown) {
    if (typeof value === 'string') return this.normalizeMessageMetadataText(value);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return this.normalizeMessageMetadataText(String(value));
    }
    if (!this.isMetadataRecord(value)) return null;
    return (
      this.normalizeMessageMetadataText(value.text) ||
      this.normalizeMessageMetadataText(value.body) ||
      this.normalizeMessageMetadataText(value.title) ||
      this.normalizeMessageMetadataText(value.displayText) ||
      this.normalizeMessageMetadataText(value.buttonText) ||
      this.normalizeMessageMetadataText(value.selectedDisplayText) ||
      this.normalizeMessageMetadataText(value.name) ||
      null
    );
  }

  private parseInteractiveButtonParams(value: unknown) {
    const raw = this.normalizeMessageMetadataText(value);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return this.isMetadataRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private collectInteractiveMetadataOptions(value: unknown, output: string[] = [], depth = 0) {
    if (depth > 8 || output.length >= 30 || !value) return output;
    if (Array.isArray(value)) {
      for (const item of value) this.collectInteractiveMetadataOptions(item, output, depth + 1);
      return output;
    }
    if (!this.isMetadataRecord(value)) return output;

    const optionText =
      this.normalizeMessageMetadataText(value.displayText) ||
      this.normalizeInteractiveMetadataText(value.buttonText) ||
      this.normalizeMessageMetadataText(value.title) ||
      this.normalizeMessageMetadataText(value.name) ||
      this.normalizeMessageMetadataText(value.text);
    if (optionText && !output.includes(optionText)) output.push(optionText);

    const params = this.parseInteractiveButtonParams(value.buttonParamsJson);
    const paramsText =
      this.normalizeMessageMetadataText(params?.display_text) ||
      this.normalizeMessageMetadataText(params?.displayText) ||
      this.normalizeMessageMetadataText(params?.title) ||
      this.normalizeMessageMetadataText(params?.text) ||
      this.normalizeMessageMetadataText(params?.name);
    if (paramsText && !output.includes(paramsText)) output.push(paramsText);

    for (const candidate of [
      value.buttons,
      value.button,
      value.sections,
      value.rows,
      value.hydratedTemplate,
      value.nativeFlowMessage?.buttons,
      value.hydratedButtons,
      value.templateButtons,
      value.quickReplyButton,
      value.urlButton,
      value.callButton,
    ]) {
      this.collectInteractiveMetadataOptions(candidate, output, depth + 1);
    }
    return output;
  }

  private findFirstInteractiveMetadataText(value: unknown, keys: string[], depth = 0): string | null {
    if (depth > 8 || !value) return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findFirstInteractiveMetadataText(item, keys, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (!this.isMetadataRecord(value)) return null;

    for (const key of keys) {
      const found = this.normalizeInteractiveMetadataText(value[key]);
      if (found) return found;
    }
    for (const child of Object.values(value)) {
      const found = this.findFirstInteractiveMetadataText(child, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }

  private getInteractiveMetadataPayload(payload: Record<string, any>) {
    return (
      payload.interactiveMessage ||
      payload.buttonsMessage ||
      payload.templateMessage ||
      payload.listMessage ||
      payload.hydratedTemplate ||
      payload.nativeFlowMessage ||
      payload.buttonsResponseMessage ||
      payload.listResponseMessage ||
      payload.templateButtonReplyMessage ||
      payload.interactiveResponseMessage ||
      null
    );
  }

  private formatInteractiveMetadataText(payload: Record<string, any>) {
    const interactivePayload = this.getInteractiveMetadataPayload(payload);
    const root = this.isMetadataRecord(interactivePayload) ? interactivePayload : payload;
    const body = this.findFirstInteractiveMetadataText(root, ['body', 'contentText', 'hydratedContentText', 'text', 'caption', 'description']);
    const title = this.findFirstInteractiveMetadataText(root, ['title', 'header', 'hydratedTitle']);
    const footer = this.findFirstInteractiveMetadataText(root, ['footer', 'footerText', 'hydratedFooterText']);
    const options = this.collectInteractiveMetadataOptions(root).filter(
      (option) => option !== body && option !== title && option !== footer,
    );
    if (!body && !title && !footer && !options.length) return null;

    const lines = ['Mensagem interativa recebida:'];
    const content = [title, body, footer].filter(Boolean) as string[];
    if (content.length) lines.push('', ...content);
    if (options.length) lines.push('', 'Opções:', ...options.map((option) => `• ${option}`));
    return lines.join('\n').trim();
  }

  private extractMessageTextFromPayload(payloadRaw: unknown, normalizedType: string) {
    const payload = this.unwrapMessagePayload(payloadRaw);
    if (normalizedType === 'deleted') return '[mensagem apagada]';
    const conversation = this.normalizeMessageMetadataText((payload as any).conversation);
    const extendedText = this.normalizeMessageMetadataText((payload as any).extendedTextMessage?.text);
    if (conversation || extendedText) return conversation || extendedText || '';

    const reactionText =
      this.normalizeMessageMetadataText((payload as any).reactionMessage?.text) ||
      this.normalizeMessageMetadataText((payload as any).reactionMessage?.emoji);
    if (reactionText) return reactionText;

    if (normalizedType === 'image') {
      return (
        this.normalizeMessageMetadataText((payload as any).imageMessage?.caption) ||
        this.normalizeMessageMetadataText((payload as any).image?.caption) ||
        '[imagem recebida]'
      );
    }
    if (normalizedType === 'video') {
      return (
        this.normalizeMessageMetadataText((payload as any).videoMessage?.caption) ||
        this.normalizeMessageMetadataText((payload as any).video?.caption) ||
        '[video recebido]'
      );
    }
    if (normalizedType === 'document') {
      return (
        this.normalizeMessageMetadataText((payload as any).documentMessage?.caption) ||
        this.normalizeMessageMetadataText((payload as any).documentMessage?.fileName) ||
        this.normalizeMessageMetadataText((payload as any).documentMessage?.title) ||
        this.normalizeMessageMetadataText((payload as any).document?.caption) ||
        this.normalizeMessageMetadataText((payload as any).document?.filename) ||
        this.normalizeMessageMetadataText((payload as any).document?.fileName) ||
        '[documento recebido]'
      );
    }
    if (normalizedType === 'audio') return '[audio recebido]';
    if (normalizedType === 'sticker') return '[figurinha recebida]';
    if (normalizedType === 'interactive') {
      return (
        this.normalizeMessageMetadataText((payload as any).buttonsResponseMessage?.selectedDisplayText) ||
        this.normalizeMessageMetadataText((payload as any).templateButtonReplyMessage?.selectedDisplayText) ||
        this.normalizeMessageMetadataText((payload as any).listResponseMessage?.title) ||
        this.normalizeMessageMetadataText((payload as any).interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) ||
        this.formatInteractiveMetadataText(payload) ||
        '[interacao recebida]'
      );
    }

    return '';
  }

  private getMessageContextInfo(payloadRaw: unknown) {
    const payload = this.unwrapMessagePayload(payloadRaw);
    return (
      (payload as any).extendedTextMessage?.contextInfo ||
      (payload as any).imageMessage?.contextInfo ||
      (payload as any).videoMessage?.contextInfo ||
      (payload as any).documentMessage?.contextInfo ||
      (payload as any).audioMessage?.contextInfo ||
      (payload as any).image?.context ||
      (payload as any).video?.context ||
      (payload as any).document?.context ||
      (payload as any).audio?.context ||
      (payload as any).context ||
      (payload as any).buttonsResponseMessage?.contextInfo ||
      (payload as any).templateButtonReplyMessage?.contextInfo ||
      (payload as any).listResponseMessage?.contextInfo ||
      null
    );
  }

  private extractQuotedMessagePreview(contextInfo: any, variables: Record<string, any>) {
    const explicitPreview = this.normalizeMessageMetadataText(
      variables?.quotedPreview || variables?.quotedContent,
    );
    if (explicitPreview) return explicitPreview;

    const quotedMessage =
      contextInfo?.quotedMessage && typeof contextInfo.quotedMessage === 'object'
        ? contextInfo.quotedMessage
        : null;
    if (!quotedMessage) return null;

    const quotedType = this.normalizeConversationMessageType(null, { message: quotedMessage }, {});
    return this.extractMessageTextFromPayload(quotedMessage, quotedType);
  }

  private normalizeStoredFileSize(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
    }
    if (value && typeof value === 'object') {
      const low = Number((value as any).low ?? 0);
      const high = Number((value as any).high ?? 0);
      if (Number.isFinite(low) || Number.isFinite(high)) {
        return Math.max(0, Math.floor((Number.isFinite(high) ? high : 0) * 4294967296 + (Number.isFinite(low) ? low : 0)));
      }
    }
    return null;
  }

  private resolveConversationMessageSenderName(
    conversationContact: string,
    conversationMetadata: Record<string, any>,
    rawPayload: Record<string, any>,
  ) {
    if (!String(conversationContact || '').trim().toLowerCase().includes('@g.us')) {
      return null;
    }

    const conversationNames = new Set(
      [
        conversationMetadata?.whatsappContactName,
        conversationMetadata?.waNickname,
        conversationMetadata?.whatsappName,
        conversationMetadata?.whatsappProfileName,
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean),
    );
    const participant = this.normalizeMessageMetadataText(rawPayload?.participant || rawPayload?.key?.participant);
    const participantAlt = this.normalizeMessageMetadataText(
      rawPayload?.key?.participantAlt || rawPayload?.participantAlt || rawPayload?.key?.remoteJidAlt,
    );
    const participantPhone = normalizeWhatsAppPhone(String(participantAlt || participant || ''));
    const pushName = this.normalizeDisplayNameCandidate(
      rawPayload?.pushName,
      participantPhone || participantAlt || participant,
    );
    if (pushName && !conversationNames.has(pushName.toLowerCase())) {
      return pushName;
    }
    return participantPhone || participantAlt || participant || null;
  }

  private buildConversationMessageMetadata(
    message: any,
    conversationContact: string,
    conversationMetadata: Record<string, any>,
  ) {
    const rawPayload = this.parseConversationMetadata(message?.rawPayload);
    const variables = this.parseConversationMetadata(message?.variablesJson);
    const payload = this.unwrapMessagePayload(rawPayload?.message || rawPayload);
    const normalizedMessageType = this.normalizeConversationMessageType(
      message?.messageType,
      rawPayload,
      variables,
    );
    const attachment =
      variables?.attachment && typeof variables.attachment === 'object' && !Array.isArray(variables.attachment)
        ? (variables.attachment as Record<string, any>)
        : {};

    const mediaSource =
      normalizedMessageType === 'image'
        ? (payload as any).imageMessage || (payload as any).image
        : normalizedMessageType === 'video'
          ? (payload as any).videoMessage || (payload as any).ptvMessage || (payload as any).video
          : normalizedMessageType === 'document'
            ? (payload as any).documentMessage || (payload as any).document
            : normalizedMessageType === 'audio'
              ? (payload as any).audioMessage || (payload as any).audio
              : normalizedMessageType === 'sticker'
                ? (payload as any).stickerMessage || (payload as any).sticker
                : null;

    const incomingNormalization =
      variables?.incomingNormalization && typeof variables.incomingNormalization === 'object'
        ? (variables.incomingNormalization as Record<string, any>)
        : {};
    const resolvedTextFromNormalization = this.normalizeMessageMetadataText(incomingNormalization.text);
    const resolvedTextFromPayload = resolvedTextFromNormalization || this.extractMessageTextFromPayload(payload, normalizedMessageType);
    const storedBody = String(message?.body || '').trim();
    const storedBodyLower = storedBody.toLowerCase();
    const resolvedText =
      !storedBody || storedBodyLower === '[mensagem sincronizada]' || storedBodyLower === '[interacao recebida]'
        ? resolvedTextFromPayload
        : storedBody;
    const contextInfo = this.getMessageContextInfo(payload);
    const participant = this.normalizeMessageMetadataText(rawPayload?.participant || rawPayload?.key?.participant);
    const participantAlt = this.normalizeMessageMetadataText(
      rawPayload?.key?.participantAlt || rawPayload?.participantAlt || rawPayload?.key?.remoteJidAlt,
    );
    const senderPhone = normalizeWhatsAppPhone(String(participantAlt || participant || '')) || null;
    const providerMessageId = this.normalizeMessageMetadataText(message?.providerMessageId);
    const providerKeyId =
      this.extractWebwhatsRawMessageIdFromProviderMessageId(providerMessageId) ||
      this.normalizeMessageMetadataText(rawPayload?.key?.id);
    const deletedOriginalText =
      this.normalizeMessageMetadataText(variables?.deletedOriginalText) ||
      this.normalizeMessageMetadataText(variables?.deletedOriginalBody);
    const deletedOriginalMessageType =
      this.normalizeMessageMetadataText(variables?.deletedOriginalMessageType) ||
      this.normalizeMessageMetadataText(variables?.deletedOriginalKind);

    const metadata = Object.fromEntries(
      Object.entries({
        normalizedMessageType,
        incomingMessageKind: this.normalizeMessageMetadataText(incomingNormalization.kind),
        interactivePayloadKind: this.normalizeMessageMetadataText(incomingNormalization.interactivePayloadKind),
        rawMessageType: this.normalizeMessageMetadataText(String(message?.messageType || '').toLowerCase()),
        resolvedText,
        providerMessageId,
        providerKeyId,
        fromMe:
          rawPayload?.key?.fromMe === undefined || rawPayload?.key?.fromMe === null
            ? String(message?.direction || '').trim().toUpperCase() === 'OUTBOUND'
            : Boolean(rawPayload?.key?.fromMe),
        remoteJid: this.normalizeMessageMetadataText(rawPayload?.key?.remoteJid),
        remoteJidAlt: this.normalizeMessageMetadataText(rawPayload?.key?.remoteJidAlt),
        participant,
        participantAlt,
        pushName: this.normalizeMessageMetadataText(rawPayload?.pushName),
        senderName: this.resolveConversationMessageSenderName(conversationContact, conversationMetadata, rawPayload),
        senderPhone,
        reactionTargetKeyId: this.normalizeMessageMetadataText(
          (payload as any).reactionMessage?.key?.id ||
            (payload as any).reaction?.message_id ||
            (payload as any).reaction?.messageId,
        ),
        reactionEmoji:
          this.normalizeMessageMetadataText((payload as any).reactionMessage?.text) ||
          this.normalizeMessageMetadataText((payload as any).reactionMessage?.emoji) ||
          this.normalizeMessageMetadataText((payload as any).reaction?.emoji) ||
          this.normalizeMessageMetadataText((payload as any).reaction?.text),
        quotedMessageId: this.normalizeMessageMetadataText(
          variables?.quotedMessageId || contextInfo?.stanzaId || contextInfo?.id,
        ),
        quotedPreview: this.extractQuotedMessagePreview(contextInfo, variables),
        mediaUrl: this.normalizeStoredMediaAssetUrl(
          attachment?.url ||
            attachment?.mediaUrl ||
            attachment?.attachmentUrl ||
            mediaSource?.url ||
            mediaSource?.mediaUrl ||
            mediaSource?.attachmentUrl ||
            mediaSource?.link,
        ),
        previewUrl: this.normalizeStoredMediaAssetUrl(
          attachment?.previewUrl ||
            attachment?.url ||
            mediaSource?.previewUrl ||
            mediaSource?.url ||
            mediaSource?.link,
        ),
        mimeType: this.normalizeMessageMetadataText(
          attachment?.mimeType || mediaSource?.mimetype || mediaSource?.mime_type,
        ),
        fileName: this.normalizeMessageMetadataText(
          attachment?.fileName || mediaSource?.fileName || mediaSource?.filename || mediaSource?.title,
        ),
        fileSize: this.normalizeStoredFileSize(
          attachment?.fileSize ?? mediaSource?.fileLength ?? mediaSource?.file_size ?? mediaSource?.filesize,
        ),
        durationSeconds: this.normalizeStoredFileSize(
          attachment?.durationSeconds ?? mediaSource?.seconds ?? mediaSource?.duration,
        ),
        isVoiceNote: Boolean(attachment?.isVoiceNote ?? mediaSource?.ptt ?? mediaSource?.voice),
        isDeleted: Boolean(variables?.isDeleted || variables?.deletedAt),
        deletedAt: this.normalizeMessageMetadataText(variables?.deletedAt),
        deletedBy: this.normalizeMessageMetadataText(variables?.deletedBy),
        deletedRevealUntil: this.normalizeMessageMetadataText(variables?.deletedRevealUntil),
        deletedOriginalText,
        deletedOriginalMessageType,
        isLocalHidden: Boolean(variables?.isLocalHidden || variables?.localHiddenAt),
        localHiddenAt: this.normalizeMessageMetadataText(variables?.localHiddenAt),
        localHiddenByUserId:
          variables?.localHiddenByUserId === undefined || variables?.localHiddenByUserId === null
            ? null
            : Number(variables.localHiddenByUserId),
        localHiddenOriginalText: this.normalizeMessageMetadataText(variables?.localHiddenOriginalText),
        localHiddenOriginalMessageType: this.normalizeMessageMetadataText(
          variables?.localHiddenOriginalMessageType,
        ),
      }).filter(([, value]) => value !== null && value !== undefined && value !== ''),
    );

    return Object.keys(metadata).length ? metadata : null;
  }

  private needsConversationMediaHydration(
    messages: Array<{
      messageType?: string | null;
      body?: string | null;
      rawPayload?: string | null;
      variablesJson?: string | null;
    }> | null | undefined,
    conversationContact: string,
    conversationMetadataRaw: string | null | undefined,
  ) {
    const conversationMetadata = this.parseConversationMetadata(conversationMetadataRaw);
    return (messages || []).some((message) => {
      const metadata = this.buildConversationMessageMetadata(
        message,
        String(conversationContact || ''),
        conversationMetadata,
      );
      if (!metadata) return false;

      const normalizedType = String(
        metadata.normalizedMessageType || message?.messageType || 'text',
      )
        .trim()
        .toLowerCase();

      if (!['image', 'video', 'document', 'audio'].includes(normalizedType)) {
        return false;
      }

      return !this.normalizeStoredMediaAssetUrl(metadata.mediaUrl || metadata.previewUrl);
    });
  }

  private extractWebwhatsRawMessageIdFromProviderMessageId(providerMessageIdRaw: unknown) {
    const normalized = this.normalizeMessageMetadataText(providerMessageIdRaw);
    if (!normalized) return null;
    const match = normalized.match(/^webwhats:[^:]+:(.+)$/i);
    return match?.[1] ? String(match[1]).trim() : normalized;
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

  // ============================================================
  // CONVERSA LIMPA DO HBX (31/07/2026 — ordem do dono).
  //
  // "sumir com o chat (e ficar salvo no lead do cliente/empresa)".
  //
  // Isto SÓ some da tela de Conversas. As mensagens continuam no banco
  // (`CompanyMessage`), ligadas ao lead, e continuam aparecendo na ficha do
  // cliente. Nada é apagado — "auditoria sim, sujeira não".
  //
  // ⚠️ E NUNCA, EM HIPÓTESE NENHUMA, manda comando de exclusão pro WhatsApp:
  // limpar aqui é do NOSSO sistema, não do aparelho do cliente. O motor tem
  // `deleteMessageForEveryone` na bridge; ele NÃO tem chamador e não pode
  // ganhar um por este caminho. Há teste que grita se alguém ligar.
  //
  // Diferente de "Finalizada" (atendimentoBlockedAt), que só move pra fila
  // "Finalizadas" e continua visível lá. Limpar é o passo além: sai da vista.
  // É reversível (restoreConversationToInbox).
  // ============================================================
  private getConversationClearedState(metadataRaw: string | Record<string, any> | null | undefined) {
    const metadata =
      metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
        ? metadataRaw
        : this.parseConversationMetadata(String(metadataRaw || ''));
    const clearedAt = String(metadata?.hbxClearedAt || '').trim() || null;
    return {
      isCleared: Boolean(clearedAt),
      clearedAt,
      clearedReason: String(metadata?.hbxClearedReason || '').trim() || null,
      clearedByUserId:
        metadata?.hbxClearedByUserId === undefined || metadata?.hbxClearedByUserId === null
          ? null
          : Number(metadata.hbxClearedByUserId) || null,
      preservedMessageCount:
        metadata?.hbxClearedMessageCount === undefined || metadata?.hbxClearedMessageCount === null
          ? null
          : Number(metadata.hbxClearedMessageCount) || 0,
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
    void companyId;
    const metadata = this.parseConversationMetadata(metadataRaw);
    const metadataCandidates = [
      metadata?.whatsappContactName,
      metadata?.whatsappProfileName,
      metadata?.waNickname,
      metadata?.whatsappName,
    ];
    for (const candidate of metadataCandidates) {
      const normalized = this.normalizeDisplayNameCandidate(candidate, contact);
      if (normalized) return normalized;
    }
    return null;
  }

  private normalizeConversationPhone(contact: string | null | undefined) {
    const raw = String(contact || '').trim().toLowerCase();
    if (!raw || raw.includes('@g.us') || raw.includes('@broadcast') || raw.includes('@lid')) {
      return null;
    }
    const normalizedPhone = normalizeWhatsAppPhone(raw);
    if (!normalizedPhone) return null;
    return normalizedPhone.replace(/\D/g, '').slice(-13) || null;
  }

  private resolveConversationDisplayPhone(conversation: any, identityRow?: any, metadata?: Record<string, any> | null) {
    const candidates = [
      conversation?.contact,
      identityRow?.phone,
      metadata?.whatsappRemoteJidAlt,
      metadata?.remoteJidAlt,
      metadata?.whatsappRemoteJid,
      metadata?.remoteJid,
    ];
    for (const candidate of candidates) {
      const normalized = this.normalizeConversationPhone(String(candidate || ''));
      if (!normalized) continue;
      return normalized.startsWith('55') ? `+${normalized}` : normalized;
    }
    return '';
  }

  private collectConversationIdentityContacts(row: any) {
    const metadata = this.parseConversationMetadata(row?.metadata);
    return [
      row?.contact,
      metadata?.whatsappRemoteJidAlt,
      metadata?.remoteJidAlt,
      metadata?.customerPhone,
      metadata?.whatsappPhone,
      metadata?.phone,
      metadata?.whatsappRemoteJid,
      metadata?.remoteJid,
    ];
  }

  private resolveConversationIdentityPhone(row: any) {
    for (const candidate of this.collectConversationIdentityContacts(row)) {
      const normalized = this.normalizeConversationPhone(String(candidate || ''));
      if (normalized) return normalized;
    }
    return '';
  }

  private resolveConversationPresenceRemoteJid(conversation: any, metadata?: Record<string, any> | null) {
    const candidates = [
      metadata?.whatsappRemoteJid,
      metadata?.remoteJid,
      metadata?.whatsappRemoteJidAlt,
      metadata?.remoteJidAlt,
      metadata?.customerPhone,
      metadata?.whatsappPhone,
      metadata?.phone,
      conversation?.contact,
    ];

    for (const candidate of candidates) {
      const remoteJid = this.normalizeConversationPresenceRemoteJid(candidate);
      if (remoteJid) return remoteJid;
    }

    return null;
  }

  private normalizeConversationPresenceRemoteJid(value: unknown) {
    const raw = this.normalizeMessageMetadataText(value);
    if (!raw) return null;
    const lowered = raw.toLowerCase();
    if (lowered === 'status@broadcast' || lowered.includes('@broadcast')) return null;
    if (raw.includes('@')) return raw;

    const normalizedPhone = this.normalizeConversationPhone(raw);
    return normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : null;
  }

  private buildUnknownConversationPresence(remoteJid: string | null) {
    return {
      remoteJid,
      presence: 'unknown',
      online: false,
      typing: false,
      recording: false,
      lastSeenAt: null,
      updatedAt: null,
      providerStatus: 'unknown',
    };
  }

  private isConversationWhatsappIdentityConflicting(conversation: any, metadata?: Record<string, any> | null) {
    const contactPhone = this.normalizeConversationPhone(conversation?.contact);
    if (!contactPhone) return false;
    const remotePhone = this.normalizeConversationPhone(metadata?.whatsappRemoteJid || metadata?.remoteJid);
    const altPhone = this.normalizeConversationPhone(metadata?.whatsappRemoteJidAlt || metadata?.remoteJidAlt);
    if (remotePhone && remotePhone !== contactPhone) return true;
    if (altPhone && altPhone !== contactPhone && !remotePhone) return true;
    return false;
  }

  private normalizeManualConversationContact(value: unknown) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
      digits = `55${digits}`;
    }
    if (digits.length < 10 || digits.length > 15) return null;
    return {
      contact: `+${digits}`,
      digits,
      remoteJid: `${digits}@s.whatsapp.net`,
    };
  }

  private buildConversationLocalDeleteAliases(conversation: any, metadata: Record<string, any>) {
    const rawValues = [
      conversation?.contact,
      metadata?.whatsappRemoteJid,
      metadata?.whatsappRemoteJidAlt,
      metadata?.whatsappPhone,
      metadata?.whatsappNumber,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const contacts = new Set<string>();
    const remoteJids = new Set<string>();
    const phoneDigits = new Set<string>();

    for (const raw of rawValues) {
      const lowered = raw.toLowerCase();
      if (lowered.includes('@g.us') || lowered.includes('@broadcast')) continue;
      if (lowered.includes('@')) {
        remoteJids.add(raw);
        const beforeAt = raw.split('@')[0] || '';
        const digits = beforeAt.replace(/\D/g, '');
        if (digits.length >= 10) phoneDigits.add(digits.slice(-13));
        continue;
      }
      contacts.add(raw);
      const normalized = this.normalizeConversationPhone(raw);
      if (normalized && normalized.length >= 10) phoneDigits.add(normalized);
    }

    for (const digits of Array.from(phoneDigits)) {
      contacts.add(`+${digits}`);
      if (digits.startsWith('55')) contacts.add(`+${digits.slice(2)}`);
      remoteJids.add(`${digits}@s.whatsapp.net`);
    }

    return {
      contacts: Array.from(contacts),
      remoteJids: Array.from(remoteJids),
      phoneDigits: Array.from(phoneDigits),
    };
  }

  private async findLocalDeleteConversationIds(companyId: number, conversation: any, metadata: Record<string, any>) {
    const aliases = this.buildConversationLocalDeleteAliases(conversation, metadata);
    const or: any[] = [
      { id: Number(conversation.id) },
      ...aliases.contacts.map((contact) => ({ contact })),
      ...aliases.remoteJids.map((jid) => ({ metadata: { contains: jid } })),
      ...aliases.contacts.map((contact) => ({
        messages: {
          some: {
            companyId,
            contactId: contact,
          },
        },
      })),
      ...aliases.phoneDigits.map((digits) => ({ contact: { endsWith: digits } })),
      ...aliases.phoneDigits.map((digits) => ({
        messages: {
          some: {
            companyId,
            contactId: { endsWith: digits },
          },
        },
      })),
    ];

    const rows = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        NOT: [
          { contact: { contains: '@g.us' } },
          { metadata: { contains: '"whatsappIsGroup":true' } },
        ],
        OR: or,
      },
      select: { id: true },
    });
    const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
    return Array.from(new Set([Number(conversation.id), ...ids])).filter(Boolean);
  }

  private normalizeConversationTakeLimit(value: string | number | null | undefined, fallback?: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(Math.floor(parsed), 200);
  }

  private normalizeConversationSkip(value: string | number | null | undefined) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(Math.floor(parsed), 5000);
  }

  private normalizeConversationQueueFilter(value: string | null | undefined) {
    const normalized = String(value || '').trim().toLowerCase();
    const allowedQueues = new Set(['all', 'groups', 'recovery', 'scheduled', 'bot', 'blocked']);
    return allowedQueues.has(normalized) ? normalized : null;
  }

  private resolveConversationQueueFromRouteTarget(conversation: any) {
    const contact = String(conversation?.customer?.phone || conversation?.contact || '').trim().toLowerCase();
    if (contact.includes('@g.us')) return 'groups';
    if (conversation?.isBlocked === true || String(conversation?.status || '').trim().toLowerCase() === 'blocked') {
      return 'blocked';
    }
    switch (String(conversation?.routeTarget || '').trim().toLowerCase()) {
      case 'recovery':
        return 'recovery';
      case 'atendimento':
        return 'scheduled';
      case 'prospeccao':
      case 'prospection':
        return 'bot';
      case 'groups':
        return 'groups';
      default:
        return 'all';
    }
  }

  private isConversationInQueueFilter(conversation: any, queueFilter: string | null) {
    if (!queueFilter) return true;
    return this.resolveConversationQueueFromRouteTarget(conversation) === queueFilter;
  }

  private normalizeMessagePageLimit(value: string | number | null | undefined, fallback = 20) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(Math.floor(parsed), 60);
  }

  private resolveLatestDate(...values: Array<Date | string | null | undefined>) {
    let latest: Date | null = null;
    for (const value of values) {
      if (!value) continue;
      const parsed = value instanceof Date ? value : new Date(String(value));
      const time = parsed.getTime();
      if (!Number.isFinite(time)) continue;
      if (!latest || time > latest.getTime()) latest = parsed;
    }
    return latest;
  }

  private isRealConversationMessage(message: {
    direction?: string | null;
    messageType?: string | null;
    senderType?: string | null;
    timestamp?: Date | string | null;
    variablesJson?: unknown;
    rawPayload?: unknown;
  } | null | undefined) {
    if (!message?.timestamp) return false;
    const direction = String(message.direction || '').trim().toUpperCase();
    if (direction !== 'INBOUND' && direction !== 'OUTBOUND') return false;
    const messageType = String(message.messageType || '').trim().toLowerCase();
    const senderType = String(message.senderType || '').trim().toLowerCase();
    if (messageType === 'system_event' || senderType === 'system') return false;
    return true;
  }

  private realConversationMessageWhere() {
    return {
      direction: { in: ['INBOUND', 'OUTBOUND'] },
      NOT: [
        { messageType: 'system_event' },
        { senderType: 'system' },
      ],
    };
  }

  private resolveConversationActivityDate(conversation: {
    lastMessageAt?: Date | string | null;
    messages?: Array<{
      direction?: string | null;
      messageType?: string | null;
      senderType?: string | null;
      timestamp?: Date | string | null;
      variablesJson?: unknown;
      rawPayload?: unknown;
    }> | null;
  }) {
    const realMessages = Array.isArray(conversation.messages)
      ? conversation.messages.filter((message) => this.isRealConversationMessage(message as any))
      : [];
    const latestMessage = realMessages[0] || null;
    return this.resolveLatestDate(latestMessage?.timestamp);
  }

  private async repairConversationActivityIfStale(
    companyId: number,
    conversationId: number,
    activityAt: Date | null,
  ) {
    if (!activityAt) return;
    await this.prisma.companyConversation.updateMany({
      where: {
        id: conversationId,
        companyId,
        lastMessageAt: { lt: activityAt },
      },
      data: {
        lastMessageAt: activityAt,
        lastInteractionAt: activityAt,
      },
    });
  }

  private normalizeBeforeDate(value: string | null | undefined) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private normalizeDisplayNameCandidate(value: unknown, phone?: string | null) {
    const normalized = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .trim();
    if (!normalized) return null;
    const lowered = normalized.toLowerCase();
    if (lowered === 'você' || lowered === 'voce' || lowered === 'you' || lowered === 'eu') {
      return null;
    }
    if (this.isGenericWhatsAppDisplayName(normalized)) {
      return null;
    }
    if (lowered.includes('@lid') || lowered.includes('@s.whatsapp.net')) {
      return null;
    }
    if (/^\d{14,}$/.test(normalized.replace(/\s+/g, ''))) {
      return null;
    }
    // History sync do WhatsApp entrega "nome" que é só o número mascarado do contato
    // ("+55∙∙∙∙∙∙∙∙∙84", "+55--------59") quando não há pushName público. Candidato sem
    // NENHUMA letra (só dígitos, +, espaço e pontuação de máscara) é lixo de exibição —
    // rejeita e deixa o fallback mostrar o telefone REAL do JID.
    if (/^[+\d\s∙•·*.\-–—_()\\/]+$/.test(normalized)) {
      return null;
    }
    const candidateDigits = normalized.replace(/\D/g, '');
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    if (candidateDigits && phoneDigits && candidateDigits === phoneDigits) {
      return null;
    }
    return normalized;
  }

  private isGenericWhatsAppDisplayName(value: string) {
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return [
      'whatsapp',
      'whats app',
      'contato whatsapp',
      'contato whats app',
      'whatsapp business',
      'whats app business',
    ].includes(normalized);
  }

  private async loadAtendimentoIdentityMap(companyId: number, contacts: Array<string | null | undefined>) {
    const phoneNormalizeds = Array.from(
      new Set(contacts.map((contact) => this.normalizeConversationPhone(contact)).filter(Boolean)),
    ) as string[];

    if (!phoneNormalizeds.length) return new Map<string, any>();

    const rows = await this.prisma.atendimentoCustomer.findMany({
      where: {
        companyId,
        phoneNormalized: { in: phoneNormalizeds },
      },
      select: {
        id: true,
        companyId: true,
        customerProfileId: true,
        name: true,
        phone: true,
        phoneNormalized: true,
        registrationOrigin: true,
        registrationStatus: true,
        route: true,
        customerProfile: {
          select: {
            id: true,
            name: true,
            email: true,
            document: true,
            externalSource: true,
            status: true,
            sourceConnectionId: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const byPhone = new Map<string, any>();
    for (const row of rows) {
      const phoneNormalized = String(row.phoneNormalized || '').trim();
      if (phoneNormalized && !byPhone.has(phoneNormalized)) {
        byPhone.set(phoneNormalized, row);
      }
    }
    return byPhone;
  }

  private async loadSharedProfileMap(
    companyId: number,
    contacts: Array<string | null | undefined>,
    identityMap?: Map<string, any>,
  ) {
    const phoneNormalizeds = Array.from(
      new Set(contacts.map((contact) => this.normalizeConversationPhone(contact)).filter(Boolean)),
    ) as string[];
    const profileIds = identityMap
      ? Array.from(
          new Set(
            Array.from(identityMap.values())
              .map((row) => row?.customerProfileId || row?.customerProfile?.id)
              .filter(Boolean),
          ),
        ).map((value) => String(value))
      : [];
    return this.customerProfileService.buildSharedContextRegistry(companyId, {
      profileIds,
      phoneNormalizeds,
    });
  }

  // INTENTENGINE S3: `getConfigRow`/`saveConfigRow` (JSON cru em HbxRecoveryFlowStage)
  // saem daqui — a fonte agora é o BotConfigStoreService (tabela BotConfig, versionada,
  // dual-read com fallback pro canal legado). Ver docs/PLANEJAMENTOS/INTENTENGINE/
  // INTENTENGINE-sprint3.md.

  private async getBotConfigByCompanyId(
    companyId: number,
  ): Promise<AtendimentoBotConfig & { providerCapabilities: BotConfigProviderCapabilities }> {
    const payload = this.botConfigStore
      ? await this.botConfigStore.get(companyId, 'atendimento_bot')
      : null;
    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(companyId);
    const providerCapabilities: BotConfigProviderCapabilities = {
      provider: tenantContext.providerCapabilities.provider,
      canUseOfficialButtons: tenantContext.providerCapabilities.canUseOfficialButtons,
    };
    const sanitized = sanitizeAtendimentoBotConfigForTenant(
      normalizeAtendimentoBotConfig((payload as any) ?? null),
      tenantContext,
    );
    // Aditivo: catalogos sempre preenchidos (normalize/sanitize partem do DEFAULT, nunca []),
    // e capacidade do canal explicita para o front nao adivinhar pelo setup.provider.
    return {
      ...sanitized,
      actionCatalog:
        sanitized.actionCatalog && sanitized.actionCatalog.length
          ? sanitized.actionCatalog
          : DEFAULT_ATENDIMENTO_BOT_CONFIG.actionCatalog,
      variableCatalog:
        sanitized.variableCatalog && sanitized.variableCatalog.length
          ? sanitized.variableCatalog
          : DEFAULT_ATENDIMENTO_BOT_CONFIG.variableCatalog,
      providerCapabilities,
    };
  }

  private async resolveAtendimentoBotSanitizationContext(companyId: number): Promise<{
    providerCapabilities: ProviderCapabilities;
    recoveryEnabled: boolean;
  }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        whatsappConnectionMode: true,
        trialModuleSelection: true,
        // Guarda de suspensao: campos lidos por resolveCompanyAccessState.
        companyKind: true,
        slug: true,
        status: true,
        accountType: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
        courtesyEndsAt: true,
      },
    });
    // PR10072026 W1: efetivo = masterEnabled && enabled (teto do master conta).
    const recoveryModule = this.prisma.companyModule?.findFirst
      ? await this.prisma.companyModule.findFirst({
          where: {
            companyId,
            enabled: true,
            masterEnabled: true,
            systemModule: { key: 'hbx_recovery' },
          },
          select: { id: true },
        })
      : null;
    // Empresa suspensa/overdue/pending_checkout nao roda recovery no inbound.
    // W1 removeu o wipe que desligava os modulos; a guarda de acesso passa a ser aqui.
    const acesso = resolveCompanyAccessState(company as any);
    const temPostIt =
      Boolean(recoveryModule?.id) ||
      String(company?.trialModuleSelection || '').trim().toLowerCase() === 'recovery';
    return {
      providerCapabilities: resolveProviderCapabilitiesFromCompany(company),
      recoveryEnabled: temPostIt && acesso.canUse,
    };
  }

  private async getAgendaConfigByCompanyId(companyId: number): Promise<AtendimentoAgendaConfig> {
    const payload = this.botConfigStore
      ? await this.botConfigStore.get(companyId, 'atendimento_agenda')
      : null;
    if (!payload) return DEFAULT_ATENDIMENTO_AGENDA_CONFIG;
    return normalizeAtendimentoAgendaConfig(payload as any);
  }

  private async getRecoveryRoutingRules(companyId: number): Promise<RecoveryRoutingRules> {
    const payload = this.botConfigStore
      ? await this.botConfigStore.get(companyId, 'recovery_bot')
      : null;
    if (!payload) return { ...DEFAULT_RECOVERY_BOT_CONFIG.routingRules };
    return normalizeRecoveryBotConfig(payload as any).routingRules;
  }

  private normalizeClassifierText(value: unknown) {
    return String(value || '').trim().toLowerCase();
  }

  private getConversationQueueTarget(metadata: Record<string, any>, vendasAgendaQueue: Record<string, any> | null) {
    return this.normalizeClassifierText(
      metadata?.routeTarget ||
        metadata?.queueTarget ||
        vendasAgendaQueue?.routeTarget ||
        vendasAgendaQueue?.queueTarget ||
        '',
    );
  }

  private isConversationGroup(conversation: any, metadata: Record<string, any>) {
    const contact = String(conversation?.customer?.phone || conversation?.contact || '').trim().toLowerCase();
    return (
      contact.includes('@g.us') ||
      this.parseBooleanMetadataFlag(metadata?.whatsappIsGroup) ||
      this.parseBooleanMetadataFlag(metadata?.isGroup)
    );
  }

  private isProspectionSource(value: unknown) {
    const source = this.normalizeClassifierText(value);
    return (
      source === 'vendas' ||
      source === 'webscraping' ||
      source.includes('vendas') ||
      source.includes('prospeccao') ||
      source.includes('prospect') ||
      source.includes('webscraping')
    );
  }

  private getLatestAutomaticProspectionOutbound(conversation: any) {
    const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
    return messages
      .filter((message) => {
        const direction = String(message?.direction || '').trim().toUpperCase();
        if (direction !== 'OUTBOUND') return false;
        const source = this.normalizeClassifierText(message?.sourceModule);
        const variables = this.parseLooseJsonRecord(message?.variablesJson);
        return this.isProspectionSource(source) || this.normalizeClassifierText(variables?.botType) === 'prospeccao';
      })
      .sort((left, right) => {
        const leftTime = new Date(left?.timestamp || left?.createdAt || 0).getTime();
        const rightTime = new Date(right?.timestamp || right?.createdAt || 0).getTime();
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      })[0] || null;
  }

  private isProspectionMetadataCandidate(
    metadata: Record<string, any>,
    routeTarget: string,
    vendasAgendaQueue: Record<string, any> | null,
    conversation?: any,
  ) {
    const automation = this.getNestedMetadataRecord(metadata?.vendasAutomation);
    const vendasProspeccao = this.getNestedMetadataRecord(metadata?.vendasProspeccao);
    const sourceCandidates = [
      metadata?.sourceModule,
      metadata?.latestSourceModule,
      metadata?.originFlow,
      vendasAgendaQueue?.sourceModule,
      automation?.sourceModule,
    ];
    return (
      routeTarget === 'prospeccao' ||
      routeTarget === 'prospection' ||
      sourceCandidates.some((source) => this.isProspectionSource(source)) ||
      vendasAgendaQueue?.active === true ||
      Boolean(String(vendasAgendaQueue?.leadId || automation?.leadId || vendasProspeccao?.stage || '').trim()) ||
      Boolean(this.getLatestAutomaticProspectionOutbound(conversation))
    );
  }

  private getProspectionSentAtCandidate(
    metadata: Record<string, any>,
    vendasAgendaQueue: Record<string, any> | null,
    automationJob: any,
    automaticOutbound: any,
  ) {
    const automation = this.getNestedMetadataRecord(metadata?.vendasAutomation);
    const vendasProspeccao = this.getNestedMetadataRecord(metadata?.vendasProspeccao);
    const candidates = [
      vendasProspeccao?.firstOutboundAt,
      automation?.sentAt,
      vendasAgendaQueue?.manualSentAt,
      vendasAgendaQueue?.lastManualSendAt,
      automationJob?.sentAt,
      automaticOutbound?.timestamp,
      automaticOutbound?.createdAt,
    ];
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (!normalized) continue;
      const parsed = new Date(normalized);
      if (Number.isFinite(parsed.getTime())) return parsed;
    }
    return null;
  }

  private async hasProspectionInboundAfterAutomaticSend(
    companyId: number,
    conversation: any,
    sentAt?: Date | null,
  ) {
    const inbound = await this.prisma.companyMessage.findFirst({
      where: {
        companyId,
        conversationId: Number(conversation?.id || 0),
        direction: 'INBOUND',
        ...(sentAt && Number.isFinite(sentAt.getTime()) ? { timestamp: { gte: sentAt } } : {}),
      },
      select: { id: true },
      orderBy: { timestamp: 'desc' },
    });
    return Boolean(inbound?.id);
  }

  private hasLoadedInboundMessage(conversation: any) {
    return (Array.isArray(conversation?.messages) ? conversation.messages : []).some(
      (message) => String(message?.direction || '').trim().toUpperCase() === 'INBOUND',
    );
  }

  private async findVendasAutomationContext(
    companyId: number,
    conversation: any,
    metadata: Record<string, any>,
    vendasAgendaQueue: Record<string, any> | null,
  ) {
    const automation = this.getNestedMetadataRecord(metadata?.vendasAutomation);
    const jobId = String(automation?.jobId || vendasAgendaQueue?.automationJobId || '').trim();
    const leadId = String(automation?.leadId || vendasAgendaQueue?.leadId || '').trim();
    const conversationId = Number(conversation?.id || 0);
    const OR: any[] = [];
    if (jobId) OR.push({ id: jobId });
    if (conversationId) OR.push({ conversationId });
    if (leadId) OR.push({ leadId });

    const jobDelegate = (this.prisma as any).vendasAutomationJob;
    const leadDelegate = (this.prisma as any).vendasLead;
    const job = OR.length && typeof jobDelegate?.findFirst === 'function'
      ? await jobDelegate.findFirst({
          where: { companyId, OR },
          include: { lead: true },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        })
      : null;
    const lead = job?.lead || (leadId && typeof leadDelegate?.findFirst === 'function'
      ? await leadDelegate.findFirst({
          where: { companyId, id: leadId },
        })
      : null);

    const leadStatus = this.normalizeClassifierText(lead?.status || vendasAgendaQueue?.status);
    const leadClosed =
      ['encerrado', 'closed', 'discarded', 'descartado'].includes(leadStatus) ||
      Boolean(lead?.closedAt);

    return {
      job,
      lead,
      jobStatus: this.normalizeClassifierText(job?.status || automation?.status || vendasAgendaQueue?.automationStatus),
      leadStatus,
      leadClosed,
    };
  }

  private isExplicitAtendimentoHandoff(conversation: any, metadata: Record<string, any>, vendasAgendaQueue: Record<string, any> | null) {
    const manualQueue = String(
      metadata?.inboxManualQueueOverride || vendasAgendaQueue?.manualQueueOverride || '',
    )
      .trim()
      .toLowerCase();
    if (manualQueue === 'scheduled') return true;
    if (conversation?.humanAssigned === true) return true;
    if (this.parseBooleanMetadataFlag(metadata?.humanAssigned || vendasAgendaQueue?.humanAssigned)) return true;

    const routeTarget = this.getConversationQueueTarget(metadata, vendasAgendaQueue);
    const vendasProspeccao = this.getNestedMetadataRecord(metadata?.vendasProspeccao);
    const prospectionStage = this.normalizeClassifierText(vendasProspeccao?.stage || '');
    const isActiveProspectionQueue =
      manualQueue === 'bot' ||
      routeTarget === 'prospeccao' ||
      routeTarget === 'prospection' ||
      vendasAgendaQueue?.active === true ||
      ['reply_received', 'neutral', 'auto_reply_detected', 'bot_menu_detected', 'awaiting_human'].includes(prospectionStage);
    if (isActiveProspectionQueue) return false;

    const flowCandidates = [
      conversation?.flowResult,
      conversation?.currentFlow,
      conversation?.currentStep,
      metadata?.flowResult,
      metadata?.currentFlow,
      metadata?.currentStep,
      metadata?.handoffType,
      metadata?.routeReason,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    return flowCandidates.some(
      (value) =>
        value === 'human_handoff' ||
        value === 'recovery_handoff' ||
        value === 'human_assigned' ||
        value.includes('human_handoff') ||
        value.includes('atendimento_humano'),
    );
  }

  private async resolveRecoveryRoutingContext(
    companyId: number,
    conversation: any,
    _routingRules: RecoveryRoutingRules,
  ) {
    const metadata = this.parseConversationMetadata(conversation?.metadata);
    const metadataCustomerId = String(
      metadata?.recoveryCustomerId || metadata?.customerId || metadata?.customer_id || '',
    ).trim();
    const digits = String(conversation?.contact || '').replace(/\D/g, '');
    const latestSourceModule = String(metadata?.lastSourceModule || conversation?.messages?.[0]?.sourceModule || '')
      .trim()
      .toLowerCase();

    const recoveryCustomer = metadataCustomerId
        ? await this.prisma.hbxRecoveryCustomer.findFirst({
            where: { companyId, id: metadataCustomerId },
            select: {
              id: true,
              name: true,
              clientName: true,
              openAmount: true,
              paymentHistoryScore: true,
              totalPaid: true,
              status: true,
              payments: {
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  lifecycle: true,
                  chargeType: true,
                  createdAt: true,
                  paidAt: true,
                  paymentUrl: true,
                },
              },
            },
          })
        : digits
        ? await this.prisma.hbxRecoveryCustomer.findFirst({
            where: { companyId, whatsappNumber: { endsWith: digits } },
            select: {
              id: true,
              name: true,
              clientName: true,
              openAmount: true,
              paymentHistoryScore: true,
              totalPaid: true,
              status: true,
              payments: {
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  lifecycle: true,
                  chargeType: true,
                  createdAt: true,
                  paidAt: true,
                  paymentUrl: true,
                },
              },
            },
          })
        : null;

    const recoveryOpenAmount = Number(recoveryCustomer?.openAmount || metadata?.recoveryOpenAmount || 0);
    const hasRecoveryDebt = recoveryOpenAmount > 0;

    let routeTarget: 'recovery' | 'atendimento' | 'prospeccao' | 'conversas' | 'groups' = 'conversas';
    let routeReason = 'Conversa neutra sem rota operacional manual.';
    const vendasAgendaQueue = this.getNestedMetadataRecord(metadata?.vendasAgendaQueue);
    const metadataRouteTarget = this.getConversationQueueTarget(metadata, vendasAgendaQueue);
    const persistedRouteTarget = (['recovery', 'atendimento', 'prospeccao', 'prospection', 'conversas', 'groups'] as const)
      .includes(metadataRouteTarget as any)
      ? metadataRouteTarget
      : '';

    if (this.isConversationGroup(conversation, metadata)) {
      routeTarget = 'groups';
      routeReason = 'Grupo do WhatsApp classificado fora dos funis operacionais.';
    } else if (persistedRouteTarget === 'recovery') {
      routeTarget = 'recovery';
      routeReason = 'Rota Recovery definida por ação manual/card.';
    } else if (persistedRouteTarget === 'atendimento' || persistedRouteTarget === 'scheduled') {
      routeTarget = 'atendimento';
      routeReason = 'Rota Atendimento definida por ação manual/card.';
    } else if (persistedRouteTarget === 'prospeccao' || persistedRouteTarget === 'prospection') {
      routeTarget = 'prospeccao';
      routeReason = 'Rota Prospecção definida por ação manual/card.';
    } else if (persistedRouteTarget === 'conversas') {
      routeTarget = 'conversas';
      routeReason = 'Conversa neutra definida por ação manual/card.';
    }

    // Sem log por-conversa aqui (hot path): inundava ~120 conversas × 2 linhas a cada poll,
    // com ids repetidos no mesmo segundo (duas listas chamam isto por ciclo). O resumo agregado
    // por ciclo vive em logInboxClassifierCycle; routeReason continua no payload pra debug.
    return {
      routeTarget,
      routeReason,
      recoveryCustomerId: hasRecoveryDebt && recoveryCustomer?.id ? String(recoveryCustomer.id) : null,
      recoveryCustomerName: String(
        hasRecoveryDebt ? recoveryCustomer?.clientName || recoveryCustomer?.name || '' : '',
      ).trim() || null,
      recoveryOpenAmount: hasRecoveryDebt ? recoveryOpenAmount : 0,
      recoveryRiskScore:
        !hasRecoveryDebt ||
        recoveryCustomer?.paymentHistoryScore === undefined ||
        recoveryCustomer?.paymentHistoryScore === null
          ? null
          : Number(recoveryCustomer.paymentHistoryScore),
      recoveryTotalPaid: hasRecoveryDebt ? Number(recoveryCustomer?.totalPaid || 0) : 0,
      recoveryStatus: hasRecoveryDebt ? String(recoveryCustomer?.status || '').trim() || null : null,
      recoveryPaymentHistory: hasRecoveryDebt && Array.isArray(recoveryCustomer?.payments)
        ? recoveryCustomer.payments.map((payment) => ({
            id: String(payment.id),
            amount: Number(payment.amount || 0),
            status: String(payment.status || '').trim() || null,
            lifecycle: String(payment.lifecycle || '').trim() || null,
            chargeType: String(payment.chargeType || '').trim() || null,
            createdAt: payment.createdAt || null,
            paidAt: payment.paidAt || null,
            paymentUrl: String(payment.paymentUrl || '').trim() || null,
          }))
        : [],
      recoveryCurrentStep: hasRecoveryDebt ? String(conversation?.currentStep || '').trim() || null : null,
      recoverySuggestedPath: routeTarget === 'recovery' ? '/dashboard/inbox/recovery' : '/dashboard/inbox',
      latestSourceModule: latestSourceModule || null,
    };
  }

  private async mapConversation(
    companyId: number,
    conversation: any,
    routingRules: RecoveryRoutingRules,
    identityRow?: any,
    sharedProfile?: any,
  ) {
    const displayName = await this.resolveConversationDisplayName(
      companyId,
      String(conversation.contact || ''),
      conversation.metadata,
    );
    const routeContext = await this.resolveRecoveryRoutingContext(companyId, conversation, routingRules);
    const blockedState = this.getAtendimentoBlockedState(conversation.metadata);
    const conversationMetadata = this.parseConversationMetadata(conversation.metadata);
    const hasConflictingWhatsappIdentity = this.isConversationWhatsappIdentityConflicting(conversation, conversationMetadata);
    const profile = identityRow?.customerProfile || null;
    const manualLockedName =
      String(identityRow?.registrationOrigin || '').trim().toLowerCase() === 'manual' ||
      String(identityRow?.registrationStatus || '').trim().toLowerCase() === 'manual'
        ? this.normalizeDisplayNameCandidate(identityRow?.name || null, conversation.contact)
        : null;
    // ============================================================
    // IDENTIDADE HBX (31/07/2026 — ordem do dono: "e se os nomes forem do HBX?").
    //
    // A LEI: quem manda no nome é o CADASTRO do HBX, não o WhatsApp. Antes desta
    // data a ordem era invertida (displayName do WhatsApp na frente), e o cadastro
    // só ganhava quando marcado 'manual' — por isso o vendedor cadastrava
    // "Padaria do Zé" e a tela continuava mostrando "😎 Ze" (pushName que o
    // CLIENTE controla), ou o número mascarado que o history sync entrega.
    //
    // Ordem nova: cadastro (identity → profile) > nome do WhatsApp > telefone.
    // O nome do WhatsApp NÃO some do sistema: vira DICA de cadastro
    // (`suggestedName` abaixo) — sugestão que o humano aceita, nunca identidade.
    // ============================================================
    const hbxRegisteredName =
      manualLockedName ||
      this.normalizeDisplayNameCandidate(identityRow?.name || null, conversation.contact) ||
      this.normalizeDisplayNameCandidate(profile?.name || null, conversation.contact) ||
      null;
    const whatsappGivenName = this.normalizeDisplayNameCandidate(displayName || null, conversation.contact);
    const customerName = hbxRegisteredName || whatsappGivenName || null;
    // Nome do atendente atribuído: vem batched (__assignedToName) na lista; no caminho de UMA
    // conversa (detalhe) resolve aqui (1 lookup, sem N+1 na lista).
    const assignedUserIdNum = conversation.assignedUserId ? Number(conversation.assignedUserId) : null;
    let assignedToName = (conversation as any).__assignedToName as string | null | undefined;
    if (assignedToName === undefined) {
      assignedToName = assignedUserIdNum
        ? (await this.prisma.user.findUnique({ where: { id: assignedUserIdNum }, select: { name: true } }))?.name ?? null
        : null;
    }
    return {
      id: String(conversation.id),
      contact: String(conversation.contact || '').trim() || null,
      status: this.toInboxStatus(conversation),
      assignedTo: conversation.humanAssigned ? 'humano' : null,
      // Atendimento compartilhado: quem PUXOU (pra UI mostrar "Atendimento com: X" + travar o compose).
      assignedUserId: assignedUserIdNum,
      assignedToName: assignedToName ?? null,
      botActive:
        conversation?.botActive === undefined || conversation?.botActive === null
          ? null
          : Boolean(conversation.botActive),
      humanAssigned:
        conversation?.humanAssigned === undefined || conversation?.humanAssigned === null
          ? null
          : Boolean(conversation.humanAssigned),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastRealMessageAt: conversation?.lastRealMessageAt || conversation?.lastMessageAt || null,
      lastMessageAt: conversation?.lastRealMessageAt || conversation?.lastMessageAt || null,
      whatsappConnectionSessionId: conversation?.whatsappConnectionSessionId
        ? String(conversation.whatsappConnectionSessionId)
        : null,
      sourcePhoneNormalized: conversation?.sourcePhoneNormalized
        ? String(conversation.sourcePhoneNormalized)
        : null,
      sourceTenantKey: conversation?.sourceTenantKey ? String(conversation.sourceTenantKey) : null,
      currentFlow: String(conversation?.currentFlow || '').trim() || null,
      flowResult: String(conversation?.flowResult || '').trim() || null,
      routeTarget: routeContext.routeTarget,
      routeReason: routeContext.routeReason,
      recoveryCustomerId: routeContext.recoveryCustomerId,
      recoveryCustomerName: routeContext.recoveryCustomerName,
      recoveryOpenAmount: routeContext.recoveryOpenAmount,
      recoveryRiskScore: routeContext.recoveryRiskScore,
      recoveryTotalPaid: routeContext.recoveryTotalPaid,
      recoveryStatus: routeContext.recoveryStatus,
      recoveryPaymentHistory: routeContext.recoveryPaymentHistory,
      recoveryCurrentStep: routeContext.recoveryCurrentStep,
      recoverySuggestedPath: routeContext.recoverySuggestedPath,
      latestSourceModule: routeContext.latestSourceModule,
      isBlocked: blockedState.isBlocked,
      blockedAt: blockedState.blockedAt,
      blockedReason: blockedState.blockedReason,
      metadata: conversationMetadata,
      customer: {
        id: String(identityRow?.id || conversation.id),
        phone: this.resolveConversationDisplayPhone(conversation, identityRow, conversationMetadata),
        name: customerName,
        // FOTO DE PERFIL: SEMPRE null (31/07/2026 — ordem do dono "erro de fotos
        // é constante, seria interessante tirar?"). A URL do CDN da Meta é
        // ASSINADA e EXPIRA, então toda foto virava 403 depois de um tempo e o
        // motor precisava ser consultado de novo pra renovar — fábrica de bug
        // com zero retorno. A tela usa iniciais coloridas do nome do HBX.
        // O campo continua no contrato (front antigo não quebra), sempre null.
        avatarUrl: null as string | null,
        // Nome que o CLIENTE se deu no WhatsApp. NÃO é identidade — é sugestão
        // de cadastro pra tela oferecer ("se apresentou como X"). Só aparece
        // quando ainda NÃO existe cadastro no HBX; havendo cadastro, a dica
        // sumiria como ruído.
        suggestedName:
          hbxRegisteredName || hasConflictingWhatsappIdentity ? null : whatsappGivenName || null,
        isRegistered: Boolean(hbxRegisteredName),
        customerProfileId: profile?.id ? String(profile.id) : identityRow?.customerProfileId ? String(identityRow.customerProfileId) : null,
        email: profile?.email ? String(profile.email) : null,
        document: profile?.document ? String(profile.document) : null,
        customerProfileStatus: profile?.status ? String(profile.status) : null,
        customerProfileSource: profile?.externalSource ? String(profile.externalSource) : null,
        sourceConnectionId: profile?.sourceConnectionId ? String(profile.sourceConnectionId) : null,
        registrationOrigin: identityRow?.registrationOrigin ? String(identityRow.registrationOrigin) : null,
        registrationStatus: identityRow?.registrationStatus ? String(identityRow.registrationStatus) : null,
        sharedProfile: sharedProfile || null,
      },
      messages: (conversation.messages || [])
        .map((message: any) => {
          const messageMetadata = this.buildConversationMessageMetadata(
            message,
            String(conversation.contact || ''),
            conversationMetadata,
          );
          return {
            id: String(message.id),
            direction: String(message.direction || '').trim().toLowerCase(),
            content: this.normalizeConversationMessageContentForResponse(
              messageMetadata?.resolvedText || message.body || '',
              messageMetadata?.normalizedMessageType || message.messageType,
            ),
            createdAt: message.timestamp,
            messageType: String(messageMetadata?.normalizedMessageType || message.messageType || 'text')
              .trim()
              .toLowerCase(),
            senderType: String(message.senderType || 'system').trim().toLowerCase(),
            status: String(message.status || 'RECEIVED').trim().toUpperCase(),
            sourceModule: String(message.sourceModule || '').trim().toLowerCase() || null,
            error: message.error ? String(message.error) : null,
            outboundMessageId: message.outboundMessageId ? Number(message.outboundMessageId) : null,
            metadata: messageMetadata,
          };
        })
        .filter(Boolean),
    };
  }

  private getStateConversationMetadata(raw: string | null | undefined) {
    const metadata = { ...this.parseConversationMetadata(raw) };
    delete metadata.whatsappName;
    delete metadata.waNickname;
    delete metadata.whatsappProfileName;
    delete metadata.whatsappContactName;
    delete metadata.whatsappAvatarUrl;
    delete metadata.whatsappWindowActive;
    delete metadata.whatsappUnreadCount;
    delete metadata.whatsappArchived;
    return metadata;
  }

  private resolveLiveUnreadCount(
    stateMetadata: Record<string, any>,
    snapshot: Pick<WebwhatsLiveChatSnapshot, 'unreadCount' | 'lastMessageAt'>,
  ) {
    const unreadCount = Math.max(0, Math.trunc(Number(snapshot.unreadCount || 0)));
    const markedReadAt = this.normalizeMessageMetadataText(stateMetadata?.whatsappMarkedReadAt);
    if (!markedReadAt) return unreadCount;

    const markedReadTime = new Date(markedReadAt).getTime();
    const lastMessageTime = snapshot.lastMessageAt instanceof Date ? snapshot.lastMessageAt.getTime() : NaN;
    if (Number.isFinite(markedReadTime) && (!Number.isFinite(lastMessageTime) || lastMessageTime <= markedReadTime)) {
      return 0;
    }

    return unreadCount;
  }

  // Fix 2 (PR05072026): decide se o avatar novo (vindo do snapshot ao vivo) pode substituir o
  // que já está salvo. Regra: local (`/uploads/avatars/...`) existente só é substituído por outro
  // local (nunca por URL crua pps.whatsapp.net) — senão uma busca que falhou o cache no bridge
  // (`cache ?? rawAvatarUrl`) sobrescreve silenciosamente uma foto que já funcionava. URL crua só
  // entra se NÃO houver nada local salvo antes (nunca pior que hoje).
  private resolveNextWhatsappAvatarUrl(
    previousAvatarUrl: string | null | undefined,
    nextAvatarUrl: string | null | undefined,
  ): string | null {
    const next = this.normalizeMessageMetadataText(nextAvatarUrl);
    if (!next) return this.normalizeMessageMetadataText(previousAvatarUrl) || null;
    const previous = this.normalizeMessageMetadataText(previousAvatarUrl);
    const previousIsLocal = Boolean(previous && previous.startsWith('/uploads/'));
    const nextIsLocal = next.startsWith('/uploads/');
    if (previousIsLocal && !nextIsLocal) return previous; // mantém o local, ignora o cru
    return next;
  }

  private buildLiveConversationMetadata(
    stateMetadata: Record<string, any>,
    snapshot: WebwhatsLiveChatSnapshot | WebwhatsLiveConversationSnapshot,
    previousAvatarUrl?: string | null,
  ) {
    const unreadCount = this.resolveLiveUnreadCount(stateMetadata, snapshot);
    const agendaDisplayName = this.normalizeDisplayNameCandidate(
      (snapshot as any)?.agendaDisplayName,
      snapshot.contact || snapshot.conversation?.contact,
    );
    const profileDisplayName = this.normalizeDisplayNameCandidate(
      (snapshot as any)?.profileDisplayName,
      snapshot.contact || snapshot.conversation?.contact,
    );
    const displayName = this.normalizeDisplayNameCandidate(
      snapshot.displayName,
      snapshot.contact || snapshot.conversation?.contact,
    ) || agendaDisplayName || profileDisplayName;
    const metadata: Record<string, any> = {
      ...stateMetadata,
      whatsappRemoteJid: snapshot.remoteJid,
      ...(snapshot.remoteJidAlt ? { whatsappRemoteJidAlt: snapshot.remoteJidAlt } : {}),
      ...(displayName ? { whatsappName: displayName } : {}),
      ...(agendaDisplayName ? { whatsappContactName: agendaDisplayName } : {}),
      ...(profileDisplayName
        ? {
            whatsappProfileName: profileDisplayName,
            waNickname: profileDisplayName,
          }
        : {}),
      ...(() => {
        const resolvedAvatarUrl = this.resolveNextWhatsappAvatarUrl(previousAvatarUrl, snapshot.avatarUrl);
        return resolvedAvatarUrl ? { whatsappAvatarUrl: resolvedAvatarUrl } : {};
      })(),
      whatsappUnreadCount: unreadCount,
      ...(snapshot.windowActive === null ? {} : { whatsappWindowActive: snapshot.windowActive }),
      ...(snapshot.archived === null
        ? stateMetadata?.whatsappArchived === undefined
          ? {}
          : { whatsappArchived: Boolean(stateMetadata.whatsappArchived) }
        : { whatsappArchived: snapshot.archived }),
    };

    delete metadata.whatsappLocalHiddenMessages;
    delete metadata.whatsappMarkedReadAt;

    return metadata;
  }

  private buildConversationReadModel(
    snapshot: WebwhatsLiveConversationSnapshot | WebwhatsLiveChatSnapshot,
    opts?: {
      messages?: Array<Record<string, any>>;
    },
  ) {
    const stateMetadata = this.getStateConversationMetadata(snapshot.conversation.metadata);
    // Avatar local já salvo ANTES do merge (getStateConversationMetadata apaga whatsappAvatarUrl
    // do stateMetadata de propósito) — precisa do valor cru pra decidir o Fix 2 (não-clobber).
    const previousAvatarUrl = this.normalizeMessageMetadataText(
      this.parseConversationMetadata(snapshot.conversation.metadata)?.whatsappAvatarUrl,
    );
    const mergedMetadata = this.buildLiveConversationMetadata(stateMetadata, snapshot, previousAvatarUrl);
    const liveMessages =
      'messages' in snapshot && Array.isArray(snapshot.messages)
        ? snapshot.messages
        : snapshot.lastMessage
          ? [snapshot.lastMessage]
          : [];
    const messages =
      opts?.messages ||
      this.buildLiveConversationMessages(liveMessages, stateMetadata);
    return {
      id: snapshot.conversation.id,
      contact: snapshot.contact || snapshot.conversation.contact,
      metadata: JSON.stringify(mergedMetadata),
      currentFlow: snapshot.conversation.currentFlow,
      currentStep: snapshot.conversation.currentStep,
      flowResult: snapshot.conversation.flowResult,
      botActive: snapshot.conversation.botActive,
      humanAssigned: snapshot.conversation.humanAssigned,
      assignedUserId: snapshot.conversation.assignedUserId,
      createdAt: snapshot.conversation.createdAt,
      updatedAt: snapshot.lastMessageAt || snapshot.conversation.updatedAt,
      messages,
    };
  }

  private resolveLiveMessageDate(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const numeric = Number(value || 0);
    if (!numeric) return null;
    const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private buildLiveMessageStableKey(message: WebwhatsFetchedMessage, index: number) {
    const rawKeyId = this.normalizeMessageMetadataText(message?.key?.id || message?.id);
    if (rawKeyId) return rawKeyId;
    const rawPayload =
      message && typeof message === 'object' && !Array.isArray(message)
        ? (message as Record<string, any>)
        : {};
    const normalizedType = this.normalizeConversationMessageType(
      message?.messageType,
      rawPayload,
      {},
    );
    const text = this.extractMessageTextFromPayload(
      this.unwrapMessagePayload(rawPayload?.message || rawPayload),
      normalizedType,
    );
    return [
      String(message?.messageTimestamp || '').trim(),
      message?.key?.fromMe ? '1' : '0',
      normalizedType,
      String(text || '').trim().slice(0, 80),
      String(index),
    ].join(':');
  }

  private buildSyntheticInboxMessageId(value: string) {
    let hashOne = 0xdeadbeef;
    let hashTwo = 0x41c6ce57;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      hashOne = Math.imul(hashOne ^ code, 2654435761);
      hashTwo = Math.imul(hashTwo ^ code, 1597334677);
    }
    hashOne = Math.imul(hashOne ^ (hashOne >>> 16), 2246822507) ^ Math.imul(hashTwo ^ (hashTwo >>> 13), 3266489909);
    hashTwo = Math.imul(hashTwo ^ (hashTwo >>> 16), 2246822507) ^ Math.imul(hashOne ^ (hashOne >>> 13), 3266489909);
    const numeric = 4294967296 * (2097151 & hashTwo) + (hashOne >>> 0);
    return String(numeric);
  }

  private resolveLiveMessageStatus(message: WebwhatsFetchedMessage, direction: string) {
    const statuses = [
      this.normalizeMessageMetadataText(message?.status),
      ...(Array.isArray(message?.MessageUpdate)
        ? message.MessageUpdate.map((entry) => this.normalizeMessageMetadataText(entry?.status))
        : []),
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toUpperCase());

    if (statuses.includes('READ')) return 'READ';
    if (statuses.includes('DELIVERY_ACK') || statuses.includes('DELIVERED')) return 'DELIVERED';
    if (statuses.includes('ERROR') || statuses.includes('FAILED')) return 'FAILED';
    return direction === 'OUTBOUND' ? 'SENT' : 'RECEIVED';
  }

  private buildLiveConversationMessages(
    messages: WebwhatsFetchedMessage[],
    stateMetadata?: Record<string, any>,
  ) {
    const orderedMessages = [...(messages || [])].sort((left, right) => {
      const leftTime = this.resolveLiveMessageDate(left?.messageTimestamp)?.getTime() || 0;
      const rightTime = this.resolveLiveMessageDate(right?.messageTimestamp)?.getTime() || 0;
      return leftTime - rightTime;
    });
    const deletedByKey = new Map<string, { deletedAt: Date; deletedBy: 'self' | 'contact' }>();
    const localHiddenEntries = Array.isArray(stateMetadata?.whatsappLocalHiddenMessages)
      ? stateMetadata.whatsappLocalHiddenMessages.filter(
          (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
        )
      : [];
    const localHiddenByKey = new Map<
      string,
      {
        hiddenAt: string | null;
        hiddenByUserId: number | null;
        originalText: string | null;
        originalMessageType: string | null;
      }
    >(
      localHiddenEntries
        .map((entry) => ({
          key: this.normalizeMessageMetadataText((entry as Record<string, any>).key),
          hiddenAt: this.normalizeMessageMetadataText((entry as Record<string, any>).hiddenAt),
          hiddenByUserId:
            (entry as Record<string, any>).hiddenByUserId === undefined ||
            (entry as Record<string, any>).hiddenByUserId === null
              ? null
              : Number((entry as Record<string, any>).hiddenByUserId),
          originalText: this.normalizeMessageMetadataText((entry as Record<string, any>).originalText),
          originalMessageType: this.normalizeMessageMetadataText(
            (entry as Record<string, any>).originalMessageType,
          ),
        }))
        .filter((entry) => entry.key)
        .map((entry) => [
          String(entry.key),
          {
            hiddenAt: entry.hiddenAt || null,
            hiddenByUserId: Number.isFinite(entry.hiddenByUserId) ? entry.hiddenByUserId : null,
            originalText: entry.originalText || null,
            originalMessageType: entry.originalMessageType || null,
          },
        ]),
    );

    for (const message of orderedMessages) {
      const protocolType = this.normalizeMessageMetadataText(message?.message?.protocolMessage?.type)?.toUpperCase();
      const revokedMessageId = this.normalizeMessageMetadataText(message?.message?.protocolMessage?.key?.id);
      if (protocolType === 'REVOKE' && revokedMessageId) {
        deletedByKey.set(revokedMessageId, {
          deletedAt: this.resolveLiveMessageDate(message?.messageTimestamp) || new Date(),
          deletedBy: message?.key?.fromMe ? 'self' : 'contact',
        });
      }
    }

    return orderedMessages
      .filter((message) => {
        const protocolType = this.normalizeMessageMetadataText(message?.message?.protocolMessage?.type)?.toUpperCase();
        return protocolType !== 'REVOKE';
      })
      .map((message, index) => {
        const rawPayload =
          message && typeof message === 'object' && !Array.isArray(message)
            ? (message as Record<string, any>)
            : {};
        const stableKey = this.buildLiveMessageStableKey(message, index);
        const rawKeyId = this.normalizeMessageMetadataText(message?.key?.id || message?.id) || stableKey;
        const syntheticId = this.buildSyntheticInboxMessageId(stableKey);
        const normalizedMessageType = this.normalizeConversationMessageType(
          message?.messageType,
          rawPayload,
          {},
        );
        const deletedState = deletedByKey.get(rawKeyId);
        const localHiddenState =
          localHiddenByKey.get(rawKeyId) || localHiddenByKey.get(`synthetic:${syntheticId}`) || null;
        const payload = this.unwrapMessagePayload(rawPayload?.message || rawPayload);
        const originalText = this.extractMessageTextFromPayload(payload, normalizedMessageType);
        const deletedAt = deletedState?.deletedAt || null;
        const variables = {
          ...(deletedState
            ? {
                isDeleted: true,
                deletedAt: deletedAt?.toISOString() || null,
                deletedBy: deletedState.deletedBy,
                deletedRevealUntil: deletedAt
                  ? new Date(deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
                  : null,
                deletedOriginalText: originalText || null,
                deletedOriginalMessageType: normalizedMessageType || null,
              }
            : {}),
          ...(localHiddenState
            ? {
                isLocalHidden: true,
                localHiddenAt: localHiddenState.hiddenAt || null,
                localHiddenByUserId: localHiddenState.hiddenByUserId,
                localHiddenOriginalText: localHiddenState.originalText || originalText || null,
                localHiddenOriginalMessageType:
                  localHiddenState.originalMessageType || normalizedMessageType || null,
              }
            : {}),
        };
        const direction = message?.key?.fromMe ? 'OUTBOUND' : 'INBOUND';
        return {
          id: syntheticId,
          direction,
          messageType: this.normalizeMessageMetadataText(message?.messageType) || normalizedMessageType || 'text',
          body: deletedState ? '[mensagem apagada]' : originalText,
          senderType: direction === 'OUTBOUND' ? 'human' : 'client',
          status: this.resolveLiveMessageStatus(message, direction),
          sourceModule: null,
          error: null,
          timestamp: this.resolveLiveMessageDate(message?.messageTimestamp) || new Date(),
          providerMessageId: this.normalizeMessageMetadataText(message?.key?.id || message?.id),
          rawPayload: JSON.stringify(rawPayload),
          variablesJson: Object.keys(variables).length ? JSON.stringify(variables) : null,
        };
      });
  }

  private async loadLiveChatsForCompany(
    companyId: number,
    opts?: {
      limit?: number;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    try {
      return await this.webwhatsBridge.listLiveChats(companyId, {
        limit: opts?.limit,
      }, selector);
    } catch (error) {
      throw this.mapInboxProviderReadError(error, 'Falha ao carregar conversas do WhatsApp.');
    }
  }

  private mapInboxProviderReadError(error: unknown, fallbackMessage: string) {
    if (error instanceof WebwhatsProviderError) {
      if (error.code === 'WEBWHATS_NOT_CONNECTED') {
        return new ConflictException(
          'Sessao do WhatsApp desconectada. Reconecte o dispositivo para carregar a inbox.',
        );
      }
      if (error.code === 'WEBWHATS_NOT_CONFIGURED') {
        return new ServiceUnavailableException(
          'Integracao do WhatsApp nao configurada para esta empresa.',
        );
      }
      if (error.code === 'WEBWHATS_TIMEOUT' || error.code === 'WEBWHATS_UNAVAILABLE') {
        return new ServiceUnavailableException(
          'WhatsApp indisponivel no momento. Tente novamente.',
        );
      }
      if (error.providerMessage) {
        return new BadRequestException(error.providerMessage);
      }
      return new BadRequestException(error.message || fallbackMessage);
    }

    return error instanceof Error
      ? new BadRequestException(error.message || fallbackMessage)
      : new BadRequestException(fallbackMessage);
  }

  private async ensureConversation(
    companyId: number,
    id: number,
    scope?: InboxWhatsappSessionScope,
  ) {
    // POR USUÁRIO: mutação escopada igual à leitura (getConversationById/listConversationMessages).
    // Vendedor (mode 'current') só atua na conversa da PRÓPRIA sessão webwhats — sem isso, ele
    // bloqueava/mudava status de conversa de OUTRO vendedor da empresa adivinhando o id numérico.
    // Admin/Master (mode 'company'), só-Meta (mode 'meta') e contexto de sistema (scope ausente,
    // ex.: auto-delete por motivo) mantêm a visão da empresa (companyId apenas).
    const sessionWhere =
      scope && scope.mode === 'current'
        ? { whatsappConnectionSessionId: scope.currentSessionId }
        : scope && scope.mode === 'company' && scope.restricted
          // GERENTE: mutação confinada ao TIME (mesmo conjunto que ele VÊ) — nunca a conversa do
          // admin-dono/master adivinhando o id. Inclui só-Meta (sessão null) quando Meta ativo.
          ? {
              OR: [
                { whatsappConnectionSessionId: { in: scope.sessionIds ?? [] } },
                ...(scope.metaActive ? [{ whatsappConnectionSessionId: null }] : []),
              ],
            }
          : {};
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id, companyId, channel: 'whatsapp', ...sessionWhere },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async resolveInboxMutationSessionScope(user: any, companyId: number) {
    // Mesmo escopo que a leitura por usuário usa: sessão DESTE vendedor; admin/Master agrega
    // como 'company' (visão da empresa). Usado pelas mutações de conversa do Atendimento.
    return this.resolveInboxWhatsappSessionScope(companyId, {
      userId: Number(user?.id || 0) || undefined,
      aggregate: this.isAggregateUser(user), user,
    });
  }

  private async ensureConversationMessage(companyId: number, conversationId: number, messageId: number) {
    const message = await this.prisma.companyMessage.findFirst({
      where: { id: messageId, companyId, conversationId },
      select: {
        id: true,
        companyId: true,
        conversationId: true,
        direction: true,
        messageType: true,
        body: true,
        senderType: true,
        providerMessageId: true,
        variablesJson: true,
        rawPayload: true,
        timestamp: true,
      },
    });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  private async markStoredMessageAsDeleted(
    message: {
      id: number;
      body: string;
      messageType: string;
      variablesJson: string | null;
      rawPayload: string | null;
    },
    input: {
      deletedAt?: Date | null;
      deletedBy: 'self' | 'contact';
      rawPayload?: unknown;
    },
  ) {
    const currentVariables = this.parseConversationMetadata(message.variablesJson);
    const deletedAt = input.deletedAt instanceof Date ? input.deletedAt : new Date();
    const deletedAtIso = deletedAt.toISOString();
    const revealUntil = new Date(deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const originalText =
      this.normalizeMessageMetadataText(currentVariables?.deletedOriginalText) ||
      this.normalizeMessageMetadataText(message.body) ||
      null;
    const originalMessageType =
      this.normalizeMessageMetadataText(currentVariables?.deletedOriginalMessageType) ||
      this.normalizeMessageMetadataText(message.messageType) ||
      null;

    await this.prisma.companyMessage.update({
      where: { id: message.id },
      data: {
        body: '[mensagem apagada]',
        variablesJson: JSON.stringify({
          ...currentVariables,
          isDeleted: true,
          deletedAt: deletedAtIso,
          deletedBy: input.deletedBy,
          deletedRevealUntil: revealUntil,
          deletedOriginalText: originalText,
          deletedOriginalMessageType: originalMessageType,
        }),
        ...(message.rawPayload
          ? {}
          : {
              rawPayload: JSON.stringify(
                input.rawPayload && typeof input.rawPayload === 'object' ? input.rawPayload : {},
              ),
            }),
      },
    });
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
      data: { lastInteractionAt: now },
    });
  }

  // Resumo agregado da classificação por CICLO de lista (1 linha) em vez de 2 logs por conversa.
  // Ex.: "[inbox-classifier] company=7 classified=120 conversas=110 atendimento=5 recovery=3 groups=2".
  private logInboxClassifierCycle(companyId: number, summaries: any[]) {
    if (!summaries?.length) return;
    const counts = new Map<string, number>();
    for (const summary of summaries) {
      const queue = String(summary?.routeTarget || '-');
      counts.set(queue, (counts.get(queue) || 0) + 1);
    }
    const distribution = Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([queue, count]) => `${queue}=${count}`)
      .join(' ');
    this.logger.log(`[inbox-classifier] company=${companyId} classified=${summaries.length} ${distribution}`);
  }

  private async listConversationSummariesForCompany(
    companyId: number,
    options?: { take?: string | number | null },
  ) {
    const take = this.normalizeConversationTakeLimit(options?.take);
    const liveChats = await this.loadLiveChatsForCompany(companyId, {
      limit: take || 50,
    });
    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const identityContacts = liveChats.flatMap((row) => this.collectConversationIdentityContacts(row));
    const identityMap = await this.loadAtendimentoIdentityMap(
      companyId,
      identityContacts,
    );
    const sharedMap = await this.loadSharedProfileMap(
      companyId,
      identityContacts,
      identityMap,
    );
    const summaries: any[] = [];
    for (const row of liveChats) {
      const conversation = this.buildConversationReadModel(row);
      const phoneNormalized = this.resolveConversationIdentityPhone(conversation);
      const identityRow = identityMap.get(phoneNormalized);
      const sharedProfile = identityRow?.customerProfileId
        ? sharedMap.byProfileId.get(String(identityRow.customerProfileId)) ?? null
        : sharedMap.byPhoneNormalized.get(phoneNormalized) ?? null;
      summaries.push(await this.mapConversation(
        companyId,
        conversation,
        routingRules,
        identityRow,
        sharedProfile,
      ));
    }
    this.logInboxClassifierCycle(companyId, summaries);
    return summaries;
  }

  private async resolveAssigneeNames(
    rows: Array<{ assignedUserId?: number | null }>,
  ): Promise<Map<number, string>> {
    const ids = Array.from(new Set(rows.map((r) => Number(r?.assignedUserId || 0)).filter((n) => n > 0)));
    const map = new Map<number, string>();
    if (!ids.length) return map;
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    for (const u of users) if (u.name) map.set(Number(u.id), u.name);
    return map;
  }

  private async mapPersistedConversationRowsForCompany(
    companyId: number,
    rows: any[],
    routingRules: RecoveryRoutingRules,
  ) {
    const identityContacts = rows.flatMap((row) => this.collectConversationIdentityContacts(row));
    const identityMap = await this.loadAtendimentoIdentityMap(
      companyId,
      identityContacts,
    );
    const sharedMap = await this.loadSharedProfileMap(
      companyId,
      identityContacts,
      identityMap,
    );

    for (const row of rows) {
      const metadata = this.parseConversationMetadata(row.metadata);
      const activityAt =
        this.resolveConversationActivityDate(row) ||
        (metadata.manualConversationStarted ? this.resolveLatestDate(row.lastMessageAt, row.createdAt) : null);
      if (!activityAt) continue;
      if (row.lastMessageAt && activityAt.getTime() <= new Date(row.lastMessageAt).getTime()) continue;
      await this.repairConversationActivityIfStale(companyId, row.id, activityAt);
    }

    const sortedRows = [...rows].sort((left, right) => {
      const leftMetadata = this.parseConversationMetadata(left.metadata);
      const rightMetadata = this.parseConversationMetadata(right.metadata);
      const leftTime = (
        this.resolveConversationActivityDate(left) ||
        (leftMetadata.manualConversationStarted ? this.resolveLatestDate(left.lastMessageAt, left.createdAt) : null)
      )?.getTime() || 0;
      const rightTime = (
        this.resolveConversationActivityDate(right) ||
        (rightMetadata.manualConversationStarted ? this.resolveLatestDate(right.lastMessageAt, right.createdAt) : null)
      )?.getTime() || 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      const leftCreated = this.resolveLatestDate(left.createdAt)?.getTime() || 0;
      const rightCreated = this.resolveLatestDate(right.createdAt)?.getTime() || 0;
      if (leftCreated !== rightCreated) return rightCreated - leftCreated;
      return Number(right.id || 0) - Number(left.id || 0);
    });

    // Resolve os nomes dos atendentes (assignedUserId) de uma vez (batch) — sem N+1 por conversa.
    const assigneeNameById = await this.resolveAssigneeNames(sortedRows);

    const summaries: any[] = [];
    for (const row of sortedRows) {
      const metadata = this.parseConversationMetadata(row.metadata);
      const activityAt =
        this.resolveConversationActivityDate(row) ||
        (metadata.manualConversationStarted ? this.resolveLatestDate(row.lastMessageAt, row.createdAt) : null);
      const conversation = {
        ...row,
        lastRealMessageAt: activityAt || null,
        lastMessageAt: activityAt || null,
        __assignedToName: row.assignedUserId ? assigneeNameById.get(Number(row.assignedUserId)) ?? null : null,
        messages: [...(row.messages || [])].reverse(),
      };
      const phoneNormalized = this.resolveConversationIdentityPhone(conversation);
      const identityRow = identityMap.get(phoneNormalized);
      const sharedProfile = identityRow?.customerProfileId
        ? sharedMap.byProfileId.get(String(identityRow.customerProfileId)) ?? null
        : sharedMap.byPhoneNormalized.get(phoneNormalized) ?? null;
      summaries.push(await this.mapConversation(
        companyId,
        conversation,
        routingRules,
        identityRow,
        sharedProfile,
      ));
    }
    this.logInboxClassifierCycle(companyId, summaries);
    return summaries;
  }

  private async listConversationIdsByLastRealMessage(companyId: number, limit: number, skip = 0) {
    const rows = await this.prisma.$queryRaw<Array<{ id: number; lastRealMessageAt: Date | null }>>`
      SELECT
        c.id,
        MAX(m.timestamp) AS "lastRealMessageAt"
      FROM "Conversation" c
      LEFT JOIN "Message" m
        ON m."conversationId" = c.id
        AND m."companyId" = c."companyId"
        AND m.direction IN ('INBOUND', 'OUTBOUND')
        AND COALESCE(m."messageType", '') <> 'system_event'
        AND COALESCE(m."senderType", '') <> 'system'
      WHERE c."companyId" = ${companyId}
        AND c.channel = 'whatsapp'
      GROUP BY c.id, c."createdAt"
      ORDER BY MAX(m.timestamp) DESC NULLS LAST, c."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${skip}
    `;
    return rows.map((row) => Number(row.id)).filter(Boolean);
  }

  private async listOperationalConversationIdsByMetadata(companyId: number, limit = 200) {
    const rows = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        OR: [
          { metadata: { contains: '"vendasAgendaQueue"' } },
          { metadata: { contains: '"sourceModule":"vendas"' } },
          { metadata: { contains: '"queueTarget":"prospeccao"' } },
          { metadata: { contains: '"routeTarget":"prospeccao"' } },
          { metadata: { contains: '"queueTarget":"excluidos"' } },
          { metadata: { contains: '"routeTarget":"excluidos"' } },
          { metadata: { contains: '"whatsappAvailabilityStatus":"unavailable"' } },
          { metadata: { contains: '"inboxManualQueueOverride":"archived"' } },
          { metadata: { contains: '"inboxLocalDeleted":true' } },
          { metadata: { contains: '"atendimentoBlockedAt"' } },
          // "+nova" do Atendimento: conversa manual ainda SEM mensagem precisa aparecer
          // na lista mesmo sem msg real (o gate por última-msg-real a deixaria de fora).
          { metadata: { contains: '"manualConversationStarted":true' } },
          {
            flowResult: {
              in: [
                'local_deleted',
                'no_response_archived',
                'manual_closed',
                'encerrado',
                'encerrado_operador',
                'bot_closed',
                'blocked_manual',
                'prospection_negative',
              ],
            },
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(1, Math.min(Number(limit || 0) || 200, 500)),
      select: { id: true },
    });
    return rows.map((row) => Number(row.id)).filter(Boolean);
  }

  private async findConversationRowsByOrderedIds(companyId: number, orderedIds: number[]) {
    if (!orderedIds.length) return [];
    const rows = await this.prisma.companyConversation.findMany({
      where: { companyId, channel: 'whatsapp', id: { in: orderedIds } },
      select: {
        id: true,
        contact: true,
        whatsappConnectionSessionId: true,
        sourcePhoneNormalized: true,
        sourceTenantKey: true,
        metadata: true,
        currentFlow: true,
        currentStep: true,
        flowResult: true,
        botActive: true,
        humanAssigned: true,
        assignedUserId: true,
        createdAt: true,
        updatedAt: true,
        lastMessageAt: true,
        messages: {
          where: this.realConversationMessageWhere(),
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            direction: true,
            messageType: true,
            body: true,
            senderType: true,
            status: true,
            error: true,
            timestamp: true,
            sourceModule: true,
            outboundMessageId: true,
            providerMessageId: true,
            rawPayload: true,
            variablesJson: true,
          },
        },
      },
    });
    const rowById = new Map(rows.map((row) => [Number(row.id), row]));
    return orderedIds.map((id) => rowById.get(id)).filter(Boolean);
  }

  private async listPersistedConversationSummariesForCompany(
    companyId: number,
    options?: {
      take?: string | number | null;
      skip?: string | number | null;
      queue?: string | null;
      sessionScope?: InboxWhatsappSessionScope;
    },
  ) {
    const sessionScope = options?.sessionScope || await this.resolveInboxWhatsappSessionScope(companyId);
    // Sem WhatsApp vinculado: lista vazia (200) em vez de 503 (mesma razao do
    // listConversations). As linhas ja seriam filtradas por isRowVisible..., aqui
    // e so nao gritar 503 tambem no caminho interno.
    if (!sessionScope.accessible) return [];
    const take = this.normalizeConversationTakeLimit(options?.take, 200) || 200;
    const visibleSkip = this.normalizeConversationSkip(options?.skip);
    const queueFilter = this.normalizeConversationQueueFilter(options?.queue);
    if (queueFilter) {
      return this.listPersistedConversationSummariesForCompanyQueue(companyId, {
        take,
        skip: visibleSkip,
        queue: queueFilter,
        sessionScope,
      });
    }
    const rows: Array<{
      id: number;
      contact: string;
      metadata: unknown;
      currentFlow: string | null;
      currentStep: string | null;
      flowResult: string | null;
      botActive: boolean;
      humanAssigned: boolean;
      assignedUserId: number | null;
      createdAt: Date;
      updatedAt: Date;
      lastMessageAt: Date | null;
      messages: Array<{
        id: number;
        direction: string;
        messageType: string | null;
        body: string | null;
        senderType: string | null;
        status: string | null;
        error: string | null;
        timestamp: Date;
        sourceModule: string | null;
        providerMessageId: string | null;
        rawPayload: unknown;
        variablesJson: unknown;
      }>;
    }> = [];
    const queryTake = Math.max(take, 40);
    let querySkip = 0;
    let visibleSeen = 0;

    while (rows.length < take) {
      const chunkIds = await this.listConversationIdsByLastRealMessage(companyId, queryTake, querySkip);
      const chunk = await this.findConversationRowsByOrderedIds(companyId, chunkIds);

      if (!chunk.length) break;
      querySkip += chunk.length;

      for (const row of chunk) {
        if (!this.isRowVisibleForWhatsappSessionScope(row, sessionScope)) {
          continue;
        }
        const metadata = this.parseConversationMetadata(row.metadata);
        if (this.parseBooleanMetadataFlag(metadata.whatsappConversationDeleted || metadata.inboxWhatsAppDeleted)) {
          continue;
        }
        // Limpa pelo operador: some da caixa. As mensagens continuam no banco
        // e na ficha do cliente — ver clearConversationFromInbox.
        if (this.getConversationClearedState(metadata).isCleared) {
          continue;
        }
        // Inbox 1:1 só: grupos legados que já entraram no banco não aparecem mais
        // (o espelhamento novo já bloqueia na origem — ver isSyncableChat no bridge).
        if (this.isConversationGroup(row, metadata)) {
          continue;
        }
        // Finalizadas (SOFT-hide): excluir de "Todas" — só aparecem na fila "blocked".
        if (this.getAtendimentoBlockedState(row.metadata).isBlocked) {
          continue;
        }
        if (visibleSeen < visibleSkip) {
          visibleSeen += 1;
          continue;
        }
        rows.push(row);
        visibleSeen += 1;
        if (rows.length >= take) break;
      }

      if (chunk.length < queryTake) break;
    }

    if (visibleSkip === 0) {
      const existingIds = new Set(rows.map((row) => Number(row.id)));
      const operationalIds = (await this.listOperationalConversationIdsByMetadata(companyId, Math.max(take, 120)))
        .filter((id) => !existingIds.has(id));
      const operationalRows = await this.findConversationRowsByOrderedIds(companyId, operationalIds);
      for (const row of operationalRows) {
        if (!this.isRowVisibleForWhatsappSessionScope(row, sessionScope)) {
          continue;
        }
        const metadata = this.parseConversationMetadata(row.metadata);
        if (this.parseBooleanMetadataFlag(metadata.whatsappConversationDeleted || metadata.inboxWhatsAppDeleted)) {
          continue;
        }
        // Limpa pelo operador: some da caixa. As mensagens continuam no banco
        // e na ficha do cliente — ver clearConversationFromInbox.
        if (this.getConversationClearedState(metadata).isCleared) {
          continue;
        }
        // Inbox 1:1 só: grupos legados que já entraram no banco não aparecem mais
        // (o espelhamento novo já bloqueia na origem — ver isSyncableChat no bridge).
        if (this.isConversationGroup(row, metadata)) {
          continue;
        }
        // Finalizadas (SOFT-hide): excluir de "Todas" — só aparecem na fila "blocked".
        if (this.getAtendimentoBlockedState(row.metadata).isBlocked) {
          continue;
        }
        rows.push(row);
      }
    }

    const routingRules = await this.getRecoveryRoutingRules(companyId);
    return this.mapPersistedConversationRowsForCompany(companyId, rows, routingRules);
  }

  private async listPersistedConversationSummariesForCompanyQueue(
    companyId: number,
    options: { take: number; skip: number; queue: string; sessionScope: InboxWhatsappSessionScope },
  ) {
    const take = Math.max(1, Math.min(Number(options.take || 0) || 200, 200));
    const visibleSkip = Math.max(0, Math.min(Number(options.skip || 0) || 0, 5000));
    const queueFilter = this.normalizeConversationQueueFilter(options.queue);
    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const conversations: any[] = [];
    const seenIds = new Set<number>();
    const queryTake = Math.max(take * 2, 40);
    let querySkip = 0;
    let visibleSeen = 0;

    const operationalIds = await this.listOperationalConversationIdsByMetadata(companyId, Math.max(take * 3, 120));
    const operationalRows = await this.findConversationRowsByOrderedIds(companyId, operationalIds);
    const visibleOperationalRows = operationalRows.filter((row) => {
      seenIds.add(Number(row.id));
      if (!this.isRowVisibleForWhatsappSessionScope(row, options.sessionScope)) return false;
      const metadata = this.parseConversationMetadata(row.metadata);
      if (this.getConversationClearedState(metadata).isCleared) return false;
      return !this.parseBooleanMetadataFlag(metadata.whatsappConversationDeleted || metadata.inboxWhatsAppDeleted);
    });
    const mappedOperationalRows = await this.mapPersistedConversationRowsForCompany(companyId, visibleOperationalRows, routingRules);
    for (const conversation of mappedOperationalRows) {
      if (!this.isConversationInQueueFilter(conversation, queueFilter)) continue;
      if (visibleSeen < visibleSkip) {
        visibleSeen += 1;
        continue;
      }
      conversations.push(conversation);
      visibleSeen += 1;
      if (conversations.length >= take) break;
    }

    while (conversations.length < take) {
      const chunkIds = await this.listConversationIdsByLastRealMessage(companyId, queryTake, querySkip);
      const chunk = await this.findConversationRowsByOrderedIds(companyId, chunkIds);

      if (!chunk.length) break;
      querySkip += chunk.length;

      const visibleRows = chunk.filter((row) => {
        if (seenIds.has(Number(row.id))) return false;
        seenIds.add(Number(row.id));
        if (!this.isRowVisibleForWhatsappSessionScope(row, options.sessionScope)) return false;
        const metadata = this.parseConversationMetadata(row.metadata);
        if (this.getConversationClearedState(metadata).isCleared) return false;
        return !this.parseBooleanMetadataFlag(metadata.whatsappConversationDeleted || metadata.inboxWhatsAppDeleted);
      });
      const mappedRows = await this.mapPersistedConversationRowsForCompany(companyId, visibleRows, routingRules);
      for (const conversation of mappedRows) {
        if (!this.isConversationInQueueFilter(conversation, queueFilter)) continue;
        if (visibleSeen < visibleSkip) {
          visibleSeen += 1;
          continue;
        }
        conversations.push(conversation);
        visibleSeen += 1;
        if (conversations.length >= take) break;
      }

      if (chunk.length < queryTake) break;
    }

    return conversations;
  }

  private async getPersistedConversationByIdForCompany(
    companyId: number,
    id: number,
    options?: { messagesLimit?: number; sessionScope?: InboxWhatsappSessionScope; companyWide?: boolean },
  ) {
    const messagesLimit = this.normalizeMessagePageLimit(options?.messagesLimit, 20);
    // companyWide: echo pós-mutação já autorizada — sem filtro de sessão e sem gate de WhatsApp
    // (a mutação já validou a conversa). Evita o 404 do ponteiro da empresa (conversa de sessão ≠
    // ponteiro) e o 503 de mutação só-de-banco quando o WhatsApp está fora.
    let sessionWhere: { whatsappConnectionSessionId?: string | null } = {};
    if (!options?.companyWide) {
      const sessionScope = options?.sessionScope || await this.resolveInboxWhatsappSessionScope(companyId);
      this.assertInboxWhatsappAccessible(sessionScope);
      sessionWhere =
        sessionScope.mode === 'current'
          ? { whatsappConnectionSessionId: sessionScope.currentSessionId }
          : {};
    }
    const loadRow = () => this.prisma.companyConversation.findFirst({
      where: { companyId, id, channel: 'whatsapp', ...sessionWhere },
      select: {
        id: true,
        contact: true,
        whatsappConnectionSessionId: true,
        sourcePhoneNormalized: true,
        sourceTenantKey: true,
        metadata: true,
        currentFlow: true,
        currentStep: true,
        flowResult: true,
        botActive: true,
        humanAssigned: true,
        assignedUserId: true,
        createdAt: true,
        updatedAt: true,
        lastMessageAt: true,
        messages: {
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
          take: messagesLimit,
          select: {
            id: true,
            direction: true,
            messageType: true,
            body: true,
            senderType: true,
            status: true,
            error: true,
            timestamp: true,
            sourceModule: true,
            outboundMessageId: true,
            providerMessageId: true,
            rawPayload: true,
            variablesJson: true,
          },
        },
      },
    });

    let row = await loadRow();

    if (!row) {
      throw new NotFoundException('Conversation not found');
    }

    if (this.needsConversationMediaHydration(row.messages, String(row.contact || ''), row.metadata)) {
      this.triggerBackgroundInboxConversationSync(companyId, id);
    }

    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const identityContacts = this.collectConversationIdentityContacts(row);
    const identityMap = await this.loadAtendimentoIdentityMap(companyId, identityContacts);
    const phoneNormalized = this.resolveConversationIdentityPhone(row);
    const identityRow = identityMap.get(phoneNormalized);
    const sharedMap = await this.loadSharedProfileMap(companyId, identityContacts, identityMap);
    const rowMetadata = this.parseConversationMetadata(row.metadata);
    const activityAt =
      this.resolveConversationActivityDate(row) ||
      (rowMetadata.manualConversationStarted ? this.resolveLatestDate(row.lastMessageAt, row.createdAt) : null);
    await this.repairConversationActivityIfStale(companyId, row.id, activityAt);

    return this.mapConversation(
      companyId,
      {
        ...row,
        lastRealMessageAt: activityAt || null,
        lastMessageAt: activityAt || null,
        messages: [...(row.messages || [])].reverse(),
      },
      routingRules,
      identityRow,
      identityRow?.customerProfileId
        ? sharedMap.byProfileId.get(String(identityRow.customerProfileId)) ?? null
        : sharedMap.byPhoneNormalized.get(phoneNormalized) ?? null,
    );
  }

  async getBootstrap(user: any, take?: string | number, options?: { light?: string | boolean | number | null }) {
    const companyId = this.requireCompanyIdFromUser(user);
    const lightMode = this.parseBooleanMetadataFlag(options?.light);
    const requestedTake = this.normalizeConversationTakeLimit(take, 200) || 200;
    const bootstrapMode = lightMode ? 'light' : 'full';
    const userId = Number(user?.id || 0) || undefined;
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, { userId, aggregate: this.isAggregateUser(user), user });
    sessionScope.providerHealth = await this.getWhatsAppProviderHealth(companyId);
    if (!sessionScope.accessible) {
      return {
        conversations: [],
        selectedConversation: null,
        selectedConversationId: null,
        providerWarning: {
          code: 'WHATSAPP_REQUIRED',
          message: 'Atendimento indisponível sem WhatsApp/celular vinculado.',
        },
        whatsappSession: this.buildWhatsappSessionMetadata(sessionScope),
        bootstrapMode,
        hasMoreConversations: false,
        nextSkip: null,
      };
    }
    const loadTake = Math.min(requestedTake + 1, 200);
    const loadedConversations = await this.listPersistedConversationSummariesForCompany(companyId, {
      take: loadTake,
      sessionScope,
    });
    const hasMoreConversations = loadedConversations.length > requestedTake;
    const conversations = loadedConversations.slice(0, requestedTake);

    const firstConversationId = conversations[0]?.id ? Number(conversations[0].id) : null;
    let selectedConversation: any = null;

    if (firstConversationId && !lightMode) {
      this.triggerBackgroundInboxConversationSync(companyId, firstConversationId);
      selectedConversation = await this.getPersistedConversationByIdForCompany(companyId, firstConversationId, {
        messagesLimit: 20,
        sessionScope,
      });
    }

    return {
      conversations,
      selectedConversation,
      selectedConversationId: firstConversationId ? String(firstConversationId) : null,
      providerWarning: null,
      whatsappSession: this.buildWhatsappSessionMetadata(sessionScope),
      bootstrapMode,
      hasMoreConversations,
      nextSkip: hasMoreConversations ? conversations.length : null,
    };
  }

  async bootstrapFullMirror(user: any, take?: string | number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const takeLimit = Math.max(1, Math.min(Number(this.normalizeConversationTakeLimit(take, 120) || 120), 120));

    return this.runBootstrapFullMirror(companyId, takeLimit, Number(user?.id || 0) || undefined);
  }

  async bootstrapFullMirrorBackground(user: any, take?: string | number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const takeLimit = Math.max(1, Math.min(Number(this.normalizeConversationTakeLimit(take, 120) || 120), 120));
    const userId = Number(user?.id || 0) || undefined;
    // POR USUÁRIO: dedup do job por user (cada vendedor espelha a SUA sessão), não por empresa.
    const jobKey = `${companyId}:${userId ?? 'company'}`;
    const currentJob = this.fullMirrorJobs.get(jobKey);

    if (currentJob) {
      return {
        success: true,
        connected: true,
        engine: 'webwhats',
        accepted: true,
        alreadyRunning: true,
        message: 'Espelhamento da Inbox ja esta em andamento no backend.',
        error: null,
      };
    }

    const job = this.runBootstrapFullMirror(companyId, takeLimit, userId)
      .catch((error: any) => {
        const message = String(error?.message || error || 'Falha ao espelhar Inbox em background.');
        this.logger.error(`Inbox bootstrap background falhou company=${companyId}: ${message}`);
      })
      .finally(() => {
        this.fullMirrorJobs.delete(jobKey);
      });

    this.fullMirrorJobs.set(jobKey, job);

    return {
      success: true,
      connected: true,
      engine: 'webwhats',
      accepted: true,
      alreadyRunning: false,
      message: 'Espelhamento da Inbox iniciado no backend.',
      error: null,
    };
  }

  private async runBootstrapFullMirror(companyId: number, takeLimit: number, userId?: number) {
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, { userId });
    this.assertInboxWhatsappAccessible(sessionScope);
    if (sessionScope.mode !== 'current' || !sessionScope.currentSessionId) {
      throw new ServiceUnavailableException('WhatsApp sem sessão ativa');
    }
    // POR USUÁRIO: espelha a instância da sessão DESTE user (não o ponteiro da empresa).
    const selector: WebwhatsSessionSelector = { sessionId: sessionScope.currentSessionId };
    this.logger.log(
      `Inbox bootstrap inicial iniciado company=${companyId} session=${sessionScope.currentSessionId} limit=${takeLimit}.`,
    );

    try {
      const contacts = await this.webwhatsBridge.listContacts(companyId, {
        force: true,
        failOnError: true,
      }, selector);
      this.logger.log(
        `Inbox bootstrap contatos sincronizados company=${companyId} count=${contacts.length}.`,
      );

      const chatsSynced = await this.webwhatsBridge.syncRecentChats(companyId, {
        force: true,
        limit: takeLimit,
        failOnError: true,
      }, selector);
      this.logger.log(
        `Inbox bootstrap chats sincronizados company=${companyId} count=${chatsSynced}.`,
      );

      const conversationRows = await this.prisma.companyConversation.findMany({
        where: {
          companyId,
          channel: 'whatsapp',
          whatsappConnectionSessionId: sessionScope.currentSessionId,
        },
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        take: takeLimit,
        select: {
          id: true,
          contact: true,
          metadata: true,
          lastMessageAt: true,
        },
      });

      let conversationsMirrored = 0;
      let messagesMirrored = 0;
      let mediaMessagesMirrored = 0;
      let pagesFetched = 0;
      const failures: Array<{ id: number; message: string }> = [];
      const chunkSize = 3;

      for (let start = 0; start < conversationRows.length; start += chunkSize) {
        const chunk = conversationRows.slice(start, start + chunkSize);
        const chunkResults: Array<
          | { ok: true; conversationId: number; result: WebwhatsConversationSyncResult }
          | { ok: false; conversationId: number; message: string }
        > = [];
        for (const conversation of chunk) {
          try {
            // HISTÓRICO SOBERANO (metade 1 da lei, ver topo do arquivo): janela
            // de cortesia, não escavação. Era limit:120 × maxPages:80.
            const result = await this.webwhatsBridge.syncConversationMessagesDetailed(
              companyId,
              conversation.id,
              {
                force: true,
                limit: HBX_BOOTSTRAP_RECENT_MESSAGES,
                fullSync: false,
                maxPages: HBX_BOOTSTRAP_MAX_PAGES,
                downloadMedia: false,
                failOnError: true,
              },
              selector,
            );
            chunkResults.push({
              ok: true,
              conversationId: conversation.id,
              result,
            });
          } catch (error: any) {
            chunkResults.push({
              ok: false,
              conversationId: conversation.id,
              message: String(
                error?.message || error || 'Falha ao sincronizar conversa do WhatsApp.',
              ),
            });
          }
        }

        for (const chunkResult of chunkResults) {
          if (chunkResult.ok === false) {
            failures.push({
              id: chunkResult.conversationId,
              message: chunkResult.message,
            });
            continue;
          }

          const stats: WebwhatsConversationSyncResult = chunkResult.result;
          conversationsMirrored += 1;
          messagesMirrored += Math.max(0, Number(stats.syncedMessages || 0));
          mediaMessagesMirrored += Math.max(0, Number(stats.mediaMessages || 0));
          pagesFetched += Math.max(0, Number(stats.pagesFetched || 0));
        }

        this.logger.log(
          `Inbox bootstrap progresso company=${companyId} processed=${Math.min(
            start + chunk.length,
            conversationRows.length,
          )}/${conversationRows.length} messages=${messagesMirrored} pages=${pagesFetched}.`,
        );
      }

      // PR3: bootstrap parcial — UMA conversa ruim não derruba o espelhamento inteiro.
      // 503 SÓ quando NADA espelhou (todas as conversas falharam): aí é sinal de
      // motor/provider fora, não de uma conversa isolada. O guard de provider-offline
      // de verdade (motor desligado) já estourou ANTES do laço, no failOnError do
      // listContacts/syncRecentChats (cai no catch externo → 503).
      const allFailed =
        conversationRows.length > 0 && failures.length === conversationRows.length;
      if (allFailed) {
        const failurePreview = failures
          .slice(0, 5)
          .map((item) => `${item.id}:${item.message}`)
          .join(' | ');
        this.logger.error(
          `Inbox bootstrap falhou company=${companyId} failed=${failures.length}/${conversationRows.length} (todas) details=${failurePreview}`,
        );
        throw new ServiceUnavailableException(
          'Falha ao espelhar nomes, fotos, historico e midias do WhatsApp. Tente novamente com o motor online.',
        );
      }
      const partial = failures.length > 0;
      if (partial) {
        const failurePreview = failures
          .slice(0, 5)
          .map((item) => `${item.id}:${item.message}`)
          .join(' | ');
        // Parcial = SUCESSO. Loga como warn (não error) — o espelhamento entregou
        // a maioria; só algumas conversas ficaram pra trás.
        this.logger.warn(
          `Inbox bootstrap parcial company=${companyId} failed=${failures.length}/${conversationRows.length} details=${failurePreview}`,
        );
      }

      const refreshedRows = conversationRows.length
        ? await this.prisma.companyConversation.findMany({
            where: {
              id: { in: conversationRows.map((conversation) => conversation.id) },
            },
            select: {
              id: true,
              metadata: true,
            },
          })
        : [];
      const conversationsWithNames = refreshedRows.filter((row) =>
        this.hasPersistedWhatsAppDisplayName(row.metadata),
      ).length;
      const conversationsWithAvatars = refreshedRows.filter((row) =>
        this.hasPersistedWhatsAppAvatar(row.metadata),
      ).length;
      const heavySync =
        conversationsMirrored >= 12 || messagesMirrored >= 180 || pagesFetched >= 12;
      const message = conversationRows.length
        ? `Inbox espelhada com ${conversationsMirrored} conversa(s), ${messagesMirrored} mensagem(ns) e ${contacts.length} contato(s).`
        : 'Motor conectado. Nenhuma conversa recente exigiu espelhamento inicial.';

      this.logger.log(
        `Inbox bootstrap concluido company=${companyId} conversations=${conversationsMirrored}/${conversationRows.length} messages=${messagesMirrored} media=${mediaMessagesMirrored} contacts=${contacts.length} names=${conversationsWithNames} avatars=${conversationsWithAvatars}.`,
      );

      return {
        success: true,
        connected: true,
        engine: 'webwhats',
        chatsSynced,
        contactsSynced: contacts.length,
        conversationsDiscovered: conversationRows.length,
        conversationsMirrored,
        messagesMirrored,
        mediaMessagesMirrored,
        pagesFetched,
        conversationsWithNames,
        conversationsWithAvatars,
        heavySync,
        // PR3: opcionais — só ACRESCENTAM. Front que lê success/contadores não quebra.
        // partial=true quando algumas conversas falharam mas o resto espelhou.
        partial,
        failures: failures.map((item) => ({ id: item.id, reason: item.message })),
        message,
        error: null,
      };
    } catch (error: any) {
      const message = String(
        error?.message || error || 'Falha ao executar o bootstrap inicial da Inbox.',
      );
      this.logger.error(`Inbox bootstrap falhou company=${companyId}: ${message}`);
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      if (error instanceof WebwhatsProviderError) {
        throw new ServiceUnavailableException(message);
      }
      throw new ServiceUnavailableException(message);
    }
  }

  // KPIs da tela de Atendimento: tempo médio de 1ª resposta (últimos 7 dias)
  // e conversões (leads com venda confirmada). Leitura agregada; sem schema novo.
  async getInboxMetrics(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const windowDays = 7;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const messages = await this.prisma.companyMessage.findMany({
      where: { companyId, timestamp: { gte: since } },
      select: { conversationId: true, direction: true, timestamp: true },
      orderBy: { timestamp: 'desc' },
      take: 8000,
    });

    // Agrupa por conversa; mede do PRIMEIRO inbound não respondido até o
    // próximo outbound (tempo de 1ª resposta por "rajada").
    const byConversation = new Map<number, Array<{ dir: string; at: number }>>();
    for (const m of messages) {
      const list = byConversation.get(m.conversationId) || [];
      list.push({ dir: String(m.direction || '').toUpperCase(), at: m.timestamp.getTime() });
      byConversation.set(m.conversationId, list);
    }

    const maxGapMs = windowDays * 24 * 60 * 60 * 1000;
    let responseSum = 0;
    let responseEpisodes = 0;
    for (const list of byConversation.values()) {
      list.sort((a, b) => a.at - b.at);
      let pendingInboundAt: number | null = null;
      for (const item of list) {
        if (item.dir === 'INBOUND') {
          if (pendingInboundAt === null) pendingInboundAt = item.at;
        } else if (item.dir === 'OUTBOUND' && pendingInboundAt !== null) {
          const delta = item.at - pendingInboundAt;
          if (delta >= 0 && delta <= maxGapMs) {
            responseSum += delta;
            responseEpisodes += 1;
          }
          pendingInboundAt = null;
        }
      }
    }

    const avgResponseSeconds =
      responseEpisodes > 0 ? Math.round(responseSum / responseEpisodes / 1000) : null;

    let conversions = 0;
    try {
      conversions = await this.prisma.vendasLead.count({
        where: { companyId, saleStatus: 'sale_confirmed' },
      });
    } catch {
      // VendasLead pode não estar acessível em ambiente parcial — KPI vira 0.
      conversions = 0;
    }

    const outbox = await this.getOutboxMetrics(companyId);

    return { windowDays, avgResponseSeconds, responseEpisodes, conversions, outbox };
  }

  // INTENTENGINE S4 (docs/PLANEJAMENTOS/INTENTENGINE/INTENTENGINE-sprint4.md): FURO 2 — a
  // fila de outbox (backend/src/messaging/messaging.service.ts) era invisível. 4 counts
  // baratos pra dar visibilidade sem virar dashboard pesado. Falha isolada (ambiente
  // parcial/tabela indisponível) não derruba o resto de /inbox/metrics — cai em zeros.
  private async getOutboxMetrics(companyId: number) {
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [pending, failed24h, stuckSending, oldestPending] = await Promise.all([
        this.prisma.outboundMessage.count({ where: { companyId, status: 'PENDING' } }),
        this.prisma.outboundMessage.count({
          where: { companyId, status: 'FAILED', failedAt: { gte: since24h } },
        }),
        this.prisma.outboundMessage.count({ where: { companyId, status: 'SENDING' } }),
        this.prisma.outboundMessage.findFirst({
          where: { companyId, status: 'PENDING' },
          orderBy: { nextAttemptAt: 'asc' },
          select: { nextAttemptAt: true, createdAt: true },
        }),
      ]);

      const oldestPendingAgeSec = oldestPending
        ? Math.max(0, Math.round((Date.now() - oldestPending.createdAt.getTime()) / 1000))
        : 0;

      return { pending, failed24h, stuckSending, oldestPendingAgeSec };
    } catch {
      // Tabela outbox pode não estar acessível em ambiente parcial — bloco vira zeros.
      return { pending: 0, failed24h: 0, stuckSending: 0, oldestPendingAgeSec: 0 };
    }
  }

  async listConversations(
    user: any,
    options?: {
      take?: string | number | null;
      skip?: string | number | null;
      queue?: string | null;
    },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const userId = Number(user?.id || 0) || undefined;
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, { userId, aggregate: this.isAggregateUser(user), user });
    // Sem WhatsApp vinculado: Atendimento vazio (200), NAO 503. O front mostra o
    // estado "conecte o WhatsApp" + o modal de conexao; nada de erro gritando no
    // console a cada load do Dashboard/Topbar/Atendimento (ordem do dono 14/06/2026).
    if (!sessionScope.accessible) return [];
    if (
      String(sessionScope.reason || '') === 'webwhats_status_only' &&
      !sessionScope.currentSessionId
    ) {
      throw new ServiceUnavailableException(
        'WhatsApp consta como conectado, mas a sessão operacional do Atendimento não foi criada. Revalide a conexão.',
      );
    }
    return this.listPersistedConversationSummariesForCompany(companyId, {
      ...options,
      sessionScope,
    });
  }

  // ===========================================================================
  // BUSCA DENTRO DAS CONVERSAS (01/08/2026 — ordem do dono: "fala q procura dentro
  // das conversas, mas ele só acha o nome da pessoa").
  //
  // O campo da caixa filtrava NO NAVEGADOR as conversas já carregadas, olhando só
  // nome e telefone. Procurar texto de mensagem era IMPOSSÍVEL ali: a lista carrega
  // apenas a ÚLTIMA mensagem de cada conversa (findConversationRowsByOrderedIds usa
  // `take: 1`) — ou seja, a tela prometia "buscar conversas" e entregava "filtrar os
  // nomes da página atual".
  //
  // Aqui quem procura é o SERVIDOR, na caixa INTEIRA, em 4 lugares:
  //   1. TEXTO das mensagens (o que faltava)
  //   2. telefone do contato
  //   3. nome cadastrado no HBX (AtendimentoCustomer/CustomerProfile) — a identidade
  //      que a tela mostra
  //   4. nome que o cliente se deu no WhatsApp (metadata da conversa)
  //
  // O que NÃO muda: escopo de sessão/empresa é o MESMO da lista
  // (isRowVisibleForWhatsappSessionScope) e conversa LIMPA/apagada da caixa segue
  // fora — busca não ressuscita o que o operador tirou da frente.
  // Acento não conta: "orçamento" acha "orcamento" e vice-versa (dobra os dois lados
  // com `translate`, função nativa do Postgres — sem depender de extensão).
  // ===========================================================================
  async searchConversations(
    user: any,
    options?: { q?: string | null; take?: string | number | null },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const term = String(options?.q ?? '').replace(/\s+/g, ' ').trim();
    const take = Math.max(1, Math.min(Number(options?.take || 0) || 40, 60));
    const empty = { term, conversations: [] as any[], truncated: false, messagesSearched: true };
    // Piso de 2 caracteres: 1 letra casa com meia caixa e o custo do scan não paga.
    if (term.length < 2) return empty;

    const userId = Number(user?.id || 0) || undefined;
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, {
      userId,
      aggregate: this.isAggregateUser(user),
      user,
    });
    if (!sessionScope.accessible) return empty;

    const startedAt = Date.now();
    const scanLimit = Math.max(take * 4, 200);
    const [messageHits, peopleIds] = await Promise.all([
      this.findInboxSearchMessageHits(companyId, term, scanLimit),
      this.findInboxSearchPeopleIds(companyId, term, scanLimit),
    ]);

    // Ordem: quem casou por MENSAGEM vem primeiro (é o que o dono não conseguia achar),
    // já ordenado por recência do trecho; depois os que casaram por pessoa/telefone.
    const orderedIds: number[] = [];
    const seen = new Set<number>();
    for (const id of [...messageHits.rows.keys(), ...peopleIds]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      orderedIds.push(id);
    }
    if (!orderedIds.length) {
      return { ...empty, messagesSearched: messageHits.ok };
    }

    const rows = (await this.findConversationRowsByOrderedIds(companyId, orderedIds)).filter((row: any) => {
      if (!this.isRowVisibleForWhatsappSessionScope(row, sessionScope)) return false;
      const metadata = this.parseConversationMetadata(row.metadata);
      if (this.parseBooleanMetadataFlag(metadata.whatsappConversationDeleted || metadata.inboxWhatsAppDeleted)) {
        return false;
      }
      // Limpa pelo operador: continua fora da caixa (mesma regra da lista).
      if (this.getConversationClearedState(metadata).isCleared) return false;
      if (this.isConversationGroup(row, metadata)) return false;
      return true;
    });
    const truncated = rows.length > take;
    const limited = rows.slice(0, take);

    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const summaries = await this.mapPersistedConversationRowsForCompany(companyId, limited, routingRules);
    const conversations = summaries.map((conversation: any) => {
      const hit = messageHits.rows.get(Number(conversation.id));
      return {
        ...conversation,
        // Onde casou — a tela mostra o TRECHO da mensagem no lugar da prévia, senão o
        // resultado apareceria sem explicar por que está ali.
        searchMatch: hit
          ? { field: 'message', messageId: String(hit.messageId), snippet: hit.snippet, at: hit.timestamp }
          : { field: 'contact', messageId: null, snippet: null, at: null },
      };
    });

    const elapsed = Date.now() - startedAt;
    if (elapsed > 1500) {
      // Alarme, não silêncio: busca que começa a arrastar aparece no log ANTES de virar
      // reclamação ("a caixa travou quando eu digito").
      this.logger.warn(
        `Busca do inbox lenta: company=${companyId} termo=${term.length}ch ${elapsed}ms resultados=${conversations.length}`,
      );
    }

    return { term, conversations, truncated, messagesSearched: messageHits.ok };
  }

  // Dobra de acento em SQL puro: `translate` é nativo do Postgres (não precisa da
  // extensão unaccent) e cobre o alfabeto PT-BR — mesma saída do normalizeSearch do JS.
  private static readonly INBOX_SEARCH_FOLD_FROM = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
  private static readonly INBOX_SEARCH_FOLD_TO = 'aaaaaeeeeiiiiooooouuuucn';

  private inboxSearchFoldSql(column: string) {
    return `translate(lower(coalesce(${column}, '')), '${InboxService.INBOX_SEARCH_FOLD_FROM}', '${InboxService.INBOX_SEARCH_FOLD_TO}')`;
  }

  // O que o dono digitou é DADO, nunca padrão: % e _ viram literais, e o termo entra
  // sem acento/caixa pra casar com o lado dobrado da coluna.
  private buildInboxSearchPattern(term: string) {
    const normalized = term
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[\\%_]/g, (char) => `\\${char}`);
    return `%${normalized}%`;
  }

  // Dobra acento/caixa MANTENDO o mapa pro texto original: `normalize('NFD')` na string
  // inteira MUDA o tamanho ("café" vira 5 caracteres), então o índice achado no texto
  // dobrado não serviria pra recortar o original — o trecho sairia deslocado.
  private foldInboxSearchTextWithMap(value: string) {
    let folded = '';
    const map: number[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index].normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      for (let k = 0; k < char.length; k += 1) map.push(index);
      folded += char;
    }
    map.push(value.length);
    return { folded, map };
  }

  // Trecho da mensagem em volta do termo. A linha da lista é ESTREITA e corta o resto com
  // reticências, então o recorte começa perto do que casou — senão a palavra procurada
  // ficaria justamente na parte cortada (mensagem curta que "não mostra o que achou").
  private buildInboxSearchSnippet(body: string, term: string) {
    const text = String(body || '').replace(/\s+/g, ' ').trim();
    const { folded, map } = this.foldInboxSearchTextWithMap(text);
    const foldedTerm = this.foldInboxSearchTextWithMap(term).folded;
    const at = foldedTerm ? folded.indexOf(foldedTerm) : -1;
    if (at < 0) return text.length > 90 ? `${text.slice(0, 90)}…` : text;
    const from = Math.max(0, (map[at] ?? 0) - 24);
    const to = Math.min(text.length, (map[at + foldedTerm.length] ?? text.length) + 60);
    if (from === 0 && to >= text.length) return text;
    return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
  }

  // Conversas cujo TEXTO de mensagem casa com o termo. Uma linha por conversa (a
  // mensagem mais RECENTE que casou), já ordenadas da mais nova pra mais velha.
  private async findInboxSearchMessageHits(companyId: number, term: string, limit: number) {
    const rows = new Map<number, { messageId: number; snippet: string; timestamp: Date | null }>();
    const pattern = this.buildInboxSearchPattern(term);
    try {
      const hits = await this.prisma.$queryRawUnsafe<
        Array<{ conversationId: number; messageId: number; body: string | null; timestamp: Date | null }>
      >(
        `SELECT hit."conversationId", hit."messageId", hit.body, hit.timestamp
           FROM (
             SELECT DISTINCT ON (m."conversationId")
               m."conversationId" AS "conversationId",
               m.id               AS "messageId",
               m.body             AS body,
               m.timestamp        AS timestamp
             FROM "Message" m
             WHERE m."companyId" = $1
               AND m.direction IN ('INBOUND', 'OUTBOUND')
               AND COALESCE(m."messageType", '') <> 'system_event'
               AND COALESCE(m."senderType", '') <> 'system'
               AND ${this.inboxSearchFoldSql('m.body')} LIKE $2
             ORDER BY m."conversationId", m.timestamp DESC, m.id DESC
           ) hit
          ORDER BY hit.timestamp DESC
          LIMIT $3`,
        companyId,
        pattern,
        limit,
      );
      for (const hit of hits) {
        const conversationId = Number(hit.conversationId);
        if (!conversationId || rows.has(conversationId)) continue;
        rows.set(conversationId, {
          messageId: Number(hit.messageId),
          snippet: this.buildInboxSearchSnippet(String(hit.body || ''), term),
          timestamp: hit.timestamp ?? null,
        });
      }
      return { ok: true, rows };
    } catch (error) {
      // NUNCA devolver "nada encontrado" quando na verdade a varredura FALHOU — a tela
      // avisa que só nome/telefone foram consultados (ok:false).
      this.logger.warn(
        `Busca do inbox: varredura de mensagens falhou company=${companyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, rows };
    }
  }

  // Conversas que casam por PESSOA: telefone, nome cadastrado no HBX ou nome que o
  // cliente se deu no WhatsApp (guardado no metadata).
  private async findInboxSearchPeopleIds(companyId: number, term: string, limit: number) {
    const pattern = this.buildInboxSearchPattern(term);
    const digits = term.replace(/\D/g, '');
    const ids: number[] = [];
    const push = (value: unknown) => {
      const id = Number(value);
      if (id && !ids.includes(id)) ids.push(id);
    };

    // Nome cadastrado (identidade do HBX) e telefone: casam contra a conversa pelos
    // últimos 11 dígitos (o mesmo número aparece como "+5519…", "5519…" ou JID).
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT c.id
           FROM "Conversation" c
          WHERE c."companyId" = $1
            AND c.channel = 'whatsapp'
            AND (
              ($3 <> '' AND regexp_replace(c.contact, '\\D', '', 'g') LIKE '%' || $3 || '%')
              OR EXISTS (
                SELECT 1
                  FROM "AtendimentoCustomer" ac
                  LEFT JOIN "CustomerProfile" cp ON cp.id = ac."customerProfileId"
                 WHERE ac."companyId" = c."companyId"
                   AND (${this.inboxSearchFoldSql('ac.name')} LIKE $2
                        OR ${this.inboxSearchFoldSql('cp.name')} LIKE $2)
                   AND right(regexp_replace(ac."phoneNormalized", '\\D', '', 'g'), 11)
                       = right(regexp_replace(c.contact, '\\D', '', 'g'), 11)
              )
            )
          ORDER BY c."lastMessageAt" DESC
          LIMIT $4`,
        companyId,
        pattern,
        digits.length >= 3 ? digits : '',
        limit,
      );
      for (const row of rows) push(row.id);
    } catch (error) {
      this.logger.warn(
        `Busca do inbox: varredura de contatos falhou company=${companyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Nome do WhatsApp: mora dentro do metadata, que é TEXTO (JSON serializado). O LIKE
    // aqui é só PENEIRA barata — quem decide é o parse abaixo, campo a campo. Sem isso,
    // buscar "vendas" casaria com `sourceModule` e sujaria a lista inteira.
    try {
      const candidates = await this.prisma.$queryRawUnsafe<Array<{ id: number; metadata: string | null }>>(
        `SELECT c.id, c.metadata
           FROM "Conversation" c
          WHERE c."companyId" = $1
            AND c.channel = 'whatsapp'
            AND ${this.inboxSearchFoldSql('c.metadata')} LIKE $2
          ORDER BY c."lastMessageAt" DESC
          LIMIT $3`,
        companyId,
        pattern,
        limit,
      );
      const needle = term.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      for (const candidate of candidates) {
        const metadata = this.parseConversationMetadata(candidate.metadata);
        const names = [
          metadata?.whatsappContactName,
          metadata?.whatsappProfileName,
          metadata?.waNickname,
          metadata?.whatsappName,
        ];
        const matches = names.some((name) =>
          String(name || '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .includes(needle),
        );
        if (matches) push(candidate.id);
      }
    } catch (error) {
      this.logger.warn(
        `Busca do inbox: varredura de apelidos falhou company=${companyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return ids;
  }

  async startConversation(user: any, input: { phone?: string; name?: string | null }) {
    const companyId = this.requireCompanyIdFromUser(user);
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, { userId: Number(user?.id || 0) || undefined });
    this.assertInboxWhatsappAccessible(sessionScope);
    const normalized = this.normalizeManualConversationContact(input?.phone);
    if (!normalized) {
      throw new BadRequestException('Informe um telefone valido com DDD.');
    }
    const now = new Date();
    const displayName = String(input?.name || '').replace(/\s+/g, ' ').trim();

    // FONTE DA VERDADE = motor (onWhatsApp). Ordem do dono 23/06: "bater número por
    // número" — o +Nova NÃO abre chat sem o WhatsApp CONFIRMAR que o número existe.
    // Acabou a conversa-fantasma "não verificada": sem confirmação clara = recusa.
    //   • número sem WhatsApp (fixo/errado/9 a mais que não existe) → 400 "não tem WhatsApp".
    //   • motor instável / sem resposta → 503 "não consegui confirmar agora, tente de novo"
    //     (NÃO cria nada — falha de validação jamais vira chat).
    // Mandando com OU sem o 9 o motor devolve o JID canônico; gravamos o que ELE devolve
    // (não inserimos/removemos 9 por conta própria).
    let canonicalContact = normalized.contact;
    let canonicalRemoteJid = normalized.remoteJid;
    let check: { exists?: boolean; remoteJid?: string | null; normalizedNumber?: string } | undefined;
    try {
      const selector: WebwhatsSessionSelector | undefined = sessionScope.currentSessionId
        ? { sessionId: sessionScope.currentSessionId }
        : undefined;
      [check] = await this.webwhatsBridge.checkWhatsappNumbers(
        companyId,
        [normalized.digits],
        selector,
      );
    } catch (error) {
      // Motor não respondeu: NÃO degrada criando fantasma. Recusa pedindo pra tentar de novo.
      throw new ServiceUnavailableException(
        'Não consegui confirmar esse número no WhatsApp agora (conexão instável). Tente de novo em instantes.',
      );
    }
    if (!check || !check.exists) {
      throw new BadRequestException('Esse número não tem WhatsApp — confira o DDD/celular.');
    }
    const verifiedDigits = String(
      check.remoteJid ? check.remoteJid.split('@')[0] : check.normalizedNumber || '',
    ).replace(/\D/g, '');
    if (verifiedDigits.length >= 10) {
      canonicalContact = `+${verifiedDigits}`;
      canonicalRemoteJid = check.remoteJid || `${verifiedDigits}@s.whatsapp.net`;
    }

    const metadata = {
      sourceModule: 'atendimento_manual',
      queueTarget: 'conversas',
      routeTarget: 'conversas',
      whatsappRemoteJid: canonicalRemoteJid,
      whatsappIsGroup: false,
      ...(displayName
        ? {
            whatsappName: displayName,
            whatsappContactName: displayName,
          }
        : {}),
      manualConversationStarted: true,
      manualConversationStartedAt: now.toISOString(),
      whatsappConnectionSessionId: sessionScope.currentSessionId || null,
    };
    // Casa contra o canônico do motor E contra o digitado cru: conversa aberta antes
    // (sob os dígitos errados, ex.: com o 9 a mais) é reaproveitada e migrada pro canônico.
    const canonicalDigits = canonicalContact.replace(/\D/g, '');
    const candidates = Array.from(new Set([
      canonicalContact,
      canonicalDigits,
      canonicalDigits.startsWith('55') ? `+${canonicalDigits.slice(2)}` : '',
      canonicalDigits.startsWith('55') ? canonicalDigits.slice(2) : '',
      normalized.contact,
      normalized.digits,
      normalized.digits.startsWith('55') ? `+${normalized.digits.slice(2)}` : '',
      normalized.digits.startsWith('55') ? normalized.digits.slice(2) : '',
    ].filter(Boolean)));
    const currentSessionWhere = sessionScope.currentSessionId
      ? { whatsappConnectionSessionId: sessionScope.currentSessionId }
      : {};
    let conversation = await this.prisma.companyConversation.findFirst({
      where: {
        companyId,
        channel: 'whatsapp',
        ...currentSessionWhere,
        OR: [
          ...candidates.map((contact) => ({ contact })),
          { metadata: { contains: canonicalRemoteJid } },
          { metadata: { contains: normalized.remoteJid } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (!conversation && sessionScope.currentSessionId) {
      conversation = await this.prisma.companyConversation.findFirst({
        where: {
          companyId,
          channel: 'whatsapp',
          whatsappConnectionSessionId: null,
          OR: [
            ...candidates.map((contact) => ({ contact })),
            { metadata: { contains: canonicalRemoteJid } },
            { metadata: { contains: normalized.remoteJid } },
          ],
          AND: [
            {
              OR: [
                { metadata: { contains: '"sourceModule":"atendimento_manual"' } },
                { metadata: { contains: '"manualConversationStarted":true' } },
              ],
            },
            {
              NOT: [
                { flowResult: { in: ['local_deleted', 'manual_closed', 'blocked_manual'] } },
                { metadata: { contains: '"inboxLocalDeleted":true' } },
                { metadata: { contains: '"routeTarget":"excluidos"' } },
                { metadata: { contains: '"queueTarget":"excluidos"' } },
              ],
            },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
    }

    if (conversation) {
      const previousMetadata = this.parseConversationMetadata(conversation.metadata);
      conversation = await this.prisma.companyConversation.update({
        where: { id: conversation.id },
        data: {
          contact: canonicalContact,
          metadata: JSON.stringify({ ...previousMetadata, ...metadata }),
          currentFlow: 'cobranca_recovery',
          currentStep: 'novo',
          flowResult: null,
          botActive: false,
          humanAssigned: true,
          assignedUserId: Number(user?.id || 0) || null,
          lastInteractionAt: now,
          ...(sessionScope.currentSessionId
            ? {
                whatsappConnectionSessionId: sessionScope.currentSessionId,
                sourcePhoneNormalized: sessionScope.currentSession?.phoneNormalized || undefined,
                sourceTenantKey: sessionScope.currentSession?.tenantKey || undefined,
              }
            : {}),
        },
      });
    } else {
      conversation = await this.prisma.companyConversation.create({
        data: {
          companyId,
          channel: 'whatsapp',
          contact: canonicalContact,
          currentFlow: 'cobranca_recovery',
          currentStep: 'novo',
          flowResult: null,
          botActive: false,
          humanAssigned: true,
          assignedUserId: Number(user?.id || 0) || null,
          lastInteractionAt: now,
          lastMessageAt: now,
          metadata: JSON.stringify(metadata),
          ...(sessionScope.currentSessionId
            ? {
                whatsappConnectionSessionId: sessionScope.currentSessionId,
                sourcePhoneNormalized: sessionScope.currentSession?.phoneNormalized || undefined,
                sourceTenantKey: sessionScope.currentSession?.tenantKey || undefined,
              }
            : {}),
        },
      });
    }

    await this.logInboxEvent({
      companyId,
      event: 'manual_conversation_started',
      message: 'Conversa manual iniciada pelo Atendimento.',
      conversationId: conversation.id,
      phone: canonicalContact,
      result: 'created',
      extra: {
        whatsappCommandSent: false,
        remoteJid: canonicalRemoteJid,
      },
    });

    return this.getPersistedConversationByIdForCompany(companyId, conversation.id, {
      messagesLimit: 20,
      sessionScope,
    });
  }

  // "Limpar" do Atendimento: faxina LOCAL do banco (NUNCA comando pro WhatsApp). Apaga:
  //   (1) conversas que NUNCA tiveram mensagem — as "+nova" abertas e nunca enviadas; e
  //   (2) as "bugadas/fantasma": têm mensagem, mas NENHUMA é INBOUND e NENHUMA é OUTBOUND
  //       de fato enviada (SENT/DELIVERED/READ) — só sobrou FAILED/never-sent (a fantasma do
  //       +Nova pra número que não existia / 9 errado, que travou no envio).
  // GUARDA DURA: qualquer INBOUND ou qualquer OUTBOUND SENT/DELIVERED/READ = histórico real,
  // NUNCA apaga. Respeita o MESMO escopo de visibilidade da lista (por-vendedor /
  // agregado-admin / só-Meta) — cada um só limpa o que enxerga.
  async clearEmptyConversations(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const userId = Number(user?.id || 0) || undefined;
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, {
      userId,
      aggregate: this.isAggregateUser(user),
      user,
    });
    if (!sessionScope.accessible) return { deleted: 0, ids: [] as string[] };

    // Uma mensagem conta como "real" se for INBOUND (cliente falou) OU OUTBOUND realmente
    // entregue ao motor (SENT/DELIVERED/READ). "Apagável" = a conversa NÃO tem nenhuma
    // dessas. FAILED/QUEUED/SENDING/RECEIVED-outbound não contam — nunca chegaram ao cliente.
    const REAL_OUTBOUND_STATUSES = ['SENT', 'DELIVERED', 'READ'];
    const deletableMessagesWhere = {
      AND: [
        // nenhuma mensagem INBOUND
        { messages: { none: { direction: 'INBOUND' } } },
        // nenhuma OUTBOUND realmente enviada
        { messages: { none: { direction: 'OUTBOUND', status: { in: REAL_OUTBOUND_STATUSES } } } },
      ],
    };

    // Candidatas = conversas WhatsApp da empresa sem NENHUMA mensagem real (cobre o caso
    // "zero mensagem" — subconjunto — e o caso "só FAILED/never-sent").
    const candidates = await this.prisma.companyConversation.findMany({
      where: { companyId, channel: 'whatsapp', ...deletableMessagesWhere },
      select: { id: true, whatsappConnectionSessionId: true, metadata: true, contact: true },
    });

    // Peneira pelo escopo visível + ignora já-marcadas-deletadas e grupos (mesmas
    // regras da listagem), pra "Limpar" agir só sobre o que o usuário vê na tela.
    const ids: number[] = [];
    for (const row of candidates) {
      if (!this.isRowVisibleForWhatsappSessionScope(row, sessionScope)) continue;
      const metadata = this.parseConversationMetadata(row.metadata);
      if (this.parseBooleanMetadataFlag(metadata.whatsappConversationDeleted || metadata.inboxWhatsAppDeleted)) continue;
      if (this.getConversationClearedState(metadata).isCleared) continue;
      if (this.isConversationGroup(row, metadata)) continue;
      ids.push(Number(row.id));
    }
    if (!ids.length) return { deleted: 0, ids: [] as string[] };

    let deletedIds: number[] = [];
    await this.prisma.$transaction(async (tx) => {
      // Guarda dura DENTRO da transação: reconfirma quais ainda são apagáveis. Se uma
      // mensagem REAL entrou entre a leitura e agora (corrida), a conversa sai daqui e
      // NÃO é tocada (nem ela nem as mensagens dela).
      const stillDeletable = await tx.companyConversation.findMany({
        where: { companyId, id: { in: ids }, channel: 'whatsapp', ...deletableMessagesWhere },
        select: { id: true },
      });
      deletedIds = stillDeletable.map((row) => Number(row.id));
      if (!deletedIds.length) return;

      // FK opcional (SetNull na mão, igual ao wipe-all): solta o vínculo do agendamento.
      await tx.atendimentoAppointment.updateMany({
        where: { companyId, conversationId: { in: deletedIds } },
        data: { conversationId: null },
      });
      // FK OBRIGATÓRIA (CompanyMessage.conversation = Restrict): apaga as mensagens ANTES
      // da conversa. Aqui só sobra FAILED/never-sent (o critério acima já garantiu zero
      // INBOUND e zero OUTBOUND enviado), então nada real morre — mas SEM apagar a mensagem
      // o delete da conversa estourava violação de FK = 500 no "Limpar". Faxina LOCAL:
      // nada disso vira comando pro WhatsApp do cliente.
      await tx.companyMessage.deleteMany({
        where: { companyId, conversationId: { in: deletedIds } },
      });
      await tx.companyConversation.deleteMany({
        where: { companyId, id: { in: deletedIds }, channel: 'whatsapp' },
      });
    });
    if (!deletedIds.length) return { deleted: 0, ids: [] as string[] };

    await this.logInboxEvent({
      companyId,
      event: 'empty_conversations_cleared',
      message: `[LIMPAR] ${deletedIds.length} conversa(s) removida(s) — sem mensagem real, nada enviado ao WhatsApp.`,
      result: 'cleared',
      extra: { ids: deletedIds, whatsappCommandSent: false },
    });

    return { deleted: deletedIds.length, ids: deletedIds.map(String) };
  }

  // Echo pós-mutação (enviar, marcar lida, status, fila, bloquear, claim/transfer, avatar...): a
  // conversa JÁ foi autorizada DENTRO da mutação (ensureConversation/findFirst com o scope do
  // usuário). Aqui só devolvemos o estado ATUAL, company-wide. NÃO re-resolver o ponteiro da
  // empresa: conversa de uma sessão ≠ ponteiro (admin/dono operando entre vários chips) caía em
  // NotFound → 404 na RESPOSTA mesmo com a ação já feita; o front tratava como falha e "a mensagem
  // sumia"/"marcar lida dava erro no console". Company-wide também evita 503 em mutação só-de-banco
  // quando o WhatsApp está fora.
  private async getConversationByIdForCompany(companyId: number, id: number) {
    return this.getPersistedConversationByIdForCompany(companyId, id, { companyWide: true });
  }

  async getConversationPresence(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { companyId, id, channel: 'whatsapp' },
      select: {
        id: true,
        contact: true,
        metadata: true,
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const metadata = this.parseConversationMetadata(conversation.metadata);
    const remoteJid = this.resolveConversationPresenceRemoteJid(conversation, metadata);
    if (!remoteJid) {
      return this.buildUnknownConversationPresence(null);
    }

    const sessionScope = await this.resolveInboxWhatsappSessionScope(
      companyId,
      { userId: Number(user?.id || 0) || undefined, aggregate: this.isAggregateUser(user), user },
    );
    if (!sessionScope.accessible || sessionScope.mode !== 'current') {
      return this.buildUnknownConversationPresence(remoteJid);
    }

    try {
      // POR USUÁRIO: presença pela instância da sessão atual do user (não pelo ponteiro da empresa).
      const presence = await this.webwhatsBridge.fetchPresence(
        companyId,
        remoteJid,
        sessionScope.currentSession?.tenantKey,
      );
      return {
        remoteJid: presence.remoteJid || remoteJid,
        presence: presence.presence || 'unknown',
        online: Boolean(presence.online),
        typing: Boolean(presence.typing),
        recording: Boolean(presence.recording),
        lastSeenAt: presence.lastSeenAt || null,
        updatedAt: presence.updatedAt || null,
        providerStatus: presence.presence || 'unknown',
      };
    } catch (error: any) {
      this.logger.warn(
        `Inbox conversation presence falhou company=${companyId} conversation=${conversation.id}: ${String(error?.message || error)}`,
      );
      return this.buildUnknownConversationPresence(remoteJid);
    }
  }

  async getConversationById(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    // POR USUÁRIO: escopo da sessão DESTE vendedor (igual ao listConversations/presence).
    // Sem o userId, caía no ponteiro da empresa → a conversa que o vendedor via na lista
    // dava "Conversation not found" ao abrir (sessão da conversa ≠ sessão da empresa).
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, {
      userId: Number(user?.id || 0) || undefined,
      aggregate: this.isAggregateUser(user), user,
    });
    this.assertInboxWhatsappAccessible(sessionScope);
    if (sessionScope.mode === 'current') {
      void this.syncLatestInboxConversationWindow(companyId, id);
    }
    return this.getPersistedConversationByIdForCompany(companyId, id, {
      messagesLimit: 20,
      sessionScope,
    });
  }

  async listConversationMessages(
    user: any,
    id: number,
    options?: { limit?: string | number | null; before?: string | null },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    // POR USUÁRIO: mesma sessão que a lista usa (com userId). Sem isso, abrir/pollar uma
    // conversa do vendedor resolvia o ponteiro da empresa e devolvia 404, deixando a tela
    // de Atendimento "só recebe, não abre/envia".
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId, {
      userId: Number(user?.id || 0) || undefined,
      aggregate: this.isAggregateUser(user), user,
    });
    // Sem WhatsApp vinculado: devolve VAZIO (200), nao 503 (ordem do dono "503->manso").
    // Mata o loop de erro do front ao pollar uma conversa morta da sessao antiga (#3).
    if (!sessionScope.accessible) {
      return { messages: [], hasMore: false, nextBefore: null };
    }
    const before = this.normalizeBeforeDate(options?.before || null);
    if (!before && sessionScope.mode === 'current') {
      void this.syncLatestInboxConversationWindow(companyId, id);
    }
    const sessionWhere =
      sessionScope.mode === 'current'
        ? { whatsappConnectionSessionId: sessionScope.currentSessionId }
        : {};
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { companyId, id, channel: 'whatsapp', ...sessionWhere },
      select: {
        id: true,
        contact: true,
        whatsappConnectionSessionId: true,
        metadata: true,
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const limit = this.normalizeMessagePageLimit(options?.limit, 20);
    const loadRows = () => this.prisma.companyMessage.findMany({
      where: {
        companyId,
        conversationId: id,
        ...(before ? { timestamp: { lt: before } } : {}),
      },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        direction: true,
        messageType: true,
        body: true,
        senderType: true,
        status: true,
        error: true,
        timestamp: true,
        sourceModule: true,
        outboundMessageId: true,
        providerMessageId: true,
        rawPayload: true,
        variablesJson: true,
      },
    });

    let rows = await loadRows();

    if (!before && this.needsConversationMediaHydration(rows, String(conversation.contact || ''), conversation.metadata)) {
      this.triggerBackgroundInboxConversationSync(companyId, id);
    }

    const conversationMetadata = this.parseConversationMetadata(conversation.metadata);
    const messages = [...rows]
      .reverse()
      .map((message: any) => {
        const messageMetadata = this.buildConversationMessageMetadata(
          message,
          String(conversation.contact || ''),
          conversationMetadata,
        );
        return {
          id: String(message.id),
          direction: String(message.direction || '').trim().toLowerCase(),
          content: String(messageMetadata?.resolvedText || message.body || ''),
          createdAt: message.timestamp,
          messageType: String(messageMetadata?.normalizedMessageType || message.messageType || 'text')
            .trim()
            .toLowerCase(),
          senderType: String(message.senderType || 'system').trim().toLowerCase(),
          status: String(message.status || 'RECEIVED').trim().toUpperCase(),
          sourceModule: String(message.sourceModule || '').trim().toLowerCase() || null,
          error: message.error ? String(message.error) : null,
          outboundMessageId: message.outboundMessageId ? Number(message.outboundMessageId) : null,
          metadata: messageMetadata,
        };
      })
      .filter(Boolean);

    return {
      messages,
      hasMore: rows.length === limit,
      nextBefore: rows.length ? rows[rows.length - 1].timestamp : null,
    };
  }

  private normalizeStatusCardPhone(value: unknown) {
    const digits = this.customerProfileService.normalizePhone(value);
    if (!digits) return null;
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
      return `55${digits}`;
    }
    return digits;
  }

  private getStatusCardPhoneVariants(phoneNormalized: string) {
    const variants = new Set<string>();
    const digits = String(phoneNormalized || '').replace(/\D/g, '');
    if (!digits) return [];
    variants.add(digits);
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      variants.add(digits.slice(2));
    } else if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
      variants.add(`55${digits}`);
    }
    return Array.from(variants);
  }

  private parseStatusCardDate(value: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Data de retorno invalida.');
    }
    return parsed;
  }

  private formatInboxVendasStatusLabel(statusRaw: unknown) {
    const status = String(statusRaw || '').trim().toLowerCase();
    if (status === 'contato') return 'Em contato';
    if (status === 'retorno') return 'Retorno';
    if (status === 'qualificado') return 'Qualificado';
    if (status === 'encerrado') return 'Encerrado';
    return 'Novo lead';
  }

  private formatSaleStatusLabel(statusRaw: unknown): string | null {
    const s = String(statusRaw || '').trim().toLowerCase();
    if (s === 'none' || !s) return null;
    if (s === 'activation_pending') return 'Ativação pendente';
    if (s === 'trial_started') return 'Trial ativo';
    if (s === 'sale_confirmed') return 'Venda confirmada';
    if (s === 'inactive') return 'Inativo';
    if (s === 'canceled') return 'Cancelado';
    return s;
  }

  private formatCommissionStatusLabel(statusRaw: unknown): string | null {
    const s = String(statusRaw || '').trim().toLowerCase();
    if (s === 'none' || !s) return null;
    if (s === 'pending') return 'Comissão pendente';
    if (s === 'payable') return 'Comissão a receber';
    if (s === 'paid') return 'Comissão paga';
    if (s === 'canceled') return 'Comissão cancelada';
    return s;
  }

  private fmtMoneyBrl(value: number | null | undefined): string | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

  private isMissingVendasLeadAddressColumnError(error: any) {
    const code = String(error?.code || '').trim().toUpperCase();
    if (code === 'P2022') return true;
    const message = String(error?.message || '').toLowerCase();
    return message.includes('address') && (message.includes('column') || message.includes('does not exist'));
  }

  private vendasLeadStatusCardSelectWithoutAddress() {
    return {
      id: true,
      companyId: true,
      customerProfileId: true,
      sourceType: true,
      primarySource: true,
      sourceHistoryId: true,
      sourceSignature: true,
      timesSeen: true,
      name: true,
      phone: true,
      phoneNormalized: true,
      email: true,
      website: true,
      rating: true,
      reviews: true,
      city: true,
      state: true,
      segment: true,
      opportunityScore: true,
      leadTemperature: true,
      status: true,
      nextAction: true,
      returnAt: true,
      shortNote: true,
      lastContactAt: true,
      attemptCount: true,
      lastResult: true,
      wasClosedBefore: true,
      closedAt: true,
      saleStatus: true,
      saleValue: true,
      salePlanKey: true,
      saleConfirmedAt: true,
      saleCanceledAt: true,
      commissionStatus: true,
      commissionAmount: true,
      commissionBaseAmount: true,
      commissionDueAt: true,
      commissionPaidAt: true,
      commissionRecurring: true,
      commissionNote: true,
      setupValue: true,
      setupCommissionAmount: true,
      setupCommissionStatus: true,
      productNameSnapshot: true,
      productPriceCentsSnapshot: true,
      productKindSnapshot: true,
      productBillingCycleSnapshot: true,
      productCommissionPercentSnapshot: true,
      productPlanKeySnapshot: true,
      assignedUserId: true,
      assignedByUserId: true,
      assignedAt: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
      radarCompanyStates: {
        orderBy: [{ updatedAt: 'desc' }],
        take: 1,
        include: {
          radarLead: {
            select: {
              emailStatus: true,
              emailSource: true,
              emailConfidence: true,
              websiteStatus: true,
              instagramUrl: true,
              facebookUrl: true,
              socialStatus: true,
              socialConfidence: true,
              recommendedChannel: true,
              painType: true,
              painLabel: true,
              painPitch: true,
              opportunityReason: true,
              enrichmentJson: true,
              enrichmentScore: true,
              lastEnrichedAt: true,
              enrichmentVersion: true,
              // CNPJ/dono/multi-contatos vivem no metadataJson (cnpj/razaoSocial/ownerName/
              // ownerPhone/emails/phones/phonesWhatsapp). Sem isso, o card de atendimento não exibe.
              metadataJson: true,
              // HOT-07 (empresa recém-aberta): diasAberto/recem_aberto vêm daqui
              // (RadarPublicDataService, a partir de CnpjPublicCompany.openedAt).
              signalsJson: true,
            },
          },
        },
      },
    } as any;
  }

  private vendasLeadStatusCardSelectWithTimelineWithoutAddress() {
    return {
      ...this.vendasLeadStatusCardSelectWithoutAddress(),
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      },
    } as any;
  }

  private async resolveStatusCardRecords(
    companyId: number,
    conversationId: number,
    scope?: InboxWhatsappSessionScope,
  ) {
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    const phoneNormalized = this.normalizeStatusCardPhone(conversation.contact);
    if (!phoneNormalized) {
      throw new BadRequestException('Conversa sem telefone valido para o card do cliente.');
    }
    const phoneVariants = this.getStatusCardPhoneVariants(phoneNormalized);

    let profile = await this.prisma.customerProfile.findFirst({
      where: { companyId, phoneNormalized: { in: phoneVariants } },
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (!profile) {
      const created = await this.customerProfileService.upsertProfile({
        companyId,
        phone: `+${phoneNormalized}`,
        externalSource: 'atendimento_status',
        status: 'active',
      });
      profile = await this.prisma.customerProfile.findFirst({
        where: { id: String(created.id), companyId },
      });
    }
    if (!profile) throw new BadRequestException('Nao foi possivel criar o perfil central do cliente.');

    let atendimentoCustomer = await this.prisma.atendimentoCustomer.findFirst({
      where: { companyId, phoneNormalized: { in: phoneVariants } },
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (!atendimentoCustomer) {
      atendimentoCustomer = await this.prisma.atendimentoCustomer.create({
        data: {
          companyId,
          customerProfileId: profile.id,
          name: profile.name || null,
          phone: String(conversation.contact || '').trim(),
          phoneNormalized,
          registrationOrigin: 'atendimento_status',
          registrationStatus: 'manual',
          route: 'atendimento',
          conversationId,
          lastMessageAt: conversation.lastMessageAt || conversation.updatedAt || new Date(),
        },
      });
    } else if (!atendimentoCustomer.customerProfileId) {
      atendimentoCustomer = await this.prisma.atendimentoCustomer.update({
        where: { id: atendimentoCustomer.id },
        data: { customerProfileId: profile.id },
      });
    }

    let lead: any = null;
    try {
      lead = await this.prisma.vendasLead.findFirst({
        where: {
          companyId,
          OR: [
            { phoneNormalized: { in: phoneVariants } },
            { customerProfileId: profile.id },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          timelineEvents: {
            orderBy: [{ createdAt: 'desc' }],
            take: 12,
          },
        },
      });
    } catch (error: any) {
      if (!this.isMissingVendasLeadAddressColumnError(error)) throw error;
      lead = await this.prisma.vendasLead.findFirst({
        where: {
          companyId,
          OR: [
            { phoneNormalized: { in: phoneVariants } },
            { customerProfileId: profile.id },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: this.vendasLeadStatusCardSelectWithTimelineWithoutAddress(),
      });
    }

    return { conversation, phoneNormalized, profile, atendimentoCustomer, lead };
  }

  // HOT-07 (empresa recém-aberta): mesma janela de urgência do card do Radar
  // (RadarCorePresentationMixin.FRESH_COMPANY_WINDOW_DAYS) — reusa o `diasAberto`
  // já calculado em RadarPublicDataService/signalsJson do RadarLeadPool ligado.
  // Sem CNPJ casado = ausente, badge não aparece.
  private static readonly FRESH_COMPANY_WINDOW_DAYS = 30;

  private buildFreshCompanyState(pool: any): { isFreshCompany: boolean; daysSinceOpened: number | null } {
    const stored = parseSignalsJson(pool?.signalsJson);
    const days = stored.diasAberto;
    if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) {
      return { isFreshCompany: false, daysSinceOpened: null };
    }
    return {
      isFreshCompany: days <= InboxService.FRESH_COMPANY_WINDOW_DAYS,
      daysSinceOpened: days,
    };
  }

  private buildStatusCardPayload(input: {
    phoneNormalized: string;
    profile: any;
    atendimentoCustomer?: any;
    lead?: any;
  }) {
    const lead = input.lead || null;
    const timeline = Array.isArray(lead?.timelineEvents) ? lead.timelineEvents : [];
    const history = timeline.map((event: any) => ({
      id: String(event.id),
      eventType: String(event.eventType || 'generic'),
      title: String(event.title || 'Atualizacao'),
      description: event.description ? String(event.description) : null,
      resultLabel: event.resultLabel ? String(event.resultLabel) : null,
      returnAt: event.returnAt instanceof Date ? event.returnAt.toISOString() : event.returnAt ? new Date(event.returnAt).toISOString() : null,
      createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt ? new Date(event.createdAt).toISOString() : null,
    }));

    return {
      customer: {
        profileId: String(input.profile.id),
        name: input.profile.name || input.profile.profileName || input.atendimentoCustomer?.name || null,
        phone: input.profile.phone || input.atendimentoCustomer?.phone || `+${input.phoneNormalized}`,
        phoneNormalized: input.phoneNormalized,
        doNotCall: Boolean(input.profile.botOff),
        doNotCallReason: input.profile.botOffReason || null,
        observations: input.profile.notes || input.atendimentoCustomer?.notes || '',
        updatedAt: input.profile.updatedAt instanceof Date ? input.profile.updatedAt.toISOString() : null,
      },
      lead: lead
        ? {
            id: String(lead.id),
            // Identidade do negócio
            name: lead.name || null,
            email: lead.email || null,
            city: lead.city || null,
            state: lead.state || null,
            segment: lead.segment || null,
            address: lead.address || null,
            website: lead.website || null,
            // Score e inteligência
            opportunityScore: lead.opportunityScore == null ? null : Math.max(0, Math.min(100, Number(lead.opportunityScore) || 0)),
            leadTemperature: lead.leadTemperature ? String(lead.leadTemperature).trim().toLowerCase() : null,
            rating: lead.rating == null ? null : Number(lead.rating),
            reviews: Math.max(0, Math.trunc(Number(lead.reviews || 0) || 0)),
            // Etapa / pipeline
            status: String(lead.status || 'novo'),
            statusLabel: this.formatInboxVendasStatusLabel(lead.status),
            nextAction: lead.nextAction || null,
            returnAt: lead.returnAt instanceof Date ? lead.returnAt.toISOString() : lead.returnAt ? new Date(lead.returnAt).toISOString() : null,
            attemptCount: Number(lead.attemptCount || 0),
            timesSeen: Number(lead.timesSeen || 0),
            sourceType: lead.sourceType || null,
            shortNote: lead.shortNote || null,
            lastResult: lead.lastResult || null,
            lastContactAt: lead.lastContactAt instanceof Date ? lead.lastContactAt.toISOString() : null,
            // Produto / valor
            productName: lead.productNameSnapshot || null,
            productValueLabel: lead.productPriceCentsSnapshot != null && Number.isFinite(Number(lead.productPriceCentsSnapshot))
              ? this.fmtMoneyBrl(Number(lead.productPriceCentsSnapshot) / 100)
              : null,
            // Venda
            saleStatus: String(lead.saleStatus || 'none'),
            saleStatusLabel: this.formatSaleStatusLabel(lead.saleStatus),
            saleValueLabel: lead.saleValue != null && Number(lead.saleValue) > 0 ? this.fmtMoneyBrl(Number(lead.saleValue)) : null,
            // Comissão
            commissionStatusLabel: this.formatCommissionStatusLabel(lead.commissionStatus),
            commissionValueLabel: lead.commissionAmount != null && Number(lead.commissionAmount) > 0 ? this.fmtMoneyBrl(Number(lead.commissionAmount)) : null,
            // Implantação
            setupValueLabel: lead.setupValue != null && Number(lead.setupValue) > 0 ? this.fmtMoneyBrl(Number(lead.setupValue)) : null,
            setupCommissionValueLabel: lead.setupCommissionAmount != null && Number(lead.setupCommissionAmount) > 0 ? this.fmtMoneyBrl(Number(lead.setupCommissionAmount)) : null,
            updatedAt: lead.updatedAt instanceof Date ? lead.updatedAt.toISOString() : null,
            // HOT-07 (empresa recém-aberta): badge de urgência no card de Atendimento.
            ...this.buildFreshCompanyState(input.lead?.radarCompanyStates?.[0]?.radarLead ?? null),
            // Empresa + dono + multi-contatos (do metadataJson do RadarLeadPool ligado). Telefone extra
            // só é exibido no front se confirmado no WhatsApp (phonesWhatsapp). Cru nunca é descartado.
            ...(() => {
              const pool = input.lead?.radarCompanyStates?.[0]?.radarLead ?? null;
              let meta: any = {};
              try { const v = pool?.metadataJson; meta = v ? (typeof v === 'object' ? v : JSON.parse(v)) : {}; } catch { meta = {}; }
              const cap3 = (x: any) => (Array.isArray(x) ? x.filter(Boolean).slice(0, 3) : []);
              return {
                cnpj: meta.cnpj || null,
                cnae: meta.cnae || null,
                razaoSocial: meta.razaoSocial || null,
                ownerName: meta.ownerName || null,
                ownerNames: Array.isArray(meta.ownerNames) ? meta.ownerNames : [],
                ownerPhone: meta.ownerPhone || null,
                ownerInstagram: meta.ownerInstagram || null,
                ownerFacebook: meta.ownerFacebook || null,
                companySituation: meta.companySituation || null,
                emails: cap3(meta.emails),
                phones: cap3(meta.phones),
                phonesWhatsapp: (meta.phonesWhatsapp && typeof meta.phonesWhatsapp === 'object') ? meta.phonesWhatsapp : {},
              };
            })(),
            leadIntelligence: (() => {
              const pool = input.lead?.radarCompanyStates?.[0]?.radarLead ?? null;
              if (!pool) return null;
              return {
                whatsappStatus: null,
                emailStatus: pool.emailStatus ?? null,
                websiteStatus: pool.websiteStatus ?? null,
                instagramUrl: pool.instagramUrl ?? null,
                facebookUrl: pool.facebookUrl ?? null,
                recommendedChannel: pool.recommendedChannel ?? null,
                painType: pool.painType ?? null,
                painPitch: pool.painPitch ?? null,
                opportunityReason: pool.opportunityReason ?? null,
                enrichedAt: pool.lastEnrichedAt instanceof Date ? pool.lastEnrichedAt.toISOString() : (pool.lastEnrichedAt ?? null),
              };
            })(),
          }
        : null,
      history,
    };
  }

  async getConversationStatusCard(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const records = await this.resolveStatusCardRecords(companyId, conversationId, scope);
    return this.buildStatusCardPayload(records);
  }

  /**
   * Consulta-no-clique: ao abrir uma conversa, verifica se o cliente já está
   * finalizado (por telefone, sobrevive à troca de chip). Se sim, re-aplica
   * o SOFT-hide na conversa atual e encaminha pro bot (roteamento de estado
   * sem disparar mensagem). Retorna { finalized: true/false, reason? }.
   *
   * SÓ no clique — sem job em background, sem novo socket, sem reconexão.
   * NUNCA chama updateBlockStatus/archiveChat/logout do motor (SOFT apenas).
   */
  async checkConversationFinalized(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);

    // Se já está com SOFT-hide, não precisa reaplicar
    const alreadyBlocked = this.getAtendimentoBlockedState(conversation.metadata);
    if (alreadyBlocked.isBlocked) {
      return { finalized: true, reason: alreadyBlocked.blockedReason, alreadyApplied: true };
    }

    const phoneNormalized = this.normalizeStatusCardPhone(conversation.contact);
    if (!phoneNormalized) {
      return { finalized: false };
    }
    const phoneVariants = this.getStatusCardPhoneVariants(phoneNormalized);

    // Consulta o perfil do cliente por telefone normalizado (sobrevive à troca de chip)
    const profile = await this.prisma.customerProfile.findFirst({
      where: { companyId, phoneNormalized: { in: phoneVariants } },
      orderBy: [{ updatedAt: 'desc' }],
      select: { botOff: true, botOffReason: true },
    });
    if (!profile || !profile.botOff) {
      return { finalized: false };
    }

    // Cliente está finalizado — re-aplica SOFT-hide + encaminha pro bot
    const reason = String(profile.botOffReason || 'sem_interesse').trim();
    const now = new Date();
    const metadata = this.parseConversationMetadata(conversation.metadata);
    await this.conversations.updateConversationState(companyId, conversationId, {
      metadata: {
        ...metadata,
        atendimentoBlockedAt: now.toISOString(),
        atendimentoBlockedReason: reason,
        atendimentoBlockedByUserId: null,
        // Encaminha pro bot: estado igual ao roteamento de prospeccao
        vendasAgendaQueue: {
          ...(metadata.vendasAgendaQueue || {}),
          active: true,
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          manualQueueOverride: null,
          manualQueueOverriddenAt: null,
          botEligible: false,
          botEntryPending: false,
          syncedAt: now,
        },
      },
      botActive: true,
      humanAssigned: false,
      flowResult: 'do_not_call',
    });

    await this.logInboxEvent({
      companyId,
      event: 'conversation_finalized_reapplied',
      message: 'Cliente finalizado reconhecido no clique; SOFT-hide reaplicado + encaminhado pro bot.',
      conversationId,
      phone: conversation.contact,
      result: reason,
    });

    return { finalized: true, reason, alreadyApplied: false };
  }

  // Garante UM card de Vendas para a conversa (reusa o do telefone/perfil ou cria
  // um novo). Usado pelo "Fechar venda" do Atendimento: o vendedor sempre consegue
  // gerar o link de contratacao, mesmo numa conversa que ainda nao tinha card.
  // Vendas chama isto (Vendas -> Inbox e a unica direcao permitida entre modulos).
  async ensureVendasLeadForConversation(user: any, conversationId: number): Promise<{ leadId: string }> {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const records = await this.resolveStatusCardRecords(companyId, conversationId, scope);
    if (records.lead?.id) return { leadId: String(records.lead.id) };
    const lead = await this.ensureStatusCardLead({
      companyId,
      userId: Number(user?.id || 0) || null,
      profile: records.profile,
      atendimentoCustomer: records.atendimentoCustomer,
      phoneNormalized: records.phoneNormalized,
    });
    return { leadId: String(lead.id) };
  }

  private async ensureStatusCardLead(input: {
    companyId: number;
    userId: number | null;
    profile: any;
    atendimentoCustomer?: any;
    phoneNormalized: string;
    status?: string;
    returnAt?: Date | null;
    observations?: string | null;
    // Motivo estruturado (S4 LEAD-CENTRICO) — já normalizado para o vocabulário de
    // VENDAS_CLOSURE_REASONS por resolveStatusCardLeadClosureReason.
    closureReason?: string;
  }) {
    const phoneVariants = this.getStatusCardPhoneVariants(input.phoneNormalized);
    let existing: any = null;
    try {
      existing = await this.prisma.vendasLead.findFirst({
        where: {
          companyId: input.companyId,
          OR: [
            { phoneNormalized: { in: phoneVariants } },
            { customerProfileId: input.profile.id },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
    } catch (error: any) {
      if (!this.isMissingVendasLeadAddressColumnError(error)) throw error;
      existing = await this.prisma.vendasLead.findFirst({
        where: {
          companyId: input.companyId,
          OR: [
            { phoneNormalized: { in: phoneVariants } },
            { customerProfileId: input.profile.id },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: this.vendasLeadStatusCardSelectWithoutAddress(),
      });
    }
    const nextAction = input.status === 'encerrado'
      ? 'Não ligar mais'
      : input.returnAt
        ? 'Retorno solicitado pelo Atendimento'
        : 'Atualizacao via Atendimento';
    if (existing) {
      return this.prisma.vendasLead.update({
        where: { id: existing.id },
        data: {
          customerProfileId: input.profile.id,
          name: input.profile.name || input.atendimentoCustomer?.name || existing.name,
          phone: input.profile.phone || input.atendimentoCustomer?.phone || existing.phone || `+${input.phoneNormalized}`,
          phoneNormalized: input.phoneNormalized,
          ...(input.status ? { status: input.status } : {}),
          ...(input.returnAt !== undefined ? { returnAt: input.returnAt } : {}),
          nextAction,
          ...(input.observations !== undefined ? { shortNote: input.observations } : {}),
          ...(input.status === 'encerrado'
            ? {
                lastResult: 'Não ligar mais',
                wasClosedBefore: true,
                closedAt: new Date(),
                ...(input.closureReason ? { closureReason: input.closureReason } : {}),
              }
            : input.returnAt
              ? {
                  closedAt: null,
                }
            : {}),
        },
        select: this.vendasLeadStatusCardSelectWithoutAddress(),
      });
    }

    return this.prisma.vendasLead.create({
      data: {
        companyId: input.companyId,
        customerProfileId: input.profile.id,
        sourceType: 'manual',
        primarySource: 'atendimento_status',
        timesSeen: 1,
        name: input.profile.name || input.atendimentoCustomer?.name || null,
        phone: input.profile.phone || input.atendimentoCustomer?.phone || `+${input.phoneNormalized}`,
        phoneNormalized: input.phoneNormalized,
        status: input.status || (input.returnAt ? 'retorno' : 'contato'),
        nextAction,
        returnAt: input.returnAt ?? null,
        shortNote: input.observations || null,
        lastResult: input.status === 'encerrado' ? 'Não ligar mais' : null,
        wasClosedBefore: input.status === 'encerrado',
        closedAt: input.status === 'encerrado' ? new Date() : null,
        ...(input.status === 'encerrado' && input.closureReason ? { closureReason: input.closureReason } : {}),
        createdByUserId: input.userId,
      },
      select: this.vendasLeadStatusCardSelectWithoutAddress(),
    });
  }

  // ESCRITA DA MARQUINHA GLOBAL (30/07/2026) — tradução do motivo escolhido na TELA
  // (menu "Sem Interesse" do /atendimento: sem_interesse | ja_tem | preco | sem_perfil |
  // nao_ligar) para o vocabulário da supressão (vendas-contact-suppression.service.ts).
  // Ladder de evidência, de propósito (dosagem POR MOTIVO confirmada pelo dono 30/07 —
  // item 4 do dia de vendedor; antes ja_tem/preco/sem_perfil caíam no genérico):
  //   'nao_ligar'          -> opt_out       (PERMANENTE — humano clicou "Não ligar mais")
  //   'sem_perfil'         -> sem_perfil    (PERMANENTE — não é o cliente, insistir queima chip)
  //   'ja_tem'             -> ja_tem        (~90 dias — quem tem fornecedor hoje troca amanhã)
  //   'preco'              -> preco         (~60 dias — preço muda, condição volta)
  //   ø / desconhecido     -> sem_interesse (~12 meses — negou o contato)
  //   'convertido'|'outro' -> null          (não marca; sinal positivo/fraco demais)
  private resolveStatusCardSuppressionReason(closureReason: string | null): SuppressionReason | null {
    const reason = String(closureReason || '').trim().toLowerCase();
    if (reason === 'convertido' || reason === 'outro') return null;
    if (reason === 'nao_ligar' || reason === 'do_not_call' || reason === 'opt_out') return 'opt_out';
    if (reason === 'nao_atendeu') return 'nao_atendeu';
    if (reason === 'contato_invalido') return 'contato_invalido';
    if (reason === 'ja_tem') return 'ja_tem';
    if (reason === 'preco') return 'preco';
    if (reason === 'sem_perfil') return 'sem_perfil';
    return 'sem_interesse';
  }

  // O motivo da TELA não cabe inteiro na coluna do lead: VENDAS_CLOSURE_REASONS
  // (vendas/dto/vendas.dto.ts) só aceita sem_interesse|nao_atendeu|contato_invalido|
  // convertido|outro. Gravar 'preco'/'nao_ligar' cru faria formatClosureReasonLabel
  // cair no default e a tela de Vendas mentir "motivo não informado" — o detalhe fino
  // continua vivo na timeline e no atendimentoBlockedReason da conversa.
  private resolveStatusCardLeadClosureReason(closureReason: string | null): string {
    const reason = String(closureReason || '').trim().toLowerCase();
    if (reason === 'nao_atendeu' || reason === 'contato_invalido' || reason === 'convertido' || reason === 'outro') {
      return reason;
    }
    return 'sem_interesse';
  }

  // Best-effort: marcar "não ligar mais" NUNCA pode derrubar o clique do operador.
  private async markStatusCardContactSuppression(input: {
    companyId: number;
    leadId?: string | null;
    reason: SuppressionReason;
    phone?: string | null;
    email?: string | null;
    cnpj?: string | null;
  }): Promise<void> {
    try {
      const marked = await this.contactSuppression.applyAutoSuppressionForClosedLead(
        { cnpj: input.cnpj, phone: input.phone, email: input.email },
        input.reason,
        { companyId: input.companyId, leadId: input.leadId || null },
      );
      if (marked > 0) {
        this.logger.log(
          `[contact-suppression] marca gravada pelo Atendimento motivo=${input.reason} lead=${input.leadId || '-'} chaves=${marked}`,
        );
      }
    } catch (error: any) {
      this.logger.warn(`[contact-suppression] falha ao marcar contato (best-effort): ${String(error?.message || error)}`);
    }
  }

  // "Liberar" (doNotCall=false) tem que desfazer a marca, senão o botão vira mentira:
  // a tela diz liberado e a cadência continua barrando. EXPIRA (expiresAt=agora) em vez
  // de deletar — histórico preservado, nada destrutivo — e SÓ as linhas que ESTA empresa
  // originou: marca de terceiro não é minha para desfazer.
  private async releaseStatusCardContactSuppression(input: {
    companyId: number;
    phone?: string | null;
    email?: string | null;
  }): Promise<void> {
    try {
      const now = new Date();
      const keys: Array<{ contactType: string; contactKey: string }> = [];
      const phone = normalizeSuppressionPhone(input.phone);
      const email = normalizeSuppressionEmail(input.email);
      if (phone) keys.push({ contactType: 'phone', contactKey: phone });
      if (email) keys.push({ contactType: 'email', contactKey: email });
      if (!keys.length) return;
      const released = await this.prisma.vendasContactSuppression.updateMany({
        where: {
          originCompanyId: input.companyId,
          OR: keys,
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        data: { expiresAt: now },
      });
      if (Number(released?.count || 0) > 0) {
        this.logger.log(`[contact-suppression] marca liberada pelo Atendimento company=${input.companyId} chaves=${released.count}`);
      }
    } catch (error: any) {
      this.logger.warn(`[contact-suppression] falha ao liberar contato (best-effort): ${String(error?.message || error)}`);
    }
  }

  async updateConversationStatusCard(
    user: any,
    conversationId: number,
    dto: {
      doNotCall?: boolean;
      closureReason?: string | null;
      returnAt?: string | null;
      observations?: string | null;
      name?: string | null;
    },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const records = await this.resolveStatusCardRecords(companyId, conversationId, scope);
    const observations =
      dto.observations === undefined ? undefined : String(dto.observations || '').trim();
    // Nome cadastrado pelo operador (ou aceito da dica do WhatsApp). Vazio = limpar.
    const registeredName =
      dto.name === undefined ? undefined : String(dto.name || '').replace(/\s+/g, ' ').trim();
    const returnAt = dto.returnAt === undefined ? undefined : this.parseStatusCardDate(dto.returnAt);
    const doNotCall = dto.doNotCall === undefined ? undefined : Boolean(dto.doNotCall);
    // closureReason: motivo escolhido pelo operador ao clicar "Sem interesse" (SOFT-hide)
    const closureReason = dto.closureReason !== undefined
      ? (String(dto.closureReason || '').trim() || 'sem_interesse')
      : null;
    const now = new Date();

    if (doNotCall !== undefined) {
      await this.customerProfileService.upsertAtendimentoProfileState({
        companyId,
        phone: `+${records.phoneNormalized}`,
        botOff: doNotCall,
        botOffReason: doNotCall ? (closureReason || 'Não ligar mais') : null,
        botOffAt: doNotCall ? now : null,
      } as any);
    }

    const profilePatch: any = {};
    if (observations !== undefined) profilePatch.notes = observations || null;
    if (registeredName !== undefined) profilePatch.name = registeredName || null;
    if (Object.keys(profilePatch).length) {
      records.profile = await this.prisma.customerProfile.update({
        where: { id: records.profile.id },
        data: profilePatch,
      });
      if (records.atendimentoCustomer?.id) {
        records.atendimentoCustomer = await this.prisma.atendimentoCustomer.update({
          where: { id: records.atendimentoCustomer.id },
          data: {
            ...(observations !== undefined ? { notes: observations || null } : {}),
            // registrationOrigin 'manual' TRAVA o nome: nenhum sync futuro do
            // WhatsApp sobrescreve o que o humano cadastrou.
            ...(registeredName !== undefined
              ? { name: registeredName || null, registrationOrigin: 'manual' }
              : {}),
          },
        });
      }
    }

    if (doNotCall !== undefined || returnAt !== undefined || observations !== undefined) {
      const lead = await this.ensureStatusCardLead({
        companyId,
        userId: Number(user?.id || 0) || null,
        profile: records.profile,
        atendimentoCustomer: records.atendimentoCustomer,
        phoneNormalized: records.phoneNormalized,
        status: doNotCall === true ? 'encerrado' : returnAt ? 'retorno' : undefined,
        returnAt,
        observations,
        closureReason: doNotCall === true ? this.resolveStatusCardLeadClosureReason(closureReason) : undefined,
      });

      // A MARCA QUE A CADÊNCIA LÊ (30/07/2026). Até hoje "Não ligar mais"/"Sem interesse"
      // gravava botOff no perfil + SOFT-hide no metadata da conversa — nenhum dos dois é
      // consultado antes de disparar. A única fonte que o portão da cadência lê é a
      // marquinha global; sem esta escrita, o operador marcava e o contato continuava
      // elegível a WhatsApp/e-mail no próximo ciclo.
      if (doNotCall === true) {
        const suppressionReason = this.resolveStatusCardSuppressionReason(closureReason);
        if (suppressionReason) {
          await this.markStatusCardContactSuppression({
            companyId,
            leadId: (lead as any)?.id ? String((lead as any).id) : null,
            reason: suppressionReason,
            phone: records.phoneNormalized,
            email: (records.profile as any)?.email || null,
            cnpj: (records.profile as any)?.cnpj || null,
          });
        }
      } else if (doNotCall === false) {
        await this.releaseStatusCardContactSuppression({
          companyId,
          phone: records.phoneNormalized,
          email: (records.profile as any)?.email || null,
        });
      }

      const events: any[] = [];
      if (doNotCall !== undefined) {
        const closureLabel = closureReason
          ? { sem_interesse: 'Sem interesse', nao_ligar: 'Não ligar mais', ja_tem: 'Já tem solução', preco: 'Preço alto demais', sem_perfil: 'Sem perfil' }[closureReason] ?? closureReason
          : 'Não ligar mais';
        events.push({
          leadId: lead.id,
          eventType: doNotCall ? 'lead_closed' : 'status_preference',
          title: doNotCall ? closureLabel : 'Contato liberado',
          description: doNotCall
            ? this.buildLeadClosureTimelineDescription({
                conversationId,
                detectedText: closureLabel,
                sourceModule: 'atendimento_human',
                closureReason: closureReason || 'do_not_call',
                createdAt: now,
              })
            : 'Preferencia de nao ligar removida pelo Atendimento.',
          sourceType: doNotCall ? 'atendimento_human' : undefined,
          statusTo: doNotCall ? 'encerrado' : undefined,
          resultLabel: doNotCall ? closureLabel : 'Liberado',
          createdByUserId: Number(user?.id || 0) || null,
        });
      }
      if (returnAt) {
        events.push({
          leadId: lead.id,
          eventType: 'return_scheduled',
          title: 'Retorno agendado',
          description: 'Retorno definido a partir da aba Conversa do Atendimento.',
          returnAt,
          createdByUserId: Number(user?.id || 0) || null,
        });
      }
      if (observations !== undefined) {
        events.push({
          leadId: lead.id,
          eventType: 'note_updated',
          title: 'Observacao atualizada',
          description: observations || 'Observacao removida no Atendimento.',
          createdByUserId: Number(user?.id || 0) || null,
        });
      }
      if (events.length) {
        await this.prisma.vendasLeadTimelineEvent.createMany({ data: events });
      }
    }

    const refreshed = await this.resolveStatusCardRecords(companyId, conversationId, scope);
    const metadata = this.parseConversationMetadata(refreshed.conversation.metadata);
    const conversationStatePatch: any = {
      metadata: {
        ...metadata,
        atendimentoStatusCard: {
          doNotCall: doNotCall ?? Boolean(refreshed.profile.botOff),
          returnAt: returnAt ? returnAt.toISOString() : undefined,
          observations: observations ?? refreshed.profile.notes ?? null,
          updatedAt: now.toISOString(),
          updatedByUserId: Number(user?.id || 0) || null,
        },
      },
    };
    if (doNotCall === true) {
      conversationStatePatch.botActive = false;
      conversationStatePatch.humanAssigned = false;
      conversationStatePatch.flowResult = 'do_not_call';
      // SOFT-hide: grava atendimentoBlockedAt/Reason no metadata → conversa vai pra "Finalizadas".
      // NÃO chama updateBlockStatus/archiveChat do motor (proibido — guarda o contato real).
      conversationStatePatch.metadata = {
        ...conversationStatePatch.metadata,
        atendimentoBlockedAt: now.toISOString(),
        atendimentoBlockedReason: closureReason || 'sem_interesse',
        atendimentoBlockedByUserId: Number(user?.id || 0) || null,
      };
    } else if (doNotCall === false) {
      // Liberar: limpa o SOFT-hide
      const cleared = this.clearAtendimentoBlockedMetadata(conversationStatePatch.metadata);
      conversationStatePatch.metadata = cleared;
    }
    await this.conversations.updateConversationState(companyId, conversationId, conversationStatePatch);

    return this.getConversationStatusCard(user, conversationId);
  }

  async getBotConfig(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.getBotConfigByCompanyId(companyId);
  }

  private validateAtendimentoButtons(
    buttons: AtendimentoBotButton[],
    sectionLabel: string,
    allowedActionIds: Set<string>,
    usedButtonIds: Set<string>,
  ) {
    for (const button of buttons || []) {
      const buttonId = String(button.buttonId || '').trim().toLowerCase();
      const actionId = String(button.actionId || '').trim().toLowerCase();
      const title = String(button.title || '').trim();
      if (!buttonId) {
        throw new BadRequestException(`Cada botao de ${sectionLabel} precisa ter um id interno estavel.`);
      }
      if (usedButtonIds.has(buttonId)) {
        throw new BadRequestException(`O id interno '${buttonId}' esta duplicado no editor do Atendimento.`);
      }
      usedButtonIds.add(buttonId);
      if (!actionId) {
        throw new BadRequestException(`O botao '${title || buttonId}' em ${sectionLabel} precisa ter uma acao.`);
      }
      if (!allowedActionIds.has(actionId)) {
        throw new BadRequestException(
          `O botao '${title || buttonId}' em ${sectionLabel} aponta para a acao '${actionId}', que nao existe.`,
        );
      }
    }
  }

  private validateAtendimentoBotConfig(config: AtendimentoBotConfig, agendaConfig: AtendimentoAgendaConfig) {
    const allowedActionIds = new Set(
      (config.actionCatalog || [])
        .map((action) => String(action.actionId || '').trim().toLowerCase())
        .filter(Boolean),
    );
    for (const group of agendaConfig.groups || []) {
      allowedActionIds.add(buildAtendimentoAgendaActionId(group.id));
    }
    const usedButtonIds = new Set<string>();
    this.validateAtendimentoButtons(
      config.welcomeButtons,
      'mensagem inicial',
      allowedActionIds,
      usedButtonIds,
    );
    this.validateAtendimentoButtons(
      config.returningCustomerButtons,
      'mensagem de retorno',
      allowedActionIds,
      usedButtonIds,
    );
    this.validateAtendimentoButtons(config.mainMenuButtons, 'menu principal', allowedActionIds, usedButtonIds);
    this.validateAtendimentoButtons(
      config.recoveryDetectedButtons,
      'parede de recovery',
      allowedActionIds,
      usedButtonIds,
    );
    this.validateAtendimentoButtons(
      config.postActionButtons,
      'acoes posteriores',
      allowedActionIds,
      usedButtonIds,
    );
  }

  async updateBotConfig(user: any, payload: unknown) {
    const companyId = this.requireCompanyIdFromUser(user);
    // "Armar bot" morreu (31/07/2026): CONFIGURAR é sempre permitido — a tranca
    // (entrevista + pré-voo) mora na ATIVAÇÃO (bot-activation.service).
    const requested = normalizeAtendimentoBotConfig(payload || {});
    if (
      (requested.routingRules.globalBotEnabled || requested.setup.completed) &&
      !isAtendimentoBotSetupComplete(requested)
    ) {
      throw new BadRequestException({
        code: 'ATENDIMENTO_BOT_SETUP_INCOMPLETE',
        message:
          'Conclua o tutorial de configuracao do bot antes de ativar respostas automaticas no Atendimento.',
      });
    }
    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(companyId);
    const normalized = sanitizeAtendimentoBotConfigForTenant(
      requested,
      tenantContext,
    );
    const agendaConfig = await this.getAgendaConfigByCompanyId(companyId);
    this.validateAtendimentoBotConfig(normalized, agendaConfig);
    if (this.botConfigStore) {
      const userId = Number(user?.id || 0) || undefined;
      await this.botConfigStore.save(companyId, 'atendimento_bot', normalized, userId ?? null);
    }
    return normalized;
  }

  async getAgendaConfig(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.getAgendaConfigByCompanyId(companyId);
  }

  async updateAgendaConfig(user: any, payload: unknown) {
    this.assertCanManageAgenda(user);
    const companyId = this.requireCompanyIdFromUser(user);
    const normalized = normalizeAtendimentoAgendaConfig(payload || {});
    if (this.botConfigStore) {
      const userId = Number(user?.id || 0) || undefined;
      await this.botConfigStore.save(companyId, 'atendimento_agenda', normalized, userId ?? null);
    }
    return normalized;
  }

  async bulkSetBotActive(user: any, dto: { ids?: number[]; enabled?: boolean }) {
    const companyId = this.requireCompanyIdFromUser(user);
    if (dto?.enabled !== false) {
      // "Armar bot" morreu (31/07/2026): mover pra fila do Bot exige a
      // ENTREVISTA respondida — mesma tranca fail-closed dos 3 tipos.
      const entrevistaOk = await new PersonaIaService(this.prisma)
        .getPerfil(companyId)
        .then((p) => p.entrevistaCompleta)
        .catch(() => false);
      if (!entrevistaOk) {
        throw new BadRequestException({
          code: 'ENTREVISTA_INCOMPLETA',
          message: 'A IA ainda não sabe o que sua empresa faz. Responda as 3 perguntas em Automação para liberar.',
        });
      }
      const config = await this.getBotConfigByCompanyId(companyId);
      if (!isAtendimentoBotSetupComplete(config)) {
        throw new BadRequestException({
          code: 'ATENDIMENTO_BOT_SETUP_INCOMPLETE',
          message:
            'Conclua o tutorial de configuracao do bot antes de mover conversas para a fila do Bot.',
        });
      }
    }
    const ids = Array.isArray(dto?.ids) ? dto.ids.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
    if (!ids.length) {
      throw new BadRequestException('ids is required');
    }

    const result = await this.prisma.companyConversation.updateMany({
      where: { companyId, channel: 'whatsapp', id: { in: ids } },
      data: { botActive: Boolean(dto.enabled) },
    });

    try {
      await this.logInboxEvent({
        companyId,
        event: dto.enabled ? 'bulk_bot_enabled' : 'bulk_bot_disabled',
        message: `Bulk ${dto.enabled ? 'enabled' : 'disabled'} bot for ${result.count} conversations`,
        extra: { ids: ids.slice(0, 50) },
      });
    } catch {
      // ignore logging failures
    }

    return { updated: result.count };
  }

  private renderAgendaTemplate(template: string, context: Record<string, string>) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      const token = String(key || '').trim();
      return context[token] ?? `{{${token}}}`;
    });
  }

  private toAgendaIsoDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private buildAgendaDate(date: Date, value: string) {
    const next = new Date(date);
    const [hours, minutes] = String(value || '00:00').split(':').map(Number);
    next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    return next;
  }

  private buildAgendaSimulationSlots(
    group: AtendimentoAgendaGroup,
    holidays: string[],
    referenceDate: Date,
  ) {
    const activeSlots = [...(group.slots || [])]
      .filter((slot) => slot.enabled)
      .sort((left, right) => {
        if (left.dayOfWeek !== right.dayOfWeek) return left.dayOfWeek - right.dayOfWeek;
        return String(left.startTime || '').localeCompare(String(right.startTime || ''));
      });
    const workdays = group.workdays?.length ? group.workdays : [1, 2, 3, 4, 5];
    const holidaySet = new Set(holidays);
    const immediate: Array<{
      slot: AtendimentoAgendaSlot;
      startDate: Date;
      endDate: Date;
      isoDate: string;
    }> = [];
    const futureFallback: Array<{
      slot: AtendimentoAgendaSlot;
      startDate: Date;
      endDate: Date;
      isoDate: string;
    }> = [];
    const primaryLimit = Math.max(1, Number(group.suggestedSlotsCount || 3));
    const fallbackLimit = Math.max(0, Number(group.fallbackFutureSlotsCount || 0));
    const searchWindowDays = Math.max(1, Number(group.searchWindowDays || group.visibleBusinessDays || 7));
    const fallbackWindowDays = Math.max(searchWindowDays + 14, searchWindowDays + 1);

    for (let offset = 0; offset <= fallbackWindowDays; offset += 1) {
      const dayDate = new Date(referenceDate);
      dayDate.setDate(dayDate.getDate() + offset);
      dayDate.setHours(0, 0, 0, 0);
      const dayOfWeek = dayDate.getDay();
      const isoDate = this.toAgendaIsoDate(dayDate);
      if (!workdays.includes(dayOfWeek)) continue;
      if (holidaySet.has(isoDate)) continue;

      const daySlots = activeSlots.filter((slot) => slot.dayOfWeek === dayOfWeek);
      for (const slot of daySlots) {
        const startDate = this.buildAgendaDate(dayDate, slot.startTime);
        const endDate = this.buildAgendaDate(dayDate, slot.endTime);
        const bucket =
          offset < searchWindowDays && immediate.length < primaryLimit ? immediate : futureFallback;
        if (bucket === futureFallback && futureFallback.length >= fallbackLimit) continue;
        bucket.push({ slot, startDate, endDate, isoDate });
      }

      if (immediate.length >= primaryLimit && futureFallback.length >= fallbackLimit) {
        break;
      }
    }

    return {
      immediate,
      futureFallback,
      all: [...immediate, ...futureFallback],
    };
  }

  async simulateAgendaFlow(user: any, payload: any) {
    this.assertCanManageAgenda(user);
    const companyId = this.requireCompanyIdFromUser(user);
    const config = await this.getAgendaConfigByCompanyId(companyId);
    const groupId = this.requireTrimmed(String(payload?.groupId || ''), 'groupId');
    const group = config.groups.find((item) => String(item.id) === groupId);
    if (!group) {
      throw new NotFoundException('Guia de agendamento nao encontrada.');
    }

    const stage =
      String(payload?.stage || '')
        .trim()
        .toLowerCase() || (group.actionType === 'cancelar_agendamento' ? 'cancelar_agendamento' : 'abrir_guia');
    const referenceDateRaw = String(payload?.referenceDate || '').trim();
    const referenceDate =
      referenceDateRaw && Number.isFinite(new Date(referenceDateRaw).getTime())
        ? new Date(referenceDateRaw)
        : new Date();
    referenceDate.setHours(0, 0, 0, 0);

    const customerName = String(payload?.customerName || 'Cliente teste').trim() || 'Cliente teste';
    const companyName =
      String(payload?.companyName || user?.company?.name || 'Empresa HBX').trim() || 'Empresa HBX';
    const attendantName =
      String(payload?.attendantName || user?.name || user?.username || 'Equipe HBX').trim() || 'Equipe HBX';

    const slotBuckets = this.buildAgendaSimulationSlots(group, config.holidays, referenceDate);
    const selectedSlot =
      slotBuckets.all.find((item) => item.slot.id === String(payload?.selectedSlotId || '').trim()) ||
      slotBuckets.immediate[0] ||
      slotBuckets.futureFallback[0] ||
      null;
    const agendaSlotsLabel = selectedSlot
      ? `${selectedSlot.startDate.toLocaleDateString('pt-BR', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
        })} ${selectedSlot.slot.startTime}-${selectedSlot.slot.endTime}`
      : slotBuckets.immediate
          .slice(0, Math.max(1, Number(group.suggestedSlotsCount || 3)))
          .map(
            (item) =>
              `${item.startDate.toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
              })} ${item.slot.startTime}-${item.slot.endTime}`,
          )
          .join(' | ');

    const context = {
      cliente: customerName,
      empresa: companyName,
      funcionario: attendantName,
      agenda_nome: group.title,
      agenda_slots: agendaSlotsLabel,
    };

    const baseMessages = [
      {
        role: 'bot',
        label: 'Mensagem inicial',
        text: this.renderAgendaTemplate(
          `${config.initialMessage.greeting}\n${config.initialMessage.introText}\n${config.initialMessage.fallbackText}`,
          context,
        ).trim(),
      },
      {
        role: 'customer',
        label: 'Clique na guia',
        text: group.buttonLabel,
      },
    ];

    if (stage === 'cancelar_agendamento' || group.actionType === 'cancelar_agendamento') {
      const hasActiveBooking = Boolean(payload?.hasActiveBooking ?? selectedSlot);
      const messages = hasActiveBooking
        ? [
            ...baseMessages,
            {
              role: 'bot',
              label: 'Confirmacao de cancelamento',
              text: this.renderAgendaTemplate(config.flowMessages.cancellationPrompt, context),
            },
            {
              role: 'system',
              label: 'Resultado',
              text: this.renderAgendaTemplate(config.flowMessages.cancellationSuccess, context),
            },
          ]
        : [
            ...baseMessages,
            {
              role: 'bot',
              label: 'Sem agendamento encontrado',
              text: this.renderAgendaTemplate(config.flowMessages.cancellationNotFound, context),
            },
          ];
      return {
        status: hasActiveBooking ? 'ok' : 'warning',
        stage: 'cancelar_agendamento',
        groupId: group.id,
        groupTitle: group.title,
        actionType: group.actionType,
        summary: hasActiveBooking
          ? 'Simulacao de cancelamento concluida com agendamento localizado.'
          : 'Simulacao concluida sem agendamento ativo localizado.',
        messages,
        suggestedSlots: [],
        fallbackSlots: [],
      };
    }

    const suggestedSlots = slotBuckets.immediate.map((item) => ({
      id: item.slot.id,
      label: item.slot.label,
      dateLabel: item.startDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
      }),
      startTime: item.slot.startTime,
      endTime: item.slot.endTime,
      isoDate: item.isoDate,
    }));
    const fallbackSlots = slotBuckets.futureFallback.map((item) => ({
      id: item.slot.id,
      label: item.slot.label,
      dateLabel: item.startDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
      }),
      startTime: item.slot.startTime,
      endTime: item.slot.endTime,
      isoDate: item.isoDate,
    }));

    const availabilityText =
      suggestedSlots.length > 0
        ? this.renderAgendaTemplate(config.flowMessages.availabilityIntro, context)
        : this.renderAgendaTemplate(
            group.noImmediateAvailabilityMessage || config.flowMessages.fallbackFutureSlots,
            context,
          );

    const messages = [
      ...baseMessages,
      {
        role: 'bot',
        label: suggestedSlots.length > 0 ? 'Horarios encontrados' : 'Fallback de disponibilidade',
        text: availabilityText,
      },
    ];

    if (stage === 'confirmar_agendamento' && selectedSlot) {
      messages.push(
        {
          role: 'customer',
          label: 'Escolha de horario',
          text: selectedSlot.slot.label,
        },
        {
          role: 'system',
          label: 'Agendamento confirmado',
          text: this.renderAgendaTemplate(config.flowMessages.confirmationMessage, context),
        },
      );
    }

    return {
      status: suggestedSlots.length > 0 ? 'ok' : 'warning',
      stage,
      groupId: group.id,
      groupTitle: group.title,
      actionType: group.actionType,
      summary:
        suggestedSlots.length > 0
          ? 'Simulacao concluida com horarios sugeridos para a guia.'
          : 'Simulacao concluida sem disponibilidade imediata; fallback futuro aplicado.',
      messages,
      suggestedSlots,
      fallbackSlots,
    };
  }

  async updateConversationStatus(user: any, id: number, status: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, id, scope);
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

  async updateConversationQueue(user: any, id: number, queueRaw?: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, id, scope);
    const queue = String(queueRaw || '').trim().toLowerCase();
    const allowedQueues = new Set(['all', 'groups', 'recovery', 'scheduled', 'bot']);
    if (!allowedQueues.has(queue)) {
      throw new BadRequestException('Fila invalida.');
    }

    const metadata = this.parseConversationMetadata(conversation.metadata);
    const currentQueue =
      metadata?.vendasAgendaQueue &&
      typeof metadata.vendasAgendaQueue === 'object' &&
      !Array.isArray(metadata.vendasAgendaQueue)
        ? (metadata.vendasAgendaQueue as Record<string, unknown>)
        : null;
    const now = new Date().toISOString();
    const nextRouteTarget =
      queue === 'bot'
          ? 'prospeccao'
          : queue === 'scheduled'
            ? 'atendimento'
            : queue === 'all'
              ? 'conversas'
              : queue;
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      inboxManualQueueOverride: queue,
      inboxManualQueueOverriddenAt: now,
      lastManualRouteChangeAt: now,
      queueTarget: nextRouteTarget,
      routeTarget: nextRouteTarget,
      inboxPersonalContact: false,
      personalContact: false,
      whatsappPersonalContact: false,
      inboxPersonalContactClearedAt: now,
      inboxLocalDeleted: false,
      inboxLocalDeletedAt: null,
      inboxLocalDeletedByUserId: null,
    };

    if (currentQueue) {
      nextMetadata.vendasAgendaQueue =
        queue === 'bot'
          ? {
              ...currentQueue,
              active: true,
              queueTarget: 'prospeccao',
              routeTarget: 'prospeccao',
              manualQueueOverride: null,
              manualQueueOverriddenAt: null,
              botEligible: false,
              botEntryPending: false,
              syncedAt: now,
            }
          : {
              ...currentQueue,
              active: false,
              draftPending: false,
              botEligible: false,
              botEntryPending: false,
              queueTarget: nextRouteTarget,
              routeTarget: nextRouteTarget,
              whatsappAvailabilityStatus: (currentQueue as any).whatsappAvailabilityStatus || null,
              manualQueueOverride: queue,
              manualQueueOverriddenAt: now,
              deactivatedAt: currentQueue.deactivatedAt || now,
              syncedAt: now,
            };
    }

    await this.conversations.updateConversationState(companyId, id, {
      metadata: nextMetadata,
      ...(queue === 'scheduled'
        ? {
            humanAssigned: false,
            flowResult: null,
          }
        : {}),
    });

    await this.logInboxEvent({
      companyId,
      event: 'conversation_queue_updated',
      message: `Fila manual atualizada para ${queue}`,
      conversationId: id,
      result: queue,
    });

    return this.getConversationByIdForCompany(companyId, id);
  }

  async blockConversation(user: any, conversationId: number, reasonRaw?: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    const metadata = this.parseConversationMetadata(conversation.metadata);
    const reason = String(reasonRaw || '').trim() || 'Bloqueado manualmente pelo operador.';
    try {
      await this.customerProfileService.upsertAtendimentoProfileState({
        companyId,
        phone: String(conversation.contact || '').trim(),
        botOff: true,
        botOffReason: reason,
        botOffAt: new Date(),
      } as any);
    } catch (error) {
      await this.logInboxEvent({
        companyId,
        event: 'conversation_block_profile_sync_failed',
        message: 'Falha ao persistir BOT_OFF no CustomerProfile durante o bloqueio.',
        conversationId,
        phone: String(conversation.contact || '').trim(),
        result: 'warning',
        extra: {
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      });
    }
    try {
      const selector = await this.buildWebwhatsConversationSelector(companyId, conversation.id);
      await this.webwhatsBridge.updateBlockStatus(companyId, {
        conversationId: conversation.id,
        to: String(conversation.contact || ''),
        status: 'block',
      }, selector);
      await this.webwhatsBridge.archiveChat(companyId, {
        conversationId: conversation.id,
        archive: true,
      }, selector);
    } catch (error) {
      await this.logInboxEvent({
        companyId,
        event: 'conversation_block_provider_sync_failed',
        message: 'Falha ao sincronizar bloqueio/arquivo no WhatsApp provider.',
        conversationId,
        phone: String(conversation.contact || '').trim(),
        result: 'warning',
        extra: {
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      });
    }
    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'blocked_manual',
      metadata: {
        ...metadata,
        atendimentoBlockedAt: new Date().toISOString(),
        atendimentoBlockedReason: reason,
        atendimentoBlockedByUserId: Number(user?.id || 0) || null,
        whatsappArchived: true,
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

  /**
   * Some com a conversa da tela de Conversas — SÓ no HBX.
   *
   * O que NÃO acontece aqui, por lei do dono (31/07/2026):
   *  · Nenhuma mensagem é apagada do banco. Elas seguem ligadas ao lead e
   *    aparecem na ficha do cliente/empresa. Por isso contamos e gravamos
   *    quantas ficaram guardadas: é a prova auditável de que nada sumiu.
   *  · NENHUM comando de exclusão vai pro WhatsApp. Este método não fala com
   *    a bridge do motor. O chat no aparelho do cliente fica intacto.
   */
  async clearConversationFromInbox(
    user: any,
    conversationId: number,
    dto?: { reason?: string | null },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    const metadata = this.parseConversationMetadata(conversation.metadata);
    const already = this.getConversationClearedState(metadata);
    if (already.isCleared) {
      return {
        cleared: true,
        alreadyCleared: true,
        preservedMessages: already.preservedMessageCount ?? 0,
      };
    }

    const reason = String(dto?.reason || '').trim() || 'limpeza_manual';
    const userId = Number(user?.id || 0) || null;
    const now = new Date();

    // Conta ANTES de esconder: este número vai pro log e pra resposta, e é o
    // que permite auditar depois que o histórico continua inteiro.
    const preservedMessages = await this.prisma.companyMessage.count({
      where: { companyId, conversationId: conversation.id },
    });

    await this.conversations.updateConversationState(companyId, conversation.id, {
      metadata: {
        ...metadata,
        hbxClearedAt: now.toISOString(),
        hbxClearedByUserId: userId,
        hbxClearedReason: reason,
        hbxClearedMessageCount: preservedMessages,
      },
    });

    // Marca na própria timeline da conversa: quem abrir a ficha do lead vê que
    // a conversa foi limpa da caixa, quando, e que o conteúdo continua ali.
    await this.appendInboxSystemEvent({
      companyId,
      conversationId: conversation.id,
      contactId: String(conversation.contact || '').trim(),
      text: `Conversa limpa da caixa de Conversas (${reason}). ${preservedMessages} mensagem(ns) seguem salvas no histórico do cliente.`,
      eventType: 'conversation_cleared',
      variables: { reason, preservedMessages },
    });

    await this.logInboxEvent({
      companyId,
      event: 'conversation_cleared_from_inbox',
      message: `Conversa limpa da caixa (${reason}) — ${preservedMessages} mensagem(ns) preservadas, nada apagado no WhatsApp.`,
      conversationId,
      phone: String(conversation.contact || '').trim(),
      result: 'cleared',
      extra: { reason, preservedMessages, clearedByUserId: userId },
    });

    return { cleared: true, alreadyCleared: false, preservedMessages };
  }

  /** Desfaz o "limpar": a conversa volta pra caixa. Nada foi perdido no meio. */
  async restoreConversationToInbox(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    const metadata = { ...this.parseConversationMetadata(conversation.metadata) };
    delete metadata.hbxClearedAt;
    delete metadata.hbxClearedByUserId;
    delete metadata.hbxClearedReason;
    delete metadata.hbxClearedMessageCount;

    await this.conversations.updateConversationState(companyId, conversation.id, { metadata });
    await this.logInboxEvent({
      companyId,
      event: 'conversation_restored_to_inbox',
      message: 'Conversa restaurada para a caixa de Conversas.',
      conversationId,
      phone: String(conversation.contact || '').trim(),
      result: 'restored',
    });
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  async unblockConversation(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    const metadata = this.clearAtendimentoBlockedMetadata(
      this.parseConversationMetadata(conversation.metadata),
    );
    try {
      await this.customerProfileService.upsertAtendimentoProfileState({
        companyId,
        phone: String(conversation.contact || '').trim(),
        botOff: false,
      } as any);
    } catch (error) {
      await this.logInboxEvent({
        companyId,
        event: 'conversation_unblock_profile_sync_failed',
        message: 'Falha ao limpar BOT_OFF no CustomerProfile durante o desbloqueio.',
        conversationId,
        phone: String(conversation.contact || '').trim(),
        result: 'warning',
        extra: {
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      });
    }
    try {
      const selector = await this.buildWebwhatsConversationSelector(companyId, conversation.id);
      await this.webwhatsBridge.updateBlockStatus(companyId, {
        conversationId: conversation.id,
        to: String(conversation.contact || ''),
        status: 'unblock',
      }, selector);
      await this.webwhatsBridge.archiveChat(companyId, {
        conversationId: conversation.id,
        archive: false,
      }, selector);
    } catch (error) {
      await this.logInboxEvent({
        companyId,
        event: 'conversation_unblock_provider_sync_failed',
        message: 'Falha ao sincronizar desbloqueio/desarquivo no WhatsApp provider.',
        conversationId,
        phone: String(conversation.contact || '').trim(),
        result: 'warning',
        extra: {
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      });
    }
    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: true,
      humanAssigned: false,
      flowResult: null,
      metadata: {
        ...metadata,
        whatsappArchived: false,
      },
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

  private normalizeTrashPurgeText(value: unknown) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private parseJsonArray(raw: unknown) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private clampMeticulousTrashDelay(delayMsRaw: unknown) {
    const requested = Math.trunc(Number(delayMsRaw || METICULOUS_TRASH_DEFAULT_DELAY_MS));
    const base = Number.isFinite(requested) && requested > 0 ? requested : METICULOUS_TRASH_DEFAULT_DELAY_MS;
    if (String(process.env.NODE_ENV || '').trim() === 'production') {
      return Math.max(METICULOUS_TRASH_MIN_PRODUCTION_DELAY_MS, base);
    }
    return base;
  }

  private normalizeMeticulousTrashOptions(dto?: {
    dryRun?: boolean;
    mode?: 'dry_run' | 'real' | string | null;
    olderThanHours?: number | string | null;
    delayMs?: number | string | null;
    limit?: number | string | null;
  }) {
    const olderThanHours = Math.max(1, Math.trunc(Number(dto?.olderThanHours || 24) || 24));
    const delayMs = this.clampMeticulousTrashDelay(dto?.delayMs);
    const limitRaw = dto?.limit === undefined || dto?.limit === null ? null : Math.trunc(Number(dto.limit));
    const limit = limitRaw && Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : null;
    const mode = String(dto?.mode || (dto?.dryRun === false ? 'real' : 'dry_run')).trim() === 'real' ? 'real' : 'dry_run';
    return {
      mode,
      dryRun: mode !== 'real',
      olderThanHours,
      delayMs,
      limit,
      jitterMinMs: METICULOUS_TRASH_DEFAULT_JITTER_MIN_MS,
      jitterMaxMs: METICULOUS_TRASH_DEFAULT_JITTER_MAX_MS,
    };
  }

  private getReasonLabel(reason: TrashPurgeDetectedReason) {
    if (reason === 'SEM_INTERESSE_EXPLICITO') return 'sem interesse explícito';
    if (reason === 'NEGATIVO') return 'negativo';
    if (reason === 'SEM_RESPOSTA_24H') return 'sem resposta após 24h';
    return 'motivo não identificado';
  }

  private detectTrashPurgeReason(input: {
    customerMessages: Array<{ body: string; timestamp: Date | null }>;
    newestMessage?: { direction?: string | null; senderType?: string | null; body?: string | null; timestamp?: Date | null } | null;
    conversation: { lastMessageAt?: Date | null; lastInteractionAt?: Date | null; updatedAt?: Date | null };
    olderThanHours?: number;
  }): { detectedReason: TrashPurgeDetectedReason; confidence: number } {
    const joined = this.normalizeTrashPurgeText(input.customerMessages.map((message) => message.body).join(' '));
    if (joined) {
      const explicitNoInterest =
        /\b(nao|n)\s+(tenho|temos|quero|queremos|preciso|precisamos|vou|vamos)\s+(interesse|interessa|querer|precisar)\b/.test(joined) ||
        /\bsem\s+interesse\b/.test(joined) ||
        /\bnao\s+me\s+chama\b/.test(joined) ||
        /\bpara\s+de\s+mandar\b/.test(joined) ||
        /\bpare\s+de\s+mandar\b/.test(joined) ||
        /\bnao\s+precisa\b/.test(joined) ||
        /\bnao\s+obrigad[oa]\b/.test(joined) ||
        /\bremover\s+meu\s+contato\b/.test(joined) ||
        /\bnao\s+mande\s+mais\b/.test(joined);
      if (explicitNoInterest) return { detectedReason: 'SEM_INTERESSE_EXPLICITO', confidence: 0.95 };

      const negative =
        /\b(nao|negativo|dispenso|cancelar|cancela|pare|parar|remover|bloquear|sair|stop|sem\s+chance|agora\s+nao)\b/.test(joined) ||
        /\b(nunca|jamais)\b/.test(joined);
      if (negative) return { detectedReason: 'NEGATIVO', confidence: 0.78 };
    }

    const newestDirection = String(input.newestMessage?.direction || '').trim().toUpperCase();
    const newestSender = String(input.newestMessage?.senderType || '').trim().toLowerCase();
    const lastActivity =
      input.newestMessage?.timestamp ||
      input.conversation.lastMessageAt ||
      input.conversation.lastInteractionAt ||
      input.conversation.updatedAt ||
      null;
    const ageMs = lastActivity ? Date.now() - lastActivity.getTime() : 0;
    const olderThanMs = Math.max(1, Number(input.olderThanHours || 24)) * 60 * 60 * 1000;
    const newestIsCustomer =
      newestDirection === 'INBOUND' || ['client', 'customer', 'contact'].includes(newestSender);
    if (lastActivity && ageMs >= olderThanMs && !newestIsCustomer) {
      return { detectedReason: 'SEM_RESPOSTA_24H', confidence: 0.72 };
    }

    return { detectedReason: 'MOTIVO_NAO_IDENTIFICADO', confidence: 0 };
  }

  async extractLastCustomerWordsForPurge(
    conversationId: number,
    opts?: { companyId?: number; olderThanHours?: number },
  ): Promise<TrashPurgeWords> {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: {
        id: conversationId,
        ...(opts?.companyId ? { companyId: opts.companyId } : {}),
        channel: 'whatsapp',
      },
      select: {
        id: true,
        lastMessageAt: true,
        lastInteractionAt: true,
        updatedAt: true,
        messages: {
          orderBy: [{ timestamp: 'desc' }],
          take: 30,
          select: {
            direction: true,
            senderType: true,
            body: true,
            timestamp: true,
            messageType: true,
            variablesJson: true,
            rawPayload: true,
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const messages = conversation.messages || [];
    const customerMessages = messages
      .filter((message) => {
        const direction = String(message.direction || '').trim().toUpperCase();
        const senderType = String(message.senderType || '').trim().toLowerCase();
        const isCustomer =
          direction === 'INBOUND' || ['client', 'customer', 'contact'].includes(senderType);
        const isNotInternal = !['bot', 'system', 'human', 'agent', 'attendant'].includes(senderType);
        return isCustomer && isNotInternal && String(message.body || '').trim();
      })
      .slice(0, 3)
      .map((message) => ({
        body: String(message.body || '').trim(),
        timestamp: message.timestamp || null,
      }));

    const newestMessage = messages[0] || null;
    const classification = this.detectTrashPurgeReason({
      customerMessages,
      newestMessage,
      conversation,
      olderThanHours: opts?.olderThanHours || 24,
    });
    const chronological = [...customerMessages].reverse();
    const lastCustomerMessage = customerMessages[0]?.body || null;

    return {
      lastCustomerMessage,
      lastCustomerMessagesText: chronological.map((message) => message.body).join('\n').trim() || null,
      lastCustomerMessageAt: customerMessages[0]?.timestamp || null,
      detectedReason: classification.detectedReason,
      confidence: classification.confidence,
    };
  }

  private buildTrashPurgeObservation(input: {
    extraction: TrashPurgeWords;
    registeredAt: Date;
  }) {
    const reasonLabel = this.getReasonLabel(input.extraction.detectedReason);
    const lastWords =
      input.extraction.lastCustomerMessage ||
      (input.extraction.detectedReason === 'SEM_RESPOSTA_24H'
        ? 'Sem mensagem inbound do cliente no prazo analisado.'
        : '');
    return [
      METICULOUS_TRASH_NOTE_MARKER,
      `Motivo: ${reasonLabel}`,
      `Última mensagem do cliente: "${lastWords}"`,
      `Registrado automaticamente antes da exclusão permanente em ${input.registeredAt.toISOString()}.`,
    ].join('\n');
  }

  private mergeTrashPurgeObservation(current: unknown, nextObservation: string) {
    const currentText = String(current || '').trim();
    if (currentText.includes(METICULOUS_TRASH_NOTE_MARKER)) return currentText;
    return currentText ? `${currentText}\n\n${nextObservation}` : nextObservation;
  }

  private getTrashDeletedAt(metadata: Record<string, any>) {
    const raw =
      metadata?.inboxLocalDeletedAt ||
      metadata?.inboxManualQueueOverriddenAt ||
      metadata?.deletedAt ||
      metadata?.archivedAt ||
      metadata?.vendasAgendaQueue?.manualQueueOverriddenAt ||
      metadata?.vendasAgendaQueue?.deactivatedAt;
    const date = raw ? new Date(String(raw)) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  private async hasCustomerMessageAfterTrash(input: {
    companyId: number;
    conversationId: number;
    trashAt: Date | null;
  }) {
    if (!input.trashAt) return false;
    const row = await this.prisma.companyMessage.findFirst({
      where: {
        companyId: input.companyId,
        conversationId: input.conversationId,
        timestamp: { gt: input.trashAt },
        OR: [
          { direction: 'INBOUND' },
          { direction: 'inbound' },
          { senderType: { in: ['client', 'customer', 'contact'] } },
        ],
      },
      select: { id: true },
      orderBy: [{ timestamp: 'desc' }],
    });
    return Boolean(row);
  }

  private async findVendasLeadForTrashPurge(input: {
    companyId: number;
    conversation: any;
    metadata: Record<string, any>;
  }) {
    const queue = this.getNestedMetadataRecord(input.metadata?.vendasAgendaQueue);
    const leadId = String(queue?.leadId || '').trim();
    if (leadId) {
      const byId = await this.prisma.vendasLead.findFirst({
        where: { id: leadId, companyId: input.companyId },
      });
      if (byId) return byId;
    }
    const phoneCandidates = this.buildVendasPhoneCandidates(input.conversation?.contact);
    if (!phoneCandidates.length) return null;
    return this.prisma.vendasLead.findFirst({
      where: {
        companyId: input.companyId,
        phoneNormalized: { in: phoneCandidates },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async markConversationAsNegativeNoInterestBeforePurge(input: {
    companyId: number;
    userId?: number | null;
    conversationId: number;
    extraction: TrashPurgeWords;
    dryRun?: boolean;
  }) {
    if (input.extraction.detectedReason === 'MOTIVO_NAO_IDENTIFICADO') {
      throw new BadRequestException('Motivo nao identificado com seguranca. A conversa nao sera apagada automaticamente.');
    }
    const conversation = await this.ensureConversation(input.companyId, input.conversationId);
    const metadata = this.parseConversationMetadata(conversation.metadata);
    const registeredAt = new Date();
    const observation = this.buildTrashPurgeObservation({
      extraction: input.extraction,
      registeredAt,
    });
    if (input.dryRun) {
      return {
        marked: false,
        dryRun: true,
        observation,
        leadId: null,
      };
    }

    const phoneNormalized = this.normalizeStatusCardPhone(conversation.contact);
    const phoneVariants = phoneNormalized ? this.getStatusCardPhoneVariants(phoneNormalized) : [];
    const lead = await this.findVendasLeadForTrashPurge({
      companyId: input.companyId,
      conversation,
      metadata,
    });
    const existingMarkerAt = this.normalizeMessageMetadataText(metadata?.trashPurgeNegativeMarkedAt);
    const alreadyMarked = Boolean(existingMarkerAt);
    let markedLeadId: string | null = null;

    if (lead) {
      markedLeadId = String(lead.id);
      const leadNote = this.mergeTrashPurgeObservation(lead.shortNote, observation);
      await this.prisma.vendasLead.update({
        where: { id: lead.id },
        data: {
          status: 'encerrado',
          nextAction: 'Não ligar mais',
          shortNote: leadNote || null,
          lastResult: this.getReasonLabel(input.extraction.detectedReason),
          wasClosedBefore: true,
          closedAt: lead.closedAt || registeredAt,
        },
      });
      const existingTimeline = await this.prisma.vendasLeadTimelineEvent.findFirst({
        where: {
          leadId: lead.id,
          eventType: 'purge_negative_mark',
        },
        select: { id: true },
      });
      if (!existingTimeline) {
        await this.prisma.vendasLeadTimelineEvent.create({
          data: {
            leadId: lead.id,
            eventType: 'purge_negative_mark',
            title: 'SEM INTERESSE / NEGATIVO registrado antes da exclusão',
            description: observation,
            sourceType: 'atendimento',
            statusFrom: String(lead.status || 'novo'),
            statusTo: 'encerrado',
            resultLabel: this.getReasonLabel(input.extraction.detectedReason),
            createdByUserId: Number(input.userId || 0) || null,
          },
        });
      }
    }

    if (phoneVariants.length) {
      const profile = await this.prisma.customerProfile.findFirst({
        where: { companyId: input.companyId, phoneNormalized: { in: phoneVariants } },
        orderBy: [{ updatedAt: 'desc' }],
      });
      if (profile) {
        await this.prisma.customerProfile.update({
          where: { id: profile.id },
          data: {
            notes: this.mergeTrashPurgeObservation(profile.notes, observation) || null,
            botOff: true,
            botOffReason: this.getReasonLabel(input.extraction.detectedReason),
            botOffAt: registeredAt,
          },
        });
      } else {
        await this.customerProfileService.upsertProfile({
          companyId: input.companyId,
          phone: `+${phoneNormalized}`,
          externalSource: 'atendimento_trash_purge',
          status: 'active',
          notes: observation,
        } as any);
      }

      const atendimentoCustomer = await this.prisma.atendimentoCustomer.findFirst({
        where: { companyId: input.companyId, phoneNormalized: { in: phoneVariants } },
        orderBy: [{ updatedAt: 'desc' }],
      });
      if (atendimentoCustomer) {
        await this.prisma.atendimentoCustomer.update({
          where: { id: atendimentoCustomer.id },
          data: {
            notes: this.mergeTrashPurgeObservation(atendimentoCustomer.notes, observation) || null,
          },
        });
      }
    }

    if (!alreadyMarked) {
      await this.conversations.updateConversationState(input.companyId, conversation.id, {
        botActive: false,
        humanAssigned: false,
        metadata: {
          ...metadata,
          trashPurgeNegativeMarkedAt: registeredAt.toISOString(),
          trashPurgeDetectedReason: input.extraction.detectedReason,
          trashPurgeLastCustomerMessage: input.extraction.lastCustomerMessage || null,
          trashPurgeLastCustomerMessagesText: input.extraction.lastCustomerMessagesText || null,
          trashPurgeMarkedByUserId: Number(input.userId || 0) || null,
          atendimentoStatusCard: {
            ...(this.getNestedMetadataRecord(metadata?.atendimentoStatusCard) || {}),
            doNotCall: true,
            observations: observation,
            updatedAt: registeredAt.toISOString(),
            updatedByUserId: Number(input.userId || 0) || null,
          },
        },
      });
    }

    await this.logInboxEvent({
      companyId: input.companyId,
      event: 'conversation_marked_negative_before_purge',
      message: 'Conversa marcada como SEM INTERESSE / NEGATIVO antes da exclusao permanente.',
      conversationId: conversation.id,
      phone: String(conversation.contact || '').trim(),
      result: 'marked_negative',
      extra: {
        detectedReason: input.extraction.detectedReason,
        leadId: markedLeadId,
        alreadyMarked,
      },
    });

    return {
      marked: true,
      dryRun: false,
      observation,
      leadId: markedLeadId,
      alreadyMarked,
    };
  }

  private mapWhatsAppProviderHealth(input: {
    statusRaw?: unknown;
    errorRaw?: unknown;
    source?: string;
  }): WhatsAppProviderHealth {
    const rawStatus = String(input.statusRaw || '').trim();
    const rawError = String(input.errorRaw || '').trim();
    const normalized = this.normalizeTrashPurgeText(`${rawStatus} ${rawError}`);
    const lastCheckedAt = new Date().toISOString();

    if (/\bauth(_|\s|-)?failure\b|\bauthentication\b|\bunauthorized\b|\btoken\b|\blogin\s+failed\b/.test(normalized)) {
      return {
        status: 'auth_failure',
        canSafelyDelete: false,
        reason: 'Autenticacao do WhatsApp falhou; limpeza pausada para proteger a sessao.',
        lastCheckedAt,
        rawStatus,
        rawError,
      };
    }
    if (/\bqr\b|\bqrcode\b|\bpairing\b|\bpareamento\b|\bscan\b|\bqr_required\b/.test(normalized)) {
      return {
        status: 'qr_required',
        canSafelyDelete: false,
        reason: 'QR Code/pareamento requerido; limpeza pausada.',
        lastCheckedAt,
        rawStatus,
        rawError,
      };
    }
    if (/\bconnecting\b|\bconectando\b|\bopening\b|\breconnect/.test(normalized)) {
      return {
        status: 'connecting',
        canSafelyDelete: false,
        reason: 'Provider WhatsApp ainda esta conectando.',
        lastCheckedAt,
        rawStatus,
        rawError,
      };
    }
    if (
      /\bdisconnect(ed)?\b|\bnot_connected\b|\bsession(_|\s|-)?closed\b|\bclosed\b|\boffline\b|\bdesconect/.test(normalized)
    ) {
      return {
        status: 'disconnected',
        canSafelyDelete: false,
        reason: 'Sessao WhatsApp/WebWhats desconectada.',
        lastCheckedAt,
        rawStatus,
        rawError,
      };
    }
    if (/\bready\b|\bopen\b/.test(normalized)) {
      return {
        status: 'ready',
        canSafelyDelete: true,
        reason: 'Provider WhatsApp pronto para operacao local segura.',
        lastCheckedAt,
        rawStatus,
        rawError,
      };
    }
    if (/\bconnected\b|\bconectado\b/.test(normalized)) {
      return {
        status: 'connected',
        canSafelyDelete: true,
        reason: 'Provider WhatsApp conectado.',
        lastCheckedAt,
        rawStatus,
        rawError,
      };
    }

    return {
      status: 'unknown',
      canSafelyDelete: false,
      reason: input.source ? `Estado ${input.source} desconhecido; limpeza pausada por seguranca.` : 'Estado do provider desconhecido.',
      lastCheckedAt,
      rawStatus,
      rawError,
    };
  }

  async getWhatsAppProviderHealth(companyId: number): Promise<WhatsAppProviderHealth> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        whatsappModalStatus: true,
        whatsappModalLastError: true,
        whatsappTemporaryStatus: true,
        whatsappTemporaryStatusError: true,
        whatsappStatus: true,
        whatsappStatusError: true,
      },
    });
    if (!company) {
      return {
        status: 'unknown',
        canSafelyDelete: false,
        reason: 'Empresa nao encontrada.',
        lastCheckedAt: new Date().toISOString(),
      };
    }
    const modalConfigured = String(process.env.WHATSAPP_MODAL_ENABLED || '').trim().toLowerCase() === 'true'
      || Boolean(company.whatsappModalStatus);
    if (modalConfigured) {
      return this.mapWhatsAppProviderHealth({
        statusRaw: company.whatsappModalStatus,
        errorRaw: company.whatsappModalLastError,
        source: 'WebWhats',
      });
    }
    if (company.whatsappTemporaryStatus || company.whatsappTemporaryStatusError) {
      return this.mapWhatsAppProviderHealth({
        statusRaw: company.whatsappTemporaryStatus,
        errorRaw: company.whatsappTemporaryStatusError,
        source: 'WhatsApp temporario',
      });
    }
    const officialStatus = String(company.whatsappStatus || '').trim().toUpperCase();
    if (officialStatus) {
      return this.mapWhatsAppProviderHealth({
        statusRaw: officialStatus,
        errorRaw: company.whatsappStatusError,
        source: 'WhatsApp oficial',
      });
    }
    return {
      status: 'unknown',
      canSafelyDelete: true,
      reason: 'Nenhum provider QR ativo identificado; purge local liberado sem tocar na sessao WhatsApp.',
      lastCheckedAt: new Date().toISOString(),
      rawStatus: null,
      rawError: null,
    };
  }

  private async assertProviderHealthyForTrashPurge(companyId: number) {
    const health = await this.getWhatsAppProviderHealth(companyId);
    if (!health.canSafelyDelete) {
      throw new ServiceUnavailableException({
        code:
          health.status === 'qr_required'
            ? 'QR_REQUIRED'
            : health.status === 'auth_failure'
              ? 'AUTH_FAILURE'
              : 'WEBWHATS_NOT_CONNECTED',
        message: 'Pausado para proteger o QR Code / sessão WhatsApp.',
        providerStatus: health.status,
        providerError: health.reason || null,
      });
    }
    return health;
  }

  async deleteConversation(user: any, conversationId: number) {
    this.assertAdministrativeAction(user);
    this.requireCompanyIdFromUser(user);
    throw new BadRequestException(
      'Excluídos foi removido do Atendimento. Use o card/status do cliente para encerrar ou bloquear contato.',
    );
  }

  private async purgeInboxConversationLocally(companyId: number, conversationId: number) {
    await this.purgeInboxConversationsLocally(companyId, [conversationId]);
  }

  private async purgeInboxConversationsLocally(companyId: number, conversationIds: number[]) {
    const ids = Array.from(new Set(
      conversationIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
    ));
    if (!ids.length) return;
    this.logger.warn(
      `Purge local de conversas bloqueado company=${companyId} ids=${ids.join(',')}. Mensagens preservadas.`,
    );
  }

  // cleanupOldWhatsappSessions removida (store-on-arrival — não há mais supressão/floor).

  // @deprecated removida; mantida como stub para evitar erro em call-sites legados até limpeza.
  // cleanupOldWhatsappSessions removida (store-on-arrival — sem supressão/floor/merge).
  async cleanupOldWhatsappSessions(_user: any, _modeRaw?: string | null): Promise<never> {
    throw new Error('cleanupOldWhatsappSessions foi removida. Use wipeAllWhatsAppData para resetar.');
  }

  // Apaga TODAS as mensagens e conversas WhatsApp da company no banco.
  // Apaga TODAS as instâncias da company no motor (sem supressão/floor).
  // Desconecta a sessão. O dono re-escaneia o QR para reconectar limpo.
  async wipeAllWhatsAppData(user: any) {
    this.assertAdministrativeAction(user);
    const companyId = this.requireCompanyIdFromUser(user);

    let deletedMessages = 0;
    let deletedConversations = 0;

    await this.prisma.$transaction(async (tx) => {
      // Nulifica referência antes de apagar conversas (FK nullable sem onDelete).
      await tx.atendimentoAppointment.updateMany({
        where: { companyId, conversation: { companyId, channel: 'whatsapp' } },
        data: { conversationId: null },
      });

      const convIds = await tx.companyConversation.findMany({
        where: { companyId, channel: 'whatsapp' },
        select: { id: true },
      });
      const ids = convIds.map((c: any) => c.id);

      if (ids.length) {
        const msgResult = await tx.companyMessage.deleteMany({
          where: { companyId, conversationId: { in: ids } },
        });
        deletedMessages = msgResult.count;

        const convResult = await tx.companyConversation.deleteMany({
          where: { companyId, id: { in: ids } },
        });
        deletedConversations = convResult.count;
      }
    });

    // Apaga TODAS as instâncias da company no motor (company-{id} e company-{id}-user-*).
    const motorWipe = await this.webwhatsBridge.wipeMotorInstance(companyId).catch((error) => {
      this.logger.warn(`wipe-all: falha ao apagar instâncias no motor: ${String((error as any)?.message || error)}`);
      return { loggedOut: false, deleted: false, recreated: false };
    });

    // Reflete desconectado (usuário re-escaneia o QR).
    const disconnectedAt = new Date();
    await this.prisma.whatsAppConnectionSession.updateMany({
      where: { companyId, provider: 'webwhats', status: 'active' },
      data: { status: 'disconnected', disconnectedAt },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        whatsappModalStatus: 'DISCONNECTED',
        whatsappModalPhone: null,
        whatsappModalConnectedAt: null,
        currentWhatsappConnectionSessionId: null,
        whatsappModalUpdatedAt: new Date(),
      },
    });

    await this.logInboxEvent({
      companyId,
      event: 'whatsapp_data_wiped',
      message: `[WIPE] WhatsApp apagado: ${deletedMessages} msgs, ${deletedConversations} conversas. Motor: logout=${motorWipe.loggedOut} delete=${motorWipe.deleted}. Reconecte pelo QR.`,
      result: 'wipe_all',
      extra: { deletedMessages, deletedConversations, motorWipe },
    });

    return {
      success: true,
      deletedMessages,
      deletedConversations,
      motorWiped: motorWipe.deleted,
      requiresReconnect: true,
    };
  }
  async purgeConversationFromTrash(user: any, conversationId: number) {
    this.assertAdministrativeAction(user);
    throw new BadRequestException('Exclusao permanente removida do HBX. Excluídos não existe mais como fila operacional.');
  }

  private serializeMeticulousTrashJob(job: any) {
    const now = Date.now();
    const nextRunAt = job?.nextRunAt ? new Date(job.nextRunAt) : null;
    return {
      jobId: String(job.id),
      status: String(job.status || 'idle') as TrashPurgeJobStatus,
      mode: String(job.mode || (job.dryRun ? 'dry_run' : 'real')),
      dryRun: Boolean(job.dryRun),
      totalCandidates: Number(job.totalCandidates || 0),
      currentIndex: Number(job.currentIndex || 0),
      currentConversationId: job.currentConversationId == null ? null : String(job.currentConversationId),
      currentPhone: job.currentPhone || null,
      currentLastCustomerWords: job.currentLastCustomerWords || null,
      currentDetectedReason: job.currentDetectedReason || null,
      processed: Number(job.processed || 0),
      markedNegative: Number(job.markedNegative || 0),
      purged: Number(job.purged || 0),
      skipped: Number(job.skipped || 0),
      errors: this.parseJsonArray(job.errorsJson),
      candidates: this.parseJsonArray(job.previewJson),
      nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
      countdownSeconds: nextRunAt ? Math.max(0, Math.ceil((nextRunAt.getTime() - now) / 1000)) : 0,
      providerStatus: job.providerStatus || null,
      providerHealth: this.parseLooseJsonRecord(job.providerHealthJson) || null,
      startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt || null,
      finishedAt: job.finishedAt instanceof Date ? job.finishedAt.toISOString() : job.finishedAt || null,
      olderThanHours: Number(job.olderThanHours || 24),
      delayMs: Number(job.delayMs || METICULOUS_TRASH_DEFAULT_DELAY_MS),
      limit: job.limit == null ? null : Number(job.limit),
    };
  }

  private async listMeticulousTrashCandidates(input: {
    companyId: number;
    olderThanHours: number;
    limit?: number | null;
  }) {
    const cutoff = new Date(Date.now() - input.olderThanHours * 60 * 60 * 1000);
    const rows = await this.prisma.companyConversation.findMany({
      where: {
        companyId: input.companyId,
        channel: 'whatsapp',
        lastMessageAt: { lte: cutoff },
      },
      select: {
        id: true,
        contact: true,
        flowResult: true,
        metadata: true,
        lastMessageAt: true,
        lastInteractionAt: true,
        updatedAt: true,
      },
      orderBy: [{ lastMessageAt: 'asc' }, { id: 'asc' }],
    });
    const ids: number[] = [];
    for (const row of rows) {
      const metadata = this.parseConversationMetadata(row.metadata);
      if (!this.isConversationMetadataInTrash(metadata, row.flowResult)) continue;
      const lastActivity = row.lastMessageAt || row.lastInteractionAt || row.updatedAt || null;
      if (!lastActivity || lastActivity.getTime() > cutoff.getTime()) continue;
      ids.push(row.id);
      if (input.limit && ids.length >= input.limit) break;
    }
    return ids;
  }

  private scheduleMeticulousTrashJob(jobId: string, delayMs: number) {
    const current = this.meticulousTrashTimers.get(jobId);
    if (current) clearTimeout(current);
    const timer = setTimeout(() => {
      this.meticulousTrashTimers.delete(jobId);
      void this.runMeticulousTrashJobStep(jobId);
    }, Math.max(0, delayMs));
    this.meticulousTrashTimers.set(jobId, timer);
  }

  private appendMeticulousPreview(currentJson: string | null | undefined, item: Record<string, unknown>) {
    const current = this.parseJsonArray(currentJson);
    current.push(item);
    return JSON.stringify(current.slice(-1000));
  }

  private appendMeticulousError(currentJson: string | null | undefined, item: Record<string, unknown>) {
    const current = this.parseJsonArray(currentJson);
    current.push({
      ...item,
      at: new Date().toISOString(),
    });
    return JSON.stringify(current.slice(-200));
  }

  private async processMeticulousTrashCandidate(job: any, conversationId: number) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId: job.companyId, channel: 'whatsapp' },
      select: {
        id: true,
        contact: true,
        flowResult: true,
        metadata: true,
        lastMessageAt: true,
        lastInteractionAt: true,
        updatedAt: true,
      },
    });
    if (!conversation) {
      return {
        action: 'skipped',
        reason: 'conversation_not_found',
        phone: null,
        extraction: null,
      };
    }

    const metadata = this.parseConversationMetadata(conversation.metadata);
    if (!this.isConversationMetadataInTrash(metadata, conversation.flowResult)) {
      return {
        action: 'skipped',
        reason: 'not_in_trash',
        phone: String(conversation.contact || '').trim(),
        extraction: null,
      };
    }

    const cutoff = new Date(Date.now() - Number(job.olderThanHours || 24) * 60 * 60 * 1000);
    const lastActivity = conversation.lastMessageAt || conversation.lastInteractionAt || conversation.updatedAt || null;
    if (!lastActivity || lastActivity.getTime() > cutoff.getTime()) {
      return {
        action: 'skipped',
        reason: 'recent_activity',
        phone: String(conversation.contact || '').trim(),
        extraction: null,
      };
    }

    const trashAt = this.getTrashDeletedAt(metadata);
    if (await this.hasCustomerMessageAfterTrash({ companyId: job.companyId, conversationId, trashAt })) {
      return {
        action: 'skipped',
        reason: 'customer_replied_after_trash',
        phone: String(conversation.contact || '').trim(),
        extraction: null,
      };
    }

    const extraction = await this.extractLastCustomerWordsForPurge(conversation.id, {
      companyId: job.companyId,
      olderThanHours: Number(job.olderThanHours || 24),
    });
    if (extraction.detectedReason === 'MOTIVO_NAO_IDENTIFICADO') {
      return {
        action: 'skipped',
        reason: 'reason_not_identified',
        phone: String(conversation.contact || '').trim(),
        extraction,
      };
    }

    if (job.dryRun) {
      return {
        action: 'would_purge',
        reason: 'dry_run',
        phone: String(conversation.contact || '').trim(),
        extraction,
      };
    }

    await this.markConversationAsNegativeNoInterestBeforePurge({
      companyId: job.companyId,
      userId: Number(job.startedByUserId || 0) || null,
      conversationId: conversation.id,
      extraction,
    });
    await this.purgeInboxConversationLocally(job.companyId, conversation.id);

    return {
      action: 'purged',
      reason: 'marked_and_purged',
      phone: String(conversation.contact || '').trim(),
      extraction,
    };
  }

  private async runMeticulousTrashJobStep(jobId: string) {
    const job = await this.prisma.inboxTrashMeticulousPurgeJob.findUnique({ where: { id: jobId } });
    if (!job || String(job.status) !== 'running') return;

    if (!job.dryRun) {
      await this.prisma.inboxTrashMeticulousPurgeJob.update({
        where: { id: job.id },
        data: {
          status: 'canceled',
          nextRunAt: null,
          finishedAt: new Date(),
          lastError: 'Exclusao permanente removida do HBX. Excluídos não existe mais como fila operacional.',
        },
      });
      return;
    }

    const ids = this.parseJsonArray(job.candidateIdsJson)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (job.nextRunAt && job.nextRunAt.getTime() > Date.now()) {
      this.scheduleMeticulousTrashJob(job.id, job.nextRunAt.getTime() - Date.now());
      return;
    }

    if (Number(job.currentIndex || 0) >= ids.length) {
      await this.prisma.inboxTrashMeticulousPurgeJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          currentConversationId: null,
          nextRunAt: null,
          finishedAt: new Date(),
        },
      });
      return;
    }

    const conversationId = ids[Number(job.currentIndex || 0)];
    let latestJob = job;
    try {
      if (!job.dryRun) {
        const health = await this.assertProviderHealthyForTrashPurge(job.companyId);
        latestJob = await this.prisma.inboxTrashMeticulousPurgeJob.update({
          where: { id: job.id },
          data: {
            providerStatus: health.status,
            providerHealthJson: JSON.stringify(health),
          },
        });
      }

      let result: any = null;
      let lastError: unknown = null;
      for (const attempt of [1, 2]) {
        try {
          result = await this.processMeticulousTrashCandidate(latestJob, conversationId);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt >= 2) break;
        }
      }
      if (lastError) throw lastError;

      const extraction = result?.extraction as TrashPurgeWords | null;
      const previewItem = {
        conversationId: String(conversationId),
        phone: result?.phone || null,
        action: result?.action || 'skipped',
        reason: result?.reason || null,
        lastCustomerWords: extraction?.lastCustomerMessagesText || extraction?.lastCustomerMessage || null,
        detectedReason: extraction?.detectedReason || null,
        confidence: extraction?.confidence ?? null,
      };
      const isPurged = result?.action === 'purged';
      const isMarked = isPurged;
      const isSkipped = result?.action === 'skipped';
      const isDryCandidate = result?.action === 'would_purge';
      const nextIndex = Number(job.currentIndex || 0) + 1;
      const completed = nextIndex >= ids.length;
      const jitter =
        job.dryRun || completed
          ? 0
          : Math.trunc(
              Number(job.jitterMinMs || 0) +
                Math.random() * Math.max(0, Number(job.jitterMaxMs || 0) - Number(job.jitterMinMs || 0)),
            );
      const waitMs = job.dryRun || completed ? 0 : Number(job.delayMs || METICULOUS_TRASH_DEFAULT_DELAY_MS) + jitter;
      const nextRunAt = completed ? null : new Date(Date.now() + waitMs);
      const updated = await this.prisma.inboxTrashMeticulousPurgeJob.update({
        where: { id: job.id },
        data: {
          status: completed ? 'completed' : 'running',
          currentIndex: nextIndex,
          currentConversationId: conversationId,
          currentPhone: result?.phone || null,
          currentLastCustomerWords: extraction?.lastCustomerMessagesText || extraction?.lastCustomerMessage || null,
          currentDetectedReason: extraction?.detectedReason || null,
          processed: { increment: 1 },
          markedNegative: isMarked ? { increment: 1 } : undefined,
          purged: isPurged ? { increment: 1 } : undefined,
          skipped: isSkipped ? { increment: 1 } : undefined,
          previewJson: this.appendMeticulousPreview(job.previewJson, previewItem),
          nextRunAt,
          finishedAt: completed ? new Date() : null,
        },
      });
      if (!completed) this.scheduleMeticulousTrashJob(updated.id, waitMs);
      if (isDryCandidate && !completed) this.scheduleMeticulousTrashJob(updated.id, 150);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String((error as any)?.message || error || 'Falha na limpeza meticulosa.');
      const code = String((error as any)?.response?.code || (error as any)?.code || '').trim().toUpperCase();
      const providerDisconnected =
        code === 'WEBWHATS_NOT_CONNECTED' ||
        code === 'QR_REQUIRED' ||
        code === 'AUTH_FAILURE' ||
        code === 'SESSION_CLOSED' ||
        code === 'DISCONNECTED' ||
        message.toLowerCase().includes('webwhats_not_connected') ||
        message.toLowerCase().includes('qr code') ||
        message.toLowerCase().includes('auth') ||
        message.toLowerCase().includes('sessão whatsapp') ||
        message.toLowerCase().includes('sessao whatsapp');
      const nextErrorsJson = this.appendMeticulousError(job.errorsJson, {
        conversationId: String(conversationId),
        message,
        code: code || null,
      });
      await this.prisma.inboxTrashMeticulousPurgeJob.update({
        where: { id: job.id },
        data: {
          status: providerDisconnected ? 'paused_provider_unhealthy' : 'running',
          currentConversationId: conversationId,
          errorsJson: nextErrorsJson,
          lastError: message,
          skipped: providerDisconnected ? undefined : { increment: 1 },
          currentIndex: providerDisconnected ? job.currentIndex : Number(job.currentIndex || 0) + 1,
          nextRunAt: null,
        },
      });
      if (!providerDisconnected) this.scheduleMeticulousTrashJob(job.id, 1500);
    }
  }

  async startMeticulousTrashPurge(user: any, dto?: {
    dryRun?: boolean;
    mode?: 'dry_run' | 'real' | string | null;
    olderThanHours?: number | string | null;
    delayMs?: number | string | null;
    limit?: number | string | null;
  }) {
    this.assertAdministrativeAction(user);
    const companyId = this.requireCompanyIdFromUser(user);
    const options = this.normalizeMeticulousTrashOptions(dto);
    if (!options.dryRun) {
      throw new BadRequestException('Exclusao permanente removida do HBX. Excluídos não existe mais como fila operacional.');
    }
    const running = await this.prisma.inboxTrashMeticulousPurgeJob.findFirst({
      where: {
        companyId,
        status: { in: ['running', 'paused', 'paused_provider_unhealthy', 'paused_after_restart'] },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (running) {
      throw new ConflictException('Ja existe uma limpeza meticulosa ativa ou pausada para esta empresa.');
    }

    const providerHealth = await this.getWhatsAppProviderHealth(companyId);
    const candidateIds = await this.listMeticulousTrashCandidates({
      companyId,
      olderThanHours: options.olderThanHours,
      limit: options.limit,
    });
    const job = await this.prisma.inboxTrashMeticulousPurgeJob.create({
      data: {
        companyId,
        startedByUserId: Number(user?.id || 0) || null,
        status: candidateIds.length ? 'running' : 'completed',
        mode: options.mode,
        dryRun: options.dryRun,
        olderThanHours: options.olderThanHours,
        delayMs: options.delayMs,
        jitterMinMs: options.jitterMinMs,
        jitterMaxMs: options.jitterMaxMs,
        limit: options.limit,
        candidateIdsJson: JSON.stringify(candidateIds),
        totalCandidates: candidateIds.length,
        providerStatus: providerHealth.status,
        providerHealthJson: JSON.stringify(providerHealth),
        finishedAt: candidateIds.length ? null : new Date(),
      },
    });
    await this.logInboxEvent({
      companyId,
      event: 'meticulous_trash_purge_started',
      message: options.dryRun
        ? 'Simulacao de limpeza meticulosa da lixeira iniciada.'
        : 'Limpeza meticulosa da lixeira iniciada.',
      result: options.dryRun ? 'dry_run_started' : 'started',
      extra: {
        jobId: job.id,
        mode: options.mode,
        totalCandidates: candidateIds.length,
        olderThanHours: options.olderThanHours,
        delayMs: options.delayMs,
        limit: options.limit,
      },
    });
    if (candidateIds.length) this.scheduleMeticulousTrashJob(job.id, 0);
    return this.serializeMeticulousTrashJob(job);
  }

  async dryRunMeticulousTrashPurge(user: any, dto?: {
    olderThanHours?: number | string | null;
    delayMs?: number | string | null;
    limit?: number | string | null;
  }) {
    return this.startMeticulousTrashPurge(user, {
      ...(dto || {}),
      mode: 'dry_run',
      dryRun: true,
    });
  }

  async getMeticulousTrashPurgeStatus(user: any, jobId: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const job = await this.prisma.inboxTrashMeticulousPurgeJob.findFirst({
      where: { id: String(jobId || ''), companyId },
    });
    if (!job) throw new NotFoundException('Job de limpeza nao encontrado.');
    const looksRestarted =
      Boolean(job.nextRunAt) ||
      (job.updatedAt instanceof Date && job.updatedAt.getTime() < this.serviceStartedAt.getTime());
    if (String(job.status) === 'running' && !this.meticulousTrashTimers.has(job.id) && looksRestarted) {
      const updated = await this.prisma.inboxTrashMeticulousPurgeJob.update({
        where: { id: job.id },
        data: {
          status: 'paused_after_restart',
          nextRunAt: null,
          lastError: 'Job pausado apos reinicio do servidor. Continue manualmente para retomar com seguranca.',
        },
      });
      return this.serializeMeticulousTrashJob(updated);
    }
    return this.serializeMeticulousTrashJob(job);
  }

  async pauseMeticulousTrashPurge(user: any, jobId: string) {
    this.assertAdministrativeAction(user);
    const companyId = this.requireCompanyIdFromUser(user);
    const job = await this.prisma.inboxTrashMeticulousPurgeJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Job de limpeza nao encontrado.');
    const timer = this.meticulousTrashTimers.get(job.id);
    if (timer) clearTimeout(timer);
    this.meticulousTrashTimers.delete(job.id);
    const updated = await this.prisma.inboxTrashMeticulousPurgeJob.update({
      where: { id: job.id },
      data: { status: 'paused', nextRunAt: null },
    });
    return this.serializeMeticulousTrashJob(updated);
  }

  async resumeMeticulousTrashPurge(user: any, jobId: string) {
    this.assertAdministrativeAction(user);
    const companyId = this.requireCompanyIdFromUser(user);
    const job = await this.prisma.inboxTrashMeticulousPurgeJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Job de limpeza nao encontrado.');
    if (!job.dryRun) {
      throw new BadRequestException('Exclusao permanente removida do HBX. Excluídos não existe mais como fila operacional.');
    }
    if (!['paused', 'paused_provider_unhealthy', 'paused_after_restart'].includes(String(job.status))) {
      throw new BadRequestException('Apenas jobs pausados podem continuar.');
    }
    const updated = await this.prisma.inboxTrashMeticulousPurgeJob.update({
      where: { id: job.id },
      data: { status: 'running', nextRunAt: new Date() },
    });
    this.scheduleMeticulousTrashJob(job.id, 0);
    return this.serializeMeticulousTrashJob(updated);
  }

  async cancelMeticulousTrashPurge(user: any, jobId: string) {
    this.assertAdministrativeAction(user);
    const companyId = this.requireCompanyIdFromUser(user);
    const job = await this.prisma.inboxTrashMeticulousPurgeJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Job de limpeza nao encontrado.');
    const timer = this.meticulousTrashTimers.get(job.id);
    if (timer) clearTimeout(timer);
    this.meticulousTrashTimers.delete(job.id);
    const updated = await this.prisma.inboxTrashMeticulousPurgeJob.update({
      where: { id: job.id },
      data: { status: 'canceled', nextRunAt: null, finishedAt: new Date() },
    });
    return this.serializeMeticulousTrashJob(updated);
  }

  async emptyTrash(user: any) {
    this.assertAdministrativeAction(user);
    const companyId = this.requireCompanyIdFromUser(user);
    await this.logInboxEvent({
      companyId,
      event: 'conversation_empty_trash_legacy_blocked',
      message: 'Limpeza antiga bloqueada. Excluídos não existe mais como fila operacional.',
      result: 'blocked',
      extra: {
        localOnly: true,
        whatsappCommandSent: false,
      },
    });

    return {
      success: true,
      deleted: 0,
      deletedIds: [],
      skipped: 0,
      localOnly: true,
      message: 'Exclusao permanente foi removida do HBX. Excluídos não existe mais como fila operacional.',
    };
  }

  async markConversationAsRead(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    // "Marcar como lido" é best-effort e IDEMPOTENTE: quando a conversa está fora do
    // escopo da sessão ativa (lista do front defasada durante a troca de número — o
    // vendedor recém-conectado ainda enxerga ids de outro vendedor) NÃO é erro. Vira
    // no-op silencioso (200) em vez de 404 ruidoso no console. O caller no front ignora
    // o retorno; outros erros (ex.: companyId ausente) continuam subindo.
    const conversation = await this.ensureConversation(companyId, conversationId, scope).catch(
      (error) => {
        if (error instanceof NotFoundException) return null;
        throw error;
      },
    );
    if (!conversation) {
      this.logger.debug(
        `markConversationAsRead no-op: conversa ${conversationId} fora do escopo (company=${companyId}).`,
      );
      return { id: conversationId, skipped: true as const };
    }
    const metadata = this.parseConversationMetadata(conversation.metadata);
    const recentInboundMessages = await this.prisma.companyMessage.findMany({
      where: {
        companyId,
        conversationId: conversation.id,
        direction: 'INBOUND',
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
      select: {
        id: true,
        providerMessageId: true,
        rawPayload: true,
        variablesJson: true,
      },
    });
    const webwhatsReadMessages = recentInboundMessages
      .map((message) => {
        const rawPayload = this.parseConversationMetadata(message.rawPayload);
        const variables = this.parseConversationMetadata(message.variablesJson);
        const id =
          this.normalizeMessageMetadataText(rawPayload?.key?.id) ||
          this.normalizeMessageMetadataText(variables?.providerKeyId) ||
          this.extractWebwhatsRawMessageIdFromProviderMessageId(message.providerMessageId);
        if (!id) return null;
        return {
          id,
          fromMe: false,
          remoteJid:
            this.normalizeMessageMetadataText(rawPayload?.key?.remoteJid) ||
            this.normalizeMessageMetadataText(metadata?.whatsappRemoteJid) ||
            null,
          participant:
            this.normalizeMessageMetadataText(rawPayload?.key?.participant || rawPayload?.participant) ||
            null,
        };
      })
      .filter(Boolean);

    if (webwhatsReadMessages.length > 0) {
      const readSelector = await this.buildWebwhatsConversationSelector(companyId, conversation.id);
      this.webwhatsBridge.markMessagesAsRead(companyId, {
        conversationId: conversation.id,
        remoteJid: this.normalizeMessageMetadataText(metadata?.whatsappRemoteJid) || null,
        messages: webwhatsReadMessages as Array<{
          id: string;
          fromMe: boolean;
          remoteJid: string | null;
          participant: string | null;
        }>,
      }, readSelector).catch((error) => {
        const message = String(error?.message || error || 'Falha ao marcar conversa como lida no Webwhats.');
        this.logger.warn(`Inbox mark read via Webwhats falhou company=${companyId} conversation=${conversation.id}: ${message}`);
      });
    }

    const nextMetadata = {
      ...metadata,
      whatsappMarkedReadAt: new Date().toISOString(),
      whatsappUnreadCount: 0,
    };

    await this.prisma.companyConversation.update({
      where: { id: conversation.id },
      data: {
        metadata: JSON.stringify(nextMetadata),
      },
    });

    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  // FOTO DE PERFIL — APOSENTADA (31/07/2026, ordem do dono).
  //
  // A rota continua existindo e responde 200 pra não quebrar aba aberta com o
  // front antigo (que ainda chama isto ao abrir conversa sem foto), mas virou
  // NO-OP: não fala com o motor, não grava metadata, devolve sempre null.
  //
  // Por que aposentar em vez de "consertar": a URL do CDN da Meta é assinada e
  // expira; manter foto exigia repetir a consulta no motor pra cada contato —
  // tráfego no chip (fingerprint de bot) e uma classe inteira de bug de imagem
  // quebrada, tudo isso pra exibir um dado que não vende nada. A identidade
  // visual agora é iniciais coloridas do nome cadastrado no HBX.
  async refreshConversationAvatar(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    // Mantém a checagem de acesso: rota autenticada não pode virar buraco de
    // enumeração de conversa de outra empresa só porque o corpo ficou vazio.
    await this.ensureConversation(companyId, conversationId, scope);
    return { avatarUrl: null as string | null };
  }

  // GATEWAY-WA S5 (item 2): escape hatch manual. Com HBX_WA_SYNC_POLLING_DISABLED=true a
  // rotina automática para de chamar o motor a cada leitura de conversa; este endpoint é a
  // ferramenta explícita que continua existindo pra forçar um ressync completo sob demanda
  // (ex.: suspeita de mensagem perdida). NUNCA passa pelos triggers de rotina — chama a bridge
  // direto com force+fullSync, igual o bootstrap inicial já faz.
  async backfillConversationMessages(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    const selector = await this.buildWebwhatsConversationSelector(companyId, conversation.id);

    let result: WebwhatsConversationSyncResult;
    try {
      result = await this.webwhatsBridge.syncConversationMessagesDetailed(
        companyId,
        conversation.id,
        { force: true, fullSync: true, failOnError: true },
        selector,
      );
    } catch (error: any) {
      const message = String(error?.message || error || 'Falha ao ressincronizar conversa do WhatsApp.');
      await this.logInboxEvent({
        companyId,
        event: 'inbox.conversation.backfill_manual_failed',
        message: `Backfill manual falhou (user=${user?.id || 'n/a'}): ${message}`,
        conversationId: conversation.id,
        result: 'error',
      });
      throw this.mapInboxProviderReadError(error, 'Falha ao ressincronizar conversa do WhatsApp.');
    }

    await this.logInboxEvent({
      companyId,
      event: 'inbox.conversation.backfill_manual',
      message: `Backfill manual disparado por user=${user?.id || 'n/a'}: ${result.syncedMessages} mensagens, ${result.mediaMessages} midias, ${result.pagesFetched} paginas.`,
      conversationId: conversation.id,
      result: 'success',
      extra: {
        syncedMessages: result.syncedMessages,
        mediaMessages: result.mediaMessages,
        pagesFetched: result.pagesFetched,
      },
    });

    this.inboxRealtime.publish({
      companyId,
      kind: 'conversation',
      conversationId: conversation.id,
      at: new Date().toISOString(),
    });

    return {
      conversationId: conversation.id,
      syncedMessages: result.syncedMessages,
      mediaMessages: result.mediaMessages,
      pagesFetched: result.pagesFetched,
      avatarUrl: result.avatarUrl || null,
      displayName: result.displayName || null,
    };
  }

  async reactToConversationMessage(
    user: any,
    conversationId: number,
    messageId: number,
    reactionRaw: string,
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    await this.assertCanSendInConversation(user, conversation);
    const message = await this.ensureConversationMessage(companyId, conversation.id, messageId);
    const rawPayload = this.parseConversationMetadata(message.rawPayload);
    const reaction = this.requireTrimmed(String(reactionRaw || ''), 'reaction');
    const remoteJid =
      this.normalizeMessageMetadataText(rawPayload?.key?.remoteJid) ||
      this.normalizeMessageMetadataText(this.parseConversationMetadata(conversation.metadata)?.whatsappRemoteJid) ||
      String(conversation.contact || '');
    const providerKeyId =
      this.normalizeMessageMetadataText(rawPayload?.key?.id) ||
      this.extractWebwhatsRawMessageIdFromProviderMessageId(message.providerMessageId);
    if (!providerKeyId) {
      throw new BadRequestException('Mensagem ainda nao possui chave valida para reagir no WhatsApp.');
    }

    await this.webwhatsBridge.sendReaction(companyId, {
      conversationId: conversation.id,
      remoteJid,
      messageId: providerKeyId,
      fromMe:
        rawPayload?.key?.fromMe === undefined || rawPayload?.key?.fromMe === null
          ? String(message.direction || '').trim().toUpperCase() === 'OUTBOUND'
          : Boolean(rawPayload?.key?.fromMe),
      reaction,
    }, await this.buildWebwhatsConversationSelector(companyId, conversation.id));
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  async retryConversationMessage(
    user: any,
    conversationId: number,
    messageId: number,
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    await this.assertCanSendInConversation(user, conversation);
    const message = await this.prisma.companyMessage.findFirst({
      where: { id: messageId, companyId, conversationId: conversation.id },
      select: {
        id: true,
        direction: true,
        status: true,
        error: true,
        outboundMessageId: true,
        messageType: true,
        outboundMessage: {
          select: {
            id: true,
            status: true,
            deliveryStatus: true,
            failedAt: true,
            to: true,
            sourceModule: true,
          },
        },
      },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (String(message.direction || '').trim().toUpperCase() !== 'OUTBOUND') {
      throw new BadRequestException('Apenas mensagens enviadas podem ser reenviadas.');
    }
    const outboundMessageId = Number(message.outboundMessageId || message.outboundMessage?.id || 0);
    if (!outboundMessageId || !message.outboundMessage) {
      throw new BadRequestException('Mensagem sem registro de envio para reprocessar.');
    }

    const messageStatus = String(message.status || '').trim().toUpperCase();
    const outboundStatus = String(message.outboundMessage.status || '').trim().toUpperCase();
    const deliveryStatus = String(message.outboundMessage.deliveryStatus || '').trim().toLowerCase();
    const isFailed =
      messageStatus === 'FAILED' ||
      outboundStatus === 'FAILED' ||
      deliveryStatus === 'failed' ||
      Boolean(message.outboundMessage.failedAt);
    if (!isFailed) {
      throw new BadRequestException('Apenas mensagens com falha podem ser reenviadas.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.outboundMessage.update({
        where: { id: outboundMessageId },
        data: {
          status: 'PENDING',
          attemptCount: 0,
          nextAttemptAt: now,
          failedAt: null,
          deliveredAt: null,
          readAt: null,
          sentAt: null,
          deliveryStatus: null,
          lastError: null,
          providerMessageId: null,
          lastWebhookAt: null,
          lastWebhookPayload: null,
        },
      });
      await tx.companyMessage.update({
        where: { id: message.id },
        data: {
          status: 'QUEUED',
          error: null,
          providerMessageId: null,
        },
      });
    });

    await this.conversations.dispatchVendasCockpitProjection({
      companyId,
      conversationId: conversation.id,
      event: 'queued',
      messageId: message.id,
    });

    await this.logInboxEvent({
      companyId,
      event: 'manual_outbound_retry_queued',
      message: `Reenvio manual enfileirado para ${message.outboundMessage.to || conversation.contact || ''}`,
      conversationId: conversation.id,
      phone: String(message.outboundMessage.to || conversation.contact || ''),
      messageType: String(message.messageType || 'text'),
      result: 'queued',
      extra: {
        sourceModule: message.outboundMessage.sourceModule || null,
        outboundMessageId,
        previousStatus: messageStatus || null,
        previousError: message.error || null,
      },
    });

    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  // --- Atendimento compartilhado: puxar / assumir-transferir / liberar (Etapa 3) ---
  // Só fazem sentido no modo SHARED (no individual o dono é a própria linha). Gerenciam
  // assignedUserId, que o assertCanSendInConversation usa como trava de "quem responde".

  async claimConversation(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    if ((await this.resolveCompanyAttendanceMode(companyId)) !== 'shared') {
      throw new BadRequestException('Puxar atendimento só existe no modo compartilhado.');
    }
    const viewerId = Number(user?.id || 0) || 0;
    const assigned = Number(conversation.assignedUserId || 0) || 0;
    if (assigned && assigned !== viewerId && !this.isCompanyAdminOwner(user)) {
      const owner = await this.prisma.user.findUnique({ where: { id: assigned }, select: { name: true } });
      throw new ForbiddenException(`Atendimento já está com ${owner?.name || 'outro atendente'}. Use "Assumir".`);
    }
    await this.prisma.companyConversation.update({
      where: { id: conversation.id },
      data: { assignedUserId: viewerId, humanAssigned: true },
    });
    await this.logInboxEvent({
      companyId, event: 'atendimento_claimed', result: 'assigned', conversationId: conversation.id,
      message: `Atendimento puxado por userId=${viewerId}`,
    });
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  async transferConversation(user: any, conversationId: number, targetUserId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    const viewerId = Number(user?.id || 0) || 0;
    const assigned = Number(conversation.assignedUserId || 0) || 0;
    const target = Number(targetUserId || 0) || 0;
    if (!target) throw new BadRequestException('Informe o atendente.');
    const targetUser = await this.prisma.user.findFirst({
      where: { id: target, companyId, isActive: true },
      select: { id: true, name: true },
    });
    if (!targetUser) throw new BadRequestException('Atendente inválido.');
    // Admin transfere pra qualquer um; o atendente atual transfere; qualquer atendente pode ASSUMIR
    // pra si (takeover explícito e logado).
    const allowed = this.isCompanyAdminOwner(user) || (assigned && assigned === viewerId) || target === viewerId;
    if (!allowed) throw new ForbiddenException('Sem permissão para transferir este atendimento.');
    await this.prisma.companyConversation.update({
      where: { id: conversation.id },
      data: { assignedUserId: target, humanAssigned: true },
    });
    await this.logInboxEvent({
      companyId, event: 'atendimento_transferred', result: 'assigned', conversationId: conversation.id,
      message: `Atendimento transferido para userId=${target} por userId=${viewerId}`,
    });
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  async releaseConversation(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const scope = await this.resolveInboxMutationSessionScope(user, companyId);
    const conversation = await this.ensureConversation(companyId, conversationId, scope);
    const viewerId = Number(user?.id || 0) || 0;
    const assigned = Number(conversation.assignedUserId || 0) || 0;
    if (assigned && assigned !== viewerId && !this.isCompanyAdminOwner(user)) {
      throw new ForbiddenException('Só o atendente atual ou o admin pode liberar.');
    }
    await this.prisma.companyConversation.update({
      where: { id: conversation.id },
      data: { assignedUserId: null },
    });
    await this.logInboxEvent({
      companyId, event: 'atendimento_released', result: 'released', conversationId: conversation.id,
      message: `Atendimento liberado por userId=${viewerId}`,
    });
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  // BRIDGE DO "RESPONDER CITANDO" (02-QUOTED-BRIDGE): resolve a Message original a partir do
  // quotedMessageId que o front manda (3 formatos possíveis — ver quotedPayload() no
  // atendimento/page.client.tsx: meta.providerKeyId || meta.providerMessageId || id numerico da
  // Message). Acha por keyId cru, por providerMessageId completo ou por id numerico; parseia o
  // rawPayload (WAMessage) da original e monta { key, message } no formato que o motor espera
  // (Webwhats/src/validate/message.schema.ts: quoted.key.id obrigatorio). Sem achar a original,
  // cai no fallback textual (key.id = o proprio quotedMessageId, message.conversation = preview).
  private async resolveQuotedForOutbound(
    companyId: number,
    conversationId: number,
    quotedMessageId: string,
    quotedContent?: string | null,
  ): Promise<{ key: Record<string, unknown>; message: Record<string, unknown> } | null> {
    const rawQuotedId = this.normalizeMessageMetadataText(quotedMessageId);
    if (!rawQuotedId) return null;

    const numericId = /^\d+$/.test(rawQuotedId) ? Number(rawQuotedId) : null;
    const original = await this.prisma.companyMessage.findFirst({
      where: {
        companyId,
        conversationId,
        OR: [
          ...(numericId ? [{ id: numericId }] : []),
          { providerMessageId: rawQuotedId },
          { providerMessageId: { endsWith: `:${rawQuotedId}` } },
        ],
      },
      select: { id: true, direction: true, providerMessageId: true, rawPayload: true },
      orderBy: { id: 'desc' },
    });

    if (original) {
      const rawPayload = this.parseConversationMetadata(original.rawPayload);
      const keyId =
        this.normalizeMessageMetadataText(rawPayload?.key?.id) ||
        this.extractWebwhatsRawMessageIdFromProviderMessageId(original.providerMessageId);
      if (keyId && rawPayload?.message && typeof rawPayload.message === 'object') {
        return {
          key: {
            remoteJid: this.normalizeMessageMetadataText(rawPayload?.key?.remoteJid) || undefined,
            fromMe:
              rawPayload?.key?.fromMe === undefined || rawPayload?.key?.fromMe === null
                ? String(original.direction || '').trim().toUpperCase() === 'OUTBOUND'
                : Boolean(rawPayload.key.fromMe),
            id: keyId,
            ...(this.normalizeMessageMetadataText(rawPayload?.key?.participant)
              ? { participant: this.normalizeMessageMetadataText(rawPayload.key.participant) }
              : {}),
          },
          message: rawPayload.message,
        };
      }
    }

    // Fallback: sem original localizavel (mensagem antiga, id perdido etc.) — ainda assim manda
    // a citacao com o texto que a nossa UI ja guarda em quotedContent, respeitando o obrigatorio
    // do schema do motor (key.id).
    return {
      key: { remoteJid: undefined, fromMe: false, id: rawQuotedId },
      message: { conversation: (quotedContent && String(quotedContent).trim()) || ' ' },
    };
  }

  async sendMessage(
    user: any,
    conversationId: number,
    content: string,
    opts?: {
      quotedMessageId?: string;
      quotedContent?: string;
      sourceModule?: string;
      variables?: Record<string, unknown>;
      attachment?: {
        kind?: string | null;
        url?: string | null;
        previewUrl?: string | null;
        mimeType?: string | null;
        fileName?: string | null;
        fileSize?: number | null;
        durationSeconds?: number | null;
      };
    },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const attendanceMode = await this.assertCanSendInConversation(user, conversation);
    if (this.getAtendimentoBlockedState(conversation.metadata).isBlocked) {
      throw new BadRequestException('Conversa bloqueada. Desbloqueie antes de responder.');
    }

    // SHARED: responder uma conversa sem dono = PUXAR pra si (evita dois atendentes no mesmo cliente).
    const viewerId = Number(user?.id || 0) || 0;
    if (attendanceMode === 'shared' && viewerId && !Number(conversation.assignedUserId || 0)) {
      await this.prisma.companyConversation.update({
        where: { id: conversation.id },
        data: { assignedUserId: viewerId, humanAssigned: true },
      });
      (conversation as any).assignedUserId = viewerId;
    }

    // PR20072026-CHIP (A2): em modo INDIVIDUAL, a identidade de quem clicou some na
    // criação da conversa — não no dispatch. Se a conversa nasceu órfã (sem sessão
    // vinculada; causa raiz do vazamento 20/07: shell criada pela ponte agenda<->vendas
    // sem a sessão do vendedor), resolve a sessão ATIVA do PRÓPRIO viewer e adota agora
    // (1º envio carimba a conversa, idempotente). Sem sessão do viewer = erro claro,
    // NUNCA cai pro chip da empresa/de terceiro. Em modo shared, o pool é compartilhado
    // de propósito — não mexe.
    if (attendanceMode === 'individual' && !conversation.whatsappConnectionSessionId && viewerId) {
      const viewerSession = await this.ensureWebwhatsSessionFromCompany({ id: companyId }, viewerId);
      if (!viewerSession?.id) {
        throw new BadRequestException('Seu WhatsApp não está conectado — conecte antes de enviar.');
      }
      try {
        await this.prisma.companyConversation.updateMany({
          where: { id: conversation.id, companyId, whatsappConnectionSessionId: null },
          data: {
            whatsappConnectionSessionId: String(viewerSession.id),
            sourceTenantKey: viewerSession.tenantKey || null,
            sourcePhoneNormalized: viewerSession.phoneNormalized || null,
          },
        });
        (conversation as any).whatsappConnectionSessionId = String(viewerSession.id);
        (conversation as any).sourceTenantKey = viewerSession.tenantKey || null;
        (conversation as any).sourcePhoneNormalized = viewerSession.phoneNormalized || null;
      } catch (err) {
        // Best-effort: colisão na unique (companyId, channel, contact, sessionId) não pode
        // travar o envio — o senderUserId no outboundPayload abaixo já garante o chip certo
        // pra ESTA mensagem mesmo sem o carimbo persistido na conversa.
        this.logger.warn(
          `Falha ao carimbar sessão na conversa órfã (conversationId=${conversation.id}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const normalizedContent = this.requireTrimmed(content, 'content');
    const toPhone = this.requireTrimmed(String(conversation.contact || ''), 'customer phone');

    // Build body with optional quote prefix (text-only fallback, WhatsApp style)
    const quotedPreview = opts?.quotedContent
      ? String(opts.quotedContent).trim().slice(0, 200)
      : null;
    // P1.3: o front manda a URL ASSINADA que recebeu do upload — armazenamos o path
    // cru (assinatura expira; a leitura re-assina na saída).
    const attachment = opts?.attachment
      ? {
          kind: this.normalizeMessageMetadataText(opts.attachment.kind) || undefined,
          url:
            stripInboxMediaSignature(this.normalizeMessageMetadataText(opts.attachment.url)) ||
            undefined,
          previewUrl:
            stripInboxMediaSignature(
              this.normalizeMessageMetadataText(opts.attachment.previewUrl || opts.attachment.url),
            ) || undefined,
          mimeType: this.normalizeMessageMetadataText(opts.attachment.mimeType) || undefined,
          fileName: this.normalizeMessageMetadataText(opts.attachment.fileName) || undefined,
          fileSize: this.normalizeStoredFileSize(opts.attachment.fileSize),
          durationSeconds: this.normalizeStoredFileSize(opts.attachment.durationSeconds),
        }
      : null;
    const body = quotedPreview
      ? `> ${quotedPreview}\n\n${normalizedContent}`
      : normalizedContent;
    const variables: Record<string, unknown> = {
      ...(opts?.variables && typeof opts.variables === 'object' ? opts.variables : {}),
    };
    if (opts?.quotedMessageId) {
      variables.quotedMessageId = String(opts.quotedMessageId).trim();
      // Resolve o { key, message } pro motor repassar a citacao de verdade no WhatsApp do
      // cliente (antes disso o quoted so renderizava na nossa UI, via quotedMessageId/preview
      // acima). Best-effort: falha na resolucao nao pode travar o envio da mensagem em si.
      try {
        const quoted = await this.resolveQuotedForOutbound(
          companyId,
          conversation.id,
          String(opts.quotedMessageId).trim(),
          opts?.quotedContent,
        );
        if (quoted) {
          variables.quoted = quoted;
        }
      } catch (err) {
        this.logger.warn(
          `Falha ao resolver quoted para envio (conversationId=${conversation.id}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if (quotedPreview) {
      variables.quotedPreview = quotedPreview;
    }
    if (attachment?.url || attachment?.kind) {
      variables.attachment = attachment;
    }
    const conversationMetadata = this.parseConversationMetadata(conversation.metadata);
    const vendasAgendaQueue =
      conversationMetadata?.vendasAgendaQueue &&
      typeof conversationMetadata.vendasAgendaQueue === 'object' &&
      !Array.isArray(conversationMetadata.vendasAgendaQueue)
        ? (conversationMetadata.vendasAgendaQueue as Record<string, unknown>)
        : null;
    const isNeutralConversation =
      this.isConversationPersonalContact(conversationMetadata) ||
      String(conversationMetadata?.queueTarget || conversationMetadata?.routeTarget || '').trim().toLowerCase() === 'conversas' ||
      String((conversation as any)?.routeTarget || '').trim().toLowerCase() === 'conversas';

    const sourceModule = String(opts?.sourceModule || 'atendimento_human').trim().toLowerCase() || 'atendimento_human';
    const outboundPayload: any = {
      conversationId,
      to: toPhone,
      body,
      messageType: 'text',
      sourceModule,
      senderType: 'human',
      contactId: toPhone,
      flowState: {
        humanAssigned: true,
        botActive: false,
        flowResult: null,
      },
    };
    if (Object.keys(variables).length) {
      outboundPayload.variables = variables;
    }
    // PR20072026-CHIP (A2): identidade de quem manda viaja no envio — o
    // queueOutboundForCompany usa isso como fallback quando a conversa está órfã. Só
    // inclui a chave quando há viewer de verdade (não regride payload de chamadores sem user).
    if (viewerId) {
      outboundPayload.senderUserId = viewerId;
    }

    await this.conversations.queueOutboundForCompany(companyId, outboundPayload);

    if (!isNeutralConversation && vendasAgendaQueue?.active) {
      const manualSentAt = new Date().toISOString();
      const currentProspeccao = this.getNestedMetadataRecord(conversationMetadata?.vendasProspeccao);
      const firstOutboundAt = String(currentProspeccao?.firstOutboundAt || manualSentAt);
      const replyDeadlineAt = Number.isFinite(new Date(firstOutboundAt).getTime())
        ? new Date(new Date(firstOutboundAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null;
      await this.conversations.updateConversationState(companyId, conversationId, {
        metadata: {
          ...conversationMetadata,
          vendasAgendaQueue: {
            ...vendasAgendaQueue,
            draftPending: false,
            lastManualSendAt: manualSentAt,
            manualSent: true,
            manualSentAt,
            botEligible: false,
            botEntryPending: true,
            syncedAt: manualSentAt,
          },
          vendasProspeccao: {
            ...(currentProspeccao || {}),
            stage: 'sent_waiting',
            firstOutboundAt,
            replyDeadlineAt,
            mismatchReason: null,
          },
        },
      });
    }

    await this.logInboxEvent({
      companyId,
      event: 'manual_outbound_queued',
      message: `Mensagem manual enfileirada para ${toPhone}`,
      conversationId,
      phone: toPhone,
      messageType: 'text',
      result: 'queued',
      extra: {
        sourceModule,
        hasQuote: !!quotedPreview,
        attachmentKind: attachment?.kind || null,
      },
    });

    return this.getConversationByIdForCompany(companyId, conversationId);
  }

  async uploadConversationMedia(user: any, conversationId: number, file: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    await this.assertCanSendInConversation(user, conversation);
    if (!file || !file.buffer) throw new BadRequestException('Arquivo obrigatorio.');

    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/opus',
      'audio/mp4',
      'audio/x-m4a',
      'audio/webm',
      'audio/wav',
    ];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de arquivo nao suportado. Use imagem, MP4, PDF/DOC/XLS/TXT/CSV ou audio MP3/OGG/M4A/WAV/WEBM.',
      );
    }
    // P1.3: o MIME acima é o DECLARADO pelo cliente — magic bytes barram conteúdo
    // mascarado nos tipos com assinatura estável (ex.: HTML subido como image/png).
    if (!matchesDeclaredMagicBytes(file.mimetype, file.buffer)) {
      throw new BadRequestException('Conteudo do arquivo nao corresponde ao tipo enviado.');
    }

    // P1.3: storage privado (fora do public servido pelo estático), nome UUID
    // (não-enumerável) e extensão derivada do MIME validado, nunca do originalname.
    const uploadDir = getInboxPrivateMediaDir();
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const filename = `${randomUUID()}${inboxUploadExtensionForMime(file.mimetype)}`;
    const filePath = join(uploadDir, filename);
    writeFileSync(filePath, file.buffer);

    return {
      url: buildSignedInboxMediaPath(filename),
      filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  // ---------------------------------------------------------------------------
  // Mensagens rápidas (respostas prontas do Atendimento) — por empresa
  // ---------------------------------------------------------------------------

  async listQuickReplies(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const rows = await this.prisma.atendimentoQuickReply.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({ id: r.id, title: r.title, content: r.content, sortOrder: r.sortOrder }));
  }

  async createQuickReply(user: any, dto: { title?: string; content?: string }) {
    const companyId = this.requireCompanyIdFromUser(user);
    const title = String(dto?.title || '').trim();
    const content = String(dto?.content || '').trim();
    if (!title) throw new BadRequestException('Título obrigatório.');
    if (!content) throw new BadRequestException('Texto da mensagem obrigatório.');
    const last = await this.prisma.atendimentoQuickReply.findFirst({
      where: { companyId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const created = await this.prisma.atendimentoQuickReply.create({
      data: {
        companyId,
        createdByUserId: Number(user?.id || 0) || null,
        title: title.slice(0, 80),
        content: content.slice(0, 1000),
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
    return { id: created.id, title: created.title, content: created.content, sortOrder: created.sortOrder };
  }

  async deleteQuickReply(user: any, id: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const found = await this.prisma.atendimentoQuickReply.findFirst({
      where: { id: String(id || ''), companyId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Mensagem rápida não encontrada.');
    await this.prisma.atendimentoQuickReply.delete({ where: { id: found.id } });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // AtendimentoCustomer helpers
  // ---------------------------------------------------------------------------

  static normalizePhone(raw: string): string {
    return String(raw || '').replace(/\D/g, '').slice(-13);
  }

  private async ensureRecoveryCustomerProfileTx(tx: any, input: {
    companyId: number;
    customerProfileId?: string | null;
    phone: string;
    phoneNormalized: string;
    name?: string | null;
  }) {
    const explicitProfileId = String(input.customerProfileId || '').trim();
    if (explicitProfileId) {
      const explicit = await tx.customerProfile.findFirst({
        where: { id: explicitProfileId, companyId: input.companyId },
      });
      if (explicit) {
        if (String(explicit.status || '').trim().toLowerCase() === 'provisional') {
          return tx.customerProfile.update({
            where: { id: explicit.id },
            data: {
              status: 'active',
              ...(input.name && !explicit.name ? { name: input.name } : {}),
            },
          });
        }
        return explicit;
      }
    }

    const existing = await tx.customerProfile.findFirst({
      where: {
        companyId: input.companyId,
        phoneNormalized: input.phoneNormalized,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (input.name && !existing.name) patch.name = input.name;
      if (String(existing.status || '').trim().toLowerCase() === 'provisional') patch.status = 'active';
      if (Object.keys(patch).length) {
        return tx.customerProfile.update({ where: { id: existing.id }, data: patch });
      }
      return existing;
    }

    try {
      return await tx.customerProfile.create({
        data: {
          companyId: input.companyId,
          phone: input.phone,
          phoneNormalized: input.phoneNormalized,
          name: input.name || null,
          externalSource: 'recovery',
          status: 'active',
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const winner = await tx.customerProfile.findFirst({
        where: {
          companyId: input.companyId,
          phoneNormalized: input.phoneNormalized,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
      if (winner) return winner;
      throw error;
    }
  }

  private async upsertRecoveryDebtCaseTx(tx: any, input: {
    companyId: number;
    customerProfileId: string;
    amount: number;
    dueDate?: Date | null;
    rawPayloadJson?: string | null;
  }) {
    const existing = await tx.debtCase.findFirst({
      where: {
        companyId: input.companyId,
        customerProfileId: input.customerProfileId,
        sourceProvider: 'HBX_RECOVERY',
        status: 'open',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (existing) {
      return tx.debtCase.update({
        where: { id: existing.id },
        data: {
          amount: input.amount,
          dueDate: input.dueDate ?? null,
          paidAt: null,
          status: 'open',
          rawPayloadJson: input.rawPayloadJson ?? existing.rawPayloadJson ?? null,
        },
      });
    }

    return tx.debtCase.create({
      data: {
        companyId: input.companyId,
        customerProfileId: input.customerProfileId,
        sourceProvider: 'HBX_RECOVERY',
        amount: input.amount,
        dueDate: input.dueDate ?? null,
        status: 'open',
        rawPayloadJson: input.rawPayloadJson ?? null,
      },
    });
  }

  private buildCustomerRecord(row: any, recoveryData?: any) {
    return {
      id: String(row.id),
      companyId: Number(row.companyId),
      name: row.name ? String(row.name) : null,
      phone: String(row.phone),
      phoneNormalized: String(row.phoneNormalized),
      registrationOrigin: String(row.registrationOrigin || 'whatsapp_bot'),
      registrationStatus: String(row.registrationStatus || 'pending_confirmation'),
      route: String(row.route || 'atendimento'),
      notes: row.notes ? String(row.notes) : null,
      lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt).toISOString() : null,
      conversationId: row.conversationId ? Number(row.conversationId) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // Recovery enrichment (null when not in recovery)
      recoveryCustomerId: recoveryData?.id ?? null,
      openAmount: recoveryData?.openAmount ?? null,
      recoveryStatus: recoveryData?.status ?? null,
      recoveryRiskScore:
        recoveryData?.paymentHistoryScore === undefined ||
        recoveryData?.paymentHistoryScore === null
          ? null
          : Number(recoveryData.paymentHistoryScore),
      recoveryTotalPaid: Number(recoveryData?.totalPaid || 0),
      recoveryAutomationEnabled:
        recoveryData?.automationEnabled === undefined || recoveryData?.automationEnabled === null
          ? null
          : Boolean(recoveryData.automationEnabled),
    };
  }

  /**
   * Upsert de cliente do Atendimento com base no telefone normalizado (usado pelo bot e webhook).
   */
  async upsertAtendimentoCustomer(input: {
    companyId: number;
    phone: string;
    name?: string | null;
    registrationOrigin?: string;
    registrationStatus?: string;
    conversationId?: number | null;
    lastMessageAt?: Date | null;
  }) {
    const row = await this.cadastrosService.upsertCustomerRegistry({
      ...input,
      route: 'atendimento',
    });
    return row ? this.cadastrosService.getCustomerRegistryByPhone(input.companyId, input.phone) : null;
  }

  async listAtendimentoCustomers(user: any, phoneFilter?: string) {
    return this.cadastrosService.listCustomerRegistry(this.requireCompanyIdFromUser(user), phoneFilter);
  }

  async promoteToRecovery(
    user: any,
    customerId: string,
    dto: { openAmount: number; saleDate?: string | null; companyName?: string | null },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const result = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.atendimentoCustomer.findFirst({
        where: { id: customerId, companyId },
      });
      if (!customer) throw new NotFoundException('Cliente nao encontrado.');

      const phoneNormalized = String(customer.phoneNormalized || '').trim();
      if (!phoneNormalized) throw new BadRequestException('Cliente sem telefone normalizado para promover ao Recovery.');

      const saleDate = dto.saleDate ? new Date(dto.saleDate) : null;
      const saleDay = saleDate ? saleDate.getDate() : new Date().getDate();
      const rawPhone = String(customer.phone || '').trim();
      const waNumber = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
      const displayName = String(customer.name || rawPhone).trim() || rawPhone;
      const companyName = String(dto.companyName || '').trim() || displayName;
      const profile = await this.ensureRecoveryCustomerProfileTx(tx, {
        companyId,
        customerProfileId: customer.customerProfileId ? String(customer.customerProfileId) : null,
        phone: rawPhone,
        phoneNormalized,
        name: displayName,
      });

      const debtCase = await this.upsertRecoveryDebtCaseTx(tx, {
        companyId,
        customerProfileId: String(profile.id),
        amount: Number(dto.openAmount),
        dueDate: saleDate,
        rawPayloadJson: JSON.stringify({
          source: 'inbox.promoteToRecovery',
          atendimentoCustomerId: String(customer.id),
          saleDate: saleDate ? saleDate.toISOString() : null,
          companyName,
        }),
      });

      const tail9 = phoneNormalized.slice(-9);
      const existingRec = await tx.hbxRecoveryCustomer.findFirst({
        where: {
          companyId,
          OR: [
            { customerProfileId: String(profile.id) },
            { whatsappNumber: { endsWith: tail9 } },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });

      const recoveryCustomer = existingRec
        ? await tx.hbxRecoveryCustomer.update({
            where: { id: existingRec.id },
            data: {
              customerProfileId: String(profile.id),
              name: companyName,
              clientName: displayName,
              whatsappNumber: waNumber,
              openAmount: Number(dto.openAmount),
              workdaySaleDay: saleDay,
              status: 'OVERDUE',
              automationEnabled: true,
            },
          })
        : await tx.hbxRecoveryCustomer.create({
            data: {
              companyId,
              customerProfileId: String(profile.id),
              name: companyName,
              clientName: displayName,
              whatsappNumber: waNumber,
              openAmount: Number(dto.openAmount),
              workdaySaleDay: saleDay,
              status: 'OVERDUE',
            },
          });

      await tx.atendimentoCustomer.update({
        where: { id: String(customer.id) },
        data: {
          customerProfileId: String(profile.id),
          route: 'recovery',
          updatedAt: new Date(),
        },
      });

      return {
        recoveryCustomerId: String(recoveryCustomer.id),
        debtCaseId: String(debtCase.id),
        customerProfileId: String(profile.id),
        waNumber,
        displayName,
        companyName,
        customerCreatedAt: customer.createdAt,
      };
    });

    await this.cadastrosService
      .syncCustomerRegistryFromRecovery?.(companyId, {
        whatsappNumber: result.waNumber,
        clientName: result.displayName,
        name: result.companyName,
        updatedAt: new Date(),
        createdAt: result.customerCreatedAt,
      })
      ?.catch(() => undefined);

    return {
      ok: true,
      recoveryCustomerId: result.recoveryCustomerId,
      debtCaseId: result.debtCaseId,
      customerProfileId: result.customerProfileId,
    };
  }

  async createAtendimentoCustomer(user: any, dto: { phone: string; name?: string; route?: string; notes?: string }) {
    return this.cadastrosService.createCustomerRegistry(this.requireCompanyIdFromUser(user), dto);
  }

  async updateAtendimentoCustomer(user: any, customerId: string, dto: { name?: string; route?: string; notes?: string; registrationStatus?: string }) {
    return this.cadastrosService.updateCustomerRegistry(this.requireCompanyIdFromUser(user), customerId, dto);
  }

  async getAtendimentoCustomerByPhone(user: any, phone: string) {
    return this.cadastrosService.getCustomerRegistryByPhone(this.requireCompanyIdFromUser(user), phone);
  }
}
