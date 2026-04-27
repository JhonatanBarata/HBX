"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import LiquidGlassCard, { liquidGlassCardStyles as glassCardStyles } from "@/components/LiquidGlassCard";
import PremiumLaunchDialog from "@/components/PremiumLaunchDialog";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
import { apiFetch, getToken } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const SEGMENT_SUGGESTIONS = [
  "Lanchonetes",
  "Oficinas",
  "Clinicas",
  "Mercados",
  "Academias",
  "Pet shop",
  "Outros",
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
type SearchModeId = "google_pj" | "hbx_pj" | "hbx_pf" | "hbx_agenda_pf";

const SEARCH_MODE_OPTIONS: Array<{
  id: SearchModeId;
  label: string;
  description: string;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  quantityOptions: number[];
  motorCode: "MOTOR X" | "MOTOR Y" | "MOTOR W" | "MOTOR Z";
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
    id: "hbx_pj",
    label: "HBX Scraping PJ",
    description: "Empresas e negócios locais, até 50",
    engine: "hbx",
    targetType: "pj",
    quantityOptions: [10, 20, 30, 50],
    motorCode: "MOTOR Y",
  },
  {
    id: "hbx_pf",
    label: "HBX Scraping PF",
    description: "Pessoas por perfil, nicho e DDD, até 100",
    engine: "hbx",
    targetType: "pf",
    quantityOptions: [20, 50, 75, 100],
    motorCode: "MOTOR W",
  },
  {
    id: "hbx_agenda_pf",
    label: "HBX Agenda PF",
    description: "Agenda pública por cidade; só nomes de pessoa",
    engine: "hbx",
    targetType: "agenda_pf",
    quantityOptions: [20, 50, 75, 100],
    motorCode: "MOTOR Z",
  },
];

type MotorHealth = "online" | "offline" | "bug" | "unknown";

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

