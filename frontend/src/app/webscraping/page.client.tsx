"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import LiquidGlassCard, { liquidGlassCardStyles as glassCardStyles } from "@/components/LiquidGlassCard";
import PremiumLaunchDialog from "@/components/PremiumLaunchDialog";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
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
    source: "history" | "google" | "hbx" | "hybrid" | "global_cache";
    reusedCount: number;
    fetchedCount: number;
    totalStoredCount?: number;
    status?: "completed" | "partial_error" | "completed_with_errors";
    message?: string | null;
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

export default function WebscrapingClientPage() {
  const router = useRouter();
  const hasToken = useRequireModule("webscraping");
  const resultsRef = useRef<HTMLElement | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAutoScrollKeyRef = useRef("");
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [activeCitySuggestionIndex, setActiveCitySuggestionIndex] = useState(0);
  const [segmentSuggestionsOpen, setSegmentSuggestionsOpen] = useState(false);
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("Lanchonetes");
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
  const [panelMode, setPanelMode] = useState<"search" | "history">("search");
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
  const segmentSuggestionItems = useMemo(() => {
    const normalizedSegment = normalizeCityLookup(segment);
    if (!normalizedSegment) return activeSegmentSuggestions;
    const filtered = activeSegmentSuggestions.filter((option) => normalizeCityLookup(option).includes(normalizedSegment));
    return filtered.length ? filtered : activeSegmentSuggestions;
  }, [activeSegmentSuggestions, segment]);
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
      if (!segment.trim()) {
        setSegment("Madeireira");
      }
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
    if (nextTargetType === "pj" && !segment.trim()) {
      setSegment("Madeireira");
    }
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

    if (!hbxPjMode && !city.trim()) {
      setSearchError("Informe a cidade.");
      return;
    }

    const selectedCity = cityExactOption || (cityOptions.length === 0 || hbxPjMode ? city.trim() : "");
    if (!hbxPjMode && (citySelectionPending || !selectedCity)) {
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
    try {
      const shouldRunProgressiveHbx = engine === "hbx" && targetType === "pj" && quantity > 20;
      let finalPayload: SearchResponse | null = null;
      let finalResults: SearchResult[] = [];
      let partialFailure = false;

      if (shouldRunProgressiveHbx) {
        const totalBatches = Math.ceil(quantity / 20);
        let accumulated: SearchResult[] = [];
        let accumulatedMeta: SearchResponse["meta"] | null = null;
        let progressQuery: SearchResponse["query"] | null = null;

        for (let batchIndex = 0; batchIndex < totalBatches && accumulated.length < quantity; batchIndex += 1) {
          const batchNumber = batchIndex + 1;
          const remaining = Math.max(1, quantity - accumulated.length);
          const batchQuantity = Math.min(20, remaining);
          const excludePhoneDigits = accumulated
            .map((result) => normalizePhoneDigits(result.phoneDigits || result.phone))
            .filter(Boolean);
          setFeedback(`Buscando lote ${batchNumber}/${totalBatches}... ${accumulated.length} cards encontrados`);

          try {
            const payload = await apiFetch<SearchResponse>("/webscraping/search", {
              method: "POST",
              body: JSON.stringify({
                ...buildPayload({ quantity: batchQuantity, excludePhoneDigits }),
                city: selectedCity,
              }),
            });
            finalPayload = payload;
            accumulated = mergeUniqueSearchResults(accumulated, payload.results || []).slice(0, quantity);
            progressQuery = { ...payload.query, quantity };
            accumulatedMeta = {
              ...payload.meta,
              fetchedCount: accumulated.length,
              reusedCount: 0,
              totalStoredCount: Math.max(Number(payload.meta.totalStoredCount || 0), accumulated.length),
              status: payload.meta.status || "completed",
              message: payload.meta.message || null,
            };
            setResults(accumulated);
            setActiveQuery(progressQuery);
            setSearchMeta(accumulatedMeta);
            setHasSearched(true);
          } catch (batchError) {
            partialFailure = true;
            if (accumulated.length === 0) throw batchError;
            break;
          }
        }

        finalResults = accumulated;
        if (finalPayload && progressQuery && accumulatedMeta) {
          finalPayload = {
            ...finalPayload,
            query: progressQuery,
            meta: {
              ...accumulatedMeta,
              status: partialFailure || accumulated.length < quantity ? "partial_error" : accumulatedMeta.status,
              message:
                partialFailure || accumulated.length < quantity
                  ? `Busca parcial concluída. Encontramos ${accumulated.length} de ${quantity} cards.`
                  : accumulatedMeta.message,
            },
            results: accumulated,
          };
        }
        setFeedback(
          partialFailure || finalResults.length < quantity
            ? `Busca parcial concluída. Encontramos ${finalResults.length} de ${quantity} cards.`
            : `${finalResults.length} cards encontrados.`,
        );
      } else {
        const payload = await apiFetch<SearchResponse>("/webscraping/search", {
          method: "POST",
          body: JSON.stringify({ ...buildPayload(), city: selectedCity }),
        });
        finalPayload = payload;
        finalResults = payload.results || [];
        setResults(finalResults);
        setActiveQuery(payload.query);
        setSearchMeta(payload.meta);
        setHasSearched(true);
      }

      if (!finalPayload) {
        throw new Error("Busca não retornou resposta válida.");
      }

      const responseTargetType =
        finalPayload.query.engine === "hbx" || isPeopleTargetType(finalPayload.query.targetType)
          ? normalizeTargetTypeValue(finalPayload.query.targetType)
          : "pj";
      const displayResults = filterResultsForTarget(finalResults, responseTargetType);
      const hiddenCount = Math.max(0, finalResults.length - displayResults.length);
      scrapingLaunchNotice.markSuccess({
        successDescription:
          displayResults.length
            ? `${displayResults.length} contato(s) qualificados para ${getVisualSegment(finalPayload.query.segment, responseTargetType)}${finalPayload.query.city ? ` em ${finalPayload.query.city}` : ""}${hiddenCount ? `; ${hiddenCount} genérico(s) ocultado(s).` : "."}`
            : hiddenCount
              ? `${hiddenCount} telefone(s) foram encontrados, mas sem nome de pessoa claro para virar card.`
            : `Busca concluída${finalPayload.query.city ? ` em ${finalPayload.query.city}` : ""}, mas nenhum telefone válido entrou nos resultados.`,
      });
      await refreshHistory();
      // persist last city/segment locally for quicker re-entry
      try {
        localStorage.setItem("webscraping.lastCity", String(finalPayload.query.city || city || ""));
        const seg = normalizeTargetTypeValue(finalPayload.query.targetType || targetType) === "pf"
          ? segment
          : String(finalPayload.query.segment || segment || "");
        localStorage.setItem("webscraping.lastSegment", seg);
        localStorage.setItem("webscraping.lastEngine", String(finalPayload.query.engine || engine));
        localStorage.setItem("webscraping.lastTargetType", String(finalPayload.query.targetType || targetType));
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
      (!(queryEngine === "hbx" && queryTargetType === "pj") && !query.city.trim()) ||
      (queryTargetType !== "agenda_pf" && !query.segment.trim())
    ) {
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
                <button
                  type="button"
                  className={styles.modeTab}
                  onClick={() => setPanelMode("history")}
                >
                  <Icon name="clock" size={16} />
                  Pesquisas recentes
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
                        : hbxPjMode
                          ? "Opcional. Use cidade com UF se quiser restringir a busca."
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
                      {searching ? "Buscando..." : hbxPjMode ? "Buscar cards" : "Buscar contatos"}
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

        {panelMode === "history" ? (
          <section className={styles.historyCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.cardEyebrow}>Pesquisas recentes</span>
                <strong className={styles.sectionTitle}>Histórico reaproveitável</strong>
              </div>
              <div className={styles.modeTabs} role="tablist" aria-label="Webscraping">
                <button
                  type="button"
                  className={styles.modeTab}
                  onClick={() => setPanelMode("search")}
                >
                  <Icon name="search" size={16} />
                  Consulta principal
                </button>
                <button
                  type="button"
                  className={styles.modeTabActive}
                  onClick={() => setPanelMode("history")}
                >
                  <Icon name="clock" size={16} />
                  Pesquisas recentes
                </button>
                <span className={styles.modeMetaButton}>
                  API oficial restantes: <strong>{remainingSearchesLabel}</strong>
                </span>
              </div>
            </div>

            {historyItems.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>Nenhuma pesquisa salva ainda</strong>
                <p className={styles.emptyText}>Assim que a primeira busca rodar, ela aparece aqui para reaproveitamento rápido.</p>
              </div>
            ) : (
              <div className={styles.historyList}>
                {historyItems.map((item) => {
                  const isHbxHistory = item.sourceLabel.toLowerCase().includes("hbx") && !item.id.startsWith("global:");
                  return (
                  <article key={item.id} className={styles.historyRow}>
                    <div className={styles.historyRowMain}>
                      <div className={styles.historyTop}>
                        <div>
                          <h2 className={styles.historyTitle}>{item.segment || "Agenda PF"}</h2>
                          <p className={styles.historyMeta}>
                            {item.city} • {item.resultCount} cards encontrados • {item.sourceLabel}
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
                    <div className={styles.historyActions}>
                      <button
                        type="button"
                        className={styles.glassButton}
                        onClick={() => void handleReuseHistory(item)}
                        disabled={historyBusyId === item.id}
                      >
                        <Icon name="cursor" size={18} />
                        {historyBusyId === item.id ? "Carregando..." : "Abrir cards"}
                      </button>
                      {isHbxHistory ? (
                        <button
                          type="button"
                          className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                          onClick={() => void handleSearchMoreHistory(item)}
                          disabled={historyBusyId === item.id}
                        >
                          <Icon name="search" size={18} />
                          Buscar +100
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
                })}
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

        <section ref={resultsRef} className={styles.resultsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.cardEyebrow}>Resultados</span>
              <strong className={styles.sectionTitle}>Contatos qualificados</strong>
              <p className={styles.helperText}>
                {searchMeta && activeQuery
                  ? `Encontramos ${qualifiedResults.length} possíveis clientes para ${getVisualSegment(activeQuery.segment, resultTargetType)}${activeQuery.city ? ` em ${activeQuery.city}` : ""}. ${searchMeta.fetchedCount}/${activeQuery.quantity} novos cards encontrados. Fonte: ${searchSourceLabel(searchMeta.source)}${hiddenGenericResultsCount ? `; ${hiddenGenericResultsCount} genérico(s) ocultado(s).` : "."}`
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
                {activeQuery?.engine === "hbx" && searchMeta.historyId && !searchMeta.historyId.startsWith("global:") ? (
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
