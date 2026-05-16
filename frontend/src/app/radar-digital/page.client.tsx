"use client";

import { type FocusEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxMobileDock from "@/components/mobile/HbxMobileDock";
import {
  HbxAdvancedFilters,
  HbxStateCityPicker,
  HbxTargetTypeSelector,
  type HbxEngineValue,
  type HbxAdvancedFiltersValue,
  type HbxTargetTypeValue,
} from "@/components/prospecting-filters";
import { apiFetch, type ApiFetchError } from "@/app/_lib/api";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { clearTopbarProgress, dispatchTopbarProgress } from "@/lib/topbar-progress";
import {
  clearStoredRadarRun,
  readStoredRadarRun,
  saveStoredRadarRun,
} from "@/lib/radar-active-run";
import { commercialPlanByKey, type CommercialPlansPayload } from "@/lib/commercial-plans";
import { BRAZIL_CITIES_BY_STATE, BRAZIL_STATES } from "@/lib/brazil-locations";
import { HBX_SEGMENT_SUGGESTIONS } from "@/lib/hbx-segment-suggestions";
import styles from "./page.module.css";

type RadarLeadHistory = {
  id: string;
  eventType: string;
  note?: string | null;
  createdAt?: string | null;
};

type RadarLead = {
  id: string;
  name: string;
  phone?: string | null;
  phoneDigits?: string | null;
  ddd?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  websiteStatus?: string | null;
  email?: string | null;
  emailStatus?: "confirmed" | "probable" | "missing" | "invalid" | "unverified" | string | null;
  emailSource?: string | null;
  emailConfidence?: number | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  socialStatus?: string | null;
  googleMapsUrl?: string | null;
  businessCategory?: string | null;
  openingHoursStatus?: string | null;
  recommendedChannel?: "whatsapp" | "email" | "call" | "review" | "discard" | string | null;
  painType?: string | null;
  painLabel?: string | null;
  painPitch?: string | null;
  enrichmentScore?: number | null;
  enrichmentConfidence?: number | null;
  enrichmentJson?: Record<string, unknown> | string | null;
  lastEnrichedAt?: string | null;
  enrichmentVersion?: string | null;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
  rating?: number | null;
  reviews?: number | null;
  sourceUrl?: string | null;
  source?: string | null;
  sourceEngine?: string | null;
  sourceEngines?: string[];
  status?: string | null;
  companyStatus?: string | null;
  ownershipStatus?: "available" | "mine" | "in_attendance" | "negative" | string | null;
  ownerCompanyId?: number | null;
  claimedAt?: string | null;
  historySummary?: RadarLeadHistory[];
  lastSeenAt?: string | null;
  firstSeenAt?: string | null;
  whatsappStatus?: "confirmed" | "missing" | "unverified" | string | null;
  whatsappCheckStatus?: "confirmed" | "missing" | "unverified" | string | null;
};

type RadarLeadsResponse = {
  items: RadarLead[];
  total: number;
  code?: string;
  message?: string;
  retryable?: boolean;
  meta?: {
    available?: boolean;
    message?: string;
    page?: number;
    limit?: number;
    availableFilters?: RadarAvailableFilters;
    enrichmentSummary?: RadarEnrichmentSummary;
  };
};

type RadarEnrichmentSummary = {
  cardsAnalyzed?: number;
  whatsappVerified?: number;
  emailConfirmedOrProbable?: number;
  noWebsite?: number;
  highPriority?: number;
  discardedOrBlocked?: number;
  readyToCall?: number;
};

type RadarQualitySummary = {
  found?: number;
  approved?: number;
  rejected?: number;
  discarded?: number;
  durationMs?: number | null;
  label?: string | null;
};

type RadarPullResponse = {
  items: RadarLead[];
  code?: string;
  message?: string;
  retryable?: boolean;
  meta?: {
    requestedQuantity?: number;
    deliveredCount?: number;
    replenish?: {
      ran?: boolean;
      fetchedCount?: number;
      errorMessage?: string;
    };
  };
};

type RadarSearchRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial_error"
  | "completed_insufficient_results"
  | "failed"
  | "canceled";

type RadarSearchRunResponse = RadarPullResponse & {
  id: string;
  runId: string;
  status: RadarSearchRunStatus;
  total?: number;
  targetQuantity: number;
  foundCount: number;
  errorMessage?: string | null;
  meta?: RadarPullResponse["meta"] & {
    databaseCount?: number;
    fetchedCount?: number;
    progress?: number;
    terminal?: boolean;
    status?: RadarSearchRunStatus;
    runId?: string;
    nextRetryAt?: string | null;
    attemptCount?: number;
    autoImport?: {
      ran?: boolean;
      importedCount?: number;
      processedCount?: number;
      pendingCount?: number | null;
      remaining?: number | null;
      blocked?: boolean;
    } | null;
    filters?: {
      state?: string | null;
      city?: string | null;
      segment?: string | null;
      targetType?: HbxTargetTypeValue | string | null;
    };
    qualitySummary?: RadarQualitySummary;
  };
};

type RadarLeadDetailResponse = RadarLead | { item?: RadarLead | null; events?: RadarLeadHistory[] };
type RadarWhatsappCheckMode = "off" | "enrich" | "only_valid";

type ImportToVendasResponse = {
  ok: boolean;
  createdCount: number;
  updatedCount: number;
  skippedWithoutWhatsapp?: number;
  message?: string;
};

type RadarEnrichResponse = {
  ok?: boolean;
  message?: string;
  item?: RadarLead | null;
};

type VendasPendingSummary = {
  ok?: boolean;
  limit?: number;
  pendingCount?: number;
  remaining?: number;
  blocked?: boolean;
  message?: string | null;
};

type RadarFilterOption = {
  value: string;
  label: string;
  count: number;
};

type RadarAvailableFilters = {
  states?: RadarFilterOption[];
  citiesByState?: Record<string, RadarFilterOption[]>;
  segments?: RadarFilterOption[];
};

type FilterState = {
  state: string;
  city: string;
  segment: string;
  quantity: number;
  engine: HbxEngineValue;
  targetType: HbxTargetTypeValue;
  ddd: string;
  scoreRange: string;
  noWebsite: boolean;
  withWebsite: boolean;
  highOpportunity: boolean;
  minRating: string;
  minReviews: string;
  status: string;
};

const PAGE_SIZE = 100;
const RADAR_PROGRESS_STEPS = ["lendo banco", "filtrando negativos", "selecionando melhores cards", "alimentando Vendas/Prospecção"];
const MOBILE_RADAR_SEARCH_NOTICE_DISMISSED_KEY = "hbx.radar.mobile.searchNoticeDismissed.v1";

const DEFAULT_FILTERS: FilterState = {
  state: "",
  city: "",
  segment: "",
  quantity: 20,
  engine: "hbx",
  targetType: "pj",
  ddd: "",
  scoreRange: "",
  noWebsite: false,
  withWebsite: false,
  highOpportunity: false,
  minRating: "",
  minReviews: "",
  status: "",
};

type RadarSegmentGroup = {
  key: string;
  label: string;
  segments: string[];
};

const MAX_RADAR_SEGMENT_SELECTIONS = 5;
const RADAR_SEGMENT_GROUPS: RadarSegmentGroup[] = [
  {
    key: "saude",
    label: "Saúde e bem-estar",
    segments: [
      "academias",
      "clínicas médicas",
      "clínicas odontológicas",
      "clínicas veterinárias",
      "farmácias",
      "laboratórios",
      "quadras esportivas",
      "serviços médicos",
      "serviços odontológicos",
      "yoga e pilates",
    ],
  },
  {
    key: "alimentacao",
    label: "Alimentação",
    segments: [
      "açougues",
      "alimentos naturais",
      "bares",
      "buffets",
      "cafeterias",
      "casa de carnes",
      "confeitarias",
      "depósitos de bebidas",
      "docerias",
      "lanchonetes",
      "mercados",
      "panificadoras",
      "pizzarias",
      "restaurantes",
      "supermercados",
    ],
  },
  {
    key: "beleza",
    label: "Beleza",
    segments: [
      "barbearias",
      "clínicas de estética",
      "cosméticos",
      "perfumarias",
      "salões de beleza",
    ],
  },
  {
    key: "construcao",
    label: "Casa e construção",
    segments: [
      "aluguel de equipamentos",
      "construtoras",
      "elétricas",
      "energia solar",
      "engenharias",
      "escritórios de arquitetura",
      "ferragens",
      "instaladoras",
      "lojas de tintas",
      "madeireiras",
      "manutenção predial",
      "marcenarias",
      "materiais de construção",
      "marmorarias",
      "serralherias",
      "vidraçarias",
    ],
  },
  {
    key: "servicos",
    label: "Serviços locais",
    segments: [
      "alarmes e segurança",
      "chaveiros",
      "dedetizadoras",
      "funerárias",
      "lavanderias",
      "serviços de limpeza",
      "serviços terceirizados",
      "sistemas de segurança",
      "vigilância",
      "zeladoria",
    ],
  },
  {
    key: "automotivo",
    label: "Automotivo",
    segments: [
      "acessórios automotivos",
      "auto elétricas",
      "auto escolas",
      "auto peças",
      "borracharias",
      "centros automotivos",
      "concessionárias",
      "despachantes",
      "estacionamentos",
      "lava rápidos",
      "mecânicas",
      "oficinas mecânicas",
      "postos de combustível",
      "revendas de veículos",
      "vistorias veiculares",
    ],
  },
  {
    key: "educacao",
    label: "Educação",
    segments: [
      "colégios",
      "cursos profissionalizantes",
      "educação infantil",
      "escolas",
      "papelarias",
      "universidades",
      "xérox e copiadoras",
    ],
  },
  {
    key: "varejo",
    label: "Varejo",
    segments: [
      "bicicletarias",
      "bijuterias",
      "calçados",
      "comércio varejista",
      "e-commerce",
      "eletrodomésticos",
      "eletrônicas",
      "floriculturas",
      "joalherias",
      "lojas de brinquedos",
      "lojas de celulares",
      "lojas de colchões",
      "lojas de conveniência",
      "lojas de eletrônicos",
      "lojas de móveis",
      "lojas de roupas",
      "moda feminina",
      "moda masculina",
      "ótica",
      "pet shops",
      "uniformes",
    ],
  },
  {
    key: "negocios",
    label: "Negócios",
    segments: [
      "advocacias",
      "contabilidades",
      "consultorias empresariais",
      "corretoras de seguros",
      "coworkings",
      "escritórios administrativos",
      "financeiras",
      "imobiliárias",
      "lotéricas",
      "serviços contábeis",
      "serviços jurídicos",
    ],
  },
  {
    key: "digital",
    label: "Digital",
    segments: [
      "agências de marketing",
      "estúdios de fotografia",
      "gráficas",
      "informática",
      "lojas de celulares",
      "lojas de eletrônicos",
      "provedores de internet",
      "serviços gráficos",
      "telecomunicações",
      "web design",
    ],
  },
  {
    key: "turismo_eventos",
    label: "Turismo e eventos",
    segments: [
      "agências de turismo",
      "casas de festas",
      "eventos",
      "hospedagens",
      "hotéis",
      "motéis",
      "turismo",
    ],
  },
  {
    key: "industria",
    label: "Indústria",
    segments: [
      "agronegócios",
      "distribuidoras",
      "fornecedoras industriais",
      "indústrias alimentícias",
      "indústrias metalúrgicas",
      "metalúrgicas",
      "químicas",
      "transportadoras",
      "usinagem",
    ],
  },
];

function normalizeSegmentLabel(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitRadarSegments(value?: string | null) {
  return uniqueStrings(String(value || "").split(",").map(normalizeSegmentLabel));
}

function joinRadarSegments(values: string[]) {
  return uniqueStrings(values).slice(0, MAX_RADAR_SEGMENT_SELECTIONS).join(", ");
}

function buildRadarCategorySegmentValue(group: RadarSegmentGroup) {
  return uniqueStrings(group.segments).join(", ");
}

function resolveRadarCategory(value?: string | null) {
  const raw = normalizeSegmentLabel(String(value || ""));
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  const direct = RADAR_SEGMENT_GROUPS.find((group) => group.label.toLowerCase() === normalized);
  if (direct) return direct;
  const selected = new Set(splitRadarSegments(raw).map((item) => item.toLowerCase()));
  return RADAR_SEGMENT_GROUPS.find((group) =>
    group.segments.length > 0 && group.segments.every((segment) => selected.has(segment.toLowerCase())),
  ) || null;
}

function isRadarCategoryValue(value: string) {
  return Boolean(resolveRadarCategory(value));
}

function radarSegmentSummary(value?: string | null) {
  const raw = normalizeSegmentLabel(String(value || ""));
  if (!raw) return "";
  const category = resolveRadarCategory(raw);
  if (category) return category.label;
  const segments = splitRadarSegments(raw);
  if (segments.length <= 1) return segments[0] || raw;
  return `${segments[0]} +${segments.length - 1}`;
}

function inferRadarSegmentCategory(value?: string | null) {
  const raw = normalizeSegmentLabel(String(value || ""));
  if (!raw) return RADAR_SEGMENT_GROUPS[0]?.key || "";
  const category = resolveRadarCategory(raw);
  if (category) return category.key;
  const selected = splitRadarSegments(raw).map((item) => item.toLowerCase());
  return RADAR_SEGMENT_GROUPS.find((group) =>
    group.segments.some((segment) => selected.includes(segment.toLowerCase())),
  )?.key || RADAR_SEGMENT_GROUPS[0]?.key || "";
}

function buildSegmentGroups(availableSegments: string[]) {
  const known = new Set(
    RADAR_SEGMENT_GROUPS.flatMap((group) => [group.label, ...group.segments]).map((item) => item.toLowerCase()),
  );
  const extras = uniqueStrings(availableSegments)
    .filter((segment) => !known.has(segment.toLowerCase()))
    .slice(0, 24);
  return extras.length
    ? [...RADAR_SEGMENT_GROUPS, { key: "sugestoes", label: "Sugestões", segments: extras }]
    : RADAR_SEGMENT_GROUPS;
}

function formatPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "Telefone não informado";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(value?: string | null) {
  const status = String(value || "clean").toLowerCase();
  if (status === "clean" || status === "new") return "Novo";
  if (status === "reserved") return "Reservado";
  if (status === "approved") return "Aprovado";
  if (status === "delivered") return "Recebido";
  if (status === "sent_to_vendas" || status === "imported_to_vendas") return "Em Vendas";
  if (status === "in_attendance" || status === "em_atendimento") return "Em atendimento";
  if (status === "converted" || status === "won") return "Convertido";
  if (status === "contacted") return "Contato feito";
  if (status === "no_answer") return "Não atendeu";
  if (status === "no_whatsapp" || status === "invalid_whatsapp") return "Contato inválido";
  if (status === "denied" || status === "negative") return "Negativo";
  if (status === "blocked") return "Bloqueado";
  if (status === "opt_out" || status === "optout") return "Opt-out";
  if (status === "complaint") return "Reclamação";
  if (status === "hidden" || status === "discarded") return "Descartado";
  return value || "Novo";
}

function ownershipBadge(lead: RadarLead) {
  const status = String(lead.ownershipStatus || "").toLowerCase();
  const leadStatus = String(lead.companyStatus || lead.status || "").toLowerCase();
  if (status === "negative" || ["negative", "denied", "blocked", "opt_out", "optout", "complaint", "discarded", "hidden"].includes(leadStatus)) {
    return { label: "Negativo", tone: "negative" };
  }
  if (status === "in_attendance" || ["sent_to_vendas", "imported_to_vendas", "in_attendance"].includes(leadStatus)) {
    return { label: "Em atendimento", tone: "attendance" };
  }
  if (status === "mine" || lead.ownerCompanyId) {
    return { label: "Na minha carteira", tone: "mine" };
  }
  return { label: "Disponível", tone: "available" };
}

function emailLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "confirmed") return "E-mail confirmado";
  if (status === "probable") return "E-mail provável";
  if (status === "invalid") return "E-mail inválido";
  if (status === "unverified") return "E-mail sem validar";
  return "E-mail ausente";
}

