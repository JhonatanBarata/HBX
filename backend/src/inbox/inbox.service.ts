import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialPlansService } from '../commercial-plans/commercial-plans.service';
import { ConversationsService } from '../messaging/conversations.service';
import { WhatsAppAuditService } from '../messaging/whatsapp-audit.service';
import {
  DEFAULT_RECOVERY_BOT_CONFIG,
  normalizeRecoveryBotConfig,
  RECOVERY_BOT_CONFIG_CHANNEL,
  RECOVERY_BOT_CONFIG_TITLE,
  type RecoveryRoutingRules,
} from '../hbx-recovery/recovery-bot-config';
import { buildStructuredWhatsAppLog, normalizeWhatsAppPhone } from '../messaging/whatsapp-channel';
import {
  ATENDIMENTO_AGENDA_CONFIG_CHANNEL,
  ATENDIMENTO_AGENDA_CONFIG_TITLE,
  ATENDIMENTO_BOT_CONFIG_CHANNEL,
  ATENDIMENTO_BOT_CONFIG_TITLE,
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
import {
  WebwhatsBridgeService,
  WebwhatsConversationSyncResult,
  WebwhatsFetchedMessage,
  WebwhatsLiveChatSnapshot,
  WebwhatsLiveConversationSnapshot,
  WebwhatsProviderError,
} from '../messaging/webwhats-bridge.service';
import { InboxRealtimeService } from '../messaging/inbox-realtime.service';
import { resolveBackendPublicAssetPath } from '../public-assets';
import type { Request, Response } from 'express';

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
  mode: 'current' | 'all';
  providerHealth?: WhatsAppProviderHealth | null;
};

