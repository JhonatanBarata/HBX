"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import {
  HbxAdvancedFilters,
  HbxEngineSelector,
  HbxQuantitySelector,
  HbxSegmentCombobox,
  HbxStateCityPicker,
  HbxTargetTypeSelector,
  type HbxEngineValue,
  type HbxAdvancedFiltersValue,
  type HbxTargetTypeValue,
} from "@/components/prospecting-filters";
import { apiFetch, clearToken, type ApiFetchError } from "@/app/_lib/api";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { clearTopbarProgress, dispatchTopbarProgress } from "@/lib/topbar-progress";
import {
  clearStoredRadarRun,
  readStoredRadarRun,
  saveStoredRadarRun,
} from "@/lib/radar-active-run";
import type { CommercialPlansPayload } from "@/lib/commercial-plans";
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
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  websiteStatus?: string | null;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
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
  };
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
  highOpportunity: boolean;
  status: string;
};

const PAGE_SIZE = 100;
const RADAR_PROGRESS_STEPS = ["lendo banco", "filtrando negativos", "selecionando melhores cards", "alimentando Vendas/Prospecção"];

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
  highOpportunity: false,
  status: "",
};

type MobilePickerType = "engine" | "city" | "state" | "segment";

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

function websiteLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "none") return "Sem website";
  if (status === "weak" || status === "social_only") return "Website fraco";
  if (status === "present") return "Website ativo";
  if (status === "unreachable") return "Website instável";
  return "Website não avaliado";
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
  if (filters.ddd.trim()) params.set("ddd", filters.ddd.replace(/\D/g, "").slice(0, 2));
  if (filters.scoreRange) params.set("scoreRange", filters.scoreRange);
  if (filters.status) params.set("status", filters.status);
  if (filters.noWebsite) params.set("noWebsite", "true");
  if (filters.highOpportunity) params.set("highOpportunity", "true");
  return params.toString();
}

function compactRadarMessage(message: string | null) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (text.toLowerCase().includes("cidade e segmento")) {
    return "Escolha cidade e segmento para acionar motores. Para histórico, clique em Pesquisar sem filtros.";
  }
  return text;
}

