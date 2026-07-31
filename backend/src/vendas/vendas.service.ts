import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { CadastrosService } from '../cadastros/cadastros.service';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';
import { AuthService } from '../auth/auth.service';
import { InboxService } from '../inbox/inbox.service';
import { CommercialPlansService } from '../commercial-plans/commercial-plans.service';
import { CommercialUsageLimitsService } from '../commercial-plans/commercial-usage-limits.service';
import { HbxCommissionSyncService } from '../commissions/hbx-commission-sync.service';
import {
  COMMERCIAL_PLAN_KEYS,
  applyCommissionCap,
  getCommercialPlanMonthlyPrice,
  normalizeCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';
import { CompanyPresentationEmailService } from '../mail/company-presentation-email.service';
import { ConversationsService } from '../messaging/conversations.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { buildWhatsAppPhoneCandidates } from '../messaging/whatsapp-channel';
import { PrismaService } from '../prisma/prisma.service';
import {
  MASTER_WHATSAPP_ENGINE_COMPANY_NAME,
  MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
} from '../companies/master-whatsapp-company.constants';
import { COMPANY_KIND_PLATFORM_INFRA, isTenantCompany } from '../common/company-kind';
import { pushMasterNotice } from '../common/push-master-notice';
import { automationFlag } from '../automation/automation-flags';
import { calculateLeadQualityV2, resolveRadarVisibilityFromQualityV2, type LeadQualityV2, type LeadQualityV2SalesProfile } from '../webscraping/lead-quality-v2';
import {
  isGlobalBlockStatus,
  resolvePoolBlockStatus,
  resolveDisposition,
  resolveDispositionReason,
} from '../webscraping/radar/shared/radar-disposition-rules';
import { cleanRfbLegalName } from '../webscraping/radar/providers/cnpj-public/cnpj-public-types';
import {
  buildRfbNameTokens,
  buildRfbPhoneCandidates,
  extractRfbAddressNumber,
  normalizeRfbMatchText,
  parseRfbJsonObject,
  selectVendasRfbMatch,
  type VendasRfbMatch,
} from './vendas-cnpj-fallback';
import {
  BulkDeleteVendasLeadsDto,
  CancelCommissionPayoutDto,
  CreateCommissionPayoutDto,
  CreateHbxAssistedSignupDto,
  CreateHbxSalesHandoffDto,
  CreateMasterNoticeDto,
  CreateManualVendasLeadDto,
  ImportWebscrapingLeadsDto,
  LigarRoboDto,
  ReportVendasLeadDto,
  UpdateSalesProfileDto,
  UpdateVendasLeadDto,
  VENDAS_CLOSURE_REASONS,
} from './dto/vendas.dto';
import { buildVendasLeadIntelligence } from './vendas-lead-enrichment';
import {
  buildAbertura,
  buildPersonaPreviews,
  buildProntidao,
  isPreVooEnrichEnabled,
  recommendPersona,
  resolveCanalEmail,
  resolveCanalTelefoneVoz,
  resolveCanalWhatsapp,
  resolveContact,
  resolveObjetivo,
} from './vendas-pre-voo';
import { CADENCIA_SEEDS, sanitizePassos, type CadenciaPersona } from '../cadencia/cadencia-personas';
import { VendasContactSuppressionService } from './vendas-contact-suppression.service';
// S4 LEAD-CENTRICO (04-robozinho.md): freio compartilhado da cadência — instanciado
// à mão (mesmo padrão de cadencia.service.ts/messaging.service.ts, NÃO é
// @Injectable) porque não é registrado em nenhum módulo Nest.
import { CommercialContactControlService } from './commercial-contact-control.service';
import { AgendaDisparoService, type SlotConflictReason } from './agenda-disparo.service';
// S1+S2 CORREÇÃO DO NOTURNO (DIA-VENDEDOR-NOTURNO/01-CORRECAO.md): regras puras do
// "agendar disparo" (validação da hora, anti-carimbo no preparo, texto honesto do
// que o motor fez com o horário pedido).
import {
  avaliarCopyAgendada,
  explicarSlot,
  textoNormalizadoParaAgenda,
  validarDesiredAt,
} from './vendas-agendamento-disparo';
import { reservarVarianteDeAbertura } from './vendas-copy-reserva';
// Freio anti-ban: instância local só pra LER os parâmetros (teto/régua/janela) —
// a tela e o preparo passam a falar os MESMOS números que o envio vai cobrar.
import { WaColdContactGateService } from '../messaging/wa-cold-contact-gate.service';
import { parseSignalsJson } from '../webscraping/radar/03-enrichment/lead-signals.util';
import { ensureVendasComplaintsRuntimeSchema } from './vendas-complaints-runtime';
import { buildLeadFingerprints } from './commercial-contact-fingerprint';
import {
  TEAM_POLICY_UNLIMITED_LIMIT,
  ensureUserTeamPolicyForUser,
  getTeamPolicyRequiredChannelList,
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyStoredLimit,
} from '../team/team-policy-persistence';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
import { isBotArmedForCompany } from '../modules/bot-activation-state';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { MasterAlertService } from '../master-alert/master-alert.service';
import { VendasLeadCockpitProjectorService } from './vendas-lead-cockpit-projector.service';

type VendasLeadStatus = 'novo' | 'contato' | 'retorno' | 'qualificado' | 'encerrado';
type VendasSaleStatus = 'none' | 'activation_pending' | 'trial_started' | 'sale_confirmed' | 'inactive' | 'canceled';
type VendasCommissionStatus = 'none' | 'pending' | 'payable' | 'paid' | 'canceled';

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

type LeadClosureConversationReference = {
  kind: 'lead_closure_conversation';
  conversationId: number | null;
  anchorMessageId: number | null;
  inboundMessageId: number | null;
  detectedText: string | null;
  sourceModule: string | null;
  createdAt: string;
  closureReason: string | null;
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

type VendasProductSnapshotPatch = {
  product: any | null;
  data: Record<string, any>;
};

type VendasUserContext = {
  companyId: number;
  userId: number;
  role: string;
  canManageTeam?: boolean;
  canViewOwnCards?: boolean;
  ownCardsOnly?: boolean;
  access?: VendasAccessContext;
};

type CommercialContactDuplicateReason =
  | 'phone'
  | 'email'
  | 'source_history'
  | 'google_place'
  | 'website_domain'
  | 'name_location';

type CommercialContactDuplicateCheck = {
  exists: boolean;
  action: 'none' | 'reuse' | 'block';
  reason: CommercialContactDuplicateReason | null;
  leadId?: string | null;
  leadName?: string | null;
  fingerprints?: string[];
};

type SalesProfileSource = 'user' | 'company' | 'default';
type MasterNoticeAudience = 'seller' | 'customer';
type MasterNoticeTone = 'info' | 'success' | 'warning' | 'urgent';

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
  // CORREÇÃO-DA-PORTA (29/07): sem evidência de segmento = lead vivo com rótulo honesto
  // (mesmo contrato de LeadQualityStatus em radar-core-shared.ts).
  | 'segment_unconfirmed'
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

// Teto de espera pela vaga no freio de checagem de WhatsApp (20/min) quando a consulta
// acontece dentro de um request do usuário. 6s cabe folgado num clique e é MUITO menor que a
// janela de 60s que estourou o proxy em 29/07. Estourou o prazo → lead entra não verificado.
const VENDAS_WHATSAPP_LOOKUP_MAX_WAIT_MS = 6000;
const VENDAS_REPORT_ADMIN_PHONE = '5519997024884';
const COMMERCIAL_CONTACT_DUPLICATE_MESSAGE = 'Contato comercial duplicado nesta empresa. Use o card existente ou transfira/reabra pelo responsavel.';
const MASTER_NOTICE_AUDIENCES = new Set(['seller', 'customer']);
const MASTER_NOTICE_TONES = new Set(['info', 'success', 'warning', 'urgent']);

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
  // ARQ11 S2 — cache do "a coluna leadTemperature já existe?" (migration pode não estar
  // aplicada no VPS). Enquanto ausente, o intake de anúncio grava origem sem explodir.
  private vendasLeadTemperatureColumnAvailable: boolean | null = null;
  // S4 LEAD-CENTRICO: instanciado no corpo do construtor (não no initializer do
  // campo) porque depende de `this.prisma`, que só existe depois que os
  // parâmetros do construtor são atribuídos.
  private readonly commercialContactControl: CommercialContactControlService;
  // S5 LEAD-CENTRICO (05-agenda-slots.md) — serviço de slots de disparo (janela/teto/
  // intervalo). Mesmo padrão de instanciação manual do commercialContactControl acima
  // (evita import circular entre VendasModule e CadenciaModule).
  private readonly agendaDisparo: AgendaDisparoService;
  // S7 LEAD-CENTRICO (07-pool-raiz.md) — marquinha/supressão global por contato.
  // Mesmo padrão de instanciação manual acima (só depende de PrismaService).
  private readonly contactSuppression: VendasContactSuppressionService;
  // BLINDAGEM DO DISPARO FRIO (30/07): mesma instância manual. Aqui é usada só como
  // FONTE DE VERDADE dos parâmetros do freio — o gate de envio continua sendo o do
  // messaging.service; o que muda é que Vendas para de prometer o que ele não entrega.
  private readonly coldGate: WaColdContactGateService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cadastrosService: CadastrosService,
    private readonly customerProfileService: CustomerProfileService,
    private readonly conversations: ConversationsService,
    private readonly inboxService: InboxService,
    private readonly webwhatsBridge: WebwhatsBridgeService,
    private readonly commercialPlansService: CommercialPlansService,
    // PR12062026005: apresentação do Vendas sai pelo e-mail DA EMPRESA (CompanyMailer)
    private readonly companyPresentationEmails: CompanyPresentationEmailService,
    private readonly commercialUsageLimits: CommercialUsageLimitsService,
    private readonly hbxCommissionSync: HbxCommissionSyncService,
    private readonly authService: AuthService,
    private readonly masterAlert: MasterAlertService,
    private readonly cockpitProjector: VendasLeadCockpitProjectorService,
  ) {
    this.commercialContactControl = new CommercialContactControlService(this.prisma);
    this.agendaDisparo = new AgendaDisparoService(this.prisma);
    this.contactSuppression = new VendasContactSuppressionService(this.prisma);
    this.coldGate = new WaColdContactGateService(this.prisma as any);
  }

  // S7 LEAD-CENTRICO (07-pool-raiz.md, item 1): lead encerrado com motivo
  // estruturado grava a marca global do contato (cnpj/telefone/e-mail). CNPJ
  // só existe quando o lead está linkado a um CustomerProfile PJ — busca
  // best-effort, nunca bloqueia o encerramento. 'convertido'/'outro' não
  // marcam (filtro dentro de applyAutoSuppressionForClosedLead).
  private async applyContactSuppressionOnLeadClosed(companyId: number, lead: any): Promise<void> {
    let cnpj: string | null = null;
    if (lead?.customerProfileId) {
      const profile = await this.prisma.customerProfile
        .findUnique({ where: { id: lead.customerProfileId }, select: { cnpj: true } })
        .catch(() => null);
      cnpj = profile?.cnpj || null;
    }
    await this.contactSuppression.applyAutoSuppressionForClosedLead(
      { cnpj, phone: lead?.phoneNormalized || lead?.phone, email: lead?.email },
      lead?.closureReason,
      { companyId, leadId: lead?.id },
    );
  }

  async getAutomationBotConfigForUser(user: any) {
    return this.inboxService.getBotConfig(user);
  }

  async updateAutomationBotConfigForUser(user: any, payload: unknown) {
    const companyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0);
    return this.inboxService.updateBotConfig(user, payload);
  }

  async getAutomationAgendaForUser(user: any) {
    return this.inboxService.getAgendaConfig(user);
  }

  // Retorna status do bot para a empresa: módulo habilitado + chave-mestra armada.
  // Usado pelo frontend ao agendar retorno (F5) para decidir se oferece automático.
  async getBotStatusForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    const [botModule, company] = await Promise.all([
      // PR10072026 W1: efetivo = masterEnabled && enabled (teto do master conta).
      this.prisma.companyModule?.findFirst
        ? this.prisma.companyModule.findFirst({
            where: { companyId: context.companyId, enabled: true, masterEnabled: true, systemModule: { key: 'bot' } },
            select: { id: true },
          }).catch(() => null)
        : Promise.resolve(null),
      this.prisma.company.findUnique({
        where: { id: context.companyId },
        select: {
          botArmedAt: true,
          // Guarda de suspensao: campos lidos por resolveCompanyAccessState.
          companyKind: true,
          slug: true,
          status: true,
          accountType: true,
          trialEndsAt: true,
          billingGraceEndsAt: true,
          courtesyEndsAt: true,
        },
      }).catch(() => null),
    ]);
    // Empresa suspensa/overdue/pending_checkout nao expoe o bot como habilitado.
    // W1 removeu o wipe que desligava os modulos; a guarda de acesso passa a ser aqui.
    const acesso = resolveCompanyAccessState(company as any);
    return {
      botModuleEnabled: Boolean(botModule?.id) && acesso.canUse,
      botArmed: isBotArmedForCompany(company),
    };
  }

  // Notifica o master que bot-módulo está habilitado mas sem chave-mestra configurada.
  // Chamado uma vez por sessão quando o vendedor tenta usar retorno automático.
  async notifyBotConfigMissingForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    const [company, userRecord] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: context.companyId },
        select: { id: true, name: true },
      }).catch(() => null),
      this.prisma.user.findUnique({
        where: { id: context.userId },
        select: { name: true, phone: true, email: true },
      }).catch(() => null),
    ]);
    await this.masterAlert.notifyBotConfigMissing({
      companyId: context.companyId,
      companyName: company?.name || null,
      requestedByName: userRecord?.name || null,
      requestedByPhone: (userRecord as any)?.phone || null,
      requestedByEmail: userRecord?.email || null,
    });
    return { ok: true, message: 'Suporte notificado. Aguarde a ativação do bot.' };
  }

  async getUsageSnapshotForUser(user: any) {
    const { companyId, userId } = await this.resolveVendasUserContext(user);
    const snapshot = await this.commercialUsageLimits.getUsageSnapshot(companyId, userId);
    const sellerActiveQuota = await this.commercialUsageLimits
      .getSellerActiveCardQuotaSnapshot(companyId, userId)
      .catch(() => null);
    return {
      ...snapshot,
      sellerActiveQuota,
    };
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

  async getPendingVendasCardCountForSeller(companyId: number, userId: number) {
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    const normalizedUserId = Math.trunc(Number(userId || 0));
    if (!normalizedCompanyId || !normalizedUserId) return 0;
    return this.prisma.vendasLead.count({
      where: {
        companyId: normalizedCompanyId,
        assignedUserId: normalizedUserId,
        NOT: [
          { status: 'encerrado' },
          { closedAt: { not: null } },
        ],
      },
    });
  }

  async getPendingSummaryForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    const pendingCount = context.canManageTeam
      ? await this.getPendingVendasCardCountForCompany(context.companyId)
      : await this.prisma.vendasLead.count({
          where: this.buildLeadAccessWhere(context, {
            NOT: [
              { status: 'encerrado' },
              { closedAt: { not: null } },
            ],
          }),
        });
    return {
      ok: true,
      limit: null,
      pendingCount,
      remaining: null,
      blocked: false,
      message: `${pendingCount} card(s) pendentes no Vendas.`,
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

  // ARQ11 S2 — a coluna leadTemperature (frio|morno|quente) pode ainda não existir no VPS
  // (migration não aplicada). O intake de anúncio inclui a temperatura no MESMO write só
  // quando a coluna existe; senão grava a origem e segue (fallback do doc), sem 2º write.
  private async hasVendasLeadTemperatureColumn() {
    if (this.vendasLeadTemperatureColumnAvailable !== null) {
      return this.vendasLeadTemperatureColumnAvailable;
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'VendasLead'
            AND column_name = 'leadTemperature'
        ) AS "exists"
      `;
      this.vendasLeadTemperatureColumnAvailable = Boolean(rows?.[0]?.exists);
    } catch {
      this.vendasLeadTemperatureColumnAvailable = false;
    }

    return this.vendasLeadTemperatureColumnAvailable;
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
    if (!['approved', 'segment_unconfirmed', 'segment_mismatch', 'weak_contact', 'generic_directory', 'invalid', 'duplicate'].includes(status)) return null;
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

  private qualityV2FailedRequiredChannelRule(qualityV2?: LeadQualityV2 | null) {
    if (!qualityV2) return false;
    if (qualityV2.discardReason === 'required_channel_missing') return true;
    return (qualityV2.reasons || []).some((reason) => /canal obrigat[oó]rio ausente/i.test(String(reason || '')));
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
      opportunityScore: true,
      leadTemperature: true,
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
      assignedUserId: true,
      assignedByUserId: true,
      assignedAt: true,
      productId: true,
      productKindSnapshot: true,
      productNameSnapshot: true,
      productPriceCentsSnapshot: true,
      productCurrencySnapshot: true,
      productBillingCycleSnapshot: true,
      productCommissionPercentSnapshot: true,
      productPlanKeySnapshot: true,
      commissionPercentSnapshot: true,
      saleStatus: true,
      saleValue: true,
      salePlanKey: true,
      saleConfirmedAt: true,
      saleCanceledAt: true,
      commissionStatus: true,
      commissionBaseAmount: true,
      commissionAmount: true,
      commissionDueAt: true,
      commissionPaidAt: true,
      commissionRecurring: true,
      commissionNote: true,
      commissionLinkedCompanyId: true,
      commissionLinkedAt: true,
      commissionAutoSyncedAt: true,
      commissionSyncSource: true,
      commissionPayoutId: true,
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

  // S4 LEAD-CENTRICO (04-robozinho.md, item 5): rótulo humano do motivo de
  // encerramento estruturado — usado na timeline (leads antigos sem motivo caem
  // no default neutro, nunca quebram a descrição).
  private formatClosureReasonLabel(reason: string | null): string {
    switch (reason) {
      case 'sem_interesse':
        return 'sem interesse';
      case 'nao_atendeu':
        return 'não atendeu';
      case 'contato_invalido':
        return 'contato inválido';
      case 'opt_out':
        return 'pediu para não ser mais chamado';
      case 'convertido':
        return 'convertido';
      case 'outro':
        return 'outro motivo';
      default:
        return 'motivo não informado';
    }
  }

  private normalizeSaleStatus(value: unknown): VendasSaleStatus {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'activation_pending') return 'activation_pending';
    if (normalized === 'trial_started') return 'trial_started';
    if (normalized === 'sale_confirmed') return 'sale_confirmed';
    if (normalized === 'inactive') return 'inactive';
    if (normalized === 'canceled') return 'canceled';
    return 'none';
  }

  private isAutomaticSaleStatus(status: VendasSaleStatus) {
    return status === 'activation_pending' || status === 'trial_started' || status === 'sale_confirmed';
  }

  private normalizeCommissionStatus(value: unknown): VendasCommissionStatus {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'pending') return 'pending';
    if (normalized === 'payable') return 'payable';
    if (normalized === 'paid') return 'paid';
    if (normalized === 'canceled') return 'canceled';
    return 'none';
  }

  private formatSaleStatusLabel(status: VendasSaleStatus) {
    switch (status) {
      case 'activation_pending':
        return 'Aguardando ativação';
      case 'trial_started':
        return 'Trial iniciado';
      case 'sale_confirmed':
        return 'Venda confirmada';
      case 'inactive':
        return 'Cliente inativo';
      case 'canceled':
        return 'Cancelado';
      default:
        return 'Sem venda';
    }
  }

  private formatCommissionStatusLabel(status: VendasCommissionStatus) {
    switch (status) {
      case 'pending':
        return 'Aguardando ativação';
      case 'payable':
        return 'A pagar';
      case 'paid':
        return 'Pago';
      case 'canceled':
        return 'Cancelado';
      default:
        return 'Sem comissão';
    }
  }

  private addBusinessDays(date: Date, days: number) {
    const next = new Date(date);
    let added = 0;
    while (added < days) {
      next.setDate(next.getDate() + 1);
      const day = next.getDay();
      if (day !== 0 && day !== 6) added += 1;
    }
    return next;
  }

  private normalizeCommissionDueBusinessDays(value: unknown) {
    const numeric = Math.trunc(Number(value));
    if (!Number.isFinite(numeric)) return 3;
    return Math.min(30, Math.max(0, numeric));
  }

  private async resolveCommissionDueBusinessDays(companyId?: number | null) {
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    if (!normalizedCompanyId) return 3;
    const company = await this.prisma.company.findUnique({
      where: { id: normalizedCompanyId },
      select: { commissionDueBusinessDays: true },
    }).catch(() => null);
    return this.normalizeCommissionDueBusinessDays(company?.commissionDueBusinessDays);
  }

  private normalizeCurrencyAmount(value: unknown) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Number(Math.max(0, numeric).toFixed(2));
  }

  private calculateCommissionAmount(baseAmount: number, percent: number) {
    const baseCents = Math.round(this.normalizeCurrencyAmount(baseAmount) * 100);
    const safePercent = Math.min(100, Math.max(0, Number(percent || 0) || 0));
    return this.normalizeCurrencyAmount(Math.round((baseCents * safePercent) / 100) / 100);
  }

  private resolveSaleBaseAmount(input: { saleValue?: unknown; salePlanKey?: unknown; productPriceCents?: unknown; fallbackValue?: unknown }) {
    const explicitValue = this.normalizeCurrencyAmount(input.saleValue);
    if (explicitValue > 0) return explicitValue;
    const productPriceCents = Math.trunc(Number(input.productPriceCents || 0));
    if (Number.isFinite(productPriceCents) && productPriceCents > 0) {
      return this.normalizeCurrencyAmount(productPriceCents / 100);
    }
    const normalizedPlanKey = String(input.salePlanKey || '').trim();
    if (normalizedPlanKey) return this.normalizeCurrencyAmount(getCommercialPlanMonthlyPrice(normalizedPlanKey));
    return this.normalizeCurrencyAmount(input.fallbackValue);
  }

  private commercialPlanLabel(planKey: string) {
    const normalized = normalizeCommercialPlanKey(planKey);
    if (normalized === COMMERCIAL_PLAN_KEYS.LITE) return 'HBX List';
    if (normalized === COMMERCIAL_PLAN_KEYS.MELHOR) return 'HBX Full';
    return 'HBX Lead Plus';
  }

  private normalizePublicOrigin(value: unknown) {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return null;
    }
  }

  private generateAssistedSignupPassword() {
    return `Hbx-${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  }

  private async resolveCommissionPercentForLead(row: any) {
    if (row?.productCommissionPercentSnapshot !== null && row?.productCommissionPercentSnapshot !== undefined) {
      const productSnapshot = Number(row.productCommissionPercentSnapshot);
      if (Number.isFinite(productSnapshot)) return Math.min(100, Math.max(0, productSnapshot));
    }
    const snapshot = Number(row?.commissionPercentSnapshot || 0);
    if (Number.isFinite(snapshot) && snapshot > 0) return Math.min(100, Math.max(0, snapshot));
    const assignedUserId = Math.trunc(Number(row?.assignedUserId || 0));
    if (!assignedUserId) return 0;
    const owner = await this.prisma.user.findFirst({
      where: {
        id: assignedUserId,
        companyId: Number(row?.companyId || 0),
      },
      select: { commissionPercent: true },
    }).catch(() => null);
    return Math.min(100, Math.max(0, Number(owner?.commissionPercent || 0) || 0));
  }

  // Teto de comissão do vendedor (PR13062026007): a comissão exibida no card É a que
  // ele recebe, então capa aqui também (mensal + implantação). 0 = sem teto.
  private async resolveSellerCapsForLead(row: any): Promise<{ monthlyCap: number; setupCap: number }> {
    const assignedUserId = Math.trunc(Number(row?.assignedUserId || 0));
    if (!assignedUserId) return { monthlyCap: 0, setupCap: 0 };
    const owner = await this.prisma.user.findFirst({
      where: { id: assignedUserId, companyId: Number(row?.companyId || 0) },
      select: { commissionMonthlyCap: true, setupCommissionCap: true },
    }).catch(() => null);
    return {
      monthlyCap: Math.max(0, Number(owner?.commissionMonthlyCap || 0) || 0),
      setupCap: Math.max(0, Number(owner?.setupCommissionCap || 0) || 0),
    };
  }

  private async buildSaleCommissionPatch(row: any, dto: UpdateVendasLeadDto, userId?: number | null, options?: { allowAutomaticSaleStatus?: boolean }) {
    const saleStatusProvided = dto?.saleStatus !== undefined;
    const saleValueProvided = dto?.saleValue !== undefined;
    const salePlanProvided = dto?.salePlanKey !== undefined;
    const commissionStatusProvided = dto?.commissionStatus !== undefined;
    const commissionNoteProvided = dto?.commissionNote !== undefined;
    if (!saleStatusProvided && !saleValueProvided && !salePlanProvided && !commissionStatusProvided && !commissionNoteProvided && dto?.setupValue === undefined) {
      return { data: {}, event: null as TimelineEventRecord | null };
    }

    const now = new Date();
    const dueBusinessDays = await this.resolveCommissionDueBusinessDays(row?.companyId);
    const previousSaleStatus = this.normalizeSaleStatus(row?.saleStatus);
    const nextSaleStatus = saleStatusProvided ? this.normalizeSaleStatus(dto.saleStatus) : previousSaleStatus;
    if (
      saleStatusProvided &&
      nextSaleStatus !== previousSaleStatus &&
      this.isAutomaticSaleStatus(nextSaleStatus) &&
      !options?.allowAutomaticSaleStatus
    ) {
      throw new BadRequestException(
        'Este status é automático. Use cadastro do cliente, confirmação de e-mail ou pagamento para atualizar.',
      );
    }
    const salePlanKey = salePlanProvided
      ? this.normalizeText(dto.salePlanKey)
      : this.normalizeText(row?.salePlanKey || row?.productPlanKeySnapshot);
    const baseAmount = this.resolveSaleBaseAmount({
      saleValue: saleValueProvided ? dto.saleValue : row?.saleValue,
      salePlanKey,
      productPriceCents: row?.productPriceCentsSnapshot,
      fallbackValue: row?.commissionBaseAmount,
    });
    const percent = await this.resolveCommissionPercentForLead(row);
    const caps = await this.resolveSellerCapsForLead(row);
    const projectedCommissionAmount = applyCommissionCap(this.calculateCommissionAmount(baseAmount, percent), caps.monthlyCap);
    const paidSale = nextSaleStatus === 'sale_confirmed';
    const confirmsSale = nextSaleStatus === 'trial_started' || paidSale;
    const endsSale = nextSaleStatus === 'inactive' || nextSaleStatus === 'canceled';

    let commissionStatus = this.normalizeCommissionStatus(row?.commissionStatus);
    if (commissionStatusProvided) {
      commissionStatus = this.normalizeCommissionStatus(dto.commissionStatus);
      if (['payable', 'paid'].includes(commissionStatus) && !paidSale) {
        throw new BadRequestException('Comissão só pode ser liberada após pagamento confirmado do cliente.');
      }
    } else if (paidSale) {
      commissionStatus = projectedCommissionAmount > 0 ? 'payable' : 'pending';
    } else if (nextSaleStatus === 'trial_started') {
      commissionStatus = 'pending';
    } else if (nextSaleStatus === 'activation_pending') {
      commissionStatus = 'pending';
    } else if (endsSale) {
      // E5 (PLAN12062026001): comissão NÃO estorna sozinha no cancelamento.
      // Pendente/liberável fica como está, TRAVADA pelo caso de cancelamento
      // aberto até a decisão do master (manter/estornar/desvincular).
      // Pago fica pago.
    } else if (nextSaleStatus === 'none') {
      commissionStatus = 'none';
    }
    const preservedForReview = endsSale && ['pending', 'payable', 'paid'].includes(commissionStatus);
    const commissionAmount = paidSale && ['payable', 'paid'].includes(commissionStatus)
      ? projectedCommissionAmount
      : preservedForReview
        ? this.normalizeCurrencyAmount(row?.commissionAmount)
        : 0;

    // Implantação (one-time): valor negociado por negócio + comissão da mesma
    // vendedora (mesmo percent). Espelha o status da venda; NÃO é recorrente.
    const setupValueProvided = dto?.setupValue !== undefined;
    const setupValue = this.normalizeCurrencyAmount(setupValueProvided ? dto.setupValue : row?.setupValue);
    const hadSetup = this.normalizeCurrencyAmount(row?.setupValue) > 0;
    const projectedSetupCommission = applyCommissionCap(this.calculateCommissionAmount(setupValue, percent), caps.setupCap);
    const setupCommissionAmount = paidSale && ['payable', 'paid'].includes(commissionStatus)
      ? projectedSetupCommission
      : preservedForReview
        ? this.normalizeCurrencyAmount(row?.setupCommissionAmount)
        : 0;
    const setupCommissionStatus = setupValue > 0 || hadSetup ? commissionStatus : 'none';
    const opensCancellationCase = endsSale
      && previousSaleStatus !== nextSaleStatus
      && !String(row?.cancellationCaseStatus || '').trim();
    const cancellationRefundAmount = opensCancellationCase
      ? await this.computeCancellationRefundAmount(row)
      : null;
    if (opensCancellationCase) {
      // aviso imediato ao admin (sino, audiência customer); best-effort —
      // o vendedor recebe o fato pelo timeline do card (texto neutro)
      void this.createCancellationCaseNotice(row, cancellationRefundAmount).catch((error: any) => {
        this.logger.warn(`cancellation_case_notice_failed lead=${row?.id} error=${String(error?.message || error)}`);
      });
    }

    const paidAt = commissionStatus === 'paid'
      ? (row?.commissionPaidAt instanceof Date ? row.commissionPaidAt : now)
      : null;
    const confirmedAt = paidSale
      ? (row?.saleConfirmedAt instanceof Date ? row.saleConfirmedAt : now)
      : (nextSaleStatus === 'none' || endsSale ? null : row?.saleConfirmedAt || null);
    const canceledAt = endsSale
      ? (row?.saleCanceledAt instanceof Date ? row.saleCanceledAt : now)
      : (nextSaleStatus === 'none' || confirmsSale || nextSaleStatus === 'activation_pending' ? null : row?.saleCanceledAt || null);
    const dueAt = paidSale && commissionStatus !== 'paid'
      ? (row?.commissionDueAt instanceof Date ? row.commissionDueAt : this.addBusinessDays(confirmedAt || now, dueBusinessDays))
      : (commissionStatus === 'payable' ? row?.commissionDueAt || this.addBusinessDays(now, dueBusinessDays) : null);

    const data: any = {
      saleStatus: nextSaleStatus,
      saleValue: baseAmount,
      setupValue,
      setupCommissionAmount,
      setupCommissionStatus,
      salePlanKey,
      saleConfirmedAt: confirmedAt,
      saleCanceledAt: canceledAt,
      commissionStatus,
      commissionBaseAmount: baseAmount,
      commissionAmount,
      commissionDueAt: dueAt,
      commissionPaidAt: paidAt,
      commissionRecurring: paidSale && commissionStatus !== 'canceled',
      commissionPayoutId: commissionStatus === 'paid' ? row?.commissionPayoutId || null : null,
      ...(commissionNoteProvided ? { commissionNote: this.normalizeText(dto.commissionNote) } : {}),
      ...(opensCancellationCase ? {
        cancellationCaseStatus: 'open',
        cancellationCaseOpenedAt: now,
        cancellationCaseRefundAmount: cancellationRefundAmount,
        cancellationCaseResolution: null,
        cancellationCaseResolvedAt: null,
        cancellationCaseResolvedByUserId: null,
      } : {}),
    };

    const event = previousSaleStatus !== nextSaleStatus || commissionStatusProvided
      ? this.buildTimelineEvent({
          eventType: 'commission_updated',
          title: 'Comissão atualizada',
          description: [
            `Cliente: ${this.formatSaleStatusLabel(nextSaleStatus)}.`,
            `Comissão: ${this.formatCommissionStatusLabel(commissionStatus)}.`,
            commissionAmount > 0 ? `Valor previsto: R$ ${commissionAmount.toFixed(2)}.` : null,
            opensCancellationCase
              ? 'Cliente cancelou: comissões futuras param e a pendente está EM REVISÃO — aguardando decisão do administrador.'
              : null,
          ].filter(Boolean).join(' '),
          resultLabel: commissionStatus,
          createdByUserId: Number(userId || 0) || null,
        })
      : null;

    return { data, event };
  }

  // E5: saldo a restituir estimado — pro-rata por dias do período pago da
  // empresa vinculada; períodos de ~1 mês (mensal) não geram restituição.
  private async computeCancellationRefundAmount(row: any): Promise<number> {
    try {
      const saleValue = this.normalizeCurrencyAmount(row?.saleValue || row?.commissionBaseAmount);
      const linkedCompanyId = Math.trunc(Number(row?.commissionLinkedCompanyId || 0)) || 0;
      if (!saleValue || !linkedCompanyId) return 0;
      const company = await this.prisma.company.findUnique({
        where: { id: linkedCompanyId },
        select: { subscriptionCurrentPeriodStart: true, subscriptionCurrentPeriodEnd: true },
      });
      const start = company?.subscriptionCurrentPeriodStart instanceof Date ? company.subscriptionCurrentPeriodStart : null;
      const end = company?.subscriptionCurrentPeriodEnd instanceof Date ? company.subscriptionCurrentPeriodEnd : null;
      const nowMs = Date.now();
      if (!start || !end || end.getTime() <= nowMs || end.getTime() <= start.getTime()) return 0;
      const totalMs = end.getTime() - start.getTime();
      if (totalMs / 86_400_000 <= 35) return 0;
      const remainingMs = Math.max(0, end.getTime() - Math.max(nowMs, start.getTime()));
      return this.normalizeCurrencyAmount(saleValue * Math.min(1, remainingMs / totalMs));
    } catch {
      return 0;
    }
  }

  // E5: aviso imediato ao administrador da empresa (sino, audiência customer)
  private async createCancellationCaseNotice(row: any, refundAmount: number | null) {
    const companyId = Math.trunc(Number(row?.companyId || 0)) || 0;
    if (!companyId) return;
    const nome = this.normalizeText(row?.name) || this.normalizeText(row?.phone) || 'Cliente';
    const refund = this.normalizeCurrencyAmount(refundAmount);
    const temSaldo = refund > 0;
    await this.prisma.masterNotice.create({
      data: {
        companyId,
        audience: 'customer',
        tone: temSaldo ? 'urgent' : 'warning',
        title: `Cancelamento: ${nome}`,
        body: [
          `O cliente ${nome} cancelou/ficou inativo.`,
          temSaldo
            ? `Saldo a restituir estimado: R$ ${refund.toFixed(2).replace('.', ',')} — fazer a triagem ANTES de avisar o vendedor.`
            : 'Sem saldo a restituir.',
          'A comissão do vendedor está EM REVISÃO (payout travado). Decida no Gerencial: manter, estornar ou desvincular a venda.',
        ].join(' '),
      },
    });
  }

  // E5: fila de casos de cancelamento (Admin/Master), filtrável por saldo
  async listCancellationCasesForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(context.canManageTeam, 'Apenas Admin/Master vê os casos de cancelamento.');
    const rows = await this.prisma.vendasLead.findMany({
      where: { companyId: context.companyId, cancellationCaseStatus: 'open' },
      orderBy: [{ cancellationCaseOpenedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        name: true,
        phone: true,
        assignedUserId: true,
        saleStatus: true,
        saleValue: true,
        salePlanKey: true,
        commissionStatus: true,
        commissionAmount: true,
        cancellationCaseOpenedAt: true,
        cancellationCaseRefundAmount: true,
      },
    });
    const sellerIds = Array.from(new Set(rows.map((r) => Number(r.assignedUserId || 0)).filter(Boolean)));
    const sellers = sellerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true, email: true } })
      : [];
    const sellerById = new Map(sellers.map((u) => [Number(u.id), u]));
    return {
      ok: true,
      cases: rows.map((r) => ({
        leadId: r.id,
        name: r.name || r.phone || 'Cliente',
        sellerName: sellerById.get(Number(r.assignedUserId || 0))?.name || sellerById.get(Number(r.assignedUserId || 0))?.email || null,
        saleStatusLabel: this.formatSaleStatusLabel(this.normalizeSaleStatus(r.saleStatus)),
        saleValue: this.normalizeCurrencyAmount(r.saleValue),
        commissionStatusLabel: this.formatCommissionStatusLabel(this.normalizeCommissionStatus(r.commissionStatus)),
        commissionAmount: this.normalizeCurrencyAmount(r.commissionAmount),
        refundAmount: this.normalizeCurrencyAmount(r.cancellationCaseRefundAmount),
        openedAt: r.cancellationCaseOpenedAt instanceof Date ? r.cancellationCaseOpenedAt.toISOString() : null,
      })),
    };
  }

  // E5: decisão do master fecha o caso (manter/estornar/desvincular) e gera
  // o segundo aviso ao vendedor pelo timeline do card.
  async resolveCancellationCaseForUser(user: any, leadId: string, input: { resolution?: string; notes?: string | null }) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(context.canManageTeam, 'Apenas Admin/Master decide caso de cancelamento.');
    const resolution = String(input?.resolution || '').trim().toLowerCase();
    if (!['kept', 'reversed', 'unlinked'].includes(resolution)) {
      throw new BadRequestException('Decisão inválida: use kept, reversed ou unlinked.');
    }
    const normalizedLeadId = String(leadId || '').trim();
    const lead = await this.prisma.vendasLead.findFirst({
      where: { id: normalizedLeadId, companyId: context.companyId },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    if (String((lead as any).cancellationCaseStatus || '') !== 'open') {
      throw new BadRequestException('Este lead não tem caso de cancelamento aberto.');
    }

    const now = new Date();
    const notes = this.normalizeText(input?.notes);
    const data: any = {
      cancellationCaseStatus: 'resolved',
      cancellationCaseResolution: resolution,
      cancellationCaseResolvedAt: now,
      cancellationCaseResolvedByUserId: context.userId,
      ...(notes ? { commissionNote: notes } : {}),
    };
    let titulo = 'Comissão mantida';
    let descricao = 'O administrador revisou o cancelamento e MANTEVE a comissão do vendedor.';
    if (resolution === 'reversed') {
      data.commissionStatus = 'canceled';
      data.commissionAmount = 0;
      data.commissionDueAt = null;
      data.commissionRecurring = false;
      titulo = 'Comissão estornada';
      descricao = 'O administrador revisou o cancelamento e ESTORNOU a comissão desta venda.';
    } else if (resolution === 'unlinked') {
      data.commissionStatus = 'canceled';
      data.commissionAmount = 0;
      data.commissionDueAt = null;
      data.commissionRecurring = false;
      data.assignedUserId = null;
      titulo = 'Venda desvinculada';
      descricao = 'O administrador desvinculou esta venda do vendedor após a revisão do cancelamento.';
    }

    await this.prisma.$transaction([
      this.prisma.vendasLead.update({ where: { id: lead.id }, data }),
      this.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          ...this.buildTimelineEvent({
            eventType: 'cancellation_case_resolved',
            title: titulo,
            description: [descricao, notes ? `Nota: ${notes}` : null].filter(Boolean).join(' '),
            resultLabel: resolution,
            createdByUserId: context.userId,
          }),
        },
      }),
    ]);

    return { ok: true, leadId: lead.id, resolution };
  }

  private formatSourceLabel(sourceType: unknown) {
    const normalized = String(sourceType || '').trim().toLowerCase();
    if (normalized === 'webscraping') return 'Radar Digital';
    // ARQ11 S2 — origem real de lead de anúncio (Meta Lead Ads / formulário de site).
    if (normalized === 'anuncio') return 'Anúncio';
    return 'Manual';
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

  // HOT-07 (empresa recém-aberta): mesma janela de urgência do card do Radar
  // (RadarCorePresentationMixin.FRESH_COMPANY_WINDOW_DAYS) — reusa o `diasAberto`
  // já calculado em RadarPublicDataService/signalsJson, hidratado no VendasLead
  // via RADAR_POOL_ENRICHMENT_FIELDS. Sem CNPJ casado = ausente, badge não aparece.
  private static readonly FRESH_COMPANY_WINDOW_DAYS = 30;

  private buildFreshCompanyState(row: any): { isFreshCompany: boolean; daysSinceOpened: number | null } {
    const stored = parseSignalsJson(row?.signalsJson);
    const days = stored.diasAberto;
    if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) {
      return { isFreshCompany: false, daysSinceOpened: null };
    }
    return {
      isFreshCompany: days <= VendasService.FRESH_COMPANY_WINDOW_DAYS,
      daysSinceOpened: days,
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
      const engineCompanyId = await this.getOrCreateMasterWhatsappEngineCompanyId();
      if (!engineCompanyId) return availabilityByLeadId;
      // Os 3 caminhos que chegam aqui são request de usuário — abrir a agenda do dia
      // (`syncTodayAgendaForUser`), abrir o quadro (`getBoardForUser`) e o import
      // (`importWebscrapingLeadsForUser`). Sem prazo, o teto de 20/min segurava a resposta até
      // a janela virar (até 60s) e o proxy cortava. Este é o SEGUNDO lookup do caminho de
      // puxar lead: junto com o da entrega do Radar dá 2 vagas por lead, e é por isso que um
      // lote de 25 morria no 11º (11 × 2 = 22 > 20). O catch abaixo já degrada.
      const lookupResults = await this.webwhatsBridge.checkWhatsappNumbers(
        engineCompanyId,
        pendingRows.map((row) => row?.phoneNormalized || row?.phone || null),
        undefined,
        { maxWaitMs: VENDAS_WHATSAPP_LOOKUP_MAX_WAIT_MS },
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
    accessContext?: VendasAccessContext | null,
    cockpitSnapshot?: any | null,
    automationEnrollment?: any | null,
  ) {
    const status = this.normalizeStatus(row?.status);
    const block = this.classifyLeadBlock(row);
    const primarySource = String(row?.primarySource || row?.sourceType || 'manual');
    const signals = this.buildSignalState(row);
    const freshCompany = this.buildFreshCompanyState(row);
    const timeline = Array.isArray(row?.timelineEvents)
      ? row.timelineEvents.map((event: any) => {
          const conversationReference = this.extractLeadClosureConversationReference(event?.description);
          return {
            id: String(event?.id || ''),
            eventType: String(event?.eventType || 'generic'),
            title: String(event?.title || 'Atualizacao comercial'),
            description: conversationReference
              ? conversationReference.detectedText
                ? `Negativo registrado: "${conversationReference.detectedText}"`
                : 'Negativo registrado com referência à conversa.'
              : event?.description ? String(event.description) : null,
            sourceType: event?.sourceType ? String(event.sourceType) : null,
            statusFrom: event?.statusFrom ? String(event.statusFrom) : null,
            statusTo: event?.statusTo ? String(event.statusTo) : null,
            resultLabel: event?.resultLabel ? String(event.resultLabel) : null,
            returnAt: event?.returnAt instanceof Date ? event.returnAt.toISOString() : null,
            createdAt: event?.createdAt instanceof Date ? event.createdAt.toISOString() : null,
            conversationReference,
          };
        })
      : [];
    const rawIntelligence = buildVendasLeadIntelligence({
      lead: row,
      whatsappAvailability,
      verifiedBy: whatsappAvailability?.checkedAt
          ? 'platform_engine'
          : null,
    });
    const leadIntelligence = this.decorateManualEnrichmentIntelligence(rawIntelligence, row);
    // Empresa + dono + multi-contatos no TOPO do lead (o card lê daqui). Telefone
    // extra continua só exibido se confirmado no WhatsApp (phonesWhatsapp).
    const companyData = {
      cnpj: (rawIntelligence as any).cnpj || null,
      cnae: (rawIntelligence as any).cnae || null,
      razaoSocial: (rawIntelligence as any).razaoSocial || null,
      ownerName: (rawIntelligence as any).ownerName || null,
      ownerNames: (rawIntelligence as any).ownerNames || [],
      ownerPhone: (rawIntelligence as any).ownerPhone || null,
      ownerInstagram: (rawIntelligence as any).ownerInstagram || null,
      ownerFacebook: (rawIntelligence as any).ownerFacebook || null,
      companySituation: (rawIntelligence as any).companySituation || null,
      emails: (rawIntelligence as any).emails || [],
      phones: (rawIntelligence as any).phones || [],
      phonesWhatsapp: (rawIntelligence as any).phonesWhatsapp || {},
    };
    const canViewProductPrice = Boolean(accessContext?.canViewProductPrice);
    const productPriceCents = canViewProductPrice && row?.productPriceCentsSnapshot != null
      ? Math.max(0, Math.trunc(Number(row.productPriceCentsSnapshot) || 0))
      : null;
    const productPriceLabel = productPriceCents == null
      ? null
      : `R$ ${(productPriceCents / 100).toFixed(2).replace('.', ',')}`;
    const canonicalConversation = cockpitSnapshot?.conversation?.exists
      ? cockpitSnapshot.conversation
      : inboxPresence?.conversationId
        ? { id: String(inboxPresence.conversationId), exists: true }
        : null;
    const canonicalEngagement = cockpitSnapshot?.engagement || {
      state: canonicalConversation ? 'no_messages' : 'no_conversation',
      hasSuccessfulOutbound: false,
      hasInboundMessage: false,
      hasInboundReply: false,
      firstSuccessfulOutboundAt: null,
      lastOutboundAt: null,
      lastOutboundStatus: null,
      lastInboundAt: null,
      lastMessageAt: null,
      lastMessageDirection: null,
      lastMessageStatus: null,
      lastMessagePreview: null,
      failureReason: null,
    };
    const automation = automationEnrollment
      ? {
          enrollmentId: String(automationEnrollment.id),
          kind: String(automationEnrollment.definitionKind || ''),
          definitionId: String(automationEnrollment.definitionId || ''),
          status: String(automationEnrollment.status || 'active'),
          currentStep: Math.max(0, Math.trunc(Number(automationEnrollment.currentStep || 0))),
          nextStepAt: automationEnrollment.nextStepAt instanceof Date
            ? automationEnrollment.nextStepAt.toISOString()
            : null,
          label: String(automationEnrollment.definitionKind || '') === 'cadence'
            ? 'Cadencia ativa'
            : 'Bot ativo',
        }
      : null;
    return {
      id: String(row?.id || ''),
      radarLeadId: this.extractRadarLeadId(row?.sourceHistoryId),
      customerProfileId: row?.customerProfileId ? String(row.customerProfileId) : null,
      sourceType: String(row?.sourceType || 'manual'),
      primarySource,
      sourceHistoryId: row?.sourceHistoryId ? String(row.sourceHistoryId) : null,
      sourceSignature: row?.sourceSignature ? String(row.sourceSignature) : null,
      // HOT-07 (empresa recém-aberta): badge de urgência no card de Vendas.
      ...freshCompany,
      timesSeen: Math.max(1, Math.trunc(Number(row?.timesSeen || 0) || 1)),
      name: row?.name ? String(row.name) : null,
      phone: row?.phone ? String(row.phone) : null,
      phoneNormalized: row?.phoneNormalized ? String(row.phoneNormalized) : null,
      email: row?.email ? String(row.email) : null,
      address: row?.address ? String(row.address) : null,
      website: row?.website ? String(row.website) : null,
      ...companyData,
      rating: row?.rating == null ? null : Number(row.rating),
      reviews: Math.max(0, Math.trunc(Number(row?.reviews || 0) || 0)),
      opportunityScore: row?.opportunityScore == null ? null : Math.max(0, Math.min(100, Math.trunc(Number(row.opportunityScore) || 0))),
      leadTemperature: row?.leadTemperature ? String(row.leadTemperature).trim().toLowerCase() : null,
      city: row?.city ? String(row.city) : null,
      state: row?.state ? String(row.state) : null,
      segment: row?.segment ? String(row.segment) : null,
      status,
      statusLabel: this.formatStatusLabel(status),
      pipelineStage: row?.pipelineStage ? String(row.pipelineStage) : null,
      outcome: row?.outcome ? String(row.outcome) : null,
      nextAction: row?.nextAction ? String(row.nextAction) : null,
      returnAt: row?.returnAt instanceof Date ? row.returnAt.toISOString() : null,
      shortNote: row?.shortNote ? String(row.shortNote) : null,
      lastContactAt: row?.lastContactAt instanceof Date ? row.lastContactAt.toISOString() : null,
      attemptCount: Math.max(0, Math.trunc(Number(row?.attemptCount || 0) || 0)),
      lastResult: row?.lastResult ? String(row.lastResult) : null,
      wasClosedBefore: signals.wasClosedBefore,
      closedAt: row?.closedAt instanceof Date ? row.closedAt.toISOString() : null,
      // S4 LEAD-CENTRICO: motivo estruturado de encerramento (aditivo — null nos
      // leads encerrados antes deste sprint).
      closureReason: row?.closureReason ? String(row.closureReason) : null,
      createdByUserId: Number(row?.createdByUserId || 0) || null,
      assignedUserId: Number(row?.assignedUserId || 0) || null,
      assignedByUserId: Number(row?.assignedByUserId || 0) || null,
      assignedAt: row?.assignedAt instanceof Date ? row.assignedAt.toISOString() : null,
      productId: Number(row?.productId || 0) || null,
      productKindSnapshot: row?.productKindSnapshot ? String(row.productKindSnapshot) : null,
      productNameSnapshot: row?.productNameSnapshot ? String(row.productNameSnapshot) : null,
      productPriceCentsSnapshot: productPriceCents,
      productCurrencySnapshot: row?.productCurrencySnapshot ? String(row.productCurrencySnapshot) : null,
      productBillingCycleSnapshot: row?.productBillingCycleSnapshot ? String(row.productBillingCycleSnapshot) : null,
      productCommissionPercentSnapshot: row?.productCommissionPercentSnapshot == null ? null : Number(row.productCommissionPercentSnapshot),
      productPlanKeySnapshot: row?.productPlanKeySnapshot ? String(row.productPlanKeySnapshot) : null,
      product: row?.productId || row?.productNameSnapshot
        ? {
            id: Number(row?.productId || 0) || null,
            kind: row?.productKindSnapshot ? String(row.productKindSnapshot) : null,
            name: row?.productNameSnapshot ? String(row.productNameSnapshot) : null,
            priceCents: productPriceCents,
            priceLabel: productPriceLabel,
            canViewPrice: canViewProductPrice,
            currency: row?.productCurrencySnapshot ? String(row.productCurrencySnapshot) : null,
            billingCycle: row?.productBillingCycleSnapshot ? String(row.productBillingCycleSnapshot) : null,
            commissionPercent: row?.productCommissionPercentSnapshot == null ? null : Number(row.productCommissionPercentSnapshot),
            planKey: row?.productPlanKeySnapshot ? String(row.productPlanKeySnapshot) : null,
          }
        : null,
      commissionPercentSnapshot: Number(row?.commissionPercentSnapshot || 0) || 0,
      saleStatus: this.normalizeSaleStatus(row?.saleStatus),
      saleStatusLabel: this.formatSaleStatusLabel(this.normalizeSaleStatus(row?.saleStatus)),
      saleValue: this.normalizeCurrencyAmount(row?.saleValue),
      salePlanKey: row?.salePlanKey ? String(row.salePlanKey) : null,
      saleConfirmedAt: row?.saleConfirmedAt instanceof Date ? row.saleConfirmedAt.toISOString() : null,
      saleCanceledAt: row?.saleCanceledAt instanceof Date ? row.saleCanceledAt.toISOString() : null,
      commissionStatus: this.normalizeCommissionStatus(row?.commissionStatus),
      commissionStatusLabel: this.formatCommissionStatusLabel(this.normalizeCommissionStatus(row?.commissionStatus)),
      commissionBaseAmount: this.normalizeCurrencyAmount(row?.commissionBaseAmount),
      commissionAmount: this.normalizeCurrencyAmount(row?.commissionAmount),
      setupValue: this.normalizeCurrencyAmount(row?.setupValue),
      setupCommissionAmount: this.normalizeCurrencyAmount(row?.setupCommissionAmount),
      setupCommissionStatus: this.normalizeCommissionStatus(row?.setupCommissionStatus),
      setupCommissionStatusLabel: this.formatCommissionStatusLabel(this.normalizeCommissionStatus(row?.setupCommissionStatus)),
      commissionDueAt: row?.commissionDueAt instanceof Date ? row.commissionDueAt.toISOString() : null,
      commissionPaidAt: row?.commissionPaidAt instanceof Date ? row.commissionPaidAt.toISOString() : null,
      commissionRecurring: Boolean(row?.commissionRecurring),
      commissionNote: row?.commissionNote ? String(row.commissionNote) : null,
      commissionLinkedCompanyId: Number(row?.commissionLinkedCompanyId || 0) || null,
      commissionLinkedAt: row?.commissionLinkedAt instanceof Date ? row.commissionLinkedAt.toISOString() : null,
      commissionAutoSyncedAt: row?.commissionAutoSyncedAt instanceof Date ? row.commissionAutoSyncedAt.toISOString() : null,
      commissionSyncSource: row?.commissionSyncSource ? String(row.commissionSyncSource) : null,
      commissionPayoutId: row?.commissionPayoutId ? String(row.commissionPayoutId) : null,
      cancellationCaseStatus: row?.cancellationCaseStatus ? String(row.cancellationCaseStatus) : null,
      cancellationCaseRefundAmount: row?.cancellationCaseRefundAmount != null ? this.normalizeCurrencyAmount(row.cancellationCaseRefundAmount) : null,
      cancellationCaseResolution: row?.cancellationCaseResolution ? String(row.cancellationCaseResolution) : null,
      owner: row?.__owner
        ? {
            id: Number(row.__owner.id || 0) || null,
            name: row.__owner.name ? String(row.__owner.name) : null,
            email: row.__owner.email ? String(row.__owner.email) : null,
            phone: row.__owner.phone ? String(row.__owner.phone) : null,
            role: row.__owner.role ? String(row.__owner.role) : null,
            commissionPercent: Number(row.__owner.commissionPercent || 0) || 0,
          }
        : null,
      createdAt: row?.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
      whatsappAvailability: whatsappAvailability || null,
      leadIntelligence,
      conversation: canonicalConversation,
      engagement: canonicalEngagement,
      automation,
      conversationId: canonicalConversation?.id ? String(canonicalConversation.id) : null,
      hasInboundReply: Boolean(canonicalEngagement.hasInboundReply),
      lastMessageAt: canonicalEngagement.lastMessageAt || null,
      lastMessagePreview: canonicalEngagement.lastMessagePreview || null,
      // Compatibilidade temporária: daqui em diante significa somente "há conversa".
      isInInbox: Boolean(canonicalConversation),
      inboxConversationId: canonicalConversation?.id ? String(canonicalConversation.id) : null,
      atendimentoConversationId: canonicalConversation?.id ? String(canonicalConversation.id) : null,
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

  private async resolveVendasUserContext(user: any): Promise<VendasUserContext> {
    const access = await resolveVendasAccessContext(this.prisma, user);
    return {
      companyId: access.companyId,
      userId: access.userId,
      role: access.role,
      canManageTeam: access.canViewCompanyCards,
      canViewOwnCards: access.canViewOwnCards,
      ownCardsOnly: !access.canViewCompanyCards,
      access,
    };
  }

  // Opt-in de revenda de planos HBX: só o tenant marcado (sellsHbxPlans) é o
  // "HBX admin" que escolhe o plano no Fechar venda e manda salePlanKey no link.
  // Cliente comum nasce false → seletor escondido e salePlanKey ignorado. Fonte
  // única no banco; sem privilégio por slug/nome (mesmo padrão do billingExempt).
  private async resolveSellsHbxPlans(companyId: number): Promise<boolean> {
    if (!companyId) return false;
    const company = await this.prisma.company
      .findUnique({ where: { id: companyId }, select: { sellsHbxPlans: true } })
      .catch(() => null);
    return Boolean((company as any)?.sellsHbxPlans);
  }

  private assertVendasPermission(allowed: unknown, message: string) {
    if (!allowed) throw new ForbiddenException(message);
  }

  private assertCanReadVendasCards(context: VendasUserContext) {
    if (!context.access) return;
    this.assertVendasPermission(
      context.access.canViewOwnCards || context.access.canViewCompanyCards,
      'Acesso aos cards do Vendas bloqueado pela politica da equipe.',
    );
  }

  private assertCanMarkSaleStatus(context: VendasUserContext, saleStatus: VendasSaleStatus) {
    if (!context.access || saleStatus === 'none') return;
    if (saleStatus === 'activation_pending') {
      this.assertVendasPermission(context.access.canMarkActivationPending, 'Acesso para marcar ativacao pendente bloqueado pela politica da equipe.');
      return;
    }
    if (saleStatus === 'trial_started') {
      this.assertVendasPermission(context.access.canMarkTrialStarted, 'Acesso para marcar trial iniciado bloqueado pela politica da equipe.');
      return;
    }
    if (saleStatus === 'sale_confirmed') {
      this.assertVendasPermission(context.access.canMarkConfirmed, 'Acesso para confirmar venda bloqueado pela politica da equipe.');
      return;
    }
    this.assertVendasPermission(context.access.canMarkInactive, 'Acesso para marcar cliente inativo bloqueado pela politica da equipe.');
  }

  private hasDtoField(dto: unknown, key: string) {
    return Boolean(dto && Object.prototype.hasOwnProperty.call(dto, key));
  }

  private normalizePositiveInteger(value: unknown) {
    const parsed = Math.trunc(Number(value || 0));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private normalizePriceCentsFromProduct(product: any) {
    const explicit = Math.trunc(Number(product?.priceCents || 0));
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const legacyPrice = Number(product?.price || 0);
    if (Number.isFinite(legacyPrice) && legacyPrice > 0) return Math.round(legacyPrice * 100);
    return null;
  }

  private buildProductSnapshotPatch(product: any) {
    const priceCents = this.normalizePriceCentsFromProduct(product);
    return {
      productId: Number(product.id),
      productKindSnapshot: this.normalizeText(product.kind) || 'tenant_product',
      productNameSnapshot: this.normalizeText(product.name),
      productPriceCentsSnapshot: priceCents,
      productCurrencySnapshot: this.normalizeText(product.currency)?.toUpperCase() || 'BRL',
      productBillingCycleSnapshot: this.normalizeText(product.billingCycle)?.toUpperCase() || null,
      productCommissionPercentSnapshot: product.defaultCommissionPercent === null || product.defaultCommissionPercent === undefined
        ? null
        : Math.max(0, Math.min(100, Number(product.defaultCommissionPercent || 0) || 0)),
      productPlanKeySnapshot: this.normalizeText(product.planKey),
    };
  }

  private buildClearProductSnapshotPatch() {
    return {
      productId: null,
      productKindSnapshot: null,
      productNameSnapshot: null,
      productPriceCentsSnapshot: null,
      productCurrencySnapshot: null,
      productBillingCycleSnapshot: null,
      productCommissionPercentSnapshot: null,
      productPlanKeySnapshot: null,
    };
  }

  private async resolveVendasProductPatch(context: VendasUserContext, productIdRaw: unknown): Promise<VendasProductSnapshotPatch> {
    const productId = this.normalizePositiveInteger(productIdRaw);
    if (!productId) {
      return {
        product: null,
        data: this.buildClearProductSnapshotPatch(),
      };
    }

    this.assertVendasPermission(
      context.access?.canSellProducts,
      'Acesso para vender produtos bloqueado pela politica da equipe.',
    );

    const product = await (this.prisma as any).product.findFirst({
      where: {
        id: productId,
        companyId: context.companyId,
        status: 'active',
      },
    }).catch(() => null);
    if (!product) throw new NotFoundException('Produto comercial nao encontrado.');

    return {
      product,
      data: this.buildProductSnapshotPatch(product),
    };
  }

  private async resolveProductForSalePolicy(context: VendasUserContext, row: any, productPatch?: VendasProductSnapshotPatch | null) {
    if (productPatch?.product) return productPatch.product;
    const productId = this.normalizePositiveInteger(productPatch?.data?.productId ?? row?.productId);
    if (!productId) return null;
    return (this.prisma as any).product.findFirst({
      where: {
        id: productId,
        companyId: context.companyId,
      },
    }).catch(() => null);
  }

  private async assertProductSaleValuePolicy(
    context: VendasUserContext,
    row: any,
    dto: UpdateVendasLeadDto | CreateHbxSalesHandoffDto | CreateHbxAssistedSignupDto,
    productPatch?: VendasProductSnapshotPatch | null,
  ) {
    if (!this.hasDtoField(dto, 'saleValue')) return;

    const nextProductId = productPatch?.data && this.hasDtoField(productPatch.data, 'productId')
      ? this.normalizePositiveInteger(productPatch.data.productId)
      : this.normalizePositiveInteger(row?.productId);
    const hasProductSnapshot = Boolean(
      nextProductId ||
      productPatch?.data?.productNameSnapshot ||
      row?.productNameSnapshot,
    );
    if (!hasProductSnapshot) return;

    const saleAmount = this.normalizeCurrencyAmount((dto as any).saleValue);
    const saleCents = Math.round(saleAmount * 100);
    const product = await this.resolveProductForSalePolicy(context, row, productPatch);
    const snapshotPriceCents = Math.trunc(Number(
      productPatch?.data?.productPriceCentsSnapshot ??
      row?.productPriceCentsSnapshot ??
      0,
    ));
    const productPriceCents = this.normalizePriceCentsFromProduct(product) || (Number.isFinite(snapshotPriceCents) && snapshotPriceCents > 0 ? snapshotPriceCents : null);
    if (!productPriceCents) {
      this.assertVendasPermission(
        context.access?.canChangeProductPrice,
        'Acesso para alterar valor da venda bloqueado pela politica da equipe.',
      );
      return;
    }
    if (saleCents === productPriceCents) return;

    if (saleCents < productPriceCents) {
      this.assertVendasPermission(
        context.access?.canApplyProductDiscount,
        'Acesso para aplicar desconto bloqueado pela politica da equipe.',
      );
      if (product && product.allowDiscount === false) {
        throw new BadRequestException('Este produto nao permite desconto.');
      }
      const minPriceCents = Math.trunc(Number(product?.minPriceCents || 0));
      if (Number.isFinite(minPriceCents) && minPriceCents > 0 && saleCents < minPriceCents) {
        throw new BadRequestException('Desconto abaixo do preco minimo permitido para este produto.');
      }
      const maxDiscountPercent = Number(product?.maxDiscountPercent);
      if (Number.isFinite(maxDiscountPercent) && maxDiscountPercent >= 0) {
        const discountPercent = ((productPriceCents - saleCents) / productPriceCents) * 100;
        if (discountPercent > maxDiscountPercent + 0.001) {
          throw new BadRequestException('Desconto acima do limite permitido para este produto.');
        }
      }
      return;
    }

    this.assertVendasPermission(
      context.access?.canChangeProductPrice,
      'Acesso para alterar valor da venda bloqueado pela politica da equipe.',
    );
  }

  private assertCanRunHbxActivationAction(context: VendasUserContext) {
    this.assertVendasPermission(context.access?.canEditCards, 'Acesso para editar card bloqueado pela politica da equipe.');
    this.assertVendasPermission(context.access?.canChangeStatus, 'Acesso para alterar status bloqueado pela politica da equipe.');
    this.assertCanMarkSaleStatus(context, 'activation_pending');
  }

  private assertCanSendPresentationEmail(context: VendasUserContext) {
    this.assertVendasPermission(context.access?.canSendEmail, 'Acesso para enviar e-mail bloqueado pela politica da equipe.');
  }

  private parseBooleanRequest(value: unknown) {
    if (value === true) return true;
    const normalized = String(value || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'sim', 'on'].includes(normalized);
  }

  private async resolveCompanyReplyToForEmail(context: VendasUserContext, body?: any) {
    const requestedCompanyReplyTo = this.parseBooleanRequest(body?.useCompanyReplyTo || body?.useTenantReplyTo);
    if (!context.access?.canUseCompanyReplyTo) {
      if (requestedCompanyReplyTo) {
        throw new ForbiddenException('Acesso para usar reply-to da empresa bloqueado pela politica da equipe.');
      }
      return null;
    }

    const company = await (this.prisma.company as any).findUnique({
      where: { id: context.companyId },
      select: {
        companyKind: true,
        replyToEmail: true,
        supportEmail: true,
        contactEmail: true,
      },
    }).catch(() => null);
    if (!company || !isTenantCompany(company)) return null;
    return this.normalizeEmail(company.replyToEmail || company.supportEmail || company.contactEmail);
  }

  private assertCanRegisterTimeline(context: VendasUserContext) {
    this.assertVendasPermission(context.access?.canCommentTimeline, 'Acesso para registrar timeline bloqueado pela politica da equipe.');
  }

  private assertCanImportRadarToVendas(context: VendasUserContext) {
    this.assertVendasPermission(
      context.access?.canCreateManualCards || context.access?.canSendRadarCardsToVendas,
      'Acesso para enviar cards do Radar ao Vendas bloqueado pela politica da equipe.',
    );
  }

  private assertCanAssignVendasCard(context: VendasUserContext) {
    this.assertVendasPermission(
      context.access?.canTransferCards,
      'Acesso para atribuir ou transferir card bloqueado pela politica da equipe.',
    );
  }

  private assertCanManualEnrichRadar(context: VendasUserContext) {
    this.assertVendasPermission(
      context.access?.canManualEnrichRadar,
      'Acesso para enriquecer card manualmente bloqueado pela politica da equipe.',
    );
  }

  private assertCanPrepareManualWhatsapp(context: VendasUserContext) {
    this.assertVendasPermission(
      context.access?.canSendWhatsappManual,
      'Acesso para preparar envio manual de WhatsApp bloqueado pela politica da equipe.',
    );
  }

  private assertCanViewCommission(context: VendasUserContext) {
    this.assertVendasPermission(
      context.access?.canViewOwnCommission || context.access?.canViewTeamCommission,
      'Acesso para ver comissao bloqueado pela politica da equipe.',
    );
  }

  private assertCanMarkCommissionPaid(context: VendasUserContext) {
    this.assertVendasPermission(
      context.access?.canMarkCommissionPaid,
      'Acesso para registrar pagamento de comissao bloqueado pela politica da equipe.',
    );
  }

  private assertCanCancelCommission(context: VendasUserContext) {
    this.assertVendasPermission(
      context.access?.canCancelCommission,
      'Acesso para cancelar comissao bloqueado pela politica da equipe.',
    );
  }

  private canUseCommissionTeamScope(context: VendasUserContext) {
    return Boolean(context.access?.canViewTeamCommission);
  }

  private buildLeadAccessWhere(context: VendasUserContext, extra: Record<string, any> = {}) {
    const scopedExtra = { ...(extra || {}) };
    const base: any = {
      companyId: context.companyId,
      ...scopedExtra,
    };
    if (context.canManageTeam) return base;
    const access = context.canViewOwnCards === false
      ? { id: { in: [] } }
      : context.ownCardsOnly
        ? { assignedUserId: context.userId }
        : {
            OR: [
              { assignedUserId: context.userId },
              { assignedUserId: null, createdByUserId: context.userId },
            ],
          };
    if (Object.keys(scopedExtra).length > 0) {
      return {
        companyId: context.companyId,
        AND: [scopedExtra, access],
      };
    }
    return {
      companyId: context.companyId,
      ...access,
    };
  }

  private async resolveLeadOwnerForContext(
    context: { companyId: number; userId: number; canManageTeam?: boolean },
    assignedUserIdRaw?: number | null,
  ) {
    const requestedAssignedUserId = Math.trunc(Number(assignedUserIdRaw || 0)) || null;
    const fallbackSellerUserId = context.canManageTeam ? null : context.userId;
    const assignedUserId = requestedAssignedUserId || fallbackSellerUserId;
    if (!assignedUserId) {
      return {
        assignedUserId: null,
        assignedByUserId: null,
        assignedAt: null,
        commissionPercentSnapshot: 0,
        owner: null,
      };
    }
    if (!context.canManageTeam && assignedUserId !== context.userId) {
      throw new ForbiddenException('Vendedor so pode receber cards para a propria carteira.');
    }
    const owner = await this.prisma.user.findFirst({
      where: {
        id: assignedUserId,
        companyId: context.companyId,
        isActive: true,
        isSystemMaster: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        role: true,
        commissionPercent: true,
      },
    });
    if (!owner) {
      throw new BadRequestException('Vendedor de destino invalido ou inativo.');
    }
    return {
      assignedUserId: owner.id,
      assignedByUserId: context.canManageTeam && owner.id !== context.userId ? context.userId : null,
      assignedAt: new Date(),
      commissionPercentSnapshot: Math.max(0, Math.min(100, Number(owner.commissionPercent || 0) || 0)),
      owner,
    };
  }

  // Amarra o card a quem FECHA quando ele esta sem vendedor. Quem prospectou (card
  // ja com assignedUserId) MANTEM a comissao — esta funcao nunca rouba carteira. O
  // master de plataforma (isSystemMaster) nunca vira vendedor comissionado.
  private async resolveCloserAssignmentPatch(
    context: VendasUserContext,
    existing: any,
  ): Promise<{ assignedUserId?: number; assignedByUserId?: number | null; assignedAt?: Date; commissionPercentSnapshot?: number }> {
    const currentAssigned = Math.trunc(Number(existing?.assignedUserId || 0));
    if (currentAssigned > 0) return {};
    const closer = await this.prisma.user.findFirst({
      where: { id: context.userId, companyId: context.companyId, isActive: true, isSystemMaster: false },
      select: { id: true, commissionPercent: true },
    }).catch(() => null);
    if (!closer) return {};
    return {
      assignedUserId: closer.id,
      assignedByUserId: null,
      assignedAt: new Date(),
      commissionPercentSnapshot: Math.max(0, Math.min(100, Number(closer.commissionPercent || 0) || 0)),
    };
  }

  // Preview do ganho do vendedor para o passo-a-passo do fechamento. Resolve o % do
  // mesmo jeito que a engine (produto > snapshot do card > % do dono) e aplica os
  // tetos do vendedor — o numero do popup bate com o que ele vai receber de fato.
  private async buildHandoffCommissionPreview(
    mergedRow: any,
    input: { companyId: number; planLabel: string; planKey: string; monthlyBase: number; setupValue: number },
  ) {
    const monthlyBase = this.normalizeCurrencyAmount(input.monthlyBase);
    const setupValue = this.normalizeCurrencyAmount(input.setupValue);
    const percent = await this.resolveCommissionPercentForLead(mergedRow);
    const caps = await this.resolveSellerCapsForLead(mergedRow);
    const ownerUserId = Math.trunc(Number(mergedRow?.assignedUserId || 0)) || null;
    let ownerName: string | null = null;
    if (ownerUserId) {
      const owner = await this.prisma.user
        .findFirst({ where: { id: ownerUserId, companyId: input.companyId }, select: { name: true, email: true } })
        .catch(() => null);
      ownerName = this.normalizeText(owner?.name) || this.normalizeText(owner?.email) || null;
    }
    const monthlyCommission = applyCommissionCap(this.calculateCommissionAmount(monthlyBase, percent), caps.monthlyCap);
    const setupCommission = applyCommissionCap(this.calculateCommissionAmount(setupValue, percent), caps.setupCap);
    const dueBusinessDays = await this.resolveCommissionDueBusinessDays(input.companyId);
    return {
      hasOwner: Boolean(ownerUserId),
      ownerName,
      planLabel: input.planLabel,
      planKey: input.planKey,
      percent,
      monthlyBase,
      monthlyCommission,
      setupValue,
      setupCommission,
      firstYearCommission: this.normalizeCurrencyAmount(monthlyCommission * 12 + setupCommission),
      recurring: true,
      dueBusinessDays,
    };
  }

  private async attachLeadOwners(rows: any[], companyId: number) {
    const ownerIds = Array.from(new Set(
      (Array.isArray(rows) ? rows : [])
        .flatMap((row) => [Number(row?.assignedUserId || 0), Number(row?.createdByUserId || 0)])
        .filter((id) => Number.isInteger(id) && id > 0),
    ));
    if (!ownerIds.length) return rows;
    const owners = await this.prisma.user.findMany({
      where: {
        companyId,
        id: { in: ownerIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        role: true,
        commissionPercent: true,
      },
    }).catch(() => []);
    const byId = new Map((owners || []).map((owner) => [owner.id, owner]));
    return rows.map((row) => ({
      ...row,
      __owner: byId.get(Number(row?.assignedUserId || row?.createdByUserId || 0)) || null,
    }));
  }

  // S9 LEAD-CENTRICO: renomeado do antigo helper de "destrava paywall" (capacidade
  // sempre foi liberada desde bacb2725) — hoje é só detecção de proveniência: este
  // lead passou pelo enriquecimento manual? decorateManualEnrichmentIntelligence usa
  // isto pra carimbar enrichedAt/verifiedBy.
  private wasManuallyEnriched(row: any) {
    const timeline = Array.isArray(row?.timelineEvents) ? row.timelineEvents : [];
    return timeline.some((event: any) => {
      const eventType = String(event?.eventType || '').trim();
      const sourceType = String(event?.sourceType || '').trim();
      return eventType === 'lead_enrichment_used' || sourceType === 'lead_enrichment';
    });
  }

  private decorateManualEnrichmentIntelligence(intelligence: any, row?: any) {
    if (!this.wasManuallyEnriched(row)) return intelligence;
    const timeline = Array.isArray(row?.timelineEvents) ? row.timelineEvents : [];
    const event = timeline.find((item: any) =>
      String(item?.eventType || '').trim() === 'lead_enrichment_used'
      || String(item?.sourceType || '').trim() === 'lead_enrichment'
    );
    return {
      ...(intelligence || {}),
      enrichmentStatus: intelligence?.enrichmentStatus || 'completed',
      enrichedAt: intelligence?.enrichedAt || (event?.createdAt instanceof Date ? event.createdAt.toISOString() : new Date().toISOString()),
      verifiedBy: intelligence?.verifiedBy || 'manual',
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
    const normalized = this.normalizeText(value);
    return normalized ? normalized.slice(0, max) : null;
  }

  private sanitizeSalesProfileArray(value: unknown, limit = 30, maxLength = 80) {
    const raw = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const output: string[] = [];
    for (const item of raw) {
      const normalized = this.normalizeText(item)?.slice(0, maxLength) || '';
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

  private async getEffectiveSalesProfileForContext(context: { companyId: number; userId: number }) {
    const tableAvailable = await this.prisma.hasTable('SalesProfile').catch(() => false);
    if (!tableAvailable) {
      return { profile: null, effectiveProfile: this.defaultSalesProfile(), source: 'default' as SalesProfileSource };
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
    const effectiveProfile = row ? this.rowToSalesProfile(row) : this.defaultSalesProfile();
    return {
      profile: row ? this.rowToSalesProfile(row) : null,
      effectiveProfile,
      source,
    };
  }

  async getSalesProfileForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    const result = await this.getEffectiveSalesProfileForContext(context);
    return { ok: true, ...result };
  }

  private buildSalesProfileDataFromDto(dto: UpdateSalesProfileDto, existing?: EffectiveSalesProfile | null) {
    const fallback = existing || this.defaultSalesProfile();
    const whatDoYouSell = this.sanitizeSalesProfileString(dto.whatDoYouSell ?? fallback.whatDoYouSell, 160);
    if (!whatDoYouSell) {
      throw new BadRequestException('Informe o que voce vende para salvar o Perfil de Venda.');
    }
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
      whatDoYouSell,
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
    const context = await this.resolveVendasUserContext(user);
    if (!(await this.prisma.hasTable('SalesProfile').catch(() => false))) {
      throw new BadRequestException('Tabela SalesProfile ainda nao foi migrada.');
    }
    const current = await this.getEffectiveSalesProfileForContext(context);
    const data = this.buildSalesProfileDataFromDto(dto || {}, current.profile || current.effectiveProfile);
    const existing = await (this.prisma as any).salesProfile.findFirst({
      where: { companyId: context.companyId, userId: context.userId },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => null);
    const row = existing
      ? await (this.prisma as any).salesProfile.update({ where: { id: existing.id }, data })
      : await (this.prisma as any).salesProfile.create({ data: { companyId: context.companyId, userId: context.userId, ...data } });
    const effective = await this.getEffectiveSalesProfileForContext(context);
    return { ok: true, profile: this.rowToSalesProfile(row), effectiveProfile: effective.effectiveProfile, source: 'user' as SalesProfileSource };
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

  private isDueCommission(row: any, now = new Date()) {
    if (this.normalizeCommissionStatus(row?.commissionStatus) !== 'payable') return false;
    if (this.normalizeCurrencyAmount(row?.commissionAmount) <= 0) return false;
    return !(row?.commissionDueAt instanceof Date) || row.commissionDueAt.getTime() <= now.getTime();
  }

  private isDueReceivable(row: any, now = new Date()) {
    if (String(row?.status || '').trim().toLowerCase() !== 'payable') return false;
    if (this.normalizeCurrencyAmount(row?.amount) <= 0) return false;
    return !(row?.dueAt instanceof Date) || row.dueAt.getTime() <= now.getTime();
  }

  private buildCommissionClientPayload(row: any) {
    return {
      leadId: String(row?.id || ''),
      name: row?.name ? String(row.name) : row?.phone ? String(row.phone) : 'Cliente sem nome',
      phone: row?.phone ? String(row.phone) : null,
      city: row?.city ? String(row.city) : null,
      segment: row?.segment ? String(row.segment) : null,
      sellerUserId: Number(row?.assignedUserId || 0) || null,
      saleStatus: this.normalizeSaleStatus(row?.saleStatus),
      saleStatusLabel: this.formatSaleStatusLabel(this.normalizeSaleStatus(row?.saleStatus)),
      salePlanKey: row?.salePlanKey ? String(row.salePlanKey) : null,
      commissionStatus: this.normalizeCommissionStatus(row?.commissionStatus),
      commissionStatusLabel: this.formatCommissionStatusLabel(this.normalizeCommissionStatus(row?.commissionStatus)),
      saleValue: this.normalizeCurrencyAmount(row?.saleValue || row?.commissionBaseAmount),
      commissionAmount: this.normalizeCurrencyAmount(row?.commissionAmount),
      commissionDueAt: row?.commissionDueAt instanceof Date ? row.commissionDueAt.toISOString() : null,
      commissionPaidAt: row?.commissionPaidAt instanceof Date ? row.commissionPaidAt.toISOString() : null,
      commissionPayoutId: row?.commissionPayoutId ? String(row.commissionPayoutId) : null,
      commissionLinkedCompanyId: Number(row?.commissionLinkedCompanyId || 0) || null,
      commissionLinkedAt: row?.commissionLinkedAt instanceof Date ? row.commissionLinkedAt.toISOString() : null,
      commissionSyncSource: row?.commissionSyncSource ? String(row.commissionSyncSource) : null,
      updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    };
  }

  private buildCommissionReceivablePayload(row: any) {
    const lead = row?.lead || {};
    const kind = String(row?.kind || 'recurring');
    const isInherited = kind.startsWith('inheritance_');
    return {
      leadId: String(row?.leadId || lead?.id || ''),
      name: lead?.name ? String(lead.name) : lead?.phone ? String(lead.phone) : isInherited ? 'Comissão herdada' : 'Comissão recorrente',
      phone: lead?.phone ? String(lead.phone) : null,
      city: lead?.city ? String(lead.city) : null,
      segment: lead?.segment ? String(lead.segment) : null,
      sellerUserId: Number(row?.sellerUserId || 0) || null,
      receivableId: row?.id ? String(row.id) : null,
      saleStatus: this.normalizeSaleStatus(lead?.saleStatus),
      saleStatusLabel: this.formatSaleStatusLabel(this.normalizeSaleStatus(lead?.saleStatus)),
      salePlanKey: lead?.salePlanKey ? String(lead.salePlanKey) : null,
      commissionStatus: String(row?.status || 'payable'),
      commissionStatusLabel: this.formatCommissionStatusLabel(this.normalizeCommissionStatus(row?.status)),
      saleValue: this.normalizeCurrencyAmount(row?.baseAmount),
      commissionAmount: this.normalizeCurrencyAmount(row?.amount),
      commissionDueAt: row?.dueAt instanceof Date ? row.dueAt.toISOString() : null,
      commissionPaidAt: row?.paidAt instanceof Date ? row.paidAt.toISOString() : null,
      commissionPayoutId: row?.payoutId ? String(row.payoutId) : null,
      recurringCycleKey: row?.cycleKey ? String(row.cycleKey) : null,
      commissionKind: kind,
      isInherited,
      isRecurring: kind.includes('recurring'),
      updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    };
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

  private extractLeadClosureConversationReference(description: unknown): LeadClosureConversationReference | null {
    const parsed = this.extractTimelineJson(description);
    if (String((parsed as any)?.kind || '') !== 'lead_closure_conversation') return null;
    const conversationId = Number((parsed as any).conversationId || 0) || null;
    if (!conversationId) return null;
    return {
      kind: 'lead_closure_conversation',
      conversationId,
      anchorMessageId: Number((parsed as any).anchorMessageId || 0) || null,
      inboundMessageId: Number((parsed as any).inboundMessageId || 0) || null,
      detectedText: this.normalizeText((parsed as any).detectedText),
      sourceModule: this.normalizeText((parsed as any).sourceModule),
      createdAt: this.normalizeText((parsed as any).createdAt) || new Date().toISOString(),
      closureReason: this.normalizeText((parsed as any).closureReason),
    };
  }

  private buildLeadClosureTimelineDescription(input: {
    conversationId?: number | string | null;
    anchorMessageId?: number | string | null;
    inboundMessageId?: number | string | null;
    detectedText?: string | null;
    sourceModule?: string | null;
    closureReason?: string | null;
    createdAt: Date;
  }) {
    const inboundMessageId = Number(input.inboundMessageId || input.anchorMessageId || 0) || null;
    const payload: LeadClosureConversationReference = {
      kind: 'lead_closure_conversation',
      conversationId: Number(input.conversationId || 0) || null,
      anchorMessageId: inboundMessageId,
      inboundMessageId,
      detectedText: this.normalizeText(input.detectedText)?.slice(0, 1000) || null,
      sourceModule: this.normalizeText(input.sourceModule),
      createdAt: input.createdAt.toISOString(),
      closureReason: this.normalizeText(input.closureReason),
    };
    return JSON.stringify(payload);
  }

  async getConversionReportForUser(user: any, periodRaw?: string) {
    const context = await this.resolveVendasUserContext(user);
    const period = this.resolveReportPeriod(periodRaw);
    const leads = await this.prisma.vendasLead.findMany({
      where: this.buildLeadAccessWhere(context, {
        OR: [
          { createdAt: { gte: period.start, lte: period.end } },
          { updatedAt: { gte: period.start, lte: period.end } },
          { lastContactAt: { gte: period.start, lte: period.end } },
        ],
      }),
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
      const calledSignal = Number(lead.attemptCount || 0) > 0 || timeline.some((event: any) => event.eventType === 'contact_made');
      const repliedSignal = timeline.some((event: any) => ['reply_received', 'inbound_reply'].includes(String(event.eventType || ''))) || /respondeu|reply|retorno/i.test(String(lead.lastResult || ''));
      const interested = String(lead.status || '') === 'qualificado' || /interess|qualific|positivo/i.test(String(lead.lastResult || ''));
      // Funil MONOTONICO por construcao (bug real 07/07: "Taxa de conversao (7d)"
      // batia 200% porque Interessados era contado independente de Chamados/
      // Respostas). Quem chegou mais adiante no funil necessariamente passou pelas
      // etapas anteriores — mesmo quando o evento de timeline da etapa intermediaria
      // nunca foi gravado (ex.: cadastro assistido pula direto pra 'qualificado'
      // sem contact_made/reply_received, vendas.service.ts ~L9285). Sem a cascata,
      // Interessados podia superar Chamados/Respostas e a taxa passava de 100%.
      const replied = repliedSignal || interested;
      const called = calledSignal || replied;
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
    return report;
  }

  private isDateInPeriod(value: unknown, period: { start: Date; end: Date }) {
    const parsed = value instanceof Date ? value : this.parseDate(value);
    if (!parsed) return false;
    const time = parsed.getTime();
    return time >= period.start.getTime() && time <= period.end.getTime();
  }

  private getSaoPauloDayKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private getSaoPauloDayBounds(dayKey = this.getSaoPauloDayKey()) {
    const [year, month, day] = String(dayKey || '').split('-').map((part) => Math.trunc(Number(part || 0)));
    const start = new Date(Date.UTC(year || 1970, Math.max(0, (month || 1) - 1), day || 1, 3, 0, 0, 0));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  private normalizeLookupKey(city?: unknown, state?: unknown) {
    const normalizedCity = String(city || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const normalizedState = String(state || '').trim().toUpperCase();
    return normalizedCity && normalizedState ? `${normalizedCity}:${normalizedState}` : '';
  }

  private parseRadarRuleTerritories(value: unknown): Array<{ userId: number; cities: Array<{ city: string; state: string }> }> {
    const parsed = this.parseMaybeJsonObject(value);
    const source = Array.isArray(parsed?.territories) ? parsed.territories : Array.isArray(value) ? value : [];
    return (source as any[])
      .map((item) => {
        const userId = Math.trunc(Number(item?.userId || 0));
        const cities = Array.from(new Map<string, { city: string; state: string }>(
          (Array.isArray(item?.cities) ? item.cities : [])
            .map((cityItem: any) => ({
              city: String(cityItem?.city || '').trim(),
              state: String(cityItem?.state || '').trim().toUpperCase(),
            }))
            .filter((cityItem) => cityItem.city && cityItem.state)
            .map((cityItem) => [this.normalizeLookupKey(cityItem.city, cityItem.state), cityItem]),
        ).values()).slice(0, 40);
        return { userId, cities };
      })
      .filter((item) => item.userId > 0 && item.cities.length > 0);
  }

  private normalizeSellerDistributionMode(value: unknown, fallback = 'learning') {
    const normalized = String(value || fallback || 'learning').trim().toLowerCase();
    return ['learning', 'normal', 'priority', 'paused'].includes(normalized) ? normalized : 'learning';
  }

  private buildSellerGovernance(row: any) {
    const mode = this.normalizeSellerDistributionMode(row?.sellerDistributionMode);
    const pausedUntil = row?.sellerDistributionPausedUntil instanceof Date ? row.sellerDistributionPausedUntil : this.parseDate(row?.sellerDistributionPausedUntil);
    const pausedActive = mode === 'paused' && (!pausedUntil || pausedUntil.getTime() > Date.now());
    const rawOverride = row?.sellerDistributionDailyLimitOverride;
    const policyLimit = resolveTeamPolicyStoredLimit(row?.teamPolicy, 'cardDeliveryDaily');
    const dailyLimitOverride = policyLimit.applies
      ? policyLimit.mode === 'unlimited'
        ? TEAM_POLICY_UNLIMITED_LIMIT
        : policyLimit.configuredLimit
      : rawOverride === null || rawOverride === undefined
      ? null
      : Math.max(0, Math.min(500, Math.trunc(Number(rawOverride || 0) || 0)));
    return {
      mode,
      label:
        pausedActive ? 'Pausado manualmente' :
        mode === 'priority' ? 'Prioridade' :
        mode === 'normal' ? 'Normal' :
        'Aprendizagem',
      pausedUntil: pausedUntil instanceof Date ? pausedUntil.toISOString() : null,
      pausedActive,
      dailyLimitOverride,
      note: this.normalizeText(row?.sellerDistributionNote),
      updatedAt: row?.sellerDistributionUpdatedAt instanceof Date ? row.sellerDistributionUpdatedAt.toISOString() : null,
    };
  }

  private buildSellerAuditStatus(input: {
    receivedCards: number;
    workedCards: number;
    idleCards: number;
    activeCards: number;
    interestedCards: number;
    overdueCards: number;
  }) {
    const workedRate = input.receivedCards > 0 ? input.workedCards / input.receivedCards : input.activeCards > 0 ? input.workedCards / input.activeCards : 0;
    if (input.interestedCards > 0 || workedRate >= 0.75) {
      return {
        key: 'performing',
        label: 'Respondendo bem',
        tone: 'success',
        recommendation: 'Manter volume e observar quais segmentos estão convertendo.',
      };
    }
    if (input.receivedCards > 0 && input.workedCards === 0) {
      return {
        key: 'learning',
        label: 'Aprendizado',
        tone: 'learning',
        recommendation: 'Acompanhar abordagem e revisar primeiro contato. Sem bloqueio automático.',
      };
    }
    if (input.idleCards >= 8 || input.overdueCards >= 5) {
      return {
        key: 'needs_followup',
        label: 'Precisa acompanhamento',
        tone: 'warning',
        recommendation: 'Conversar com o vendedor antes de reduzir volume. Verificar dificuldade real.',
      };
    }
    return {
      key: 'active',
      label: 'Em operação',
      tone: 'info',
      recommendation: 'Continuar medindo antes de qualquer regra de corte.',
    };
  }

  async getSellerAuditForUser(user: any, periodRaw?: string) {
    const context = await this.resolveVendasUserContext(user);
    const period = this.resolveReportPeriod(periodRaw || 'today');
    const now = new Date();
    const dayKey = this.getSaoPauloDayKey(now);
    const todayPeriod = this.getSaoPauloDayBounds(dayKey);
    const sellerWhere = context.canManageTeam
      ? { companyId: context.companyId, role: 'USER' }
      : { companyId: context.companyId, id: context.userId };

    const [sellers, distributionRules] = await Promise.all([
      (this.prisma.user as any).findMany({
        where: sellerWhere,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { email: 'asc' }],
        take: 120,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          deactivatedAt: true,
          commissionPercent: true,
          sellerDistributionMode: true,
          sellerDistributionPausedUntil: true,
          sellerDistributionDailyLimitOverride: true,
          sellerDistributionNote: true,
          sellerDistributionUpdatedAt: true,
          botAccessEnabled: true,
          createdAt: true,
          teamPolicy: {
            select: {
              cardDeliveryDailyMode: true,
              cardDeliveryDailyLimit: true,
            },
          },
        },
      }),
      this.prisma.radarAutoDistributionRule.findMany({
        where: {
          companyId: context.companyId,
          status: 'active',
          scope: { in: ['company', 'tenant_distribution'] },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 4,
      }).catch(() => []),
    ]);
    const sellerIds = sellers.map((seller) => Number(seller.id || 0)).filter(Boolean);
    const activeDistributionRule = (
      (user?.isSystemMaster || context.role === 'USERMASTER')
        ? distributionRules.find((rule: any) => String(rule?.scope || '') === 'tenant_distribution')
        : distributionRules.find((rule: any) => String(rule?.scope || '') === 'company')
    ) || distributionRules.find((rule: any) => String(rule?.scope || '') === 'company') || distributionRules[0] || null;
    const ruleFilters = this.parseMaybeJsonObject((activeDistributionRule as any)?.filtersJson);
    const ruleCity = String((activeDistributionRule as any)?.preferredCity || ruleFilters?.city || '').trim();
    const ruleState = String((activeDistributionRule as any)?.preferredState || ruleFilters?.state || '').trim().toUpperCase();
    const ruleSegment = String((activeDistributionRule as any)?.segment || ruleFilters?.segment || '').trim();
    const ruleCityKey = this.normalizeLookupKey(ruleCity, ruleState);
    const territories = this.parseRadarRuleTerritories((activeDistributionRule as any)?.filtersJson);
    const territoryMode = territories.length ? 'fixed_cities' : 'open';
    const territoryByUserId = new Map(territories.map((territory) => [Number(territory.userId || 0), territory]));
    const dailyLimitPerSeller = activeDistributionRule
      ? Math.max(0, Math.trunc(Number((activeDistributionRule as any)?.dailyLimitPerSeller ?? 20) || 0))
      : 0;

    const [leads, dailyUsageRows] = await Promise.all([
      sellerIds.length
        ? this.prisma.vendasLead.findMany({
          where: {
            companyId: context.companyId,
            assignedUserId: { in: sellerIds },
          },
          orderBy: [{ updatedAt: 'desc' }],
          take: 5000,
          include: {
            timelineEvents: {
              where: { createdAt: { gte: period.start, lte: period.end } },
              orderBy: [{ createdAt: 'desc' }],
              take: 20,
            },
          },
        })
        : Promise.resolve([]),
      sellerIds.length
        ? this.prisma.$queryRawUnsafe<Array<{
            userId?: number | null;
            dailyLimit?: number | null;
            deliveredCount?: number | null;
            skippedCount?: number | null;
            lastSkipReason?: string | null;
          }>>(
            `SELECT "userId", "dailyLimit", "deliveredCount", "skippedCount", "lastSkipReason"
             FROM "RadarDistributionDailyUsage"
             WHERE "companyId" = $1
               AND "dayKey" = $2
               AND "userId" IN (${sellerIds.join(',')})`,
            context.companyId,
            dayKey,
          ).catch(() => [])
        : Promise.resolve([]),
    ]);
    const dailyUsageBySeller = new Map(
      (dailyUsageRows || []).map((row) => [Number(row?.userId || 0), row]),
    );

    const bySeller = new Map<number, any[]>();
    for (const lead of leads as any[]) {
      const sellerId = Number(lead?.assignedUserId || 0);
      if (!sellerId) continue;
      const bucket = bySeller.get(sellerId) || [];
      bucket.push(lead);
      bySeller.set(sellerId, bucket);
    }

    const rows = sellers.map((seller) => {
      const sellerLeads = bySeller.get(Number(seller.id)) || [];
      let activeCards = 0;
      let receivedCards = 0;
      let workedCards = 0;
      let idleCards = 0;
      let idleReceivedCards = 0;
      let overdueCards = 0;
      let returnCards = 0;
      let interestedCards = 0;
      let closedCards = 0;
      let trialOrSaleCards = 0;
      let receivedToday = 0;
      let workedToday = 0;
      let idleReceivedToday = 0;
      let responseCards = 0;
      let refusedCards = 0;
      let blockedCards = 0;
      let lastActivityAt: Date | null = null;
      const cityCounts = new Map<string, number>();
      const segmentCounts = new Map<string, number>();

      for (const lead of sellerLeads) {
        const closed = this.isClosedLead(lead);
        const hasEverWorked = Number(lead?.attemptCount || 0) > 0 || Boolean(lead?.lastContactAt);
        const periodTimeline = Array.isArray(lead?.timelineEvents) ? lead.timelineEvents : [];
        const timelineWorked = periodTimeline.some((event: any) =>
          ['contact_made', 'result_recorded', 'return_scheduled', 'hbx_signup_link_created', 'hbx_assisted_signup_created', 'lead_closed'].includes(String(event?.eventType || '')),
        );
        const workedInPeriod = this.isDateInPeriod(lead?.lastContactAt, period) || timelineWorked;
        const receivedInPeriod = this.isDateInPeriod(lead?.assignedAt, period) || this.isDateInPeriod(lead?.createdAt, period);
        const workedInToday = this.isDateInPeriod(lead?.lastContactAt, todayPeriod) || periodTimeline.some((event: any) =>
          this.isDateInPeriod(event?.createdAt, todayPeriod) &&
          ['contact_made', 'result_recorded', 'return_scheduled', 'hbx_signup_link_created', 'hbx_assisted_signup_created', 'lead_closed'].includes(String(event?.eventType || '')),
        );
        const receivedInToday = this.isDateInPeriod(lead?.assignedAt, todayPeriod) || this.isDateInPeriod(lead?.createdAt, todayPeriod);
        const returnAt = lead?.returnAt instanceof Date ? lead.returnAt : this.parseDate(lead?.returnAt);
        const saleStatus = this.normalizeSaleStatus(lead?.saleStatus);
        const interested =
          this.normalizeStatus(lead?.status) === 'qualificado' ||
          ['activation_pending', 'trial_started', 'sale_confirmed'].includes(saleStatus);
        const replied = periodTimeline.some((event: any) =>
          ['reply_received', 'inbound_reply'].includes(String(event?.eventType || '')),
        ) || /respondeu|retorno|interess|positivo|trial|ativ/i.test(String(lead?.lastResult || ''));
        const refused = /sem interesse|recus|negativ|nao quer|não quer|dispens/i.test(String(lead?.lastResult || ''));
        const blocked = /bloque|opt.?out|complaint|reclam|denuncia|denúncia/i.test(String(lead?.lastResult || ''));

        if (!closed) activeCards += 1;
        if (receivedInPeriod) receivedCards += 1;
        if (workedInPeriod) workedCards += 1;
        if (!closed && !hasEverWorked) idleCards += 1;
        if (receivedInPeriod && !workedInPeriod) idleReceivedCards += 1;
        if (receivedInToday) receivedToday += 1;
        if (workedInToday) workedToday += 1;
        if (receivedInToday && !workedInToday) idleReceivedToday += 1;
        if (!closed && returnAt && returnAt.getTime() < now.getTime()) overdueCards += 1;
        if (!closed && this.normalizeStatus(lead?.status) === 'retorno') returnCards += 1;
        if (interested) interestedCards += 1;
        if (closed) closedCards += 1;
        if (['trial_started', 'sale_confirmed'].includes(saleStatus)) trialOrSaleCards += 1;
        if (replied) responseCards += 1;
        if (refused) refusedCards += 1;
        if (blocked) blockedCards += 1;
        if (lead?.city) this.incrementRanking(cityCounts, lead.city);
        if (lead?.segment) this.incrementRanking(segmentCounts, lead.segment);

        const activityDates = [
          lead?.lastContactAt instanceof Date ? lead.lastContactAt : null,
          lead?.updatedAt instanceof Date ? lead.updatedAt : null,
          ...periodTimeline.map((event: any) => event?.createdAt instanceof Date ? event.createdAt : null),
        ].filter((date): date is Date => Boolean(date));
        for (const date of activityDates) {
          if (!lastActivityAt || date.getTime() > lastActivityAt.getTime()) lastActivityAt = date;
        }
      }
      const usage = dailyUsageBySeller.get(Number(seller.id)) || null;
      const governance = this.buildSellerGovernance(seller);
      const deliveredToday = Math.max(
        receivedToday,
        Math.max(0, Math.trunc(Number(usage?.deliveredCount || 0) || 0)),
      );
      const dailyLimit = governance.dailyLimitOverride !== null
        ? governance.dailyLimitOverride
        : Math.max(0, Math.trunc(Number(usage?.dailyLimit ?? dailyLimitPerSeller) || 0));
      const dailyRemaining = Math.max(0, dailyLimit - deliveredToday);
      const territory = territoryByUserId.get(Number(seller.id));
      const territoryCities = territory?.cities || [];
      const coversRuleCity = territoryMode === 'open' || !ruleCityKey || territoryCities.some((city) => this.normalizeLookupKey(city.city, city.state) === ruleCityKey);
      const noDeliveryReason = !activeDistributionRule
        ? 'Distribuição automática não configurada'
        : governance.pausedActive
          ? 'Pausado manualmente'
        : territoryMode === 'fixed_cities' && !territoryCities.length
          ? 'Sem território configurado'
          : territoryMode === 'fixed_cities' && !coversRuleCity
            ? 'Fora do território da cidade ativa'
            : dailyLimit <= 0
              ? 'Limite diário zerado'
              : dailyRemaining <= 0
              ? 'Limite diário atingido'
              : idleReceivedToday > 0
                ? 'Cards de hoje parados'
                : null;
      const operationAction = !activeDistributionRule
        ? 'sem_regra'
        : governance.pausedActive
          ? 'pausado_manual'
        : territoryMode === 'fixed_cities' && (!territoryCities.length || !coversRuleCity)
          ? 'revisar_territorio'
          : dailyLimit <= 0 || dailyRemaining <= 0
            ? 'limite_atingido'
            : idleReceivedToday >= 3
              ? 'acompanhar'
              : dailyRemaining > 0
                ? 'receber'
                : 'ok';
      const operationLabel =
        operationAction === 'receber' ? 'Pode receber' :
        operationAction === 'acompanhar' ? 'Acompanhar hoje' :
        operationAction === 'revisar_territorio' ? 'Revisar território' :
        operationAction === 'limite_atingido' ? 'Limite do dia' :
        operationAction === 'pausado_manual' ? 'Pausado manualmente' :
        operationAction === 'sem_regra' ? 'Sem regra ativa' :
        'Em dia';

      const status = this.buildSellerAuditStatus({
        receivedCards,
        workedCards,
        idleCards,
        activeCards,
        interestedCards,
        overdueCards,
      });
      return {
        seller: {
          id: Number(seller.id),
          name: seller.name || seller.email || `Vendedor ${seller.id}`,
          email: seller.email || null,
          phone: seller.phone || null,
          active: Boolean(seller.isActive && !seller.deactivatedAt),
          commissionPercent: this.normalizeCurrencyAmount(seller.commissionPercent),
          startedAt: seller.createdAt instanceof Date ? seller.createdAt.toISOString() : null,
          botAccessEnabled: Boolean((seller as any).botAccessEnabled),
        },
        metrics: {
          activeCards,
          receivedCards,
          workedCards,
          idleCards,
          idleReceivedCards,
          overdueCards,
          returnCards,
          interestedCards,
          closedCards,
          trialOrSaleCards,
          receivedToday,
          workedToday,
          idleReceivedToday,
          responseCards,
          refusedCards,
          blockedCards,
          dailyLimit,
          deliveredToday,
          dailyRemaining,
          skippedToday: Math.max(0, Math.trunc(Number(usage?.skippedCount || 0) || 0)),
          workRate: receivedCards > 0 ? workedCards / receivedCards : 0,
        },
        topCity: this.mapToRanking(cityCounts)[0]?.label || null,
        topSegment: this.mapToRanking(segmentCounts)[0]?.label || null,
        lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
        status,
        operation: {
          action: operationAction,
          label: operationLabel,
          reason: noDeliveryReason,
          dayKey,
          ruleActive: Boolean(activeDistributionRule),
          ruleScope: activeDistributionRule ? String((activeDistributionRule as any)?.scope || 'company') : null,
          ruleCity: ruleCity || null,
          ruleState: ruleState || null,
          ruleSegment: ruleSegment || null,
          territoryMode,
          territoryCities,
          coversRuleCity,
          dailyLimit,
          deliveredToday,
          dailyRemaining,
          skippedToday: Math.max(0, Math.trunc(Number(usage?.skippedCount || 0) || 0)),
          lastSkipReason: usage?.lastSkipReason || null,
        },
        governance,
        automaticPenalty: false,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.activeCards += row.metrics.activeCards;
        acc.receivedCards += row.metrics.receivedCards;
        acc.workedCards += row.metrics.workedCards;
        acc.idleCards += row.metrics.idleCards;
        acc.idleReceivedCards += row.metrics.idleReceivedCards;
        acc.overdueCards += row.metrics.overdueCards;
        acc.interestedCards += row.metrics.interestedCards;
        acc.trialOrSaleCards += row.metrics.trialOrSaleCards;
        acc.receivedToday += row.metrics.receivedToday;
        acc.workedToday += row.metrics.workedToday;
        acc.idleReceivedToday += row.metrics.idleReceivedToday;
        acc.responseCards += row.metrics.responseCards;
        acc.refusedCards += row.metrics.refusedCards;
        acc.blockedCards += row.metrics.blockedCards;
        acc.dailyLimit += row.metrics.dailyLimit;
        acc.deliveredToday += row.metrics.deliveredToday;
        acc.dailyRemaining += row.metrics.dailyRemaining;
        acc.skippedToday += row.metrics.skippedToday;
        if (row.operation?.action === 'receber') acc.canReceive += 1;
        if (['acompanhar', 'revisar_territorio', 'limite_atingido', 'sem_regra', 'pausado_manual'].includes(String(row.operation?.action || ''))) acc.exceptions += 1;
        if (row.operation?.action === 'revisar_territorio') acc.territoryIssues += 1;
        if (row.operation?.action === 'limite_atingido') acc.dailyLimitReached += 1;
        if (row.operation?.action === 'pausado_manual') acc.manualPaused += 1;
        return acc;
      },
      {
        sellers: rows.length,
        activeCards: 0,
        receivedCards: 0,
        workedCards: 0,
        idleCards: 0,
        idleReceivedCards: 0,
        overdueCards: 0,
        interestedCards: 0,
        trialOrSaleCards: 0,
        receivedToday: 0,
        workedToday: 0,
        idleReceivedToday: 0,
        responseCards: 0,
        refusedCards: 0,
        blockedCards: 0,
        dailyLimit: 0,
        deliveredToday: 0,
        dailyRemaining: 0,
        skippedToday: 0,
        canReceive: 0,
        exceptions: 0,
        territoryIssues: 0,
        dailyLimitReached: 0,
        manualPaused: 0,
      },
    );

    return {
      ok: true,
      canManage: Boolean(context.canManageTeam),
      learningMode: true,
      automaticPenalty: false,
      period,
      operation: {
        title: 'Painel de guerra diário',
        dayKey,
        ruleActive: Boolean(activeDistributionRule),
        ruleScope: activeDistributionRule ? String((activeDistributionRule as any)?.scope || 'company') : null,
        ruleCity: ruleCity || null,
        ruleState: ruleState || null,
        ruleSegment: ruleSegment || null,
        territoryMode,
        dailyLimitPerSeller,
        summary: {
          receivedToday: totals.receivedToday,
          workedToday: totals.workedToday,
          idleReceivedToday: totals.idleReceivedToday,
          responses: totals.responseCards,
          refused: totals.refusedCards,
          blocked: totals.blockedCards,
          dailyLimit: totals.dailyLimit,
          deliveredToday: totals.deliveredToday,
          dailyRemaining: totals.dailyRemaining,
          skippedToday: totals.skippedToday,
          canReceive: totals.canReceive,
          exceptions: totals.exceptions,
          territoryIssues: totals.territoryIssues,
          dailyLimitReached: totals.dailyLimitReached,
          manualPaused: totals.manualPaused,
        },
      },
      totals,
      rows,
      auditPolicy: {
        title: 'Auditoria operacional transparente',
        description: 'Mede apenas ações comerciais dentro do HBX: cards recebidos, contato, retorno e venda. Não mede jornada, localização ou dados pessoais fora da finalidade comercial.',
      },
    };
  }

  async updateSellerGovernanceForUser(user: any, sellerIdRaw: number, input: {
    mode?: string | null;
    pausedUntil?: string | Date | null;
    pausedDays?: number | null;
    dailyLimitOverride?: number | null;
    note?: string | null;
    botAccess?: boolean | null;
  } = {}) {
    const context = await this.resolveVendasUserContext(user);
    if (!context.canManageTeam) {
      throw new ForbiddenException('Apenas Admin/Master pode ajustar governança de vendedor.');
    }
    const sellerId = Math.trunc(Number(sellerIdRaw || 0));
    if (!sellerId) throw new BadRequestException('Vendedor inválido.');
    const seller = await (this.prisma.user as any).findFirst({
      where: {
        id: sellerId,
        companyId: context.companyId,
        role: 'USER',
        isSystemMaster: false,
      },
      select: {
        id: true,
        sellerDistributionMode: true,
        sellerDistributionPausedUntil: true,
        sellerDistributionDailyLimitOverride: true,
        sellerDistributionNote: true,
        sellerDistributionUpdatedAt: true,
        teamPolicy: {
          select: {
            cardDeliveryDailyMode: true,
            cardDeliveryDailyLimit: true,
          },
        },
      },
    });
    if (!seller) throw new NotFoundException('Vendedor não encontrado.');

    const hasMode = input.mode !== undefined && input.mode !== null;
    const mode = hasMode
      ? this.normalizeSellerDistributionMode(input.mode, 'learning')
      : this.normalizeSellerDistributionMode(seller.sellerDistributionMode);
    let pausedUntil: Date | null = seller.sellerDistributionPausedUntil instanceof Date ? seller.sellerDistributionPausedUntil : this.parseDate(seller.sellerDistributionPausedUntil);
    if (mode !== 'paused') {
      pausedUntil = null;
    } else if (input.pausedUntil !== undefined) {
      pausedUntil = input.pausedUntil ? this.parseDate(input.pausedUntil) : null;
    } else if (input.pausedDays !== undefined) {
      const days = Math.max(1, Math.min(30, Math.trunc(Number(input.pausedDays || 1) || 1)));
      pausedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else if (hasMode && (!pausedUntil || pausedUntil.getTime() <= Date.now())) {
      pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const data: any = {
      sellerDistributionMode: mode,
      sellerDistributionPausedUntil: pausedUntil,
      sellerDistributionUpdatedAt: new Date(),
    };
    if (input.dailyLimitOverride !== undefined) {
      data.sellerDistributionDailyLimitOverride = input.dailyLimitOverride === null
        ? null
        : Math.max(0, Math.min(500, Math.trunc(Number(input.dailyLimitOverride || 0) || 0)));
    }
    if (input.note !== undefined) {
      data.sellerDistributionNote = this.normalizeText(input.note)?.slice(0, 240) || null;
    }
    if (input.botAccess !== undefined && input.botAccess !== null) {
      data.botAccessEnabled = Boolean(input.botAccess);
    }

    const updated = await (this.prisma.user as any).update({
      where: { id: sellerId },
      data,
      select: {
        id: true,
        sellerDistributionMode: true,
        sellerDistributionPausedUntil: true,
        sellerDistributionDailyLimitOverride: true,
        sellerDistributionNote: true,
        sellerDistributionUpdatedAt: true,
        teamPolicy: {
          select: {
            cardDeliveryDailyMode: true,
            cardDeliveryDailyLimit: true,
          },
        },
      },
    });
    if (input.dailyLimitOverride !== undefined) {
      await ensureUserTeamPolicyForUser(this.prisma, sellerId, {
        source: 'vendas_seller_governance',
        overwrite: false,
      }).catch(() => null);
      const normalizedDailyLimit = data.sellerDistributionDailyLimitOverride;
      await (this.prisma as any).userTeamPolicy?.update?.({
        where: { userId: sellerId },
        data: {
          cardDeliveryDailyMode: normalizedDailyLimit === null || normalizedDailyLimit === undefined
            ? 'inherit'
            : normalizedDailyLimit <= 0
              ? 'blocked'
              : 'limited',
          cardDeliveryDailyLimit: normalizedDailyLimit === null || normalizedDailyLimit === undefined
            ? null
            : Math.max(0, Math.trunc(Number(normalizedDailyLimit || 0) || 0)),
          source: 'vendas_seller_governance',
        },
      }).catch(() => null);
      (updated as any).teamPolicy = {
        cardDeliveryDailyMode: normalizedDailyLimit === null || normalizedDailyLimit === undefined
          ? 'inherit'
          : normalizedDailyLimit <= 0
            ? 'blocked'
            : 'limited',
        cardDeliveryDailyLimit: normalizedDailyLimit === null || normalizedDailyLimit === undefined
          ? null
          : Math.max(0, Math.trunc(Number(normalizedDailyLimit || 0) || 0)),
      };
    }

    return {
      ok: true,
      sellerId,
      governance: this.buildSellerGovernance(updated),
      message: mode === 'paused'
        ? 'Vendedor pausado manualmente na distribuição.'
        : 'Governança do vendedor atualizada.',
    };
  }

  private resolveHbxClosingStage(row: any): 'conversation' | 'interested' | 'pendingActivation' | 'trial' | 'confirmed' | 'inactive' {
    const saleStatus = this.normalizeSaleStatus(row?.saleStatus);
    const status = this.normalizeStatus(row?.status);
    const lastResult = String(row?.lastResult || '');
    if (saleStatus === 'inactive' || saleStatus === 'canceled' || (status === 'encerrado' && saleStatus === 'none')) {
      return 'inactive';
    }
    if (saleStatus === 'sale_confirmed') return 'confirmed';
    if (saleStatus === 'trial_started') return 'trial';
    if (saleStatus === 'activation_pending') return 'pendingActivation';
    if (status === 'qualificado' || /interess|qualific|positivo|fech|trial|ativ/i.test(lastResult)) {
      return 'interested';
    }
    return 'conversation';
  }

  private buildHbxClosingStageLabel(stage: string) {
    switch (stage) {
      case 'interested':
        return 'Interessado';
      case 'pendingActivation':
        return 'Cadastro / e-mail';
      case 'trial':
        return 'Trial';
      case 'confirmed':
        return 'Cliente pago';
      case 'inactive':
        return 'Inativo';
      default:
        return 'Em conversa';
    }
  }

  private buildHbxClosingNextStep(stage: string, input: { hasSignupLink?: boolean; hasAssistedSignup?: boolean; emailPending?: boolean; linkedCompanyId?: number | null }) {
    if (stage === 'interested') {
      return input.hasSignupLink || input.hasAssistedSignup
        ? 'Cobrar confirmação do e-mail e ativação do cadastro.'
        : 'Gerar link HBX ou cadastrar pelo cliente com e-mail real.';
    }
    if (stage === 'pendingActivation') {
      if (input.emailPending) return 'Cliente precisa confirmar o e-mail para liberar trial, pagamento ou implantação.';
      if (!input.linkedCompanyId) return 'Aguardar vínculo da empresa criada ao card para travar comissão.';
      return 'Ativar trial/pagamento e acompanhar D+ da comissão.';
    }
    if (stage === 'trial') return 'Acompanhar implantação, primeiro uso e virada para pagamento.';
    if (stage === 'confirmed') return 'Cliente ativo: manter recorrência e comissão vinculada.';
    if (stage === 'inactive') return 'Entender cancelamento e reativar somente se houver sinal real.';
    return 'Chamar no WhatsApp, registrar resultado e qualificar interesse.';
  }

  async getHbxClosingPipelineForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    await this.hbxCommissionSync.syncSalesCompanyCommissions(context.companyId, { source: 'vendas_closing_pipeline' }).catch((error: any) => {
      this.logger.warn(`closing_pipeline_sync_failed company=${context.companyId} error=${String(error?.message || error)}`);
    });

    const now = new Date();
    const [company, leads] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: context.companyId },
        select: { companyKind: true, commissionDueBusinessDays: true },
      }).catch(() => null),
      this.prisma.vendasLead.findMany({
        where: this.buildLeadAccessWhere(context, {
          OR: [
            { status: { in: ['contato', 'retorno', 'qualificado'] } },
            { saleStatus: { not: 'none' } },
            { commissionStatus: { not: 'none' } },
            { commissionAmount: { gt: 0 } },
            { commissionLinkedCompanyId: { not: null } },
            { lastContactAt: { not: null } },
          ],
        }),
        orderBy: [{ updatedAt: 'desc' }],
        take: 240,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          city: true,
          state: true,
          segment: true,
          status: true,
          nextAction: true,
          lastResult: true,
          lastContactAt: true,
          attemptCount: true,
          assignedUserId: true,
          saleStatus: true,
          saleValue: true,
          salePlanKey: true,
          saleConfirmedAt: true,
          saleCanceledAt: true,
          commissionStatus: true,
          commissionBaseAmount: true,
          commissionAmount: true,
          setupValue: true,
          setupCommissionAmount: true,
          commissionDueAt: true,
          commissionPaidAt: true,
          commissionLinkedCompanyId: true,
          commissionLinkedAt: true,
          createdAt: true,
          updatedAt: true,
          timelineEvents: {
            orderBy: [{ createdAt: 'desc' }],
            take: 10,
            select: {
              eventType: true,
              title: true,
              description: true,
              resultLabel: true,
              sourceType: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const sellerIds = Array.from(new Set(
      (leads as any[])
        .map((lead) => Math.trunc(Number(lead?.assignedUserId || 0)) || 0)
        .filter((id) => id > 0),
    ));
    const sellers = sellerIds.length
      ? await this.prisma.user.findMany({
          where: { companyId: context.companyId, id: { in: sellerIds } },
          select: { id: true, name: true, email: true, phone: true, role: true, commissionPercent: true },
        }).catch(() => [])
      : [];
    const sellerById = new Map((sellers as any[]).map((seller) => [Number(seller.id), seller]));
    const dueBusinessDays = this.normalizeCommissionDueBusinessDays(company?.commissionDueBusinessDays);
    const stages: Record<string, any[]> = {
      conversation: [],
      interested: [],
      pendingActivation: [],
      trial: [],
      confirmed: [],
      inactive: [],
    };
    const stagePriority: Record<string, number> = {
      pendingActivation: 0,
      interested: 1,
      trial: 2,
      conversation: 3,
      confirmed: 4,
      inactive: 5,
    };
    let waitingEmail = 0;
    let signupLinks = 0;
    let assistedSignups = 0;
    let linkedCompanies = 0;
    let commissionAmount = 0;
    let dueCommissionAmount = 0;

    const items = (leads as any[]).map((lead) => {
      const timeline = Array.isArray(lead?.timelineEvents) ? lead.timelineEvents : [];
      const signupLinkEvent = timeline.find((event: any) => String(event?.eventType || '') === 'hbx_signup_link_created') || null;
      const assistedSignupEvent = timeline.find((event: any) => String(event?.eventType || '') === 'hbx_assisted_signup_created') || null;
      const emailPending = Boolean(
        assistedSignupEvent &&
        (
          String(assistedSignupEvent?.resultLabel || '').includes('pending_email') ||
          /confirmar|confirmação|confirmacao|e-mail|email/i.test(String(assistedSignupEvent?.description || ''))
        ) &&
        !lead?.commissionLinkedAt,
      );
      const linkedCompanyId = Number(lead?.commissionLinkedCompanyId || 0) || null;
      const stage = this.resolveHbxClosingStage(lead);
      const seller = sellerById.get(Number(lead?.assignedUserId || 0)) || null;
      const commission = this.normalizeCurrencyAmount(lead?.commissionAmount);
      const setupCommission = this.normalizeCurrencyAmount(lead?.setupCommissionAmount);
      const isDue = this.isDueCommission(lead, now);
      if (emailPending) waitingEmail += 1;
      if (signupLinkEvent) signupLinks += 1;
      if (assistedSignupEvent) assistedSignups += 1;
      if (linkedCompanyId) linkedCompanies += 1;
      commissionAmount += commission + setupCommission;
      if (isDue) dueCommissionAmount += commission + setupCommission;
      const item = {
        leadId: String(lead?.id || ''),
        name: lead?.name ? String(lead.name) : lead?.phone ? String(lead.phone) : 'Cliente sem nome',
        phone: lead?.phone ? String(lead.phone) : null,
        email: lead?.email ? String(lead.email) : null,
        city: lead?.city ? String(lead.city) : null,
        state: lead?.state ? String(lead.state) : null,
        segment: lead?.segment ? String(lead.segment) : null,
        stage,
        stageLabel: this.buildHbxClosingStageLabel(stage),
        stageTone: stage === 'confirmed' || stage === 'trial'
          ? 'success'
          : stage === 'pendingActivation'
            ? 'warning'
            : stage === 'inactive'
              ? 'danger'
              : 'info',
        status: this.normalizeStatus(lead?.status),
        statusLabel: this.formatStatusLabel(this.normalizeStatus(lead?.status)),
        saleStatus: this.normalizeSaleStatus(lead?.saleStatus),
        saleStatusLabel: this.formatSaleStatusLabel(this.normalizeSaleStatus(lead?.saleStatus)),
        salePlanKey: lead?.salePlanKey ? String(lead.salePlanKey) : null,
        saleValue: this.normalizeCurrencyAmount(lead?.saleValue || lead?.commissionBaseAmount),
        commissionStatus: this.normalizeCommissionStatus(lead?.commissionStatus),
        commissionStatusLabel: this.formatCommissionStatusLabel(this.normalizeCommissionStatus(lead?.commissionStatus)),
        commissionAmount: commission,
        setupValue: this.normalizeCurrencyAmount(lead?.setupValue),
        setupCommissionAmount: setupCommission,
        commissionDueAt: lead?.commissionDueAt instanceof Date ? lead.commissionDueAt.toISOString() : null,
        commissionPaidAt: lead?.commissionPaidAt instanceof Date ? lead.commissionPaidAt.toISOString() : null,
        linkedCompanyId,
        linkedAt: lead?.commissionLinkedAt instanceof Date ? lead.commissionLinkedAt.toISOString() : null,
        hasSignupLink: Boolean(signupLinkEvent),
        hasAssistedSignup: Boolean(assistedSignupEvent),
        emailPending,
        signupLinkCreatedAt: signupLinkEvent?.createdAt instanceof Date ? signupLinkEvent.createdAt.toISOString() : null,
        assistedSignupCreatedAt: assistedSignupEvent?.createdAt instanceof Date ? assistedSignupEvent.createdAt.toISOString() : null,
        nextStep: this.buildHbxClosingNextStep(stage, {
          hasSignupLink: Boolean(signupLinkEvent),
          hasAssistedSignup: Boolean(assistedSignupEvent),
          emailPending,
          linkedCompanyId,
        }),
        nextAction: lead?.nextAction ? String(lead.nextAction) : null,
        lastResult: lead?.lastResult ? String(lead.lastResult) : null,
        lastContactAt: lead?.lastContactAt instanceof Date ? lead.lastContactAt.toISOString() : null,
        updatedAt: lead?.updatedAt instanceof Date ? lead.updatedAt.toISOString() : null,
        seller: seller
          ? {
              id: Number(seller.id || 0),
              name: seller.name ? String(seller.name) : null,
              email: seller.email ? String(seller.email) : null,
              phone: seller.phone ? String(seller.phone) : null,
              role: seller.role ? String(seller.role) : null,
              commissionPercent: Number(seller.commissionPercent || 0) || 0,
            }
          : null,
      };
      stages[stage].push(item);
      return item;
    });

    const stageCounts = Object.fromEntries(
      Object.entries(stages).map(([stage, rows]) => [stage, rows.length]),
    ) as Record<string, number>;
    const sortedItems = items.sort((a, b) => {
      const stageDiff = (stagePriority[a.stage] ?? 9) - (stagePriority[b.stage] ?? 9);
      if (stageDiff !== 0) return stageDiff;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });

    Object.keys(stages).forEach((stage) => {
      stages[stage] = stages[stage]
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        .slice(0, 12);
    });

    return {
      ok: true,
      scope: context.canManageTeam ? 'company' : 'seller',
      canManage: Boolean(context.canManageTeam),
      isSellerNetwork: Boolean(company && isTenantCompany(company)),
      generatedAt: now.toISOString(),
      settings: {
        dueBusinessDays,
      },
      totals: {
        total: items.length,
        conversation: stageCounts.conversation || 0,
        interested: stageCounts.interested || 0,
        pendingActivation: stageCounts.pendingActivation || 0,
        trial: stageCounts.trial || 0,
        confirmed: stageCounts.confirmed || 0,
        inactive: stageCounts.inactive || 0,
        waitingEmail,
        signupLinks,
        assistedSignups,
        linkedCompanies,
        commissionAmount: this.normalizeCurrencyAmount(commissionAmount),
        dueCommissionAmount: this.normalizeCurrencyAmount(dueCommissionAmount),
      },
      policy: {
        title: 'Esteira obrigatória de venda HBX',
        description: `Card chamado, interessado rastreado, e-mail confirmado, trial/pagamento vinculado e comissão D+${dueBusinessDays}.`,
      },
      stages,
      priority: sortedItems.slice(0, 18),
    };
  }

  async createCommissionPayoutForUser(user: any, dto: CreateCommissionPayoutDto = {}) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanMarkCommissionPaid(context);

    await this.hbxCommissionSync.syncSalesCompanyCommissions(context.companyId, { source: 'vendas_commission_payout' }).catch((error: any) => {
      this.logger.warn(`commission_payout_sync_failed company=${context.companyId} error=${String(error?.message || error)}`);
    });

    const now = new Date();
    const requestedSellerUserId = Math.trunc(Number(dto?.sellerUserId || 0)) || null;
    const canManageCommissionTeam = this.canUseCommissionTeamScope(context);
    if (requestedSellerUserId && !canManageCommissionTeam && requestedSellerUserId !== context.userId) {
      throw new ForbiddenException('Acesso para registrar pagamento de comissao de outro vendedor bloqueado pela politica da equipe.');
    }
    const sellerUserId = canManageCommissionTeam
      ? requestedSellerUserId
      : context.userId;
    if (sellerUserId) {
      const seller = await this.prisma.user.findFirst({
        where: {
          id: sellerUserId,
          companyId: context.companyId,
          role: 'USER',
          isSystemMaster: false,
        },
        select: { id: true },
      }).catch(() => null);
      if (!seller) throw new NotFoundException('Vendedor não encontrado para pagamento.');
    }

    const includeNotYetDue = Boolean(dto?.includeNotYetDue);
    const dueWhere = includeNotYetDue
      ? {}
      : {
          OR: [
            { commissionDueAt: null },
            { commissionDueAt: { lte: now } },
          ],
        };
    const receivableDueWhere = includeNotYetDue
      ? {}
      : {
          OR: [
            { dueAt: null },
            { dueAt: { lte: now } },
          ],
        };

    // E5 (PLAN12062026001): caso de cancelamento ABERTO trava o payout das
    // comissões do lead até a decisão do master.
    const openCancellationCases = await this.prisma.vendasLead.findMany({
      where: { companyId: context.companyId, cancellationCaseStatus: 'open' },
      select: { id: true },
      take: 1000,
    });
    const openCancellationCaseLeadIds = openCancellationCases.map((c) => c.id);

    const [leads, receivables] = await Promise.all([
      this.prisma.vendasLead.findMany({
        where: {
          companyId: context.companyId,
          commissionStatus: 'payable',
          commissionAmount: { gt: 0 },
          ...(sellerUserId ? { assignedUserId: sellerUserId } : {}),
          ...(openCancellationCaseLeadIds.length ? { id: { notIn: openCancellationCaseLeadIds } } : {}),
          ...dueWhere,
        },
        select: {
          id: true,
          name: true,
          assignedUserId: true,
          commissionAmount: true,
          commissionDueAt: true,
        },
        orderBy: [{ commissionDueAt: 'asc' }, { updatedAt: 'desc' }],
        take: 500,
      }),
      this.prisma.vendasCommissionReceivable.findMany({
        where: {
          companyId: context.companyId,
          status: 'payable',
          amount: { gt: 0 },
          ...(sellerUserId ? { sellerUserId } : {}),
          ...(openCancellationCaseLeadIds.length ? { OR: [{ leadId: null }, { leadId: { notIn: openCancellationCaseLeadIds } }] } : {}),
          ...receivableDueWhere,
        },
        select: {
          id: true,
          leadId: true,
          sellerUserId: true,
          amount: true,
          dueAt: true,
          kind: true,
        },
        orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
        take: 500,
      }),
    ]);

    const groups = new Map<number, { leads: any[]; receivables: any[] }>();
    const ensureGroup = (idRaw: unknown) => {
      const id = Math.trunc(Number(idRaw || 0)) || 0;
      if (!id) return null;
      const existing = groups.get(id);
      if (existing) return existing;
      const created = { leads: [] as any[], receivables: [] as any[] };
      groups.set(id, created);
      return created;
    };
    leads.forEach((row) => ensureGroup(row.assignedUserId)?.leads.push(row));
    receivables.forEach((row) => ensureGroup(row.sellerUserId)?.receivables.push(row));

    if (!groups.size) {
      throw new BadRequestException(includeNotYetDue
        ? 'Nenhuma comissão em aberto para registrar pagamento.'
        : 'Nenhuma comissão vencida em D+ para registrar pagamento.');
    }

    const baseReferenceLabel = this.normalizeText(dto?.referenceLabel)?.slice(0, 120) || null;
    const notes = this.normalizeText(dto?.notes)?.slice(0, 280) || null;

    const payouts = await this.prisma.$transaction(async (tx) => {
      const createdPayouts: any[] = [];
      for (const [groupSellerUserId, group] of groups.entries()) {
        const payableLeadIds = group.leads.map((row) => String(row.id));
        const payableReceivableIds = group.receivables.map((row) => String(row.id));
        const totalAmount = this.normalizeCurrencyAmount(
          group.leads.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.commissionAmount), 0) +
          group.receivables.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.amount), 0),
        );
        const leadCount = payableLeadIds.length + payableReceivableIds.length;
        if (!leadCount || totalAmount <= 0) continue;

        const referenceLabel =
          baseReferenceLabel ||
          `Fechamento vendedor ${groupSellerUserId}`;
        const created = await tx.vendasCommissionPayout.create({
          data: {
            companyId: context.companyId,
            sellerUserId: groupSellerUserId,
            status: 'paid',
            leadCount,
            totalAmount,
            referenceLabel,
            notes,
            paidAt: now,
            createdByUserId: context.userId,
          },
        });

        if (payableLeadIds.length) {
          await tx.vendasLead.updateMany({
            where: {
              companyId: context.companyId,
              id: { in: payableLeadIds },
              commissionStatus: 'payable',
            },
            data: {
              commissionStatus: 'paid',
              commissionPaidAt: now,
              commissionPayoutId: created.id,
            },
          });
        }

        if (payableReceivableIds.length) {
          await tx.vendasCommissionReceivable.updateMany({
            where: {
              companyId: context.companyId,
              id: { in: payableReceivableIds },
              status: 'payable',
            },
            data: {
              status: 'paid',
              paidAt: now,
              payoutId: created.id,
            },
          });
        }

        const timelineLeadIds = Array.from(new Set([
          ...payableLeadIds,
          ...group.receivables.map((row) => String(row.leadId || '')).filter(Boolean),
        ]));
        if (timelineLeadIds.length) {
          await tx.vendasLeadTimelineEvent.createMany({
            data: timelineLeadIds.map((leadId) => ({
              leadId,
              eventType: 'commission_paid',
              title: 'Comissão paga',
              description: `Pagamento interno registrado no fechamento ${created.id}. Valor total: R$ ${totalAmount.toFixed(2)}.`,
              sourceType: 'commission_payout',
              resultLabel: 'paid',
              createdByUserId: context.userId,
            })),
            skipDuplicates: true,
          });
        }

        createdPayouts.push(created);
      }
      return createdPayouts;
    });
    if (!payouts.length) {
      throw new BadRequestException('Nenhuma comissão válida para registrar pagamento.');
    }
    const totalAmount = this.normalizeCurrencyAmount(payouts.reduce((sum, payout) => sum + this.normalizeCurrencyAmount(payout.totalAmount), 0));
    const leadCount = payouts.reduce((sum, payout) => sum + Math.max(0, Math.trunc(Number(payout.leadCount || 0) || 0)), 0);
    const firstPayout = payouts[0];
    const payoutPayload = (payout: any) => ({
      id: payout.id,
      sellerUserId: Number(payout.sellerUserId || 0) || null,
      status: payout.status,
      leadCount: Math.max(0, Math.trunc(Number(payout.leadCount || 0) || 0)),
      totalAmount: this.normalizeCurrencyAmount(payout.totalAmount),
      referenceLabel: payout.referenceLabel || null,
      paidAt: payout.paidAt instanceof Date ? payout.paidAt.toISOString() : null,
      createdAt: payout.createdAt instanceof Date ? payout.createdAt.toISOString() : null,
    });

    return {
      ok: true,
      message: payouts.length > 1
        ? `${payouts.length} pagamentos de comissão registrados por vendedor.`
        : 'Pagamento de comissão registrado.',
      payout: firstPayout ? payoutPayload(firstPayout) : null,
      payouts: payouts.map(payoutPayload),
      totals: { leadCount, totalAmount },
    };
  }

  async cancelCommissionPayoutForUser(user: any, payoutIdRaw: string, dto: CancelCommissionPayoutDto = {}) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanCancelCommission(context);

    const payoutId = String(payoutIdRaw || '').trim();
    if (!payoutId) throw new BadRequestException('Fechamento de comissão inválido.');
    const canManageCommissionTeam = this.canUseCommissionTeamScope(context);

    const payout = await this.prisma.vendasCommissionPayout.findFirst({
      where: {
        id: payoutId,
        companyId: context.companyId,
        ...(canManageCommissionTeam ? {} : { sellerUserId: context.userId }),
      },
      select: {
        id: true,
        companyId: true,
        sellerUserId: true,
        status: true,
        leadCount: true,
        totalAmount: true,
        referenceLabel: true,
        notes: true,
        paidAt: true,
        createdAt: true,
      },
    });
    if (!payout) throw new NotFoundException('Fechamento de comissão não encontrado.');
    if (String(payout.status || '').trim().toLowerCase() === 'canceled') {
      throw new BadRequestException('Este fechamento de comissão já está cancelado.');
    }

    const sellerUserId = Math.trunc(Number(payout.sellerUserId || 0)) || null;
    const [directLeads, receivables] = await Promise.all([
      this.prisma.vendasLead.findMany({
        where: {
          companyId: context.companyId,
          commissionPayoutId: payout.id,
          ...(sellerUserId ? { assignedUserId: sellerUserId } : {}),
        },
        select: { id: true },
      }),
      this.prisma.vendasCommissionReceivable.findMany({
        where: {
          companyId: context.companyId,
          payoutId: payout.id,
          ...(sellerUserId ? { sellerUserId } : {}),
        },
        select: { id: true, leadId: true },
      }),
    ]);

    const directLeadIds = directLeads.map((row) => String(row.id));
    const receivableIds = receivables.map((row) => String(row.id));
    const timelineLeadIds = Array.from(new Set([
      ...directLeadIds,
      ...receivables.map((row) => String(row.leadId || '')).filter(Boolean),
    ]));
    const cancelReason = this.normalizeText(dto?.notes)?.slice(0, 280) || null;
    const canceledAt = new Date();
    const cancelNote = `Cancelado em ${canceledAt.toISOString()} por ${context.userId}${cancelReason ? `: ${cancelReason}` : '.'}`;
    const nextNotes = [payout.notes ? String(payout.notes) : '', cancelNote]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1200);

    await this.prisma.$transaction(async (tx) => {
      await tx.vendasCommissionPayout.update({
        where: { id: payout.id },
        data: {
          status: 'canceled',
          notes: nextNotes,
        },
      });

      if (directLeadIds.length) {
        await tx.vendasLead.updateMany({
          where: {
            companyId: context.companyId,
            id: { in: directLeadIds },
            commissionPayoutId: payout.id,
            commissionStatus: 'paid',
          },
          data: {
            commissionStatus: 'payable',
            commissionPaidAt: null,
          },
        });
      }

      if (receivableIds.length) {
        await tx.vendasCommissionReceivable.updateMany({
          where: {
            companyId: context.companyId,
            id: { in: receivableIds },
            payoutId: payout.id,
            status: 'paid',
          },
          data: {
            status: 'payable',
            paidAt: null,
          },
        });
      }

      if (timelineLeadIds.length) {
        await tx.vendasLeadTimelineEvent.createMany({
          data: timelineLeadIds.map((leadId) => ({
            leadId,
            eventType: 'commission_payout_canceled',
            title: 'Fechamento de comissão cancelado',
            description: `Fechamento ${payout.id} cancelado. A comissão voltou para D+ a pagar${cancelReason ? `: ${cancelReason}` : '.'}`,
            sourceType: 'commission_payout_cancel',
            resultLabel: 'canceled',
            createdByUserId: context.userId,
          })),
          skipDuplicates: true,
        });
      }
    });

    return {
      ok: true,
      message: 'Fechamento de comissão cancelado. Os valores voltaram para D+ a pagar.',
      payout: {
        id: payout.id,
        sellerUserId,
        status: 'canceled',
        leadCount: Math.max(0, Math.trunc(Number(payout.leadCount || 0) || 0)),
        totalAmount: this.normalizeCurrencyAmount(payout.totalAmount),
        referenceLabel: payout.referenceLabel || null,
        paidAt: payout.paidAt instanceof Date ? payout.paidAt.toISOString() : null,
        createdAt: payout.createdAt instanceof Date ? payout.createdAt.toISOString() : null,
      },
      restored: {
        direct: directLeadIds.length,
        recurring: receivableIds.length,
        total: directLeadIds.length + receivableIds.length,
      },
    };
  }

  async getCommissionPayoutDetailForUser(user: any, payoutIdRaw: string) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanViewCommission(context);
    const payoutId = String(payoutIdRaw || '').trim();
    if (!payoutId) throw new BadRequestException('Fechamento de comissão inválido.');
    const canManageCommissionTeam = this.canUseCommissionTeamScope(context);

    const payout = await this.prisma.vendasCommissionPayout.findFirst({
      where: {
        id: payoutId,
        companyId: context.companyId,
        ...(canManageCommissionTeam ? {} : { sellerUserId: context.userId }),
      },
      select: {
        id: true,
        sellerUserId: true,
        status: true,
        leadCount: true,
        totalAmount: true,
        referenceLabel: true,
        notes: true,
        paidAt: true,
        createdByUserId: true,
        createdAt: true,
      },
    });
    if (!payout) throw new NotFoundException('Fechamento de comissão não encontrado.');

    const sellerUserId = Math.trunc(Number(payout.sellerUserId || 0)) || null;
    const userIds = [
      sellerUserId,
      Math.trunc(Number(payout.createdByUserId || 0)) || null,
    ].filter((id): id is number => Boolean(id));
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { companyId: context.companyId, id: { in: userIds } },
          select: { id: true, name: true, email: true, phone: true, role: true, commissionPercent: true },
        }).catch(() => [])
      : [];
    const userById = new Map((users as any[]).map((row) => [Number(row.id), row]));

    const [directLeads, receivables] = await Promise.all([
      this.prisma.vendasLead.findMany({
        where: {
          companyId: context.companyId,
          commissionPayoutId: payout.id,
          ...(sellerUserId ? { assignedUserId: sellerUserId } : {}),
        },
        orderBy: [{ commissionPaidAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          name: true,
          phone: true,
          city: true,
          segment: true,
          assignedUserId: true,
          saleStatus: true,
          saleValue: true,
          salePlanKey: true,
          commissionBaseAmount: true,
          commissionAmount: true,
          commissionPaidAt: true,
        },
      }),
      this.prisma.vendasCommissionReceivable.findMany({
        where: {
          companyId: context.companyId,
          payoutId: payout.id,
          ...(sellerUserId ? { sellerUserId } : {}),
        },
        orderBy: [{ paidAt: 'desc' }, { updatedAt: 'desc' }],
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
              city: true,
              segment: true,
              saleStatus: true,
              salePlanKey: true,
            },
          },
        },
      }),
    ]);

    const directItems = directLeads.map((row: any) => ({
      id: String(row.id),
      type: 'direct',
      label: 'Comissão direta',
      leadId: String(row.id),
      name: row?.name ? String(row.name) : row?.phone ? String(row.phone) : 'Cliente sem nome',
      phone: row?.phone ? String(row.phone) : null,
      city: row?.city ? String(row.city) : null,
      segment: row?.segment ? String(row.segment) : null,
      saleStatus: this.normalizeSaleStatus(row?.saleStatus),
      saleStatusLabel: this.formatSaleStatusLabel(this.normalizeSaleStatus(row?.saleStatus)),
      salePlanKey: row?.salePlanKey ? String(row.salePlanKey) : null,
      baseAmount: this.normalizeCurrencyAmount(row?.saleValue || row?.commissionBaseAmount),
      commissionAmount: this.normalizeCurrencyAmount(row?.commissionAmount),
      paidAt: row?.commissionPaidAt instanceof Date ? row.commissionPaidAt.toISOString() : null,
    }));
    const recurringItems = receivables.map((row: any) => {
      const kind = String(row?.kind || 'recurring');
      const isInherited = kind.startsWith('inheritance_');
      const lead = row?.lead || {};
      return {
        id: String(row?.id || ''),
        type: isInherited ? 'inheritance' : 'recurring',
        label: isInherited ? 'Comissão herdada' : 'Comissão recorrente',
        leadId: String(row?.leadId || lead?.id || ''),
        name: lead?.name ? String(lead.name) : lead?.phone ? String(lead.phone) : isInherited ? 'Comissão herdada' : 'Comissão recorrente',
        phone: lead?.phone ? String(lead.phone) : null,
        city: lead?.city ? String(lead.city) : null,
        segment: lead?.segment ? String(lead.segment) : null,
        saleStatus: this.normalizeSaleStatus(lead?.saleStatus),
        saleStatusLabel: this.formatSaleStatusLabel(this.normalizeSaleStatus(lead?.saleStatus)),
        salePlanKey: lead?.salePlanKey ? String(lead.salePlanKey) : null,
        cycleKey: row?.cycleKey ? String(row.cycleKey) : null,
        baseAmount: this.normalizeCurrencyAmount(row?.baseAmount),
        commissionPercent: this.normalizeCurrencyAmount(row?.commissionPercent),
        commissionAmount: this.normalizeCurrencyAmount(row?.amount),
        paidAt: row?.paidAt instanceof Date ? row.paidAt.toISOString() : null,
      };
    });
    const paidAt = payout.paidAt instanceof Date ? payout.paidAt : payout.createdAt instanceof Date ? payout.createdAt : new Date();
    const receiptDate = this.getSaoPauloDayKey(paidAt).replace(/-/g, '');
    const totalAmount = this.normalizeCurrencyAmount(
      [...directItems, ...recurringItems].reduce((sum, item) => sum + this.normalizeCurrencyAmount(item.commissionAmount), 0),
    );
    const receiptItemCount = directItems.length + recurringItems.length;
    const seller = sellerUserId ? userById.get(sellerUserId) : null;
    const createdBy = payout.createdByUserId ? userById.get(Number(payout.createdByUserId)) : null;

    return {
      ok: true,
      canCancel: Boolean(context.access?.canCancelCommission && String(payout.status || '').trim().toLowerCase() !== 'canceled'),
      receipt: {
        id: payout.id,
        code: `HBX-${receiptDate}-${String(payout.id).slice(-6).toUpperCase()}`,
        status: payout.status || 'paid',
        referenceLabel: payout.referenceLabel || null,
        notes: payout.notes || null,
        paidAt: payout.paidAt instanceof Date ? payout.paidAt.toISOString() : null,
        createdAt: payout.createdAt instanceof Date ? payout.createdAt.toISOString() : null,
        leadCount: receiptItemCount || Math.max(0, Math.trunc(Number(payout.leadCount || 0) || 0)),
        totalAmount: totalAmount || this.normalizeCurrencyAmount(payout.totalAmount),
      },
      seller: seller
        ? {
            id: Number(seller.id || 0),
            name: seller.name ? String(seller.name) : null,
            email: seller.email ? String(seller.email) : null,
            phone: seller.phone ? String(seller.phone) : null,
            commissionPercent: Number(seller.commissionPercent || 0) || 0,
          }
        : null,
      createdBy: createdBy
        ? {
            id: Number(createdBy.id || 0),
            name: createdBy.name ? String(createdBy.name) : null,
            email: createdBy.email ? String(createdBy.email) : null,
          }
        : null,
      items: [...directItems, ...recurringItems],
    };
  }

  async getCrmIntegrityForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    const now = new Date();
    const staleLimit = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const dayKey = this.getSaoPauloDayKey(now);
    const leadWhere = this.buildLeadAccessWhere(context);
    const managerOnlyWhere = { companyId: context.companyId };
    const distributionScope = user?.isSystemMaster || context.role === 'USERMASTER' ? ['company', 'tenant_distribution'] : ['company'];

    const [
      totalCards,
      assignedCards,
      activeCards,
      staleAssignedCards,
      interestedCards,
      activeSellers,
      activeDistributionRules,
      paidLeadsMissingPayout,
      paidReceivablesMissingPayout,
      payableDirectCount,
      payableReceivableCount,
      canceledPayouts,
      dailyUsageRows,
    ] = await Promise.all([
      this.prisma.vendasLead.count({ where: leadWhere }),
      this.prisma.vendasLead.count({ where: this.buildLeadAccessWhere(context, { assignedUserId: { not: null } }) }),
      this.prisma.vendasLead.count({ where: this.buildLeadAccessWhere(context, { status: { not: 'encerrado' } }) }),
      this.prisma.vendasLead.count({
        where: this.buildLeadAccessWhere(context, {
          assignedUserId: { not: null },
          status: { not: 'encerrado' },
          attemptCount: 0,
          lastContactAt: null,
          assignedAt: { lte: staleLimit },
        }),
      }),
      this.prisma.vendasLead.count({
        where: this.buildLeadAccessWhere(context, {
          saleStatus: { in: ['activation_pending', 'trial_started', 'sale_confirmed'] },
        }),
      }),
      context.canManageTeam
        ? this.prisma.user.count({
            where: {
              companyId: context.companyId,
              role: 'USER',
              isActive: true,
              deactivatedAt: null,
              isSystemMaster: false,
            },
          })
        : Promise.resolve(0),
      context.canManageTeam
        ? this.prisma.radarAutoDistributionRule.count({
            where: {
              companyId: context.companyId,
              scope: { in: distributionScope },
              status: 'active',
            },
          })
        : Promise.resolve(0),
      this.prisma.vendasLead.count({
        where: this.buildLeadAccessWhere(context, {
          commissionStatus: 'paid',
          commissionAmount: { gt: 0 },
          commissionPayoutId: null,
        }),
      }),
      this.prisma.vendasCommissionReceivable.count({
        where: {
          ...managerOnlyWhere,
          ...(context.canManageTeam ? {} : { sellerUserId: context.userId }),
          status: 'paid',
          amount: { gt: 0 },
          payoutId: null,
        },
      }),
      this.prisma.vendasLead.count({
        where: this.buildLeadAccessWhere(context, {
          commissionStatus: 'payable',
          commissionAmount: { gt: 0 },
          OR: [{ commissionDueAt: null }, { commissionDueAt: { lte: now } }],
        }),
      }),
      this.prisma.vendasCommissionReceivable.count({
        where: {
          ...managerOnlyWhere,
          ...(context.canManageTeam ? {} : { sellerUserId: context.userId }),
          status: 'payable',
          amount: { gt: 0 },
          OR: [{ dueAt: null }, { dueAt: { lte: now } }],
        },
      }),
      this.prisma.vendasCommissionPayout.count({
        where: {
          ...managerOnlyWhere,
          ...(context.canManageTeam ? {} : { sellerUserId: context.userId }),
          status: 'canceled',
        },
      }),
      context.canManageTeam
        ? this.prisma.$queryRawUnsafe<Array<{ deliveredCount?: number | string | null; skippedCount?: number | string | null }>>(
            `SELECT COALESCE(SUM("deliveredCount"), 0) AS "deliveredCount",
                    COALESCE(SUM("skippedCount"), 0) AS "skippedCount"
             FROM "RadarDistributionDailyUsage"
             WHERE "companyId" = $1 AND "dayKey" = $2`,
            context.companyId,
            dayKey,
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    const dailyUsage = Array.isArray(dailyUsageRows) && dailyUsageRows[0] ? dailyUsageRows[0] : {};
    const deliveredToday = Math.max(0, Math.trunc(Number(dailyUsage?.deliveredCount || 0) || 0));
    const skippedToday = Math.max(0, Math.trunc(Number(dailyUsage?.skippedCount || 0) || 0));
    const duePayableCount = payableDirectCount + payableReceivableCount;
    const missingPayoutLinks = paidLeadsMissingPayout + paidReceivablesMissingPayout;
    const checks: Array<{ key: string; label: string; status: string; description: string; action?: string | null }> = [];
    const pushCheck = (check: { key: string; label: string; status: string; description: string; action?: string | null }) => {
      checks.push({ ...check, action: check.action || null });
    };

    pushCheck({
      key: 'cards',
      label: 'Cards no Vendas',
      status: totalCards > 0 ? 'ok' : 'warning',
      description: totalCards > 0 ? `${totalCards} card(s) na esteira.` : 'Nenhum card encontrado na esteira de Vendas.',
      action: totalCards > 0 ? null : 'Gerar ou importar cards pelo Radar.',
    });
    pushCheck({
      key: 'sellers',
      label: 'Vendedores ativos',
      status: !context.canManageTeam || activeSellers > 0 ? 'ok' : 'warning',
      description: context.canManageTeam ? `${activeSellers} vendedor(es) ativo(s).` : 'Visão de vendedor individual.',
      action: context.canManageTeam && activeSellers <= 0 ? 'Cadastrar vendedor no Gerencial.' : null,
    });
    pushCheck({
      key: 'distribution',
      label: 'Distribuição automática',
      status: !context.canManageTeam || activeDistributionRules > 0 ? 'ok' : 'warning',
      description: context.canManageTeam ? `${activeDistributionRules} regra(s) ativa(s), ${deliveredToday} entrega(s) hoje.` : 'Controlada pelo Admin/Master.',
      action: context.canManageTeam && activeDistributionRules <= 0 ? 'Ativar distribuição automática no Radar.' : null,
    });
    pushCheck({
      key: 'activity',
      label: 'Cards parados',
      status: staleAssignedCards > 10 ? 'warning' : 'ok',
      description: `${staleAssignedCards} card(s) atribuido(s) sem tentativa em 48h.`,
      action: staleAssignedCards > 10 ? 'Abrir operação dos vendedores e redistribuir com cuidado.' : null,
    });
    pushCheck({
      key: 'commission_due',
      label: 'Comissão liberada',
      status: duePayableCount > 0 ? 'warning' : 'ok',
      description: `${duePayableCount} comissão(ões) vencida(s) em D+ aguardando fechamento.`,
      action: duePayableCount > 0 ? 'Registrar pagamento no Fechamento financeiro.' : null,
    });
    pushCheck({
      key: 'commission_links',
      label: 'Rastro financeiro',
      status: missingPayoutLinks > 0 ? 'danger' : 'ok',
      description: `${missingPayoutLinks} comissão(ões) paga(s) sem comprovante vinculado.`,
      action: missingPayoutLinks > 0 ? 'Auditar manualmente antes de novo fechamento.' : null,
    });
    pushCheck({
      key: 'corrections',
      label: 'Correções financeiras',
      status: canceledPayouts > 0 ? 'warning' : 'ok',
      description: `${canceledPayouts} fechamento(s) cancelado(s) no histórico.`,
      action: canceledPayouts > 0 ? 'Conferir comprovantes cancelados na auditoria financeira.' : null,
    });

    const penalties = checks.reduce((sum, check) => {
      if (check.status === 'danger') return sum + 28;
      if (check.status === 'warning') return sum + 12;
      return sum;
    }, 0);
    const score = Math.max(0, Math.min(100, 100 - penalties));
    const statusLabel = score >= 86 ? 'Operação pronta' : score >= 68 ? 'Operação com atenção' : 'Operação precisa revisão';

    return {
      ok: true,
      scope: context.canManageTeam ? 'company' : 'seller',
      canManage: Boolean(context.canManageTeam),
      generatedAt: now.toISOString(),
      score,
      statusLabel,
      totals: {
        totalCards,
        assignedCards,
        activeCards,
        staleAssignedCards,
        interestedCards,
        activeSellers,
        activeDistributionRules,
        deliveredToday,
        skippedToday,
        duePayableCount,
        missingPayoutLinks,
        canceledPayouts,
      },
      checks,
    };
  }

  async getCommissionSummaryForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanViewCommission(context);
    const canManageCommissionTeam = this.canUseCommissionTeamScope(context);
    await this.hbxCommissionSync.syncSalesCompanyCommissions(context.companyId, { source: 'vendas_commission_summary' }).catch((error: any) => {
      this.logger.warn(`commission_summary_sync_failed company=${context.companyId} error=${String(error?.message || error)}`);
    });
    const now = new Date();
    const [company, currentUser] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: context.companyId },
        select: { companyKind: true, commissionDueBusinessDays: true },
      }).catch(() => null),
      this.prisma.user.findFirst({
        where: { id: context.userId, companyId: context.companyId },
        select: {
          id: true,
          role: true,
          isActive: true,
          deactivatedAt: true,
          isSystemMaster: true,
          commissionPercent: true,
          canRegisterHbxSellers: true,
          sellerReferralCommissionPercent: true,
          _count: {
            select: {
              referredUsers: true,
            },
          },
        },
      }).catch(() => null),
    ]);
    const isSellerNetwork = Boolean(company && isTenantCompany(company));
    const currentRole = String(currentUser?.role || context.role || '').trim().toUpperCase();
    const canRegisterReferredSeller = Boolean(
      isSellerNetwork &&
      currentRole === 'USER' &&
      currentUser?.isActive &&
      !currentUser?.deactivatedAt &&
      !currentUser?.isSystemMaster &&
      currentUser?.canRegisterHbxSellers,
    );
    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId: context.companyId,
        ...(canManageCommissionTeam ? {} : { assignedUserId: context.userId }),
        OR: [
          { saleStatus: { not: 'none' } },
          { commissionStatus: { not: 'none' } },
          { commissionAmount: { gt: 0 } },
        ],
      },
      orderBy: [{ commissionDueAt: 'asc' }, { updatedAt: 'desc' }],
      take: 1000,
      select: {
        id: true,
        name: true,
        phone: true,
        city: true,
        segment: true,
        assignedUserId: true,
        saleStatus: true,
        saleValue: true,
        salePlanKey: true,
        commissionStatus: true,
        commissionBaseAmount: true,
        commissionAmount: true,
        commissionDueAt: true,
        commissionPaidAt: true,
        commissionPayoutId: true,
        commissionLinkedCompanyId: true,
        commissionLinkedAt: true,
        commissionSyncSource: true,
        updatedAt: true,
      },
    });
    const receivables = await this.prisma.vendasCommissionReceivable.findMany({
      where: canManageCommissionTeam
        ? { companyId: context.companyId }
        : { companyId: context.companyId, sellerUserId: context.userId },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
      take: 1000,
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            city: true,
            segment: true,
            saleStatus: true,
            salePlanKey: true,
          },
        },
      },
    });

    const payable = leads.filter((row) => this.normalizeCommissionStatus(row.commissionStatus) === 'payable');
    const duePayable = payable.filter((row) => this.isDueCommission(row, now));
    const pending = leads.filter((row) => this.normalizeCommissionStatus(row.commissionStatus) === 'pending');
    const paid = leads.filter((row) => this.normalizeCommissionStatus(row.commissionStatus) === 'paid');
    const payableReceivables = receivables.filter((row) => String(row.status || '').trim().toLowerCase() === 'payable');
    const duePayableReceivables = payableReceivables.filter((row) => this.isDueReceivable(row, now));
    const paidReceivables = receivables.filter((row) => String(row.status || '').trim().toLowerCase() === 'paid');
    const active = leads.filter((row) => ['trial_started', 'sale_confirmed'].includes(this.normalizeSaleStatus(row.saleStatus)));
    const pendingActivation = leads.filter((row) => this.normalizeSaleStatus(row.saleStatus) === 'activation_pending');
    const inactive = leads.filter((row) => ['inactive', 'canceled'].includes(this.normalizeSaleStatus(row.saleStatus)));
    const nextDue = [
      ...payable.map((row) => row.commissionDueAt instanceof Date ? row.commissionDueAt : null),
      ...payableReceivables.map((row) => row.dueAt instanceof Date ? row.dueAt : null),
    ]
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;

    const payoutWhere = canManageCommissionTeam
      ? { companyId: context.companyId }
      : { companyId: context.companyId, sellerUserId: context.userId };
    const payouts = await this.prisma.vendasCommissionPayout.findMany({
      where: payoutWhere,
      orderBy: [{ updatedAt: 'desc' }, { paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        sellerUserId: true,
        status: true,
        leadCount: true,
        totalAmount: true,
        referenceLabel: true,
        paidAt: true,
        createdAt: true,
      },
    });
    const payoutAuditRows = await this.prisma.vendasCommissionPayout.findMany({
      where: payoutWhere,
      orderBy: [{ updatedAt: 'desc' }, { paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        status: true,
        totalAmount: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => []);
    const payoutAudit = (payoutAuditRows as any[]).reduce((acc, row) => {
      const status = String(row?.status || 'paid').trim().toLowerCase();
      const amount = this.normalizeCurrencyAmount(row?.totalAmount);
      const paidAt = row?.paidAt instanceof Date ? row.paidAt : row?.createdAt instanceof Date ? row.createdAt : null;
      const updatedAt = row?.updatedAt instanceof Date ? row.updatedAt : row?.createdAt instanceof Date ? row.createdAt : null;
      if (status === 'canceled') {
        acc.canceledPayoutCount += 1;
        acc.canceledPayoutAmount += amount;
        if (updatedAt && (!acc.lastCanceledAt || updatedAt.getTime() > acc.lastCanceledAt.getTime())) acc.lastCanceledAt = updatedAt;
      } else {
        acc.paidPayoutCount += 1;
        acc.paidPayoutAmount += amount;
        if (paidAt && (!acc.lastPaidAt || paidAt.getTime() > acc.lastPaidAt.getTime())) acc.lastPaidAt = paidAt;
      }
      return acc;
    }, {
      paidPayoutCount: 0,
      paidPayoutAmount: 0,
      canceledPayoutCount: 0,
      canceledPayoutAmount: 0,
      lastPaidAt: null as Date | null,
      lastCanceledAt: null as Date | null,
    });
    const sellerIds = Array.from(new Set([
      ...leads.map((row: any) => Math.trunc(Number(row?.assignedUserId || 0)) || 0),
      ...receivables.map((row: any) => Math.trunc(Number(row?.sellerUserId || 0)) || 0),
      ...payouts.map((row: any) => Math.trunc(Number(row?.sellerUserId || 0)) || 0),
    ].filter((id) => id > 0)));
    const sellers = sellerIds.length
      ? await this.prisma.user.findMany({
          where: { companyId: context.companyId, id: { in: sellerIds } },
          select: { id: true, name: true, email: true, phone: true, commissionPercent: true },
        }).catch(() => [])
      : [];
    const sellerById = new Map((sellers as any[]).map((seller) => [Number(seller.id), seller]));
    const payoutBySeller = new Map<number, Date>();
    payouts.forEach((payout) => {
      if (String(payout.status || '').trim().toLowerCase() === 'canceled') return;
      const sellerId = Math.trunc(Number(payout.sellerUserId || 0)) || 0;
      if (!sellerId) return;
      const paidAt = payout.paidAt instanceof Date ? payout.paidAt : payout.createdAt instanceof Date ? payout.createdAt : null;
      if (!paidAt) return;
      const current = payoutBySeller.get(sellerId);
      if (!current || paidAt.getTime() > current.getTime()) payoutBySeller.set(sellerId, paidAt);
    });
    const sellerBuckets = new Map<number, any>();
    const ensureSellerBucket = (sellerIdRaw: unknown) => {
      const sellerId = Math.trunc(Number(sellerIdRaw || 0)) || 0;
      if (!sellerId) return null;
      const existing = sellerBuckets.get(sellerId);
      if (existing) return existing;
      const seller = sellerById.get(sellerId) || {};
      const bucket = {
        sellerUserId: sellerId,
        sellerName: seller?.name ? String(seller.name) : null,
        sellerEmail: seller?.email ? String(seller.email) : null,
        sellerPhone: seller?.phone ? String(seller.phone) : null,
        commissionPercent: Number(seller?.commissionPercent || 0) || 0,
        activeClients: 0,
        pendingAmount: 0,
        payableAmount: 0,
        duePayableAmount: 0,
        duePayableCount: 0,
        paidAmount: 0,
        nextDueAt: null as Date | null,
        lastPaidAt: payoutBySeller.get(sellerId) || null,
      };
      sellerBuckets.set(sellerId, bucket);
      return bucket;
    };
    const touchNextDue = (bucket: any, value: unknown) => {
      const parsed = value instanceof Date ? value : this.parseDate(value);
      if (!parsed) return;
      if (!bucket.nextDueAt || parsed.getTime() < bucket.nextDueAt.getTime()) bucket.nextDueAt = parsed;
    };

    leads.forEach((row: any) => {
      const bucket = ensureSellerBucket(row?.assignedUserId);
      if (!bucket) return;
      const status = this.normalizeCommissionStatus(row?.commissionStatus);
      const amount = this.normalizeCurrencyAmount(row?.commissionAmount);
      if (['trial_started', 'sale_confirmed'].includes(this.normalizeSaleStatus(row?.saleStatus))) bucket.activeClients += 1;
      if (status === 'pending') bucket.pendingAmount += amount;
      if (status === 'payable') {
        bucket.payableAmount += amount;
        touchNextDue(bucket, row?.commissionDueAt);
        if (this.isDueCommission(row, now)) {
          bucket.duePayableAmount += amount;
          bucket.duePayableCount += 1;
        }
      }
      if (status === 'paid') bucket.paidAmount += amount;
    });

    receivables.forEach((row: any) => {
      const bucket = ensureSellerBucket(row?.sellerUserId);
      if (!bucket) return;
      const status = String(row?.status || '').trim().toLowerCase();
      const amount = this.normalizeCurrencyAmount(row?.amount);
      if (['trial_started', 'sale_confirmed'].includes(this.normalizeSaleStatus(row?.lead?.saleStatus))) bucket.activeClients += 1;
      if (status === 'payable') {
        bucket.payableAmount += amount;
        touchNextDue(bucket, row?.dueAt);
        if (this.isDueReceivable(row, now)) {
          bucket.duePayableAmount += amount;
          bucket.duePayableCount += 1;
        }
      }
      if (status === 'paid') bucket.paidAmount += amount;
    });
    const sellerPayouts = Array.from(sellerBuckets.values())
      .map((bucket) => ({
        ...bucket,
        pendingAmount: this.normalizeCurrencyAmount(bucket.pendingAmount),
        payableAmount: this.normalizeCurrencyAmount(bucket.payableAmount),
        duePayableAmount: this.normalizeCurrencyAmount(bucket.duePayableAmount),
        paidAmount: this.normalizeCurrencyAmount(bucket.paidAmount),
        nextDueAt: bucket.nextDueAt instanceof Date ? bucket.nextDueAt.toISOString() : null,
        lastPaidAt: bucket.lastPaidAt instanceof Date ? bucket.lastPaidAt.toISOString() : null,
      }))
      .sort((a, b) =>
        b.duePayableAmount - a.duePayableAmount ||
        b.payableAmount - a.payableAmount ||
        String(a.sellerName || a.sellerEmail || '').localeCompare(String(b.sellerName || b.sellerEmail || '')),
      );

    return {
      ok: true,
      scope: canManageCommissionTeam ? 'company' : 'seller',
      canPayout: Boolean(context.access?.canMarkCommissionPaid),
      generatedAt: now.toISOString(),
      settings: {
        dueBusinessDays: this.normalizeCommissionDueBusinessDays(company?.commissionDueBusinessDays),
      },
      sellerNetwork: {
        isSellerNetwork,
        canRegisterReferredSeller,
        commissionPercent: this.normalizeCurrencyAmount(currentUser?.commissionPercent),
        inheritedCommissionPercent: this.normalizeCurrencyAmount(currentUser?.sellerReferralCommissionPercent),
        referredSellerCount: Math.max(0, Math.trunc(Number(currentUser?._count?.referredUsers || 0) || 0)),
      },
      totals: {
        assignedCards: leads.length,
        activeClients: active.length,
        pendingActivation: pendingActivation.length,
        inactiveClients: inactive.length,
        payableAmount: this.normalizeCurrencyAmount(
          payable.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.commissionAmount), 0) +
          payableReceivables.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.amount), 0),
        ),
        duePayableAmount: this.normalizeCurrencyAmount(
          duePayable.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.commissionAmount), 0) +
          duePayableReceivables.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.amount), 0),
        ),
        duePayableCount: duePayable.length + duePayableReceivables.length,
        pendingAmount: this.normalizeCurrencyAmount(pending.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.commissionAmount), 0)),
        paidAmount: this.normalizeCurrencyAmount(
          paid.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.commissionAmount), 0) +
          paidReceivables.reduce((sum, row) => sum + this.normalizeCurrencyAmount(row.amount), 0),
        ),
        nextDueAt: nextDue ? nextDue.toISOString() : null,
      },
      financeAudit: {
        paidPayoutCount: payoutAudit.paidPayoutCount,
        paidPayoutAmount: this.normalizeCurrencyAmount(payoutAudit.paidPayoutAmount),
        canceledPayoutCount: payoutAudit.canceledPayoutCount,
        canceledPayoutAmount: this.normalizeCurrencyAmount(payoutAudit.canceledPayoutAmount),
        reopenedAmount: this.normalizeCurrencyAmount(payoutAudit.canceledPayoutAmount),
        lastPaidAt: payoutAudit.lastPaidAt instanceof Date ? payoutAudit.lastPaidAt.toISOString() : null,
        lastCanceledAt: payoutAudit.lastCanceledAt instanceof Date ? payoutAudit.lastCanceledAt.toISOString() : null,
      },
      clients: {
        payable: [
          ...payable.map((row) => this.buildCommissionClientPayload(row)),
          ...payableReceivables.map((row) => this.buildCommissionReceivablePayload(row)),
        ].slice(0, 12),
        pendingActivation: pendingActivation.slice(0, 12).map((row) => this.buildCommissionClientPayload(row)),
        active: active.slice(0, 12).map((row) => this.buildCommissionClientPayload(row)),
        inactive: inactive.slice(0, 12).map((row) => this.buildCommissionClientPayload(row)),
        paid: [
          ...paid.map((row) => this.buildCommissionClientPayload(row)),
          ...paidReceivables.map((row) => this.buildCommissionReceivablePayload(row)),
        ].slice(0, 12),
      },
      sellerPayouts,
      payouts: payouts.map((payout) => ({
        id: payout.id,
        sellerUserId: Number(payout.sellerUserId || 0) || null,
        sellerName: sellerById.get(Number(payout.sellerUserId || 0))?.name || null,
        sellerEmail: sellerById.get(Number(payout.sellerUserId || 0))?.email || null,
        status: payout.status || 'paid',
        leadCount: Math.max(0, Math.trunc(Number(payout.leadCount || 0) || 0)),
        totalAmount: this.normalizeCurrencyAmount(payout.totalAmount),
        referenceLabel: payout.referenceLabel || null,
        paidAt: payout.paidAt instanceof Date ? payout.paidAt.toISOString() : null,
        createdAt: payout.createdAt instanceof Date ? payout.createdAt.toISOString() : null,
      })),
    };
  }

  private normalizeMasterNoticeAudience(value: unknown): MasterNoticeAudience {
    const normalized = String(value || '').trim().toLowerCase();
    return MASTER_NOTICE_AUDIENCES.has(normalized) ? (normalized as MasterNoticeAudience) : 'seller';
  }

  private normalizeMasterNoticeTone(value: unknown): MasterNoticeTone {
    const normalized = String(value || '').trim().toLowerCase();
    return MASTER_NOTICE_TONES.has(normalized) ? (normalized as MasterNoticeTone) : 'info';
  }

  private canManageMasterNotices(user: any) {
    return Boolean(user?.isSystemMaster);
  }

  private parseMasterNoticeDate(value: unknown, fallback: Date | null) {
    if (!value) return fallback;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  private buildMasterNoticePayload(row: any) {
    const forceSeconds = Math.max(0, Math.min(120, Math.trunc(Number(row?.forceSeconds || 0) || 0)));
    let payload: any = null;
    try {
      if (row?.payloadJson) payload = JSON.parse(String(row.payloadJson));
    } catch { /* payload inválido → null */ }
    return {
      id: String(row?.id || ''),
      audience: this.normalizeMasterNoticeAudience(row?.audience),
      title: String(row?.title || ''),
      body: String(row?.body || ''),
      tone: this.normalizeMasterNoticeTone(row?.tone),
      forceSeconds,
      startsAt: row?.startsAt instanceof Date ? row.startsAt.toISOString() : row?.startsAt ? new Date(row.startsAt).toISOString() : null,
      expiresAt: row?.expiresAt instanceof Date ? row.expiresAt.toISOString() : row?.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      createdAt: row?.createdAt instanceof Date ? row.createdAt.toISOString() : row?.createdAt ? new Date(row.createdAt).toISOString() : null,
      createdByUserId: Number(row?.createdByUserId || 0) || null,
      acknowledged: Boolean(row?.acknowledged),
      acknowledgedAt: row?.acknowledgedAt instanceof Date ? row.acknowledgedAt.toISOString() : row?.acknowledgedAt ? new Date(row.acknowledgedAt).toISOString() : null,
      source: String(row?.source || 'master'),
      nudgeKey: row?.nudgeKey ?? null,
      payload,
    };
  }

  async listMasterNoticesForUser(user: any, audienceRaw?: string) {
    const context = await this.resolveVendasUserContext(user);
    const canManage = this.canManageMasterNotices(user);
    const hasRequestedAudience = Boolean(String(audienceRaw || '').trim());
    // USERMASTER (dono do tenant) = admin: publico 'customer' (contratante), igual a ADMIN.
    const isTenantAdminRole = context.role === 'ADMIN' || context.role === 'USERMASTER';
    const defaultAudience = isTenantAdminRole ? 'customer' : 'seller';
    const audience = hasRequestedAudience
      ? this.normalizeMasterNoticeAudience(audienceRaw)
      : this.normalizeMasterNoticeAudience(defaultAudience);
    const allowedAudience = isTenantAdminRole ? 'customer' : 'seller';
    if (!canManage && audience !== allowedAudience) {
      return { ok: true, audience, canManage, notices: [] };
    }

    const now = new Date();
    const rows = await this.prisma.$queryRaw<Array<any>>`
      SELECT
        n."id",
        n."audience",
        n."title",
        n."body",
        n."tone",
        n."forceSeconds",
        n."startsAt",
        n."expiresAt",
        n."createdAt",
        n."createdByUserId",
        n."targetUserId",
        n."source",
        n."nudgeKey",
        n."payloadJson",
        CASE WHEN a."id" IS NULL THEN false ELSE true END AS "acknowledged",
        a."acknowledgedAt" AS "acknowledgedAt"
      FROM "MasterNotice" n
      LEFT JOIN "MasterNoticeAck" a
        ON a."noticeId" = n."id" AND a."userId" = ${context.userId}
      WHERE n."companyId" = ${context.companyId}
        AND n."audience" = ${audience}
        AND n."startsAt" <= ${now}
        AND (n."expiresAt" IS NULL OR n."expiresAt" >= ${now})
        AND (n."targetUserId" IS NULL OR n."targetUserId" = ${context.userId})
      ORDER BY n."createdAt" DESC
      LIMIT 40
    `;

    return {
      ok: true,
      audience,
      canManage,
      notices: rows.map((row) => this.buildMasterNoticePayload(row)),
    };
  }

  async createMasterNoticeForUser(user: any, dto: CreateMasterNoticeDto) {
    const context = await this.resolveVendasUserContext(user);
    if (!this.canManageMasterNotices(user)) {
      throw new ForbiddenException('Somente o UserMaster pode enviar avisos forçados.');
    }

    const title = this.normalizeText(dto?.title);
    const body = this.normalizeText(dto?.body);
    if (!title || title.length < 3) throw new BadRequestException('Informe um título claro para o aviso.');
    if (!body || body.length < 3) throw new BadRequestException('Informe a mensagem do aviso.');

    const now = new Date();
    const startsAt = this.parseMasterNoticeDate(dto?.startsAt, now) || now;
    const defaultExpiresAt = new Date(startsAt.getTime());
    defaultExpiresAt.setDate(defaultExpiresAt.getDate() + 7);
    const expiresAt = this.parseMasterNoticeDate(dto?.expiresAt, defaultExpiresAt);
    if (expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('A data final precisa ser depois do início do aviso.');
    }

    const id = randomUUID();
    const audience = this.normalizeMasterNoticeAudience(dto?.audience);
    const tone = this.normalizeMasterNoticeTone(dto?.tone);
    const forceSeconds = Math.max(0, Math.min(120, Math.trunc(Number(dto?.forceSeconds || 0) || 0)));

    await this.prisma.$executeRaw`
      INSERT INTO "MasterNotice" (
        "id",
        "companyId",
        "audience",
        "title",
        "body",
        "tone",
        "forceSeconds",
        "startsAt",
        "expiresAt",
        "createdByUserId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${context.companyId},
        ${audience},
        ${title},
        ${body},
        ${tone},
        ${forceSeconds},
        ${startsAt},
        ${expiresAt},
        ${context.userId},
        ${now},
        ${now}
      )
    `;

    return {
      ok: true,
      notice: {
        id,
        audience,
        title,
        body,
        tone,
        forceSeconds,
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        createdAt: now.toISOString(),
        createdByUserId: context.userId,
        acknowledged: false,
        acknowledgedAt: null,
      },
    };
  }

  async acknowledgeMasterNoticeForUser(user: any, noticeIdRaw: string) {
    const context = await this.resolveVendasUserContext(user);
    const noticeId = String(noticeIdRaw || '').trim();
    if (!noticeId) throw new BadRequestException('Aviso inválido.');

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "MasterNotice"
      WHERE "id" = ${noticeId}
        AND "companyId" = ${context.companyId}
      LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Aviso não encontrado.');

    const id = randomUUID();
    const now = new Date();
    await this.prisma.$executeRaw`
      INSERT INTO "MasterNoticeAck" ("id", "noticeId", "userId", "acknowledgedAt")
      VALUES (${id}, ${noticeId}, ${context.userId}, ${now})
      ON CONFLICT ("noticeId", "userId")
      DO UPDATE SET "acknowledgedAt" = EXCLUDED."acknowledgedAt"
    `;

    return { ok: true, noticeId, acknowledgedAt: now.toISOString() };
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
    const context = await this.resolveVendasUserContext(user);
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
    const context = await this.resolveVendasUserContext(user);
    const [profilePayload, report] = await Promise.all([
      this.getEffectiveSalesProfileForContext(context),
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
    const context = await this.resolveVendasUserContext(user);
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
            companyKind: COMPANY_KIND_PLATFORM_INFRA,
            // Infra da plataforma: resolver trata platform_infra antes do
            // billing — status e so coerencia (sem espelho).
            status: 'active',
            statusChangedAt: new Date(),
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
    const context = await this.resolveVendasUserContext(user);
    this.assertCanManualEnrichRadar(context);
    const { companyId, userId } = context;
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      include: {
        timelineEvents: {
          orderBy: [{ createdAt: 'desc' }],
          take: 12,
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');
    await this.hydrateRowsWithRadarPoolEnrichment([lead]);

    const usageResult = await this.commercialUsageLimits.recordLeadEnrichmentUseOnce(companyId, userId, {
      source: 'vendas_manual_enrichment',
      vendasLeadId: String(lead.id),
      usageKey: `vendas:${lead.id}`,
    });
    if (usageResult?.debited) {
      await this.prisma.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          ...this.buildTimelineEvent({
            eventType: 'lead_enrichment_used',
            title: 'Enriquecimento usado',
            description: 'Crédito diário usado para completar este card no Vendas.',
            sourceType: 'lead_enrichment',
            resultLabel: 'enriched',
            createdByUserId: userId,
          }),
        },
      }).catch(() => null);
    }

    let availability =
      (await this.listWhatsappAvailabilityByLeadIds([String(lead.id)])).get(String(lead.id)) || null;
    let verifiedBy: 'platform_engine' | 'manual' | null = availability?.checkedAt
        ? 'platform_engine'
        : null;
    const phoneDigits = this.normalizePhone((lead as any).phoneNormalized || (lead as any).phone);
    const availabilityCheckedAt = availability?.checkedAt ? new Date(availability.checkedAt).getTime() : 0;
    const shouldRefreshWhatsapp =
      Boolean(phoneDigits) &&
      (!availabilityCheckedAt ||
        Number.isNaN(availabilityCheckedAt) ||
        Date.now() - availabilityCheckedAt > 30 * 24 * 60 * 60 * 1000);

    if (phoneDigits && shouldRefreshWhatsapp) {
      const engineCompanyId = await this.getOrCreateMasterWhatsappEngineCompanyId();
      if (engineCompanyId) {
        try {
          // Prazo curto: isto roda DENTRO do request do usuário (puxar lead do Radar). Se o
          // teto de 20 checagens/min já estourou, não vale segurar a resposta esperando a
          // janela virar — o catch abaixo já degrada pra "não verificado" e o lead entra na
          // hora. Incidente 29/07: sem prazo, o 11º lead de um lote de 25 esperou 51s e o
          // proxy devolveu 500 pra um import que tinha dado certo.
          const [lookup] = await this.webwhatsBridge.checkWhatsappNumbers(
            engineCompanyId,
            [phoneDigits],
            undefined,
            { maxWaitMs: VENDAS_WHATSAPP_LOOKUP_MAX_WAIT_MS },
          );
          if (lookup) {
            const status: VendasWhatsappAvailabilityStatus = lookup.exists ? 'available' : 'unavailable';
            const now = new Date();
            const phoneLabel = this.buildPreferredLeadContact(phoneDigits) || `+${phoneDigits}`;
            const message = lookup.exists
              ? `Consulta tecnica confirmou WhatsApp para ${phoneLabel}.`
              : `Consulta tecnica nao encontrou WhatsApp para ${phoneLabel}.`;
            availability = {
              status,
              checkedAt: now.toISOString(),
              phoneDigits,
              message,
            };
            verifiedBy = 'platform_engine';
            await this.prisma.vendasLeadTimelineEvent.create({
              data: {
                leadId: lead.id,
                ...this.buildTimelineEvent({
                  eventType: 'generic',
                  title: lookup.exists ? 'WhatsApp verificado pelo motor tecnico' : 'Motor tecnico nao encontrou WhatsApp',
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
            `[vendas-enrichment] Falha na verificacao tecnica lead=${lead.id} company=${companyId}: ${String(error?.message || error)}`,
          );
        }
      }
    }

    const enrichedIntelligence = this.decorateManualEnrichmentIntelligence(
      buildVendasLeadIntelligence({
        lead,
        whatsappAvailability: availability,
        verifiedBy,
        templateOffset: opts?.templateOffset,
      }),
      {
        ...lead,
        timelineEvents: [
          {
            eventType: 'lead_enrichment_used',
            sourceType: 'lead_enrichment',
            createdAt: new Date(),
          },
          ...((lead as any).timelineEvents || []),
        ],
      },
    );

    return {
      ok: true,
      leadId: String(lead.id),
      usage: usageResult?.usage || null,
      whatsappAvailability: availability,
      leadIntelligence: enrichedIntelligence,
    };
  }

  // LEAD-COCKPIT (11/07): ficha RFB rica do lead pro modal "cockpit" do Vendas.
  // Lê SÓ a base local (CnpjPublicCompany + CnpjPublicPartner) — zero chamada externa,
  // zero débito de crédito. CNPJ derivado SERVER-SIDE (mesma hidratação RadarLeadPool do
  // board, fallback ficha do cliente); nunca aceita CNPJ vindo do cliente.
  async getLeadCockpitForUser(user: any, leadId: string) {
    const context = await this.resolveVendasUserContext(user);
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      include: {
        customerProfile: { select: { cnpj: true } },
        timelineEvents: {
          orderBy: [{ createdAt: 'desc' }],
          take: 12,
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');

    // CNPJ server-side: mesma fonte do board (hidratação RadarLeadPool → intelligence);
    // fallback: CNPJ da ficha do cliente (NÚCLEO-CRM). Quando ambas falham, tenta reconciliar
    // com a base RFB local por telefone → nome+cidade → endereço, sempre fail-soft e sem rede.
    await this.hydrateRowsWithRadarPoolEnrichment([lead]);
    const intelligence = buildVendasLeadIntelligence({ lead });
    let cnpjDigits = String(
      (intelligence as any)?.cnpj || (lead as any)?.customerProfile?.cnpj || '',
    ).replace(/\D/g, '');
    let fallbackMatch: VendasRfbMatch<any> | null = null;
    if (cnpjDigits.length !== 14) {
      fallbackMatch = await this.findCockpitCompanyByLead(lead);
      cnpjDigits = String(fallbackMatch?.company?.cnpj || '').replace(/\D/g, '');
      if (cnpjDigits.length === 14 && fallbackMatch) {
        await this.persistCockpitCompanyMatch(lead, fallbackMatch);
      }
    }
    if (cnpjDigits.length !== 14) {
      return { company: { found: false, cnpj: null } };
    }

    // Fail-soft: leitura da base pública NUNCA derruba a rota — loga e devolve found:false.
    try {
      const row = fallbackMatch?.company
        || await this.prisma.cnpjPublicCompany.findUnique({ where: { cnpj: cnpjDigits } });
      if (!row) {
        return { company: { found: false, cnpj: cnpjDigits } };
      }
      const partners = await this.listCockpitPartners(cnpjDigits, row.rawJson);
      return {
        company: {
          found: true,
          cnpj: row.cnpj || cnpjDigits,
          // MEI/EI vem "<CNPJ básico> <NOME>" no dump — mesma limpeza do L4.
          razaoSocial: cleanRfbLegalName(row.razaoSocial, row.cnpj || cnpjDigits) || null,
          nomeFantasia: row.nomeFantasia || null,
          situacao: row.situacao || null,
          cnae: row.cnae || null,
          cnaeDescription: row.cnaeDescription || null,
          porte: row.porte || null,
          capitalSocial: row.capitalSocial == null ? null : Number(row.capitalSocial),
          naturezaJuridica: row.naturezaJuridica || null,
          openedAt: row.openedAt instanceof Date ? row.openedAt.toISOString().slice(0, 10) : null,
          simples: typeof row.simples === 'boolean' ? row.simples : null,
          mei: typeof row.mei === 'boolean' ? row.mei : null,
          matrizFilial: row.matrizFilial || null,
          partners,
        },
      };
    } catch (error: any) {
      this.logger.warn(
        `[vendas-cockpit] Falha ao ler base RFB local lead=${lead.id} company=${context.companyId}: ${String(error?.message || error)}`,
      );
      return { company: { found: false, cnpj: cnpjDigits } };
    }
  }

  /**
   * Reconciliação local do card sem CNPJ.
   *
   * Ordem de busca:
   * 1) telefone atual + variante legada sem nono dígito;
   * 2) token distintivo do nome dentro da mesma cidade/UF;
   * 3) número do endereço dentro da mesma cidade/UF.
   *
   * O seletor exige vencedor claro. Empate ou baixa confiança devolvem null.
   */
  private async findCockpitCompanyByLead(lead: any): Promise<VendasRfbMatch<any> | null> {
    const delegate = (this.prisma as any)?.cnpjPublicCompany;
    if (!delegate?.findMany) return null;

    const phoneCandidates = buildRfbPhoneCandidates(lead?.phoneNormalized, lead?.phone);
    const city = normalizeRfbMatchText(lead?.city);
    const state = String(lead?.state || '').trim().toUpperCase();
    const nameTokens = buildRfbNameTokens(lead?.name, lead?.segment);
    const addressNumber = extractRfbAddressNumber(lead?.address);
    const byCnpj = new Map<string, any>();

    const collect = async (where: Record<string, any>, take = 40) => {
      try {
        const rows = await delegate.findMany({ where, take });
        for (const row of Array.isArray(rows) ? rows : []) {
          const cnpj = String(row?.cnpj || '').replace(/\D/g, '');
          if (cnpj.length === 14) byCnpj.set(cnpj, row);
        }
      } catch {
        // Cada lane é best-effort; uma query incompatível/índice ausente não derruba o cockpit.
      }
    };

    if (phoneCandidates.length) {
      await collect({ phoneDigits: { in: phoneCandidates } }, 30);

      // Telefone e indexado e vale como contato forte no seletor. Se ele ja produziu um
      // vencedor inequívoco, encerra aqui: continuar por e-mail/nome/endereco pode varrer a
      // base RFB inteira e fazer o proxy expirar antes de o cockpit responder.
      const phoneMatch = selectVendasRfbMatch(lead || {}, Array.from(byCnpj.values()));
      if (phoneMatch) return phoneMatch;
    }

    const email = String(lead?.email || '').trim().toLowerCase();
    if (email) {
      await collect({ email }, 20);
    }

    if (city && nameTokens.length) {
      await collect({
        normalizedCity: city,
        ...(state ? { state } : {}),
        OR: nameTokens.slice(0, 4).map((token) => ({
          searchText: { contains: token },
        })),
      });
    }

    if (city && addressNumber) {
      await collect({
        normalizedCity: city,
        ...(state ? { state } : {}),
        address: { contains: addressNumber },
      }, 30);
    }

    return selectVendasRfbMatch(lead || {}, Array.from(byCnpj.values()));
  }

  /**
   * Persiste a reconciliação em dois pontos:
   * - timeline `radar_enrichment` do Vendas, que alimenta o board/cockpit;
   * - metadataJson do RadarLeadPool quando o telefone aponta para uma única linha.
   *
   * Tudo aditivo e best-effort; nunca sobrescreve o contato principal do lead.
   */
  private async persistCockpitCompanyMatch(lead: any, match: VendasRfbMatch<any>): Promise<void> {
    const row = match?.company || {};
    const cnpj = String(row?.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14 || !lead?.id) return;

    const matchedAt = new Date().toISOString();
    const companyPatch = {
      cnpj,
      razaoSocial: cleanRfbLegalName(row?.razaoSocial, cnpj) || null,
      cnae: row?.cnae || null,
      cnaeDescription: row?.cnaeDescription || null,
      companySituation: row?.situacao || null,
      ownerName: row?.ownerName || null,
      enrichmentStatus: 'completed',
      enrichedAt: matchedAt,
      rfbFallback: {
        matchedAt,
        score: match.score,
        runnerUpScore: match.runnerUpScore,
        reasons: match.reasons,
        source: 'cnpj_public_local',
      },
    };

    try {
      const latestEvent = [...(Array.isArray(lead?.timelineEvents) ? lead.timelineEvents : [])]
        .sort((left: any, right: any) =>
          new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime())
        .find((event: any) =>
          String(event?.sourceType || '').trim().toLowerCase() === 'radar_enrichment');

      const existingPayload = parseRfbJsonObject(latestEvent?.description);
      const description = JSON.stringify({
        ...existingPayload,
        ...companyPatch,
        sourceConfidence: {
          ...(existingPayload?.sourceConfidence && typeof existingPayload.sourceConfidence === 'object'
            ? existingPayload.sourceConfidence
            : {}),
          rfbFallback: match.score,
        },
      });

      if (latestEvent?.id) {
        await this.prisma.vendasLeadTimelineEvent.update({
          where: { id: latestEvent.id },
          data: {
            description,
            title: latestEvent.title || 'Empresa localizada na base da Receita',
            resultLabel: 'rfb_local_fallback',
          },
        });
      } else {
        await this.prisma.vendasLeadTimelineEvent.create({
          data: {
            leadId: lead.id,
            ...this.buildTimelineEvent({
              eventType: 'radar_enrichment',
              title: 'Empresa localizada na base da Receita',
              description,
              sourceType: 'radar_enrichment',
              resultLabel: 'rfb_local_fallback',
              createdByUserId: null,
            }),
          },
        });
      }
    } catch (error: any) {
      this.logger.warn(
        `[vendas-cockpit-rfb] Falha ao persistir timeline lead=${lead.id}: ${String(error?.message || error)}`,
      );
    }

    try {
      const phoneCandidates = buildRfbPhoneCandidates(lead?.phoneNormalized, lead?.phone);
      if (!phoneCandidates.length) return;

      const poolRows = await (this.prisma as any).radarLeadPool.findMany({
        where: { phoneDigits: { in: phoneCandidates } },
        take: 2,
      });
      // Telefone compartilhado/duplicado: não arrisca escrever na linha errada.
      if (!Array.isArray(poolRows) || poolRows.length !== 1) return;

      const poolRow = poolRows[0];
      const metadata = parseRfbJsonObject(poolRow?.metadataJson);
      await (this.prisma as any).radarLeadPool.update({
        where: { id: poolRow.id },
        data: {
          metadataJson: JSON.stringify({
            ...metadata,
            ...companyPatch,
          }),
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `[vendas-cockpit-rfb] Falha ao persistir RadarLeadPool lead=${lead.id}: ${String(error?.message || error)}`,
      );
    }

    this.logger.log(
      `[vendas-cockpit-rfb] match local lead=${lead.id} cnpj=${cnpj.slice(0, 8)}*** score=${match.score}`,
    );
  }


 

  // Ranking do "dono" — MESMA ordem do L4 (radar-cnpj-l4-enrichment.service.ts):
  // Sócio-Administrador(49) > Administrador(05) > Titular PF(65) > Diretor(10) > Presidente(16)
  // > Titular Emp.Individual(34) > Sócio-Gerente(28) > Sócio(22) > demais. PF ganha de PJ no empate.
  private static readonly COCKPIT_PARTNER_QUALIFICATION_RANK: Record<string, number> = {
    '49': 0, '05': 1, '65': 2, '10': 3, '16': 4, '34': 5, '28': 6, '22': 7, '23': 8, '47': 9, '74': 10,
  };

  // Quadro societário do cockpit: CnpjPublicPartner (join por cnpjBasico = 8 primeiros
  // dígitos, mesmo ranking do L4) primeiro; rawJson (qsa da BrasilAPI cacheado) como
  // fallback de linha antiga sem dump de sócios. Máx 20. Best-effort: erro devolve [].
  private async listCockpitPartners(
    cnpjDigits: string,
    rawJson?: string | null,
  ): Promise<Array<{ name: string; qualification: string | null }>> {
    try {
      const rows = await this.prisma.cnpjPublicPartner.findMany({
        where: { cnpjBasico: cnpjDigits.slice(0, 8) },
        select: { nome: true, qualificationCode: true, qualificationDescription: true, identificador: true },
        take: 40,
      });
      const rankOf = (row: any) =>
        (VendasService.COCKPIT_PARTNER_QUALIFICATION_RANK[String(row?.qualificationCode || '')] ?? 20) * 2
        + (String(row?.identificador || '') === '2' ? 0 : 1);
      const seen = new Set<string>();
      const partners = (rows || [])
        .map((row: any) => ({
          name: String(row?.nome || '').trim(),
          qualification: String(row?.qualificationDescription || '').trim() || null,
          rank: rankOf(row),
        }))
        .filter((row) => Boolean(row.name))
        .sort((a, b) => a.rank - b.rank)
        .filter((row) => (seen.has(row.name) ? false : (seen.add(row.name), true)))
        .slice(0, 20)
        .map((row) => ({ name: row.name, qualification: row.qualification }));
      if (partners.length) return partners;
    } catch {
      // segue pro fallback do rawJson
    }

    // Fallback: linha antiga sem CnpjPublicPartner — sócios do rawJson (mesmas chaves do L4).
    try {
      const parsed = rawJson ? JSON.parse(String(rawJson)) : null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
      for (const key of ['socios', 'qsa', 'partners', 'quadroSocietario']) {
        const list = (parsed as Record<string, any>)[key];
        if (!Array.isArray(list)) continue;
        const seen = new Set<string>();
        return list
          .map((item: any) => ({
            name: String(item?.nome || item?.name || item?.nome_socio || item?.razaoSocial || '').trim(),
            qualification:
              String(item?.qualificacao_socio || item?.qualificacao || item?.qualification || item?.role || '').trim() || null,
          }))
          .filter((row) => Boolean(row.name))
          .filter((row) => (seen.has(row.name) ? false : (seen.add(row.name), true)))
          .slice(0, 20);
      }
      return [];
    } catch {
      return [];
    }
  }

  // LeadPerson (WORM-16) — candidatos a "pessoa" do lead alem do QSA (source
  // 'receita_qsa' | 'manual' | 'crawl' | 'ia'). Best-effort/fail-soft: tabela
  // ausente ou erro nunca derruba o pre-voo, so degrada pra "sem candidato".
  private async listLeadPersonCandidates(radarLeadId: string | null): Promise<Array<{ name: string; role: string | null; source: string }>> {
    if (!radarLeadId) return [];
    try {
      const rows = await (this.prisma as any)?.leadPerson?.findMany?.({
        where: { radarLeadId },
        orderBy: [{ rank: 'asc' }],
        take: 5,
      });
      return (Array.isArray(rows) ? rows : [])
        .map((row: any) => ({
          name: String(row?.name || '').trim(),
          role: row?.role ? String(row.role).trim() : null,
          source: String(row?.source || '').trim().toLowerCase(),
        }))
        .filter((row: any) => Boolean(row.name));
    } catch {
      return [];
    }
  }

  // S3 LEAD-CENTRICO (03-pre-voo.md): entendimento do lead ANTES do vendedor
  // disparar qualquer coisa — dono/socios via RFB local + LeadContact/LeadPerson
  // com confianca de fonte, canais disponiveis, dados confirmados/duvidosos/
  // faltantes, veredicto e recomendacao de persona por HEURISTICA (sem IA/LLM
  // neste sprint — recomendacao.source:'heuristica'). Zero disparo, zero
  // inscricao de cadencia.
  async getLeadPreVooForUser(user: any, leadId: string) {
    const context = await this.resolveVendasUserContext(user);
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      include: {
        customerProfile: { select: { cnpj: true } },
        timelineEvents: {
          orderBy: [{ createdAt: 'desc' }],
          take: 12,
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');

    // Mesma hidratacao/CNPJ do cockpit (radar pool -> intelligence -> fallback RFB local).
    await this.hydrateRowsWithRadarPoolEnrichment([lead]);
    const availability =
      (await this.listWhatsappAvailabilityByLeadIds([String(lead.id)])).get(String(lead.id)) || null;
    const intelligence = buildVendasLeadIntelligence({ lead, whatsappAvailability: availability });

    let cnpjDigits = String(
      (intelligence as any)?.cnpj || (lead as any)?.customerProfile?.cnpj || '',
    ).replace(/\D/g, '');
    let fallbackMatch: VendasRfbMatch<any> | null = null;
    if (cnpjDigits.length !== 14) {
      fallbackMatch = await this.findCockpitCompanyByLead(lead);
      cnpjDigits = String(fallbackMatch?.company?.cnpj || '').replace(/\D/g, '');
      if (cnpjDigits.length === 14 && fallbackMatch) {
        await this.persistCockpitCompanyMatch(lead, fallbackMatch);
      }
    }

    let companyRow: any = null;
    let partners: Array<{ name: string; qualification: string | null }> = [];
    if (cnpjDigits.length === 14) {
      try {
        companyRow = fallbackMatch?.company
          || await this.prisma.cnpjPublicCompany.findUnique({ where: { cnpj: cnpjDigits } });
        if (companyRow) {
          partners = await this.listCockpitPartners(cnpjDigits, companyRow.rawJson);
        }
      } catch (error: any) {
        this.logger.warn(
          `[vendas-pre-voo] Falha ao ler base RFB local lead=${lead.id} company=${context.companyId}: ${String(error?.message || error)}`,
        );
      }
    }

    const radarLeadId = this.extractRadarLeadId((lead as any)?.sourceHistoryId);
    const leadPersonCandidates = await this.listLeadPersonCandidates(radarLeadId);

    const contact = resolveContact({
      qsaPartnerName: partners[0]?.name || null,
      qsaPartnerQualification: partners[0]?.qualification || null,
      companyOwnerName: companyRow?.ownerName || null,
      companyOwnerQualification: companyRow?.ownerQualification || null,
      leadPersonCandidates,
      radarOwnerName: (intelligence as any)?.ownerName || null,
    });

    const empresaNome =
      (companyRow ? cleanRfbLegalName(companyRow.razaoSocial, companyRow.cnpj || cnpjDigits) : null)
      || (lead as any)?.name
      || null;

    const whatsappCanal = resolveCanalWhatsapp(intelligence.whatsappStatus, (lead as any)?.phone || null);
    const emailCanal = resolveCanalEmail(intelligence.emailStatus, (intelligence as any)?.email || (lead as any)?.email || null);
    const telefoneVozCanal = resolveCanalTelefoneVoz((lead as any)?.phone || null);

    const prontidao = buildProntidao({
      empresaEncontrada: Boolean(companyRow),
      whatsapp: whatsappCanal,
      email: emailCanal,
      contato: contact,
    });

    const recommendation = recommendPersona({
      whatsappConfirmado: whatsappCanal.status === 'confirmado',
      emailConfirmado: emailCanal.status === 'confirmado',
      nomeAlta: contact.confianca === 'alta',
    });

    const abertura = buildAbertura({ nome: contact.nome, confianca: contact.confianca, empresaNome });
    const objetivo = resolveObjetivo((lead as any)?.status);
    const personas = buildPersonaPreviews(CADENCIA_SEEDS, abertura, recommendation.personaKey);

    const faltantesCount = prontidao.faltantes.length;

    // S4 LEAD-CENTRICO (04-robozinho.md, item 2): estado ligado/desligado da Automação
    // pra este lead — mesma projeção canônica que o board já usa (Fase 3,
    // AutomationEnrollment.activeCommercialSlot='commercial').
    const activeEnrollment = typeof (this.prisma as any).automationEnrollment?.findFirst === 'function'
      ? await (this.prisma as any).automationEnrollment
          .findFirst({
            where: {
              companyId: context.companyId,
              leadId: lead.id,
              activeCommercialSlot: 'commercial',
              status: { in: ['active', 'paused'] },
            },
            select: { id: true, definitionKind: true, definitionId: true, status: true, currentStep: true },
          })
          .catch(() => null)
      : null;

    // S8 LEAD-CENTRICO (08-destravar-robo.md): só faz sentido explicar por que
    // "Ligar robô" está bloqueado quando ele ainda NÃO está ligado — desligar
    // nunca é bloqueado por isto.
    const roboBloqueado = activeEnrollment
      ? null
      : await this.resolveRoboBloqueio(context, user, {
          phone: (lead as any)?.phone || null,
          email: (intelligence as any)?.email || (lead as any)?.email || null,
        });

    return {
      ok: true,
      leadId: String(lead.id),
      lead: {
        name: (lead as any)?.name || null,
        city: (lead as any)?.city || null,
        state: (lead as any)?.state || null,
        segment: (lead as any)?.segment || null,
        status: (lead as any)?.status || null,
      },
      empresa: {
        found: Boolean(companyRow),
        cnpj: companyRow?.cnpj || cnpjDigits || null,
        razaoSocial: companyRow ? cleanRfbLegalName(companyRow.razaoSocial, companyRow.cnpj || cnpjDigits) : null,
        nomeFantasia: companyRow?.nomeFantasia || null,
        situacao: companyRow?.situacao || null,
        cnae: companyRow?.cnae || null,
        cnaeDescription: companyRow?.cnaeDescription || null,
        cidade: companyRow?.city || (lead as any)?.city || null,
        estado: companyRow?.state || (lead as any)?.state || null,
      },
      contato: contact,
      canais: {
        whatsapp: whatsappCanal,
        email: emailCanal,
        telefoneVoz: telefoneVozCanal,
      },
      prontidao,
      recomendacao: {
        ...recommendation,
        abertura,
        objetivo,
      },
      personas,
      enrichment: {
        enabled: isPreVooEnrichEnabled(),
        podeBuscar: Boolean(context.access?.canManualEnrichRadar) && faltantesCount > 0,
      },
      robo: {
        ligado: Boolean(activeEnrollment),
        enrollmentId: activeEnrollment ? String(activeEnrollment.id) : null,
        cadenciaId: activeEnrollment && String(activeEnrollment.definitionKind) === 'cadence' ? String(activeEnrollment.definitionId) : null,
        status: activeEnrollment ? String(activeEnrollment.status || 'active') : null,
        currentStep: activeEnrollment ? Math.max(0, Math.trunc(Number(activeEnrollment.currentStep || 0))) : 0,
      },
      // S8 LEAD-CENTRICO (08-destravar-robo.md, ordem do dono 26/07): "o cliente
      // entender o porquê não dá pra ativar é PRIMORDIAL" — o front NUNCA deixa o
      // botão desabilitado mudo, sempre mostra motivo + próximo passo daqui.
      roboBloqueado,
    };
  }

  // ================================================================
  // S8 LEAD-CENTRICO (08-destravar-robo.md, ordem do dono 26/07: "a única [trava]
  // vai ser a config do Admin — feito, já libera. E LÓGICO, ter o WhatsApp").
  // Fonte ÚNICA das travas de ATIVAÇÃO da Automação — usada tanto pelo GET pré-voo
  // (pra mostrar o botão nunca desabilitado mudo) quanto pelo POST /robo (pra
  // enforçar de verdade, mesmo se o front for ignorado). Ordem de checagem =
  // ordem de prioridade da mensagem: (1) config do Admin, (2) WhatsApp
  // conectado, (3) lead sem canal nenhum (não é trava da empresa, é ausência de
  // dado do lead — mesmo assim precisa de explicação, por ordem do dono).
  // ================================================================
  private async resolveRoboBloqueio(
    context: VendasUserContext,
    user: any,
    lead: { phone?: string | null; email?: string | null },
  ): Promise<{ motivo: string; acao: string; codigo: 'config_ausente' | 'whatsapp_desconectado' | 'lead_sem_canal' | 'contato_suprimido' } | null> {
    // 1) Config do Admin (S5, VendasComercialConfig) — precisa EXISTIR linha
    // salva pra empresa. AgendaDisparoService.getConfig() devolve default sem
    // persistir nada, então a existência é checada direto aqui.
    const configRow = await (this.prisma as any).vendasComercialConfig
      ?.findUnique?.({ where: { companyId: context.companyId }, select: { companyId: true } })
      .catch(() => null);
    if (!configRow) {
      return {
        codigo: 'config_ausente',
        motivo: 'Configuração de disparo (horário e teto) ainda não foi feita para esta empresa.',
        acao: this.canManageAgendaDisparo(context)
          ? 'Configure horário e teto em Automações comerciais (ícone no topo do Vendas) antes de ligar a Automação.'
          : 'Peça ao dono/gerente pra configurar horário e teto em Automações comerciais.',
      };
    }

    // 2) WhatsApp da empresa conectado — MESMA fonte que a tela já usa
    // (InboxService.getWhatsappHealth -> connectedForUi, "verdade única" PR1),
    // nunca API crua do motor.
    let whatsappConnected = false;
    try {
      const health = await this.inboxService.getWhatsappHealth(user);
      whatsappConnected = Boolean((health as any)?.connectedForUi);
    } catch {
      whatsappConnected = false;
    }
    if (!whatsappConnected) {
      return {
        codigo: 'whatsapp_desconectado',
        motivo: 'WhatsApp da empresa não está conectado.',
        acao: 'Conecte o WhatsApp antes de ligar a Automação.',
      };
    }

    // 3) Lead sem NENHUM canal — não tem o que disparar.
    const hasPhone = Boolean(String(lead?.phone || '').trim());
    const hasEmail = Boolean(String(lead?.email || '').trim());
    if (!hasPhone && !hasEmail) {
      return {
        codigo: 'lead_sem_canal',
        motivo: 'Este lead não tem WhatsApp, telefone nem e-mail cadastrado.',
        acao: 'Use "Buscar dados" pra tentar localizar um contato antes de ligar a Automação.',
      };
    }

    // 4) S2 CORREÇÃO DO NOTURNO: quem pediu pra não ser chamado não entra em
    // agenda nenhuma. A supressão já barrava o ENVIO; barrar no PREPARO evita
    // agendar hoje um disparo que o freio vai cancelar depois (e o vendedor
    // ficar achando que está tudo certo até a mensagem não sair).
    const supressao = await this.contactSuppression
      .isSuppressed({ phone: lead?.phone || null, email: lead?.email || null })
      .catch(() => ({ suppressed: false, matchedType: null as null }));
    if (supressao.suppressed) {
      return {
        codigo: 'contato_suprimido',
        motivo: 'Este contato pediu para não receber mensagens (ou foi marcado como sem perfil).',
        acao: 'Não dá pra disparar nem agendar pra ele. Use outro contato da empresa.',
      };
    }

    return null;
  }

  // S8 LEAD-CENTRICO: "outra automação ativa" só pode ser RESÍDUO — o motor de
  // campanha morreu no S7 (puxa→dispara aposentado, `refuseAutomaticProspectingCreation`).
  // source 'bot' = campanha de prospecção legada: cancela o resíduo DESTE lead e
  // segue (nunca mais bloqueia). source 'cadencia' = outra cadência ainda ativa
  // pro MESMO lead: TROCA (pausa a anterior com aviso na timeline) em vez de
  // recusar. Nunca mexe em outbox/disjuntor/atendimento/recovery — só estado de
  // inscrição + ledger canônico (mesma superfície de pauseCommercialAutomationForLead).
  private async autoResolveRoboConflict(
    context: VendasUserContext,
    leadId: string,
    conflict: { source: string; id: string; status: string },
  ): Promise<boolean> {
    if (conflict.source === 'bot') {
      await (this.prisma as any).vendasAutomationJob
        ?.updateMany?.({
          where: {
            companyId: context.companyId,
            leadId,
            status: { in: ['pending', 'scheduled', 'sending', 'sent'] },
          },
          data: {
            status: 'canceled',
            archivedAt: new Date(),
            classification: 'legacy_prospecting_retired',
            errorMessage: 'legacy_prospecting_retired_auto_cleared',
          },
        })
        .catch(() => null);
      await this.commercialContactControl
        .finishAutomationEnrollment({
          companyId: context.companyId,
          legacySource: 'vendas_automation_job',
          legacyExecutionId: conflict.id,
          status: 'canceled',
          reason: 'legacy_prospecting_retired_auto_cleared',
        })
        .catch(() => null);
      return true;
    }
    if (conflict.source === 'cadencia') {
      const result = await this.commercialContactControl.pauseCommercialAutomationForLead({
        companyId: context.companyId,
        leadId,
        reason: 'lead_robo_trocado_automatico',
      });
      if (result.canceledCadencias > 0) {
        await this.prisma.vendasLeadTimelineEvent
          .create({
            data: {
              leadId,
              ...this.buildTimelineEvent({
                eventType: 'robo_trocado',
                title: 'Robô trocado',
                description: 'Cadência anterior pausada automaticamente para ligar a nova.',
                resultLabel: 'robo_trocado',
                createdByUserId: context.userId,
              }),
            },
          })
          .catch(() => null);
      }
      return true;
    }
    return false;
  }

  // ================================================================
  // S4 LEAD-CENTRICO (04-robozinho.md, item 1): "Ligar robô" — opt-in POR LEAD.
  // Liga = inscreve o lead numa cadência (seed da persona OU cadenciaId explícito)
  // via o MESMO fluxo que o CadenciaService usa (CommercialContactControlService.
  // createCadenciaInscricao — idempotente, respeita conflito com outra automação
  // ativa). NUNCA disparo direto: o runner segue atrás de
  // HBX_AUTOMATION_RUNNER_ENABLED (default OFF) — ligar aqui só cria a inscrição.
  // ================================================================
  private async resolveRoboCadencia(
    context: VendasUserContext,
    dto: { personaKey?: string; cadenciaId?: string },
  ): Promise<{ id: string; nome: string }> {
    const explicitCadenciaId = this.normalizeText(dto?.cadenciaId);
    if (explicitCadenciaId) {
      const row = await (this.prisma as any).cadencia.findFirst({
        where: { id: explicitCadenciaId, companyId: context.companyId },
        select: { id: true, nome: true, ativa: true },
      });
      if (!row) throw new NotFoundException('Cadência não encontrada.');
      // S8 LEAD-CENTRICO: cadência desativada NÃO trava mais — religa sozinha
      // (mesmo tratamento do caminho por persona/seed logo abaixo; "ative-a
      // antes" foi removido pela ordem do dono de 26/07 — nada de burocracia
      // impede ligar a Automação além da config do Admin + WhatsApp).
      if (!row.ativa) {
        await (this.prisma as any).cadencia.update({ where: { id: row.id }, data: { ativa: true } }).catch(() => null);
      }
      return { id: row.id, nome: row.nome };
    }

    const personaKey = String(dto?.personaKey || '').trim().toLowerCase() as CadenciaPersona;
    const seed = CADENCIA_SEEDS.find((s) => s.key === personaKey);
    if (!seed) throw new BadRequestException('Informe personaKey (conservador/moderado/agressivo) ou cadenciaId.');

    // Garante a cadência-seed da persona pra esta empresa (idempotente — mesmo
    // padrão de CadenciaService.ensureSeeds, só que resolvendo UMA persona).
    const existing = await (this.prisma as any).cadencia.findFirst({
      where: { companyId: context.companyId, persona: seed.key, isSeed: true },
      select: { id: true, nome: true, ativa: true },
    });
    if (existing) {
      if (!existing.ativa) {
        await (this.prisma as any).cadencia.update({ where: { id: existing.id }, data: { ativa: true } }).catch(() => null);
      }
      return { id: existing.id, nome: existing.nome };
    }
    const created = await (this.prisma as any).cadencia.create({
      data: {
        companyId: context.companyId,
        ownerId: context.userId,
        nome: seed.nome,
        persona: seed.key,
        descricao: seed.descricao,
        passosJson: JSON.stringify(sanitizePassos(seed.passos)),
        ativa: true,
        isSeed: true,
      },
    });
    return { id: created.id, nome: created.nome };
  }

  async ligarRoboForUser(
    user: any,
    leadId: string,
    dto: { personaKey?: string; cadenciaId?: string; objetivo?: string; startAt?: string | Date | null; message?: string | null },
  ) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(context.access?.canEditCards, 'Acesso para planejar Automação bloqueado pela política da equipe.');
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead não informado.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      select: { id: true, assignedUserId: true, status: true, name: true, phone: true, email: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    const status = this.normalizeStatus(lead.status);
    if (status === 'qualificado' || status === 'encerrado') {
      throw new BadRequestException('Lead já avançado/encerrado — Automação não liga aqui (humano assumiu).');
    }

    // S8 LEAD-CENTRICO (08-destravar-robo.md): as 2 travas de ativação (config do
    // Admin + WhatsApp conectado) + o motivo permitido de "lead sem canal" — a
    // MESMA fonte que o pré-voo expõe em `roboBloqueado`, aqui enforçada de
    // verdade (nunca confia só no front pra não deixar ligar).
    const bloqueio = await this.resolveRoboBloqueio(context, user, {
      phone: (lead as any).phone,
      email: (lead as any).email,
    });
    if (bloqueio) {
      throw new BadRequestException(`${bloqueio.motivo} ${bloqueio.acao}`.trim());
    }

    let personaKey = this.normalizeText(dto?.personaKey);
    const explicitCadenciaId = this.normalizeText(dto?.cadenciaId);
    if (!personaKey && !explicitCadenciaId) {
      // S8 LEAD-CENTRICO: sem personaKey -> usa a MESMA recomendação heurística
      // do pré-voo como default (nunca trava pedindo pra escolher manualmente).
      const preVoo = await this.getLeadPreVooForUser(user, normalizedLeadId).catch(() => null);
      personaKey = (preVoo as any)?.recomendacao?.personaKey || 'conservador';
    }
    const cadencia = await this.resolveRoboCadencia(context, {
      personaKey: personaKey || undefined,
      cadenciaId: explicitCadenciaId || undefined,
    });
    const objetivo = this.normalizeText(dto?.objetivo);

    // ── S1 CORREÇÃO DO NOTURNO (01-CORRECAO.md) ──────────────────────────────
    // O horário do disparo NUNCA mais é `new Date()` cru (B2: ignorava janela,
    // teto e intervalo). Sem hora pedida, "agora" é só o PONTO DE PARTIDA da
    // busca — o motor de slots clampa pra dentro da janela (03:00 vira 08:00),
    // pula o dia cheio e respeita o intervalo mínimo entre disparos.
    const agora = new Date();
    const desiredAt = (dto?.startAt ? this.parseDate(dto.startAt as any) : null) || agora;
    const validacao = validarDesiredAt(desiredAt, agora);
    if (!validacao.ok) throw new BadRequestException(validacao.motivo);

    // S2: carimbo repetido é recusado JÁ no preparo, com a MESMA régua do gate
    // anti-ban. Descobrir hoje > descobrir amanhã quando o envio for cancelado.
    const copy = this.normalizeText(dto?.message);
    if (copy) await this.assertCopyNaoEhCarimbo(context.companyId, copy);
    // Sem texto explícito (o caso da TELA), reserva uma variante ainda não usada.
    // É isto que impede 10 agendamentos virarem 10 mensagens iguais amanhã.
    const copyReservada = copy || (await this.reservarCopyDeAberturaAgendada(context.companyId));

    const attemptEnroll = () =>
      this.commercialContactControl.createCadenciaInscricao({
        companyId: context.companyId,
        leadId: lead.id,
        data: {
          cadenciaId: cadencia.id,
          companyId: context.companyId,
          leadId: lead.id,
          responsavelId: lead.assignedUserId,
          status: 'ativa',
          currentStep: 0,
          startedAt: new Date(),
          aberturaCopy: copyReservada || null,
          // Provisório: o slot definitivo é reservado logo abaixo, DENTRO do
          // mutex por empresa (é o que impede 2 agendamentos no mesmo minuto —
          // B4). Gravar o pedido aqui já faz a linha "ocupar" o horário pra
          // quem estiver reservando em paralelo.
          nextStepAt: desiredAt,
        },
      });

    let slot = await attemptEnroll();
    if (!slot.created && slot.conflict) {
      // S8 LEAD-CENTRICO: nunca bloqueia por resíduo/outra automação — resolve
      // sozinho (cancela resíduo legado OU troca a cadência anterior com aviso)
      // e tenta 1x de novo. Sem loop: só uma retentativa.
      const resolved = await this.autoResolveRoboConflict(context, lead.id, slot.conflict);
      if (!resolved) {
        throw new ConflictException('Já existe outra automação comercial ativa para este lead (outra cadência ou campanha).');
      }
      slot = await attemptEnroll();
      if (!slot.created && slot.conflict) {
        throw new ConflictException('Já existe outra automação comercial ativa para este lead (outra cadência ou campanha).');
      }
    }

    let ligou = slot.created;
    let inscricaoId: string | null = slot.created ? String((slot as any).row?.id || '') || null : null;
    if (!slot.created && slot.alreadyEnrolled) {
      // Já existe uma linha pra (cadência, lead) — pode ser a MESMA que já está
      // ativa (idempotente: no-op real) ou uma cancelada por um "desligar"
      // anterior (religa). `createCadenciaInscricao` não distingue os dois porque
      // sua checagem de duplicata é por par (cadência,lead), não por status.
      const row = await (this.prisma as any).cadenciaInscricao.findFirst({
        where: { companyId: context.companyId, leadId: lead.id, cadenciaId: cadencia.id },
        select: { id: true, status: true },
      });
      inscricaoId = row?.id ? String(row.id) : null;
      if (row && row.status !== 'ativa') {
        try {
          await (this.prisma as any).cadenciaInscricao.updateMany({
            where: { id: row.id, companyId: context.companyId },
            data: {
              status: 'ativa',
              currentStep: 0,
              nextStepAt: desiredAt,
              lastError: null,
              startedAt: new Date(),
              // Religar é um disparo novo: leva texto novo, nunca o da rodada anterior.
              aberturaCopy: copyReservada || null,
            },
          });
        } catch (error: any) {
          throw new ConflictException(`Não foi possível religar a Automação: ${String(error?.message || error)}`);
        }
        await this.commercialContactControl.finishAutomationEnrollment({
          companyId: context.companyId,
          legacySource: 'cadencia_inscricao',
          legacyExecutionId: String(row.id),
          status: 'active',
          reason: 'lead_robo_religado_manual',
        });
        ligou = true;
      } else {
        ligou = false; // já estava ativa — idempotente, nada muda
      }
    }

    // ── Reserva do horário (S1) ───────────────────────────────────────────────
    // Roda DEPOIS da linha existir, dentro do mutex por empresa: `reservarProximoSlot`
    // relê o que já está ocupado (excluindo a própria inscrição) e grava o
    // `nextStepAt` definitivo. É o que faz 2 pedidos pro mesmo minuto virarem 09:00
    // e 09:15 em vez de dois disparos colados (B4).
    let reserva: { slot: Date; requested: Date; conflito: boolean; motivoConflito: SlotConflictReason } = {
      slot: desiredAt,
      requested: desiredAt,
      conflito: false,
      motivoConflito: null,
    };
    const pediuHora = Boolean(dto?.startAt);
    if (inscricaoId && (ligou || pediuHora)) {
      try {
        reserva = await this.agendaDisparo.reservarProximoSlot({
          companyId: context.companyId,
          inscricaoId,
          desiredAt,
          now: agora,
        });
      } catch (error: any) {
        this.logger.warn(`[vendas] reserva de slot falhou (lead=${lead.id}): ${String(error?.message || error)}`);
      }
    }
    const resumoAgenda = explicarSlot(reserva);

    // Registra o texto que ESTE disparo vai levar (explícito ou reservado): é o
    // que faz o próximo agendamento enxergar esta copy como "já usada" e pegar
    // outra. Sem isto, a reserva não tem memória e todo mundo pega a primeira.
    if (copyReservada && (ligou || pediuHora)) {
      await this.registrarCopyAgendada(context.companyId, copyReservada, { leadId: lead.id, slot: reserva.slot });
    }

    if (ligou) {
      await this.prisma.vendasLeadTimelineEvent
        .create({
          data: {
            leadId: lead.id,
            ...this.buildTimelineEvent({
              eventType: 'robo_ligado',
              title: 'Robô ligado',
              description: `Robô ligado na cadência "${cadencia.nome}"${objetivo ? ` — objetivo: ${objetivo}` : ''}. ${resumoAgenda}`,
              resultLabel: 'robo_ligado',
              createdByUserId: context.userId,
            }),
          },
        })
        .catch(() => null);
    }

    return {
      ok: true,
      ligou,
      jaLigado: !ligou,
      cadenciaId: cadencia.id,
      cadenciaNome: cadencia.nome,
      // O que a tela precisa pra NÃO mentir: pedi 09:00, ficou 09:15 e por quê.
      slot: reserva.slot.toISOString(),
      requested: reserva.requested.toISOString(),
      conflito: reserva.conflito,
      motivoConflito: reserva.motivoConflito,
      resumo: resumoAgenda,
    };
  }

  // ── S1 CORREÇÃO DO NOTURNO: AGENDAR DISPARO (não é lembrete) ───────────────
  // O popup de "agendar" da prospecção passa por aqui. Diferença pro `ligarRobo`:
  // hora é OBRIGATÓRIA (o vendedor escolheu quando) — o resto é o mesmo caminho,
  // de propósito: um agendamento é um disparo com hora marcada, não outro produto.
  async agendarDisparoForUser(
    user: any,
    leadId: string,
    dto: { desiredAt: string; personaKey?: string; cadenciaId?: string; objetivo?: string; message?: string },
  ) {
    const desiredAt = this.parseDate(dto?.desiredAt);
    if (!desiredAt) throw new BadRequestException('Data e hora inválidas. Escolha o dia e a hora do disparo.');
    const validacao = validarDesiredAt(desiredAt, new Date());
    if (!validacao.ok) throw new BadRequestException(validacao.motivo);
    return this.ligarRoboForUser(user, leadId, {
      personaKey: dto?.personaKey,
      cadenciaId: dto?.cadenciaId,
      objetivo: dto?.objetivo,
      message: dto?.message,
      startAt: desiredAt,
    });
  }

  // Copies de primeiro contato já ENVIADAS ou já AGENDADAS nas últimas 24h —
  // as duas moram no MESMO audit log (scope 'dispatch') porque a pergunta é uma
  // só: "esse texto já saiu/vai sair parecido demais?".
  private async lerCopiasFriasRecentes(companyId: number, janelaMs: number): Promise<string[]> {
    const rows = await (this.prisma as any).whatsAppAuditLog
      .findMany({
        where: {
          companyId,
          scope: 'dispatch',
          event: { in: ['cold_contact_sent', 'cold_contact_scheduled'] },
          createdAt: { gte: new Date(Date.now() - janelaMs) },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { metadata: true },
      })
      .catch(() => []);
    const textos: string[] = [];
    for (const row of rows || []) {
      try {
        const texto = String(JSON.parse(String(row?.metadata || '{}'))?.extra?.textNorm || '');
        if (texto) textos.push(texto);
      } catch {
        // metadata podre não invalida a checagem das outras
      }
    }
    return textos;
  }

  // ── VARIANTE DE ABERTURA RESERVADA (31/07/2026 — turno noturno 2) ──────────
  // Achado N2: a régua anti-carimbo do S2 só rodava quando a chamada trazia
  // `message` — e o popup "Agendar disparo" só manda data e hora. Resultado
  // medido: dava pra agendar 10 disparos e todos levavam o MESMO corpo fixo do
  // passo da cadência. Dez mensagens idênticas na manhã seguinte é exatamente a
  // assinatura que fez a Meta remover o dispositivo em 30/07.
  //
  // Agora, quem agenda pela tela também escolhe um texto: a variante de 1º
  // contato do dono mais distante do que já saiu/está agendado. Sem variante
  // livre, o agendamento é RECUSADO com motivo legível (gere mais variações) —
  // recusar hoje é melhor que o freio cancelar amanhã, um por um.
  // Empresa sem copy própria mantém o comportamento antigo (corpo do passo).
  private async reservarCopyDeAberturaAgendada(companyId: number): Promise<string | null> {
    if (!this.coldGate.isEnabled()) return null;
    const campaign = await (this.prisma as any).vendasAutomationCampaign
      ?.findFirst?.({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        select: { filtersJson: true },
      })
      .catch(() => null);
    const filters = this.parseFiltersJson((campaign as any)?.filtersJson);
    const brutas = Array.isArray(filters?.firstContactVariants) ? filters.firstContactVariants : [];
    // Variante PAUSADA carrega um caractere de controle no início (o dono
    // desliga sem perder o texto) — o motor não pode usá-la.
    const ativas = brutas
      .map((v: unknown) => String(v || ''))
      .filter((v: string) => v && v.charCodeAt(0) !== 1)
      .map((v: string) => v.trim())
      .filter(Boolean);
    if (!ativas.length) return null;

    const usadasNorm = await this.lerCopiasFriasRecentes(companyId, this.coldGate.similarityWindowMs());
    const escolha = reservarVarianteDeAbertura({
      variantes: ativas,
      usadasNorm,
      threshold: this.coldGate.similarityThreshold(),
      minLen: this.coldGate.similarityMinLen(),
    });
    if (escolha.ok === false) throw new BadRequestException(escolha.motivo);
    return escolha.variante;
  }

  private parseFiltersJson(raw: unknown): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, any>;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
    } catch {
      return {};
    }
  }

  private async assertCopyNaoEhCarimbo(companyId: number, texto: string) {
    if (!this.coldGate.isEnabled()) return;
    const recentesNorm = await this.lerCopiasFriasRecentes(companyId, this.coldGate.similarityWindowMs());
    if (!recentesNorm.length) return;
    const veredito = avaliarCopyAgendada({
      texto,
      recentesNorm,
      threshold: this.coldGate.similarityThreshold(),
      minLen: this.coldGate.similarityMinLen(),
    });
    if (veredito.ok === false) throw new BadRequestException(veredito.motivo);
  }

  private async registrarCopyAgendada(
    companyId: number,
    texto: string,
    origem: { leadId: string; slot: Date },
  ): Promise<void> {
    const textNorm = textoNormalizadoParaAgenda(texto);
    if (!textNorm) return;
    await (this.prisma as any).whatsAppAuditLog
      .create({
        data: {
          companyId,
          scope: 'dispatch',
          event: 'cold_contact_scheduled',
          level: 'INFO',
          message: `Primeiro contato agendado para ${origem.slot.toISOString()}`,
          metadata: JSON.stringify({ extra: { textNorm, leadId: origem.leadId, slot: origem.slot.toISOString() } }),
        },
      })
      .catch(() => null);
  }

  async desligarRoboForUser(user: any, leadId: string) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(context.access?.canEditCards, 'Acesso para planejar Automação bloqueado pela política da equipe.');
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead não informado.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const result = await this.commercialContactControl.pauseCommercialAutomationForLead({
      companyId: context.companyId,
      leadId: lead.id,
      reason: 'lead_robo_desligado_manual',
    });

    if (result.canceledCadencias > 0) {
      await this.prisma.vendasLeadTimelineEvent
        .create({
          data: {
            leadId: lead.id,
            ...this.buildTimelineEvent({
              eventType: 'robo_desligado',
              title: 'Robô desligado',
              description: 'Robô desligado manualmente.',
              resultLabel: 'robo_desligado',
              createdByUserId: context.userId,
            }),
          },
        })
        .catch(() => null);
    }

    return { ok: true, desligou: result.canceledCadencias > 0 };
  }

  // S5 LEAD-CENTRICO (05-agenda-slots.md) — config comercial ENXUTA por empresa
  // (janela + teto/dia + intervalo). Qualquer membro do time lê; só Admin/USERMASTER
  // salva (mesmo padrão de assertCanManageProspecting em vendas-automation.service.ts).
  // Extraído em método próprio (S8 LEAD-CENTRICO) — resolveRoboBloqueio reusa a
  // MESMA checagem pra decidir se a mensagem de bloqueio diz "configure você" ou
  // "peça ao dono/gerente".
  private canManageAgendaDisparo(context: VendasUserContext): boolean {
    return Boolean(context.access?.isSystemMaster) || context.access?.isAdmin === true || String(context.role || '').trim().toUpperCase() === 'USERMASTER';
  }

  private assertCanManageAgendaDisparo(context: VendasUserContext) {
    this.assertVendasPermission(this.canManageAgendaDisparo(context), 'Só o dono/gerente pode configurar horário e teto de disparo.');
  }

  // S2 CORREÇÃO DO NOTURNO (B5): a tela prometia 40 disparos/dia enquanto o freio
  // anti-ban entregava 10. Teto EXIBIDO passa a ser o menor entre o que o tenant
  // configurou e o que o freio físico deixa sair — a config continua valendo pro
  // espaçamento da agenda, mas ninguém mais promete o que não sai.
  private tetoEfetivoDoDia(dailyLimitPerSender: number): {
    tetoEfetivoPorDia: number;
    coldGateAtivo: boolean;
    coldGateMaxPorDia: number;
  } {
    const coldGateAtivo = this.coldGate.isEnabled();
    const coldGateMaxPorDia = this.coldGate.maxPerDay();
    return {
      coldGateAtivo,
      coldGateMaxPorDia,
      tetoEfetivoPorDia: coldGateAtivo ? Math.min(dailyLimitPerSender, coldGateMaxPorDia) : dailyLimitPerSender,
    };
  }

  async getComercialConfigForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    const config = await this.agendaDisparo.getConfig(context.companyId);
    return { ...config, ...this.tetoEfetivoDoDia(config.dailyLimitPerSender) };
  }

  async updateComercialConfigForUser(user: any, dto: { workingHoursStart?: string; workingHoursEnd?: string; dailyLimitPerSender?: number; intervalMinutes?: number }) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanManageAgendaDisparo(context);
    const config = await this.agendaDisparo.saveConfig(context.companyId, dto || {});
    return { ...config, ...this.tetoEfetivoDoDia(config.dailyLimitPerSender) };
  }

  // Catálogo comercial (30/07): ler é do time; escrever é do mesmo gate do
  // horário/teto (dono/gerente) — só muda a mensagem, pra não mentir o motivo.
  async getCatalogoComercialForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    return this.agendaDisparo.getCatalogo(context.companyId);
  }

  async updateCatalogoComercialForUser(user: any, dto: { catalogo?: unknown }) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(this.canManageAgendaDisparo(context), 'Só o dono/gerente pode editar o catálogo comercial.');
    return this.agendaDisparo.saveCatalogo(context.companyId, dto?.catalogo ?? null);
  }

  async getProximoSlotDisparoForUser(user: any, query: { desiredAt?: string }) {
    const context = await this.resolveVendasUserContext(user);
    const desiredAt = query?.desiredAt ? this.parseDate(query.desiredAt) : null;
    const result = await this.agendaDisparo.proximoSlotLivre(context.companyId, { desiredAt: desiredAt || undefined });
    return {
      slot: result.slot.toISOString(),
      requested: result.requested.toISOString(),
      conflito: result.conflito,
      motivoConflito: result.motivoConflito,
      config: { ...result.config, ...this.tetoEfetivoDoDia(result.config.dailyLimitPerSender) },
      // Frase pronta pra tela não ter que remontar a explicação (e divergir dela).
      resumo: explicarSlot(result),
    };
  }

  async buildPresentationEmailDraftForUser(user: any, leadId: string) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanSendPresentationEmail(context);
    const { userId } = context;
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
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

  private normalizeCommercialDomain(value: unknown) {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    let candidate = raw.trim();
    if (candidate.includes('@') && !candidate.includes('/')) {
      candidate = candidate.split('@').pop() || candidate;
    }
    const parseCandidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)
      ? candidate
      : `https://${candidate}`;
    let host = '';
    try {
      host = new URL(parseCandidate).hostname;
    } catch {
      host = candidate.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0] || '';
    }
    host = host.toLowerCase().replace(/:\d+$/g, '').replace(/\.$/, '');
    while (host.startsWith('www.')) host = host.slice(4);
    if (!host || !host.includes('.') || host.length < 4) return null;
    const sharedDomains = new Set([
      'bit.ly',
      'facebook.com',
      'fb.com',
      'g.page',
      'google.com',
      'instagram.com',
      'linktr.ee',
      'maps.app.goo.gl',
      'tiktok.com',
      'wa.me',
      'whatsapp.com',
    ]);
    for (const shared of sharedDomains) {
      if (host === shared || host.endsWith(`.${shared}`)) return null;
    }
    return host;
  }

  private normalizeCommercialIdentity(value: unknown) {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    const normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' e ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized || null;
  }

  private buildCommercialDuplicateCheck(
    row: any,
    reason: CommercialContactDuplicateReason,
    action: 'reuse' | 'block',
    fingerprints: string[] = [],
  ): CommercialContactDuplicateCheck {
    return {
      exists: true,
      action,
      reason,
      leadId: row?.id ? String(row.id) : null,
      leadName: this.normalizeText(row?.name),
      fingerprints,
    };
  }

  private buildCommercialDuplicateMessage(check: CommercialContactDuplicateCheck) {
    const leadName = this.normalizeText(check.leadName);
    return leadName
      ? `${COMMERCIAL_CONTACT_DUPLICATE_MESSAGE} Card existente: ${leadName}.`
      : COMMERCIAL_CONTACT_DUPLICATE_MESSAGE;
  }

  private async findExistingCommercialLeadByRadarPlace(companyId: number, placeId: unknown) {
    const normalizedPlaceId = this.normalizeText(placeId);
    if (!normalizedPlaceId) return null;
    const [poolTableReady, stateTableReady] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('RadarLeadCompanyState').catch(() => false),
    ]);
    if (!poolTableReady || !stateTableReady) return null;
    const poolQuery = (this.prisma as any).radarLeadPool?.findFirst?.({
      where: { placeId: normalizedPlaceId },
      select: { id: true },
    }) || Promise.resolve(null);
    const pool = await poolQuery.catch(() => null);
    if (!pool?.id) return null;
    const stateQuery = (this.prisma as any).radarLeadCompanyState?.findFirst?.({
      where: {
        companyId,
        radarLeadId: String(pool.id),
        vendasLeadId: { not: null },
      },
      select: {
        vendasLeadId: true,
        vendasLead: { select: { id: true, name: true } },
      },
    }) || Promise.resolve(null);
    const state = await stateQuery.catch(() => null);
    if (state?.vendasLead?.id) return state.vendasLead;
    if (!state?.vendasLeadId) return null;
    return this.prisma.vendasLead.findFirst({
      where: { companyId, id: String(state.vendasLeadId) },
      select: { id: true, name: true },
    }).catch(() => null);
  }

  private async findExistingCommercialContactForImport(
    companyId: number,
    input: {
      phone?: unknown;
      email?: unknown;
      sourceHistoryId?: unknown;
      placeId?: unknown;
      website?: unknown;
      name?: unknown;
      city?: unknown;
      state?: unknown;
    },
  ): Promise<CommercialContactDuplicateCheck> {
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    const phoneCandidates = this.buildLeadPhoneNormalizedCandidates(input.phone);
    const domain = this.normalizeCommercialDomain(input.website);
    const nameKey = this.normalizeCommercialIdentity(input.name);
    const cityKey = this.normalizeCommercialIdentity(input.city);
    const stateKey = this.normalizeText(input.state)?.toUpperCase().slice(0, 2) || null;
    const fingerprints = buildLeadFingerprints({
      companyId: normalizedCompanyId,
      normalizedPhone: phoneCandidates[0] || null,
      googlePlaceId: this.normalizeText(input.placeId),
      websiteDomain: domain,
      normalizedName: nameKey,
      city: cityKey,
      state: stateKey,
    });
    const none: CommercialContactDuplicateCheck = { exists: false, action: 'none', reason: null, fingerprints };
    if (!normalizedCompanyId) return none;

    if (phoneCandidates.length) {
      const existing = await this.prisma.vendasLead.findFirst({
        where: { companyId: normalizedCompanyId, phoneNormalized: { in: phoneCandidates } },
        select: { id: true, name: true },
      });
      if (existing?.id) return this.buildCommercialDuplicateCheck(existing, 'phone', 'reuse', fingerprints);
    }

    const email = this.normalizeEmail(input.email);
    if (email) {
      const existing = await this.prisma.vendasLead.findFirst({
        where: { companyId: normalizedCompanyId, email },
        select: { id: true, name: true },
      });
      if (existing?.id) return this.buildCommercialDuplicateCheck(existing, 'email', 'block', fingerprints);
    }

    const sourceHistoryId = this.normalizeText(input.sourceHistoryId);
    if (this.extractRadarLeadId(sourceHistoryId)) {
      const existing = await this.prisma.vendasLead.findFirst({
        where: { companyId: normalizedCompanyId, sourceHistoryId },
        select: { id: true, name: true },
      });
      if (existing?.id) return this.buildCommercialDuplicateCheck(existing, 'source_history', 'block', fingerprints);
    }

    const placeMatch = await this.findExistingCommercialLeadByRadarPlace(normalizedCompanyId, input.placeId);
    if (placeMatch?.id) return this.buildCommercialDuplicateCheck(placeMatch, 'google_place', 'block', fingerprints);

    if (domain) {
      const rows = await this.prisma.vendasLead.findMany({
        where: {
          companyId: normalizedCompanyId,
          website: { contains: domain },
        },
        select: { id: true, name: true, website: true },
        orderBy: [{ updatedAt: 'desc' }],
        take: 20,
      });
      const existing = rows.find((row: any) => this.normalizeCommercialDomain(row?.website) === domain);
      if (existing?.id) return this.buildCommercialDuplicateCheck(existing, 'website_domain', 'block', fingerprints);
    }

    if (nameKey && cityKey) {
      const rows = await this.prisma.vendasLead.findMany({
        where: {
          companyId: normalizedCompanyId,
          name: { not: null },
          city: { not: null },
          ...(stateKey ? { state: stateKey } : {}),
        },
        select: { id: true, name: true, city: true, state: true },
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
      });
      const existing = rows.find((row: any) => {
        if (this.normalizeCommercialIdentity(row?.name) !== nameKey) return false;
        if (this.normalizeCommercialIdentity(row?.city) !== cityKey) return false;
        if (stateKey && this.normalizeText(row?.state)?.toUpperCase().slice(0, 2) !== stateKey) return false;
        return true;
      });
      if (existing?.id) return this.buildCommercialDuplicateCheck(existing, 'name_location', 'block', fingerprints);
    }

    return none;
  }

  private hasActionableImportChannel(item: any, phoneDigits?: string | null) {
    if (phoneDigits) return true;
    if (this.normalizeEmail(item?.email || item?.emailCandidate)) return true;
    if (this.normalizeText(item?.website || item?.websiteUrl)) return true;
    if (this.normalizeText(item?.instagramUrl || item?.primarySocial || item?.signals?.instagramUrl)) return true;
    if (this.normalizeText(item?.facebookUrl || item?.signals?.facebookUrl)) return true;
    if (this.normalizeText(item?.googleMapsUrl || item?.mapsUrl || item?.signals?.googleMapsUrl)) return true;
    return false;
  }

  private async getTeamPolicyRequiredImportChannels(userIdRaw: unknown) {
    const userId = Math.trunc(Number(userIdRaw || 0));
    if (!userId) return [];
    const policy = await loadUserTeamPolicyRuntime(this.prisma, userId).catch(() => null);
    return getTeamPolicyRequiredChannelList(policy);
  }

  private getMissingTeamPolicyImportChannels(item: any, phoneDigits?: string | null, requiredChannels: string[] = []) {
    const signals = item?.signals && typeof item.signals === 'object' ? item.signals : {};
    const whatsappStatus = String(item?.whatsappStatus || item?.whatsappCheckStatus || signals.whatsappStatus || '').trim().toLowerCase();
    const has = (channel: string) => {
      if (channel === 'whatsapp') {
        return Boolean(phoneDigits) || ['confirmed', 'available', 'valid', 'exists', 'true', 'likely'].includes(whatsappStatus);
      }
      if (channel === 'instagram') {
        return Boolean(this.normalizeText(item?.instagramUrl || item?.primarySocial || signals.instagramUrl));
      }
      if (channel === 'facebook') {
        return Boolean(this.normalizeText(item?.facebookUrl || signals.facebookUrl));
      }
      if (channel === 'email') {
        return Boolean(this.normalizeEmail(item?.email || item?.emailCandidate || signals.email));
      }
      if (channel === 'website') {
        return Boolean(this.normalizeText(item?.website || item?.websiteUrl || signals.website));
      }
      return true;
    };
    return requiredChannels.filter((channel) => !has(channel));
  }

  async previewPresentationEmailForUser(user: any, leadId: string, body?: any) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanSendPresentationEmail(context);
    const { companyId, userId } = context;
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');
    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      select: this.buildVendasLeadSelectWithoutAddress(),
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');
    this.assertLeadAllowsManualEmail(lead);
    const replyTo = await this.resolveCompanyReplyToForEmail(context, body);

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
    const preview = await this.companyPresentationEmails.previewPresentationForCompany(companyId, {
      companyId,
      userId,
      recipientName: body?.recipientName || lead.name || 'cliente',
      recipientEmail: body?.recipientEmail || lead.email || '',
      companyName: lead.name || null,
      subject: body?.subject || fallbackDraft.subject,
      text: body?.text || fallbackDraft.body,
      html: body?.html,
      replyTo,
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
    const context = await this.resolveVendasUserContext(user);
    this.assertCanSendPresentationEmail(context);
    const { companyId, userId } = context;
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');
    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
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
    const replyTo = await this.resolveCompanyReplyToForEmail(context, body);

    try {
      await this.commercialUsageLimits.recordPresentationEmailAttempt(companyId, userId, {
        vendasLeadId: lead.id,
        recipientEmail,
        subject,
      });
      const result = await this.companyPresentationEmails.sendPresentationForCompany(companyId, {
        companyId,
        userId,
        recipientName,
        recipientEmail,
        companyName: lead.name || null,
        subject,
        text,
        html: body?.html,
        replyTo,
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

  // S6 LEAD-CENTRICO (06-email-v1.md, item 3): sem IMAP/webhook de recepção (gap
  // documentado no relatório do sprint), a resposta "sem interesse/remover" chega
  // pelo e-mail PESSOAL do vendedor — quem registra é o humano, no card. Isso:
  // (1) grava a supressão na MESMA fonte que o envio manual e a cadência checam
  // (CommercialEmailMessageLog.status='opted_out'), (2) marca o lead com o motivo
  // estruturado do S4 via updateLeadForUser (reusa permissão + timeline + a parada
  // global de cadência que já dispara pra status 'encerrado'), (3) grava 1 evento
  // próprio na história do lead documentando a origem manual do registro.
  async registerEmailOptOutForUser(user: any, leadId: string, body?: any) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanSendPresentationEmail(context);
    const { companyId, userId } = context;
    const normalizedLeadId = this.normalizeText(leadId);
    if (!normalizedLeadId) throw new BadRequestException('Lead nao informado.');
    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      select: this.buildVendasLeadSelectWithoutAddress(),
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');
    const recipientEmail = this.normalizeEmail(body?.recipientEmail || lead.email);
    if (!recipientEmail) throw new BadRequestException('Lead sem e-mail para suprimir.');
    const note = this.normalizeText(body?.note);

    await this.logCommercialEmailMessage({
      companyId,
      userId,
      vendasLeadId: lead.id,
      recipientEmail,
      recipientName: lead.name || null,
      subject: 'Pedido de remoção / sem interesse (registrado manualmente)',
      text: note,
      status: 'opted_out',
    });

    // S7 LEAD-CENTRICO: pedido EXPLÍCITO de remoção é o sinal mais forte que
    // existe — marca opt_out PERMANENTE pra este e-mail na marquinha global
    // (mais forte que o 'sem_interesse' de 12 meses que o encerramento
    // abaixo vai gravar via applyContactSuppressionOnLeadClosed). Best-effort.
    await this.contactSuppression
      .mark({ email: recipientEmail }, 'opt_out', { companyId, leadId: lead.id })
      .catch((error: any) => {
        this.logger.warn(`[vendas-suppression] falha ao marcar opt_out e-mail lead=${lead.id}: ${String(error?.message || error)}`);
      });

    let leadStatus = this.normalizeStatus((lead as any).status);
    if (leadStatus !== 'encerrado') {
      const result = await this.updateLeadForUser(user, normalizedLeadId, {
        status: 'encerrado',
        closureReason: 'sem_interesse',
      } as UpdateVendasLeadDto);
      leadStatus = this.normalizeStatus((result as any)?.lead?.status) || 'encerrado';
    }

    await this.prisma.vendasLeadTimelineEvent.create({
      data: {
        leadId: normalizedLeadId,
        ...this.buildTimelineEvent({
          eventType: 'email_opt_out_registered',
          title: 'Resposta de remoção registrada',
          description: `Contato pediu remoção/sem interesse por e-mail (${recipientEmail}). Novos e-mails comerciais para este endereço foram suprimidos.`,
          sourceType: 'email_presentation',
          resultLabel: 'opted_out',
          createdByUserId: userId,
        }),
      },
    }).catch(() => null);

    return { ok: true, recipientEmail, leadStatus };
  }

  private extractRadarLeadId(value: unknown) {
    const raw = String(value || '').trim();
    const match = raw.match(/^radar:([^:\s]+)$/i);
    return match?.[1] || null;
  }

  // Campos de enriquecimento que vivem no RadarLeadPool e o VendasLead NAO armazena
  // em coluna propria. Sem isso o card de Vendas chega cru (sem instagram/social/dor/canal).
  private static readonly RADAR_POOL_ENRICHMENT_FIELDS = [
    'instagramUrl',
    'facebookUrl',
    'socialStatus',
    'socialConfidence',
    'recommendedChannel',
    'painType',
    'painLabel',
    'painPitch',
    'opportunityReason',
    'emailStatus',
    'emailSource',
    'emailConfidence',
    'websiteStatus',
    'businessCategory',
    'googleMapsUrl',
    'visibilityTier',
    'deliveryProduct',
    'qualityReason',
    'enrichmentJson',
    'metadataJson',
    // HOT-07 (empresa recém-aberta): diasAberto/recem_aberto vêm calculados aqui
    // (RadarPublicDataService, a partir de CnpjPublicCompany.openedAt).
    'signalsJson',
  ] as const;

  // Re-lê o RadarLeadPool (fonte única) pelos ids carimbados em sourceHistoryId
  // (`radar:<poolId>`) e hidrata cada row IN-MEMORY com o enriquecimento, só
  // preenchendo lacunas (nunca sobrescreve valor já presente no VendasLead).
  // Batelado por findMany para evitar N+1. Pool ausente (deletado) = ignora sem quebrar.
  private async hydrateRowsWithRadarPoolEnrichment<T extends Record<string, any>>(rows: T[]): Promise<T[]> {
    if (!Array.isArray(rows) || !rows.length) return rows;
    const poolIdByRowIndex = new Map<number, string>();
    const poolIds = new Set<string>();
    rows.forEach((row, index) => {
      const poolId = this.extractRadarLeadId(row?.sourceHistoryId);
      if (poolId) {
        poolIdByRowIndex.set(index, poolId);
        poolIds.add(poolId);
      }
    });
    if (!poolIds.size) return rows;

    let pools: any[] = [];
    try {
      pools = await this.prisma.radarLeadPool.findMany({
        where: { id: { in: Array.from(poolIds) } },
        select: {
          id: true,
          instagramUrl: true,
          facebookUrl: true,
          socialStatus: true,
          socialConfidence: true,
          recommendedChannel: true,
          painType: true,
          painLabel: true,
          painPitch: true,
          opportunityReason: true,
          opportunityScore: true,
          enrichmentScore: true,
          emailStatus: true,
          emailSource: true,
          emailConfidence: true,
          websiteStatus: true,
          businessCategory: true,
          googleMapsUrl: true,
          visibilityTier: true,
          deliveryProduct: true,
          qualityReason: true,
          enrichmentJson: true,
          metadataJson: true,
          signalsJson: true,
        },
      });
    } catch (error: any) {
      this.logger.warn(`[vendas-enrichment] Falha ao reler RadarLeadPool para hidratar cards: ${String(error?.message || error)}`);
      return rows;
    }

    const poolById = new Map<string, any>(pools.map((pool) => [String(pool.id), pool]));
    const isEmpty = (value: unknown) => value == null || (typeof value === 'string' && value.trim() === '');

    poolIdByRowIndex.forEach((poolId, index) => {
      const pool = poolById.get(poolId);
      const row = rows[index];
      if (!pool || !row) return;
      for (const field of VendasService.RADAR_POOL_ENRICHMENT_FIELDS) {
        if (isEmpty((row as any)[field]) && !isEmpty(pool[field])) {
          (row as any)[field] = pool[field];
        }
      }
      // opportunityScore: VendasLead já tem coluna; só preenche se vier vazio/zero do lead.
      if (isEmpty((row as any).opportunityScore) || Number((row as any).opportunityScore || 0) === 0) {
        const poolScore = Number(pool.opportunityScore || pool.enrichmentScore || 0) || 0;
        if (poolScore > 0) (row as any).opportunityScore = poolScore;
      }
    });

    return rows;
  }

  private isProtectedRadarStatus(value: unknown) {
    const status = String(value || '').trim().toLowerCase();
    return [
      'negative',
      'denied',
      'blocked',
      'opt_out',
      'optout',
      'do_not_contact',
      'complaint',
      'discarded',
      'hidden',
      'lost',
      'no_whatsapp',
      'invalid_whatsapp',
      'invalid_phone',
    ].includes(status);
  }

  private async assertRadarLeadImportAllowed(context: { companyId: number }, radarLeadId?: string | null) {
    if (!radarLeadId) return;
    const [hasPool, hasState, hasOwnerColumn] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('RadarLeadCompanyState').catch(() => false),
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
    if (this.isProtectedRadarStatus(row.status)) {
      throw new BadRequestException('Este card do Radar está protegido e não pode ser enviado para Vendas.');
    }
    if (hasState) {
      const state = await (this.prisma as any).radarLeadCompanyState.findUnique({
        where: {
          companyId_radarLeadId: {
            companyId: context.companyId,
            radarLeadId,
          },
        },
        select: { status: true },
      }).catch(() => null);
      if (this.isProtectedRadarStatus(state?.status)) {
        throw new BadRequestException('Este card do Radar está protegido para esta empresa e não pode voltar para Vendas.');
      }
    }
  }

  private async syncRadarOwnershipAfterVendasImport(
    context: { companyId: number; userId: number },
    input: {
      radarLeadId?: string | null;
      vendasLeadId?: string | null;
      assignedUserId?: number | null;
      assignedByUserId?: number | null;
    },
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
        assignedUserId: input.assignedUserId || null,
        assignedByUserId: input.assignedByUserId || null,
        assignedAt: input.assignedUserId ? now : null,
        lastActionAt: now,
      },
      update: {
        vendasLeadId: input.vendasLeadId,
        status: 'sent_to_vendas',
        assignedUserId: input.assignedUserId || undefined,
        assignedByUserId: input.assignedByUserId || undefined,
        assignedAt: input.assignedUserId ? now : undefined,
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
    sourceType: 'manual' | 'webscraping' | 'anuncio';
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

  private async ensureCadastroFromVendasCard(
    companyId: number,
    lead: any,
    options: { saleActive: boolean; announceOnTimeline: boolean; userId?: number | null },
  ) {
    const phone = this.normalizeText(lead?.phone);
    if (!phone) return null;

    try {
      const registry = await this.cadastrosService.upsertCustomerRegistry({
        companyId,
        phone,
        customerProfileId: lead?.customerProfileId ? String(lead.customerProfileId) : null,
        name: this.normalizeText(lead?.name),
        registrationOrigin: 'vendas',
        registrationStatus: options.saleActive ? 'confirmed' : 'pending_confirmation',
      });
      if (!registry) return null;

      if (options.announceOnTimeline) {
        await this.prisma.vendasLeadTimelineEvent.create({
          data: {
            leadId: String(lead.id),
            ...this.buildTimelineEvent({
              eventType: 'customer_registered',
              title: 'Cliente cadastrado',
              description: options.saleActive
                ? 'Cadastro de cliente confirmado a partir do fechamento do card.'
                : 'Cadastro de cliente criado a partir do encerramento do card.',
              createdByUserId: options.userId || null,
            }),
          },
        }).catch(() => null);
      }

      return registry;
    } catch (error) {
      this.logger.warn(`Falha ao gerar cadastro do card ${String(lead?.id || '')}: ${String((error as any)?.message || error)}`);
      return null;
    }
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

  // ARQ11 S2 — serializa a metadata de campanha do lead de anúncio (Meta Lead Ads) em um JSON
  // compacto guardado no resultLabel do evento 'origin_registered'. Sem coluna/migration nova.
  // Retorna null quando não há nenhum campo (mantém o resultLabel vazio para os demais canais).
  private buildCampaignMetadataLabel(
    campaign?: { campaignName?: string | null; formId?: string | null; adId?: string | null } | null,
  ): string | null {
    if (!campaign) return null;
    const payload: Record<string, string> = {};
    const campaignName = this.normalizeText(campaign.campaignName);
    const formId = this.normalizeText(campaign.formId);
    const adId = this.normalizeText(campaign.adId);
    if (campaignName) payload.campaignName = campaignName;
    if (formId) payload.formId = formId;
    if (adId) payload.adId = adId;
    if (Object.keys(payload).length === 0) return null;
    return JSON.stringify(payload).slice(0, 500);
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
      queueTarget: currentQueue?.queueTarget || 'prospeccao',
      routeTarget: currentQueue?.routeTarget || 'prospeccao',
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
      manualQueueOverride: currentQueue?.manualQueueOverride || 'bot',
      manualQueueOverriddenAt: currentQueue?.manualQueueOverriddenAt || now,
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
        queueTarget: metadata?.queueTarget || 'prospeccao',
        routeTarget: metadata?.routeTarget || 'prospeccao',
        whatsappAvailabilityStatus: 'unavailable',
        whatsappAvailabilityCheckedAt: availability?.checkedAt || now,
        vendasAgendaQueue: nextQueue,
        vendasProspeccao: this.buildVendasProspeccaoMetadata('no_whatsapp', row, currentProspeccao, nextQueue, {
          leadSegment: this.normalizeText(row?.segment),
          mismatchReason: null,
        }),
      },
      lastInteractionAt: new Date(),
    });
    this.logger.log(`[prospeccao] whatsapp unavailable marcado no card/lead conversation=${conversation.id} lead=${String(row?.id || '-')}`);

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
    const context = await this.resolveVendasUserContext(user);
    this.assertCanReadVendasCards(context);
    this.assertCanPrepareManualWhatsapp(context);
    this.logger.log(`[vendas-agenda] Iniciando espelhamento de cards de hoje para company=${context.companyId}`);
    let rows: any[] = [];
    const syncWhere = this.buildLeadAccessWhere(context);
    try {
      rows = await this.prisma.vendasLead.findMany({
        where: syncWhere,
        orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error: any) {
      if (!this.isMissingAddressColumnError(error)) throw error;
      rows = await this.prisma.vendasLead.findMany({
        where: syncWhere,
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
      if (!context.canManageTeam && !linkedLead) continue;
      const shouldStayActive =
        Boolean(linkedLead) &&
        (filteredSync ? !this.isClosedLead(linkedLead) : this.shouldMirrorLeadToInboxAgenda(linkedLead)) &&
        this.conversationMatchesLeadPhone(conversation.contact, linkedLead);

      if (shouldStayActive) continue;

      await this.conversations.updateConversationState(context.companyId, conversation.id, {
        metadata: {
          ...metadata,
          vendasAgendaQueue: {
            ...queue,
            active: false,
            draftPending: false,
            botEligible: false,
            botEntryPending: false,
            queueTarget: queue.queueTarget || 'prospeccao',
            routeTarget: queue.routeTarget || 'prospeccao',
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
        ? `${mirroredLeadCount} card(s) preparados na Prospecção. ${skippedWithoutWhatsapp} numero(s) foram marcados no card porque o motor nao encontrou WhatsApp.`
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

  private canExposeImportPreviewDetails(context: VendasUserContext, row: any) {
    if (!row) return false;
    if (context.canManageTeam) return true;
    if (context.canViewOwnCards === false) return false;
    const assignedUserId = Number(row?.assignedUserId || 0) || null;
    const createdByUserId = Number(row?.createdByUserId || 0) || null;
    if (context.ownCardsOnly) return assignedUserId === context.userId;
    return assignedUserId === context.userId || (!assignedUserId && createdByUserId === context.userId);
  }

  private buildImportPreviewPayload(
    row: any,
    phoneDigits: string,
    sharedProfile?: any,
    options: { exposeCrmDetails?: boolean; accessContext?: VendasAccessContext | null } = {},
  ) {
    if (row && options.exposeCrmDetails === false) {
      return {
        phoneDigits,
        existsInCrm: true,
        leadId: null,
        leadName: null,
        status: null,
        statusLabel: null,
        signals: {
          alreadyExisted: true,
          cameFromWebscraping: false,
          hadPreviousContact: false,
          wasClosedBefore: false,
        },
        attemptCount: 0,
        lastContactAt: null,
        lastResult: null,
        timesSeen: 0,
        sourceType: null,
        primarySource: null,
        sharedProfile: null,
        crmDetailsRestricted: true,
      };
    }
    const payload = row ? this.buildLeadPayload(row, sharedProfile, undefined, undefined, options.accessContext) : null;
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
      crmDetailsRestricted: false,
    };
  }

  private async createOrUpdateLead(input: {
    companyId: number;
    userId: number;
    sourceType: 'manual' | 'webscraping' | 'anuncio';
    // ARQ11 S2 — temperatura do lead ('frio'|'morno'|'quente'). Gravada no MESMO write só
    // quando a coluna existe (fallback do doc enquanto a migration não roda no VPS).
    leadTemperature?: string | null;
    // ARQ11 S2 — metadata estruturada de campanha (Meta Lead Ads): sai do shortNote improvisado
    // e vira JSON compacto no resultLabel do evento de origem da timeline (relatório futuro
    // "qual campanha converte" nasce de graça). Não precisa de coluna/migration nova.
    campaignMetadata?: { campaignName?: string | null; formId?: string | null; adId?: string | null } | null;
    sourceHistoryId?: string | null;
    sourceSignature?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    website?: string | null;
    rating?: number | null;
    reviews?: number | null;
    opportunityScore?: number | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    status?: string | null;
    nextAction?: string | null;
    returnAt?: Date | null;
    shortNote?: string | null;
    assignedUserId?: number | null;
    assignedByUserId?: number | null;
    assignedAt?: Date | null;
    commissionPercentSnapshot?: number | null;
    productSnapshotData?: Record<string, any> | null;
    vendasAccess?: VendasAccessContext | null;
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
    // Score de oportunidade herdado do Radar (snapshot pro card do Vendas — B2 PR13062026008).
    const opportunityScore = input.opportunityScore == null || !Number.isFinite(Number(input.opportunityScore))
      ? null
      : Math.max(0, Math.min(100, Math.trunc(Number(input.opportunityScore))));
    const shortNote = this.normalizeText(input.shortNote);
    const nextAction = this.normalizeText(input.nextAction) || 'Primeiro contato';
    const status = this.normalizeStatus(input.status);
    const returnAt = input.returnAt || new Date();
    // ARQ11 S2 — temperatura no MESMO write, mas só quando a coluna existe (senão fallback silencioso).
    const leadTemperature = this.normalizeText(input.leadTemperature);
    const temperatureColumnAvailable = leadTemperature ? await this.hasVendasLeadTemperatureColumn() : false;
    // ARQ11 S2 — metadata de campanha (Meta Lead Ads) serializada p/ o resultLabel do evento de origem.
    const campaignMetadataLabel = this.buildCampaignMetadataLabel(input.campaignMetadata);
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
      ...(temperatureColumnAvailable ? { leadTemperature } : {}),
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
      opportunityScore,
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
      assignedUserId: input.assignedUserId || null,
      assignedByUserId: input.assignedByUserId || null,
      assignedAt: input.assignedAt || (input.assignedUserId ? new Date() : null),
      commissionPercentSnapshot: Math.max(0, Math.min(100, Number(input.commissionPercentSnapshot || 0) || 0)),
      ...(input.productSnapshotData || {}),
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
          // ARQ11 S2 — lead de anúncio PROMOVE a origem principal (o antigo stampAdvertisingOrigin
          // carimbava 'anuncio' sempre, inclusive na dedup); os demais canais preservam a origem original.
          primarySource:
            input.sourceType === 'anuncio'
              ? 'anuncio'
              : existing.primarySource || existing.sourceType || input.sourceType,
          ...(temperatureColumnAvailable ? { leadTemperature } : {}),
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
          ...(input.assignedUserId
            ? {
                assignedUserId: input.assignedUserId,
                assignedByUserId: input.assignedByUserId || existing.assignedByUserId || null,
                assignedAt: input.assignedAt || existing.assignedAt || new Date(),
                commissionPercentSnapshot: Math.max(0, Math.min(100, Number(input.commissionPercentSnapshot || 0) || 0)),
              }
            : {}),
          ...(input.productSnapshotData || {}),
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
          lead: this.buildLeadPayload(updated, undefined, undefined, undefined, input.vendasAccess),
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
              // ARQ11 S2 — metadata de campanha (campaignName/formId/adId) em JSON compacto,
              // sem coluna nova; relatório "qual campanha converte" lê deste evento.
              resultLabel: campaignMetadataLabel,
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
      lead: this.buildLeadPayload(created, undefined, undefined, undefined, input.vendasAccess),
    };
  }

  // Intake de lead vindo de anúncio (Meta Lead Ads / formulário de site). Reusa o caminho
  // oficial de criação/dedup do CRM (normaliza telefone, deduplica, cria perfil e timeline)
  // já com a ORIGEM canônica 'anuncio' + temperatura 'quente' num ÚNICO write (ARQ11 S2 —
  // o antigo stampAdvertisingOrigin fazia um 2º write de correção, aposentado). O provedor
  // concreto (meta_lead_ads/website_form) e a campanha viram metadata da timeline. Pós-criação:
  // espelha na agenda/inbox do responsável e dispara a notificação best-effort (speed-to-lead).
  async intakeAdvertisingLead(input: {
    companyId: number;
    assignedUserId: number;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    shortNote?: string | null;
    source?: string;
    temperature?: string;
    opportunityScore?: number | null;
    // ARQ11 S2 — metadata estruturada de campanha (sai do shortNote improvisado do worker).
    campaign?: { campaignName?: string | null; formId?: string | null; adId?: string | null } | null;
  }): Promise<{ leadId: string; action: string; reusedExisting: boolean }> {
    const source = String(input.source || 'meta_lead_ads').trim() || 'meta_lead_ads';
    const temperature = String(input.temperature || 'quente').trim() || 'quente';
    const assignedUserId = Number(input.assignedUserId || 0) || 0;

    const result: any = await this.createOrUpdateLead({
      companyId: input.companyId,
      userId: assignedUserId,
      // Origem REAL de anúncio num write só (não é mais 'manual' + carimbo posterior).
      sourceType: 'anuncio',
      leadTemperature: temperature,
      campaignMetadata: input.campaign ?? null,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      segment: input.segment ?? null,
      shortNote: input.shortNote ?? null,
      status: 'novo',
      nextAction: 'Atender lead de anúncio',
      assignedUserId: assignedUserId || null,
      assignedByUserId: assignedUserId || null,
      opportunityScore: input.opportunityScore ?? 80,
    });

    const leadId = String(result?.lead?.id || '');

    // Narrativa "veio de anúncio" na timeline (best-effort). NÃO corrige origem/temperatura
    // do card — essas já entraram no write acima; aqui é só um evento de história.
    if (leadId) {
      await this.prisma.vendasLeadTimelineEvent
        .create({
          data: {
            leadId,
            ...this.buildTimelineEvent({
              eventType: 'ad_lead_intake',
              title: 'Lead veio de anúncio',
              description: `Lead capturado por anúncio (${source}). Entrou quente para atendimento imediato.`,
              sourceType: 'anuncio',
              createdByUserId: assignedUserId || undefined,
            }),
          },
        })
        .catch(() => null);

      // Pós-criação (speed-to-lead): espelha o card na agenda/inbox viva do responsável —
      // MESMO mecanismo que o card manual usa (createManualLeadForUser) — e notifica.
      await this.syncLeadToInboxAgenda(input.companyId, result.lead, undefined, { forceScheduled: true }).catch(
        () => null,
      );
      await this.notifyAdvertisingLeadOwner(input.companyId, assignedUserId, result.lead).catch(() => null);
    }

    return {
      leadId,
      action: String(result?.action || 'created'),
      reusedExisting: Boolean(result?.reusedExisting),
    };
  }

  // ARQ11 S2 — notificação ao responsável pelo lead de anúncio. Reusa o caminho de ENVIO já
  // existente (WebwhatsBridgeService.sendText, que exige sessão conectada da própria empresa),
  // atrás de flag DEFAULT OFF. GUARDRAIL Webwhats: NÃO toca conexão/sessão/reconexão/socket —
  // só consulta se já há sessão operacional e, se sim, prepara o envio. Falha aqui nunca impede
  // a criação do lead (chamador usa .catch).
  private async notifyAdvertisingLeadOwner(companyId: number, assignedUserId: number, lead: any): Promise<void> {
    const enabled = ['true', '1', 'yes', 'on'].includes(
      String(process.env.HBX_AD_LEAD_NOTIFY_ENABLED || '').trim().toLowerCase(),
    );
    if (!enabled) return;
    if (!this.webwhatsBridge) return;

    try {
      const hasSession = await this.webwhatsBridge.hasOperationalSession(companyId, { userId: assignedUserId });
      if (!hasSession) return;
      const name = this.normalizeText(lead?.name) || 'lead';
      const phone = this.normalizeText(lead?.phone) || 's/ telefone';
      // Alvo de auto-notificação (número do próprio vendedor) ainda não é canônico no repo —
      // por ora registra que notificaria; plugar destino quando o "self-notify" existir. NÃO
      // dispara envio cru sem alvo definido.
      this.logger.log(
        `[ad-lead] notificacao pronta (flag ON, sessao ativa) company=${companyId} responsavel=${assignedUserId} lead="${name}" ${phone}`,
      );
    } catch (error: any) {
      this.logger.warn(`[ad-lead] notificacao best-effort falhou: ${String(error?.message || error)}`);
    }
  }

  async previewWebscrapingImportForUser(user: any, dto: ImportWebscrapingLeadsDto) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanReadVendasCards(context);
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
        return this.buildImportPreviewPayload(row, phoneDigits, sharedProfile, {
          exposeCrmDetails: !row || this.canExposeImportPreviewDetails(context, row),
          accessContext: context.access,
        });
      }),
    };
  }

  async getLeadCardForUser(user: any, leadIdRaw: string) {
    const leadId = this.normalizeText(leadIdRaw);
    if (!leadId) throw new BadRequestException('Lead nao informado.');

    const board = await this.getBoardForUser(user);
    const blocks = board?.blocks || {};
    const lead = ['today', 'overdue', 'scheduled', 'closed']
      .flatMap((key) => Array.isArray(blocks[key]) ? blocks[key] : [])
      .find((item: any) => String(item?.id || '') === leadId);
    if (!lead) throw new NotFoundException('Lead nao encontrado.');
    return { lead };
  }

  async getBoardForUser(user: any, sellerIdRaw?: string | number | null) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanReadVendasCards(context);
    const sellsHbxPlans = await this.resolveSellsHbxPlans(context.companyId);
    const usage = await this.commercialUsageLimits.getUsageSnapshot(context.companyId, context.userId);
    // Filtro de vendedor (admin/gerente apenas): a barra de Vendas ganha um seletor
    // "Todas as equipes ▾" que estreita o funil ao card de UM vendedor — incluindo o
    // próprio admin quando ele também prospecta. Vendedor comum nunca recebe `team`
    // (canManageTeam=false) → seletor SOME no front. Fonte da verdade = backend.
    const team = await this.buildVendasTeamFilter(context, sellerIdRaw);
    const leadWithTimelineSelectWithoutAddress: any = this.buildVendasLeadSelectWithoutAddress({
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      },
    });
    let rows: any[] = [];
    const boardWhere = this.buildLeadAccessWhere(
      context,
      team?.selectedSellerId ? { assignedUserId: team.selectedSellerId } : {},
    );
    try {
      rows = await this.prisma.vendasLead.findMany({
        where: boardWhere,
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
        where: boardWhere,
        orderBy: [{ returnAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 240,
        select: leadWithTimelineSelectWithoutAddress,
      });
    }
    rows = await this.attachLeadOwners(rows, context.companyId);
    rows = await this.hydrateRowsWithRadarPoolEnrichment(rows);
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
    const cockpitStates = leadIds.length
      ? await this.cockpitProjector.getCockpitStatesForLeads(context.companyId, leadIds)
      : new Map<string, any>();
    // Fase 3: projeção canônica da única automação comercial ativa por lead.
    // O catch mantém o board disponível durante rollout em que o código chega
    // antes da migration; nenhum runner usa essa projeção para decidir envios.
    const activeEnrollments = leadIds.length && typeof (this.prisma as any).automationEnrollment?.findMany === 'function'
      ? await this.prisma.automationEnrollment.findMany({
          where: {
            companyId: context.companyId,
            leadId: { in: leadIds },
            activeCommercialSlot: 'commercial',
            status: { in: ['active', 'paused'] },
          },
          select: {
            id: true,
            leadId: true,
            definitionKind: true,
            definitionId: true,
            status: true,
            currentStep: true,
            nextStepAt: true,
          },
        }).catch(() => [])
      : [];
    const activeEnrollmentByLeadId = new Map(
      activeEnrollments.map((enrollment) => [String(enrollment.leadId), enrollment]),
    );

    const [assistantConfig, assistantCompany] = await Promise.all([
      typeof (this.prisma as any).assistenteConfig?.findUnique === 'function'
        ? this.prisma.assistenteConfig.findUnique({
            where: { companyId: context.companyId },
            select: { nome: true, published: true, updatedAt: true },
          }).catch(() => null)
        : Promise.resolve(null),
      this.prisma.company.findUnique({
        where: { id: context.companyId },
        select: { botArmedAt: true },
      }).catch(() => null),
    ]);
    // S20 (MOTOR-ÚNICO): HBX_AUTOMATION_IA_LIVE, fallback pra
    // HBX_ASSISTENTE_PUBLISH_ENABLED (automation/automation-flags.ts).
    const assistantRuntimeEnabled = automationFlag('HBX_AUTOMATION_IA_LIVE', 'HBX_ASSISTENTE_PUBLISH_ENABLED');
    const assistant = {
      configured: Boolean(assistantConfig),
      publicName: assistantConfig?.nome ? String(assistantConfig.nome) : null,
      published: Boolean(assistantConfig?.published),
      runtimeEnabled: assistantRuntimeEnabled,
      channelArmed: Boolean(assistantCompany?.botArmedAt),
      active: Boolean(assistantRuntimeEnabled && assistantConfig?.published && assistantCompany?.botArmedAt),
      updatedAt: assistantConfig?.updatedAt instanceof Date ? assistantConfig.updatedAt.toISOString() : null,
    };

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
        context.access,
        cockpitStates.get(String(row.id)) || null,
        activeEnrollmentByLeadId.get(String(row.id)) || null,
      );
      blocks[payload.block].push(payload);
    }

    // Capacidade da carteira → faixa "por que o Radar parou de buscar" na UI.
    // O Radar pausa o reabastecimento quando a carteira do vendedor enche (teto
    // de cards ativos). Aqui entregamos os números reais pro medidor visual.
    const cardCapacity = await this.commercialUsageLimits
      .getSellerCardCapacitySnapshot(context.companyId, context.userId)
      .catch(() => null);
    const activeFunnel = blocks.today.length + blocks.overdue.length + blocks.scheduled.length;
    const capacity = Math.max(1, Math.trunc(Number(cardCapacity?.capacity || 20) || 20));
    const activeCards = cardCapacity?.isSeller
      ? Math.max(0, Math.trunc(Number(cardCapacity?.activeCards || 0) || 0))
      : activeFunnel;
    const availableSlots = cardCapacity?.isSeller
      ? Math.max(0, Math.trunc(Number(cardCapacity?.availableSlots || 0) || 0))
      : Math.max(0, capacity - activeFunnel);
    const full = cardCapacity?.isSeller ? Boolean(cardCapacity?.full) : activeFunnel >= capacity;
    const radarSupply = {
      isSeller: Boolean(cardCapacity?.isSeller),
      // unlimited = carteira sem teto (lei do dono 27/06). A UI mostra "à vontade"
      // em vez de "x / 999999". `full` já vem false do snapshot quando ilimitado e
      // não-pausado (e true quando pausado) — não sobrescrever aqui.
      unlimited: Boolean(cardCapacity?.unlimited),
      activeCards,
      capacity,
      availableSlots,
      full,
      paused: Boolean(cardCapacity?.paused),
      code: cardCapacity?.code ?? null,
    };

    return {
      summary: {
        total: rows.length,
        today: blocks.today.length,
        overdue: blocks.overdue.length,
        scheduled: blocks.scheduled.length,
        closed: blocks.closed.length,
      },
      sellsHbxPlans,
      // LEI DO VENDEDOR (docs/Rules/PAGAMENTOS.md): valores R$ (soma por coluna do
      // kanban + valor no card) só aparecem para quem pode ver preço. Vendedor
      // comum (products.viewPrice=false) vê o funil em CONTAGEM, nunca em dinheiro.
      canViewValues: Boolean(context.access?.canViewProductPrice),
      usage,
      radarSupply,
      team,
      assistant,
      blocks,
    };
  }

  // Lista de vendedores selecionáveis no seletor de equipe do funil + qual está
  // ativo. Só existe para quem gerencia a equipe (admin/gerente); vendedor comum
  // recebe `null` e o front nem renderiza o botão. Inclui o próprio admin (isMe),
  // que pode prospectar e ter carteira. `selectedSellerId` valida o id pedido
  // contra a lista — id inválido/estranho cai em "Todas as equipes" (null).
  private async buildVendasTeamFilter(
    context: VendasUserContext,
    sellerIdRaw?: string | number | null,
  ): Promise<{ sellers: Array<{ id: number; name: string; active: boolean; isMe: boolean }>; selectedSellerId: number | null } | null> {
    if (!context.canManageTeam) return null;
    const members = await this.prisma.user.findMany({
      where: {
        companyId: context.companyId,
        OR: [
          { id: context.userId },
          { role: 'USER', isActive: true, deactivatedAt: null, isSystemMaster: false },
        ],
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      take: 200,
      select: { id: true, name: true, email: true, isActive: true },
    });
    const sellers = members.map((m: any) => ({
      id: Number(m.id),
      name: String(m.name || m.email || 'Sem nome'),
      active: Boolean(m.isActive),
      isMe: Number(m.id) === context.userId,
    }));
    // "Eu" primeiro; demais por nome (a query já ordena por nome).
    sellers.sort((a, b) => (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1));
    const validIds = new Set(sellers.map((s) => s.id));
    const requestedSellerId = Math.trunc(Number(sellerIdRaw || 0)) || null;
    const selectedSellerId = requestedSellerId && validIds.has(requestedSellerId) ? requestedSellerId : null;
    return { sellers, selectedSellerId };
  }

  async getLeadConversationSnapshotForUser(user: any, leadId: string, eventId?: string | null) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanReadVendasCards(context);
    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new BadRequestException('Lead invalido.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      include: {
        timelineEvents: {
          orderBy: [{ createdAt: 'desc' }],
          take: 50,
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead nao encontrado.');

    const events = Array.isArray((lead as any).timelineEvents) ? (lead as any).timelineEvents : [];
    const requestedEvent = eventId
      ? events.find((event: any) => String(event?.id || '') === String(eventId))
      : null;
    const event =
      requestedEvent ||
      events.find((item: any) => this.extractLeadClosureConversationReference(item?.description));
    if (!event) throw new NotFoundException('Evento de conversa nao encontrado para este lead.');

    const reference = this.extractLeadClosureConversationReference(event.description);
    if (!reference?.conversationId) throw new NotFoundException('Evento sem conversa vinculada.');

    const conversation = await this.prisma.companyConversation.findFirst({
      where: { id: reference.conversationId, companyId: context.companyId },
      select: {
        id: true,
        contact: true,
        channel: true,
        currentFlow: true,
        currentStep: true,
        flowResult: true,
        lastMessageAt: true,
        updatedAt: true,
      },
    });
    if (!conversation) throw new NotFoundException('Conversa nao encontrada nesta empresa.');

    const anchor = reference.anchorMessageId
      ? await this.prisma.companyMessage.findFirst({
          where: { id: reference.anchorMessageId, companyId: context.companyId, conversationId: conversation.id },
          select: { id: true, timestamp: true },
        })
      : null;
    const messageSelect = {
      id: true,
      direction: true,
      senderType: true,
      body: true,
      messageType: true,
      sourceModule: true,
      timestamp: true,
      status: true,
    } as const;
    const messageRows = anchor?.timestamp
      ? [
          ...(await this.prisma.companyMessage.findMany({
            where: { companyId: context.companyId, conversationId: conversation.id, timestamp: { lte: anchor.timestamp } },
            select: messageSelect,
            orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
            take: 24,
          })).reverse(),
          ...(await this.prisma.companyMessage.findMany({
            where: { companyId: context.companyId, conversationId: conversation.id, timestamp: { gt: anchor.timestamp } },
            select: messageSelect,
            orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
            take: 24,
          })),
        ]
      : await this.prisma.companyMessage.findMany({
          where: { companyId: context.companyId, conversationId: conversation.id },
          select: messageSelect,
          orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
          take: 80,
        });

    return {
      leadId: String((lead as any).id),
      event: {
        id: String(event.id),
        title: String(event.title || 'Resposta negativa'),
        resultLabel: event.resultLabel || null,
        createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : null,
        closureReason: reference.closureReason,
        detectedText: reference.detectedText,
        sourceModule: reference.sourceModule,
        conversationId: reference.conversationId,
        anchorMessageId: reference.anchorMessageId,
        inboundMessageId: reference.inboundMessageId,
      },
      conversation: {
        id: String(conversation.id),
        contact: conversation.contact,
        channel: conversation.channel,
        currentFlow: conversation.currentFlow,
        currentStep: conversation.currentStep,
        flowResult: conversation.flowResult,
        lastMessageAt: conversation.lastMessageAt instanceof Date ? conversation.lastMessageAt.toISOString() : null,
        updatedAt: conversation.updatedAt instanceof Date ? conversation.updatedAt.toISOString() : null,
      },
      messages: messageRows.map((message: any) => ({
        id: String(message.id),
        direction: String(message.direction || ''),
        senderType: String(message.senderType || ''),
        body: String(message.body || ''),
        messageType: String(message.messageType || 'text'),
        sourceModule: message.sourceModule || null,
        status: message.status || null,
        timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : null,
        isAnchor: reference.anchorMessageId ? Number(message.id) === Number(reference.anchorMessageId) : false,
      })),
    };
  }

  async createManualLeadForUser(user: any, dto: CreateManualVendasLeadDto) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(context.access?.canCreateManualCards, 'Acesso para criar card manual bloqueado pela politica da equipe.');
    const owner = await this.resolveLeadOwnerForContext({
      ...context,
      canManageTeam: Boolean(context.access?.canViewCompanyCards && (context.access.isAdmin || context.access.isSystemMaster)),
    }, null);
    if (!this.normalizeText(dto?.name) && !this.normalizeText(dto?.phone) && !this.normalizeText(dto?.email)) {
      throw new BadRequestException('Informe ao menos nome, telefone ou e-mail para criar o lead.');
    }
    const existingManualLead = await this.findExistingCommercialContactForImport(
      context.companyId,
      {
        phone: dto?.phone || null,
        email: dto?.email || null,
        website: dto?.website || null,
        name: dto?.name || null,
      },
    );
    if (existingManualLead.action === 'block') {
      throw new BadRequestException(this.buildCommercialDuplicateMessage(existingManualLead));
    }
    if (!existingManualLead.exists) {
      await this.commercialUsageLimits.assertSellerActiveCardSlots(
        context.companyId,
        owner.assignedUserId || context.userId,
      );
    }
    const productPatch = this.hasDtoField(dto, 'productId')
      ? await this.resolveVendasProductPatch(context, dto.productId)
      : null;

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
      assignedUserId: owner.assignedUserId,
      assignedByUserId: owner.assignedByUserId,
      assignedAt: owner.assignedAt,
      commissionPercentSnapshot: owner.commissionPercentSnapshot,
      productSnapshotData: productPatch?.data || null,
      vendasAccess: context.access,
    });

    await this.syncLeadToInboxAgenda(context.companyId, result.lead);

    return {
      ok: true,
      ...result,
    };
  }

  /**
   * Fronteira HTTP de `/vendas/import/webscraping`.
   *
   * O DTO interno também é usado pelos fluxos confiáveis do Radar/automação, que podem chegar
   * aqui depois de reservar crédito ou calcular qualidade no servidor. A rota pública nunca pode
   * controlar esses sinais: força cobrança + validação, remove marcadores de billable/qualidade
   * e rejeita vínculo `radar:<id>` fabricado pelo cliente.
   */
  async importPublicWebscrapingLeadsForUser(user: any, dto: ImportWebscrapingLeadsDto) {
    const input = (dto || {}) as any;
    const leads = Array.isArray(input.leads) ? input.leads : [];
    const isRadarSource = (value: unknown) => /^radar:/i.test(String(value || '').trim());
    if (isRadarSource(input.sourceHistoryId) || leads.some((lead: any) => isRadarSource(lead?.sourceHistoryId))) {
      throw new BadRequestException('Vínculo com o Radar só pode ser criado pela rota oficial de aquisição.');
    }

    const stripServerQualitySignals = (value: unknown): unknown => {
      const wasJson = typeof value === 'string';
      let parsed = value;
      if (wasJson) {
        try {
          parsed = JSON.parse(String(value));
        } catch {
          return value;
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return value;
      const source = parsed as Record<string, any>;
      const {
        quality: _quality,
        qualityV2: _qualityV2,
        billable: _billable,
        debitEligible: _debitEligible,
        signals: rawSignals,
        ...safe
      } = source;
      if (rawSignals && typeof rawSignals === 'object' && !Array.isArray(rawSignals)) {
        const {
          quality: _signalQuality,
          qualityV2: _signalQualityV2,
          billable: _signalBillable,
          debitEligible: _signalDebitEligible,
          ...safeSignals
        } = rawSignals as Record<string, any>;
        safe.signals = safeSignals;
      } else if (rawSignals !== undefined) {
        safe.signals = rawSignals;
      }
      return wasJson ? JSON.stringify(safe) : safe;
    };

    const sanitizedLeads = leads.map((rawLead: any) => {
      const lead = rawLead && typeof rawLead === 'object' && !Array.isArray(rawLead) ? rawLead : {};
      const {
        billable: _billable,
        debitEligible: _debitEligible,
        quality: _quality,
        qualityV2: _qualityV2,
        signals: rawSignals,
        rawJson,
        enrichmentJson,
        ...safeLead
      } = lead;
      if (rawSignals !== undefined) safeLead.signals = stripServerQualitySignals(rawSignals);
      if (rawJson !== undefined) safeLead.rawJson = stripServerQualitySignals(rawJson);
      if (enrichmentJson !== undefined) safeLead.enrichmentJson = stripServerQualitySignals(enrichmentJson);
      return safeLead;
    });

    return this.importWebscrapingLeadsForUser(user, {
      ...(input.sourceHistoryId ? { sourceHistoryId: input.sourceHistoryId } : {}),
      ...(input.assignedUserId ? { assignedUserId: input.assignedUserId } : {}),
      debitOnImport: true,
      skipWhatsappValidation: false,
      leads: sanitizedLeads,
    } as ImportWebscrapingLeadsDto);
  }

  /**
   * Entrada interna confiável. Radar e automações podem definir os sinais técnicos porque os
   * calcularam no servidor; controllers públicos não devem chamar este método diretamente.
   */
  async importWebscrapingLeadsForUser(user: any, dto: ImportWebscrapingLeadsDto) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanImportRadarToVendas(context);
    const salesProfilePayload = await this.getEffectiveSalesProfileForContext(context);
    const salesProfile = salesProfilePayload.effectiveProfile;
    const incomingLeads = Array.isArray(dto?.leads) ? dto.leads : [];
    const debitOnImport = Boolean((dto as any)?.debitOnImport);
    const requestedAssignedUserId = Math.trunc(Number((dto as any)?.assignedUserId || 0)) || null;
    if (requestedAssignedUserId && requestedAssignedUserId !== context.userId) {
      this.assertCanAssignVendasCard(context);
    }
    const importOwnerContext = {
      ...context,
      canManageTeam: Boolean(
        context.canManageTeam ||
        (
          requestedAssignedUserId &&
          requestedAssignedUserId !== context.userId &&
          context.access?.canTransferCards &&
          (context.access.isAdmin || context.access.isSystemMaster)
        ),
      ),
    };
    const owner = await this.resolveLeadOwnerForContext(importOwnerContext, (dto as any)?.assignedUserId || null);
    const requiredPolicyChannels = await this.getTeamPolicyRequiredImportChannels(owner.assignedUserId || context.userId);
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
    let skippedBySuppressionCount = 0;

    // S7 LEAD-CENTRICO (07-pool-raiz.md, item 1): ponto de ENTREGA — lead
    // suprimido/resfriando (marquinha global de outra empresa) é pulado ANTES
    // de virar card, com contador logado (visibilidade porta-a-porta). Uma
    // query em lote pra não abrir N queries por item importado.
    const { allowed: suppressionAllowedItems, suppressedCount: suppressionSkippedCount } =
      await this.contactSuppression.filterSuppressed(incomingLeads, (raw: any) => ({
        phone: raw?.phoneDigits || raw?.phone,
        email: raw?.email,
      }));
    skippedBySuppressionCount = suppressionSkippedCount;
    if (suppressionSkippedCount > 0) {
      this.logger.log(`[vendas-suppression] import: ${suppressionSkippedCount} lead(s) pulado(s) por marquinha global (company=${context.companyId}).`);
    }

    for (const item of suppressionAllowedItems) {
      const itemName = this.normalizeText(item?.name);
      const itemPhone = this.normalizeText(item?.phone);
      const itemPhoneDigits = this.normalizePhone(item?.phoneDigits || item?.phone);
      const itemContact = itemPhone || itemPhoneDigits;
      const missingPolicyChannels = this.getMissingTeamPolicyImportChannels(item, itemPhoneDigits, requiredPolicyChannels);
      if (missingPolicyChannels.length) {
        skippedByFilterCount += 1;
        skippedByContactabilityCount += 1;
        skippedWeakContactCount += 1;
        failedImports.push({
          name: itemName,
          phone: itemContact,
          error: `Lead sem canal obrigatorio pela politica do vendedor: ${missingPolicyChannels.join(', ')}. Descartados nao consomem limite.`,
        });
        continue;
      }
      if (!itemName || !this.hasActionableImportChannel(item, itemPhoneDigits)) {
        failedImports.push({
          name: itemName,
          phone: itemContact,
          error: 'Lead do Radar Digital sem nome ou canal publico acionavel.',
        });
        continue;
      }
      const explicitQuality = this.extractLeadQualityFromImportItem(item);
      const explicitQualityHardBlock = explicitQuality?.status
        ? ['invalid', 'duplicate'].includes(explicitQuality.status)
        : false;
      const blockedByExplicitQuality = explicitQualityHardBlock;
      if (blockedByExplicitQuality) {
        skippedByQualityCount += 1;
        skippedByFilterCount += 1;
        if (explicitQuality?.status === 'segment_mismatch') skippedBySegmentMismatchCount += 1;
        if (explicitQuality?.status === 'generic_directory') skippedGenericDirectoryCount += 1;
        if (explicitQuality?.status === 'weak_contact') skippedWeakContactCount += 1;
        if (explicitQuality?.status === 'invalid') skippedInvalidQualityCount += 1;
        failedImports.push({
          name: itemName,
          phone: itemContact,
          error: 'Lead descartado pela qualidade minima do segmento. Descartados nao consomem limite.',
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
      const visibilityV2 = resolveRadarVisibilityFromQualityV2({
        lead: item,
        quality: qualityV2,
        requestedSegment: item?.segment || null,
      });
      const blockedByQualityV2 = qualityV2 && (
        visibilityV2.hardBlocked
      );
      if (blockedByQualityV2) {
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
        if (
          qualityV2.discardReason === 'weak_contactability' ||
          qualityV2.discardReason === 'required_channel_missing' ||
          this.qualityV2FailedRequiredChannelRule(qualityV2) ||
          qualityV2.contactabilityScore < 30
        ) {
          skippedByContactabilityCount += 1;
          skippedWeakContactCount += 1;
        }
        if (qualityV2.discardReason === 'generic_directory') skippedGenericDirectoryCount += 1;
        if (qualityV2.discardReason === 'weak_identity') skippedInvalidQualityCount += 1;
        failedImports.push({
          name: itemName,
          phone: itemContact,
          error: [
            qualityV2.decision === 'protect' ? 'Lead protegido pelo LeadQualityV2.' : 'Lead descartado pelo LeadQualityV2.',
            qualityV2.protectionReason || qualityV2.discardReason || null,
            qualityV2.reasons?.[0] || null,
            'Descartados nao consomem limite.',
          ].filter(Boolean).join(' '),
        });
        continue;
      }
      const quality = qualityV2 ? null : explicitQuality;
      const qualityHardBlock = quality?.status
        ? ['invalid', 'duplicate'].includes(quality.status)
        : false;
      const blockedByQuality = !qualityV2 && qualityHardBlock;
      if (blockedByQuality) {
        skippedByQualityCount += 1;
        if (quality?.status === 'segment_mismatch') skippedBySegmentMismatchCount += 1;
        if (quality?.status === 'generic_directory') skippedGenericDirectoryCount += 1;
        if (quality?.status === 'weak_contact') skippedWeakContactCount += 1;
        if (quality?.status === 'invalid') skippedInvalidQualityCount += 1;
        failedImports.push({
          name: itemName,
          phone: itemContact,
          error: 'Lead descartado pela qualidade minima do segmento. Descartados nao consomem limite.',
        });
        continue;
      }
      const sourceHistoryId = this.normalizeText(item?.sourceHistoryId) || this.normalizeText(dto?.sourceHistoryId);
      const radarLeadId = this.extractRadarLeadId(sourceHistoryId);
      const itemDebitEligible = (item as any)?.debitEligible !== false
        && (item as any)?.billable !== false
        && explicitQuality?.billable !== false
        && visibilityV2.debitEligible !== false;
      const shouldDebitOnImport = debitOnImport && itemDebitEligible;

      let result: any;
      let duplicateInCompany = false;
      try {
        await this.assertRadarLeadImportAllowed(context, radarLeadId);
        const duplicateCheck = await this.findExistingCommercialContactForImport(
          context.companyId,
          {
            phone: itemContact,
            email: item?.email || null,
            sourceHistoryId,
            placeId: (item as any)?.placeId || null,
            website: item?.website || null,
            name: itemName,
            city: item?.city || null,
            state: item?.state || null,
          },
        );
        duplicateInCompany = duplicateCheck.exists;
        if (duplicateInCompany) skippedDuplicateCount += 1;
        if (duplicateCheck.action === 'block') {
          failedImports.push({
            name: itemName,
            phone: itemContact,
            error: this.buildCommercialDuplicateMessage(duplicateCheck),
          });
          continue;
        }
        if (!duplicateInCompany && shouldDebitOnImport) {
          await this.commercialUsageLimits.assertSellerActiveCardSlots(
            context.companyId,
            owner.assignedUserId || context.userId,
          );
          const usageSnapshot = await this.commercialUsageLimits.assertCanImportCard(context.companyId, context.userId);
          const companyRemaining = Number((usageSnapshot as any)?.cards?.remaining);
          const dailyRemaining = Number((usageSnapshot as any)?.cards?.dailyRemaining);
          const perUserLimit = (usageSnapshot as any)?.cards?.perUserLimit;
          const userRemaining =
            perUserLimit != null
              ? Number((usageSnapshot as any)?.cards?.userLimit || 0) - Number((usageSnapshot as any)?.cards?.userUsed || 0)
              : companyRemaining;
          // R5 (FASE 2 — REMOÇÃO, definitivo): cota count-based (mensal/diária por
          // plano) deixou de bloquear a reserva em lote — o teto real agora é o
          // saldo de crédito, checado no débito por-lead (enforceLeadDeliveryDebit,
          // dentro de commercialUsageLimits.recordCardImport mais abaixo no fluxo).
          // effectiveRemaining/pendingQuotaReservations seguem calculados só para
          // eventual telemetria futura; nunca mais lançam ConflictException aqui.
          void Math.min(
            ...[companyRemaining, dailyRemaining, userRemaining].filter((value) => Number.isFinite(value)),
          );
        }
        result = await this.createOrUpdateLead({
          companyId: context.companyId,
          userId: context.userId,
          sourceType: 'webscraping',
          sourceHistoryId,
          sourceSignature: [this.normalizeText(item?.segment), this.normalizeText(item?.city)].filter(Boolean).join('|') || null,
          name: itemName,
          phone: itemContact,
          email: item?.email || null,
          address: item?.address || null,
          website: item?.website || null,
          rating: item?.rating ?? null,
          reviews: item?.reviews ?? null,
          opportunityScore: Number((item as any)?.opportunityScore || 0) || null,
          city: item?.city || null,
          state: item?.state || null,
          segment: item?.segment || null,
          status: 'novo',
          nextAction: 'Primeiro contato',
          returnAt: new Date(),
          shortNote: this.normalizeText(item?.shortNote),
          assignedUserId: owner.assignedUserId,
          assignedByUserId: owner.assignedByUserId,
          assignedAt: owner.assignedAt,
          commissionPercentSnapshot: owner.commissionPercentSnapshot,
          vendasAccess: context.access,
        });
      } catch (error: any) {
        const errorText = String(error?.message || error || '');
        if (/protegido|negativo|bloque|opt-out|outra empresa/i.test(errorText)) skippedProtectedCount += 1;
        failedImports.push({
          name: this.normalizeText(item?.name),
          phone: this.normalizeText(itemContact),
          error: errorText || 'Falha ao importar lead.',
        });
        this.logger.warn(
          `[vendas-import] Lead ignorado por falha no import company=${context.companyId} phone=${this.normalizeText(itemContact) || '-'} error=${String(error?.message || error)}`,
        );
        continue;
      }

      const explicitRadarEnrichmentStatus = this.normalizeText((item as any)?.enrichmentStatus)?.toLowerCase() || '';
      const normalizedRadarEnrichmentStatus = explicitRadarEnrichmentStatus === 'pending' ? 'queued' : explicitRadarEnrichmentStatus;
      const completedRadarStatusFromPayload = ['completed', 'failed', 'processing', 'queued'].includes(normalizedRadarEnrichmentStatus)
        ? normalizedRadarEnrichmentStatus
        : null;
      const hasCompletedRadarEnrichmentPayload = Boolean(
        (item as any)?.enrichmentJson ||
        qualityV2 ||
        ['lead_plus', 'lead_plus_qualified'].includes(this.normalizeText((item as any)?.deliveryProduct)?.toLowerCase() || '') ||
        ['lead_plus_qualified', 'review_backup'].includes(this.normalizeText((item as any)?.visibilityTier)?.toLowerCase() || ''),
      );
      const radarEnrichmentStatus = completedRadarStatusFromPayload || (hasCompletedRadarEnrichmentPayload ? 'completed' : 'queued');

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
        placeId: this.normalizeText((item as any)?.placeId),
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
        enrichmentStatus: radarEnrichmentStatus,
        visibilityTier: this.normalizeText((item as any)?.visibilityTier),
        billable: (item as any)?.billable === true ? true : (item as any)?.billable === false ? false : null,
        debitEligible: (item as any)?.debitEligible === true ? true : (item as any)?.debitEligible === false ? false : null,
        deliveryProduct: this.normalizeText((item as any)?.deliveryProduct),
        qualityReason: this.normalizeText((item as any)?.qualityReason),
      };
      // Resumo HUMANO pra timeline / "Atividade recente" do Dashboard. ANTES a
      // description recebia JSON.stringify(metadata) cru e vazava o paredão na tela.
      // Os dados completos seguem no lead (score/canal/etc.) e no registro do Radar;
      // aqui fica só um texto legível com os sinais-chave.
      const radarEnrichmentResumo = [
        radarEnrichmentMetadata.opportunityScore ? `score ${radarEnrichmentMetadata.opportunityScore}` : null,
        radarEnrichmentMetadata.recommendedChannel ? `canal ${radarEnrichmentMetadata.recommendedChannel}` : null,
        radarEnrichmentMetadata.opportunityReason || null,
      ].filter(Boolean).join(' · ');
      if (Object.values(radarEnrichmentMetadata).some((value) => Boolean(value))) {
        await this.prisma.vendasLeadTimelineEvent.create({
          data: {
            leadId: result.lead?.id,
            ...this.buildTimelineEvent({
              eventType: 'radar_enrichment_imported',
              title: 'Inteligência do Radar preservada',
              description: radarEnrichmentResumo
                ? `Inteligência do Radar preservada: ${radarEnrichmentResumo}.`
                : 'Inteligência do Radar preservada.',
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
        billableCandidate: shouldDebitOnImport && result.action === 'created' && !duplicateInCompany,
        delivered: false,
        skipReason: null,
      });
      if (shouldDebitOnImport && result.action === 'created' && !duplicateInCompany) {
        pendingQuotaReservations += 1;
      }
      await this.syncRadarOwnershipAfterVendasImport(context, {
        radarLeadId,
        vendasLeadId: result.lead?.id || null,
        assignedUserId: owner.assignedUserId,
        assignedByUserId: owner.assignedByUserId,
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
        const usageResult = await this.commercialUsageLimits.recordCardCommercialUseOnce(context.companyId, context.userId, {
          source: 'vendas_import',
          eventType: 'vendas_card_imported',
          usageKey: entry.radarLeadId ? `radar:${entry.radarLeadId}` : `vendas:${entry.lead?.id || ''}`,
          radarLeadId: entry.radarLeadId,
          vendasLeadId: entry.lead?.id || null,
          status: 'created',
        });
        if (usageResult?.debited) quotaDebited += 1;
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
      // S7 LEAD-CENTRICO: quantos leads deste lote nem chegaram a ser
      // avaliados por já estarem suprimidos/resfriando pra QUALQUER empresa
      // (marquinha global) — contador logado separado do resto do funil de
      // qualidade, pra visibilidade porta-a-porta.
      skippedBySuppressionCount,
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

  /**
   * FINANCEIRO-UNIVERSAL (Fase 1) — Vendas vira DINHEIRO: gera uma conta-a-receber
   * (FinanceiroCharge sourceModule='vendas_fechamento') a partir do card, no MESMO
   * trilho que a logística já usa. A cobrança aparece no financeiro central
   * (/financeiro) e pode ser baixada por lá. NÃO toca MP, NÃO dispara WhatsApp.
   *
   * Idempotente por externalReference='vendas_fechamento:<leadId>' (campo já @unique
   * no schema — zero coluna nova): rechamar devolve a cobrança existente. Exige
   * saleValue>0 no card e um telefone (pra materializar o CustomerProfile, a mesma
   * "conta" que a logística linka). ADMIN-only (gate no controller — LEI DO VENDEDOR).
   */
  async gerarCobrancaFromLead(
    user: any,
    leadId: string,
    dto?: { dueDate?: string | null },
  ): Promise<{
    chargeId: string;
    amount: number;
    dueDate: string | null;
    customerProfileId: string;
    alreadyExists: boolean;
  }> {
    const context = await this.resolveVendasUserContext(user);
    // LEI DO VENDEDOR: gerar cobrança é lidar com dinheiro → só Admin/Master
    // (mesmo gate dos casos de cancelamento/comissão). Vendedor não gera cobrança.
    this.assertVendasPermission(context.canManageTeam, 'Apenas Admin/Master gera cobrança do card.');
    const existing = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: String(leadId || '').trim() }),
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        saleValue: true,
        customerProfileId: true,
        sourceType: true,
        shortNote: true,
      },
    });
    if (!existing) throw new NotFoundException('Lead comercial nao encontrado.');

    const amount = Math.round((Number(existing.saleValue) || 0) * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException('Defina o valor da venda no card antes de gerar a cobrança.');
    }

    const customerProfileId =
      existing.customerProfileId ||
      (await this.ensureCustomerProfile({
        companyId: context.companyId,
        name: existing.name,
        phone: existing.phone,
        email: existing.email,
        sourceType: existing.sourceType === 'webscraping' ? 'webscraping' : 'manual',
        shortNote: existing.shortNote,
      }));
    if (!customerProfileId) {
      throw new BadRequestException('Cadastre um telefone no card para gerar a cobrança.');
    }

    const externalReference = `vendas_fechamento:${existing.id}`;
    const prior = await this.prisma.financeiroCharge.findFirst({
      where: { externalReference, companyId: context.companyId },
      select: { id: true, amount: true, dueDate: true },
    });
    if (prior) {
      return {
        chargeId: prior.id,
        amount: prior.amount,
        dueDate: prior.dueDate ? prior.dueDate.toISOString() : null,
        customerProfileId,
        alreadyExists: true,
      };
    }

    const dueDate = dto?.dueDate ? this.parseDate(dto.dueDate) : null;
    const description = `Venda — ${this.normalizeText(existing.name) || 'cliente'}`;
    try {
      const charge = await this.prisma.financeiroCharge.create({
        data: {
          companyId: context.companyId,
          amount,
          currency: 'BRL',
          description,
          billingCycle: 'ONCE',
          paymentMethod: 'MANUAL',
          status: 'pending',
          lifecycle: 'in_progress',
          sourceModule: 'vendas_fechamento',
          customerProfileId,
          dueDate,
          externalReference,
          createdByUserId: Number(user?.id) || null,
        },
        select: { id: true },
      });
      await this.prisma.vendasLeadTimelineEvent
        .create({
          data: {
            leadId: existing.id,
            ...this.buildTimelineEvent({
              eventType: 'charge_created',
              title: 'Cobrança gerada',
              description: `Conta a receber de ${amount.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })} criada no financeiro.`,
              createdByUserId: Number(user?.id) || null,
            }),
          },
        })
        .catch(() => null);
      return {
        chargeId: charge.id,
        amount,
        dueDate: dueDate ? dueDate.toISOString() : null,
        customerProfileId,
        alreadyExists: false,
      };
    } catch (e: any) {
      // Corrida no externalReference @unique (P2002) → relê e devolve a existente.
      const raced = await this.prisma.financeiroCharge.findFirst({
        where: { externalReference, companyId: context.companyId },
        select: { id: true, amount: true, dueDate: true },
      });
      if (raced) {
        return {
          chargeId: raced.id,
          amount: raced.amount,
          dueDate: raced.dueDate ? raced.dueDate.toISOString() : null,
          customerProfileId,
          alreadyExists: true,
        };
      }
      throw e;
    }
  }

  async updateLeadForUser(user: any, leadId: string, dto: UpdateVendasLeadDto) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(context.access?.canEditCards, 'Acesso para editar card bloqueado pela politica da equipe.');
    const addressColumnAvailable = await this.hasVendasLeadAddressColumn();
    const leadWithTimelineSelectWithoutAddress: any = this.buildVendasLeadSelectWithoutAddress({
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      },
    });
    const existing = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: String(leadId || '').trim() }),
      ...(addressColumnAvailable ? {} : { select: this.buildVendasLeadSelectWithoutAddress() }),
    });

    if (!existing) {
      throw new NotFoundException('Lead comercial nao encontrado.');
    }

    const productPatch = this.hasDtoField(dto, 'productId')
      ? await this.resolveVendasProductPatch(context, dto.productId)
      : null;
    const commissionDto: UpdateVendasLeadDto = { ...(dto || {}) };
    if (productPatch?.product?.planKey && !this.hasDtoField(commissionDto, 'salePlanKey')) {
      commissionDto.salePlanKey = String(productPatch.product.planKey);
    }
    await this.assertProductSaleValuePolicy(
      context,
      { ...existing, ...(productPatch?.data || {}) },
      commissionDto,
      productPatch,
    );

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
    const existingAttemptCount = Math.max(0, Math.trunc(Number(existing.attemptCount || 0) || 0));
    const requestedAttemptCount = dto?.attemptCount == null
      ? null
      : Math.max(0, Math.trunc(Number(dto.attemptCount || 0) || 0));
    const explicitAttemptRegistered = requestedAttemptCount != null && requestedAttemptCount > existingAttemptCount;
    const shouldRegisterContact = explicitAttemptRegistered || (statusChanged && nextStatus !== 'novo');
    const nextAttemptCount = Math.max(
      requestedAttemptCount ?? existingAttemptCount,
      existingAttemptCount + (shouldRegisterContact && !explicitAttemptRegistered ? 1 : 0),
    );
    const nextLastContactAt = shouldRegisterContact ? new Date() : existing.lastContactAt;
    const nextLastResult = shouldRegisterContact ? this.formatStatusLabel(nextStatus) : existing.lastResult;
    const wasClosedBefore = Boolean(existing.wasClosedBefore) || Boolean(existing.closedAt) || String(existing.status || '') === 'encerrado' || nextStatus === 'encerrado';

    const timelineEvents: TimelineEventRecord[] = [];
    const existingReturnAt = existing.returnAt instanceof Date ? existing.returnAt : null;
    const returnChanged =
      (existingReturnAt?.getTime() || 0) !== (returnAt instanceof Date ? returnAt.getTime() : 0);

    if (statusChanged) {
      this.assertVendasPermission(context.access?.canChangeStatus, 'Acesso para alterar status bloqueado pela politica da equipe.');
    }
    if (statusChanged && nextStatus === 'encerrado') {
      this.assertVendasPermission(context.access?.canCloseCards, 'Acesso para encerrar card bloqueado pela politica da equipe.');
    }
    if (statusChanged && this.normalizeStatus(existing.status) === 'encerrado' && nextStatus !== 'encerrado') {
      this.assertVendasPermission(context.access?.canReopenCards, 'Acesso para reabrir card bloqueado pela politica da equipe.');
    }
    if (returnChanged) {
      this.assertVendasPermission(context.access?.canScheduleReturn, 'Acesso para agendar retorno bloqueado pela politica da equipe.');
    }
    if (dto?.saleStatus !== undefined) {
      this.assertCanMarkSaleStatus(context, this.normalizeSaleStatus(dto.saleStatus));
    }

    // S4 LEAD-CENTRICO (04-robozinho.md, item 5): encerrar exige motivo estruturado.
    // Só quando o PATCH de fato MUDA o status pra 'encerrado' (editar outro campo
    // de um card já encerrado não reabre a pergunta). Reabrir (sai de 'encerrado')
    // limpa o motivo antigo — se fechar de novo, precisa de motivo novo.
    let closureReason: string | null = (existing as any).closureReason ?? null;
    if (statusChanged && nextStatus === 'encerrado') {
      const requestedReason = this.normalizeText((dto as any)?.closureReason);
      if (!requestedReason || !(VENDAS_CLOSURE_REASONS as readonly string[]).includes(requestedReason)) {
        throw new BadRequestException('Informe o motivo do encerramento.');
      }
      closureReason = requestedReason;
    } else if (statusChanged && nextStatus !== 'encerrado') {
      closureReason = null;
    }

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
      const retornoMode = dto?.retornoMode && dto.retornoMode !== 'manual' ? dto.retornoMode : null;
      const retornoModeLabel: Record<string, string> = {
        auto_email: 'e-mail automático',
        auto_whatsapp: 'WhatsApp automático',
        auto_both: 'e-mail e WhatsApp automáticos',
      };
      const modeDesc = retornoMode ? ` (${retornoModeLabel[retornoMode] || retornoMode})` : '';
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'return_scheduled',
          title: 'Retorno agendado',
          description: nextAction
            ? `Retorno reposicionado com a acao "${nextAction}"${modeDesc}.`
            : `A agenda deste lead recebeu um novo retorno${modeDesc}.`,
          returnAt,
          createdByUserId: context.userId,
        }),
      );
    }

    if (productPatch) {
      const nextProductId = this.normalizePositiveInteger(productPatch.data.productId);
      const previousProductId = this.normalizePositiveInteger(existing.productId);
      if (nextProductId && nextProductId !== previousProductId) {
        timelineEvents.push(
          this.buildTimelineEvent({
            eventType: 'product_selected',
            title: 'Produto vinculado',
            description: `Produto comercial vinculado ao card: ${String(productPatch.data.productNameSnapshot || 'produto selecionado')}.`,
            sourceType: 'products',
            resultLabel: productPatch.data.productPlanKeySnapshot || null,
            createdByUserId: context.userId,
          }),
        );
      } else if (!nextProductId && previousProductId) {
        timelineEvents.push(
          this.buildTimelineEvent({
            eventType: 'product_removed',
            title: 'Produto removido',
            description: 'O vinculo de produto comercial foi removido do card.',
            sourceType: 'products',
            createdByUserId: context.userId,
          }),
        );
      }
    }

    if (nextStatus === 'encerrado' && this.normalizeStatus(existing.status) !== 'encerrado') {
      const closureReasonLabel = this.formatClosureReasonLabel(closureReason);
      timelineEvents.push(
        this.buildTimelineEvent({
          eventType: 'lead_closed',
          title: 'Lead encerrado',
          description: shortNote
            ? `Encerramento (${closureReasonLabel}) registrado com observacao: "${shortNote}".`
            : `Encerramento (${closureReasonLabel}) — o lead saiu da agenda ativa e foi movido para encerrados.`,
          statusTo: nextStatus,
          resultLabel: closureReason,
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
      closureReason,
      ...(productPatch?.data || {}),
    };
    const saleCommissionPatch = await this.buildSaleCommissionPatch(
      { ...existing, ...(productPatch?.data || {}) },
      commissionDto,
      context.userId,
    );
    Object.assign(updateData, saleCommissionPatch.data);
    if (saleCommissionPatch.event) {
      timelineEvents.push(saleCommissionPatch.event);
    }

    const shouldDebitCommercialUse =
      shouldRegisterContact
      && existingAttemptCount === 0
      && String(existing.sourceType || '').trim().toLowerCase() === 'webscraping';
    let commercialUseDebit: { debited: boolean; alreadyDebited: boolean } | null = null;
    if (shouldDebitCommercialUse) {
      const radarLeadId = this.extractRadarLeadId(existing.sourceHistoryId);
      commercialUseDebit = await this.commercialUsageLimits.recordCardCommercialUseOnce(context.companyId, context.userId, {
        source: 'vendas_contact_attempt',
        usageKey: radarLeadId ? `radar:${radarLeadId}` : `vendas:${existing.id}`,
        radarLeadId,
        vendasLeadId: existing.id,
        status: 'contact_attempt',
      });
      if (commercialUseDebit?.debited) {
        timelineEvents.push(
          this.buildTimelineEvent({
            eventType: 'card_usage_debited',
            title: 'Uso comercial debitado',
            description: 'O card consumiu limite no primeiro contato comercial.',
            createdByUserId: context.userId,
          }),
        );
      }
    }

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

    // S4 LEAD-CENTRICO (04-robozinho.md, item 3 "paradas globais"): humano
    // assumiu (qualificado) ou fechou (encerrado) -> pausa qualquer cadência
    // ativa deste lead. Best-effort: nunca derruba a mudança de status que já
    // foi persistida — o pior caso é uma cadência que continua ligada até o
    // próximo passo dela mesma bater no `canCadenciaRun` (fail-closed lá).
    if (statusChanged && (nextStatus === 'qualificado' || nextStatus === 'encerrado')) {
      await this.commercialContactControl
        .pauseCommercialAutomationForLead({
          companyId: context.companyId,
          leadId: existing.id,
          reason: `lead_status_${nextStatus}`,
        })
        .catch((error: any) => {
          this.logger.warn(`[vendas-robo] falha ao pausar automacao lead=${existing.id}: ${String(error?.message || error)}`);
        });
    }

    const previousSaleStatus = this.normalizeSaleStatus(existing.saleStatus);
    const updatedSaleStatus = this.normalizeSaleStatus(updated.saleStatus);
    const closedNow = statusChanged && nextStatus === 'encerrado';
    // S7 LEAD-CENTRICO (07-pool-raiz.md, item 1 "marquinha/supressão"): lead
    // que ACABOU de fechar com motivo estruturado grava a marca global do
    // contato (janela por motivo; 'convertido'/'outro' não marcam — filtro
    // fica dentro do service). Best-effort: nunca derruba o encerramento que
    // já foi persistido.
    if (closedNow) {
      await this.applyContactSuppressionOnLeadClosed(context.companyId, updated).catch((error: any) => {
        this.logger.warn(`[vendas-suppression] falha ao marcar contato lead=${existing.id}: ${String(error?.message || error)}`);
      });
    }
    const saleConfirmedNow = updatedSaleStatus === 'sale_confirmed' && previousSaleStatus !== 'sale_confirmed';
    if (nextStatus === 'encerrado' || updatedSaleStatus === 'sale_confirmed') {
      await this.ensureCadastroFromVendasCard(context.companyId, updated, {
        saleActive: this.isAutomaticSaleStatus(updatedSaleStatus),
        announceOnTimeline: closedNow || saleConfirmedNow,
        userId: context.userId,
      });
    }
    // 048-2D: re-treino ICP — grava no radarLead que este lead fechou (aditivo, nunca bloqueia)
    if (saleConfirmedNow) {
      const radarLeadIdForIcp = this.extractRadarLeadId((updated as any).sourceHistoryId);
      if (radarLeadIdForIcp) {
        this.prisma.radarLeadPool.update({
          where: { id: radarLeadIdForIcp },
          data: { metadataJson: (() => {
            try {
              const m = JSON.parse((updated as any).metadataJson || '{}');
              m.icpWonAt = new Date().toISOString();
              return JSON.stringify(m);
            } catch { return (updated as any).metadataJson || null; }
          })() },
        }).catch(() => {/* aditivo */});
      }
    }

    await this.hydrateRowsWithRadarPoolEnrichment([updated]);
    return {
      ok: true,
      lead: this.buildLeadPayload(updated, undefined, undefined, undefined, context.access),
    };
  }

  async createHbxSalesHandoffForUser(user: any, leadId: string, dto: CreateHbxSalesHandoffDto) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanRunHbxActivationAction(context);
    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new BadRequestException('Lead comercial invalido.');

    const addressColumnAvailable = await this.hasVendasLeadAddressColumn();
    const leadWithTimelineSelectWithoutAddress: any = this.buildVendasLeadSelectWithoutAddress({
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      },
    });
    const existing = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      ...(addressColumnAvailable ? {} : { select: this.buildVendasLeadSelectWithoutAddress() }),
    });
    if (!existing) throw new NotFoundException('Lead comercial nao encontrado.');

    const productPatch = this.hasDtoField(dto, 'productId')
      ? await this.resolveVendasProductPatch(context, dto.productId)
      : null;
    // salePlanKey só vale para o HBX admin (tenant sellsHbxPlans). Cliente comum:
    // ignora o que vier no DTO e cai no plano do produto/card (comportamento legado).
    const sellsHbxPlans = await this.resolveSellsHbxPlans(context.companyId);
    const requestedPlanKey = sellsHbxPlans ? this.normalizeText(dto?.salePlanKey) : null;
    const planKey = normalizeCommercialPlanKey(requestedPlanKey || productPatch?.product?.planKey || existing.salePlanKey || COMMERCIAL_PLAN_KEYS.PADRAO);
    const planLabel = productPatch?.product?.name ? String(productPatch.product.name) : this.commercialPlanLabel(planKey);
    const productPriceCents = this.normalizePriceCentsFromProduct(productPatch?.product);
    const planAmount = productPriceCents
      ? this.normalizeCurrencyAmount(productPriceCents / 100)
      : this.normalizeCurrencyAmount(getCommercialPlanMonthlyPrice(planKey));
    // Valor REAL combinado no fechamento tem prioridade sobre o preco de tabela —
    // "a comissao e calculada sobre o valor real" (copy do proprio fechamento).
    const explicitSaleValue = this.hasDtoField(dto, 'saleValue')
      ? this.normalizeCurrencyAmount(dto.saleValue)
      : 0;
    const baseSaleValue = explicitSaleValue > 0 ? explicitSaleValue : planAmount;
    const explicitSetupValue = this.hasDtoField(dto, 'setupValue')
      ? this.normalizeCurrencyAmount(dto.setupValue)
      : this.normalizeCurrencyAmount(existing.setupValue);

    // Pre-cadastro confirmado no fechamento preenche GAPS do lead (nunca sobrescreve
    // valor existente) — vira a base do prefill do checkout (PLAN-VENDA-PRONTA-A).
    // CPF (CustomerProfile.document) entra na convergencia do modal (PLAN-...-B).
    const contactGapPatch: Record<string, unknown> = {};
    const dtoName = this.normalizeText((dto as any)?.name);
    if (dtoName && !this.normalizeText(existing.name)) contactGapPatch.name = dtoName;
    const dtoEmail = this.normalizeText((dto as any)?.email);
    if (dtoEmail && !this.normalizeText(existing.email)) contactGapPatch.email = dtoEmail;
    const dtoPhone = this.normalizeText((dto as any)?.phone);
    if (dtoPhone && !this.normalizeText(existing.phone)) {
      contactGapPatch.phone = dtoPhone;
      const dtoPhoneNorm = this.normalizePhone(dtoPhone);
      if (dtoPhoneNorm && !existing.phoneNormalized) contactGapPatch.phoneNormalized = dtoPhoneNorm;
    }

    // DONO da comissao: card sem vendedor amarra a quem fecha (quem prospectou MANTEM
    // o seu — nunca rouba carteira). Snapshot do % trava o ganho no fechamento.
    const closerAssignment = await this.resolveCloserAssignmentPatch(context, existing);
    const mergedRowForCommission = { ...existing, ...(productPatch?.data || {}), ...closerAssignment };

    // Link de contratacao com TOKEN ASSINADO (nao o leadId cru): expira em 72h e
    // libera o CPF no prefill publico. Link antigo (leadId cru) ainda resolve, sem CPF.
    const handoffToken = this.signHandoffToken(existing.id);
    const registerPath = `/register?plan=${encodeURIComponent(planKey)}&hbxLead=${encodeURIComponent(handoffToken)}`;
    const publicOrigin = this.normalizePublicOrigin(dto?.origin);
    const registerUrl = publicOrigin ? `${publicOrigin}${registerPath}` : registerPath;
    const leadName = this.normalizeText(existing.name) || 'cliente';
    const message = [
      `Segue o link para ativar seu ${planLabel}:`,
      registerUrl,
      '',
      `Depois do cadastro, eu acompanho a implantacao do ${leadName} pelo HBX.`,
    ].join('\n');

    const saleCommissionPatch = await this.buildSaleCommissionPatch(mergedRowForCommission, {
      saleStatus: 'activation_pending',
      salePlanKey: planKey,
      saleValue: baseSaleValue,
      setupValue: explicitSetupValue,
      commissionNote: `Link de contratacao gerado para ${planLabel}.`,
    }, context.userId, { allowAutomaticSaleStatus: true });

    // Preview da comissao para o passo-a-passo do vendedor (o quanto ele ganha quando
    // o cliente ativar). Espelha exatamente a engine: produto > snapshot > % do dono.
    const commissionPreview = await this.buildHandoffCommissionPreview(mergedRowForCommission, {
      companyId: context.companyId,
      planLabel,
      planKey,
      monthlyBase: baseSaleValue,
      setupValue: explicitSetupValue,
    });

    const timelineEvents: TimelineEventRecord[] = [];
    if (saleCommissionPatch.event) timelineEvents.push(saleCommissionPatch.event);
    timelineEvents.push(
      this.buildTimelineEvent({
        eventType: 'hbx_signup_link_created',
        title: 'Link HBX gerado',
        description: `Plano: ${planLabel}. Link rastreado para cadastro/checkout: ${registerPath}.`,
        sourceType: 'hbx_sales_handoff',
        statusTo: 'qualificado',
        resultLabel: planKey,
        createdByUserId: context.userId,
      }),
    );

    const existingAttemptCount = Math.max(0, Math.trunc(Number(existing.attemptCount || 0) || 0));
    const shouldDebitCommercialUse =
      existingAttemptCount === 0
      && String(existing.sourceType || '').trim().toLowerCase() === 'webscraping';
    let commercialUseDebit: { debited: boolean; alreadyDebited: boolean } | null = null;
    if (shouldDebitCommercialUse) {
      const radarLeadId = this.extractRadarLeadId(existing.sourceHistoryId);
      commercialUseDebit = await this.commercialUsageLimits.recordCardCommercialUseOnce(context.companyId, context.userId, {
        source: 'vendas_hbx_signup_link',
        usageKey: radarLeadId ? `radar:${radarLeadId}` : `vendas:${existing.id}`,
        radarLeadId,
        vendasLeadId: existing.id,
        status: 'hbx_signup_link',
      });
      if (commercialUseDebit?.debited) {
        timelineEvents.push(
          this.buildTimelineEvent({
            eventType: 'card_usage_debited',
            title: 'Uso comercial debitado',
            description: 'O card consumiu limite ao gerar o link HBX para o cliente.',
            createdByUserId: context.userId,
          }),
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendasLead.update({
        where: { id: existing.id },
        data: {
          status: 'qualificado',
          nextAction: 'Enviar link HBX e acompanhar ativacao',
          lastContactAt: new Date(),
          attemptCount: Math.max(existingAttemptCount + 1, existingAttemptCount),
          lastResult: 'Link HBX enviado',
          ...contactGapPatch,
          ...(productPatch?.data || {}),
          ...closerAssignment,
          ...saleCommissionPatch.data,
        },
      });

      await tx.vendasLeadTimelineEvent.createMany({
        data: timelineEvents.map((event) => ({
          leadId: existing.id,
          ...event,
        })),
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

    await this.syncLeadToInboxAgenda(context.companyId, updated, existing);

    // Implantação fechada (setup > 0) → cutuca o master pra executar à mão, sem o
    // vendedor mandar mensagem. Fonte da verdade é o card; isto é só o aviso.
    // Best-effort (3 canais, WhatsApp single-shot gated por env): NUNCA bloqueia.
    if (explicitSetupValue > 0) {
      void this.masterAlert.notifyImplantacaoSold({
        companyId: context.companyId,
        sellerName: this.normalizeText((user as any)?.name) || this.normalizeText((user as any)?.email) || null,
        customerName: this.normalizeText((updated as any).name) || null,
        customerPhone: this.normalizeText((updated as any).phone) || null,
        planLabel,
        monthlyValue: baseSaleValue,
        setupValue: explicitSetupValue,
        leadId: String(updated.id),
      }).catch(() => { /* best-effort: aviso nunca derruba o fechamento */ });
    }

    // Camada 2 (FECHAMENTO → MASTER): toda venda fechada cutuca o dono/admin no
    // sino (audience customer) — ele sabe na hora, sem depender de abrir um feed.
    // O ganho do vendedor já volta no commissionPreview + celebração do modal; o
    // dono não vê o % do vendedor aqui (Lei do Vendedor). Best-effort + dedup por
    // lead (re-gerar o link da mesma venda não enche o sino).
    {
      const sellerName = this.normalizeText((user as any)?.name) || this.normalizeText((user as any)?.email) || 'Um vendedor';
      const customerName = this.normalizeText((updated as any)?.name) || 'o cliente';
      const monthlyBrl = baseSaleValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      void pushMasterNotice(this.prisma, {
        companyId: context.companyId,
        audience: 'customer',
        source: 'venda',
        tone: 'success',
        title: `Venda fechada — ${planLabel}`,
        body: `${sellerName} fechou ${planLabel} por ${monthlyBrl}/mês. Aguardando ${customerName} ativar o link de contratação.`,
        payload: { kind: 'venda', href: '/vendas', leadId: String(updated.id) },
        nudgeKey: `venda:${updated.id}`,
      }).catch(() => { /* best-effort: aviso nunca derruba o fechamento */ });
    }

    await this.hydrateRowsWithRadarPoolEnrichment([updated]);
    return {
      ok: true,
      planKey,
      planLabel,
      registerPath,
      registerUrl,
      message,
      leadId: String(updated.id),
      commissionPreview,
      lead: this.buildLeadPayload(updated, undefined, undefined, undefined, context.access),
      commercialUseDebit,
    };
  }

  // Token ASSINADO do handoff (stateless, sem coluna nova/migration): leadId.exp.HMAC.
  // Prova que o vendedor gerou o link no fechamento e da direito ao CPF no prefill, com
  // expiracao. Chave derivada do JWT_SECRET (HBX_HANDOFF_TOKEN_SECRET opcional sobrescreve);
  // em prod o JWT_SECRET e forte — main.ts aborta o boot se ausente/fraco.
  private handoffTokenSecret(): string {
    return (
      String(process.env.HBX_HANDOFF_TOKEN_SECRET || process.env.JWT_SECRET || '').trim() ||
      'hbx-handoff-prefill'
    );
  }

  private signHandoffToken(leadId: string, ttlMs = 72 * 60 * 60 * 1000): string {
    const exp = Date.now() + Math.max(60 * 1000, ttlMs);
    const sig = createHmac('sha256', this.handoffTokenSecret())
      .update(`handoff-prefill-v1.${leadId}.${exp}`)
      .digest('base64url');
    return `${leadId}.${exp}.${sig}`;
  }

  // Devolve o leadId se o token assina/expira OK; null se invalido/expirado.
  private verifyHandoffToken(raw: string): string | null {
    const parts = String(raw || '').split('.');
    if (parts.length !== 3) return null;
    const [leadId, expRaw, sig] = parts;
    const exp = Number(expRaw);
    if (!leadId || !Number.isFinite(exp)) return null;
    const expected = createHmac('sha256', this.handoffTokenSecret())
      .update(`handoff-prefill-v1.${leadId}.${exp}`)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() > exp) return null;
    return leadId;
  }

  // Prefill PUBLICO do checkout. O link leva ?hbxLead=<token assinado> (leadId.exp.sig).
  // Token valido = link recem-gerado no fechamento -> devolve tudo INCLUSIVE CPF, e expira.
  // leadId cru (link antigo, compat) ainda resolve, mas SEM CPF. Sem auth de proposito; so
  // responde se o lead tem handoff gerado (senao 404).
  async getHbxHandoffPrefill(token: string) {
    const raw = String(token || '').trim();
    if (!raw) throw new BadRequestException('Lead invalido.');
    // Token assinado (novo) vs leadId cru (link antigo). Token com assinatura ruim/
    // expirada = 404 explicito; leadId cru segue o caminho de compat (sem CPF).
    const verifiedLeadId = this.verifyHandoffToken(raw);
    const looksLikeToken = raw.split('.').length === 3;
    if (looksLikeToken && !verifiedLeadId) {
      throw new NotFoundException('Link de contratacao nao encontrado ou expirado.');
    }
    const leadId = verifiedLeadId || raw;
    const viaToken = Boolean(verifiedLeadId);
    const lead = await this.prisma.vendasLead.findUnique({
      where: { id: leadId },
      select: {
        companyId: true,
        name: true,
        email: true,
        phone: true,
        phoneNormalized: true,
        salePlanKey: true,
        saleStatus: true,
      },
    });
    const saleStatus = this.normalizeSaleStatus(lead?.saleStatus);
    const hasHandoff =
      Boolean(lead) && ['activation_pending', 'trial_started', 'sale_confirmed'].includes(saleStatus);
    if (!lead || !hasHandoff) {
      throw new NotFoundException('Link de contratacao nao encontrado ou expirado.');
    }
    // CPF (PII) SO no caminho por TOKEN assinado que expira — NUNCA no leadId cru
    // (link antigo trafega em claro). CPF mora no CustomerProfile, keyed por telefone;
    // o lead guarda o telefone COM DDI 55 e o profile pode guardar SEM, entao caso por
    // VARIANTES (com/sem 55). Sem relacao obrigatoria.
    let cpf: string | null = null;
    if (viaToken) {
      const rawDigits = String(lead.phoneNormalized || lead.phone || '').replace(/\D/g, '');
      if (rawDigits) {
        const variants = new Set<string>([rawDigits, rawDigits.slice(-13), rawDigits.slice(-11)]);
        if (rawDigits.length === 11) variants.add(`55${rawDigits}`);
        const profile = await this.prisma.customerProfile.findFirst({
          where: { companyId: lead.companyId, phoneNormalized: { in: Array.from(variants) } },
          orderBy: [{ updatedAt: 'desc' }],
          select: { document: true },
        });
        cpf = this.normalizeText(profile?.document) || null;
      }
    }
    const name = this.normalizeText(lead.name) || null;
    return {
      hasPrefill: true,
      companyNameSuggested: name,
      name,
      email: this.normalizeText(lead.email) || null,
      phone: this.normalizeText(lead.phone) || null,
      cpf,
      planKey: this.normalizeText(lead.salePlanKey) || null,
    };
  }

  // % e tetos de comissao do proprio vendedor (estimativa ao vivo no fechamento).
  // Card sem dono ainda -> assume o proprio usuario como futuro dono (e o que o
  // fechamento vai amarrar). Master de plataforma nao tem comissao.
  async getMyCommissionProfileForUser(user: any) {
    const context = await this.resolveVendasUserContext(user);
    const me = await this.prisma.user
      .findFirst({
        where: { id: context.userId, companyId: context.companyId },
        select: { commissionPercent: true, commissionMonthlyCap: true, setupCommissionCap: true, isSystemMaster: true },
      })
      .catch(() => null);
    const isSystemMaster = Boolean(me?.isSystemMaster);
    return {
      commissionPercent: isSystemMaster ? 0 : Math.max(0, Math.min(100, Number(me?.commissionPercent || 0) || 0)),
      monthlyCap: Math.max(0, Number(me?.commissionMonthlyCap || 0) || 0),
      setupCap: Math.max(0, Number(me?.setupCommissionCap || 0) || 0),
      dueBusinessDays: await this.resolveCommissionDueBusinessDays(context.companyId),
      sellsHbxPlans: await this.resolveSellsHbxPlans(context.companyId),
    };
  }

  // Fechamento iniciado pelo ATENDIMENTO: a conversa do WhatsApp vira (ou reusa) um
  // card de Vendas e segue o MESMO handoff — link de contratacao + comissao amarrada
  // ao vendedor. O cliente "fica amarrado" a quem fechou (assignedUserId no card).
  async createHbxSalesHandoffFromConversationForUser(user: any, conversationId: number | string, dto: CreateHbxSalesHandoffDto) {
    const normalizedConversationId = Math.trunc(Number(conversationId || 0));
    if (!normalizedConversationId) throw new BadRequestException('Conversa invalida.');
    const { leadId } = await this.inboxService.ensureVendasLeadForConversation(user, normalizedConversationId);
    return this.createHbxSalesHandoffForUser(user, leadId, dto || {});
  }

  async createHbxAssistedSignupForUser(user: any, leadId: string, dto: CreateHbxAssistedSignupDto) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanRunHbxActivationAction(context);
    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new BadRequestException('Lead comercial invalido.');

    const addressColumnAvailable = await this.hasVendasLeadAddressColumn();
    const leadWithTimelineSelectWithoutAddress: any = this.buildVendasLeadSelectWithoutAddress({
      timelineEvents: {
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      },
    });
    const existing = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      ...(addressColumnAvailable ? {} : { select: this.buildVendasLeadSelectWithoutAddress() }),
    });
    if (!existing) throw new NotFoundException('Lead comercial nao encontrado.');

    const productPatch = this.hasDtoField(dto, 'productId')
      ? await this.resolveVendasProductPatch(context, dto.productId)
      : null;
    const email = this.normalizeEmail(dto?.email || existing.email);
    if (!email) throw new BadRequestException('Informe um e-mail valido do cliente para comprovar o cadastro.');

    // salePlanKey só vale para o HBX admin (tenant sellsHbxPlans) — igual ao handoff.
    const sellsHbxPlans = await this.resolveSellsHbxPlans(context.companyId);
    const requestedPlanKey = sellsHbxPlans ? this.normalizeText(dto?.salePlanKey) : null;
    const planKey = normalizeCommercialPlanKey(requestedPlanKey || productPatch?.product?.planKey || existing.salePlanKey || COMMERCIAL_PLAN_KEYS.PADRAO);
    const planLabel = productPatch?.product?.name ? String(productPatch.product.name) : this.commercialPlanLabel(planKey);
    const companyName = this.normalizeText(dto?.companyName) || this.normalizeText(existing.name) || 'Cliente HBX';
    const contactName = this.normalizeText(dto?.contactName) || this.normalizeText(existing.name) || companyName;
    const cardPhone = this.normalizeText(existing.phone);
    const cardPhoneNormalized = this.normalizePhone(existing.phoneNormalized || existing.phone);
    const requestedPhone = this.normalizeText(dto?.phone);
    const requestedPhoneNormalized = this.normalizePhone(requestedPhone);
    if (cardPhoneNormalized && requestedPhoneNormalized && requestedPhoneNormalized !== cardPhoneNormalized) {
      throw new ConflictException({
        code: 'HBX_ASSISTED_SIGNUP_PHONE_LOCKED',
        message: 'O WhatsApp do cadastro deve ser o telefone do card. Para trocar, edite o card antes.',
      });
    }
    const phone = cardPhone || requestedPhone;
    const phoneNormalized = cardPhoneNormalized || requestedPhoneNormalized;
    const phoneCandidates = phoneNormalized
      ? Array.from(
          new Set(
            this.buildLeadPhoneNormalizedCandidates(phoneNormalized)
              .map((candidate) => this.customerProfileService.normalizePhone(candidate))
              .filter((candidate): candidate is string => Boolean(candidate)),
          ),
        )
      : [];
    const phoneForHbxAccount = phoneNormalized
      ? (phoneNormalized.startsWith('55') && phoneNormalized.length > 11 ? phoneNormalized.slice(2) : phoneNormalized).slice(0, 11)
      : null;
    const hbxSignupEventTypes = ['hbx_assisted_signup_created', 'hbx_signup_link_created'];
    const existingSignupEvent = await this.prisma.vendasLeadTimelineEvent.findFirst({
      where: {
        leadId: existing.id,
        eventType: { in: hbxSignupEventTypes },
      },
      select: { id: true, eventType: true },
    });
    if (
      this.isAutomaticSaleStatus(this.normalizeSaleStatus(existing.saleStatus)) ||
      Boolean(existing.commissionLinkedCompanyId) ||
      Boolean(existing.commissionLinkedAt) ||
      Boolean(existing.commissionAutoSyncedAt) ||
      existingSignupEvent
    ) {
      throw new ConflictException({
        code: 'HBX_ASSISTED_SIGNUP_LEAD_ALREADY_REGISTERED',
        message: 'Este card ja tem cadastro/link HBX em andamento. Use o cadastro existente; nao crie outro trial.',
      });
    }

    const duplicateLeadByPhone = phoneCandidates.length
      ? await this.prisma.vendasLead.findFirst({
          where: {
            companyId: context.companyId,
            id: { not: existing.id },
            phoneNormalized: { in: phoneCandidates },
          },
          select: { id: true, name: true },
        })
      : null;
    if (duplicateLeadByPhone) {
      throw new ConflictException({
        code: 'HBX_ASSISTED_SIGNUP_PHONE_DUPLICATED_CARD',
        message: `Este WhatsApp ja esta no card ${String(duplicateLeadByPhone.name || duplicateLeadByPhone.id)}. Use o card existente; nao crie outro trial.`,
      });
    }

    const duplicateLeadByEmail = await this.prisma.vendasLead.findFirst({
      where: {
        companyId: context.companyId,
        id: { not: existing.id },
        email,
      },
      select: { id: true, name: true },
    });
    if (duplicateLeadByEmail) {
      throw new ConflictException({
        code: 'HBX_ASSISTED_SIGNUP_EMAIL_DUPLICATED_CARD',
        message: `Este e-mail ja esta no card ${String(duplicateLeadByEmail.name || duplicateLeadByEmail.id)}. Use o card existente; nao crie outro trial.`,
      });
    }

    const existingHbxUserByEmail = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username: email }],
      },
      select: { id: true },
    });
    if (existingHbxUserByEmail) {
      throw new ConflictException({
        code: 'HBX_ASSISTED_SIGNUP_EMAIL_ALREADY_REGISTERED',
        message: 'Este e-mail ja tem cadastro HBX. Nao e possivel criar outro trial para o mesmo cliente.',
      });
    }

    if (phoneCandidates.length) {
      const [existingHbxUserByPhone, existingHbxCompanyByPhone, existingTrialPhoneUsage] = await Promise.all([
        this.prisma.user.findFirst({
          where: { phone: { in: phoneCandidates } },
          select: { id: true },
        }),
        this.prisma.company.findFirst({
          where: { contactPhone: { in: phoneCandidates } },
          select: { id: true, name: true },
        }),
        this.prisma.trialPhoneUsage.findFirst({
          where: { phoneNormalized: { in: phoneCandidates } },
          select: { id: true, companyId: true },
        }),
      ]);
      if (existingHbxUserByPhone || existingHbxCompanyByPhone || existingTrialPhoneUsage) {
        throw new ConflictException({
          code: 'HBX_ASSISTED_SIGNUP_PHONE_ALREADY_REGISTERED',
          message: 'Este WhatsApp ja tem cadastro ou trial HBX registrado. Nao e possivel criar outro trial para o mesmo cliente.',
        });
      }
    }

    const providedPassword = this.normalizeText(dto?.password);
    const password = providedPassword || this.generateAssistedSignupPassword();
    const referralCode = `hbx-vendas-lead:${existing.id}`;
    const signupResult: any = await this.authService.signup({
      entityType: 'PF',
      companyName,
      name: contactName,
      selectedPlanKey: planKey,
      username: email,
      email,
      password,
      acquisitionSource: 'indicacao',
      acquisitionSourceDetail: referralCode,
      referralCode,
      trialContactPhone: phone || undefined,
    });
    const signupUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username: email }],
      },
      select: { id: true, companyId: true },
    });

    await this.hbxCommissionSync.syncSalesCompanyCommissions(context.companyId, { source: 'vendas_assisted_signup' }).catch((error: any) => {
      this.logger.warn(`commission_sync_assisted_signup_failed company=${context.companyId} error=${String(error?.message || error)}`);
    });

    const refreshed = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: existing.id }),
      ...(addressColumnAvailable ? {} : { select: this.buildVendasLeadSelectWithoutAddress() }),
    });
    const commissionSource = refreshed || existing;
    const productPriceCents = this.normalizePriceCentsFromProduct(productPatch?.product);
    const saleCommissionPatch = await this.buildSaleCommissionPatch({ ...commissionSource, ...(productPatch?.data || {}) }, {
      saleStatus: 'activation_pending',
      salePlanKey: planKey,
      saleValue: productPriceCents ? productPriceCents / 100 : getCommercialPlanMonthlyPrice(planKey),
      commissionNote: `Cadastro assistido criado para ${planLabel}. E-mail do cliente precisa ser confirmado.`,
    }, context.userId, { allowAutomaticSaleStatus: true });
    const customerProfileId =
      (await this.ensureCustomerProfile({
        companyId: context.companyId,
        name: companyName,
        phone,
        email,
        sourceType: existing.sourceType === 'webscraping' ? 'webscraping' : 'manual',
        shortNote: existing.shortNote,
      })) || existing.customerProfileId;

    const timelineEvents: TimelineEventRecord[] = [];
    if (saleCommissionPatch.event) timelineEvents.push(saleCommissionPatch.event);
    timelineEvents.push(
      this.buildTimelineEvent({
        eventType: 'hbx_assisted_signup_created',
        title: 'Cadastro assistido criado',
        description: `Vendedor iniciou o cadastro ${planLabel} para ${email}. A ativacao depende da confirmacao do e-mail do cliente.`,
        sourceType: 'hbx_assisted_signup',
        statusTo: 'qualificado',
        resultLabel: 'pending_email_confirmation',
        createdByUserId: context.userId,
      }),
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (signupUser?.id) {
        await tx.user.update({
          where: { id: signupUser.id },
          data: {
            name: contactName,
            ...(phoneForHbxAccount ? { phone: phoneForHbxAccount } : {}),
          },
        });
      }

      if (signupUser?.companyId) {
        await tx.company.update({
          where: { id: Number(signupUser.companyId) },
          data: {
            primaryContactName: contactName,
            contactEmail: email,
            ...(phoneForHbxAccount ? { contactPhone: phoneForHbxAccount } : {}),
          },
        });
      }

      const row = await tx.vendasLead.update({
        where: { id: existing.id },
        data: {
          customerProfileId,
          status: 'qualificado',
          nextAction: 'Cliente precisa confirmar e-mail para ativar HBX',
          email,
          phone: phone || existing.phone,
          phoneNormalized: phoneNormalized || existing.phoneNormalized,
          lastContactAt: new Date(),
          lastResult: 'Cadastro assistido aguardando e-mail',
          ...(productPatch?.data || {}),
          ...saleCommissionPatch.data,
        },
      });

      await tx.vendasLeadTimelineEvent.createMany({
        data: timelineEvents.map((event) => ({
          leadId: existing.id,
          ...event,
        })),
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

    await this.syncLeadToInboxAgenda(context.companyId, updated, existing);

    const status = String(signupResult?.status || '').trim() || 'pending_email_confirmation';
    const requiresEmailConfirmation = status === 'pending_email_confirmation' || !signupResult?.access_token;
    const deliveryFailed = Boolean(signupResult?.delivery?.failed);
    await this.hydrateRowsWithRadarPoolEnrichment([updated]);
    return {
      ok: true,
      status,
      requiresEmailConfirmation,
      email,
      planKey,
      planLabel,
      generatedPassword: providedPassword ? null : password,
      message: deliveryFailed
        ? 'Cadastro assistido criado, mas o e-mail de confirmação não foi enviado agora.'
        : requiresEmailConfirmation
          ? 'Cadastro assistido criado e e-mail de confirmação enviado. O cliente precisa confirmar antes de trial, pagamento ou implantação.'
          : 'Cadastro assistido criado e e-mail confirmado no ambiente local.',
      delivery: signupResult?.delivery
        ? {
            failed: Boolean(signupResult.delivery.failed),
            previewUrl: signupResult.delivery.previewUrl || null,
            confirmUrl: signupResult.delivery.confirmUrl || null,
            errorCode: signupResult.delivery.errorCode || null,
            errorMessage: signupResult.delivery.errorMessage || null,
          }
        : null,
      lead: this.buildLeadPayload(updated, undefined, undefined, undefined, context.access),
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

  private async createVendasCardComplaint(
    context: { companyId: number; userId: number },
    row: any,
    reason: string,
  ) {
    await ensureVendasComplaintsRuntimeSchema(this.prisma);
    const now = new Date();
    const radarLeadId = this.extractRadarLeadId(row?.sourceHistoryId);
    const existing = String(row?.id || '').trim()
      ? await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "VendasCardComplaint"
        WHERE "companyId" = ${Number(context.companyId)}
          AND "vendasLeadId" = ${String(row.id)}
        ORDER BY "createdAt" DESC
        LIMIT 1
      `
      : [];
    if (existing[0]?.id) {
      await this.prisma.$executeRaw`
        UPDATE "VendasCardComplaint"
        SET
          "reason" = ${reason},
          "status" = ${'new'},
          "updatedAt" = ${now}
        WHERE "id" = ${existing[0].id}
      `;
      return;
    }
    await this.prisma.$executeRaw`
      INSERT INTO "VendasCardComplaint"
      (
        "id",
        "companyId",
        "userId",
        "vendasLeadId",
        "radarLeadId",
        "leadName",
        "leadPhone",
        "leadCity",
        "leadState",
        "leadSegment",
        "reason",
        "status",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${Number(context.companyId)},
        ${Number(context.userId) || null},
        ${String(row?.id || '') || null},
        ${radarLeadId || null},
        ${this.normalizeText(row?.name) || null},
        ${this.normalizeText(row?.phone || row?.phoneNormalized) || null},
        ${this.normalizeText(row?.city) || null},
        ${this.normalizeText(row?.state) || null},
        ${this.normalizeText(row?.segment) || null},
        ${reason},
        ${'new'},
        ${now},
        ${now}
      )
    `;
  }

  private async resolveRadarLeadIdForDeletedVendasRow(row: any) {
    const directRadarLeadId = this.extractRadarLeadId(row?.sourceHistoryId);
    if (directRadarLeadId) return directRadarLeadId;

    const phoneCandidates = this.buildLeadPhoneNormalizedCandidates(row?.phoneNormalized || row?.phone);
    if (!phoneCandidates.length) return null;

    const matched = await (this.prisma as any).radarLeadPool.findFirst({
      where: {
        OR: [
          { phoneDigits: { in: phoneCandidates } },
          { phone: { in: phoneCandidates } },
        ],
      },
      orderBy: [
        { updatedAt: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      select: { id: true },
    }).catch(() => null);

    return matched?.id ? String(matched.id) : null;
  }

  private async releaseRadarLeadBackToPool(
    context: { companyId: number; userId: number },
    row: any,
    options: { status: string; reason?: string | null },
  ) {
    const [hasPool, hasState, hasEvent, hasOwnerColumn, hasClaimedColumn] = await Promise.all([
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
      this.prisma.hasTable('RadarLeadCompanyState').catch(() => false),
      this.prisma.hasTable('RadarLeadEvent').catch(() => false),
      this.prisma.hasColumn('RadarLeadPool', 'ownerCompanyId').catch(() => false),
      this.prisma.hasColumn('RadarLeadPool', 'claimedAt').catch(() => false),
    ]);
    if (!hasPool || !hasState) return;
    const radarLeadId = await this.resolveRadarLeadIdForDeletedVendasRow(row);
    if (!radarLeadId) return;
    const now = new Date();
    const reason = this.normalizeText(options.reason);
    const privateNotes = this.normalizeText(row?.shortNote);

    // ── FONTE ÚNICA da disposição (PR24062026 / radar-disposition-rules.ts) ──
    // options.status carrega o motivo cru (discarded/complaint/no_answer/voicemail/
    // released/won/...). A matriz decide os 3 eixos. SEM listas hardcoded aqui.
    const dispositionReason = resolveDispositionReason(options.status);
    const rule = resolveDisposition(options.status);
    const isComplaint = dispositionReason === 'complaint';

    // companyState.status: 'release' → reaparece pra própria empresa ('released');
    // 'customer' → vira cliente ('won'); 'hide' → escondido (mantém 'complaint' pra
    // reclamação, senão 'discarded'). Status protegidos somem da vitrine da própria empresa.
    const companyStatus =
      rule.ownCompany === 'release'
        ? 'released'
        : rule.ownCompany === 'customer'
        ? 'won'
        : isComplaint
        ? 'complaint'
        : 'discarded';
    const isHiddenOwn = rule.ownCompany === 'hide';

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
        status: companyStatus,
        lastActionAt: now,
        negativeReason: isHiddenOwn && !isComplaint ? reason : null,
        complaintReason: isComplaint ? reason : null,
        privateNotes,
      },
      update: {
        vendasLeadId: null,
        status: companyStatus,
        lastActionAt: now,
        // 'release' limpa o motivo negativo (card volta limpo); preserva histórico/eventos.
        negativeReason: isHiddenOwn && !isComplaint ? reason : null,
        complaintReason: isComplaint ? reason : null,
        privateNotes,
      },
    }).catch((error: any) => {
      this.logger.warn(`[vendas-delete] Falha ao atualizar estado Radar lead=${radarLeadId}: ${String(error?.message || error)}`);
    });

    if (poolRow) {
      const ownerCompanyId = Math.trunc(Number(poolRow.ownerCompanyId || 0)) || 0;
      // pool: 'blocked' (caixa postal / automáticos do bot / reclamação) → status global
      // protegido = some pra TODAS as empresas. pool: 'clean' (só excluir / não satisfatório /
      // não atendeu / não quer produto / fechou venda) → volta pra lagoa pros outros.
      const globalKill = isGlobalBlockStatus(options.status);
      const poolKillStatus = resolvePoolBlockStatus(options.status) || 'blocked';
      await (this.prisma as any).radarLeadPool.update({
        where: { id: radarLeadId },
        data: {
          ...(hasOwnerColumn && (!ownerCompanyId || ownerCompanyId === context.companyId) ? { ownerCompanyId: null } : {}),
          ...(hasClaimedColumn && (!ownerCompanyId || ownerCompanyId === context.companyId) ? { claimedAt: null } : {}),
          status: globalKill ? poolKillStatus : 'clean',
          ...(globalKill ? { recommendedChannel: 'discard', enrichmentScore: 0, globalNegativeCount: { increment: 1 } } : {}),
          lastSeenAt: now,
        },
      }).catch((error: any) => {
        this.logger.warn(`[vendas-delete] Falha ao liberar RadarLeadPool lead=${radarLeadId}: ${String(error?.message || error)}`);
      });
    }

    if (hasEvent) {
      const eventType =
        rule.ownCompany === 'customer'
          ? 'won'
          : rule.ownCompany === 'release'
          ? 'released'
          : isComplaint
          ? 'complaint'
          : 'discarded';
      await (this.prisma as any).radarLeadEvent.create({
        data: {
          leadId: radarLeadId,
          companyId: context.companyId,
          eventType,
          note:
            reason ||
            (isComplaint
              ? 'Card reportado com erro no Vendas.'
              : rule.ownCompany === 'release'
              ? 'Card liberado do Vendas (volta pra vitrine).'
              : rule.ownCompany === 'customer'
              ? 'Venda fechada — cliente da empresa.'
              : 'Card excluido do Vendas.'),
          statusFrom: previousStatus,
          statusTo: companyStatus,
          createdByUserId: context.userId,
        },
      }).catch(() => null);
    }
  }

  private async deleteVendasRowsForUser(
    user: any,
    dto: BulkDeleteVendasLeadsDto,
    options: { report?: boolean; reportReason?: string | null; radarStatus?: string | null; radarReason?: string | null } = {},
  ) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(context.access?.canDeleteCards, 'Acesso para excluir card bloqueado pela politica da equipe.');
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

    const where: any = this.buildLeadAccessWhere(context, all ? {} : { id: { in: leadIds } });
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
          status: options.radarStatus || (options.report ? 'complaint' : 'discarded'),
          reason: options.radarReason || (options.report ? options.reportReason || 'Card reclamado com erro no Vendas.' : 'Card ocultado do Vendas.'),
        });
      } catch (error: any) {
        this.logger.warn(`[vendas-delete] Falha ao devolver card ao Radar lead=${row.id}: ${error?.message || error}`);
      }
      // S4 LEAD-CENTRICO (04-robozinho.md, item 3 "paradas globais" — BURACO
      // fechado aqui): o card sai do Vendas por excluir/negativar/opt-out/reportar
      // — TODOS passam por este método único. `CadenciaInscricao.leadId` não tem FK
      // pro VendasLead (é string solta), então o `deleteMany` abaixo NUNCA cascateava
      // a cadência — ela ficava "ativa" apontando pra um lead que já não existe mais
      // (o runner, quando ligado, só descobria isso lead a lead, sem motivo
      // registrado). Pausar ANTES do delete garante motivo + evidência no ledger.
      try {
        await this.commercialContactControl.pauseCommercialAutomationForLead({
          companyId: context.companyId,
          leadId: row.id,
          reason: `lead_disposed_${options.radarStatus || (options.report ? 'complaint' : 'discarded')}`,
        });
      } catch (error: any) {
        this.logger.warn(`[vendas-robo] Falha ao pausar automacao antes de excluir lead=${row.id}: ${error?.message || error}`);
      }
    }

    await this.prisma.vendasLead.deleteMany({
      where: this.buildLeadAccessWhere(context, { id: { in: rowIds } }),
    });

    return { ok: true, deletedCount: rows.length, rows };
  }

  async deleteLeadsBulkForUser(user: any, dto: BulkDeleteVendasLeadsDto) {
    // Motivo da exclusão em massa → motivo canônico da matriz (só excluir / não satisfatório
    // / ...). Default conservador (unsatisfactory) quando vazio, definido na fonte única.
    const reason = resolveDispositionReason((dto as any)?.reason);
    const result = await this.deleteVendasRowsForUser(user, dto || {}, {
      radarStatus: reason,
      radarReason: this.buildDispositionReasonNote(reason),
    });
    return { ok: true, deletedCount: result.deletedCount };
  }

  async deleteLeadForUser(user: any, leadId: string, reasonInput?: string | null) {
    const reason = resolveDispositionReason(reasonInput);
    const result = await this.deleteVendasRowsForUser(user, {
      leadIds: [String(leadId || '').trim()],
    }, {
      radarStatus: reason,
      radarReason: this.buildDispositionReasonNote(reason),
    });
    return { ok: true, deletedCount: result.deletedCount };
  }

  // Nota humana padrão por motivo (vai pro RadarLeadEvent.note / negativeReason).
  private buildDispositionReasonNote(reason: string): string {
    switch (reason) {
      case 'excluir':
        return 'Card excluido (volta pra vitrine da empresa).';
      case 'no_answer':
        return 'Nao atendeu.';
      case 'voicemail':
        return 'Caixa postal.';
      case 'not_interested':
        return 'Nao quer o produto.';
      case 'won':
        return 'Venda fechada — cliente da empresa.';
      case 'unsatisfactory':
      default:
        return 'Resultado nao satisfatorio.';
    }
  }

  // Negativar lead do Vendas COM MOTIVO (dono 14/06): tira o card da carteira e
  // decide o destino na lagoa pelo motivo. LEVE ("sem interesse") → volta pra lagoa
  // pros outros; DURA ("não atende/número não existe/sem WhatsApp/opt-out/reclamou")
  // → some pra todas as empresas. Quem negativou nunca mais vê (estado por empresa).
  async negativarLeadForUser(user: any, leadId: string, dto: { status?: string; note?: string } = {}) {
    // Finalização do vendedor (não atendeu / caixa postal / não quer produto). O destino
    // na lagoa vem da FONTE ÚNICA da disposição — sem listas hardcoded aqui. 'hard'
    // (some pra todas) = pool bloqueado (hoje: só caixa postal entre os do vendedor).
    const rawStatus = String(dto?.status || '').trim().toLowerCase();
    if (!rawStatus) {
      throw new BadRequestException('Motivo de negativacao invalido.');
    }
    const status = resolveDispositionReason(rawStatus);
    const reason = this.normalizeText(dto?.note) || this.buildDispositionReasonNote(status);
    const result = await this.deleteVendasRowsForUser(user, {
      leadIds: [String(leadId || '').trim()],
    }, {
      radarStatus: status,
      radarReason: reason,
    });
    const hard = isGlobalBlockStatus(status);
    return {
      ok: true,
      deletedCount: result.deletedCount,
      kind: hard ? 'global' : 'company',
      message: hard
        ? 'Lead negativado e removido da lagoa para todas as empresas.'
        : 'Lead negativado — saiu da sua carteira e voltou para a lagoa.',
    };
  }

  async reportLeadErrorForUser(user: any, leadId: string, dto: ReportVendasLeadDto) {
    const context = await this.resolveVendasUserContext(user);
    this.assertVendasPermission(context.access?.canDeleteCards, 'Acesso para excluir card bloqueado pela politica da equipe.');
    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new BadRequestException('Card nao informado.');
    const row = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
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
    await this.createVendasCardComplaint(context, row, reason);
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
        ? 'Reclamação registrada e card removido do Vendas.'
        : 'Reclamação registrada e card removido. Abra o WhatsApp para enviar o reporte ao suporte HBX.',
    };
  }

  async registerAttemptForUser(user: any, leadId: string, dto?: { channel?: string }) {
    const context = await this.resolveVendasUserContext(user);
    this.assertCanRegisterTimeline(context);
    const existing = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: String(leadId || '').trim() }),
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

    await this.hydrateRowsWithRadarPoolEnrichment([updated]);
    return {
      ok: true,
      lead: this.buildLeadPayload(updated, undefined, undefined, undefined, context.access),
    };
  }

  async addLeadNoteForUser(user: any, leadId: string, dto?: { note?: string }) {
    // Anotacao neutra do vendedor na timeline do lead — o Copiloto do cockpit grava
    // resumo / proxima-acao aqui. Evento PURO: nao muda status, nao mexe em posse/
    // atribuicao, nao debita credito e nao dispara WhatsApp/e-mail (mesma filosofia do
    // eventType 'note' do Radar). Gate = SO o buildLeadAccessWhere (tenant + escopo);
    // o vendedor dono trabalha o proprio lead, entao pode anotar (sem gate de Admin).
    const context = await this.resolveVendasUserContext(user);
    const normalizedLeadId = String(leadId || '').trim();
    if (!normalizedLeadId) throw new BadRequestException('Lead comercial nao informado.');

    const note = String(dto?.note || '').trim().slice(0, 2000); // corte defensivo
    if (!note) throw new BadRequestException('Anotacao vazia.');

    const lead = await this.prisma.vendasLead.findFirst({
      where: this.buildLeadAccessWhere(context, { id: normalizedLeadId }),
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead comercial nao encontrado.');

    const event = await this.prisma.vendasLeadTimelineEvent.create({
      data: {
        leadId: lead.id,
        ...this.buildTimelineEvent({
          eventType: 'note',
          title: 'Anotação',
          description: note,
          createdByUserId: context.userId,
        }),
      },
      select: {
        id: true,
        eventType: true,
        title: true,
        description: true,
        createdAt: true,
      },
    });

    return {
      ok: true,
      event: {
        id: event.id,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        createdAt: event.createdAt.toISOString(),
      },
    };
  }
}
