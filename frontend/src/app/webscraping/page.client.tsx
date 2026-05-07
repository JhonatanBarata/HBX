"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import LiquidGlassCard, { liquidGlassCardStyles as glassCardStyles } from "@/components/LiquidGlassCard";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
import { BRAZIL_CITIES_BY_STATE, BRAZIL_STATES } from "@/lib/brazil-locations";
import { clearTopbarProgress, dispatchTopbarProgress } from "@/lib/topbar-progress";
import { apiFetch, getToken } from "@/app/_lib/api";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import styles from "./page.module.css";

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.hbxsystem.com.br"
    : "http://localhost:3000";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
const SEGMENT_SUGGESTIONS = [
  "academias",
  "acessórios automotivos",
  "açougues",
  "advocacias",
  "agências de marketing",
  "agências de turismo",
  "agronegócios",
  "alarmes e segurança",
  "alimentos naturais",
  "aluguel de equipamentos",
  "auto elétricas",
  "auto escolas",
  "auto peças",
  "bares",
  "barbearias",
  "bicicletarias",
  "bijuterias",
  "borracharias",
  "buffets",
  "cafeterias",
  "calçados",
  "casa de carnes",
  "casas de festas",
  "centros automotivos",
  "chaveiros",
  "clínicas de estética",
  "clínicas médicas",
  "clínicas odontológicas",
  "clínicas veterinárias",
  "colégios",
  "comércio varejista",
  "concessionárias",
  "confeitarias",
  "construtoras",
  "contabilidades",
  "consultorias empresariais",
  "corretoras de seguros",
  "cosméticos",
  "coworkings",
  "cursos profissionalizantes",
  "dedetizadoras",
  "depósitos de bebidas",
  "despachantes",
  "distribuidoras",
  "docerias",
  "e-commerce",
  "educação infantil",
  "elétricas",
  "eletrodomésticos",
  "eletrônicas",
  "energia solar",
  "engenharias",
  "escolas",
  "escritórios administrativos",
  "escritórios de arquitetura",
  "estacionamentos",
  "estúdios de fotografia",
  "eventos",
  "farmácias",
  "ferragens",
  "financeiras",
  "floriculturas",
  "fornecedoras industriais",
  "funerárias",
  "gráficas",
  "hospedagens",
  "hotéis",
  "imobiliárias",
  "indústrias alimentícias",
  "indústrias metalúrgicas",
  "informática",
  "instaladoras",
  "joalherias",
  "laboratórios",
  "lanchonetes",
  "lava rápidos",
  "lavanderias",
  "lojas de brinquedos",
  "lojas de celulares",
  "lojas de colchões",
  "lojas de conveniência",
  "lojas de eletrônicos",
  "lojas de móveis",
  "lojas de roupas",
  "lojas de tintas",
  "lotéricas",
  "madeireiras",
  "manutenção predial",
  "marcenarias",
  "materiais de construção",
  "marmorarias",
  "mecânicas",
  "mercados",
  "metalúrgicas",
  "moda feminina",
  "moda masculina",
  "motéis",
  "oficinas mecânicas",
  "ótica",
  "panificadoras",
  "papelarias",
  "perfumarias",
  "pet shops",
  "pizzarias",
  "postos de combustível",
  "provedores de internet",
  "quadras esportivas",
  "químicas",
  "restaurantes",
  "revendas de veículos",
  "salões de beleza",
  "serralherias",
  "serviços contábeis",
  "serviços de limpeza",
  "serviços gráficos",
  "serviços jurídicos",
  "serviços médicos",
  "serviços odontológicos",
  "serviços terceirizados",
  "sistemas de segurança",
  "supermercados",
  "telecomunicações",
  "transportadoras",
  "turismo",
  "uniformes",
  "universidades",
  "usinagem",
  "vidraçarias",
  "vigilância",
  "vistorias veiculares",
  "web design",
  "xérox e copiadoras",
  "yoga e pilates",
  "zeladoria",
];
const PF_NICHE_SUGGESTIONS = [
  "plano de saúde",
  "seguros",
  "consórcio",
  "imóveis",
  "energia solar",
  "crédito",
  "estética",
  "serviços",
];
const PF_ROLE_OPTIONS = [
  "consultor",
  "corretor",
  "vendedor",
  "representante",
  "autônomo",
  "prestador",
];
const SCRIPT_VARIABLE_TOKENS = ["nome", "cidade", "segmento", "quem_envia", "empresa"] as const;
const COMMON_CITY_DDD: Record<string, string> = {
  "americana - sp": "19",
  americana: "19",
  "araras - sp": "19",
  araras: "19",
  "campinas - sp": "19",
  campinas: "19",
  "limeira - sp": "19",
  limeira: "19",
  "ribeirao preto - sp": "16",
  "ribeirão preto - sp": "16",
  "rio claro - sp": "19",
  "sao paulo - sp": "11",
  "são paulo - sp": "11",
};

type WebscrapingEngine = "google" | "hbx";
type HbxTargetType = "pj" | "pf" | "agenda_pf";
type RadarCampaignTargetType = HbxTargetType | "both";
type SearchModeId = "google_pj" | "hbx_radar";

const SEARCH_MODE_OPTIONS: Array<{
  id: SearchModeId;
  label: string;
  description: string;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  quantityOptions: number[];
  motorCode: "MOTOR X" | "RADAR HBX";
}> = [
  {
    id: "google_pj",
    label: "Webscraping Oficial",
    description: "Google oficial, até 20 resultados",
    engine: "google",
    targetType: "pj",
    quantityOptions: [5, 10, 15, 20],
    motorCode: "MOTOR X",
  },
  {
    id: "hbx_radar",
    label: "Radar HBX",
    description: "CNPJ, CPF público e Agenda em um só motor",
    engine: "hbx",
    targetType: "pj",
    quantityOptions: [20, 50, 75, 100],
    motorCode: "RADAR HBX",
  },
];

type CurrentUser = {
  id?: number | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: { name?: string | null } | null;
  masterContext?: {
    active?: boolean;
    companyName?: string | null;
  } | null;
};

type SearchFilters = {
  minRating: number | null;
  minReviews: number | null;
  onlyWithWebsite: boolean;
};

type NativeRuntime = {
  status: "online" | "degraded";
  code: string;
  message: string;
  googleApiKeyConfigured: boolean;
};

type HbxRuntime = {
  status: "online" | "offline";
  code: string;
  message: string;
  healthUrl: string;
  httpStatus: number | null;
};

type RuntimeResponse = {
  native: NativeRuntime;
  hbx?: HbxRuntime;
  quota: {
    remainingSearches: number | null;
    dailyLimit: number | null;
    isTrialLimited: boolean;
    accessMode: "plan" | "blocked";
  };
  diagnostics?: {
    checkedAt: string;
    nativeTechnicalMessage: string;
    hbxTechnicalMessage?: string;
    legacy?: {
      status: "online" | "degraded" | "offline";
      code: string;
      message: string;
      publicUrl?: string | null;
      internalUrl?: string | null;
      healthUrl?: string | null;
      httpStatus?: number | null;
    } | null;
  };
};

type SearchResult = {
  name: string;
  phone: string;
  phoneDigits: string;
  rating: number | null;
  reviews: number | null;
  address: string | null;
  website: string | null;
  source?: string | null;
  score?: number | null;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
};

type SearchResponse = {
  query: {
    city: string;
    state?: string | null;
    segment: string;
    quantity: number;
    engine?: WebscrapingEngine;
    targetType?: HbxTargetType;
    filters: SearchFilters;
  };
  meta: {
    historyId: string | null;
    runId?: string | null;
    source: "history" | "google" | "hbx" | "hybrid" | "global_cache" | "radar_database";
    reusedCount: number;
    fetchedCount: number;
    totalStoredCount?: number;
    duplicateCount?: number;
    skippedCount?: number;
    importedCount?: number;
    status?: "completed" | "partial_error" | "completed_with_errors" | "completed_insufficient_results";
    message?: string | null;
    technicalCacheUsed: boolean;
    technicalCacheReusedCount: number;
    technicalCacheValidUntil: string | null;
  };
  results: SearchResult[];
};

type SearchRunStatus = "queued" | "running" | "completed" | "partial_error" | "completed_insufficient_results" | "failed" | "canceled";

type SearchRunResponse = {
  id: string;
  runId: string;
  status: SearchRunStatus;
  targetQuantity: number;
  foundCount: number;
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  errorMessage?: string | null;
  attemptCount?: number;
  failedBatchCount?: number;
  consecutiveEmptyBatchCount?: number;
  consecutiveEngineErrorCount?: number;
  lastBatchError?: string | null;
  lastBatchStatus?: string | null;
  nextRetryAt?: string | null;
  lastQueryUsed?: string | null;
  lastEngineUrl?: string | null;
  batchLimit?: number;
  maxAttempts?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  query: SearchResponse["query"];
  meta: SearchResponse["meta"];
  results: SearchResult[];
};

type SearchHistoryItem = {
  id: string;
  city: string;
  segment: string;
  quantity: number;
  resultCount: number;
  filters: SearchFilters;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  preview: string[];
  scope: "company" | "global";
  sourceLabel: string;
  cacheValidUntil?: string | null;
};

type HistoryResponse = {
  items: SearchHistoryItem[];
};

type ImportToVendasResponse = {
  ok: boolean;
  createdCount: number;
  updatedCount: number;
  skippedWithoutWhatsapp?: number;
  message?: string;
};

type RadarLeadItem = {
  id: string;
  placeId?: string | null;
  name: string;
  phone: string;
  phoneDigits: string;
  ddd?: string | null;
  expectedDdds?: string[];
  address?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  websiteStatus?: "none" | "present" | "social_only" | "weak" | "unreachable" | "unknown" | string;
  rating?: number | null;
  reviews?: number | null;
  source?: string | null;
  sourceEngine?: string | null;
  sourceUrl?: string | null;
  sourceEngines?: string[];
  opportunityScore?: number | null;
  opportunityReason?: string | null;
  score?: number | null;
  status?: string | null;
  rejectionReason?: string | null;
  complaintReason?: string | null;
  deniedReason?: string | null;
  noAnswerCount?: number;
  contactedCount?: number;
  lastContactAt?: string | null;
  campaignId?: string | null;
  historySummary?: string | RadarLeadEvent[] | null;
  globalNegativeCount?: number;
  globalImportedCount?: number;
  globalContactedCount?: number;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  companyStatus?: string | null;
  vendasLeadId?: string | null;
};

type RadarFacet = {
  key: string;
  label: string;
  count: number;
  tone?: string;
};

type RadarDatabaseResponse = {
  items: RadarLeadItem[];
  total: number;
  facets?: RadarFacet[];
  meta?: {
    available?: boolean;
    message?: string;
    filters?: Record<string, unknown>;
    page?: number;
    limit?: number;
  };
};

type RadarPullResponse = {
  items: RadarLeadItem[];
  meta?: {
    requestedQuantity?: number;
    deliveredCount?: number;
    cleanStockBefore?: number;
    cleanStockAfter?: number;
    minimumStock?: number;
    desiredStock?: number;
    replenish?: {
      ran?: boolean;
      fetchedCount?: number;
      cleanStockBefore?: number;
      cleanStockAfter?: number;
      reason?: string;
    };
  };
};

type RadarFilterState = {
  page: number;
  filterKey: string;
  state: string;
  city: string;
  segment: string;
  quantity: number;
  source: string;
  ddd: string;
  scoreRange: string;
  noWebsite: boolean;
  highOpportunity: boolean;
  minRating: string;
  minReviews: string;
};

type RadarLeadEvent = {
  id: string;
  eventType: string;
  note?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  createdAt?: string | null;
};

type RadarLeadDetailsResponse = {
  item: RadarLeadItem;
  events: RadarLeadEvent[];
};

type RadarCampaignStatus =
  | "queued"
  | "running"
  | "paused"
  | "sleeping"
  | "completed"
  | "completed_insufficient_results"
  | "partial_error"
  | "failed"
  | "canceled";

type RadarCampaignBatch = {
  id: string;
  status: string;
  attemptNumber: number;
  engineUrl?: string | null;
  queryUsed?: string | null;
  batchSize: number;
  approvedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

type RadarCampaignTask = {
  id: string;
  city: string;
  state: string;
  segment: string;
  targetType?: RadarCampaignTargetType;
  query: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  foundCount: number;
  duplicateCount: number;
  rejectedCount: number;
  lastError?: string | null;
  lockedByEngineId?: string | null;
  lockedUntil?: string | null;
  updatedAt?: string | null;
};

type RadarCampaign = {
  id: string;
  status: RadarCampaignStatus;
  mode?: "radar_database" | "mass_data" | string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  targetType: RadarCampaignTargetType;
  targetTotal: number;
  batchSize: number;
  foundCount: number;
  approvedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  complaintCount: number;
  deniedCount: number;
  noAnswerCount: number;
  currentAttempt: number;
  maxAttempts: number;
  consecutiveEmptyBatchCount: number;
  consecutiveErrorCount: number;
  lastQueryUsed?: string | null;
  lastEngineUrl?: string | null;
  lastErrorMessage?: string | null;
  taskStatusCounts?: Record<string, number>;
  completedCityCount?: number;
  currentCity?: string | null;
  progressMessage?: string | null;
  nextRunAt?: string | null;
  nightOnly: boolean;
  allowedStartHour: number;
  allowedEndHour: number;
  timezone: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  batches?: RadarCampaignBatch[];
  tasks?: RadarCampaignTask[];
};

type RadarCampaignsResponse = {
  items: RadarCampaign[];
};

type HbxDashboardEngine = {
  id: string;
  shortLabel: string;
  status: string;
  configured: boolean;
  online: boolean;
  busy: boolean;
  url?: string | null;
  lastError?: string | null;
};

type HbxDashboardStatus = {
  generatedAt: string;
  capacity: {
    queuedCount: number;
    runningCount: number;
    completedLast10Min: number;
    operationalStatus: "healthy" | "degraded";
    message?: string | null;
  };
  engines: HbxDashboardEngine[];
};

type CrmPreviewItem = {
  phoneDigits: string;
  existsInCrm: boolean;
  leadId?: string | null;
  leadName?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  signals?: {
    alreadyExisted: boolean;
    cameFromWebscraping: boolean;
    hadPreviousContact: boolean;
    wasClosedBefore: boolean;
  };
  attemptCount?: number;
  lastContactAt?: string | null;
  lastResult?: string | null;
  timesSeen?: number;
  sourceType?: string | null;
  primarySource?: string | null;
  sharedProfile?: {
    currentContext?: string | null;
    presence?: {
      vendas?: { present?: boolean };
      atendimento?: { present?: boolean };
      recovery?: { present?: boolean };
    };
  } | null;
};

type CrmPreviewResponse = {
  items: CrmPreviewItem[];
};

function normalizePhoneDigits(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

function mergeUniqueSearchResults(current: SearchResult[], incoming: SearchResult[]) {
  const seen = new Set(current.map((result) => normalizePhoneDigits(result.phoneDigits || result.phone)).filter(Boolean));
  const merged = [...current];
  for (const result of incoming || []) {
    const key = normalizePhoneDigits(result.phoneDigits || result.phone);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(result);
  }
  return merged;
}

function normalizeCityLookup(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function splitCityState(value: string, fallbackState = "") {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(.*?)\s*[-,/]\s*([A-Za-z]{2})$/);
  if (!match) {
    return { city: normalized, state: String(fallbackState || "").trim().toUpperCase() };
  }
  return {
    city: match[1].trim(),
    state: String(fallbackState || match[2]).trim().toUpperCase(),
  };
}

function buildCompanyName(currentUser: CurrentUser | null) {
  return String(
    (currentUser?.masterContext?.active
      ? currentUser.masterContext.companyName
      : currentUser?.company?.name) || currentUser?.company?.name || "",
  ).trim();
}

function buildDefaultScriptVariables(currentUser: CurrentUser | null) {
  return {
    speaker: "",
    company: buildCompanyName(currentUser) || "HBX",
  };
}

function buildScriptText(result: SearchResult, city: string, segment: string, speaker: string, company: string) {
  const safeSpeaker = speaker.trim() || "[SEU NOME]";
  const safeCompany = company.trim() || "[SUA EMPRESA]";
  const safeSegment = segment.trim() || "Agenda PF";
  return [
    `Oi, tudo bem? Aqui é ${safeSpeaker} da ${safeCompany}.`,
    `Vi a ${result.name} em ${city} e trabalho com solução para ${safeSegment.toLowerCase()}.`,
    "Posso te explicar em 1 minuto e ver se faz sentido para vocês?",
  ].join(" ");
}

function applyScriptTemplate(
  template: string,
  result: SearchResult,
  city: string,
  segment: string,
  speaker: string,
  company: string,
) {
  const replacements: Record<string, string> = {
    nome: result.name || "Nome do contato",
    cidade: city || "sua cidade",
    segmento: segment || "Agenda PF",
    quem_envia: speaker || "[SEU NOME]",
    empresa: company || "[SUA EMPRESA]",
  };
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, "gi"), value),
    template,
  );
}

