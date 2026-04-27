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

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private readonly backgroundInboxSyncAt = new Map<number | string, number>();
  private readonly fullMirrorJobs = new Map<number, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly whatsappAudit: WhatsAppAuditService,
    private readonly cadastrosService: CadastrosService,
    private readonly customerProfileService: CustomerProfileService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
    private readonly inboxRealtime: InboxRealtimeService,
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

  private hasPersistedWhatsAppDisplayName(metadataRaw: string | null | undefined) {
    const metadata = this.parseConversationMetadata(metadataRaw);
    return Boolean(
      this.normalizeDisplayNameCandidate(
        metadata?.whatsappContactName ||
          metadata?.waNickname ||
          metadata?.whatsappName ||
          metadata?.whatsappProfileName ||
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
    if (['image', 'video', 'document', 'audio'].includes(attachmentKind)) {
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
        '[interacao recebida]'
      );
    }

    return '[mensagem sincronizada]';
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
              : null;

    const resolvedTextFromPayload = this.extractMessageTextFromPayload(payload, normalizedMessageType);
    const storedBody = String(message?.body || '').trim();
    const resolvedText =
      !storedBody || storedBody.toLowerCase() === '[mensagem sincronizada]'
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
      if (!metadata || metadata.isLocalHidden || metadata.isDeleted) return false;

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
      metadata?.waNickname,
      metadata?.whatsappName,
      metadata?.whatsappProfileName,
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

  private normalizeConversationTakeLimit(value: string | number | null | undefined, fallback?: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(Math.floor(parsed), 200);
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

  private resolveConversationActivityDate(conversation: {
    lastMessageAt?: Date | string | null;
    updatedAt?: Date | string | null;
    messages?: Array<{ timestamp?: Date | string | null }> | null;
  }) {
    const latestMessage = Array.isArray(conversation.messages) ? conversation.messages[0] : null;
    return (
      this.resolveLatestDate(latestMessage?.timestamp)
      || this.resolveLatestDate(conversation.lastMessageAt)
      || this.resolveLatestDate(conversation.updatedAt)
    );
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
    const [company, recoveryModule] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          whatsappConnectionMode: true,
          trialModuleSelection: true,
        },
      }),
      this.prisma.companyModule?.findFirst
        ? this.prisma.companyModule.findFirst({
            where: {
              companyId,
              enabled: true,
              systemModule: { key: 'hbx_recovery' },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
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

    const hasRecoveryDebt = Number(recoveryCustomer?.openAmount || 0) > 0;

    let routeTarget: 'recovery' | 'atendimento' = 'atendimento';
    let routeReason = 'Atendimento manual padrao.';

    if (conversation?.humanAssigned && routingRules.preferInboxForManualQueue) {
      routeTarget = 'atendimento';
      routeReason = 'Cliente aguardando tratativa humana na fila manual.';
    } else if (hasRecoveryDebt && routingRules.preferRecoveryForDebtors) {
      routeTarget = 'recovery';
      routeReason = 'Cliente com debito em aberto e contexto ativo de cobranca.';
    }

    return {
      routeTarget,
      routeReason,
      recoveryCustomerId: hasRecoveryDebt && recoveryCustomer?.id ? String(recoveryCustomer.id) : null,
      recoveryCustomerName: String(
        hasRecoveryDebt ? recoveryCustomer?.clientName || recoveryCustomer?.name || '' : '',
      ).trim() || null,
      recoveryOpenAmount: hasRecoveryDebt ? Number(recoveryCustomer?.openAmount || 0) : 0,
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
    const profile = identityRow?.customerProfile || null;
    const manualLockedName =
      String(identityRow?.registrationOrigin || '').trim().toLowerCase() === 'manual' ||
      String(identityRow?.registrationStatus || '').trim().toLowerCase() === 'manual'
        ? this.normalizeDisplayNameCandidate(identityRow?.name || null, conversation.contact)
        : null;
    const customerName =
      this.normalizeDisplayNameCandidate(
        manualLockedName || identityRow?.name || profile?.name || displayName || null,
        conversation.contact,
      ) || null;
    return {
      id: String(conversation.id),
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
      lastMessageAt: conversation?.lastMessageAt || null,
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
        phone: String(identityRow?.phone || conversation.contact || ''),
        name: customerName,
        avatarUrl:
          String(
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
          if (messageMetadata?.isLocalHidden) return null;
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
    const metadata: Record<string, any> = {
      ...stateMetadata,
      whatsappRemoteJid: snapshot.remoteJid,
      ...(snapshot.remoteJidAlt ? { whatsappRemoteJidAlt: snapshot.remoteJidAlt } : {}),
      ...(snapshot.displayName
        ? {
            whatsappName: snapshot.displayName,
            waNickname: snapshot.displayName,
            whatsappProfileName: snapshot.displayName,
            whatsappContactName: snapshot.displayName,
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
          body: deletedState ? '[mensagem apagada]' : '[mensagem sincronizada]',
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
      data: { lastInteractionAt: now, lastMessageAt: now },
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
    const identityMap = await this.loadAtendimentoIdentityMap(
      companyId,
      liveChats.map((row) => String(row.contact || '')),
    );
    const sharedMap = await this.loadSharedProfileMap(
      companyId,
      liveChats.map((row) => String(row.contact || '')),
      identityMap,
    );
    return Promise.all(
      liveChats.map((row) => {
        const conversation = this.buildConversationReadModel(row);
        const phoneNormalized = this.normalizeConversationPhone(String(conversation.contact || '')) || '';
        const identityRow = identityMap.get(phoneNormalized);
        const sharedProfile = identityRow?.customerProfileId
          ? sharedMap.byProfileId.get(String(identityRow.customerProfileId)) ?? null
          : sharedMap.byPhoneNormalized.get(phoneNormalized) ?? null;
        return this.mapConversation(
          companyId,
          conversation,
          routingRules,
          identityRow,
          sharedProfile,
        );
      }),
    );
  }

  private async listPersistedConversationSummariesForCompany(
    companyId: number,
    options?: { take?: string | number | null },
  ) {
    const take = this.normalizeConversationTakeLimit(options?.take, 200) || 200;
    const rows = await this.prisma.companyConversation.findMany({
      where: { companyId, channel: 'whatsapp' },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        contact: true,
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
          orderBy: { timestamp: 'desc' },
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
            providerMessageId: true,
            rawPayload: true,
            variablesJson: true,
          },
        },
      },
    });

    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const identityMap = await this.loadAtendimentoIdentityMap(
      companyId,
      rows.map((row) => String(row.contact || '')),
    );
    const sharedMap = await this.loadSharedProfileMap(
      companyId,
      rows.map((row) => String(row.contact || '')),
      identityMap,
    );

    await Promise.all(
      rows
        .map((row) => ({ row, activityAt: this.resolveConversationActivityDate(row) }))
        .filter(({ row, activityAt }) => {
          if (!activityAt) return false;
          if (!row.lastMessageAt) return true;
          return activityAt.getTime() > new Date(row.lastMessageAt).getTime();
        })
        .map(({ row, activityAt }) =>
          this.repairConversationActivityIfStale(companyId, row.id, activityAt),
        ),
    );

    const visibleRows = rows.filter((row) => {
      const metadata = this.parseConversationMetadata(row.metadata);
      return !this.parseBooleanMetadataFlag(metadata.whatsappConversationDeleted || metadata.inboxWhatsAppDeleted);
    });

    const sortedRows = [...visibleRows].sort((left, right) => {
      const leftTime = this.resolveConversationActivityDate(left)?.getTime() || 0;
      const rightTime = this.resolveConversationActivityDate(right)?.getTime() || 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return Number(right.id || 0) - Number(left.id || 0);
    });

    return Promise.all(
      sortedRows.map((row) => {
        const activityAt = this.resolveConversationActivityDate(row);
        const conversation = {
          ...row,
          updatedAt: activityAt || row.updatedAt,
          lastMessageAt: activityAt || row.lastMessageAt || null,
          messages: [...(row.messages || [])].reverse(),
        };
        const phoneNormalized = this.normalizeConversationPhone(String(conversation.contact || '')) || '';
        const identityRow = identityMap.get(phoneNormalized);
        const sharedProfile = identityRow?.customerProfileId
          ? sharedMap.byProfileId.get(String(identityRow.customerProfileId)) ?? null
          : sharedMap.byPhoneNormalized.get(phoneNormalized) ?? null;
        return this.mapConversation(
          companyId,
          conversation,
          routingRules,
          identityRow,
          sharedProfile,
        );
      }),
    );
  }

  private async getPersistedConversationByIdForCompany(companyId: number, id: number, options?: { messagesLimit?: number }) {
    const messagesLimit = this.normalizeMessagePageLimit(options?.messagesLimit, 20);
    const loadRow = () => this.prisma.companyConversation.findFirst({
      where: { companyId, id, channel: 'whatsapp' },
      select: {
        id: true,
        contact: true,
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
    const identityMap = await this.loadAtendimentoIdentityMap(companyId, [String(row.contact || '')]);
    const phoneNormalized = this.normalizeConversationPhone(String(row.contact || '')) || '';
    const identityRow = identityMap.get(phoneNormalized);
    const sharedMap = await this.loadSharedProfileMap(companyId, [String(row.contact || '')], identityMap);
    const activityAt = this.resolveConversationActivityDate(row);
    await this.repairConversationActivityIfStale(companyId, row.id, activityAt);

    return this.mapConversation(
      companyId,
      {
        ...row,
        updatedAt: activityAt || row.updatedAt,
        lastMessageAt: activityAt || row.lastMessageAt || null,
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
    this.triggerBackgroundInboxIndexSync(companyId, { take });
    const conversations = await this.listPersistedConversationSummariesForCompany(companyId, {
      take: this.normalizeConversationTakeLimit(take, 200),
    });

    const firstConversationId = conversations[0]?.id ? Number(conversations[0].id) : null;
    let selectedConversation: any = null;

    if (firstConversationId) {
      this.triggerBackgroundInboxConversationSync(companyId, firstConversationId);
      selectedConversation = await this.getPersistedConversationByIdForCompany(companyId, firstConversationId, {
        messagesLimit: 20,
      });
    }

    return {
      conversations,
      selectedConversation,
      providerWarning: null,
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
        const chunkResults = await Promise.all(
          chunk.map(async (conversation) => {
            try {
              const result = await this.webwhatsBridge.syncConversationMessagesDetailed(
                companyId,
                conversation.id,
                {
                  force: true,
                  limit: 120,
                  fullSync: true,
                  maxPages: 80,
                  failOnError: true,
                },
              );
              return {
                ok: true as const,
                conversationId: conversation.id,
                result,
              };
            } catch (error: any) {
              return {
                ok: false as const,
                conversationId: conversation.id,
                message: String(
                  error?.message || error || 'Falha ao sincronizar conversa do WhatsApp.',
                ),
              };
            }
          }),
        );

        for (const chunkResult of chunkResults) {
          if (!chunkResult.ok) {
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

  async listConversations(user: any, take?: string | number) {
    const companyId = this.requireCompanyIdFromUser(user);
    this.triggerBackgroundInboxIndexSync(companyId, { take });
    return this.listPersistedConversationSummariesForCompany(companyId, { take });
  }

  private async getConversationByIdForCompany(companyId: number, id: number) {
    return this.getPersistedConversationByIdForCompany(companyId, id);
  }

  async getConversationById(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    void this.syncLatestInboxConversationWindow(companyId, id);
    return this.getPersistedConversationByIdForCompany(companyId, id, { messagesLimit: 20 });
  }

  async listConversationMessages(
    user: any,
    id: number,
    options?: { limit?: string | number | null; before?: string | null },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const before = this.normalizeBeforeDate(options?.before || null);
    if (!before) {
      void this.syncLatestInboxConversationWindow(companyId, id);
    }
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { companyId, id, channel: 'whatsapp' },
      select: {
        id: true,
        contact: true,
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
        if (messageMetadata?.isLocalHidden) return null;
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
    const tenantContext = await this.resolveAtendimentoBotSanitizationContext(companyId);
    const normalized = sanitizeAtendimentoBotConfigForTenant(
      normalizeAtendimentoBotConfig(payload || {}),
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
    const allowedQueues = new Set(['all', 'groups', 'recovery', 'scheduled', 'bot', 'archived']);
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
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      inboxManualQueueOverride: queue,
      inboxManualQueueOverriddenAt: now,
      ...(queue === 'archived'
        ? {
            inboxLocalDeleted: true,
            inboxLocalDeletedAt: now,
            inboxLocalDeletedByUserId: Number(user?.id || 0) || null,
          }
        : {
            inboxLocalDeleted: false,
            inboxLocalDeletedAt: null,
            inboxLocalDeletedByUserId: null,
          }),
    };

    if (currentQueue) {
      nextMetadata.vendasAgendaQueue =
        queue === 'scheduled'
          ? {
              ...currentQueue,
              active: true,
              manualQueueOverride: null,
              manualQueueOverriddenAt: null,
              syncedAt: now,
            }
          : {
              ...currentQueue,
              active: false,
              draftPending: false,
              botEligible: false,
              botEntryPending: false,
              manualQueueOverride: queue,
              manualQueueOverriddenAt: now,
              deactivatedAt: currentQueue.deactivatedAt || now,
              syncedAt: now,
            };
    }

    await this.conversations.updateConversationState(companyId, id, {
      metadata: nextMetadata,
      ...(queue === 'archived'
        ? {
            botActive: false,
            humanAssigned: false,
            flowResult: 'local_deleted',
          }
        : {}),
    });

    if (queue === 'archived') {
      try {
        await this.customerProfileService.upsertAtendimentoProfileState({
          companyId,
          phone: String(conversation.contact || '').trim(),
          botOff: true,
          botOffReason: 'Conversa enviada para Excluídos no HBX.',
          botOffAt: new Date(),
        } as any);
      } catch (error) {
        await this.logInboxEvent({
          companyId,
          event: 'conversation_queue_profile_sync_failed',
          message: 'Falha ao persistir BOT_OFF no CustomerProfile durante movimentacao para Excluídos.',
          conversationId: id,
          phone: String(conversation.contact || '').trim(),
          result: 'warning',
          extra: {
            error: error instanceof Error ? error.message : 'unknown_error',
          },
        });
      }
    }

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

  async deleteConversation(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const metadata = this.parseConversationMetadata(conversation.metadata);
    const exchangedMessages = await this.prisma.companyMessage.count({
      where: {
        companyId,
        conversationId: conversation.id,
      },
    });
    const currentQueue =
      metadata?.vendasAgendaQueue &&
      typeof metadata.vendasAgendaQueue === 'object' &&
      !Array.isArray(metadata.vendasAgendaQueue)
        ? (metadata.vendasAgendaQueue as Record<string, unknown>)
        : null;
    const now = new Date().toISOString();
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      inboxLocalDeleted: true,
      inboxLocalDeletedAt: now,
      inboxLocalDeletedByUserId: Number(user?.id || 0) || null,
      inboxManualQueueOverride: 'archived',
      inboxManualQueueOverriddenAt: now,
    };

    if (currentQueue) {
      nextMetadata.vendasAgendaQueue = {
        ...currentQueue,
        active: false,
        draftPending: false,
        botEligible: false,
        botEntryPending: false,
        manualQueueOverride: 'archived',
        manualQueueOverriddenAt: now,
        deactivatedAt: currentQueue.deactivatedAt || now,
        syncedAt: now,
      };
    }

    const archivedLeadId = await this.archiveVendasLeadFromConversation({
      companyId,
      userId: Number(user?.id || 0) || null,
      conversation,
      metadata,
      reason:
        exchangedMessages > 0
          ? 'Conversa encerrada no Atendimento e enviada para Excluídos no HBX.'
          : 'Conversa sem mensagens encerrada no Atendimento; card comercial arquivado.',
    });

    if (exchangedMessages === 0) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.companyMessage.deleteMany({
            where: {
              companyId,
              conversationId: conversation.id,
            },
          });
          await tx.companyConversation.delete({
            where: { id: conversation.id },
          });
        });
      } catch (error) {
        await this.logInboxEvent({
          companyId,
          event: 'conversation_empty_physical_delete_failed',
          message: 'Falha ao remover conversa vazia do backend; aplicando arquivamento local.',
          conversationId,
          phone: String(conversation.contact || '').trim(),
          result: 'archive_fallback',
          extra: {
            error: error instanceof Error ? error.message : 'unknown_error',
            archivedLeadId,
          },
        });

        await this.conversations.updateConversationState(companyId, conversation.id, {
          botActive: false,
          humanAssigned: false,
          flowResult: 'local_deleted',
          metadata: {
            ...nextMetadata,
            inboxPhysicalDeleteFailedAt: new Date().toISOString(),
          },
        });

        return {
          success: true,
          id: String(conversation.id),
          message: 'Conversa arquivada em Excluídos e card arquivado em Vendas.',
          deleted: false,
          archivedLeadId,
          localOnly: true,
          fallback: 'archived',
        };
      }

      try {
        await this.customerProfileService.upsertAtendimentoProfileState({
          companyId,
          phone: String(conversation.contact || '').trim(),
          botOff: true,
          botOffReason: 'Conversa sem mensagens removida do Atendimento.',
          botOffAt: new Date(),
        } as any);
      } catch (error) {
        await this.logInboxEvent({
          companyId,
          event: 'conversation_empty_delete_profile_sync_failed',
          message: 'Falha ao persistir BOT_OFF no CustomerProfile durante remocao de conversa vazia.',
          conversationId,
          phone: String(conversation.contact || '').trim(),
          result: 'warning',
          extra: {
            error: error instanceof Error ? error.message : 'unknown_error',
          },
        });
      }

      await this.logInboxEvent({
        companyId,
        event: 'conversation_empty_deleted',
        message: 'Conversa sem mensagens removida do backend e card comercial arquivado.',
        conversationId,
        phone: String(conversation.contact || '').trim(),
        result: 'deleted_empty',
        extra: {
          localOnly: true,
          whatsappCommandSent: false,
          archivedLeadId,
        },
      });

      return {
        success: true,
        id: String(conversation.id),
        message: 'Conversa sem mensagens removida do Atendimento e card arquivado em Vendas.',
        deleted: true,
        archivedLeadId,
        localOnly: true,
      };
    }

    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'local_deleted',
      metadata: nextMetadata,
    });

    try {
      await this.customerProfileService.upsertAtendimentoProfileState({
        companyId,
        phone: String(conversation.contact || '').trim(),
        botOff: true,
        botOffReason: 'Conversa excluida localmente no HBX.',
        botOffAt: new Date(),
      } as any);
    } catch (error) {
      await this.logInboxEvent({
        companyId,
        event: 'conversation_local_delete_profile_sync_failed',
        message: 'Falha ao persistir BOT_OFF no CustomerProfile durante exclusao local.',
        conversationId,
        phone: String(conversation.contact || '').trim(),
        result: 'warning',
        extra: {
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      });
    }

    await this.logInboxEvent({
      companyId,
      event: 'conversation_local_deleted',
      message: 'Conversa enviada para Excluídos apenas no HBX. Nenhum comando foi enviado ao WhatsApp.',
      conversationId,
      phone: String(conversation.contact || '').trim(),
      result: 'local_deleted',
      extra: {
        localOnly: true,
        whatsappCommandSent: false,
        archivedLeadId,
      },
    });
    return {
      success: true,
      id: String(conversation.id),
      message: 'Conversa enviada para Excluídos apenas no HBX.',
      archivedLeadId,
      localOnly: true,
    };
  }

  async deleteConversationFromWhatsApp(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const metadata = this.parseConversationMetadata(conversation.metadata);

    let providerResult: unknown = null;
    try {
      providerResult = await this.webwhatsBridge.deleteChat(companyId, {
        conversationId: conversation.id,
      });
    } catch (error) {
      const providerError = error instanceof WebwhatsProviderError ? error : null;
      const message =
        providerError?.providerMessage ||
        providerError?.message ||
        (error instanceof Error ? error.message : 'Falha ao apagar conversa no WhatsApp.');

      await this.logInboxEvent({
        companyId,
        event: 'conversation_whatsapp_delete_failed',
        message: 'Falha tecnica ao apagar conversa na conta WhatsApp conectada.',
        conversationId: conversation.id,
        phone: String(conversation.contact || '').trim(),
        result: 'failed',
        extra: {
          code: providerError?.code || 'unknown',
          statusCode: providerError?.statusCode || null,
          providerMessage: providerError?.providerMessage || null,
          error: message,
        },
      });

      if (providerError?.statusCode === 400) {
        throw new BadRequestException(message);
      }
      if (providerError?.code === 'WEBWHATS_NOT_CONNECTED') {
        throw new ServiceUnavailableException(message);
      }
      throw new ServiceUnavailableException(message);
    }

    const deletedAt = new Date().toISOString();
    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'whatsapp_deleted',
      metadata: {
        ...metadata,
        whatsappConversationDeleted: true,
        inboxWhatsAppDeleted: true,
        inboxWhatsAppDeletedAt: deletedAt,
        inboxWhatsAppDeletedByUserId: Number(user?.id || 0) || null,
      },
    });

    await this.logInboxEvent({
      companyId,
      event: 'conversation_whatsapp_deleted',
      message: 'Conversa apagada da conta WhatsApp conectada e ocultada no HBX.',
      conversationId: conversation.id,
      phone: String(conversation.contact || '').trim(),
      result: 'deleted',
      extra: {
        providerResult,
      },
    });

    return {
      success: true,
      id: String(conversation.id),
      deleted: true,
      whatsappDeleted: true,
      hidden: true,
      message: 'Conversa apagada da conta WhatsApp conectada.',
    };
  }

  async markConversationAsRead(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const metadata = this.parseConversationMetadata(conversation.metadata);
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

  async deleteConversationMessageLocally(
    user: any,
    conversationId: number,
    messageId: number,
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const { liveConversation, target, rawPayload } = await this.resolveLiveConversationActionTarget(
      companyId,
      conversation.id,
      messageId,
    );
    const currentMetadata = this.getStateConversationMetadata(liveConversation.conversation.metadata);
    const deletedAtIso = new Date().toISOString();
    const hiddenKey =
      this.normalizeMessageMetadataText(target.providerMessageId) || `synthetic:${String(target.id)}`;
    const currentHiddenEntries = Array.isArray(currentMetadata.whatsappLocalHiddenMessages)
      ? currentMetadata.whatsappLocalHiddenMessages.filter(
          (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
        )
      : [];
    const nextHiddenEntries = [
      ...currentHiddenEntries.filter(
        (entry) => this.normalizeMessageMetadataText((entry as Record<string, any>).key) !== hiddenKey,
      ),
      {
        key: hiddenKey,
        hiddenAt: deletedAtIso,
        hiddenByUserId: Number(user?.id || 0) || null,
        originalText:
          this.normalizeMessageMetadataText(this.parseConversationMetadata(target.variablesJson)?.localHiddenOriginalText) ||
          this.normalizeMessageMetadataText(target.body) ||
          this.extractMessageTextFromPayload(
            this.unwrapMessagePayload(rawPayload?.message || rawPayload),
            this.normalizeConversationMessageType(target.messageType, rawPayload, {}),
          ) ||
          null,
        originalMessageType:
          this.normalizeMessageMetadataText(
            this.parseConversationMetadata(target.variablesJson)?.localHiddenOriginalMessageType,
          ) || this.normalizeMessageMetadataText(target.messageType) || null,
      },
    ].slice(-500);

    await this.prisma.companyConversation.update({
      where: { id: conversation.id },
      data: {
        metadata: JSON.stringify({
          ...currentMetadata,
          whatsappLocalHiddenMessages: nextHiddenEntries,
        }),
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
    const providerKeyId = this.normalizeMessageMetadataText(rawPayload?.key?.id);
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

  async deleteConversationMessageForEveryone(
    user: any,
    conversationId: number,
    messageId: number,
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const { liveConversation, target: message, rawPayload } = await this.resolveLiveConversationActionTarget(
      companyId,
      conversation.id,
      messageId,
    );
    if (String(message.direction || '').trim().toUpperCase() !== 'OUTBOUND') {
      throw new BadRequestException('Apenas mensagens enviadas podem ser apagadas para todos.');
    }

    const remoteJid =
      this.normalizeMessageMetadataText(rawPayload?.key?.remoteJid) ||
      this.normalizeMessageMetadataText(this.parseConversationMetadata(liveConversation.conversation.metadata)?.whatsappRemoteJid) ||
      this.normalizeMessageMetadataText(liveConversation.remoteJid) ||
      String(liveConversation.contact || conversation.contact || '');
    const providerKeyId = this.normalizeMessageMetadataText(rawPayload?.key?.id);
    if (!providerKeyId) {
      throw new BadRequestException('Mensagem ainda nao possui chave valida para exclusao no WhatsApp.');
    }

    await this.webwhatsBridge.deleteMessageForEveryone(companyId, {
      conversationId: conversation.id,
      remoteJid,
      messageId: providerKeyId,
      fromMe:
        rawPayload?.key?.fromMe === undefined || rawPayload?.key?.fromMe === null
          ? true
          : Boolean(rawPayload?.key?.fromMe),
      participant: this.normalizeMessageMetadataText(rawPayload?.key?.participant),
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

    const conversationMetadata = this.parseConversationMetadata(conversation.metadata);
    const vendasAgendaQueue =
      conversationMetadata?.vendasAgendaQueue &&
      typeof conversationMetadata.vendasAgendaQueue === 'object' &&
      !Array.isArray(conversationMetadata.vendasAgendaQueue)
        ? (conversationMetadata.vendasAgendaQueue as Record<string, unknown>)
        : null;
    if (vendasAgendaQueue?.active) {
      const manualSentAt = new Date().toISOString();
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
