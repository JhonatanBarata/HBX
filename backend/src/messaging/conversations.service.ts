import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';
import {
  buildWhatsAppPhoneCandidates,
  normalizeWhatsAppPhone,
} from './whatsapp-channel';
import { resolveWhatsAppCredentials } from './whatsapp-credentials.util';
import { buildMotorStateByCompany, isModalSendReady } from './whatsapp-connection-state';
import { applyMasterWhatsAppCredentials } from '../modules/master-global-integrations.util';
import {
  META_TEMPLATES_REQUIRED_MESSAGE,
  resolveProviderCapabilitiesFromCompany,
} from '../inbox/atendimento-config';
import { WebwhatsBridgeService } from './webwhats-bridge.service';
import { CommercialAutomationStateService } from '../automation/commercial-automation-state.service';
import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../companies/master-whatsapp-company.constants';

function requireCompanyIdFromUser(user: any): number {
  const companyId = Number(user?.companyId);
  if (!companyId) throw new ForbiddenException('Company context required');
  return companyId;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const COMMERCIAL_PROSPECTION_SOURCES = new Set([
  'vendas_prospeccao_bot',
  'prospeccao_bot',
]);
const COMMERCIAL_WHATSAPP_RECIPIENT_CONFIRMATION_SOURCES = new Set([
  ...COMMERCIAL_PROSPECTION_SOURCES,
  'vendas_human',
]);

export type WhatsappRecipientConfirmation = {
  status: 'confirmed' | 'unavailable' | 'unknown';
  checkedAt: Date | null;
};

function normalizeWhatsAppContact(raw: string): string {
  const normalized = normalizeWhatsAppPhone(raw);
  if (normalized) return normalized;
  return String(raw || '').trim();
}

function normalizeModuleName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export type QueueOutboundPayload = {
  conversationId?: number;
  to: string;
  body?: string;
  at?: Date;
  messageType?: 'text' | 'template' | 'interactive' | string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  interactivePayload?: Record<string, any>;
  sourceModule?: string;
  contactId?: string;
  senderType?: 'bot' | 'human' | 'client' | 'system' | string;
  variables?: Record<string, unknown>;
  flowState?: ConversationStatePatch;
  whatsappEndpointId?: string;
  preferredModuleKey?: string;
  // Fase 3: vínculo opcional do passo lógico comercial com a outbox física.
  automationStepRunId?: string;
  // PR20072026-CHIP (A3): identidade de quem MANDA este envio (viewer do envio manual via
  // inbox.service#sendMessage, ou createdByUserId da campanha do bot via vendas-automation).
  // Só é usado quando a CONVERSA está ÓRFÃ (sem whatsappConnectionSessionId/sourceTenantKey
  // próprios) — nesse caso resolve a sessão ativa deste usuário e carimba o companyMessage
  // com ela, em vez de deixar o dispatch cair no "chip mais recente da empresa". Não
  // regride o caso que já funciona (conversa com sessão vinculada continua mandando nela).
  senderUserId?: number | null;
};

export type ConversationStatePatch = {
  currentFlow?: string;
  currentStep?: string;
  flowResult?: string | null;
  botActive?: boolean;
  humanAssigned?: boolean;
  assignedUserId?: number | null;
  metadata?: Record<string, unknown> | null;
  lastInteractionAt?: Date;
};

// WORM-13 (13b) — hook de inbound para os gatilhos reativos. O CadenciaGatilho
// service se registra aqui (setCadenciaInboundHook) e o MessagingService dispara
// (dispatchCadenciaInbound) de dentro de processPersistedInbound, quando um humano
// real responde. Registrar aqui (nao no MessagingService) evita ciclo de modulo:
// ConversationsService ja e exportado e injetado nos dois lados.
export type CadenciaInboundHookInput = {
  companyId: number;
  fromPhone: string;
  conversationId?: number | null;
  text?: string | null;
};

export type VendasCockpitProjectionHookInput = {
  companyId: number;
  conversationId: number;
  event: 'queued' | 'sending' | 'sent' | 'failed' | 'canceled' | 'delivery' | 'inbound';
  messageId?: number | null;
  validHumanInbound?: boolean;
};

export type RecoveryAutomationHookInput = VendasCockpitProjectionHookInput;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private cadenciaInboundHook: ((input: CadenciaInboundHookInput) => Promise<void>) | null = null;
  private vendasCockpitProjectionHook:
    ((input: VendasCockpitProjectionHookInput) => Promise<void>) | null = null;
  private recoveryAutomationHook:
    ((input: RecoveryAutomationHookInput) => Promise<void>) | null = null;
  // 30/07 — leitura do MOTOR AO VIVO no gate de enfileiramento (mesmo padrão já usado em
  // ModulesService/MasterCockpitService: `/instance/fetchInstances` via listMotorInstances,
  // SÓ LEITURA, jamais connect/reconnect/logout). Cache de 60 s + single-flight + teto de
  // espera: o caminho quente do enqueue nunca martela o motor nem paga o timeout inteiro dele.
  private motorInstancesCache: { at: number; value: any[] | null } | null = null;
  private motorInstancesProbe: Promise<any[] | null> | null = null;
  private static readonly MOTOR_INSTANCES_TTL_MS = 60_000;
  private static readonly MOTOR_PROBE_WAIT_MS = 2_500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
  ) {}

  // Registro do relay (chamado pelo CadenciaGatilhoService.onModuleInit).
  setCadenciaInboundHook(handler: ((input: CadenciaInboundHookInput) => Promise<void>) | null) {
    this.cadenciaInboundHook = handler;
  }

  // Dispatch best-effort: nunca lanca (nao pode derrubar o processamento do inbound).
  async dispatchCadenciaInbound(input: CadenciaInboundHookInput) {
    const hook = this.cadenciaInboundHook;
    if (!hook) return;
    try {
      await hook(input);
    } catch {
      // silencioso: gatilho reativo e aditivo, nunca bloqueia o inbound.
    }
  }

  setVendasCockpitProjectionHook(
    handler: ((input: VendasCockpitProjectionHookInput) => Promise<void>) | null,
  ) {
    this.vendasCockpitProjectionHook = handler;
  }

  setRecoveryAutomationHook(
    handler: ((input: RecoveryAutomationHookInput) => Promise<void>) | null,
  ) {
    this.recoveryAutomationHook = handler;
  }

  // A mensageria não conhece o modelo do CRM. Publica somente o fato persistido;
  // o projetor de Vendas reconstrói o snapshot de forma best-effort e idempotente.
  async dispatchVendasCockpitProjection(input: VendasCockpitProjectionHookInput) {
    const hook = this.vendasCockpitProjectionHook;
    if (hook) {
      try {
        await hook(input);
      } catch (error: unknown) {
        // A projeção nunca pode transformar sucesso/falha do provedor em retry de envio.
        this.logger.warn(
          `Falha ao atualizar cockpit de Vendas company=${input.companyId} conversation=${input.conversationId} event=${input.event}: ${String((error as any)?.message || error)}`,
        );
      }
    }
    if (this.recoveryAutomationHook) {
      try {
        await this.recoveryAutomationHook(input);
      } catch (error: unknown) {
        this.logger.warn(
          `Falha ao projetar automação Recovery company=${input.companyId} conversation=${input.conversationId} event=${input.event}: ${String((error as any)?.message || error)}`,
        );
      }
    }
  }

  private async supportsWhatsAppEndpointTable() {
    return this.prisma.hasTable('CompanyWhatsAppEndpoint');
  }

  private async supportsOutboundEndpointColumn() {
    return this.prisma.hasColumn('OutboundMessage', 'whatsappEndpointId');
  }

  private pickPreferredConversation(candidates: any[], normalizedContact: string) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const normalizedDigits = String(normalizedContact || '').replace(/\D/g, '');
    const humanAssigned = candidates.find((row) => row?.humanAssigned);
    if (humanAssigned) return humanAssigned;

    const exact = candidates.find((row) => String(row?.contact || '').trim() === normalizedContact);
    if (exact) return exact;

    const digitMatch = candidates.find((row) => {
      const candidateDigits = String(row?.contact || '').replace(/\D/g, '');
      return candidateDigits && normalizedDigits && candidateDigits === normalizedDigits;
    });
    if (digitMatch) return digitMatch;

    return candidates[0];
  }

  private parseConversationMetadata(raw: string | null | undefined) {
    if (!raw) return {} as Record<string, any>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }

  private async getOrCreateConversation(input: { companyId: number; contact: string; channel?: string; at?: Date; touchLastMessage?: boolean }) {
    const companyId = Number(input.companyId);
    const channel = String(input.channel || 'whatsapp');
    const contact =
      channel === 'whatsapp'
        ? normalizeWhatsAppContact(input.contact)
        : String(input.contact || '').trim();
    if (!companyId) throw new ForbiddenException('Company context required');
    if (!contact) throw new BadRequestException('Contact is required');

    const at = input.at ?? new Date();
    const touchLastMessage = input.touchLastMessage !== false;
    if (channel === 'whatsapp') {
      const candidates = buildWhatsAppPhoneCandidates(contact);
      const digits = contact.replace(/\D/g, '');
      if (digits || candidates.length) {
        const existingRows = await this.prisma.companyConversation.findMany({
          where: {
            companyId,
            channel,
            OR: [
              { contact: contact },
              ...candidates.map((candidate) => ({ contact: candidate })),
              ...(digits ? [{ contact: { endsWith: digits } }] : []),
            ],
          },
          orderBy: { lastMessageAt: 'desc' },
        });
        const existing = this.pickPreferredConversation(existingRows, contact);
        if (existing) {
          const conflictingTarget = existingRows.find(
            (row) => row.id !== existing.id && String(row.contact || '').trim() === contact,
          );
          const updateData: Record<string, any> = {
            contact: conflictingTarget ? String(existing.contact || '').trim() : contact,
          };
          if (touchLastMessage) {
            updateData.lastMessageAt = at;
            updateData.lastInteractionAt = at;
          }
          return this.prisma.companyConversation.update({
            where: { id: existing.id },
            data: updateData,
          });
        }
      }
    }
    const createData: any = { companyId, channel, contact, botActive: false };
    if (touchLastMessage) {
      createData.lastMessageAt = at;
      createData.lastInteractionAt = at;
    }
    if (!touchLastMessage) {
      const existing = await this.prisma.companyConversation.findFirst({
        where: { companyId, channel, contact },
        orderBy: { updatedAt: 'desc' },
      });
      if (existing) return existing;
      return this.prisma.companyConversation.create({ data: createData });
    }
    const updateData: any = {};
    if (touchLastMessage) {
      updateData.lastMessageAt = at;
      updateData.lastInteractionAt = at;
    }
    const existing = await this.prisma.companyConversation.findFirst({
      where: { companyId, channel, contact },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) {
      return this.prisma.companyConversation.update({
        where: { id: existing.id },
        data: updateData,
      });
    }
    try {
      return await this.prisma.companyConversation.create({ data: createData });
    } catch (error: unknown) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const winner = await this.prisma.companyConversation.findFirst({
        where: { companyId, channel, contact },
        orderBy: { updatedAt: 'desc' },
      });
      if (winner) return winner;
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(error) && typeof error === 'object' && (error as any).code === 'P2002';
  }

  private normalizeConversationStatePatch(patch: ConversationStatePatch | undefined) {
    if (!patch) return {};
    const data: any = {};
    if (patch.currentFlow !== undefined) data.currentFlow = String(patch.currentFlow || '').trim() || 'cobranca_recovery';
    if (patch.currentStep !== undefined) data.currentStep = String(patch.currentStep || '').trim() || 'novo';
    if (patch.flowResult !== undefined) data.flowResult = patch.flowResult === null ? null : String(patch.flowResult || '').trim() || null;
    if (patch.botActive !== undefined) data.botActive = Boolean(patch.botActive);
    if (patch.humanAssigned !== undefined) data.humanAssigned = Boolean(patch.humanAssigned);
    if (patch.assignedUserId !== undefined) {
      const parsed = Number(patch.assignedUserId || 0);
      data.assignedUserId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    if (patch.metadata !== undefined) data.metadata = patch.metadata === null ? null : JSON.stringify(patch.metadata || {});
    if (patch.lastInteractionAt !== undefined) data.lastInteractionAt = patch.lastInteractionAt || new Date();
    return data;
  }

  async updateConversationState(companyIdInput: number, conversationIdInput: number, patch: ConversationStatePatch) {
    const companyId = Number(companyIdInput);
    const conversationId = Number(conversationIdInput);
    if (!companyId || !conversationId) throw new BadRequestException('companyId e conversationId sao obrigatorios.');
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa nao encontrada para esta empresa.');
    const data = this.normalizeConversationStatePatch(patch);
    if (!Object.keys(data).length) return this.prisma.companyConversation.findUnique({ where: { id: conversationId } });
    return this.prisma.companyConversation.update({
      where: { id: conversationId },
      data,
    });
  }

  async getOrCreateConversationForContact(
    companyIdInput: number,
    contactRaw: string,
    patch?: ConversationStatePatch,
  ) {
    const companyId = Number(companyIdInput);
    const contact = String(contactRaw || '').trim();
    if (!companyId) throw new BadRequestException('companyId obrigatorio.');
    if (!contact) throw new BadRequestException('contact obrigatorio.');
    const now = new Date();
    const conversation = await this.getOrCreateConversation({
      companyId,
      contact,
      channel: 'whatsapp',
      at: now,
      touchLastMessage: false,
    });
    const data = this.normalizeConversationStatePatch(patch);
    if (!Object.keys(data).length) return conversation;
    return this.prisma.companyConversation.update({
      where: { id: conversation.id },
      data,
    });
  }

  async listConversations(user: any, opts?: { take?: number }) {
    const companyId = requireCompanyIdFromUser(user);
    const take = Math.min(Math.max(opts?.take ?? 50, 1), 200);
    return this.prisma.companyConversation.findMany({
      where: { companyId },
      orderBy: { lastMessageAt: 'desc' },
      take,
    });
  }

  async listConversationMessages(user: any, conversationId: number, opts?: { take?: number }) {
    const companyId = requireCompanyIdFromUser(user);
    const conv = await this.prisma.companyConversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.companyId !== companyId) throw new NotFoundException('Conversation not found');

    const take = Math.min(Math.max(opts?.take ?? 200, 1), 500);
    return this.prisma.companyMessage.findMany({
      where: { companyId, conversationId },
      orderBy: { timestamp: 'asc' },
      take,
    });
  }

  async recordInboundMessage(input: {
    companyId: number;
    from: string;
    body: string;
    receivedAt?: Date;
    providerMessageId?: string;
    rawPayload?: any;
    messageType?: string;
    senderType?: string;
    variables?: Record<string, unknown>;
    sourceModule?: string;
  }) {
    const companyId = Number(input.companyId);
    const from = normalizeWhatsAppContact(input.from);
    const body = String(input.body || '');
    const at = input.receivedAt ?? new Date();
    const providerMessageId = String(input.providerMessageId || '').trim() || null;

    if (providerMessageId) {
      const existing = await this.prisma.companyMessage.findUnique({
        where: { providerMessageId },
      });
      if (existing) {
        if (Number(existing.companyId) !== companyId) {
          throw new BadRequestException('Mensagem do provedor pertence a outra empresa.');
        }
        return { ...existing, isNew: false };
      }
    }

    const conversation = await this.getOrCreateConversation({ companyId, contact: from, channel: 'whatsapp', at });
    const messageType = String(input.messageType || 'text').trim().toLowerCase() || 'text';
    const senderType = String(input.senderType || 'client').trim().toLowerCase() || 'client';
    const sourceModule = String(input.sourceModule || 'whatsapp_webhook').trim() || 'whatsapp_webhook';
    const variablesJson = input.variables === undefined ? undefined : JSON.stringify(input.variables || {});

    const createData = {
      companyId,
      conversationId: conversation.id,
      whatsappConnectionSessionId: conversation.whatsappConnectionSessionId || undefined,
      sourcePhoneNormalized: conversation.sourcePhoneNormalized || undefined,
      sourceTenantKey: conversation.sourceTenantKey || undefined,
      contactId: from,
      direction: 'INBOUND',
      messageType,
      body,
      senderType,
      status: 'RECEIVED',
      timestamp: at,
      sourceModule,
      variablesJson,
      provider: 'WHATSAPP_CLOUD',
      providerMessageId: providerMessageId || undefined,
      rawPayload: input.rawPayload === undefined ? undefined : JSON.stringify(input.rawPayload),
    } as const;

    if (providerMessageId) {
      try {
        const created = await this.prisma.companyMessage.create({ data: createData });
        return { ...created, isNew: true };
      } catch (error: unknown) {
        if (!this.isUniqueConstraintError(error)) throw error;
        const existing = await this.prisma.companyMessage.findUnique({
          where: { providerMessageId },
        });
        if (!existing || Number(existing.companyId) !== companyId) throw error;
        return { ...existing, isNew: false };
      }
    }

    const created = await this.prisma.companyMessage.create({ data: createData });
    return { ...created, isNew: true };
  }

  private normalizeMessageType(value: string | null | undefined): 'text' | 'template' | 'interactive' {
    const normalized = String(value || 'text').trim().toLowerCase();
    if (normalized === 'template') return 'template';
    if (normalized === 'interactive') return 'interactive';
    return 'text';
  }

  private renderInteractiveFallbackText(payload: Record<string, any> | null | undefined, fallbackBody: string) {
    const body = String(payload?.body?.text || fallbackBody || '').trim();
    const labels: string[] = [];
    const buttons = Array.isArray(payload?.action?.buttons) ? payload.action.buttons : [];
    for (const button of buttons) {
      const title = String(button?.reply?.title || button?.title || '').trim();
      if (title) labels.push(title);
    }
    const sections = Array.isArray(payload?.action?.sections) ? payload.action.sections : [];
    for (const section of sections) {
      for (const row of Array.isArray(section?.rows) ? section.rows : []) {
        const title = String(row?.title || '').trim();
        if (title) labels.push(title);
      }
    }
    if (!labels.length) return body;
    return `${body}\n\n${labels.map((label, index) => `${index + 1}. ${label}`).join('\n')}`.trim();
  }

  private async hasOpenCustomerServiceWindow(companyId: number, conversationId: number): Promise<boolean> {
    const lastInbound = await this.prisma.companyMessage.findFirst({
      where: { companyId, conversationId, direction: 'INBOUND' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    if (!lastInbound?.timestamp) return false;
    return Date.now() - new Date(lastInbound.timestamp).getTime() <= TWENTY_FOUR_HOURS_MS;
  }

  private isBotOutbound(sourceModule: string, senderType: string): boolean {
    const source = normalizeModuleName(sourceModule);
    const sender = normalizeModuleName(senderType);
    return sender === 'bot' || source.includes('bot');
  }

  private isProspectionOutbound(sourceModule: string, variables?: Record<string, unknown>): boolean {
    const source = normalizeModuleName(sourceModule);
    const botType = normalizeModuleName(String(variables?.botType || variables?.bot_type || ''));
    return (
      source.includes('prospeccao') ||
      source.includes('prospect') ||
      botType === 'prospeccao' ||
      botType === 'prospection'
    );
  }

  private resolveCommercialLeadId(
    sourceModule: string,
    variables?: Record<string, unknown>,
  ): string | null {
    if (!COMMERCIAL_PROSPECTION_SOURCES.has(normalizeModuleName(sourceModule))) return null;
    return String(variables?.leadId || '').trim() || null;
  }

  /**
   * Confirma o DESTINATÁRIO na porta oficial do zap-gate. O cache persistente,
   * teto e disjuntor continuam pertencendo ao WebwhatsBridgeService; este método
   * só traduz o resultado para a regra comercial "Vendas só fala com WhatsApp
   * confirmado". Falha de infraestrutura é `unknown` e nunca vira permissão.
   */
  async confirmWhatsappRecipient(toRaw: unknown): Promise<WhatsappRecipientConfirmation> {
    const to = normalizeWhatsAppContact(String(toRaw || ''));
    if (!to) return { status: 'unavailable', checkedAt: null };

    const engineCompany = await this.prisma.company.findUnique({
      where: { slug: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG },
      select: { id: true },
    }).catch(() => null);
    if (!engineCompany?.id) {
      this.logger.warn('[whatsapp-recipient-gate] empresa tecnica de verificacao nao encontrada; envio automatico bloqueado');
      return { status: 'unknown', checkedAt: null };
    }

    try {
      const [lookup] = await this.webwhatsBridge.checkWhatsappNumbers(
        Number(engineCompany.id),
        [to],
        undefined,
        { maxWaitMs: 5_000 },
      );
      if (!lookup) return { status: 'unknown', checkedAt: null };
      return {
        status: lookup.exists === true ? 'confirmed' : 'unavailable',
        checkedAt: new Date(),
      };
    } catch (error: unknown) {
      this.logger.warn(
        `[whatsapp-recipient-gate] nao foi possivel confirmar destinatario; envio automatico bloqueado: ${String((error as any)?.message || error)}`,
      );
      return { status: 'unknown', checkedAt: null };
    }
  }

  private async assertCommercialWhatsappRecipientConfirmed(input: {
    to: string;
    sourceModule: string;
  }) {
    if (!COMMERCIAL_WHATSAPP_RECIPIENT_CONFIRMATION_SOURCES.has(normalizeModuleName(input.sourceModule))) return;

    const confirmation = await this.confirmWhatsappRecipient(input.to);
    if (confirmation.status === 'confirmed') return;
    const code = confirmation.status === 'unavailable'
      ? 'WHATSAPP_RECIPIENT_UNAVAILABLE'
      : 'WHATSAPP_RECIPIENT_UNCONFIRMED';
    throw new BadRequestException({
      code,
      message: confirmation.status === 'unavailable'
        ? 'Este telefone não possui WhatsApp confirmado. Envio bloqueado.'
        : 'Não foi possível confirmar o WhatsApp deste contato. Envio bloqueado.',
    });
  }

  private async hasAnyInboundMessage(companyId: number, conversationId: number): Promise<boolean> {
    const inbound = await this.prisma.companyMessage.findFirst({
      where: { companyId, conversationId, direction: 'INBOUND' },
      select: { id: true },
      orderBy: { timestamp: 'desc' },
    });
    return Boolean(inbound?.id);
  }

  private async assertBotOutboundMayContinueConversation(input: {
    companyId: number;
    conversationId: number;
    sourceModule: string;
    senderType: string;
    messageType: 'text' | 'template' | 'interactive';
    variables?: Record<string, unknown>;
  }) {
    if (!this.isBotOutbound(input.sourceModule, input.senderType)) return;
    if (this.isProspectionOutbound(input.sourceModule, input.variables)) return;
    const source = normalizeModuleName(input.sourceModule);
    const botType = normalizeModuleName(String(input.variables?.botType || input.variables?.bot_type || ''));
    if ((source.includes('recovery') || botType === 'recovery') && input.messageType === 'template') return;
    if (await this.hasAnyInboundMessage(input.companyId, input.conversationId)) return;

    throw new BadRequestException(
      'Bot nao pode iniciar conversa no WhatsApp. Aguarde uma mensagem do cliente ou use um fluxo de prospeccao autorizado.',
    );
  }

  // ---------------------------------------------------------------------------
  // 30/07 — GATE DO CHIP MORTO (fonte da verdade = motor ao vivo, não o banco)
  // ---------------------------------------------------------------------------
  // Leitura cacheada (60 s) e com teto de espera do `/instance/fetchInstances`. Retorna a
  // lista crua ou null quando NÃO houve leitura (motor desligado/mudo/lento) — null nunca
  // recusa nada. Single-flight: rajada de enfileiramento não vira rajada no motor.
  private async readMotorInstancesCached(): Promise<any[] | null> {
    const cached = this.motorInstancesCache;
    if (cached && Date.now() - cached.at < ConversationsService.MOTOR_INSTANCES_TTL_MS) {
      return cached.value;
    }
    const bridge = this.webwhatsBridge as any;
    if (typeof bridge?.listMotorInstances !== 'function') return null;

    if (!this.motorInstancesProbe) {
      this.motorInstancesProbe = Promise.resolve()
        .then(() => bridge.listMotorInstances())
        .then((value: any[] | null) => {
          const normalized = Array.isArray(value) ? value : null;
          this.motorInstancesCache = { at: Date.now(), value: normalized };
          return normalized;
        })
        .catch((error: unknown) => {
          this.motorInstancesCache = { at: Date.now(), value: null };
          this.logger.warn(`Leitura do motor falhou no gate de envio: ${String((error as any)?.message || error)}`);
          return null;
        })
        .finally(() => {
          this.motorInstancesProbe = null;
        });
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const value = await Promise.race([
      this.motorInstancesProbe,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ConversationsService.MOTOR_PROBE_WAIT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
    return value;
  }

  // true  = motor confirma chip vivo (open/connecting) nesta empresa;
  // false = EVIDÊNCIA POSITIVA de chip morto (motor respondeu com instâncias e nenhuma desta
  //         empresa está viva);
  // null  = sem leitura → não decide nada (nunca recusa por falta de informação).
  // Motor respondendo com ZERO instâncias no total é ambíguo (motor recém-reiniciado ainda
  // carregando) — vale como "sem leitura", não como prova de chip morto.
  private async readCompanyChipStateOnMotor(companyId: number): Promise<boolean | null> {
    const instances = await this.readMotorInstancesCached();
    if (!Array.isArray(instances) || !instances.length) return null;
    const byCompany = buildMotorStateByCompany(instances);
    // 31/07 — FREIO: motor respondeu, mas NENHUMA instância virou empresa reconhecível
    // (nome em campo que não sabemos ler / formato novo do motor). Isso é falha de LEITURA
    // nossa, não prova de chip morto — e sem este freio ela derrubava o envio de TODOS os
    // tenants com 400 (31/07: `name` no lugar de `instanceName`, chip `open` o tempo todo).
    // Sem leitura confiável não se recusa nada; quem recusa é evidência, nunca ignorância.
    if (!byCompany.size) {
      this.logger.warn(
        `[chip-morto] leitura do motor ININTELIGIVEL (${instances.length} instancia(s), nenhuma reconhecida) — gate NAO recusa`,
      );
      return null;
    }
    const state = byCompany.get(Number(companyId)) || '';
    return state === 'open' || state === 'connecting';
  }

  // Gate do ENQUEUE para o canal Evolution/Webwhats.
  //
  // Antes: `if (evolutionChannel && !modalConnected)` — a coluna `company.whatsappModalStatus`
  // PULAVA a checagem inteira. Como no modo por-vendedor essa coluna congelava (empresa 5 ficou
  // 'CONNECTED' de 20/07 a 30/07 com o chip caído), cadência/bot/IA/recovery enfileiravam contra
  // chip morto e só descobriam no dispatch, queimando as 3 tentativas do outbox.
  //
  // Agora a coluna NÃO abre portão nenhum — ela só entra no log como forense. A liberação exige:
  //   1. sessão webwhats VIVA para esta conversa/empresa (linha WhatsAppConnectionSession); e
  //   2. o motor ao vivo NÃO desmentindo essa sessão.
  // Recusa é clara e registrada; NUNCA reconecta, religa ou tenta de novo — chip caído se resolve
  // reconectando na tela, jamais em laço.
  private async assertWebwhatsChipAliveForQueue(
    companyId: number,
    conversation: any,
    columnSaysConnected: boolean,
  ) {
    const selector = {
      sessionId: conversation?.whatsappConnectionSessionId ?? null,
      tenantKey: conversation?.sourceTenantKey ?? null,
    };
    const forensics =
      `company=${companyId} conversation=${conversation?.id ?? 'nova'} ` +
      `sessionId=${selector.sessionId ?? 'null'} tenantKey=${selector.tenantKey ?? 'null'} ` +
      `colunaEmpresa=${columnSaysConnected ? 'CONNECTED(pode estar velha)' : 'nao-conectada'}`;

    const hasLiveSession = await this.webwhatsBridge.hasOperationalSession(companyId, selector);
    if (!hasLiveSession) {
      this.logger.warn(`[chip-morto] enqueue RECUSADO — sem sessao webwhats viva: ${forensics}`);
      throw new BadRequestException('WhatsApp Evolution nao configurado para esta empresa.');
    }

    const motorChipAlive = await this.readCompanyChipStateOnMotor(companyId);
    if (motorChipAlive === false) {
      this.logger.warn(`[chip-morto] enqueue RECUSADO — motor sem chip vivo: ${forensics}`);
      throw new BadRequestException(
        'WhatsApp desconectado: o motor nao tem chip vivo para esta empresa. Reconecte o WhatsApp antes de enviar.',
      );
    }
  }

  async queueOutboundForCompany(companyIdInput: number, payload: QueueOutboundPayload) {
    const companyId = Number(companyIdInput);
    const to = normalizeWhatsAppContact(payload?.to || '');
    const at = payload?.at ?? new Date();
    let messageType = this.normalizeMessageType(payload?.messageType);
    const templateName = String(payload?.templateName || '').trim();
    const templateLanguage = String(payload?.templateLanguage || 'pt_BR').trim();
    const sourceModule = String(payload?.sourceModule || 'atendimento').trim().toLowerCase() || 'atendimento';
    const senderType =
      String(
        payload?.senderType ||
          (sourceModule.includes('human') ? 'human' : sourceModule.includes('bot') ? 'bot' : 'system'),
      )
        .trim()
        .toLowerCase() || 'system';
    const bodyFromPayload = String(payload?.body || '').trim();
    let body = messageType === 'template' ? (bodyFromPayload || `[template:${templateName || 'unknown'}]`) : bodyFromPayload;
    const contactId = String(payload?.contactId || to).trim();
    const variablesJson = payload?.variables === undefined ? null : JSON.stringify(payload.variables || {});
    const commercialLeadId = this.resolveCommercialLeadId(sourceModule, payload?.variables);
    const automationStepRunId = String(payload?.automationStepRunId || '').trim() || null;

    if (!companyId) throw new ForbiddenException('Company context required');
    if (!to) throw new BadRequestException('to is required');

    // Portão positivo do Vendas: robô e humano só entram na outbox depois que
    // o motor confirma o destinatário. Outros módulos reativos ficam intactos.
    await this.assertCommercialWhatsappRecipientConfirmed({
      to,
      sourceModule,
    });

    const companyRow = (await this.supportsWhatsAppEndpointTable())
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
    const { company } = await applyMasterWhatsAppCredentials(this.prisma, companyRow);
    if (!company) throw new NotFoundException(`Company with id ${companyId} not found`);
    const providerCapabilities = resolveProviderCapabilitiesFromCompany(company);
    if (messageType === 'template' && !providerCapabilities.canUseTemplates) {
      throw new BadRequestException(META_TEMPLATES_REQUIRED_MESSAGE);
    }
    if (messageType === 'interactive' && !providerCapabilities.canUseOfficialButtons) {
      body = this.renderInteractiveFallbackText(payload?.interactivePayload || null, body);
      messageType = 'text';
    }

    let conversation = null as any;
    if (Number(payload?.conversationId || 0) > 0) {
      conversation = await this.prisma.companyConversation.findFirst({
        where: { id: Number(payload.conversationId), companyId, channel: 'whatsapp' },
      });
    }
    if (!conversation) {
      conversation = await this.getOrCreateConversation({ companyId, contact: to, channel: 'whatsapp', at });
    }
    await this.assertBotOutboundMayContinueConversation({
      companyId,
      conversationId: conversation.id,
      sourceModule,
      senderType,
      messageType,
      variables: payload?.variables,
    });
    const conversationMetadata = this.parseConversationMetadata(conversation?.metadata);
    const resolvedCreds = resolveWhatsAppCredentials(company, {
      endpointId:
        String(payload?.whatsappEndpointId || '').trim() ||
        String(conversationMetadata.whatsappEntryEndpointId || '').trim() ||
        undefined,
      preferredModuleKey:
        String(payload?.preferredModuleKey || '').trim().toLowerCase() ||
        String(conversationMetadata.whatsappEntryModuleKey || '').trim().toLowerCase() ||
        undefined,
      sourceModule,
    });
    const modalConnected = isModalSendReady((company as any)?.whatsappModalStatus);
    const hasMetaCredentials = Boolean(resolvedCreds.phoneNumberId);
    const evolutionChannel = providerCapabilities.provider === 'evolution';

    if (evolutionChannel) {
      await this.assertWebwhatsChipAliveForQueue(companyId, conversation, modalConnected);
    }
    if (!evolutionChannel && !hasMetaCredentials) {
      throw new BadRequestException('WhatsApp nao configurado para esta empresa.');
    }

    // The 24h customer service window is a Meta Cloud API restriction.
    // If modal/webwhats is connected, allow free-form text queueing.
    if (!evolutionChannel) {
      const openWindow = await this.hasOpenCustomerServiceWindow(companyId, conversation.id);
      if (!openWindow && messageType !== 'template') {
        throw new BadRequestException('Fora da janela de 24h. Use template aprovado pela Meta.');
      }
    }
    if (messageType === 'template' && !templateName) {
      throw new BadRequestException('templateName obrigatorio para envio template.');
    }
    if (messageType === 'interactive' && !payload?.interactivePayload) {
      throw new BadRequestException('interactivePayload obrigatorio para envio interactive.');
    }
    if (!body) {
      throw new BadRequestException('body is required');
    }

    // PR20072026-CHIP (A3): companyMessage hoje só copia sessão/tenantKey da CONVERSA. Se ela
    // nasceu órfã (shells da ponte agenda<->vendas sem sessão do vendedor — causa raiz do
    // vazamento 20/07), tenta resolver pelo payload.senderUserId (viewer do envio manual /
    // dono da campanha do bot). Fallback: conversa -> payload -> null. Em modo SHARED, sem
    // sessão própria do usuário não é bug (todo mundo usa o chip do pool via ponteiro da
    // empresa) — não falha fechado; só modo INDIVIDUAL bloqueia.
    let resolvedSessionId = conversation.whatsappConnectionSessionId || null;
    let resolvedTenantKey = conversation.sourceTenantKey || null;
    let resolvedPhoneNormalized = conversation.sourcePhoneNormalized || null;
    const senderUserId = Number(payload?.senderUserId || 0) || null;
    if (!resolvedSessionId && senderUserId) {
      const senderSession = await this.prisma.whatsAppConnectionSession.findFirst({
        where: { companyId, provider: 'webwhats', status: 'active', userId: senderUserId },
        orderBy: [{ connectedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, tenantKey: true, phoneNormalized: true },
      });
      if (senderSession?.id) {
        resolvedSessionId = String(senderSession.id);
        resolvedTenantKey = senderSession.tenantKey || null;
        resolvedPhoneNormalized = senderSession.phoneNormalized || null;
      } else {
        const isSharedMode = String((company as any)?.whatsappAttendanceMode || '').trim().toLowerCase() === 'shared';
        if (!isSharedMode) {
          throw new BadRequestException('Chip do remetente não está conectado — envio bloqueado para não sair por outro número.');
        }
      }
    }

    const queued = await this.prisma.$transaction(async (tx) => {
      if (commercialLeadId) {
        const lead = await tx.vendasLead.findFirst({
          where: { id: commercialLeadId, companyId },
          select: { id: true },
        });
        if (!lead) {
          throw new BadRequestException('Lead comercial nao pertence a esta empresa.');
        }
        const linked = await tx.companyConversation.updateMany({
          where: {
            id: conversation.id,
            companyId,
            OR: [{ vendasLeadId: null }, { vendasLeadId: commercialLeadId }],
          },
          data: {
            vendasLeadId: commercialLeadId,
            vendasLeadLinkedAt: at,
            vendasLeadLinkSource: sourceModule,
          },
        });
        if (linked.count !== 1) {
          throw new BadRequestException('Conversa ja vinculada a outro lead comercial.');
        }
      }

      const outboundData: any = {
        companyId,
        contactId: contactId || to,
        to,
        body,
        messageType,
        templateName: messageType === 'template' ? templateName : null,
        templateLanguage: messageType === 'template' ? templateLanguage : null,
        templateComponents:
          messageType === 'template'
            ? JSON.stringify(payload?.templateComponents || [])
            : messageType === 'interactive'
              ? JSON.stringify(payload?.interactivePayload || {})
              : null,
        sourceModule,
        status: 'PENDING',
        attemptCount: 0,
        maxAttempts: 3,
        nextAttemptAt: at,
      };
      if (automationStepRunId) {
        const stepRun = await tx.automationStepRun.findFirst({
          where: {
            id: automationStepRunId,
            companyId,
            status: 'claimed',
            ...(commercialLeadId ? { leadId: commercialLeadId } : {}),
          },
          select: { id: true },
        });
        if (!stepRun) {
          throw new BadRequestException('Passo da automação comercial não está disponível para envio.');
        }
        outboundData.automationStepRun = { connect: { id: stepRun.id } };
      }
      if (await this.supportsOutboundEndpointColumn()) {
        outboundData.whatsappEndpointId = resolvedCreds.endpointId || null;
      }

      const outbound = await tx.outboundMessage.create({
        data: outboundData,
      });

      if (automationStepRunId) {
        const bound = await tx.automationStepRun.updateMany({
          where: { id: automationStepRunId, companyId, status: 'claimed' },
          data: {
            status: 'queued',
            queuedAt: at,
            leaseUntil: null,
            errorCode: null,
            errorMessage: null,
          },
        });
        if (bound.count !== 1) {
          throw new BadRequestException('Passo da automação comercial já foi consumido.');
        }
      }

      const message = await tx.companyMessage.create({
        data: {
          companyId,
          conversationId: conversation.id,
          whatsappConnectionSessionId: resolvedSessionId || undefined,
          sourcePhoneNormalized: resolvedPhoneNormalized || undefined,
          sourceTenantKey: resolvedTenantKey || undefined,
          contactId: contactId || to,
          direction: 'OUTBOUND',
          messageType,
          body,
          senderType,
          variablesJson,
          status: 'QUEUED',
          timestamp: at,
          sourceModule,
          provider: 'WHATSAPP_CLOUD',
          outboundMessageId: outbound.id,
        },
      });

      const statePatch = this.normalizeConversationStatePatch(payload?.flowState);
      await tx.companyConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: at,
          lastInteractionAt: at,
          ...statePatch,
        },
      });

      return {
        conversationId: conversation.id,
        messageId: message.id,
        outboundMessageId: outbound.id,
        status: outbound.status,
      };
    });
    await this.dispatchVendasCockpitProjection({
      companyId,
      conversationId: queued.conversationId,
      event: 'queued',
      messageId: queued.messageId,
    });
    if (automationStepRunId) {
      // O vínculo com a outbox já foi criado na transação acima. O ledger é
      // best-effort e não pode desfazer uma mensagem fisicamente enfileirada.
      await new CommercialAutomationStateService(this.prisma)
        .syncStepFromOutbound({
          companyId,
          outboundMessageId: queued.outboundMessageId,
          status: 'queued',
        })
        .catch(() => null);
    }
    return queued;
  }

  async queueOutboundMessage(user: any, input: QueueOutboundPayload) {
    const companyId = requireCompanyIdFromUser(user);
    return this.queueOutboundForCompany(companyId, input);
  }
}
