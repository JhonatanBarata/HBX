import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, Method } from 'axios';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { getBackendPublicUploadDir } from '../public-assets';
// P1.3: mídia do inbox mora em storage privado; fallback público do bridge sai assinado.
import {
  extractInboxMediaFilename,
  getInboxMediaFileCandidates,
  getInboxPrivateMediaDir,
  signInboxMediaUrlIfLocal,
} from '../uploads/inbox-media.util';
import { buildWhatsAppPhoneCandidates, normalizeWhatsAppPhone } from './whatsapp-channel';
import { isModalSendReady } from './whatsapp-connection-state';
import { ZapCheckGuardService } from './zap-check-guard.service';

type WebwhatsMediaType = 'image' | 'video' | 'document' | 'audio' | 'sticker';

// BRIDGE DO "RESPONDER CITANDO" (02-QUOTED-BRIDGE): formato que o motor (fork Evolution) espera
// no `quoted` de sendText/sendMedia — key.id e obrigatorio no schema
// (Webwhats/src/validate/message.schema.ts), remoteJid/fromMe/participant opcionais; message e
// o WAMessage.message original (ou um fallback textual quando a original nao for localizavel).
export type WebwhatsQuotedInput = {
  key: {
    id: string;
    remoteJid?: string;
    fromMe?: boolean;
    participant?: string;
  };
  message: Record<string, unknown>;
};

type WebwhatsConfig = {
  enabled: boolean;
  configured: boolean;
  available: boolean;
  internalUrl: string | null;
  apiKey: string | null;
  timeoutMs: number;
};

type WebwhatsRequestOptions = {
  method: Method;
  path: string;
  purpose: string;
  data?: unknown;
  treatNotFoundAsNull?: boolean;
  /**
   * Override do timeout default (`config.timeoutMs`) SÓ para esta chamada. Usado pelo
   * envio com presence "composing" embutido (`sendText` com `delay`), cujo `delay` já
   * é bloqueante dentro do motor — sem isso o axios estouraria antes do motor terminar
   * de digitar+enviar. Nunca reduz o timeout abaixo do default.
   */
  timeoutOverrideMs?: number;
};

type ResolvedWebwhatsMediaAttachment = {
  kind: WebwhatsMediaType;
  url: string;
  previewUrl: string;
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
  durationSeconds: number | null;
  isVoiceNote: boolean;
};

type WebwhatsProviderErrorCode =
  | 'WEBWHATS_NOT_CONFIGURED'
  | 'WEBWHATS_NOT_CONNECTED'
  | 'WEBWHATS_TIMEOUT'
  | 'WEBWHATS_UNAVAILABLE'
  | 'WEBWHATS_HTTP_ERROR';

