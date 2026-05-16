import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';
import { InboxService } from '../inbox/inbox.service';
import { CommercialPlansService } from '../commercial-plans/commercial-plans.service';
import { CommercialUsageLimitsService } from '../commercial-plans/commercial-usage-limits.service';
import {
  COMMERCIAL_PLAN_KEYS,
  getCommercialPlanCapabilities,
  getCommercialPlanTier,
  normalizeCommercialPlanKey,
  resolveCommercialPlanKeyForCapabilities,
  type CommercialPlanCapabilities,
  type CommercialPlanTier,
} from '../commercial-plans/commercial-plan-catalog';
import { HbxPresentationEmailService } from '../mail/hbx-presentation-email.service';
import { ConversationsService } from '../messaging/conversations.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { buildWhatsAppPhoneCandidates } from '../messaging/whatsapp-channel';
import { PrismaService } from '../prisma/prisma.service';
import {
  MASTER_WHATSAPP_ENGINE_COMPANY_NAME,
  MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
} from '../companies/master-whatsapp-company.constants';
import { buildImportacaoPermissaoRows } from '../bootstrap/company-structural-defaults';
import { calculateLeadQualityV2, type LeadQualityV2, type LeadQualityV2SalesProfile } from '../webscraping/lead-quality-v2';
import {
  BulkDeleteVendasLeadsDto,
  CreateManualVendasLeadDto,
  ImportWebscrapingLeadsDto,
  ReportVendasLeadDto,
  UpdateSalesProfileDto,
  UpdateVendasLeadDto,
} from './dto/vendas.dto';
import { buildVendasLeadIntelligence } from './vendas-lead-enrichment';

type VendasLeadStatus = 'novo' | 'contato' | 'retorno' | 'qualificado' | 'encerrado';

type LeadBlockKey = 'today' | 'overdue' | 'scheduled' | 'closed';

type TimelineEventInput = {
  eventType: string;
  title: string;
  description?: string | null;
  sourceType?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  resultLabel?: string | null;
  returnAt?: Date | null;
  createdByUserId?: number | null;
};

type TimelineEventRecord = {
  eventType: string;
  title: string;
  description: string | null;
  sourceType: string | null;
  statusFrom: string | null;
  statusTo: string | null;
  resultLabel: string | null;
  returnAt: Date | null;
  createdByUserId: number | null;
};

type VendasAgendaQueueMetadata = {
  active?: boolean;
  leadId?: string | null;
  sourceModule?: string | null;
  sourceBlock?: string | null;
  queueTarget?: string | null;
  routeTarget?: string | null;
  status?: string | null;
  nextAction?: string | null;
  returnAt?: string | null;
  draftMessage?: string | null;
  draftPending?: boolean;
  syncedAt?: string | null;
  deactivatedAt?: string | null;
  lastManualSendAt?: string | null;
  manualSent?: boolean;
  manualSentAt?: string | null;
  botEligible?: boolean;
  botEntryPending?: boolean;
  manualQueueOverride?: string | null;
  manualQueueOverriddenAt?: string | null;
  inheritedDraftMessage?: string | null;
  whatsappAvailabilityStatus?: string | null;
};

type VendasProspeccaoStage =
  | 'pending_send'
  | 'scheduled_send'
  | 'sent_waiting'
  | 'reply_received'
  | 'expired_no_reply'
  | 'needs_review'
  | 'no_whatsapp'
  | 'negative_reply';

type VendasProspeccaoMetadata = {
  stage?: VendasProspeccaoStage | null;
  firstOutboundAt?: string | null;
  lastInboundAt?: string | null;
  replyDeadlineAt?: string | null;
  leadSegment?: string | null;
  campaignSegment?: string | null;
  mismatchReason?: string | null;
};

type VendasWhatsappAvailabilityStatus = 'unknown' | 'available' | 'unavailable';

type VendasWhatsappAvailabilityState = {
  status: VendasWhatsappAvailabilityStatus;
  checkedAt: string | null;
  phoneDigits: string | null;
  message: string | null;
};

type VendasPlanAccess = {
  planTier: CommercialPlanTier;
  capabilities: CommercialPlanCapabilities;
};

type SalesProfileSource = 'user' | 'company' | 'default';

type EffectiveSalesProfile = LeadQualityV2SalesProfile & {
  id?: string | null;
  profileName?: string | null;
  targetAudienceJson?: any;
  targetSegmentsJson?: any;
  avoidSegmentsJson?: any;
  preferredCitiesJson?: string[];
  preferredStatesJson?: string[];
  preferredChannelsJson?: string[];
  ticketRange?: string | null;
  salesGoal?: string | null;
  weeklyAutoUpdateEnabled?: boolean;
  source?: string | null;
  lastAppliedAt?: string | null;
  lastSuggestedAt?: string | null;
  suggestedProfile?: any;
};

type ImportLeadQualityStatus =
  | 'approved'
  | 'segment_mismatch'
  | 'weak_contact'
  | 'generic_directory'
  | 'invalid'
  | 'duplicate';

type ImportLeadQualityResult = {
  status: ImportLeadQualityStatus;
  billable: boolean;
  segmentMatchScore: number;
  contactQualityScore: number;
  commercialScore: number;
  reasons: string[];
};

export type HbxPresentationEmailDraftInput = {
  leadName?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  sellerName?: string | null;
  companyName?: string | null;
};

export type HbxPresentationEmailDraft = {
  subject: string;
  body: string;
  channel: 'email';
  tone: 'commercial_presentation';
  warnings: string[];
};

const VENDAS_WHATSAPP_LOOKUP_SOURCE = 'webwhats_lookup';
const VENDAS_PENDING_CARD_LIMIT = 40;
const VENDAS_REPORT_ADMIN_PHONE = '5519997024884';

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildEmailCta(contactEmail?: string | null) {
  const localPart = String(contactEmail || '').split('@')[0]?.trim().toLowerCase();
  if (localPart === 'compras') {
    return 'Você poderia me indicar o responsável comercial/atendimento?';
  }
  if (localPart === 'vendas' || localPart === 'comercial') {
    return 'Posso mostrar como isso ajudaria o time comercial?';
  }
  return 'Posso te enviar uma apresentação rápida ou mostrar em poucos minutos como funciona?';
}

export function buildHbxPresentationEmailDraft(input: HbxPresentationEmailDraftInput): HbxPresentationEmailDraft {
  const companyName = compactText(input.companyName) || 'HBX';
  const leadName = compactText(input.leadName) || 'sua empresa';
  const city = compactText(input.city);
  const state = compactText(input.state).toUpperCase().slice(0, 2);
  const segment = compactText(input.segment).toLowerCase();
  const cityPart = city ? ` em ${city}${state ? `/${state}` : ''}` : state ? ` em ${state}` : '';
  const segmentPart = segment ? ` de ${segment}` : '';
  const sellerName = compactText(input.sellerName) || companyName;
  const cta = buildEmailCta(input.contactEmail);

  return {
    subject: 'Apresentação HBX — organização de vendas pelo WhatsApp',
    body: [
      'Olá, tudo bem?',
      '',
      `Vi a empresa ${leadName}${cityPart} e queria apresentar a ${companyName}.`,
      '',
      `A ${companyName} ajuda empresas${segmentPart} que atendem pelo WhatsApp a organizar leads, retornos, contatos sem resposta e oportunidades comerciais em uma fila simples de vendas.`,
      '',
      'Também conseguimos conectar Radar Digital, cards comerciais e atendimento, evitando que interessados fiquem perdidos no WhatsApp.',
      '',
      cta,
      '',
      'Se não fizer sentido para vocês, é só me avisar que não retorno o contato.',
      '',
      sellerName,
    ].join('\n'),
    channel: 'email',
    tone: 'commercial_presentation',
    warnings: [
      'Revise antes de enviar.',
      'Não envie em massa sem opt-out e domínio configurado.',
    ],
  };
}

