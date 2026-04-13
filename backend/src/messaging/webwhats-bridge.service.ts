import { Injectable, Logger } from '@nestjs/common';
import axios, { Method } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { buildWhatsAppPhoneCandidates, normalizeWhatsAppPhone } from './whatsapp-channel';

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
  profilePicUrl?: string | null;
  isSaved?: boolean | null;
  type?: string | null;
};

type WebwhatsFetchedMessage = {
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

@Injectable()
export class WebwhatsBridgeService {
  private readonly logger = new Logger(WebwhatsBridgeService.name);
  private readonly listSyncAt = new Map<number, number>();
  private readonly detailSyncAt = new Map<string, number>();
  private readonly contactSyncAt = new Map<number, number>();
  private readonly contactCache = new Map<number, WebwhatsContactSummary[]>();

  constructor(private readonly prisma: PrismaService) {}

  async syncRecentChats(companyId: number, opts?: { force?: boolean; limit?: number }) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        whatsappModalStatus: true,
      },
    });
    if (!company || !this.canUseConnectedInstance(company)) return 0;
    if (!opts?.force && this.isThrottled(this.listSyncAt, companyId, 15000)) return 0;

    try {
      const [chats, contacts] = await Promise.all([
        this.fetchChats(company.id, opts?.limit ?? 60),
        this.getCachedContacts(company.id),
      ]);
      const contactsByJid = this.indexContactsByJid(contacts);
      let synced = 0;
      for (const chat of chats) {
        if (!this.isSyncableChat(chat?.remoteJid)) continue;
        const remoteJidAlt = this.getChatRemoteJidAlt(chat);
        const conversation = await this.upsertConversationFromChat(
          company.id,
          chat,
          contactsByJid.get(String(chat.remoteJid || '').trim()) || null,
          remoteJidAlt ? contactsByJid.get(remoteJidAlt) || null : null,
        );
        if (!conversation?.id) continue;
        synced += 1;
      }
      this.listSyncAt.set(companyId, Date.now());
      return synced;
    } catch (error: any) {
      this.logger.warn(
        `Webwhats syncRecentChats falhou para company ${companyId}: ${String(error?.message || error)}`,
      );
      return 0;
    }
  }

  async syncConversationMessages(companyId: number, conversationId: number, opts?: { force?: boolean; limit?: number }) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        whatsappModalStatus: true,
      },
    });
    if (!company || !this.canUseConnectedInstance(company)) return 0;

    const throttleKey = `${companyId}:${conversationId}`;
    if (!opts?.force && this.isThrottled(this.detailSyncAt, throttleKey, 7000)) return 0;

    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId, channel: 'whatsapp' },
      select: {
        id: true,
        contact: true,
        metadata: true,
        lastMessageAt: true,
      },
    });
    if (!conversation) return 0;

    const metadata = this.parseMetadata(conversation.metadata);
    let remoteJid =
      this.normalizeOptionalString(metadata.whatsappRemoteJid) ||
      this.normalizeRemoteJid(String(conversation.contact || ''));
    let remoteJidAlt =
      this.normalizeOptionalString(metadata.whatsappRemoteJidAlt) ||
      null;

    const [contacts, chats] = await Promise.all([
      this.getCachedContacts(company.id),
      this.fetchChats(company.id, 120),
    ]);
    const contactsByJid = this.indexContactsByJid(contacts);
    const matchingChat = chats.find((chat) => {
      const chatRemoteJid = this.normalizeOptionalString(chat?.remoteJid);
      const chatRemoteJidAlt = this.getChatRemoteJidAlt(chat);
      return [
        chatRemoteJid,
        chatRemoteJidAlt,
        remoteJid,
        remoteJidAlt,
        this.normalizeRemoteJid(String(conversation.contact || '')),
      ]
        .filter(Boolean)
        .some((value) => value === chatRemoteJid || value === chatRemoteJidAlt);
    }) || null;

    if (matchingChat) {
      remoteJid = this.normalizeOptionalString(matchingChat.remoteJid) || remoteJid;
      remoteJidAlt = this.getChatRemoteJidAlt(matchingChat) || remoteJidAlt;
    }

    const remoteJids = Array.from(
      new Set([remoteJid, remoteJidAlt].map((value) => this.normalizeOptionalString(value)).filter(Boolean)),
    ) as string[];
    const syncableRemoteJids = remoteJids.filter((value) => this.isSyncableChat(value));
    if (!syncableRemoteJids.length) return 0;

    try {
      const [messageGroups, profilePicture] = await Promise.all([
        Promise.all(
          syncableRemoteJids.map((jid) => this.fetchMessages(company.id, jid, opts?.limit ?? 200)),
        ),
        metadata.whatsappAvatarUrl
          ? Promise.resolve(null)
          : this.fetchProfilePicture(company.id, syncableRemoteJids[0]),
      ]);
      const messages = messageGroups.flat();
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
          company.id,
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
              whatsappWindowActive:
                matchingChat.windowActive === undefined || matchingChat.windowActive === null
                  ? metadata.whatsappWindowActive
                  : Boolean(matchingChat.windowActive),
            }
          : {}),
      };
      const serializedMetadata = JSON.stringify(nextMetadata);
      if (String(conversation.metadata || '') !== serializedMetadata) {
        await this.prisma.companyConversation.update({
          where: { id: conversation.id },
          data: { metadata: serializedMetadata },
        });
      }

      this.detailSyncAt.set(throttleKey, Date.now());
      return orderedMessages.length;
    } catch (error: any) {
      this.logger.warn(
        `Webwhats syncConversationMessages falhou para company ${companyId} conversation ${conversationId}: ${String(error?.message || error)}`,
      );
      return 0;
    }
  }

  async listContacts(companyId: number, opts?: { force?: boolean }) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        whatsappModalStatus: true,
      },
    });
    if (!company || !this.canUseConnectedInstance(company)) return [];

    if (opts?.force) {
      const contacts = await this.fetchContacts(company.id);
      this.contactSyncAt.set(companyId, Date.now());
      this.contactCache.set(companyId, contacts);
      return contacts;
    }

    return this.getCachedContacts(companyId);
  }

  async sendText(companyId: number, input: { to: string; text: string; conversationId?: number | null }) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        whatsappModalStatus: true,
      },
    });
    if (!company || !this.canUseConnectedInstance(company)) {
      throw new Error('WEBWHATS_NOT_CONNECTED');
    }

    const tenantKey = this.buildTenantKey(company.id);
    const target = await this.resolveSendTarget(companyId, input);
    const response = await this.request<any>({
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
      providerMessageId: rawMessageId ? this.buildProviderMessageId(tenantKey, rawMessageId) : null,
    };
  }

  private readConfig(): WebwhatsConfig {
    const enabled = String(process.env.WHATSAPP_MODAL_ENABLED || 'false').trim().toLowerCase() === 'true';
    const internalUrl =
      this.normalizeOptionalString(process.env.WHATSAPP_MODAL_INTERNAL_URL)
      || this.normalizeOptionalString(process.env.WHATSAPP_MODAL_URL);
    const apiKey =
      this.normalizeOptionalString(process.env.WHATSAPP_MODAL_API_KEY)
      || this.normalizeOptionalString(process.env.AUTHENTICATION_API_KEY);
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

  private isThrottled(map: Map<number | string, number>, key: number | string, windowMs: number) {
    const lastRunAt = Number(map.get(key) || 0);
    return Date.now() - lastRunAt < windowMs;
  }

  private async request<T>(options: WebwhatsRequestOptions): Promise<T | null> {
    const config = this.readConfig();
    if (!config.enabled || !config.configured || !config.internalUrl || !config.apiKey) {
      throw new Error('WEBWHATS_NOT_CONFIGURED');
    }

    const url = new URL(options.path.replace(/^\/+/, ''), `${config.internalUrl.replace(/\/+$/, '')}/`).toString();
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

    const providerMessage = this.normalizeOptionalString(
      (response.data as any)?.message || (response.data as any)?.error || response.statusText,
    );
    throw new Error(
      providerMessage
        ? `Webwhats falhou durante ${options.purpose}: ${providerMessage}`
        : `Webwhats falhou durante ${options.purpose} (HTTP ${response.status})`,
    );
  }

  private async fetchChats(companyId: number, limit: number) {
    const tenantKey = this.buildTenantKey(companyId);
    const response = await this.request<any>({
      method: 'POST',
      path: `/chat/findChats/${encodeURIComponent(tenantKey)}`,
      purpose: 'sincronizacao de chats',
      data: { take: this.clamp(limit, 1, 120) },
    });
    return Array.isArray(response) ? (response as WebwhatsChatSummary[]) : [];
  }

  private async fetchContacts(companyId: number) {
    const tenantKey = this.buildTenantKey(companyId);
    const response = await this.request<any>({
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

  private async fetchMessages(companyId: number, remoteJid: string, limit: number) {
    const tenantKey = this.buildTenantKey(companyId);
    const response = await this.request<any>({
      method: 'POST',
      path: `/chat/findMessages/${encodeURIComponent(tenantKey)}`,
      purpose: 'sincronizacao de mensagens',
      data: {
        where: {
          key: {
            remoteJid,
          },
        },
        offset: this.clamp(limit, 1, 120),
        page: 1,
      },
    });
    const records = response?.messages?.records;
    return Array.isArray(records) ? (records as WebwhatsFetchedMessage[]) : [];
  }

  private async fetchProfilePicture(companyId: number, remoteJid: string) {
    const tenantKey = this.buildTenantKey(companyId);
    return this.request<any>({
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
      primaryContact?.pushName,
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
      chat?.lastMessage?.pushName,
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
      metadata.cliente,
      metadata.customerName,
      metadata.name,
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

  private async upsertConversationFromChat(
    companyId: number,
    chat: WebwhatsChatSummary,
    primaryContact?: WebwhatsContactSummary | null,
    alternateContact?: WebwhatsContactSummary | null,
  ) {
    const remoteJid = this.normalizeOptionalString(chat.remoteJid);
    if (!remoteJid) return null;

    const remoteJidAlt = this.getChatRemoteJidAlt(chat);
    const contact = this.buildConversationContact(remoteJidAlt || remoteJid);
    const existing = await this.findConversation(companyId, remoteJid, remoteJidAlt, contact);
    const existingMetadata = this.parseMetadata(existing?.metadata);
    const chatDisplayName =
      this.getChatDisplayName(chat, primaryContact, alternateContact) ||
      this.getPersistedDisplayName(existingMetadata);
    const metadata = {
      ...(existingMetadata || {}),
      whatsappRemoteJid: remoteJid,
      ...(remoteJidAlt ? { whatsappRemoteJidAlt: remoteJidAlt } : {}),
      ...(chatDisplayName
        ? {
            whatsappName: chatDisplayName,
            waNickname: chatDisplayName,
            whatsappProfileName: chatDisplayName,
            whatsappContactName: chatDisplayName,
          }
        : {}),
      ...(this.normalizeOptionalString(chat.profilePicUrl)
        ? { whatsappAvatarUrl: this.normalizeOptionalString(chat.profilePicUrl) }
        : {}),
      whatsappWindowActive:
        chat.windowActive === undefined || chat.windowActive === null ? undefined : Boolean(chat.windowActive),
      whatsappUnreadCount:
        chat.unreadCount === undefined || chat.unreadCount === null ? undefined : Number(chat.unreadCount || 0),
    };

    const lastMessageAt = this.resolveMessageDate(chat.lastMessage?.messageTimestamp || chat.updatedAt) || new Date();
    const serializedMetadata = JSON.stringify(metadata);
    const hasLastMessageChanged =
      new Date(existing?.lastMessageAt || 0).getTime() !== lastMessageAt.getTime();
    const conversation = existing
      ? !hasLastMessageChanged && String(existing.metadata || '') === serializedMetadata
        ? { id: existing.id, metadata: existing.metadata }
        : await this.prisma.companyConversation.update({
            where: { id: existing.id },
            data: {
              metadata: serializedMetadata,
              lastMessageAt,
              lastInteractionAt: lastMessageAt,
            },
            select: { id: true, metadata: true },
          })
      : await this.prisma.companyConversation.create({
          data: {
            companyId,
            channel: 'whatsapp',
            contact,
            metadata: serializedMetadata,
            lastMessageAt,
            lastInteractionAt: lastMessageAt,
          },
          select: { id: true, metadata: true },
        });

    if (chat.lastMessage) {
      await this.upsertConversationMessage(
        companyId,
        conversation.id,
        remoteJid,
        chat.lastMessage,
        remoteJidAlt,
      );
    }
    return conversation;
  }

  private async findConversation(
    companyId: number,
    remoteJid: string,
    remoteJidAlt: string | null,
    preferredContact: string,
  ) {
    const digits = String(remoteJid).replace(/\D/g, '');
    const altDigits = String(remoteJidAlt || '').replace(/\D/g, '');
    const candidates = buildWhatsAppPhoneCandidates(preferredContact);
    const rows = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        OR: [
          { contact: remoteJid },
          ...(remoteJidAlt ? [{ contact: remoteJidAlt }] : []),
          { contact: preferredContact },
          ...candidates.map((candidate) => ({ contact: candidate })),
          ...(digits ? [{ contact: { endsWith: digits } }] : []),
          ...(altDigits ? [{ contact: { endsWith: altDigits } }] : []),
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        contact: true,
        metadata: true,
        humanAssigned: true,
        lastMessageAt: true,
      },
    });

    if (!rows.length) return null;
    const exactPreferred = rows.find((row) => String(row.contact || '') === preferredContact);
    if (exactPreferred) return exactPreferred;
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

  private async upsertConversationMessage(
    companyId: number,
    conversationId: number,
    remoteJid: string,
    message: WebwhatsFetchedMessage,
    remoteJidAlt?: string | null,
  ) {
    const keyId = this.normalizeOptionalString(message?.key?.id || message?.id);
    const rawProviderMessageId = keyId ? this.buildProviderMessageId(this.buildTenantKey(companyId), keyId) : null;
    const timestamp = this.resolveMessageDate(message?.messageTimestamp) || new Date();
    const direction = message?.key?.fromMe ? 'OUTBOUND' : 'INBOUND';
    const messageType = this.normalizeMessageType(message);
    const body = this.extractMessageBody(message, messageType);
    const status = this.normalizeStoredStatus(message, direction);
    const resolvedContact = this.buildConversationContact(remoteJidAlt || this.getMessageRemoteJidAlt(message) || remoteJid);

    const payload = {
      companyId,
      conversationId,
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
    } as const;

    if (rawProviderMessageId) {
      await this.prisma.companyMessage.upsert({
        where: { providerMessageId: rawProviderMessageId },
        create: payload,
        update: {
          body,
          status,
          timestamp,
          rawPayload: payload.rawPayload,
          conversationId,
          companyId,
          messageType,
          senderType: payload.senderType,
          sourceModule: payload.sourceModule,
          provider: payload.provider,
        },
      });
    } else {
      const existing = await this.prisma.companyMessage.findFirst({
        where: {
          companyId,
          conversationId,
          direction,
          body,
          timestamp,
        },
        select: { id: true },
      });
      if (!existing) {
        await this.prisma.companyMessage.create({ data: payload });
      }
    }

    await this.prisma.companyConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: timestamp,
        lastInteractionAt: timestamp,
      },
    });
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
    if (remoteJid.includes('@g.us')) return false;
    if (remoteJid.includes('@broadcast')) return false;
    if (remoteJid === 'status@broadcast') return false;
    return remoteJid.includes('@s.whatsapp.net') || remoteJid.includes('@lid');
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
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
    if (declared && declared !== 'conversation') return declared.toLowerCase();

    const payload = message?.message || {};
    if (payload.extendedTextMessage) return 'text';
    if (payload.imageMessage) return 'image';
    if (payload.videoMessage) return 'video';
    if (payload.documentMessage || payload.documentWithCaptionMessage) return 'document';
    if (payload.audioMessage) return 'audio';
    if (payload.stickerMessage) return 'sticker';
    if (payload.pollCreationMessage || payload.pollCreationMessageV3) return 'poll';
    return 'text';
  }

  private extractMessageBody(message: WebwhatsFetchedMessage, normalizedType: string) {
    const payload = message?.message || {};
    const conversation = this.normalizeOptionalString((payload as any).conversation);
    const extendedText = this.normalizeOptionalString((payload as any).extendedTextMessage?.text);
    if (conversation || extendedText) return conversation || extendedText || '';

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
        this.normalizeOptionalString((payload as any).documentWithCaptionMessage?.message?.documentMessage?.caption)
        || this.normalizeOptionalString((payload as any).documentWithCaptionMessage?.message?.documentMessage?.fileName)
        || this.normalizeOptionalString((payload as any).documentMessage?.caption)
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

    return '[mensagem sincronizada]';
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
