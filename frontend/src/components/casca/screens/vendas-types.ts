// MOBILE-CASCA/W2 — tipos e mapeadores compartilhados entre o modo Funil e o
// modo Buscar da tela mobile de Vendas/Leads. Espelha os tipos locais (não
// exportados) de vendas/page.client.tsx e leads/page.client.tsx — MESMO
// contrato de API, zero mudança no desktop. Mapear aqui (em vez de importar a
// função fechada dentro do componente desktop) evita qualquer acoplamento com
// o estado interno do VendasClient/LeadsClient.

import type {
  NegocioDetail,
  VendasConversationRef,
  VendasEngagementSnapshot,
} from "@/components/hbx/detalhes-negocio";
import type { LeadContactRecord } from "@/components/hbx/lead-contact-list";

export type VendasBlockKey = "today" | "overdue" | "scheduled" | "closed";

export type VendasLeadMobile = {
  id: string;
  customerProfileId?: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  address?: string | null;
  website?: string | null;
  cnpj?: string | null;
  cnae?: string | null;
  razaoSocial?: string | null;
  ownerName?: string | null;
  ownerNames?: string[] | null;
  ownerPhone?: string | null;
  ownerInstagram?: string | null;
  ownerFacebook?: string | null;
  companySituation?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  phoneContacts?: LeadContactRecord[] | null;
  emailContacts?: LeadContactRecord[] | null;
  phonesWhatsapp?: Record<string, boolean> | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  rating?: number | null;
  reviews?: number | null;
  opportunityScore?: number | null;
  leadTemperature?: string | null;
  timesSeen?: number | null;
  status: string;
  statusLabel: string;
  nextAction?: string | null;
  returnAt: string | null;
  shortNote: string | null;
  lastContactAt?: string | null;
  attemptCount: number;
  lastResult?: string | null;
  closedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sourceType?: string | null;
  primarySource?: string | null;
  sourceHistoryId?: string | null;
  radarOrigin?: boolean | null;
  contactAccessGranted?: boolean | null;
  sourceChain?: string | null;
  isFreshCompany?: boolean | null;
  daysSinceOpened?: number | null;
  isInInbox?: boolean | null;
  conversation?: VendasConversationRef | null;
  engagement?: VendasEngagementSnapshot | null;
  timeline?: Array<{
    id: string;
    eventType?: string | null;
    title: string | null;
    description: string | null;
    resultLabel?: string | null;
    returnAt?: string | null;
    createdAt?: string | null;
  }> | null;
  saleConfirmedAt?: string | null;
  saleStatus?: string | null;
  saleStatusLabel?: string | null;
  saleValue: number | null;
  commissionStatusLabel?: string | null;
  commissionAmount?: number | null;
  commissionDueAt?: string | null;
  commissionRecurring?: boolean | null;
  commissionNote?: string | null;
  setupValue?: number | null;
  setupCommissionAmount?: number | null;
  setupCommissionStatusLabel?: string | null;
  commissionPercentSnapshot?: number | null;
  product: { name: string | null; priceLabel: string | null; canViewPrice?: boolean } | null;
  leadIntelligence?: {
    whatsappStatus?: string | null;
    emailStatus?: string | null;
    websiteStatus?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    opportunityReason?: string | null;
    leadReasonTags?: string[] | null;
    recommendedChannel?: string | null;
    painType?: string | null;
    painPitch?: string | null;
    messageTemplate?: string | null;
    contactQuality?: string | null;
    enrichedAt?: string | null;
  } | null;
  owner: { name: string | null } | null;
  block: VendasBlockKey;
};

export type VendasBoardResponse = {
  summary: { total: number; today: number; overdue: number; scheduled: number; closed: number };
  blocks: { today: VendasLeadMobile[]; overdue: VendasLeadMobile[]; scheduled: VendasLeadMobile[]; closed: VendasLeadMobile[] };
  canViewValues?: boolean;
} | null;

const RADAR_CLIENT_SOURCES = new Set(["radar", "webscraping", "radar_quarantined"]);