@Injectable()
export class VendasService {
  private readonly logger = new Logger(VendasService.name);
  private vendasLeadAddressColumnAvailable: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerProfileService: CustomerProfileService,
    private readonly conversations: ConversationsService,
    private readonly inboxService: InboxService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
    private readonly commercialPlansService: CommercialPlansService,
    private readonly hbxPresentationEmails: HbxPresentationEmailService,
    private readonly commercialUsageLimits: CommercialUsageLimitsService,
  ) {}

  async getAutomationBotConfigForUser(user: any) {
    await this.commercialPlansService.assertBotAiEntitlementForUser(user);
    return this.inboxService.getBotConfig(user);
  }

  async updateAutomationBotConfigForUser(user: any, payload: unknown) {
    await this.commercialPlansService.assertBotAiEntitlementForUser(user);
    const companyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0);
    const requested = payload && typeof payload === 'object' ? payload as any : {};
    const globalBotEnabled = Boolean(requested?.routingRules?.globalBotEnabled);
    if (companyId && globalBotEnabled) {
      await this.commercialPlansService.assertAssistedSetupCompleteForCompany(companyId);
    }
    return this.inboxService.updateBotConfig(user, payload);
  }

  async getAutomationAgendaForUser(user: any) {
    return this.inboxService.getAgendaConfig(user);
  }

  async getDailyUsageSnapshotForUser(user: any) {
    const { companyId, userId } = this.resolveUserContext(user);
    return this.commercialUsageLimits.getDailyUsageSnapshot(companyId, userId);
  }

  async getPendingVendasCardCountForCompany(companyId: number) {
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    if (!normalizedCompanyId) return 0;
    return this.prisma.vendasLead.count({
      where: {
        companyId: normalizedCompanyId,
        NOT: [
          { status: 'encerrado' },
          { closedAt: { not: null } },
        ],
      },
    });
  }

  async getPendingSummaryForUser(user: any) {
    const { companyId } = this.resolveUserContext(user);
    const pendingCount = await this.getPendingVendasCardCountForCompany(companyId);
    const remaining = Math.max(0, VENDAS_PENDING_CARD_LIMIT - pendingCount);
    return {
      ok: true,
      limit: VENDAS_PENDING_CARD_LIMIT,
      pendingCount,
      remaining,
      blocked: pendingCount >= VENDAS_PENDING_CARD_LIMIT,
      message: pendingCount >= VENDAS_PENDING_CARD_LIMIT
        ? '40 Cards pendentes no Vendas, delete ou termine sua agenda para seguir com a busca nova'
        : `${remaining} card(s) livres para o Radar alimentar o Vendas.`,
    };
  }

  private normalizeText(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private isMissingAddressColumnError(error: any) {
    const code = String(error?.code || '').trim().toUpperCase();
    if (code === 'P2022') return true;
    const message = String(error?.message || '').toLowerCase();
    return message.includes('address') && (message.includes('column') || message.includes('does not exist'));
  }

  private isUniqueConstraintError(error: any) {
    return String(error?.code || '').trim().toUpperCase() === 'P2002';
  }

  private async hasVendasLeadAddressColumn() {
    if (this.vendasLeadAddressColumnAvailable !== null) {
      return this.vendasLeadAddressColumnAvailable;
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'VendasLead'
            AND column_name = 'address'
        ) AS "exists"
      `;
      this.vendasLeadAddressColumnAvailable = Boolean(rows?.[0]?.exists);
    } catch {
      this.vendasLeadAddressColumnAvailable = false;
    }

    return this.vendasLeadAddressColumnAvailable;
  }

  private normalizePhone(value: unknown) {
    const digits = this.customerProfileService.normalizePhone(value);
    if (!digits) return null;
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
      return `55${digits}`;
    }
    return digits;
  }

  private normalizeEmail(value: unknown) {
    return this.customerProfileService.normalizeEmail(value);
  }

  private normalizeStatus(value: unknown): VendasLeadStatus {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'contato') return 'contato';
    if (normalized === 'retorno') return 'retorno';
    if (normalized === 'qualificado') return 'qualificado';
    if (normalized === 'encerrado') return 'encerrado';
    return 'novo';
  }

  private parseDate(value: unknown) {
    const normalized = this.normalizeText(value);
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

  private parseMaybeJsonObject(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }

  private normalizeImportLeadQuality(value: unknown): ImportLeadQualityResult | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, any>;
    const status = String(raw.status || '').trim() as ImportLeadQualityStatus;
    if (!['approved', 'segment_mismatch', 'weak_contact', 'generic_directory', 'invalid', 'duplicate'].includes(status)) return null;
    return {
      status,
      billable: raw.billable !== false && status === 'approved',
      segmentMatchScore: Math.max(0, Math.trunc(Number(raw.segmentMatchScore || 0) || 0)),
      contactQualityScore: Math.max(0, Math.trunc(Number(raw.contactQualityScore || 0) || 0)),
      commercialScore: Math.max(0, Math.trunc(Number(raw.commercialScore || 0) || 0)),
      reasons: Array.isArray(raw.reasons)
        ? raw.reasons.map((reason) => String(reason || '').trim()).filter(Boolean)
        : [],
    };
  }

  private extractLeadQualityFromImportItem(item: any): ImportLeadQualityResult | null {
    const direct = this.parseMaybeJsonObject(item);
    const rawJson = this.parseMaybeJsonObject(direct.rawJson);
    const enrichmentJson = this.parseMaybeJsonObject(direct.enrichmentJson);
    const candidates = [
      direct.quality,
      rawJson.quality,
      enrichmentJson.quality,
      enrichmentJson.signals?.quality,
    ];
    for (const candidate of candidates) {
      const quality = this.normalizeImportLeadQuality(candidate);
      if (quality) return quality;
    }
    return null;
  }

  private normalizeImportLeadQualityV2(value: unknown): LeadQualityV2 | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, any>;
    const decision = String(raw.decision || '').trim() as LeadQualityV2['decision'];
    if (raw.version !== 'lead-quality-v2' || !['deliver', 'review', 'discard', 'protect'].includes(decision)) return null;
    return {
      version: 'lead-quality-v2',
      identityScore: Math.max(0, Math.trunc(Number(raw.identityScore || 0) || 0)),
      segmentFitScore: Math.max(0, Math.trunc(Number(raw.segmentFitScore || 0) || 0)),
      contactabilityScore: Math.max(0, Math.trunc(Number(raw.contactabilityScore || 0) || 0)),
      commercialIntentScore: Math.max(0, Math.trunc(Number(raw.commercialIntentScore || 0) || 0)),
      freshnessScore: Math.max(0, Math.trunc(Number(raw.freshnessScore || 0) || 0)),
      riskScore: Math.max(0, Math.trunc(Number(raw.riskScore || 0) || 0)),
      opportunityScore: Math.max(0, Math.trunc(Number(raw.opportunityScore || 0) || 0)),
      finalRankScore: Math.max(0, Math.trunc(Number(raw.finalRankScore || 0) || 0)),
      decision,
      reasons: Array.isArray(raw.reasons) ? raw.reasons.map((reason) => String(reason || '').trim()).filter(Boolean) : [],
      discardReason: raw.discardReason ? String(raw.discardReason) : null,
      protectionReason: raw.protectionReason ? String(raw.protectionReason) : null,
      recommendedChannel: ['whatsapp', 'email', 'call', 'review', 'discard'].includes(String(raw.recommendedChannel || ''))
        ? raw.recommendedChannel
        : 'review',
      productFit: {
        listFit: Math.max(0, Math.trunc(Number(raw.productFit?.listFit || 0) || 0)),
        leadFit: Math.max(0, Math.trunc(Number(raw.productFit?.leadFit || 0) || 0)),
        botFit: Math.max(0, Math.trunc(Number(raw.productFit?.botFit || 0) || 0)),
        recoveryFit: Math.max(0, Math.trunc(Number(raw.productFit?.recoveryFit || 0) || 0)),
        websiteFit: Math.max(0, Math.trunc(Number(raw.productFit?.websiteFit || 0) || 0)),
      },
    };
  }

  private extractLeadQualityV2FromImportItem(item: any): LeadQualityV2 | null {
    const direct = this.parseMaybeJsonObject(item);
    const rawJson = this.parseMaybeJsonObject(direct.rawJson);
    const enrichmentJson = this.parseMaybeJsonObject(direct.enrichmentJson);
    const candidates = [
      direct.qualityV2,
      direct.signals?.qualityV2,
      rawJson.qualityV2,
      rawJson.signals?.qualityV2,
      enrichmentJson.qualityV2,
      enrichmentJson.signals?.qualityV2,
    ];
    for (const candidate of candidates) {
      const qualityV2 = this.normalizeImportLeadQualityV2(candidate);
      if (qualityV2) return qualityV2;
    }
    return null;
  }

  private buildVendasLeadSelectWithoutAddress(extra: Record<string, any> = {}) {
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
      ...extra,
    };
  }

  private startOfToday(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private startOfTomorrow(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  }

  private isClosedLead(row: any) {
    return this.normalizeStatus(row?.status) === 'encerrado' || Boolean(row?.closedAt);
  }

  private classifyLeadBlock(row: any): LeadBlockKey {
    if (this.isClosedLead(row)) return 'closed';

    const now = new Date();
    const startToday = this.startOfToday(now);
    const startTomorrow = this.startOfTomorrow(now);
    const returnAt = row?.returnAt instanceof Date ? row.returnAt : this.parseDate(row?.returnAt);

    if (!returnAt) return 'today';
    if (returnAt.getTime() < startToday.getTime()) return 'overdue';
    if (returnAt.getTime() >= startTomorrow.getTime()) return 'scheduled';
    return 'today';
  }

  private formatStatusLabel(status: VendasLeadStatus) {
    switch (status) {
      case 'contato':
        return 'Em contato';
      case 'retorno':
        return 'Retorno';
      case 'qualificado':
        return 'Qualificado';
      case 'encerrado':
        return 'Encerrado';
      default:
        return 'Novo lead';
    }
  }

  private formatSourceLabel(sourceType: unknown) {
    return String(sourceType || '').trim().toLowerCase() === 'webscraping' ? 'Radar Digital' : 'Manual';
  }

  private hasPreviousContact(row: any) {
    return Boolean(row?.lastContactAt) || Number(row?.attemptCount || 0) > 0;
  }

  private buildSignalState(row: any) {
    const sourceType = String(row?.sourceType || 'manual').trim().toLowerCase();
    const primarySource = String(row?.primarySource || sourceType || 'manual').trim().toLowerCase();
    const wasClosedBefore = Boolean(row?.wasClosedBefore) || Boolean(row?.closedAt);
    return {
      alreadyExisted: Number(row?.timesSeen || 0) > 1,
      cameFromWebscraping: sourceType === 'webscraping' || primarySource === 'webscraping',
      hadPreviousContact: this.hasPreviousContact(row),
      wasClosedBefore,
    };
  }

  private normalizeWhatsappAvailabilityStatus(value: unknown): VendasWhatsappAvailabilityStatus {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'available') return 'available';
    if (normalized === 'unavailable') return 'unavailable';
    return 'unknown';
  }

  private parseWhatsappAvailabilityEvent(row: any): VendasWhatsappAvailabilityState | null {
    if (!row) return null;
    const sourceType = String(row?.sourceType || '').trim().toLowerCase();
    if (sourceType !== VENDAS_WHATSAPP_LOOKUP_SOURCE) return null;
    const status = this.normalizeWhatsappAvailabilityStatus(row?.resultLabel);
    if (status === 'unknown') return null;
    const description = this.normalizeText(row?.description);
    const phoneDigits = this.normalizePhone(description) || null;
    const checkedAt =
      row?.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : this.normalizeText(row?.createdAt);
    return {
      status,
      checkedAt,
      phoneDigits,
      message: description,
    };
  }

  private async listWhatsappAvailabilityByLeadIds(leadIds: string[]) {
    const normalizedLeadIds = Array.from(
      new Set(
        (Array.isArray(leadIds) ? leadIds : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    );
    const availabilityByLeadId = new Map<string, VendasWhatsappAvailabilityState>();
    if (!normalizedLeadIds.length) return availabilityByLeadId;

    const rows = await this.prisma.vendasLeadTimelineEvent.findMany({
      where: {
        leadId: { in: normalizedLeadIds },
        sourceType: VENDAS_WHATSAPP_LOOKUP_SOURCE,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        leadId: true,
        sourceType: true,
        resultLabel: true,
        description: true,
        createdAt: true,
      },
    });

    for (const row of rows) {
      const leadId = String(row?.leadId || '').trim();
      if (!leadId || availabilityByLeadId.has(leadId)) continue;
      const parsed = this.parseWhatsappAvailabilityEvent(row);
      if (!parsed) continue;
      availabilityByLeadId.set(leadId, parsed);
    }

    return availabilityByLeadId;
  }

  private async ensureWhatsappAvailabilityForRows(companyId: number, userId: number, rows: any[]) {
    const leadIds = Array.from(
      new Set(
        (Array.isArray(rows) ? rows : [])
          .map((row) => String(row?.id || '').trim())
          .filter(Boolean),
      ),
    );
    const availabilityByLeadId = await this.listWhatsappAvailabilityByLeadIds(leadIds);
    const pendingRows = (Array.isArray(rows) ? rows : []).filter((row) => {
      const leadId = String(row?.id || '').trim();
      const phoneDigits = this.normalizePhone(row?.phoneNormalized || row?.phone);
      return Boolean(leadId && phoneDigits && !availabilityByLeadId.has(leadId));
    });

    if (!pendingRows.length) {
      return availabilityByLeadId;
    }

    try {
      const lookupResults = await this.webwhatsBridge.checkWhatsappNumbers(
        companyId,
        pendingRows.map((row) => row?.phoneNormalized || row?.phone || null),
      );
      const now = new Date();
      const byPhoneDigits = new Map<string, (typeof lookupResults)[number]>();
      for (const entry of lookupResults) {
        const digits = this.normalizePhone(entry?.normalizedNumber || entry?.input);
        if (!digits || byPhoneDigits.has(digits)) continue;
        byPhoneDigits.set(digits, entry);
      }

      const timelineEvents: any[] = [];
      for (const row of pendingRows) {
        const leadId = String(row?.id || '').trim();
        const phoneDigits = this.normalizePhone(row?.phoneNormalized || row?.phone);
        if (!leadId || !phoneDigits || availabilityByLeadId.has(leadId)) continue;
        const lookup = byPhoneDigits.get(phoneDigits);
        if (!lookup) continue;
        const status: VendasWhatsappAvailabilityStatus = lookup.exists ? 'available' : 'unavailable';
        const phoneLabel = this.buildPreferredLeadContact(phoneDigits) || `+${phoneDigits}`;
        const message = lookup.exists
          ? `Consulta rapida no motor confirmou WhatsApp para ${phoneLabel}.`
          : `Consulta rapida no motor nao encontrou WhatsApp para ${phoneLabel}.`;
        const checkedAt = now.toISOString();
        availabilityByLeadId.set(leadId, {
          status,
          checkedAt,
          phoneDigits,
          message,
        });
        timelineEvents.push({
          leadId,
          ...this.buildTimelineEvent({
            eventType: 'generic',
            title: lookup.exists ? 'WhatsApp confirmado no motor' : 'Numero sem WhatsApp no motor',
            description: message,
            sourceType: VENDAS_WHATSAPP_LOOKUP_SOURCE,
            resultLabel: status,
            createdByUserId: userId,
          }),
        });
      }

      if (timelineEvents.length) {
        await this.prisma.vendasLeadTimelineEvent.createMany({
          data: timelineEvents,
        });
        this.logger.log(
          `[vendas-agenda] Verificacao de WhatsApp concluida company=${companyId} checked=${timelineEvents.length}`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `[vendas-agenda] Falha ao verificar WhatsApp no motor company=${companyId}: ${String(error?.message || error)}`,
      );
    }

    return availabilityByLeadId;
  }

  private buildLeadPayload(
    row: any,
    sharedProfile?: any,
    whatsappAvailability?: VendasWhatsappAvailabilityState | null,
    inboxPresence?: { conversationId?: string | number | null } | null,
    planAccess?: VendasPlanAccess | null,
  ) {
    const status = this.normalizeStatus(row?.status);
    const block = this.classifyLeadBlock(row);
    const primarySource = String(row?.primarySource || row?.sourceType || 'manual');
    const signals = this.buildSignalState(row);
    const timeline = Array.isArray(row?.timelineEvents)
      ? row.timelineEvents.map((event: any) => ({
          id: String(event?.id || ''),
          eventType: String(event?.eventType || 'generic'),
          title: String(event?.title || 'Atualizacao comercial'),
          description: event?.description ? String(event.description) : null,
          sourceType: event?.sourceType ? String(event.sourceType) : null,
          statusFrom: event?.statusFrom ? String(event.statusFrom) : null,
          statusTo: event?.statusTo ? String(event.statusTo) : null,
          resultLabel: event?.resultLabel ? String(event.resultLabel) : null,
          returnAt: event?.returnAt instanceof Date ? event.returnAt.toISOString() : null,
          createdAt: event?.createdAt instanceof Date ? event.createdAt.toISOString() : null,
        }))
      : [];
    const rawIntelligence = buildVendasLeadIntelligence({
      lead: row,
      whatsappAvailability,
      verifiedBy: String(whatsappAvailability?.message || '').includes('HBX Master')
        ? 'hbx_master'
        : whatsappAvailability?.checkedAt
          ? 'client_engine'
          : null,
    });
    const access = planAccess || this.buildPlanAccess(COMMERCIAL_PLAN_KEYS.PADRAO);
    return {
      id: String(row?.id || ''),
      customerProfileId: row?.customerProfileId ? String(row.customerProfileId) : null,
      sourceType: String(row?.sourceType || 'manual'),
      primarySource,
      sourceHistoryId: row?.sourceHistoryId ? String(row.sourceHistoryId) : null,
      sourceSignature: row?.sourceSignature ? String(row.sourceSignature) : null,
      timesSeen: Math.max(1, Math.trunc(Number(row?.timesSeen || 0) || 1)),
      name: row?.name ? String(row.name) : null,
      phone: row?.phone ? String(row.phone) : null,
      phoneNormalized: row?.phoneNormalized ? String(row.phoneNormalized) : null,
      email: row?.email ? String(row.email) : null,
      address: row?.address ? String(row.address) : null,
      website: row?.website ? String(row.website) : null,
      rating: row?.rating == null ? null : Number(row.rating),
      reviews: Math.max(0, Math.trunc(Number(row?.reviews || 0) || 0)),
      city: row?.city ? String(row.city) : null,
      state: row?.state ? String(row.state) : null,
      segment: row?.segment ? String(row.segment) : null,
      status,
      statusLabel: this.formatStatusLabel(status),
      nextAction: row?.nextAction ? String(row.nextAction) : null,
      returnAt: row?.returnAt instanceof Date ? row.returnAt.toISOString() : null,
      shortNote: row?.shortNote ? String(row.shortNote) : null,
      lastContactAt: row?.lastContactAt instanceof Date ? row.lastContactAt.toISOString() : null,
      attemptCount: Math.max(0, Math.trunc(Number(row?.attemptCount || 0) || 0)),
      lastResult: row?.lastResult ? String(row.lastResult) : null,
      wasClosedBefore: signals.wasClosedBefore,
      closedAt: row?.closedAt instanceof Date ? row.closedAt.toISOString() : null,
      createdAt: row?.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
      whatsappAvailability: whatsappAvailability || null,
      planTier: access.planTier,
      capabilities: access.capabilities,
      leadIntelligence: this.applyLeadIntelligenceCapabilities(rawIntelligence, access),
      isInInbox: Boolean(inboxPresence?.conversationId || sharedProfile?.presence?.atendimento?.present),
      inboxConversationId: inboxPresence?.conversationId ? String(inboxPresence.conversationId) : null,
      atendimentoConversationId: inboxPresence?.conversationId ? String(inboxPresence.conversationId) : null,
      signals,
      timeline,
      sharedProfile: sharedProfile || null,
      block,
      quickActions:
        block === 'closed'
          ? ['reabrir']
          : ['hoje', 'amanha', 'encerrar'],
    };
  }

  private resolveUserContext(user: any) {
    const masterContextCompanyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : 0);
    const companyId = masterContextCompanyId || Number(user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    return { companyId, userId };
  }

  private buildPlanAccess(planKey: unknown): VendasPlanAccess {
    const normalized = normalizeCommercialPlanKey(planKey);
    return {
      planTier: getCommercialPlanTier(normalized),
      capabilities: getCommercialPlanCapabilities(normalized),
    };
  }

  private async resolvePlanAccessForCompany(companyId: number): Promise<VendasPlanAccess> {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { selectedPlanKey: true, premiumAccess: true, paymentStatus: true, subscriptionStatus: true },
    }).catch(() => null);
    return this.buildPlanAccess(resolveCommercialPlanKeyForCapabilities(company || {}));
  }

  private applyLeadIntelligenceCapabilities(intelligence: any, access: VendasPlanAccess) {
    if (access.capabilities.canSeeLeadIntelligence) {
      return intelligence;
    }
    return {
      emailStatus: intelligence?.emailStatus || null,
      whatsappStatus: access.capabilities.canUseVerifiedWhatsapp ? intelligence?.whatsappStatus || null : 'unverified',
      contactQuality: intelligence?.contactQuality === 'blocked' ? 'blocked' : 'review',
      opportunityScore: null,
      opportunityReason: null,
      painType: null,
      painPitch: null,
      recommendedChannel: null,
      emailSource: null,
      confidence: null,
      leadReasonTags: (Array.isArray(intelligence?.leadReasonTags) ? intelligence.leadReasonTags : [])
        .filter((tag: string) => ['sem_site', 'cidade_alvo', 'segmento_alvo'].includes(String(tag))),
      nextBestAction: null,
      lastVerifiedAt: null,
      verifiedBy: null,
      messageTemplate: null,
      messageTemplates: [],
      templateLibrarySize: Number(intelligence?.templateLibrarySize || 0) || 0,
      instagramUrl: null,
      facebookUrl: null,
      socialStatus: intelligence?.socialStatus || null,
      socialConfidence: null,
      primarySocial: intelligence?.primarySocial || null,
      premiumTeaser: intelligence?.primarySocial || intelligence?.opportunityScore
        ? {
            label: 'Disponível no HBX Lead',
            cta: 'Ver card inteligente',
          }
        : null,
    };
  }

  private defaultSalesProfile(): EffectiveSalesProfile {
    return {
      profileName: 'Perfil de Venda',
      whatDoYouSell: 'Sistema/serviço comercial',
      offerCategory: 'serviço comercial',
      targetAudience: ['pequenos negócios', 'comércios locais', 'prestadores de serviço'],
      targetSegments: ['oficina', 'clínica', 'beleza', 'restaurante', 'pet', 'imobiliária', 'serviços locais'],
      avoidSegments: ['órgão público', 'empresa muito grande', 'diretório', 'lista genérica'],
      hardRejectSegments: ['órgão público', 'diretório', 'lista genérica'],
      preferredCities: [],
      preferredStates: [],
      preferredChannels: ['whatsapp'],
      leadPreferences: {
        preferSmallBusiness: true,
        preferNoWebsite: true,
        preferInstagram: true,
        preferWhatsapp: true,
        preferHighReviews: true,
        preferLocalBusiness: true,
        companySize: 'small',
      },
      negativeRules: {
        avoidPublicSector: true,
        avoidLargeCompanies: true,
        avoidDirectories: true,
        avoidNoPhone: true,
        avoidNoWhatsapp: false,
      },
      weeklyAutoUpdateEnabled: false,
      source: 'system_default',
    };
  }

  private parseSalesProfileJson(value: unknown, fallback: any) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(String(value || ''));
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  private sanitizeSalesProfileString(value: unknown, max = 160) {
    return this.normalizeText(value).slice(0, max) || null;
  }

  private sanitizeSalesProfileArray(value: unknown, limit = 30, maxLength = 80) {
    const raw = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const output: string[] = [];
    for (const item of raw) {
      const normalized = this.normalizeText(item).slice(0, maxLength);
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
      if (output.length >= limit) break;
    }
    return output;
  }

  private serializeSalesProfileJson(value: any) {
    return JSON.stringify(value == null ? null : value).slice(0, 12000);
  }

  private rowToSalesProfile(row: any): EffectiveSalesProfile {
    const fallback = this.defaultSalesProfile();
    if (!row) return fallback;
    const targetAudienceJson = this.parseSalesProfileJson(row.targetAudienceJson, { labels: [] });
    const targetSegmentsJson = this.parseSalesProfileJson(row.targetSegmentsJson, { labels: [] });
    const avoidSegmentsJson = this.parseSalesProfileJson(row.avoidSegmentsJson, { labels: [] });
    const preferredCities = this.parseSalesProfileJson(row.preferredCitiesJson, []);
    const preferredStates = this.parseSalesProfileJson(row.preferredStatesJson, []);
    const preferredChannels = this.parseSalesProfileJson(row.preferredChannelsJson, []);
    const leadPreferences = this.parseSalesProfileJson(row.leadPreferencesJson, {});
    const negativeRules = this.parseSalesProfileJson(row.negativeRulesJson, {});
    return {
      id: row.id ? String(row.id) : null,
      profileName: row.profileName || fallback.profileName,
      whatDoYouSell: row.whatDoYouSell || fallback.whatDoYouSell,
      offerCategory: row.offerCategory || fallback.offerCategory,
      targetAudienceJson,
      targetSegmentsJson,
      avoidSegmentsJson,
      targetAudience: this.sanitizeSalesProfileArray(targetAudienceJson?.labels || fallback.targetAudience),
      targetSegments: this.sanitizeSalesProfileArray(targetSegmentsJson?.labels || fallback.targetSegments),
      avoidSegments: this.sanitizeSalesProfileArray(avoidSegmentsJson?.labels || fallback.avoidSegments),
      hardRejectSegments: this.sanitizeSalesProfileArray(avoidSegmentsJson?.hardReject || fallback.hardRejectSegments),
      preferredCities: this.sanitizeSalesProfileArray(preferredCities),
      preferredStates: this.sanitizeSalesProfileArray(preferredStates, 30, 2).map((state) => state.toUpperCase()),
      preferredChannels: this.sanitizeSalesProfileArray(preferredChannels.length ? preferredChannels : fallback.preferredChannels, 8, 24),
      preferredCitiesJson: this.sanitizeSalesProfileArray(preferredCities),
      preferredStatesJson: this.sanitizeSalesProfileArray(preferredStates, 30, 2).map((state) => state.toUpperCase()),
      preferredChannelsJson: this.sanitizeSalesProfileArray(preferredChannels.length ? preferredChannels : fallback.preferredChannels, 8, 24),
      leadPreferences: { ...fallback.leadPreferences, ...leadPreferences },
      negativeRules: { ...fallback.negativeRules, ...negativeRules },
      ticketRange: row.ticketRange || null,
      salesGoal: row.salesGoal || null,
      weeklyAutoUpdateEnabled: Boolean(row.weeklyAutoUpdateEnabled),
      source: row.source || 'manual',
      lastAppliedAt: row.lastAppliedAt instanceof Date ? row.lastAppliedAt.toISOString() : null,
      lastSuggestedAt: row.lastSuggestedAt instanceof Date ? row.lastSuggestedAt.toISOString() : null,
      suggestedProfile: this.parseSalesProfileJson(row.suggestedProfileJson, null),
    };
  }

  private applySalesProfileCapabilities(profile: EffectiveSalesProfile, access: VendasPlanAccess): EffectiveSalesProfile {
    if (access.capabilities.canUseSalesProfileAdvanced) return profile;
    return {
      ...this.defaultSalesProfile(),
      id: profile.id,
      whatDoYouSell: profile.whatDoYouSell,
      offerCategory: profile.offerCategory,
      targetSegments: (profile.targetSegments || []).slice(0, 1),
      preferredCities: (profile.preferredCities || []).slice(0, 1),
      preferredStates: (profile.preferredStates || []).slice(0, 1),
      preferredChannels: ['whatsapp'],
      leadPreferences: {
        preferSmallBusiness: true,
        preferNoWebsite: false,
        preferInstagram: false,
        preferWhatsapp: true,
        preferHighReviews: false,
        preferLocalBusiness: true,
      },
      negativeRules: {
        avoidDirectories: true,
        avoidNoPhone: true,
        avoidNoWhatsapp: false,
      },
      weeklyAutoUpdateEnabled: false,
      source: profile.source,
    };
  }

  private async getEffectiveSalesProfileForContext(context: { companyId: number; userId: number }, access?: VendasPlanAccess) {
    const planAccess = access || await this.resolvePlanAccessForCompany(context.companyId);
    const tableAvailable = await this.prisma.hasTable('SalesProfile').catch(() => false);
    if (!tableAvailable) {
      return { profile: null, effectiveProfile: this.applySalesProfileCapabilities(this.defaultSalesProfile(), planAccess), source: 'default' as SalesProfileSource };
    }
    const [userProfile, companyProfile] = await Promise.all([
      (this.prisma as any).salesProfile.findFirst({
        where: { companyId: context.companyId, userId: context.userId },
        orderBy: { updatedAt: 'desc' },
      }).catch(() => null),
      (this.prisma as any).salesProfile.findFirst({
        where: { companyId: context.companyId, userId: null },
        orderBy: { updatedAt: 'desc' },
      }).catch(() => null),
    ]);
    const row = userProfile || companyProfile || null;
    const source: SalesProfileSource = userProfile ? 'user' : companyProfile ? 'company' : 'default';
    const effectiveProfile = this.applySalesProfileCapabilities(this.rowToSalesProfile(row), planAccess);
    return {
      profile: row ? this.rowToSalesProfile(row) : null,
      effectiveProfile,
      source,
    };
  }

  async getSalesProfileForUser(user: any) {
    const context = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(context.companyId);
    const result = await this.getEffectiveSalesProfileForContext(context, planAccess);
    return { ok: true, ...result, capabilities: planAccess.capabilities };
  }

  private buildSalesProfileDataFromDto(dto: UpdateSalesProfileDto, existing?: EffectiveSalesProfile | null) {
    const fallback = existing || this.defaultSalesProfile();
    const targetAudience = {
      labels: this.sanitizeSalesProfileArray(dto.targetAudience?.labels ?? fallback.targetAudience),
      notes: this.sanitizeSalesProfileString(dto.targetAudience?.notes, 500) || undefined,
    };
    const targetSegments = {
      labels: this.sanitizeSalesProfileArray(dto.targetSegments?.labels ?? fallback.targetSegments),
      weights: dto.targetSegments?.weights && typeof dto.targetSegments.weights === 'object' ? dto.targetSegments.weights : {},
    };
    const avoidSegments = {
      labels: this.sanitizeSalesProfileArray(dto.avoidSegments?.labels ?? fallback.avoidSegments),
      hardReject: this.sanitizeSalesProfileArray(dto.avoidSegments?.hardReject ?? fallback.hardRejectSegments),
    };
    const leadPreferences = {
      ...(fallback.leadPreferences || {}),
      ...(dto.leadPreferences && typeof dto.leadPreferences === 'object' ? dto.leadPreferences : {}),
    };
    const negativeRules = {
      ...(fallback.negativeRules || {}),
      ...(dto.negativeRules && typeof dto.negativeRules === 'object' ? dto.negativeRules : {}),
    };
    return {
      profileName: 'Perfil de Venda',
      whatDoYouSell: this.sanitizeSalesProfileString(dto.whatDoYouSell ?? fallback.whatDoYouSell, 160),
      offerCategory: this.sanitizeSalesProfileString(dto.offerCategory ?? fallback.offerCategory, 120),
      targetAudienceJson: this.serializeSalesProfileJson(targetAudience),
      targetSegmentsJson: this.serializeSalesProfileJson(targetSegments),
      avoidSegmentsJson: this.serializeSalesProfileJson(avoidSegments),
      preferredCitiesJson: this.serializeSalesProfileJson(this.sanitizeSalesProfileArray(dto.preferredCities ?? fallback.preferredCities)),
      preferredStatesJson: this.serializeSalesProfileJson(this.sanitizeSalesProfileArray(dto.preferredStates ?? fallback.preferredStates, 30, 2).map((state) => state.toUpperCase())),
      preferredChannelsJson: this.serializeSalesProfileJson(this.sanitizeSalesProfileArray(dto.preferredChannels ?? fallback.preferredChannels, 8, 24)),
      leadPreferencesJson: this.serializeSalesProfileJson(leadPreferences),
      ticketRange: this.sanitizeSalesProfileString(dto.ticketRange ?? fallback.ticketRange, 80),
      salesGoal: this.sanitizeSalesProfileString(dto.salesGoal ?? fallback.salesGoal, 160),
      negativeRulesJson: this.serializeSalesProfileJson(negativeRules),
      weeklyAutoUpdateEnabled: Boolean(dto.weeklyAutoUpdateEnabled ?? fallback.weeklyAutoUpdateEnabled),
      source: 'manual',
      lastAppliedAt: new Date(),
    };
  }

  async updateSalesProfileForUser(user: any, dto: UpdateSalesProfileDto) {
    const context = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(context.companyId);
    if (!(await this.prisma.hasTable('SalesProfile').catch(() => false))) {
      throw new BadRequestException('Tabela SalesProfile ainda nao foi migrada.');
    }
    const current = await this.getEffectiveSalesProfileForContext(context, planAccess);
    const data = this.buildSalesProfileDataFromDto(dto || {}, current.profile || current.effectiveProfile);
    const existing = await (this.prisma as any).salesProfile.findFirst({
      where: { companyId: context.companyId, userId: context.userId },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => null);
    const row = existing
      ? await (this.prisma as any).salesProfile.update({ where: { id: existing.id }, data })
      : await (this.prisma as any).salesProfile.create({ data: { companyId: context.companyId, userId: context.userId, ...data } });
    const effective = await this.getEffectiveSalesProfileForContext(context, planAccess);
    return { ok: true, profile: this.rowToSalesProfile(row), effectiveProfile: effective.effectiveProfile, source: 'user' as SalesProfileSource, capabilities: planAccess.capabilities };
  }

  private resolveReportPeriod(periodRaw: unknown) {
    const period = String(periodRaw || '7d').trim().toLowerCase();
    const now = new Date();
    const start = new Date(now);
    if (period === 'today' || period === 'hoje') {
      start.setHours(0, 0, 0, 0);
      return { key: 'today', label: 'Hoje', start, end: now };
    }
    const days = period === '30d' ? 30 : 7;
    start.setDate(start.getDate() - Math.max(1, days - 1));
    start.setHours(0, 0, 0, 0);
    return { key: `${days}d`, label: `${days} dias`, start, end: now };
  }

  private incrementRanking(map: Map<string, number>, value: unknown) {
    const label = this.normalizeText(value) || 'Não informado';
    map.set(label, (map.get(label) || 0) + 1);
  }

  private mapToRanking(map: Map<string, number>, limit = 5) {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }));
  }

  private extractTimelineJson(description: unknown) {
    const raw = this.normalizeText(description);
    if (!raw || !raw.startsWith('{')) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async getConversionReportForUser(user: any, periodRaw?: string) {
    const context = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(context.companyId);
    const period = this.resolveReportPeriod(periodRaw);
    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId: context.companyId,
        OR: [
          { createdAt: { gte: period.start, lte: period.end } },
          { updatedAt: { gte: period.start, lte: period.end } },
          { lastContactAt: { gte: period.start, lte: period.end } },
        ],
      },
      include: {
        timelineEvents: {
          where: { createdAt: { gte: period.start, lte: period.end } },
          orderBy: [{ createdAt: 'desc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 1000,
    });
    const segmentCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    const channelCounts = new Map<string, number>();
    let cardsChamados = 0;
    let respostas = 0;
    let retornos = 0;
    let interessados = 0;
    let recusas = 0;
    let bloqueios = 0;
    let descartados = 0;
    let scoreCalledSum = 0;
    let scoreCalledCount = 0;
    let scoreReplySum = 0;
    let scoreReplyCount = 0;
    const discardReasons = new Map<string, number>();

    for (const lead of leads as any[]) {
      this.incrementRanking(segmentCounts, lead.segment);
      this.incrementRanking(cityCounts, lead.city);
      const timeline = Array.isArray(lead.timelineEvents) ? lead.timelineEvents : [];
      const called = Number(lead.attemptCount || 0) > 0 || timeline.some((event: any) => event.eventType === 'contact_made');
      const replied = timeline.some((event: any) => ['reply_received', 'inbound_reply'].includes(String(event.eventType || ''))) || /respondeu|reply|retorno/i.test(String(lead.lastResult || ''));
      const interested = String(lead.status || '') === 'qualificado' || /interess|qualific|positivo/i.test(String(lead.lastResult || ''));
      const refused = /sem interesse|recus|negative|negativo/i.test(String(lead.lastResult || ''));
      const blocked = /opt.?out|bloque|complaint/i.test(String(lead.lastResult || ''));
      if (called) cardsChamados += 1;
      if (replied) respostas += 1;
      if (timeline.some((event: any) => event.eventType === 'return_scheduled') || String(lead.status || '') === 'retorno') retornos += 1;
      if (interested) interessados += 1;
      if (refused) recusas += 1;
      if (blocked) bloqueios += 1;
      if (String(lead.status || '') === 'encerrado' && !interested) descartados += 1;
      for (const event of timeline) {
        const metadata = this.extractTimelineJson(event.description);
        const channel = metadata?.recommendedChannel || metadata?.qualityV2?.recommendedChannel || event.resultLabel;
        if (channel) this.incrementRanking(channelCounts, channel);
        const score = Number(metadata?.qualityV2?.finalRankScore || metadata?.opportunityScore || metadata?.enrichmentScore || 0);
        if (score > 0 && called) {
          scoreCalledSum += score;
          scoreCalledCount += 1;
        }
        if (score > 0 && replied) {
          scoreReplySum += score;
          scoreReplyCount += 1;
        }
        const reason = metadata?.qualityV2?.discardReason || metadata?.quality?.status || null;
        if (reason) this.incrementRanking(discardReasons, reason);
      }
    }
    const topSegments = this.mapToRanking(segmentCounts);
    const topCities = this.mapToRanking(cityCounts);
    const topChannels = this.mapToRanking(channelCounts);
    const taxaResposta = cardsChamados ? respostas / cardsChamados : 0;
    const taxaConversao = cardsChamados ? interessados / cardsChamados : 0;
    const report = {
      ok: true,
      period,
      capabilities: planAccess.capabilities,
      isComplete: Boolean(planAccess.capabilities.canSeeConversionReport && planAccess.capabilities.canUseSalesProfileAdvanced),
      metrics: {
        cardsRecebidos: leads.length,
        cardsEntregues: leads.length,
        cardsChamados,
        respostas,
        retornos,
        interessados,
        recusas,
        bloqueios,
        descartados,
        taxaResposta,
        taxaConversao,
        melhorSegmento: topSegments[0]?.label || 'Sem dados',
        melhorCidade: topCities[0]?.label || 'Sem dados',
        melhorCanal: topChannels[0]?.label || 'WhatsApp',
        scoreMedioChamados: scoreCalledCount ? Math.round(scoreCalledSum / scoreCalledCount) : null,
        scoreMedioRespondidos: scoreReplyCount ? Math.round(scoreReplySum / scoreReplyCount) : null,
      },
      rankings: {
        segments: topSegments,
        cities: topCities,
        channels: topChannels,
        discardReasons: this.mapToRanking(discardReasons),
      },
      recommendation: topSegments[0]
        ? `Nesta semana, o HBX identificou que seus melhores resultados vieram de ${topSegments[0].label}, ${topCities[0]?.label || 'sua região'} e ${topChannels[0]?.label || 'WhatsApp'}.`
        : 'Meça alguns contatos para o HBX recomendar segmentos, cidades e canais com mais precisão.',
    };
    if (!planAccess.capabilities.canUseSalesProfileAdvanced) {
      return {
        ...report,
        rankings: { segments: topSegments.slice(0, 1), cities: topCities.slice(0, 1), channels: [], discardReasons: [] },
        recommendation: 'Relatório inteligente disponível no HBX Lead.',
      };
    }
    return report;
  }

  private pct(value: number) {
    return `${Math.round((Number(value || 0) || 0) * 100)}%`;
  }

  private buildSimplePdf(lines: string[]) {
    const escapePdf = (value: string) => String(value || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const objects: string[] = [];
    const pages: number[] = [];
    const chunks = [lines.slice(0, 16), lines.slice(16, 32), lines.slice(32, 48)].filter((chunk) => chunk.length);
    const regularFontId = 3 + chunks.length * 2;
    const boldFontId = regularFontId + 1;
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [] /Count 0 >>');
    for (const chunk of chunks) {
      const pageIndex = objects.length + 1;
      const contentIndex = pageIndex + 1;
      pages.push(pageIndex);
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentIndex} 0 R >>`);
      const content = [
        'BT',
        '/F2 20 Tf 48 790 Td (HBX - Relatorio de Conversao Comercial) Tj',
        '/F1 11 Tf 0 -34 Td',
        ...chunk.map((line) => `0 -22 Td (${escapePdf(line)}) Tj`),
        'ET',
      ].join('\n');
      objects.push(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`);
    }
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    objects[1] = `<< /Type /Pages /Kids [${pages.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    const bodyParts = objects.map((object, index) => `${index + 1} 0 obj\n${object}\nendobj\n`);
    let offset = '%PDF-1.4\n'.length;
    const xref = [0];
    for (const part of bodyParts) {
      xref.push(offset);
      offset += Buffer.byteLength(part, 'utf8');
    }
    const body = bodyParts.join('');
    const xrefOffset = Buffer.byteLength('%PDF-1.4\n' + body, 'utf8');
    const table = [
      'xref',
      `0 ${objects.length + 1}`,
      '0000000000 65535 f ',
      ...xref.slice(1).map((item) => `${String(item).padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
      'startxref',
      String(xrefOffset),
      '%%EOF',
    ].join('\n');
    return Buffer.from(`%PDF-1.4\n${body}${table}`, 'utf8');
  }

  async exportConversionReportPdfForUser(user: any, periodRaw?: string) {
    const context = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(context.companyId);
    if (!planAccess.capabilities.canExportConversionPdf) {
      throw new ForbiddenException('Exportação PDF disponível no HBX Lead.');
    }
    const [report, company] = await Promise.all([
      this.getConversionReportForUser(user, periodRaw),
      this.prisma.company.findUnique({ where: { id: context.companyId }, select: { name: true } }).catch(() => null),
    ]);
    const m = (report as any).metrics || {};
    const lines = [
      `Empresa/vendedor: ${company?.name || `Empresa ${context.companyId}`}`,
      `Periodo: ${(report as any).period?.label || '7 dias'}`,
      '',
      'Resumo executivo',
      `Cards trabalhados: ${m.cardsChamados || 0}`,
      `Respostas: ${m.respostas || 0}`,
      `Conversoes/interessados: ${m.interessados || 0}`,
      `Taxa de resposta: ${this.pct(m.taxaResposta)}`,
      `Taxa de conversao: ${this.pct(m.taxaConversao)}`,
      (report as any).recommendation || '',
      '',
      'Funil',
      `Recebidos: ${m.cardsRecebidos || 0}`,
      `Entregues: ${m.cardsEntregues || 0}`,
      `Chamados: ${m.cardsChamados || 0}`,
      `Responderam: ${m.respostas || 0}`,
      `Interessados: ${m.interessados || 0}`,
      '',
      'Ranking',
      `Top segmentos: ${((report as any).rankings?.segments || []).map((item: any) => `${item.label} (${item.count})`).join(', ') || 'Sem dados'}`,
      `Top cidades: ${((report as any).rankings?.cities || []).map((item: any) => `${item.label} (${item.count})`).join(', ') || 'Sem dados'}`,
      `Top canais: ${((report as any).rankings?.channels || []).map((item: any) => `${item.label} (${item.count})`).join(', ') || 'Sem dados'}`,
      '',
      'Qualidade',
      `Score medio dos chamados: ${m.scoreMedioChamados ?? 'Sem dados'}`,
      `Score medio dos respondidos: ${m.scoreMedioRespondidos ?? 'Sem dados'}`,
      `Motivos comuns de descarte: ${((report as any).rankings?.discardReasons || []).map((item: any) => `${item.label} (${item.count})`).join(', ') || 'Sem dados'}`,
      '',
      'Recomendacoes HBX',
      `Priorize: ${m.melhorSegmento || 'segmentos com resposta'}`,
      `Cidade foco: ${m.melhorCidade || 'sua região'}`,
      `Canal foco: ${m.melhorCanal || 'WhatsApp'}`,
      'Seu Perfil de Venda pode ser ajustado com base nesses padrões.',
      '',
      'Gerado por HBX',
    ];
    const fileDate = new Date().toISOString().slice(0, 10);
    return {
      filename: `hbx-relatorio-conversao-${fileDate}.pdf`,
      buffer: this.buildSimplePdf(lines),
    };
  }

  async suggestWeeklySalesProfileForUser(user: any) {
    const context = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(context.companyId);
    if (!planAccess.capabilities.canUseWeeklyProfileSuggestions) {
      throw new ForbiddenException('Sugestão semanal disponível no HBX Lead.');
    }
    const [profilePayload, report] = await Promise.all([
      this.getEffectiveSalesProfileForContext(context, planAccess),
      this.getConversionReportForUser(user, '7d'),
    ]);
    const profile = profilePayload.effectiveProfile;
    const topSegments = ((report as any).rankings?.segments || []).map((item: any) => item.label).filter(Boolean).slice(0, 5);
    const topCities = ((report as any).rankings?.cities || []).map((item: any) => item.label).filter(Boolean).slice(0, 5);
    const topChannels = ((report as any).rankings?.channels || []).map((item: any) => item.label).filter(Boolean).slice(0, 4);
    const suggested = {
      whatDoYouSell: profile.whatDoYouSell,
      offerCategory: profile.offerCategory,
      targetAudience: { labels: profile.targetAudience || [] },
      targetSegments: { labels: this.sanitizeSalesProfileArray([...(profile.targetSegments || []), ...topSegments]) },
      avoidSegments: { labels: profile.avoidSegments || [], hardReject: profile.hardRejectSegments || [] },
      preferredCities: this.sanitizeSalesProfileArray([...(profile.preferredCities || []), ...topCities]),
      preferredStates: profile.preferredStates || [],
      preferredChannels: this.sanitizeSalesProfileArray(topChannels.length ? topChannels : profile.preferredChannels || ['whatsapp'], 8, 24),
      leadPreferences: {
        ...(profile.leadPreferences || {}),
        preferWhatsapp: true,
        preferInstagram: true,
        preferNoWebsite: true,
      },
      negativeRules: {
        ...(profile.negativeRules || {}),
        avoidDirectories: true,
        avoidNoPhone: true,
      },
      diff: [
        ...topSegments.filter((segment: string) => !(profile.targetSegments || []).includes(segment)).map((segment: string) => `Adicionar segmento: ${segment}`),
        ...topCities.filter((city: string) => !(profile.preferredCities || []).includes(city)).map((city: string) => `Priorizar cidade: ${city}`),
        'Evitar: sem telefone',
      ].slice(0, 8),
      generatedAt: new Date().toISOString(),
    };
    const existing = await (this.prisma as any).salesProfile.findFirst({
      where: { companyId: context.companyId, userId: context.userId },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => null);
    if (existing) {
      await (this.prisma as any).salesProfile.update({
        where: { id: existing.id },
        data: { suggestedProfileJson: this.serializeSalesProfileJson(suggested), lastSuggestedAt: new Date() },
      }).catch(() => null);
    }
    return { ok: true, suggestion: suggested, effectiveProfile: profile };
  }

  async applySalesProfileSuggestionForUser(user: any) {
    const context = this.resolveUserContext(user);
    const row = await (this.prisma as any).salesProfile.findFirst({
      where: { companyId: context.companyId, userId: context.userId },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => null);
    const suggestion = this.parseSalesProfileJson(row?.suggestedProfileJson, null);
    if (!suggestion) throw new BadRequestException('Nenhuma sugestão semanal disponível.');
    return this.updateSalesProfileForUser(user, {
      ...suggestion,
      weeklyAutoUpdateEnabled: Boolean(row?.weeklyAutoUpdateEnabled),
    });
  }

  async runWeeklySalesProfileSuggestions() {
    if (!(await this.prisma.hasTable('SalesProfile').catch(() => false))) return { ok: true, processed: 0 };
    const rows = await (this.prisma as any).salesProfile.findMany({
      where: { weeklyAutoUpdateEnabled: true },
      take: 200,
      orderBy: { updatedAt: 'asc' },
    }).catch(() => []);
    let processed = 0;
    for (const row of rows) {
      if (!row?.companyId || !row?.userId) continue;
      const fakeUser = { id: row.userId, companyId: row.companyId };
      await this.suggestWeeklySalesProfileForUser(fakeUser).catch(() => null);
      processed += 1;
    }
    return { ok: true, processed };
  }

  private async getOrCreateMasterWhatsappEngineCompanyId() {
    const existing = await this.prisma.company.findUnique({
      where: { slug: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG },
      select: { id: true },
    });
    if (existing?.id) return Number(existing.id);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: MASTER_WHATSAPP_ENGINE_COMPANY_NAME,
            slug: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
            onboardingStatus: 'active_paid',
            paymentStatus: 'MANUAL',
            subscriptionStatus: 'manual',
            premiumAccess: true,
            isActive: true,
            paymentMethod: 'MANUAL',
            billingProvider: 'manual',
            whatsappConnectionMode: 'TEMPORARY',
            whatsappModalProvider: 'external_modal',
            whatsappModalStatus: 'DISCONNECTED',
            whatsappModalUpdatedAt: new Date(),
          },
          select: { id: true },
        });
        await tx.importacaoPermissao.createMany({
          data: buildImportacaoPermissaoRows(company.id),
          skipDuplicates: true,
        });
        return company;
      });
      return Number(created.id);
    } catch (error: any) {
      if (this.isUniqueConstraintError(error)) {
        const recovered = await this.prisma.company.findUnique({
          where: { slug: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG },
          select: { id: true },
        });
        if (recovered?.id) return Number(recovered.id);
      }
      throw error;
    }
  }

  async enrichLeadForUser(user: any, leadId: string, opts?: { templateOffset?: number }) {
    const { companyId, userId } = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(companyId);
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: { id: normalizedLeadId, companyId },
      include: {
        timelineEvents: {
          orderBy: [{ createdAt: 'desc' }],
          take: 12,
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');

    let availability =
      (await this.listWhatsappAvailabilityByLeadIds([String(lead.id)])).get(String(lead.id)) || null;
    let verifiedBy: 'hbx_master' | 'client_engine' | 'manual' | null = String(availability?.message || '').includes('HBX Master')
      ? 'hbx_master'
      : availability?.checkedAt
        ? 'client_engine'
        : null;
    const phoneDigits = this.normalizePhone((lead as any).phoneNormalized || (lead as any).phone);
    const availabilityCheckedAt = availability?.checkedAt ? new Date(availability.checkedAt).getTime() : 0;
    const shouldRefreshWhatsapp =
      Boolean(phoneDigits) &&
      (!availabilityCheckedAt ||
        Number.isNaN(availabilityCheckedAt) ||
        Date.now() - availabilityCheckedAt > 30 * 24 * 60 * 60 * 1000);

    if (phoneDigits && shouldRefreshWhatsapp) {
      try {
        const masterCompanyId = await this.getOrCreateMasterWhatsappEngineCompanyId();
        const [lookup] = await this.webwhatsBridge.checkWhatsappNumbers(masterCompanyId, [phoneDigits]);
        if (lookup) {
          const status: VendasWhatsappAvailabilityStatus = lookup.exists ? 'available' : 'unavailable';
          const now = new Date();
          const phoneLabel = this.buildPreferredLeadContact(phoneDigits) || `+${phoneDigits}`;
          const message = lookup.exists
            ? `Consulta HBX Master confirmou WhatsApp para ${phoneLabel}.`
            : `Consulta HBX Master nao encontrou WhatsApp para ${phoneLabel}.`;
          availability = {
            status,
            checkedAt: now.toISOString(),
            phoneDigits,
            message,
          };
          verifiedBy = 'hbx_master';
          await this.prisma.vendasLeadTimelineEvent.create({
            data: {
              leadId: lead.id,
              ...this.buildTimelineEvent({
                eventType: 'generic',
                title: lookup.exists ? 'WhatsApp verificado pela HBX' : 'HBX nao encontrou WhatsApp',
                description: message,
                sourceType: VENDAS_WHATSAPP_LOOKUP_SOURCE,
                resultLabel: status,
                createdByUserId: userId,
              }),
            },
          }).catch(() => null);
        }
      } catch (error: any) {
        this.logger.warn(
          `[vendas-enrichment] Falha na verificacao Master lead=${lead.id} company=${companyId}: ${String(error?.message || error)}`,
        );
      }
    }

    return {
      ok: true,
      leadId: String(lead.id),
      planTier: planAccess.planTier,
      capabilities: planAccess.capabilities,
      whatsappAvailability: availability,
      leadIntelligence: this.applyLeadIntelligenceCapabilities(
        buildVendasLeadIntelligence({
          lead,
          whatsappAvailability: availability,
          verifiedBy,
          templateOffset: opts?.templateOffset,
        }),
        planAccess,
      ),
    };
  }

  async buildPresentationEmailDraftForUser(user: any, leadId: string) {
    const { companyId, userId } = this.resolveUserContext(user);
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: { id: normalizedLeadId, companyId },
      select: this.buildVendasLeadSelectWithoutAddress(),
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');

    const draft = buildHbxPresentationEmailDraft({
      leadName: lead.name,
      city: lead.city,
      state: lead.state,
      segment: lead.segment,
      website: lead.website,
      contactEmail: lead.email,
      sellerName: user?.name || user?.displayName || user?.email || 'HBX',
      companyName: 'HBX',
    });

    await this.prisma.vendasLeadTimelineEvent.create({
      data: {
        leadId: lead.id,
        ...this.buildTimelineEvent({
          eventType: 'presentation_draft_generated',
          title: 'Apresentacao comercial gerada',
          description: `Rascunho de e-mail gerado para copiar e revisar. Assunto: ${draft.subject}`,
          sourceType: 'email_draft',
          resultLabel: draft.channel,
          createdByUserId: userId,
        }),
      },
    });

    return draft;
  }

  private buildCommercialEmailTimelineDescription(input: Record<string, any>) {
    return JSON.stringify(input);
  }

  private async logCommercialEmailMessage(input: Record<string, any>) {
    if (!(await this.prisma.hasTable('CommercialEmailMessageLog').catch(() => false))) return null;
    return (this.prisma as any).commercialEmailMessageLog.create({
      data: {
        companyId: input.companyId || null,
        userId: input.userId || null,
        radarLeadId: input.radarLeadId || null,
        vendasLeadId: input.vendasLeadId || null,
        recipientEmail: this.normalizeEmail(input.recipientEmail) || String(input.recipientEmail || '').trim().toLowerCase(),
        recipientName: this.normalizeText(input.recipientName),
        subject: String(input.subject || '').trim(),
        text: input.text || null,
        html: input.html || null,
        status: String(input.status || 'draft').trim(),
        transport: input.transport || null,
        messageId: input.messageId || null,
        errorCode: input.errorCode || null,
        errorMessage: input.errorMessage || null,
        attachmentName: input.attachmentName || null,
        sentAt: input.sentAt ? new Date(input.sentAt) : null,
      },
    }).catch(() => null);
  }

  private assertLeadAllowsManualEmail(row: any) {
    const blockedStatuses = new Set([
      'negative',
      'opt_out',
      'optout',
      'do_not_contact',
      'blocked',
      'no_whatsapp',
      'invalid_phone',
      'invalid_whatsapp',
      'negative_reply',
    ]);
    const candidates = [row?.status, row?.lastResult, row?.nextAction, row?.shortNote]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    const blocked = candidates.find((value) => blockedStatuses.has(value) || value.includes('opt-out') || value.includes('nao contactar') || value.includes('não contactar'));
    if (blocked) {
      throw new BadRequestException('Este card está marcado como negativo/bloqueado e não pode receber sugestão ativa de envio.');
    }
  }

  private async assertEmailAllowsManualSend(recipientEmail: string) {
    const email = this.normalizeEmail(recipientEmail);
    if (!email) throw new BadRequestException('Informe o e-mail de destino.');
    if (!(await this.prisma.hasTable('CommercialEmailMessageLog').catch(() => false))) return email;
    const blocked = await (this.prisma as any).commercialEmailMessageLog.findFirst({
      where: {
        recipientEmail: email,
        status: { in: ['opted_out', 'do_not_contact'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    }).catch(() => null);
    if (blocked) throw new BadRequestException('Este e-mail está marcado como não contactar.');
    return email;
  }

  private async hasExistingVendasLeadForImport(companyId: number, phone: unknown, email: unknown) {
    const phoneCandidates = this.buildLeadPhoneNormalizedCandidates(phone);
    const emailNormalized = this.normalizeEmail(email);
    const or: any[] = [];
    if (phoneCandidates.length) or.push({ phoneNormalized: { in: phoneCandidates } });
    if (emailNormalized) or.push({ email: emailNormalized });
    if (!or.length) return false;
    const existing = await this.prisma.vendasLead.findFirst({
      where: { companyId, OR: or },
      select: { id: true },
    });
    return Boolean(existing?.id);
  }

  async previewPresentationEmailForUser(user: any, leadId: string, body?: any) {
    const { companyId, userId } = this.resolveUserContext(user);
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');
    const lead = await this.prisma.vendasLead.findFirst({
      where: { id: normalizedLeadId, companyId },
      select: this.buildVendasLeadSelectWithoutAddress(),
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');
    this.assertLeadAllowsManualEmail(lead);

    const fallbackDraft = buildHbxPresentationEmailDraft({
      leadName: lead.name,
      city: lead.city,
      state: lead.state,
      segment: lead.segment,
      website: lead.website,
      contactEmail: body?.recipientEmail || lead.email,
      sellerName: user?.name || user?.displayName || user?.email || 'HBX',
      companyName: 'HBX',
    });
    const preview = await this.hbxPresentationEmails.previewPresentationToContact({
      companyId,
      userId,
      recipientName: body?.recipientName || lead.name || 'cliente',
      recipientEmail: body?.recipientEmail || lead.email || '',
      companyName: lead.name || null,
      subject: body?.subject || fallbackDraft.subject,
      text: body?.text || fallbackDraft.body,
      html: body?.html,
      source: 'manual',
    });

    await this.logCommercialEmailMessage({
      companyId,
      userId,
      vendasLeadId: lead.id,
      recipientEmail: preview.recipientEmail || body?.recipientEmail || lead.email || 'pendente@hbx.local',
      recipientName: preview.recipientName,
      subject: preview.subject,
      text: preview.text,
      html: preview.html,
      status: 'draft',
      attachmentName: preview.attachment?.originalName || null,
    });
    await this.prisma.vendasLeadTimelineEvent.create({
      data: {
        leadId: lead.id,
        ...this.buildTimelineEvent({
          eventType: 'presentation_email_previewed',
          title: 'Apresentacao por e-mail preparada',
          description: this.buildCommercialEmailTimelineDescription({
            recipientEmail: preview.recipientEmail || null,
            subject: preview.subject,
          }),
          sourceType: 'email_presentation',
          resultLabel: 'preview',
          createdByUserId: userId,
        }),
      },
    });
    return preview;
  }

  async sendPresentationEmailForUser(user: any, leadId: string, body?: any) {
    const { companyId, userId } = this.resolveUserContext(user);
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');
    const lead = await this.prisma.vendasLead.findFirst({
      where: { id: normalizedLeadId, companyId },
      select: this.buildVendasLeadSelectWithoutAddress(),
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');
    let recipientEmail = '';
    try {
      this.assertLeadAllowsManualEmail(lead);
      recipientEmail = await this.assertEmailAllowsManualSend(body?.recipientEmail || lead.email);
    } catch (policyError: any) {
      await this.commercialUsageLimits.recordPresentationEmailResult(companyId, userId, {
        vendasLeadId: lead.id,
        recipientEmail: body?.recipientEmail || lead.email || null,
        status: 'blocked',
        reason: 'policy',
        errorMessage: String(policyError?.message || policyError),
      });
      throw policyError;
    }
    await this.commercialUsageLimits.assertCanSendPresentationEmail(companyId, userId);
    const recipientName = this.normalizeText(body?.recipientName || lead.name) || 'cliente';
    const subject = this.normalizeText(body?.subject);
    const text = this.normalizeText(body?.text);
    if (!subject) throw new BadRequestException('Informe o assunto do e-mail.');
    if (!text) throw new BadRequestException('Informe o corpo do e-mail.');

    try {
      await this.commercialUsageLimits.recordPresentationEmailAttempt(companyId, userId, {
        vendasLeadId: lead.id,
        recipientEmail,
        subject,
      });
      const result = await this.hbxPresentationEmails.sendPresentationToContact({
        companyId,
        userId,
        recipientName,
        recipientEmail,
        companyName: lead.name || null,
        subject,
        text,
        html: body?.html,
        source: 'manual',
      });
      const messageId = result.delivery?.messageId || null;
      const transport = result.delivery?.transport || null;
      await this.logCommercialEmailMessage({
        companyId,
        userId,
        vendasLeadId: lead.id,
        recipientEmail,
        recipientName,
        subject: result.subject,
        text,
        html: body?.html || result.delivery?.previewUrl || null,
        status: 'sent',
        transport,
        messageId,
        sentAt: result.sentAt,
        attachmentName: result.attachment?.originalName || null,
      });
      const delivery: any = result.delivery || {};
      const accepted = Array.isArray(delivery.accepted) ? delivery.accepted.map((value: any) => String(value || '').toLowerCase()) : [];
      const consumesQuota = Boolean(result.delivery?.ok === true || messageId || accepted.includes(recipientEmail.toLowerCase()));
      await this.commercialUsageLimits.recordPresentationEmailResult(companyId, userId, {
        vendasLeadId: lead.id,
        recipientEmail,
        subject: result.subject,
        status: consumesQuota ? 'sent' : 'failed',
        transport,
        messageId,
        reason: consumesQuota ? 'provider_confirmed' : 'provider_not_confirmed',
      });
      await this.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          ...this.buildTimelineEvent({
            eventType: 'presentation_email_sent',
            title: 'Apresentacao enviada por e-mail',
            description: this.buildCommercialEmailTimelineDescription({
              recipientEmail,
              subject: result.subject,
              sentAt: result.sentAt,
              messageId,
              transport,
            }),
            sourceType: 'email_presentation',
            resultLabel: 'sent',
            createdByUserId: userId,
          }),
        },
      });
      return result;
    } catch (error: any) {
      const errorMessage = String(error?.response?.message || error?.message || 'Falha ao enviar apresentacao.');
      await this.logCommercialEmailMessage({
        companyId,
        userId,
        vendasLeadId: lead.id,
        recipientEmail,
        recipientName,
        subject,
        text,
        html: body?.html || null,
        status: 'failed',
        errorCode: error?.status || error?.code || null,
        errorMessage,
      });
      await this.commercialUsageLimits.recordPresentationEmailResult(companyId, userId, {
        vendasLeadId: lead.id,
        recipientEmail,
        subject,
        status: 'failed',
        reason: 'provider_error',
        errorCode: error?.status || error?.code || null,
        errorMessage,
      });
      await this.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          ...this.buildTimelineEvent({
            eventType: 'presentation_email_failed',
            title: 'Falha no envio da apresentacao',
            description: this.buildCommercialEmailTimelineDescription({
              recipientEmail,
              subject,
              errorCode: error?.status || error?.code || null,
              errorMessage,
            }),
            sourceType: 'email_presentation',
            resultLabel: 'failed',
            createdByUserId: userId,
          }),
        },
      });
      throw error;
    }
  }

  private extractRadarLeadId(value: unknown) {
    const raw = String(value || '').trim();
    const match = raw.match(/^radar:([^:\s]+)$/i);
    return match?.[1] || null;
  }

  private async assertRadarLeadImportAllowed(context: { companyId: number }, radarLeadId?: string | null) {
    if (!radarLeadId) return;
    const [hasPool, hasOwnerColumn] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasColumn('RadarLeadPool', 'ownerCompanyId').catch(() => false),
    ]);
    if (!hasPool || !hasOwnerColumn) return;
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: radarLeadId },
      select: { id: true, ownerCompanyId: true, status: true },
    }).catch(() => null);
    if (!row) return;
    const ownerCompanyId = Math.trunc(Number(row.ownerCompanyId || 0)) || 0;
    if (ownerCompanyId && ownerCompanyId !== context.companyId) {
      throw new BadRequestException('Este card do Radar já está na carteira de outra empresa.');
    }
    const status = String(row.status || '').trim().toLowerCase();
    if (['negative', 'denied', 'blocked', 'opt_out', 'optout', 'do_not_contact', 'complaint', 'discarded', 'hidden', 'lost', 'no_whatsapp', 'invalid_whatsapp', 'invalid_phone'].includes(status)) {
      throw new BadRequestException('Este card do Radar está protegido e não pode ser enviado para Vendas.');
    }
  }

  private async syncRadarOwnershipAfterVendasImport(
    context: { companyId: number; userId: number },
    input: { radarLeadId?: string | null; vendasLeadId?: string | null },
  ) {
    if (!input.radarLeadId || !input.vendasLeadId) return;
    const [hasPool, hasState, hasEvent, hasOwnerColumn, hasClaimedColumn] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('RadarLeadCompanyState').catch(() => false),
      this.prisma.hasTable('RadarLeadEvent').catch(() => false),
      this.prisma.hasColumn('RadarLeadPool', 'ownerCompanyId').catch(() => false),
      this.prisma.hasColumn('RadarLeadPool', 'claimedAt').catch(() => false),
    ]);
    if (!hasPool || !hasState) return;
    const now = new Date();
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: input.radarLeadId },
      select: { id: true, ownerCompanyId: true, status: true },
    }).catch(() => null);
    if (!row) return;
    const ownerCompanyId = Math.trunc(Number(row.ownerCompanyId || 0)) || 0;
    if (ownerCompanyId && ownerCompanyId !== context.companyId) return;
    const previousStatus = String(row.status || 'clean').trim().toLowerCase() || 'clean';
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        ...(hasOwnerColumn && hasClaimedColumn ? { ownerCompanyId: context.companyId, claimedAt: now } : {}),
        status: 'sent_to_vendas',
        globalImportedCount: { increment: 1 },
        lastSeenAt: now,
      },
    }).catch(() => null);
    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        vendasLeadId: input.vendasLeadId,
        status: 'sent_to_vendas',
        lastActionAt: now,
      },
      update: {
        vendasLeadId: input.vendasLeadId,
        status: 'sent_to_vendas',
        lastActionAt: now,
      },
    }).catch(() => null);
    if (hasEvent) {
      await (this.prisma as any).radarLeadEvent.create({
        data: {
          leadId: row.id,
          companyId: context.companyId,
          eventType: 'imported_to_vendas',
          note: 'Card enviado para Vendas.',
          statusFrom: previousStatus,
          statusTo: 'sent_to_vendas',
          createdByUserId: context.userId,
        },
      }).catch(() => null);
    }
  }

  private async ensureCustomerProfile(input: {
    companyId: number;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    sourceType: 'manual' | 'webscraping';
    shortNote?: string | null;
  }) {
    const hasIdentity = Boolean(input.name || input.phone || input.email);
    if (!hasIdentity) return null;

    const profile = await this.customerProfileService.upsertProfile({
      companyId: input.companyId,
      name: input.name || null,
      phone: input.phone || null,
      email: input.email || null,
      externalSource: input.sourceType,
      status: 'active',
      notes: input.shortNote || null,
    });

    return profile?.id ? String(profile.id) : null;
  }

  private buildImportedLeadNote(input: {
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    shortNote?: string | null;
  }) {
    const base = this.normalizeText(input.shortNote);
    if (base) return base;

    const city = this.normalizeText(input.city);
    const segment = this.normalizeText(input.segment);
    if (!city && !segment) return 'Lead herdado do Radar Digital.';
    return `Lead herdado do Radar Digital${segment ? ` para ${segment}` : ''}${city ? ` em ${city}` : ''}.`;
  }

  private buildTimelineEvent(input: TimelineEventInput): TimelineEventRecord {
    return {
      eventType: String(input.eventType || 'generic').trim(),
      title: String(input.title || 'Atualizacao comercial').trim(),
      description: this.normalizeText(input.description),
      sourceType: this.normalizeText(input.sourceType),
      statusFrom: this.normalizeText(input.statusFrom),
      statusTo: this.normalizeText(input.statusTo),
      resultLabel: this.normalizeText(input.resultLabel),
      returnAt: input.returnAt || null,
      createdByUserId: Number(input.createdByUserId || 0) || null,
    };
  }

  private normalizeLeadConversationPhone(value: unknown) {
    const digits = this.normalizePhone(value);
    return digits ? `+${digits}` : null;
  }

  private buildLeadPhoneCandidates(value: unknown) {
    const digits = this.normalizePhone(value);
    if (!digits) return [];

    const candidates = new Set<string>();
    for (const candidate of buildWhatsAppPhoneCandidates(digits)) {
      if (candidate) candidates.add(candidate);
    }

    const raw = String(value || '').trim();
    if (raw) candidates.add(raw);
    return [...candidates];
  }

  private buildLeadPhoneNormalizedCandidates(value: unknown) {
    const digits = this.customerProfileService.normalizePhone(value);
    if (!digits) return [];

    const candidates = new Set<string>();
    const canonical = this.normalizePhone(digits);
    if (canonical) candidates.add(canonical);
    candidates.add(digits);
    if (digits.startsWith('55') && digits.length > 11) {
      candidates.add(digits.slice(2));
    } else if (digits.length === 10 || digits.length === 11) {
      candidates.add(`55${digits}`);
    }
    return [...candidates].filter(Boolean);
  }

  private buildPreferredLeadContact(value: unknown) {
    const digits = this.normalizePhone(value);
    if (!digits) return null;
    return `+${digits}`;
  }

  private readVendasAgendaQueueMetadata(metadata: Record<string, any>) {
    const queue = metadata?.vendasAgendaQueue;
    if (!queue || typeof queue !== 'object' || Array.isArray(queue)) return null;
    return queue as VendasAgendaQueueMetadata;
  }

  private readVendasProspeccaoMetadata(metadata: Record<string, any>) {
    const state = metadata?.vendasProspeccao;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    return state as VendasProspeccaoMetadata;
  }

  private addHoursIso(value: string | null | undefined, hours: number) {
    const parsed = new Date(String(value || ''));
    if (!Number.isFinite(parsed.getTime())) return null;
    return new Date(parsed.getTime() + hours * 60 * 60 * 1000).toISOString();
  }

  private buildVendasProspeccaoMetadata(
    stage: VendasProspeccaoStage,
    row: any,
    current?: VendasProspeccaoMetadata | null,
    queue?: VendasAgendaQueueMetadata | null,
    extra?: Partial<VendasProspeccaoMetadata>,
  ): VendasProspeccaoMetadata {
    const hasExtra = (key: keyof VendasProspeccaoMetadata) =>
      Boolean(extra && Object.prototype.hasOwnProperty.call(extra, key));
    const firstOutboundAt = this.normalizeText(
      extra?.firstOutboundAt ||
        current?.firstOutboundAt ||
        queue?.manualSentAt ||
        queue?.lastManualSendAt ||
        null,
    );
    const replyDeadlineAt =
      extra?.replyDeadlineAt === undefined
        ? current?.replyDeadlineAt || this.addHoursIso(firstOutboundAt, 24)
        : extra.replyDeadlineAt || null;
    return {
      ...(current || {}),
      stage,
      firstOutboundAt,
      lastInboundAt: hasExtra('lastInboundAt') ? extra?.lastInboundAt || null : current?.lastInboundAt || null,
      replyDeadlineAt,
      leadSegment: this.normalizeText(extra?.leadSegment || current?.leadSegment || row?.segment),
      campaignSegment: this.normalizeText(extra?.campaignSegment || current?.campaignSegment || null),
      mismatchReason: hasExtra('mismatchReason')
        ? this.normalizeText(extra?.mismatchReason)
        : this.normalizeText(current?.mismatchReason || null),
    };
  }

  private shouldMirrorLeadToInboxAgenda(row: any) {
    if (!row || this.isClosedLead(row)) return false;
    return this.classifyLeadBlock(row) === 'today';
  }

  private buildSalesAgendaDraftMessage(
    row: any,
    currentQueue?: VendasAgendaQueueMetadata | null,
    options?: { draftMessageOverride?: string | null },
  ) {
    const sourceType = String(row?.sourceType || row?.primarySource || 'manual').trim().toLowerCase();
    const inheritedDraftMessage = this.normalizeText(
      options?.draftMessageOverride || currentQueue?.inheritedDraftMessage || currentQueue?.draftMessage,
    );
    if (sourceType === 'webscraping' && inheritedDraftMessage) {
      return inheritedDraftMessage;
    }
    const name = this.normalizeText(row?.name);
    if (name) {
      return `Olá, ${name}. Estou retomando nosso contato pelo HBX Vendas. Quando puder, me responda por aqui.`;
    }
    return 'Olá. Estou retomando nosso contato pelo HBX Vendas. Quando puder, me responda por aqui.';
  }

  private buildVendasAgendaQueueMetadata(
    row: any,
    currentQueue?: VendasAgendaQueueMetadata | null,
    options?: { forceScheduled?: boolean; draftMessageOverride?: string | null; whatsappAvailabilityStatus?: VendasWhatsappAvailabilityStatus | null },
  ) {
    const manualQueueOverride = options?.forceScheduled
      ? null
      : this.normalizeText(currentQueue?.manualQueueOverride);
    const draftMessage = this.buildSalesAgendaDraftMessage(row, currentQueue, options);
    const nextAction = this.normalizeText(row?.nextAction);
    const returnAt = row?.returnAt instanceof Date ? row.returnAt.toISOString() : this.parseDate(row?.returnAt)?.toISOString() || null;
    const status = this.normalizeStatus(row?.status);
    const manualSentAt = options?.forceScheduled
      ? null
      : this.normalizeText(currentQueue?.manualSentAt || currentQueue?.lastManualSendAt);
    const manualSent = options?.forceScheduled ? false : Boolean(currentQueue?.manualSent || manualSentAt);
    const inheritedDraftMessage = this.normalizeText(
      options?.draftMessageOverride || currentQueue?.inheritedDraftMessage || null,
    );
    if (manualQueueOverride && manualQueueOverride !== 'scheduled') {
      const syncedAt = new Date().toISOString();
      return {
        ...(currentQueue || {}),
        active: false,
        leadId: String(row?.id || '').trim() || currentQueue?.leadId || null,
        sourceModule: 'vendas',
        sourceBlock: this.classifyLeadBlock(row),
        queueTarget: 'prospeccao',
        routeTarget: 'prospeccao',
        status,
        nextAction,
        returnAt,
        draftMessage,
        draftPending: false,
        syncedAt,
        deactivatedAt: currentQueue?.deactivatedAt || syncedAt,
        manualSent,
        manualSentAt,
        botEligible: false,
        botEntryPending: false,
        manualQueueOverride,
        manualQueueOverriddenAt: options?.forceScheduled ? null : this.normalizeText(currentQueue?.manualQueueOverriddenAt),
        inheritedDraftMessage,
      } satisfies VendasAgendaQueueMetadata;
    }
    const contentChanged =
      String(currentQueue?.draftMessage || '').trim() !== draftMessage ||
      String(currentQueue?.nextAction || '').trim() !== String(nextAction || '').trim() ||
      String(currentQueue?.returnAt || '').trim() !== String(returnAt || '').trim() ||
      String(currentQueue?.status || '').trim() !== status;
    const preserveConsumedDraft =
      Boolean(currentQueue?.active) && currentQueue?.draftPending === false && !contentChanged;

    return {
      active: true,
      leadId: String(row?.id || '').trim() || null,
      sourceModule: 'vendas',
      sourceBlock: this.classifyLeadBlock(row),
      queueTarget: 'prospeccao',
      routeTarget: 'prospeccao',
      status,
      nextAction,
      returnAt,
      draftMessage,
      draftPending: preserveConsumedDraft ? false : true,
      syncedAt: new Date().toISOString(),
      deactivatedAt: null,
      lastManualSendAt: options?.forceScheduled
        ? null
        : this.normalizeText(currentQueue?.lastManualSendAt || manualSentAt),
      manualSent,
      manualSentAt,
      botEligible: currentQueue?.botEligible === true,
      botEntryPending: currentQueue?.botEntryPending === true,
      manualQueueOverride: manualQueueOverride === 'scheduled' ? null : manualQueueOverride,
      manualQueueOverriddenAt:
        manualQueueOverride === 'scheduled' || options?.forceScheduled
          ? null
          : this.normalizeText(currentQueue?.manualQueueOverriddenAt),
      inheritedDraftMessage,
      whatsappAvailabilityStatus: options?.whatsappAvailabilityStatus || currentQueue?.whatsappAvailabilityStatus || null,
    } satisfies VendasAgendaQueueMetadata;
  }

  private conversationMatchesLeadPhone(conversationContact: unknown, lead: any) {
    const conversationDigits = this.normalizePhone(conversationContact);
    const leadDigits = this.normalizePhone(lead?.phoneNormalized || lead?.phone);
    if (!conversationDigits || !leadDigits) return false;
    if (conversationDigits === leadDigits) return true;
    const leadCandidates = this.buildLeadPhoneCandidates(leadDigits)
      .map((candidate) => this.normalizePhone(candidate))
      .filter((candidate): candidate is string => Boolean(candidate));
    const conversationCandidates = this.buildLeadPhoneCandidates(conversationDigits)
      .map((candidate) => this.normalizePhone(candidate))
      .filter((candidate): candidate is string => Boolean(candidate));
    return leadCandidates.some((candidate) => Boolean(candidate && conversationCandidates.includes(candidate)));
  }

  private async findConversationByPhone(companyId: number, phoneRaw: unknown) {
    const digits = this.normalizePhone(phoneRaw);
    if (!digits) return null;
    const candidates = this.buildLeadPhoneCandidates(phoneRaw);
    const candidateDigits = Array.from(
      new Set(
        candidates
          .map((candidate) => this.normalizePhone(candidate))
          .filter((candidate): candidate is string => Boolean(candidate)),
      ),
    );

    return this.prisma.companyConversation.findFirst({
      where: {
        companyId,
        channel: 'whatsapp',
        OR: [
          ...(candidates.length ? [{ contact: { in: candidates } }] : []),
          ...candidateDigits.map((candidate) => ({ contact: { contains: candidate } })),
          ...candidateDigits.map((candidate) => ({ contact: { endsWith: candidate } })),
          ...candidates.map((candidate) => ({ metadata: { contains: candidate } })),
        ],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    });
  }

  private async activateLeadInInboxAgenda(
    companyId: number,
    row: any,
    options?: { forceScheduled?: boolean; draftMessageOverride?: string | null; whatsappAvailabilityStatus?: VendasWhatsappAvailabilityStatus | null },
  ) {
    const phoneRaw = row?.phoneNormalized || row?.phone;
    const contact = this.buildPreferredLeadContact(phoneRaw) || this.normalizeLeadConversationPhone(phoneRaw);
    if (!contact) {
      return { activated: 0, updated: 0, skippedWithoutPhone: 1 };
    }

    const conversation =
      (await this.findConversationByPhone(companyId, phoneRaw)) ||
      (await this.conversations.getOrCreateConversationForContact(companyId, contact));
    const metadata = this.parseConversationMetadata(conversation?.metadata);
    const currentQueue = this.readVendasAgendaQueueMetadata(metadata);
    const currentProspeccao = this.readVendasProspeccaoMetadata(metadata);
    const nextQueue = this.buildVendasAgendaQueueMetadata(row, currentQueue, options);
    const nextStage: VendasProspeccaoStage =
      nextQueue.whatsappAvailabilityStatus === 'unavailable'
        ? 'no_whatsapp'
        : options?.forceScheduled
          ? 'pending_send'
          : nextQueue.manualSent || nextQueue.manualSentAt
            ? 'sent_waiting'
            : 'pending_send';
    const nextProspeccao = this.buildVendasProspeccaoMetadata(
      nextStage,
      row,
      currentProspeccao,
      nextQueue,
      {
        firstOutboundAt: options?.forceScheduled ? null : undefined,
        replyDeadlineAt: options?.forceScheduled ? null : undefined,
        leadSegment: this.normalizeText(row?.segment),
        mismatchReason: null,
      },
    );
    const changed =
      JSON.stringify(currentQueue || null) !== JSON.stringify(nextQueue) ||
      JSON.stringify(currentProspeccao || null) !== JSON.stringify(nextProspeccao);

    if (changed) {
      await this.conversations.updateConversationState(companyId, conversation.id, {
        metadata: {
          ...metadata,
          sourceModule: 'vendas',
          queueTarget: 'prospeccao',
          routeTarget: 'prospeccao',
          whatsappAvailabilityStatus: options?.whatsappAvailabilityStatus || nextQueue.whatsappAvailabilityStatus || null,
          vendasAgendaQueue: nextQueue,
          vendasProspeccao: nextProspeccao,
        },
        lastInteractionAt: new Date(),
      });
    }

    return {
      activated: currentQueue?.active ? 0 : 1,
      updated: currentQueue?.active && changed ? 1 : 0,
      skippedWithoutPhone: 0,
      conversationId: conversation.id,
    };
  }

  private async moveLeadWithoutWhatsappToInboxTrash(
    companyId: number,
    row: any,
    availability?: VendasWhatsappAvailabilityState | null,
    options?: { draftMessageOverride?: string | null },
  ) {
    const phoneRaw = row?.phoneNormalized || row?.phone;
    const contact = this.buildPreferredLeadContact(phoneRaw) || this.normalizeLeadConversationPhone(phoneRaw);
    if (!contact) {
      return { updated: 0, skippedWithoutPhone: 1, conversationId: null as string | number | null };
    }

    const conversation =
      (await this.findConversationByPhone(companyId, phoneRaw)) ||
      (await this.conversations.getOrCreateConversationForContact(companyId, contact));
    const metadata = this.parseConversationMetadata(conversation?.metadata);
    const currentQueue = this.readVendasAgendaQueueMetadata(metadata);
    const currentProspeccao = this.readVendasProspeccaoMetadata(metadata);
    const now = new Date().toISOString();
    const status = this.normalizeStatus(row?.status);
    const nextAction = this.normalizeText(row?.nextAction);
    const returnAt = row?.returnAt instanceof Date ? row.returnAt.toISOString() : this.parseDate(row?.returnAt)?.toISOString() || null;
    const draftMessage = this.buildSalesAgendaDraftMessage(row, currentQueue, options);
    const nextQueue: VendasAgendaQueueMetadata = {
      ...(currentQueue || {}),
      active: false,
      leadId: String(row?.id || '').trim() || currentQueue?.leadId || null,
      sourceModule: 'vendas',
      sourceBlock: this.classifyLeadBlock(row),
      queueTarget: 'excluidos',
      routeTarget: 'excluidos',
      status,
      nextAction,
      returnAt,
      draftMessage,
      draftPending: false,
      syncedAt: now,
      deactivatedAt: now,
      lastManualSendAt: currentQueue?.lastManualSendAt || null,
      manualSent: Boolean(currentQueue?.manualSent || currentQueue?.manualSentAt),
      manualSentAt: currentQueue?.manualSentAt || null,
      botEligible: false,
      botEntryPending: false,
      manualQueueOverride: 'archived',
      manualQueueOverriddenAt: now,
      inheritedDraftMessage: this.normalizeText(
        options?.draftMessageOverride || currentQueue?.inheritedDraftMessage || null,
      ),
      whatsappAvailabilityStatus: availability?.status || 'unavailable',
    };

    await this.conversations.updateConversationState(companyId, conversation.id, {
      botActive: false,
      humanAssigned: false,
      flowResult: 'local_deleted',
      metadata: {
        ...metadata,
        sourceModule: 'vendas',
        queueTarget: 'excluidos',
        routeTarget: 'excluidos',
        whatsappAvailabilityStatus: 'unavailable',
        whatsappAvailabilityCheckedAt: availability?.checkedAt || now,
        inboxManualQueueOverride: 'archived',
        inboxManualQueueOverriddenAt: now,
        inboxLocalDeleted: true,
        inboxLocalDeletedAt: now,
        vendasAgendaQueue: nextQueue,
        vendasProspeccao: this.buildVendasProspeccaoMetadata('no_whatsapp', row, currentProspeccao, nextQueue, {
          leadSegment: this.normalizeText(row?.segment),
          mismatchReason: null,
        }),
      },
      lastInteractionAt: new Date(),
    });
    this.logger.log(`[prospeccao] whatsapp unavailable, movendo para excluidos conversation=${conversation.id} lead=${String(row?.id || '-')}`);

    return { updated: 1, skippedWithoutPhone: 0, conversationId: conversation.id };
  }

  private async deactivateLeadInInboxAgenda(
    companyId: number,
    phoneRaw: unknown,
    leadId: string,
    options?: { whatsappAvailabilityStatus?: VendasWhatsappAvailabilityStatus | null },
  ) {
    const conversation = await this.findConversationByPhone(companyId, phoneRaw);
    if (!conversation) return false;

    const metadata = this.parseConversationMetadata(conversation.metadata);
    const currentQueue = this.readVendasAgendaQueueMetadata(metadata);
    if (!currentQueue) return false;
    if (currentQueue.leadId && String(currentQueue.leadId) !== String(leadId)) return false;
    if (currentQueue.active === false && currentQueue.draftPending === false) return false;

    await this.conversations.updateConversationState(companyId, conversation.id, {
      metadata: {
        ...metadata,
        vendasAgendaQueue: {
          ...currentQueue,
          active: false,
          draftPending: false,
          botEligible: false,
          botEntryPending: false,
          whatsappAvailabilityStatus: options?.whatsappAvailabilityStatus || currentQueue.whatsappAvailabilityStatus || null,
          syncedAt: new Date().toISOString(),
          deactivatedAt: new Date().toISOString(),
        },
      },
    });
    return true;
  }

  private async syncLeadToInboxAgenda(
    companyId: number,
    row: any,
    previous?: any,
    options?: { forceScheduled?: boolean; draftMessageOverride?: string | null; whatsappAvailabilityStatus?: VendasWhatsappAvailabilityStatus | null },
  ) {
    const result = {
      activated: 0,
      updated: 0,
      deactivated: 0,
      skippedWithoutPhone: 0,
      skippedWithoutWhatsapp: 0,
      conversationId: null as string | number | null,
    };

    const currentPhone = row?.phoneNormalized || row?.phone || null;
    const previousPhone = previous?.phoneNormalized || previous?.phone || null;

    if (options?.forceScheduled || this.shouldMirrorLeadToInboxAgenda(row)) {
      const syncResult = await this.activateLeadInInboxAgenda(companyId, row, options);
      result.activated += syncResult.activated;
      result.updated += syncResult.updated;
      result.skippedWithoutPhone += syncResult.skippedWithoutPhone;
      result.conversationId = syncResult.conversationId || null;
    } else {
      const deactivated = await this.deactivateLeadInInboxAgenda(
        companyId,
        currentPhone || previousPhone,
        String(row?.id || previous?.id || ''),
      );
      if (deactivated) result.deactivated += 1;
    }

    if (
      previousPhone &&
      this.normalizePhone(previousPhone) &&
      this.normalizePhone(previousPhone) !== this.normalizePhone(currentPhone)
    ) {
      const deactivatedPrevious = await this.deactivateLeadInInboxAgenda(
        companyId,
        previousPhone,
        String(row?.id || previous?.id || ''),
      );
      if (deactivatedPrevious) result.deactivated += 1;
    }

    return result;
  }

  async syncTodayAgendaForUser(user: any, options?: { leadIds?: string[] }) {
    const context = this.resolveUserContext(user);
    this.logger.log(`[vendas-agenda] Iniciando espelhamento de cards de hoje para company=${context.companyId}`);
    let rows: any[] = [];
    try {
      rows = await this.prisma.vendasLead.findMany({
        where: { companyId: context.companyId },
        orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error: any) {
      if (!this.isMissingAddressColumnError(error)) throw error;
      rows = await this.prisma.vendasLead.findMany({
        where: { companyId: context.companyId },
        orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: this.buildVendasLeadSelectWithoutAddress(),
      });
    }
    const requestedLeadIds = Array.isArray(options?.leadIds)
      ? new Set(
          (options?.leadIds || [])
            .map((leadId) => String(leadId || '').trim())
            .filter(Boolean),
        )
      : null;
    const filteredSync = Boolean(requestedLeadIds);
    const todayRows = rows.filter((row) => {
      if (requestedLeadIds) {
        if (this.isClosedLead(row)) return false;
        return requestedLeadIds.has(String(row?.id || '').trim());
      }
      return this.shouldMirrorLeadToInboxAgenda(row);
    });
    const whatsappAvailabilityByLeadId = await this.ensureWhatsappAvailabilityForRows(
      context.companyId,
      context.userId,
      todayRows,
    );

    const rowById = new Map(rows.map((row) => [String(row.id), row]));
    const activeLeadIds = new Set<string>();
    let activated = 0;
    let updated = 0;
    let deactivated = 0;
    let skippedWithoutPhone = 0;
    let skippedWithoutWhatsapp = 0;
    const conversationIds = new Set<string>();
    const leadConversationIds: Record<string, string> = {};

    for (const row of todayRows) {
      const availability = whatsappAvailabilityByLeadId.get(String(row.id)) || null;
      if (availability?.status === 'unavailable') {
        skippedWithoutWhatsapp += 1;
        const unavailableResult = await this.moveLeadWithoutWhatsappToInboxTrash(
          context.companyId,
          row,
          availability,
        );
        skippedWithoutPhone += unavailableResult.skippedWithoutPhone;
        if (unavailableResult.conversationId) {
          const conversationId = String(unavailableResult.conversationId);
          conversationIds.add(conversationId);
          leadConversationIds[String(row.id)] = conversationId;
        }
        continue;
      }
      activeLeadIds.add(String(row.id));
      const syncResult = await this.syncLeadToInboxAgenda(context.companyId, row, undefined, {
        forceScheduled: true,
        whatsappAvailabilityStatus: availability?.status || 'available',
      });
      const conversationIdRaw = 'conversationId' in syncResult ? syncResult.conversationId : null;
      if (conversationIdRaw) {
        const conversationId = String(conversationIdRaw);
        conversationIds.add(conversationId);
        leadConversationIds[String(row.id)] = conversationId;
      }
      activated += syncResult.activated;
      updated += syncResult.updated;
      deactivated += syncResult.deactivated;
      skippedWithoutPhone += syncResult.skippedWithoutPhone;
      skippedWithoutWhatsapp += syncResult.skippedWithoutWhatsapp;
    }

    const mirroredConversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId: context.companyId,
        channel: 'whatsapp',
        metadata: { contains: '"vendasAgendaQueue"' },
      },
      select: {
        id: true,
        contact: true,
        metadata: true,
      },
    });

    for (const conversation of mirroredConversations) {
      const metadata = this.parseConversationMetadata(conversation.metadata);
      const queue = this.readVendasAgendaQueueMetadata(metadata);
      if (!queue?.active) continue;

      const leadId = String(queue.leadId || '').trim();
      if (filteredSync && leadId && !requestedLeadIds?.has(leadId)) continue;
      const linkedLead = leadId ? rowById.get(leadId) || null : null;
      const shouldStayActive =
        Boolean(linkedLead) &&
        (filteredSync ? !this.isClosedLead(linkedLead) : this.shouldMirrorLeadToInboxAgenda(linkedLead)) &&
        this.conversationMatchesLeadPhone(conversation.contact, linkedLead);

      if (shouldStayActive) continue;

      await this.conversations.updateConversationState(context.companyId, conversation.id, {
        metadata: {
          ...metadata,
          ...(queue.whatsappAvailabilityStatus === 'unavailable'
            ? {
                queueTarget: 'excluidos',
                routeTarget: 'excluidos',
                inboxManualQueueOverride: 'archived',
                inboxLocalDeleted: true,
              }
            : {}),
          vendasAgendaQueue: {
            ...queue,
            active: false,
            draftPending: false,
            botEligible: false,
            botEntryPending: false,
            queueTarget: queue.whatsappAvailabilityStatus === 'unavailable' ? 'excluidos' : queue.queueTarget || 'prospeccao',
            routeTarget: queue.whatsappAvailabilityStatus === 'unavailable' ? 'excluidos' : queue.routeTarget || 'prospeccao',
            syncedAt: new Date().toISOString(),
            deactivatedAt: new Date().toISOString(),
          },
        },
      });
      deactivated += 1;
    }

    const todayLeadCount = todayRows.length;
    const activeMirroredConversations = await this.prisma.companyConversation.findMany({
      where: {
        companyId: context.companyId,
        channel: 'whatsapp',
        metadata: { contains: '"vendasAgendaQueue"' },
      },
      select: {
        metadata: true,
      },
    });
    const activeMirroredLeadIds = new Set<string>();
    for (const conversation of activeMirroredConversations) {
      const queue = this.readVendasAgendaQueueMetadata(this.parseConversationMetadata(conversation.metadata));
      const leadId = String(queue?.leadId || '').trim();
      if (queue?.active && leadId && activeLeadIds.has(leadId)) {
        activeMirroredLeadIds.add(leadId);
      }
    }
    Object.keys(leadConversationIds).forEach((leadId) => {
      if (activeLeadIds.has(leadId)) activeMirroredLeadIds.add(leadId);
    });
    const mirroredLeadCount = activeMirroredLeadIds.size;

    const allTodaySkippedByWhatsapp =
      todayLeadCount > 0 &&
      mirroredLeadCount === 0 &&
      skippedWithoutWhatsapp >= todayLeadCount;

    if (todayLeadCount > 0 && mirroredLeadCount === 0 && !allTodaySkippedByWhatsapp) {
      this.logger.error(
        `[vendas-agenda] Falha operacional: nenhum card de hoje foi espelhado company=${context.companyId} today=${todayLeadCount} skippedWithoutPhone=${skippedWithoutPhone} skippedWithoutWhatsapp=${skippedWithoutWhatsapp}`,
      );
      throw new BadRequestException(
        skippedWithoutPhone > 0
          ? filteredSync
            ? 'Nenhum card selecionado foi preparado na Prospecção porque os leads estao sem telefone valido.'
            : 'Nenhum card de hoje foi preparado na Prospecção porque os leads estao sem telefone valido.'
          : filteredSync
            ? 'Nenhum card selecionado foi preparado na Prospecção.'
            : 'Nenhum card de hoje foi preparado na Prospecção.',
      );
    }

    if (allTodaySkippedByWhatsapp) {
      this.logger.warn(
        `[vendas-agenda] Todos os cards de hoje foram ignorados por falta de WhatsApp company=${context.companyId} today=${todayLeadCount} skippedWithoutWhatsapp=${skippedWithoutWhatsapp}`,
      );
    }

    const message = todayLeadCount
      ? skippedWithoutWhatsapp > 0
        ? `${mirroredLeadCount} card(s) preparados na Prospecção. ${skippedWithoutWhatsapp} numero(s) foram movidos para Excluídos porque o motor nao encontrou WhatsApp.`
        : filteredSync
          ? `${mirroredLeadCount} card(s) selecionados preparados na Prospecção com roteiro pendente para envio manual.`
          : `${mirroredLeadCount} card(s) de hoje preparados na Prospecção com roteiro pendente para envio manual.`
      : filteredSync
        ? 'Nao ha cards selecionados para preparar na Prospecção.'
        : 'Nao ha cards de hoje para preparar na Prospecção.';
    this.logger.log(
      `[vendas-agenda] Espelhamento concluido company=${context.companyId} today=${todayLeadCount} mirrored=${mirroredLeadCount} activated=${activated} updated=${updated} deactivated=${deactivated} skippedWithoutPhone=${skippedWithoutPhone} skippedWithoutWhatsapp=${skippedWithoutWhatsapp}`,
    );

    return {
      ok: true,
      todayLeadCount,
      mirroredLeadCount,
      conversationIds: Array.from(conversationIds),
      leadConversationIds,
      activated,
      updated,
      deactivated,
      skippedWithoutPhone,
      skippedWithoutWhatsapp,
      message,
    };
  }

  private buildImportPreviewPayload(row: any, phoneDigits: string, sharedProfile?: any) {
    const payload = row ? this.buildLeadPayload(row, sharedProfile) : null;
    return {
      phoneDigits,
      existsInCrm: Boolean(payload),
      leadId: payload?.id || null,
      leadName: payload?.name || null,
      status: payload?.status || null,
      statusLabel: payload?.statusLabel || null,
      signals: payload?.signals || {
        alreadyExisted: false,
        cameFromWebscraping: false,
        hadPreviousContact: false,
        wasClosedBefore: false,
      },
      attemptCount: payload?.attemptCount || 0,
      lastContactAt: payload?.lastContactAt || null,
      lastResult: payload?.lastResult || null,
      timesSeen: payload?.timesSeen || 0,
      sourceType: payload?.sourceType || null,
      primarySource: payload?.primarySource || null,
      sharedProfile: payload?.sharedProfile || sharedProfile || null,
    };
  }

  private async createOrUpdateLead(input: {
    companyId: number;
    userId: number;
    sourceType: 'manual' | 'webscraping';
    sourceHistoryId?: string | null;
    sourceSignature?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    website?: string | null;
    rating?: number | null;
    reviews?: number | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    status?: string | null;
    nextAction?: string | null;
    returnAt?: Date | null;
    shortNote?: string | null;
    planAccess?: VendasPlanAccess | null;
    uniqueRetry?: boolean;
  }) {
    const leadBaseSelectWithoutAddress: any = this.buildVendasLeadSelectWithoutAddress();
    const leadWithTimelineSelectWithoutAddress: any = {
      ...leadBaseSelectWithoutAddress,
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      },
    };
    const phoneNormalized = this.normalizePhone(input.phone);
    const email = this.normalizeEmail(input.email);
    const name = this.normalizeText(input.name);
    const addressColumnAvailable = await this.hasVendasLeadAddressColumn();
    const address = addressColumnAvailable ? this.normalizeText(input.address) : null;
    const website = this.normalizeText(input.website);
    const rating = input.rating == null || !Number.isFinite(Number(input.rating))
      ? null
      : Math.min(Math.max(Number(Number(input.rating).toFixed(1)), 0), 5);
    const reviews = input.reviews == null || !Number.isFinite(Number(input.reviews))
      ? 0
      : Math.max(0, Math.trunc(Number(input.reviews)));
    const shortNote = this.normalizeText(input.shortNote);
    const nextAction = this.normalizeText(input.nextAction) || 'Primeiro contato';
    const status = this.normalizeStatus(input.status);
    const returnAt = input.returnAt || new Date();
    const customerProfileId = await this.ensureCustomerProfile({
      companyId: input.companyId,
      name,
      phone: input.phone || null,
      email,
      sourceType: input.sourceType,
      shortNote,
    });

    const baseData: any = {
      customerProfileId,
      sourceType: input.sourceType,
      primarySource: input.sourceType,
      sourceHistoryId: this.normalizeText(input.sourceHistoryId),
      sourceSignature: this.normalizeText(input.sourceSignature),
      timesSeen: 1,
      name,
      phone: this.normalizeText(input.phone),
      phoneNormalized,
      email,
      ...(addressColumnAvailable ? { address } : {}),
      website,
      rating,
      reviews,
      city: this.normalizeText(input.city),
      state: this.normalizeText(input.state)?.toUpperCase().slice(0, 2) || null,
      segment: this.normalizeText(input.segment),
      status,
      nextAction,
      returnAt,
      shortNote,
      lastContactAt: null,
      attemptCount: 0,
      lastResult: null,
      wasClosedBefore: status === 'encerrado',
      closedAt: status === 'encerrado' ? new Date() : null,
      createdByUserId: input.userId,
    };
    if (phoneNormalized) {
      const phoneNormalizedCandidates = this.buildLeadPhoneNormalizedCandidates(input.phone);
      let existing: any = null;
      try {
        existing = await this.prisma.vendasLead.findFirst({
          where: {
            companyId: input.companyId,
            phoneNormalized: { in: phoneNormalizedCandidates.length ? phoneNormalizedCandidates : [phoneNormalized] },
          },
          orderBy: [{ updatedAt: 'desc' }],
          ...(addressColumnAvailable ? {} : { select: leadBaseSelectWithoutAddress }),
        });
      } catch (error: any) {
        if (!this.isMissingAddressColumnError(error)) throw error;
        existing = await this.prisma.vendasLead.findFirst({
          where: {
            companyId: input.companyId,
            phoneNormalized: { in: phoneNormalizedCandidates.length ? phoneNormalizedCandidates : [phoneNormalized] },
          },
          orderBy: [{ updatedAt: 'desc' }],
          select: leadBaseSelectWithoutAddress,
        });
      }

      if (existing) {
        const existingStatus = this.normalizeStatus(existing.status || status);
        const shouldReopenImportedLead =
          input.sourceType === 'webscraping' &&
          (existingStatus === 'encerrado' || Boolean(existing.closedAt));
        const nextStatus = status === 'encerrado'
          ? 'encerrado'
          : shouldReopenImportedLead
            ? status
            : existingStatus;
        const wasClosedBefore = Boolean(existing.wasClosedBefore) || Boolean(existing.closedAt) || String(existing.status || '') === 'encerrado';
        const updateData: any = {
          customerProfileId: customerProfileId || existing.customerProfileId,
          sourceType: input.sourceType,
          primarySource: existing.primarySource || existing.sourceType || input.sourceType,
          sourceHistoryId: baseData.sourceHistoryId || existing.sourceHistoryId,
          sourceSignature: baseData.sourceSignature || existing.sourceSignature,
          timesSeen: Math.max(1, Math.trunc(Number(existing.timesSeen || 0) || 1)) + 1,
          name: baseData.name || existing.name,
          phone: baseData.phone || existing.phone,
          phoneNormalized: baseData.phoneNormalized || existing.phoneNormalized,
          email: baseData.email || existing.email,
          ...(addressColumnAvailable ? { address: baseData.address || existing.address } : {}),
          website: baseData.website || existing.website,
          rating: baseData.rating ?? existing.rating ?? null,
          reviews: Math.max(Math.trunc(Number(baseData.reviews || 0) || 0), Math.trunc(Number(existing.reviews || 0) || 0)),
          city: baseData.city || existing.city,
          state: baseData.state || existing.state,
          segment: baseData.segment || existing.segment,
          nextAction: baseData.nextAction || existing.nextAction,
          returnAt: baseData.returnAt || existing.returnAt,
          shortNote: baseData.shortNote || existing.shortNote,
          status: nextStatus,
          wasClosedBefore: wasClosedBefore || nextStatus === 'encerrado',
          closedAt:
            nextStatus === 'encerrado'
              ? existing.closedAt || new Date()
              : null,
        };

        let updated: any = null;
        try {
          updated = await this.prisma.$transaction(async (tx) => {
            await tx.vendasLead.update({
              where: { id: existing.id },
              data: updateData,
            });

            await tx.vendasLeadTimelineEvent.create({
              data: {
                leadId: existing.id,
                ...this.buildTimelineEvent({
                  eventType: 'lead_reused',
                  title: 'Lead reaproveitado por deduplicacao',
                  description: `Um novo envio via ${this.formatSourceLabel(input.sourceType)} encontrou este telefone e atualizou o card existente.`,
                  sourceType: input.sourceType,
                  createdByUserId: input.userId,
                }),
              },
            });

            return tx.vendasLead.findUniqueOrThrow({
              where: { id: existing.id },
              ...(addressColumnAvailable
                ? {
                    include: {
                      timelineEvents: {
                        orderBy: [{ createdAt: 'desc' }],
                        take: 12,
                      },
                    },
                  }
                : { select: leadWithTimelineSelectWithoutAddress }),
            } as any);
          });
        } catch (error: any) {
          if (!this.isMissingAddressColumnError(error)) throw error;
          const { address: _ignoredAddress, ...updateDataWithoutAddress } = updateData;
          updated = await this.prisma.$transaction(async (tx) => {
            await tx.vendasLead.update({
              where: { id: existing.id },
              data: updateDataWithoutAddress,
            });

            await tx.vendasLeadTimelineEvent.create({
              data: {
                leadId: existing.id,
                ...this.buildTimelineEvent({
                  eventType: 'lead_reused',
                  title: 'Lead reaproveitado por deduplicacao',
                  description: `Um novo envio via ${this.formatSourceLabel(input.sourceType)} encontrou este telefone e atualizou o card existente.`,
                  sourceType: input.sourceType,
                  createdByUserId: input.userId,
                }),
              },
            });

            return tx.vendasLead.findUniqueOrThrow({
              where: { id: existing.id },
              select: leadWithTimelineSelectWithoutAddress,
            });
          });
        }

        return {
          action: 'updated',
          reusedExisting: true,
          lead: this.buildLeadPayload(updated, undefined, undefined, undefined, input.planAccess),
        };
      }
    }

    let created: any = null;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.vendasLead.create({
          data: {
            companyId: input.companyId,
            ...baseData,
          },
        });

      await tx.vendasLeadTimelineEvent.createMany({
        data: [
          {
            leadId: row.id,
            ...this.buildTimelineEvent({
              eventType: 'lead_created',
              title: 'Lead criado',
              description: 'O lead entrou no CRM de Vendas e passou a fazer parte da agenda viva.',
              createdByUserId: input.userId,
            }),
          },
          {
            leadId: row.id,
            ...this.buildTimelineEvent({
              eventType: 'origin_registered',
              title: 'Origem registrada',
              description: `Origem principal definida como ${this.formatSourceLabel(input.sourceType)}.`,
              sourceType: input.sourceType,
              createdByUserId: input.userId,
            }),
          },
          ...(input.sourceType === 'manual' && returnAt
            ? [
                {
                  leadId: row.id,
                  ...this.buildTimelineEvent({
                    eventType: 'return_scheduled',
                    title: 'Retorno agendado',
                    description: `Primeira proxima acao definida como "${nextAction}".`,
                    returnAt,
                    createdByUserId: input.userId,
                  }),
                },
              ]
            : []),
        ],
      });

        return tx.vendasLead.findUniqueOrThrow({
          where: { id: row.id },
          ...(addressColumnAvailable
            ? {
                include: {
                  timelineEvents: {
                    orderBy: [{ createdAt: 'desc' }],
                    take: 12,
                  },
                },
              }
            : { select: leadWithTimelineSelectWithoutAddress }),
        } as any);
      });
    } catch (error: any) {
      if (this.isUniqueConstraintError(error) && !input.uniqueRetry) {
        return this.createOrUpdateLead({ ...input, uniqueRetry: true });
      }
      if (!this.isMissingAddressColumnError(error)) throw error;
      const { address: _ignoredAddress, ...baseDataWithoutAddress } = baseData;
      created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.vendasLead.create({
          data: {
            companyId: input.companyId,
            ...baseDataWithoutAddress,
          },
        });

        await tx.vendasLeadTimelineEvent.createMany({
          data: [
            {
              leadId: row.id,
              ...this.buildTimelineEvent({
                eventType: 'lead_created',
                title: 'Lead criado',
                description: 'O lead entrou no CRM de Vendas e passou a fazer parte da agenda viva.',
                createdByUserId: input.userId,
              }),
            },
            {
              leadId: row.id,
              ...this.buildTimelineEvent({
                eventType: 'origin_registered',
                title: 'Origem registrada',
                description: `Origem principal definida como ${this.formatSourceLabel(input.sourceType)}.`,
                sourceType: input.sourceType,
                createdByUserId: input.userId,
              }),
            },
            ...(input.sourceType === 'manual' && returnAt
              ? [
                  {
                    leadId: row.id,
                    ...this.buildTimelineEvent({
                      eventType: 'return_scheduled',
                      title: 'Retorno agendado',
                      description: `Primeira proxima acao definida como "${nextAction}".`,
                      returnAt,
                      createdByUserId: input.userId,
                    }),
                  },
                ]
              : []),
          ],
        });

        return tx.vendasLead.findUniqueOrThrow({
          where: { id: row.id },
          select: leadWithTimelineSelectWithoutAddress,
        });
      });
    }

    return {
      action: 'created',
      reusedExisting: false,
      lead: this.buildLeadPayload(created, undefined, undefined, undefined, input.planAccess),
    };
  }

  async previewWebscrapingImportForUser(user: any, dto: ImportWebscrapingLeadsDto) {
    const context = this.resolveUserContext(user);
    const leadBaseSelectWithoutAddress: any = {
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
      city: true,
      state: true,
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
    };
    const incomingLeads = Array.isArray(dto?.leads) ? dto.leads : [];
    const phoneNormalizeds = Array.from(
      new Set(
        incomingLeads
          .map((item) => this.normalizePhone(item?.phone || item?.phoneDigits || null))
          .filter(Boolean) as string[],
      ),
    );
    const lookupPhoneNormalizeds = Array.from(
      new Set(
        incomingLeads.flatMap((item) => this.buildLeadPhoneNormalizedCandidates(item?.phone || item?.phoneDigits || null)),
      ),
    );

    if (!phoneNormalizeds.length) {
      return { items: [] };
    }

    let rows: any[] = [];
    try {
      rows = await this.prisma.vendasLead.findMany({
        where: {
          companyId: context.companyId,
          phoneNormalized: { in: lookupPhoneNormalizeds.length ? lookupPhoneNormalizeds : phoneNormalizeds },
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
    } catch (error: any) {
      if (!this.isMissingAddressColumnError(error)) throw error;
      rows = await this.prisma.vendasLead.findMany({
        where: {
          companyId: context.companyId,
          phoneNormalized: { in: lookupPhoneNormalizeds.length ? lookupPhoneNormalizeds : phoneNormalizeds },
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: leadBaseSelectWithoutAddress,
      });
    }

    const byPhone = new Map<string, any>();
    for (const row of rows) {
      const key = String(row?.phoneNormalized || '').trim();
      if (!key) continue;
      const candidates = this.buildLeadPhoneNormalizedCandidates(key);
      for (const candidate of candidates) {
        if (!byPhone.has(candidate)) byPhone.set(candidate, row);
      }
    }

    const sharedMap = await this.customerProfileService.buildSharedContextRegistry(context.companyId, {
      profileIds: rows.map((row) => row.customerProfileId).filter(Boolean),
      phoneNormalizeds: lookupPhoneNormalizeds.length ? lookupPhoneNormalizeds : phoneNormalizeds,
    });

    return {
      items: phoneNormalizeds.map((phoneDigits) => {
        const row = byPhone.get(phoneDigits) || null;
        const sharedProfile =
          row?.customerProfileId
            ? sharedMap.byProfileId.get(String(row.customerProfileId)) ?? null
            : sharedMap.byPhoneNormalized.get(String(phoneDigits)) ?? null;
        return this.buildImportPreviewPayload(row, phoneDigits, sharedProfile);
      }),
    };
  }

  async getBoardForUser(user: any) {
    const context = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(context.companyId);
    const leadWithTimelineSelectWithoutAddress: any = this.buildVendasLeadSelectWithoutAddress({
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      },
    });
    let rows: any[] = [];
    try {
      rows = await this.prisma.vendasLead.findMany({
        where: { companyId: context.companyId },
        orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 240,
        include: {
          timelineEvents: {
            orderBy: [{ createdAt: 'desc' }],
            take: 12,
          },
        },
      });
    } catch (error: any) {
      if (!this.isMissingAddressColumnError(error)) throw error;
      rows = await this.prisma.vendasLead.findMany({
        where: { companyId: context.companyId },
        orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 240,
        select: leadWithTimelineSelectWithoutAddress,
      });
    }
    const whatsappAvailabilityByLeadId = await this.ensureWhatsappAvailabilityForRows(
      context.companyId,
      context.userId,
      rows.filter((row) => {
        if (this.isClosedLead(row)) return false;
        const source = String(row?.primarySource || row?.sourceType || '').trim().toLowerCase();
        return source === 'webscraping';
      }),
    );

    const sharedMap = await this.customerProfileService.buildSharedContextRegistry(context.companyId, {
      profileIds: rows.map((row) => row.customerProfileId).filter(Boolean),
      phoneNormalizeds: rows.map((row) => row.phoneNormalized || row.phone).filter(Boolean),
    });
    const leadInboxPresence = new Map<string, { conversationId: string }>();
    const leadIds = rows.map((row) => String(row?.id || '').trim()).filter(Boolean);
    if (leadIds.length) {
      const mirroredConversations = await this.prisma.companyConversation.findMany({
        where: {
          companyId: context.companyId,
          channel: 'whatsapp',
          metadata: { contains: '"vendasAgendaQueue"' },
        },
        select: {
          id: true,
          metadata: true,
        },
      });
      for (const conversation of mirroredConversations) {
        const queue = this.readVendasAgendaQueueMetadata(this.parseConversationMetadata(conversation.metadata));
        const leadId = String(queue?.leadId || '').trim();
        if (!queue?.active || !leadId || !leadIds.includes(leadId)) continue;
        leadInboxPresence.set(leadId, { conversationId: String(conversation.id) });
      }
    }

    const blocks = {
      today: [] as any[],
      overdue: [] as any[],
      scheduled: [] as any[],
      closed: [] as any[],
    };

    for (const row of rows) {
      const sharedProfile =
        row?.customerProfileId
          ? sharedMap.byProfileId.get(String(row.customerProfileId)) ?? null
          : sharedMap.byPhoneNormalized.get(String(row.phoneNormalized || '')) ?? null;
      const payload = this.buildLeadPayload(
        row,
        sharedProfile,
        whatsappAvailabilityByLeadId.get(String(row.id)) || null,
        leadInboxPresence.get(String(row.id)) || null,
        planAccess,
      );
      blocks[payload.block].push(payload);
    }

    return {
      summary: {
        total: rows.length,
        today: blocks.today.length,
        overdue: blocks.overdue.length,
        scheduled: blocks.scheduled.length,
        closed: blocks.closed.length,
      },
      planTier: planAccess.planTier,
      capabilities: planAccess.capabilities,
      blocks,
    };
  }

  async createManualLeadForUser(user: any, dto: CreateManualVendasLeadDto) {
    const context = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(context.companyId);
    if (!this.normalizeText(dto?.name) && !this.normalizeText(dto?.phone) && !this.normalizeText(dto?.email)) {
      throw new BadRequestException('Informe ao menos nome, telefone ou e-mail para criar o lead.');
    }

    const result = await this.createOrUpdateLead({
      companyId: context.companyId,
      userId: context.userId,
      sourceType: 'manual',
      name: dto?.name || null,
      phone: dto?.phone || null,
      email: dto?.email || null,
      address: dto?.address || null,
      website: dto?.website || null,
      rating: dto?.rating ?? null,
      reviews: dto?.reviews ?? null,
      status: dto?.status || 'novo',
      nextAction: dto?.nextAction || 'Primeiro contato',
      returnAt: this.parseDate(dto?.returnAt) || new Date(),
      shortNote: dto?.shortNote || null,
      planAccess,
    });

    await this.syncLeadToInboxAgenda(context.companyId, result.lead);

    return {
      ok: true,
      ...result,
    };
  }

  async importWebscrapingLeadsForUser(user: any, dto: ImportWebscrapingLeadsDto) {
    const context = this.resolveUserContext(user);
    const planAccess = await this.resolvePlanAccessForCompany(context.companyId);
    const salesProfilePayload = await this.getEffectiveSalesProfileForContext(context, planAccess);
    const salesProfile = salesProfilePayload.effectiveProfile;
    const incomingLeads = Array.isArray(dto?.leads) ? dto.leads : [];
    if (!incomingLeads.length) {
      throw new BadRequestException('Nenhum lead do Radar Digital foi enviado para o CRM.');
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedDuplicateCount = 0;
    let skippedProtectedCount = 0;
    let skippedByFilterCount = 0;
    let skippedByQualityCount = 0;
    let skippedBySegmentMismatchCount = 0;
    let skippedGenericDirectoryCount = 0;
    let skippedWeakContactCount = 0;
    let skippedInvalidQualityCount = 0;
    let skippedByQualityV2Count = 0;
    let skippedByRiskCount = 0;
    let skippedBySegmentFitCount = 0;
    let skippedByContactabilityCount = 0;
    let quotaDebited = 0;
    let pendingQuotaReservations = 0;
    const importedLeads: any[] = [];
    const importedLeadPairs: Array<{
      lead: any;
      item: any;
      action: string;
      radarLeadId: string | null;
      duplicateInCompany: boolean;
      billableCandidate: boolean;
      delivered: boolean;
      skipReason?: string | null;
    }> = [];
    const failedImports: Array<{ name: string | null; phone: string | null; error: string }> = [];

    for (const item of incomingLeads) {
      const itemName = this.normalizeText(item?.name);
      const itemPhone = this.normalizeText(item?.phone);
      const itemPhoneDigits = this.normalizeText(item?.phoneDigits);
      if (!itemName || !itemPhone || !itemPhoneDigits) {
        failedImports.push({
          name: itemName,
          phone: itemPhone || itemPhoneDigits,
          error: 'Lead do Radar Digital sem nome, telefone ou telefone normalizado.',
        });
        continue;
      }
      const qualityV2 = this.extractLeadQualityV2FromImportItem(item) || calculateLeadQualityV2({
        lead: item,
        enrichment: (item as any)?.enrichmentJson || {},
        context: {
          requestedSegment: item?.segment || null,
          requestedCity: item?.city || null,
          requestedState: item?.state || null,
          salesProfile,
        },
      });
      if (qualityV2 && (qualityV2.decision === 'protect' || qualityV2.decision === 'discard')) {
        skippedByQualityV2Count += 1;
        skippedByQualityCount += 1;
        skippedByFilterCount += 1;
        if (qualityV2.decision === 'protect' || qualityV2.riskScore >= 80) {
          skippedByRiskCount += 1;
          skippedProtectedCount += 1;
        }
        if (qualityV2.discardReason === 'segment_mismatch' || qualityV2.segmentFitScore < 35) {
          skippedBySegmentFitCount += 1;
          skippedBySegmentMismatchCount += 1;
        }
        if (qualityV2.discardReason === 'weak_contactability' || qualityV2.contactabilityScore < 30) {
          skippedByContactabilityCount += 1;
          skippedWeakContactCount += 1;
        }
        if (qualityV2.discardReason === 'generic_directory') skippedGenericDirectoryCount += 1;
        if (qualityV2.discardReason === 'weak_identity') skippedInvalidQualityCount += 1;
        failedImports.push({
          name: itemName,
          phone: itemPhone || itemPhoneDigits,
          error: [
            qualityV2.decision === 'protect' ? 'Lead protegido pelo LeadQualityV2.' : 'Lead descartado pelo LeadQualityV2.',
            qualityV2.protectionReason || qualityV2.discardReason || null,
            qualityV2.reasons?.[0] || null,
            'Descartados nao consomem limite.',
          ].filter(Boolean).join(' '),
        });
        continue;
      }
      const quality = qualityV2 ? null : this.extractLeadQualityFromImportItem(item);
      const blockedByQuality = !qualityV2 && (quality?.billable === false || (quality?.status && quality.status !== 'approved'));
      if (blockedByQuality) {
        skippedByQualityCount += 1;
        if (quality?.status === 'segment_mismatch') skippedBySegmentMismatchCount += 1;
        if (quality?.status === 'generic_directory') skippedGenericDirectoryCount += 1;
        if (quality?.status === 'weak_contact') skippedWeakContactCount += 1;
        if (quality?.status === 'invalid') skippedInvalidQualityCount += 1;
        failedImports.push({
          name: itemName,
          phone: itemPhone || itemPhoneDigits,
          error: 'Lead descartado pela qualidade minima do segmento. Descartados nao consomem limite.',
        });
        continue;
      }
      const sourceHistoryId = this.normalizeText(item?.sourceHistoryId) || this.normalizeText(dto?.sourceHistoryId);
      const radarLeadId = this.extractRadarLeadId(sourceHistoryId);

      let result: any;
      let duplicateInCompany = false;
      try {
        await this.assertRadarLeadImportAllowed(context, radarLeadId);
        duplicateInCompany = await this.hasExistingVendasLeadForImport(
          context.companyId,
          itemPhone || itemPhoneDigits,
          item?.email || null,
        );
        if (duplicateInCompany) skippedDuplicateCount += 1;
        if (!duplicateInCompany) {
          const usageSnapshot = await this.commercialUsageLimits.assertCanImportCard(context.companyId, context.userId);
          const companyRemaining = Number((usageSnapshot as any)?.cards?.remaining);
          const perUserLimit = (usageSnapshot as any)?.cards?.perUserLimit;
          const userRemaining =
            perUserLimit != null
              ? Number((usageSnapshot as any)?.cards?.userLimit || 0) - Number((usageSnapshot as any)?.cards?.userUsed || 0)
              : companyRemaining;
          const effectiveRemaining = Math.min(
            ...[companyRemaining, userRemaining].filter((value) => Number.isFinite(value)),
          );
          if (Number.isFinite(effectiveRemaining) && pendingQuotaReservations >= effectiveRemaining) {
            throw new ConflictException({
              code: 'DAILY_CARD_LIMIT_REACHED',
              message: 'Limite diário atingido. O contador reinicia às 00:00.',
              usage: usageSnapshot,
            });
          }
        }
        result = await this.createOrUpdateLead({
          companyId: context.companyId,
          userId: context.userId,
          sourceType: 'webscraping',
          sourceHistoryId,
          sourceSignature: [this.normalizeText(item?.segment), this.normalizeText(item?.city)].filter(Boolean).join('|') || null,
          name: itemName,
          phone: itemPhone || itemPhoneDigits,
          email: item?.email || null,
          address: item?.address || null,
          website: item?.website || null,
          rating: item?.rating ?? null,
          reviews: item?.reviews ?? null,
          city: item?.city || null,
          state: item?.state || null,
          segment: item?.segment || null,
          status: 'novo',
          nextAction: 'Primeiro contato',
          returnAt: new Date(),
          shortNote: this.normalizeText(item?.shortNote),
          planAccess,
        });
      } catch (error: any) {
        const errorText = String(error?.message || error || '');
        if (/protegido|negativo|bloque|opt-out|outra empresa/i.test(errorText)) skippedProtectedCount += 1;
        failedImports.push({
          name: this.normalizeText(item?.name),
          phone: this.normalizeText(item?.phone || item?.phoneDigits),
          error: errorText || 'Falha ao importar lead.',
        });
        this.logger.warn(
          `[vendas-import] Lead ignorado por falha no import company=${context.companyId} phone=${this.normalizeText(item?.phone || item?.phoneDigits) || '-'} error=${String(error?.message || error)}`,
        );
        continue;
      }

      const radarEnrichmentMetadata = {
        emailStatus: this.normalizeText((item as any)?.emailStatus),
        emailSource: this.normalizeText((item as any)?.emailSource),
        emailConfidence: Number((item as any)?.emailConfidence || 0) || null,
        websiteStatus: this.normalizeText((item as any)?.websiteStatus),
        instagramUrl: this.normalizeText((item as any)?.instagramUrl),
        facebookUrl: this.normalizeText((item as any)?.facebookUrl),
        socialStatus: this.normalizeText((item as any)?.socialStatus),
        socialConfidence: Number((item as any)?.socialConfidence || 0) || null,
        primarySocial: this.normalizeText((item as any)?.primarySocial),
        googleMapsUrl: this.normalizeText((item as any)?.googleMapsUrl),
        businessCategory: this.normalizeText((item as any)?.businessCategory),
        openingHoursStatus: this.normalizeText((item as any)?.openingHoursStatus),
        recommendedChannel: this.normalizeText((item as any)?.recommendedChannel),
        painType: this.normalizeText((item as any)?.painType),
        painLabel: this.normalizeText((item as any)?.painLabel),
        painPitch: this.normalizeText((item as any)?.painPitch),
        enrichmentScore: Number((item as any)?.enrichmentScore || 0) || null,
        enrichmentConfidence: Number((item as any)?.enrichmentConfidence || 0) || null,
        opportunityScore: Number((item as any)?.opportunityScore || 0) || null,
        opportunityReason: this.normalizeText((item as any)?.opportunityReason || item?.shortNote),
        source: this.normalizeText((item as any)?.source),
        sourceEngine: this.normalizeText((item as any)?.sourceEngine),
        sourceUrl: this.normalizeText((item as any)?.sourceUrl),
        enrichment: (item as any)?.enrichmentJson || null,
        qualityV2,
        quality,
      };
      if (Object.values(radarEnrichmentMetadata).some((value) => Boolean(value))) {
        await this.prisma.vendasLeadTimelineEvent.create({
          data: {
            leadId: result.lead?.id,
            ...this.buildTimelineEvent({
              eventType: 'radar_enrichment_imported',
              title: 'Inteligencia do Radar preservada',
              description: JSON.stringify(radarEnrichmentMetadata),
              sourceType: 'radar_enrichment',
              resultLabel: radarEnrichmentMetadata.recommendedChannel || null,
              createdByUserId: context.userId,
            }),
          },
        }).catch(() => null);
      }

      if (result.action === 'created') {
        createdCount += 1;
      } else {
        updatedCount += 1;
      }
      importedLeads.push(result.lead);
      importedLeadPairs.push({
        lead: result.lead,
        item,
        action: result.action,
        radarLeadId,
        duplicateInCompany,
        billableCandidate: result.action === 'created' && !duplicateInCompany,
        delivered: false,
        skipReason: null,
      });
      if (result.action === 'created' && !duplicateInCompany) {
        pendingQuotaReservations += 1;
      }
      await this.syncRadarOwnershipAfterVendasImport(context, {
        radarLeadId,
        vendasLeadId: result.lead?.id || null,
      });
    }

    if (!importedLeadPairs.length) {
      throw new BadRequestException(
        skippedByQualityCount > 0 && skippedByQualityCount === incomingLeads.length
          ? 'Nenhum lead passou na qualidade minima para esse segmento. Descartados nao consomem limite.'
          : failedImports.length
          ? `Nenhum lead foi importado. Primeira falha: ${failedImports[0]?.error || 'erro desconhecido'}`
          : 'Nenhum lead valido do Radar Digital foi enviado para o CRM.',
      );
    }

    let skippedWithoutWhatsapp = 0;
    let deliveredCount = 0;
    const skipWhatsappValidation = Boolean((dto as any)?.skipWhatsappValidation);
    const whatsappAvailabilityByLeadId = skipWhatsappValidation
      ? new Map<string, VendasWhatsappAvailabilityState>()
      : await this.ensureWhatsappAvailabilityForRows(
          context.companyId,
          context.userId,
          importedLeadPairs.map((entry) => entry.lead),
        );
    for (const entry of importedLeadPairs) {
      const availability = whatsappAvailabilityByLeadId.get(String(entry.lead?.id || '')) || null;
      if (availability?.status === 'unavailable') {
        skippedWithoutWhatsapp += 1;
        skippedByFilterCount += 1;
        entry.delivered = false;
        entry.skipReason = 'whatsapp_unavailable';
        await this.moveLeadWithoutWhatsappToInboxTrash(
          context.companyId,
          entry.lead,
          availability,
          { draftMessageOverride: this.normalizeText(entry.item?.scriptText) },
        );
        continue;
      }
      await this.syncLeadToInboxAgenda(context.companyId, entry.lead, undefined, {
        forceScheduled: true,
        draftMessageOverride: this.normalizeText(entry.item?.scriptText),
        whatsappAvailabilityStatus: skipWhatsappValidation ? 'unknown' : availability?.status || 'available',
      });
      entry.delivered = true;
      deliveredCount += 1;
      if (entry.billableCandidate) {
        await this.commercialUsageLimits.recordCardImport(context.companyId, context.userId, {
          source: 'vendas_import',
          radarLeadId: entry.radarLeadId,
          vendasLeadId: entry.lead?.id || null,
          status: 'created',
        });
        quotaDebited += 1;
      }
    }

    return {
      ok: true,
      createdCount,
      updatedCount,
      skippedWithoutWhatsapp,
      whatsappValidationSkipped: skipWhatsappValidation,
      failedCount: failedImports.length,
      failedImports,
      rawFoundCount: incomingLeads.length,
      eligibleCount: importedLeadPairs.length,
      deliveredCount,
      quotaDebited,
      skippedByQualityCount,
      skippedByQualityV2Count,
      skippedByRiskCount,
      skippedBySegmentFitCount,
      skippedByContactabilityCount,
      skippedBySegmentMismatchCount,
      skippedGenericDirectoryCount,
      skippedWeakContactCount,
      skippedInvalidQualityCount,
      skippedNegativeCount: skippedProtectedCount,
      skippedDuplicateCount,
      skippedProtectedCount,
      skippedByFilterCount,
      leads: importedLeads,
      message:
        skippedWithoutWhatsapp > 0
          ? `${deliveredCount} lead(s) entregues ao CRM. ${skippedWithoutWhatsapp} numero(s) foram descartados porque o motor nao encontrou WhatsApp. Descartados nao consomem limite.`
          : failedImports.length > 0
            ? `${deliveredCount} lead(s) entregues ao CRM. ${failedImports.length} falharam ou foram descartados. Descartados nao consomem limite.`
            : skipWhatsappValidation
              ? `${deliveredCount} lead(s) enviados ao CRM de Vendas sem validacao pelo motor WhatsApp. Descartados nao consomem limite.`
              : createdCount && updatedCount
            ? `${createdCount} lead(s) novos e ${updatedCount} atualizado(s) no CRM de Vendas. Descartados nao consomem limite.`
            : createdCount
              ? `${createdCount} lead(s) enviados ao CRM de Vendas. Descartados nao consomem limite.`
              : `${updatedCount} lead(s) já existentes foram atualizados no CRM de Vendas. Descartados nao consomem limite.`,
    };
  }

  async updateLeadForUser(user: any, leadId: string, dto: UpdateVendasLeadDto) {
    const context = this.resolveUserContext(user);
    const addressColumnAvailable = await this.hasVendasLeadAddressColumn();
    const leadWithTimelineSelectWithoutAddress: any = this.buildVendasLeadSelectWithoutAddress({
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      },
    });
    const existing = await this.prisma.vendasLead.findFirst({
      where: {
        id: String(leadId || '').trim(),
        companyId: context.companyId,
      },
      ...(addressColumnAvailable ? {} : { select: this.buildVendasLeadSelectWithoutAddress() }),
    });

    if (!existing) {
      throw new NotFoundException('Lead comercial nao encontrado.');
    }

    const nextStatus = dto?.status ? this.normalizeStatus(dto.status) : this.normalizeStatus(existing.status);
    const returnAt = dto?.returnAt !== undefined
      ? (this.parseDate(dto.returnAt) || null)
      : existing.returnAt;
    const phone = dto?.phone !== undefined ? this.normalizeText(dto.phone) : existing.phone;
    const email = dto?.email !== undefined ? this.normalizeEmail(dto.email) : existing.email;
    const name = dto?.name !== undefined ? this.normalizeText(dto.name) : existing.name;
    const address = addressColumnAvailable
      ? (dto?.address !== undefined ? this.normalizeText(dto.address) : existing.address)
      : null;
    const shortNote = dto?.shortNote !== undefined ? this.normalizeText(dto.shortNote) : existing.shortNote;
    const nextAction = dto?.nextAction !== undefined ? this.normalizeText(dto.nextAction) : existing.nextAction;
    const phoneNormalized = this.normalizePhone(phone);
    const duplicateLead = phoneNormalized
      ? await this.prisma.vendasLead.findFirst({
          where: {
            companyId: context.companyId,
            phoneNormalized,
            id: { not: existing.id },
          },
          select: { id: true, name: true },
        })
      : null;

    if (duplicateLead) {
      throw new BadRequestException(
        `Já existe um lead para este telefone no CRM: ${String(duplicateLead.name || duplicateLead.id)}.`,
      );
    }

    const customerProfileId =
      (await this.ensureCustomerProfile({
        companyId: context.companyId,
        name,
        phone,
        email,
        sourceType: existing.sourceType === 'webscraping' ? 'webscraping' : 'manual',
        shortNote,
      })) || existing.customerProfileId;
    const statusChanged = this.normalizeStatus(existing.status) !== nextStatus;
    const shouldRegisterContact = statusChanged && nextStatus !== 'novo';
    const nextAttemptCount = Math.max(0, Math.trunc(Number(existing.attemptCount || 0) || 0)) + (shouldRegisterContact ? 1 : 0);
    const nextLastContactAt = shouldRegisterContact ? new Date() : existing.lastContactAt;
    const nextLastResult = shouldRegisterContact ? this.formatStatusLabel(nextStatus) : existing.lastResult;
    const wasClosedBefore = Boolean(existing.wasClosedBefore) || Boolean(existing.closedAt) || String(existing.status || '') === 'encerrado' || nextStatus === 'encerrado';

    const timelineEvents: TimelineEventRecord[] = [];
    const existingReturnAt = existing.returnAt instanceof Date ? existing.returnAt : null;
    const returnChanged =
      (existingReturnAt?.getTime() || 0) !== (returnAt instanceof Date ? returnAt.getTime() : 0);

    if (statusChanged) {
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'status_changed',
          title: 'Status alterado',
          description: `O lead saiu de ${this.formatStatusLabel(this.normalizeStatus(existing.status))} para ${this.formatStatusLabel(nextStatus)}.`,
          statusFrom: this.normalizeStatus(existing.status),
          statusTo: nextStatus,
          createdByUserId: context.userId,
        }),
      );
    }

    if (shouldRegisterContact) {
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'contact_made',
          title: 'Contato realizado',
          description: nextAction
            ? `A proxima acao registrada foi "${nextAction}".`
            : 'Um novo movimento comercial foi registrado neste lead.',
          statusTo: nextStatus,
          createdByUserId: context.userId,
        }),
      );
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'result_recorded',
          title: 'Resultado informado',
          description: `Resultado atual marcado como ${this.formatStatusLabel(nextStatus)}.`,
          resultLabel: this.formatStatusLabel(nextStatus),
          statusTo: nextStatus,
          createdByUserId: context.userId,
        }),
      );
    }

    if (returnChanged && returnAt) {
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'return_scheduled',
          title: 'Retorno agendado',
          description: nextAction
            ? `Retorno reposicionado com a acao "${nextAction}".`
            : 'A agenda deste lead recebeu um novo retorno.',
          returnAt,
          createdByUserId: context.userId,
        }),
      );
    }

    if (nextStatus === 'encerrado' && this.normalizeStatus(existing.status) !== 'encerrado') {
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'lead_closed',
          title: 'Lead encerrado',
          description: shortNote
            ? `Encerramento registrado com observacao: "${shortNote}".`
            : 'O lead saiu da agenda ativa e foi movido para encerrados.',
          statusTo: nextStatus,
          createdByUserId: context.userId,
        }),
      );
    }

    const updateData: any = {
      customerProfileId,
      name,
      phone,
      phoneNormalized,
      email,
      ...(addressColumnAvailable ? { address } : {}),
      status: nextStatus,
      nextAction,
      returnAt,
      shortNote,
      lastContactAt: nextLastContactAt,
      attemptCount: nextAttemptCount,
      lastResult: nextLastResult,
      wasClosedBefore,
      closedAt: nextStatus === 'encerrado' ? existing.closedAt || new Date() : null,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendasLead.update({
        where: { id: existing.id },
        data: updateData,
      });

      if (timelineEvents.length) {
        await tx.vendasLeadTimelineEvent.createMany({
          data: timelineEvents.map((event) => ({
            leadId: existing.id,
            ...event,
          })),
        });
      }

      return tx.vendasLead.findUniqueOrThrow({
        where: { id: row.id },
        ...(addressColumnAvailable
          ? {
              include: {
                timelineEvents: {
                  orderBy: [{ createdAt: 'desc' }],
                  take: 12,
                },
              },
            }
          : { select: leadWithTimelineSelectWithoutAddress }),
      } as any);
    });

    await this.syncLeadToInboxAgenda(context.companyId, updated, existing);

    return {
      ok: true,
      lead: this.buildLeadPayload(updated),
    };
  }

  private buildAdminReportText(context: { companyId: number; userId: number }, row: any, reason: string) {
    const radarLeadId = this.extractRadarLeadId(row?.sourceHistoryId);
    const typeParts = [
      'Motor HBX',
      row?.state ? `Estado: ${String(row.state).trim().toUpperCase()}` : null,
      row?.city ? `Cidade: ${String(row.city).trim()}` : null,
      row?.segment ? `Segmento: ${String(row.segment).trim()}` : null,
    ].filter(Boolean);
    return [
      'HBX - Reporte de card no Vendas',
      `Cliente: ${String(row?.name || 'Lead sem nome').trim()}`,
      `Telefone: ${String(row?.phone || row?.phoneNormalized || 'Nao informado').trim()}`,
      `Tipo de pesquisa: ${typeParts.join(' | ') || 'Motor HBX'}`,
      `Motivo: ${reason || 'Resultado incorreto reportado pelo usuario.'}`,
      row?.shortNote ? `Observacao do card: ${String(row.shortNote).trim()}` : null,
      `Empresa: ${context.companyId}`,
      `Usuario: ${context.userId}`,
      `Card Vendas: ${String(row?.id || '')}`,
      radarLeadId ? `Card Radar: ${radarLeadId}` : null,
    ].filter(Boolean).join('\n');
  }

  private buildAdminReportWhatsappUrl(text: string) {
    return `https://wa.me/${VENDAS_REPORT_ADMIN_PHONE}?text=${encodeURIComponent(text)}`;
  }

  private async releaseRadarLeadBackToPool(
    context: { companyId: number; userId: number },
    row: any,
    options: { status: 'discarded' | 'complaint'; reason?: string | null },
  ) {
    const radarLeadId = this.extractRadarLeadId(row?.sourceHistoryId);
    if (!radarLeadId) return;
    const [hasPool, hasState, hasEvent, hasOwnerColumn, hasClaimedColumn] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('RadarLeadCompanyState').catch(() => false),
      this.prisma.hasTable('RadarLeadEvent').catch(() => false),
      this.prisma.hasColumn('RadarLeadPool', 'ownerCompanyId').catch(() => false),
      this.prisma.hasColumn('RadarLeadPool', 'claimedAt').catch(() => false),
    ]);
    if (!hasPool || !hasState) return;
    const now = new Date();
    const status = options.status === 'complaint' ? 'complaint' : 'discarded';
    const reason = this.normalizeText(options.reason);
    const privateNotes = this.normalizeText(row?.shortNote);
    const poolRow = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: radarLeadId },
      select: { id: true, status: true, ownerCompanyId: true },
    }).catch(() => null);
    const previousStatus = String(poolRow?.status || 'sent_to_vendas').trim().toLowerCase() || 'sent_to_vendas';

    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId,
        vendasLeadId: null,
        status,
        lastActionAt: now,
        negativeReason: status === 'discarded' ? reason : null,
        complaintReason: status === 'complaint' ? reason : null,
        privateNotes,
      },
      update: {
        vendasLeadId: null,
        status,
        lastActionAt: now,
        negativeReason: status === 'discarded' ? reason : undefined,
        complaintReason: status === 'complaint' ? reason : undefined,
        privateNotes,
      },
    }).catch((error: any) => {
      this.logger.warn(`[vendas-delete] Falha ao atualizar estado Radar lead=${radarLeadId}: ${String(error?.message || error)}`);
    });

    if (poolRow) {
      const ownerCompanyId = Math.trunc(Number(poolRow.ownerCompanyId || 0)) || 0;
      await (this.prisma as any).radarLeadPool.update({
        where: { id: radarLeadId },
        data: {
          ...(hasOwnerColumn && (!ownerCompanyId || ownerCompanyId === context.companyId) ? { ownerCompanyId: null } : {}),
          ...(hasClaimedColumn && (!ownerCompanyId || ownerCompanyId === context.companyId) ? { claimedAt: null } : {}),
          status: 'clean',
          lastSeenAt: now,
        },
      }).catch((error: any) => {
        this.logger.warn(`[vendas-delete] Falha ao liberar RadarLeadPool lead=${radarLeadId}: ${String(error?.message || error)}`);
      });
    }

    if (hasEvent) {
      await (this.prisma as any).radarLeadEvent.create({
        data: {
          leadId: radarLeadId,
          companyId: context.companyId,
          eventType: status === 'complaint' ? 'complaint' : 'discarded',
          note: reason || (status === 'complaint' ? 'Card reportado com erro no Vendas.' : 'Card excluido do Vendas.'),
          statusFrom: previousStatus,
          statusTo: status,
          createdByUserId: context.userId,
        },
      }).catch(() => null);
    }
  }

  private async deleteVendasRowsForUser(
    user: any,
    dto: BulkDeleteVendasLeadsDto,
    options: { report?: boolean; reportReason?: string | null } = {},
  ) {
    const context = this.resolveUserContext(user);
    const all = Boolean(dto?.all);
    const leadIds = Array.from(
      new Set(
        (Array.isArray(dto?.leadIds) ? dto.leadIds : [])
          .map((leadId) => String(leadId || '').trim())
          .filter(Boolean),
      ),
    );

    if (!all && !leadIds.length) {
      throw new BadRequestException('Selecione ao menos um card para excluir.');
    }

    const where: any = {
      companyId: context.companyId,
      ...(all ? {} : { id: { in: leadIds } }),
    };
    const rows = await this.prisma.vendasLead.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        status: true,
        sourceHistoryId: true,
        name: true,
        phone: true,
        phoneNormalized: true,
        city: true,
        state: true,
        segment: true,
        shortNote: true,
      },
    });

    if (!rows.length) {
      return { ok: true, deletedCount: 0, rows: [] as any[] };
    }

    const rowIds = rows.map((row) => row.id);

    for (const row of rows) {
      try {
        await this.deactivateLeadInInboxAgenda(
          context.companyId,
          row.phoneNormalized || row.phone,
          row.id,
        );
      } catch (error: any) {
        this.logger.warn(`[vendas-delete] Falha ao desativar espelho do lead ${row.id}: ${error?.message || error}`);
      }
      try {
        await this.releaseRadarLeadBackToPool(context, row, {
          status: options.report ? 'complaint' : 'discarded',
          reason: options.report ? options.reportReason || 'Card reportado com erro no Vendas.' : 'Card excluido do Vendas.',
        });
      } catch (error: any) {
        this.logger.warn(`[vendas-delete] Falha ao devolver card ao Radar lead=${row.id}: ${error?.message || error}`);
      }
    }

    await this.prisma.vendasLead.deleteMany({
      where: {
        companyId: context.companyId,
        id: { in: rowIds },
      },
    });

    return { ok: true, deletedCount: rows.length, rows };
  }

  async deleteLeadsBulkForUser(user: any, dto: BulkDeleteVendasLeadsDto) {
    const result = await this.deleteVendasRowsForUser(user, dto || {});
    return { ok: true, deletedCount: result.deletedCount };
  }

  async deleteLeadForUser(user: any, leadId: string) {
    const result = await this.deleteVendasRowsForUser(user, {
      leadIds: [String(leadId || '').trim()],
    });
    return { ok: true, deletedCount: result.deletedCount };
  }

  async reportLeadErrorForUser(user: any, leadId: string, dto: ReportVendasLeadDto) {
    const context = this.resolveUserContext(user);
    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new BadRequestException('Card nao informado.');
    const row = await this.prisma.vendasLead.findFirst({
      where: { id: normalizedLeadId, companyId: context.companyId },
      select: {
        id: true,
        companyId: true,
        sourceHistoryId: true,
        name: true,
        phone: true,
        phoneNormalized: true,
        city: true,
        state: true,
        segment: true,
        shortNote: true,
      },
    });
    if (!row) throw new NotFoundException('Lead comercial nao encontrado.');

    const reason = this.normalizeText(dto?.reason) || 'Resultado incorreto reportado pelo usuario.';
    const reportText = this.buildAdminReportText(context, row, reason);
    let autoSent = false;
    let sendError: string | null = null;
    try {
      await this.webwhatsBridge.sendText(context.companyId, {
        to: VENDAS_REPORT_ADMIN_PHONE,
        text: reportText,
      });
      autoSent = true;
    } catch (error: any) {
      sendError = String(error?.message || error || 'Motor WhatsApp indisponivel.');
      this.logger.warn(`[vendas-report] Envio automatico ao admin falhou lead=${row.id}: ${sendError}`);
    }

    const deleted = await this.deleteVendasRowsForUser(user, {
      leadIds: [normalizedLeadId],
    }, {
      report: true,
      reportReason: reason,
    });

    return {
      ok: true,
      deletedCount: deleted.deletedCount,
      autoSent,
      whatsappUrl: autoSent ? null : this.buildAdminReportWhatsappUrl(reportText),
      sendError,
      message: autoSent
        ? 'Card reportado e removido do Vendas.'
        : 'Card reportado e removido. Abra o WhatsApp para enviar o reporte ao suporte HBX.',
    };
  }

  async registerAttemptForUser(user: any, leadId: string, dto?: { channel?: string }) {
    const context = this.resolveUserContext(user);
    const existing = await this.prisma.vendasLead.findFirst({
      where: {
        id: String(leadId || '').trim(),
        companyId: context.companyId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Lead comercial nao encontrado.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendasLead.update({
        where: { id: existing.id },
        data: {
          attemptCount: { increment: 1 },
          lastContactAt: new Date(),
        },
      });

      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: existing.id,
          ...this.buildTimelineEvent({
            eventType: 'contact_made',
            title: 'Tentativa de contato',
            description: dto?.channel ? `Tentativa por ${String(dto.channel)}` : 'Tentativa de contato registrada.',
            createdByUserId: context.userId,
          }),
        },
      });

      return tx.vendasLead.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          timelineEvents: {
            orderBy: [{ createdAt: 'desc' }],
            take: 12,
          },
        },
      });
    });

    return {
      ok: true,
      lead: this.buildLeadPayload(updated),
    };
  }
}
