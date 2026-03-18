import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import axios from 'axios';
import { ConversationsService } from '../messaging/conversations.service';
import { resolveWhatsAppCredentials } from '../messaging/whatsapp-credentials.util';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecoveryCustomerDto } from './dto/create-recovery-customer.dto';
import { ListRecoveryPaymentsDto } from './dto/list-payments.dto';
import { CreateRecoveryFlowStageDto } from './dto/create-recovery-flow-stage.dto';
import { UpdateRecoveryFlowStageDto } from './dto/update-recovery-flow-stage.dto';
import { UpdateRecoveryBotConfigDto } from './dto/update-recovery-bot-config.dto';
import {
  CreateMetaTemplateDto,
  DeleteMetaTemplateDto,
  SetMetaTemplateActivationDto,
} from './dto/meta-templates.dto';
import { DEFAULT_RECOVERY_SEED } from './default-seed';
import {
  DEFAULT_RECOVERY_BOT_CONFIG,
  RECOVERY_BOT_CONFIG_CHANNEL,
  RECOVERY_BOT_CONFIG_TITLE,
  type RecoveryBotConfig,
  normalizeRecoveryBotConfig,
} from './recovery-bot-config';
import {
  buildNormalizedMetaTemplate,
  extractNumericTemplateVariablesInOrder,
  isMetaMediaHeaderFormat as isNormalizedMetaMediaHeaderFormat,
  normalizeMetaTemplateCategory,
  normalizeMetaTemplateHeaderFormat,
  normalizeMetaTemplateRejectionReason,
  normalizeMetaTemplateStatus,
  type RecoveryNormalizedMetaTemplate,
} from './meta-template-normalization';

type RecoveryPaymentRecord = { id: string; label: string; date: string; amount: number; status: string };
type RecoveryDelayRecord = { id: string; period: string; daysLate: number; outcome: string };
type RecoveryStatus = 'overdue' | 'paid';
type PaymentLifecycle = 'paid' | 'in_progress' | 'finalized' | 'cancelled';
type RecoveryMetaTemplate = {
  id: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  qualityScore: string | null;
  rejectedReason: string | null;
  headerFormat: string | null;
  headerText: string | null;
  headerHandle: string | null;
  headerMediaUrl: string | null;
  headerMediaFileName: string | null;
  headerMediaContentType: string | null;
  headerMediaBase64: string | null;
  bodyText: string;
  footerText: string | null;
  buttonLabels: string[];
  variableKeys: string[];
  components: unknown[];
  normalized: RecoveryNormalizedMetaTemplate;
  hbxActive: boolean;
  lastMetaSyncAt: string | null;
};
type RecoveryMetaTemplateHistory = {
  id: string;
  templateKey: string;
  name: string;
  language: string;
  previousStatus: string | null;
  nextStatus: string;
  reason: string | null;
  changedAt: string;
};
type RecoveryMetaTemplateRegistry = {
  phoneNumberId: string | null;
  wabaId: string | null;
  lastSyncAt: string | null;
  templates: RecoveryMetaTemplate[];
  history: RecoveryMetaTemplateHistory[];
};
type MetaUploadSessionResponse = { id?: string; h?: string; error?: any };

const COMMISSION_PERCENT = 3;
const RECOVERY_APPROVED_PAYMENT_SIGNATURE =
  process.env.HBX_RECOVERY_PAYMENT_APPROVED_SIGNATURE ||
  'Equipe Colsani Ar Condicionado e Manutenções';
const RECOVERY_META_TEMPLATES_CHANNEL = 'HBX_RECOVERY_META_TEMPLATES';
const RECOVERY_META_TEMPLATES_TITLE = 'meta_templates_registry';
const RECOVERY_META_TEMPLATES_HISTORY_LIMIT = 250;
const RECOVERY_INTERNAL_CHANNELS = [
  RECOVERY_BOT_CONFIG_CHANNEL,
  RECOVERY_META_TEMPLATES_CHANNEL,
];
const DEFAULT_RECOVERY_FLOW_STAGES = [
  { title: 'Contato inicial', channel: 'WhatsApp API', template: 'Oi {{nome}}, identificamos pendencia em aberto. Posso te ajudar a regularizar?', daysAfter: 0, enabled: true },
  { title: 'Reforco amigavel', channel: 'WhatsApp API', template: 'Seguimos disponiveis para negociar a pendencia. Quer receber proposta agora?', daysAfter: 2, enabled: true },
  { title: 'Oferta de parcelamento', channel: 'WhatsApp API', template: 'Temos opcao de parcelamento para facilitar a regularizacao.', daysAfter: 5, enabled: true },
  { title: 'Aviso de escalonamento', channel: 'WhatsApp API', template: 'Precisamos de um retorno para evitar escalonamento da cobranca.', daysAfter: 8, enabled: true },
  { title: 'Ultima tentativa', channel: 'Atendimento humano', template: 'Ultima tentativa de acordo antes de avancar para outra etapa.', daysAfter: 12, enabled: true },
];

