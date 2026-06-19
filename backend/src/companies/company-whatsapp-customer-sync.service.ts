import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CadastrosService } from '../cadastros/cadastros.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeWhatsAppDigits, normalizeWhatsAppPhone } from '../messaging/whatsapp-channel';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { InboxRealtimeService } from '../messaging/inbox-realtime.service';
import { CompanyOperationalStatusService } from './company-operational-status.service';

export type SyncEngine = 'meta' | 'webwhats';

type SyncCandidate = {
  phone: string;
  phoneNormalized: string;
  name: string | null;
  conversationId: number | null;
  lastMessageAt: Date | null;
};

type SyncCompanyCustomersOptions = {
  requiredEngine?: SyncEngine;
  failOnEmptySource?: boolean;
};

export type WhatsAppConnectBootstrapResult = {
  success: boolean;
  connected: boolean;
  bootstrapOk: boolean;
  syncedContacts: number;
  syncedConversations: number;
  engine: SyncEngine | null;
  message: string;
  error?: string | null;
};

@Injectable()
export class CompanyWhatsAppCustomerSyncService {
  private readonly logger = new Logger(CompanyWhatsAppCustomerSyncService.name);

  // Re-sync deferido por empresa: o connect dispara o motor (Baileys), mas ele só
  // termina de puxar contatos/histórico do servidor do WhatsApp DEPOIS — então o
  // bootstrap one-shot nasce parcial (lista incompleta, fotos faltando). Estes timers
  // re-sincronizam quando o motor esquentou e publicam SSE pra inbox recarregar sozinha
  // (sem hard refresh). Guarda 1 conjunto por empresa: religar limpa o anterior.
  private readonly deferredResyncTimers = new Map<number, NodeJS.Timeout[]>();
  private static readonly DEFERRED_RESYNC_DELAYS_MS = [6000, 16000];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cadastrosService: CadastrosService,
    private readonly operationalStatus: CompanyOperationalStatusService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
    private readonly inboxRealtime: InboxRealtimeService,
  ) {}

  // Cutuca o stream SSE da empresa (GET /inbox/events) — o front faz bump()→loadConvs()
  // em qualquer event:inbox, então um 'conversation' sem id basta pra "a lista mudou".
  private publishInboxRefresh(companyId: number) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return;
    this.inboxRealtime.publish({
      companyId: normalizedCompanyId,
      kind: 'conversation',
      at: new Date().toISOString(),
    });
  }

  private clearDeferredResync(companyId: number) {
    const timers = this.deferredResyncTimers.get(companyId);
    if (!timers) return;
    for (const timer of timers) clearTimeout(timer);
    this.deferredResyncTimers.delete(companyId);
  }

  // Agenda 1–2 re-syncs após o connect (motor esquentando). Cada passo re-puxa chats/
  // contatos e publica SSE; backfilla as fotos que ainda não vieram. Falha (ex.: caiu a
  // sessão) só loga — nunca derruba o processo.
  private scheduleDeferredResync(companyId: number) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) return;
    this.clearDeferredResync(normalizedCompanyId);

    const timers = CompanyWhatsAppCustomerSyncService.DEFERRED_RESYNC_DELAYS_MS.map((delay) => {
      const timer = setTimeout(() => {
        void (async () => {
          try {
            const result = await this.syncCompanyCustomers(normalizedCompanyId, {
              requiredEngine: 'webwhats',
              failOnEmptySource: false,
            });
            this.logger.log(
              `Re-sync deferido (${delay}ms) company ${normalizedCompanyId}: chats=${result.syncedConversations}, contatos=${result.syncedContacts}.`,
            );
            this.publishInboxRefresh(normalizedCompanyId);
          } catch (error: any) {
            this.logger.warn(
              `Re-sync deferido (${delay}ms) falhou company ${normalizedCompanyId}: ${String(error?.message || error)}`,
            );
          }
        })();
      }, delay);
      timer.unref?.();
      return timer;
    });

    this.deferredResyncTimers.set(normalizedCompanyId, timers);
  }

  private resolveActiveEngine(
    status: { metaActive?: boolean; webWhatsActive?: boolean } | null,
    requiredEngine?: SyncEngine,
  ): SyncEngine | null {
    if (requiredEngine) {
      if (requiredEngine === 'meta' && status?.metaActive) return 'meta';
      if (requiredEngine === 'webwhats' && status?.webWhatsActive) return 'webwhats';
      return null;
    }
    if (status?.metaActive) return 'meta';
    if (status?.webWhatsActive) return 'webwhats';
    return null;
  }

  private parseMetadata(raw: string | null | undefined): Record<string, any> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private normalizePhoneCandidate(value: unknown) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw.includes('@g.us') || raw.includes('@broadcast') || raw.includes('@lid')) {
      return null;
    }
    const phone = normalizeWhatsAppPhone(raw);
    const digits = normalizeWhatsAppDigits(phone);
    if (digits.length < 10 || digits.length > 15) return null;
    return phone;
  }

  private normalizeNameCandidate(value: unknown, phone?: string | null) {
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

  private toDate(value: Date | string | null | undefined) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private preferredName(...candidates: Array<unknown>) {
    for (const candidate of candidates) {
      const normalized = this.normalizeNameCandidate(candidate);
      if (normalized) return normalized;
    }
    return null;
  }

  private preferredNameForPhone(phone: string | null | undefined, ...candidates: Array<unknown>) {
    for (const candidate of candidates) {
      const normalized = this.normalizeNameCandidate(candidate, phone);
      if (normalized) return normalized;
    }
    return null;
  }

  private extractWebwhatsContactName(
    contact:
      | {
          pushName?: string | null;
          name?: string | null;
          displayName?: string | null;
          formattedName?: string | null;
          fullName?: string | null;
          shortName?: string | null;
          notifyName?: string | null;
          verifiedName?: string | null;
          businessName?: string | null;
        }
      | null
      | undefined,
    phone?: string | null,
  ) {
    return this.preferredName(
      contact?.name,
      contact?.displayName,
      contact?.formattedName,
      contact?.fullName,
      contact?.shortName,
      contact?.notifyName,
      contact?.verifiedName,
      contact?.businessName,
      contact?.pushName,
      phone,
    );
  }

  private shouldReplaceStoredName(
    existingName: unknown,
    nextName: string | null,
    phone?: string | null,
  ) {
    const current = this.normalizeNameCandidate(existingName, phone);
    const incoming = this.normalizeNameCandidate(nextName, phone);
    if (!incoming) return false;
    if (!current) return true;
    return current !== incoming;
  }

  private buildConversationCandidate(row: {
    id: number;
    contact: string;
    metadata: string | null;
    lastMessageAt: Date | null;
  }): SyncCandidate | null {
    const metadata = this.parseMetadata(row.metadata);
    const phone = this.normalizePhoneCandidate(row.contact)
      || this.normalizePhoneCandidate(metadata?.whatsappRemoteJidAlt)
      || this.normalizePhoneCandidate(metadata?.remoteJidAlt)
      || this.normalizePhoneCandidate(metadata?.customerPhone)
      || this.normalizePhoneCandidate(metadata?.phone)
      || this.normalizePhoneCandidate(metadata?.whatsappRemoteJid)
      || this.normalizePhoneCandidate(metadata?.remoteJid);
    if (!phone) return null;
    const name = this.preferredNameForPhone(
      phone,
      metadata?.whatsappContactName,
      metadata?.waNickname,
      metadata?.whatsappName,
      metadata?.whatsappProfileName,
    );
    return {
      phone,
      phoneNormalized: this.cadastrosService.normalizeCustomerPhone(phone),
      name,
      conversationId: Number(row.id || 0) || null,
      lastMessageAt: this.toDate(row.lastMessageAt),
    };
  }

  private mergeCandidate(map: Map<string, SyncCandidate>, candidate: SyncCandidate | null) {
    if (!candidate?.phoneNormalized) return;
    const current = map.get(candidate.phoneNormalized);
    if (!current) {
      map.set(candidate.phoneNormalized, candidate);
      return;
    }

    const currentLast = current.lastMessageAt ? current.lastMessageAt.getTime() : 0;
    const candidateLast = candidate.lastMessageAt ? candidate.lastMessageAt.getTime() : 0;
    const preferred = candidateLast > currentLast ? candidate : current;
    const secondary = preferred === candidate ? current : candidate;

    map.set(candidate.phoneNormalized, {
      ...preferred,
      name: preferred.name || secondary.name || null,
      conversationId: preferred.conversationId || secondary.conversationId || null,
      lastMessageAt: preferred.lastMessageAt || secondary.lastMessageAt || null,
    });
  }

  private shouldSyncCandidate(existing: any, candidate: SyncCandidate, resolvedName: string | null) {
    if (!existing) return true;
    const existingOrigin = String(existing.registrationOrigin || '').trim().toLowerCase();
    if (this.shouldReplaceStoredName(existing.name, resolvedName, candidate.phone)) {
      return true;
    }
    if (!existing.conversationId && candidate.conversationId) return true;
    const existingLast = existing.lastMessageAt ? new Date(existing.lastMessageAt).getTime() : 0;
    const candidateLast = candidate.lastMessageAt ? candidate.lastMessageAt.getTime() : 0;
    if (candidateLast > existingLast) return true;
    if (
      resolvedName
      && existingOrigin !== 'manual'
      && this.normalizeNameCandidate(existing.name, candidate.phone) !== resolvedName
    ) {
      return true;
    }
    return String(existing.registrationStatus || '').trim().toLowerCase() !== 'confirmed';
  }

  private async listConversationCandidates(companyId: number) {
    const rows = await this.prisma.companyConversation.findMany({
      where: { companyId, channel: 'whatsapp' },
      select: {
        id: true,
        contact: true,
        metadata: true,
        lastMessageAt: true,
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const byPhone = new Map<string, SyncCandidate>();
    for (const row of rows) {
      this.mergeCandidate(byPhone, this.buildConversationCandidate(row));
    }

    return {
      rows,
      candidatesByPhone: byPhone,
    };
  }

  private async buildMetaCandidates(companyId: number) {
    const { rows, candidatesByPhone } = await this.listConversationCandidates(companyId);
    return {
      candidates: [...candidatesByPhone.values()],
      conversationCount: rows.length,
      syncedConversations: 0,
    };
  }

  private async buildWebwhatsCandidates(companyId: number) {
    const syncedConversations = await this.webwhatsBridge.syncRecentChats(companyId, {
      force: true,
      limit: 120,
      failOnError: true,
    });
    this.logger.log(`Chats sincronizados do WebWhats para company ${companyId}: ${syncedConversations}.`);

    const { rows, candidatesByPhone } = await this.listConversationCandidates(companyId);
    const contacts: Array<{
      remoteJid?: string | null;
      pushName?: string | null;
      name?: string | null;
      displayName?: string | null;
      formattedName?: string | null;
      fullName?: string | null;
      shortName?: string | null;
      notifyName?: string | null;
      verifiedName?: string | null;
      businessName?: string | null;
    }> = await this.webwhatsBridge.listContacts(companyId, { force: true, failOnError: true });
    this.logger.log(`Contatos recebidos do WebWhats para company ${companyId}: ${contacts.length}.`);

    const merged = new Map(candidatesByPhone);
    for (const contact of contacts) {
      const phone = this.normalizePhoneCandidate(contact?.remoteJid);
      if (!phone) continue;
      const phoneNormalized = this.cadastrosService.normalizeCustomerPhone(phone);
      const fromConversation = candidatesByPhone.get(phoneNormalized) || null;
      this.mergeCandidate(merged, {
        phone,
        phoneNormalized,
        name: this.preferredName(
          fromConversation?.name,
          this.extractWebwhatsContactName(contact, phone),
        ),
        conversationId: fromConversation?.conversationId || null,
        lastMessageAt: fromConversation?.lastMessageAt || null,
      });
    }

    return {
      candidates: [...merged.values()],
      conversationCount: rows.length,
      syncedConversations,
    };
  }

  async syncCompanyCustomers(companyId: number, options?: SyncCompanyCustomersOptions) {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) {
      throw new BadRequestException('Empresa nao identificada para sincronizar clientes.');
    }

    const status = await this.operationalStatus.getOperationalStatusForCompany(normalizedCompanyId, {
      refresh: true,
    });
    const engine = this.resolveActiveEngine(status, options?.requiredEngine);
    if (!engine) {
      const target = options?.requiredEngine === 'webwhats'
        ? 'WebWhats QR'
        : options?.requiredEngine === 'meta'
          ? 'Meta'
          : 'WhatsApp';
      throw new BadRequestException(`Nenhum motor ${target} ativo nesta empresa. Conecte o WhatsApp antes de atualizar o cadastro.`);
    }

    const source = engine === 'meta'
      ? await this.buildMetaCandidates(normalizedCompanyId)
      : await this.buildWebwhatsCandidates(normalizedCompanyId);

    if (
      options?.failOnEmptySource
      && source.candidates.length === 0
    ) {
      throw new BadRequestException(
        'WebWhats conectado, mas nenhum chat ou contato foi retornado para espelhamento local.',
      );
    }

    const existingRows = await this.cadastrosService.listRawCustomerRegistry(normalizedCompanyId);
    const existingByPhone = new Map<string, any>(
      existingRows.map((row) => [String(row.phoneNormalized || ''), row]),
    );

    let syncedContacts = 0;
    let createdContacts = 0;
    let updatedContacts = 0;
    let skippedWithoutName = 0;
    let skippedWithoutPhone = 0;
    let skippedUnchanged = 0;
    let syncedWithoutName = 0;

    for (const candidate of source.candidates) {
      if (!candidate.phoneNormalized) {
        skippedWithoutPhone += 1;
        continue;
      }

      const resolvedName = this.normalizeNameCandidate(candidate.name, candidate.phone);

      const existing = existingByPhone.get(candidate.phoneNormalized) || null;
      if (!this.shouldSyncCandidate(existing, candidate, resolvedName)) {
        skippedUnchanged += 1;
        continue;
      }

      const existingOrigin = String(existing?.registrationOrigin || '').trim().toLowerCase();
      const existingStatus = String(existing?.registrationStatus || '').trim().toLowerCase();

      await this.cadastrosService.upsertCustomerRegistry({
        companyId: normalizedCompanyId,
        phone: candidate.phone,
        name: resolvedName || null,
        registrationOrigin: existingOrigin === 'manual' ? 'manual' : engine === 'meta' ? 'meta_sync' : 'webwhats_sync',
        registrationStatus: existingStatus === 'manual' ? 'manual' : 'confirmed',
        route: 'atendimento',
        conversationId: candidate.conversationId || undefined,
        lastMessageAt: candidate.lastMessageAt || undefined,
      });

      syncedContacts += 1;
      if (!resolvedName) {
        syncedWithoutName += 1;
      }
      if (existing) {
        updatedContacts += 1;
      } else {
        createdContacts += 1;
        existingByPhone.set(candidate.phoneNormalized, {
          phoneNormalized: candidate.phoneNormalized,
          name: resolvedName,
          conversationId: candidate.conversationId || null,
          lastMessageAt: candidate.lastMessageAt || null,
          registrationStatus: 'confirmed',
        });
      }
    }

    const message = `Sincronizacao WhatsApp concluida: ${syncedContacts} contatos persistidos, ${source.syncedConversations} chats recentes sincronizados.`;
    this.logger.log(
      `Contatos sincronizados para company ${normalizedCompanyId}: scanned=${source.candidates.length}, synced=${syncedContacts}, created=${createdContacts}, updated=${updatedContacts}, unchanged=${skippedUnchanged}.`,
    );

    return {
      success: true,
      engine,
      sourceLabel: engine === 'meta' ? 'Meta' : 'WebWhats',
      activeMotors: {
        meta: Boolean(status?.metaActive),
        webwhats: Boolean(status?.webWhatsActive),
      },
      scannedContacts: source.candidates.length,
      conversationCount: source.conversationCount,
      syncedConversations: source.syncedConversations,
      syncedContacts,
      createdContacts,
      updatedContacts,
      syncedWithoutName,
      skippedWithoutName,
      skippedWithoutPhone,
      skippedUnchanged,
      message,
    };
  }

  async bootstrapAfterWhatsappConnect(companyId: number): Promise<WhatsAppConnectBootstrapResult> {
    const normalizedCompanyId = Number(companyId || 0);
    if (!normalizedCompanyId) {
      return {
        success: false,
        connected: false,
        bootstrapOk: false,
        syncedContacts: 0,
        syncedConversations: 0,
        engine: null,
        message: 'Empresa nao identificada para executar bootstrap do WhatsApp.',
        error: 'Empresa nao identificada para executar bootstrap do WhatsApp.',
      };
    }

    this.logger.log(`Bootstrap WhatsApp iniciado para company ${normalizedCompanyId}.`);

    let connected = false;

    try {
      const status = await this.operationalStatus.getOperationalStatusForCompany(normalizedCompanyId, {
        refresh: true,
      });

      if (!status?.webWhatsActive) {
        const message = 'WebWhats QR ainda nao esta conectado. Bootstrap local nao executado.';
        this.logger.warn(`Bootstrap WhatsApp falhou para company ${normalizedCompanyId}: ${message}`);
        return {
          success: false,
          connected: false,
          bootstrapOk: false,
          syncedContacts: 0,
          syncedConversations: 0,
          engine: null,
          message,
          error: message,
        };
      }

      connected = true;
      this.logger.log(`QR conectado para company ${normalizedCompanyId}.`);
      const syncResult = await this.syncCompanyCustomers(normalizedCompanyId, {
        requiredEngine: 'webwhats',
        failOnEmptySource: false,
      });

      const payload: WhatsAppConnectBootstrapResult = {
        success: true,
        connected: true,
        bootstrapOk: true,
        syncedContacts: Number(syncResult.syncedContacts || 0),
        syncedConversations: Number(syncResult.syncedConversations || 0),
        engine: 'webwhats',
        message: syncResult.message || 'Bootstrap WhatsApp concluido com sucesso.',
        error: null,
      };
      this.logger.log(
        `Bootstrap WhatsApp concluido para company ${normalizedCompanyId}: contacts=${payload.syncedContacts}, chats=${payload.syncedConversations}.`,
      );
      // Cutuca a inbox agora (caso o onConnected do front tenha disparado loadConvs antes
      // deste sync terminar) e agenda re-syncs deferidos pro motor terminar de esquentar —
      // mata o "precisa hard refresh" e backfilla as fotos que ainda não vieram.
      this.publishInboxRefresh(normalizedCompanyId);
      this.scheduleDeferredResync(normalizedCompanyId);
      return payload;
    } catch (error: any) {
      const message = String(error?.message || 'Falha ao executar bootstrap local do WhatsApp.');
      this.logger.error(`Bootstrap WhatsApp falhou para company ${normalizedCompanyId}: ${message}`);
      return {
        success: false,
        connected,
        bootstrapOk: false,
        syncedContacts: 0,
        syncedConversations: 0,
        engine: connected ? 'webwhats' : null,
        message: connected
          ? 'WhatsApp conectou, mas falhou ao espelhar conversas/clientes.'
          : 'Falha ao confirmar conexão do WhatsApp QR antes do bootstrap.',
        error: message,
      };
    }
  }
}