export function isVendasRadarLeadClient(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const lead = value as Record<string, unknown>;
  if (lead.radarOrigin === true) return true;
  if (/^radar:[^:\s]+$/i.test(String(lead.sourceHistoryId || "").trim())) return true;
  return [lead.sourceType, lead.primarySource]
    .map(source => String(source || "").trim().toLowerCase())
    .some(source => RADAR_CLIENT_SOURCES.has(source));
}

/**
 * Segunda barreira: um payload Radar sem prova explícita nunca entra no state
 * React. Cards manuais não são reclassificados e continuam intactos.
 */
export function sanitizeVendasLeadForClient<T extends Record<string, unknown>>(lead: T): T | null {
  if (!isVendasRadarLeadClient(lead)) return lead;
  return lead.contactAccessGranted === true ? lead : null;
}

export function sanitizeVendasBoardForClient<T extends {
  summary?: { total?: number; today?: number; overdue?: number; scheduled?: number; closed?: number };
  blocks?: Record<string, Array<Record<string, unknown>> | undefined>;
} | null>(board: T): T {
  if (!board?.blocks) return board;
  const safeBlocks: Record<string, Array<Record<string, unknown>>> = {};
  for (const [key, rows] of Object.entries(board.blocks)) {
    safeBlocks[key] = (Array.isArray(rows) ? rows : [])
      .map(row => sanitizeVendasLeadForClient(row))
      .filter((row): row is Record<string, unknown> => Boolean(row));
  }
  const summary = board.summary
    ? {
        ...board.summary,
        total: Object.values(safeBlocks).reduce((total, rows) => total + rows.length, 0),
        today: safeBlocks.today?.length || 0,
        overdue: safeBlocks.overdue?.length || 0,
        scheduled: safeBlocks.scheduled?.length || 0,
        closed: safeBlocks.closed?.length || 0,
      }
    : board.summary;
  return { ...board, blocks: safeBlocks, summary } as T;
}

export const BLOCK_ORDER_MOBILE: { key: VendasBlockKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "overdue", label: "Atrasados" },
  { key: "scheduled", label: "Agendados" },
  { key: "closed", label: "Fechados" },
];

// Vista "Quadro": agrupa pela ETAPA real (status), espelhando STAGE_ORDER/
// normalizeStage do desktop (vendas/page.client.tsx) — mesmos 5 status.
export type VendasStageMobile = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
export const STAGE_ORDER_MOBILE: { key: VendasStageMobile; label: string }[] = [
  { key: "novo", label: "Prospecção" },
  { key: "contato", label: "Qualificação" },
  { key: "retorno", label: "Proposta" },
  { key: "qualificado", label: "Negociação" },
  { key: "encerrado", label: "Fechamento" },
];
export function normalizeStageMobile(status: string | null | undefined): VendasStageMobile {
  const s = String(status || "").trim().toLowerCase();
  if (s === "contato" || s === "retorno" || s === "qualificado" || s === "encerrado") return s;
  return "novo";
}