@Injectable()
export class HbxRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
  ) {}

  private requireCompanyIdFromUser(user: any) {
    const companyId = Number(user?.companyId || 0);
    if (!companyId) throw new ForbiddenException('Company context required');
    return companyId;
  }

  private requireText(value: string, field: string) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private normalizeWhatsAppNumber(raw: string) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) throw new BadRequestException('Telefone invalido. Use formato internacional com DDI.');
    return `+${digits}`;
  }

  private normalizeDigits(value: string) {
    return String(value || '').replace(/\D/g, '');
  }

  private parseList<T>(raw: string | null | undefined, fallback: T[]): T[] {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : fallback;
    } catch {
      return fallback;
    }
  }

  private json(value: unknown) {
    return JSON.stringify(value ?? []);
  }

  private toDbStatus(status: RecoveryStatus) {
    return status === 'paid' ? 'PAID' : 'OVERDUE';
  }

  private fromDbStatus(value: string | null | undefined): RecoveryStatus {
    return String(value || '').toUpperCase() === 'PAID' ? 'paid' : 'overdue';
  }

  private dateLabelPtBR(date = new Date()) {
    return date.toLocaleDateString('pt-BR');
  }

  private isoDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private parseRegistrationDate(raw: string | null | undefined): Date {
    const normalized = String(raw || '').trim();
    if (!normalized) return new Date();
    const numeric = normalized.replace(/\D/g, '');
    if (numeric.length === 6 || numeric.length === 8) {
      const day = Number(numeric.slice(0, 2));
      const month = Number(numeric.slice(2, 4));
      const year = numeric.length === 6 ? Number(`20${numeric.slice(4)}`) : Number(numeric.slice(4));
      const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (
        candidate.getUTCFullYear() === year &&
        candidate.getUTCMonth() + 1 === month &&
        candidate.getUTCDate() === day
      ) {
        return candidate;
      }
    }
    const parts = normalized.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (parts) {
      const day = Number(parts[1]);
      const month = Number(parts[2]);
      const year = parts[3].length === 2 ? Number(`20${parts[3]}`) : Number(parts[3]);
      const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (
        candidate.getUTCFullYear() === year &&
        candidate.getUTCMonth() + 1 === month &&
        candidate.getUTCDate() === day
      ) {
        return candidate;
      }
    }
    const parsed = new Date(normalized.includes('T') ? normalized : `${normalized}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Data de registro invalida. Use YYYY-MM-DD ou DD/MM/AAAA.');
    }
    return parsed;
  }

  private toCustomerResponse(row: any) {
    const createdAt = row?.createdAt ? new Date(row.createdAt) : new Date();
    return {
      id: String(row.id),
      contactId: String(row.id),
      name: String(row.name || ''),
      clientName: String(row.clientName || ''),
      whatsappNumber: String(row.whatsappNumber || ''),
      registrationDate: this.isoDateOnly(createdAt),
      openAmount: Number(row.openAmount || 0),
      workdaySaleDay: Number(row.workdaySaleDay || 1),
      recurringDelays: Number(row.recurringDelays || 0),
      paymentHistoryScore: Number(row.paymentHistoryScore || 5),
      totalPaid: Number(row.totalPaid || 0),
      averageDelay: Number(row.averageDelay || 0),
      automationEnabled: row?.automationEnabled !== false,
      lastContact: String(row.lastContact || 'Nunca'),
      status: this.fromDbStatus(row.status),
      paymentHistory: this.parseList<RecoveryPaymentRecord>(row.paymentHistory, []),
      delayHistory: this.parseList<RecoveryDelayRecord>(row.delayHistory, []),
    };
  }

  private normalizeLifecycle(statusRaw: string): PaymentLifecycle {
    const status = String(statusRaw || '').toLowerCase().trim();
    if (status === 'released') return 'finalized';
    if (['failed', 'cancelled', 'refunded', 'partially_refunded', 'rejected', 'charged_back'].includes(status)) return 'cancelled';
    if (status === 'approved') return 'paid';
    return 'in_progress';
  }

  private statusLabel(statusRaw: string) {
    const status = String(statusRaw || '').toLowerCase().trim();
    const map: Record<string, string> = {
      preparing: 'Preparando checkout', pending: 'Aguardando pagamento', in_process: 'Em andamento', approved: 'Pagamento confirmado', released: 'Finalizado',
      partially_refunded: 'Estorno parcial', refunded: 'Estornada', cancelled: 'Cancelada', failed: 'Nao aprovado', rejected: 'Nao aprovado',
    };
    return map[status] || 'Em andamento';
  }

  private paymentStatusFromProvider(payment: any) {
    const providerStatus = String(payment?.status || 'pending').toLowerCase().trim() || 'pending';
    const amount = Math.max(0, Number(payment?.transaction_amount || 0));
    const refunded = Math.max(0, Number(payment?.transaction_amount_refunded || 0));
    if (amount > 0 && refunded >= amount - 0.01) return 'refunded';
    if (refunded > 0.009) return 'partially_refunded';
    if (providerStatus === 'rejected') return 'failed';
    return providerStatus;
  }

  private toPaymentItem(row: any) {
    const status = String(row?.status || 'pending');
    const lifecycle = String(row?.lifecycle || this.normalizeLifecycle(status));
    return {
      id: String(row.id), customerId: String(row.customerId), customerName: String(row.customer?.name || ''), customerWhatsapp: String(row.customer?.whatsappNumber || ''),
      amount: Number(row.amount || 0), currency: String(row.currency || 'BRL'), description: String(row.description || ''),
      status, statusLabel: this.statusLabel(status), lifecycle,
      chargeType: String(row.chargeType || 'avista'),
      installmentCount: Number(row.installmentCount || 1),
      installmentValue: Number(row.installmentValue || row.amount || 0),
      paymentUrl: row.paymentUrl ? String(row.paymentUrl) : null, mpPaymentId: row.mpPaymentId ? String(row.mpPaymentId) : null, mpPreferenceId: row.mpPreferenceId ? String(row.mpPreferenceId) : null,
      externalReference: row.externalReference ? String(row.externalReference) : null, refundAmount: Number(row.refundAmount || 0),
      conversationId: row.conversationId ? Number(row.conversationId) : null,
      serviceDate: row.serviceDate ? new Date(row.serviceDate).toISOString() : null,
      serviceDescription: row.serviceDescription ? String(row.serviceDescription) : null,
      linkExpiresAt: row.linkExpiresAt ? new Date(row.linkExpiresAt).toISOString() : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null, paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null, refundedAt: row.refundedAt ? new Date(row.refundedAt).toISOString() : null,
      canRefund: Boolean(row?.mpPaymentId && ['approved', 'released', 'partially_refunded'].includes(String(status).toLowerCase())),
    };
  }

  private async findCustomer(companyId: number, customerId: string) {
    const row = await this.prisma.hbxRecoveryCustomer.findFirst({ where: { id: String(customerId), companyId } });
    if (!row) throw new NotFoundException('Cadastro de Recovery nao encontrado');
    return row;
  }

  private async resolveRecoveryCustomerForConversation(conversation: any, companyId: number) {
    const contactDigits = this.normalizeDigits(conversation?.contact);
    const metadata = this.parseConversationMetadata(conversation?.metadata);
    const metadataCustomerId = String(
      metadata?.recoveryCustomerId || metadata?.customerId || metadata?.customer_id || '',
    ).trim();
    const metadataCustomerName = String(
      metadata?.cliente || metadata?.customerName || metadata?.name || '',
    ).trim();

    if (contactDigits) {
      const byPhone = await this.prisma.hbxRecoveryCustomer.findFirst({
        where: {
          companyId,
          openAmount: { gt: 0 },
          whatsappNumber: { endsWith: contactDigits },
        },
      });
      if (byPhone) return byPhone;
    }

    if (metadataCustomerId) {
      const byMetadataId = await this.prisma.hbxRecoveryCustomer.findFirst({
        where: {
          companyId,
          id: metadataCustomerId,
          openAmount: { gt: 0 },
        },
      });
      if (byMetadataId) return byMetadataId;
    }

    const payment = await this.prisma.hbxRecoveryPayment.findFirst({
      where: {
        companyId,
        conversationId: Number(conversation?.id || 0),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { customerId: true },
    });
    if (payment?.customerId) {
      const byPayment = await this.prisma.hbxRecoveryCustomer.findFirst({
        where: {
          companyId,
          id: String(payment.customerId),
          openAmount: { gt: 0 },
        },
      });
      if (byPayment) return byPayment;
    }

    const recoveryMessage = await this.prisma.companyMessage.findFirst({
      where: {
        companyId,
        conversationId: Number(conversation?.id || 0),
        sourceModule: { startsWith: 'hbx_recovery' },
      },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      select: { contactId: true },
    });
    const recoveryMessageContactId = String(recoveryMessage?.contactId || '').trim();
    if (recoveryMessageContactId) {
      const byRecoveryMessage = await this.prisma.hbxRecoveryCustomer.findFirst({
        where: {
          companyId,
          id: recoveryMessageContactId,
          openAmount: { gt: 0 },
        },
      });
      if (byRecoveryMessage) return byRecoveryMessage;
    }

    if (metadataCustomerName) {
      return this.prisma.hbxRecoveryCustomer.findFirst({
        where: {
          companyId,
          openAmount: { gt: 0 },
          OR: [
            { name: { equals: metadataCustomerName, mode: 'insensitive' } },
            { clientName: { equals: metadataCustomerName, mode: 'insensitive' } },
          ],
        },
      });
    }

    return null;
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

  private getRecoveryInitialTemplateName() {
    return String(
      process.env.WHATSAPP_HBX_RECOVERY_INITIAL_TEMPLATE_NAME ||
        process.env.WHATSAPP_HBX_RECOVERY_TEMPLATE_NAME ||
        '',
    ).trim();
  }

  private getRecoveryInitialTemplateLanguage() {
    return String(
      process.env.WHATSAPP_HBX_RECOVERY_INITIAL_TEMPLATE_LANGUAGE ||
        process.env.WHATSAPP_HBX_RECOVERY_TEMPLATE_LANGUAGE ||
        'pt_BR',
    ).trim() || 'pt_BR';
  }

  private normalizeTemplateVariableKey(valueRaw: string) {
    return String(valueRaw || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  }

  private extractTemplateVariablesInOrder(textRaw: string) {
    const keys: string[] = [];
    const pattern = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;
    let match: RegExpExecArray | null = null;
    while (true) {
      match = pattern.exec(String(textRaw || ''));
      if (!match?.[1]) break;
      const key = this.normalizeTemplateVariableKey(String(match[1] || ''));
      if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
  }

  private normalizeFriendlyTemplateText(textRaw: string) {
    return String(textRaw || '').replace(
      /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu,
      (_match, key) => `{{${this.normalizeTemplateVariableKey(String(key || ''))}}}`,
    );
  }

  private isNumericTemplateVariableKey(valueRaw: string) {
    return /^\d+$/.test(String(valueRaw || '').trim());
  }

  private escapeRegExp(value: string) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private validateTemplateVariablePlacement(textRaw: string, fieldLabel: string) {
    const normalized = this.normalizeFriendlyTemplateText(textRaw).trim();
    if (!normalized) return;
    if (/^\{\{\s*[\p{L}\p{N}_]+\s*\}\}/u.test(normalized)) {
      throw new BadRequestException(
        `${fieldLabel} nao pode comecar com variavel. Adicione texto antes do primeiro placeholder.`,
      );
    }
    if (/\{\{\s*[\p{L}\p{N}_]+\s*\}\}$/u.test(normalized)) {
      throw new BadRequestException(
        `${fieldLabel} nao pode terminar com variavel. Adicione texto depois do ultimo placeholder.`,
      );
    }
  }

  private convertFriendlyTemplateTextToMeta(textRaw: string) {
    const friendlyText = this.normalizeFriendlyTemplateText(textRaw);
    const variableKeys = this.extractTemplateVariablesInOrder(friendlyText);
    let metaText = friendlyText;
    variableKeys.forEach((key, index) => {
      metaText = metaText.replace(
        new RegExp(`\\{\\{\\s*${this.escapeRegExp(key)}\\s*\\}\\}`, 'g'),
        `{{${index + 1}}}`,
      );
    });
    return { friendlyText, metaText, variableKeys };
  }

  private metaTemplateExampleValue(
    keyRaw: string,
    context?: { companyName?: string | null; operatorName?: string | null },
  ) {
    const key = this.normalizeTemplateVariableKey(keyRaw);
    const companyName = String(context?.companyName || '').trim() || 'Empresa Exemplo';
    const operatorName = String(context?.operatorName || '').trim() || 'Atendente';
    const defaults: Record<string, string> = {
      empresa: companyName,
      funcionario: operatorName,
      cliente: 'Maria Oliveira',
      data_servico: '12/03/2026',
      descricao_servico: 'manutencao preventiva',
      valor_formatado: 'R$ 480,00',
      quantidade_parcelas: '3',
      valor_parcela_formatado: 'R$ 160,00',
      link_pagamento: 'https://pagamentos.hbx.app/exemplo',
    };
    return defaults[key] || key.replace(/_/g, ' ');
  }

  private restoreFriendlyTemplateText(textRaw: string, variableKeys: string[]) {
    let restored = String(textRaw || '');
    variableKeys.forEach((key, index) => {
      restored = restored.replace(
        new RegExp(`\\{\\{\\s*${index + 1}\\s*\\}\\}`, 'g'),
        `{{${this.normalizeTemplateVariableKey(key)}}}`,
      );
    });
    return restored;
  }

  private hydrateFriendlyTemplateParts(
    parts: {
      headerFormat: string | null;
      headerText: string | null;
      headerHandle: string | null;
      bodyText: string;
      footerText: string | null;
      buttonLabels: string[];
      variableKeys: string[];
      components: unknown[];
    },
    previousTemplate?: RecoveryMetaTemplate | null,
  ) {
    const previousKeys = Array.isArray(previousTemplate?.variableKeys)
      ? previousTemplate!.variableKeys
      : [];
    const canRestoreFriendlyNames =
      previousKeys.length > 0 &&
      previousKeys.every((key) => !this.isNumericTemplateVariableKey(key)) &&
      parts.variableKeys.length === previousKeys.length &&
      parts.variableKeys.every((key) => this.isNumericTemplateVariableKey(key));

    if (!canRestoreFriendlyNames) return parts;

    return {
      ...parts,
      bodyText: this.restoreFriendlyTemplateText(parts.bodyText, previousKeys),
      footerText: parts.footerText
        ? this.restoreFriendlyTemplateText(parts.footerText, previousKeys)
        : parts.footerText,
      headerText: parts.headerText
        ? this.restoreFriendlyTemplateText(parts.headerText, previousKeys)
        : parts.headerText,
      variableKeys: previousKeys.map((key) => this.normalizeTemplateVariableKey(key)),
    };
  }

  private buildRecoveryInitialTemplateComponents(
    companyName: string,
    customer: any,
    template?: RecoveryMetaTemplate | null,
    operatorName?: string | null,
  ) {
    const normalized = this.getNormalizedMetaTemplate(template);
    const serviceDate = customer?.createdAt
      ? new Date(customer.createdAt).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');
    const contactName = String(customer?.clientName || customer?.name || '').trim() || 'cliente';
    const operatorLabel = String(operatorName || '').trim() || 'Atendente';
    const orderedBodyVariables = normalized.body.variableOrder;
    const formattedAmount = Number(customer?.openAmount || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    const installmentCount = '3';
    const installmentValue = (Number(customer?.openAmount || 0) / 3 || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    const orderedFallbackValues = [
      String(companyName || 'HBX Recovery'),
      operatorLabel,
      contactName,
      serviceDate,
      'manutencao preventiva',
      formattedAmount,
      installmentCount,
      installmentValue,
      'https://pagamentos.hbx.app/exemplo',
    ];
    if (orderedBodyVariables.length > orderedFallbackValues.length) {
      throw new BadRequestException(
        `Template '${normalized.name}' exige ${orderedBodyVariables.length} variaveis no BODY, mas o fluxo inicial do Recovery suporta ${orderedFallbackValues.length}.`,
      );
    }
    const components: Array<Record<string, any>> = [];
    const resolvedHeaderMediaUrl = this.resolveTemplateHeaderMediaUrl(template);
    if (template && this.isMetaMediaHeaderFormat(normalized.header.format) && resolvedHeaderMediaUrl) {
      const mediaType = String(normalized.header.format || '').trim().toLowerCase();
      components.push({
        type: 'header',
        parameters: [
          {
            type: mediaType,
            [mediaType]: {
              link: resolvedHeaderMediaUrl,
            },
          },
        ],
      });
    }
    if (orderedBodyVariables.length > 0) {
      components.push({
        type: 'body',
        parameters: orderedBodyVariables.map((key, index) => {
          const value = String(orderedFallbackValues[index] || '').trim();
          if (!value) {
            throw new BadRequestException(
              `Template '${normalized.name}' exige a variavel {{${key}}} no BODY, mas o HBX Recovery nao conseguiu preenche-la automaticamente.`,
            );
          }
          return {
            type: 'text',
            text: value,
          };
        }),
      });
    }
    return components;
  }

  private async getInteractionContext(companyId: number, conversationId: number) {
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: Number(conversationId), companyId, channel: 'whatsapp' },
    });
    if (!conversation) throw new NotFoundException('Conversa nao encontrada no HBX Recovery.');
    const customer = await this.resolveRecoveryCustomerForConversation(conversation, companyId);
    if (!customer) throw new NotFoundException('Conversa fora da carteira de inadimplentes do HBX Recovery.');
    return { conversation, customer };
  }

  private getInteractionContactTarget(conversation: { contact?: string | null }, customer: { whatsappNumber?: string | null }) {
    const liveContact = String(conversation?.contact || '').trim();
    if (liveContact) return liveContact;
    return String(customer?.whatsappNumber || '').trim();
  }

  private async appendInteractionEvent(input: {
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
        conversationId: Number(input.conversationId),
        contactId: input.contactId,
        direction: 'OUTBOUND',
        messageType: 'system_event',
        body: input.text,
        senderType: 'system',
        status: 'SENT',
        timestamp: now,
        sourceModule: input.sourceModule || 'hbx_recovery_system',
        variablesJson: this.json({ ...(input.variables || {}), eventType: input.eventType }),
        provider: 'INTERNAL',
      },
    });
    await this.prisma.companyConversation.update({
      where: { id: Number(input.conversationId) },
      data: { lastMessageAt: now, lastInteractionAt: now },
    });
  }

  private async ensureDefaultFlowStages(companyId: number) {
    const count = await this.prisma.hbxRecoveryFlowStage.count({
      where: this.recoveryFlowStageWhere(companyId),
    });
    if (count > 0) return;
    await this.prisma.$transaction(
      DEFAULT_RECOVERY_FLOW_STAGES.map((stage, index) =>
        this.prisma.hbxRecoveryFlowStage.create({
          data: { ...stage, companyId, sortOrder: index + 1 },
        }),
      ),
    );
  }

  private async getBotConfigRow(companyId: number) {
    return this.prisma.hbxRecoveryFlowStage.findFirst({
      where: {
        companyId,
        channel: RECOVERY_BOT_CONFIG_CHANNEL,
        title: RECOVERY_BOT_CONFIG_TITLE,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async getRecoveryBotConfig(companyId: number): Promise<RecoveryBotConfig> {
    const row = await this.getBotConfigRow(companyId);
    if (!row?.template) return DEFAULT_RECOVERY_BOT_CONFIG;
    try {
      return normalizeRecoveryBotConfig(JSON.parse(row.template));
    } catch {
      return DEFAULT_RECOVERY_BOT_CONFIG;
    }
  }

  private async saveRecoveryBotConfig(companyId: number, payload: unknown): Promise<RecoveryBotConfig> {
    const normalized = normalizeRecoveryBotConfig(payload);
    const row = await this.getBotConfigRow(companyId);
    const data = {
      companyId,
      title: RECOVERY_BOT_CONFIG_TITLE,
      channel: RECOVERY_BOT_CONFIG_CHANNEL,
      template: this.json(normalized),
      daysAfter: 0,
      enabled: false,
      sortOrder: 0,
    };
    if (row) {
      await this.prisma.hbxRecoveryFlowStage.update({
        where: { id: row.id },
        data,
      });
    } else {
      await this.prisma.hbxRecoveryFlowStage.create({
        data,
      });
    }
    return normalized;
  }

  private recoveryFlowStageWhere(companyId: number) {
    return {
      companyId,
      channel: { notIn: RECOVERY_INTERNAL_CHANNELS },
    };
  }

  private get cloudApiBaseUrl() {
    return (process.env.WHATSAPP_CLOUD_API_BASE_URL || 'https://graph.facebook.com/v20.0').replace(/\/$/, '');
  }

  private metaTemplateKey(nameRaw: string, languageRaw: string) {
    return `${String(nameRaw || '').trim().toLowerCase()}::${String(languageRaw || '').trim().toLowerCase()}`;
  }

  private normalizeMetaStatus(statusRaw: string | null | undefined) {
    return normalizeMetaTemplateStatus(statusRaw);
  }

  private normalizeMetaCategory(categoryRaw: string | null | undefined) {
    return normalizeMetaTemplateCategory(categoryRaw);
  }

  private normalizeMetaHeaderFormat(formatRaw: string | null | undefined) {
    const normalized = normalizeMetaTemplateHeaderFormat(formatRaw);
    if (normalized === 'NONE') return null;
    return normalized;
  }

  private isMetaMediaHeaderFormat(formatRaw: string | null | undefined) {
    return isNormalizedMetaMediaHeaderFormat(formatRaw);
  }

  private normalizeOptionalHttpUrl(valueRaw: string | null | undefined, field: string) {
    const normalized = String(valueRaw || '').trim();
    if (!normalized) return null;
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new BadRequestException(`${field} invalido. Use uma URL publica iniciando com http:// ou https://.`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException(`${field} invalido. Use uma URL publica iniciando com http:// ou https://.`);
    }
    return parsed.toString();
  }

  private isLocalOnlyUrl(valueRaw: string | null | undefined) {
    const normalized = String(valueRaw || '').trim();
    if (!normalized) return false;
    try {
      const parsed = new URL(normalized);
      const host = String(parsed.hostname || '').trim().toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
    } catch {
      return false;
    }
  }

  private templateHeaderMediaPublicPath(
    companyId: number,
    templateNameRaw: string,
    languageRaw: string | null | undefined,
  ) {
    const templateName = this.normalizeTemplateNameForMeta(templateNameRaw || '');
    const language = String(languageRaw || 'pt_BR').trim() || 'pt_BR';
    if (!templateName || !companyId) return null;
    const params = new URLSearchParams({ language });
    return `/hbx-recovery/public/meta-template-media/${companyId}/${encodeURIComponent(templateName)}?${params.toString()}`;
  }

  private buildTemplateHeaderMediaPublicUrl(
    companyId: number,
    templateNameRaw: string,
    languageRaw: string | null | undefined,
  ) {
    const relativePath = this.templateHeaderMediaPublicPath(companyId, templateNameRaw, languageRaw);
    if (!relativePath) return null;
    return `${this.publicApiBaseUrl()}${relativePath}`;
  }

  private fileContentTypeFromExtension(fileNameRaw: string | null | undefined) {
    const extension = extname(String(fileNameRaw || '').trim()).toLowerCase();
    if (extension === '.png') return 'image/png';
    if (extension === '.webp') return 'image/webp';
    return 'image/jpeg';
  }

  private rebuildTemplateMediaUrlWithCurrentPublicBase(valueRaw: string | null | undefined) {
    const normalized = String(valueRaw || '').trim();
    if (!normalized) return null;
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return normalized;
    }
    if (
      !parsed.pathname.startsWith('/uploads/hbx-recovery/meta-templates/') &&
      !parsed.pathname.startsWith('/hbx-recovery/public/meta-template-media/')
    ) {
      return parsed.toString();
    }
    const publicBase = this.publicApiBaseUrl();
    if (!publicBase || this.isLocalOnlyUrl(publicBase)) {
      return parsed.toString();
    }
    return `${publicBase}${parsed.pathname}`;
  }

  private resolveTemplateHeaderMediaUrl(template?: RecoveryMetaTemplate | null, companyId?: number) {
    if (!template) return null;
    const normalized = this.getNormalizedMetaTemplate(template);
    if (!this.isMetaMediaHeaderFormat(normalized.header.format)) return null;
    const storedUrl = String(normalized.header.mediaUrl || '').trim();
    if (storedUrl && !this.isLocalOnlyUrl(storedUrl)) {
      return this.rebuildTemplateMediaUrlWithCurrentPublicBase(storedUrl);
    }
    if (companyId && String(normalized.header.mediaBase64 || '').trim()) {
      return this.buildTemplateHeaderMediaPublicUrl(companyId, template.name, template.language);
    }
    if (!storedUrl) return null;
    return this.rebuildTemplateMediaUrlWithCurrentPublicBase(storedUrl);
  }

  private getNormalizedMetaTemplate(template?: Partial<RecoveryMetaTemplate> | null) {
    if (template?.normalized) return template.normalized;
    return buildNormalizedMetaTemplate({
      name: String(template?.name || '').trim(),
      language: String(template?.language || 'pt_BR').trim() || 'pt_BR',
      category: this.normalizeMetaCategory(template?.category),
      status: this.normalizeMetaStatus(template?.status),
      qualityScore:
        template?.qualityScore !== undefined && template?.qualityScore !== null
          ? String(template.qualityScore)
          : null,
      rejectedReason:
        template?.rejectedReason !== undefined && template?.rejectedReason !== null
          ? String(template.rejectedReason)
          : null,
      components: Array.isArray(template?.components) ? template?.components : [],
      fallback: {
        headerFormat: template?.headerFormat,
        headerText: template?.headerText,
        headerHandle: template?.headerHandle,
        headerMediaUrl: template?.headerMediaUrl,
        headerMediaFileName: template?.headerMediaFileName,
        headerMediaContentType: template?.headerMediaContentType,
        headerMediaBase64: template?.headerMediaBase64,
        bodyText: template?.bodyText,
        footerText: template?.footerText,
        buttonLabels: Array.isArray(template?.buttonLabels) ? template.buttonLabels : [],
        variableKeys: Array.isArray(template?.variableKeys) ? template.variableKeys : [],
      },
    });
  }

  private createMetaTemplateRecord(input: {
    id: string | null;
    name: string;
    language: string;
    category: string;
    status: string;
    qualityScore: string | null;
    rejectedReason: string | null;
    components: unknown[];
    hbxActive: boolean;
    lastMetaSyncAt: string | null;
    localMedia?: {
      headerMediaUrl: string | null;
      headerMediaFileName: string | null;
      headerMediaContentType: string | null;
      headerMediaBase64: string | null;
    };
  }): RecoveryMetaTemplate {
    const normalized = buildNormalizedMetaTemplate({
      name: input.name,
      language: input.language,
      category: input.category,
      status: input.status,
      qualityScore: input.qualityScore,
      rejectedReason: input.rejectedReason,
      components: input.components,
      fallback: {
        headerMediaUrl: input.localMedia?.headerMediaUrl || null,
        headerMediaFileName: input.localMedia?.headerMediaFileName || null,
        headerMediaContentType: input.localMedia?.headerMediaContentType || null,
        headerMediaBase64: input.localMedia?.headerMediaBase64 || null,
      },
    });
    return {
      id: input.id,
      name: normalized.name,
      language: normalized.language,
      category: normalized.category,
      status: normalized.status,
      qualityScore: normalized.qualityScore,
      rejectedReason: normalized.rejectedReason,
      headerFormat: normalized.header.format,
      headerText: normalized.header.text,
      headerHandle: normalized.header.exampleHandle,
      headerMediaUrl: normalized.header.mediaUrl,
      headerMediaFileName: normalized.header.mediaFileName,
      headerMediaContentType: normalized.header.mediaContentType,
      headerMediaBase64: normalized.header.mediaBase64,
      bodyText: normalized.body.text,
      footerText: normalized.footer.text,
      buttonLabels: normalized.buttons
        .map((button) => String(button.text || ''))
        .filter((button) => button.length > 0),
      variableKeys: normalized.body.variableOrder,
      components: normalized.components,
      normalized,
      hbxActive: Boolean(input.hbxActive),
      lastMetaSyncAt: input.lastMetaSyncAt,
    };
  }

  private rebuildMetaTemplateRecord(
    template: Partial<RecoveryMetaTemplate> & { name: string; language: string },
  ) {
    const normalized = this.getNormalizedMetaTemplate(template);
    return this.createMetaTemplateRecord({
      id:
        template?.id !== undefined && template?.id !== null
          ? String(template.id)
          : null,
      name: normalized.name,
      language: normalized.language,
      category: normalized.category,
      status: normalized.status,
      qualityScore: normalized.qualityScore,
      rejectedReason: normalized.rejectedReason,
      components: normalized.components,
      hbxActive: Boolean(template?.hbxActive),
      lastMetaSyncAt:
        template?.lastMetaSyncAt !== undefined && template?.lastMetaSyncAt !== null
          ? String(template.lastMetaSyncAt)
          : null,
      localMedia: {
        headerMediaUrl: normalized.header.mediaUrl,
        headerMediaFileName: normalized.header.mediaFileName,
        headerMediaContentType: normalized.header.mediaContentType,
        headerMediaBase64: normalized.header.mediaBase64,
      },
    });
  }

  private assertTemplateHeaderMediaUrlIsPublic(templateName: string, headerMediaUrl: string | null) {
    if (!headerMediaUrl) {
      throw new BadRequestException(
        `Template '${templateName}' exige URL publica da midia de cabecalho. Configure em Templates Meta antes do envio automatico.`,
      );
    }
    if (this.isLocalOnlyUrl(headerMediaUrl)) {
      throw new BadRequestException(
        `Template '${templateName}' usa midia em URL local (${headerMediaUrl}). Configure PUBLIC_API_BASE_URL com uma URL publica do backend antes de enviar templates com imagem.`,
      );
    }
  }

  private parseMetaTemplateRegistry(raw: string | null | undefined): RecoveryMetaTemplateRegistry {
    const fallback: RecoveryMetaTemplateRegistry = {
      phoneNumberId: null,
      wabaId: null,
      lastSyncAt: null,
      templates: [],
      history: [],
    };
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as RecoveryMetaTemplateRegistry;
      const templates = Array.isArray(parsed?.templates) ? parsed.templates : [];
      const history = Array.isArray(parsed?.history) ? parsed.history : [];
      return {
        phoneNumberId: parsed?.phoneNumberId ? String(parsed.phoneNumberId) : null,
        wabaId: parsed?.wabaId ? String(parsed.wabaId) : null,
        lastSyncAt: parsed?.lastSyncAt ? String(parsed.lastSyncAt) : null,
        templates: templates
          .map((item) => this.rebuildMetaTemplateRecord(item as any))
          .filter((item) => item.name),
        history: history
          .map((item) => ({
            id: String(item?.id || ''),
            templateKey: String(item?.templateKey || '').trim(),
            name: String(item?.name || '').trim(),
            language: String(item?.language || '').trim(),
            previousStatus:
              item?.previousStatus !== undefined && item?.previousStatus !== null
                ? String(item.previousStatus)
                : null,
            nextStatus: this.normalizeMetaStatus(item?.nextStatus),
            reason: normalizeMetaTemplateRejectionReason(item?.reason),
            changedAt: String(item?.changedAt || '').trim(),
          }))
          .filter((item) => item.id && item.templateKey && item.changedAt),
      };
    } catch {
      return fallback;
    }
  }

  private async getMetaTemplateRegistryRow(companyId: number) {
    return this.prisma.hbxRecoveryFlowStage.findFirst({
      where: {
        companyId,
        channel: RECOVERY_META_TEMPLATES_CHANNEL,
        title: RECOVERY_META_TEMPLATES_TITLE,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async getMetaTemplateRegistry(companyId: number): Promise<RecoveryMetaTemplateRegistry> {
    const row = await this.getMetaTemplateRegistryRow(companyId);
    const parsed = this.parseMetaTemplateRegistry(row?.template || null);
    return this.backfillStoredTemplateMediaLinks(companyId, parsed);
  }

  private async saveMetaTemplateRegistry(companyId: number, registry: RecoveryMetaTemplateRegistry) {
    const row = await this.getMetaTemplateRegistryRow(companyId);
    const normalized: RecoveryMetaTemplateRegistry = {
      phoneNumberId: registry?.phoneNumberId ? String(registry.phoneNumberId) : null,
      wabaId: registry?.wabaId ? String(registry.wabaId) : null,
      lastSyncAt: registry?.lastSyncAt ? String(registry.lastSyncAt) : null,
      templates: Array.isArray(registry?.templates) ? registry.templates : [],
      history: Array.isArray(registry?.history)
        ? registry.history.slice(0, RECOVERY_META_TEMPLATES_HISTORY_LIMIT)
        : [],
    };
    const payload = {
      companyId,
      title: RECOVERY_META_TEMPLATES_TITLE,
      channel: RECOVERY_META_TEMPLATES_CHANNEL,
      template: this.json(normalized),
      daysAfter: 0,
      enabled: false,
      sortOrder: 0,
    };
    if (row) {
      await this.prisma.hbxRecoveryFlowStage.update({
        where: { id: row.id },
        data: payload,
      });
    } else {
      await this.prisma.hbxRecoveryFlowStage.create({
        data: payload,
      });
    }
    return normalized;
  }

  private extractMetaTemplateBodyAndButtons(componentsRaw: unknown) {
    const components = Array.isArray(componentsRaw) ? componentsRaw : [];
    let headerFormat: string | null = null;
    let headerText: string | null = null;
    let headerHandle: string | null = null;
    let bodyText = '';
    let footerText: string | null = null;
    const buttonLabels: string[] = [];
    for (const component of components) {
      const type = String((component as any)?.type || '').trim().toUpperCase();
      if (type === 'HEADER' && !headerFormat) {
        headerFormat = this.normalizeMetaHeaderFormat((component as any)?.format);
        if (headerFormat === 'TEXT') {
          const value = String((component as any)?.text || '').trim();
          headerText = value || null;
        }
        const headerExamples = (component as any)?.example?.header_handle;
        if (Array.isArray(headerExamples)) {
          const value = String(headerExamples[0] || '').trim();
          headerHandle = value || null;
        }
      }
      if (type === 'BODY' && !bodyText) {
        bodyText = String((component as any)?.text || '').trim();
      }
      if (type === 'FOOTER' && !footerText) {
        const value = String((component as any)?.text || '').trim();
        footerText = value || null;
      }
      if (type === 'BUTTONS' && Array.isArray((component as any)?.buttons)) {
        for (const button of (component as any).buttons) {
          const title = String((button as any)?.text || '').trim();
          if (title) buttonLabels.push(title);
        }
      }
    }
    const variableKeys: string[] = [];
    const collectVars = (text: string) => {
      for (const key of this.extractTemplateVariablesInOrder(text)) {
        if (!variableKeys.includes(key)) variableKeys.push(key);
      }
    };
    collectVars(bodyText);
    collectVars(footerText || '');
    collectVars(headerText || '');
    return {
      headerFormat,
      headerText,
      headerHandle,
      bodyText,
      footerText,
      buttonLabels,
      variableKeys,
      components,
    };
  }

  private parseMetaApiError(error: any, fallback: string) {
    const provider = error?.response?.data?.error || error?.response?.data || {};
    const providerMessage = String(
      provider?.error_user_msg ||
        provider?.error_user_title ||
        provider?.message ||
        provider?.error_data?.details ||
        '',
    ).trim();
    const providerMessageLower = providerMessage.toLowerCase();
    if (
      providerMessageLower.includes('nonexisting field (message_templates)') ||
      providerMessageLower.includes('whatsappbusinessphonenumber')
    ) {
      return (
        'A Meta nao permite consultar templates via phone_number_id. ' +
        'Configure o WABA ID (WHATSAPP_WABA_ID) no backend para usar o guia Templates Meta.'
      );
    }
    if (providerMessage) return providerMessage;
    if (error?.response?.status) {
      return `${fallback} (HTTP ${error.response.status})`;
    }
    return String(error?.message || fallback);
  }

  private normalizeTemplateNameForMeta(nameRaw: string) {
    return String(nameRaw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private async resolveMetaTemplateContext(companyId: number) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    const creds = resolveWhatsAppCredentials(company);
    const phoneNumberId = String(creds.phoneNumberId || '').trim();
    const accessToken = String(creds.accessToken || '').trim();
    if (!phoneNumberId || !accessToken) {
      throw new BadRequestException(
        'WhatsApp nao configurado para esta empresa. Configure phone_number_id e token no MASTER.',
      );
    }

    // Templates da Meta exigem WABA ID (nao funciona em phone_number_id).
    let wabaId = '';
    try {
      // Keep this lightweight and compatible; some accounts do not expose whatsapp_business_account as field.
      await axios.get(`${this.cloudApiBaseUrl}/${encodeURIComponent(phoneNumberId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: 'id,display_phone_number,verified_name' },
        timeout: 15000,
      });
    } catch (error: any) {
      throw new BadRequestException(
        this.parseMetaApiError(
          error,
          'Falha ao validar credenciais WhatsApp na Meta para consultar templates',
        ),
      );
    }

    try {
      const edgeRes = await axios.get(
        `${this.cloudApiBaseUrl}/${encodeURIComponent(phoneNumberId)}/whatsapp_business_account`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { fields: 'id' },
          timeout: 15000,
        },
      );
      const directId = String(edgeRes?.data?.id || '').trim();
      const listId = String(edgeRes?.data?.data?.[0]?.id || '').trim();
      wabaId = directId || listId || '';
    } catch {
      // fallback below keeps compatibility for accounts that do not expose the edge
    }

    if (!wabaId) {
      const companyWabaId = String((company as any)?.whatsappWabaId || '').trim();
      if (companyWabaId) {
        wabaId = companyWabaId;
      }
    }

    const templateNodeIds = [wabaId].filter(Boolean);
    if (!templateNodeIds.length) {
      throw new BadRequestException(
        'Nao foi possivel resolver o WABA ID da empresa para consultar templates na Meta com as credenciais deste numero. Configure o WABA ID da empresa no MASTER. O guia Templates Meta nao pode usar o WABA global de outro numero.',
      );
    }
    return { accessToken, phoneNumberId, wabaId: wabaId || null, templateNodeIds };
  }

  private async fetchMetaTemplatesFromProvider(
    templateNodeIds: string[],
    accessToken: string,
  ): Promise<{ rows: any[]; usedNodeId: string }> {
    let lastError: any = null;
    for (const nodeId of templateNodeIds) {
      const allRows: any[] = [];
      let cursorAfter: string | null = null;
      try {
        while (true) {
          const params: Record<string, any> = {
            fields:
              'id,name,language,category,status,quality_score,rejected_reason,components,last_updated_time',
            limit: 100,
          };
          if (cursorAfter) params.after = cursorAfter;
          const response = await axios.get(
            `${this.cloudApiBaseUrl}/${encodeURIComponent(nodeId)}/message_templates`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              params,
              timeout: 20000,
            },
          );
          const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
          allRows.push(...rows);
          const nextCursor = String(response?.data?.paging?.cursors?.after || '').trim();
          if (!nextCursor || rows.length === 0) break;
          cursorAfter = nextCursor;
        }
        return { rows: allRows, usedNodeId: nodeId };
      } catch (error: any) {
        lastError = error;
      }
    }
    throw new BadRequestException(
      this.parseMetaApiError(lastError, 'Falha ao consultar templates na Meta'),
    );
  }

  private async createMetaTemplateOnProvider(
    templateNodeIds: string[],
    accessToken: string,
    payload: any,
  ) {
    let lastError: any = null;
    for (const nodeId of templateNodeIds) {
      try {
        const response = await axios.post(
          `${this.cloudApiBaseUrl}/${encodeURIComponent(nodeId)}/message_templates`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 20000,
          },
        );
        return { response, usedNodeId: nodeId };
      } catch (error: any) {
        lastError = error;
      }
    }
    throw new BadRequestException(
      this.parseMetaApiError(lastError, 'Falha ao criar template na Meta'),
    );
  }

  private async deleteMetaTemplateOnProvider(
    templateNodeIds: string[],
    accessToken: string,
    payload: { name: string; id?: string | null },
  ) {
    let lastError: any = null;
    for (const nodeId of templateNodeIds) {
      try {
        const response = await axios.delete(
          `${this.cloudApiBaseUrl}/${encodeURIComponent(nodeId)}/message_templates`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            params: {
              name: payload.name,
              ...(payload.id ? { hsm_id: payload.id } : {}),
            },
            timeout: 20000,
          },
        );
        return { response, usedNodeId: nodeId };
      } catch (error: any) {
        lastError = error;
      }
    }
    throw new BadRequestException(
      this.parseMetaApiError(lastError, 'Falha ao excluir template na Meta'),
    );
  }

  private parseUploadApiError(payload: any, fallback: string) {
    const provider = payload?.error || payload || {};
    const providerMessage = String(
      provider?.error_user_msg ||
        provider?.error_user_title ||
        provider?.message ||
        provider?.error_data?.details ||
        '',
    ).trim();
    return providerMessage || fallback;
  }

  private parseMaybeJson(raw: string) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private fileExtensionFromMime(contentType: string) {
    const normalized = String(contentType || '').trim().toLowerCase();
    if (normalized === 'image/jpeg') return '.jpg';
    if (normalized === 'image/png') return '.png';
    if (normalized === 'image/webp') return '.webp';
    return '';
  }

  private async createMetaUploadSession(accessToken: string, fileName: string, fileLength: number, fileType: string) {
    const params = new URLSearchParams({
      file_name: fileName,
      file_length: String(fileLength),
      file_type: fileType,
      access_token: accessToken,
    });
    const response = await fetch(`${this.cloudApiBaseUrl}/app/uploads?${params.toString()}`, {
      method: 'POST',
    });
    const bodyRaw = await response.text();
    const body = this.parseMaybeJson(bodyRaw) as MetaUploadSessionResponse | string | null;
    if (!response.ok) {
      throw new BadRequestException(
        this.parseUploadApiError(body, 'Falha ao criar sessao de upload na Meta.'),
      );
    }
    const uploadId = typeof body === 'object' && body ? String(body.id || '').trim() : '';
    if (!uploadId) {
      throw new BadRequestException('A Meta nao retornou uma sessao valida para upload da imagem.');
    }
    return uploadId;
  }

  private async uploadMediaHandleToMeta(accessToken: string, file: any) {
    const fileName = String(file?.originalname || 'header-image').trim() || 'header-image';
    const contentType = String(file?.mimetype || '').trim().toLowerCase();
    const buffer = file?.buffer;
    const fileLength = Number(file?.size || buffer?.length || 0);
    if (!buffer || !fileLength) {
      throw new BadRequestException('Arquivo de imagem invalido.');
    }
    const uploadId = await this.createMetaUploadSession(accessToken, fileName, fileLength, contentType);
    const formData = new FormData();
    formData.set('file', new Blob([buffer], { type: contentType }), fileName);
    const response = await fetch(`${this.cloudApiBaseUrl}/${uploadId}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset: '0',
      },
      body: formData,
    });
    const bodyRaw = await response.text();
    const body = this.parseMaybeJson(bodyRaw) as MetaUploadSessionResponse | string | null;
    if (!response.ok) {
      throw new BadRequestException(
        this.parseUploadApiError(body, 'Falha ao enviar imagem para a Meta.'),
      );
    }
    const handle = typeof body === 'object' && body ? String(body.h || '').trim() : '';
    if (!handle) {
      throw new BadRequestException('A Meta nao retornou o header_handle da imagem enviada.');
    }
    return handle;
  }

  private persistUploadedTemplateMedia(
    file: any,
    options?: { templateName?: string | null; language?: string | null },
  ) {
    const contentType = String(file?.mimetype || '').trim().toLowerCase();
    const extension =
      extname(String(file?.originalname || '').trim()).toLowerCase() ||
      this.fileExtensionFromMime(contentType) ||
      '.bin';
    const uploadDir = this.metaTemplateUploadDir();
    mkdirSync(uploadDir, { recursive: true });
    const normalizedTemplateName = this.normalizeTemplateNameForMeta(options?.templateName || '');
    const normalizedLanguage = String(options?.language || 'pt_BR')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const fileName = normalizedTemplateName
      ? `${normalizedTemplateName}${normalizedLanguage && normalizedLanguage !== 'pt_br' ? `_${normalizedLanguage}` : ''}${extension}`
      : `${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
    writeFileSync(join(uploadDir, fileName), file.buffer);
    return {
      fileName,
      relativePath: `/uploads/hbx-recovery/meta-templates/${fileName}`,
    };
  }

  private metaTemplateUploadDir() {
    return join(process.cwd(), 'public', 'uploads', 'hbx-recovery', 'meta-templates');
  }

  private templateMediaAliasBaseName(templateNameRaw: string | null | undefined, languageRaw: string | null | undefined) {
    const templateName = this.normalizeTemplateNameForMeta(templateNameRaw || '');
    if (!templateName) return '';
    const language = String(languageRaw || 'pt_BR')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    return `${templateName}${language && language !== 'pt_br' ? `_${language}` : ''}`;
  }

  private resolveStoredTemplateMediaLink(
    templateNameRaw: string | null | undefined,
    languageRaw: string | null | undefined,
  ) {
    const aliasBaseName = this.templateMediaAliasBaseName(templateNameRaw, languageRaw);
    if (!aliasBaseName) return null;
    const uploadDir = this.metaTemplateUploadDir();
    if (!existsSync(uploadDir)) return null;
    const candidates = readdirSync(uploadDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((fileName) => {
        const extension = extname(fileName).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) return false;
        return fileName.slice(0, -extension.length).toLowerCase() === aliasBaseName.toLowerCase();
      });
    const fileName = candidates[0];
    if (!fileName) return null;
    return {
      fileName,
      relativePath: `/uploads/hbx-recovery/meta-templates/${fileName}`,
      publicUrl: `${this.publicApiBaseUrl()}/uploads/hbx-recovery/meta-templates/${fileName}`,
    };
  }

  private tryAliasLatestLegacyTemplateMedia(
    template: RecoveryMetaTemplate,
    missingMediaTemplates: RecoveryMetaTemplate[],
  ) {
    if (
      !template.hbxActive ||
      this.normalizeMetaStatus(template.status) !== 'APPROVED' ||
      missingMediaTemplates.length !== 1
    ) {
      return null;
    }
    const uploadDir = this.metaTemplateUploadDir();
    if (!existsSync(uploadDir)) return null;
    const aliasBaseName = this.templateMediaAliasBaseName(template.name, template.language);
    if (!aliasBaseName) return null;
    const candidates = readdirSync(uploadDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((fileName) => {
        const extension = extname(fileName).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) return false;
        return fileName.slice(0, -extension.length).toLowerCase() !== aliasBaseName.toLowerCase();
      })
      .sort((left, right) => right.localeCompare(left));
    const latestLegacy = candidates[0];
    if (!latestLegacy) return null;
    const extension = extname(latestLegacy).toLowerCase() || '.jpg';
    const aliasFileName = `${aliasBaseName}${extension}`;
    const sourcePath = join(uploadDir, latestLegacy);
    const targetPath = join(uploadDir, aliasFileName);
    if (!existsSync(targetPath)) {
      copyFileSync(sourcePath, targetPath);
    }
    return {
      fileName: aliasFileName,
      relativePath: `/uploads/hbx-recovery/meta-templates/${aliasFileName}`,
      publicUrl: `${this.publicApiBaseUrl()}/uploads/hbx-recovery/meta-templates/${aliasFileName}`,
    };
  }

  private async backfillStoredTemplateMediaLinks(
    companyId: number,
    registry: RecoveryMetaTemplateRegistry,
  ) {
    const templates = Array.isArray(registry?.templates) ? registry.templates : [];
    const missingMediaTemplates = templates.filter(
      (item) =>
        this.isMetaMediaHeaderFormat(item.headerFormat) && !String(item.headerMediaUrl || '').trim(),
    );
    if (!missingMediaTemplates.length) return registry;

    let changed = false;
    const nextTemplates = templates.map((template) => {
      if (
        !missingMediaTemplates.some(
          (item) =>
            this.metaTemplateKey(item.name, item.language) ===
            this.metaTemplateKey(template.name, template.language),
        )
      ) {
        return template;
      }
      const stored =
        this.resolveStoredTemplateMediaLink(template.name, template.language) ||
        this.tryAliasLatestLegacyTemplateMedia(template, missingMediaTemplates);
      if (!stored) return template;
      changed = true;
      return this.rebuildMetaTemplateRecord({
        ...template,
        headerMediaUrl: stored.publicUrl,
      });
    });

    if (!changed) return registry;
    return this.saveMetaTemplateRegistry(companyId, {
      ...registry,
      templates: nextTemplates,
    });
  }

  private buildMetaTemplatesResponse(companyId: number, registry: RecoveryMetaTemplateRegistry) {
    const templates = [...(registry?.templates || [])].sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return a.language.localeCompare(b.language);
    });
    const counters = {
      total: templates.length,
      approved: templates.filter((item) => this.normalizeMetaStatus(item.status) === 'APPROVED')
        .length,
      pending: templates.filter((item) =>
        ['PENDING', 'IN_APPEAL'].includes(this.normalizeMetaStatus(item.status)),
      ).length,
      rejected: templates.filter((item) =>
        ['REJECTED', 'PAUSED', 'DISABLED'].includes(this.normalizeMetaStatus(item.status)),
      ).length,
      hbxActive: templates.filter((item) => item.hbxActive).length,
      eligible: templates.filter(
        (item) => item.hbxActive && this.normalizeMetaStatus(item.status) === 'APPROVED',
      ).length,
    };
    return {
      phoneNumberId: registry?.phoneNumberId || null,
      wabaId: registry?.wabaId || null,
      lastSyncAt: registry?.lastSyncAt || null,
      counters,
      templates: templates.map((item) => {
        const normalized = this.getNormalizedMetaTemplate(item);
        const resolvedHeaderMediaUrl = this.resolveTemplateHeaderMediaUrl(item, companyId);
        const projected = this.rebuildMetaTemplateRecord({
          ...item,
          headerMediaUrl: resolvedHeaderMediaUrl,
        });
        return {
          ...projected,
          normalized: {
            ...normalized,
            header: {
              ...normalized.header,
              mediaUrl: resolvedHeaderMediaUrl,
            },
          },
          headerMediaUrl: resolvedHeaderMediaUrl,
          metaApproved: this.normalizeMetaStatus(item.status) === 'APPROVED',
          eligibleForRecovery: this.getRecoveryStartTemplateCompatibilityIssues(projected).length === 0,
        };
      }),
      history: (registry?.history || [])
        .slice(0, RECOVERY_META_TEMPLATES_HISTORY_LIMIT)
        .sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt))),
    };
  }

  private async syncMetaTemplatesByCompanyId(companyId: number) {
    const previous = await this.getMetaTemplateRegistry(companyId);
    const prevMap = new Map(
      (previous.templates || []).map((item) => [this.metaTemplateKey(item.name, item.language), item]),
    );
    const { accessToken, phoneNumberId, wabaId, templateNodeIds } =
      await this.resolveMetaTemplateContext(companyId);
    const providerResult = await this.fetchMetaTemplatesFromProvider(templateNodeIds, accessToken);
    const providerRows = providerResult.rows;
    const nowIso = new Date().toISOString();
    const history = [...(previous.history || [])];
    const templates: RecoveryMetaTemplate[] = [];

    for (const row of providerRows) {
      const language = String(row?.language || '').trim();
      if (language.toLowerCase() !== 'pt_br') continue;
      const name = String(row?.name || '').trim();
      if (!name) continue;
      const key = this.metaTemplateKey(name, language);
      const previousTemplate = prevMap.get(key);
      const status = this.normalizeMetaStatus(row?.status);
      const category = this.normalizeMetaCategory(row?.category);
      const qualityRaw = row?.quality_score?.score ?? row?.quality_score;
      const qualityScore =
        qualityRaw !== undefined && qualityRaw !== null ? String(qualityRaw).trim() : null;
      const rejectedReason = normalizeMetaTemplateRejectionReason(row?.rejected_reason);

      if (previousTemplate && this.normalizeMetaStatus(previousTemplate.status) !== status) {
        history.unshift({
          id: `meta_status_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          templateKey: key,
          name,
          language,
          previousStatus: this.normalizeMetaStatus(previousTemplate.status),
          nextStatus: status,
          reason: rejectedReason,
          changedAt: nowIso,
        });
      }

      templates.push(
        this.createMetaTemplateRecord({
          id: row?.id !== undefined && row?.id !== null ? String(row.id) : null,
          name,
          language,
          category,
          status,
          qualityScore,
          rejectedReason,
          components: Array.isArray(row?.components) ? row.components : [],
          hbxActive: Boolean(previousTemplate?.hbxActive),
          lastMetaSyncAt: nowIso,
          localMedia: this.isMetaMediaHeaderFormat(
            normalizeMetaTemplateHeaderFormat((row?.components || []).find?.(
              (component: any) => String(component?.type || '').trim().toUpperCase() === 'HEADER',
            )?.format),
          )
            ? {
                headerMediaUrl: previousTemplate?.headerMediaUrl || null,
                headerMediaFileName: previousTemplate?.headerMediaFileName || null,
                headerMediaContentType: previousTemplate?.headerMediaContentType || null,
                headerMediaBase64: previousTemplate?.headerMediaBase64 || null,
              }
            : undefined,
        }),
      );
    }

    const registry: RecoveryMetaTemplateRegistry = {
      phoneNumberId,
      wabaId: wabaId || providerResult.usedNodeId,
      lastSyncAt: nowIso,
      templates,
      history: history.slice(0, RECOVERY_META_TEMPLATES_HISTORY_LIMIT),
    };
    const saved = await this.saveMetaTemplateRegistry(companyId, registry);
    return this.backfillStoredTemplateMediaLinks(companyId, saved);
  }

  private async ensureStartTemplateAllowed(
    companyId: number,
    templateName: string,
    templateLanguage: string,
  ) {
    let registry = await this.getMetaTemplateRegistry(companyId);
    const key = this.metaTemplateKey(templateName, templateLanguage);
    let selected = (registry.templates || []).find(
      (item) => this.metaTemplateKey(item.name, item.language) === key,
    );
    if (!selected) {
      try {
        registry = await this.syncMetaTemplatesByCompanyId(companyId);
        selected = (registry.templates || []).find(
          (item) => this.metaTemplateKey(item.name, item.language) === key,
        );
      } catch {
        // keep original validation message below; sync error can be surfaced in Templates Meta screen.
      }
    }
    if (!selected) {
      throw new BadRequestException(
        `Template '${templateName}' (${templateLanguage}) nao encontrado no guia Templates Meta. Sincronize a lista e ative o template.`,
      );
    }
    if (!selected.hbxActive) {
      throw new BadRequestException(
        `Template '${templateName}' esta desativado no HBX. Ative em Templates Meta antes do envio automatico.`,
      );
    }
    const status = this.normalizeMetaStatus(selected.status);
    if (status !== 'APPROVED') {
      const reason = selected.rejectedReason ? ` Motivo: ${selected.rejectedReason}` : '';
      throw new BadRequestException(
        `Template '${templateName}' nao aprovado na Meta (status: ${status}).${reason}`,
      );
    }
    this.assertRecoveryStartTemplateCompatible(selected);
    return selected;
  }

  private recoveryStartTemplateHasQuickReplies(template: RecoveryMetaTemplate) {
    const normalized = this.getNormalizedMetaTemplate(template);
    if (!normalized.buttons.length) return false;
    let totalButtons = 0;
    for (const button of normalized.buttons) {
      if (String(button.type || '').trim().toUpperCase() !== 'QUICK_REPLY') return false;
      totalButtons += 1;
    }
    return totalButtons > 0 && totalButtons <= 3;
  }

  private getRecoveryStartTemplateCompatibilityIssues(template: RecoveryMetaTemplate) {
    const normalized = this.getNormalizedMetaTemplate(template);
    const issues: string[] = [];
    if (String(template.language || '').trim().toLowerCase() !== 'pt_br') {
      issues.push('use a variante pt_BR');
    }
    const resolvedHeaderMediaUrl = this.resolveTemplateHeaderMediaUrl(template);
    if (this.isMetaMediaHeaderFormat(normalized.header.format) && !String(resolvedHeaderMediaUrl || '').trim()) {
      issues.push('salve a URL publica da midia de cabecalho');
    }
    if (this.isMetaMediaHeaderFormat(normalized.header.format) && this.isLocalOnlyUrl(resolvedHeaderMediaUrl)) {
      issues.push('use PUBLIC_API_BASE_URL com uma URL publica para a imagem de cabecalho');
    }
    if (normalized.header.format === 'TEXT' && extractNumericTemplateVariablesInOrder(normalized.header.text).length > 0) {
      issues.push('remova variaveis do cabecalho de texto');
    }
    if (extractNumericTemplateVariablesInOrder(normalized.footer.text).length > 0) {
      issues.push('remova variaveis do rodape');
    }
    if (!this.recoveryStartTemplateHasQuickReplies(template)) {
      issues.push('mantenha de 1 a 3 botoes do tipo resposta rapida');
    }
    return issues;
  }

  private assertRecoveryStartTemplateCompatible(template: RecoveryMetaTemplate) {
    const issues = this.getRecoveryStartTemplateCompatibilityIssues(template);
    if (issues.length > 0) {
      throw new BadRequestException(
        `Template '${template.name}' incompativel com o fluxo inicial do Recovery: ${issues.join('; ')}.`,
      );
    }
  }

  private getEligibleStartTemplates(registry: RecoveryMetaTemplateRegistry) {
    return (registry.templates || []).filter((item) => {
      return (
        item.hbxActive &&
        this.normalizeMetaStatus(item.status) === 'APPROVED' &&
        this.getRecoveryStartTemplateCompatibilityIssues(item).length === 0
      );
    });
  }

  private buildRecoveryStartTemplateCandidates(botConfig: RecoveryBotConfig) {
    const candidates: Array<{ name: string; language: string }> = [];
    const append = (nameRaw: string | null | undefined, languageRaw: string | null | undefined) => {
      const name = String(nameRaw || '').trim();
      if (!name) return;
      const language = String(languageRaw || 'pt_BR').trim() || 'pt_BR';
      const key = this.metaTemplateKey(name, language);
      if (candidates.some((item) => this.metaTemplateKey(item.name, item.language) === key)) return;
      candidates.push({ name, language });
    };

    const activeTemplate =
      (botConfig.startTemplates || []).find((item) => item.active) || botConfig.startTemplates?.[0] || null;
    append(activeTemplate?.name, activeTemplate?.language);
    append(botConfig.initialTemplateName, botConfig.initialTemplateLanguage);
    append(this.getRecoveryInitialTemplateName(), this.getRecoveryInitialTemplateLanguage());
    return candidates;
  }

  private async resolveRecoveryStartTemplate(companyId: number, botConfig: RecoveryBotConfig) {
    let registry = await this.getMetaTemplateRegistry(companyId);
    try {
      registry = await this.syncMetaTemplatesByCompanyId(companyId);
    } catch (error: any) {
      const reason = String(error?.message || 'Falha ao sincronizar templates na Meta');
      throw new BadRequestException(
        `Falha ao validar templates na Meta antes do envio: ${reason}`,
      );
    }

    const eligibleTemplates = this.getEligibleStartTemplates(registry);
    const candidates = this.buildRecoveryStartTemplateCandidates(botConfig);

    for (const candidate of candidates) {
      const match = eligibleTemplates.find(
        (item) =>
          this.metaTemplateKey(item.name, item.language) ===
          this.metaTemplateKey(candidate.name, candidate.language),
      );
      if (match) return match;
    }

    const requested = candidates[0];
    if (requested?.name) {
      return this.ensureStartTemplateAllowed(companyId, requested.name, requested.language);
    }

    if (eligibleTemplates.length) return eligibleTemplates[0];

    throw new BadRequestException(
      'Nenhum template inicial aprovado e ativo foi encontrado no guia Templates Meta. Ative um template aprovado em pt_BR.',
    );
  }

  private async getRecoveryOperatorName(user: any) {
    const direct = String(user?.name || user?.username || '').trim();
    if (direct) return direct;
    const userId = Number(user?.id || 0);
    if (!userId) return 'Atendente';
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, username: true },
    });
    return String(row?.name || row?.username || '').trim() || 'Atendente';
  }

  async listMetaTemplates(user: any, refreshRaw?: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const shouldRefresh = String(refreshRaw || '').trim().toLowerCase() === 'true';
    let registry = await this.getMetaTemplateRegistry(companyId);
    let syncError: string | null = null;
    if (shouldRefresh) {
      try {
        registry = await this.syncMetaTemplatesByCompanyId(companyId);
      } catch (error: any) {
        syncError = String(error?.message || 'Falha ao sincronizar templates da Meta.');
      }
    }
    return {
      ...this.buildMetaTemplatesResponse(companyId, registry),
      syncError,
    };
  }

  async syncMetaTemplates(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    try {
      const registry = await this.syncMetaTemplatesByCompanyId(companyId);
      return {
        ...this.buildMetaTemplatesResponse(companyId, registry),
        syncError: null,
      };
    } catch (error: any) {
      const registry = await this.getMetaTemplateRegistry(companyId);
      return {
        ...this.buildMetaTemplatesResponse(companyId, registry),
        syncError: String(error?.message || 'Falha ao sincronizar templates da Meta.'),
      };
    }
  }

  async setMetaTemplateActivation(user: any, dto: SetMetaTemplateActivationDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const name = String(dto?.name || '').trim();
    const language = String(dto?.language || '').trim() || 'pt_BR';
    if (!name) throw new BadRequestException('Nome do template e obrigatorio.');
    const hasHeaderMediaUrl = Object.prototype.hasOwnProperty.call(dto || {}, 'headerMediaUrl');
    const headerMediaUrl = hasHeaderMediaUrl
      ? this.normalizeOptionalHttpUrl(dto?.headerMediaUrl, 'URL de midia do cabecalho')
      : null;

    let registry = await this.getMetaTemplateRegistry(companyId);
    if (!(registry.templates || []).length) {
      registry = await this.syncMetaTemplatesByCompanyId(companyId);
    }
    const key = this.metaTemplateKey(name, language);
    let changed = false;
    registry.templates = (registry.templates || []).map((item) => {
      if (this.metaTemplateKey(item.name, item.language) !== key) return item;
      changed = true;
      const normalized = this.getNormalizedMetaTemplate(item);
      const nextHeaderMediaUrl =
        hasHeaderMediaUrl && this.isMetaMediaHeaderFormat(normalized.header.format)
          ? headerMediaUrl
          : item.headerMediaUrl;
      return this.rebuildMetaTemplateRecord({
        ...item,
        hbxActive: Boolean(dto?.active),
        headerMediaUrl: nextHeaderMediaUrl,
        headerMediaFileName: hasHeaderMediaUrl ? null : item.headerMediaFileName,
        headerMediaContentType: hasHeaderMediaUrl ? null : item.headerMediaContentType,
        headerMediaBase64: hasHeaderMediaUrl ? null : item.headerMediaBase64,
      });
    });
    if (!changed) {
      throw new NotFoundException(
        `Template '${name}' (${language}) nao encontrado no registro do HBX. Sincronize com a Meta.`,
      );
    }
    const saved = await this.saveMetaTemplateRegistry(companyId, registry);
    return this.buildMetaTemplatesResponse(companyId, saved);
  }

  async createMetaTemplate(user: any, dto: CreateMetaTemplateDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const nameRaw = this.normalizeTemplateNameForMeta(dto?.name || '');
    if (!nameRaw || !/^[a-z0-9_]+$/.test(nameRaw)) {
      throw new BadRequestException(
        'Nome do template invalido. Use apenas letras minusculas, numeros e underscore.',
      );
    }
    const language = String(dto?.language || 'pt_BR').trim() || 'pt_BR';
    const category = this.normalizeMetaCategory(dto?.category || 'UTILITY');
    const bodyTemplate = this.convertFriendlyTemplateTextToMeta(String(dto?.bodyText || '').trim());
    if (!bodyTemplate.friendlyText) throw new BadRequestException('Corpo do template obrigatorio.');
    if (bodyTemplate.friendlyText.length < 10) {
      throw new BadRequestException('Corpo do template muito curto. Use pelo menos 10 caracteres.');
    }
    this.validateTemplateVariablePlacement(bodyTemplate.friendlyText, 'Corpo do template');
    const footerTemplate = this.convertFriendlyTemplateTextToMeta(String(dto?.footerText || '').trim());
    const footerText = footerTemplate.friendlyText;
    if (footerText) {
      this.validateTemplateVariablePlacement(footerText, 'Rodape');
      if (footerTemplate.variableKeys.length > 0) {
        throw new BadRequestException(
          'Rodape com variaveis nao e suportado pela Meta. Deixe as variaveis apenas no BODY.',
        );
      }
    }
    const headerFormat = this.normalizeMetaHeaderFormat(dto?.headerFormat);
    const headerTemplate = this.convertFriendlyTemplateTextToMeta(String(dto?.headerText || '').trim());
    const headerText = headerTemplate.friendlyText;
    const headerHandle = String(dto?.headerHandle || '').trim();
    const headerMediaUrl = this.normalizeOptionalHttpUrl(
      dto?.headerMediaUrl,
      'URL de midia do cabecalho',
    );
    const buttonLabels = Array.isArray(dto?.buttons)
      ? dto.buttons
          .map((item) => String(item || '').trim())
          .filter((item) => item.length > 0)
          .slice(0, 3)
      : [];
    const oversizedButton = buttonLabels.find((item) => item.length > 25);
    if (oversizedButton) {
      throw new BadRequestException(
        `Botao '${oversizedButton}' excede 25 caracteres (limite da Meta para resposta rapida).`,
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const operatorName = await this.getRecoveryOperatorName(user);
    const dtoVariableExamples =
      dto?.variableExamples && typeof dto.variableExamples === 'object' && !Array.isArray(dto.variableExamples)
        ? dto.variableExamples
        : {};
    const bodyExamples = bodyTemplate.variableKeys.map((key) =>
      String(
        (dtoVariableExamples as Record<string, string | null | undefined>)[
          this.normalizeTemplateVariableKey(key)
        ] || '',
      ).trim() ||
      this.metaTemplateExampleValue(key, {
        companyName: company?.name,
        operatorName,
      }),
    );

    const components: any[] = [];
    if (headerFormat === 'TEXT') {
      if (!headerText) {
        throw new BadRequestException('Informe o texto do cabecalho.');
      }
      if (headerText.length > 60) {
        throw new BadRequestException('Cabecalho de texto excede 60 caracteres.');
      }
      if (headerTemplate.variableKeys.length > 0) {
        throw new BadRequestException(
          'Cabecalho de texto com variaveis ainda nao e suportado no HBX. Use texto fixo no cabecalho e deixe as variaveis no BODY.',
        );
      }
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    } else if (this.isMetaMediaHeaderFormat(headerFormat)) {
      if (!headerHandle) {
        throw new BadRequestException(
          'Cabecalho com midia exige o header_handle do asset enviado para a Meta.',
        );
      }
      components.push({
        type: 'HEADER',
        format: headerFormat,
        example: {
          header_handle: [headerHandle],
        },
      });
    }

    components.push({
      type: 'BODY',
      text: bodyTemplate.metaText,
      ...(bodyExamples.length
        ? {
            example: {
              body_text: [bodyExamples],
            },
          }
        : {}),
    });
    if (footerText) components.push({ type: 'FOOTER', text: footerTemplate.metaText });
    if (buttonLabels.length) {
      components.push({
        type: 'BUTTONS',
        buttons: buttonLabels.map((text) => ({ type: 'QUICK_REPLY', text })),
      });
    }

    const { accessToken, templateNodeIds } = await this.resolveMetaTemplateContext(companyId);
    const providerCreate = await this.createMetaTemplateOnProvider(templateNodeIds, accessToken, {
      name: nameRaw,
      category,
      language,
      allow_category_change: true,
      components,
    });
    const providerResponse = providerCreate.response;

    let registry = await this.syncMetaTemplatesByCompanyId(companyId);
    const createdKey = this.metaTemplateKey(nameRaw, language);
    registry.templates = (registry.templates || []).map((item) =>
      this.metaTemplateKey(item.name, item.language) === createdKey
        ? this.rebuildMetaTemplateRecord({
            ...item,
            hbxActive: Boolean(dto?.activateInHbx),
            headerHandle:
              this.isMetaMediaHeaderFormat(headerFormat) ? headerHandle || item.headerHandle : item.headerHandle,
            headerMediaUrl:
              this.isMetaMediaHeaderFormat(headerFormat) ? headerMediaUrl || item.headerMediaUrl : item.headerMediaUrl,
          })
        : item,
    );
    registry = await this.saveMetaTemplateRegistry(companyId, registry);

    return {
      ok: true,
      created: {
        id: providerResponse?.data?.id ? String(providerResponse.data.id) : null,
        name: nameRaw,
        language,
        category,
      },
      ...this.buildMetaTemplatesResponse(companyId, registry),
    };
  }

  async deleteMetaTemplate(user: any, dto: DeleteMetaTemplateDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const name = String(dto?.name || '').trim();
    const language = String(dto?.language || 'pt_BR').trim() || 'pt_BR';
    const requestedId = String(dto?.id || '').trim() || null;
    if (!name) throw new BadRequestException('Nome do template e obrigatorio.');

    let registry = await this.getMetaTemplateRegistry(companyId);
    if (!(registry.templates || []).length) {
      registry = await this.syncMetaTemplatesByCompanyId(companyId);
    }

    const key = this.metaTemplateKey(name, language);
    const selected =
      (registry.templates || []).find((item) => this.metaTemplateKey(item.name, item.language) === key) ||
      null;
    const templateId = requestedId || selected?.id || null;
    if (!templateId) {
      throw new NotFoundException(
        `Template '${name}' (${language}) nao encontrado com id valido. Sincronize com a Meta antes de excluir.`,
      );
    }

    const { accessToken, templateNodeIds } = await this.resolveMetaTemplateContext(companyId);
    await this.deleteMetaTemplateOnProvider(templateNodeIds, accessToken, {
      name,
      id: templateId,
    });

    try {
      registry = await this.syncMetaTemplatesByCompanyId(companyId);
      return {
        ...this.buildMetaTemplatesResponse(companyId, registry),
        syncError: null,
      };
    } catch (error: any) {
      const nowIso = new Date().toISOString();
      const history = [
        {
          id: `meta_delete_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          templateKey: key,
          name,
          language,
          previousStatus: selected?.status || null,
          nextStatus: 'DELETED',
          reason: null,
          changedAt: nowIso,
        },
        ...(registry.history || []),
      ].slice(0, RECOVERY_META_TEMPLATES_HISTORY_LIMIT);
      registry = await this.saveMetaTemplateRegistry(companyId, {
        ...registry,
        lastSyncAt: nowIso,
        templates: (registry.templates || []).filter(
          (item) => this.metaTemplateKey(item.name, item.language) !== key,
        ),
        history,
      });
      return {
        ...this.buildMetaTemplatesResponse(companyId, registry),
        syncError: String(error?.message || 'Template removido, mas a sincronizacao posterior falhou.'),
      };
    }
  }

  async uploadMetaTemplateHeaderMedia(
    user: any,
    file?: any,
    options?: { templateName?: string; language?: string },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    if (!file) {
      throw new BadRequestException('Selecione uma imagem para upload.');
    }
    const contentType = String(file?.mimetype || '').trim().toLowerCase();
    if (!['image/jpeg', 'image/png'].includes(contentType)) {
      throw new BadRequestException('Formato invalido. Use JPG ou PNG compativeis com a Meta.');
    }
    const fileSize = Number(file?.size || file?.buffer?.length || 0);
    if (!fileSize || fileSize > 5 * 1024 * 1024) {
      throw new BadRequestException('A imagem deve ter no maximo 5 MB.');
    }

    const { accessToken } = await this.resolveMetaTemplateContext(companyId);
    const headerHandle = await this.uploadMediaHandleToMeta(accessToken, file);
    const templateName = this.normalizeTemplateNameForMeta(options?.templateName || '');
    const templateLanguage = String(options?.language || 'pt_BR').trim() || 'pt_BR';
    const stored = this.persistUploadedTemplateMedia(file, {
      templateName,
      language: templateLanguage,
    });
    const headerMediaUrl =
      (templateName
        ? this.buildTemplateHeaderMediaPublicUrl(companyId, templateName, templateLanguage)
        : null) || `${this.publicApiBaseUrl()}${stored.relativePath}`;
    const headerMediaBase64 = Buffer.from(file.buffer).toString('base64');

    if (templateName) {
      const registry = await this.getMetaTemplateRegistry(companyId);
      const templateKey = this.metaTemplateKey(templateName, templateLanguage);
      const hasMatch = (registry.templates || []).some(
        (item) => this.metaTemplateKey(item.name, item.language) === templateKey,
      );
      if (hasMatch) {
        const saved = await this.saveMetaTemplateRegistry(companyId, {
          ...registry,
          templates: (registry.templates || []).map((item) =>
            this.metaTemplateKey(item.name, item.language) === templateKey
              ? this.rebuildMetaTemplateRecord({
                  ...item,
                  headerHandle,
                  headerMediaUrl,
                  headerMediaFileName: stored.fileName,
                  headerMediaContentType: contentType,
                  headerMediaBase64,
                })
              : item,
          ),
        });
        return {
          ok: true,
          headerHandle,
          headerMediaUrl,
          fileName: stored.fileName,
          contentType,
          registry: this.buildMetaTemplatesResponse(companyId, saved),
        };
      }
    }

    return {
      ok: true,
      headerHandle,
      headerMediaUrl,
      fileName: stored.fileName,
      contentType,
    };
  }

  private publicApiBaseUrl() {
    const explicit =
      process.env.PUBLIC_API_BASE_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.BACKEND_PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      (process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${String(process.env.RENDER_EXTERNAL_HOSTNAME).trim()}`
        : '') ||
      '';
    if (String(explicit).trim()) return String(explicit).trim().replace(/\/+$/, '');
    return `http://localhost:${Number(process.env.APP_PORT || 3000)}`;
  }

  async getPublicMetaTemplateHeaderMedia(companyIdRaw: number, templateNameRaw: string, languageRaw?: string) {
    const companyId = Number(companyIdRaw || 0);
    if (!companyId) throw new NotFoundException('Midia nao encontrada.');
    const registry = await this.getMetaTemplateRegistry(companyId);
    const templateName = this.normalizeTemplateNameForMeta(templateNameRaw || '');
    const language = String(languageRaw || 'pt_BR').trim() || 'pt_BR';
    const key = this.metaTemplateKey(templateName, language);
    const selected = (registry.templates || []).find(
      (item) => this.metaTemplateKey(item.name, item.language) === key,
    );
    if (!selected || !this.isMetaMediaHeaderFormat(selected.headerFormat)) {
      throw new NotFoundException('Midia nao encontrada.');
    }

    const headerMediaBase64 = String(selected.headerMediaBase64 || '').trim();
    if (headerMediaBase64) {
      return {
        contentType:
          String(selected.headerMediaContentType || '').trim() ||
          this.fileContentTypeFromExtension(selected.headerMediaFileName),
        fileName:
          String(selected.headerMediaFileName || '').trim() ||
          `${templateName}${this.fileExtensionFromMime(String(selected.headerMediaContentType || '').trim()) || '.jpg'}`,
        buffer: Buffer.from(headerMediaBase64, 'base64'),
      };
    }

    const stored = this.resolveStoredTemplateMediaLink(selected.name, selected.language);
    if (!stored) {
      throw new NotFoundException('Midia nao encontrada.');
    }
    const absolutePath = join(this.metaTemplateUploadDir(), stored.fileName);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Midia nao encontrada.');
    }
    return {
      contentType: this.fileContentTypeFromExtension(stored.fileName),
      fileName: stored.fileName,
      buffer: readFileSync(absolutePath),
    };
  }

  private async mercadoPagoCredentials(companyId: number) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const accessToken = String(company.mercadoPagoAccessToken || '').trim();
    if (!accessToken) throw new BadRequestException('Mercado Pago nao configurado para esta empresa. Configure no MASTER.');
    return { company, accessToken };
  }

  private async queueRecoveryWithFallback(companyId: number, to: string, body: string, contactId: string) {
    try {
      return await this.conversations.queueOutboundForCompany(companyId, { to, body, messageType: 'text', sourceModule: 'hbx_recovery', contactId });
    } catch (error: any) {
      const msg = String(error?.message || '').toLowerCase();
      const needTemplate = msg.includes('24h') || msg.includes('template');
      if (!needTemplate) throw error;
      const fallbackCandidates = [
        {
          name: String(process.env.WHATSAPP_HBX_RECOVERY_TEMPLATE_NAME || '').trim(),
          language: String(process.env.WHATSAPP_HBX_RECOVERY_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR',
        },
        {
          name: String(process.env.WHATSAPP_SUPPORT_TEMPLATE_NAME || '').trim(),
          language: String(process.env.WHATSAPP_SUPPORT_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR',
        },
        {
          name: String(process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME || '').trim(),
          language: String(process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE || 'pt_BR').trim() || 'pt_BR',
        },
      ].filter((item) => item.name);
      const fallback = fallbackCandidates[0];
      if (!fallback?.name) {
        throw new BadRequestException(
          'Fora da janela de 24h. Configure WHATSAPP_HBX_RECOVERY_TEMPLATE_NAME com um template aprovado na Meta.',
        );
      }
      return this.conversations.queueOutboundForCompany(companyId, {
        to,
        body,
        messageType: 'template',
        templateName: fallback.name,
        templateLanguage: fallback.language,
        sourceModule: 'hbx_recovery',
        contactId,
      });
    }
  }

  private recoveryRootInteractivePayload(config: RecoveryBotConfig) {
    return {
      type: 'button',
      body: { text: config.rootPrompt },
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

  private renderRecoveryTemplate(template: string, vars: Record<string, string>) {
    const base = String(template || '');
    return base.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => vars[key] ?? '');
  }

  private formatCurrencyBRL(value: number) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private buildRecoveryTemplateVars(ownerCompanyName: string, customer: any) {
    const createdAt = customer?.createdAt ? new Date(customer.createdAt) : new Date();
    const clientName = String(customer?.clientName || '').trim() || 'contato responsavel';
    return {
      operador_nome: 'Equipe HBX',
      empresa_cobradora: String(ownerCompanyName || 'HBX Solutions'),
      cliente_nome: clientName,
      empresa_nome: String(customer?.name || ''),
      valor_em_aberto: this.formatCurrencyBRL(Number(customer?.openAmount || 0)),
      dia_registro: this.dateLabelPtBR(createdAt),
    };
  }
  private async applyPayment(companyId: number, customerId: string, amountRaw: number, label: string, when?: Date) {
    const row = await this.findCustomer(companyId, customerId);
    const openAmount = Number(row.openAmount || 0);
    if (openAmount <= 0) return { changed: false, amount: 0, customer: row };
    const desired = Number(amountRaw || 0);
    if (!Number.isFinite(desired) || desired <= 0) throw new BadRequestException('Valor de pagamento invalido.');
    const applied = Math.min(openAmount, desired);
    const nextOpen = Math.max(0, openAmount - applied);
    const now = when || new Date();
    const history = this.parseList<RecoveryPaymentRecord>(row.paymentHistory, []);
    const delays = this.parseList<RecoveryDelayRecord>(row.delayHistory, []);
    history.unshift({ id: `pay-${Date.now().toString(36)}`, label, date: this.isoDateOnly(now), amount: Number(applied.toFixed(2)), status: nextOpen <= 0 ? 'Quitado' : 'Parcial' });
    delays.unshift({ id: `delay-${Date.now().toString(36)}`, period: this.dateLabelPtBR(now), daysLate: 0, outcome: nextOpen <= 0 ? 'Conta quitada no HBX Recovery' : 'Pagamento parcial registrado' });
    const updated = await this.prisma.hbxRecoveryCustomer.update({
      where: { id: row.id },
      data: {
        openAmount: Number(nextOpen.toFixed(2)), totalPaid: Number((Number(row.totalPaid || 0) + applied).toFixed(2)),
        recurringDelays: Math.max(0, Number(row.recurringDelays || 0) - 1), paymentHistoryScore: Math.min(10, Number(row.paymentHistoryScore || 5) + 1), averageDelay: Math.max(0, Number((Number(row.averageDelay || 0) * 0.65).toFixed(1))),
        lastContact: `Pagamento em ${this.dateLabelPtBR(now)}`, status: this.toDbStatus(nextOpen > 0 ? 'overdue' : 'paid'), paymentHistory: this.json(history), delayHistory: this.json(delays),
      },
    });
    return { changed: true, amount: applied, customer: updated };
  }

  private async reversePayment(companyId: number, customerId: string, amountRaw: number, label: string, when?: Date) {
    const row = await this.findCustomer(companyId, customerId);
    const amount = Number(amountRaw || 0);
    if (!Number.isFinite(amount) || amount <= 0) return { changed: false, amount: 0, customer: row };
    const now = when || new Date();
    const history = this.parseList<RecoveryPaymentRecord>(row.paymentHistory, []);
    const delays = this.parseList<RecoveryDelayRecord>(row.delayHistory, []);
    history.unshift({ id: `refund-${Date.now().toString(36)}`, label, date: this.isoDateOnly(now), amount: Number((-amount).toFixed(2)), status: 'Estornado' });
    delays.unshift({ id: `delay-refund-${Date.now().toString(36)}`, period: this.dateLabelPtBR(now), daysLate: 0, outcome: 'Estorno confirmado no Mercado Pago' });
    const nextOpen = Number(row.openAmount || 0) + amount;
    const updated = await this.prisma.hbxRecoveryCustomer.update({
      where: { id: row.id },
      data: {
        openAmount: Number(nextOpen.toFixed(2)), totalPaid: Math.max(0, Number((Number(row.totalPaid || 0) - amount).toFixed(2))), recurringDelays: Number(row.recurringDelays || 0) + 1,
        paymentHistoryScore: Math.max(1, Number(row.paymentHistoryScore || 5) - 1), averageDelay: Number((Number(row.averageDelay || 0) * 1.1 + 1).toFixed(1)),
        lastContact: `Estorno em ${this.dateLabelPtBR(now)}`, status: this.toDbStatus(nextOpen > 0 ? 'overdue' : 'paid'), paymentHistory: this.json(history), delayHistory: this.json(delays),
      },
    });
    return { changed: true, amount, customer: updated };
  }

  private approvedPaymentCustomerMessage(customer: any) {
    const customerName = String(customer?.clientName || customer?.name || 'cliente').trim() || 'cliente';
    return `Olá "${customerName}" pagamento aprovado, muito obrigado e tenha uma ótima semana!\n${RECOVERY_APPROVED_PAYMENT_SIGNATURE}`;
  }

  private async notifyApprovedPayment(companyId: number, payment: any) {
    const customer = payment?.customer;
    const to = String(customer?.whatsappNumber || '').trim();
    const contactId = String(payment?.customerId || customer?.id || '').trim();
    if (!to || !contactId) return;

    const body = this.approvedPaymentCustomerMessage(customer);
    try {
      await this.queueRecoveryWithFallback(companyId, to, body, contactId);
      if (payment?.conversationId) {
        await this.appendInteractionEvent({
          companyId,
          conversationId: Number(payment.conversationId),
          contactId,
          text: 'Mensagem automatica de pagamento aprovado enviada ao cliente.',
          eventType: 'payment_approved_notified',
          sourceModule: 'hbx_recovery_bot',
        });
      }
    } catch (error: any) {
      if (payment?.conversationId) {
        await this.appendInteractionEvent({
          companyId,
          conversationId: Number(payment.conversationId),
          contactId,
          text: `Falha ao enviar mensagem automatica de pagamento aprovado: ${String(error?.message || 'erro desconhecido')}`,
          eventType: 'payment_approved_notify_failed',
          sourceModule: 'hbx_recovery_system',
        });
      }
    }
  }

  private extractPaymentId(query: Record<string, any>, body: any): string | null {
    const candidate = query?.['data.id'] || body?.data?.id || body?.id || query?.id;
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) return String(candidate).trim();
    const resource = body?.resource || query?.resource;
    if (typeof resource === 'string') {
      const match = resource.match(/payments\/(\d+)/i);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  private async syncMercadoPagoPayment(companyId: number, paymentId: string, context?: any) {
    const { accessToken } = await this.mercadoPagoCredentials(companyId);
    const provider = await this.mercadoPagoClient.getPayment(accessToken, paymentId);
    const status = this.paymentStatusFromProvider(provider);
    const lifecycle = this.normalizeLifecycle(status);
    const amount = Math.max(0, Number(provider.transaction_amount || 0));
    const refunded = Math.max(0, Number(provider.transaction_amount_refunded || 0));
    const paidAt = provider.date_approved ? new Date(provider.date_approved) : null;
    const refundedAt = refunded > 0 && provider.date_last_updated ? new Date(provider.date_last_updated) : null;
    const metadata = (provider.metadata || {}) as Record<string, unknown>;
    const externalReference = String(provider.external_reference || '').trim() || null;
    const paymentRecordId = String(metadata.payment_request_id || metadata.paymentRequestId || metadata.recovery_payment_id || '').trim();

    let payment = await this.prisma.hbxRecoveryPayment.findFirst({ where: { companyId, mpPaymentId: String(paymentId) }, include: { customer: true } });
    if (!payment && externalReference) payment = await this.prisma.hbxRecoveryPayment.findFirst({ where: { companyId, externalReference }, include: { customer: true } });
    if (!payment && paymentRecordId) payment = await this.prisma.hbxRecoveryPayment.findFirst({ where: { companyId, id: paymentRecordId }, include: { customer: true } });
    if (!payment) return { updated: false, status };
    const wasPaidBefore =
      this.normalizeLifecycle(String(payment.lifecycle || payment.status || 'in_progress')) === 'paid';

    let updated = await this.prisma.hbxRecoveryPayment.update({
      where: { id: payment.id },
      data: {
        status, lifecycle, mpPaymentId: String(paymentId), mpMerchantOrderId: provider?.order?.id !== undefined && provider?.order?.id !== null ? String(provider.order.id) : payment.mpMerchantOrderId,
        externalReference: externalReference || payment.externalReference, paidAt: paidAt || payment.paidAt, refundedAt,
        refundAmount: Number(refunded.toFixed(2)), providerPayload: this.json({ context: context || null, provider }),
      },
      include: { customer: true },
    });

    const targetNetPaid = Math.max(0, Number((amount - refunded).toFixed(2)));
    const applied = Math.max(0, Number(updated.appliedToCustomerAmount || 0));
    const reversed = Math.max(0, Number(updated.reversedAmount || 0));
    const currentNet = Math.max(0, Number((applied - reversed).toFixed(2)));

    let incApplied = 0;
    let incReversed = 0;
    if (targetNetPaid > currentNet + 0.009) {
      const delta = Number((targetNetPaid - currentNet).toFixed(2));
      const result = await this.applyPayment(companyId, updated.customerId, delta, `Pagamento Mercado Pago (#${paymentId})`, paidAt || undefined);
      incApplied = Number(result.amount || 0);
    }
    if (targetNetPaid + 0.009 < currentNet) {
      const delta = Number((currentNet - targetNetPaid).toFixed(2));
      const result = await this.reversePayment(companyId, updated.customerId, delta, `Estorno Mercado Pago (#${paymentId})`, refundedAt || undefined);
      incReversed = Number(result.amount || 0);
    }
    if (incApplied > 0 || incReversed > 0) {
      updated = await this.prisma.hbxRecoveryPayment.update({
        where: { id: updated.id },
        data: {
          appliedToCustomerAmount: Number((Number(updated.appliedToCustomerAmount || 0) + incApplied).toFixed(2)),
          reversedAmount: Number((Number(updated.reversedAmount || 0) + incReversed).toFixed(2)),
        },
        include: { customer: true },
      });
    }

    const isPaidNow =
      this.normalizeLifecycle(String(updated.lifecycle || updated.status || 'in_progress')) === 'paid';
    if (!wasPaidBefore && isPaidNow && targetNetPaid > 0.009) {
      await this.notifyApprovedPayment(companyId, updated);
    }
    return { updated: true, status, payment: this.toPaymentItem(updated) };
  }

  async listCustomers(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const rows = await this.prisma.hbxRecoveryCustomer.findMany({ where: { companyId }, orderBy: [{ openAmount: 'desc' }, { updatedAt: 'desc' }] });
    return rows.map((row) => this.toCustomerResponse(row));
  }

  async listFlowStages(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    await this.ensureDefaultFlowStages(companyId);
    const rows = await this.prisma.hbxRecoveryFlowStage.findMany({
      where: this.recoveryFlowStageWhere(companyId),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title || ''),
      channel: String(row.channel || 'WhatsApp API'),
      template: String(row.template || ''),
      daysAfter: Number(row.daysAfter || 0),
      enabled: Boolean(row.enabled),
      sortOrder: Number(row.sortOrder || 0),
    }));
  }

  async getBotConfig(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    await this.ensureDefaultFlowStages(companyId);
    return this.getRecoveryBotConfig(companyId);
  }

  async updateBotConfig(user: any, dto: UpdateRecoveryBotConfigDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    await this.ensureDefaultFlowStages(companyId);
    return this.saveRecoveryBotConfig(companyId, dto || {});
  }

  async createFlowStage(user: any, dto: CreateRecoveryFlowStageDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    await this.ensureDefaultFlowStages(companyId);
    const count = await this.prisma.hbxRecoveryFlowStage.count({
      where: this.recoveryFlowStageWhere(companyId),
    });
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.hbxRecoveryFlowStage.updateMany({
        where: this.recoveryFlowStageWhere(companyId),
        data: { sortOrder: { increment: 1 } },
      });
      return tx.hbxRecoveryFlowStage.create({
        data: {
          companyId,
          title: String(dto.title || '').trim() || `Nova etapa ${count + 1}`,
          channel: String(dto.channel || '').trim() || 'WhatsApp API',
          template: String(dto.template || '').trim() || 'Mensagem da etapa de cobranca.',
          daysAfter: Math.max(0, Math.min(365, Number(dto.daysAfter || 0))),
          enabled: typeof dto.enabled === 'boolean' ? dto.enabled : true,
          sortOrder: 1,
        },
      });
    });
    return { ...created, id: String(created.id) };
  }

  async updateFlowStage(user: any, id: string, dto: UpdateRecoveryFlowStageDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const row = await this.prisma.hbxRecoveryFlowStage.findFirst({
      where: {
        id: String(id),
        ...this.recoveryFlowStageWhere(companyId),
      },
    });
    if (!row) throw new NotFoundException('Etapa de fluxo nao encontrada');
    const data: any = {};
    if (dto.title !== undefined) data.title = String(dto.title || '').trim() || row.title;
    if (dto.channel !== undefined) data.channel = String(dto.channel || '').trim() || 'WhatsApp API';
    if (dto.template !== undefined) data.template = String(dto.template || '').trim() || row.template;
    if (dto.daysAfter !== undefined) data.daysAfter = Math.max(0, Math.min(365, Number(dto.daysAfter)));
    if (dto.enabled !== undefined) data.enabled = Boolean(dto.enabled);
    if (dto.sortOrder !== undefined) data.sortOrder = Math.max(0, Number(dto.sortOrder || 0));
    const updated = await this.prisma.hbxRecoveryFlowStage.update({ where: { id: row.id }, data });
    return { ...updated, id: String(updated.id) };
  }

  async deleteFlowStage(user: any, id: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const row = await this.prisma.hbxRecoveryFlowStage.findFirst({
      where: {
        id: String(id),
        ...this.recoveryFlowStageWhere(companyId),
      },
    });
    if (!row) throw new NotFoundException('Etapa de fluxo nao encontrada');
    await this.prisma.$transaction(async (tx) => {
      await tx.hbxRecoveryFlowStage.delete({ where: { id: row.id } });
      const remaining = await tx.hbxRecoveryFlowStage.findMany({
        where: this.recoveryFlowStageWhere(companyId),
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      for (let i = 0; i < remaining.length; i += 1) {
        await tx.hbxRecoveryFlowStage.update({
          where: { id: remaining[i].id },
          data: { sortOrder: i + 1 },
        });
      }
    });
    return { ok: true, deletedId: row.id };
  }
  async createCustomer(user: any, dto: CreateRecoveryCustomerDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const name = this.requireText(dto.name, 'name');
    const clientName = String(dto.clientName || '').trim();
    const whatsappNumber = this.normalizeWhatsAppNumber(dto.whatsappNumber);
    const openAmount = Number(dto.openAmount || 0);
    const registrationDate = this.parseRegistrationDate(dto.registrationDate);
    const workdaySaleDayRaw = Number(dto.workdaySaleDay || 0);
    const workdaySaleDay = Number.isFinite(workdaySaleDayRaw) && workdaySaleDayRaw >= 1 && workdaySaleDayRaw <= 31
      ? Math.round(workdaySaleDayRaw)
      : registrationDate.getDate();
    const recurringDelaysRaw = Number(dto.recurringDelays || 0);
    const recurringDelays = Number.isFinite(recurringDelaysRaw) ? Math.max(0, recurringDelaysRaw) : 0;
    if (workdaySaleDay < 1 || workdaySaleDay > 31) throw new BadRequestException('Dia do registro deve estar entre 1 e 31.');
    const created = await this.prisma.hbxRecoveryCustomer.create({
      data: {
        companyId,
        name,
        clientName: clientName || null,
        whatsappNumber,
        openAmount,
        workdaySaleDay,
        recurringDelays,
        paymentHistoryScore: typeof dto.paymentHistoryScore === 'number' ? Math.max(1, Math.min(10, Math.round(dto.paymentHistoryScore))) : Math.max(1, Math.min(10, 8 - recurringDelays)),
        totalPaid: typeof dto.totalPaid === 'number' ? Math.max(0, dto.totalPaid) : 0,
        averageDelay: typeof dto.averageDelay === 'number' ? Math.max(0, dto.averageDelay) : Math.max(1, Number((workdaySaleDay / 2).toFixed(1))),
        automationEnabled: true,
        lastContact: String(dto.lastContact || '').trim() || 'Nunca',
        status: this.toDbStatus(openAmount > 0 ? 'overdue' : 'paid'),
        paymentHistory: this.json([]),
        delayHistory: this.json([{ id: `delay-${Date.now().toString(36)}`, period: 'Atual', daysLate: 0, outcome: 'Cadastro manual' }]),
        createdAt: registrationDate,
      },
    });
    return this.toCustomerResponse(created);
  }

  async importCustomers(user: any, rows: Array<Record<string, any>> | undefined) {
    const companyId = this.requireCompanyIdFromUser(user);
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      throw new BadRequestException('Nenhuma linha para importar.');
    }
    if (list.length > 1000) {
      throw new BadRequestException('Limite de importacao: 1000 linhas por envio.');
    }

    const created: any[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let index = 0; index < list.length; index += 1) {
      const row = list[index] || {};
      try {
        const result = await this.createCustomer(
          { ...user, companyId },
          {
            name: String(row.name || row.empresa || '').trim(),
            clientName: String(row.clientName || row.cliente || '').trim(),
            whatsappNumber: String(row.whatsappNumber || row.whatsapp || row.telefone || '').trim(),
            openAmount: Number(row.openAmount || row.valor || 0),
            registrationDate: String(row.registrationDate || row.diaRegistro || row.data || '').trim(),
            recurringDelays: 0,
          } as CreateRecoveryCustomerDto,
        );
        created.push(result);
      } catch (error: any) {
        errors.push({ row: index + 1, error: String(error?.message || 'Erro ao importar linha') });
      }
    }

    return {
      totalRows: list.length,
      importedRows: created.length,
      failedRows: errors.length,
      errors,
      customers: created,
    };
  }

  async updateCustomerAutomation(user: any, customerId: string, enabledRaw?: boolean) {
    const companyId = this.requireCompanyIdFromUser(user);
    if (typeof enabledRaw !== 'boolean') {
      throw new BadRequestException('Informe se a cobranca automatica ficara ativa ou pausada.');
    }
    const customer = await this.findCustomer(companyId, customerId);
    const updated = await this.prisma.hbxRecoveryCustomer.update({
      where: { id: customer.id },
      data: { automationEnabled: enabledRaw },
    });
    return {
      ok: true,
      updatedCount: 1,
      customer: this.toCustomerResponse(updated),
    };
  }

  async updateCustomersAutomationBatch(user: any, customerIdsRaw?: string[], enabledRaw?: boolean) {
    const companyId = this.requireCompanyIdFromUser(user);
    if (typeof enabledRaw !== 'boolean') {
      throw new BadRequestException('Informe se a cobranca automatica ficara ativa ou pausada.');
    }
    const customerIds = Array.isArray(customerIdsRaw)
      ? customerIdsRaw
          .map((item) => String(item || '').trim())
          .filter((item) => item.length > 0)
      : [];
    if (!customerIds.length) {
      throw new BadRequestException('Selecione pelo menos um cliente para a atualizacao em lote.');
    }

    const result = await this.prisma.hbxRecoveryCustomer.updateMany({
      where: {
        companyId,
        id: { in: customerIds },
      },
      data: { automationEnabled: enabledRaw },
    });
    const updatedCustomers = await this.prisma.hbxRecoveryCustomer.findMany({
      where: {
        companyId,
        id: { in: customerIds },
      },
      orderBy: [{ openAmount: 'desc' }, { updatedAt: 'desc' }],
    });
    return {
      ok: true,
      updatedCount: Number(result.count || 0),
      customers: updatedCustomers.map((item) => this.toCustomerResponse(item)),
    };
  }

  async markPaid(user: any, id: string, amountRaw?: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const row = await this.findCustomer(companyId, id);
    if (Number(row.openAmount || 0) <= 0) return { changed: false, paidAmount: 0, customer: this.toCustomerResponse(row) };
    const desired = typeof amountRaw === 'number' && Number.isFinite(amountRaw) ? Number(amountRaw) : Number(row.openAmount || 0);
    const result = await this.applyPayment(companyId, id, desired, 'Quitacao manual pelo operador');
    return { changed: Boolean(result.changed), paidAmount: Number(result.amount || 0), customer: this.toCustomerResponse(result.customer) };
  }

  async sendPaymentLink(
    user: any,
    customerId: string,
    amountRaw?: number,
    options?: { targetPhone?: string | null; conversationId?: number | null },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const customer = await this.findCustomer(companyId, customerId);
    const targetPhone = String(options?.targetPhone || customer.whatsappNumber || '').trim();
    const interactionConversationId = Number(options?.conversationId || 0) || null;
    const openAmount = Number(customer.openAmount || 0);
    if (openAmount <= 0) throw new BadRequestException('Cliente sem valor em aberto no HBX Recovery.');
    const amount = Number(Math.max(0.5, Math.min(openAmount, typeof amountRaw === 'number' && Number.isFinite(amountRaw) ? amountRaw : openAmount)).toFixed(2));
    const { accessToken, company } = await this.mercadoPagoCredentials(companyId);
    const notificationUrl = `${this.publicApiBaseUrl()}/webhooks/mercadopago?company_id=${companyId}`;
    const externalReference = `hbx-recovery-${companyId}-${customer.id}-${Date.now()}`;

    const payment = await this.prisma.hbxRecoveryPayment.create({
      data: {
        companyId,
        customerId: customer.id,
        conversationId: null,
        amount,
        currency: 'BRL',
        description: `HBX Recovery - ${customer.name}`,
        chargeType: 'avista',
        installmentCount: 1,
        installmentValue: amount,
        serviceDate: customer?.createdAt ? new Date(customer.createdAt) : null,
        serviceDescription: 'Regularizacao de pendencia financeira',
        status: 'preparing',
        lifecycle: 'in_progress',
        externalReference,
        notificationUrl,
        createdByUserId: Number(user?.id || 0) || null,
      },
      include: { customer: true },
    });

    try {
      const preference = await this.mercadoPagoClient.createPreference(
        accessToken,
        {
          external_reference: externalReference,
          notification_url: notificationUrl,
          metadata: { company_id: companyId, recovery_customer_id: customer.id, payment_request_id: payment.id },
          payer: { name: customer.name, phone: { number: String(customer.whatsappNumber || '').replace(/\D/g, '') } },
          items: [{ id: customer.id, title: `Cobranca HBX Recovery - ${customer.name}`, description: 'Regularizacao de pendencia', quantity: 1, unit_price: amount, currency_id: 'BRL' }],
          expires: true,
          date_of_expiration: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        randomUUID(),
      );

      const paymentUrl = String(preference?.init_point || preference?.sandbox_init_point || '').trim();
      if (!paymentUrl) throw new Error('Mercado Pago nao retornou URL da cobranca.');

      const updated = await this.prisma.hbxRecoveryPayment.update({
        where: { id: payment.id },
        data: {
          status: 'pending',
          lifecycle: 'in_progress',
          mpPreferenceId: preference?.id ? String(preference.id) : null,
          paymentUrl,
          linkExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          providerPayload: this.json({ preference }),
        },
        include: { customer: true },
      });

      const body = `Oi ${customer.clientName || customer.name}, segue seu link de pagamento para regularizacao no HBX Recovery: ${paymentUrl}`;
      const queued = await this.queueRecoveryWithFallback(companyId, targetPhone, body, customer.id);
      const botConfig = await this.getRecoveryBotConfig(companyId);
      const vars = this.buildRecoveryTemplateVars(String(company?.name || ''), customer);
      await this.conversations
        .queueOutboundForCompany(companyId, {
          conversationId: interactionConversationId || undefined,
          to: targetPhone,
          contactId: customer.id,
          body: 'Menu HBX Recovery',
          messageType: 'interactive',
          interactivePayload: {
            ...this.recoveryRootInteractivePayload(botConfig),
            body: {
              text: this.renderRecoveryTemplate(botConfig.rootPrompt, vars),
            },
          },
          sourceModule: 'hbx_recovery_bot',
        })
        .catch(() => undefined);

      await this.prisma.hbxRecoveryCustomer.update({ where: { id: customer.id }, data: { lastContact: `Link enviado em ${this.dateLabelPtBR(new Date())}` } });
      return { ok: true, queued, payment: this.toPaymentItem(updated) };
    } catch (error: any) {
      const reason = String(error?.message || 'Falha ao gerar link de pagamento');
      await this.prisma.hbxRecoveryPayment.update({ where: { id: payment.id }, data: { status: 'failed', lifecycle: 'cancelled', providerPayload: this.json({ error: reason }) } });
      throw new BadRequestException(`Falha ao gerar link de pagamento: ${reason}`);
    }
  }

  async startTemplateFlow(user: any, customerId: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const customer = await this.findCustomer(companyId, customerId);
    if (customer.automationEnabled === false) {
      throw new BadRequestException(
        'A cobranca automatica deste cliente esta pausada. Reative na tabela de inadimplentes antes de enviar o template inicial.',
      );
    }
    const botConfig = await this.getRecoveryBotConfig(companyId);
    const selectedTemplate = await this.resolveRecoveryStartTemplate(companyId, botConfig);
    this.assertRecoveryStartTemplateCompatible(selectedTemplate);
    const templateName = String(selectedTemplate.name || '').trim();
    const templateLanguage = String(selectedTemplate.language || 'pt_BR').trim() || 'pt_BR';
    if (this.isMetaMediaHeaderFormat(selectedTemplate.headerFormat)) {
      this.assertTemplateHeaderMediaUrlIsPublic(
        templateName,
        this.resolveTemplateHeaderMediaUrl(selectedTemplate),
      );
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const operatorName = await this.getRecoveryOperatorName(user);
    const conversation = await this.conversations.getOrCreateConversationForContact(
      companyId,
      customer.whatsappNumber,
      {
        currentFlow: 'cobranca_recovery_whatsapp_hibrido',
        currentStep: 'aguardando_resposta_template',
        botActive: true,
        humanAssigned: false,
        flowResult: null,
        metadata: {
          cliente: customer.clientName || customer.name,
          empresa: String(company?.name || ''),
          funcionario: operatorName,
          data_servico: customer?.createdAt
            ? new Date(customer.createdAt).toLocaleDateString('pt-BR')
            : new Date().toLocaleDateString('pt-BR'),
        },
      },
    );

    const queued = await this.conversations.queueOutboundForCompany(companyId, {
      to: customer.whatsappNumber,
      contactId: customer.id,
      body: 'Template inicial HBX Recovery',
      messageType: 'template',
      templateName,
      templateLanguage,
      templateComponents: this.buildRecoveryInitialTemplateComponents(
        String(company?.name || 'HBX Recovery'),
        customer,
        selectedTemplate,
        operatorName,
      ),
      sourceModule: 'hbx_recovery_bot',
      senderType: 'bot',
      flowState: {
        currentFlow: 'cobranca_recovery_whatsapp_hibrido',
        currentStep: 'aguardando_resposta_template',
        botActive: true,
        humanAssigned: false,
      },
      variables: {
        empresa: String(company?.name || ''),
        funcionario: operatorName,
        cliente: customer.clientName || customer.name,
        data_servico: customer?.createdAt
          ? new Date(customer.createdAt).toLocaleDateString('pt-BR')
          : new Date().toLocaleDateString('pt-BR'),
      },
    });
    const queuedCustomer = await this.prisma.hbxRecoveryCustomer.update({
      where: { id: customer.id },
      data: { lastContact: `Template inicial na fila em ${this.dateLabelPtBR(new Date())}` },
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: 'Template inicial de cobranca enfileirado.',
      eventType: 'template_start',
      sourceModule: 'hbx_recovery_bot',
    });
    return {
      ok: true,
      conversationId: conversation.id,
      queued,
      customer: this.toCustomerResponse(queuedCustomer),
      template: { name: templateName, language: templateLanguage },
    };
  }

  async getInteractionState(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const payment = await this.prisma.hbxRecoveryPayment.findFirst({
      where: { companyId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      conversationId: conversation.id,
      companyId,
      customerId: customer.id,
      botActive: Boolean((conversation as any).botActive),
      humanAssigned: Boolean((conversation as any).humanAssigned),
      assignedUserId: (conversation as any).assignedUserId || null,
      currentFlow: (conversation as any).currentFlow || null,
      currentStep: (conversation as any).currentStep || null,
      flowResult: (conversation as any).flowResult || null,
      metadata: this.parseConversationMetadata((conversation as any).metadata),
      lastInteractionAt: (conversation as any).lastInteractionAt
        ? new Date((conversation as any).lastInteractionAt).toISOString()
        : null,
      customer: this.toCustomerResponse(customer),
      latestPayment: payment ? this.toPaymentItem(payment) : null,
    };
  }

  async assignHumanAgent(user: any, conversationId: number, assignedUserIdRaw?: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const assignedUserId =
      Number(assignedUserIdRaw || 0) > 0 ? Number(assignedUserIdRaw) : Number(user?.id || 0) || null;
    const updated = await this.conversations.updateConversationState(companyId, conversation.id, {
      currentFlow: 'cobranca_recovery_whatsapp_hibrido',
      currentStep: 'atendimento_humano',
      botActive: false,
      humanAssigned: true,
      assignedUserId,
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: 'Atendimento assumido por operador humano.',
      eventType: 'human_assigned',
      sourceModule: 'hbx_recovery_human',
      variables: { assignedUserId },
    });
    return { ok: true, conversation: updated };
  }

  async pauseBotFlow(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const updated = await this.conversations.updateConversationState(companyId, conversation.id, {
      currentFlow: 'cobranca_recovery_whatsapp_hibrido',
      currentStep: 'atendimento_humano',
      botActive: false,
      humanAssigned: true,
      assignedUserId: Number(user?.id || 0) || null,
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: 'BOT pausado manualmente pelo operador.',
      eventType: 'bot_paused',
      sourceModule: 'hbx_recovery_human',
    });
    return { ok: true, conversation: updated };
  }

  private async hasRecentInboundInConversation(companyId: number, conversationId: number) {
    const lastInbound = await this.prisma.companyMessage.findFirst({
      where: { companyId, conversationId, direction: 'INBOUND' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    if (!lastInbound?.timestamp) return false;
    return Date.now() - new Date(lastInbound.timestamp).getTime() <= 24 * 60 * 60 * 1000;
  }

  async resumeBotFlow(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const hasRecentInbound = await this.hasRecentInboundInConversation(companyId, conversation.id);
    const updated = await this.conversations.updateConversationState(companyId, conversation.id, {
      currentFlow: 'cobranca_recovery_whatsapp_hibrido',
      currentStep: 'cobranca_menu_principal',
      botActive: true,
      humanAssigned: false,
      assignedUserId: null,
      flowResult: null,
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: hasRecentInbound
        ? 'BOT reativado manualmente pelo operador.'
        : 'BOT reativado manualmente pelo operador. Nenhuma mensagem foi enviada porque a conversa esta fora da janela de 24h; a proxima resposta do cliente retomara o fluxo automaticamente.',
      eventType: 'bot_resumed',
      sourceModule: 'hbx_recovery_bot',
      variables: { hasRecentInbound },
    });
    return { ok: true, conversation: updated, resumedWithoutOutbound: !hasRecentInbound };
  }

  async sendInteractionHumanMessage(user: any, conversationId: number, bodyRaw: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const targetPhone = this.getInteractionContactTarget(conversation, customer);
    const body = String(bodyRaw || '').trim();
    if (!body) {
      throw new BadRequestException('Digite uma mensagem para enviar ao cliente.');
    }
    const queued = await this.conversations.queueOutboundForCompany(companyId, {
      conversationId: conversation.id,
      to: targetPhone,
      contactId: customer.id,
      body,
      messageType: 'text',
      sourceModule: 'hbx_recovery_human',
      senderType: 'human',
      flowState: {
        currentFlow: 'cobranca_recovery_whatsapp_hibrido',
        currentStep: 'atendimento_humano',
        botActive: false,
        humanAssigned: true,
        assignedUserId: Number(user?.id || 0) || null,
      },
    });
    return { ok: true, queued };
  }

  async generateInteractionLink(
    user: any,
    conversationId: number,
    dto: { mode?: 'avista' | 'parcelado'; installments?: number; amount?: number },
  ) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const targetPhone = this.getInteractionContactTarget(conversation, customer);
    const mode = String(dto?.mode || 'avista').trim().toLowerCase() === 'parcelado' ? 'parcelado' : 'avista';
    const installments = Math.max(1, Math.min(12, Number(dto?.installments || 1)));
    const openAmount = Number(customer.openAmount || 0);
    const interestPct = Math.max(0, Number(process.env.HBX_RECOVERY_INSTALLMENT_INTEREST_PCT || 0));
    const totalAmount =
      mode === 'parcelado'
        ? Number((openAmount * (1 + interestPct / 100)).toFixed(2))
        : Number((typeof dto?.amount === 'number' ? dto.amount : openAmount).toFixed(2));
    const result = await this.sendPaymentLink(user, customer.id, totalAmount, {
      targetPhone,
      conversationId: conversation.id,
    });
    if (result?.payment?.id) {
      await this.prisma.hbxRecoveryPayment.update({
        where: { id: String(result.payment.id) },
        data: {
          conversationId: conversation.id,
          chargeType: mode,
          installmentCount: mode === 'parcelado' ? installments : 1,
          installmentValue:
            mode === 'parcelado' ? Number((totalAmount / Math.max(1, installments)).toFixed(2)) : totalAmount,
          linkExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
      });
    }
    await this.conversations.updateConversationState(companyId, conversation.id, {
      currentFlow: 'cobranca_recovery_whatsapp_hibrido',
      currentStep: 'aguardando_pagamento',
      botActive: false,
      humanAssigned: true,
      assignedUserId: Number(user?.id || 0) || null,
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text:
        mode === 'parcelado'
          ? `Link parcelado gerado manualmente em ${installments}x.`
          : 'Link a vista gerado manualmente.',
      eventType: 'operator_link_generated',
      sourceModule: 'hbx_recovery_human',
      variables: { mode, installments, totalAmount },
    });
    return { ok: true, mode, installments, totalAmount, ...result };
  }

  async resendLastInteractionLink(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const targetPhone = this.getInteractionContactTarget(conversation, customer);
    const payment = await this.prisma.hbxRecoveryPayment.findFirst({
      where: { companyId, customerId: customer.id, paymentUrl: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment?.paymentUrl) throw new BadRequestException('Nenhum link de pagamento encontrado para reenviar.');
    const body = `Reenvio do seu link de pagamento:\n${payment.paymentUrl}`;
    const queued = await this.conversations.queueOutboundForCompany(companyId, {
      conversationId: conversation.id,
      to: targetPhone,
      contactId: customer.id,
      body,
      messageType: 'text',
      sourceModule: 'hbx_recovery_human',
      senderType: 'human',
      flowState: {
        currentFlow: 'cobranca_recovery_whatsapp_hibrido',
        currentStep: 'aguardando_pagamento',
        botActive: false,
        humanAssigned: true,
        assignedUserId: Number(user?.id || 0) || null,
      },
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: 'Operador reenviou o ultimo link de pagamento.',
      eventType: 'operator_link_resent',
      sourceModule: 'hbx_recovery_human',
      variables: { paymentId: payment.id },
    });
    return { ok: true, queued, payment: this.toPaymentItem(payment) };
  }

  async requestPaymentProof(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const targetPhone = this.getInteractionContactTarget(conversation, customer);
    const queued = await this.conversations.queueOutboundForCompany(companyId, {
      conversationId: conversation.id,
      to: targetPhone,
      contactId: customer.id,
      body: 'Pode enviar o comprovante de pagamento por aqui para validarmos?',
      messageType: 'text',
      sourceModule: 'hbx_recovery_human',
      senderType: 'human',
      flowState: {
        currentFlow: 'cobranca_recovery_whatsapp_hibrido',
        currentStep: 'atendimento_humano',
        botActive: false,
        humanAssigned: true,
        assignedUserId: Number(user?.id || 0) || null,
      },
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: 'Operador solicitou comprovante de pagamento.',
      eventType: 'request_payment_proof',
      sourceModule: 'hbx_recovery_human',
    });
    return { ok: true, queued };
  }

  async addInternalNote(user: any, conversationId: number, noteRaw: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const note = String(noteRaw || '').trim();
    if (note.length < 2) {
      throw new BadRequestException('A nota interna precisa ter pelo menos 2 caracteres.');
    }
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: `Nota interna: ${note}`,
      eventType: 'internal_note',
      sourceModule: 'hbx_recovery_internal',
      variables: {
        note,
        authorUserId: Number(user?.id || 0) || null,
      },
    });
    return { ok: true, note };
  }

  async markInteractionPaid(user: any, conversationId: number, amountRaw?: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const marked = await this.markPaid(user, customer.id, amountRaw);
    await this.conversations.updateConversationState(companyId, conversation.id, {
      currentFlow: 'cobranca_recovery_whatsapp_hibrido',
      currentStep: 'encerrado',
      flowResult: 'paid_manual',
      botActive: false,
      humanAssigned: false,
      assignedUserId: Number(user?.id || 0) || null,
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: 'Pagamento marcado manualmente pelo operador.',
      eventType: 'paid_manual',
      sourceModule: 'hbx_recovery_human',
      variables: { amount: amountRaw || null },
    });
    return { ok: true, marked };
  }

  async closeInteraction(user: any, conversationId: number, resultRaw?: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const { conversation, customer } = await this.getInteractionContext(companyId, conversationId);
    const result = String(resultRaw || 'encerrado').trim() || 'encerrado';
    const updated = await this.conversations.updateConversationState(companyId, conversation.id, {
      currentFlow: 'cobranca_recovery_whatsapp_hibrido',
      currentStep: 'encerrado',
      flowResult: result,
      botActive: false,
      humanAssigned: false,
      assignedUserId: Number(user?.id || 0) || null,
    });
    await this.appendInteractionEvent({
      companyId,
      conversationId: conversation.id,
      contactId: customer.id,
      text: `Atendimento encerrado pelo operador (${result}).`,
      eventType: 'interaction_closed',
      sourceModule: 'hbx_recovery_human',
      variables: { result },
    });
    return { ok: true, conversation: updated };
  }

  async listPayments(user: any, query: ListRecoveryPaymentsDto) {
    const companyId = this.requireCompanyIdFromUser(user);
    const now = new Date();
    const month = /^\d{4}-\d{2}$/.test(String(query?.month || '').trim()) ? String(query.month) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [yearStr, monthStr] = month.split('-');
    const start = new Date(Number(yearStr), Number(monthStr) - 1, 1, 0, 0, 0, 0);
    const end = new Date(Number(yearStr), Number(monthStr), 1, 0, 0, 0, 0);
    const lifecycle = String(query?.lifecycle || 'in_progress') as PaymentLifecycle | 'all';

    const rows = await this.prisma.hbxRecoveryPayment.findMany({
      where: { companyId, createdAt: { gte: start, lt: end } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { customer: { select: { id: true, name: true, whatsappNumber: true } } },
    });

    const all = rows.map((row) => this.toPaymentItem(row));
    const records = lifecycle === 'all' ? all : all.filter((row) => row.lifecycle === lifecycle);
    const paid = all.filter((row) => row.lifecycle === 'paid');
    const approvedAmount = Number(paid.reduce((sum, row) => sum + Math.max(0, row.amount - Number(row.refundAmount || 0)), 0).toFixed(2));
    const commissionAmount = Number(((approvedAmount * COMMISSION_PERCENT) / 100).toFixed(2));
    const pendingAmount = Number(all.filter((row) => row.lifecycle === 'in_progress').reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2));

    return {
      month,
      monthLabel: start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      lifecycleFilter: lifecycle,
      counters: {
        paid: all.filter((row) => row.lifecycle === 'paid').length,
        in_progress: all.filter((row) => row.lifecycle === 'in_progress').length,
        finalized: all.filter((row) => row.lifecycle === 'finalized').length,
        cancelled: all.filter((row) => row.lifecycle === 'cancelled').length,
      },
      totals: {
        totalApprovedAmount: approvedAmount,
        totalCommissionAmount: commissionAmount,
        totalApprovedCount: paid.length,
        pendingCount: all.filter((row) => row.lifecycle === 'in_progress').length,
      },
      billing: {
        pendingAmount,
        grossAmount: approvedAmount,
        commissionAmount,
        netAmount: Number((approvedAmount - commissionAmount).toFixed(2)),
      },
      records,
    };
  }

  async listInteractions(user: any, queueRaw?: string) {
    const companyId = this.requireCompanyIdFromUser(user);
    const queue = String(queueRaw || 'all').trim().toLowerCase() === 'human' ? 'human' : 'all';

    const conversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        OR: [
          { currentFlow: 'cobranca_recovery_whatsapp_hibrido' },
          { currentFlow: 'cobranca_recovery' },
          { currentStep: { notIn: ['', 'novo'] } },
          { messages: { some: { sourceModule: { startsWith: 'hbx_recovery' } } } },
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 300,
    });

    if (!conversations.length) {
      return { queue, pendingHumanCount: 0, conversations: [] };
    }

    const conversationIds = conversations.map((item) => item.id);
    const messages = await this.prisma.companyMessage.findMany({
      where: { companyId, conversationId: { in: conversationIds } },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: 2000,
    });
    const resolvedCustomers = await Promise.all(
      conversations.map(async (conversation) => ({
        conversationId: conversation.id,
        customer: await this.resolveRecoveryCustomerForConversation(conversation, companyId),
      })),
    );
    const customerByConversationId = new Map(
      resolvedCustomers
        .filter((entry) => Boolean(entry.customer))
        .map((entry) => [entry.conversationId, entry.customer]),
    );
    const customerIds = [...new Set(resolvedCustomers.map((entry) => entry.customer?.id).filter(Boolean))] as string[];
    const payments = await this.prisma.hbxRecoveryPayment.findMany({
      where: { companyId, customerId: { in: customerIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });

    const latestPaymentByCustomer = new Map<string, any>();
    for (const payment of payments) {
      if (!latestPaymentByCustomer.has(payment.customerId)) {
        latestPaymentByCustomer.set(payment.customerId, payment);
      }
    }

    const latestByConversation = new Map<number, any>();
    const complaintCountByConversation = new Map<number, number>();

    for (const message of messages) {
      if (!latestByConversation.has(message.conversationId)) {
        latestByConversation.set(message.conversationId, message);
      }
      if (message.isComplaint) {
        complaintCountByConversation.set(
          message.conversationId,
          Number(complaintCountByConversation.get(message.conversationId) || 0) + 1,
        );
      }
    }
    const items = conversations
      .map((conversation) => {
        const customer = customerByConversationId.get(conversation.id) || null;
        if (!customer) return null;
        const latest = latestByConversation.get(conversation.id);
        const complaintCount = Number(complaintCountByConversation.get(conversation.id) || 0);
        const latestPayment = latestPaymentByCustomer.get(customer.id);
        const conversationMeta = this.parseConversationMetadata((conversation as any).metadata);
        const humanAssigned = Boolean((conversation as any).humanAssigned);
        const botActive = Boolean((conversation as any).botActive);
        return {
          conversationId: conversation.id,
          customerId: customer.id,
          customerName: customer.name,
          customerWhatsapp: customer.whatsappNumber,
          conversationWhatsapp: String(conversation.contact || ''),
          customerStatus: String(customer.status || '').toUpperCase(),
          openAmount: Number(customer.openAmount || 0),
          lastContact: customer.lastContact || 'Nunca',
          humanQueue: humanAssigned || complaintCount > 0,
          botActive,
          humanAssigned,
          assignedUserId: (conversation as any).assignedUserId || null,
          currentFlow: String((conversation as any).currentFlow || ''),
          currentStep: String((conversation as any).currentStep || ''),
          flowResult: (conversation as any).flowResult ? String((conversation as any).flowResult) : null,
          metadata: conversationMeta,
          complaintCount,
          lastMessage: latest ? String(latest.body || '') : '',
          lastDirection: latest ? String(latest.direction || '') : '',
          lastSourceModule: latest ? String(latest.sourceModule || '') : '',
          lastAt: latest?.timestamp ? new Date(latest.timestamp).toISOString() : conversation.lastMessageAt.toISOString(),
          lastInteractionAt: (conversation as any).lastInteractionAt
            ? new Date((conversation as any).lastInteractionAt).toISOString()
            : null,
          paymentGenerated: Boolean(latestPayment?.paymentUrl),
          paymentLifecycle: latestPayment ? this.normalizeLifecycle(String(latestPayment.lifecycle || latestPayment.status || 'in_progress')) : null,
          paymentStatus: latestPayment ? String(latestPayment.status || '') : null,
          paymentLink: latestPayment?.paymentUrl ? String(latestPayment.paymentUrl) : null,
          paymentLinkExpiresAt: latestPayment?.linkExpiresAt
            ? new Date(latestPayment.linkExpiresAt).toISOString()
            : null,
        };
      })
      .filter(Boolean) as any[];

    const filtered = queue === 'human' ? items.filter((item) => item.humanQueue) : items;
    const pendingHumanCount = items.filter((item) => item.humanQueue).length;

    return {
      queue,
      pendingHumanCount,
      conversations: filtered,
    };
  }

  async listInteractionMessages(user: any, conversationId: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: Number(conversationId), companyId, channel: 'whatsapp' },
    });
    if (!conversation) throw new NotFoundException('Conversa nao encontrada no HBX Recovery.');

    const recoveryCustomer = await this.resolveRecoveryCustomerForConversation(conversation, companyId);
    if (!recoveryCustomer) {
      throw new NotFoundException('Conversa fora da carteira de inadimplentes do HBX Recovery.');
    }

    const messages = await this.prisma.companyMessage.findMany({
      where: { companyId, conversationId: conversation.id },
      orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
      take: 300,
    });
    const latestPayment = await this.prisma.hbxRecoveryPayment.findFirst({
      where: { companyId, customerId: recoveryCustomer.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
      conversationId: conversation.id,
      botActive: Boolean((conversation as any).botActive),
      humanAssigned: Boolean((conversation as any).humanAssigned),
      assignedUserId: (conversation as any).assignedUserId || null,
      currentFlow: String((conversation as any).currentFlow || ''),
      currentStep: String((conversation as any).currentStep || ''),
      flowResult: (conversation as any).flowResult ? String((conversation as any).flowResult) : null,
      metadata: this.parseConversationMetadata((conversation as any).metadata),
      lastInteractionAt: (conversation as any).lastInteractionAt
        ? new Date((conversation as any).lastInteractionAt).toISOString()
        : null,
      customer: {
        id: recoveryCustomer.id,
        name: recoveryCustomer.name,
        whatsappNumber: recoveryCustomer.whatsappNumber,
        conversationWhatsapp: String(conversation.contact || ''),
        openAmount: Number(recoveryCustomer.openAmount || 0),
        status: String(recoveryCustomer.status || ''),
      },
      latestPayment: latestPayment ? this.toPaymentItem(latestPayment) : null,
      messages: messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        messageType: message.messageType,
        body: message.body,
        status: message.status,
        sourceModule: message.sourceModule || null,
        senderType: (message as any).senderType || null,
        variables: this.parseConversationMetadata((message as any).variablesJson),
        isComplaint: Boolean(message.isComplaint),
        timestamp: message.timestamp?.toISOString?.() || new Date(message.timestamp).toISOString(),
      })),
    };
  }

  async refundPayment(user: any, paymentId: string, amountRaw?: number) {
    const companyId = this.requireCompanyIdFromUser(user);
    const row = await this.prisma.hbxRecoveryPayment.findFirst({ where: { id: String(paymentId), companyId }, include: { customer: true } });
    if (!row) throw new NotFoundException('Cobranca nao encontrada para esta empresa.');
    const mpPaymentId = String(row.mpPaymentId || '').trim();
    if (!mpPaymentId) throw new BadRequestException('Cobranca ainda sem payment_id confirmado no Mercado Pago.');
    const refundable = Math.max(0, Number(row.amount || 0) - Number(row.refundAmount || 0));
    if (refundable <= 0) throw new BadRequestException('Nao ha valor disponivel para estorno.');
    const refundAmount = typeof amountRaw === 'number' && Number.isFinite(amountRaw) ? Number(Math.max(0.01, Math.min(refundable, amountRaw)).toFixed(2)) : undefined;
    const { accessToken } = await this.mercadoPagoCredentials(companyId);
    const refund = await this.mercadoPagoClient.refundPayment(accessToken, mpPaymentId, refundAmount);
    const synced = await this.syncMercadoPagoPayment(companyId, mpPaymentId, { source: 'refund', refund, paymentId });
    return { ok: true, refund, synced };
  }

  async processMercadoPagoWebhook(input: { companyId?: number; query: Record<string, any>; body: any }) {
    const companyId = Number(input?.companyId || 0);
    if (!companyId) return { processed: false, reason: 'company_id ausente no webhook.' };
    const paymentId = this.extractPaymentId(input?.query || {}, input?.body);
    if (!paymentId) return { processed: false, companyId, reason: 'payment_id ausente no webhook.' };
    try {
      const synced = await this.syncMercadoPagoPayment(companyId, paymentId, { source: 'webhook', query: input.query, body: input.body });
      return { processed: synced.updated, companyId, paymentId, status: synced.status };
    } catch (error: any) {
      return { processed: false, companyId, paymentId, reason: String(error?.message || 'Erro no webhook') };
    }
  }

  async clearCompanyCustomers(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    const [payments, customers] = await this.prisma.$transaction([
      this.prisma.hbxRecoveryPayment.deleteMany({ where: { companyId } }),
      this.prisma.hbxRecoveryCustomer.deleteMany({ where: { companyId } }),
    ]);
    return { companyId, deletedCount: customers.count, deletedPayments: payments.count };
  }

  async resetAndSeedCompanyCustomers(user: any) {
    const companyId = this.requireCompanyIdFromUser(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.hbxRecoveryPayment.deleteMany({ where: { companyId } });
      await tx.hbxRecoveryCustomer.deleteMany({ where: { companyId } });
      for (const seed of DEFAULT_RECOVERY_SEED) {
        await tx.hbxRecoveryCustomer.create({
          data: {
            companyId,
            name: seed.name,
            whatsappNumber: seed.whatsappNumber,
            openAmount: seed.openAmount,
            workdaySaleDay: seed.workdaySaleDay,
            recurringDelays: seed.recurringDelays,
            paymentHistoryScore: seed.paymentHistoryScore,
            totalPaid: seed.totalPaid,
            averageDelay: seed.averageDelay,
            automationEnabled: true,
            lastContact: seed.lastContact,
            status: this.toDbStatus(seed.openAmount > 0 ? 'overdue' : 'paid'),
            paymentHistory: this.json([]),
            delayHistory: this.json([{ id: `seed-delay-${Date.now().toString(36)}`, period: 'Seed inicial', daysLate: seed.openAmount > 0 ? Math.max(1, Math.round(seed.averageDelay)) : 0, outcome: seed.openAmount > 0 ? 'Em cobranca' : 'Quitado' }]),
          },
        });
      }
    });

    const rows = await this.prisma.hbxRecoveryCustomer.findMany({ where: { companyId }, orderBy: [{ openAmount: 'desc' }, { id: 'asc' }] });
    return {
      companyId,
      seededCount: rows.length,
      overdueCount: rows.filter((row) => Number(row.openAmount || 0) > 0).length,
      paidCount: rows.filter((row) => Number(row.openAmount || 0) <= 0).length,
      customers: rows.map((row) => this.toCustomerResponse(row)),
    };
  }
}