function isLikelyMobileWhatsapp(raw: string) {
  const digits = normalizePhoneDigits(raw);
  return /^[1-9]{2}9\d{8}$/.test(digits);
}

function buildWhatsAppUrl(result: SearchResult, scriptText: string) {
  const digits = normalizePhoneDigits(result.phoneDigits || result.phone);
  if (!isLikelyMobileWhatsapp(digits)) return "";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(scriptText)}`;
}

function formatSharedContextLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "vendas") return "Vendas";
  if (normalized === "atendimento") return "Atendimento";
  if (normalized === "recovery") return "Recovery";
  return "Neutro";
}

function buildCallUrl(result: SearchResult) {
  const digits = normalizePhoneDigits(result.phoneDigits || result.phone);
  if (!digits) return "";
  return `tel:+55${digits}`;
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function searchSourceLabel(source?: SearchResponse["meta"]["source"]) {
  if (source === "history") return "histórico privado";
  if (source === "radar_database") return "Banco de Dados";
  if (source === "global_cache") return "cache técnico global";
  if (source === "hybrid") return "histórico + cache/google";
  if (source === "hbx") return "HBX Scraping";
  return "google";
}

function websiteStatusLabel(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "none") return "Sem website";
  if (normalized === "present") return "Com website";
  if (normalized === "social_only") return "Só rede social";
  if (normalized === "weak") return "Website fraco";
  if (normalized === "unreachable") return "Site fora";
  return "Website desconhecido";
}

function opportunityLevelLabel(score?: number | null) {
  const value = Number(score || 0);
  if (value >= 70) return "Alta oportunidade";
  if (value >= 45) return "Média oportunidade";
  return "Baixa oportunidade";
}

function radarStatusLabel(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "sent_to_vendas" || normalized === "imported_to_vendas") return "Enviado para Vendas";
  if (normalized === "no_answer") return "Não atendeu";
  if (normalized === "denied") return "Negou";
  if (normalized === "complaint") return "Reclamação";
  if (normalized === "duplicate") return "Duplicado";
  if (normalized === "rejected") return "Rejeitado";
  if (normalized === "hidden") return "Oculto";
  if (normalized === "new") return "Novo";
  return "Limpo";
}

function radarStatusTone(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "sent_to_vendas" || normalized === "imported_to_vendas") return "sent_to_vendas";
  if (normalized === "no_answer") return "no_answer";
  if (normalized === "denied") return "denied";
  if (normalized === "complaint") return "complaint";
  if (normalized === "duplicate") return "duplicate";
  if (normalized === "rejected" || normalized === "ddd_mismatch") return "rejected";
  if (normalized === "hidden") return "hidden";
  return "clean";
}

function campaignStatusLabel(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "queued") return "Na fila";
  if (normalized === "running") return "Rodando";
  if (normalized === "paused") return "Pausada";
  if (normalized === "sleeping") return "Dormindo";
  if (normalized === "completed") return "Concluída";
  if (normalized === "completed_insufficient_results") return "Parcial concluída";
  if (normalized === "partial_error") return "Erro parcial";
  if (normalized === "failed") return "Falhou";
  if (normalized === "canceled") return "Cancelada";
  return "Campanha";
}

function campaignProgressMessage(campaign: RadarCampaign) {
  if (campaign.mode === "mass_data") {
    const counts = campaign.taskStatusCounts || {};
    const queued = Number(counts.queued || 0);
    const running = Number(counts.running || 0);
    const completed = Number(counts.completed || 0);
    const exhausted = Number(counts.exhausted || 0);
    if (campaign.status === "sleeping") return "Massa de dados aguardando a janela 20h-08h.";
    return `${completed + exhausted} tarefas finalizadas, ${running} rodando, ${queued} na fila. ${campaign.approvedCount} telefones únicos salvos.`;
  }
  const attempt = Math.max(1, Number(campaign.currentAttempt || 0));
  if (campaign.status === "running" || campaign.status === "queued" || campaign.status === "partial_error") {
    if (campaign.lastErrorMessage) return campaign.lastErrorMessage;
    return `Rodando lote ${attempt}/${campaign.maxAttempts}. ${campaign.foundCount} contatos encontrados.`;
  }
  if (campaign.status === "sleeping") return "Aguardando a próxima execução noturna.";
  if (campaign.status === "completed") return `Coleta concluída com ${campaign.approvedCount} contatos limpos.`;
  if (campaign.status === "completed_insufficient_results") return `Coleta encerrada com ${campaign.approvedCount} contatos limpos encontrados.`;
  if (campaign.status === "failed") return campaign.lastErrorMessage || "Coleta interrompida por erro.";
  if (campaign.status === "canceled") return "Coleta cancelada.";
  return `${campaign.foundCount}/${campaign.targetTotal} contatos encontrados.`;
}

function radarHistorySummaryText(value: RadarLeadItem["historySummary"]) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const event = value[0];
    return [event.eventType, event.note, event.createdAt ? formatDateTime(event.createdAt) : ""].filter(Boolean).join(" • ");
  }
  return "";
}

function engineBatteryState(engine: HbxDashboardEngine) {
  const status = String(engine.status || "").toLowerCase();
  if (!engine.configured || !engine.online || status === "offline" || status === "missing") return "offline";
  if (status === "cooldown" || status === "paused" || status === "retry") return "paused";
  if (status === "error" || status === "degraded") return "error";
  if (engine.busy || status === "busy" || status === "running" || status === "online") return "running";
  return "standby";
}

function buildMapUrl(item: RadarLeadItem) {
  const query = [item.name, item.address, item.city, item.state].filter(Boolean).join(" ");
  if (!query.trim()) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function normalizeExternalUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function normalizeEngineValue(value: unknown): WebscrapingEngine {
  return String(value || "").trim().toLowerCase() === "hbx" ? "hbx" : "google";
}

function normalizeTargetTypeValue(value: unknown): HbxTargetType {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pf" || normalized === "agenda_pf") return normalized;
  return "pj";
}

function isPeopleTargetType(value?: HbxTargetType | null) {
  return value === "pf" || value === "agenda_pf";
}

function isLikelyPersonLeadName(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return false;

  const normalized = normalizeCityLookup(raw).replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const exactBlocked = new Set([
    "acesso rapido",
    "agenda telefonica",
    "agenda telefonica em excel",
    "contato encontrado",
    "contato encontrado araras",
    "curso online",
    "home",
    "pagina inicial",
    "relacao de unidades",
    "secretaria municipal",
  ]);
  if (exactBlocked.has(normalized)) return false;

  const blockedFragments = [
    "acesso rapido",
    "agenda telefonica",
    "catalogo",
    "clinica",
    "construtora",
    "curso",
    "empresa",
    "excel",
    "hospital",
    "lista telefonica",
    "noticia",
    "oficina",
    "pagina inicial",
    "prefeitura",
    "relacao de unidades",
    "secretaria",
    "telefone",
    "telefones",
  ];
  if (blockedFragments.some((fragment) => normalized.includes(fragment))) return false;

  const meaningfulWords = normalized
    .split(" ")
    .filter((word) => word && !["a", "as", "da", "das", "de", "do", "dos", "e", "em", "na", "no"].includes(word));

  if (meaningfulWords.length < 2 || meaningfulWords.length > 6) return false;
  if (meaningfulWords.some((word) => /\d/.test(word))) return false;

  const shortWords = meaningfulWords.filter((word) => word.length <= 2);
  return shortWords.length < meaningfulWords.length;
}

function filterResultsForTarget(results: SearchResult[], targetType: HbxTargetType) {
  if (!isPeopleTargetType(targetType)) return results;
  return [...results].sort((left, right) => {
    const leftPerson = isLikelyPersonLeadName(left.name) ? 0 : 1;
    const rightPerson = isLikelyPersonLeadName(right.name) ? 0 : 1;
    return leftPerson - rightPerson;
  });
}

function getSearchMode(engine: WebscrapingEngine, targetType: HbxTargetType) {
  if (engine === "hbx") {
    return SEARCH_MODE_OPTIONS.find((option) => option.id === "hbx_radar") || SEARCH_MODE_OPTIONS[0];
  }
  return (
    SEARCH_MODE_OPTIONS.find((option) => option.engine === engine && option.targetType === targetType) ||
    SEARCH_MODE_OPTIONS[0]
  );
}

function getVisualSegment(segment: string | null | undefined, targetType?: HbxTargetType) {
  const value = String(segment || "").trim();
  if (value) return value;
  return targetType === "agenda_pf" ? "Agenda PF" : "";
}

function inferDddFromCity(value: string) {
  const normalized = normalizeCityLookup(value);
  if (!normalized) return "";
  return COMMON_CITY_DDD[normalized] || COMMON_CITY_DDD[normalized.replace(/\s+-\s+[a-z]{2}$/i, "")] || "";
}

function normalizeDdd(value: string) {
  return String(value || "").replace(/\D/g, "").slice(0, 2);
}

function buildPfSegment(role: string, niche: string, ddd: string) {
  const parts = [role.trim(), niche.trim()].filter(Boolean);
  const base = parts.join(" ");
  const normalizedDdd = normalizeDdd(ddd);
  return normalizedDdd ? `${base} DDD ${normalizedDdd}`.trim() : base;
}

function parsePfSegment(value: string) {
  let normalized = String(value || "").trim();
  const dddMatch = normalized.match(/\bDDD\s*(\d{2})\b/i);
  const ddd = dddMatch ? dddMatch[1] : "";
  normalized = normalized.replace(/\bDDD\s*\d{2}\b/gi, "").trim();
  const role = PF_ROLE_OPTIONS.find((option) => normalizeCityLookup(normalized).startsWith(`${normalizeCityLookup(option)} `));
  const niche = role ? normalized.slice(role.length).trim() : normalized;
  return {
    role: role || "consultor",
    niche,
    ddd,
  };
}

function searchModeTitle(option: (typeof SEARCH_MODE_OPTIONS)[number]) {
  if (option.id === "google_pj") return "Google oficial";
  return "Radar de oportunidades";
}

function searchModeLimit(option: (typeof SEARCH_MODE_OPTIONS)[number]) {
  const max = option.quantityOptions[option.quantityOptions.length - 1] || 20;
  return `Até ${max} resultados`;
}

function searchModeGuide(option: (typeof SEARCH_MODE_OPTIONS)[number]) {
  if (option.id === "hbx_radar") {
    return {
      input: "Filtro CNPJ, CPF ou Agenda",
      output: "Leads priorizados sem repetição",
      action: "Justificativa, roteiro e CRM",
    };
  }

  return {
    input: "Cidade, segmento e filtros",
    output: "Resultados oficiais do Google",
    action: "Exportar com controle de cota",
  };
}

type IconName =
  | "alert"
  | "book"
  | "check"
  | "chevron"
  | "clock"
  | "cursor"
  | "download"
  | "play"
  | "search"
  | "spark"
  | "user"
  | "wifi"
  | "zap";

function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    alert: (
      <>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.7 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
        <path d="M4 5.5v16" />
        <path d="M8 7h8" />
        <path d="M8 11h7" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    cursor: (
      <>
        <path d="M4 3 15.5 14.5 11 15.5 9.5 20 4 3Z" />
        <path d="m13 13 5 5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    play: <path d="M7 5v14l12-7L7 5Z" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16.5 16.5 4 4" />
      </>
    ),
    spark: (
      <>
        <path d="M12 2 14.4 8.1 21 10.5 14.4 12.9 12 19 9.6 12.9 3 10.5 9.6 8.1 12 2Z" />
        <path d="M19 2v4" />
        <path d="M21 4h-4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    wifi: (
      <>
        <path d="M5 13a10 10 0 0 1 14 0" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M12 20h.01" />
      </>
    ),
    zap: <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function buildFilterSummary(filters: SearchFilters) {
  const parts: string[] = [];
  if (filters.minRating != null) parts.push(`nota >= ${filters.minRating.toFixed(1)}`);
  if (filters.minReviews != null) parts.push(`${filters.minReviews}+ avaliacoes`);
  return parts.length ? parts.join(" • ") : "Sem filtros avancados";
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

async function downloadExcel(body: Record<string, unknown>) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/webscraping/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.text();
    try {
      const parsed = JSON.parse(payload) as { message?: string };
      throw new Error(parsed?.message || "Falha ao exportar Excel.");
    } catch {
      throw new Error(payload || "Falha ao exportar Excel.");
    }
  }

  const blob = await response.blob();
  const header = response.headers.get("Content-Disposition") || "";
  const match = header.match(/filename="([^"]+)"/i);
  const fileName = match?.[1] || "prospeccao.xlsx";
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

type WebscrapingClientPageProps = {
  mode?: "search" | "radar";
};

export default function WebscrapingClientPage({ mode = "search" }: WebscrapingClientPageProps) {
  const router = useRouter();
  const hasToken = useRequireModule("webscraping");
  const resultsRef = useRef<HTMLElement | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAutoScrollKeyRef = useRef("");
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>([]);
  const [radarItems, setRadarItems] = useState<RadarLeadItem[]>([]);
  const [radarFacets, setRadarFacets] = useState<RadarFacet[]>([]);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarPulling, setRadarPulling] = useState(false);
  const [radarActionId, setRadarActionId] = useState<string | null>(null);
  const [radarMeta, setRadarMeta] = useState<RadarPullResponse["meta"] | null>(null);
  const [radarFilters, setRadarFilters] = useState<RadarFilterState>({
    page: 1,
    filterKey: "all",
    state: "",
    city: "",
    segment: "",
    quantity: 20,
    source: "",
    ddd: "",
    scoreRange: "",
    noWebsite: false,
    highOpportunity: false,
    minRating: "",
    minReviews: "",
  });
  const [radarSelectedIds, setRadarSelectedIds] = useState<string[]>([]);
  const [radarDetail, setRadarDetail] = useState<RadarLeadDetailsResponse | null>(null);
  const [radarDetailLoading, setRadarDetailLoading] = useState(false);
  const [radarViewMode, setRadarViewMode] = useState<"database" | "campaign">("database");
  const [radarCampaigns, setRadarCampaigns] = useState<RadarCampaign[]>([]);
  const [engineDashboard, setEngineDashboard] = useState<HbxDashboardStatus | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignActionId, setCampaignActionId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    targetType: "pj" as HbxTargetType,
    mode: "mass_data",
    state: "",
    city: "",
    segment: "",
    targetTotal: 0,
    batchSize: 20,
    nightOnly: true,
    allowedStartHour: 20,
    allowedEndHour: 8,
    maxAttemptsPerTask: 3,
  });
  const [stateSuggestionsOpen, setStateSuggestionsOpen] = useState(false);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [activeCitySuggestionIndex, setActiveCitySuggestionIndex] = useState(0);
  const [segmentSuggestionsOpen, setSegmentSuggestionsOpen] = useState(false);
  const [openRadarPicker, setOpenRadarPicker] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState("");
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("");
  const [engine, setEngine] = useState<WebscrapingEngine>("google");
  const [targetType, setTargetType] = useState<HbxTargetType>("pj");
  const [pfRole, setPfRole] = useState("consultor");
  const [pfDdd, setPfDdd] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [minRating, setMinRating] = useState("");
  const [minReviews, setMinReviews] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeQuery, setActiveQuery] = useState<SearchResponse["query"] | null>(null);
  const [searchMeta, setSearchMeta] = useState<SearchResponse["meta"] | null>(null);
  const [activeSearchRun, setActiveSearchRun] = useState<SearchRunResponse | null>(null);
  const [activeSearchRunId, setActiveSearchRunId] = useState<string | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [searching, setSearching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importingToVendas, setImportingToVendas] = useState(false);
  const [crmPreviewByPhone, setCrmPreviewByPhone] = useState<Record<string, CrmPreviewItem>>({});
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"search" | "radar">(mode);
  const [appliedScriptSender, setAppliedScriptSender] = useState("");
  const [appliedScriptCompany, setAppliedScriptCompany] = useState("");
  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptDraftTouched, setScriptDraftTouched] = useState(false);
  const [appliedScriptTemplate, setAppliedScriptTemplate] = useState("");
  const crmLaunchNotice = useQuickLaunchNotice();
  const scrapingLaunchNotice = useQuickLaunchNotice();

  const selectedSearchMode = useMemo(() => getSearchMode(engine, targetType), [engine, targetType]);
  const quantityOptions = selectedSearchMode.quantityOptions;
  const maxQuantity = quantityOptions[quantityOptions.length - 1] || 20;
  const agendaMode = engine === "hbx" && targetType === "agenda_pf";
  const pfMode = engine === "hbx" && targetType === "pf";
  const hbxPjMode = engine === "hbx" && targetType === "pj";
  const segmentLabel = getVisualSegment(segment, targetType);
  const remainingSearchesLabel = useMemo(() => {
    if (!runtime?.quota) return "-";
    if (runtime.quota.accessMode === "blocked") return "0";
    return String(Math.max(0, Number(runtime.quota.remainingSearches || 0)));
  }, [runtime?.quota]);
  const defaultScriptVariables = useMemo(() => buildDefaultScriptVariables(currentUser), [currentUser]);
  const cityOptions = useMemo(() => BRAZIL_CITIES_BY_STATE[selectedState] || [], [selectedState]);
  const stateSuggestionItems = useMemo(() => {
    const normalized = normalizeCityLookup(selectedState);
    return BRAZIL_STATES
      .map((item) => ({ value: item.uf, label: `${item.uf} - ${item.name}` }))
      .filter((item) => !normalized || normalizeCityLookup(item.label).includes(normalized));
  }, [selectedState]);
  const radarCityOptions = useMemo(() => BRAZIL_CITIES_BY_STATE[String(radarFilters.state || "").trim().toUpperCase()] || [], [radarFilters.state]);
  const campaignCityOptions = useMemo(() => BRAZIL_CITIES_BY_STATE[String(campaignForm.state || "").trim().toUpperCase()] || [], [campaignForm.state]);
  const scriptPresetStorageKey = useMemo(() => {
    const identity = currentUser?.id ?? currentUser?.email ?? currentUser?.username ?? "local";
    return `webscraping.scriptPreset.${identity}`;
  }, [currentUser?.email, currentUser?.id, currentUser?.username]);
  const cityExactOption = useMemo(() => {
    const normalizedCity = normalizeCityLookup(city);
    if (!normalizedCity) return "";
    return cityOptions.find((option) => normalizeCityLookup(option) === normalizedCity) || "";
  }, [city, cityOptions]);
  const inferredDdd = useMemo(() => inferDddFromCity(cityExactOption || city), [city, cityExactOption]);
  const effectiveDdd = normalizeDdd(pfDdd) || inferredDdd;
  const effectiveSegment = useMemo(() => {
    if (pfMode) return buildPfSegment(pfRole, segment, effectiveDdd);
    if (agendaMode && !segment.trim()) return "";
    return segment.trim();
  }, [agendaMode, effectiveDdd, pfMode, pfRole, segment]);
  const activeSegmentSuggestions = pfMode ? PF_NICHE_SUGGESTIONS : SEGMENT_SUGGESTIONS;

  useEffect(() => {
    const notice = scrapingLaunchNotice.notice || crmLaunchNotice.notice;
    if (!notice) {
      clearTopbarProgress("webscraping");
      return;
    }

    const targetQuantity = Number(activeSearchRun?.targetQuantity || quantity || 0);
    const foundCount = Number(activeSearchRun?.foundCount || results.length || 0);
    const discardedCount = Number(activeSearchRun?.duplicateCount || 0) + Number(activeSearchRun?.skippedCount || 0);
    const remainingCount = Math.max(0, targetQuantity - foundCount);
    const status =
      notice.statusLabel ||
      (notice.phase === "loading"
        ? "Raspando páginas públicas..."
        : "Resultados prontos para revisar.");

    dispatchTopbarProgress({
      source: "webscraping",
      phase: notice.phase,
      title: notice.phase === "loading" ? "Scraping em andamento" : notice.title,
      status,
      progress: notice.progress,
      metrics: [
        { label: "Restante", value: String(remainingCount) },
        { label: "Descarte", value: String(discardedCount) },
      ],
    });
  }, [
    activeSearchRun,
    crmLaunchNotice.notice,
    quantity,
    results.length,
    scrapingLaunchNotice.notice,
  ]);

  useEffect(() => () => clearTopbarProgress("webscraping"), []);
  const segmentSuggestionItems = useMemo(() => {
    const normalizedSegment = normalizeCityLookup(segment);
    if (!normalizedSegment) return activeSegmentSuggestions;
    const filtered = activeSegmentSuggestions.filter((option) => normalizeCityLookup(option).includes(normalizedSegment));
    return filtered.length ? filtered : activeSegmentSuggestions;
  }, [activeSegmentSuggestions, segment]);
  const citySuggestionItems = useMemo(() => {
    const normalizedCity = normalizeCityLookup(city);
    if (!normalizedCity) return cityOptions;

    return cityOptions
      .map((option) => ({
        option,
        normalized: normalizeCityLookup(option),
      }))
      .filter((item) => item.normalized.includes(normalizedCity))
      .sort((left, right) => {
        const leftStarts = left.normalized.startsWith(normalizedCity) ? 0 : 1;
        const rightStarts = right.normalized.startsWith(normalizedCity) ? 0 : 1;
        return leftStarts - rightStarts || left.option.localeCompare(right.option, "pt-BR");
      })
      .map((item) => item.option);
  }, [city, cityOptions]);
  const shouldShowCitySuggestions =
    citySuggestionsOpen && Boolean(selectedState) && citySuggestionItems.length > 0;
  const shouldShowStateSuggestions = stateSuggestionsOpen && stateSuggestionItems.length > 0;
  const citySelectionPending = cityOptions.length > 0 && city.trim().length > 0 && !cityExactOption;
  const activeCitySuggestion = shouldShowCitySuggestions
    ? citySuggestionItems[Math.min(activeCitySuggestionIndex, citySuggestionItems.length - 1)] || ""
    : "";
  const resultTargetType = useMemo(() => {
    if (!activeQuery) return targetType;
    if (activeQuery.engine === "hbx" || isPeopleTargetType(activeQuery.targetType)) {
      return normalizeTargetTypeValue(activeQuery.targetType);
    }
    return "pj";
  }, [activeQuery, targetType]);
  const qualifiedResults = useMemo(
    () => filterResultsForTarget(results, resultTargetType),
    [resultTargetType, results],
  );
  const hiddenGenericResultsCount = Math.max(0, results.length - qualifiedResults.length);
  const automaticScriptPreview = useMemo(() => {
    const previewResult: SearchResult = {
      name: qualifiedResults[0]?.name || "Nome do contato",
      phone: "",
      phoneDigits: "",
      rating: null,
      reviews: 0,
      address: "",
      website: "",
    };
    const previewCity = (activeQuery?.city || city || "sua cidade").trim();
    const previewSegment =
      getVisualSegment(activeQuery?.segment ?? effectiveSegment, activeQuery?.targetType || targetType) || "Agenda PF";
    return buildScriptText(
      previewResult,
      previewCity,
      previewSegment,
      appliedScriptSender || defaultScriptVariables.speaker,
      appliedScriptCompany || defaultScriptVariables.company,
    );
  }, [
    activeQuery?.city,
    activeQuery?.segment,
    activeQuery?.targetType,
    appliedScriptCompany,
    appliedScriptSender,
    city,
    defaultScriptVariables.company,
    defaultScriptVariables.speaker,
    effectiveSegment,
    qualifiedResults,
    targetType,
  ]);
  const scriptEditorValue = scriptDraftTouched ? scriptDraft : automaticScriptPreview;

  function buildAppliedScriptText(result: SearchResult, scriptCity: string, scriptSegment: string) {
    const sender = appliedScriptSender || defaultScriptVariables.speaker;
    const company = appliedScriptCompany || defaultScriptVariables.company;
    const customTemplate = appliedScriptTemplate.trim();
    if (customTemplate) {
      return applyScriptTemplate(customTemplate, result, scriptCity, scriptSegment, sender, company);
    }
    return buildScriptText(result, scriptCity, scriptSegment, sender, company);
  }

  function openVendasDashboard() {
    crmLaunchNotice.clear();
    router.push("/vendas");
  }

  function focusScrapingResults() {
    scrapingLaunchNotice.clear();
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    if (hasToken !== true) return;

    let cancelled = false;

    (async () => {
      setLoadingBootstrap(true);
      try {
        const [runtimePayload, profilePayload, historyPayload, radarPayload, campaignPayload, enginePayload] = await Promise.all([
          apiFetch<RuntimeResponse>("/webscraping/runtime"),
          apiFetch<CurrentUser>("/profile/current-user"),
          apiFetch<HistoryResponse>("/webscraping/history?limit=20"),
          mode === "radar"
            ? apiFetch<RadarDatabaseResponse>("/webscraping/radar/leads?limit=50").catch(() => ({ items: [], total: 0, facets: [] }))
            : Promise.resolve({ items: [], total: 0, facets: [] } as RadarDatabaseResponse),
          mode === "radar"
            ? apiFetch<RadarCampaignsResponse>("/webscraping/campaigns").catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] } as RadarCampaignsResponse),
          mode === "radar"
            ? apiFetch<HbxDashboardStatus>("/webscraping/engines/status").catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setRuntime(runtimePayload);
        setCurrentUser(profilePayload);
        setHistoryItems(historyPayload.items || []);
        setRadarItems(radarPayload.items || []);
        setRadarFacets((radarPayload.facets || []).filter((facet) => Number(facet.count || 0) > 0));
        setRadarCampaigns(campaignPayload.items || []);
        setEngineDashboard(enginePayload || null);
        setPageError(null);
      } catch (error) {
        if (cancelled) return;
        setPageError(error instanceof Error ? error.message : "Falha ao carregar o modulo de prospeccao.");
      } finally {
        if (!cancelled) {
          setLoadingBootstrap(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasToken, mode]);

  useEffect(() => {
    if (!feedback) return;
    if (searching) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback, searching]);

  useEffect(() => {
    if (searching || !hasSearched || qualifiedResults.length === 0) return;
    const scrollKey = [
      searchMeta?.historyId || "sem-historico",
      activeQuery?.city || city,
      activeQuery?.segment || effectiveSegment,
      qualifiedResults.length,
    ].join("|");
    if (lastAutoScrollKeyRef.current === scrollKey) return;
    lastAutoScrollKeyRef.current = scrollKey;
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeQuery?.city, activeQuery?.segment, city, effectiveSegment, hasSearched, qualifiedResults.length, searchMeta?.historyId, searching]);

  useEffect(() => {
    setQuantity((current) => {
      if (current > maxQuantity) return maxQuantity;
      if (quantityOptions.includes(current)) return current;
      return quantityOptions.find((option) => option >= current) || maxQuantity;
    });
  }, [maxQuantity, quantityOptions]);

  useEffect(() => {
    setActiveCitySuggestionIndex(0);
  }, [city]);

  useEffect(() => {
    const query = activeQuery || (city.trim() && (effectiveSegment || agendaMode) ? { city, segment: effectiveSegment, targetType } : null);
    if (!qualifiedResults.length || !query) {
      setCrmPreviewByPhone({});
      return;
    }
    const leadSegment = getVisualSegment(query.segment, activeQuery ? resultTargetType : targetType);

    let cancelled = false;

    (async () => {
      try {
        const payload = await apiFetch<CrmPreviewResponse>("/vendas/import/webscraping/preview", {
          method: "POST",
          body: JSON.stringify({
            sourceHistoryId: activeSearchRun ? undefined : searchMeta?.historyId || undefined,
            leads: qualifiedResults.map((result) => ({
              name: result.name,
              phone: result.phone,
              phoneDigits: result.phoneDigits,
              city: query.city,
              segment: leadSegment,
            })),
          }),
        });
        if (cancelled) return;
        const next: Record<string, CrmPreviewItem> = {};
        for (const item of payload.items || []) {
          const key = String(item.phoneDigits || "").trim();
          if (!key) continue;
          next[key] = item;
        }
        setCrmPreviewByPhone(next);
      } catch {
        if (!cancelled) {
          setCrmPreviewByPhone({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeQuery, activeSearchRun, agendaMode, city, effectiveSegment, qualifiedResults, resultTargetType, searchMeta?.historyId, targetType]);

  useEffect(() => {
    const fallbackSender = String(currentUser?.email || "").trim();
    try {
      const saved = window.localStorage.getItem(scriptPresetStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          sender?: string;
          company?: string;
          template?: string;
        };
        const savedTemplate = String(parsed.template || "");
        setAppliedScriptSender(String(parsed.sender || fallbackSender));
        setAppliedScriptCompany(String(parsed.company || defaultScriptVariables.company));
        setAppliedScriptTemplate(savedTemplate);
        setScriptDraft(savedTemplate);
        setScriptDraftTouched(Boolean(savedTemplate));
        return;
      }
    } catch {
      // ignore storage errors
    }
    setAppliedScriptSender(fallbackSender);
    setAppliedScriptCompany(defaultScriptVariables.company);
    setAppliedScriptTemplate("");
    setScriptDraft("");
    setScriptDraftTouched(false);
  }, [currentUser?.email, defaultScriptVariables.company, scriptPresetStorageKey]);

  function buildPayload(overrides: Partial<{ quantity: number; excludePhoneDigits: string[] }> = {}) {
    const basePayload = {
      city: city.trim(),
      state: selectedState || undefined,
      segment: effectiveSegment,
      quantity: overrides.quantity ?? quantity,
      ...(overrides.excludePhoneDigits?.length ? { excludePhoneDigits: overrides.excludePhoneDigits } : {}),
    };

    if (engine === "google") {
      return {
        ...basePayload,
        minRating: minRating ? Number(minRating) : undefined,
        minReviews: minReviews ? Number(minReviews) : undefined,
      };
    }

    return {
      ...basePayload,
      engine,
      targetType,
      minRating: targetType === "pj" && minRating ? Number(minRating) : undefined,
      minReviews: targetType === "pj" && minReviews ? Number(minReviews) : undefined,
    };
  }

  function handleSearchModeChange(modeId: SearchModeId) {
    const nextMode = SEARCH_MODE_OPTIONS.find((option) => option.id === modeId) || SEARCH_MODE_OPTIONS[0];
    setEngine(nextMode.engine);
    if (nextMode.engine === "google") {
      setTargetType("pj");
    } else {
      setTargetType((current) => current || "pj");
    }
    setQuantity((current) => {
      const nextMax = nextMode.quantityOptions[nextMode.quantityOptions.length - 1] || current;
      if (current > nextMax) return nextMax;
      if (nextMode.quantityOptions.includes(current)) return current;
      return nextMode.quantityOptions.find((option) => option >= current) || nextMax;
    });
  }

  function handleHbxTargetTypeChange(nextTargetType: HbxTargetType) {
    setTargetType(nextTargetType);
    if (nextTargetType === "pf" && (!segment.trim() || SEGMENT_SUGGESTIONS.includes(segment))) {
      setSegment("plano de saúde");
    }
    if (nextTargetType === "agenda_pf" && SEGMENT_SUGGESTIONS.includes(segment)) {
      setSegment("");
    }
  }

  function selectCitySuggestion(option: string) {
    setCity(option);
    setCitySuggestionsOpen(false);
    setActiveCitySuggestionIndex(0);
  }

  function handleStateChange(nextState: string) {
    const normalizedState = nextState.trim().toUpperCase();
    setSelectedState(normalizedState);
    setCity("");
    setCitySuggestionsOpen(false);
    setActiveCitySuggestionIndex(0);
  }

  function handleCityKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!shouldShowCitySuggestions) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveCitySuggestionIndex((current) => Math.min(current + 1, citySuggestionItems.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveCitySuggestionIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (activeCitySuggestion) {
        selectCitySuggestion(activeCitySuggestion);
      }
      return;
    }

    if (event.key === "Escape") {
      setCitySuggestionsOpen(false);
    }
  }

  async function refreshHistory() {
    try {
      const payload = await apiFetch<HistoryResponse>("/webscraping/history?limit=20");
      setHistoryItems(payload.items || []);
    } catch {
      // no-op
    }
  }

  function buildRadarPayload(overrides: Partial<RadarFilterState> = {}) {
    const next = { ...radarFilters, ...overrides };
    return {
      page: next.page,
      filterKey: next.filterKey && next.filterKey !== "all" ? next.filterKey : undefined,
      state: next.state || undefined,
      city: next.city.trim() || undefined,
      segment: next.segment.trim() || undefined,
      quantity: next.quantity,
      limit: 50,
      source: next.source.trim() || undefined,
      ddd: next.ddd.trim() || undefined,
      scoreRange: next.scoreRange.trim() || undefined,
      noWebsite: next.noWebsite || undefined,
      highOpportunity: next.highOpportunity || undefined,
      minRating: next.minRating ? Number(next.minRating) : undefined,
      minReviews: next.minReviews ? Number(next.minReviews) : undefined,
      validPhone: true,
    };
  }

  function buildRadarQueryString(overrides: Partial<RadarFilterState> = {}) {
    const payload = buildRadarPayload(overrides);
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      params.set(key, String(value));
    });
    return params.toString();
  }

  async function refreshRadarDatabase(overrides: Partial<RadarFilterState> = {}) {
    setRadarLoading(true);
    setSearchError(null);
    try {
      const query = buildRadarQueryString(overrides);
      const payload = await apiFetch<RadarDatabaseResponse>(`/webscraping/radar/leads${query ? `?${query}` : ""}`);
      setRadarItems(payload.items || []);
      setRadarFacets((payload.facets || []).filter((facet) => Number(facet.count || 0) > 0));
      setRadarMeta(null);
      if (payload.meta?.message) setFeedback(payload.meta.message);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao carregar Banco de Dados.");
    } finally {
      setRadarLoading(false);
    }
  }

  async function handleRadarPull() {
    if (!radarFilters.state.trim() || !radarFilters.city.trim() || !radarFilters.segment.trim()) {
      setSearchError("Preencha estado, cidade e segmento para puxar cards do Radar.");
      return;
    }
    setRadarPulling(true);
    setSearchError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<RadarPullResponse>("/webscraping/radar/pull", {
        method: "POST",
        body: JSON.stringify({
          ...buildRadarPayload(),
          engine: "hbx",
          desiredStock: 300,
          minimumStock: 80,
        }),
      });
      setRadarItems(payload.items || []);
      setRadarMeta(payload.meta || null);
      const delivered = payload.meta?.deliveredCount ?? payload.items?.length ?? 0;
      const replenishText = payload.meta?.replenish?.ran
        ? ` Reposição ativada: ${payload.meta.replenish.fetchedCount || 0} card(s) novos.`
        : "";
      setFeedback(`${delivered} card(s) puxados do Banco de Dados.${replenishText}`);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao puxar cards do Radar.");
    } finally {
      setRadarPulling(false);
    }
  }

  async function handleRadarImport(item: RadarLeadItem) {
    setRadarActionId(item.id);
    setSearchError(null);
    try {
      await apiFetch(`/webscraping/radar/leads/${item.id}/send-to-vendas`, {
        method: "POST",
      });
      setRadarItems((current) => current.map((lead) => (lead.id === item.id ? { ...lead, status: "sent_to_vendas", companyStatus: "sent_to_vendas" } : lead)));
      setFeedback(`${item.name || "Card"} herdado para Vendas.`);
      void refreshRadarDatabase();
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao herdar card para Vendas.");
    } finally {
      setRadarActionId(null);
    }
  }

  async function handleRadarLeadEvent(item: RadarLeadItem, eventType: "denied" | "complaint" | "no_answer" | "hidden", note?: string) {
    setRadarActionId(item.id);
    setSearchError(null);
    try {
      const payload = await apiFetch<RadarLeadDetailsResponse>(`/webscraping/radar/leads/${item.id}/event`, {
        method: "POST",
        body: JSON.stringify({ eventType, note }),
      });
      setRadarItems((current) => current.map((lead) => (lead.id === item.id ? payload.item : lead)));
      setRadarDetail((current) => (current?.item.id === item.id ? payload : current));
      const labels: Record<typeof eventType, string> = {
        denied: "marcado como negou",
        complaint: "marcado como reclamação",
        no_answer: "marcado como não atendeu",
        hidden: "ocultado",
      };
      setFeedback(`${item.name || "Card"} ${labels[eventType]}.`);
      void refreshRadarDatabase();
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao atualizar card.");
    } finally {
      setRadarActionId(null);
    }
  }

  async function handleRadarNegative(item: RadarLeadItem) {
    await handleRadarLeadEvent(item, "hidden", "Ocultado no Banco Radar");
  }

  async function openRadarDetails(item: RadarLeadItem) {
    setRadarDetailLoading(true);
    setSearchError(null);
    try {
      const payload = await apiFetch<RadarLeadDetailsResponse>(`/webscraping/radar/leads/${item.id}`);
      setRadarDetail(payload);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao carregar histórico do card.");
    } finally {
      setRadarDetailLoading(false);
    }
  }

  function toggleRadarSelection(itemId: string) {
    setRadarSelectedIds((current) => (
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    ));
  }

  async function refreshRadarCampaigns() {
    setCampaignLoading(true);
    try {
      const [payload, engines] = await Promise.all([
        apiFetch<RadarCampaignsResponse>("/webscraping/campaigns"),
        apiFetch<HbxDashboardStatus>("/webscraping/engines/status").catch(() => null),
      ]);
      setRadarCampaigns(payload.items || []);
      setEngineDashboard(engines || null);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao carregar campanhas.");
    } finally {
      setCampaignLoading(false);
    }
  }

  async function handleCreateRadarCampaign() {
    if (campaignForm.mode !== "mass_data" && !campaignForm.segment.trim()) {
      setSearchError("Informe o nicho/serviço da campanha.");
      return;
    }
    if (!campaignForm.state.trim()) {
      setSearchError("Estado é obrigatório para a campanha.");
      return;
    }
    setCampaignLoading(true);
    setSearchError(null);
    try {
      const campaign = await apiFetch<RadarCampaign>("/webscraping/campaigns", {
        method: "POST",
        body: JSON.stringify({
          ...campaignForm,
          mode: campaignForm.mode,
          nightOnly: true,
          allowedStartHour: campaignForm.mode === "mass_data" ? 20 : campaignForm.allowedStartHour,
          allowedEndHour: campaignForm.mode === "mass_data" ? 8 : campaignForm.allowedEndHour,
          batchSize: campaignForm.mode === "mass_data" ? 20 : campaignForm.batchSize,
          maxAttemptsPerTask: campaignForm.mode === "mass_data" ? 3 : campaignForm.maxAttemptsPerTask,
        }),
      });
      setRadarCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
      setFeedback(campaignForm.mode === "mass_data" ? "MASSA DE DADOS criada. Os motores rodam em lotes de 20 entre 20h e 08h." : "Campanha criada. A coleta será executada em lotes noturnos e os aprovados entram no Consultar Banco.");
      setRadarViewMode("campaign");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao criar campanha.");
    } finally {
      setCampaignLoading(false);
    }
  }

  async function handleCampaignAction(campaign: RadarCampaign, action: "pause" | "resume" | "cancel") {
    setCampaignActionId(campaign.id);
    setSearchError(null);
    try {
      const updated = await apiFetch<RadarCampaign>(`/webscraping/campaigns/${campaign.id}/${action}`, { method: "POST" });
      setRadarCampaigns((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao atualizar campanha.");
    } finally {
      setCampaignActionId(null);
    }
  }

  useEffect(() => {
    if (hasToken !== true || panelMode !== "radar") return;
    const timer = window.setInterval(() => {
      void refreshRadarCampaigns();
    }, 7000);
    return () => window.clearInterval(timer);
  }, [hasToken, panelMode]);

  function searchRunStatusLabel(status: SearchRunStatus) {
    if (status === "queued") return "na fila";
    if (status === "running") return "em andamento";
    if (status === "completed") return "concluida";
    if (status === "partial_error") return "parcial";
    if (status === "completed_insufficient_results") return "parcial";
    if (status === "failed") return "falhou";
    if (status === "canceled") return "cancelada";
    return status;
  }

  function isSearchRunTerminal(payload: SearchRunResponse) {
    if (payload.nextRetryAt && (payload.status === "queued" || payload.status === "running" || payload.status === "failed")) {
      return false;
    }
    return (
      payload.status === "completed" ||
      payload.status === "partial_error" ||
      payload.status === "completed_insufficient_results" ||
      payload.status === "failed" ||
      payload.status === "canceled"
    );
  }

  function buildSearchRunFeedback(payload: SearchRunResponse) {
    const found = Number(payload.foundCount || 0);
    const attempt = Number(payload.attemptCount || 0);
    const maxAttempts = Number(payload.maxAttempts || 0);
    const lote = maxAttempts ? `Rodando lote ${Math.max(1, attempt)}/${maxAttempts}` : "Rodando lote";

    if (payload.status === "queued" && payload.errorMessage?.includes("Aguardando motor")) {
      return `Aguardando motor livre. ${found} contatos encontrados.`;
    }
    if ((payload.status === "queued" || payload.status === "running") && payload.lastBatchError) {
      return payload.errorMessage || `${found} contatos encontrados. Último lote falhou, tentando novamente...`;
    }
    if ((payload.status === "queued" || payload.status === "running") && found > 0) {
      return `${lote}. Encontramos ${found} contatos até agora. Continuando busca em novos lotes...`;
    }
    if (payload.status === "queued" || payload.status === "running") {
      return `${lote}. ${found} contatos encontrados.`;
    }
    if (payload.status === "completed_insufficient_results" || payload.status === "partial_error") {
      return payload.errorMessage || `Busca parcial: ${found} contatos encontrados.`;
    }
    return (
      payload.errorMessage ||
      `Pesquisa ${searchRunStatusLabel(payload.status)}: ${found}/${payload.targetQuantity} encontrados, ${payload.duplicateCount} duplicados, ${payload.skippedCount} ignorados.`
    );
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function applySearchRunPayload(payload: SearchRunResponse) {
    setActiveSearchRun(payload);
    setResults(payload.results || []);
    setActiveQuery(payload.query);
    setSearchMeta({
      ...payload.meta,
      fetchedCount: payload.foundCount,
      totalStoredCount: payload.foundCount,
      duplicateCount: payload.duplicateCount,
      skippedCount: payload.skippedCount,
      importedCount: payload.importedCount,
    });
    setHasSearched(true);
    setFeedback(buildSearchRunFeedback(payload));
  }

  async function pollSearchRun(runId: string) {
    for (;;) {
      const payload = await apiFetch<SearchRunResponse>(`/webscraping/search-runs/${runId}`);
      applySearchRunPayload(payload);
      if (isSearchRunTerminal(payload)) return payload;
      await wait(2000);
    }
  }

  async function handleCancelSearchRun() {
    if (!activeSearchRunId) return;
    try {
      const payload = await apiFetch<SearchRunResponse>(`/webscraping/search-runs/${activeSearchRunId}/cancel`, {
        method: "POST",
      });
      applySearchRunPayload(payload);
      setSearching(false);
      scrapingLaunchNotice.clear();
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao cancelar pesquisa.");
    }
  }

  async function handleSearch() {
    setSearchError(null);
    setFeedback(null);

    if (!hbxPjMode && !selectedState) {
      setSearchError("Selecione o estado.");
      return;
    }

    if (!hbxPjMode && !city.trim()) {
      setSearchError("Informe a cidade.");
      return;
    }

    const selectedCity = cityExactOption || (cityOptions.length === 0 || hbxPjMode ? city.trim() : "");
    if ((city.trim() || !hbxPjMode) && selectedState && (citySelectionPending || !selectedCity)) {
      if (citySuggestionItems.length > 0) {
        setSearchError("Selecione uma cidade da lista do estado escolhido.");
      } else {
        setSearchError("Selecione uma cidade existente na lista.");
      }
      setCitySuggestionsOpen(true);
      return;
    }

    if (pfMode && !segment.trim()) {
      setSearchError("Informe o nicho ou serviço para encontrar pessoas. Ex: plano de saúde, seguros, imóveis.");
      return;
    }

    if (!agendaMode && !pfMode && !segment.trim()) {
      setSearchError(hbxPjMode ? "Informe o que deseja prospectar." : "Informe o segmento.");
      return;
    }

    const searchModeSnapshot = selectedSearchMode;
    const requestedSegment = effectiveSegment || getVisualSegment(segment, targetType) || searchModeSnapshot.label;
    scrapingLaunchNotice.start({
      loadingTitle: "Scraping em andamento",
      loadingDescription: `Consultando ${searchModeSnapshot.label} para ${requestedSegment}${selectedCity ? ` em ${selectedCity}` : ""}.`,
      successTitle: "Busca concluída",
      successDescription: "Resultados recebidos, deduplicados e prontos para análise.",
      ctaLabel: "Ver resultados",
      autoOpenDelayMs: 650,
      onOpen: focusScrapingResults,
      progressSteps: [
        "Iniciando consulta...",
        "Buscando fontes públicas...",
        "Baixando páginas encontradas...",
        "Extraindo telefones...",
        "Deduplicando contatos...",
        "Qualificando nomes...",
        "Montando cards...",
        "Aguardando resposta final...",
      ],
    });

    setSearching(true);
    setActiveSearchRun(null);
    setActiveSearchRunId(null);
    try {
      const startPayload = await apiFetch<{ runId: string; id: string }>("/webscraping/search-runs", {
        method: "POST",
        body: JSON.stringify({
          ...buildPayload(),
          city: selectedCity,
          state: selectedState || undefined,
        }),
      });
      const runId = startPayload.runId || startPayload.id;
      if (!runId) throw new Error("Busca não retornou runId válido.");
      setActiveSearchRunId(runId);
      setFeedback("Pesquisa iniciada. Os cards aparecem conforme os lotes terminam.");

      const finalPayload = await pollSearchRun(runId);
      const finalResults = finalPayload.results || [];

      const responseTargetType =
        finalPayload.query.engine === "hbx" || isPeopleTargetType(finalPayload.query.targetType)
          ? normalizeTargetTypeValue(finalPayload.query.targetType)
          : "pj";
      const displayResults = filterResultsForTarget(finalResults, responseTargetType);
      const hiddenCount = Math.max(0, finalResults.length - displayResults.length);
      if (finalPayload.status === "failed" && displayResults.length === 0) {
        const exhaustedAttempts =
          Number(finalPayload.foundCount || 0) === 0 &&
          Number(finalPayload.attemptCount || 0) >= Number(finalPayload.maxAttempts || 0) &&
          !finalPayload.nextRetryAt;
        throw new Error(
          finalPayload.errorMessage ||
          (exhaustedAttempts
            ? "Nenhum card válido foi encontrado."
            : "A busca não encontrou contatos aprovados nesta etapa."),
        );
      }
      scrapingLaunchNotice.markSuccess({
        successDescription:
          displayResults.length
            ? `${displayResults.length} contato(s) qualificados para ${getVisualSegment(finalPayload.query.segment, responseTargetType)}${finalPayload.query.city ? ` em ${finalPayload.query.city}` : ""}${hiddenCount ? `; ${hiddenCount} genérico(s) ocultado(s).` : "."}`
            : hiddenCount
              ? `${hiddenCount} telefone(s) foram encontrados, mas sem nome de pessoa claro para virar card.`
            : `Busca concluída${finalPayload.query.city ? ` em ${finalPayload.query.city}` : ""}, mas nenhum telefone válido entrou nos resultados.`,
      });
      await refreshHistory();
    } catch (error) {
      if (!results.length) {
        setResults([]);
        setActiveQuery(null);
        setSearchMeta(null);
      }
      setHasSearched(true);
      const baseMessage = error instanceof Error ? error.message : "Falha ao buscar contatos.";
      setSearchError(
        searchModeSnapshot.targetType === "pf"
        || (searchModeSnapshot.engine === "hbx" && targetType === "pf")
          ? `${baseMessage} O Radar HBX pode estar indisponível ou sobrecarregado; tente reduzir a quantidade, trocar o nicho ou usar Agenda CPF.`
          : baseMessage,
      );
      scrapingLaunchNotice.clear();
    } finally {
      setSearching(false);
      setActiveSearchRunId(null);
    }
  }

  async function handleReuseHistory(item: SearchHistoryItem) {
    setSearchError(null);
    setFeedback(null);
    setHistoryBusyId(item.id);
    try {
      const payload = await apiFetch<SearchResponse>(`/webscraping/history/${item.id}/reuse`, {
        method: "POST",
      });
      setActiveSearchRun(null);
      setActiveSearchRunId(null);
      const parsedLocation = splitCityState(payload.query.city, payload.query.state || "");
      setCity(parsedLocation.city);
      setSelectedState(parsedLocation.state);
      const restoredEngine = normalizeEngineValue(payload.query.engine);
      const restoredTargetType = restoredEngine === "google" ? "pj" : normalizeTargetTypeValue(payload.query.targetType);
      setEngine(restoredEngine);
      setTargetType(restoredTargetType);
      // respect known segments and custom ones
      if (restoredTargetType === "pf") {
        const parsedPf = parsePfSegment(payload.query.segment);
        setPfRole(parsedPf.role);
        setPfDdd(parsedPf.ddd);
        setSegment(parsedPf.niche);
      } else {
        setSegment(payload.query.segment);
      }
      setQuantity(payload.query.quantity);
      setMinRating(payload.query.filters.minRating == null ? "" : String(payload.query.filters.minRating));
      setMinReviews(payload.query.filters.minReviews == null ? "" : String(payload.query.filters.minReviews));
      setResults(payload.results || []);
      setActiveQuery(payload.query);
      setSearchMeta(payload.meta);
      setHasSearched(true);
      setFeedback(
        `Pesquisa reaproveitada: ${getVisualSegment(payload.query.segment, restoredTargetType)}${payload.query.city ? ` em ${payload.query.city}` : ""}.`,
      );
      await refreshHistory();
      window.requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao reaproveitar pesquisa.");
    } finally {
      setHistoryBusyId(null);
    }
  }

  async function handleSearchMoreHistory(item?: SearchHistoryItem) {
    const historyId = item?.id || searchMeta?.historyId || "";
    if (!historyId || historyId.startsWith("global:")) {
      setSearchError("Abra uma pesquisa HBX salva antes de buscar mais cards.");
      return;
    }

    setSearchError(null);
    setFeedback(null);
    setHistoryBusyId(historyId);
    setSearching(true);
    setActiveSearchRun(null);
    setActiveSearchRunId(null);
    try {
      const payload = await apiFetch<SearchResponse>(`/webscraping/history/${historyId}/search-more`, {
        method: "POST",
        body: JSON.stringify({ quantity: 100 }),
      });
      setResults((current) => {
        const seen = new Set(current.map((result) => String(result.phoneDigits || "").trim()).filter(Boolean));
        const next = [...current];
        for (const result of payload.results || []) {
          const key = String(result.phoneDigits || "").trim();
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          next.push(result);
        }
        return next;
      });
      setActiveQuery(payload.query);
      setSearchMeta(payload.meta);
      setHasSearched(true);
      setFeedback(payload.meta.message || `${payload.meta.fetchedCount} card(s) novo(s) encontrados sem repetir.`);
      await refreshHistory();
      window.requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao buscar mais cards.");
    } finally {
      setSearching(false);
      setHistoryBusyId(null);
    }
  }

  async function handleExport() {
    const selectedCity = cityExactOption || (cityOptions.length === 0 ? city.trim() : "");
    const query = activeQuery || {
      city: selectedCity,
      state: selectedState || null,
      segment: effectiveSegment,
      quantity,
      engine,
      targetType,
      filters: {
        minRating: minRating ? Number(minRating) : null,
        minReviews: minReviews ? Number(minReviews) : null,
        onlyWithWebsite: false,
      },
    };

    const queryEngine = normalizeEngineValue(query.engine || engine);
    const queryTargetType = queryEngine === "google" ? "pj" : normalizeTargetTypeValue(query.targetType || targetType);

    if (
      (!(queryEngine === "hbx" && queryTargetType === "pj") && !query.state?.trim()) ||
      (!(queryEngine === "hbx" && queryTargetType === "pj") && !query.city.trim()) ||
      (queryTargetType !== "agenda_pf" && !query.segment.trim())
    ) {
      setSearchError(
        selectedState && city.trim() && !query.city.trim()
          ? "Selecione uma cidade da lista antes de exportar."
          : "Preencha estado, cidade e segmento antes de exportar.",
      );
      setCitySuggestionsOpen(Boolean(city.trim() && !query.city.trim()));
      return;
    }

    setExporting(true);
    setSearchError(null);
    try {
      const exportPayload: Record<string, unknown> = {
        city: query.city,
        state: query.state || undefined,
        segment: queryTargetType === "agenda_pf" && !query.segment.trim() ? "" : query.segment,
        quantity: query.quantity,
        minRating: queryTargetType === "pj" ? query.filters.minRating ?? undefined : undefined,
        minReviews: queryTargetType === "pj" ? query.filters.minReviews ?? undefined : undefined,
      };
      if (queryEngine === "hbx") {
        exportPayload.engine = "hbx";
        exportPayload.targetType = queryTargetType;
      }
      await downloadExcel(exportPayload);
      setFeedback("Excel gerado com sucesso.");
      await refreshHistory();
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao exportar Excel.");
    } finally {
      setExporting(false);
    }
  }

  async function handleSendResultsToVendas() {
    const query = activeQuery || {
      city,
      segment: effectiveSegment,
      targetType,
    };
    const leadSegment = getVisualSegment(query.segment, activeQuery ? resultTargetType : targetType);

    if (!qualifiedResults.length || !leadSegment.trim()) {
      setSearchError(
        results.length && !qualifiedResults.length
          ? "Encontramos telefones, mas nenhum resultado tinha nome de pessoa claro para enviar ao CRM."
          : "Faça uma busca antes de enviar leads para Vendas.",
      );
      return;
    }

    crmLaunchNotice.start({
      loadingTitle: "Carregando CRM de Vendas",
      loadingDescription: "Preparando leads, reaproveitando cadastros e montando a agenda comercial.",
      successTitle: "Leads prontos no CRM",
      successDescription: "Tudo certo. A agenda comercial sera aberta agora com os cards importados.",
      ctaLabel: "Abrir Agenda de Vendas!",
      onOpen: openVendasDashboard,
    });
    setImportingToVendas(true);
    setSearchError(null);
    try {
      const payload = await apiFetch<ImportToVendasResponse>("/vendas/import/webscraping", {
        method: "POST",
        body: JSON.stringify({
          sourceHistoryId: activeSearchRun ? undefined : searchMeta?.historyId || undefined,
          leads: qualifiedResults.map((result) => ({
            name: result.name,
            phone: result.phone,
            phoneDigits: result.phoneDigits,
            address: result.address,
            website: result.website,
            rating: result.rating,
            reviews: result.reviews,
            city: query.city,
            segment: leadSegment,
            shortNote: result.opportunityReason || undefined,
            scriptText: buildAppliedScriptText(result, query.city, leadSegment),
          })),
        }),
      });
      setFeedback(payload.message || "Leads enviados para o CRM de Vendas.");
      crmLaunchNotice.markSuccess({
        successDescription:
          payload.message ||
          "Tudo certo. Os leads foram enviados para Vendas e a agenda sera aberta automaticamente.",
      });
    } catch (error) {
      crmLaunchNotice.clear();
      setSearchError(error instanceof Error ? error.message : "Falha ao enviar leads para Vendas.");
    } finally {
      setImportingToVendas(false);
    }
  }

  function handleResetScriptPreset() {
    setAppliedScriptSender(String(currentUser?.email || "").trim());
    setAppliedScriptCompany(defaultScriptVariables.company);
    setAppliedScriptTemplate("");
    setScriptDraft("");
    setScriptDraftTouched(false);
    try {
      window.localStorage.removeItem(scriptPresetStorageKey);
    } catch {
      // ignore storage errors
    }
    setFeedback("Roteiro resetado para o padrao.");
  }

  function handleApplyScriptPreset() {
    const nextTemplate = scriptEditorValue.trim();
    setAppliedScriptTemplate(nextTemplate);
    setScriptDraft(nextTemplate);
    setScriptDraftTouched(Boolean(nextTemplate));
    try {
      window.localStorage.setItem(
        scriptPresetStorageKey,
        JSON.stringify({
          sender: appliedScriptSender,
          company: appliedScriptCompany,
          template: nextTemplate,
        }),
      );
    } catch {
      // ignore storage errors
    }
    setFeedback(
      qualifiedResults.length
        ? `Roteiro aplicado em ${qualifiedResults.length} card(s) e salvo para este usuario.`
        : "Roteiro salvo para este usuario.",
    );
  }

  function insertScriptVariable(token: (typeof SCRIPT_VARIABLE_TOKENS)[number]) {
    const variable = `{${token}}`;
    const textarea = scriptTextareaRef.current;
    const currentText = scriptEditorValue;
    const start = textarea?.selectionStart ?? currentText.length;
    const end = textarea?.selectionEnd ?? start;
    const prefix = currentText.slice(0, start);
    const suffix = currentText.slice(end);
    const needsLeadingSpace = prefix.length > 0 && !/\s$/.test(prefix);
    const needsTrailingSpace = suffix.length > 0 && !/^\s/.test(suffix);
    const inserted = `${needsLeadingSpace ? " " : ""}${variable}${needsTrailingSpace ? " " : ""}`;
    const nextText = `${prefix}${inserted}${suffix}`;
    const nextCursor = prefix.length + inserted.length;
    setScriptDraftTouched(true);
    setScriptDraft(nextText);
    window.requestAnimationFrame(() => {
      scriptTextareaRef.current?.focus();
      scriptTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Prospeccao" description="Carregando sessao do usuario.">
        <section className={styles.loadingCard}>
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLineShort} />
        </section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Prospeccao" hideHeader={true} showDashboardShortcut={false}>
      <div className={styles.page}>

        {loadingBootstrap ? (
          <section className={styles.loadingCard}>
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonGrid}>
              <div className={styles.skeletonField} />
              <div className={styles.skeletonField} />
              <div className={styles.skeletonField} />
            </div>
          </section>
        ) : null}

        {/* Status de configuracao removido */}

        {pageError ? (
          <section className={styles.errorCard}>
            <strong className={styles.statusTitle}>Nao foi possivel carregar o modulo</strong>
            <p className={styles.statusText}>{pageError}</p>
          </section>
        ) : null}

        {panelMode === "search" ? (
          <section className={styles.searchCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.cardEyebrow}>Consulta principal</span>
                <strong className={styles.sectionTitle}>{selectedSearchMode.label}</strong>
              </div>
              <div className={styles.modeTabs} role="tablist" aria-label="Webscraping">
                <button
                  type="button"
                  className={styles.modeTabActive}
                  onClick={() => setPanelMode("search")}
                >
                  <Icon name="search" size={16} />
                  Consulta principal
                </button>
                <span className={styles.modeMetaButton}>
                  API oficial restantes: <strong>{remainingSearchesLabel}</strong>
                </span>
              </div>
            </div>

            <div className={styles.consultationSplit}>
              <div className={styles.consultationMain}>
                <div className={styles.engineSelector} role="radiogroup" aria-label="Motor de busca">
                  {SEARCH_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={selectedSearchMode.id === option.id ? styles.engineOptionActive : styles.engineOption}
                      onClick={() => handleSearchModeChange(option.id)}
                      role="radio"
                      aria-checked={selectedSearchMode.id === option.id}
                    >
                      <span className={styles.engineStatus}>
                        <Icon name={selectedSearchMode.id === option.id ? "check" : "zap"} size={15} />
                        {option.motorCode}
                      </span>
                      <strong>{option.label}</strong>
                      <span>{searchModeTitle(option)}</span>
                      <small>{searchModeLimit(option)}</small>
                      <Icon name="cursor" size={16} className={styles.clickIcon} />
                    </button>
                  ))}
                </div>

                <div className={styles.guideStrip} aria-label="Guia do motor selecionado">
                  {Object.entries(searchModeGuide(selectedSearchMode)).map(([key, value], index) => (
                    <article key={key} className={styles.guideStep}>
                      <span>{index + 1}</span>
                      <strong>{value}</strong>
                    </article>
                  ))}
                </div>

                <div className={styles.formGrid}>
                  {engine === "hbx" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Tipo de oportunidade</span>
                      <select
                        className={styles.fieldSelect}
                        value={targetType}
                        onChange={(event) => handleHbxTargetTypeChange(event.target.value as HbxTargetType)}
                      >
                        <option value="pj">CNPJ - empresas e negócios</option>
                        <option value="pf">CPF - pessoas em páginas públicas</option>
                        <option value="agenda_pf">Agenda CPF - nomes públicos por cidade</option>
                      </select>
                      <p className={styles.fieldHint}>
                        O Radar alterna a estratégia sem trocar de motor e não coleta documento fiscal.
                      </p>
                    </label>
                  ) : null}

                  <label className={styles.field} onBlur={() => window.setTimeout(() => setStateSuggestionsOpen(false), 120)}>
                    <span className={styles.fieldLabel}>Estado</span>
                    <div className={styles.cityInputWrap}>
                      <input
                        className={styles.fieldInput}
                        value={selectedState}
                        onChange={(event) => {
                          handleStateChange(event.target.value.slice(0, 2));
                          setStateSuggestionsOpen(true);
                        }}
                        onFocus={() => setStateSuggestionsOpen(true)}
                        placeholder="Digite ou escolha o estado"
                        autoComplete="off"
                      />
                      <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                    </div>
                    {shouldShowStateSuggestions ? (
                      <div className={styles.citySuggestions} role="listbox" aria-label="Estados">
                        {stateSuggestionItems.map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            className={selectedState === item.value ? styles.citySuggestionActive : styles.citySuggestion}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleStateChange(item.value);
                              setStateSuggestionsOpen(false);
                            }}
                            role="option"
                            aria-selected={selectedState === item.value}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className={styles.fieldHint}>A lista de cidades abaixo usa todos os municípios oficiais do estado.</p>
                  </label>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="webscraping-city">
                      {hbxPjMode ? "Cidade opcional" : "Cidade"}
                    </label>
                    <div className={styles.cityInputWrap}>
                      <input
                        id="webscraping-city"
                        className={styles.fieldInput}
                        value={city}
                        onChange={(event) => {
                          setCity(event.target.value);
                          setCitySuggestionsOpen(true);
                        }}
                        onFocus={() => setCitySuggestionsOpen(true)}
                        onBlur={() => window.setTimeout(() => setCitySuggestionsOpen(false), 120)}
                        onKeyDown={handleCityKeyDown}
                        placeholder={selectedState ? "Digite e selecione a cidade" : "Selecione o estado primeiro"}
                        disabled={!selectedState}
                        autoComplete="off"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={shouldShowCitySuggestions}
                        aria-controls="webscraping-city-suggestions"
                        aria-activedescendant={activeCitySuggestion ? `webscraping-city-option-${activeCitySuggestionIndex}` : undefined}
                      />
                      <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                    </div>
                    {shouldShowCitySuggestions ? (
                      <div
                        id="webscraping-city-suggestions"
                        className={styles.citySuggestions}
                        role="listbox"
                      >
                        {citySuggestionItems.map((option, index) => (
                          <button
                            key={option}
                            id={`webscraping-city-option-${index}`}
                            type="button"
                            className={index === activeCitySuggestionIndex ? styles.citySuggestionActive : styles.citySuggestion}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectCitySuggestion(option);
                            }}
                            role="option"
                            aria-selected={index === activeCitySuggestionIndex}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className={styles.fieldHint}>
                      {hbxPjMode
                          ? "Opcional. Se escolher uma cidade, ela precisa pertencer ao estado selecionado."
                        : citySelectionPending
                          ? "Escolha uma cidade da lista antes de buscar."
                          : selectedState
                            ? "As opções são filtradas pelo estado selecionado."
                            : "Selecione o estado para carregar as cidades."}
                    </p>
                  </div>

              {pfMode ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Perfil da pessoa</span>
                  <select
                    className={styles.fieldSelect}
                    value={pfRole}
                    onChange={(event) => setPfRole(event.target.value)}
                  >
                    {PF_ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <p className={styles.fieldHint}>Use perfis que aparecem em páginas públicas.</p>
                </label>
              ) : null}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {pfMode ? "Nicho / serviço para PF" : agendaMode ? "Segmento opcional" : hbxPjMode ? "O que deseja prospectar?" : "Segmento / tipo de negocio"}
                </span>
                <div className={styles.cityInputWrap}>
                  <input
                    className={styles.fieldInput}
                    value={segment}
                    onChange={(event) => {
                      setSegment(event.target.value);
                      setSegmentSuggestionsOpen(true);
                    }}
                    onFocus={() => setSegmentSuggestionsOpen(true)}
                    onBlur={() => window.setTimeout(() => setSegmentSuggestionsOpen(false), 120)}
                    placeholder={
                      pfMode
                        ? "Ex: plano de saúde, seguros, imóveis"
                        : agendaMode
                          ? "Opcional. Ex: Agenda PF"
                          : hbxPjMode
                            ? "Ex: Madeireira, Auto elétrica, Clínica estética"
                            : "Ex: Clinicas odontologicas"
                    }
                    autoComplete="off"
                  />
                  <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                </div>
                {segmentSuggestionsOpen && segmentSuggestionItems.length > 0 ? (
                  <div className={styles.citySuggestions} role="listbox">
                    {segmentSuggestionItems.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={segment === option ? styles.citySuggestionActive : styles.citySuggestion}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSegment(option);
                          setSegmentSuggestionsOpen(false);
                        }}
                        role="option"
                        aria-selected={segment === option}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
                {pfMode ? (
                  <p className={styles.fieldHint}>
                    Pesquisa enviada: {effectiveSegment || "informe um nicho"}
                  </p>
                ) : null}
                {agendaMode ? (
                  <p className={styles.fieldHint}>
                    {segment.trim() ? `Rótulo visual: ${segmentLabel}` : "Sem segmento: será exibido como Agenda PF."}
                  </p>
                ) : null}
              </label>

              {pfMode ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>DDD local</span>
                  <input
                    className={styles.fieldInput}
                    value={pfDdd}
                    onChange={(event) => setPfDdd(normalizeDdd(event.target.value))}
                    placeholder={inferredDdd ? `Detectado: ${inferredDdd}` : "Ex: 19"}
                    inputMode="numeric"
                    maxLength={2}
                  />
                  <p className={styles.fieldHint}>
                    {effectiveDdd ? `Priorizando telefones DDD ${effectiveDdd}.` : "Opcional, mas melhora a relevância regional."}
                  </p>
                </label>
              ) : null}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Quantidade</span>
                <select
                  className={styles.fieldSelect}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                >
                  {quantityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option} contatos
                    </option>
                  ))}
                </select>
                <p className={styles.fieldHint}>Limite deste motor: {maxQuantity} contatos.</p>
              </label>
            </div>

                <div className={styles.advancedWrap}>
                  <button
                    type="button"
                    className={styles.advancedToggle}
                    onClick={() => setAdvancedOpen((value) => !value)}
                  >
                    <span>Filtros avancados</span>
                    <span>{advancedOpen ? "Ocultar" : "Mostrar"}</span>
                  </button>

                  {advancedOpen ? (
                    <div className={styles.advancedGrid}>
                      {targetType === "pj" ? (
                        <>
                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>Nota minima</span>
                            <input
                              className={styles.fieldInput}
                              type="number"
                              min="0"
                              max="5"
                              step="0.1"
                              value={minRating}
                              onChange={(event) => setMinRating(event.target.value)}
                              placeholder="Opcional"
                            />
                          </label>

                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>Minimo de avaliacoes</span>
                            <input
                              className={styles.fieldInput}
                              type="number"
                              min="0"
                              step="1"
                              value={minReviews}
                              onChange={(event) => setMinReviews(event.target.value)}
                              placeholder="Opcional"
                            />
                          </label>
                        </>
                      ) : (
                        <div className={styles.filterNotice}>
                          <strong>Filtros de PF</strong>
                          <p>
                            PF não usa nota, avaliações ou site como corte. A relevância vem de perfil, nicho, cidade e DDD.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className={styles.searchActions}>
                  <div className={styles.noticeInline}>
                    <Icon name="alert" size={18} />
                  </div>
                  <div className={styles.actionRow}>
                    <button
                      type="button"
                      className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                      onClick={() => void handleSearch()}
                      disabled={loadingBootstrap || searching}
                    >
                      <Icon name="play" size={18} />
                      {searching ? "Buscando em lotes..." : hbxPjMode ? "Buscar cards" : "Buscar contatos"}
                    </button>
                    {searching && activeSearchRunId ? (
                      <button
                        type="button"
                        className={styles.glassButton}
                        onClick={() => void handleCancelSearchRun()}
                      >
                        <Icon name="alert" size={18} />
                        Cancelar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={styles.glassButton}
                      onClick={() => void handleExport()}
                      disabled={exporting || searching || (!activeQuery && !results.length && !city.trim())}
                    >
                      <Icon name="download" size={18} />
                      {exporting ? "Gerando Excel..." : "Exportar Excel"}
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.scriptFilterCard}>
                <div className={styles.scriptFilterHeader}>
                  <div>
                    <span className={styles.cardEyebrow}>Roteiro</span>
                    <strong className={styles.scriptFilterTitle}>Primeiro contato</strong>
                  </div>
                  <div className={styles.scriptFilterActions}>
                    <button type="button" className={`${styles.glassButton} ${styles.glassButtonPrimary}`} onClick={handleApplyScriptPreset}>
                      <Icon name="check" size={18} />
                      Aplicar roteiro
                    </button>
                    <button type="button" className={styles.glassButton} onClick={handleResetScriptPreset}>
                      <Icon name="clock" size={18} />
                      Resetar roteiro
                    </button>
                  </div>
                </div>

                <div className={styles.scriptFilterGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Nome de quem envia</span>
                    <input
                      className={styles.fieldInput}
                      value={appliedScriptSender}
                      onChange={(event) => setAppliedScriptSender(event.target.value)}
                      placeholder={currentUser?.email || "Digite seu nome"}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Empresa / marca</span>
                    <input
                      className={styles.fieldInput}
                      value={appliedScriptCompany}
                      onChange={(event) => setAppliedScriptCompany(event.target.value)}
                      placeholder="Ex: HBX"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Previa editavel</span>
                    <textarea
                      ref={scriptTextareaRef}
                      className={styles.scriptTextarea}
                      value={scriptEditorValue}
                      onChange={(event) => {
                        setScriptDraftTouched(true);
                        setScriptDraft(event.target.value);
                      }}
                      placeholder="Digite o roteiro de primeiro contato"
                    />
                    <div className={styles.variableTokenRow} aria-label="Variaveis do roteiro">
                      {SCRIPT_VARIABLE_TOKENS.map((token) => {
                        const variable = `{${token}}`;
                        const active = scriptEditorValue.includes(variable);
                        return (
                          <button
                            key={token}
                            type="button"
                            className={active ? styles.variableTokenActive : styles.variableToken}
                            onClick={() => insertScriptVariable(token)}
                          >
                            {variable}
                          </button>
                        );
                      })}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {panelMode === "radar" ? (
          <section className={styles.historyCard}>
            <div className={styles.radarModeSwitch} role="tablist" aria-label="Modo Banco Radar">
              <button
                type="button"
                className={radarViewMode === "database" ? styles.modeTabActive : styles.modeTab}
                onClick={() => setRadarViewMode("database")}
              >
                <Icon name="book" size={16} />
                Consultar Banco
              </button>
              <button
                type="button"
                className={radarViewMode === "campaign" ? styles.modeTabActive : styles.modeTab}
                onClick={() => setRadarViewMode("campaign")}
              >
                <Icon name="zap" size={16} />
                Campanha de Coleta
              </button>
            </div>

            {radarViewMode === "database" ? (
              <>
                <div className={styles.radarFilterGrid}>
                  <label className={styles.field} onBlur={() => window.setTimeout(() => setOpenRadarPicker((current) => (current === "radar-state" ? null : current)), 120)}>
                    <span className={styles.fieldLabel}>Estado</span>
                    <div className={styles.cityInputWrap}>
                      <input
                        className={styles.fieldInput}
                        value={radarFilters.state}
                        onFocus={() => setOpenRadarPicker("radar-state")}
                        onChange={(event) => {
                          setRadarFilters((current) => ({ ...current, state: event.target.value.slice(0, 2).toUpperCase(), city: "", page: 1 }));
                          setOpenRadarPicker("radar-state");
                        }}
                        placeholder="Digite ou escolha o estado"
                        maxLength={2}
                        autoComplete="off"
                      />
                      <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                    </div>
                    {openRadarPicker === "radar-state" ? (
                      <div className={styles.citySuggestions} role="listbox" aria-label="Estados">
                        {BRAZIL_STATES
                          .map((item) => ({ value: item.uf, label: `${item.uf} - ${item.name}` }))
                          .filter((item) => !radarFilters.state || normalizeCityLookup(item.label).includes(normalizeCityLookup(radarFilters.state)))
                          .map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              className={radarFilters.state === item.value ? styles.citySuggestionActive : styles.citySuggestion}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setRadarFilters((current) => ({ ...current, state: item.value, city: "", page: 1 }));
                                setOpenRadarPicker(null);
                              }}
                              role="option"
                              aria-selected={radarFilters.state === item.value}
                            >
                              {item.label}
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </label>
                  <label className={styles.field} onBlur={() => window.setTimeout(() => setOpenRadarPicker((current) => (current === "radar-city" ? null : current)), 120)}>
                    <span className={styles.fieldLabel}>Cidade</span>
                    <div className={styles.cityInputWrap}>
                      <input
                        className={styles.fieldInput}
                        value={radarFilters.city}
                        onFocus={() => setOpenRadarPicker("radar-city")}
                        onChange={(event) => {
                          setRadarFilters((current) => ({ ...current, city: event.target.value, page: 1 }));
                          setOpenRadarPicker("radar-city");
                        }}
                        placeholder={radarFilters.state ? "Digite e selecione a cidade" : "Selecione o estado primeiro"}
                        disabled={!radarFilters.state}
                        autoComplete="off"
                      />
                      <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                    </div>
                    {openRadarPicker === "radar-city" && radarCityOptions.length > 0 ? (
                      <div className={styles.citySuggestions} role="listbox" aria-label="Cidades">
                        {radarCityOptions
                          .filter((item) => !radarFilters.city || normalizeCityLookup(item).includes(normalizeCityLookup(radarFilters.city)))
                          .map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={radarFilters.city === item ? styles.citySuggestionActive : styles.citySuggestion}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setRadarFilters((current) => ({ ...current, city: item, page: 1 }));
                                setOpenRadarPicker(null);
                              }}
                              role="option"
                              aria-selected={radarFilters.city === item}
                            >
                              {item}
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </label>
                  <label className={styles.field} onBlur={() => window.setTimeout(() => setOpenRadarPicker((current) => (current === "radar-segment" ? null : current)), 120)}>
                    <span className={styles.fieldLabel}>Nicho</span>
                    <div className={styles.cityInputWrap}>
                      <input
                        className={styles.fieldInput}
                        value={radarFilters.segment}
                        onFocus={() => setOpenRadarPicker("radar-segment")}
                        onChange={(event) => {
                          setRadarFilters((current) => ({ ...current, segment: event.target.value, page: 1 }));
                          setOpenRadarPicker("radar-segment");
                        }}
                        placeholder="Digite ou escolha um nicho"
                        autoComplete="off"
                      />
                      <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                    </div>
                    {openRadarPicker === "radar-segment" ? (
                      <div className={styles.citySuggestions} role="listbox" aria-label="Nichos">
                        {SEGMENT_SUGGESTIONS
                          .filter((item) => !radarFilters.segment || normalizeCityLookup(item).includes(normalizeCityLookup(radarFilters.segment)))
                          .map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={radarFilters.segment === item ? styles.citySuggestionActive : styles.citySuggestion}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setRadarFilters((current) => ({ ...current, segment: item, page: 1 }));
                                setOpenRadarPicker(null);
                              }}
                              role="option"
                              aria-selected={radarFilters.segment === item}
                            >
                              {item}
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>DDD</span>
                    <input
                      className={styles.fieldInput}
                      value={radarFilters.ddd}
                      onChange={(event) => setRadarFilters((current) => ({ ...current, ddd: event.target.value.replace(/\D/g, "").slice(0, 2), page: 1 }))}
                      placeholder="19"
                    />
                  </label>
                </div>

                {radarFacets.length > 0 ? (
                  <div className={styles.radarFacetBar}>
                    {radarFacets.map((facet) => (
                      <button
                        key={facet.key}
                        type="button"
                        className={radarFilters.filterKey === facet.key || (!radarFilters.filterKey && facet.key === "all") ? styles.radarFacetButtonActive : styles.radarFacetButton}
                        data-tone={facet.tone || facet.key}
                        onClick={() => {
                          setRadarFilters((current) => ({ ...current, filterKey: facet.key, page: 1 }));
                          void refreshRadarDatabase({ filterKey: facet.key, page: 1 });
                        }}
                      >
                        <span>{facet.label}</span>
                        <strong>{facet.count}</strong>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.glassButton}
                    onClick={() => void refreshRadarDatabase({ page: 1 })}
                    disabled={radarLoading || radarPulling}
                  >
                    <Icon name="search" size={18} />
                    {radarLoading ? "Atualizando..." : "Atualizar banco"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                    onClick={() => setRadarViewMode("campaign")}
                  >
                    <Icon name="spark" size={18} />
                    Criar campanha
                  </button>
                  {radarSelectedIds.length > 0 ? <span className={styles.metaPill}>{radarSelectedIds.length} selecionado(s)</span> : null}
                </div>

                {radarLoading ? (
                  <div className={styles.resultsGrid}>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className={styles.resultSkeleton}>
                        <div className={styles.skeletonTitle} />
                        <div className={styles.skeletonLine} />
                        <div className={styles.skeletonLineShort} />
                      </div>
                    ))}
                  </div>
                ) : null}

                {!radarLoading && radarItems.length === 0 ? (
                  <div className={styles.emptyState}>
                    <strong>Nenhum card disponível neste filtro</strong>
                    <p className={styles.emptyText}>Amplie os filtros ou crie uma campanha para abastecer o Banco Radar em lotes.</p>
                  </div>
                ) : (
                  <div className={styles.radarGrid}>
                    {radarItems.map((item) => {
                      const mapUrl = buildMapUrl(item);
                      const score = item.opportunityScore ?? item.score ?? 0;
                      const statusTone = radarStatusTone(item.status || item.companyStatus);
                      const selected = radarSelectedIds.includes(item.id);
                      return (
                        <article key={item.id} className={styles.radarCard} data-status={statusTone} data-selected={selected ? "true" : "false"}>
                          <button type="button" className={styles.radarCardButton} onClick={() => void openRadarDetails(item)}>
                            <div className={styles.historyTop}>
                              <div>
                                <h2 className={styles.historyTitle}>{item.name || "Card sem nome"}</h2>
                                <p className={styles.historyMeta}>{[item.city, item.state, item.segment].filter(Boolean).join(" • ") || "Local não informado"}</p>
                              </div>
                              <span className={styles.radarStatusChip} data-status={statusTone}>{radarStatusLabel(item.status || item.companyStatus)}</span>
                            </div>
                            <div className={styles.radarPills}>
                              <span className={styles.metaPill}>DDD {item.ddd || normalizePhoneDigits(item.phoneDigits || item.phone).slice(0, 2) || "-"}</span>
                              <span className={styles.metaPill}>{websiteStatusLabel(item.websiteStatus)}</span>
                              <span className={styles.metaPill}>{opportunityLevelLabel(score)}</span>
                              <span className={styles.metaPill}>Score {score}</span>
                              {isLikelyMobileWhatsapp(item.phoneDigits || item.phone) ? <span className={styles.metaPill}>WhatsApp provável</span> : <span className={styles.metaPill}>Sem WhatsApp provável</span>}
                            </div>
                            <p className={styles.historyFilter}>{item.phone || item.phoneDigits || "Telefone não informado"}</p>
                            <p className={styles.historyPreview}>{radarHistorySummaryText(item.historySummary) || item.opportunityReason || item.rejectionReason || "Histórico limpo no Banco Radar."}</p>
                          </button>
                          <div className={styles.radarActions}>
                            <button type="button" className={styles.radarSelectButton} data-selected={selected ? "true" : "false"} onClick={() => toggleRadarSelection(item.id)}>
                              <Icon name={selected ? "check" : "cursor"} size={16} />
                              {selected ? "Selecionado" : "Selecionar"}
                            </button>
                            <button type="button" className={`${styles.glassButton} ${styles.glassButtonPrimary}`} onClick={() => void handleRadarImport(item)} disabled={radarActionId === item.id}>
                              <Icon name="spark" size={18} />
                              Vendas
                            </button>
                            <button type="button" className={styles.glassButton} onClick={() => void handleRadarLeadEvent(item, "no_answer", "Não atendeu no contato")} disabled={radarActionId === item.id}>
                              <Icon name="clock" size={18} />
                              Não atendeu
                            </button>
                            <button type="button" className={styles.glassButton} onClick={() => void handleRadarLeadEvent(item, "denied", "Negou contato")} disabled={radarActionId === item.id}>
                              <Icon name="alert" size={18} />
                              Negou
                            </button>
                            <button type="button" className={styles.glassButton} onClick={() => void handleRadarLeadEvent(item, "complaint", "Reclamação registrada")} disabled={radarActionId === item.id}>
                              <Icon name="alert" size={18} />
                              Reclamação
                            </button>
                            <button type="button" className={styles.glassButton} onClick={() => void handleRadarNegative(item)} disabled={radarActionId === item.id}>
                              <Icon name="cursor" size={18} />
                              Ocultar
                            </button>
                            {item.website ? (
                              <a className={styles.glassButton} href={normalizeExternalUrl(item.website)} target="_blank" rel="noreferrer">
                                <Icon name="cursor" size={18} />
                                Site
                              </a>
                            ) : null}
                            {mapUrl ? (
                              <a className={styles.glassButton} href={mapUrl} target="_blank" rel="noreferrer">
                                <Icon name="search" size={18} />
                                Mapa
                              </a>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {radarDetail ? (
                  <div className={styles.radarDetailPanel}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <span className={styles.cardEyebrow}>Histórico do card</span>
                        <strong className={styles.sectionTitle}>{radarDetail.item.name || "Card"}</strong>
                        <p className={styles.helperText}>{radarDetail.item.phone || radarDetail.item.phoneDigits || "Telefone não informado"}</p>
                      </div>
                      <button type="button" className={styles.glassButton} onClick={() => setRadarDetail(null)}>Fechar</button>
                    </div>
                    {radarDetailLoading ? <p className={styles.helperText}>Carregando histórico...</p> : null}
                    <div className={styles.radarHistoryList}>
                      {radarDetail.events.length === 0 ? (
                        <span className={styles.metaPill}>Sem eventos registrados</span>
                      ) : radarDetail.events.map((event) => (
                        <div key={event.id} className={styles.radarEventItem}>
                          <strong>{radarStatusLabel(event.statusTo || event.eventType)}</strong>
                          <span>{event.note || event.eventType}</span>
                          <small>{event.createdAt ? formatDateTime(event.createdAt) : "-"}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className={styles.radarCampaignWorkspace}>
                  <div className={styles.radarCampaignMain}>
                    <div className={styles.massDataControlCenter}>
                      <div>
                        <span className={styles.cardEyebrow}>HBX Control Center</span>
                        <strong className={styles.sectionTitle}>MASSA DE DADOS</strong>
                      </div>
                      <div className={styles.engineBatteryRow}>
                        {Array.from({ length: 4 }).map((_, index) => {
                          const engineItem = engineDashboard?.engines?.find((engine) => engine.id === `hbx-engine-${index + 1}` || engine.shortLabel?.includes(String(index + 1)));
                          const state = engineItem ? engineBatteryState(engineItem) : "offline";
                          return (
                            <div key={index} className={styles.engineBattery} data-state={state} title={engineItem?.lastError || engineItem?.url || `Motor M${index + 1}`}>
                              <span>M{index + 1}</span>
                              <strong>{state}</strong>
                            </div>
                          );
                        })}
                      </div>
                      <div className={styles.liveGraphStrip}>
                        <span>Leads/min <strong>{engineDashboard?.capacity.completedLast10Min ?? 0}</strong></span>
                        <span>Tasks rodando <strong>{engineDashboard?.capacity.runningCount ?? 0}</strong></span>
                        <span>Fila <strong>{engineDashboard?.capacity.queuedCount ?? 0}</strong></span>
                      </div>
                    </div>
                    <div className={styles.radarCampaignForm}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Modo</span>
                        <select className={styles.fieldSelect} value={campaignForm.mode} onChange={(event) => setCampaignForm((current) => ({ ...current, mode: event.target.value, batchSize: event.target.value === "mass_data" ? 20 : 25, allowedStartHour: event.target.value === "mass_data" ? 20 : 0, allowedEndHour: event.target.value === "mass_data" ? 8 : 6 }))}>
                          <option value="mass_data">MASSA DE DADOS</option>
                          <option value="radar_database">Coleta Radar</option>
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Tipo</span>
                        <select className={styles.fieldSelect} value={campaignForm.targetType} onChange={(event) => setCampaignForm((current) => ({ ...current, targetType: normalizeTargetTypeValue(event.target.value) }))}>
                          <option value="pj">CNPJ</option>
                          <option value="pf">CPF público</option>
                          <option value="agenda_pf">Agenda CPF</option>
                        </select>
                      </label>
                      <label className={styles.field} onBlur={() => window.setTimeout(() => setOpenRadarPicker((current) => (current === "campaign-state" ? null : current)), 120)}>
                        <span className={styles.fieldLabel}>Estado</span>
                        <div className={styles.cityInputWrap}>
                          <input
                            className={styles.fieldInput}
                            value={campaignForm.state}
                            onFocus={() => setOpenRadarPicker("campaign-state")}
                            onChange={(event) => {
                              setCampaignForm((current) => ({ ...current, state: event.target.value.slice(0, 2).toUpperCase(), city: "" }));
                              setOpenRadarPicker("campaign-state");
                            }}
                            placeholder="Digite ou escolha o estado"
                            maxLength={2}
                            autoComplete="off"
                          />
                          <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                        </div>
                        {openRadarPicker === "campaign-state" ? (
                          <div className={styles.citySuggestions} role="listbox" aria-label="Estados">
                            {BRAZIL_STATES
                              .map((item) => ({ value: item.uf, label: `${item.uf} - ${item.name}` }))
                              .filter((item) => !campaignForm.state || normalizeCityLookup(item.label).includes(normalizeCityLookup(campaignForm.state)))
                              .map((item) => (
                                <button
                                  key={item.value}
                                  type="button"
                                  className={campaignForm.state === item.value ? styles.citySuggestionActive : styles.citySuggestion}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    setCampaignForm((current) => ({ ...current, state: item.value, city: "" }));
                                    setOpenRadarPicker(null);
                                  }}
                                  role="option"
                                  aria-selected={campaignForm.state === item.value}
                                >
                                  {item.label}
                                </button>
                              ))}
                          </div>
                        ) : null}
                      </label>
                      <label className={styles.field} onBlur={() => window.setTimeout(() => setOpenRadarPicker((current) => (current === "campaign-city" ? null : current)), 120)}>
                        <span className={styles.fieldLabel}>Cidade</span>
                        <div className={styles.cityInputWrap}>
                          <input
                            className={styles.fieldInput}
                            value={campaignForm.city}
                            onFocus={() => setOpenRadarPicker("campaign-city")}
                            onChange={(event) => {
                              setCampaignForm((current) => ({ ...current, city: event.target.value }));
                              setOpenRadarPicker("campaign-city");
                            }}
                            placeholder={campaignForm.mode === "mass_data" ? "Opcional: deixe vazio para todo o estado" : campaignForm.state ? "Digite e selecione a cidade" : "Selecione o estado primeiro"}
                            disabled={!campaignForm.state}
                            autoComplete="off"
                          />
                          <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                        </div>
                        {openRadarPicker === "campaign-city" && campaignCityOptions.length > 0 ? (
                          <div className={styles.citySuggestions} role="listbox" aria-label="Cidades">
                            {campaignCityOptions
                              .filter((item) => !campaignForm.city || normalizeCityLookup(item).includes(normalizeCityLookup(campaignForm.city)))
                              .map((item) => (
                                <button
                                  key={item}
                                  type="button"
                                  className={campaignForm.city === item ? styles.citySuggestionActive : styles.citySuggestion}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    setCampaignForm((current) => ({ ...current, city: item }));
                                    setOpenRadarPicker(null);
                                  }}
                                  role="option"
                                  aria-selected={campaignForm.city === item}
                                >
                                  {item}
                                </button>
                              ))}
                          </div>
                        ) : null}
                      </label>
                      <label className={styles.field} onBlur={() => window.setTimeout(() => setOpenRadarPicker((current) => (current === "campaign-segment" ? null : current)), 120)}>
                        <span className={styles.fieldLabel}>Nicho / Serviço</span>
                        <div className={styles.cityInputWrap}>
                          <input
                            className={styles.fieldInput}
                            value={campaignForm.segment}
                            onFocus={() => setOpenRadarPicker("campaign-segment")}
                            onChange={(event) => {
                              setCampaignForm((current) => ({ ...current, segment: event.target.value }));
                              setOpenRadarPicker("campaign-segment");
                            }}
                            placeholder={campaignForm.mode === "mass_data" ? "Opcional: vazio usa as iscas internas" : "Digite ou escolha um nicho"}
                            autoComplete="off"
                          />
                          <Icon name="chevron" size={18} className={styles.cityInputArrow} />
                        </div>
                        {openRadarPicker === "campaign-segment" ? (
                          <div className={styles.citySuggestions} role="listbox" aria-label="Nichos">
                            {SEGMENT_SUGGESTIONS
                              .filter((item) => !campaignForm.segment || normalizeCityLookup(item).includes(normalizeCityLookup(campaignForm.segment)))
                              .map((item) => (
                                <button
                                  key={item}
                                  type="button"
                                  className={campaignForm.segment === item ? styles.citySuggestionActive : styles.citySuggestion}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    setCampaignForm((current) => ({ ...current, segment: item }));
                                    setOpenRadarPicker(null);
                                  }}
                                  role="option"
                                  aria-selected={campaignForm.segment === item}
                                >
                                  {item}
                                </button>
                              ))}
                          </div>
                        ) : null}
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Quantidade alvo</span>
                        <select className={styles.fieldSelect} value={campaignForm.targetTotal} onChange={(event) => setCampaignForm((current) => ({ ...current, targetTotal: Number(event.target.value) }))}>
                          {[0, 1000, 2000, 5000, 10000].map((option) => <option key={option} value={option}>{option ? `${option} cards` : "Sem limite"}</option>)}
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Por lote</span>
                        <select className={styles.fieldSelect} value={campaignForm.batchSize} onChange={(event) => setCampaignForm((current) => ({ ...current, batchSize: Number(event.target.value) }))}>
                          {(campaignForm.mode === "mass_data" ? [20] : [25, 50]).map((option) => <option key={option} value={option}>{option} por pesquisa</option>)}
                        </select>
                      </label>
                    </div>

                    <div className={styles.actionRow}>
                      <button type="button" className={`${styles.glassButton} ${styles.glassButtonPrimary}`} onClick={() => void handleCreateRadarCampaign()} disabled={campaignLoading}>
                        <Icon name="play" size={18} />
                        {campaignLoading ? "Criando..." : "Iniciar coleta noturna"}
                      </button>
                      <button type="button" className={styles.glassButton} onClick={() => void refreshRadarCampaigns()} disabled={campaignLoading}>
                        <Icon name="clock" size={18} />
                        Atualizar progresso
                      </button>
                    </div>
                  </div>

                  <aside className={styles.radarCampaignAside}>
                    <div>
                      <span className={styles.cardEyebrow}>Campanha de coleta</span>
                      <strong className={styles.sectionTitle}>{campaignForm.mode === "mass_data" ? "MASSA DE DADOS" : `${campaignForm.targetTotal.toLocaleString("pt-BR")} unidades`}</strong>
                      <p className={styles.helperText}>
                        {campaignForm.mode === "mass_data"
                          ? "A campanha cria milhares de tarefas pequenas por cidade e isca. Cada motor pega a próxima tarefa livre e retoma por lock se algo cair."
                          : "A pesquisa roda em ciclos noturnos e abastece o Consultar Banco com contatos limpos, sem repetir quem já entrou na base."}
                      </p>
                    </div>

                    <div className={styles.radarCampaignSummary}>
                      <span><strong>{campaignForm.batchSize}</strong> por pesquisa</span>
                      <span><strong>Noturna</strong> execução</span>
                      <span><strong>{campaignForm.mode === "mass_data" ? "20h-08h" : "00h-06h"}</strong> janela fixa</span>
                    </div>

                    <div className={styles.radarCampaignFlow}>
                      <div>
                        <span>1</span>
                        <p>Combina tipo, estado, cidade e nicho para montar a pesquisa.</p>
                      </div>
                      <div>
                        <span>2</span>
                        <p>Executa lotes durante a noite até completar a meta de unidades.</p>
                      </div>
                      <div>
                        <span>3</span>
                        <p>Filtra duplicados, divergências de DDD, sem telefone e reclamações.</p>
                      </div>
                      <div>
                        <span>4</span>
                        <p>Entrega os aprovados no menu Consultar Banco para o time trabalhar.</p>
                      </div>
                    </div>
                  </aside>
                </div>

                <div className={styles.radarCampaignGrid}>
                  {radarCampaigns.length === 0 ? (
                    <div className={styles.emptyState}>
                      <strong>Nenhuma campanha ativa</strong>
                      <p className={styles.emptyText}>Crie uma campanha para os motores trabalharem em lotes de até 50 cards.</p>
                    </div>
                  ) : radarCampaigns.map((campaign) => (
                    <article key={campaign.id} className={styles.radarCampaignCard} data-status={campaign.status}>
                      <div className={styles.historyTop}>
                        <div>
                          <h2 className={styles.historyTitle}>{campaign.segment || "Campanha Radar"}</h2>
                          <p className={styles.historyMeta}>{[campaign.city, campaign.state, campaign.targetType?.toUpperCase()].filter(Boolean).join(" • ")}</p>
                        </div>
                        <span className={styles.radarStatusChip} data-status={campaign.status}>{campaignStatusLabel(campaign.status)}</span>
                      </div>
                      <div className={styles.radarCampaignStats}>
                        {campaign.mode === "mass_data" ? (
                          <>
                            <span><strong>{campaign.completedCityCount || 0}</strong> cidades finalizadas</span>
                            <span><strong>{campaign.currentCity || "-"}</strong> cidade atual</span>
                          </>
                        ) : null}
                        <span><strong>{campaign.foundCount}</strong> encontrados</span>
                        <span><strong>{campaign.approvedCount}</strong> limpos</span>
                        <span><strong>{campaign.duplicateCount}</strong> duplicados</span>
                        <span><strong>{campaign.rejectedCount}</strong> rejeitados</span>
                        <span><strong>{campaign.complaintCount}</strong> reclamaram</span>
                        <span><strong>{campaign.deniedCount}</strong> negaram</span>
                      </div>
                      <p className={styles.historyPreview}>{campaignProgressMessage(campaign)}</p>
                      <div className={styles.radarPills}>
                        <span className={styles.metaPill}>Lote {campaign.currentAttempt}/{campaign.maxAttempts}</span>
                        <span className={styles.metaPill}>Meta {campaign.targetTotal}</span>
                        <span className={styles.metaPill}>Batch {campaign.batchSize}</span>
                        {campaign.mode === "mass_data" ? Object.entries(campaign.taskStatusCounts || {}).map(([status, count]) => (
                          <span key={status} className={styles.metaPill}>{status}: {count}</span>
                        )) : null}
                        {campaign.lastEngineUrl ? <span className={styles.metaPill}>{campaign.lastEngineUrl}</span> : null}
                        {campaign.lastQueryUsed ? <span className={styles.metaPill}>Query: {campaign.lastQueryUsed}</span> : null}
                        {campaign.nextRunAt ? <span className={styles.metaPill}>Próxima: {formatDateTime(campaign.nextRunAt)}</span> : null}
                      </div>
                      {campaign.mode === "mass_data" && campaign.tasks?.length ? (
                        <div className={styles.liveFeed}>
                          {campaign.tasks.slice(0, 6).map((task) => (
                            <span key={task.id}>
                              {task.status === "completed" ? `+ ${task.city} / ${task.segment} salva` : task.status === "exhausted" ? `${task.city} / ${task.segment} exhausted` : task.status === "running" ? `${task.lockedByEngineId || "motor"} em ${task.city}` : `${task.city} aguardando`}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className={styles.radarActions}>
                        {campaign.status === "paused" ? (
                          <button type="button" className={`${styles.glassButton} ${styles.glassButtonPrimary}`} onClick={() => void handleCampaignAction(campaign, "resume")} disabled={campaignActionId === campaign.id}>
                            <Icon name="play" size={18} />
                            Continuar
                          </button>
                        ) : (
                          <button type="button" className={styles.glassButton} onClick={() => void handleCampaignAction(campaign, "pause")} disabled={campaignActionId === campaign.id || ["completed", "completed_insufficient_results", "failed", "canceled"].includes(campaign.status)}>
                            <Icon name="clock" size={18} />
                            Pausar
                          </button>
                        )}
                        <button type="button" className={styles.glassButton} onClick={() => void handleCampaignAction(campaign, "cancel")} disabled={campaignActionId === campaign.id || ["completed", "completed_insufficient_results", "failed", "canceled"].includes(campaign.status)}>
                          <Icon name="alert" size={18} />
                          Cancelar
                        </button>
                        <button type="button" className={styles.glassButton} onClick={() => {
                          setRadarViewMode("database");
                          void refreshRadarDatabase({ page: 1 });
                        }}>
                          <Icon name="search" size={18} />
                          Ver cards
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            {false ? (<>
            <div className={styles.radarFilterGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Estado</span>
                <select
                  className={styles.fieldSelect}
                  value={radarFilters.state}
                  onChange={(event) => setRadarFilters((current) => ({ ...current, state: event.target.value }))}
                >
                  <option value="">Todos</option>
                  {BRAZIL_STATES.map((item) => (
                    <option key={item.uf} value={item.uf}>
                      {item.uf} - {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Cidade</span>
                <input
                  className={styles.fieldInput}
                  value={radarFilters.city}
                  onChange={(event) => setRadarFilters((current) => ({ ...current, city: event.target.value }))}
                  placeholder="Ex: Campinas"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Segmento</span>
                <input
                  className={styles.fieldInput}
                  value={radarFilters.segment}
                  onChange={(event) => setRadarFilters((current) => ({ ...current, segment: event.target.value }))}
                  placeholder="Ex: Lanchonetes"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Quantidade</span>
                <select
                  className={styles.fieldSelect}
                  value={radarFilters.quantity}
                  onChange={(event) => setRadarFilters((current) => ({ ...current, quantity: Number(event.target.value) }))}
                >
                  {[10, 20, 50, 100].map((option) => (
                    <option key={option} value={option}>
                      {option} cards
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={radarFilters.noWebsite}
                  onChange={(event) => setRadarFilters((current) => ({ ...current, noWebsite: event.target.checked }))}
                />
                Sem website
              </label>

              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={radarFilters.highOpportunity}
                  onChange={(event) => setRadarFilters((current) => ({ ...current, highOpportunity: event.target.checked }))}
                />
                Alta oportunidade
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nota mínima</span>
                <input
                  className={styles.fieldInput}
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={radarFilters.minRating}
                  onChange={(event) => setRadarFilters((current) => ({ ...current, minRating: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Avaliações mínimas</span>
                <input
                  className={styles.fieldInput}
                  type="number"
                  min="0"
                  step="1"
                  value={radarFilters.minReviews}
                  onChange={(event) => setRadarFilters((current) => ({ ...current, minReviews: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.glassButton}
                onClick={() => void refreshRadarDatabase()}
                disabled={radarLoading || radarPulling}
              >
                <Icon name="search" size={18} />
                {radarLoading ? "Atualizando..." : "Aplicar filtros"}
              </button>
              <button
                type="button"
                className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                onClick={() => void handleRadarPull()}
                disabled={radarLoading || radarPulling}
              >
                <Icon name="spark" size={18} />
                {radarPulling ? "Puxando..." : "Puxar mais cards"}
              </button>
              {radarMeta ? (
                <span className={styles.metaPill}>
                  Estoque limpo: {radarMeta?.cleanStockAfter ?? "-"} • mínimo {radarMeta?.minimumStock ?? 80}
                </span>
              ) : null}
            </div>

            {radarLoading ? (
              <div className={styles.resultsGrid}>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className={styles.resultSkeleton}>
                    <div className={styles.skeletonTitle} />
                    <div className={styles.skeletonLine} />
                    <div className={styles.skeletonLineShort} />
                  </div>
                ))}
              </div>
            ) : null}

            {!radarLoading && radarItems.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>Nenhum card disponível neste filtro</strong>
                <p className={styles.emptyText}>Use filtros mais amplos ou puxe cards para ativar reposição quando o estoque estiver abaixo do mínimo.</p>
              </div>
            ) : (
              <div className={styles.radarGrid}>
                {radarItems.map((item) => {
                  const mapUrl = buildMapUrl(item);
                  return (
                  <article key={item.id} className={styles.radarCard}>
                    <div className={styles.radarCardMain}>
                      <div className={styles.historyTop}>
                        <div>
                          <h2 className={styles.historyTitle}>{item.name || "Empresa sem nome"}</h2>
                          <p className={styles.historyMeta}>
                            {[item.city, item.state, item.segment].filter(Boolean).join(" • ") || "Local não informado"}
                          </p>
                        </div>
                        <span className={styles.historyStamp}>Score {item.opportunityScore ?? 0}</span>
                      </div>
                      <div className={styles.radarPills}>
                        <span className={styles.metaPill}>{websiteStatusLabel(item.websiteStatus)}</span>
                        <span className={styles.metaPill}>{opportunityLevelLabel(item.opportunityScore)}</span>
                        <span className={styles.metaPill}>Nota {item.rating ?? "-"} • {item.reviews ?? 0} avaliações</span>
                        {isLikelyMobileWhatsapp(item.phoneDigits || item.phone) ? <span className={styles.metaPill}>Provável WhatsApp</span> : null}
                      </div>
                      <p className={styles.historyFilter}>{item.phone || item.phoneDigits || "Telefone não informado"}</p>
                      <p className={styles.historyPreview}>{item.opportunityReason || "Oportunidade qualificada pelo Radar Digital."}</p>
                    </div>
                    <div className={styles.radarActions}>
                      <button
                        type="button"
                        className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                        onClick={() => void handleRadarImport(item)}
                        disabled={radarActionId === item.id}
                      >
                        <Icon name="spark" size={18} />
                        {radarActionId === item.id ? "Processando..." : "Herdar para Vendas"}
                      </button>
                      <button
                        type="button"
                        className={styles.glassButton}
                        onClick={() => void handleRadarNegative(item)}
                        disabled={radarActionId === item.id}
                      >
                        <Icon name="alert" size={18} />
                        Descartar
                      </button>
                      {item.website ? (
                        <a className={styles.glassButton} href={normalizeExternalUrl(item.website)} target="_blank" rel="noreferrer">
                          <Icon name="cursor" size={18} />
                          Site
                        </a>
                      ) : null}
                      {mapUrl ? (
                        <a className={styles.glassButton} href={mapUrl} target="_blank" rel="noreferrer">
                          <Icon name="search" size={18} />
                          Mapa
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
                })}
              </div>
            )}

            </>) : null}

            {historyItems.length > 0 ? (
              <div className={styles.radarHistoryStrip}>
                <span className={styles.cardEyebrow}>Histórico privado</span>
                <div className={styles.radarHistoryList}>
                  {historyItems.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.radarHistoryButton}
                      onClick={() => void handleReuseHistory(item)}
                      disabled={historyBusyId === item.id}
                    >
                      <strong>{item.segment || "Agenda PF"}</strong>
                      <span>{item.city} • {item.resultCount} cards</span>
                    </button>
                  ))}
                </div>
                {historyItems.some((item) => item.sourceLabel.toLowerCase().includes("hbx") && !item.id.startsWith("global:")) ? (
                  <div className={styles.actionRow}>
                    {historyItems
                      .filter((item) => item.sourceLabel.toLowerCase().includes("hbx") && !item.id.startsWith("global:"))
                      .slice(0, 1)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                          onClick={() => void handleSearchMoreHistory(item)}
                          disabled={historyBusyId === item.id}
                        >
                          <Icon name="search" size={18} />
                          Buscar +100 no histórico HBX
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {searchError ? (
          <section className={styles.errorCard}>
            <strong className={styles.statusTitle}>Nao foi possivel concluir a busca</strong>
            <p className={styles.statusText}>{searchError}</p>
          </section>
        ) : null}

        {feedback ? (
          <section className={styles.successCard}>
            <strong className={styles.statusTitle}>Tudo certo</strong>
            <p className={styles.statusText}>{feedback}</p>
          </section>
        ) : null}

        <section ref={resultsRef} className={styles.resultsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.cardEyebrow}>Resultados</span>
              <strong className={styles.sectionTitle}>Contatos qualificados</strong>
              <p className={styles.helperText}>
                {searchMeta && activeQuery
                  ? `Encontramos ${qualifiedResults.length} possíveis clientes para ${getVisualSegment(activeQuery.segment, resultTargetType)}${activeQuery.city ? ` em ${activeQuery.city}` : ""}. ${searchMeta.fetchedCount}/${activeQuery.quantity} cards salvos. Fonte: ${searchSourceLabel(searchMeta.source)}${hiddenGenericResultsCount ? `; ${hiddenGenericResultsCount} genérico(s) ocultado(s).` : "."}`
                  : "Pronto para receber contatos com ações rápidas e roteiro pronto."}
              </p>
            </div>
            {searchMeta ? (
              <div className={styles.metaPills}>
                {activeSearchRun ? (
                  <span className={styles.metaPill}>Status: {searchRunStatusLabel(activeSearchRun.status)}</span>
                ) : (
                  <span className={styles.metaPill}>Reaproveitados: {searchMeta.reusedCount}</span>
                )}
                {activeSearchRun ? (
                  <span className={styles.metaPill}>
                    Lote {Math.max(1, Number(activeSearchRun.attemptCount || 0))}
                    {activeSearchRun.maxAttempts ? `/${activeSearchRun.maxAttempts}` : ""}
                  </span>
                ) : null}
                <span className={styles.metaPill}>Encontrados: {searchMeta.fetchedCount}</span>
                <span className={styles.metaPill}>Duplicados: {searchMeta.duplicateCount ?? 0}</span>
                <span className={styles.metaPill}>Ignorados: {searchMeta.skippedCount ?? 0}</span>
                {activeSearchRun?.lastBatchError && (activeSearchRun.status === "running" || activeSearchRun.status === "queued") ? (
                  <span className={styles.metaPill}>Último lote falhou; tentando novamente</span>
                ) : null}
                {activeSearchRun?.lastBatchStatus === "empty_batch" ? (
                  <span className={styles.metaPill}>Último lote vazio</span>
                ) : null}
                {searchMeta.technicalCacheUsed ? (
                  <span className={styles.metaPill}>
                    Cache global: {searchMeta.technicalCacheReusedCount}
                    {searchMeta.technicalCacheValidUntil ? ` • válido até ${formatDateTime(searchMeta.technicalCacheValidUntil)}` : ""}
                  </span>
                ) : null}
                {searching && activeSearchRunId ? (
                  <button
                    type="button"
                    className={styles.glassButton}
                    onClick={() => void handleCancelSearchRun()}
                  >
                    <Icon name="alert" size={18} />
                    Cancelar pesquisa
                  </button>
                ) : null}
                {!activeSearchRun && activeQuery?.engine === "hbx" && searchMeta.historyId && !searchMeta.historyId.startsWith("global:") ? (
                  <button
                    type="button"
                    className={styles.glassButton}
                    onClick={() => void handleSearchMoreHistory()}
                    disabled={searching || importingToVendas}
                  >
                    <Icon name="search" size={18} />
                    Buscar +100 sem repetir
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.glassButton}
                  onClick={() => void handleSendResultsToVendas()}
                  disabled={importingToVendas || !qualifiedResults.length}
                >
                  <Icon name="spark" size={18} />
                  {importingToVendas ? "Enviando..." : "Enviar selecionados para Prospecção"}
                </button>
              </div>
            ) : null}
          </div>

          {searching && results.length === 0 ? (
            <div className={styles.resultsGrid}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className={styles.resultSkeleton}>
                  <div className={styles.skeletonTitle} />
                  <div className={styles.skeletonLine} />
                  <div className={styles.skeletonLineShort} />
                </div>
              ))}
            </div>
          ) : null}

          {!searching && results.length === 0 && hasSearched ? (
            <div className={styles.emptyState}>
              <strong>Nenhum contato encontrado</strong>
              <p className={styles.emptyText}>Tente ajustar a cidade, relaxar um filtro avancado ou buscar outro segmento.</p>
            </div>
          ) : null}

          {!searching && results.length > 0 && qualifiedResults.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>Nenhum nome de pessoa identificado</strong>
              <p className={styles.emptyText}>
                O motor encontrou telefone, mas os nomes vieram como pagina, agenda, empresa ou instituicao. Para PF,
                tente um perfil como consultor/corretor/vendedor e um nicho com DDD local.
              </p>
            </div>
          ) : null}

          {!searching && results.length === 0 && !hasSearched ? (
            <div className={styles.emptyState}>
              <strong>Pronto para sua proxima busca</strong>
              <p className={styles.emptyText}>Informe o termo da busca, cidade opcional e quantidade para carregar os primeiros cards deduplicados.</p>
            </div>
          ) : null}

          {qualifiedResults.length > 0 ? (
            <div className={styles.resultsGrid}>
              {qualifiedResults.map((result) => {
                const queryCity = activeQuery?.city || city;
                const querySegment = getVisualSegment(activeQuery?.segment || segment, activeQuery?.targetType || targetType);
                const crmPreview = crmPreviewByPhone[String(result.phoneDigits || "").trim()] || null;
                const scriptText = buildAppliedScriptText(result, queryCity, querySegment);
                const whatsappUrl = buildWhatsAppUrl(result, scriptText);
                const callUrl = buildCallUrl(result);
                const opportunityScore = result.opportunityScore ?? result.score ?? null;

                return (
                  <LiquidGlassCard
                    key={`${result.name}-${result.phoneDigits}`}
                    as="article"
                    accentTone="success"
                    header={
                      <div className={glassCardStyles.stack}>
                        <span className={glassCardStyles.eyebrow}>Webscraping</span>
                        <div>
                          <h2 className={`${styles.resultName} ${glassCardStyles.title}`}>{result.name || "Empresa sem nome"}</h2>
                          <p className={glassCardStyles.subtitle}>{result.address || "Endereco nao informado"}</p>
                          {crmPreview?.existsInCrm ? (
                            <p className={glassCardStyles.subtitle}>
                              Já existe no CRM
                              {crmPreview.leadName ? ` • ${crmPreview.leadName}` : ""}
                              {crmPreview.statusLabel ? ` • ${crmPreview.statusLabel}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    }
                    chips={
                      <>
                        <span className={glassCardStyles.pillStrong}>Telefone validado</span>
                        {opportunityScore != null ? (
                          <span className={glassCardStyles.pillStrong}>Score {opportunityScore}/100</span>
                        ) : null}
                        {crmPreview?.existsInCrm ? (
                          <span className={glassCardStyles.pill}>Já existe</span>
                        ) : null}
                        {crmPreview?.signals?.hadPreviousContact ? (
                          <span className={glassCardStyles.pill}>Já teve contato</span>
                        ) : null}
                        {crmPreview?.signals?.wasClosedBefore ? (
                          <span className={glassCardStyles.pill}>Encerrado antes</span>
                        ) : null}
                        {crmPreview?.sharedProfile?.presence?.atendimento?.present ? (
                          <span className={glassCardStyles.pill}>Em Atendimento</span>
                        ) : null}
                        {crmPreview?.sharedProfile?.presence?.recovery?.present ? (
                          <span className={glassCardStyles.pill}>Em Recovery</span>
                        ) : null}
                        {crmPreview?.sharedProfile?.currentContext &&
                        crmPreview.sharedProfile.currentContext !== "neutro" ? (
                          <span className={glassCardStyles.pill}>
                            Contexto {formatSharedContextLabel(crmPreview.sharedProfile.currentContext)}
                          </span>
                        ) : null}
                      </>
                    }
                    lead={
                      <div className={styles.phoneRow}>
                        <span className={`${styles.phoneValue} ${glassCardStyles.noBreak}`}>{result.phone}</span>
                        <span className={glassCardStyles.subtitle}>
                          Nota {result.rating ?? "-"} • {result.reviews ?? "-"} avaliacoes
                        </span>
                      </div>
                    }
                    actions={
                      <div className={glassCardStyles.cluster}>
                        {whatsappUrl ? (
                          <a className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`} href={whatsappUrl} target="_blank" rel="noreferrer">
                            WhatsApp
                          </a>
                        ) : null}
                        <a className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} href={callUrl || undefined} aria-disabled={!callUrl}>
                          Ligar
                        </a>
                        <button
                          type="button"
                          className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                          onClick={() => {
                            void copyText(result.phone);
                            setFeedback(`Numero copiado: ${result.phone}`);
                          }}
                        >
                          Copiar numero
                        </button>
                        <button
                          type="button"
                          className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                          onClick={() => {
                            void copyText(scriptText);
                            setFeedback(`Roteiro copiado para ${result.name}.`);
                          }}
                        >
                          Copiar roteiro
                        </button>
                      </div>
                    }
                    highlight={
                      <div className={glassCardStyles.stack}>
                        <span className={glassCardStyles.sectionLabel}>Oportunidade</span>
                        <strong className={glassCardStyles.sectionTitle}>Motivo comercial</strong>
                        <p className={`${glassCardStyles.bodyText} ${styles.scriptText}`}>
                          {result.opportunityReason || "Lead priorizado por telefone validado e aderência ao termo pesquisado."}
                        </p>
                        <span className={glassCardStyles.sectionLabel}>Roteiro</span>
                        <strong className={glassCardStyles.sectionTitle}>Primeiro contato</strong>
                        <p className={`${glassCardStyles.bodyText} ${styles.scriptText}`}>{scriptText}</p>
                      </div>
                    }
                    metrics={
                      <div className={glassCardStyles.metricGrid}>
                        <div className={glassCardStyles.metricCard}>
                          <span className={glassCardStyles.metricLabel}>Oportunidade</span>
                          <strong className={glassCardStyles.metricValue}>{opportunityScore ?? "-"}</strong>
                        </div>
                        <div className={glassCardStyles.metricCard}>
                          <span className={glassCardStyles.metricLabel}>Sinal publico</span>
                          <strong className={glassCardStyles.metricValue}>{result.website ? "Site" : result.address ? "Endereco" : "Telefone"}</strong>
                        </div>
                        <div className={glassCardStyles.metricCard}>
                          <span className={glassCardStyles.metricLabel}>CRM</span>
                          <strong className={glassCardStyles.metricValue}>{crmPreview?.statusLabel || (crmPreview?.existsInCrm ? "Ja existe" : "Novo")}</strong>
                        </div>
                      </div>
                    }
                  >
                    {result.website ? (
                      <div className={glassCardStyles.cluster}>
                        <a className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} href={result.website} target="_blank" rel="noreferrer">
                          Site
                        </a>
                      </div>
                    ) : null}
                  </LiquidGlassCard>
                );
              })}
            </div>
          ) : null}
        </section>

      </div>
    </DashboardScaffold>
  );
}