const METICULOUS_TRASH_DEFAULT_DELAY_MS = 120000;
const METICULOUS_TRASH_MIN_PRODUCTION_DELAY_MS = 120000;
const METICULOUS_TRASH_DEFAULT_JITTER_MIN_MS = 5000;
const METICULOUS_TRASH_DEFAULT_JITTER_MAX_MS = 20000;
const METICULOUS_TRASH_NOTE_MARKER = 'SEM INTERESSE / NEGATIVO';

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private readonly backgroundInboxSyncAt = new Map<number | string, number>();
  private readonly fullMirrorJobs = new Map<number, Promise<unknown>>();
  private readonly meticulousTrashTimers = new Map<string, NodeJS.Timeout>();
  private readonly serviceStartedAt = new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly whatsappAudit: WhatsAppAuditService,
    private readonly cadastrosService: CadastrosService,
    private readonly customerProfileService: CustomerProfileService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
    private readonly inboxRealtime: InboxRealtimeService,
    private readonly commercialPlansService: CommercialPlansService,
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

  private assertAdministrativeAction(user: any) {
    const role = String(user?.role || '').trim().toUpperCase();
    if (Boolean(user?.isSystemMaster) || role === 'ADMIN') return;
    throw new ForbiddenException({
      code: 'USER_ADMIN_ACTION_NOT_ALLOWED',
      message: 'USER não pode executar esta ação administrativa. Contate seu ADMIN ou o suporte da empresa.',
    });
  }

  private assertSystemMasterAction(user: any) {
    if (Boolean(user?.isSystemMaster)) return;
    throw new ForbiddenException('Somente o suporte HBX pode executar esta ação.');
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
        res.write(': keepalive\n\n');
      } catch {
        // ignore write failures; close handler will clean up
      }
    }, 25000);

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

  private async syncPersistedInboxIndex(
    companyId: number,
    opts?: {
      take?: string | number | null;
    },
  ) {
    try {
      const requestedTake = Number(opts?.take);
      const limit =
        Number.isFinite(requestedTake) && requestedTake > 0
          ? Math.max(50, Math.min(Math.floor(requestedTake), 120))
          : 120;
      await this.webwhatsBridge.syncRecentChats(companyId, {
        limit,
        failOnError: false,
      });
      return null;
    } catch (error: any) {
      const message = String(error?.message || error || 'Falha ao sincronizar indice do WhatsApp.');
      this.logger.warn(
        `Inbox syncPersistedInboxIndex falhou company=${companyId}: ${message}`,
      );
      return message;
    }
  }

  private triggerBackgroundInboxIndexSync(companyId: number, opts?: { take?: string | number | null }) {
    const key = `index:${companyId}`;
    const lastRunAt = Number(this.backgroundInboxSyncAt.get(key) || 0);
    if (Date.now() - lastRunAt < 30000) return;
    this.backgroundInboxSyncAt.set(key, Date.now());
    void this.syncPersistedInboxIndex(companyId, opts).catch((error: any) => {
      const message = String(error?.message || error || 'Falha ao atualizar indice da Inbox em background.');
      this.logger.warn(`Inbox background index sync falhou company=${companyId}: ${message}`);
    });
  }

  private async syncPersistedInboxConversation(companyId: number, conversationId: number) {
    try {
      await this.webwhatsBridge.syncConversationMessagesDetailed(companyId, conversationId, {
        limit: 20,
        fullSync: true,
        maxPages: 1,
        force: false,
      });
      return null;
    } catch (error: any) {
      const message = String(error?.message || error || 'Falha ao sincronizar conversa do WhatsApp.');
      this.logger.warn(
        `Inbox syncPersistedInboxConversation falhou company=${companyId} conversation=${conversationId}: ${message}`,
      );
      return message;
    }
  }

  private async syncLatestInboxConversationWindow(companyId: number, conversationId: number) {
    const key = `conversation-latest:${companyId}:${conversationId}`;
    const lastRunAt = Number(this.backgroundInboxSyncAt.get(key) || 0);
    if (Date.now() - lastRunAt < 8000) return null;
    this.backgroundInboxSyncAt.set(key, Date.now());
    try {
      await this.webwhatsBridge.syncConversationMessagesDetailed(companyId, conversationId, {
        limit: 20,
        fullSync: false,
        maxPages: 1,
        force: true,
      });
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
    if (Boolean(user?.isSystemMaster)) return;
    const role = String(user?.role || '').trim().toUpperCase();
    if (role === 'ADMIN') return;
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

  private async ensureWebwhatsSessionFromCompany(company: any) {
    const modalStatus = String(company?.whatsappModalStatus || '').trim().toUpperCase();
    const sessionAvailable = modalStatus === 'CONNECTED' || modalStatus === 'RECONNECTING';
    if (!sessionAvailable) return null;
    const current = company?.currentWhatsappConnectionSession;
    if (
      current &&
      String(current.provider || '').trim().toLowerCase() === 'webwhats' &&
      String(current.status || '').trim().toLowerCase() === 'active' &&
      String(current.tenantKey || '').trim() === `company-${Number(company.id)}`
    ) {
      return current;
    }

    const tenantKey = `company-${Number(company.id)}`;
    const existingActiveSession = await this.prisma.whatsAppConnectionSession.findFirst({
      where: {
        companyId: Number(company.id),
        provider: 'webwhats',
        tenantKey,
        status: 'active',
      },
      orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const phoneNormalized = this.normalizeConnectionPhone(company?.whatsappModalPhone);
    const displayPhone = String(company?.whatsappModalPhone || '').trim() || null;
    const now = new Date();
    let session = existingActiveSession;
    if (session?.id) {
      const data: any = {
        tenantKey,
        status: 'active',
        connectedAt: company.whatsappModalConnectedAt || now,
        disconnectedAt: null,
        metadataJson: JSON.stringify({
          source: 'inbox_session_repair',
          recordedAt: now.toISOString(),
        }),
      };
      if (phoneNormalized) data.phoneNormalized = phoneNormalized;
      if (displayPhone) data.displayPhone = displayPhone;
      session = await this.prisma.whatsAppConnectionSession.update({
        where: { id: String(session.id) },
        data,
      });
    } else {
      session = await this.prisma.whatsAppConnectionSession.create({
        data: {
          companyId: Number(company.id),
          provider: 'webwhats',
          tenantKey,
          phoneNormalized: phoneNormalized || null,
          displayPhone,
          status: 'active',
          connectedAt: company.whatsappModalConnectedAt || now,
          metadataJson: JSON.stringify({
            source: 'inbox_session_repair',
            recordedAt: now.toISOString(),
          }),
        },
      });
    }
    await this.prisma.whatsAppConnectionSession.updateMany({
      where: {
        companyId: Number(company.id),
        provider: 'webwhats',
        status: 'active',
        NOT: { id: String(session.id) },
      },
      data: { status: 'disconnected', disconnectedAt: now },
    });
    if (String(company.currentWhatsappConnectionSessionId || '') !== String(session.id)) {
      await this.prisma.company.update({
        where: { id: Number(company.id) },
        data: { currentWhatsappConnectionSessionId: String(session.id) },
      });
    }
    return session;
  }

  private async resolveInboxWhatsappSessionScope(companyId: number): Promise<InboxWhatsappSessionScope> {
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
    const currentSession = company ? await this.ensureWebwhatsSessionFromCompany(company) : null;
    const metaActive = String(company?.whatsappStatus || '').trim().toUpperCase() === 'CONNECTED';
    const modalStatus = String(company?.whatsappModalStatus || '').trim().toUpperCase();
    const modalSessionAvailable = modalStatus === 'CONNECTED' || modalStatus === 'RECONNECTING';
    const accessible = Boolean(currentSession?.id || modalSessionAvailable || metaActive);
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
      mode: currentSession?.id ? 'current' : 'all',
    };
  }

  private assertInboxWhatsappAccessible(scope: InboxWhatsappSessionScope) {
    if (scope.accessible) return;
    throw new ServiceUnavailableException('Atendimento indisponível sem WhatsApp/celular vinculado.');
  }

  private isRowVisibleForWhatsappSessionScope(row: any, scope: InboxWhatsappSessionScope) {
    if (!scope.accessible) return false;
    if (scope.mode === 'all') return true;
    const rowSessionId = row?.whatsappConnectionSessionId ? String(row.whatsappConnectionSessionId) : null;
    return Boolean(scope.currentSessionId) && rowSessionId === scope.currentSessionId;
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
    };
  }

  private async buildWhatsappSessionCleanupState(companyId: number, scope: InboxWhatsappSessionScope) {
    if (!scope.currentSessionId) {
      return {
        required: false,
        currentSessionId: null,
        oldSessionCount: 0,
        oldConversationCount: 0,
        oldMessageCount: 0,
        latestOldSession: null,
      };
    }
    const oldSessions = await this.prisma.whatsAppConnectionSession.findMany({
      where: {
        companyId,
        provider: 'webwhats',
        NOT: { id: String(scope.currentSessionId) },
      },
      orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        phoneNormalized: true,
        displayPhone: true,
        status: true,
        connectedAt: true,
        disconnectedAt: true,
        createdAt: true,
      },
    });
    const oldSessionIds = oldSessions.map((session) => String(session.id));
    if (!oldSessionIds.length) {
      return {
        required: false,
        currentSessionId: String(scope.currentSessionId),
        oldSessionCount: 0,
        oldConversationCount: 0,
        oldMessageCount: 0,
        latestOldSession: null,
      };
    }
    const [oldConversationCount, oldMessageCount] = await Promise.all([
      this.prisma.companyConversation.count({
        where: { companyId, whatsappConnectionSessionId: { in: oldSessionIds } },
      }),
      this.prisma.companyMessage.count({
        where: { companyId, whatsappConnectionSessionId: { in: oldSessionIds } },
      }),
    ]);
    const latest = oldSessions[0] || null;
    return {
      required: oldConversationCount > 0 || oldMessageCount > 0,
      currentSessionId: String(scope.currentSessionId),
      oldSessionCount: oldSessions.length,
      oldConversationCount,
      oldMessageCount,
      latestOldSession: latest
        ? {
            id: String(latest.id),
            phoneNormalized: latest.phoneNormalized || null,
            displayPhone: latest.displayPhone || null,
            status: latest.status || null,
            connectedAt: latest.connectedAt || null,
            disconnectedAt: latest.disconnectedAt || null,
            createdAt: latest.createdAt || null,
          }
        : null,
    };
  }

  async getWhatsappSessionDiagnostics(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId);
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
      whatsappSessionCleanup: await this.buildWhatsappSessionCleanupState(companyId, sessionScope),
    };
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

  private async findCurrentSessionConversationForMerge(
    client: any,
    companyId: number,
    currentSessionId: string,
    staleConversation: any,
  ) {
    const aliases = this.buildWhatsappSessionConversationAliases(staleConversation);
    const phoneSuffixes = aliases.contacts
      .map((contact) => contact.replace(/\D/g, ''))
      .filter((digits) => digits.length >= 10);
    const or: any[] = [
      ...aliases.contacts.map((contact) => ({ contact })),
      ...phoneSuffixes.map((digits) => ({ contact: { endsWith: digits } })),
      ...aliases.metadataTokens.map((token) => ({ metadata: { contains: token } })),
    ];
    if (!or.length) return null;
    return client.companyConversation.findFirst({
      where: {
        companyId,
        channel: 'whatsapp',
        whatsappConnectionSessionId: currentSessionId,
        OR: or,
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true },
    });
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
    const diskPath = resolveBackendPublicAssetPath(localPath);
    if (!diskPath || !existsSync(diskPath)) return null;
    return localPath;
  }

  private normalizeStoredMediaAssetUrl(value: unknown) {
    const normalized = this.normalizeMessageMetadataText(value);
    if (!normalized) return null;
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
    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(companyId);
    if (!row?.template) {
      return sanitizeAtendimentoBotConfigForTenant(DEFAULT_ATENDIMENTO_BOT_CONFIG, tenantContext);
    }
    try {
      return sanitizeAtendimentoBotConfigForTenant(
        normalizeAtendimentoBotConfig(JSON.parse(row.template)),
        tenantContext,
      );
    } catch {
      return sanitizeAtendimentoBotConfigForTenant(DEFAULT_ATENDIMENTO_BOT_CONFIG, tenantContext);
    }
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
      },
    });
    const recoveryModule = this.prisma.companyModule?.findFirst
      ? await this.prisma.companyModule.findFirst({
          where: {
            companyId,
            enabled: true,
            systemModule: { key: 'hbx_recovery' },
          },
          select: { id: true },
        })
      : null;
    return {
      providerCapabilities: resolveProviderCapabilitiesFromCompany(company),
      recoveryEnabled:
        Boolean(recoveryModule?.id) ||
        String(company?.trialModuleSelection || '').trim().toLowerCase() === 'recovery',
    };
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

    this.logger.log(`[inbox-classifier] conversationId=${conversation?.id || '-'} queue=${routeTarget}`);
    this.logger.log(`[inbox-classifier] reason=${routeReason}`);

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
    const customerName =
      manualLockedName ||
      this.normalizeDisplayNameCandidate(displayName || null, conversation.contact) ||
      this.normalizeDisplayNameCandidate(identityRow?.name || null, conversation.contact) ||
      this.normalizeDisplayNameCandidate(profile?.name || null, conversation.contact) ||
      null;
    return {
      id: String(conversation.id),
      contact: String(conversation.contact || '').trim() || null,
      status: this.toInboxStatus(conversation),
      assignedTo: conversation.humanAssigned ? 'humano' : null,
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
        avatarUrl:
          hasConflictingWhatsappIdentity
            ? null
            : String(
                conversationMetadata.whatsappAvatarUrl ||
                conversationMetadata.profilePicUrl ||
                conversationMetadata.avatarUrl ||
                '',
              ).trim() || null,
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

  private buildLiveConversationMetadata(
    stateMetadata: Record<string, any>,
    snapshot: WebwhatsLiveChatSnapshot | WebwhatsLiveConversationSnapshot,
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
      ...(snapshot.avatarUrl ? { whatsappAvatarUrl: snapshot.avatarUrl } : {}),
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
    const mergedMetadata = this.buildLiveConversationMetadata(stateMetadata, snapshot);
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
  ) {
    try {
      return await this.webwhatsBridge.listLiveChats(companyId, {
        limit: opts?.limit,
      });
    } catch (error) {
      throw this.mapInboxProviderReadError(error, 'Falha ao carregar conversas do WhatsApp.');
    }
  }

  private async loadLiveConversationForCompany(
    companyId: number,
    conversationId: number,
    opts?: {
      limit?: number;
    },
  ) {
    try {
      const conversation = await this.webwhatsBridge.getLiveConversation(companyId, {
        conversationId,
        limit: opts?.limit,
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }
      return conversation;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw this.mapInboxProviderReadError(error, 'Falha ao carregar conversa do WhatsApp.');
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

  private async resolveLiveConversationActionTarget(
    companyId: number,
    conversationId: number,
    messageId: number,
  ) {
    const liveConversation = await this.loadLiveConversationForCompany(companyId, conversationId, {
      limit: 200,
    });
    const stateMetadata = this.getStateConversationMetadata(liveConversation.conversation.metadata);
    const messages = this.buildLiveConversationMessages(liveConversation.messages, stateMetadata);
    const target = messages.find((message) => Number(message.id) === Number(messageId));
    if (!target) {
      throw new NotFoundException('Message not found');
    }

    return {
      liveConversation,
      target,
      rawPayload: this.parseConversationMetadata(target.rawPayload),
    };
  }

  private async ensureConversation(companyId: number, id: number) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id, companyId, channel: 'whatsapp' },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
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
    return summaries;
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
    this.assertInboxWhatsappAccessible(sessionScope);
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
    options?: { messagesLimit?: number; sessionScope?: InboxWhatsappSessionScope },
  ) {
    const messagesLimit = this.normalizeMessagePageLimit(options?.messagesLimit, 20);
    const sessionScope = options?.sessionScope || await this.resolveInboxWhatsappSessionScope(companyId);
    this.assertInboxWhatsappAccessible(sessionScope);
    const sessionWhere =
      sessionScope.mode === 'current'
        ? { whatsappConnectionSessionId: sessionScope.currentSessionId }
        : {};
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

  async getBootstrap(user: any, take?: string | number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId);
    sessionScope.providerHealth = await this.getWhatsAppProviderHealth(companyId);
    if (!sessionScope.accessible) {
      return {
        conversations: [],
        selectedConversation: null,
        providerWarning: {
          code: 'WHATSAPP_REQUIRED',
          message: 'Atendimento indisponível sem WhatsApp/celular vinculado.',
        },
        whatsappSession: this.buildWhatsappSessionMetadata(sessionScope),
        whatsappSessionCleanup: await this.buildWhatsappSessionCleanupState(companyId, sessionScope),
      };
    }
    if (sessionScope.mode === 'current') {
      this.triggerBackgroundInboxIndexSync(companyId, { take });
    }
    const conversations = await this.listPersistedConversationSummariesForCompany(companyId, {
      take: this.normalizeConversationTakeLimit(take, 200),
      sessionScope,
    });

    const firstConversationId = conversations[0]?.id ? Number(conversations[0].id) : null;
    let selectedConversation: any = null;

    if (firstConversationId) {
      this.triggerBackgroundInboxConversationSync(companyId, firstConversationId);
      selectedConversation = await this.getPersistedConversationByIdForCompany(companyId, firstConversationId, {
        messagesLimit: 20,
        sessionScope,
      });
    }

    return {
      conversations,
      selectedConversation,
      providerWarning: null,
      whatsappSession: this.buildWhatsappSessionMetadata(sessionScope),
      whatsappSessionCleanup: await this.buildWhatsappSessionCleanupState(companyId, sessionScope),
    };
  }

  async bootstrapFullMirror(user: any, take?: string | number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const takeLimit = Math.max(1, Math.min(Number(this.normalizeConversationTakeLimit(take, 120) || 120), 120));

    return this.runBootstrapFullMirror(companyId, takeLimit);
  }

  async bootstrapFullMirrorBackground(user: any, take?: string | number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const takeLimit = Math.max(1, Math.min(Number(this.normalizeConversationTakeLimit(take, 120) || 120), 120));
    const currentJob = this.fullMirrorJobs.get(companyId);

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

    const job = this.runBootstrapFullMirror(companyId, takeLimit)
      .catch((error: any) => {
        const message = String(error?.message || error || 'Falha ao espelhar Inbox em background.');
        this.logger.error(`Inbox bootstrap background falhou company=${companyId}: ${message}`);
      })
      .finally(() => {
        this.fullMirrorJobs.delete(companyId);
      });

    this.fullMirrorJobs.set(companyId, job);

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

  private async runBootstrapFullMirror(companyId: number, takeLimit: number) {
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId);
    this.assertInboxWhatsappAccessible(sessionScope);
    if (sessionScope.mode !== 'current' || !sessionScope.currentSessionId) {
      throw new ServiceUnavailableException('WhatsApp sem sessão ativa');
    }
    this.logger.log(
      `Inbox bootstrap inicial iniciado company=${companyId} limit=${takeLimit}.`,
    );

    try {
      const contacts = await this.webwhatsBridge.listContacts(companyId, {
        force: true,
        failOnError: true,
      });
      this.logger.log(
        `Inbox bootstrap contatos sincronizados company=${companyId} count=${contacts.length}.`,
      );

      const chatsSynced = await this.webwhatsBridge.syncRecentChats(companyId, {
        force: true,
        limit: takeLimit,
        failOnError: true,
      });
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
            const result = await this.webwhatsBridge.syncConversationMessagesDetailed(
              companyId,
              conversation.id,
              {
                force: true,
                limit: 120,
                fullSync: true,
                maxPages: 80,
                downloadMedia: false,
                failOnError: true,
              },
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

      if (failures.length) {
        const failurePreview = failures
          .slice(0, 5)
          .map((item) => `${item.id}:${item.message}`)
          .join(' | ');
        this.logger.error(
          `Inbox bootstrap falhou company=${companyId} failed=${failures.length} details=${failurePreview}`,
        );
        throw new ServiceUnavailableException(
          'Falha ao espelhar nomes, fotos, historico e midias do WhatsApp. Tente novamente com o motor online.',
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

  async listConversations(
    user: any,
    options?: {
      take?: string | number | null;
      skip?: string | number | null;
      queue?: string | null;
    },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId);
    this.assertInboxWhatsappAccessible(sessionScope);
    if (
      String(sessionScope.reason || '') === 'webwhats_status_only' &&
      !sessionScope.currentSessionId
    ) {
      throw new ServiceUnavailableException(
        'WhatsApp consta como conectado, mas a sessão operacional do Atendimento não foi criada. Revalide a conexão.',
      );
    }
    if (sessionScope.mode === 'current') {
      this.triggerBackgroundInboxIndexSync(companyId, { take: options?.take });
    }
    return this.listPersistedConversationSummariesForCompany(companyId, {
      ...options,
      sessionScope,
    });
  }

  async startConversation(user: any, input: { phone?: string; name?: string | null }) {
    const companyId = this.requireCompanyIdFromUser(user);
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId);
    this.assertInboxWhatsappAccessible(sessionScope);
    const normalized = this.normalizeManualConversationContact(input?.phone);
    if (!normalized) {
      throw new BadRequestException('Informe um telefone valido com DDD.');
    }
    const now = new Date();
    const displayName = String(input?.name || '').replace(/\s+/g, ' ').trim();
    const metadata = {
      sourceModule: 'atendimento_manual',
      queueTarget: 'conversas',
      routeTarget: 'conversas',
      whatsappRemoteJid: normalized.remoteJid,
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
    const candidates = Array.from(new Set([
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
          { metadata: { contains: normalized.remoteJid } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    if (conversation) {
      const previousMetadata = this.parseConversationMetadata(conversation.metadata);
      conversation = await this.prisma.companyConversation.update({
        where: { id: conversation.id },
        data: {
          contact: normalized.contact,
          metadata: JSON.stringify({ ...previousMetadata, ...metadata }),
          currentFlow: 'cobranca_recovery',
          currentStep: 'novo',
          flowResult: null,
          botActive: false,
          humanAssigned: true,
          assignedUserId: Number(user?.id || 0) || null,
          lastInteractionAt: now,
          ...(sessionScope.currentSessionId ? { whatsappConnectionSessionId: sessionScope.currentSessionId } : {}),
        },
      });
    } else {
      conversation = await this.prisma.companyConversation.create({
        data: {
          companyId,
          channel: 'whatsapp',
          contact: normalized.contact,
          currentFlow: 'cobranca_recovery',
          currentStep: 'novo',
          flowResult: null,
          botActive: false,
          humanAssigned: true,
          assignedUserId: Number(user?.id || 0) || null,
          lastInteractionAt: now,
          lastMessageAt: now,
          metadata: JSON.stringify(metadata),
          ...(sessionScope.currentSessionId ? { whatsappConnectionSessionId: sessionScope.currentSessionId } : {}),
        },
      });
    }

    await this.logInboxEvent({
      companyId,
      event: 'manual_conversation_started',
      message: 'Conversa manual iniciada pelo Atendimento.',
      conversationId: conversation.id,
      phone: normalized.contact,
      result: 'created',
      extra: {
        whatsappCommandSent: false,
        remoteJid: normalized.remoteJid,
      },
    });

    return this.getPersistedConversationByIdForCompany(companyId, conversation.id, {
      messagesLimit: 20,
      sessionScope,
    });
  }

  private async getConversationByIdForCompany(companyId: number, id: number) {
    return this.getPersistedConversationByIdForCompany(companyId, id);
  }

  async getConversationById(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId);
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
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId);
    this.assertInboxWhatsappAccessible(sessionScope);
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
      segment: true,
      status: true,
      nextAction: true,
      returnAt: true,
      shortNote: true,
      lastContactAt: true,
      attemptCount: true,
      lastResult: true,
      wasClosedBefore: true,
      closedAt: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
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

  private async resolveStatusCardRecords(companyId: number, conversationId: number) {
    const conversation = await this.ensureConversation(companyId, conversationId);
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
            status: String(lead.status || 'novo'),
            statusLabel: this.formatInboxVendasStatusLabel(lead.status),
            nextAction: lead.nextAction || null,
            returnAt: lead.returnAt instanceof Date ? lead.returnAt.toISOString() : lead.returnAt ? new Date(lead.returnAt).toISOString() : null,
            attemptCount: Number(lead.attemptCount || 0),
            timesSeen: Number(lead.timesSeen || 0),
            sourceType: lead.sourceType || null,
            address: lead.address || null,
            website: lead.website || null,
            rating: lead.rating == null ? null : Number(lead.rating),
            reviews: Math.max(0, Math.trunc(Number(lead.reviews || 0) || 0)),
            shortNote: lead.shortNote || null,
            lastContactAt: lead.lastContactAt instanceof Date ? lead.lastContactAt.toISOString() : null,
            updatedAt: lead.updatedAt instanceof Date ? lead.updatedAt.toISOString() : null,
          }
        : null,
      history,
    };
  }

  async getConversationStatusCard(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const records = await this.resolveStatusCardRecords(companyId, conversationId);
    return this.buildStatusCardPayload(records);
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
        createdByUserId: input.userId,
      },
      select: this.vendasLeadStatusCardSelectWithoutAddress(),
    });
  }

  async updateConversationStatusCard(
    user: any,
    conversationId: number,
    dto: { doNotCall?: boolean; returnAt?: string | null; observations?: string | null },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const records = await this.resolveStatusCardRecords(companyId, conversationId);
    const observations =
      dto.observations === undefined ? undefined : String(dto.observations || '').trim();
    const returnAt = dto.returnAt === undefined ? undefined : this.parseStatusCardDate(dto.returnAt);
    const doNotCall = dto.doNotCall === undefined ? undefined : Boolean(dto.doNotCall);
    const now = new Date();

    if (doNotCall !== undefined) {
      await this.customerProfileService.upsertAtendimentoProfileState({
        companyId,
        phone: `+${records.phoneNormalized}`,
        botOff: doNotCall,
        botOffReason: doNotCall ? 'Não ligar mais' : null,
        botOffAt: doNotCall ? now : null,
      } as any);
    }

    const profilePatch: any = {};
    if (observations !== undefined) profilePatch.notes = observations || null;
    if (Object.keys(profilePatch).length) {
      records.profile = await this.prisma.customerProfile.update({
        where: { id: records.profile.id },
        data: profilePatch,
      });
      if (records.atendimentoCustomer?.id) {
        records.atendimentoCustomer = await this.prisma.atendimentoCustomer.update({
          where: { id: records.atendimentoCustomer.id },
          data: { notes: observations || null },
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
      });

      const events: any[] = [];
      if (doNotCall !== undefined) {
        events.push({
          leadId: lead.id,
          eventType: 'status_preference',
          title: doNotCall ? 'Não ligar mais' : 'Contato liberado',
          description: doNotCall
            ? 'Cliente marcado para nao receber novas ligacoes ou automacoes.'
            : 'Preferencia de nao ligar removida pelo Atendimento.',
          resultLabel: doNotCall ? 'Não ligar mais' : 'Liberado',
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

    const refreshed = await this.resolveStatusCardRecords(companyId, conversationId);
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
    }
    await this.conversations.updateConversationState(companyId, conversationId, conversationStatePatch);

    return this.getConversationStatusCard(user, conversationId);
  }

  async getBotConfig(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    await this.commercialPlansService.assertBotAiEntitlementForCompany(companyId);
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
    await this.commercialPlansService.assertBotAiEntitlementForCompany(companyId);
    const requested = normalizeAtendimentoBotConfig(payload || {});
    if (requested.routingRules.globalBotEnabled) {
      await this.commercialPlansService.assertAssistedSetupCompleteForCompany(companyId);
    }
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
    this.assertCanManageAgenda(user);
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

  async bulkSetBotActive(user: any, dto: { ids?: number[]; enabled?: boolean }) {
    const companyId = this.requireCompanyIdFromUser(user);
    if (dto?.enabled !== false) {
      await this.commercialPlansService.assertBotAiEntitlementForCompany(companyId);
      await this.commercialPlansService.assertAssistedSetupCompleteForCompany(companyId);
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

  async updateConversationQueue(user: any, id: number, queueRaw?: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, id);
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
    const conversation = await this.ensureConversation(companyId, conversationId);
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
      await this.webwhatsBridge.updateBlockStatus(companyId, {
        conversationId: conversation.id,
        to: String(conversation.contact || ''),
        status: 'block',
      });
      await this.webwhatsBridge.archiveChat(companyId, {
        conversationId: conversation.id,
        archive: true,
      });
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

  async unblockConversation(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
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
      await this.webwhatsBridge.updateBlockStatus(companyId, {
        conversationId: conversation.id,
        to: String(conversation.contact || ''),
        status: 'unblock',
      });
      await this.webwhatsBridge.archiveChat(companyId, {
        conversationId: conversation.id,
        archive: false,
      });
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

  private buildWhatsappResetPhoneVariants(...values: unknown[]) {
    const variants = new Set<string>();
    for (const value of values) {
      const digits = this.normalizeConnectionPhone(value);
      if (!digits) continue;
      variants.add(digits);
      variants.add(`+${digits}`);
      if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        const withoutCountry = digits.slice(2);
        variants.add(withoutCountry);
        variants.add(`+${withoutCountry}`);
      } else if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
        variants.add(`55${digits}`);
        variants.add(`+55${digits}`);
      }
    }
    return Array.from(variants);
  }

  async cleanupOldWhatsappSessions(user: any, modeRaw?: string | null) {
    this.assertAdministrativeAction(user);
    const companyId = this.requireCompanyIdFromUser(user);
    const mode = String(modeRaw || '').trim().toLowerCase();
    if (!['merge', 'discard'].includes(mode)) {
      throw new BadRequestException('Informe se deseja mesclar ou descartar sessões antigas.');
    }
    const sessionScope = await this.resolveInboxWhatsappSessionScope(companyId);
    this.assertInboxWhatsappAccessible(sessionScope);
    if (!sessionScope.currentSessionId) {
      throw new BadRequestException('Sessão atual do WhatsApp não encontrada.');
    }
    const currentSessionId = String(sessionScope.currentSessionId);
    const oldSessions = await this.prisma.whatsAppConnectionSession.findMany({
      where: {
        companyId,
        provider: 'webwhats',
        NOT: { id: currentSessionId },
      },
      orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, phoneNormalized: true, displayPhone: true, metadataJson: true },
    });
    const oldSessionIds = oldSessions.map((session) => String(session.id));
    if (!oldSessionIds.length && mode === 'merge') {
      return {
        success: true,
        mode,
        merged: 0,
        deletedConversations: 0,
        deletedMessages: 0,
        deletedSessions: 0,
        message: 'Nenhuma sessão antiga encontrada.',
      };
    }

    const oldConversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        whatsappConnectionSessionId: { in: oldSessionIds },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        contact: true,
        metadata: true,
        whatsappConnectionSessionId: true,
        lastMessageAt: true,
        lastInteractionAt: true,
      },
    });
    const recoverableSessionIds = mode === 'merge' ? oldSessionIds.slice(0, 1) : [];
    const discardSessionIds = mode === 'merge' ? oldSessionIds.slice(1) : oldSessionIds;
    const discardCacheSessionIds =
      mode === 'discard'
        ? Array.from(new Set([...discardSessionIds, currentSessionId]))
        : discardSessionIds;
    const currentSession = sessionScope.currentSession || {};
    const resetPhoneCandidates =
      mode === 'discard'
        ? this.buildWhatsappResetPhoneVariants(
            currentSession.phoneNormalized,
            currentSession.displayPhone,
            ...(oldSessions.flatMap((session) => [session.phoneNormalized, session.displayPhone])),
          )
        : [];
    const recoverableConversations = oldConversations.filter((conversation) =>
      recoverableSessionIds.includes(String(conversation.whatsappConnectionSessionId || '')),
    );
    const discardConversations = oldConversations.filter((conversation) =>
      discardSessionIds.includes(String(conversation.whatsappConnectionSessionId || '')),
    );

    let merged = 0;
    let deletedConversations = 0;
    let deletedMessages = 0;
    let deletedAtendimentoCustomers = 0;
    let deletedVendasLeads = 0;
    let resetCustomerProfiles = 0;
    let deletedCustomerProfiles = 0;
    const resetAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (mode === 'merge') {
        for (const stale of recoverableConversations) {
          const target = await this.findCurrentSessionConversationForMerge(tx, companyId, currentSessionId, stale);
          if (target?.id && Number(target.id) !== Number(stale.id)) {
            const messages = await tx.companyMessage.findMany({
              where: { companyId, conversationId: stale.id },
              select: { id: true },
              orderBy: [{ id: 'asc' }],
            });
            for (const message of messages) {
              await tx.companyMessage.update({
                where: { id: message.id },
                data: {
                  conversationId: Number(target.id),
                  whatsappConnectionSessionId: currentSessionId,
                },
              });
              merged += 1;
            }
            await tx.atendimentoAppointment.updateMany({
              where: { companyId, conversationId: stale.id },
              data: { conversationId: Number(target.id) },
            });
            await tx.companyConversation.delete({ where: { id: stale.id } });
            deletedConversations += 1;
            continue;
          }

          await tx.companyConversation.update({
            where: { id: stale.id },
            data: {
              whatsappConnectionSessionId: currentSessionId,
              metadata: JSON.stringify({
                ...this.parseConversationMetadata(stale.metadata),
                whatsappSessionMergedFrom: stale.whatsappConnectionSessionId || null,
                whatsappSessionMergedAt: new Date().toISOString(),
              }),
            },
          });
          await tx.companyMessage.updateMany({
            where: { companyId, conversationId: stale.id },
            data: { whatsappConnectionSessionId: currentSessionId },
          });
          merged += 1;
        }
      }

      const conversationsToDiscard =
        mode === 'merge'
          ? discardConversations
          : await tx.companyConversation.findMany({
              where: {
                companyId,
                channel: 'whatsapp',
                OR: [
                  ...(discardCacheSessionIds.length
                    ? [{ whatsappConnectionSessionId: { in: discardCacheSessionIds } }]
                    : []),
                  ...(resetPhoneCandidates.length
                    ? [
                        { contact: { in: resetPhoneCandidates } },
                        { sourcePhoneNormalized: { in: resetPhoneCandidates } },
                      ]
                    : []),
                ],
              },
              select: { id: true, whatsappConnectionSessionId: true, contact: true },
            });
      const sessionIdsToDiscard = discardCacheSessionIds;
      if (sessionIdsToDiscard.length || conversationsToDiscard.length || resetPhoneCandidates.length) {
        const messages = await tx.companyMessage.findMany({
          where: {
            companyId,
            OR: [
              ...(sessionIdsToDiscard.length ? [{ whatsappConnectionSessionId: { in: sessionIdsToDiscard } }] : []),
              ...(conversationsToDiscard.length
                ? [{ conversationId: { in: conversationsToDiscard.map((conversation) => Number(conversation.id)) } }]
                : []),
              ...(resetPhoneCandidates.length
                ? [
                    { contactId: { in: resetPhoneCandidates } },
                    { sourcePhoneNormalized: { in: resetPhoneCandidates } },
                  ]
                : []),
            ],
          },
          select: { id: true },
          orderBy: [{ id: 'asc' }],
        });
        for (const message of messages) {
          await tx.companyMessage.delete({ where: { id: message.id } });
          deletedMessages += 1;
        }
        await tx.atendimentoAppointment.updateMany({
          where: { companyId, conversationId: { in: conversationsToDiscard.map((conversation) => Number(conversation.id)) } },
          data: { conversationId: null },
        });
        for (const conversation of conversationsToDiscard) {
          await tx.companyConversation.delete({ where: { id: conversation.id } });
          deletedConversations += 1;
        }
      }

      if (mode === 'discard' && resetPhoneCandidates.length) {
        const atendimentoDeleted = await tx.atendimentoCustomer.deleteMany({
          where: { companyId, phoneNormalized: { in: resetPhoneCandidates } },
        });
        deletedAtendimentoCustomers = atendimentoDeleted.count;

        const vendasDeleted = await tx.vendasLead.deleteMany({
          where: {
            companyId,
            OR: [
              { phoneNormalized: { in: resetPhoneCandidates } },
              { phone: { in: resetPhoneCandidates } },
            ],
          },
        });
        deletedVendasLeads = vendasDeleted.count;

        const profileReset = await tx.customerProfile.updateMany({
          where: { companyId, phoneNormalized: { in: resetPhoneCandidates } },
          data: {
            botOff: false,
            botOffReason: null,
            botOffAt: null,
            notes: null,
            firstInboundAt: null,
            lastInboundAt: null,
          },
        });
        resetCustomerProfiles = profileReset.count;

        const profileDeleted = await tx.customerProfile.deleteMany({
          where: {
            companyId,
            phoneNormalized: { in: resetPhoneCandidates },
            atendimentoCustomers: { none: {} },
            hbxRecoveryCustomers: { none: {} },
            debtCases: { none: {} },
            vendasLeads: { none: {} },
          },
        });
        deletedCustomerProfiles = profileDeleted.count;
      }

      await tx.companyMessage.updateMany({
        where: { companyId, whatsappConnectionSessionId: { in: oldSessionIds } },
        data: { whatsappConnectionSessionId: null },
      });
      await tx.whatsAppConnectionSession.deleteMany({
        where: {
          companyId,
          id: { in: oldSessionIds },
        },
      });
      const currentSession = await tx.whatsAppConnectionSession.findFirst({
        where: { companyId, id: currentSessionId },
        select: { metadataJson: true },
      });
      const currentSessionMetadata = this.parseConversationMetadata(currentSession?.metadataJson);
      if (mode === 'discard') {
        for (const key of Object.keys(currentSessionMetadata)) {
          delete currentSessionMetadata[key];
        }
      }
      await tx.whatsAppConnectionSession.update({
        where: { id: currentSessionId },
        data: {
          metadataJson: JSON.stringify({
            ...currentSessionMetadata,
            ...(mode === 'merge'
              ? {
                  inboxResetAt: resetAt.toISOString(),
                  webwhatsResetAt: resetAt.toISOString(),
                }
              : {}),
            popup2CleanupMode: mode,
            popup2CleanupAt: resetAt.toISOString(),
          }),
        },
      });
    });

    await this.logInboxEvent({
      companyId,
      event: 'whatsapp_old_sessions_cleaned',
      message: mode === 'merge'
        ? 'Sessões antigas do WhatsApp foram mescladas na sessão atual e removidas.'
        : 'Sessões antigas do WhatsApp foram descartadas do HBX.',
      result: mode,
      extra: {
        currentSessionId,
        oldSessionIds,
        recoverableSessionIds,
        discardSessionIds,
        discardCacheSessionIds,
        resetPhoneCandidates,
        merged,
        deletedConversations,
        deletedMessages,
        deletedAtendimentoCustomers,
        deletedVendasLeads,
        resetCustomerProfiles,
        deletedCustomerProfiles,
      },
    });

    return {
      success: true,
      mode,
      merged,
      deletedConversations,
      deletedMessages,
      deletedSessions: oldSessionIds.length,
      deletedAtendimentoCustomers,
      deletedVendasLeads,
      resetCustomerProfiles,
      deletedCustomerProfiles,
      message: mode === 'merge'
        ? 'Última sessão antiga mesclada na sessão atual. Demais sessões antigas descartadas.'
        : 'Histórico e configurações do número descartados. A conta iniciou do zero para este WhatsApp.',
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
    const conversation = await this.ensureConversation(companyId, conversationId);
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
      this.webwhatsBridge.markMessagesAsRead(companyId, {
        conversationId: conversation.id,
        remoteJid: this.normalizeMessageMetadataText(metadata?.whatsappRemoteJid) || null,
        messages: webwhatsReadMessages as Array<{
          id: string;
          fromMe: boolean;
          remoteJid: string | null;
          participant: string | null;
        }>,
      }).catch((error) => {
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

  async reactToConversationMessage(
    user: any,
    conversationId: number,
    messageId: number,
    reactionRaw: string,
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const { liveConversation, target: message, rawPayload } = await this.resolveLiveConversationActionTarget(
      companyId,
      conversation.id,
      messageId,
    );
    const reaction = this.requireTrimmed(String(reactionRaw || ''), 'reaction');
    const remoteJid =
      this.normalizeMessageMetadataText(rawPayload?.key?.remoteJid) ||
      this.normalizeMessageMetadataText(this.parseConversationMetadata(liveConversation.conversation.metadata)?.whatsappRemoteJid) ||
      this.normalizeMessageMetadataText(liveConversation.remoteJid) ||
      String(liveConversation.contact || conversation.contact || '');
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
    });
    return this.getConversationByIdForCompany(companyId, conversation.id);
  }

  async retryConversationMessage(
    user: any,
    conversationId: number,
    messageId: number,
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
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

  async sendMessage(
    user: any,
    conversationId: number,
    content: string,
    opts?: {
      quotedMessageId?: string;
      quotedContent?: string;
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
    if (this.getAtendimentoBlockedState(conversation.metadata).isBlocked) {
      throw new BadRequestException('Conversa bloqueada. Desbloqueie antes de responder.');
    }

    const normalizedContent = this.requireTrimmed(content, 'content');
    const toPhone = this.requireTrimmed(String(conversation.contact || ''), 'customer phone');

    // Build body with optional quote prefix (text-only fallback, WhatsApp style)
    const quotedPreview = opts?.quotedContent
      ? String(opts.quotedContent).trim().slice(0, 200)
      : null;
    const attachment = opts?.attachment
      ? {
          kind: this.normalizeMessageMetadataText(opts.attachment.kind) || undefined,
          url: this.normalizeMessageMetadataText(opts.attachment.url) || undefined,
          previewUrl:
            this.normalizeMessageMetadataText(opts.attachment.previewUrl || opts.attachment.url) ||
            undefined,
          mimeType: this.normalizeMessageMetadataText(opts.attachment.mimeType) || undefined,
          fileName: this.normalizeMessageMetadataText(opts.attachment.fileName) || undefined,
          fileSize: this.normalizeStoredFileSize(opts.attachment.fileSize),
          durationSeconds: this.normalizeStoredFileSize(opts.attachment.durationSeconds),
        }
      : null;
    const body = quotedPreview
      ? `> ${quotedPreview}\n\n${normalizedContent}`
      : normalizedContent;
    const variables: Record<string, unknown> = {};
    if (opts?.quotedMessageId) {
      variables.quotedMessageId = String(opts.quotedMessageId).trim();
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

    const outboundPayload: any = {
      conversationId,
      to: toPhone,
      body,
      messageType: 'text',
      sourceModule: 'atendimento_human',
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
        sourceModule: 'atendimento_human',
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

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'inbox');
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const safeExt = extname(file.originalname || '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 6) || '.bin';
    const filename = `${companyId}_${conversationId}_${Date.now()}${safeExt}`;
    const filePath = join(uploadDir, filename);
    writeFileSync(filePath, file.buffer);

    const publicUrl = `/uploads/inbox/${filename}`;
    return { url: publicUrl, filename, mimeType: file.mimetype, size: file.size };
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