function channelLabel(value?: string | null) {
  const channel = String(value || "").toLowerCase();
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "email") return "E-mail";
  if (channel === "call") return "Ligação";
  if (channel === "discard") return "Não chamar";
  return "Revisar";
}

function emailTrustBadge(lead: RadarLead) {
  const status = String(lead.emailStatus || "").toLowerCase();
  const source = String(lead.emailSource || "").toLowerCase();
  if (status === "confirmed") return { label: "E-mail confirmado", tone: "success", shortLabel: "Confirmado" };
  if (status === "probable" && source === "inferred") return { label: "E-mail inferido", tone: "warning", shortLabel: "Inferido" };
  if (status === "probable") return { label: "E-mail provável", tone: "warning", shortLabel: "Provável" };
  if (status === "invalid") return { label: "E-mail inválido", tone: "danger", shortLabel: "Inválido" };
  if (status === "unverified") return { label: "E-mail não verificado", tone: "neutral", shortLabel: "Não verificado" };
  return { label: "E-mail ausente", tone: "neutral", shortLabel: "Ausente" };
}

function whatsappTrustBadge(lead: RadarLead) {
  const status = String(lead.whatsappStatus || lead.whatsappCheckStatus || "").toLowerCase();
  if (status === "confirmed") return { label: "WhatsApp verificado", tone: "success", shortLabel: "Confirmado" };
  if (status === "missing") return { label: "WhatsApp ausente", tone: "danger", shortLabel: "Ausente" };
  if (status === "invalid") return { label: "WhatsApp inválido", tone: "danger", shortLabel: "Inválido" };
  return { label: "WhatsApp não verificado", tone: "neutral", shortLabel: "Não verificado" };
}

function websiteTrustBadge(lead: RadarLead) {
  const status = String(lead.websiteStatus || "").toLowerCase();
  if (status === "none") return { label: "Sem site", tone: "warning" };
  if (status === "weak" || status === "social_only") return { label: "Site fraco", tone: "warning" };
  if (status === "present") return { label: "Site encontrado", tone: "success" };
  return { label: "Site não verificado", tone: "neutral" };
}