function radarFriendlyError(error: unknown) {
  const apiError = error as ApiFetchError;
  if (apiError?.code === "MODULE_ACCESS_DENIED" || apiError?.status === 403) {
    return "Acesso ao Radar Digital indisponível para este usuário. Verifique a liberação do módulo.";
  }
  if (apiError?.code === "NO_ENGINE_AVAILABLE") {
    return "Motores ocupados. O sistema manteve sua busca na fila.";
  }
  if (apiError?.code === "RADAR_STOCK_EMPTY") {
    return "Sem cards prontos para esse filtro. A reposição foi solicitada.";
  }
  if (apiError?.status && apiError.status >= 500) {
    return "Radar temporariamente indisponível. Tente novamente em instantes.";
  }
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Conexão instável com o Radar. A busca fica protegida no servidor; tente atualizar em instantes.";
  }
  if (/tempo esgotado|timeout/i.test(message)) {
    return "A busca demorou mais que o esperado. O Radar continua protegendo a fila; tente novamente em instantes.";
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
    || filters.highOpportunity
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
  const [cancelingRun, setCancelingRun] = useState(false);
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlansPayload | null>(null);
  const [vendasPending, setVendasPending] = useState<VendasPendingSummary | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobilePicker, setMobilePicker] = useState<MobilePickerType | null>(null);
  const [mobilePickerSearch, setMobilePickerSearch] = useState("");
  const [mobilePickerSearchOpen, setMobilePickerSearchOpen] = useState(false);
  const [mobileModuleMenuOpen, setMobileModuleMenuOpen] = useState(false);
  const [mobileAutoImportPending, setMobileAutoImportPending] = useState(false);
  const [mobileRadarDone, setMobileRadarDone] = useState(false);
  const [availableFilters, setAvailableFilters] = useState<RadarAvailableFilters>({
    states: [],
    citiesByState: {},
    segments: [],
  });
  const activeRunIdRef = useRef<string | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => leadMatchesSearch(item, appliedGeneralSearch)),
    [appliedGeneralSearch, items],
  );
  const highOpportunityCount = useMemo(
    () => visibleItems.filter((item) => Number(item.opportunityScore || 0) >= 70).length,
    [visibleItems],
  );
  const isHbxList = commercialPlans?.current?.planKey === "hbx_lite" || commercialPlans?.current?.selectedPlanKey === "hbx_lite";
  const radarQuantityLimit = isHbxList ? 50 : 100;
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      quantity: Math.min(filters.quantity, radarQuantityLimit),
    }),
    [filters, radarQuantityLimit],
  );
  const activeRunTarget = Math.max(1, Number(activeRun?.targetQuantity || activeRun?.meta?.requestedQuantity || effectiveFilters.quantity || 1));
  const activeRunDelivered = Math.max(visibleItems.length, Number(activeRun?.meta?.deliveredCount || activeRun?.foundCount || 0));
  const activeRunProgress = activeRun
    ? Math.max(4, Math.min(100, Number(activeRun.meta?.progress || Math.round((activeRunDelivered / activeRunTarget) * 100))))
    : 0;
  const queryRadarLeadId = String(searchParams.get("radarLeadId") || "").trim();

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
    if (!isHbxList || filters.quantity <= radarQuantityLimit) return;
    setFilters((current) => ({ ...current, quantity: radarQuantityLimit }));
  }, [filters.quantity, isHbxList, radarQuantityLimit]);

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

  const telonBusy = hasToken === null || loading || loadingMore || searching || bulkSending || Boolean(actionId);

  useEffect(() => {
    if (!telonBusy) {
      setTelonProgress(8);
      setRadarVisualCount(0);
      return undefined;
    }

    setTelonProgress((current) => (current > 8 && current < 96 ? current : 8));
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
          ? "Motores ligando: lendo banco, filtrando negativos e preparando cards elegíveis."
          : "Listando histórico salvo do Radar sem acionar motor.",
        progress: Math.max(18, telonProgress),
        steps: RADAR_PROGRESS_STEPS,
        activeStepIndex,
        cardFeed: realCardFeed,
        metrics: [
          { label: "Entregues", value: String(visibleItems.length) },
          { label: "Motor", value: filters.engine === "google" ? "Google" : "HBX" },
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
    clearStoredRadarRun();
  }

  function updateAdvancedFilters(next: HbxAdvancedFiltersValue) {
    setFilters((current) => ({
      ...current,
      ddd: String(next.ddd || "").replace(/\D/g, "").slice(0, 2),
      scoreRange: String(next.scoreRange || ""),
      status: "",
      noWebsite: next.noWebsite === true,
      highOpportunity: next.highOpportunity === true,
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
      setFilters((current) => ({
        ...current,
        state: payloadFilters.state || current.state,
        city: payloadFilters.city || current.city,
        segment: payloadFilters.segment || current.segment,
        targetType: payloadFilters.targetType === "pf" || payloadFilters.targetType === "both" ? payloadFilters.targetType : "pj",
        quantity: Math.max(1, Number(payload.targetQuantity || payload.meta?.requestedQuantity || current.quantity || 1)),
      }));
      setAppliedFilters((current) => ({
        ...current,
        state: payloadFilters.state || current.state,
        city: payloadFilters.city || current.city,
        segment: payloadFilters.segment || current.segment,
        targetType: payloadFilters.targetType === "pf" || payloadFilters.targetType === "both" ? payloadFilters.targetType : "pj",
        quantity: Math.max(1, Number(payload.targetQuantity || payload.meta?.requestedQuantity || current.quantity || 1)),
      }));
    }
    setItems((current) => mergeRadarLeads([...current, ...nextItems]).slice(0, Math.max(1, Number(payload.targetQuantity || payload.meta?.requestedQuantity || nextItems.length || 1))));
    setTotal(Number(payload.targetQuantity || payload.meta?.requestedQuantity || payload.total || nextItems.length || 0));
    setPage(1);
    setHasSearched(true);
    setTelonProgress(Math.max(12, Math.min(100, Number(payload.meta?.progress || 0) || 12)));
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
      setActiveRun(null);
      setSearching(false);
      if (payload.status === "canceled") {
        clearStoredRadarRun(runId);
        setMobileRadarDone(false);
      }
      if (Number(payload.meta?.autoImport?.processedCount || payload.meta?.autoImport?.importedCount || 0) > 0 || nextItems.length > 0) {
        setMobileRadarDone(true);
      }
      setFeedback(payload.message || `${nextItems.length} card(s) entregues.`);
      return;
    }

    setActiveRun(payload);
    setSearching(true);
    setMobileRadarDone(false);
    setFeedback(payload.message || "Busca em andamento. Os cards aparecem conforme o Radar aprova novos contatos.");
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
      intervalMs: 2200,
      immediate: false,
      pauseWhenHidden: false,
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
      quantity: Math.max(1, Math.min(radarQuantityLimit, Number(options?.quantityOverride || effectiveFilters.quantity || 1))),
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
          ? "Histórico filtrado carregado sem acionar motor."
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

  async function cancelActiveRadarRun() {
    const runId = activeRun?.runId || activeRun?.id || activeRunIdRef.current || readStoredRadarRun()?.runId;
    if (!runId) {
      clearStoredRadarRun();
      setActiveRun(null);
      setSearching(false);
      setMobileRadarDone(false);
      return;
    }
    setCancelingRun(true);
    setError(null);
    try {
      const payload = await apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        requireAuth: true,
        timeoutMs: 15000,
      });
      clearStoredRadarRun(runId);
      activeRunIdRef.current = null;
      setActiveRun(null);
      setSearching(false);
      setMobileAutoImportPending(false);
      setMobileRadarDone(false);
      setFeedback(payload.message || "Busca cancelada. Ajuste os filtros e pesquise de novo.");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Não foi possível cancelar a busca agora.");
    } finally {
      setCancelingRun(false);
    }
  }

  async function runLeadAction(
    lead: RadarLead,
    action: "send" | "hide" | "negative" | "csx",
  ) {
    if (action === "csx") {
      setFeedback("Registro CSX pendente de integração. O card não foi alterado.");
      return;
    }

    setActionId(`${lead.id}:${action}`);
    setError(null);
    try {
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
      setError("Não foi possível concluir esta ação agora.");
    } finally {
      setActionId(null);
    }
  }

  function buildVendasLeadPayload(lead: RadarLead) {
    return {
      sourceHistoryId: `radar:${lead.id}`,
      name: lead.name,
      phone: lead.phone || lead.phoneDigits || "",
      phoneDigits: lead.phoneDigits || lead.phone || "",
      website: lead.website || undefined,
      city: lead.city || undefined,
      segment: lead.segment || undefined,
      shortNote: lead.opportunityReason || undefined,
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
      setMobileRadarDone(false);
      return;
    }

    let cancelled = false;
    async function autoImportMobileRadar() {
      await sendFilteredToVendas();
      if (cancelled) return;
      setMobileAutoImportPending(false);
      setMobileRadarDone(true);
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
  const mobileStateOptions = (availableFilters.states?.length ? availableFilters.states.map((item) => item.value) : BRAZIL_STATES.map((item) => item.uf)).filter(Boolean);
  const mobileCityOptions = (
    filters.state && availableFilters.citiesByState?.[filters.state]?.length
      ? availableFilters.citiesByState[filters.state].map((item) => item.value)
      : filters.state
        ? BRAZIL_CITIES_BY_STATE[filters.state] || []
        : []
  ).filter(Boolean);
  const mobileSegmentOptions = (availableSegments.length ? availableSegments.map((item) => item.value) : HBX_SEGMENT_SUGGESTIONS).filter(Boolean);
  const mobileVendasLimit = Math.max(1, Number(vendasPending?.limit || 40));
  const mobileVendasPendingCount = Math.max(0, Number(vendasPending?.pendingCount || 0));
  const mobileVendasRemaining = Math.max(0, Number(vendasPending?.remaining ?? (mobileVendasLimit - mobileVendasPendingCount)));
  const mobileVendasBlocked = Boolean(vendasPending?.blocked || mobileVendasPendingCount >= mobileVendasLimit);
  const mobilePickerOptions =
    mobilePicker === "engine" ? ["hbx", "google"] :
    mobilePicker === "segment" ? mobileSegmentOptions :
    mobilePicker === "city" ? mobileCityOptions :
    mobilePicker === "state" ? mobileStateOptions :
    [];
  const mobilePickerTitle =
    mobilePicker === "engine" ? "Escolha o motor" :
    mobilePicker === "segment" ? "Escolha o segmento" :
    mobilePicker === "city" ? "Escolha a cidade" :
    mobilePicker === "state" ? "Escolha o estado" :
    "";
  const filteredMobilePickerOptions = mobilePickerOptions.filter((item) =>
    !mobilePickerSearchOpen || item.toLowerCase().includes(mobilePickerSearch.trim().toLowerCase()),
  );
  function openMobilePicker(type: MobilePickerType) {
    setMobilePicker(type);
    setMobilePickerSearch("");
    setMobilePickerSearchOpen(false);
  }
  function mobileEngineLabel(value: string) {
    return value === "google" ? "Google" : "Motor HBX";
  }
  function selectMobilePickerValue(value: string) {
    if (mobilePicker === "engine") setFilters((current) => ({ ...current, engine: value === "google" ? "google" : "hbx" }));
    if (mobilePicker === "segment") setFilters((current) => ({ ...current, segment: value }));
    if (mobilePicker === "city") setFilters((current) => ({ ...current, city: value }));
    if (mobilePicker === "state") setFilters((current) => ({ ...current, state: value, city: "" }));
    setMobilePicker(null);
    setMobilePickerSearchOpen(false);
  }
  async function handleMobileLogout() {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
        requireAuth: true,
      });
    } finally {
      clearToken();
      window.location.href = "/login";
    }
  }
  const activeRunStatus = String(activeRun?.status || "").toLowerCase();
  const activeRunDeliveredCount = Math.max(visibleItems.length, Number(activeRun?.meta?.deliveredCount || activeRun?.foundCount || 0));
  const mobileRadarStage =
    error ? "error" :
    cancelingRun ? "canceling" :
    bulkSending || mobileAutoImportPending ? "sending" :
    mobileRadarDone ? "completed" :
    activeRunStatus === "queued" ? "queued" :
    activeRunDeliveredCount > 0 && (searching || activeRun) ? "receiving" :
    searching || activeRun ? "searching" :
    "idle";
  const mobileRadarProcessing = searching || Boolean(activeRun) || bulkSending || mobileAutoImportPending || cancelingRun;
  const mobileRadarProgress = activeRun
    ? activeRunProgress
    : bulkSending
      ? 88
      : mobileAutoImportPending
        ? 78
        : searching
          ? 44
          : mobileRadarDone
            ? 100
            : 12;
  const mobileRadarStepState = {
    segment: Boolean(filters.segment.trim()),
    location: Boolean(filters.city.trim() && filters.state.trim()),
    search: hasSearched || searching || Boolean(activeRun) || visibleItems.length > 0,
    vendas: mobileRadarDone || bulkSending || Number(activeRun?.meta?.autoImport?.processedCount || activeRun?.meta?.autoImport?.importedCount || 0) > 0,
  };
  return (
    <DashboardScaffold
      title="Radar Digital"
      description="Pesquisa de clientes e envio para Vendas."
      hideHeader
      showDashboardShortcut={false}
    >
      <section className={styles.shell}>
        <div className={styles.mobileRadar}>
          {!mobileRadarProcessing && !mobileRadarDone ? (
            <>
              <header className={styles.mobileRadarHero}>
                <button type="button" aria-label="Voltar" onClick={() => window.history.back()}>‹</button>
                <div className={styles.mobileRadarMark} aria-hidden />
                <button type="button" aria-label="Abrir módulos" onClick={() => setMobileModuleMenuOpen(true)}>⌁</button>
                <span>Radar Digital</span>
                <strong>Conte para o Radar quais leads você precisa</strong>
                <p>Defina seu público-alvo e deixe o HBX trabalhar para você.</p>
              </header>

              {mobileVendasBlocked ? (
                <div className={styles.mobileRadarBlocked}>
                  <strong>Agenda cheia no Vendas</strong>
                  <p>{vendasPending?.message || "40 Cards pendentes no Vendas, delete ou termine sua agenda para seguir com a busca nova"}</p>
                  <a href="/vendas">Abrir Vendas</a>
                </div>
              ) : (
                <form
                  className={styles.mobileRadarBrief}
                  onSubmit={(event) => {
                    event.preventDefault();
                    setMobileRadarDone(false);
                    const quantityOverride = canPullWithFilters(effectiveFilters)
                      ? Math.max(1, Math.min(mobileVendasLimit, mobileVendasRemaining || mobileVendasLimit))
                      : undefined;
                    void runRadarSearch("off", { quantityOverride });
                  }}
                >
                  <button type="button" className={styles.mobileRadarField} onClick={() => openMobilePicker("engine")}>
                    <span data-icon="motor">Motor</span>
                    <strong>{mobileEngineLabel(filters.engine)}</strong>
                  </button>
                  <button type="button" className={styles.mobileRadarField} onClick={() => openMobilePicker("state")}>
                    <span data-icon="estado">Estado</span>
                    <strong>{filters.state || "Selecione o estado"}</strong>
                  </button>
                  <button type="button" className={styles.mobileRadarField} onClick={() => openMobilePicker("city")} disabled={!filters.state}>
                    <span data-icon="cidade">Cidade</span>
                    <strong>{filters.city || (filters.state ? "Selecione a cidade" : "Escolha o estado primeiro")}</strong>
                  </button>
                  <button type="button" className={styles.mobileRadarField} onClick={() => openMobilePicker("segment")}>
                    <span data-icon="segmento">Segmento</span>
                    <strong>{filters.segment || "Selecione o segmento"}</strong>
                  </button>
                  <div className={styles.mobileRadarInfo}>
                    O HBX vai buscar empresas que combinam com o que você precisa e enviar automaticamente para o Vendas.
                  </div>
                  {error ? <div className={styles.mobileRadarNotice}>{compactRadarMessage(error)}</div> : null}
                  <button type="submit" className={styles.mobileRadarSubmit} disabled={searching || Boolean(activeRun)}>
                    <span aria-hidden="true">⌕</span>
                    Buscar leads
                  </button>
                </form>
              )}
            </>
          ) : (
            <section className={styles.mobileRadarProcessing} aria-live="polite">
              <div className={styles.mobileRadarProcessingHeader}>
                <span>Radar Digital</span>
                <strong>
                  {mobileRadarStage === "queued"
                    ? "Sua busca entrou na fila."
                    : mobileRadarStage === "receiving"
                      ? "Cards chegando ao Vendas."
                      : mobileRadarStage === "sending"
                        ? "Entregando cards ao Vendas."
                        : mobileRadarStage === "completed"
                          ? "Leads enviados para o Vendas."
                          : mobileRadarStage === "canceling"
                            ? "Cancelando a busca."
                            : "Trabalhando em seus leads."}
                </strong>
                <p>
                  {mobileRadarStage === "receiving"
                    ? `${activeRunDeliveredCount} ${activeRunDeliveredCount === 1 ? "card aprovado" : "cards aprovados"} até agora.`
                    : "Você verá tudo automaticamente no Vendas."}
                </p>
              </div>
              <div className={styles.mobileRadarRing} data-stage={mobileRadarStage} style={{ ["--progress" as string]: `${mobileRadarProgress}%` }}>
                <strong>{mobileRadarDone ? "100" : Math.round(mobileRadarProgress)}%</strong>
                <span>
                  {mobileRadarStage === "queued"
                    ? "Na fila"
                    : mobileRadarStage === "receiving"
                      ? "Recebendo"
                      : mobileRadarStage === "sending"
                        ? "Enviando"
                        : mobileRadarStage === "completed"
                          ? "Concluído"
                          : mobileRadarStage === "canceling"
                            ? "Parando"
                            : "Processando"}
                </span>
              </div>
              <ul className={styles.mobileRadarSteps}>
                <li data-done={mobileRadarStepState.segment ? "true" : "false"} data-icon="segmento">
                  <strong>Segmento validado</strong>
                  <span>Empresas identificadas</span>
                </li>
                <li data-done={mobileRadarStepState.location ? "true" : "false"} data-icon="local">
                  <strong>Localização validada</strong>
                  <span>Cidades e estados confirmados</span>
                </li>
                <li data-done={mobileRadarStepState.search ? "true" : "false"} data-icon="busca">
                  <strong>Buscando leads</strong>
                  <span>Radar cruzando dados</span>
                </li>
                <li data-done={mobileRadarStepState.vendas ? "true" : "false"} data-icon="vendas">
                  <strong>Enviando para Vendas</strong>
                  <span>Leads sendo entregues</span>
                </li>
              </ul>
              {error ? <div className={styles.mobileRadarNotice}>{compactRadarMessage(error)}</div> : null}
              {feedback ? <div className={styles.mobileRadarDone}>{feedback}</div> : null}
              <div className={styles.mobileRadarProcessingActions}>
                <a
                  className={styles.mobileRadarOpenSales}
                  href="/vendas"
                  onClick={(event) => {
                    event.preventDefault();
                    window.location.href = "/vendas";
                  }}
                >
                  Abrir Vendas
                </a>
                {activeRun || searching ? (
                  <button type="button" className={styles.mobileRadarCancel} onClick={cancelActiveRadarRun} disabled={cancelingRun}>
                    {cancelingRun ? "Cancelando" : "Cancelar"}
                  </button>
                ) : (
                  <button type="button" className={styles.mobileRadarCancel} onClick={clearFilters}>
                    Nova busca
                  </button>
                )}
              </div>
            </section>
          )}

          {mobilePicker ? (
            <div className={styles.mobilePickerPanel} role="dialog" aria-modal="true" aria-label={mobilePickerTitle}>
              <div className={styles.mobilePickerSheet}>
                <div className={styles.mobilePickerHeader}>
                  <strong>{mobilePickerTitle}</strong>
                  <div className={styles.mobilePickerActions}>
                    <button type="button" onClick={() => setMobilePickerSearchOpen(true)}>Buscar</button>
                    <button type="button" onClick={() => setMobilePicker(null)}>Fechar</button>
                  </div>
                </div>
                {mobilePickerSearchOpen ? (
                  <input
                    value={mobilePickerSearch}
                    onChange={(event) => setMobilePickerSearch(event.target.value)}
                    placeholder="Buscar..."
                    autoFocus
                  />
                ) : null}
                <div className={styles.mobilePickerList}>
                  {filteredMobilePickerOptions.map((option) => (
                    <button key={option} type="button" onClick={() => selectMobilePickerValue(option)}>
                      {mobilePicker === "engine" ? mobileEngineLabel(option) : option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {mobileModuleMenuOpen ? (
            <div className={styles.mobileModuleMenuPanel} role="dialog" aria-modal="true" aria-label="Módulos">
              <div className={styles.mobileModuleMenu}>
                <div className={styles.mobileModuleMenuHeader}>
                  <strong>Módulos</strong>
                  <button type="button" onClick={() => setMobileModuleMenuOpen(false)}>Fechar</button>
                </div>
                <a href="/vendas">Vendas</a>
                <a href="/radar-digital" aria-current="page">Radar</a>
                <button type="button" onClick={handleMobileLogout}>Sair</button>
              </div>
            </div>
          ) : null}
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
            <HbxSegmentCombobox
              value={filters.segment}
              onChange={(value) => setFilters((current) => ({ ...current, segment: value }))}
              suggestions={availableSegments.length ? availableSegments.map((item) => item.value) : undefined}
              placeholder="Segmento"
              helperText=""
            />
          </div>
          <div className={styles.filterTarget}>
            <HbxTargetTypeSelector
              value={filters.targetType}
              onChange={(value) => setFilters((current) => ({ ...current, targetType: value }))}
              allowedTypes={["pj", "pf"]}
            />
          </div>
          <div className={styles.filterQuantity}>
            <HbxQuantitySelector
              value={filters.quantity}
              onChange={(value) => setFilters((current) => ({ ...current, quantity: value }))}
              options={isHbxList ? [10, 20, 40, 50] : [10, 20, 40, 60, 100]}
              limitLabel="Quantidade"
              helperText=""
            />
          </div>
          <div className={styles.filterEngine}>
            <HbxEngineSelector
              value={filters.engine}
              onChange={(value) => setFilters((current) => ({ ...current, engine: value }))}
              showDescription={false}
            />
          </div>
          <div className={styles.filterAdvanced}>
            <HbxAdvancedFilters
              mode="radar"
              filters={filters}
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
                const score = Math.max(0, Math.min(100, Math.trunc(Number(lead.opportunityScore || 0))));
                const isHigh = score >= 70;
                const origin = [lead.sourceEngine, lead.source, ...(lead.sourceEngines || [])].filter(Boolean)[0] || "Banco HBX";
                const status = lead.companyStatus || lead.status;
                const ownerBadge = ownershipBadge(lead);
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
                      <span><b>Segmento</b>{lead.segment || "Não informado"}</span>
                      <span><b>Website</b>{lead.website ? lead.website : websiteLabel(lead.websiteStatus)}</span>
                      <span><b>Origem</b>{origin}</span>
                      <span><b>Status</b>{statusLabel(status)}</span>
                    </div>

                    {lead.opportunityReason ? <p className={styles.reason}>{lead.opportunityReason}</p> : null}

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