export function fmtMoneyMobile(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function vendasLeadValueLabel(lead: VendasLeadMobile, canViewValues: boolean): string {
  if (!canViewValues) return "";
  return lead.product?.priceLabel || fmtMoneyMobile(lead.saleValue) || "R$ 0";
}

/** VendasLead (board) → NegocioDetail — mesmo shape que toNegocioDetail() do
 * desktop (vendas/page.client.tsx). Campos ausentes/null somem no card. */
export function vendasLeadToDetail(d: VendasLeadMobile): NegocioDetail {
  return {
    id: d.id,
    enriched: Boolean(d.leadIntelligence?.enrichedAt),
    name: d.name,
    phone: d.phone,
    email: d.email,
    website: d.website,
    cnpj: d.cnpj ?? null,
    cnae: d.cnae ?? null,
    razaoSocial: d.razaoSocial ?? null,
    ownerName: d.ownerName ?? null,
    ownerNames: d.ownerNames ?? null,
    ownerPhone: d.ownerPhone ?? null,
    ownerInstagram: d.ownerInstagram ?? null,
    ownerFacebook: d.ownerFacebook ?? null,
    companySituation: d.companySituation ?? null,
    emails: d.emails ?? null,
    phones: d.phones ?? null,
    phoneContacts: d.phoneContacts ?? null,
    emailContacts: d.emailContacts ?? null,
    phonesWhatsapp: d.phonesWhatsapp ?? null,
    address: d.address ?? null,
    city: d.city,
    state: d.state,
    segment: d.segment,
    statusLabel: d.statusLabel,
    leadTemperature: d.leadTemperature,
    opportunityScore: d.opportunityScore,
    rating: d.rating,
    reviews: d.reviews,
    valueLabel: d.product?.priceLabel || fmtMoneyMobile(d.saleValue) || "—",
    productName: d.product?.name ?? null,
    returnAt: d.returnAt,
    lastContactAt: d.lastContactAt,
    lastMessageAt: d.engagement?.lastMessageAt ?? null,
    shortNote: d.shortNote,
    attemptCount: d.attemptCount,
    nextAction: d.nextAction,
    lastResult: d.lastResult,
    timesSeen: d.timesSeen,
    isInInbox: d.isInInbox ?? null,
    conversation: d.conversation ?? null,
    engagement: d.engagement ?? null,
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
    sourceType: d.sourceType ?? null,
    primarySource: d.primarySource ?? null,
    sourceChain: d.sourceChain ?? null,
    isFreshCompany: d.isFreshCompany ?? null,
    daysSinceOpened: d.daysSinceOpened ?? null,
    owner: d.owner ? { name: d.owner.name } : null,
    leadIntelligence: d.leadIntelligence
      ? {
          whatsappStatus: d.leadIntelligence.whatsappStatus ?? null,
          emailStatus: d.leadIntelligence.emailStatus ?? null,
          websiteStatus: d.leadIntelligence.websiteStatus ?? null,
          instagramUrl: d.leadIntelligence.instagramUrl ?? null,
          facebookUrl: d.leadIntelligence.facebookUrl ?? null,
          opportunityReason: d.leadIntelligence.opportunityReason ?? null,
          leadReasonTags: d.leadIntelligence.leadReasonTags ?? null,
          recommendedChannel: d.leadIntelligence.recommendedChannel ?? null,
          painType: d.leadIntelligence.painType ?? null,
          painPitch: d.leadIntelligence.painPitch ?? null,
          messageTemplate: d.leadIntelligence.messageTemplate ?? null,
          contactQuality: d.leadIntelligence.contactQuality ?? null,
        }
      : null,
    sale: d.saleStatus && d.saleStatus !== "none"
      ? {
          status: d.saleStatus,
          statusLabel: d.saleStatusLabel ?? null,
          valueLabel: fmtMoneyMobile(d.saleValue),
          commissionLabel: d.commissionStatusLabel ?? null,
          commissionValueLabel: d.commissionAmount != null ? fmtMoneyMobile(d.commissionAmount) : null,
          commissionDueAt: d.commissionDueAt ?? null,
          commissionRecurring: d.commissionRecurring ?? null,
          commissionNote: d.commissionNote ?? null,
          setupLabel: d.setupValue != null && d.setupValue > 0
            ? `${fmtMoneyMobile(d.setupValue)}${d.setupCommissionAmount != null ? ` · comissão: ${fmtMoneyMobile(d.setupCommissionAmount)}` : ""}`
            : null,
          setupValue: d.setupValue ?? null,
          setupCommissionAmount: d.setupCommissionAmount ?? null,
          setupCommissionStatusLabel: d.setupCommissionStatusLabel ?? null,
        }
      : null,
    history: d.timeline?.map(ev => ({
      id: ev.id,
      title: ev.title ?? "Atualização",
      description: ev.description,
      resultLabel: ev.resultLabel,
      returnAt: ev.returnAt,
      createdAt: ev.createdAt,
    })) ?? null,
  };
}
