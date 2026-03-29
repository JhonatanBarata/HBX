import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { buildStructuredWhatsAppLog } from '../messaging/whatsapp-channel';
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
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaGroup,
  type AtendimentoAgendaSlot,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
} from './atendimento-config';
import { CadastrosService } from '../cadastros/cadastros.service';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly whatsappAudit: WhatsAppAuditService,
    private readonly cadastrosService: CadastrosService,
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

  private assertCanManageAgenda(user: any) {
    if (Boolean(user?.isSystemMaster)) return;
    const role = String(user?.role || '').trim().toUpperCase();
    if (role === 'ADMIN' || role === 'GERENTE') return;
    throw new ForbiddenException('Somente gerentes ou administradores podem editar a agenda.');
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
    const metadata = this.parseConversationMetadata(metadataRaw);
    const metadataName = String(
      metadata?.cliente ||
        metadata?.customerName ||
        metadata?.name ||
        metadata?.waNickname ||
        metadata?.whatsappName ||
        metadata?.whatsappProfileName ||
        '',
    ).trim();
    if (metadataName) return metadataName;
    const digits = String(contact || '').replace(/\D/g, '');
    if (!digits) return null;
    const customer = await this.prisma.hbxRecoveryCustomer.findFirst({
      where: { companyId, whatsappNumber: { endsWith: digits } },
      select: { clientName: true, name: true },
    });
    return String(customer?.clientName || customer?.name || '').trim() || null;
  }

  private normalizeConversationPhone(contact: string | null | undefined) {
    return String(contact || '').replace(/\D/g, '').slice(-13) || null;
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
    if (!row?.template) return DEFAULT_ATENDIMENTO_BOT_CONFIG;
    try {
      return normalizeAtendimentoBotConfig(JSON.parse(row.template));
    } catch {
      return DEFAULT_ATENDIMENTO_BOT_CONFIG;
    }
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
    const latestSourceModule = String(conversation?.messages?.[0]?.sourceModule || '')
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
    const recoveryFlow =
      String(conversation?.currentFlow || '').trim().toLowerCase().includes('recovery') ||
      latestSourceModule.startsWith('hbx_recovery');

    let routeTarget: 'recovery' | 'atendimento' = 'atendimento';
    let routeReason = 'Atendimento manual padrao.';

    if (conversation?.humanAssigned && routingRules.preferInboxForManualQueue) {
      routeTarget = 'atendimento';
      routeReason = 'Cliente aguardando tratativa humana na fila manual.';
    } else if (hasRecoveryDebt && routingRules.preferRecoveryForDebtors) {
      routeTarget = 'recovery';
      routeReason = 'Cliente com debito em aberto e contexto ativo de cobranca.';
    } else if (recoveryFlow && routingRules.preferRecoveryForNegotiations) {
      routeTarget = 'recovery';
      routeReason = 'Conversa originada ou mantida pelo fluxo do HBX Recovery.';
    }

    return {
      routeTarget,
      routeReason,
      recoveryCustomerId: recoveryCustomer?.id ? String(recoveryCustomer.id) : null,
      recoveryCustomerName: String(
        recoveryCustomer?.clientName || recoveryCustomer?.name || '',
      ).trim() || null,
      recoveryOpenAmount: Number(recoveryCustomer?.openAmount || 0),
      recoveryRiskScore:
        recoveryCustomer?.paymentHistoryScore === undefined ||
        recoveryCustomer?.paymentHistoryScore === null
          ? null
          : Number(recoveryCustomer.paymentHistoryScore),
      recoveryTotalPaid: Number(recoveryCustomer?.totalPaid || 0),
      recoveryStatus: String(recoveryCustomer?.status || '').trim() || null,
      recoveryPaymentHistory: Array.isArray(recoveryCustomer?.payments)
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
      recoveryCurrentStep: String(conversation?.currentStep || '').trim() || null,
      recoverySuggestedPath: routeTarget === 'recovery' ? '/dashboard/inbox/recovery' : '/dashboard/inbox',
      latestSourceModule: latestSourceModule || null,
    };
  }

  private async mapConversation(
    companyId: number,
    conversation: any,
    routingRules: RecoveryRoutingRules,
    identityRow?: any,
  ) {
    const displayName = await this.resolveConversationDisplayName(
      companyId,
      String(conversation.contact || ''),
      conversation.metadata,
    );
    const routeContext = await this.resolveRecoveryRoutingContext(companyId, conversation, routingRules);
    const blockedState = this.getAtendimentoBlockedState(conversation.metadata);
    const profile = identityRow?.customerProfile || null;
    const customerName =
      String(identityRow?.name || profile?.name || displayName || '').trim() || null;
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
      metadata: this.parseConversationMetadata(conversation.metadata),
      customer: {
        id: String(identityRow?.id || conversation.id),
        phone: String(identityRow?.phone || conversation.contact || ''),
        name: customerName,
        customerProfileId: profile?.id ? String(profile.id) : identityRow?.customerProfileId ? String(identityRow.customerProfileId) : null,
        email: profile?.email ? String(profile.email) : null,
        document: profile?.document ? String(profile.document) : null,
        customerProfileStatus: profile?.status ? String(profile.status) : null,
        customerProfileSource: profile?.externalSource ? String(profile.externalSource) : null,
        sourceConnectionId: profile?.sourceConnectionId ? String(profile.sourceConnectionId) : null,
        registrationOrigin: identityRow?.registrationOrigin ? String(identityRow.registrationOrigin) : null,
        registrationStatus: identityRow?.registrationStatus ? String(identityRow.registrationStatus) : null,
      },
      messages: (conversation.messages || []).map((message: any) => ({
        id: String(message.id),
        direction: String(message.direction || '').trim().toLowerCase(),
        content: String(message.body || ''),
        createdAt: message.timestamp,
        messageType: String(message.messageType || 'text').trim().toLowerCase(),
        senderType: String(message.senderType || 'system').trim().toLowerCase(),
        status: String(message.status || 'RECEIVED').trim().toUpperCase(),
        sourceModule: String(message.sourceModule || '').trim().toLowerCase() || null,
        error: message.error ? String(message.error) : null,
      })),
    };
  }

  private async ensureConversation(companyId: number, id: number) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id, companyId, channel: 'whatsapp' },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
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

  async listConversations(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const rows = await this.prisma.companyConversation.findMany({
      where: { companyId, channel: 'whatsapp' },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });
    const identityMap = await this.loadAtendimentoIdentityMap(
      companyId,
      rows.map((row) => String(row.contact || '')),
    );
    return Promise.all(
      rows.map((row) =>
        this.mapConversation(
          companyId,
          row,
          routingRules,
          identityMap.get(this.normalizeConversationPhone(String(row.contact || '')) || ''),
        ),
      ),
    );
  }

  private async getConversationByIdForCompany(companyId: number, id: number) {
    const routingRules = await this.getRecoveryRoutingRules(companyId);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id, companyId, channel: 'whatsapp' },
      include: {
        messages: { orderBy: { timestamp: 'asc' } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const identityMap = await this.loadAtendimentoIdentityMap(companyId, [String(conversation.contact || '')]);
    return this.mapConversation(
      companyId,
      conversation,
      routingRules,
      identityMap.get(this.normalizeConversationPhone(String(conversation.contact || '')) || ''),
    );
  }

  async getConversationById(user: any, id: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    return this.getConversationByIdForCompany(companyId, id);
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
    const normalized = normalizeAtendimentoBotConfig(payload || {});
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

  async blockConversation(user: any, conversationId: number, reasonRaw?: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.ensureConversation(companyId, conversationId);
    const metadata = this.parseConversationMetadata(conversation.metadata);
    const reason = String(reasonRaw || '').trim() || 'Bloqueado manualmente pelo operador.';
    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'blocked_manual',
      metadata: {
        ...metadata,
        atendimentoBlockedAt: new Date().toISOString(),
        atendimentoBlockedReason: reason,
        atendimentoBlockedByUserId: Number(user?.id || 0) || null,
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
    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: true,
      humanAssigned: false,
      flowResult: null,
      metadata,
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

  async sendMessage(user: any, conversationId: number, content: string) {
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

    await this.conversations.queueOutboundForCompany(companyId, {
      conversationId,
      to: toPhone,
      body: normalizedContent,
      messageType: 'text',
      sourceModule: 'atendimento_human',
      senderType: 'human',
      contactId: toPhone,
      flowState: {
        humanAssigned: true,
        botActive: false,
        flowResult: null,
      },
    });

    await this.logInboxEvent({
      companyId,
      event: 'manual_outbound_queued',
      message: `Mensagem manual enfileirada para ${toPhone}`,
      conversationId,
      phone: toPhone,
      messageType: 'text',
      result: 'queued',
      extra: { sourceModule: 'atendimento_human' },
    });

    return this.getConversationByIdForCompany(companyId, conversationId);
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
