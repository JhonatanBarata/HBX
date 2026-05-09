import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, Method } from 'axios';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { buildWhatsAppPhoneCandidates, normalizeWhatsAppPhone } from './whatsapp-channel';

type WebwhatsMediaType = 'image' | 'video' | 'document' | 'audio' | 'sticker';

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
  avatarUrl: string | null;
  unreadCount: number;
  archived: boolean | null;
  windowActive: boolean | null;
  lastMessageAt: Date | null;
  lastMessage: WebwhatsFetchedMessage | null;
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
  private readonly listSyncAt = new Map<number, number>();
  private readonly detailSyncAt = new Map<string, number>();
  private readonly contactSyncAt = new Map<number, number>();
  private readonly contactCache = new Map<number, WebwhatsContactSummary[]>();
  private inboundRelay: ((input: WebwhatsInboundRelayInput) => Promise<void>) | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async syncRecentChats(companyId: number, opts?: { force?: boolean; limit?: number; failOnError?: boolean }) {
    const session = await this.resolveCurrentWebwhatsSession(companyId);
    if (!session) {
      if (opts?.failOnError) {
        throw new WebwhatsProviderError(
          'WEBWHATS_NOT_CONNECTED',
          'WhatsApp sem sessão ativa',
        );
      }
      return 0;
    }
    if (!opts?.force && this.isThrottled(this.listSyncAt, companyId, 15000)) return 0;

    try {
      const [chats, contacts] = await Promise.all([
        this.fetchChats(companyId, opts?.limit ?? 60),
        this.getCachedContacts(companyId),
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
      this.listSyncAt.set(companyId, Date.now());
      this.logger.log(`Webwhats chats sincronizados para company ${companyId}: ${synced}.`);
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

  async syncConversationMessages(companyId: number, conversationId: number, opts?: { force?: boolean; limit?: number }) {
    const result = await this.syncConversationMessagesDetailed(companyId, conversationId, opts);
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
    },
  ): Promise<WebwhatsConversationSyncResult> {
    const session = await this.resolveCurrentWebwhatsSession(companyId);
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
      this.getCachedContacts(companyId),
      this.fetchChats(companyId, 120),
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
      const [messageGroups, profilePicture] = await Promise.all([
        Promise.all(
          syncableRemoteJids.map((jid) =>
            this.fetchMessagesWindow(companyId, jid, {
              limit: opts?.limit ?? 120,
              fullSync: opts?.fullSync,
              maxPages: opts?.maxPages,
            }),
          ),
        ),
        metadata.whatsappAvatarUrl
          ? Promise.resolve(null)
          : this.fetchProfilePicture(companyId, syncableRemoteJids[0]),
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
      const orderedMessages = Array.from(messageByKey.values()).sort((left, right) => {
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
        );
      }

      const latestPushName =
        this.getChatDisplayName(
          matchingChat || ({ remoteJid } as WebwhatsChatSummary),
          contactsByJid.get(remoteJid || '') || null,
          remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
        ) || this.getPersistedDisplayName(metadata);
      const avatarUrl = this.normalizeOptionalString(profilePicture?.profilePictureUrl);
      const mediaMessages = orderedMessages.reduce((count, message) => {
        return ['image', 'video', 'document', 'audio'].includes(this.normalizeMessageType(message))
          ? count + 1
          : count;
      }, 0);
      const nextMetadata = {
        ...metadata,
        ...(latestPushName
          ? {
              whatsappName: latestPushName,
              waNickname: latestPushName,
              whatsappProfileName: latestPushName,
              whatsappContactName: latestPushName,
            }
          : {}),
        ...(avatarUrl ? { whatsappAvatarUrl: avatarUrl } : {}),
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
        displayName: latestPushName || null,
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

  async listLiveChats(companyId: number, opts?: { limit?: number }) {
    const company = await this.requireConnectedCompany(companyId);
    const [chats, contacts] = await Promise.all([
      this.fetchChats(company.id, opts?.limit ?? 60),
      this.getCachedContacts(company.id),
    ]);
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

      const displayName =
        this.getChatDisplayName(
          chat,
          contactsByJid.get(remoteJid || '') || null,
          remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
        ) || null;
      const lastMessageAt =
        this.resolveMessageDate(chat?.lastMessage?.messageTimestamp || chat?.updatedAt) || null;

      snapshots.push({
        conversation: state,
        remoteJid,
        remoteJidAlt,
        contact: state.contact,
        displayName,
        avatarUrl:
          this.normalizeOptionalString(chat?.profilePicUrl)
          || this.normalizeOptionalString(contactsByJid.get(remoteJid || '')?.profilePicUrl)
          || null,
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

    return snapshots.sort((left, right) => {
      const leftTime = left.lastMessageAt?.getTime() || 0;
      const rightTime = right.lastMessageAt?.getTime() || 0;
      return rightTime - leftTime;
    });
  }

  async getLiveConversation(
    companyId: number,
    input: {
      conversationId: number;
      limit?: number;
    },
  ): Promise<WebwhatsLiveConversationSnapshot | null> {
    const company = await this.requireConnectedCompany(companyId);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: {
        id: Number(input.conversationId || 0),
        companyId,
        channel: 'whatsapp',
        whatsappConnectionSessionId: company.session.id,
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
    if (!conversation) {
      return null;
    }

    const metadata = this.parseMetadata(conversation.metadata);
    let remoteJid =
      this.normalizeOptionalString(metadata.whatsappRemoteJid)
      || this.normalizeRemoteJid(String(conversation.contact || ''));
    let remoteJidAlt = this.normalizeOptionalString(metadata.whatsappRemoteJidAlt) || null;

    const [contacts, chats] = await Promise.all([
      this.getCachedContacts(company.id),
      this.fetchChats(company.id, 120),
    ]);
    const contactsByJid = this.indexContactsByJid(contacts);
    const conversationKeys = Array.from(
      new Set(
        [remoteJid, remoteJidAlt, this.normalizeRemoteJid(String(conversation.contact || ''))]
          .map((value) => this.normalizeOptionalString(value))
          .filter(Boolean),
      ),
    ) as string[];
    const matchingChat = chats.find((chat) => {
      const chatRemoteJid = this.normalizeOptionalString(chat?.remoteJid);
      const chatRemoteJidAlt = this.getChatRemoteJidAlt(chat);
      return [chatRemoteJid, chatRemoteJidAlt].some(
        (value) => value && conversationKeys.includes(value),
      );
    }) || null;

    if (matchingChat) {
      remoteJid = this.normalizeOptionalString(matchingChat.remoteJid) || remoteJid;
      remoteJidAlt = this.getChatRemoteJidAlt(matchingChat) || remoteJidAlt;
    }

    const syncableRemoteJids = Array.from(
      new Set([remoteJid, remoteJidAlt].map((value) => this.normalizeOptionalString(value)).filter(Boolean)),
    ).filter((value) => this.isSyncableChat(value)) as string[];
    if (!syncableRemoteJids.length) {
      return null;
    }

    const [messageGroups, profilePicture] = await Promise.all([
      Promise.all(
        syncableRemoteJids.map((jid) =>
          this.fetchMessagesWindow(company.id, jid, {
            limit: input.limit ?? 120,
          }),
        ),
      ),
      this.fetchProfilePicture(company.id, syncableRemoteJids[0]),
    ]);
    const messagesByKey = new Map<string, WebwhatsFetchedMessage>();
    for (const message of messageGroups.flatMap((group) => group.records)) {
      const key = this.normalizeOptionalString(message?.key?.id || message?.id || message?.messageTimestamp);
      if (!key) continue;
      messagesByKey.set(key, message);
    }
    const orderedMessages = Array.from(messagesByKey.values()).sort((left, right) => {
      const leftTime = this.resolveMessageDate(left?.messageTimestamp)?.getTime() || 0;
      const rightTime = this.resolveMessageDate(right?.messageTimestamp)?.getTime() || 0;
      return leftTime - rightTime;
    });

    if (!matchingChat && orderedMessages.length === 0) {
      return null;
    }

    const contact = this.resolvePreferredConversationContact(remoteJidAlt, remoteJid, conversation.contact);
    const conversationState = matchingChat
      ? await this.upsertConversationStateFromChat(
          company.id,
          company.session,
          matchingChat,
          contactsByJid.get(remoteJid || '') || null,
          remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
        )
      : await this.ensureConversationState(company.id, {
          session: company.session,
          remoteJid: remoteJid || syncableRemoteJids[0],
          remoteJidAlt,
          preferredContact: contact,
        });
    const displayName =
      this.getChatDisplayName(
        matchingChat || ({ remoteJid } as WebwhatsChatSummary),
        contactsByJid.get(remoteJid || '') || null,
        remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
      ) || null;
    const lastMessage = matchingChat?.lastMessage || orderedMessages[orderedMessages.length - 1] || null;
    const lastMessageAt =
      this.resolveMessageDate(matchingChat?.lastMessage?.messageTimestamp || matchingChat?.updatedAt)
      || this.resolveMessageDate(lastMessage?.messageTimestamp)
      || null;

    return {
      conversation: conversationState || {
        id: conversation.id,
        contact,
        metadata: conversation.metadata,
        currentFlow: conversation.currentFlow,
        currentStep: conversation.currentStep,
        flowResult: conversation.flowResult,
        botActive: conversation.botActive,
        humanAssigned: conversation.humanAssigned,
        assignedUserId: conversation.assignedUserId,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
      remoteJid: remoteJid || syncableRemoteJids[0],
      remoteJidAlt,
      contact,
      displayName,
      avatarUrl:
        this.normalizeOptionalString(matchingChat?.profilePicUrl)
        || this.normalizeOptionalString(profilePicture?.profilePictureUrl)
        || this.normalizeOptionalString(contactsByJid.get(remoteJid || '')?.profilePicUrl)
        || null,
      unreadCount: Math.max(0, Number(matchingChat?.unreadCount || 0)),
      archived: matchingChat ? this.resolveChatArchivedFlag(matchingChat) : null,
      windowActive:
        matchingChat?.windowActive === undefined || matchingChat?.windowActive === null
          ? null
          : Boolean(matchingChat.windowActive),
      lastMessageAt,
      lastMessage,
      messages: orderedMessages,
    };
  }

  async listContacts(companyId: number, opts?: { force?: boolean; failOnError?: boolean }) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        whatsappModalStatus: true,
      },
    });
    if (!company || !this.canUseConnectedInstance(company)) {
      if (opts?.failOnError) {
        throw new WebwhatsProviderError(
          'WEBWHATS_NOT_CONNECTED',
          'Sessao do WhatsApp desconectada. Nao foi possivel sincronizar contatos.',
        );
      }
      return [];
    }

    if (opts?.force) {
      const contacts = await this.fetchContacts(company.id);
      this.contactSyncAt.set(companyId, Date.now());
      this.contactCache.set(companyId, contacts);
      this.logger.log(`Webwhats contatos sincronizados para company ${companyId}: ${contacts.length}.`);
      return contacts;
    }

    return this.getCachedContacts(companyId);
  }

  async checkWhatsappNumbers(companyId: number, numbersRaw: Array<string | null | undefined>) {
    const company = await this.requireConnectedCompany(companyId);
    const tenantKey = this.buildTenantKey(company.id);
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

    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/chat/whatsappNumbers/${encodeURIComponent(tenantKey)}`,
      purpose: 'verificacao rapida de numeros com WhatsApp',
      data: {
        numbers: normalizedNumbers,
      },
    });

    const rows = Array.isArray(response?.numbers)
      ? response.numbers
      : Array.isArray(response)
        ? response
        : [];
    const resultByDigits = new Map<string, WebwhatsWhatsappNumberCheckResult>();

    for (const row of rows) {
      const rawNumber = this.normalizeOptionalString(
        row?.number || row?.phone || row?.contact || row?.remoteJid,
      );
      const normalizedNumber = String(rawNumber || '').replace(/\D/g, '');
      if (!normalizedNumber) continue;
      const exists = this.normalizeOptionalBoolean(row?.exists) === true;
      const remoteJid = this.normalizeOptionalString(row?.remoteJid || row?.jid)
        || (exists ? this.normalizeRemoteJid(normalizedNumber) : null);
      resultByDigits.set(normalizedNumber, {
        input: rawNumber || normalizedNumber,
        normalizedNumber,
        exists,
        remoteJid,
        raw: row,
      });
    }

    return normalizedNumbers.map((normalizedNumber) => {
      const matched = resultByDigits.get(normalizedNumber);
      return (
        matched || {
          input: normalizedNumber,
          normalizedNumber,
          exists: false,
          remoteJid: null,
          raw: null,
        }
      );
    });
  }

  setInboundRelay(handler: ((input: WebwhatsInboundRelayInput) => Promise<void>) | null) {
    this.inboundRelay = handler;
  }

  isDispatchAvailable(status: string | null | undefined) {
    return this.canUseConnectedInstance({ whatsappModalStatus: status });
  }

  private async requireConnectedCompany(companyId: number) {
    const session = await this.resolveCurrentWebwhatsSession(companyId);
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

  private async resolveCurrentWebwhatsSession(companyId: number): Promise<WebwhatsConnectionSessionContext | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        whatsappModalStatus: true,
        whatsappModalPhone: true,
        currentWhatsappConnectionSessionId: true,
        currentWhatsappConnectionSession: {
          select: {
            id: true,
            provider: true,
            tenantKey: true,
            phoneNormalized: true,
            displayPhone: true,
            status: true,
          },
        },
      },
    });
    if (!company || !this.canUseConnectedInstance(company)) return null;

    const current = company.currentWhatsappConnectionSession;
    if (
      current &&
      String(current.provider || '').trim().toLowerCase() === 'webwhats' &&
      String(current.status || '').trim().toLowerCase() === 'active'
    ) {
      return {
        id: String(current.id),
        tenantKey: String(current.tenantKey || this.buildTenantKey(companyId)),
        phoneNormalized: this.normalizeConnectionPhone(current.phoneNormalized),
        displayPhone: this.normalizeOptionalString(current.displayPhone),
      };
    }

    const tenantKey = this.buildTenantKey(companyId);
    const phoneNormalized = this.normalizeConnectionPhone(company.whatsappModalPhone);
    if (!phoneNormalized) return null;

    const now = new Date();
    await this.prisma.whatsAppConnectionSession.updateMany({
      where: {
        companyId,
        provider: 'webwhats',
        status: 'active',
        NOT: { phoneNormalized },
      },
      data: {
        status: 'disconnected',
        disconnectedAt: now,
      },
    });

    let session = await this.prisma.whatsAppConnectionSession.findFirst({
      where: {
        companyId,
        provider: 'webwhats',
        phoneNormalized,
        status: 'active',
      },
      orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        tenantKey: true,
        phoneNormalized: true,
        displayPhone: true,
      },
    });

    if (!session) {
      session = await this.prisma.whatsAppConnectionSession.create({
        data: {
          companyId,
          provider: 'webwhats',
          tenantKey,
          phoneNormalized,
          displayPhone: this.normalizeOptionalString(company.whatsappModalPhone),
          status: 'active',
          connectedAt: now,
          metadataJson: JSON.stringify({
            source: 'webwhats_bridge_session_repair',
            recordedAt: now.toISOString(),
          }),
        },
        select: {
          id: true,
          tenantKey: true,
          phoneNormalized: true,
          displayPhone: true,
        },
      });
    }

    if (String(company.currentWhatsappConnectionSessionId || '') !== String(session.id)) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: { currentWhatsappConnectionSessionId: String(session.id) },
      });
    }

    return {
      id: String(session.id),
      tenantKey: String(session.tenantKey || tenantKey),
      phoneNormalized: this.normalizeConnectionPhone(session.phoneNormalized),
      displayPhone: this.normalizeOptionalString(session.displayPhone),
    };
  }

  async sendText(companyId: number, input: { to: string; text: string; conversationId?: number | null }) {
    const company = await this.requireConnectedCompany(companyId);

    const tenantKey = this.buildTenantKey(company.id);
    const target = await this.resolveSendTarget(companyId, input);
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/message/sendText/${encodeURIComponent(tenantKey)}`,
      purpose: 'envio de mensagem via Webwhats',
      data: {
        number: target,
        text: String(input.text || ''),
      },
    });

    const rawMessageId = this.normalizeOptionalString(response?.key?.id || response?.id);
    return {
      target,
      response,
      rawMessageId,
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId, company.session.id) : null,
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
    },
  ) {
    const company = await this.requireConnectedCompany(companyId);

    const tenantKey = this.buildTenantKey(company.id);
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
      },
    });

    const rawMessageId = this.normalizeOptionalString(response?.key?.id || response?.id);
    return {
      target,
      response,
      rawMessageId,
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId, company.session.id) : null,
    };
  }

  async sendWhatsAppAudio(
    companyId: number,
    input: {
      to: string;
      audio: string;
      conversationId?: number | null;
    },
  ) {
    const company = await this.requireConnectedCompany(companyId);

    const tenantKey = this.buildTenantKey(company.id);
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
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId, company.session.id) : null,
    };
  }

  async sendInteractive(
    companyId: number,
    input: {
      to: string;
      payload: Record<string, any>;
      conversationId?: number | null;
    },
  ) {
    const company = await this.requireConnectedCompany(companyId);

    const tenantKey = this.buildTenantKey(company.id);
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
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId, company.session.id) : null,
    };
  }

  async updateBlockStatus(
    companyId: number,
    input: {
      to?: string;
      conversationId?: number | null;
      status: 'block' | 'unblock';
    },
  ) {
    const company = await this.requireConnectedCompany(companyId);
    const tenantKey = this.buildTenantKey(company.id);
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
  ) {
    const company = await this.requireConnectedCompany(companyId);
    const tenantKey = this.buildTenantKey(company.id);
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
  ) {
    const company = await this.requireConnectedCompany(companyId);
    const tenantKey = this.buildTenantKey(company.id);
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

  async deleteMessageForEveryone(
    companyId: number,
    input: {
      conversationId?: number | null;
      remoteJid?: string | null;
      messageId: string;
      fromMe: boolean;
      participant?: string | null;
    },
  ) {
    const company = await this.requireConnectedCompany(companyId);
    const tenantKey = this.buildTenantKey(company.id);
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

  private canUseConnectedInstance(company: { whatsappModalStatus?: string | null }) {
    const config = this.readConfig();
    if (!config.available) return false;
    return String(company?.whatsappModalStatus || '').trim().toLowerCase() === 'connected';
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
    return `${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
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
  ): Promise<ResolvedWebwhatsMediaAttachment | null> {
    if (!['image', 'video', 'document', 'audio', 'sticker'].includes(messageType)) return null;

    const stored = this.buildStoredMediaAttachmentFromVariables(existingVariables || {});
    if (stored) return stored;

    const mediaPayload = this.getMediaPayload(message, messageType);
    if (!mediaPayload) return null;

    try {
      const tenantKey = this.buildTenantKey(companyId);
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
      const uploadDir = join(process.cwd(), 'public', 'uploads', 'inbox');
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
    try {
      const response = await axios.request<T>({
        method: options.method,
        url,
        data: options.data,
        timeout: config.timeoutMs,
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
    return [408, 425, 429, 500, 502, 503, 504].includes(Number(error.statusCode || 0));
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

  private async fetchChats(companyId: number, limit: number) {
    const tenantKey = this.buildTenantKey(companyId);
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/chat/findChats/${encodeURIComponent(tenantKey)}`,
      purpose: 'sincronizacao de chats',
      data: { take: this.clamp(limit, 1, 120) },
    });
    return Array.isArray(response) ? (response as WebwhatsChatSummary[]) : [];
  }

  private async fetchContacts(companyId: number) {
    const tenantKey = this.buildTenantKey(companyId);
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/chat/findContacts/${encodeURIComponent(tenantKey)}`,
      purpose: 'sincronizacao de contatos',
      data: {},
    });
    return Array.isArray(response) ? (response as WebwhatsContactSummary[]) : [];
  }

  private async getCachedContacts(companyId: number) {
    const cacheAgeMs = 5 * 60 * 1000;
    if (this.isThrottled(this.contactSyncAt, companyId, cacheAgeMs)) {
      return this.contactCache.get(companyId) || [];
    }
    const contacts = await this.fetchContacts(companyId);
    this.contactSyncAt.set(companyId, Date.now());
    this.contactCache.set(companyId, contacts);
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
    },
  ) {
    const tenantKey = this.buildTenantKey(companyId);
    const response = await this.requestRead<any>({
      method: 'POST',
      path: `/chat/findMessages/${encodeURIComponent(tenantKey)}`,
      purpose: 'sincronizacao de mensagens',
      data: {
        where: {
          key: {
            remoteJid,
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
    },
  ) {
    const limit = this.clamp(Number(opts.limit || 120), 1, 120);
    const maxPages = this.clamp(Number(opts.maxPages || (opts.fullSync ? 80 : 1)), 1, 120);
    const messageByKey = new Map<string, WebwhatsFetchedMessage>();
    let pagesFetched = 0;
    let discoveredTotalPages: number | null = null;

    for (let page = 1; page <= maxPages; page += 1) {
      const pagePayload = await this.fetchMessagesPage(companyId, remoteJid, {
        limit,
        page,
      });
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

  private async fetchProfilePicture(companyId: number, remoteJid: string) {
    const tenantKey = this.buildTenantKey(companyId);
    return this.requestRead<any>({
      method: 'POST',
      path: `/chat/fetchProfilePictureUrl/${encodeURIComponent(tenantKey)}`,
      purpose: 'busca de foto de perfil',
      data: { number: remoteJid },
      treatNotFoundAsNull: true,
    });
  }

  private getChatRemoteJidAlt(chat: WebwhatsChatSummary) {
    return this.normalizeOptionalString(
      chat?.lastMessage?.key?.remoteJidAlt ||
      chat?.lastMessage?.remoteJidAlt ||
      (chat as any)?.remoteJidAlt,
    );
  }

  private getMessageRemoteJidAlt(message: WebwhatsFetchedMessage) {
    return this.normalizeOptionalString(message?.key?.remoteJidAlt);
  }

  private getChatDisplayName(
    chat: WebwhatsChatSummary,
    primaryContact?: WebwhatsContactSummary | null,
    alternateContact?: WebwhatsContactSummary | null,
  ) {
    const candidates = [
      primaryContact?.name,
      primaryContact?.displayName,
      primaryContact?.formattedName,
      primaryContact?.fullName,
      primaryContact?.shortName,
      primaryContact?.notifyName,
      primaryContact?.verifiedName,
      primaryContact?.businessName,
      primaryContact?.pushName,
      alternateContact?.name,
      alternateContact?.displayName,
      alternateContact?.formattedName,
      alternateContact?.fullName,
      alternateContact?.shortName,
      alternateContact?.notifyName,
      alternateContact?.verifiedName,
      alternateContact?.businessName,
      alternateContact?.pushName,
      chat?.contact?.name,
      chat?.contact?.formattedName,
      chat?.contact?.displayName,
      chat?.contact?.verifiedName,
      chat?.contact?.businessName,
      chat?.contact?.fullName,
      chat?.displayName,
      chat?.fullName,
      chat?.name,
      chat?.verifiedName,
      chat?.businessName,
      chat?.shortName,
      chat?.contact?.shortName,
      chat?.pushName,
      chat?.contact?.pushName,
      chat?.notifyName,
      chat?.contact?.notifyName,
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeDisplayNameCandidate(candidate);
      if (normalized) return normalized;
    }

    return null;
  }

  private getPersistedDisplayName(metadata: Record<string, any> | null | undefined) {
    if (!metadata || typeof metadata !== 'object') return null;

    const candidates = [
      metadata.whatsappContactName,
      metadata.waNickname,
      metadata.whatsappName,
      metadata.whatsappProfileName,
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
    const existing = await this.findConversation(companyId, session.id, remoteJid, remoteJidAlt, preferredContact);
    const contact = this.resolveStateContact(preferredContact, existing?.contact, remoteJid, remoteJidAlt);
    const displayName =
      this.getChatDisplayName(chat, primaryContact || null, alternateContact || null)
      || this.getPersistedDisplayName(this.parseMetadata(existing?.metadata))
      || null;
    const avatarUrl =
      this.normalizeOptionalString(chat?.profilePicUrl)
      || this.normalizeOptionalString(primaryContact?.profilePicUrl)
      || this.normalizeOptionalString(alternateContact?.profilePicUrl)
      || this.normalizeOptionalString(this.parseMetadata(existing?.metadata)?.whatsappAvatarUrl)
      || null;
    const lastMessageAt =
      this.resolveMessageDate(chat?.lastMessage?.messageTimestamp || chat?.updatedAt)
      || existing?.lastMessageAt
      || null;
    const lastInteractionAt = lastMessageAt || existing?.lastInteractionAt || null;
    const metadata = this.buildConversationStateMetadata(
      this.parseMetadata(existing?.metadata),
      remoteJid,
      remoteJidAlt,
      {
        displayName,
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
          && String(existing.lastMessageAt || '') === String(lastMessageAt || '')
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
          lastMessageAt,
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
    },
  ) {
    const session = await this.resolveCurrentWebwhatsSession(companyId);
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

  private async ensureConversationState(
    companyId: number,
    input: {
      session: WebwhatsConnectionSessionContext;
      remoteJid: string;
      remoteJidAlt?: string | null;
      preferredContact: string;
    },
  ) {
    const existing = await this.findConversation(
      companyId,
      input.session.id,
      input.remoteJid,
      input.remoteJidAlt || null,
      input.preferredContact,
    );
    const contact = this.resolveStateContact(
      input.preferredContact,
      existing?.contact,
      input.remoteJid,
      input.remoteJidAlt || null,
    );
    const metadata = this.buildConversationStateMetadata(
      this.parseMetadata(existing?.metadata),
      input.remoteJid,
      input.remoteJidAlt || null,
    );
    metadata.whatsappConnectionSessionId = input.session.id;
    metadata.sourcePhoneNormalized = input.session.phoneNormalized;
    metadata.sourceTenantKey = input.session.tenantKey;
    const serializedMetadata = JSON.stringify(metadata);
    if (existing) {
      if (String(existing.contact || '') === contact && String(existing.metadata || '') === serializedMetadata) {
        return existing;
      }
      return this.prisma.companyConversation.update({
        where: { id: existing.id },
        data: {
          contact,
          whatsappConnectionSessionId: input.session.id,
          sourcePhoneNormalized: input.session.phoneNormalized,
          sourceTenantKey: input.session.tenantKey,
          metadata: serializedMetadata,
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
    }

    return this.createConversationStateWithRetry(companyId, {
      contact,
      session: input.session,
      metadata: serializedMetadata,
      remoteJid: input.remoteJid,
      remoteJidAlt: input.remoteJidAlt || null,
    });
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
    if (snapshot?.displayName) {
      nextMetadata.whatsappName = snapshot.displayName;
      nextMetadata.waNickname = snapshot.displayName;
      nextMetadata.whatsappProfileName = snapshot.displayName;
      nextMetadata.whatsappContactName = snapshot.displayName;
    }
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
      remoteJidAlt,
      this.isPreferredPhoneContact(existingContact) ? existingContact : null,
      preferredContact,
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

    if (!rows.length) return null;
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
    const targetProviderMessageId = this.buildProviderMessageId(
      this.buildTenantKey(companyId),
      input.targetRawMessageId,
      input.session?.id || null,
    );
    const existing = await this.prisma.companyMessage.findUnique({
      where: { providerMessageId: targetProviderMessageId },
      select: {
        id: true,
        body: true,
        messageType: true,
        rawPayload: true,
        variablesJson: true,
      },
    });
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
    const rawProviderMessageId = keyId
      ? this.buildProviderMessageId(this.buildTenantKey(companyId), keyId, session.id)
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
      ? await this.prisma.companyMessage.findUnique({
          where: { providerMessageId: rawProviderMessageId },
          select: { id: true, variablesJson: true },
        })
      : await this.prisma.companyMessage.findFirst({
          where: {
            companyId,
            conversationId,
            whatsappConnectionSessionId: session.id,
            direction,
            body,
            timestamp,
          },
          select: { id: true, variablesJson: true },
        });
    const existingVariables = this.parseMetadata(existingMessage?.variablesJson);
    const mediaAttachment = await this.resolveInboundMediaAttachment(
      companyId,
      conversationId,
      message,
      messageType,
      existingVariables,
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
      sourceModule: payload.sourceModule,
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
        const updated = await this.prisma.companyMessage.update({
          where: { providerMessageId: rawProviderMessageId },
          data: updateData,
          select: { id: true },
        });
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
    if (remoteJid.includes('@broadcast')) return false;
    if (remoteJid === 'status@broadcast') return false;
    return remoteJid.includes('@s.whatsapp.net') || remoteJid.includes('@lid') || remoteJid.includes('@g.us');
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

  private buildProviderMessageId(tenantKey: string, rawMessageId: string, sessionId?: string | null) {
    const normalizedSessionId = this.normalizeOptionalString(sessionId);
    if (normalizedSessionId) {
      return `webwhats:${tenantKey}:${normalizedSessionId}:${rawMessageId}`;
    }
    return `webwhats:${tenantKey}:${rawMessageId}`;
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