function compactLeadReason(lead: RadarLead) {
  if (lead.recommendedChannel === "discard") return "Não chamar: card protegido por negativo, bloqueio ou descarte.";
  if (lead.opportunityReason) return lead.opportunityReason;
  if (lead.painType === "sem_site") return "Boa oportunidade: presença digital fraca e contato acionável.";
  if (lead.recommendedChannel === "whatsapp") return "Boa oportunidade: contato acionável pelo WhatsApp.";
  if (lead.recommendedChannel === "email") return "Boa oportunidade: caminho por e-mail para abordagem inicial.";
  return "Boa oportunidade: revisar sinais e escolher o melhor canal.";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const label = String(value || "").replace(/\s+/g, " ").trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

function uniqueByLabel<T extends { label: string }>(items: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = String(item.label || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildSmartChips(lead: RadarLead, max = 3) {
  const website = websiteTrustBadge(lead);
  const score = Number(lead.enrichmentScore || lead.opportunityScore || 0);
  const socialFound = Boolean(lead.instagramUrl || lead.facebookUrl || String(lead.socialStatus || "").toLowerCase() === "found");
  return uniqueByLabel([
    score >= 70 ? { label: "Alta oportunidade", tone: "success" } : null,
    lead.painLabel ? { label: lead.painLabel, tone: website.tone } : null,
    { label: website.label, tone: website.tone },
    socialFound ? { label: "Rede social", tone: "success" } : null,
    Number(lead.rating || 0) >= 4.2 ? { label: "Boa avaliação", tone: "success" } : null,
  ].filter(Boolean) as Array<{ label: string; tone: string }>).slice(0, max);
}

function buildWhyCallSignals(lead: RadarLead) {
  return uniqueStrings([
    lead.painLabel || null,
    websiteTrustBadge(lead).label,
    lead.rating ? `Nota ${Number(lead.rating).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : null,
    lead.reviews ? `${Number(lead.reviews).toLocaleString("pt-BR")} avaliações` : null,
    lead.businessCategory || lead.segment || null,
  ]).slice(0, 5);
}

function buildRadarDraftMessage(lead: RadarLead) {
  return lead.painPitch
    || lead.opportunityReason
    || `Olá, tudo bem? Vi ${lead.name || "sua empresa"} e queria te mostrar uma forma simples de organizar contatos e oportunidades pelo WhatsApp.`;
}

function radarCommercialRank(lead: RadarLead) {
  const status = String(lead.companyStatus || lead.status || "").toLowerCase();
  if (["negative", "denied", "blocked", "opt_out", "optout", "complaint", "discarded", "hidden"].includes(status)) return -10000;
  const channel = String(lead.recommendedChannel || "").toLowerCase();
  const whatsapp = String(lead.whatsappStatus || lead.whatsappCheckStatus || "").toLowerCase();
  const email = String(lead.emailStatus || "").toLowerCase();
  const emailSource = String(lead.emailSource || "").toLowerCase();
  const channelWeight: Record<string, number> = { whatsapp: 650, email: 540, call: 390, review: 180, discard: -1000 };
  const whatsappWeight: Record<string, number> = { confirmed: 120, unverified: 20, missing: -80, invalid: -120 };
  const emailWeight: Record<string, number> = { confirmed: 90, probable: emailSource === "inferred" ? 58 : 70, unverified: 12, missing: 0, invalid: -80 };
  const negativePenalty = Number(lead.ownershipStatus === "negative") * 250;
  return (
    (channelWeight[channel] || 0)
    + (whatsappWeight[whatsapp] || 0)
    + (emailWeight[email] || 0)
    + Math.max(0, Number(lead.enrichmentScore || lead.opportunityScore || 0)) * 2
    + Math.min(80, Number(lead.reviews || 0))
    - negativePenalty
  );
}

function sortRadarLeadsForSales(left: RadarLead, right: RadarLead) {
  const rankDelta = radarCommercialRank(right) - radarCommercialRank(left);
  if (rankDelta !== 0) return rankDelta;
  return String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
}

function opportunityLabel(score?: number | null) {
  const safeScore = Math.max(0, Math.min(100, Math.trunc(Number(score || 0))));
  if (safeScore >= 70) return "Alta oportunidade";
  if (safeScore >= 45) return "Atenção";
  return "Baixa oportunidade";
}

function topbarProgressPercentFrom(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function mergeRadarLeads(items: RadarLead[]) {
  const seen = new Set<string>();
  const merged: RadarLead[] = [];
  for (const item of items) {
    const key = String(item.id || item.phoneDigits || item.phone || `${item.name}:${item.city}`).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function radarLeadSignature(item: RadarLead) {
  return JSON.stringify({
    id: item.id,
    name: item.name,
    phone: item.phone,
    phoneDigits: item.phoneDigits,
    city: item.city,
    state: item.state,
    segment: item.segment,
    websiteStatus: item.websiteStatus,
    email: item.email,
    emailStatus: item.emailStatus,
    recommendedChannel: item.recommendedChannel,
    painType: item.painType,
    painLabel: item.painLabel,
    enrichmentScore: item.enrichmentScore,
    enrichmentConfidence: item.enrichmentConfidence,
    whatsappStatus: item.whatsappStatus,
    opportunityScore: item.opportunityScore,
    opportunityReason: item.opportunityReason,
    status: item.status,
    companyStatus: item.companyStatus,
    ownershipStatus: item.ownershipStatus,
  });
}

function radarLeadListEqual(left: RadarLead[], right: RadarLead[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((item, index) => radarLeadSignature(item) === radarLeadSignature(right[index]));
}

function radarRunPayloadEqual(left: RadarSearchRunResponse | null, right: RadarSearchRunResponse | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isMobileRadarViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
}

function eventLabel(value?: string | null) {
  const type = String(value || "").toLowerCase();
  if (type === "found") return "Encontrado";
  if (type === "imported_to_vendas") return "Enviado para Vendas";
  if (type === "contacted") return "Contato feito";
  if (type === "denied" || type === "negative") return "Negativo";
  if (type === "blocked") return "Bloqueado";
  if (type === "opt_out") return "Opt-out";
  if (type === "hidden" || type === "discarded") return "Descartado";
  if (type === "no_answer") return "Não atendeu";
  return value || "Atualização";
}

function buildLeadQuery(filters: FilterState, page: number) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
  });
  if (filters.state) params.set("state", filters.state);
  if (filters.city) params.set("city", filters.city);
  if (filters.segment.trim()) params.set("segment", filters.segment.trim());
  if (filters.targetType && filters.targetType !== "both") params.set("targetType", filters.targetType);
  if (filters.engine) params.set("engine", filters.engine);
  if (filters.ddd.trim()) params.set("ddd", filters.ddd.replace(/\D/g, "").slice(0, 2));
  if (filters.scoreRange) params.set("scoreRange", filters.scoreRange);
  if (filters.status) params.set("status", filters.status);
  if (filters.noWebsite) params.set("noWebsite", "true");
  if (filters.withWebsite) params.set("withWebsite", "true");
  if (filters.highOpportunity) params.set("highOpportunity", "true");
  if (filters.minRating.trim()) params.set("minRating", filters.minRating.trim());
  if (filters.minReviews.trim()) params.set("minReviews", filters.minReviews.trim());
  return params.toString();
}

function compactRadarMessage(message: string | null) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (text.toLowerCase().includes("cidade e segmento")) {
    return "Escolha cidade e segmento para buscar cards. Para histórico, clique em Pesquisar sem filtros.";
  }
  if (/nenhum|sem cards|no results|insufficient/i.test(text)) {
    return "Não achei cards suficientes para esse filtro. Tente segmento mais amplo ou cidade próxima.";
  }
  return text;
}

function radarFriendlyError(error: unknown) {
  const apiError = error as ApiFetchError;
  if (apiError?.code === "MODULE_ACCESS_DENIED" || apiError?.status === 403) {
    return "Acesso ao Radar Digital indisponível para este usuário. Verifique a liberação do módulo.";
  }
  if (apiError?.code === "NO_ENGINE_AVAILABLE") {
    return "A busca entrou na fila. Tente novamente em instantes.";
  }
  if (apiError?.code === "RADAR_STOCK_EMPTY") {
    return "Não achei cards suficientes para esse filtro. Tente segmento mais amplo ou cidade próxima.";
  }
  if (apiError?.code === "RADAR_NO_RESULTS") {
    return "Não achei cards suficientes para esse filtro. Tente segmento mais amplo ou cidade próxima.";
  }
  if (apiError?.status && apiError.status >= 500) {
    return "Radar temporariamente indisponível. Tente novamente em instantes.";
  }
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Conexão instável com o Radar. Tente atualizar em instantes.";
  }
  if (/tempo esgotado|timeout/i.test(message)) {
    return "A busca demorou mais que o esperado. Tente novamente em instantes.";
  }
  if (/internal server error|forbidden|unauthorized/i.test(message)) {
    return "Radar temporariamente indisponível. Tente novamente em instantes.";
  }
  return message || "Não foi possível concluir a operação agora.";
}

function normalizeDetailLead(payload: RadarLeadDetailResponse): RadarLead | null {
  if (payload && "item" in payload) return payload.item || null;
  return payload as RadarLead;
}

function leadMatchesSearch(lead: RadarLead, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    lead.id,
    lead.name,
    lead.phone,
    lead.phoneDigits,
    lead.ddd,
    lead.city,
    lead.state,
    lead.segment,
    lead.website,
    lead.status,
    lead.companyStatus,
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(needle);
}

function hasHistoryFilters(filters: FilterState, generalSearch: string) {
  return Boolean(
    generalSearch.trim()
    || filters.state.trim()
    || filters.city.trim()
    || filters.segment.trim()
    || filters.ddd.trim()
    || filters.scoreRange
    || filters.noWebsite
    || filters.withWebsite
    || filters.highOpportunity
    || filters.minRating.trim()
    || filters.minReviews.trim()
    || filters.targetType !== DEFAULT_FILTERS.targetType,
  );
}

function canPullWithFilters(filters: FilterState) {
  return Boolean(filters.city.trim() && filters.segment.trim());
}

function hasPartialRadarSearch(filters: FilterState) {
  const hasCity = Boolean(filters.city.trim());
  const hasSegment = Boolean(filters.segment.trim());
  return hasCity !== hasSegment;
}

function isTerminalRadarRun(status?: string | null) {
  return ["completed", "partial_error", "completed_insufficient_results", "failed", "canceled"].includes(String(status || ""));
}

function mobileRadarEngineLabel(value: string) {
  return value === "google" ? "Google" : "HBX";
}

type MobilePickerOption = {
  value: string;
  label?: string;
};

function MobilePickerButton({
  label,
  value,
  placeholder,
  disabled,
  helper,
  onClick,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  disabled?: boolean;
  helper?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.mobilePickerButton}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value || placeholder}</strong>
      {helper ? <small>{helper}</small> : null}
      <b aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.2 4.2" />
        </svg>
      </b>
    </button>
  );
}

function MobileFilterSheet({
  title,
  value,
  options,
  placeholder = "Pesquisar",
  allowCustom = false,
  onSelect,
  onClose,
}: {
  title: string;
  value: string;
  options: MobilePickerOption[];
  placeholder?: string;
  allowCustom?: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
  }, [searchOpen]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const base = uniqueByLabel(
      options.map((option) => ({
        ...option,
        label: option.label || option.value,
      })),
    );
    if (!normalized) return base.slice(0, 80);
    return base
      .filter((option) => String(option.label || "").toLowerCase().includes(normalized) || option.value.toLowerCase().includes(normalized))
      .slice(0, 80);
  }, [options, query]);

  const customValue = query.trim();

  return (
    <div className={styles.mobilePickerPanel} role="presentation" onClick={onClose}>
      <section
        className={styles.mobilePickerSheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.mobilePickerHeader}>
          <strong>{title}</strong>
          <div className={styles.mobilePickerActions}>
            <button type="button" aria-label="Pesquisar" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4.2 4.2" />
              </svg>
            </button>
            <button type="button" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {searchOpen ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
          />
        ) : null}
        <div className={styles.mobilePickerList}>
          <button
            type="button"
            data-active={!value ? "true" : "false"}
            onClick={() => {
              onSelect("");
              onClose();
            }}
          >
            Limpar seleção
          </button>
          {allowCustom && customValue && !filteredOptions.some((option) => option.value.toLowerCase() === customValue.toLowerCase()) ? (
            <button
              type="button"
              onClick={() => {
                onSelect(customValue);
                onClose();
              }}
            >
              Usar {`"${customValue}"`}
            </button>
          ) : null}
          {filteredOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              data-active={option.value === value ? "true" : "false"}
              onClick={() => {
                onSelect(option.value);
                onClose();
              }}
            >
              {option.label || option.value}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function RadarSegmentFunnel({
  value,
  availableSegments,
  onChange,
}: {
  value: string;
  availableSegments: string[];
  onChange: (value: string) => void;
}) {
  const groups = useMemo(() => buildSegmentGroups(availableSegments), [availableSegments]);
  const [activeGroupKey, setActiveGroupKey] = useState(() => inferRadarSegmentCategory(value));
  const [query, setQuery] = useState("");
  const resolvedActiveGroupKey = groups.some((group) => group.key === activeGroupKey) ? activeGroupKey : groups[0]?.key || "";
  const activeGroup = groups.find((group) => group.key === resolvedActiveGroupKey) || groups[0];
  const isCategory = isRadarCategoryValue(value);
  const selectedSegments = splitRadarSegments(value);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSegments = uniqueStrings(activeGroup?.segments || [])
    .filter((segment) => !normalizedQuery || segment.toLowerCase().includes(normalizedQuery));
  const canAddMore = selectedSegments.length < MAX_RADAR_SEGMENT_SELECTIONS;

  function toggleSegment(segment: string) {
    const normalized = normalizeSegmentLabel(segment);
    if (!normalized) return;
    const exists = selectedSegments.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      onChange(joinRadarSegments(selectedSegments.filter((item) => item.toLowerCase() !== normalized.toLowerCase())));
      return;
    }
    if (!canAddMore) return;
    onChange(joinRadarSegments([...selectedSegments, normalized]));
  }

  function useCategory() {
    if (!activeGroup) return;
    onChange(buildRadarCategorySegmentValue(activeGroup));
  }

  return (
    <div className={styles.segmentFunnel}>
      <div className={styles.segmentFunnelHeader}>
        <div>
          <span>Segmento</span>
          <strong>{radarSegmentSummary(value) || "Escolha uma categoria"}</strong>
        </div>
        <small>{isCategory ? "Categoria inteira" : `${selectedSegments.length}/${MAX_RADAR_SEGMENT_SELECTIONS} selecionados`}</small>
      </div>
      <div className={styles.segmentCategoryTabs} role="tablist" aria-label="Categorias de segmento">
        {groups.map((group) => (
          <button
            type="button"
            key={group.key}
            data-active={group.key === resolvedActiveGroupKey ? "true" : "false"}
            onClick={() => {
              setActiveGroupKey(group.key);
              setQuery("");
            }}
          >
            {group.label}
          </button>
        ))}
      </div>
      <div className={styles.segmentFunnelSearch}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Buscar em ${activeGroup?.label || "segmentos"}`}
        />
        {query.trim() ? (
          <button
            type="button"
            disabled={!canAddMore}
            onClick={() => {
              toggleSegment(query);
              setQuery("");
            }}
          >
            Usar
          </button>
        ) : (
          <button type="button" onClick={useCategory}>
            Usar categoria
          </button>
        )}
      </div>
      <div className={styles.segmentOptions}>
        {visibleSegments.map((segment) => {
          const active = selectedSegments.some((item) => item.toLowerCase() === segment.toLowerCase());
          return (
            <button
              type="button"
              key={segment}
              data-active={active ? "true" : "false"}
              disabled={!active && !canAddMore}
              onClick={() => toggleSegment(segment)}
            >
              {segment}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileSegmentSheet({
  value,
  availableSegments,
  onChange,
  onClose,
}: {
  value: string;
  availableSegments: string[];
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const groups = useMemo(() => buildSegmentGroups(availableSegments), [availableSegments]);
  const [activeGroupKey, setActiveGroupKey] = useState(() => inferRadarSegmentCategory(value));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resolvedActiveGroupKey = groups.some((group) => group.key === activeGroupKey) ? activeGroupKey : groups[0]?.key || "";
  const activeGroup = groups.find((group) => group.key === resolvedActiveGroupKey) || groups[0];
  const isCategory = isRadarCategoryValue(value);
  const selectedSegments = splitRadarSegments(value);
  const canAddMore = selectedSegments.length < MAX_RADAR_SEGMENT_SELECTIONS;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSegments = uniqueStrings(activeGroup?.segments || [])
    .filter((segment) => !normalizedQuery || segment.toLowerCase().includes(normalizedQuery));

  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
  }, [searchOpen]);

  function toggleSegment(segment: string) {
    const normalized = normalizeSegmentLabel(segment);
    if (!normalized) return;
    const exists = selectedSegments.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      onChange(joinRadarSegments(selectedSegments.filter((item) => item.toLowerCase() !== normalized.toLowerCase())));
      return;
    }
    if (!canAddMore) return;
    onChange(joinRadarSegments([...selectedSegments, normalized]));
  }

  return (
    <div className={styles.mobilePickerPanel} role="presentation" onClick={onClose}>
      <section
        className={styles.mobilePickerSheet}
        role="dialog"
        aria-modal="true"
        aria-label="Segmento"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.mobilePickerHeader}>
          <div>
            <strong>Segmento</strong>
            <small>{isCategory ? `${radarSegmentSummary(value)} inteiro` : `${selectedSegments.length}/${MAX_RADAR_SEGMENT_SELECTIONS} selecionados`}</small>
          </div>
          <div className={styles.mobilePickerActions}>
            <button type="button" aria-label="Pesquisar" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4.2 4.2" />
              </svg>
            </button>
            <button type="button" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {searchOpen ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar ou digitar segmento"
          />
        ) : null}
        <div className={styles.mobileSegmentCategories}>
          {groups.map((group) => (
            <button
              type="button"
              key={group.key}
              data-active={group.key === resolvedActiveGroupKey ? "true" : "false"}
              onClick={() => {
                setActiveGroupKey(group.key);
                setQuery("");
              }}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className={styles.mobileSegmentToolbar}>
          <button type="button" onClick={() => onChange("")}>
            Limpar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeGroup) return;
              onChange(buildRadarCategorySegmentValue(activeGroup));
              onClose();
            }}
          >
            Usar categoria
          </button>
          {query.trim() ? (
            <button
              type="button"
              disabled={!canAddMore}
              onClick={() => {
                toggleSegment(query);
                setQuery("");
              }}
            >
              Usar {`"${query.trim()}"`}
            </button>
          ) : null}
        </div>
        <div className={styles.mobileSegmentOptions}>
          {visibleSegments.map((segment) => {
            const active = selectedSegments.some((item) => item.toLowerCase() === segment.toLowerCase());
            return (
              <button
                type="button"
                key={segment}
                data-active={active ? "true" : "false"}
                disabled={!active && !canAddMore}
                onClick={() => toggleSegment(segment)}
              >
                {segment}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MobileEngineToggle({
  value,
  onChange,
  className,
}: {
  value: HbxEngineValue;
  onChange: (value: HbxEngineValue) => void;
  className?: string;
}) {
  return (
    <div className={`${styles.engineToggle} ${className || ""}`} role="group" aria-label="Fonte de busca">
      {[
        { value: "hbx" as HbxEngineValue, label: "HBX" },
        { value: "google" as HbxEngineValue, label: "Google" },
      ].map((option) => (
        <button
          type="button"
          key={option.value}
          data-active={value === option.value ? "true" : "false"}
          onClick={() => onChange(option.value)}
        >
          <span aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

function readMobileRadarSearchNoticeDismissed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MOBILE_RADAR_SEARCH_NOTICE_DISMISSED_KEY) === "true";
}

function RadarMotionBackground() {
  const blips = [
    { left: 21, top: 32, delay: "0s" },
    { left: 74, top: 28, delay: "0.5s" },
    { left: 67, top: 70, delay: "1s" },
    { left: 32, top: 76, delay: "1.5s" },
    { left: 59, top: 44, delay: "2s" },
  ];

  return (
    <div className={styles.radarMotionBackdrop} aria-hidden="true">
      <div className={styles.radarMotionAura} />
      <div className={styles.radarMotionDisc}>
        <span className={styles.radarMotionCircle} data-ring="outer" />
        <span className={styles.radarMotionCircle} data-ring="one" />
        <span className={styles.radarMotionCircle} data-ring="two" />
        <span className={styles.radarMotionCircle} data-ring="three" />
        <span className={styles.radarMotionCircle} data-ring="four" />
        <span className={styles.radarMotionAxis} data-axis="vertical" />
        <span className={styles.radarMotionAxis} data-axis="horizontal" />
        <span className={styles.radarMotionSweep}>
          <span className={styles.radarMotionTrail} />
          <span className={styles.radarMotionCore} />
        </span>
        <span className={styles.radarMotionRing} />
        <span className={styles.radarMotionRingReverse} />
        {blips.map((blip) => (
          <span
            key={`${blip.left}:${blip.top}`}
            className={styles.radarMotionBlip}
            style={{ left: `${blip.left}%`, top: `${blip.top}%`, animationDelay: blip.delay }}
          >
            <i />
          </span>
        ))}
      </div>
      <span className={styles.radarMotionGlow} />
    </div>
  );
}

export default function RadarDigitalClientPage() {
  const hasToken = useRequireModule("webscraping");
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [generalSearch, setGeneralSearch] = useState("");
  const [appliedGeneralSearch, setAppliedGeneralSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [items, setItems] = useState<RadarLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [telonProgress, setTelonProgress] = useState(8);
  const [radarVisualCount, setRadarVisualCount] = useState(0);
  const [activeRun, setActiveRun] = useState<RadarSearchRunResponse | null>(null);
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlansPayload | null>(null);
  const [vendasPending, setVendasPending] = useState<VendasPendingSummary | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileAutoImportPending, setMobileAutoImportPending] = useState(false);
  const [mobileSearchNoticeOpen, setMobileSearchNoticeOpen] = useState(false);
  const [mobileSearchNoticeDismissed, setMobileSearchNoticeDismissed] = useState(readMobileRadarSearchNoticeDismissed);
  const [mobilePicker, setMobilePicker] = useState<"state" | "city" | "segment" | null>(null);
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);
  const [availableFilters, setAvailableFilters] = useState<RadarAvailableFilters>({
    states: [],
    citiesByState: {},
    segments: [],
  });
  const [enrichmentSummary, setEnrichmentSummary] = useState<RadarEnrichmentSummary | null>(null);
  const [qualitySummary, setQualitySummary] = useState<RadarQualitySummary | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const mobileSearchNoticeRef = useRef<HTMLElement | null>(null);
  const filterEditingRef = useRef(false);
  const filterEditingReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => leadMatchesSearch(item, appliedGeneralSearch)).sort(sortRadarLeadsForSales),
    [appliedGeneralSearch, items],
  );
  const highOpportunityCount = useMemo(
    () => visibleItems.filter((item) => Number(item.opportunityScore || 0) >= 70).length,
    [visibleItems],
  );
  const visibleEnrichmentSummary = useMemo<RadarEnrichmentSummary>(() => ({
    cardsAnalyzed: enrichmentSummary?.cardsAnalyzed ?? visibleItems.length,
    whatsappVerified: enrichmentSummary?.whatsappVerified ?? visibleItems.filter((item) => String(item.whatsappStatus || item.whatsappCheckStatus || "").toLowerCase() === "confirmed").length,
    emailConfirmedOrProbable: enrichmentSummary?.emailConfirmedOrProbable ?? visibleItems.filter((item) => ["confirmed", "probable"].includes(String(item.emailStatus || "").toLowerCase())).length,
    noWebsite: enrichmentSummary?.noWebsite ?? visibleItems.filter((item) => String(item.websiteStatus || "").toLowerCase() === "none").length,
    highPriority: enrichmentSummary?.highPriority ?? visibleItems.filter((item) => Number(item.enrichmentScore || item.opportunityScore || 0) >= 70).length,
    readyToCall: enrichmentSummary?.readyToCall ?? visibleItems.filter((item) => ["whatsapp", "email", "call"].includes(String(item.recommendedChannel || "").toLowerCase())).length,
    discardedOrBlocked: enrichmentSummary?.discardedOrBlocked ?? visibleItems.filter((item) => ownershipBadge(item).tone === "negative").length,
  }), [enrichmentSummary, visibleItems]);
  const hasLeadCapabilities = Boolean(
    commercialPlans?.current?.entitlements?.radar_premium ||
    commercialPlans?.current?.entitlements?.ai_sales_scripts ||
    commercialPlans?.current?.entitlements?.bot_ia,
  );
  const isHbxList = !hasLeadCapabilities && (
    commercialPlans?.current?.planKey === "hbx_lite" ||
    commercialPlans?.current?.selectedPlanKey === "hbx_lite"
  );
  const showSmartLeadCards = !isHbxList;
  const currentPlanKey = commercialPlans?.current?.selectedPlanKey || commercialPlans?.current?.planKey || null;
  const currentPlan = currentPlanKey ? commercialPlanByKey(commercialPlans, currentPlanKey) : null;
  const planCardsPerSearch = Math.max(0, Math.trunc(Number(currentPlan?.quotas?.cardsPerSearch || 0)));
  const radarQuantityLimit = planCardsPerSearch || (isHbxList ? 50 : 100);
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      quantity: radarQuantityLimit,
    }),
    [filters, radarQuantityLimit],
  );
  const activeRunTarget = Math.max(1, Number(activeRun?.targetQuantity || activeRun?.meta?.requestedQuantity || effectiveFilters.quantity || 1));
  const activeRunDelivered = Math.max(visibleItems.length, Number(activeRun?.meta?.deliveredCount || activeRun?.foundCount || 0));
  const activeRunProgress = activeRun
    ? Math.max(4, Math.min(100, Number(activeRun.meta?.progress || Math.round((activeRunDelivered / activeRunTarget) * 100))))
    : 0;
  const mobileQualityLine = useMemo(() => {
    const summary = qualitySummary || activeRun?.meta?.qualitySummary || null;
    const approved = Math.max(0, Math.trunc(Number(summary?.approved ?? visibleItems.length)));
    const rejected = Math.max(0, Math.trunc(Number(summary?.rejected ?? summary?.discarded ?? visibleEnrichmentSummary.discardedOrBlocked ?? 0)));
    if (!hasSearched || (!approved && !rejected)) return "";
    const parts = [`${approved.toLocaleString("pt-BR")} cards aprovados`];
    if (rejected > 0) parts.push(`${rejected.toLocaleString("pt-BR")} descartados por baixa qualidade`);
    return parts.join(" • ");
  }, [activeRun?.meta?.qualitySummary, hasSearched, qualitySummary, visibleEnrichmentSummary.discardedOrBlocked, visibleItems.length]);
  const queryRadarLeadId = String(searchParams.get("radarLeadId") || "").trim();

  function setFilterEditing(active: boolean) {
    if (filterEditingReleaseTimerRef.current) {
      clearTimeout(filterEditingReleaseTimerRef.current);
      filterEditingReleaseTimerRef.current = null;
    }
    if (active) {
      filterEditingRef.current = true;
      return;
    }
    filterEditingReleaseTimerRef.current = setTimeout(() => {
      filterEditingRef.current = false;
      filterEditingReleaseTimerRef.current = null;
    }, 700);
  }

  function handleFilterFormBlur(event: FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setFilterEditing(false);
  }

  useEffect(() => {
    return () => {
      if (filterEditingReleaseTimerRef.current) clearTimeout(filterEditingReleaseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    let cancelled = false;
    apiFetch<CommercialPlansPayload>("/commercial-plans/me", { requireAuth: true })
      .then((payload) => {
        if (!cancelled) setCommercialPlans(payload);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    let cancelled = false;
    apiFetch<VendasPendingSummary>("/vendas/pending-summary", {
      requireAuth: true,
      timeoutMs: 12000,
    })
      .then((payload) => {
        if (!cancelled) setVendasPending(payload);
      })
      .catch(() => {
        if (!cancelled) setVendasPending(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  useEffect(() => {
    if (filters.quantity <= radarQuantityLimit) return;
    setFilters((current) => ({ ...current, quantity: radarQuantityLimit }));
  }, [filters.quantity, radarQuantityLimit]);

  useEffect(() => {
    const nextState = String(searchParams.get("state") || "").trim();
    const nextCity = String(searchParams.get("city") || "").trim();
    const nextSegment = String(searchParams.get("segment") || "").trim();
    if (!nextState && !nextCity && !nextSegment) return;
    setFilters((current) => ({
      ...current,
      state: nextState || current.state,
      city: nextCity || current.city,
      segment: nextSegment || current.segment,
    }));
  }, [searchParams]);

  useEffect(() => {
    if (hasToken !== true || !queryRadarLeadId) return;
    let cancelled = false;
    async function loadLinkedLead() {
      setLoading(true);
      setError(null);
      try {
        const payload = await apiFetch<RadarLeadDetailResponse>(`/webscraping/radar/leads/${encodeURIComponent(queryRadarLeadId)}`, {
          requireAuth: true,
          timeoutMs: 15000,
        });
        if (cancelled) return;
        const lead = normalizeDetailLead(payload);
        setItems(lead ? [lead] : []);
        setTotal(lead ? 1 : 0);
        setPage(1);
        setHasSearched(true);
        setFeedback("Card aberto pelo Night Factory. Revise antes de enviar para Vendas.");
      } catch {
        if (!cancelled) setError("Não foi possível abrir este card do Radar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadLinkedLead();
    return () => {
      cancelled = true;
    };
  }, [hasToken, queryRadarLeadId]);

  const loadCards = useCallback(async (nextPage = 1, append = false, filtersOverride?: FilterState) => {
    const queryFilters = filtersOverride || appliedFilters;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const query = buildLeadQuery(queryFilters, nextPage);
      const payload = await apiFetch<RadarLeadsResponse>(`/webscraping/radar/leads?${query}`, {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setItems((current) => append ? mergeRadarLeads([...current, ...(payload.items || [])]) : payload.items || []);
      setTotal(Number(payload.total || 0));
      setAvailableFilters(payload.meta?.availableFilters || { states: [], citiesByState: {}, segments: [] });
      setEnrichmentSummary(payload.meta?.enrichmentSummary || null);
      if (!append) setQualitySummary(null);
      setPage(nextPage);
    } catch (err) {
      setError(radarFriendlyError(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!mobileSearchNoticeOpen) return;
    const timer = window.setTimeout(() => {
      mobileSearchNoticeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [mobileSearchNoticeOpen]);

  const telonBusy = hasToken === null || loading || loadingMore || searching || bulkSending || Boolean(actionId);

  useEffect(() => {
    if (!telonBusy) {
      setTelonProgress(8);
      setRadarVisualCount(0);
      return undefined;
    }

    setTelonProgress((current) => (current > 8 && current < 96 ? current : 8));
    if (isMobileRadarViewport()) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setTelonProgress((current) => {
        if (current >= 96) return 96;
        const distance = 96 - current;
        return Math.min(96, Math.round((current + Math.max(1.4, distance * 0.16)) * 10) / 10);
      });
    }, 360);

    return () => window.clearInterval(timer);
  }, [telonBusy]);

  useEffect(() => {
    if (!bulkSending) {
      setRadarVisualCount(0);
      return undefined;
    }
    const target = Math.max(1, Math.min(effectiveFilters.quantity, Math.max(1, visibleItems.length)));
    setRadarVisualCount(1);
    const timer = window.setInterval(() => {
      setRadarVisualCount((current) => Math.min(target, current + 1));
    }, 180);
    return () => window.clearInterval(timer);
  }, [bulkSending, effectiveFilters.quantity, visibleItems.length]);

  useEffect(() => {
    const metrics = [
      { label: "Cards", value: visibleItems.length.toLocaleString("pt-BR") },
      { label: "High", value: highOpportunityCount.toLocaleString("pt-BR") },
      { label: "Total", value: total.toLocaleString("pt-BR") },
    ];
    const errorMessage = compactRadarMessage(error);
    const activeStepIndex = Math.min(RADAR_PROGRESS_STEPS.length - 1, Math.floor(topbarProgressPercentFrom(telonProgress) / 25));
    const realCardFeed = visibleItems.slice(-4).map((item) => ({
      id: `radar:${item.id}`,
      title: item.name || "Card Radar",
      meta: [item.segment, item.city].filter(Boolean).join(" • ") || "Radar Digital",
      score: item.opportunityScore ?? undefined,
    }));

    if (errorMessage) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "warning",
        title: "Radar precisa de ajuste",
        status: errorMessage,
        progress: 100,
        metrics,
      });
      return;
    }

    if (feedback && !activeRun) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "success",
        title: "Radar atualizado",
        status: feedback,
        progress: 100,
        metrics,
      });
      return;
    }

    if (searching) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Radar pesquisando agora",
        status: canPullWithFilters(effectiveFilters)
          ? "Buscando contatos, filtrando negativos e preparando cards elegíveis."
          : "Listando histórico salvo do Radar.",
        progress: Math.max(18, telonProgress),
        steps: RADAR_PROGRESS_STEPS,
        activeStepIndex,
        cardFeed: realCardFeed,
        metrics: [
          { label: "Entregues", value: String(visibleItems.length) },
          { label: "Fonte", value: filters.engine === "google" ? "Google" : "HBX" },
          { label: "Tipo", value: effectiveFilters.targetType.toUpperCase() },
        ],
      });
      return;
    }

    if (bulkSending) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Enviando seleção para Vendas",
        status: "Alimentando Vendas/Prospecção com cards elegíveis da tela.",
        progress: Math.max(18, telonProgress),
        steps: RADAR_PROGRESS_STEPS,
        activeStepIndex: 3,
        cardFeed: visibleItems.slice(0, Math.max(1, radarVisualCount)).slice(-4).map((item) => ({
          id: `vendas:${item.id}`,
          title: item.name || "Card Radar",
          meta: [item.segment, item.city].filter(Boolean).join(" • ") || "Radar Digital",
          score: item.opportunityScore ?? undefined,
        })),
        metrics: [
          { label: "Selecionados", value: String(Math.min(visibleItems.length, effectiveFilters.quantity)) },
          { label: "High", value: highOpportunityCount.toLocaleString("pt-BR") },
          { label: "Destino", value: "Vendas" },
        ],
      });
      return;
    }

    if (loadingMore) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Carregando mais Radar",
        status: "Buscando o próximo lote de 100 cards.",
        progress: Math.max(18, telonProgress),
        metrics,
      });
      return;
    }

    if (loading || hasToken === null) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Carregando Radar Digital",
        status: "Preparando painel do Radar.",
        progress: Math.max(14, telonProgress),
        metrics,
      });
      return;
    }

    if (actionId) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Atualizando card do Radar",
        status: "Aplicando ação no card selecionado.",
        progress: Math.max(22, telonProgress),
        metrics,
      });
      return;
    }

    clearTopbarProgress("radar");
  }, [
    actionId,
    activeRun,
    bulkSending,
    effectiveFilters,
    error,
    feedback,
    filters.city,
    filters.engine,
    filters.segment,
    hasToken,
    highOpportunityCount,
    loading,
    loadingMore,
    radarVisualCount,
    searching,
    telonProgress,
    total,
    visibleItems,
  ]);

  useEffect(() => () => clearTopbarProgress("radar"), []);

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setGeneralSearch("");
    setAppliedGeneralSearch("");
    setHasSearched(false);
    setItems([]);
    setTotal(0);
    setPage(1);
    setActiveRun(null);
    activeRunIdRef.current = null;
    setSearching(false);
    setFeedback(null);
    setError(null);
    setQualitySummary(null);
    clearStoredRadarRun();
  }

  function updateAdvancedFilters(next: HbxAdvancedFiltersValue) {
    setFilters((current) => ({
      ...current,
      ddd: String(next.ddd || "").replace(/\D/g, "").slice(0, 2),
      scoreRange: String(next.scoreRange || ""),
      status: "",
      noWebsite: next.noWebsite === true,
      withWebsite: next.onlyWithWebsite === true,
      highOpportunity: next.highOpportunity === true,
      minRating: String(next.minRating || "").replace(/[^\d.,]/g, "").replace(",", ".").slice(0, 3),
      minReviews: String(next.minReviews || "").replace(/\D/g, "").slice(0, 5),
    }));
  }

  const applyRadarRunPayload = useCallback((payload: RadarSearchRunResponse) => {
    const runId = String(payload.runId || payload.id || "");
    if (!runId || !payload.status) {
      activeRunIdRef.current = null;
      setActiveRun(null);
      setSearching(false);
      setFeedback(payload.message || "A busca foi recebida, mas o Radar não retornou progresso detalhado agora.");
      return;
    }
    if (activeRunIdRef.current && runId && activeRunIdRef.current !== runId) return;

    const nextItems = payload.items || [];
    const payloadFilters = payload.meta?.filters;
    if (payloadFilters) {
      if (!filterEditingRef.current) {
        setFilters((current) => {
          const next = {
            ...current,
            state: payloadFilters.state || current.state,
            city: payloadFilters.city || current.city,
            segment: payloadFilters.segment || current.segment,
            targetType: (payloadFilters.targetType === "pf" || payloadFilters.targetType === "both" ? payloadFilters.targetType : "pj") as HbxTargetTypeValue,
            quantity: Math.max(1, Number(payload.targetQuantity || payload.meta?.requestedQuantity || current.quantity || 1)),
          };
          return JSON.stringify(current) === JSON.stringify(next) ? current : next;
        });
      }
      setAppliedFilters((current) => {
        const next = {
          ...current,
          state: payloadFilters.state || current.state,
          city: payloadFilters.city || current.city,
          segment: payloadFilters.segment || current.segment,
          targetType: (payloadFilters.targetType === "pf" || payloadFilters.targetType === "both" ? payloadFilters.targetType : "pj") as HbxTargetTypeValue,
          quantity: Math.max(1, Number(payload.targetQuantity || payload.meta?.requestedQuantity || current.quantity || 1)),
        };
        return JSON.stringify(current) === JSON.stringify(next) ? current : next;
      });
    }
    const nextLimit = Math.max(1, Number(payload.targetQuantity || payload.meta?.requestedQuantity || nextItems.length || 1));
    setItems((current) => {
      const merged = mergeRadarLeads([...current, ...nextItems]).slice(0, nextLimit);
      return radarLeadListEqual(current, merged) ? current : merged;
    });
    const nextTotal = Number(payload.targetQuantity || payload.meta?.requestedQuantity || payload.total || nextItems.length || 0);
    setTotal((current) => current === nextTotal ? current : nextTotal);
    setPage((current) => current === 1 ? current : 1);
    setHasSearched(true);
    const nextProgress = Math.max(12, Math.min(100, Number(payload.meta?.progress || 0) || 12));
    setTelonProgress((current) => current === nextProgress ? current : nextProgress);
    setQualitySummary(payload.meta?.qualitySummary || null);
    saveStoredRadarRun({
      runId,
      status: payload.status,
      city: payloadFilters?.city || null,
      state: payloadFilters?.state || null,
      segment: payloadFilters?.segment || null,
      targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || 0) || null,
      deliveredCount: Number(payload.meta?.deliveredCount || nextItems.length || 0) || 0,
    });

    const terminal = Boolean(payload.meta?.terminal) || isTerminalRadarRun(payload.status);
    if (terminal) {
      activeRunIdRef.current = null;
      setActiveRun((current) => current === null ? current : null);
      setSearching(false);
      if (payload.status === "canceled") {
        clearStoredRadarRun(runId);
      }
      const nextFeedback = payload.message || `${nextItems.length} card(s) entregues.`;
      setFeedback((current) => current === nextFeedback ? current : nextFeedback);
      return;
    }

    setActiveRun((current) => radarRunPayloadEqual(current, payload) ? current : payload);
    setSearching(true);
    const nextFeedback = payload.message || "Busca em andamento. Os cards aparecem conforme o Radar aprova novos contatos.";
    setFeedback((current) => current === nextFeedback ? current : nextFeedback);
  }, []);

  useEffect(() => {
    if (hasToken !== true || queryRadarLeadId) return;
    const stored = readStoredRadarRun();
    if (!stored?.runId) return;
    activeRunIdRef.current = stored.runId;
    setHasSearched(true);
    setSearching(!isTerminalRadarRun(stored.status));
    let cancelled = false;
    apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(stored.runId)}`, {
      requireAuth: true,
      timeoutMs: 15000,
    })
      .then((payload) => {
        if (!cancelled) applyRadarRunPayload(payload);
      })
      .catch(() => {
        if (!cancelled) {
          activeRunIdRef.current = null;
          clearStoredRadarRun(stored.runId);
          setSearching(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyRadarRunPayload, hasToken, queryRadarLeadId]);

  useEffect(() => {
    const runId = activeRun?.runId || activeRun?.id;
    if (!runId) return undefined;
    const intervalMs = isMobileRadarViewport() ? 6500 : 2200;
    return startSmartPolling(async () => {
      try {
        const payload = await apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`, {
          requireAuth: true,
          timeoutMs: 15000,
        });
        applyRadarRunPayload(payload);
      } catch (pollError) {
        activeRunIdRef.current = null;
        setActiveRun(null);
        setSearching(false);
        setError(radarFriendlyError(pollError));
      }
    }, {
      intervalMs,
      immediate: false,
      pauseWhenHidden: true,
    });
  }, [activeRun?.id, activeRun?.runId, applyRadarRunPayload]);

  async function runRadarSearch(
    whatsappCheckMode: RadarWhatsappCheckMode = "off",
    options?: { quantityOverride?: number },
  ) {
    setSearching(true);
    setError(null);
    setFeedback(null);
    setActiveRun(null);
    activeRunIdRef.current = null;
    setTelonProgress(12);
    setHasSearched(true);
    const nextFilters = {
      ...effectiveFilters,
      targetType: isMobileRadarViewport() ? "pj" : effectiveFilters.targetType,
      quantity: Math.max(1, Math.min(radarQuantityLimit, Number(options?.quantityOverride || radarQuantityLimit || 1))),
    };
    const nextGeneralSearch = generalSearch.trim();
    if (hasPartialRadarSearch(nextFilters)) {
      setSearching(false);
      setHasSearched(false);
      setError("Preencha cidade e segmento para pesquisar novos cards. Para ver histórico salvo, limpe esses campos.");
      return;
    }
    setAppliedFilters(nextFilters);
    setAppliedGeneralSearch(nextGeneralSearch);

    try {
      if (!canPullWithFilters(nextFilters)) {
        await loadCards(1, false, nextFilters);
        setFeedback(hasHistoryFilters(nextFilters, nextGeneralSearch)
          ? "Histórico filtrado carregado."
          : "Histórico do Radar carregado em lotes de 100.");
        return;
      }

      setItems([]);
      setTotal(0);
      setPage(1);
      clearStoredRadarRun();

      const targetType = nextFilters.targetType === "both" ? "pj" : nextFilters.targetType;
      const payload = await apiFetch<RadarSearchRunResponse>("/webscraping/radar/search-runs", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 20000,
        body: JSON.stringify({
          ...nextFilters,
          targetType,
          quantity: nextFilters.quantity,
          minimumStock: Math.max(1, Math.min(nextFilters.quantity, 10)),
          desiredStock: Math.max(1, nextFilters.quantity),
          whatsappCheckMode,
        }),
      });
      activeRunIdRef.current = payload.runId || payload.id || null;
      applyRadarRunPayload(payload);
    } catch (searchError) {
      activeRunIdRef.current = null;
      setActiveRun(null);
      setError(radarFriendlyError(searchError));
    } finally {
      if (!activeRunIdRef.current) setSearching(false);
    }
  }

  async function runLeadAction(
    lead: RadarLead,
    action: "send" | "hide" | "negative" | "csx" | "enrich",
  ) {
    if (action === "csx") {
      setFeedback("Registro CSX pendente de integração. O card não foi alterado.");
      return;
    }

    setActionId(`${lead.id}:${action}`);
    setError(null);
    try {
      if (action === "enrich") {
        const payload = await apiFetch<RadarEnrichResponse>(`/webscraping/radar/leads/${lead.id}/enrich`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 18000,
        });
        if (payload.item) {
          setItems((current) => current.map((item) => item.id === lead.id ? { ...item, ...payload.item } : item));
        }
        setFeedback(payload.message || "Card enriquecido");
      }

      if (action === "send") {
        await apiFetch(`/webscraping/radar/leads/${lead.id}/send-to-vendas`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 15000,
        });
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "sent_to_vendas", companyStatus: "imported_to_vendas", ownershipStatus: "in_attendance" } : item));
        setFeedback("Card enviado para Vendas.");
      }

      if (action === "hide") {
        await apiFetch(`/webscraping/radar/leads/${lead.id}/event`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 15000,
          body: JSON.stringify({ eventType: "hidden", note: "Ocultado no Radar Digital." }),
        });
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "discarded", companyStatus: "discarded", ownershipStatus: "negative" } : item));
        setFeedback("Card marcado como descartado.");
      }

      if (action === "negative") {
        await apiFetch(`/webscraping/radar/${lead.id}/negative`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 15000,
          body: JSON.stringify({ status: "negative", reason: "sem_interesse", privateNotes: "Marcado no Radar Digital." }),
        });
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "negative", companyStatus: "negative", ownershipStatus: "negative" } : item));
        setFeedback("Card marcado como negativo.");
      }
    } catch {
      setError(action === "enrich" ? "Não foi possível enriquecer agora" : "Não foi possível concluir esta ação agora.");
    } finally {
      setActionId(null);
    }
  }

  async function copyRadarText(text: string | null | undefined, successMessage: string) {
    const value = String(text || "").trim();
    if (!value) {
      setError("Não há conteúdo para copiar neste card.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(successMessage);
    } catch {
      setError("Não foi possível copiar agora.");
    }
  }

  function buildVendasLeadPayload(lead: RadarLead) {
    return {
      sourceHistoryId: `radar:${lead.id}`,
      name: lead.name,
      phone: lead.phone || lead.phoneDigits || "",
      phoneDigits: lead.phoneDigits || lead.phone || "",
      email: lead.email || undefined,
      emailStatus: lead.emailStatus || undefined,
      emailSource: lead.emailSource || undefined,
      emailConfidence: lead.emailConfidence ?? undefined,
      address: lead.address || undefined,
      website: lead.website || undefined,
      websiteStatus: lead.websiteStatus || undefined,
      city: lead.city || undefined,
      state: lead.state || undefined,
      segment: lead.segment || undefined,
      rating: lead.rating ?? undefined,
      reviews: lead.reviews ?? undefined,
      instagramUrl: lead.instagramUrl || undefined,
      facebookUrl: lead.facebookUrl || undefined,
      socialStatus: lead.socialStatus || undefined,
      googleMapsUrl: lead.googleMapsUrl || undefined,
      businessCategory: lead.businessCategory || undefined,
      openingHoursStatus: lead.openingHoursStatus || undefined,
      recommendedChannel: lead.recommendedChannel || undefined,
      painType: lead.painType || undefined,
      painLabel: lead.painLabel || undefined,
      painPitch: lead.painPitch || undefined,
      enrichmentScore: lead.enrichmentScore ?? undefined,
      enrichmentConfidence: lead.enrichmentConfidence ?? undefined,
      opportunityScore: lead.opportunityScore ?? undefined,
      opportunityReason: lead.opportunityReason || undefined,
      source: lead.source || undefined,
      sourceEngine: lead.sourceEngine || undefined,
      sourceUrl: lead.sourceUrl || undefined,
      enrichmentJson: lead.enrichmentJson || undefined,
      shortNote: lead.opportunityReason || undefined,
      scriptText: lead.painPitch || lead.opportunityReason || undefined,
    };
  }

  const sendFilteredToVendas = useCallback(async () => {
    if (!visibleItems.length) {
      setFeedback(null);
      setError("Pesquise primeiro. Depois envie os cards encontrados para Vendas.");
      return;
    }

    setBulkSending(true);
    setError(null);
    setFeedback(null);
    setTelonProgress(12);
    try {
      const selectedItems = visibleItems.slice(0, effectiveFilters.quantity);
      const leads = selectedItems.map(buildVendasLeadPayload);
      if (!leads.length) {
        setFeedback("Nenhum lead elegível encontrado para enviar.");
        return;
      }
      const imported = await apiFetch<ImportToVendasResponse>("/vendas/import/webscraping", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 30000,
        body: JSON.stringify({ sourceHistoryId: "radar-digital:bulk", leads }),
      });
      await apiFetch("/webscraping/radar/leads/mark-sent-to-vendas", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 15000,
        body: JSON.stringify({ leadIds: selectedItems.map((lead) => lead.id) }),
      }).catch(() => null);
      setItems((current) => current.map((item) => selectedItems.some((selected) => selected.id === item.id) ? { ...item, status: "sent_to_vendas", companyStatus: "imported_to_vendas", ownershipStatus: "in_attendance" } : item));
      setFeedback(imported.message || `${leads.length} lead(s) herdados para Vendas.`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Não foi possível herdar leads para Vendas agora.");
    } finally {
      setBulkSending(false);
    }
  }, [effectiveFilters.quantity, visibleItems]);

  useEffect(() => {
    if (!mobileAutoImportPending) return;
    if (searching || activeRun || loading || bulkSending) return;
    if (!hasSearched) return;
    if (!visibleItems.length) {
      setMobileAutoImportPending(false);
      return;
    }

    let cancelled = false;
    async function autoImportMobileRadar() {
      await sendFilteredToVendas();
      if (cancelled) return;
      setMobileAutoImportPending(false);
    }

    void autoImportMobileRadar();
    return () => {
      cancelled = true;
    };
  }, [
    activeRun,
    bulkSending,
    hasSearched,
    loading,
    mobileAutoImportPending,
    searching,
    sendFilteredToVendas,
    visibleItems.length,
  ]);

  if (hasToken === null || loading && items.length === 0 && hasSearched) {
    return (
      <main className="app-shell" aria-hidden="true" />
    );
  }

  if (!hasToken) return null;

  const hasMore = !activeRun && hasSearched && items.length < total;
  const availableSegments = availableFilters.segments || [];
  const availableSegmentValues = (availableSegments.length ? availableSegments.map((item) => item.value) : HBX_SEGMENT_SUGGESTIONS).filter(Boolean);
  const mobileStateOptions = (availableFilters.states?.length ? availableFilters.states.map((item) => item.value) : BRAZIL_STATES.map((item) => item.uf)).filter(Boolean);
  const mobileCityOptions = (
    filters.state && availableFilters.citiesByState?.[filters.state]?.length
      ? availableFilters.citiesByState[filters.state].map((item) => item.value)
      : filters.state
        ? BRAZIL_CITIES_BY_STATE[filters.state] || []
        : []
  ).filter(Boolean);
  const mobileVendasLimit = Math.max(1, Number(vendasPending?.limit || 40));
  const mobileVendasPendingCount = Math.max(0, Number(vendasPending?.pendingCount || 0));
  const mobileVendasBlocked = Boolean(vendasPending?.blocked || mobileVendasPendingCount >= mobileVendasLimit);
  const mobileRadarProcessing = searching || Boolean(activeRun) || bulkSending || mobileAutoImportPending;
  const mobileDockCanSearch = !mobileVendasBlocked && !searching && !activeRun && !bulkSending;

  function startMobileRadarSearch() {
    if (!mobileDockCanSearch) return;
    if (canPullWithFilters(effectiveFilters)) {
      if (!mobileSearchNoticeDismissed) setMobileSearchNoticeOpen(true);
      setMobileAutoImportPending(true);
    }
    void runRadarSearch("off");
  }

  function dismissMobileSearchNotice(permanent = false) {
    setMobileSearchNoticeOpen(false);
    if (!permanent) return;
    setMobileSearchNoticeDismissed(true);
    try {
      window.localStorage.setItem(MOBILE_RADAR_SEARCH_NOTICE_DISMISSED_KEY, "true");
    } catch {
      // localStorage is best-effort for this mobile hint.
    }
  }

  function handleMobileDockPrimary() {
    if (mobileDockCanSearch && canPullWithFilters(effectiveFilters)) {
      startMobileRadarSearch();
      return;
    }
    setMobilePicker(filters.state ? "city" : "state");
  }

  return (
    <DashboardScaffold
      title="Radar Digital"
      description="Pesquisa de clientes e envio para Vendas."
      hideHeader
      showDashboardShortcut={false}
    >
      <section className={styles.shell}>
        <div className={`${styles.mobileRadar} hbx-mobile-page`}>
          <section className={`${styles.mobileRadarHero} hbx-mobile-hero`}>
            <RadarMotionBackground />
            <div className={styles.mobileRadarHeroCopy}>
              <strong>Radar Digital</strong>
              <p>Encontre cards com oportunidade real</p>
              <small>{mobileRadarProcessing ? "Busca em andamento" : `Volume definido pelo plano: ${effectiveFilters.quantity}`}</small>
            </div>
            <div className={styles.mobileRadarHeroStat}>
              <span>Cidade</span>
              <strong>{filters.city || "Definir"}</strong>
            </div>
            <div className={styles.mobileRadarHeroStat}>
              <span>Segmento</span>
              <strong>{radarSegmentSummary(filters.segment) || "Definir"}</strong>
            </div>
            <div className={styles.mobileRadarHeroStat}>
              <span>Fonte atual</span>
              <strong>{mobileRadarEngineLabel(filters.engine)}</strong>
            </div>
          </section>

          <form
            className={`${styles.mobileRadarForm} hbx-mobile-card`}
            onFocus={() => setFilterEditing(true)}
            onBlur={handleFilterFormBlur}
            onSubmit={(event) => {
              event.preventDefault();
              startMobileRadarSearch();
            }}
          >
            <MobilePickerButton
              label="Estado"
              value={filters.state}
              placeholder="Selecionar estado"
              onClick={() => setMobilePicker("state")}
            />

            <MobilePickerButton
              label="Cidade"
              value={filters.city}
              placeholder={filters.state ? "Selecionar cidade" : "Escolha o estado"}
              disabled={!filters.state}
              helper={filters.state ? "Cidade liberada para o estado selecionado." : "Escolha um estado para liberar as cidades."}
              onClick={() => setMobilePicker("city")}
            />

            <MobilePickerButton
              label="Segmento"
              value={radarSegmentSummary(filters.segment)}
              placeholder="Ex.: Clínica, academia, estética"
              helper={isRadarCategoryValue(filters.segment) ? "Categoria inteira selecionada." : "Escolha até 5 segmentos."}
              onClick={() => setMobilePicker("segment")}
            />

            <button
              type="button"
              className={styles.mobileAdvancedButton}
              onClick={() => setMobileAdvancedOpen(true)}
            >
              <span>{isHbxList ? "👑 Filtros avançados disponíveis no HBX Lead" : "Filtros avançados"}</span>
              <strong>
                {isHbxList
                  ? "Fazer upgrade"
                  : [
                      filters.ddd ? `DDD ${filters.ddd}` : null,
                      filters.scoreRange ? "Score" : null,
                      filters.noWebsite ? "Sem site" : null,
                      filters.withWebsite ? "Com site" : null,
                      filters.highOpportunity ? "Alta oportunidade" : null,
                      filters.minRating ? `Nota ${filters.minRating}+` : null,
                      filters.minReviews ? `${filters.minReviews}+ avaliações` : null,
                    ].filter(Boolean).join(" · ") || "Opcional"}
              </strong>
              <b aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 4.2 4.2" />
                </svg>
              </b>
            </button>

            {mobileVendasBlocked ? (
              <div className={`${styles.mobileRadarNotice} hbx-mobile-notice`}>
                {vendasPending?.message || "Agenda cheia no Vendas. Finalize ou delete cards pendentes para buscar mais."}
              </div>
            ) : null}
            {error ? <div className={`${styles.mobileRadarNotice} hbx-mobile-notice`} data-tone="error">{compactRadarMessage(error)}</div> : null}
            {feedback && !mobileRadarProcessing ? <div className={`${styles.mobileRadarNotice} hbx-mobile-notice`} data-tone="ok">{feedback}</div> : null}

            <div className={`${styles.mobileRadarActionRow} hbx-mobile-action-bar`}>
              <button
                type={visibleItems.length && hasSearched && !mobileRadarProcessing ? "button" : "submit"}
                className={`${styles.mobileRadarSubmit} hbx-mobile-primary-button`}
                disabled={mobileVendasBlocked || searching || Boolean(activeRun) || bulkSending}
                onClick={(event) => {
                  if (visibleItems.length && hasSearched && !mobileRadarProcessing) {
                    event.preventDefault();
                    void sendFilteredToVendas();
                  }
                }}
              >
                {bulkSending
                  ? "Enviando..."
                  : visibleItems.length && hasSearched && !mobileRadarProcessing
                    ? "Enviar para Vendas"
                    : "Buscar cards"}
              </button>
              <button type="button" className={`${styles.mobileRadarClear} hbx-mobile-secondary-button`} onClick={clearFilters} disabled={mobileRadarProcessing}>
                Limpar filtros
              </button>
            </div>
          </form>

          {mobilePicker === "state" ? (
            <MobileFilterSheet
              title="Estado"
              value={filters.state}
              options={mobileStateOptions.map((state) => ({ value: state }))}
              placeholder="Buscar estado"
              onSelect={(value) => setFilters((current) => ({ ...current, state: value, city: "" }))}
              onClose={() => setMobilePicker(null)}
            />
          ) : null}
          {mobilePicker === "city" ? (
            <MobileFilterSheet
              title="Cidade"
              value={filters.city}
              options={mobileCityOptions.map((city) => ({ value: city }))}
              placeholder="Buscar cidade"
              onSelect={(value) => setFilters((current) => ({ ...current, city: value }))}
              onClose={() => setMobilePicker(null)}
            />
          ) : null}
          {mobilePicker === "segment" ? (
            <MobileSegmentSheet
              value={filters.segment}
              availableSegments={availableSegmentValues}
              onChange={(value) => setFilters((current) => ({ ...current, segment: value }))}
              onClose={() => setMobilePicker(null)}
            />
          ) : null}
          {mobileAdvancedOpen ? (
            <div className={styles.mobilePickerPanel} role="presentation" onClick={() => setMobileAdvancedOpen(false)}>
              <section
                className={styles.mobilePickerSheet}
                role="dialog"
                aria-modal="true"
                aria-label="Filtros avançados"
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.mobilePickerHeader}>
                  <strong>Filtros avançados</strong>
                  <button type="button" onClick={() => setMobileAdvancedOpen(false)}>Fechar</button>
                </div>
                {isHbxList ? (
                  <div className={styles.mobileAdvancedPremiumLock}>
                    <span aria-hidden="true">👑</span>
                    <strong>Filtros avançados disponíveis no HBX Lead</strong>
                    <p>Filtre qualidade, oportunidade, DDD, fonte, site, avaliação e volume de reviews no plano Lead.</p>
                    <a href="/planos?intent=lead">Fazer upgrade</a>
                  </div>
                ) : (
                  <div className={styles.mobileAdvancedGrid}>
                    <div>
                      <span>Fonte de busca</span>
                      <MobileEngineToggle
                        value={filters.engine}
                        onChange={(value) => setFilters((current) => ({ ...current, engine: value }))}
                      />
                    </div>
                    <label>
                      <span>DDD</span>
                      <input
                        inputMode="numeric"
                        value={filters.ddd}
                        onChange={(event) => setFilters((current) => ({ ...current, ddd: event.target.value.replace(/\D/g, "").slice(0, 2) }))}
                        placeholder="11"
                      />
                    </label>
                    <div>
                      <span>Score/oportunidade</span>
                      <div className={styles.mobileAdvancedOptions}>
                        {[
                          { value: "", label: "Todos" },
                          { value: "high", label: "Alta oportunidade" },
                          { value: "medium", label: "Média oportunidade" },
                          { value: "low", label: "Baixa oportunidade" },
                        ].map((option) => (
                          <button
                            type="button"
                            key={option.value || "all"}
                            data-active={filters.scoreRange === option.value ? "true" : "false"}
                            onClick={() => setFilters((current) => ({ ...current, scoreRange: option.value }))}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className={styles.mobileAdvancedCheck}>
                      <input
                        type="checkbox"
                        checked={filters.noWebsite}
                        onChange={(event) => setFilters((current) => ({
                          ...current,
                          noWebsite: event.target.checked,
                          withWebsite: event.target.checked ? false : current.withWebsite,
                        }))}
                      />
                      Sem website
                    </label>
                    <label className={styles.mobileAdvancedCheck}>
                      <input
                        type="checkbox"
                        checked={filters.withWebsite}
                        onChange={(event) => setFilters((current) => ({
                          ...current,
                          withWebsite: event.target.checked,
                          noWebsite: event.target.checked ? false : current.noWebsite,
                        }))}
                      />
                      Somente com website
                    </label>
                    <label className={styles.mobileAdvancedCheck}>
                      <input
                        type="checkbox"
                        checked={filters.highOpportunity}
                        onChange={(event) => setFilters((current) => ({ ...current, highOpportunity: event.target.checked }))}
                      />
                      Somente alta oportunidade
                    </label>
                    <label>
                      <span>Avaliação mínima</span>
                      <input
                        inputMode="decimal"
                        value={filters.minRating}
                        onChange={(event) => setFilters((current) => ({
                          ...current,
                          minRating: event.target.value.replace(/[^\d.,]/g, "").replace(",", ".").slice(0, 3),
                        }))}
                        placeholder="4.5"
                      />
                    </label>
                    <label>
                      <span>Mínimo de avaliações</span>
                      <input
                        inputMode="numeric"
                        value={filters.minReviews}
                        onChange={(event) => setFilters((current) => ({
                          ...current,
                          minReviews: event.target.value.replace(/\D/g, "").slice(0, 5),
                        }))}
                        placeholder="20"
                      />
                    </label>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {mobileSearchNoticeOpen ? (
            <section
              ref={mobileSearchNoticeRef}
              className={`${styles.mobileRadarSearchNotice} hbx-mobile-notice`}
              onClick={() => dismissMobileSearchNotice(false)}
            >
              <div>
                <strong>Busca rodando em segundo plano</strong>
                <span>Você pode continuar navegando. Os cards aprovados entram em Vendas/Prospecção automaticamente; toque aqui para ocultar.</span>
              </div>
              <label onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={mobileSearchNoticeDismissed}
                  onChange={(event) => dismissMobileSearchNotice(event.target.checked)}
                />
                Não exibir novamente
              </label>
            </section>
          ) : null}

          <section className={`${styles.mobileRadarResults} hbx-mobile-card`} aria-live="polite">
            <header>
              <div>
                <span>Resultado</span>
                <strong>{hasSearched ? `${visibleItems.length} cards encontrados` : "Nenhum card encontrado ainda"}</strong>
              </div>
              {mobileRadarProcessing ? <small>Radar buscando cards...</small> : null}
            </header>
            {hasSearched && showSmartLeadCards ? (
              <div className={styles.mobileEnrichmentSummary}>
                {mobileQualityLine ? <span>{mobileQualityLine}</span> : null}
                <span><b>{Number(visibleEnrichmentSummary.whatsappVerified || 0).toLocaleString("pt-BR")}</b> WhatsApp verificado</span>
                <span><b>{Number(visibleEnrichmentSummary.readyToCall || 0).toLocaleString("pt-BR")}</b> prontos para chamar</span>
              </div>
            ) : null}

            {mobileRadarProcessing && !visibleItems.length ? (
              <div className={`${styles.mobileRadarState} hbx-mobile-empty`}>
                <strong>Radar buscando cards</strong>
                <span>A varredura continua em segundo plano e os aprovados entram em Vendas/Prospecção.</span>
              </div>
            ) : !hasSearched ? (
              <div className={`${styles.mobileRadarState} hbx-mobile-empty`}>
                <strong>Pronto para buscar</strong>
                <span>Escolha estado, cidade e segmento para buscar cards.</span>
              </div>
            ) : !loading && !visibleItems.length ? (
              <div className={`${styles.mobileRadarState} hbx-mobile-empty`}>
                <strong>Não achei cards suficientes para esse filtro</strong>
                <span>Tente segmento mais amplo ou cidade próxima.</span>
              </div>
            ) : (
              <div className={styles.mobileRadarList}>
                {visibleItems.map((lead) => {
                  const score = Math.max(0, Math.min(100, Math.trunc(Number(lead.enrichmentScore || lead.opportunityScore || 0))));
                  const ownerBadge = ownershipBadge(lead);
                  const chips = buildSmartChips(lead);
                  const emailBadge = emailTrustBadge(lead);
                  const whatsappBadge = whatsappTrustBadge(lead);
                  const whySignals = buildWhyCallSignals(lead);
                  const draftMessage = buildRadarDraftMessage(lead);
                  return (
                    <article key={lead.id} className={`${styles.mobileRadarCard} hbx-mobile-card`}>
                      <div className={styles.mobileRadarCardHeader}>
                        <div>
                          <strong>{lead.name || "Empresa sem nome"}</strong>
                          <span>{[lead.city, lead.state].filter(Boolean).join(" / ") || "Cidade não informada"}</span>
                        </div>
                        <div className={styles.score} style={{ ["--score" as string]: `${score}%` }}>
                          <b>{score}</b>
                          <small>{opportunityLabel(score)}</small>
                        </div>
                      </div>
                      <p>{lead.segment || "Segmento não informado"}</p>
                      <dl>
                        <div><dt>Telefone</dt><dd>{formatPhone(lead.phone || lead.phoneDigits)}</dd></div>
                        <div><dt>Status</dt><dd data-tone={ownerBadge.tone}>{ownerBadge.label}</dd></div>
                        <div><dt>Canal</dt><dd>{channelLabel(lead.recommendedChannel)}</dd></div>
                      </dl>
                      {showSmartLeadCards ? (
                        <>
                          <div className={styles.smartChips}>
                            {chips.map((chip) => <span key={chip.label} data-tone={chip.tone}>{chip.label}</span>)}
                          </div>
                          <div className={styles.mobileWhyCall}>
                            <div>
                              <span>Por que chamar?</span>
                              <strong title={compactLeadReason(lead)}>{compactLeadReason(lead)}</strong>
                            </div>
                            <div className={styles.mobileWhySignals}>
                              {whySignals.map((signal) => <span key={signal}>{signal}</span>)}
                            </div>
                          </div>
                          <div className={styles.smartDetails}>
                            <span><b>WhatsApp</b>{whatsappBadge.shortLabel}</span>
                            <span><b>E-mail</b>{lead.email ? `${emailBadge.shortLabel}: ${lead.email}` : emailBadge.shortLabel}</span>
                            <span><b>Origem</b>{lead.sourceEngine || lead.source || "Banco HBX"}</span>
                          </div>
                        </>
                      ) : (
                        <div className={styles.listUpsell}>Lead inteligente disponível no HBX Lead</div>
                      )}
                      {showSmartLeadCards ? (
                        <div className={styles.mobileRadarCopyActions}>
                          <button
                            type="button"
                            className="hbx-mobile-secondary-button"
                            onClick={() => void copyRadarText(lead.email, "E-mail copiado.")}
                            disabled={!lead.email}
                          >
                            Copiar e-mail
                          </button>
                          <button
                            type="button"
                            className="hbx-mobile-secondary-button"
                            onClick={() => void copyRadarText(draftMessage, "Mensagem copiada.")}
                          >
                            Copiar mensagem
                          </button>
                        </div>
                      ) : null}
                      {showSmartLeadCards ? (
                        <button
                          type="button"
                          className="hbx-mobile-secondary-button"
                          onClick={() => void runLeadAction(lead, "enrich")}
                          disabled={Boolean(actionId)}
                        >
                          Enriquecer
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="hbx-mobile-secondary-button"
                        onClick={() => void runLeadAction(lead, "send")}
                        disabled={Boolean(actionId)}
                      >
                        Enviar para Vendas
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <HbxMobileDock primaryLabel="Buscar cards" onPrimaryAction={handleMobileDockPrimary} />
        </div>

        <header className={styles.header}>
          <div>
            <span>HBX</span>
            <h1>Radar Digital</h1>
            <p>Pesquise clientes, revise os cards e envie os melhores para Vendas.</p>
          </div>
          <button
            type="button"
            onClick={() => void sendFilteredToVendas()}
            disabled={bulkSending || !visibleItems.length}
            title={!visibleItems.length ? "Pesquise primeiro para escolher o que vai para Vendas." : undefined}
          >
            {bulkSending ? "Enviando..." : "Enviar para Vendas"}
          </button>
        </header>

        <form
          className={styles.filters}
          onFocus={() => setFilterEditing(true)}
          onBlur={handleFilterFormBlur}
          onSubmit={(event) => {
            event.preventDefault();
            void runRadarSearch();
          }}
        >
          <div className={styles.filtersTitle}>
            <div>
              <span>Pesquisa</span>
              <strong>Filtros de Pesquisa</strong>
            </div>
            <small>{hasHistoryFilters(filters, generalSearch) ? "Filtros prontos para consulta." : "Pesquisar vazio abre todo o histórico salvo."}</small>
          </div>

          <div className={styles.filterLocation}>
            <HbxStateCityPicker
              state={filters.state}
              city={filters.city}
              onStateChange={(value) => setFilters((current) => ({ ...current, state: value, city: "" }))}
              onCityChange={(value) => setFilters((current) => ({ ...current, city: value }))}
              helperText=""
            />
          </div>
          <div className={styles.filterSegment}>
            <RadarSegmentFunnel
              value={filters.segment}
              availableSegments={availableSegmentValues}
              onChange={(value) => setFilters((current) => ({ ...current, segment: value }))}
            />
          </div>
          <div className={styles.filterTarget}>
            <HbxTargetTypeSelector
              value={filters.targetType}
              onChange={(value) => setFilters((current) => ({ ...current, targetType: value }))}
              allowedTypes={["pj", "pf"]}
            />
          </div>
          <div className={styles.filterEngine}>
            <MobileEngineToggle
              value={filters.engine}
              onChange={(value) => setFilters((current) => ({ ...current, engine: value }))}
            />
          </div>
          <div className={styles.filterAdvanced}>
            <HbxAdvancedFilters
              mode="radar"
              filters={{ ...filters, onlyWithWebsite: filters.withWebsite }}
              onChange={updateAdvancedFilters}
            />
          </div>
          <div className={styles.filterActions}>
            <button type="button" data-variant="secondary" onClick={clearFilters}>Limpar filtros</button>
            <button type="submit" disabled={searching}>
              {searching ? "Pesquisando..." : "Pesquisar"}
            </button>
          </div>
        </form>

        {activeRun ? (
          <section className={styles.runProgress} aria-live="polite">
            <div className={styles.runProgressHeader}>
              <div>
                <span>Pesquisa em andamento</span>
                <strong>{activeRunDelivered.toLocaleString("pt-BR")} de até {activeRunTarget.toLocaleString("pt-BR")} cards</strong>
              </div>
              <small>{activeRun.status === "queued" ? "Na fila HBX" : "Verificando disponibilidade real"}</small>
            </div>
            <div className={styles.runProgressTrack} aria-hidden="true">
              <span style={{ ["--progress" as string]: `${activeRunProgress}%` }} />
            </div>
            <p>{activeRun.message || "O Radar já entregou o que encontrou no banco e continua buscando novos cards válidos."}</p>
          </section>
        ) : null}

        {error ? <div className={styles.notice} data-tone="error">{compactRadarMessage(error)}</div> : null}
        {feedback && !activeRun ? <div className={styles.notice} data-tone="ok">{feedback}</div> : null}

        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <div>
              <span>Resultados</span>
              <strong>{hasSearched ? "Cards da pesquisa" : "Aguardando pesquisa"}</strong>
            </div>
            {hasSearched ? (
              <small>
                {activeRun
                  ? `Mostrando ${visibleItems.length.toLocaleString("pt-BR")} de até ${activeRunTarget.toLocaleString("pt-BR")} solicitados.`
                  : `Mostrando ${visibleItems.length.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} resultados — ${PAGE_SIZE} por página.`}
              </small>
            ) : null}
          </div>
          {hasSearched && visibleEnrichmentSummary ? (
            <div className={styles.enrichmentSummary}>
              <span><b>{Number(visibleEnrichmentSummary.cardsAnalyzed || 0).toLocaleString("pt-BR")}</b> analisados</span>
              <span><b>{Number(visibleEnrichmentSummary.whatsappVerified || 0).toLocaleString("pt-BR")}</b> WhatsApp verificado</span>
              <span><b>{Number(visibleEnrichmentSummary.emailConfirmedOrProbable || 0).toLocaleString("pt-BR")}</b> e-mail pronto</span>
              <span><b>{Number(visibleEnrichmentSummary.noWebsite || 0).toLocaleString("pt-BR")}</b> sem site</span>
              <span><b>{Number(visibleEnrichmentSummary.highPriority || 0).toLocaleString("pt-BR")}</b> alta prioridade</span>
              <span><b>{Number(visibleEnrichmentSummary.readyToCall || 0).toLocaleString("pt-BR")}</b> prontos para chamar</span>
            </div>
          ) : null}

          {!hasSearched ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">RD</span>
              <strong>Nenhum card exibido ainda</strong>
              <p>Use os filtros acima e clique em Pesquisar. Se pesquisar sem filtrar nada, o sistema abre todo o histórico.</p>
            </div>
          ) : activeRun && visibleItems.length === 0 ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">...</span>
              <strong>Preparando os primeiros cards</strong>
              <p>O Radar consultou o banco e está validando contatos públicos para este filtro.</p>
            </div>
          ) : !loading && visibleItems.length === 0 ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">0</span>
              <strong>Nenhum resultado encontrado</strong>
              <p>A busca foi concluída sem cards para os filtros aplicados.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {visibleItems.map((lead) => {
                const score = Math.max(0, Math.min(100, Math.trunc(Number(lead.enrichmentScore || lead.opportunityScore || 0))));
                const isHigh = score >= 70;
                const origin = [lead.sourceEngine, lead.source, ...(lead.sourceEngines || [])].filter(Boolean)[0] || "Banco HBX";
                const status = lead.companyStatus || lead.status;
                const ownerBadge = ownershipBadge(lead);
                const chips = buildSmartChips(lead);
                return (
                  <article key={lead.id} className={styles.card} data-high={isHigh ? "true" : "false"}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.cardBadges}>
                          <span>{lead.segment || "Segmento aberto"}</span>
                          <em data-tone={ownerBadge.tone}>{ownerBadge.label}</em>
                        </div>
                        <strong>{lead.name || "Empresa sem nome"}</strong>
                      </div>
                      <div className={styles.score} style={{ ["--score" as string]: `${score}%` }}>
                        <b>{score}</b>
                        <small>{opportunityLabel(score)}</small>
                      </div>
                    </div>

                    <div className={styles.metaGrid}>
                      <span><b>Telefone</b>{formatPhone(lead.phone || lead.phoneDigits)}</span>
                      <span><b>Cidade/UF</b>{[lead.city, lead.state].filter(Boolean).join(" / ") || "Não informado"}</span>
                      <span><b>Origem</b>{origin}</span>
                      <span><b>Status</b>{statusLabel(status)}</span>
                    </div>

                    {showSmartLeadCards ? (
                      <div className={styles.smartBlock}>
                        <div className={styles.smartChips}>
                          {chips.map((chip) => <span key={chip.label} data-tone={chip.tone}>{chip.label}</span>)}
                        </div>
                        <p className={styles.reason} title={compactLeadReason(lead)}>{compactLeadReason(lead)}</p>
                        <div className={styles.smartDetails}>
                          <span><b>Canal recomendado</b>{channelLabel(lead.recommendedChannel)}</span>
                          <span><b>E-mail</b>{lead.email || emailLabel(lead.emailStatus)}</span>
                          <span><b>Dor provável</b>{lead.painLabel || lead.painType || "Revisar"}</span>
                        </div>
                        {lead.painPitch ? <small className={styles.smartPitch}>{lead.painPitch}</small> : null}
                      </div>
                    ) : (
                      <>
                        {lead.opportunityReason ? <p className={styles.reason} title={lead.opportunityReason}>{lead.opportunityReason}</p> : null}
                        <div className={styles.listUpsell}>Lead inteligente disponível no HBX Lead</div>
                      </>
                    )}

                    <div className={styles.history}>
                      {(lead.historySummary || []).length ? (
                        (lead.historySummary || []).slice(0, 2).map((event) => (
                          <span key={event.id || `${lead.id}:${event.eventType}:${event.createdAt}`}>
                            {eventLabel(event.eventType)}
                            {event.createdAt ? <small>{formatDate(event.createdAt)}</small> : null}
                          </span>
                        ))
                      ) : (
                        <span>Recebido <small>{formatDate(lead.lastSeenAt || lead.firstSeenAt)}</small></span>
                      )}
                    </div>

                    <div className={styles.actions}>
                      <button type="button" onClick={() => void runLeadAction(lead, "send")} disabled={Boolean(actionId)}>
                        Enviar para Vendas
                      </button>
                      {showSmartLeadCards ? (
                        <button type="button" onClick={() => void runLeadAction(lead, "enrich")} disabled={Boolean(actionId)}>
                          Enriquecer
                        </button>
                      ) : null}
                      <button type="button" onClick={() => void runLeadAction(lead, "csx")} disabled={Boolean(actionId)}>
                        CSX pendente
                      </button>
                      <button type="button" onClick={() => void runLeadAction(lead, "hide")} disabled={Boolean(actionId)}>
                        Descartar
                      </button>
                      <button type="button" data-danger="true" onClick={() => void runLeadAction(lead, "negative")} disabled={Boolean(actionId)}>
                        Negativo
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {hasMore ? (
            <div className={styles.loadMore}>
              <button type="button" onClick={() => void loadCards(page + 1, true)} disabled={loadingMore}>
                {loadingMore ? "Carregando..." : "Carregar mais 100"}
              </button>
            </div>
          ) : null}
        </section>

      </section>
    </DashboardScaffold>
  );
}