type RuntimeResponse = {
  native: NativeRuntime;
  quota: {
    remainingSearches: number | null;
    dailyLimit: number | null;
    isTrialLimited: boolean;
    accessMode: "full" | "trial" | "blocked";
  };
  diagnostics?: {
    checkedAt: string;
    nativeTechnicalMessage: string;
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
    source: "history" | "google" | "hbx" | "hybrid" | "global_cache";
    reusedCount: number;
    fetchedCount: number;
    technicalCacheUsed: boolean;
    technicalCacheReusedCount: number;
    technicalCacheValidUntil: string | null;
  };
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

type CitiesResponse = {
  items: string[];
  total: number;
};

type ImportToVendasResponse = {
  ok: boolean;
  createdCount: number;
  updatedCount: number;
  skippedWithoutWhatsapp?: number;
  message?: string;
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

function normalizeCityLookup(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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
  if (source === "global_cache") return "cache técnico global";
  if (source === "hybrid") return "histórico + cache/google";
  if (source === "hbx") return "HBX Scraping";
  return "google";
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
  return results.filter((result) => isLikelyPersonLeadName(result.name));
}

function getSearchMode(engine: WebscrapingEngine, targetType: HbxTargetType) {
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

function motorStatusLabel(status: MotorHealth) {
  if (status === "online") return "Online";
  if (status === "offline") return "Caiu";
  if (status === "bug") return "Com bug";
  return "Aguardando teste";
}

function motorStatusTone(status: MotorHealth) {
  if (status === "online") return "online";
  if (status === "offline" || status === "bug") return "danger";
  return "idle";
}

function searchModeTitle(option: (typeof SEARCH_MODE_OPTIONS)[number]) {
  if (option.id === "google_pj") return "Google oficial";
  if (option.id === "hbx_pj") return "Empresas locais";
  if (option.id === "hbx_pf") return "Pessoas por perfil";
  return "Agenda pública por cidade";
}

function searchModeLimit(option: (typeof SEARCH_MODE_OPTIONS)[number]) {
  const max = option.quantityOptions[option.quantityOptions.length - 1] || 20;
  if (option.id === "hbx_agenda_pf") return "Só nomes de pessoa";
  return `Até ${max} resultados`;
}

function searchModeGuide(option: (typeof SEARCH_MODE_OPTIONS)[number]) {
  if (option.id === "hbx_pf") {
    return {
      input: "Cidade, perfil, nicho e DDD",
      output: "Pessoas qualificadas por contexto",
      action: "WhatsApp, roteiro e CRM",
    };
  }

  if (option.id === "hbx_agenda_pf") {
    return {
      input: "Cidade e rótulo opcional",
      output: "Nomes públicos por cidade",
      action: "Qualificar e herdar no CRM",
    };
  }

  if (option.id === "hbx_pj") {
    return {
      input: "Cidade, segmento e filtros",
      output: "Empresas locais deduplicadas",
      action: "Exportar ou enviar ao CRM",
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
  if (filters.onlyWithWebsite) parts.push("com site");
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

export default function WebscrapingClientPage() {
  const router = useRouter();
  const hasToken = useRequireAuth();
  const resultsRef = useRef<HTMLElement | null>(null);
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [activeCitySuggestionIndex, setActiveCitySuggestionIndex] = useState(0);
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("Lanchonetes");
  const [engine, setEngine] = useState<WebscrapingEngine>("google");
  const [targetType, setTargetType] = useState<HbxTargetType>("pj");
  const [pfRole, setPfRole] = useState("consultor");
  const [pfDdd, setPfDdd] = useState("");
  const [motorHealthByMode, setMotorHealthByMode] = useState<Record<SearchModeId, MotorHealth>>({
    google_pj: "unknown",
    hbx_pj: "unknown",
    hbx_pf: "unknown",
    hbx_agenda_pf: "unknown",
  });
  const [quantity, setQuantity] = useState(10);
  const [minRating, setMinRating] = useState("");
  const [minReviews, setMinReviews] = useState("");
  const [onlyWithWebsite, setOnlyWithWebsite] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeQuery, setActiveQuery] = useState<SearchResponse["query"] | null>(null);
  const [searchMeta, setSearchMeta] = useState<SearchResponse["meta"] | null>(null);
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
  const [panelMode, setPanelMode] = useState<"search" | "script" | "history">("search");
  const [scriptSenderDraft, setScriptSenderDraft] = useState("");
  const [scriptCompanyDraft, setScriptCompanyDraft] = useState("");
  const [appliedScriptSender, setAppliedScriptSender] = useState("");
  const [appliedScriptCompany, setAppliedScriptCompany] = useState("");
  const crmLaunchNotice = useQuickLaunchNotice();
  const scrapingLaunchNotice = useQuickLaunchNotice();

  const runtimeReady = runtime?.native.status === "online";
  const selectedSearchMode = useMemo(() => getSearchMode(engine, targetType), [engine, targetType]);
  const quantityOptions = selectedSearchMode.quantityOptions;
  const maxQuantity = quantityOptions[quantityOptions.length - 1] || 20;
  const agendaMode = engine === "hbx" && targetType === "agenda_pf";
  const pfMode = engine === "hbx" && targetType === "pf";
  const segmentLabel = getVisualSegment(segment, targetType);
  const remainingSearchesLabel = useMemo(() => {
    if (!runtime?.quota) return "-";
    if (runtime.quota.accessMode === "full") return "FULL";
    if (runtime.quota.accessMode === "blocked") return "0";
    if (!runtime.quota.isTrialLimited) return "FULL";
    return String(Math.max(0, Number(runtime.quota.remainingSearches || 0)));
  }, [runtime?.quota]);
  const configurationPending = runtime?.native.code === "configuration_pending";
  const defaultScriptVariables = useMemo(() => buildDefaultScriptVariables(currentUser), [currentUser]);
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
  const citySuggestionItems = useMemo(() => {
    const normalizedCity = normalizeCityLookup(city);
    if (!normalizedCity) return [];

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
      .slice(0, 8)
      .map((item) => item.option);
  }, [city, cityOptions]);
  const shouldShowCitySuggestions =
    citySuggestionsOpen && city.trim().length >= 2 && citySuggestionItems.length > 0 && !cityExactOption;
  const citySelectionPending = cityOptions.length > 0 && city.trim().length > 0 && !cityExactOption;
  const activeCitySuggestion = shouldShowCitySuggestions
    ? citySuggestionItems[Math.min(activeCitySuggestionIndex, citySuggestionItems.length - 1)] || ""
    : "";
  const crmPreviewSummary = useMemo(() => {
    const items = Object.values(crmPreviewByPhone);
    return {
      existing: items.filter((item) => item.existsInCrm).length,
      previousContact: items.filter((item) => item.signals?.hadPreviousContact).length,
      previouslyClosed: items.filter((item) => item.signals?.wasClosedBefore).length,
    };
  }, [crmPreviewByPhone]);
  const motorStatusItems = useMemo(() => {
    return SEARCH_MODE_OPTIONS.map((option) => {
      let status = motorHealthByMode[option.id] || "unknown";
      if (option.id === "google_pj") {
        status = runtimeReady && !configurationPending ? "online" : "offline";
      }
      return {
        ...option,
        status,
        active: selectedSearchMode.id === option.id,
      };
    });
  }, [configurationPending, motorHealthByMode, runtimeReady, selectedSearchMode.id]);
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
  const scriptGuidePreview = useMemo(() => {
    const previewResult: SearchResult = {
      name: qualifiedResults[0]?.name || "Joao Silva",
      phone: "",
      phoneDigits: "",
      rating: null,
      reviews: 0,
      address: "",
      website: "",
    };
    const previewSegment = pfMode
      ? buildPfSegment(pfRole, segment || "plano de saúde", effectiveDdd)
      : getVisualSegment(activeQuery?.segment ?? segment, activeQuery?.targetType || targetType) || "Lanchonetes";
    return buildScriptText(
      previewResult,
      (activeQuery?.city || city || "Rio Claro").trim(),
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
    effectiveDdd,
    pfMode,
    pfRole,
    qualifiedResults,
    segment,
    targetType,
  ]);

  function openVendasDashboard() {
    crmLaunchNotice.clear();
    router.push("/dashboard/vendas");
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
        const [runtimePayload, profilePayload, historyPayload] = await Promise.all([
          apiFetch<RuntimeResponse>("/webscraping/runtime"),
          apiFetch<CurrentUser>("/profile/current-user"),
          apiFetch<HistoryResponse>("/webscraping/history?limit=20"),
        ]);
        if (cancelled) return;
        setRuntime(runtimePayload);
        setCurrentUser(profilePayload);
        setHistoryItems(historyPayload.items || []);
        setPageError(null);
        // hydrate local UI preferences (last city / segment and script preset)
        try {
          const lastCity = localStorage.getItem("webscraping.lastCity");
          if (lastCity && !city) setCity(String(lastCity));
          const lastSegment = localStorage.getItem("webscraping.lastSegment");
          if (lastSegment) {
            setSegment(String(lastSegment));
          }
          const lastEngine = normalizeEngineValue(localStorage.getItem("webscraping.lastEngine"));
          const lastTargetType = normalizeTargetTypeValue(localStorage.getItem("webscraping.lastTargetType"));
          setEngine(lastEngine);
          setTargetType(lastEngine === "google" ? "pj" : lastTargetType);
          const lastPfRole = localStorage.getItem("webscraping.pfRole");
          if (lastPfRole && PF_ROLE_OPTIONS.includes(lastPfRole)) setPfRole(lastPfRole);
          const lastPfDdd = normalizeDdd(localStorage.getItem("webscraping.pfDdd") || "");
          if (lastPfDdd) setPfDdd(lastPfDdd);
        } catch {
          // ignore storage errors
        }
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
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;

    let cancelled = false;
    setCitiesLoading(true);

    apiFetch<CitiesResponse>("/webscraping/cities?limit=6000")
      .then((payload) => {
        if (!cancelled) {
          setCityOptions(payload.items || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCityOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCitiesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

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
            sourceHistoryId: searchMeta?.historyId || undefined,
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
  }, [activeQuery, agendaMode, city, effectiveSegment, qualifiedResults, resultTargetType, searchMeta?.historyId, targetType]);

  useEffect(() => {
    const fallbackSender = String(currentUser?.email || "").trim();
    setScriptSenderDraft("");
    setScriptCompanyDraft(defaultScriptVariables.company);
    setAppliedScriptSender(fallbackSender);
    setAppliedScriptCompany(defaultScriptVariables.company);
  }, [currentUser?.email, defaultScriptVariables.company]);

  function buildPayload() {
    const basePayload = {
      city: city.trim(),
      segment: effectiveSegment,
      quantity,
    };

    if (engine === "google") {
      return {
        ...basePayload,
        minRating: minRating ? Number(minRating) : undefined,
        minReviews: minReviews ? Number(minReviews) : undefined,
        onlyWithWebsite,
      };
    }

    return {
      ...basePayload,
      engine,
      targetType,
      minRating: targetType === "pj" && minRating ? Number(minRating) : undefined,
      minReviews: targetType === "pj" && minReviews ? Number(minReviews) : undefined,
      onlyWithWebsite: targetType === "pj" ? onlyWithWebsite : undefined,
    };
  }

  function handleSearchModeChange(modeId: SearchModeId) {
    const nextMode = SEARCH_MODE_OPTIONS.find((option) => option.id === modeId) || SEARCH_MODE_OPTIONS[0];
    setEngine(nextMode.engine);
    setTargetType(nextMode.targetType);
    if (nextMode.targetType === "pf" && SEGMENT_SUGGESTIONS.includes(segment)) {
      setSegment("plano de saúde");
    }
    if (nextMode.targetType === "agenda_pf" && SEGMENT_SUGGESTIONS.includes(segment)) {
      setSegment("");
    }
    if (nextMode.targetType === "pj" && !segment.trim()) {
      setSegment("Lanchonetes");
    }
    setQuantity((current) => {
      const nextMax = nextMode.quantityOptions[nextMode.quantityOptions.length - 1] || current;
      if (current > nextMax) return nextMax;
      if (nextMode.quantityOptions.includes(current)) return current;
      return nextMode.quantityOptions.find((option) => option >= current) || nextMax;
    });
  }

  function selectCitySuggestion(option: string) {
    setCity(option);
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

  async function handleSearch() {
    setSearchError(null);
    setFeedback(null);

    if (!city.trim()) {
      setSearchError("Informe a cidade.");
      return;
    }

    const selectedCity = cityExactOption || (cityOptions.length === 0 ? city.trim() : "");
    if (citySelectionPending || !selectedCity) {
      if (citySuggestionItems.length > 0) {
        setSearchError("Selecione a cidade com UF na lista para evitar ambiguidade.");
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
      setSearchError("Informe o segmento.");
      return;
    }

    const searchModeSnapshot = selectedSearchMode;
    const requestedSegment = effectiveSegment || getVisualSegment(segment, targetType) || searchModeSnapshot.label;
    scrapingLaunchNotice.start({
      loadingTitle: "Scraping em andamento",
      loadingDescription: `Consultando ${searchModeSnapshot.label} para ${requestedSegment} em ${selectedCity}.`,
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
    try {
      const payload = await apiFetch<SearchResponse>("/webscraping/search", {
        method: "POST",
        body: JSON.stringify({ ...buildPayload(), city: selectedCity }),
      });
      setMotorHealthByMode((current) => ({
        ...current,
        [selectedSearchMode.id]: "online",
      }));
      setResults(payload.results || []);
      setActiveQuery(payload.query);
      setSearchMeta(payload.meta);
      setHasSearched(true);
      const responseTargetType =
        payload.query.engine === "hbx" || isPeopleTargetType(payload.query.targetType)
          ? normalizeTargetTypeValue(payload.query.targetType)
          : "pj";
      const displayResults = filterResultsForTarget(payload.results || [], responseTargetType);
      const hiddenCount = Math.max(0, (payload.results || []).length - displayResults.length);
      scrapingLaunchNotice.markSuccess({
        successDescription:
          displayResults.length
            ? `${displayResults.length} contato(s) qualificados para ${getVisualSegment(payload.query.segment, responseTargetType)} em ${payload.query.city}${hiddenCount ? `; ${hiddenCount} genérico(s) ocultado(s).` : "."}`
            : hiddenCount
              ? `${hiddenCount} telefone(s) foram encontrados, mas sem nome de pessoa claro para virar card.`
            : `Busca concluída em ${payload.query.city}, mas nenhum telefone válido entrou nos resultados.`,
      });
      await refreshHistory();
      // persist last city/segment locally for quicker re-entry
      try {
        localStorage.setItem("webscraping.lastCity", String(payload.query.city || city || ""));
        const seg = normalizeTargetTypeValue(payload.query.targetType || targetType) === "pf"
          ? segment
          : String(payload.query.segment || segment || "");
        localStorage.setItem("webscraping.lastSegment", seg);
        localStorage.setItem("webscraping.lastEngine", String(payload.query.engine || engine));
        localStorage.setItem("webscraping.lastTargetType", String(payload.query.targetType || targetType));
        localStorage.setItem("webscraping.pfRole", pfRole);
        localStorage.setItem("webscraping.pfDdd", normalizeDdd(pfDdd));
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      setResults([]);
      setActiveQuery(null);
      setSearchMeta(null);
      setHasSearched(true);
      setMotorHealthByMode((current) => ({
        ...current,
        [selectedSearchMode.id]: "bug",
      }));
      const baseMessage = error instanceof Error ? error.message : "Falha ao buscar contatos.";
      setSearchError(
        pfMode
          ? `${baseMessage} O Motor W pode estar indisponível ou sobrecarregado; tente reduzir a quantidade, trocar o nicho ou usar HBX Agenda PF.`
          : baseMessage,
      );
      scrapingLaunchNotice.clear();
    } finally {
      setSearching(false);
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
      setCity(payload.query.city);
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
      setOnlyWithWebsite(Boolean(payload.query.filters.onlyWithWebsite));
      setResults(payload.results || []);
      setActiveQuery(payload.query);
      setSearchMeta(payload.meta);
      setHasSearched(true);
      setFeedback(
        `Pesquisa reaproveitada: ${getVisualSegment(payload.query.segment, restoredTargetType)} em ${payload.query.city}.`,
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

  async function handleExport() {
    const selectedCity = cityExactOption || (cityOptions.length === 0 ? city.trim() : "");
    const query = activeQuery || {
      city: selectedCity,
      segment: effectiveSegment,
      quantity,
      engine,
      targetType,
      filters: {
        minRating: minRating ? Number(minRating) : null,
        minReviews: minReviews ? Number(minReviews) : null,
        onlyWithWebsite,
      },
    };

    const queryEngine = normalizeEngineValue(query.engine || engine);
    const queryTargetType = queryEngine === "google" ? "pj" : normalizeTargetTypeValue(query.targetType || targetType);

    if (!query.city.trim() || (queryTargetType !== "agenda_pf" && !query.segment.trim())) {
      setSearchError(
        city.trim() && !query.city.trim()
          ? "Selecione a cidade com UF na lista antes de exportar."
          : "Preencha cidade e segmento antes de exportar.",
      );
      setCitySuggestionsOpen(Boolean(city.trim() && !query.city.trim()));
      return;
    }

    setExporting(true);
    setSearchError(null);
    try {
      const exportPayload: Record<string, unknown> = {
        city: query.city,
        segment: queryTargetType === "agenda_pf" && !query.segment.trim() ? "" : query.segment,
        quantity: query.quantity,
        minRating: queryTargetType === "pj" ? query.filters.minRating ?? undefined : undefined,
        minReviews: queryTargetType === "pj" ? query.filters.minReviews ?? undefined : undefined,
        onlyWithWebsite: queryTargetType === "pj" ? query.filters.onlyWithWebsite : undefined,
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

    if (!qualifiedResults.length || !query.city.trim() || !leadSegment.trim()) {
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
          sourceHistoryId: searchMeta?.historyId || undefined,
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
            scriptText: buildScriptText(
              result,
              query.city,
              leadSegment,
              appliedScriptSender || defaultScriptVariables.speaker,
              appliedScriptCompany || defaultScriptVariables.company,
            ),
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

  function handleApplyScriptPreset() {
    const nextSender = scriptSenderDraft.trim() || String(currentUser?.email || "").trim();
    const nextCompany = scriptCompanyDraft.trim() || defaultScriptVariables.company;
    setAppliedScriptSender(nextSender);
    setAppliedScriptCompany(nextCompany);
    setFeedback("Roteiro atualizado para todos os contatos carregados.");
  }

  function handleResetScriptPreset() {
    setScriptSenderDraft("");
    setScriptCompanyDraft(defaultScriptVariables.company);
    setAppliedScriptSender(String(currentUser?.email || "").trim());
    setAppliedScriptCompany(defaultScriptVariables.company);
    setFeedback("Roteiro resetado para o padrao.");
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

        <section className={styles.commandCard}>
          <div className={styles.commandGrid}>
            <article className={styles.quotaCard}>
              <span className={styles.cardEyebrow}>Pesquisas na API oficial</span>
              <strong className={styles.quotaValue}>{remainingSearchesLabel}</strong>
            </article>

            <div className={styles.motorStatusGrid} aria-label="Status dos motores">
              {motorStatusItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.active ? styles.motorStatusActive : styles.motorStatus}
                  data-status={motorStatusTone(item.status)}
                  onClick={() => handleSearchModeChange(item.id)}
                >
                  <span className={styles.motorCode}>{item.motorCode}</span>
                  <strong>{motorStatusLabel(item.status)}</strong>
                  <small>{item.label}</small>
                  <Icon name="cursor" size={16} className={styles.clickIcon} />
                </button>
              ))}
            </div>
          </div>

          <div className={styles.modeTabs} role="tablist" aria-label="Webscraping">
            <button
              type="button"
              className={panelMode === "search" ? styles.modeTabActive : styles.modeTab}
              onClick={() => setPanelMode("search")}
            >
              <Icon name="search" size={16} />
              Consulta principal
            </button>
            <button
              type="button"
              className={panelMode === "script" ? styles.modeTabActive : styles.modeTab}
              onClick={() => setPanelMode("script")}
            >
              <Icon name="book" size={16} />
              Guia de roteiro
            </button>
            <button
              type="button"
              className={panelMode === "history" ? styles.modeTabActive : styles.modeTab}
              onClick={() => setPanelMode("history")}
            >
              <Icon name="clock" size={16} />
              Pesquisas recentes
            </button>
          </div>
        </section>

        {panelMode === "search" ? (
          <section className={styles.searchCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.cardEyebrow}>Consulta principal</span>
                <strong className={styles.sectionTitle}>{selectedSearchMode.label}</strong>
              </div>
              <div className={styles.segmentChips}>
                {activeSegmentSuggestions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={segment === option ? styles.segmentChipActive : styles.segmentChip}
                    onClick={() => setSegment(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

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
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="webscraping-city">
                  Cidade
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
                    placeholder="Digite e selecione: Rio Claro - SP"
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
                  {citiesLoading
                    ? "Carregando cidades..."
                    : citySelectionPending
                      ? "Escolha uma opcao com UF antes de buscar."
                      : "Use a UF para diferenciar cidades com o mesmo nome."}
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
                  {pfMode ? "Nicho / serviço para PF" : agendaMode ? "Segmento opcional" : "Segmento / tipo de negocio"}
                </span>
                <input
                  className={styles.fieldInput}
                  value={segment}
                  onChange={(event) => setSegment(event.target.value)}
                  placeholder={
                    pfMode
                      ? "Ex: plano de saúde, seguros, imóveis"
                      : agendaMode
                        ? "Opcional. Ex: Agenda PF"
                        : "Ex: Clinicas odontologicas"
                  }
                />
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

                      <label className={styles.checkboxField}>
                        <input
                          type="checkbox"
                          checked={onlyWithWebsite}
                          onChange={(event) => setOnlyWithWebsite(event.target.checked)}
                        />
                        <span>Somente com site</span>
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
                <span>Primeiro reaproveita histórico global. Só depois gasta API.</span>
              </div>
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                  onClick={() => void handleSearch()}
                  disabled={loadingBootstrap || searching}
                >
                  <Icon name="play" size={18} />
                  {searching ? "Buscando..." : "Buscar contatos"}
                </button>
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
          </section>
        ) : null}

        {panelMode === "script" ? (
          <section className={styles.scriptGuideCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.cardEyebrow}>Guia de roteiro</span>
                <strong className={styles.sectionTitle}>Primeiro contato</strong>
              </div>
            </div>

            <div className={styles.scriptGuideGrid}>
              <div className={styles.scriptGuidePreview}>
                <span className={styles.cardEyebrow}>Prévia</span>
                <p className={styles.scriptText}>{scriptGuidePreview}</p>
              </div>

              <div className={styles.scriptGuideControls}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Nome de quem envia</span>
                  <input
                    className={styles.fieldInput}
                    value={scriptSenderDraft}
                    onChange={(event) => setScriptSenderDraft(event.target.value)}
                    placeholder={currentUser?.email || "Digite seu nome"}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Empresa / marca</span>
                  <input
                    className={styles.fieldInput}
                    value={scriptCompanyDraft}
                    onChange={(event) => setScriptCompanyDraft(event.target.value)}
                    placeholder="Ex: HBX"
                  />
                </label>

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                    onClick={handleApplyScriptPreset}
                  >
                    <Icon name="check" size={18} />
                    Atualizar roteiro
                  </button>
                  <button type="button" className={styles.glassButton} onClick={handleResetScriptPreset}>
                    <Icon name="clock" size={18} />
                    Resetar roteiro
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {panelMode === "history" ? (
          <section className={styles.historyCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.cardEyebrow}>Pesquisas recentes</span>
                <strong className={styles.sectionTitle}>Histórico reaproveitável</strong>
              </div>
            </div>

            {historyItems.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>Nenhuma pesquisa salva ainda</strong>
                <p className={styles.emptyText}>Assim que a primeira busca rodar, ela aparece aqui para reaproveitamento rápido.</p>
              </div>
            ) : (
              <div className={styles.historyList}>
                {historyItems.map((item) => (
                  <article key={item.id} className={styles.historyRow}>
                    <div className={styles.historyRowMain}>
                      <div className={styles.historyTop}>
                        <div>
                          <h2 className={styles.historyTitle}>{item.segment || "Agenda PF"}</h2>
                          <p className={styles.historyMeta}>
                            {item.city} • {item.resultCount} contatos • {item.sourceLabel}
                          </p>
                        </div>
                        <span className={styles.historyStamp}>{formatDateTime(item.lastUsedAt)}</span>
                      </div>
                      <p className={styles.historyFilter}>{buildFilterSummary(item.filters)}</p>
                      <p className={styles.historyPreview}>
                        {item.preview.length > 0 ? item.preview.join(" • ") : "Sem preview salvo"}
                        {item.cacheValidUntil ? ` • válido até ${formatDateTime(item.cacheValidUntil)}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.glassButton}
                      onClick={() => void handleReuseHistory(item)}
                      disabled={historyBusyId === item.id}
                    >
                      <Icon name="cursor" size={18} />
                      {historyBusyId === item.id ? "Carregando..." : "Reaproveitar"}
                    </button>
                  </article>
                ))}
              </div>
            )}
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

        {!searching && qualifiedResults.length > 0 ? (
          <section className={styles.statusCard}>
            <div>
              <strong className={styles.statusTitle}>Pronto para entrar no CRM agenda viva</strong>
              <p className={styles.statusText}>
                Os contatos desta busca podem virar cards de Vendas agora, já marcados como origem de webscraping e com reaproveitamento seguro quando o número já existe no CRM.
              </p>
              <p className={styles.statusText}>
                {crmPreviewSummary.existing} já existe(m) no CRM, {crmPreviewSummary.previousContact} já teve(ram) contato e {crmPreviewSummary.previouslyClosed} já foi(ram) encerrado(s) antes.
              </p>
            </div>
            <button
              type="button"
              className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
              onClick={() => void handleSendResultsToVendas()}
              disabled={importingToVendas || !qualifiedResults.length}
            >
              <Icon name="spark" size={18} />
              {importingToVendas ? "Enviando..." : `Enviar ${qualifiedResults.length} lead(s) ao CRM`}
            </button>
          </section>
        ) : null}

        <section ref={resultsRef} className={styles.resultsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.cardEyebrow}>Resultados</span>
              <strong className={styles.sectionTitle}>Contatos qualificados</strong>
              <p className={styles.helperText}>
                {searchMeta && activeQuery
                  ? `${qualifiedResults.length} contatos qualificados para ${getVisualSegment(activeQuery.segment, resultTargetType)} em ${activeQuery.city}. Fonte: ${searchSourceLabel(searchMeta.source)}${hiddenGenericResultsCount ? `; ${hiddenGenericResultsCount} genérico(s) ocultado(s).` : "."}`
                  : "Pronto para receber contatos com ações rápidas e roteiro pronto."}
              </p>
            </div>
            {searchMeta ? (
              <div className={styles.metaPills}>
                <span className={styles.metaPill}>Reaproveitados: {searchMeta.reusedCount}</span>
                <span className={styles.metaPill}>Novos: {searchMeta.fetchedCount}</span>
                {searchMeta.technicalCacheUsed ? (
                  <span className={styles.metaPill}>
                    Cache global: {searchMeta.technicalCacheReusedCount}
                    {searchMeta.technicalCacheValidUntil ? ` • válido até ${formatDateTime(searchMeta.technicalCacheValidUntil)}` : ""}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={styles.glassButton}
                  onClick={() => void handleSendResultsToVendas()}
                  disabled={importingToVendas || !qualifiedResults.length}
                >
                  <Icon name="spark" size={18} />
                  {importingToVendas ? "Enviando..." : "Herdar no CRM"}
                </button>
              </div>
            ) : null}
          </div>

          {searching ? (
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
              <p className={styles.emptyText}>Informe cidade, segmento e quantidade para carregar os primeiros contatos deduplicados.</p>
            </div>
          ) : null}

          {!searching && qualifiedResults.length > 0 ? (
            <div className={styles.resultsGrid}>
              {qualifiedResults.map((result) => {
                const queryCity = activeQuery?.city || city;
                const querySegment = getVisualSegment(activeQuery?.segment || segment, activeQuery?.targetType || targetType);
                const crmPreview = crmPreviewByPhone[String(result.phoneDigits || "").trim()] || null;
                const scriptText = buildScriptText(
                  result,
                  queryCity,
                  querySegment,
                  appliedScriptSender || defaultScriptVariables.speaker,
                  appliedScriptCompany || defaultScriptVariables.company,
                );
                const whatsappUrl = buildWhatsAppUrl(result, scriptText);
                const callUrl = buildCallUrl(result);

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
                        <span className={glassCardStyles.sectionLabel}>Roteiro</span>
                        <strong className={glassCardStyles.sectionTitle}>Primeiro contato</strong>
                        <p className={`${glassCardStyles.bodyText} ${styles.scriptText}`}>{scriptText}</p>
                      </div>
                    }
                    metrics={
                      <div className={glassCardStyles.metricGrid}>
                        <div className={glassCardStyles.metricCard}>
                          <span className={glassCardStyles.metricLabel}>Nota</span>
                          <strong className={glassCardStyles.metricValue}>{result.rating ?? "-"}</strong>
                        </div>
                        <div className={glassCardStyles.metricCard}>
                          <span className={glassCardStyles.metricLabel}>Avaliacoes</span>
                          <strong className={glassCardStyles.metricValue}>{result.reviews ?? "-"}</strong>
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

        <PremiumLaunchDialog
          notice={scrapingLaunchNotice.notice}
          onOpen={scrapingLaunchNotice.openNow}
          progressLabel={scrapingLaunchNotice.notice?.phase === "loading" ? "Raspando páginas públicas" : "Resultados prontos"}
          loadingLabel="Scraping em andamento..."
          detailRows={[
            { label: "Motor", value: `${selectedSearchMode.motorCode} · ${selectedSearchMode.label}` },
            { label: "Cidade", value: cityExactOption || city || "-" },
            { label: "Busca", value: effectiveSegment || getVisualSegment(segment, targetType) || "Agenda PF" },
            { label: "Quantidade", value: `${quantity} contato(s)` },
          ]}
        />
        <PremiumLaunchDialog notice={crmLaunchNotice.notice} onOpen={crmLaunchNotice.openNow} />
      </div>
    </DashboardScaffold>
  );
}