export type WebwhatsConversationStateRow = {
  id: number;
  contact: string;
  whatsappConnectionSessionId?: string | null;
  sourcePhoneNormalized?: string | null;
  sourceTenantKey?: string | null;
  metadata: string | null;
  currentFlow: string | null;
  currentStep: string | null;
  flowResult: string | null;
  botActive: boolean | null;
  humanAssigned: boolean | null;
  assignedUserId: number | null;
  lastMessageAt?: Date | null;
  lastInteractionAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type WebwhatsConnectionSessionContext = {
  id: string;
  tenantKey: string;
  phoneNormalized: string | null;
  displayPhone: string | null;
  metadataJson?: string | null;
};

// POR USUÁRIO (18/06): quem está agindo. A ponte resolve a SESSÃO (e o tenantKey do motor) a
// partir disto, nunca do status da empresa. sessionId = sessão da conversa; tenantKey =
// instanceName cru do webhook (`company-{id}-user-{n}`); userId = ação de um vendedor/admin.
export type WebwhatsSessionSelector = {
  userId?: number | null;
  sessionId?: string | null;
  tenantKey?: string | null;
};

export class WebwhatsProviderError extends Error {
  constructor(
    readonly code: WebwhatsProviderErrorCode,
    message: string,
    readonly statusCode?: number,
    readonly providerResponse?: unknown,
    readonly providerMessage?: string | null,
  ) {
    super(message);
    this.name = 'WebwhatsProviderError';
  }
}

type WebwhatsChatSummary = {
  remoteJid: string;
  pushName?: string | null;
  name?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  shortName?: string | null;
  notifyName?: string | null;
  verifiedName?: string | null;
  businessName?: string | null;
  contact?: {
    name?: string | null;
    pushName?: string | null;
    shortName?: string | null;
    fullName?: string | null;
    notifyName?: string | null;
    displayName?: string | null;
    formattedName?: string | null;
    verifiedName?: string | null;
    businessName?: string | null;
  } | null;
  profilePicUrl?: string | null;
  updatedAt?: string | Date | null;
  unreadCount?: number | null;
  windowActive?: boolean | null;
  lastMessage?: any;
  lastMessageId?: string | null;
  lastMessageTextPreview?: string | null;
  lastMessageType?: string | null;
  lastMessageTimestamp?: number | string | null;
  fromMe?: boolean | null;
  archived?: boolean | null;
};

type WebwhatsFastChatListResult = {
  records: WebwhatsChatSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  source: 'fast' | 'legacy';
};

type WebwhatsPresenceValue = 'online' | 'offline' | 'composing' | 'recording' | 'paused' | 'unknown';

export type WebwhatsPresenceSnapshot = {
  remoteJid: string;
  presence: WebwhatsPresenceValue;
  online: boolean;
  typing: boolean;
  recording: boolean;
  lastSeenAt: string | null;
  updatedAt: string | null;
};

type WebwhatsContactSummary = {
  remoteJid: string;
  pushName?: string | null;
  name?: string | null;
  displayName?: string | null;
  formattedName?: string | null;
  fullName?: string | null;
  shortName?: string | null;
  notifyName?: string | null;
  verifiedName?: string | null;
  businessName?: string | null;
  profilePicUrl?: string | null;
  isSaved?: boolean | null;
  type?: string | null;
};

export type WebwhatsFetchedMessage = {
  id?: string | null;
  key?: {
    id?: string | null;
    fromMe?: boolean | null;
    remoteJid?: string | null;
    remoteJidAlt?: string | null;
    addressingMode?: string | null;
    participant?: string | null;
  };
  pushName?: string | null;
  messageType?: string | null;
  message?: Record<string, any> | null;
  messageTimestamp?: number | string | null;
  status?: string | null;
  MessageUpdate?: Array<{ status?: string | null }> | null;
};

export type WebwhatsNormalizedIncomingKind = 'text' | 'media' | 'interactive_received' | 'unknown';

export type WebwhatsNormalizedIncomingMessage = {
  text: string;
  kind: WebwhatsNormalizedIncomingKind;
  metadata: Record<string, any>;
};

export type WebwhatsLiveChatSnapshot = {
  conversation: WebwhatsConversationStateRow;
  remoteJid: string;
  remoteJidAlt: string | null;
  contact: string;
  displayName: string | null;
  agendaDisplayName?: string | null;
  profileDisplayName?: string | null;
  avatarUrl: string | null;
  unreadCount: number;
  archived: boolean | null;
  windowActive: boolean | null;
  lastMessageAt: Date | null;
  lastMessage: WebwhatsFetchedMessage | null;
  presence?: WebwhatsPresenceSnapshot | null;
};

export type WebwhatsLiveConversationSnapshot = WebwhatsLiveChatSnapshot & {
  messages: WebwhatsFetchedMessage[];
};

export type WebwhatsConversationSyncResult = {
  syncedMessages: number;
  mediaMessages: number;
  pagesFetched: number;
  remoteJids: string[];
  avatarUrl: string | null;
  displayName: string | null;
  agendaDisplayName?: string | null;
  profileDisplayName?: string | null;
};

export type WebwhatsWhatsappNumberCheckResult = {
  input: string;
  normalizedNumber: string;
  exists: boolean;
  remoteJid: string | null;
  raw: unknown;
};

type WebwhatsInboundRelayInput = {
  companyId: number;
  conversationId: number;
  companyMessageId: number;
  customerPhone: string;
  text: string;
  timestamp: Date;
  rawPayload: unknown;
  externalMessageId: string | null;
  inboundType: string;
  contactName?: string | null;
};

@Injectable()
export class WebwhatsBridgeService {
  private readonly logger = new Logger(WebwhatsBridgeService.name);
  // POR USUÁRIO: caches/throttles que podem vazar entre números são chaveados por tenantKey
  // (`company-{id}-user-{n}`), NÃO por companyId — senão o contato/chat de um vendedor aparece
  // pro outro. detailSyncAt é por conversa (já isolada por sessão), segue por companyId:conversa.
  private readonly listSyncAt = new Map<string, number>();
  private readonly detailSyncAt = new Map<string, number>();
  private readonly contactSyncAt = new Map<string, number>();
  private readonly contactCache = new Map<string, WebwhatsContactSummary[]>();
  private readonly chatListCache = new Map<string, { expiresAt: number; value: WebwhatsFastChatListResult }>();
  private readonly presenceCache = new Map<string, { expiresAt: number; value: WebwhatsPresenceSnapshot }>();
  private inboundRelay: ((input: WebwhatsInboundRelayInput) => Promise<void>) | null = null;
  // Concorrência do cache de avatar em background (Fix 1, PR05072026): a LISTA de conversas
  // é hot path com N chats — nunca esperamos download aqui. Isso só limita quantos downloads
  // de foto rodam "soltos" ao mesmo tempo (evita rajada no motor/disco); a resposta da lista
  // já saiu antes de qualquer um destes terminar.
  private readonly avatarBackgroundInFlight = new Set<string>();
  private static readonly AVATAR_BACKGROUND_MAX_CONCURRENCY = 3;

  constructor(private readonly prisma: PrismaService) {}

  async syncRecentChats(
    companyId: number,
    opts?: { force?: boolean; limit?: number; failOnError?: boolean },
    selector?: WebwhatsSessionSelector,
  ) {
    const session = await this.resolveCurrentWebwhatsSession(companyId, selector);
    if (!session) {
      if (opts?.failOnError) {
        throw new WebwhatsProviderError(
          'WEBWHATS_NOT_CONNECTED',
          'WhatsApp sem sessão ativa',
        );
      }
      return 0;
    }
    if (!opts?.force && this.isThrottled(this.listSyncAt, session.tenantKey, 15000)) return 0;

    try {
      const [chats, contacts] = await Promise.all([
        this.fetchChats(companyId, opts?.limit ?? 60, session.tenantKey),
        this.getCachedContacts(companyId, session.tenantKey),
      ]);
      const contactsByJid = this.indexContactsByJid(contacts);
      let synced = 0;
      for (const chat of chats) {
        if (!this.isSyncableChat(chat?.remoteJid)) continue;
        const remoteJidAlt = this.getChatRemoteJidAlt(chat);
        const conversation = await this.upsertConversationFromChat(
          companyId,
          session,
          chat,
          contactsByJid.get(String(chat.remoteJid || '').trim()) || null,
          remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
        );
        if (!conversation?.id) continue;
        synced += 1;
      }
      this.listSyncAt.set(session.tenantKey, Date.now());
      this.logger.log(`Webwhats chats sincronizados para company ${companyId} (${session.tenantKey}): ${synced}.`);
      return synced;
    } catch (error: any) {
      const message = String(error?.message || error || 'Falha ao sincronizar chats recentes do WebWhats.');
      this.logger.warn(
        `Webwhats syncRecentChats falhou para company ${companyId}: ${message}`,
      );
      if (opts?.failOnError) {
        throw this.asWebwhatsProviderError(error)
          || new WebwhatsProviderError(
            'WEBWHATS_UNAVAILABLE',
            `Falha ao sincronizar chats recentes do WebWhats: ${message}`,
          );
      }
      return 0;
    }
  }

  async syncConversationMessages(
    companyId: number,
    conversationId: number,
    opts?: { force?: boolean; limit?: number },
    selector?: WebwhatsSessionSelector,
  ) {
    const result = await this.syncConversationMessagesDetailed(companyId, conversationId, opts, selector);
    return result.syncedMessages;
  }

  async syncConversationMessagesDetailed(
    companyId: number,
    conversationId: number,
    opts?: {
      force?: boolean;
      limit?: number;
      fullSync?: boolean;
      maxPages?: number;
      failOnError?: boolean;
      downloadMedia?: boolean;
    },
    selector?: WebwhatsSessionSelector,
  ): Promise<WebwhatsConversationSyncResult> {
    const session = await this.resolveCurrentWebwhatsSession(companyId, selector);
    if (!session) {
      if (opts?.failOnError) {
        throw new WebwhatsProviderError(
          'WEBWHATS_NOT_CONNECTED',
          'WhatsApp sem sessão ativa',
        );
      }
      return {
        syncedMessages: 0,
        mediaMessages: 0,
        pagesFetched: 0,
        remoteJids: [],
        avatarUrl: null,
        displayName: null,
      };
    }

    const throttleKey = `${companyId}:${conversationId}`;
    if (!opts?.force && this.isThrottled(this.detailSyncAt, throttleKey, 7000)) {
      return {
        syncedMessages: 0,
        mediaMessages: 0,
        pagesFetched: 0,
        remoteJids: [],
        avatarUrl: null,
        displayName: null,
      };
    }

    const conversation = await this.prisma.companyConversation.findFirst({
      where: {
        id: conversationId,
        companyId,
        channel: 'whatsapp',
        whatsappConnectionSessionId: session.id,
      },
      select: {
        id: true,
        contact: true,
        whatsappConnectionSessionId: true,
        metadata: true,
        lastMessageAt: true,
      },
    });
    if (!conversation) {
      return {
        syncedMessages: 0,
        mediaMessages: 0,
        pagesFetched: 0,
        remoteJids: [],
        avatarUrl: null,
        displayName: null,
      };
    }

    const metadata = this.parseMetadata(conversation.metadata);
    let remoteJid =
      this.normalizeOptionalString(metadata.whatsappRemoteJid) ||
      this.normalizeRemoteJid(String(conversation.contact || ''));
    let remoteJidAlt =
      this.normalizeOptionalString(metadata.whatsappRemoteJidAlt) ||
      null;

    const [contacts, chats] = await Promise.all([
      this.getCachedContacts(companyId, session.tenantKey),
      this.fetchChats(companyId, 120, session.tenantKey),
    ]);
    const contactsByJid = this.indexContactsByJid(contacts);
    const conversationKeys = Array.from(
      new Set(
        [
          remoteJid,
          remoteJidAlt,
          this.normalizeRemoteJid(String(conversation.contact || '')),
        ]
          .map((value) => this.normalizeOptionalString(value))
          .filter(Boolean),
      ),
    ) as string[];
    const matchingChat = chats.find((chat) => {
      const chatRemoteJid = this.normalizeOptionalString(chat?.remoteJid);
      const chatRemoteJidAlt = this.getChatRemoteJidAlt(chat);
      const chatKeys = [chatRemoteJid, chatRemoteJidAlt].filter(Boolean) as string[];
      return chatKeys.some((value) => conversationKeys.includes(value));
    }) || null;

    if (matchingChat) {
      remoteJid = this.normalizeOptionalString(matchingChat.remoteJid) || remoteJid;
      remoteJidAlt = this.getChatRemoteJidAlt(matchingChat) || remoteJidAlt;
    }

    const remoteJids = Array.from(
      new Set([remoteJid, remoteJidAlt].map((value) => this.normalizeOptionalString(value)).filter(Boolean)),
    ) as string[];
    const syncableRemoteJids = remoteJids.filter((value) => this.isSyncableChat(value));
    if (!syncableRemoteJids.length) {
      return {
        syncedMessages: 0,
        mediaMessages: 0,
        pagesFetched: 0,
        remoteJids: [],
        avatarUrl: null,
        displayName: null,
      };
    }

    try {
      // Foto: re-checa no máximo 1x por janela (TTL) — respeita o rate-limit do WhatsApp e
      // ainda pega troca de foto. Sem checkedAt (conversa antiga/migração) = re-checa já.
      const avatarTtlMs = 12 * 60 * 60 * 1000;
      const avatarCheckedAt = Number(metadata.whatsappAvatarCheckedAt || 0);
      const avatarFresh = avatarCheckedAt > 0 && Date.now() - avatarCheckedAt < avatarTtlMs;
      // Contato migrado pra @lid TRAVA no fetch ao vivo (medido em prod 05/07: >25s sem
      // resposta, tanto pelo número quanto pelo lid). Nesses casos o fetch ao vivo é PULADO
      // por inteiro — o `contactsByJid` (já buscado abaixo/em paralelo via getCachedContacts,
      // indexado por remoteJid E remoteJidAlt) é a única fonte, com o `profilePicUrl` que já
      // chegou por webhook `contacts.update`. Pra jid normal (@s.whatsapp.net) o comportamento
      // ao vivo é mantido.
      const involvesLid = [remoteJid, remoteJidAlt].some((jid) => (jid || '').includes('@lid'));
      const skipLiveAvatarFetch = avatarFresh || involvesLid;
      const [messageGroups, profilePicture] = await Promise.all([
        Promise.all(
          [
            ...syncableRemoteJids.map((jid) => ({ jid, matchRemoteJidAlt: false })),
            ...syncableRemoteJids
              .filter((jid) => jid.endsWith('@s.whatsapp.net'))
              .map((jid) => ({ jid, matchRemoteJidAlt: true })),
          ].map(({ jid, matchRemoteJidAlt }) =>
            this.fetchMessagesWindow(companyId, jid, {
              limit: opts?.limit ?? 120,
              fullSync: opts?.fullSync,
              maxPages: opts?.maxPages,
              matchRemoteJidAlt,
            }, session.tenantKey),
          ),
        ),
        skipLiveAvatarFetch
          ? Promise.resolve(null)
          : this.fetchProfilePicture(companyId, syncableRemoteJids[0], session.tenantKey),
      ]);
      const messages = messageGroups.flatMap((group) => group.records);
      const pagesFetched = messageGroups.reduce(
        (total, group) => total + Math.max(0, Number(group.pagesFetched || 0)),
        0,
      );
      const messageByKey = new Map<string, WebwhatsFetchedMessage>();
      for (const message of messages) {
        const key = this.normalizeOptionalString(message?.key?.id || message?.id || message?.messageTimestamp);
        if (!key) continue;
        messageByKey.set(key, message);
      }
      const orderedMessages = Array.from(messageByKey.values())
        .sort((left, right) => {
          const leftTime = this.resolveMessageDate(left?.messageTimestamp)?.getTime() || 0;
          const rightTime = this.resolveMessageDate(right?.messageTimestamp)?.getTime() || 0;
          return leftTime - rightTime;
        });
      for (const message of orderedMessages) {
        await this.upsertConversationMessage(
          companyId,
          session,
          conversation.id,
          remoteJid,
          message,
          this.getMessageRemoteJidAlt(message) || remoteJidAlt,
          { downloadMedia: opts?.downloadMedia !== false },
        );
      }

      const latestDisplayNames = this.resolveChatDisplayNames(
        matchingChat || ({ remoteJid } as WebwhatsChatSummary),
        contactsByJid.get(remoteJid || '') || null,
        remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
      );
      const latestDisplayName = latestDisplayNames.displayName || this.getPersistedDisplayName(metadata);
      // A busca ao vivo no motor pode vir null (privacidade/rate-limit do WhatsApp); nesse caso
      // cai na foto que o Contact já tem (capturada no webhook da mensagem) em vez de não mostrar nada.
      const rawAvatarUrl =
        this.normalizeOptionalString(profilePicture?.profilePictureUrl)
        || this.normalizeOptionalString(contactsByJid.get(remoteJid || '')?.profilePicUrl)
        || this.normalizeOptionalString(remoteJidAlt ? contactsByJid.get(remoteJidAlt)?.profilePicUrl : null);
      // Baixa 1x e serve local/estável (anti-piscada + anti-expiração); cai na crua se falhar.
      const avatarUrl = rawAvatarUrl
        ? (await this.cacheProfilePictureLocally(rawAvatarUrl)) ?? rawAvatarUrl
        : null;
      const mediaMessages = orderedMessages.reduce((count, message) => {
        return ['image', 'video', 'document', 'audio'].includes(this.normalizeMessageType(message))
          ? count + 1
          : count;
      }, 0);
      const nextMetadata = {
        ...this.applyDisplayNamesToMetadata(metadata, {
          ...latestDisplayNames,
          displayName: latestDisplayName,
        }),
        ...(avatarUrl ? { whatsappAvatarUrl: avatarUrl } : {}),
        ...(avatarFresh ? {} : { whatsappAvatarCheckedAt: Date.now() }),
        whatsappRemoteJid: remoteJid,
        ...(remoteJidAlt ? { whatsappRemoteJidAlt: remoteJidAlt } : {}),
        ...(matchingChat
          ? {
              whatsappUnreadCount: Math.max(0, Number(matchingChat?.unreadCount || 0)),
              whatsappArchived: this.resolveChatArchivedFlag(matchingChat),
            }
          : {}),
        ...(matchingChat
          ? {
              whatsappWindowActive:
                matchingChat.windowActive === undefined || matchingChat.windowActive === null
                  ? metadata.whatsappWindowActive
                  : Boolean(matchingChat.windowActive),
            }
          : {}),
        whatsappConnectionSessionId: session.id,
        sourcePhoneNormalized: session.phoneNormalized,
        sourceTenantKey: session.tenantKey,
      };
      const serializedMetadata = JSON.stringify(nextMetadata);
      if (String(conversation.metadata || '') !== serializedMetadata) {
        await this.prisma.companyConversation.update({
          where: { id: conversation.id },
          data: { metadata: serializedMetadata },
        });
      }

      this.detailSyncAt.set(throttleKey, Date.now());
      return {
        syncedMessages: orderedMessages.length,
        mediaMessages,
        pagesFetched,
        remoteJids: syncableRemoteJids,
        avatarUrl: avatarUrl || this.normalizeOptionalString(metadata.whatsappAvatarUrl) || null,
        displayName: latestDisplayName || null,
        agendaDisplayName: latestDisplayNames.agendaDisplayName,
        profileDisplayName: latestDisplayNames.profileDisplayName,
      };
    } catch (error: any) {
      this.logger.warn(
        `Webwhats syncConversationMessages falhou para company ${companyId} conversation ${conversationId}: ${String(error?.message || error)}`,
      );
      if (opts?.failOnError) {
        throw this.asWebwhatsProviderError(error)
          || new WebwhatsProviderError(
            'WEBWHATS_UNAVAILABLE',
            `Falha ao sincronizar historico da conversa ${conversationId}: ${String(error?.message || error)}`,
          );
      }
      return {
        syncedMessages: 0,
        mediaMessages: 0,
        pagesFetched: 0,
        remoteJids: syncableRemoteJids,
        avatarUrl: null,
        displayName: null,
      };
    }
  }

  async listLiveChats(companyId: number, opts?: { limit?: number }, selector?: WebwhatsSessionSelector) {
    const company = await this.requireConnectedCompany(companyId, selector);
    const sessionTenantKey = company.session.tenantKey;
    const [chatList, contacts] = await Promise.all([
      this.fetchChatsFast(company.id, { limit: opts?.limit ?? 60 }, sessionTenantKey),
      this.getCachedContacts(company.id, sessionTenantKey),
    ]);
    const chats = chatList.records;
    const contactsByJid = this.indexContactsByJid(contacts);
    const snapshots: WebwhatsLiveChatSnapshot[] = [];

    for (const chat of chats) {
      const remoteJid = this.normalizeOptionalString(chat?.remoteJid);
      if (!this.isSyncableChat(remoteJid)) continue;
      const remoteJidAlt = this.getChatRemoteJidAlt(chat);
      const state = await this.upsertConversationStateFromChat(
        company.id,
        company.session,
        chat,
        contactsByJid.get(remoteJid || '') || null,
        remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
      );
      if (!state) continue;

      const displayNames = this.resolveChatDisplayNames(
        chat,
        contactsByJid.get(remoteJid || '') || null,
        remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
      );
      const lastMessageAt =
        this.resolveMessageDate(chat?.lastMessage?.messageTimestamp || chat?.updatedAt) || null;

      // Fix 1 (PR05072026): a lista é hot path com N chats — nunca esperamos download aqui.
      // Se o arquivo do hash já existe em disco, serve local (stat síncrono, barato). Senão,
      // devolve a URL crua (nunca pior que hoje) e dispara o cache em background com teto de
      // concorrência, pra convergir pro local nas próximas leituras da lista.
      const rawListAvatarUrl =
        this.normalizeOptionalString(chat?.profilePicUrl)
        || this.normalizeOptionalString(contactsByJid.get(remoteJid || '')?.profilePicUrl)
        || null;
      const cachedListAvatarUrl = this.resolveCachedAvatarPathSync(rawListAvatarUrl);
      if (!cachedListAvatarUrl && rawListAvatarUrl) {
        this.scheduleAvatarBackgroundCache(rawListAvatarUrl);
      }

      snapshots.push({
        conversation: state,
        remoteJid,
        remoteJidAlt,
        contact: state.contact,
        displayName: displayNames.displayName,
        agendaDisplayName: displayNames.agendaDisplayName,
        profileDisplayName: displayNames.profileDisplayName,
        avatarUrl: cachedListAvatarUrl || rawListAvatarUrl,
        unreadCount: Math.max(0, Number(chat?.unreadCount || 0)),
        archived: this.resolveChatArchivedFlag(chat),
        windowActive:
          chat?.windowActive === undefined || chat?.windowActive === null
            ? null
            : Boolean(chat.windowActive),
        lastMessageAt,
        lastMessage: chat?.lastMessage || null,
      });
    }

    const sortedSnapshots = snapshots.sort((left, right) => {
      const leftTime = left.lastMessageAt?.getTime() || 0;
      const rightTime = right.lastMessageAt?.getTime() || 0;
      return rightTime - leftTime;
    });

    return this.enrichLiveChatsWithPresence(company.id, sortedSnapshots, sessionTenantKey);
  }

  async listContacts(
    companyId: number,
    opts?: { force?: boolean; failOnError?: boolean },
    selector?: WebwhatsSessionSelector,
  ) {
    // POR USUÁRIO: gate pela SESSÃO resolvida (não pelo status da empresa) e contatos do tenantKey
    // do user. Sem sessão viva = sem contatos.
    const session = await this.resolveCurrentWebwhatsSession(companyId, selector);
    if (!session) {
      if (opts?.failOnError) {
        throw new WebwhatsProviderError(
          'WEBWHATS_NOT_CONNECTED',
          'Sessao do WhatsApp desconectada. Nao foi possivel sincronizar contatos.',
        );
      }
      return [];
    }

    if (opts?.force) {
      const contacts = await this.fetchContacts(companyId, session.tenantKey);
      this.contactSyncAt.set(session.tenantKey, Date.now());
      this.contactCache.set(session.tenantKey, contacts);
      this.logger.log(`Webwhats contatos sincronizados para company ${companyId} (${session.tenantKey}): ${contacts.length}.`);
      return contacts;
    }

    return this.getCachedContacts(companyId, session.tenantKey);
  }

  // FREIO do zap-gate (W4, PR02072026): esta é a ÚNICA porta por onde TODO check de WhatsApp
  // passa (Radar via applyRadarWhatsappCheck, Vendas, Inbox) — cache TTL + rate limit + disjuntor
  // próprio vivem no ZapCheckGuardService, injetados aqui ANTES de qualquer chamada de rede ao
  // motor. Números "frescos" no cache nem chegam a sair daqui; só os pendentes viram request real,
  // e só se o disjuntor deixar. Disjuntor aberto = lança WEBWHATS_UNAVAILABLE (mesmo tratamento
  // de indisponibilidade que os chamadores já tinham pra qualquer falha do motor — Radar degrada
  // pra unverified, Inbox recusa pedindo retry). Nunca faz retry-loop por conta própria.
  async checkWhatsappNumbers(
    companyId: number,
    numbersRaw: Array<string | null | undefined>,
    selector?: WebwhatsSessionSelector,
  ) {
    const normalizedNumbers = Array.from(
      new Set(
        (Array.isArray(numbersRaw) ? numbersRaw : [])
          .map((value) => String(value || '').replace(/\D/g, ''))
          .filter((value) => value.length >= 10),
      ),
    );

    if (!normalizedNumbers.length) {
      return [] as WebwhatsWhatsappNumberCheckResult[];
    }

    const rawByDigits = new Map<string, unknown>();
    const { results, breakerOpen } = await ZapCheckGuardService.guardedCheck(
      normalizedNumbers,
      async (pending) => {
        const company = await this.requireConnectedCompany(companyId, selector);
        const tenantKey = company.session.tenantKey;
        const response = await this.requestRead<any>({
          method: 'POST',
          path: `/chat/whatsappNumbers/${encodeURIComponent(tenantKey)}`,
          purpose: 'verificacao rapida de numeros com WhatsApp',
          data: {
            numbers: pending,
          },
        });

        const rows = Array.isArray(response?.numbers)
          ? response.numbers
          : Array.isArray(response)
            ? response
            : [];
        const resultByDigits = new Map<string, { phoneDigits: string; exists: boolean; remoteJid: string | null }>();

        for (const row of rows) {
          const rawNumber = this.normalizeOptionalString(
            row?.number || row?.phone || row?.contact || row?.remoteJid,
          );
          const normalizedNumber = String(rawNumber || '').replace(/\D/g, '');
          if (!normalizedNumber) continue;
          const exists = this.normalizeOptionalBoolean(row?.exists) === true;
          const remoteJid = this.normalizeOptionalString(row?.remoteJid || row?.jid)
            || (exists ? this.normalizeRemoteJid(normalizedNumber) : null);
          rawByDigits.set(normalizedNumber, row);
          resultByDigits.set(normalizedNumber, { phoneDigits: normalizedNumber, exists, remoteJid });
        }

        // Pendente sem linha na resposta do motor = "não existe" (mesmo default de antes) —
        // ainda assim entra no cache pra não bater de novo até o TTL vencer.
        return pending.map((digits) => resultByDigits.get(digits) || { phoneDigits: digits, exists: false, remoteJid: null });
      },
    );

    if (breakerOpen) {
      throw new WebwhatsProviderError(
        'WEBWHATS_UNAVAILABLE',
        `Freio do zap-gate aberto (${ZapCheckGuardService.breakerThreshold()} erros consecutivos) — checagem de WhatsApp pausada por cooldown.`,
      );
    }

    return normalizedNumbers.map((normalizedNumber): WebwhatsWhatsappNumberCheckResult => {
      const matched = results.get(normalizedNumber);
      return {
        input: normalizedNumber,
        normalizedNumber,
        exists: Boolean(matched?.exists),
        remoteJid: matched?.remoteJid ?? null,
        raw: rawByDigits.get(normalizedNumber) ?? null,
      };
    });
  }

  setInboundRelay(handler: ((input: WebwhatsInboundRelayInput) => Promise<void>) | null) {
    this.inboundRelay = handler;
  }

  isDispatchAvailable(status: string | null | undefined) {
    return this.canUseConnectedInstance({ whatsappModalStatus: status });
  }

  // POR USUÁRIO: existe sessão webwhats VIVA p/ este selector? Gate de dispatch independente do
  // `company.whatsappModalStatus` — o connect per-user não seta o status da empresa, então o
  // dispatch precisa olhar a LINHA da sessão (sessionId/tenantKey/userId), não o status global.
  async hasOperationalSession(companyId: number, selector?: WebwhatsSessionSelector): Promise<boolean> {
    const session = await this.resolveCurrentWebwhatsSession(companyId, selector);
    return Boolean(session);
  }

  private async requireConnectedCompany(companyId: number, selector?: WebwhatsSessionSelector) {
    const session = await this.resolveCurrentWebwhatsSession(companyId, selector);
    if (!session) {
      throw new WebwhatsProviderError(
        'WEBWHATS_NOT_CONNECTED',
        'WhatsApp sem sessão ativa',
      );
    }
    return { id: companyId, session };
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

  private static readonly WEBWHATS_SESSION_CONTEXT_SELECT = {
    id: true,
    tenantKey: true,
    phoneNormalized: true,
    displayPhone: true,
    metadataJson: true,
  } as const;

  private toWebwhatsSessionContext(
    row: {
      id: string;
      tenantKey: string | null;
      phoneNormalized: string | null;
      displayPhone: string | null;
      metadataJson: string | null;
    },
    fallbackTenantKey: string,
  ): WebwhatsConnectionSessionContext {
    return {
      id: String(row.id),
      tenantKey: String(row.tenantKey || fallbackTenantKey),
      phoneNormalized: this.normalizeConnectionPhone(row.phoneNormalized),
      displayPhone: this.normalizeOptionalString(row.displayPhone),
      metadataJson: this.normalizeOptionalString(row.metadataJson),
    };
  }

  // POR USUÁRIO (18/06): a verdade da sessão é a LINHA WhatsAppConnectionSession (status=active +
  // userId/tenantKey), NÃO `company.whatsappModalStatus` — o connect per-user de propósito não
  // seta o status da empresa (senão o número/status de um vendedor vaza pros outros). Resolve por:
  //   sessionId (sessão da conversa) > tenantKey (instanceName cru do webhook) > userId (vendedor)
  //   > ponteiro/última sessão active da empresa (admin/automação/legado).
  // READ-ONLY: nunca cria/relabela/repara sessão — só LÊ. Sem sessão viva = null (chamadores tratam).
  private async resolveCurrentWebwhatsSession(
    companyId: number,
    selector?: WebwhatsSessionSelector,
  ): Promise<WebwhatsConnectionSessionContext | null> {
    const config = this.readConfig();
    if (!config.available) return null;

    const fallbackTenantKey = this.buildTenantKey(companyId);
    const sessionId = this.normalizeOptionalString(selector?.sessionId);
    const selectorTenantKey = this.normalizeOptionalString(selector?.tenantKey);
    const userId = Number(selector?.userId || 0) || null;

    // 1) Sessão explícita (sessão da conversa). Se informada e não-active → sem sessão; NÃO cai
    //    pro ponteiro da empresa (evita vazar conversa entre números).
    if (sessionId) {
      const byId = await this.prisma.whatsAppConnectionSession.findFirst({
        where: { id: sessionId, companyId, provider: 'webwhats', status: 'active' },
        select: WebwhatsBridgeService.WEBWHATS_SESSION_CONTEXT_SELECT,
      });
      return byId?.id ? this.toWebwhatsSessionContext(byId, fallbackTenantKey) : null;
    }

    // 2) tenantKey explícito (instanceName cru do webhook → `company-{id}-user-{n}`).
    if (selectorTenantKey) {
      const byTenant = await this.prisma.whatsAppConnectionSession.findFirst({
        where: { companyId, provider: 'webwhats', status: 'active', tenantKey: selectorTenantKey },
        orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
        select: WebwhatsBridgeService.WEBWHATS_SESSION_CONTEXT_SELECT,
      });
      return byTenant?.id ? this.toWebwhatsSessionContext(byTenant, fallbackTenantKey) : null;
    }

    // 3) Per-user: a sessão active DESTE usuário (independe do status da empresa).
    if (userId) {
      const byUser = await this.prisma.whatsAppConnectionSession.findFirst({
        where: { companyId, provider: 'webwhats', status: 'active', userId },
        orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
        select: WebwhatsBridgeService.WEBWHATS_SESSION_CONTEXT_SELECT,
      });
      return byUser?.id ? this.toWebwhatsSessionContext(byUser, fallbackTenantKey) : null;
    }

    // 4) Sem identidade (admin/automação/legado): ponteiro atual; senão a última sessão active da
    //    empresa (QUALQUER tenantKey — inclui per-user; não filtra só o canônico `company-{id}`).
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        currentWhatsappConnectionSession: {
          select: {
            id: true,
            provider: true,
            tenantKey: true,
            phoneNormalized: true,
            displayPhone: true,
            metadataJson: true,
            status: true,
          },
        },
      },
    });
    const current = company?.currentWhatsappConnectionSession;
    if (
      current &&
      String(current.provider || '').trim().toLowerCase() === 'webwhats' &&
      String(current.status || '').trim().toLowerCase() === 'active' &&
      this.normalizeOptionalString(current.tenantKey)
    ) {
      return this.toWebwhatsSessionContext(current, fallbackTenantKey);
    }

    const fallback = await this.prisma.whatsAppConnectionSession.findFirst({
      where: { companyId, provider: 'webwhats', status: 'active' },
      orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
      select: WebwhatsBridgeService.WEBWHATS_SESSION_CONTEXT_SELECT,
    });
    return fallback?.id ? this.toWebwhatsSessionContext(fallback, fallbackTenantKey) : null;
  }

  async sendText(
    companyId: number,
    input: {
      to: string;
      text: string;
      conversationId?: number | null;
      quoted?: WebwhatsQuotedInput | null;
      /**
       * PR05072026 (timing humano): ms de presence "composing" que o motor mostra
       * ANTES de enviar (padrão Evolution API — `data.delay` em `/message/sendText`
       * liga o composing e só envia ao fim do delay). Vem já clampado nos knobs
       * `typingSeconds`/`typingVarianceSeconds` da campanha — quem chama decide o
       * valor, este método só repassa. Omitido/0 = comportamento atual (sem digitando).
       */
      typingDelayMs?: number | null;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);

    const tenantKey = company.session.tenantKey;
    const target = await this.resolveSendTarget(companyId, input);
    const delay = Math.max(0, Math.trunc(Number(input.typingDelayMs) || 0));
    // Margem de 15s sobre o próprio delay: o motor só responde ao terminar de digitar
    // e enviar, então o timeout HTTP precisa cobrir o delay inteiro + a chamada real.
    const timeoutOverrideMs = delay > 0 ? delay + 15000 : undefined;
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/message/sendText/${encodeURIComponent(tenantKey)}`,
      purpose: 'envio de mensagem via Webwhats',
      data: {
        number: target,
        text: String(input.text || ''),
        ...(input.quoted ? { quoted: input.quoted } : {}),
        ...(delay > 0 ? { delay, presence: 'composing' } : {}),
      },
      timeoutOverrideMs,
    });

    const rawMessageId = this.normalizeOptionalString(response?.key?.id || response?.id);
    return {
      target,
      response,
      rawMessageId,
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId) : null,
    };
  }

  async sendMedia(
    companyId: number,
    input: {
      to: string;
      mediaType: WebwhatsMediaType;
      media: string;
      conversationId?: number | null;
      caption?: string | null;
      fileName?: string | null;
      mimeType?: string | null;
      quoted?: WebwhatsQuotedInput | null;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);

    const tenantKey = company.session.tenantKey;
    const target = await this.resolveSendTarget(companyId, input);
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/message/sendMedia/${encodeURIComponent(tenantKey)}`,
      purpose: 'envio de midia via Webwhats',
      data: {
        number: target,
        mediatype: input.mediaType,
        media: this.resolveOutboundMediaInput(input.media),
        ...(this.normalizeOptionalString(input.caption) ? { caption: this.normalizeOptionalString(input.caption) } : {}),
        ...(this.normalizeOptionalString(input.fileName) ? { fileName: this.normalizeOptionalString(input.fileName) } : {}),
        ...(this.normalizeOptionalString(input.mimeType) ? { mimetype: this.normalizeOptionalString(input.mimeType) } : {}),
        ...(input.quoted ? { quoted: input.quoted } : {}),
      },
    });

    const rawMessageId = this.normalizeOptionalString(response?.key?.id || response?.id);
    return {
      target,
      response,
      rawMessageId,
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId) : null,
    };
  }

  async sendWhatsAppAudio(
    companyId: number,
    input: {
      to: string;
      audio: string;
      conversationId?: number | null;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);

    const tenantKey = company.session.tenantKey;
    const target = await this.resolveSendTarget(companyId, {
      to: input.to,
      conversationId: input.conversationId,
    });
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/message/sendWhatsAppAudio/${encodeURIComponent(tenantKey)}`,
      purpose: 'envio de audio de voz via Webwhats',
      data: {
        number: target,
        audio: this.resolveOutboundMediaInput(input.audio),
      },
    });

    const rawMessageId = this.normalizeOptionalString(response?.key?.id || response?.id);
    return {
      target,
      response,
      rawMessageId,
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId) : null,
    };
  }

  async sendInteractive(
    companyId: number,
    input: {
      to: string;
      payload: Record<string, any>;
      conversationId?: number | null;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);

    const tenantKey = company.session.tenantKey;
    const target = await this.resolveSendTarget(companyId, input);
    const payloadType = this.normalizeOptionalString(input.payload?.type);

    let path = '';
    let requestBody: Record<string, unknown> | null = null;
    if (payloadType === 'button') {
      const bodyText = this.normalizeOptionalString(input.payload?.body?.text) || 'Atendimento';
      const footerText = this.normalizeOptionalString(input.payload?.footer?.text) || 'Atendimento';
      const buttons = Array.isArray(input.payload?.action?.buttons)
        ? input.payload.action.buttons
            .map((button: any) => ({
              type: 'reply',
              displayText: this.normalizeOptionalString(button?.reply?.title),
              id: this.normalizeOptionalString(button?.reply?.id),
            }))
            .filter((button: any) => button.displayText && button.id)
        : [];
      if (!buttons.length) {
        throw new Error('WEBWHATS_INTERACTIVE_BUTTONS_EMPTY');
      }
      path = `/message/sendButtons/${encodeURIComponent(tenantKey)}`;
      requestBody = {
        number: target,
        title: bodyText,
        footer: footerText,
        buttons,
      };
    } else if (payloadType === 'list') {
      const bodyText = this.normalizeOptionalString(input.payload?.body?.text) || 'Atendimento';
      const footerText = this.normalizeOptionalString(input.payload?.footer?.text) || 'Atendimento';
      const buttonText = this.normalizeOptionalString(input.payload?.action?.button) || 'Escolher opcao';
      const sections = Array.isArray(input.payload?.action?.sections)
        ? input.payload.action.sections
            .map((section: any) => ({
              title: this.normalizeOptionalString(section?.title) || 'Opcoes',
              rows: Array.isArray(section?.rows)
                ? section.rows
                    .map((row: any) => ({
                      title: this.normalizeOptionalString(row?.title),
                      description: this.normalizeOptionalString(row?.description) || '',
                      rowId: this.normalizeOptionalString(row?.id || row?.rowId),
                    }))
                    .filter((row: any) => row.title && row.rowId)
                : [],
            }))
            .filter((section: any) => section.rows.length > 0)
        : [];
      if (!sections.length) {
        throw new Error('WEBWHATS_INTERACTIVE_LIST_EMPTY');
      }
      path = `/message/sendList/${encodeURIComponent(tenantKey)}`;
      requestBody = {
        number: target,
        title: bodyText,
        footerText,
        buttonText,
        sections,
      };
    } else {
      throw new Error(`WEBWHATS_INTERACTIVE_TYPE_UNSUPPORTED:${payloadType || 'unknown'}`);
    }

    const response = await this.requestRead<any>({
      method: 'POST',
      path,
      purpose: 'envio de interacao via Webwhats',
      data: requestBody,
    });

    const rawMessageId = this.normalizeOptionalString(response?.key?.id || response?.id);
    return {
      target,
      requestBody,
      response,
      rawMessageId,
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId) : null,
    };
  }

  async updateBlockStatus(
    companyId: number,
    input: {
      to?: string;
      conversationId?: number | null;
      status: 'block' | 'unblock';
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);
    const tenantKey = company.session.tenantKey;
    const target = await this.resolveSendTarget(companyId, {
      to: String(input.to || ''),
      conversationId: input.conversationId ?? null,
    });
    return this.requestRead<any>({
      method: 'POST',
      path: `/message/updateBlockStatus/${encodeURIComponent(tenantKey)}`,
      purpose: input.status === 'block' ? 'bloqueio de contato via Webwhats' : 'desbloqueio de contato via Webwhats',
      data: {
        number: target,
        status: input.status,
      },
    });
  }

  async archiveChat(
    companyId: number,
    input: {
      conversationId: number;
      archive: boolean;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);
    const tenantKey = company.session.tenantKey;
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: Number(input.conversationId || 0), companyId, channel: 'whatsapp' },
      select: { id: true, contact: true, metadata: true },
    });
    if (!conversation) {
      throw new Error('WEBWHATS_CONVERSATION_NOT_FOUND');
    }

    const metadata = this.parseMetadata(conversation.metadata);
    const remoteJid =
      this.normalizeOptionalString(metadata.whatsappRemoteJid) ||
      this.normalizeRemoteJid(String(conversation.contact || ''));
    const remoteJidAlt =
      this.normalizeOptionalString(metadata.whatsappRemoteJidAlt) || null;
    if (!remoteJid) {
      throw new Error('WEBWHATS_CHAT_REMOTE_JID_MISSING');
    }

    const [chats, lastMessageRow] = await Promise.all([
      this.fetchChats(company.id, 120),
      this.prisma.companyMessage.findFirst({
        where: { companyId, conversationId: conversation.id },
        orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
        select: {
          direction: true,
          providerMessageId: true,
          rawPayload: true,
          timestamp: true,
        },
      }),
    ]);

    const matchingChat =
      chats.find((chat) => {
        const chatRemoteJid = this.normalizeOptionalString(chat?.remoteJid);
        const chatRemoteJidAlt = this.getChatRemoteJidAlt(chat);
        return [chatRemoteJid, chatRemoteJidAlt].some(
          (value) => value && [remoteJid, remoteJidAlt].includes(value),
        );
      }) || null;
    const lastMessagePayload =
      matchingChat?.lastMessage ||
      this.buildArchiveLastMessagePayload(remoteJid, lastMessageRow);

    return this.request<any>({
      method: 'POST',
      path: `/chat/archiveChat/${encodeURIComponent(tenantKey)}`,
      purpose: input.archive ? 'arquivamento de chat via Webwhats' : 'desarquivamento de chat via Webwhats',
      data: {
        lastMessage: lastMessagePayload,
        archive: Boolean(input.archive),
        chat: remoteJid,
      },
    });
  }

  async sendReaction(
    companyId: number,
    input: {
      conversationId?: number | null;
      remoteJid?: string | null;
      messageId: string;
      fromMe: boolean;
      reaction: string;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);
    const tenantKey = company.session.tenantKey;
    const resolvedRemoteJid = this.normalizeRemoteJid(
      String(
        input.remoteJid ||
          (await this.resolveSendTarget(companyId, {
            to: '',
            conversationId: input.conversationId ?? null,
          })) ||
          '',
      ),
    );
    if (!resolvedRemoteJid) {
      throw new Error('WEBWHATS_REACTION_REMOTE_JID_MISSING');
    }

    return this.request<any>({
      method: 'POST',
      path: `/message/sendReaction/${encodeURIComponent(tenantKey)}`,
      purpose: 'envio de reacao via Webwhats',
      data: {
        key: {
          remoteJid: resolvedRemoteJid,
          fromMe: Boolean(input.fromMe),
          id: String(input.messageId || ''),
        },
        reaction: String(input.reaction || ''),
      },
    });
  }

  async markMessagesAsRead(
    companyId: number,
    input: {
      conversationId?: number | null;
      remoteJid?: string | null;
      messages: Array<{
        id: string;
        fromMe?: boolean | null;
        remoteJid?: string | null;
        participant?: string | null;
      }>;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);
    const tenantKey = company.session.tenantKey;
    const fallbackRemoteJid = this.normalizeRemoteJid(
      String(
        input.remoteJid ||
          (await this.resolveSendTarget(companyId, {
            to: '',
            conversationId: input.conversationId ?? null,
          })) ||
          '',
      ),
    );
    if (!fallbackRemoteJid) {
      throw new Error('WEBWHATS_READ_REMOTE_JID_MISSING');
    }

    const readMessages = (Array.isArray(input.messages) ? input.messages : [])
      .map((message) => {
        const id = this.normalizeOptionalString(message?.id);
        const remoteJid = this.normalizeRemoteJid(String(message?.remoteJid || fallbackRemoteJid || ''));
        if (!id || !remoteJid) return null;
        return {
          id,
          remoteJid,
          fromMe: Boolean(message?.fromMe),
          ...(this.normalizeOptionalString(message?.participant)
            ? { participant: this.normalizeOptionalString(message?.participant) }
            : {}),
        };
      })
      .filter(Boolean);

    if (!readMessages.length) {
      return { skipped: true, readMessages: 0 };
    }

    return this.requestRead<any>({
      method: 'POST',
      path: `/chat/markMessageAsRead/${encodeURIComponent(tenantKey)}`,
      purpose: 'marcacao de mensagens como lidas via Webwhats',
      data: {
        readMessages,
      },
    });
  }

  async deleteMessageForEveryone(
    companyId: number,
    input: {
      conversationId?: number | null;
      remoteJid?: string | null;
      messageId: string;
      fromMe: boolean;
      participant?: string | null;
    },
    selector?: WebwhatsSessionSelector,
  ) {
    const company = await this.requireConnectedCompany(companyId, selector);
    const tenantKey = company.session.tenantKey;
    const resolvedRemoteJid = this.normalizeRemoteJid(
      String(
        input.remoteJid ||
          (await this.resolveSendTarget(companyId, {
            to: '',
            conversationId: input.conversationId ?? null,
          })) ||
          '',
      ),
    );
    if (!resolvedRemoteJid) {
      throw new Error('WEBWHATS_DELETE_REMOTE_JID_MISSING');
    }

    return this.request<any>({
      method: 'DELETE',
      path: `/chat/deleteMessageForEveryone/${encodeURIComponent(tenantKey)}`,
      purpose: 'exclusao de mensagem para todos via Webwhats',
      data: {
        id: String(input.messageId || ''),
        remoteJid: resolvedRemoteJid,
        fromMe: Boolean(input.fromMe),
        ...(this.normalizeOptionalString(input.participant)
          ? { participant: this.normalizeOptionalString(input.participant) }
          : {}),
      },
    });
  }

  // COCKPIT-MASTER Sprint 2 — leitura SÓ-GET do estado dos chips no MOTOR AO VIVO
  // (`/instance/fetchInstances`; fonte única da verdade — regra dura de
  // docs/Rules/WHATSAPP.md). JAMAIS chama connect/reconnect/logout/delete. De
  // propósito NÃO usa requestRead: a sonda de saúde não pode ter retry com sleep
  // nem o efeito colateral de marcar empresa como RECONNECTING. Motor
  // indisponível/não configurado/erro = null (chamador trata como "sem leitura").
  public async listMotorInstances(): Promise<any[] | null> {
    const config = this.readConfig();
    if (!config.available) return null;
    try {
      const all = await this.request<any[]>({
        method: 'GET',
        path: '/instance/fetchInstances',
        purpose: 'leitura do estado dos chips (cockpit master)',
        treatNotFoundAsNull: true,
      });
      return Array.isArray(all) ? all : [];
    } catch (error) {
      this.logger.warn(
        `Webwhats listMotorInstances falhou: ${String((error as any)?.message || error)}`,
      );
      return null;
    }
  }

  // Apaga TODAS as instâncias da company no MOTOR (company-{id} e company-{id}-user-*).
  // Store-on-arrival: não recria — o próximo connect cria instância nova limpa.
  public async wipeMotorInstance(companyId: number): Promise<{ loggedOut: boolean; deleted: boolean; recreated: boolean }> {
    const config = this.readConfig();
    if (!config.available) return { loggedOut: false, deleted: false, recreated: false };
    const prefix = this.buildTenantKey(companyId); // company-{id}
    let loggedOut = false;
    let deleted = false;

    // Lista todas as instâncias do motor e filtra as desta company.
    let instanceNames: string[] = [];
    try {
      const all = await this.request<any[]>({
        method: 'GET',
        path: '/instance/fetchInstances',
        purpose: 'listar instancias para wipe',
        treatNotFoundAsNull: true,
      });
      instanceNames = (Array.isArray(all) ? all : [])
        .map((inst: any) => this.normalizeOptionalString(inst?.instance?.instanceName || inst?.instanceName))
        .filter((name): name is string => Boolean(name) && (name === prefix || name.startsWith(`${prefix}-`)));
    } catch (error) {
      this.logger.warn(`wipe motor: falha ao listar instâncias para company=${companyId}: ${String((error as any)?.message || error)}`);
      // Fallback: tenta apagar a instância conhecida pela sessão ativa ou pela chave legada.
      instanceNames = [await this.resolveMotorTenantKey(companyId)];
    }

    for (const name of instanceNames) {
      const wiped = await this.wipeMotorInstanceByTenantKey(name);
      loggedOut = loggedOut || wiped.loggedOut;
      deleted = deleted || wiped.deleted;
    }

    this.logger.warn(`wipe motor company=${companyId}: instances=${instanceNames.join(',') || '(nenhuma)'} logout=${loggedOut} delete=${deleted}`);
    return { loggedOut, deleted, recreated: false };
  }

  // Derruba UMA instância específica no MOTOR (logout + delete), sem tocar nas irmãs da
  // company. Caso vendedor deletado (07/07): o hardDeleteUser precisa matar SÓ o
  // company-{id}-user-{userId} — o wipeMotorInstance derrubaria a frota inteira da empresa.
  // Best-effort: motor indisponível/instância inexistente viram warn, nunca lançam.
  public async wipeMotorInstanceByTenantKey(tenantKey: string): Promise<{ loggedOut: boolean; deleted: boolean }> {
    const config = this.readConfig();
    const name = this.normalizeOptionalString(tenantKey);
    if (!config.available || !name) return { loggedOut: false, deleted: false };
    let loggedOut = false;
    let deleted = false;
    try {
      await this.request<any>({
        method: 'DELETE',
        path: `/instance/logout/${encodeURIComponent(name)}`,
        purpose: 'logout da instancia (wipe)',
      });
      loggedOut = true;
    } catch (error) {
      this.logger.warn(`wipe motor: logout falhou para ${name}: ${String((error as any)?.message || error)}`);
    }
    const tryDelete = async () => {
      await this.request<any>({
        method: 'DELETE',
        path: `/instance/delete/${encodeURIComponent(name)}`,
        purpose: 'delete da instancia (wipe)',
      });
      deleted = true;
    };
    try {
      // O Evolution processa o logout de forma ASSÍNCRONA — delete imediato responde
      // Bad Request e deixa linha inerte (caso Gabrielo 07/07: logout=true delete=false).
      // Espera curta pós-logout + no máximo 1 retry; NUNCA loop.
      if (loggedOut) await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        await tryDelete();
      } catch (firstError) {
        this.logger.warn(
          `wipe motor: delete falhou para ${name} (1a tentativa, re-tento em 4s): ${String((firstError as any)?.message || firstError)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 4000));
        await tryDelete();
      }
    } catch (error) {
      this.logger.warn(`wipe motor: delete falhou para ${name}: ${String((error as any)?.message || error)}`);
    }
    return { loggedOut, deleted };
  }

  private readConfig(): WebwhatsConfig {
    const enabled = String(process.env.WHATSAPP_MODAL_ENABLED || 'false').trim().toLowerCase() === 'true';
    const internalUrl = this.normalizeOptionalString(process.env.WHATSAPP_MODAL_INTERNAL_URL);
    const apiKey = this.normalizeOptionalString(process.env.WHATSAPP_MODAL_API_KEY);
    const timeoutMs = this.clamp(
      Number(process.env.WHATSAPP_MODAL_TIMEOUT_MS || process.env.WHATSAPP_PROVIDER_TIMEOUT_MS || 12000),
      2000,
      30000,
    );
    const configured = Boolean(internalUrl && apiKey);
    return {
      enabled,
      configured,
      available: enabled && configured,
      internalUrl,
      apiKey,
      timeoutMs,
    };
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  private buildTenantKey(companyId: number) {
    return `company-${companyId}`;
  }

  // 050: as chamadas ao MOTOR (sync de chats/contatos/mensagens, foto, mídia, presença e
  // wipe) precisam mirar a instância da SESSÃO ATIVA. Com WhatsApp por-usuário a chave é
  // `company-{id}-user-{userId}` (escrita no connect), não a legada `company-{id}`. O envio
  // já resolve via `company.session.tenantKey`; aqui centralizamos pro resto do bridge.
  // Sem sessão ativa (automação/bot) cai na chave legada `company-{id}`.
  private async resolveMotorTenantKey(companyId: number): Promise<string> {
    try {
      const session = await this.resolveCurrentWebwhatsSession(companyId);
      return this.normalizeOptionalString(session?.tenantKey) || this.buildTenantKey(companyId);
    } catch {
      // Resolução da sessão indisponível (DB hiccup) — não derruba a chamada ao motor;
      // cai na chave legada company-{id}.
      return this.buildTenantKey(companyId);
    }
  }

  private canUseConnectedInstance(company: { whatsappModalStatus?: string | null }) {
    const config = this.readConfig();
    if (!config.available) return false;
    return isModalSendReady(company?.whatsappModalStatus);
  }

  private resolveOutboundMediaInput(raw: string) {
    const normalized = this.normalizeOptionalString(raw);
    if (!normalized) {
      throw new Error('WEBWHATS_MEDIA_SOURCE_MISSING');
    }

    const localFilePath = this.resolveUploadedMediaPath(normalized);
    if (localFilePath && existsSync(localFilePath)) {
      return readFileSync(localFilePath).toString('base64');
    }

    if (normalized.startsWith('/')) {
      return this.buildPublicAssetUrl(normalized);
    }

    return normalized;
  }

  private resolveUploadedMediaPath(raw: string) {
    const pathname = this.extractMediaPathname(raw);
    if (!pathname || !pathname.startsWith('/uploads/')) return null;

    // P1.3: mídia do inbox vive no dir privado; durante a transição um arquivo antigo
    // ainda pode estar no public — devolve o primeiro candidato que existe no disco.
    const inboxFilename = extractInboxMediaFilename(pathname);
    if (inboxFilename) {
      const candidates = getInboxMediaFileCandidates(inboxFilename) || [];
      return candidates.find((candidate) => existsSync(candidate)) || candidates[0] || null;
    }

    const normalizedRelativePath = decodeURIComponent(pathname)
      .replace(/^\/+/, '')
      .split('/')
      .filter(Boolean);
    if (!normalizedRelativePath.length) return null;

    return join(process.cwd(), 'public', ...normalizedRelativePath);
  }

  private extractMediaPathname(raw: string) {
    const normalized = this.normalizeOptionalString(raw);
    if (!normalized) return null;
    if (normalized.startsWith('/')) {
      return normalized.split('?')[0].split('#')[0];
    }
    try {
      const parsed = new URL(normalized);
      return parsed.pathname || null;
    } catch {
      return null;
    }
  }

  private buildPublicAssetUrl(pathname: string) {
    const baseUrl = (
      this.normalizeOptionalString(process.env.PUBLIC_API_BASE_URL)
      || this.normalizeOptionalString(process.env.API_PUBLIC_URL)
      || this.normalizeOptionalString(process.env.BACKEND_PUBLIC_URL)
      || `http://localhost:${Number(process.env.APP_PORT || 3000)}`
    ).replace(/\/+$/, '');
    // P1.3: mídia do inbox não é mais estática pública — o fallback vira URL assinada
    // (o motor busca por HTTP sem cookie; a assinatura na query é o acesso).
    const localPath = signInboxMediaUrlIfLocal(
      pathname.startsWith('/') ? pathname : `/${pathname}`,
    );
    return `${baseUrl}${localPath}`;
  }

  private getMediaPayload(message: WebwhatsFetchedMessage, messageType?: string | null) {
    const payload = this.unwrapMessagePayload(message?.message || {});
    const normalizedType = String(messageType || this.normalizeMessageType(message) || '').trim().toLowerCase();
    if (normalizedType === 'image') return (payload as any).imageMessage || (payload as any).image || null;
    if (normalizedType === 'video') return (payload as any).videoMessage || (payload as any).ptvMessage || (payload as any).video || null;
    if (normalizedType === 'document') {
      return (
        (payload as any).documentMessage ||
        (payload as any).document ||
        null
      );
    }
    if (normalizedType === 'audio') return (payload as any).audioMessage || (payload as any).audio || null;
    if (normalizedType === 'sticker') return (payload as any).stickerMessage || (payload as any).sticker || null;
    return null;
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

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private normalizeInteractiveText(value: unknown) {
    if (typeof value === 'string') return this.normalizeOptionalString(value);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return this.normalizeOptionalString(String(value));
    }
    if (!this.isRecord(value)) return null;
    return (
      this.normalizeOptionalString(value.text) ||
      this.normalizeOptionalString(value.body) ||
      this.normalizeOptionalString(value.title) ||
      this.normalizeOptionalString(value.displayText) ||
      this.normalizeOptionalString(value.buttonText) ||
      this.normalizeOptionalString(value.selectedDisplayText) ||
      this.normalizeOptionalString(value.name) ||
      null
    );
  }

  private parseInteractiveParamsJson(value: unknown): Record<string, any> | null {
    const raw = this.normalizeOptionalString(value);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return this.isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private collectInteractiveOptions(value: unknown, output: string[] = [], depth = 0) {
    if (depth > 8 || output.length >= 30) return output;
    if (!value) return output;

    if (Array.isArray(value)) {
      for (const item of value) this.collectInteractiveOptions(item, output, depth + 1);
      return output;
    }

    if (!this.isRecord(value)) return output;

    const optionText =
      this.normalizeOptionalString(value.displayText) ||
      this.normalizeInteractiveText(value.buttonText) ||
      this.normalizeOptionalString(value.title) ||
      this.normalizeOptionalString(value.name) ||
      this.normalizeOptionalString(value.text);
    if (optionText && !output.includes(optionText)) output.push(optionText);

    const params = this.parseInteractiveParamsJson(value.buttonParamsJson);
    if (params) {
      const paramsText =
        this.normalizeOptionalString(params.display_text) ||
        this.normalizeOptionalString(params.displayText) ||
        this.normalizeOptionalString(params.title) ||
        this.normalizeOptionalString(params.text) ||
        this.normalizeOptionalString(params.name);
      if (paramsText && !output.includes(paramsText)) output.push(paramsText);
    }

    const nestedCandidates = [
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
    ];
    for (const candidate of nestedCandidates) this.collectInteractiveOptions(candidate, output, depth + 1);
    return output;
  }

  private findFirstInteractiveText(value: unknown, keys: string[], depth = 0): string | null {
    if (depth > 8 || !value) return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findFirstInteractiveText(item, keys, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (!this.isRecord(value)) return null;

    for (const key of keys) {
      const found = this.normalizeInteractiveText(value[key]);
      if (found) return found;
    }
    for (const child of Object.values(value)) {
      const found = this.findFirstInteractiveText(child, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }

  private getInteractivePayload(payload: Record<string, any>) {
    const interactive =
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
      null;

    if (interactive) return interactive;

    const viewOncePayload =
      payload.viewOnceMessage?.message ||
      payload.viewOnceMessageV2?.message ||
      payload.viewOnceMessageV2Extension?.message ||
      null;
    if (this.isRecord(viewOncePayload)) return this.getInteractivePayload(viewOncePayload);

    return null;
  }

  private resolveInteractivePayloadKind(payload: Record<string, any>, messageType?: string | null) {
    const declared = String(messageType || '').trim().toLowerCase();
    if (payload.interactiveMessage || declared.includes('interactive')) return 'interactiveMessage';
    if (payload.buttonsMessage || payload.buttonsResponseMessage || declared.includes('button')) return 'buttonsMessage';
    if (payload.templateMessage || payload.templateButtonReplyMessage || declared.includes('template')) return 'templateMessage';
    if (payload.listMessage || payload.listResponseMessage || declared.includes('list')) return 'listMessage';
    if (payload.hydratedTemplate) return 'hydratedTemplate';
    if (payload.nativeFlowMessage || declared.includes('nativeflow')) return 'nativeFlowMessage';
    if (payload.interactiveResponseMessage) return 'interactiveResponseMessage';
    return declared || 'unknown';
  }

  private buildInteractiveDisplayText(input: {
    body?: string | null;
    title?: string | null;
    footer?: string | null;
    options?: string[];
  }) {
    const lines = ['Mensagem interativa recebida:'];
    const content = [input.title, input.body, input.footer]
      .map((item) => this.normalizeOptionalString(item))
      .filter(Boolean) as string[];
    if (content.length) {
      lines.push('', ...content);
    }
    const options = Array.from(new Set((input.options || []).map((item) => this.normalizeOptionalString(item)).filter(Boolean) as string[]));
    if (options.length) {
      lines.push('', 'Opções:', ...options.map((option) => `• ${option}`));
    }
    return lines.join('\n').trim();
  }

  private sanitizeIncomingPayloadForMetadata(value: unknown, depth = 0): unknown {
    if (depth > 5) return '[truncated]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      return value.length > 500 ? `${value.slice(0, 500)}...[truncated]` : value;
    }
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.slice(0, 10).map((item) => this.sanitizeIncomingPayloadForMetadata(item, depth + 1));
    }
    const redactedKeyPattern = /(jid|phone|number|participant|remote|url|mediaKey|fileSha|thumbnail|jpegThumbnail|directPath|base64|binary)/i;
    const entries = Object.entries(value as Record<string, any>).slice(0, 50).map(([key, item]) => [
      key,
      redactedKeyPattern.test(key) ? '[redacted]' : this.sanitizeIncomingPayloadForMetadata(item, depth + 1),
    ]);
    return Object.fromEntries(entries);
  }

  private isInteractiveMessageType(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    return (
      normalized.includes('interactive') ||
      normalized.includes('template') ||
      normalized.includes('button') ||
      normalized.includes('list') ||
      normalized.includes('nativeflow')
    );
  }

  private shouldLogIncomingInteractiveNormalization(
    normalized: WebwhatsNormalizedIncomingMessage,
    messageType: string,
    text: string,
  ) {
    return (
      normalized.kind === 'interactive_received' ||
      this.isInteractiveMessageType(messageType) ||
      String(text || '').trim().toLowerCase() === '[interacao recebida]'
    );
  }

  private normalizeIncomingWhatsAppMessage(message: WebwhatsFetchedMessage): WebwhatsNormalizedIncomingMessage {
    const payload = this.unwrapMessagePayload(message?.message || {});
    const messageType = this.normalizeMessageType(message);
    const declaredType = this.normalizeOptionalString(message?.messageType);
    const conversation = this.normalizeOptionalString((payload as any).conversation);
    const extendedText = this.normalizeOptionalString((payload as any).extendedTextMessage?.text);
    if (conversation || extendedText) {
      return { text: conversation || extendedText || '', kind: 'text', metadata: {} };
    }

    const reactionText =
      this.normalizeOptionalString((payload as any).reactionMessage?.text)
      || this.normalizeOptionalString((payload as any).reactionMessage?.emoji);
    if (reactionText) return { text: reactionText, kind: 'text', metadata: {} };

    if (['image', 'video', 'document', 'audio', 'sticker', 'poll', 'deleted'].includes(messageType)) {
      return {
        text: this.extractMessageBody(message, messageType),
        kind: ['image', 'video', 'document', 'audio', 'sticker'].includes(messageType) ? 'media' : 'text',
        metadata: {},
      };
    }

    const interactivePayload = this.getInteractivePayload(payload);
    if (interactivePayload || this.isInteractiveMessageType(messageType) || this.isInteractiveMessageType(declaredType)) {
      const interactiveRoot = this.isRecord(interactivePayload) ? interactivePayload : payload;
      const body =
        this.findFirstInteractiveText(interactiveRoot, ['body', 'contentText', 'hydratedContentText', 'text', 'caption', 'description']) ||
        this.normalizeOptionalString((interactiveRoot as any).hydratedContentText) ||
        null;
      const title =
        this.findFirstInteractiveText(interactiveRoot, ['title', 'header', 'hydratedTitle']) ||
        null;
      const footer =
        this.findFirstInteractiveText(interactiveRoot, ['footer', 'footerText', 'hydratedFooterText']) ||
        null;
      const options = this.collectInteractiveOptions(interactiveRoot)
        .filter((option) => option !== body && option !== title && option !== footer);
      const text = body || title || footer || options.length
        ? this.buildInteractiveDisplayText({ body, title, footer, options })
        : '[interacao recebida]';

      return {
        text,
        kind: 'interactive_received',
        metadata: {
          kind: 'interactive_received',
          normalizedMessageType: 'interactive',
          rawMessageType: declaredType || messageType || null,
          interactivePayloadKind: this.resolveInteractivePayloadKind(payload, declaredType || messageType),
          extracted: {
            title,
            body,
            footer,
            options,
            hasText: text !== '[interacao recebida]',
          },
          payloadKeys: Object.keys(payload).slice(0, 30),
          rawPayloadSanitized: this.sanitizeIncomingPayloadForMetadata(message || {}),
        },
      };
    }

    return {
      text: this.extractMessageBody(message, messageType),
      kind: messageType === 'text' ? 'text' : 'unknown',
      metadata: messageType === 'text' ? {} : {
        kind: 'unknown',
        normalizedMessageType: messageType || 'unknown',
        rawMessageType: declaredType || null,
        payloadKeys: Object.keys(payload).slice(0, 30),
        rawPayloadSanitized: this.sanitizeIncomingPayloadForMetadata(message || {}),
      },
    };
  }

  private normalizeStoredNumber(value: unknown) {
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

  private mimeToExtension(mimeType: string | null | undefined, fallbackName?: string | null) {
    const fallbackExt = extname(String(fallbackName || '').split('?')[0]).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 8);
    if (fallbackExt) return fallbackExt;
    const normalized = String(mimeType || '').trim().toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
    if (normalized.includes('png')) return '.png';
    if (normalized.includes('webp')) return '.webp';
    if (normalized.includes('gif')) return '.gif';
    if (normalized.includes('mp4')) return '.mp4';
    if (normalized.includes('webm')) return '.webm';
    if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3';
    if (normalized.includes('ogg') || normalized.includes('opus')) return '.ogg';
    if (normalized.includes('wav')) return '.wav';
    if (normalized.includes('pdf')) return '.pdf';
    return '.bin';
  }

  private extractBase64Candidate(candidate: unknown) {
    if (Buffer.isBuffer(candidate)) return candidate.toString('base64');
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object' && Array.isArray((candidate as any).data)) {
      return Buffer.from((candidate as any).data).toString('base64');
    }
    return null;
  }

  private extractBase64FromMediaResponse(response: unknown) {
    const direct = this.extractBase64Candidate(response);
    if (direct) return direct;
    if (!response || typeof response !== 'object') return null;
    const candidates = [
      (response as any).base64,
      (response as any).data,
      (response as any).data?.base64,
      (response as any).data?.media,
      (response as any).media?.base64,
      (response as any).media?.data,
      (response as any).media,
      (response as any).message?.base64,
      (response as any).message?.media,
      (response as any).message?.data,
      (response as any).file?.base64,
      (response as any).file?.data,
      (response as any).buffer,
    ];
    for (const candidate of candidates) {
      const base64 = this.extractBase64Candidate(candidate);
      if (base64) return base64;
    }
    return null;
  }

  private normalizeBase64Payload(raw: string | null | undefined) {
    const normalized = String(raw || '').trim();
    if (!normalized) return null;
    const withoutPrefix = normalized.includes('base64,')
      ? normalized.slice(normalized.indexOf('base64,') + 'base64,'.length)
      : normalized;
    const compact = withoutPrefix.replace(/\s+/g, '');
    return compact || null;
  }

  private extractMimeTypeFromDataUri(raw: string | null | undefined) {
    const normalized = String(raw || '').trim();
    if (!normalized) return null;
    const match = normalized.match(/^data:([^,]+);base64,/i);
    return this.normalizeOptionalString(match?.[1]);
  }

  private extractMediaResponseMimeType(response: unknown) {
    if (!response || typeof response !== 'object') return null;
    return this.normalizeOptionalString(
      (response as any).mimetype ||
      (response as any).mimeType ||
      (response as any).contentType ||
      (response as any).media?.mimetype ||
      (response as any).media?.mimeType ||
      (response as any).media?.contentType ||
      (response as any).data?.mimetype ||
      (response as any).data?.mimeType ||
      (response as any).data?.contentType ||
      (response as any).message?.mimetype ||
      (response as any).message?.mimeType ||
      (response as any).file?.mimetype ||
      (response as any).file?.mimeType,
    );
  }

  private extractMediaResponseFileName(response: unknown) {
    if (!response || typeof response !== 'object') return null;
    return this.normalizeOptionalString(
      (response as any).fileName ||
      (response as any).filename ||
      (response as any).media?.fileName ||
      (response as any).media?.filename ||
      (response as any).data?.fileName ||
      (response as any).data?.filename,
    );
  }

  private buildStoredMediaAttachmentFromVariables(
    variables: Record<string, any>,
  ): ResolvedWebwhatsMediaAttachment | null {
    const attachment =
      variables?.attachment && typeof variables.attachment === 'object' && !Array.isArray(variables.attachment)
        ? variables.attachment
        : null;
    const url = this.normalizeOptionalString(attachment?.url || attachment?.mediaUrl || attachment?.attachmentUrl);
    const kind = this.normalizeOptionalString(attachment?.kind);
    if (!url || !kind || !['image', 'video', 'document', 'audio', 'sticker'].includes(kind)) return null;

    const localPath = this.resolveUploadedMediaPath(url);
    if (!localPath || !existsSync(localPath)) return null;

    return {
      kind: kind as WebwhatsMediaType,
      url,
      previewUrl: this.normalizeOptionalString(attachment?.previewUrl) || url,
      mimeType: this.normalizeOptionalString(attachment?.mimeType),
      fileName: this.normalizeOptionalString(attachment?.fileName),
      fileSize: this.normalizeStoredNumber(attachment?.fileSize),
      durationSeconds: this.normalizeStoredNumber(attachment?.durationSeconds),
      isVoiceNote: Boolean(attachment?.isVoiceNote),
    };
  }

  private buildMediaDownloadRequestMessage(message: WebwhatsFetchedMessage) {
    const key =
      message?.key && typeof message.key === 'object' && !Array.isArray(message.key)
        ? { ...message.key }
        : {};
    const payload =
      message?.message && typeof message.message === 'object' && !Array.isArray(message.message)
        ? { ...message.message }
        : {};

    return {
      ...(message && typeof message === 'object' && !Array.isArray(message) ? { ...message } : {}),
      key,
      message: payload,
    } satisfies Record<string, unknown>;
  }

  private async resolveInboundMediaAttachment(
    companyId: number,
    conversationId: number,
    message: WebwhatsFetchedMessage,
    messageType: string,
    existingVariables?: Record<string, any>,
    tenantKeyHint?: string,
  ): Promise<ResolvedWebwhatsMediaAttachment | null> {
    if (!['image', 'video', 'document', 'audio', 'sticker'].includes(messageType)) return null;

    const stored = this.buildStoredMediaAttachmentFromVariables(existingVariables || {});
    if (stored) return stored;

    const mediaPayload = this.getMediaPayload(message, messageType);
    if (!mediaPayload) return null;

    try {
      const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
      const response = await this.requestRead<any>({
        method: 'POST',
        path: `/chat/getBase64FromMediaMessage/${encodeURIComponent(tenantKey)}`,
        purpose: 'download de midia recebida',
        data: {
          message: this.buildMediaDownloadRequestMessage(message),
          convertToMp4: messageType === 'video',
        },
        treatNotFoundAsNull: true,
      });
      const rawBase64 = this.extractBase64FromMediaResponse(response);
      const base64 = this.normalizeBase64Payload(rawBase64);
      if (!base64) return null;

      const buffer = Buffer.from(base64, 'base64');
      if (!buffer.length) return null;

      const mimeType =
        this.extractMediaResponseMimeType(response) ||
        this.extractMimeTypeFromDataUri(rawBase64) ||
        this.normalizeOptionalString((mediaPayload as any).mimetype);
      const fileName =
        this.extractMediaResponseFileName(response) ||
        this.normalizeOptionalString((mediaPayload as any).fileName || (mediaPayload as any).title);
      const keyId = this.normalizeOptionalString(message?.key?.id || message?.id) || String(Date.now());
      const safeKey = keyId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || String(Date.now());
      const extension = this.mimeToExtension(mimeType, fileName);
      // P1.3: inbound grava direto no storage privado (nunca mais no public estático).
      const uploadDir = getInboxPrivateMediaDir();
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
      const filename = `${companyId}_${conversationId}_${safeKey}${extension}`;
      const publicUrl = `/uploads/inbox/${filename}`;
      writeFileSync(join(uploadDir, filename), buffer);

      return {
        kind: messageType as WebwhatsMediaType,
        url: publicUrl,
        previewUrl: publicUrl,
        mimeType,
        fileName,
        fileSize: buffer.length || this.normalizeStoredNumber((mediaPayload as any).fileLength),
        durationSeconds: this.normalizeStoredNumber((mediaPayload as any).seconds),
        isVoiceNote: Boolean((mediaPayload as any).ptt),
      };
    } catch (error: any) {
      this.logger.warn(
        `Webwhats media download falhou company=${companyId} conversation=${conversationId} message=${String(message?.key?.id || message?.id || '')}: ${String(error?.message || error)}`,
      );
      return null;
    }
  }

  private isThrottled(map: Map<number | string, number>, key: number | string, windowMs: number) {
    const lastRunAt = Number(map.get(key) || 0);
    return Date.now() - lastRunAt < windowMs;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T>(options: WebwhatsRequestOptions): Promise<T | null> {
    const config = this.readConfig();
    if (!config.enabled || !config.configured || !config.internalUrl || !config.apiKey) {
      throw new WebwhatsProviderError(
        'WEBWHATS_NOT_CONFIGURED',
        'Webwhats nao configurado.',
      );
    }

    const url = new URL(options.path.replace(/^\/+/, ''), `${config.internalUrl.replace(/\/+$/, '')}/`).toString();
    const timeout = Math.max(config.timeoutMs, Math.trunc(Number(options.timeoutOverrideMs) || 0));
    try {
      const response = await axios.request<T>({
        method: options.method,
        url,
        data: options.data,
        timeout,
        headers: {
          apikey: config.apiKey,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      });

      if (response.status === 404 && options.treatNotFoundAsNull) return null;
      if (response.status >= 200 && response.status < 300) return response.data ?? null;

      throw this.buildProviderErrorFromResponse(
        response.status,
        response.data,
        response.statusText,
        options.purpose,
      );
    } catch (error) {
      if (error instanceof WebwhatsProviderError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        throw this.mapAxiosError(error, options.purpose);
      }
      throw error;
    }
  }

  private async requestRead<T>(options: WebwhatsRequestOptions): Promise<T | null> {
    const retryDelaysMs = [0, 700, 1500];
    let lastError: unknown = null;

    for (const [attemptIndex, delayMs] of retryDelaysMs.entries()) {
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }

      try {
        return await this.request<T>(options);
      } catch (error) {
        lastError = error;
        const shouldRetry = attemptIndex < retryDelaysMs.length - 1 && this.isTransientReadError(error);
        if (!shouldRetry) {
          if (this.isTransientReadError(error)) {
            await this.markCompanyReconnectingForTransientReadError(options.path, error, options.purpose);
          }
          throw error;
        }
        const providerError = error instanceof WebwhatsProviderError ? error : null;
        this.logger.warn(
          `Webwhats leitura instavel durante ${options.purpose}; retry ${attemptIndex + 1}/${retryDelaysMs.length - 1} code=${providerError?.code || 'unknown'} status=${providerError?.statusCode ?? 'na'}`,
        );
      }
    }

    throw lastError;
  }

  private extractCompanyIdFromRequestPath(pathRaw: string) {
    const match = String(pathRaw || '').match(/(?:^|\/)company-(\d+)(?:\/|$)/i);
    const companyId = match ? Number(match[1]) : 0;
    return Number.isFinite(companyId) && companyId > 0 ? companyId : null;
  }

  private async markCompanyReconnectingForTransientReadError(pathRaw: string, error: unknown, purpose: string) {
    const companyId = this.extractCompanyIdFromRequestPath(pathRaw);
    if (!companyId) return;

    const providerError = error instanceof WebwhatsProviderError ? error : null;
    const message = String(
      providerError?.providerMessage
      || providerError?.message
      || (error instanceof Error ? error.message : '')
      || `Webwhats indisponivel durante ${purpose}.`,
    ).slice(0, 500);

    try {
      const result = await this.prisma.company.updateMany({
        where: {
          id: companyId,
          OR: [
            { whatsappModalStatus: 'CONNECTED' },
            { whatsappModalStatus: 'connected' },
          ],
        },
        data: {
          whatsappModalStatus: 'RECONNECTING',
          whatsappModalLastError: message,
          whatsappModalUpdatedAt: new Date(),
        },
      });
      if (result.count > 0) {
        this.logger.warn(
          `Webwhats instavel para company ${companyId}; status marcado como RECONNECTING durante ${purpose}: ${message}`,
        );
      }
    } catch (updateError: any) {
      this.logger.warn(
        `Falha ao marcar Webwhats como RECONNECTING para company ${companyId}: ${String(updateError?.message || updateError)}`,
      );
    }
  }

  private isTransientReadError(error: unknown) {
    if (!(error instanceof WebwhatsProviderError)) return false;
    if (error.code === 'WEBWHATS_TIMEOUT' || error.code === 'WEBWHATS_UNAVAILABLE') return true;
    if (error.code !== 'WEBWHATS_HTTP_ERROR') return false;
    return this.isTransientHttpStatus(error.statusCode);
  }

  private isTransientHttpStatus(statusCode: number | null | undefined) {
    return [
      408,
      425,
      429,
      500,
      502,
      503,
      504,
      520,
      521,
      522,
      523,
      524,
      598,
      599,
    ].includes(Number(statusCode || 0));
  }

  private mapAxiosError(error: AxiosError<unknown>, purpose: string) {
    const code = String(error.code || '').trim().toUpperCase();
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return new WebwhatsProviderError(
        'WEBWHATS_TIMEOUT',
        `Webwhats excedeu o tempo limite durante ${purpose}.`,
      );
    }

    if (!error.response) {
      return new WebwhatsProviderError(
        'WEBWHATS_UNAVAILABLE',
        `Webwhats indisponivel durante ${purpose}.`,
      );
    }

    return this.buildProviderErrorFromResponse(
      error.response.status,
      error.response.data,
      error.response.statusText,
      purpose,
    );
  }

  private buildProviderErrorFromResponse(
    statusCode: number,
    providerResponse: unknown,
    statusText: string | null | undefined,
    purpose: string,
  ) {
    const providerMessage =
      this.extractProviderMessage(providerResponse) ||
      this.normalizeOptionalString(statusText);
    return new WebwhatsProviderError(
      'WEBWHATS_HTTP_ERROR',
      providerMessage
        ? `Webwhats falhou durante ${purpose}: ${providerMessage}`
        : `Webwhats falhou durante ${purpose} (HTTP ${statusCode})`,
      statusCode,
      providerResponse,
      providerMessage,
    );
  }

  private extractProviderMessage(value: unknown) {
    if (typeof value === 'string') {
      return this.normalizeOptionalString(value);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const candidateObjects = [
      value,
      (value as any).response,
      (value as any).data,
      (value as any).result,
      (value as any).error_data,
    ];

    for (const candidate of candidateObjects) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const message = this.normalizeOptionalString(
        (candidate as any).message ||
          (candidate as any).error ||
          (candidate as any).detail ||
          (candidate as any).details ||
          (candidate as any).reason ||
          (candidate as any).title ||
          (candidate as any).error_user_msg ||
          (candidate as any).error_user_title,
      );
      if (message) return message;
    }

    return null;
  }

  private asWebwhatsProviderError(error: unknown) {
    return error instanceof WebwhatsProviderError ? error : null;
  }

  public async fetchChatsFast(
    companyId: number,
    opts?: { limit?: number; cursor?: string | null },
    tenantKeyHint?: string,
  ): Promise<WebwhatsFastChatListResult> {
    const limit = this.clamp(Number(opts?.limit || 60), 1, 120);
    const cursor = this.normalizeOptionalString(opts?.cursor);
    const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
    const cacheKey = `${tenantKey}:${limit}:${cursor || ''}`;
    const cached = this.getCachedChatList(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.requestRead<any>({
        method: 'POST',
        path: `/chat/findChatsFast/${encodeURIComponent(tenantKey)}`,
        purpose: 'listagem rapida de chats',
        data: {
          take: limit,
          ...(cursor ? { cursor } : {}),
        },
      });
      const result = this.normalizeFastChatListResponse(response, 'fast');
      this.setCachedChatList(cacheKey, result);
      return result;
    } catch (error: any) {
      const providerError = error instanceof WebwhatsProviderError ? error : null;
      this.logger.warn(
        `Webwhats chat list fast indisponivel company=${companyId}; fallback=legacy code=${providerError?.code || 'unknown'} status=${providerError?.statusCode ?? 'na'}`,
      );
      const records = await this.fetchChats(companyId, limit, tenantKey);
      const result: WebwhatsFastChatListResult = {
        records,
        nextCursor: null,
        hasMore: records.length >= limit,
        source: 'legacy',
      };
      this.setCachedChatList(cacheKey, result);
      return result;
    }
  }

  private async fetchChats(companyId: number, limit: number, tenantKeyHint?: string) {
    const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/chat/findChats/${encodeURIComponent(tenantKey)}`,
      purpose: 'sincronizacao de chats',
      data: { take: this.clamp(limit, 1, 120) },
    });
    return Array.isArray(response) ? (response as WebwhatsChatSummary[]) : [];
  }

  public async fetchPresence(
    companyId: number,
    remoteJidRaw: string,
    tenantKeyHint?: string,
  ): Promise<WebwhatsPresenceSnapshot> {
    const remoteJid = this.normalizeRemoteJid(String(remoteJidRaw || ''));
    if (!remoteJid) return this.buildUnknownPresenceSnapshot('');

    const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
    const cacheKey = `${tenantKey}:${remoteJid}`;
    const cached = this.getCachedPresence(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.requestRead<any>({
        method: 'GET',
        path: `/chat/presence/${encodeURIComponent(tenantKey)}?remoteJid=${encodeURIComponent(remoteJid)}`,
        purpose: 'consulta de presenca Webwhats',
      });
      const snapshot = this.normalizePresenceSnapshot(response, remoteJid);
      this.setCachedPresence(cacheKey, snapshot);
      return snapshot;
    } catch (error: any) {
      const providerError = error instanceof WebwhatsProviderError ? error : null;
      this.logger.warn(
        `Webwhats presence indisponivel company=${companyId} remoteJid=${remoteJid}; code=${providerError?.code || 'unknown'} status=${providerError?.statusCode ?? 'na'}`,
      );
      const snapshot = this.buildUnknownPresenceSnapshot(remoteJid);
      this.setCachedPresence(cacheKey, snapshot);
      return snapshot;
    }
  }

  private getCachedChatList(cacheKey: string) {
    const cached = this.chatListCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.chatListCache.delete(cacheKey);
      return null;
    }
    return cached.value;
  }

  private setCachedChatList(cacheKey: string, value: WebwhatsFastChatListResult) {
    this.chatListCache.set(cacheKey, {
      expiresAt: Date.now() + 5000,
      value,
    });
    if (this.chatListCache.size > 200) {
      for (const [key, cached] of this.chatListCache) {
        if (Date.now() > cached.expiresAt) this.chatListCache.delete(key);
      }
    }
  }

  private getCachedPresence(cacheKey: string) {
    const cached = this.presenceCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.presenceCache.delete(cacheKey);
      return null;
    }
    return cached.value;
  }

  private setCachedPresence(cacheKey: string, value: WebwhatsPresenceSnapshot) {
    this.presenceCache.set(cacheKey, {
      expiresAt: Date.now() + 10000,
      value,
    });
    if (this.presenceCache.size > 2000) {
      for (const [key, cached] of this.presenceCache) {
        if (Date.now() > cached.expiresAt) this.presenceCache.delete(key);
      }
    }
  }

  private normalizeFastChatListResponse(response: any, source: 'fast' | 'legacy'): WebwhatsFastChatListResult {
    const envelope = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
    const rows = Array.isArray(response)
      ? response
      : Array.isArray(envelope.records)
        ? envelope.records
        : [];
    const records = rows
      .map((row) => this.normalizeFastChatSummary(row))
      .filter((row): row is WebwhatsChatSummary => Boolean(row?.remoteJid));

    return {
      records,
      nextCursor: this.normalizeOptionalString(envelope.nextCursor),
      hasMore:
        typeof envelope.hasMore === 'boolean'
          ? Boolean(envelope.hasMore)
          : Boolean(this.normalizeOptionalString(envelope.nextCursor)),
      source,
    };
  }

  private normalizeFastChatSummary(row: any): WebwhatsChatSummary | null {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const remoteJid = this.normalizeOptionalString(row.remoteJid);
    if (!remoteJid) return null;

    const lastMessageTimestamp = row.lastMessageTimestamp ?? row.lastMessage?.messageTimestamp ?? null;
    const lastMessageId =
      this.normalizeOptionalString(row.lastMessageId || row.lastMessage?.id || row.lastMessage?.key?.id)
      || (lastMessageTimestamp ? `fast:${remoteJid}:${lastMessageTimestamp}` : null);
    const lastMessageType =
      this.normalizeOptionalString(row.lastMessageType || row.lastMessage?.messageType) || 'conversation';
    const lastMessageTextPreview = this.normalizeOptionalString(
      row.lastMessageTextPreview || row.lastMessagePreview || row.preview,
    );
    const hasSyntheticLastMessage = Boolean(lastMessageId || lastMessageTextPreview || lastMessageTimestamp);
    const lastMessage =
      row.lastMessage ||
      (hasSyntheticLastMessage
        ? {
            id: lastMessageId,
            key: {
              id: lastMessageId,
              remoteJid,
              fromMe: Boolean(row.fromMe),
            },
            pushName: this.normalizeOptionalString(row.pushName || row.displayName),
            messageType: lastMessageType,
            message: lastMessageTextPreview ? { conversation: lastMessageTextPreview } : null,
            messageTimestamp: lastMessageTimestamp,
            status: null,
          }
        : null);

    return {
      ...row,
      remoteJid,
      lastMessageId,
      lastMessageType,
      lastMessageTextPreview,
      lastMessageTimestamp,
      lastMessage,
    };
  }

  private normalizePresenceSnapshot(response: any, remoteJid: string): WebwhatsPresenceSnapshot {
    const payload = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
    const presence = this.normalizePresenceValue(payload.presence);
    return {
      remoteJid: this.normalizeRemoteJid(String(payload.remoteJid || remoteJid || '')) || remoteJid,
      presence,
      online: this.normalizeOptionalBoolean(payload.online) ?? ['online', 'composing', 'recording', 'paused'].includes(presence),
      typing: this.normalizeOptionalBoolean(payload.typing) ?? presence === 'composing',
      recording: this.normalizeOptionalBoolean(payload.recording) ?? presence === 'recording',
      lastSeenAt: this.normalizeIsoDateString(payload.lastSeenAt),
      updatedAt: this.normalizeIsoDateString(payload.updatedAt),
    };
  }

  private normalizePresenceValue(value: unknown): WebwhatsPresenceValue {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'online') return 'online';
    if (normalized === 'offline') return 'offline';
    if (normalized === 'composing') return 'composing';
    if (normalized === 'recording') return 'recording';
    if (normalized === 'paused') return 'paused';
    return 'unknown';
  }

  private normalizeIsoDateString(value: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private buildUnknownPresenceSnapshot(remoteJid: string): WebwhatsPresenceSnapshot {
    return {
      remoteJid,
      presence: 'unknown',
      online: false,
      typing: false,
      recording: false,
      lastSeenAt: null,
      updatedAt: null,
    };
  }

  private async enrichLiveChatsWithPresence<T extends WebwhatsLiveChatSnapshot>(
    companyId: number,
    snapshots: T[],
    tenantKeyHint?: string,
  ) {
    return Promise.all(snapshots.map((snapshot) => this.enrichLiveChatWithPresence(companyId, snapshot, tenantKeyHint)));
  }

  private async enrichLiveChatWithPresence<T extends WebwhatsLiveChatSnapshot>(
    companyId: number,
    snapshot: T,
    tenantKeyHint?: string,
  ) {
    if (!snapshot?.remoteJid) return snapshot;
    const presence = await this.fetchPresence(companyId, snapshot.remoteJid, tenantKeyHint);
    return this.withPresenceMetadata({
      ...snapshot,
      presence,
    });
  }

  private withPresenceMetadata<T extends WebwhatsLiveChatSnapshot>(snapshot: T): T {
    if (!snapshot?.presence) return snapshot;
    const metadata = this.parseMetadata(snapshot.conversation?.metadata);
    const presenceMetadata = this.buildPresenceMetadata(snapshot.presence);
    const mergedMetadata = JSON.stringify({
      ...metadata,
      ...presenceMetadata,
    });

    return {
      ...snapshot,
      conversation: {
        ...snapshot.conversation,
        metadata: mergedMetadata,
      },
    };
  }

  private buildPresenceMetadata(presence: WebwhatsPresenceSnapshot) {
    const statusLabel =
      presence.presence === 'recording'
        ? 'gravando audio...'
        : presence.presence === 'paused'
          ? 'pausado'
          : null;

    return {
      presenceOnline: Boolean(presence.online),
      whatsappOnline: Boolean(presence.online),
      presenceTyping: Boolean(presence.typing),
      whatsappTyping: Boolean(presence.typing),
      presenceRecording: Boolean(presence.recording),
      whatsappRecording: Boolean(presence.recording),
      presenceStatus: null,
      whatsappPresenceStatus: null,
      lastSeenAt: null,
      whatsappLastSeenAt: null,
      lastPresenceAt: null,
      whatsappPresenceUpdatedAt: null,
      ...(statusLabel
        ? {
            presenceStatus: statusLabel,
            whatsappPresenceStatus: statusLabel,
          }
        : {}),
      ...(presence.lastSeenAt
        ? {
            lastSeenAt: presence.lastSeenAt,
            whatsappLastSeenAt: presence.lastSeenAt,
          }
        : {}),
      ...(presence.updatedAt
        ? {
            lastPresenceAt: presence.updatedAt,
            whatsappPresenceUpdatedAt: presence.updatedAt,
          }
        : {}),
    };
  }

  private async fetchContacts(companyId: number, tenantKeyHint?: string) {
    const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/chat/findContacts/${encodeURIComponent(tenantKey)}`,
      purpose: 'sincronizacao de contatos',
      data: {},
    });
    return Array.isArray(response) ? (response as WebwhatsContactSummary[]) : [];
  }

  private async getCachedContacts(companyId: number, tenantKeyHint?: string) {
    const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
    const cacheAgeMs = 5 * 60 * 1000;
    if (this.isThrottled(this.contactSyncAt, tenantKey, cacheAgeMs)) {
      return this.contactCache.get(tenantKey) || [];
    }
    const contacts = await this.fetchContacts(companyId, tenantKey);
    this.contactSyncAt.set(tenantKey, Date.now());
    this.contactCache.set(tenantKey, contacts);
    return contacts;
  }

  private indexContactsByJid(contacts: WebwhatsContactSummary[]) {
    const byJid = new Map<string, WebwhatsContactSummary>();
    for (const contact of contacts) {
      const remoteJid = this.normalizeOptionalString(contact?.remoteJid);
      if (!remoteJid) continue;
      byJid.set(remoteJid, contact);
    }
    return byJid;
  }

  private async fetchMessagesPage(
    companyId: number,
    remoteJid: string,
    opts: {
      limit: number;
      page: number;
      matchRemoteJidAlt?: boolean;
    },
    tenantKeyHint?: string,
  ) {
    const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/chat/findMessages/${encodeURIComponent(tenantKey)}`,
      purpose: 'sincronizacao de mensagens',
      data: {
        where: {
          key: {
            [opts.matchRemoteJidAlt ? 'remoteJidAlt' : 'remoteJid']: remoteJid,
          },
        },
        offset: this.clamp(opts.limit, 1, 120),
        page: this.clamp(opts.page, 1, 1000),
      },
    });
    const envelope =
      response?.messages && typeof response.messages === 'object' && !Array.isArray(response.messages)
        ? response.messages
        : response && typeof response === 'object' && !Array.isArray(response)
          ? response
          : {};
    const records = Array.isArray((envelope as any).records)
      ? ((envelope as any).records as WebwhatsFetchedMessage[])
      : [];

    return {
      records,
      totalPages: Number((envelope as any).totalPages || (envelope as any).pages || 0) || null,
      currentPage: Number((envelope as any).currentPage || (envelope as any).page || opts.page) || opts.page,
      totalRecords: Number((envelope as any).totalRecords || (envelope as any).count || 0) || null,
      hasNextPage:
        typeof (envelope as any).hasNextPage === 'boolean'
          ? Boolean((envelope as any).hasNextPage)
          : null,
    };
  }

  private async fetchMessagesWindow(
    companyId: number,
    remoteJid: string,
    opts: {
      limit: number;
      fullSync?: boolean;
      maxPages?: number;
      matchRemoteJidAlt?: boolean;
    },
    tenantKeyHint?: string,
  ) {
    const limit = this.clamp(Number(opts.limit || 120), 1, 120);
    const maxPages = this.clamp(Number(opts.maxPages || (opts.fullSync ? 80 : 1)), 1, 120);
    const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
    const messageByKey = new Map<string, WebwhatsFetchedMessage>();
    let pagesFetched = 0;
    let discoveredTotalPages: number | null = null;

    for (let page = 1; page <= maxPages; page += 1) {
      const pagePayload = await this.fetchMessagesPage(companyId, remoteJid, {
        limit,
        page,
        matchRemoteJidAlt: opts.matchRemoteJidAlt,
      }, tenantKey);
      pagesFetched += 1;
      if (Number.isFinite(Number(pagePayload.totalPages || 0)) && Number(pagePayload.totalPages || 0) > 0) {
        discoveredTotalPages = Number(pagePayload.totalPages || 0);
      }

      let pageInserted = 0;
      for (const message of pagePayload.records) {
        const key =
          this.normalizeOptionalString(message?.key?.id || message?.id)
          || this.normalizeOptionalString([
            message?.messageTimestamp,
            message?.key?.fromMe ? '1' : '0',
            this.normalizeMessageType(message),
          ].join(':'));
        if (!key) continue;
        if (!messageByKey.has(key)) {
          pageInserted += 1;
        }
        messageByKey.set(key, message);
      }

      if (!opts.fullSync) {
        break;
      }
      if (!pagePayload.records.length) {
        break;
      }
      if (pageInserted === 0 && page > 1) {
        break;
      }
      if (pagePayload.hasNextPage === false) {
        break;
      }
      if (discoveredTotalPages && page >= discoveredTotalPages) {
        break;
      }
      if (pagePayload.records.length < limit && !discoveredTotalPages) {
        break;
      }
    }

    return {
      records: Array.from(messageByKey.values()),
      pagesFetched,
    };
  }

  private async fetchProfilePicture(companyId: number, remoteJid: string, tenantKeyHint?: string) {
    const tenantKey = this.normalizeOptionalString(tenantKeyHint) || (await this.resolveMotorTenantKey(companyId));
    return this.requestRead<any>({
      method: 'POST',
      path: `/chat/fetchProfilePictureUrl/${encodeURIComponent(tenantKey)}`,
      purpose: 'busca de foto de perfil',
      data: { number: remoteJid },
      treatNotFoundAsNull: true,
    });
  }

  // Cache de foto de perfil POR CONTEÚDO (à prova de piscada E de desatualização).
  // A URL do WhatsApp (pps.whatsapp.net) é assinada e EXPIRA — repassá-la crua faz a
  // foto sumir quando vence e trocar de assinatura a cada busca (pisca). Aqui baixamos
  // os bytes UMA vez e servimos local/estável em /uploads/avatars. A chave é o CAMINHO
  // da URL (sem a query que rota): mesmo path = mesma foto (não re-baixa); o cliente
  // trocou a foto → o WhatsApp devolve um path novo → chave nova → baixa a nova (NÃO
  // fica desatualizado: a identidade do arquivo é o conteúdo). Falha (URL vencida/rede)
  // → null, e o chamador cai na URL crua (nunca pior que hoje).
  // Deriva nome de arquivo/caminho local a partir do path da URL (sem query), igual ao
  // esquema de cache por conteúdo: mesmo path = mesmo arquivo.
  private resolveAvatarCachePath(cdnUrl: string): { filePath: string; publicUrl: string } | null {
    let pathname: string;
    try {
      pathname = new URL(cdnUrl).pathname;
    } catch {
      return null;
    }
    const rawExt = extname(pathname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const ext = /^\.(jpe?g|png|webp|gif)$/.test(rawExt) ? rawExt : '.jpg';
    const filename = `${createHash('sha1').update(pathname).digest('hex')}${ext}`;
    const dir = getBackendPublicUploadDir('avatars');
    return { filePath: join(dir, filename), publicUrl: `/uploads/avatars/${filename}` };
  }

  // Checagem SÍNCRONA e barata (só stat em disco, sem rede): usada no hot path da lista
  // (Fix 1) pra decidir se já dá pra servir o local sem esperar nada.
  private resolveCachedAvatarPathSync(cdnUrl: string | null | undefined): string | null {
    const url = this.normalizeOptionalString(cdnUrl);
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const resolved = this.resolveAvatarCachePath(url);
    if (!resolved) return null;
    return existsSync(resolved.filePath) ? resolved.publicUrl : null;
  }

  private async cacheProfilePictureLocally(cdnUrl: string | null | undefined): Promise<string | null> {
    const url = this.normalizeOptionalString(cdnUrl);
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const resolved = this.resolveAvatarCachePath(url);
    if (!resolved) return null;
    const { filePath, publicUrl } = resolved;
    if (existsSync(filePath)) return publicUrl; // mesma foto já em disco → não re-baixa
    try {
      const dir = getBackendPublicUploadDir('avatars');
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: 8 * 1024 * 1024,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
      if (contentType && !contentType.startsWith('image/')) return null;
      const buffer = Buffer.from(res.data as ArrayBuffer);
      if (!buffer.length) return null;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, buffer);
      return publicUrl;
    } catch {
      return null;
    }
  }

  // Dispara o download/cache em BACKGROUND (não aguardado) pra convergir a lista pro local nas
  // próximas leituras, sem bloquear o hot path (Fix 1, PR05072026). Teto de concorrência simples
  // (Set + contador) pra não abrir N requests simultâneos ao motor/CDN quando a lista tem muitos
  // chats sem cache ainda; URL já em voo ou acima do teto é ignorada nesta passada (tenta na próxima
  // leitura da lista).
  private scheduleAvatarBackgroundCache(cdnUrl: string | null | undefined): void {
    const url = this.normalizeOptionalString(cdnUrl);
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (this.avatarBackgroundInFlight.has(url)) return;
    if (this.avatarBackgroundInFlight.size >= WebwhatsBridgeService.AVATAR_BACKGROUND_MAX_CONCURRENCY) return;
    this.avatarBackgroundInFlight.add(url);
    this.cacheProfilePictureLocally(url)
      .catch(() => null)
      .finally(() => this.avatarBackgroundInFlight.delete(url));
  }

  async refreshConversationProfilePicture(
    companyId: number,
    remoteJid: string,
    tenantKeyHint?: string,
  ): Promise<string | null> {
    const normalizedRemoteJid = this.normalizeOptionalString(remoteJid);
    if (!normalizedRemoteJid) return null;
    try {
      const result = await this.fetchProfilePicture(companyId, normalizedRemoteJid, tenantKeyHint);
      const url = this.normalizeOptionalString(result?.profilePictureUrl) || null;
      if (!url) return null;
      // Serve local/estável: mesmo conteúdo = mesmo arquivo; foto trocada = arquivo novo.
      return (await this.cacheProfilePictureLocally(url)) ?? url;
    } catch {
      return null;
    }
  }

  private getChatRemoteJidAlt(chat: WebwhatsChatSummary) {
    const remoteJid = this.normalizeOptionalString(chat?.remoteJid);
    const remoteJidAlt = this.normalizeOptionalString(
      chat?.lastMessage?.key?.remoteJidAlt ||
      chat?.lastMessage?.remoteJidAlt ||
      (chat as any)?.remoteJidAlt,
    );
    if (!remoteJidAlt || !this.isSyncableChat(remoteJidAlt)) return null;
    if (this.isPhoneRemoteJid(remoteJid)) {
      const remoteDigits = this.extractRemoteJidPhoneDigits(remoteJid);
      const altDigits = this.extractRemoteJidPhoneDigits(remoteJidAlt);
      if (remoteDigits && altDigits && remoteDigits !== altDigits) return null;
    }
    return remoteJidAlt;
  }

  private getMessageRemoteJidAlt(message: WebwhatsFetchedMessage) {
    return this.normalizeOptionalString(message?.key?.remoteJidAlt);
  }

  private getChatDisplayName(
    chat: WebwhatsChatSummary,
    primaryContact?: WebwhatsContactSummary | null,
    alternateContact?: WebwhatsContactSummary | null,
  ) {
    return this.resolveChatDisplayNames(chat, primaryContact, alternateContact).displayName;
  }

  private firstDisplayNameCandidate(candidates: Array<unknown>) {
    for (const candidate of candidates) {
      const normalized = this.normalizeDisplayNameCandidate(candidate);
      if (normalized) return normalized;
    }

    return null;
  }

  private getContactAgendaDisplayName(contact?: WebwhatsContactSummary | null) {
    if (!contact || contact.isSaved === false) return null;
    return this.firstDisplayNameCandidate([
      contact.name,
      contact.displayName,
      contact.formattedName,
      contact.fullName,
      contact.shortName,
    ]);
  }

  private getChatAgendaDisplayName(
    chat: WebwhatsChatSummary,
    primaryContact?: WebwhatsContactSummary | null,
    alternateContact?: WebwhatsContactSummary | null,
  ) {
    if (this.isGroupRemoteJid(chat?.remoteJid)) {
      return this.firstDisplayNameCandidate([
        chat?.name,
        chat?.displayName,
        (chat as any)?.subject,
        (chat as any)?.formattedName,
      ]);
    }
    return this.firstDisplayNameCandidate([
      this.getContactAgendaDisplayName(primaryContact),
      this.getContactAgendaDisplayName(alternateContact),
    ]);
  }

  private getChatProfileDisplayName(
    chat: WebwhatsChatSummary,
    primaryContact?: WebwhatsContactSummary | null,
    alternateContact?: WebwhatsContactSummary | null,
  ) {
    return this.firstDisplayNameCandidate([
      chat?.lastMessage?.pushName,
      chat?.pushName,
      chat?.contact?.pushName,
      chat?.notifyName,
      chat?.contact?.notifyName,
      chat?.displayName,
      chat?.contact?.displayName,
      chat?.name,
      chat?.contact?.name,
      chat?.fullName,
      chat?.contact?.fullName,
      chat?.contact?.formattedName,
      chat?.shortName,
      chat?.contact?.shortName,
      chat?.verifiedName,
      chat?.contact?.verifiedName,
      chat?.businessName,
      chat?.contact?.businessName,
      primaryContact?.pushName,
      primaryContact?.notifyName,
      primaryContact?.verifiedName,
      primaryContact?.businessName,
      alternateContact?.pushName,
      alternateContact?.notifyName,
      alternateContact?.verifiedName,
      alternateContact?.businessName,
    ]);
  }

  private resolveChatDisplayNames(
    chat: WebwhatsChatSummary,
    primaryContact?: WebwhatsContactSummary | null,
    alternateContact?: WebwhatsContactSummary | null,
  ) {
    const agendaDisplayName = this.getChatAgendaDisplayName(chat, primaryContact, alternateContact);
    const profileDisplayName = this.getChatProfileDisplayName(chat, primaryContact, alternateContact);
    return {
      agendaDisplayName,
      profileDisplayName,
      displayName: agendaDisplayName || profileDisplayName || null,
    };
  }

  private applyDisplayNamesToMetadata(
    metadata: Record<string, any>,
    displayNames?: {
      displayName?: string | null;
      agendaDisplayName?: string | null;
      profileDisplayName?: string | null;
    } | null,
  ) {
    const nextMetadata = metadata || {};
    const agendaDisplayName = this.normalizeDisplayNameCandidate(displayNames?.agendaDisplayName);
    const profileDisplayName = this.normalizeDisplayNameCandidate(displayNames?.profileDisplayName);
    const displayName = this.normalizeDisplayNameCandidate(displayNames?.displayName)
      || agendaDisplayName
      || profileDisplayName;
    if (agendaDisplayName) {
      nextMetadata.whatsappContactName = agendaDisplayName;
    }
    if (profileDisplayName) {
      nextMetadata.whatsappProfileName = profileDisplayName;
      nextMetadata.waNickname = profileDisplayName;
    }
    if (displayName) {
      nextMetadata.whatsappName = displayName;
    }
    return nextMetadata;
  }

  private getPersistedDisplayName(metadata: Record<string, any> | null | undefined) {
    if (!metadata || typeof metadata !== 'object') return null;

    const candidates = [
      metadata.whatsappContactName,
      metadata.whatsappProfileName,
      metadata.waNickname,
      metadata.whatsappName,
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeDisplayNameCandidate(candidate);
      if (normalized) return normalized;
    }

    return null;
  }

  private normalizeDisplayNameCandidate(value: unknown) {
    const normalized = this.normalizeOptionalString(value)
      ?.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .trim() || null;
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
    if (/^\d{10,13}$/.test(normalized.replace(/\D/g, ''))) {
      return null;
    }
    if (/^\d{14,}$/.test(normalized.replace(/\s+/g, ''))) {
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

  private resolvePreferredConversationContact(...candidates: Array<string | null | undefined>) {
    for (const candidate of candidates) {
      const raw = String(candidate || '').trim().toLowerCase();
      if (!raw || raw.includes('@g.us') || raw.includes('@lid') || raw.includes('@broadcast')) {
        continue;
      }
      const normalizedPhone = normalizeWhatsAppPhone(raw);
      if (normalizedPhone) return normalizedPhone;
    }

    for (const candidate of candidates) {
      const normalized = this.normalizeOptionalString(candidate);
      if (normalized) return normalized;
    }

    return '';
  }

  private async consolidateDuplicateConversations(
    companyId: number,
    rows: Array<
      WebwhatsConversationStateRow & {
        lastMessageAt: Date | null;
        lastInteractionAt: Date | null;
      }
    >,
    preferredContact: string,
    remoteJid: string,
    remoteJidAlt: string | null,
  ): Promise<WebwhatsConversationStateRow | null> {
    if (rows.length <= 1) return rows[0] || null;

    const preferredResolvedContact = this.resolvePreferredConversationContact(
      preferredContact,
      remoteJid,
      remoteJidAlt,
    );
    const exactPreferred = rows.find((row) => String(row.contact || '') === preferredResolvedContact);
    const phoneContact = rows.find((row) => this.isPreferredPhoneContact(row.contact));
    const canonical =
      (this.isPreferredPhoneContact(preferredResolvedContact) ? exactPreferred : null) ||
      phoneContact ||
      rows.find((row) => row.humanAssigned) ||
      exactPreferred ||
      rows[0];
    const canonicalContact = this.resolveStateContact(
      preferredResolvedContact,
      canonical.contact,
      remoteJid,
      remoteJidAlt,
    );
    const duplicates = rows.filter((row) => row.id !== canonical.id);
    if (!duplicates.length) return canonical;

    const mergedMetadata: Record<string, any> = {};
    for (const row of [...duplicates, canonical]) {
      const parsed = this.parseMetadata(row.metadata);
      for (const [key, value] of Object.entries(parsed || {})) {
        if (value === undefined || value === null || value === '') continue;
        if (mergedMetadata[key] === undefined || mergedMetadata[key] === null || mergedMetadata[key] === '') {
          mergedMetadata[key] = value;
        }
      }
    }

    const normalizedRemoteJid = this.normalizeOptionalString(remoteJid);
    const normalizedRemoteJidAlt = this.normalizeOptionalString(remoteJidAlt);
    if (normalizedRemoteJid) mergedMetadata.whatsappRemoteJid = normalizedRemoteJid;
    if (normalizedRemoteJidAlt) mergedMetadata.whatsappRemoteJidAlt = normalizedRemoteJidAlt;

    const lastMessageAt = rows.reduce<Date | null>((latest, row) => {
      if (!row.lastMessageAt) return latest;
      if (!latest || row.lastMessageAt.getTime() > latest.getTime()) return row.lastMessageAt;
      return latest;
    }, canonical.lastMessageAt || null);
    const lastInteractionAt = rows.reduce<Date | null>((latest, row) => {
      if (!row.lastInteractionAt) return latest;
      if (!latest || row.lastInteractionAt.getTime() > latest.getTime()) return row.lastInteractionAt;
      return latest;
    }, canonical.lastInteractionAt || null);

    this.logger.warn(
      `Consolidating duplicate WhatsApp conversations for company=${companyId}, canonical=${canonical.id}, duplicates=${duplicates.map((row) => row.id).join(',')}`,
    );

    return this.prisma.$transaction(async (tx) => {
      const duplicateIds = duplicates.map((row) => row.id);
      if (duplicateIds.length) {
        await tx.companyMessage.updateMany({
          where: { conversationId: { in: duplicateIds } },
          data: { conversationId: canonical.id },
        });
        await tx.companyConversation.deleteMany({
          where: { id: { in: duplicateIds } },
        });
      }

      return tx.companyConversation.update({
        where: { id: canonical.id },
        data: {
          ...(canonicalContact && canonicalContact !== String(canonical.contact || '')
            ? { contact: canonicalContact }
            : {}),
          metadata: JSON.stringify(mergedMetadata),
          ...(lastMessageAt ? { lastMessageAt } : {}),
          ...(lastInteractionAt ? { lastInteractionAt } : {}),
        },
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
        },
      });
    });
  }

  private async upsertConversationStateFromChat(
    companyId: number,
    session: WebwhatsConnectionSessionContext,
    chat: WebwhatsChatSummary,
    primaryContact?: WebwhatsContactSummary | null,
    alternateContact?: WebwhatsContactSummary | null,
  ) {
    const remoteJid = this.normalizeOptionalString(chat.remoteJid);
    if (!remoteJid) return null;

    const remoteJidAlt = this.getChatRemoteJidAlt(chat);
    const preferredContact = this.resolvePreferredConversationContact(remoteJidAlt, remoteJid);
    const lastMessageAt =
      this.resolveMessageDate(chat?.lastMessage?.messageTimestamp || chat?.updatedAt)
      || null;
    const existing = await this.findConversation(companyId, session.id, remoteJid, remoteJidAlt, preferredContact);
    const contact = this.resolveStateContact(preferredContact, existing?.contact, remoteJid, remoteJidAlt);
    const displayNames = this.resolveChatDisplayNames(chat, primaryContact || null, alternateContact || null);
    const displayName = displayNames.displayName || this.getPersistedDisplayName(this.parseMetadata(existing?.metadata)) || null;
    const avatarUrl =
      this.normalizeOptionalString(chat?.profilePicUrl)
      || this.normalizeOptionalString(primaryContact?.profilePicUrl)
      || this.normalizeOptionalString(alternateContact?.profilePicUrl)
      || this.normalizeOptionalString(this.parseMetadata(existing?.metadata)?.whatsappAvatarUrl)
      || null;
    const resolvedLastMessageAt = lastMessageAt || existing?.lastMessageAt || null;
    const lastInteractionAt = resolvedLastMessageAt || existing?.lastInteractionAt || null;
    const metadata = this.buildConversationStateMetadata(
      this.parseMetadata(existing?.metadata),
      remoteJid,
      remoteJidAlt,
      {
        displayName,
        agendaDisplayName: displayNames.agendaDisplayName,
        profileDisplayName: displayNames.profileDisplayName,
        avatarUrl,
        unreadCount: Math.max(0, Number(chat?.unreadCount || 0)),
        archived: this.resolveChatArchivedFlag(chat),
        windowActive:
          chat?.windowActive === undefined || chat?.windowActive === null
            ? null
            : Boolean(chat.windowActive),
      },
    );
    metadata.whatsappConnectionSessionId = session.id;
    metadata.sourcePhoneNormalized = session.phoneNormalized;
    metadata.sourceTenantKey = session.tenantKey;
    const serializedMetadata = JSON.stringify(metadata);
    const conversation = existing
      ? String(existing.contact || '') === contact
          && String(existing.metadata || '') === serializedMetadata
          && String(existing.lastMessageAt || '') === String(resolvedLastMessageAt || '')
          && String(existing.lastInteractionAt || '') === String(lastInteractionAt || '')
        ? existing
        : await this.prisma.companyConversation.update({
            where: { id: existing.id },
            data: {
              contact,
              whatsappConnectionSessionId: session.id,
              sourcePhoneNormalized: session.phoneNormalized,
              sourceTenantKey: session.tenantKey,
              metadata: serializedMetadata,
              ...(resolvedLastMessageAt ? { lastMessageAt: resolvedLastMessageAt } : {}),
              ...(lastInteractionAt ? { lastInteractionAt } : {}),
            },
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
              lastMessageAt: true,
              lastInteractionAt: true,
              createdAt: true,
              updatedAt: true,
            },
          })
      : await this.createConversationStateWithRetry(companyId, {
          contact,
          session,
          metadata: serializedMetadata,
          remoteJid,
          remoteJidAlt,
          lastMessageAt: resolvedLastMessageAt,
          lastInteractionAt,
        });

    return conversation;
  }

  private async upsertConversationFromChat(
    companyId: number,
    session: WebwhatsConnectionSessionContext,
    chat: WebwhatsChatSummary,
    primaryContact?: WebwhatsContactSummary | null,
    alternateContact?: WebwhatsContactSummary | null,
  ) {
    const conversation = await this.upsertConversationStateFromChat(
      companyId,
      session,
      chat,
      primaryContact,
      alternateContact,
    );
    if (!conversation) return null;

    const remoteJid = this.normalizeOptionalString(chat.remoteJid);
    const remoteJidAlt = this.getChatRemoteJidAlt(chat);

    if (chat.lastMessage) {
      await this.upsertConversationMessage(
        companyId,
        session,
        conversation.id,
        remoteJid || this.normalizeOptionalString(chat.remoteJid) || '',
        chat.lastMessage,
        remoteJidAlt,
      );
    }
    return conversation;
  }

  async ingestWebhookMessage(
    companyId: number,
    message: WebwhatsFetchedMessage,
    opts?: {
      remoteJid?: string | null;
      remoteJidAlt?: string | null;
      displayName?: string | null;
      profilePicUrl?: string | null;
      // POR USUÁRIO: instanceName cru do webhook (`company-{id}-user-{n}`) p/ atribuir o inbound
      // à sessão do user DONO do número — não à sessão genérica da empresa.
      tenantKey?: string | null;
      userId?: number | null;
    },
  ) {
    const session = await this.resolveCurrentWebwhatsSession(companyId, {
      tenantKey: opts?.tenantKey ?? null,
      userId: opts?.userId ?? null,
    });
    if (!session) {
      throw new WebwhatsProviderError(
        'WEBWHATS_NOT_CONNECTED',
        'WhatsApp sem sessão ativa',
      );
    }
    const remoteJid =
      this.normalizeOptionalString(message?.key?.remoteJid) ||
      this.normalizeOptionalString(opts?.remoteJid);
    if (!remoteJid) {
      throw new Error('WEBWHATS_WEBHOOK_REMOTE_JID_MISSING');
    }
    const remoteJidAlt =
      this.normalizeOptionalString(message?.key?.remoteJidAlt) ||
      this.normalizeOptionalString(opts?.remoteJidAlt);
    const timestamp = this.resolveMessageDate(message?.messageTimestamp) || new Date();
    const chat = {
      remoteJid,
      remoteJidAlt,
      lastMessage: message,
      updatedAt: timestamp,
      pushName:
        this.normalizeOptionalString(opts?.displayName) ||
        this.normalizeOptionalString(message?.pushName),
      profilePicUrl: this.normalizeOptionalString(opts?.profilePicUrl),
    } as WebwhatsChatSummary;

    const conversation = await this.upsertConversationStateFromChat(companyId, session, chat, null, null);
    if (!conversation) {
      throw new Error('WEBWHATS_WEBHOOK_CONVERSATION_UPSERT_FAILED');
    }

    const companyMessageId = await this.upsertConversationMessage(
      companyId,
      session,
      conversation.id,
      remoteJid,
      message,
      remoteJidAlt,
    );

    return {
      conversationId: Number(conversation.id || 0),
      companyMessageId: Number(companyMessageId || 0) || null,
      remoteJid,
      remoteJidAlt,
    };
  }

  private async createConversationStateWithRetry(
    companyId: number,
    input: {
      contact: string;
      session: WebwhatsConnectionSessionContext;
      metadata: string;
      remoteJid: string;
      remoteJidAlt: string | null;
      lastMessageAt?: Date | null;
      lastInteractionAt?: Date | null;
    },
  ) {
    const select = {
      id: true,
      contact: true,
      metadata: true,
      currentFlow: true,
      currentStep: true,
      flowResult: true,
      botActive: true,
      humanAssigned: true,
      assignedUserId: true,
      lastMessageAt: true,
      lastInteractionAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;

    try {
      return await this.prisma.companyConversation.create({
        data: {
          companyId,
          whatsappConnectionSessionId: input.session.id,
          sourcePhoneNormalized: input.session.phoneNormalized,
          sourceTenantKey: input.session.tenantKey,
          channel: 'whatsapp',
          contact: input.contact,
          botActive: false,
          metadata: input.metadata,
          ...(input.lastMessageAt ? { lastMessageAt: input.lastMessageAt } : {}),
          ...(input.lastInteractionAt ? { lastInteractionAt: input.lastInteractionAt } : {}),
        },
        select,
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const existing = await this.findConversation(
        companyId,
        input.session.id,
        input.remoteJid,
        input.remoteJidAlt,
        input.contact,
      );
      if (!existing) throw error;
      return existing;
    }
  }

  private buildConversationStateMetadata(
    metadata: Record<string, any>,
    remoteJid: string,
    remoteJidAlt: string | null,
    snapshot?: {
      displayName?: string | null;
      agendaDisplayName?: string | null;
      profileDisplayName?: string | null;
      avatarUrl?: string | null;
      unreadCount?: number | null;
      archived?: boolean | null;
      windowActive?: boolean | null;
    },
  ) {
    const nextMetadata = { ...(metadata || {}) };
    nextMetadata.whatsappRemoteJid = remoteJid;
    nextMetadata.whatsappIsGroup =
      this.isGroupRemoteJid(remoteJid) || this.isGroupRemoteJid(remoteJidAlt);
    if (remoteJidAlt) {
      nextMetadata.whatsappRemoteJidAlt = remoteJidAlt;
    }
    this.applyDisplayNamesToMetadata(nextMetadata, snapshot || null);
    if (snapshot?.avatarUrl) {
      nextMetadata.whatsappAvatarUrl = snapshot.avatarUrl;
    }
    if (snapshot?.windowActive !== undefined && snapshot?.windowActive !== null) {
      nextMetadata.whatsappWindowActive = Boolean(snapshot.windowActive);
    }
    if (snapshot?.unreadCount !== undefined && snapshot?.unreadCount !== null) {
      nextMetadata.whatsappUnreadCount = Math.max(0, Math.trunc(Number(snapshot.unreadCount || 0)));
    }
    if (snapshot?.archived !== undefined && snapshot?.archived !== null) {
      nextMetadata.whatsappArchived = Boolean(snapshot.archived);
    }
    return nextMetadata;
  }

  private isPreferredPhoneContact(value: unknown) {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized || normalized.includes('@')) return false;
    return Boolean(normalizeWhatsAppPhone(normalized));
  }

  private resolveStateContact(
    preferredContact: string,
    existingContact: string | null | undefined,
    remoteJid: string,
    remoteJidAlt: string | null,
  ) {
    return this.resolvePreferredConversationContact(
      this.isPreferredPhoneContact(existingContact) ? existingContact : null,
      preferredContact,
      remoteJidAlt,
      remoteJid,
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(error) && typeof error === 'object' && (error as any).code === 'P2002';
  }

  private async touchConversationActivityIfNewer(
    companyId: number,
    conversationId: number,
    timestamp: Date,
  ) {
    await this.prisma.companyConversation.updateMany({
      where: {
        id: conversationId,
        companyId,
        lastMessageAt: { lt: timestamp },
      },
      data: {
        lastMessageAt: timestamp,
        lastInteractionAt: timestamp,
      },
    });
  }

  private async findConversation(
    companyId: number,
    whatsappConnectionSessionId: string,
    remoteJid: string,
    remoteJidAlt: string | null,
    preferredContact: string,
  ): Promise<WebwhatsConversationStateRow | null> {
    const digits = String(remoteJid).replace(/\D/g, '');
    const altDigits = String(remoteJidAlt || '').replace(/\D/g, '');
    const candidates = buildWhatsAppPhoneCandidates(preferredContact);
    const messageContactCandidates = Array.from(
      new Set(
        [preferredContact, ...candidates]
          .map((value) => this.normalizeOptionalString(value))
          .filter(Boolean),
      ),
    ) as string[];
    const nonGroupConversationGuard = {
      NOT: [
        { contact: { contains: '@g.us' } },
        { metadata: { contains: '"whatsappIsGroup":true' } },
      ],
    };
    const metadataCandidates = Array.from(
      new Set(
        [remoteJid, remoteJidAlt]
          .map((value) => this.normalizeOptionalString(value))
          .filter(Boolean),
      ),
    ) as string[];
    const rows = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        whatsappConnectionSessionId,
        OR: [
          { contact: remoteJid },
          ...(remoteJidAlt ? [{ contact: remoteJidAlt }] : []),
          { contact: preferredContact },
          ...candidates.map((candidate) => ({ contact: candidate })),
          ...(digits ? [{ contact: { endsWith: digits } }] : []),
          ...(altDigits ? [{ contact: { endsWith: altDigits } }] : []),
          ...metadataCandidates.map((candidate) => ({ metadata: { contains: candidate } })),
          ...messageContactCandidates.map((candidate) => ({
            AND: [
              nonGroupConversationGuard,
              {
                messages: {
                  some: {
                    companyId,
                    whatsappConnectionSessionId,
                    contactId: candidate,
                  },
                },
              },
            ],
          })),
          ...(digits
            ? [{
                AND: [
                  nonGroupConversationGuard,
                  {
                    messages: {
                      some: {
                        companyId,
                        whatsappConnectionSessionId,
                        contactId: { endsWith: digits },
                      },
                    },
                  },
                ],
              }]
            : []),
          ...(altDigits
            ? [{
                AND: [
                  nonGroupConversationGuard,
                  {
                    messages: {
                      some: {
                        companyId,
                        whatsappConnectionSessionId,
                        contactId: { endsWith: altDigits },
                      },
                    },
                  },
                ],
              }]
            : []),
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
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
        lastMessageAt: true,
        lastInteractionAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!rows.length) {
      const fallbackRows = await this.prisma.companyConversation.findMany({
        where: {
          companyId,
          channel: 'whatsapp',
          OR: [
            { contact: preferredContact },
            ...candidates.map((candidate) => ({ contact: candidate })),
            ...(digits ? [{ contact: { endsWith: digits } }] : []),
            ...(altDigits ? [{ contact: { endsWith: altDigits } }] : []),
            ...metadataCandidates.map((candidate) => ({ metadata: { contains: candidate } })),
          ],
          AND: [
            nonGroupConversationGuard,
            {
              OR: [
                { metadata: { contains: '"vendasAgendaQueue"' } },
                { metadata: { contains: '"queueTarget":"prospeccao"' } },
                { metadata: { contains: '"routeTarget":"prospeccao"' } },
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
        orderBy: { lastMessageAt: 'desc' },
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
          lastMessageAt: true,
          lastInteractionAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!fallbackRows.length) return null;
      const exactFallback = fallbackRows.find((row) => String(row.contact || '') === preferredContact);
      const phoneFallback = fallbackRows.find((row) => this.isPreferredPhoneContact(row.contact));
      return exactFallback || phoneFallback || fallbackRows[0] || null;
    }
    const consolidated = await this.consolidateDuplicateConversations(
      companyId,
      rows,
      preferredContact,
      remoteJid,
      remoteJidAlt,
    );
    if (consolidated) return consolidated;
    const exactPreferred = rows.find((row) => String(row.contact || '') === preferredContact);
    if (exactPreferred) return exactPreferred;
    const phoneContact = rows.find((row) => this.isPreferredPhoneContact(row.contact));
    if (phoneContact) return phoneContact;
    const humanAssigned = rows.find((row) => row.humanAssigned);
    if (humanAssigned) return humanAssigned;
    return rows[0] || null;
  }

  private buildConversationContact(remoteJid: string) {
    if (String(remoteJid).includes('@s.whatsapp.net')) {
      return normalizeWhatsAppPhone(remoteJid) || remoteJid;
    }
    return remoteJid;
  }

  private buildArchiveLastMessagePayload(
    remoteJid: string,
    lastMessageRow:
      | {
          direction: string;
          providerMessageId: string | null;
          rawPayload: string | null;
          timestamp: Date;
        }
      | null
      | undefined,
  ) {
    const rawPayload = this.parseMetadata(lastMessageRow?.rawPayload);
    const rawKeyId =
      this.normalizeOptionalString(rawPayload?.key?.id) ||
      this.extractRawProviderMessageId(lastMessageRow?.providerMessageId);
    if (!rawKeyId) return null;
    return {
      key: {
        remoteJid:
          this.normalizeOptionalString(rawPayload?.key?.remoteJid) ||
          remoteJid,
        fromMe:
          rawPayload?.key?.fromMe === undefined || rawPayload?.key?.fromMe === null
            ? String(lastMessageRow?.direction || '').trim().toUpperCase() === 'OUTBOUND'
            : Boolean(rawPayload?.key?.fromMe),
        id: rawKeyId,
      },
      messageTimestamp: Math.floor(
        (lastMessageRow?.timestamp instanceof Date
          ? lastMessageRow.timestamp.getTime()
          : Date.now()) / 1000,
      ),
    };
  }

  private extractRawProviderMessageId(value: unknown) {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) return null;
    const match = normalized.match(/^webwhats:[^:]+:(.+)$/i);
    if (!match?.[1]) return normalized;
    const tail = String(match[1]).trim();
    const parts = tail.split(':');
    return parts.length > 1 ? parts.slice(1).join(':').trim() : tail;
  }

  private async markConversationMessageDeleted(
    companyId: number,
    input: {
      session?: WebwhatsConnectionSessionContext | null;
      conversationId: number;
      targetRawMessageId: string;
      deletedAt: Date;
      deletedBy: 'self' | 'contact';
      rawPayload?: unknown;
    },
  ) {
    const tenantKey = this.buildTenantKey(companyId);
    const targetProviderMessageId = this.buildProviderMessageId(tenantKey, input.targetRawMessageId);
    const legacyTargetProviderMessageId = this.buildSessionScopedProviderMessageId(
      tenantKey,
      input.targetRawMessageId,
      input.session?.id || null,
    );
    const existing =
      (await this.prisma.companyMessage.findUnique({
        where: { providerMessageId: targetProviderMessageId },
        select: {
          id: true,
          body: true,
          messageType: true,
          rawPayload: true,
          variablesJson: true,
        },
      })) ||
      (legacyTargetProviderMessageId
        ? await this.prisma.companyMessage.findFirst({
            where: {
              companyId,
              provider: 'WEBWHATS',
              providerMessageId: { in: [legacyTargetProviderMessageId] },
            },
            select: {
              id: true,
              body: true,
              messageType: true,
              rawPayload: true,
              variablesJson: true,
            },
          })
        : null);
    if (!existing?.id) return false;

    const variables = this.parseMetadata(existing.variablesJson);
    const deletedAtIso = input.deletedAt.toISOString();
    const revealUntil = new Date(input.deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const originalText =
      this.normalizeOptionalString(variables.deletedOriginalText) ||
      this.normalizeOptionalString(existing.body) ||
      null;
    const originalMessageType =
      this.normalizeOptionalString(variables.deletedOriginalMessageType) ||
      this.normalizeOptionalString(existing.messageType) ||
      null;

    await this.prisma.companyMessage.update({
      where: { id: existing.id },
      data: {
        body: '[mensagem apagada]',
        variablesJson: JSON.stringify({
          ...variables,
          isDeleted: true,
          deletedAt: deletedAtIso,
          deletedBy: input.deletedBy,
          deletedRevealUntil: revealUntil,
          deletedOriginalText: originalText,
          deletedOriginalMessageType: originalMessageType,
        }),
        ...(existing.rawPayload
          ? {}
          : {
              rawPayload: JSON.stringify(
                input.rawPayload && typeof input.rawPayload === 'object' ? input.rawPayload : {},
              ),
            }),
      },
    });
    return true;
  }

  private async upsertConversationMessage(
    companyId: number,
    session: WebwhatsConnectionSessionContext,
    conversationId: number,
    remoteJid: string,
    message: WebwhatsFetchedMessage,
    remoteJidAlt?: string | null,
    opts?: { downloadMedia?: boolean },
  ) {
    const protocolType = this.normalizeOptionalString(message?.message?.protocolMessage?.type)?.toUpperCase();
    const revokedMessageId = this.normalizeOptionalString(message?.message?.protocolMessage?.key?.id);
    const timestamp = this.resolveMessageDate(message?.messageTimestamp) || new Date();
    if (protocolType === 'REVOKE' && revokedMessageId) {
      await this.markConversationMessageDeleted(companyId, {
        session,
        conversationId,
        targetRawMessageId: revokedMessageId,
        deletedAt: timestamp,
        deletedBy: message?.key?.fromMe ? 'self' : 'contact',
        rawPayload: message || {},
      });
      await this.touchConversationActivityIfNewer(companyId, conversationId, timestamp);
      return 0;
    }

    const keyId = this.normalizeOptionalString(message?.key?.id || message?.id);
    const tenantKey = this.buildTenantKey(companyId);
    const rawProviderMessageId = keyId
      ? this.buildProviderMessageId(tenantKey, keyId)
      : null;
    const legacySessionProviderMessageId = keyId
      ? this.buildSessionScopedProviderMessageId(tenantKey, keyId, session.id)
      : null;
    const direction = message?.key?.fromMe ? 'OUTBOUND' : 'INBOUND';
    const normalizedIncoming = this.normalizeIncomingWhatsAppMessage(message);
    const messageType = normalizedIncoming.kind === 'interactive_received' ? 'interactive' : this.normalizeMessageType(message);
    const body = normalizedIncoming.text || this.extractMessageBody(message, messageType);
    if (!String(body || '').trim() || String(body || '').trim().toLowerCase() === '[mensagem sincronizada]') {
      return 0;
    }
    const status = this.normalizeStoredStatus(message, direction);
    const resolvedContact = this.buildConversationContact(remoteJidAlt || this.getMessageRemoteJidAlt(message) || remoteJid);
    const normalizedCustomerPhone = normalizeWhatsAppPhone(resolvedContact);
    const existingMessage = rawProviderMessageId
      ? await this.findExistingWebwhatsMessageByProviderId(
          companyId,
          rawProviderMessageId,
          legacySessionProviderMessageId,
          keyId,
        )
      : await this.prisma.companyMessage.findFirst({
          where: {
            companyId,
            conversationId,
            whatsappConnectionSessionId: session.id,
            direction,
            body,
            timestamp,
          },
          select: { id: true, providerMessageId: true, variablesJson: true, sourceModule: true },
        });
    const existingVariables = this.parseMetadata(existingMessage?.variablesJson);
    const mediaAttachment = opts?.downloadMedia === false
      ? this.buildStoredMediaAttachmentFromVariables(existingVariables || {})
      : await this.resolveInboundMediaAttachment(
          companyId,
          conversationId,
          message,
          messageType,
          existingVariables,
          session.tenantKey,
        );
    const incomingNormalization =
      normalizedIncoming.kind === 'interactive_received' || normalizedIncoming.kind === 'unknown'
        ? {
            incomingNormalization: {
              ...normalizedIncoming.metadata,
              text: body,
            },
          }
        : {};
    const mergedVariables = {
      ...existingVariables,
      ...incomingNormalization,
      ...(mediaAttachment ? { attachment: mediaAttachment } : {}),
    };
    const variablesJson =
      mediaAttachment || Object.keys(incomingNormalization).length
        ? JSON.stringify(mergedVariables)
        : undefined;

    if (direction === 'INBOUND' && this.shouldLogIncomingInteractiveNormalization(normalizedIncoming, messageType, body)) {
      this.logger.warn(
        `Webwhats inbound interactive normalization company=${companyId} conversation=${conversationId} messageType=${messageType} providerId=${rawProviderMessageId || keyId || 'unknown'} kind=${normalizedIncoming.kind} textLength=${String(body || '').length} payloadKind=${String(normalizedIncoming.metadata?.interactivePayloadKind || 'unknown')} optionCount=${Number(normalizedIncoming.metadata?.extracted?.options?.length || 0)} fallback=${String(body || '').trim().toLowerCase() === '[interacao recebida]'}`,
      );
    }

    const payload = {
      companyId,
      conversationId,
      whatsappConnectionSessionId: session.id,
      sourcePhoneNormalized: session.phoneNormalized,
      sourceTenantKey: session.tenantKey,
      contactId: resolvedContact,
      direction,
      messageType,
      body,
      senderType: direction === 'OUTBOUND' ? 'human' : 'client',
      status,
      timestamp,
      sourceModule: 'webwhats_sync',
      provider: 'WEBWHATS',
      providerMessageId: rawProviderMessageId || undefined,
      rawPayload: JSON.stringify(message || {}),
      ...(variablesJson ? { variablesJson } : {}),
    } as const;

    let persistedMessageId = 0;
    let shouldRelayInbound = false;

    const existingSourceModule = String(existingMessage?.sourceModule || '').trim();
    const updateData = {
      body,
      status,
      timestamp,
      rawPayload: payload.rawPayload,
      conversationId,
      companyId,
      whatsappConnectionSessionId: session.id,
      sourcePhoneNormalized: session.phoneNormalized,
      sourceTenantKey: session.tenantKey,
      messageType,
      senderType: payload.senderType,
      sourceModule: existingSourceModule && existingSourceModule !== 'webwhats_sync'
        ? existingSourceModule
        : payload.sourceModule,
      provider: payload.provider,
      ...(variablesJson ? { variablesJson } : {}),
    };

    if (rawProviderMessageId) {
      if (!existingMessage) {
        try {
          const created = await this.prisma.companyMessage.create({
            data: payload,
            select: { id: true },
          });
          persistedMessageId = Number(created.id || 0);
          shouldRelayInbound = true;
        } catch (error) {
          if (!this.isUniqueConstraintError(error)) throw error;
          const updated = await this.prisma.companyMessage.update({
            where: { providerMessageId: rawProviderMessageId },
            data: updateData,
            select: { id: true },
          });
          persistedMessageId = Number(updated.id || 0);
        }
      } else {
        const updated = await this.updateExistingWebwhatsMessage(
          existingMessage.id,
          rawProviderMessageId,
          updateData,
        );
        persistedMessageId = Number(updated.id || 0);
      }
    } else {
      if (!existingMessage) {
        const created = await this.prisma.companyMessage.create({
          data: payload,
          select: { id: true },
        });
        persistedMessageId = Number(created.id || 0);
        shouldRelayInbound = true;
      } else {
        persistedMessageId = Number(existingMessage.id || 0);
        if (variablesJson) {
          await this.prisma.companyMessage.update({
            where: { id: persistedMessageId },
            data: { variablesJson },
          });
        }
      }
    }

    await this.touchConversationActivityIfNewer(companyId, conversationId, timestamp);

    if (
      direction === 'INBOUND'
      && shouldRelayInbound
      && persistedMessageId > 0
      && normalizedCustomerPhone
      && this.inboundRelay
      && messageType !== 'reaction'
      && messageType !== 'deleted'
    ) {
      try {
        await this.inboundRelay({
          companyId,
          conversationId,
          companyMessageId: persistedMessageId,
          customerPhone: normalizedCustomerPhone,
          text: body,
          timestamp,
          rawPayload: message || {},
          externalMessageId: rawProviderMessageId,
          inboundType: messageType,
          contactName: this.normalizeOptionalString(message?.pushName),
        });
      } catch (error: any) {
        this.logger.warn(
          `Webwhats inbound relay falhou para company ${companyId} conversation ${conversationId}: ${String(error?.message || error)}`,
        );
      }
    }

    return persistedMessageId;
  }

  private normalizeRemoteJid(valueRaw: string) {
    const value = String(valueRaw || '').trim();
    if (!value) return '';
    if (value.includes('@')) return value;
    const normalizedPhone = normalizeWhatsAppPhone(value);
    if (!normalizedPhone) return '';
    return `${normalizedPhone.replace(/\D/g, '')}@s.whatsapp.net`;
  }

  private isSyncableChat(remoteJidRaw: string | null | undefined) {
    const remoteJid = String(remoteJidRaw || '').trim().toLowerCase();
    if (!remoteJid) return false;
    // Inbox 1:1 só (ordem do dono 17/06/2026): grupo (@g.us), transmissão/status
    // (@broadcast) e canal/newsletter (@newsletter) NUNCA entram no espelhamento nem
    // no banco. Só conversa pessoa-a-pessoa (@s.whatsapp.net / @lid 1:1).
    if (remoteJid.includes('@broadcast')) return false;
    if (remoteJid === 'status@broadcast') return false;
    if (remoteJid.includes('@g.us')) return false;
    if (remoteJid.includes('@newsletter')) return false;
    if (remoteJid.includes('@s.whatsapp.net')) return this.isPhoneRemoteJid(remoteJid);
    if (remoteJid.includes('@lid')) {
      const left = remoteJid.split('@')[0] || '';
      return left.length >= 5 && !/^0+$/.test(left);
    }
    return false;
  }

  private extractRemoteJidPhoneDigits(remoteJidRaw: string | null | undefined) {
    const remoteJid = String(remoteJidRaw || '').trim().toLowerCase();
    if (!remoteJid.includes('@s.whatsapp.net')) return '';
    const digits = (remoteJid.split('@')[0] || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return '';
    if (/^0+$/.test(digits)) return '';
    return digits;
  }

  private isPhoneRemoteJid(remoteJidRaw: string | null | undefined) {
    return Boolean(this.extractRemoteJidPhoneDigits(remoteJidRaw));
  }

  private isGroupRemoteJid(remoteJidRaw: string | null | undefined) {
    return String(remoteJidRaw || '').trim().toLowerCase().includes('@g.us');
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeOptionalBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'yes', 'sim'].includes(normalized)) return true;
    if (['false', '0', 'no', 'nao', 'não'].includes(normalized)) return false;
    return null;
  }

  private resolveChatArchivedFlag(chat: WebwhatsChatSummary) {
    const candidateValues = [
      (chat as any)?.archived,
      (chat as any)?.isArchived,
      (chat as any)?.chatArchived,
      (chat as any)?.isChatArchived,
      (chat as any)?.archive,
      (chat as any)?.state?.archived,
      (chat as any)?.chat?.archived,
      (chat as any)?.conversation?.archived,
      (chat as any)?.lastMessage?.chat?.archived,
    ];

    for (const candidate of candidateValues) {
      const normalized = this.normalizeOptionalBoolean(candidate);
      if (normalized !== null) return normalized;
    }

    return null;
  }

  private parseMetadata(raw: string | null | undefined) {
    if (!raw) return {} as Record<string, any>;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private resolveMessageDate(value: unknown) {
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

  private normalizeMessageType(message: WebwhatsFetchedMessage) {
    const declared = String(message?.messageType || '').trim();
    if (declared && declared !== 'conversation') {
      const lowered = declared.toLowerCase();
      if (lowered.includes('image')) return 'image';
      if (lowered.includes('video') || lowered.includes('ptv')) return 'video';
      if (lowered.includes('document')) return 'document';
      if (lowered.includes('audio')) return 'audio';
      if (lowered.includes('sticker')) return 'sticker';
      if (lowered.includes('reaction')) return 'reaction';
      if (lowered.includes('protocol')) return 'deleted';
      if (this.isInteractiveMessageType(lowered)) return 'interactive';
      return lowered;
    }

    const payload = this.unwrapMessagePayload(message?.message || {});
    if (payload.extendedTextMessage) return 'text';
    if (payload.imageMessage || (payload as any).image) return 'image';
    if (payload.videoMessage || payload.ptvMessage || (payload as any).video) return 'video';
    if (payload.documentMessage || (payload as any).document) return 'document';
    if (payload.audioMessage || (payload as any).audio) return 'audio';
    if (payload.stickerMessage) return 'sticker';
    if (payload.reactionMessage) return 'reaction';
    if (String(payload.protocolMessage?.type || '').trim().toUpperCase() === 'REVOKE') return 'deleted';
    if (payload.pollCreationMessage || payload.pollCreationMessageV3) return 'poll';
    if (this.getInteractivePayload(payload)) return 'interactive';
    return 'text';
  }

  private extractMessageBody(message: WebwhatsFetchedMessage, normalizedType: string) {
    const payload = this.unwrapMessagePayload(message?.message || {});
    const conversation = this.normalizeOptionalString((payload as any).conversation);
    const extendedText = this.normalizeOptionalString((payload as any).extendedTextMessage?.text);
    if (conversation || extendedText) return conversation || extendedText || '';
    const reactionText =
      this.normalizeOptionalString((payload as any).reactionMessage?.text)
      || this.normalizeOptionalString((payload as any).reactionMessage?.emoji);
    if (reactionText) return reactionText;
    if (normalizedType === 'deleted') return '[mensagem apagada]';

    if (normalizedType === 'image') {
      return (
        this.normalizeOptionalString((payload as any).imageMessage?.caption)
        || '[imagem recebida]'
      );
    }
    if (normalizedType === 'video') {
      return (
        this.normalizeOptionalString((payload as any).videoMessage?.caption)
        || '[video recebido]'
      );
    }
    if (normalizedType === 'document') {
      return (
        this.normalizeOptionalString((payload as any).documentMessage?.caption)
        || this.normalizeOptionalString((payload as any).documentMessage?.fileName)
        || '[documento recebido]'
      );
    }
    if (normalizedType === 'audio') return '[audio recebido]';
    if (normalizedType === 'sticker') return '[figurinha recebida]';
    if (normalizedType === 'poll') {
      return (
        this.normalizeOptionalString((payload as any).pollCreationMessage?.name)
        || this.normalizeOptionalString((payload as any).pollCreationMessageV3?.name)
        || '[enquete recebida]'
      );
    }
    if (normalizedType === 'interactive') {
      const normalized = this.normalizeIncomingWhatsAppMessage(message);
      return normalized.text || '[interacao recebida]';
    }

    return '';
  }

  private normalizeStoredStatus(message: WebwhatsFetchedMessage, direction: string) {
    const updates = Array.isArray(message?.MessageUpdate) ? message.MessageUpdate : [];
    const statuses = [
      this.normalizeOptionalString(message?.status),
      ...updates.map((entry) => this.normalizeOptionalString(entry?.status)),
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toUpperCase());

    if (statuses.includes('READ')) return 'READ';
    if (statuses.includes('DELIVERY_ACK') || statuses.includes('DELIVERED')) return 'DELIVERED';
    if (statuses.includes('ERROR') || statuses.includes('FAILED')) return 'FAILED';
    return direction === 'OUTBOUND' ? 'SENT' : 'RECEIVED';
  }

  private buildProviderMessageId(tenantKey: string, rawMessageId: string) {
    return `webwhats:${tenantKey}:${rawMessageId}`;
  }

  private buildSessionScopedProviderMessageId(tenantKey: string, rawMessageId: string, sessionId?: string | null) {
    const normalizedSessionId = this.normalizeOptionalString(sessionId);
    if (normalizedSessionId) {
      return `webwhats:${tenantKey}:${normalizedSessionId}:${rawMessageId}`;
    }
    return null;
  }

  private async findExistingWebwhatsMessageByProviderId(
    companyId: number,
    providerMessageId: string,
    legacySessionProviderMessageId: string | null,
    rawMessageId: string,
  ) {
    const direct = await this.prisma.companyMessage.findUnique({
      where: { providerMessageId },
      select: { id: true, providerMessageId: true, variablesJson: true, sourceModule: true },
    });
    if (direct) return direct;

    const legacyCandidates = new Set<string>();
    if (legacySessionProviderMessageId) legacyCandidates.add(legacySessionProviderMessageId);
    const suffix = `:${String(rawMessageId || '').trim()}`;
    if (suffix.length > 1) {
      const legacy = await this.prisma.companyMessage.findFirst({
        where: {
          companyId,
          provider: 'WEBWHATS',
          providerMessageId: { endsWith: suffix },
        },
        select: { id: true, providerMessageId: true, variablesJson: true, sourceModule: true },
        orderBy: { timestamp: 'desc' },
      });
      if (legacy?.providerMessageId) legacyCandidates.add(String(legacy.providerMessageId));
    }

    if (!legacyCandidates.size) return null;
    return this.prisma.companyMessage.findFirst({
      where: {
        companyId,
        provider: 'WEBWHATS',
        providerMessageId: { in: Array.from(legacyCandidates) },
      },
      select: { id: true, providerMessageId: true, variablesJson: true, sourceModule: true },
      orderBy: { timestamp: 'desc' },
    });
  }

  private async updateExistingWebwhatsMessage(
    id: number,
    providerMessageId: string,
    data: Record<string, any>,
  ) {
    try {
      return await this.prisma.companyMessage.update({
        where: { id: Number(id) },
        data: {
          ...data,
          providerMessageId,
        },
        select: { id: true },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      return this.prisma.companyMessage.update({
        where: { id: Number(id) },
        data,
        select: { id: true },
      });
    }
  }

  private async resolveSendTarget(
    companyId: number,
    input: { to: string; conversationId?: number | null },
  ) {
    const conversationId = Number(input.conversationId || 0);
    if (conversationId > 0) {
      const conversation = await this.prisma.companyConversation.findFirst({
        where: { id: conversationId, companyId, channel: 'whatsapp' },
        select: { metadata: true, contact: true },
      });
      const metadata = this.parseMetadata(conversation?.metadata);
      const remoteJid = this.normalizeOptionalString(metadata.whatsappRemoteJid);
      if (remoteJid) return remoteJid;
      if (conversation?.contact) return String(conversation.contact);
    }
    return String(input.to || '');
  }
}
