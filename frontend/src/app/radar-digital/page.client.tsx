"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { apiFetch } from "@/app/_lib/api";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { clearTopbarProgress, dispatchTopbarProgress } from "@/lib/topbar-progress";
import type { CommercialPlansPayload } from "@/lib/commercial-plans";
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
  historySummary?: RadarLeadHistory[];
  lastSeenAt?: string | null;
  firstSeenAt?: string | null;
};

type RadarLeadsResponse = {
  items: RadarLead[];
  total: number;
  facets?: Array<{ key: string; label: string; count: number; tone?: string }>;
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
  meta?: {
    requestedQuantity?: number;
    deliveredCount?: number;
    replenish?: {
      ran?: boolean;
      fetchedCount?: number;
    };
  };
};

type ImportToVendasResponse = {
  ok: boolean;
  createdCount: number;
  updatedCount: number;
  skippedWithoutWhatsapp?: number;
  message?: string;
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

const PAGE_SIZE = 24;
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
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function statusLabel(value?: string | null) {
  const status = String(value || "clean").toLowerCase();
  if (status === "clean" || status === "new") return "Novo";
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
  if (safeScore >= 45) return "Oportunidade média";
  return "Oportunidade baixa";
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
  if (filters.engine) params.set("engine", filters.engine);
  if (filters.targetType) params.set("targetType", filters.targetType);
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
    return "Escolha cidade e segmento para puxar cards do Radar.";
  }
  return text;
}

export default function RadarDigitalClientPage() {
  const hasToken = useRequireModule("webscraping");
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
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
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlansPayload | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableFilters, setAvailableFilters] = useState<RadarAvailableFilters>({
    states: [],
    citiesByState: {},
    segments: [],
  });

  const highOpportunityCount = useMemo(
    () => items.filter((item) => Number(item.opportunityScore || 0) >= 70).length,
    [items],
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
  const canSearchRadar = Boolean(filters.state.trim() && filters.city.trim() && filters.segment.trim());
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
    setAppliedFilters((current) => ({
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
        const lead = await apiFetch<RadarLead>(`/webscraping/radar/leads/${encodeURIComponent(queryRadarLeadId)}`, {
          requireAuth: true,
          timeoutMs: 15000,
        });
        if (cancelled) return;
        setItems(lead ? [lead] : []);
        setTotal(lead ? 1 : 0);
        setPage(1);
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

  const loadCards = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const query = buildLeadQuery(appliedFilters, nextPage);
      const payload = await apiFetch<RadarLeadsResponse>(`/webscraping/radar/leads?${query}`, {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setItems((current) => append ? [...current, ...(payload.items || [])] : payload.items || []);
      setTotal(Number(payload.total || 0));
      setAvailableFilters(payload.meta?.availableFilters || { states: [], citiesByState: {}, segments: [] });
      setPage(nextPage);
    } catch {
      setError("Não foi possível carregar os cards agora. Tente atualizar em instantes.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (queryRadarLeadId) return;
    if (!appliedFilters.state && !appliedFilters.city && !appliedFilters.segment && !appliedFilters.status) return;
    void loadCards(1, false);
  }, [hasToken, loadCards, queryRadarLeadId, appliedFilters.state, appliedFilters.city, appliedFilters.segment, appliedFilters.status]);

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
    if (!searching && !bulkSending) {
      setRadarVisualCount(0);
      return undefined;
    }
    const target = Math.max(1, Math.min(effectiveFilters.quantity, searching ? radarQuantityLimit : Math.max(1, items.length)));
    setRadarVisualCount(1);
    const timer = window.setInterval(() => {
      setRadarVisualCount((current) => Math.min(target, current + 1));
    }, 180);
    return () => window.clearInterval(timer);
  }, [bulkSending, effectiveFilters.quantity, items.length, radarQuantityLimit, searching]);

  useEffect(() => {
    const metrics = [
      { label: "Cards", value: items.length.toLocaleString("pt-BR") },
      { label: "High", value: highOpportunityCount.toLocaleString("pt-BR") },
      { label: "Total", value: total.toLocaleString("pt-BR") },
    ];
    const errorMessage = compactRadarMessage(error);
    const activeStepIndex = Math.min(RADAR_PROGRESS_STEPS.length - 1, Math.floor(topbarProgressPercentFrom(telonProgress) / 25));
    const visualCards = Array.from({ length: Math.min(4, radarVisualCount) }, (_, index) => {
      const cardNumber = Math.max(1, radarVisualCount - Math.min(4, radarVisualCount) + index + 1);
      return {
        id: `radar:${cardNumber}`,
        title: `Card ${cardNumber}`,
        meta: [filters.segment || "segmento", filters.city || "cidade"].filter(Boolean).join(" • "),
        score: `${Math.min(99, 62 + ((cardNumber * 7) % 32))}`,
      };
    });

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

    if (feedback) {
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
        status: "Motores ligando: lendo banco, filtrando negativos e preparando cards elegíveis.",
        progress: Math.max(18, telonProgress),
        steps: RADAR_PROGRESS_STEPS,
        activeStepIndex,
        cardFeed: visualCards,
        metrics: [
          { label: "Qtd", value: String(effectiveFilters.quantity) },
          { label: "Motor", value: filters.engine === "google" ? "Google" : "HBX" },
          { label: "Tipo", value: filters.targetType.toUpperCase() },
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
        cardFeed: items.slice(0, Math.max(1, radarVisualCount)).slice(-4).map((item) => ({
          id: `vendas:${item.id}`,
          title: item.name || "Card Radar",
          meta: [item.segment, item.city].filter(Boolean).join(" • ") || "Radar Digital",
          score: item.opportunityScore ?? undefined,
        })),
        metrics: [
          { label: "Selecionados", value: String(Math.min(items.length, effectiveFilters.quantity)) },
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
        status: "Buscando o próximo lote de cards.",
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
        status: "Lendo estoque, filtros e oportunidades.",
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
    bulkSending,
    error,
    feedback,
    filters.engine,
    filters.quantity,
    filters.city,
    filters.segment,
    filters.targetType,
    hasToken,
    highOpportunityCount,
    effectiveFilters.quantity,
    items.length,
    items,
    loading,
    loadingMore,
    searching,
    telonProgress,
    total,
    radarVisualCount,
  ]);

  useEffect(() => () => clearTopbarProgress("radar"), []);

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  function updateAdvancedFilters(next: HbxAdvancedFiltersValue) {
    setFilters((current) => ({
      ...current,
      ddd: String(next.ddd || "").replace(/\D/g, "").slice(0, 2),
      scoreRange: String(next.scoreRange || ""),
      status: String(next.status || ""),
      noWebsite: next.noWebsite === true,
      highOpportunity: next.highOpportunity === true,
    }));
  }

  async function runRadarSearch() {
    if (!canSearchRadar) {
      setFeedback(null);
      setError("Escolha estado, cidade e segmento para pesquisar no Radar.");
      return;
    }

    setSearching(true);
    setError(null);
    setFeedback(null);
    setTelonProgress(12);
    const nextFilters = { ...effectiveFilters };
    setAppliedFilters(nextFilters);
    try {
      const pullRadar = (targetType: Exclude<HbxTargetTypeValue, "both">, quantity: number) =>
        apiFetch<RadarPullResponse>("/webscraping/radar/pull", {
          method: "POST",
          requireAuth: true,
          timeoutMs: 45000,
          body: JSON.stringify({
            ...nextFilters,
            targetType,
            quantity,
            minimumStock: Math.min(quantity, 20),
            desiredStock: Math.max(quantity, 60),
          }),
        });

      let motorRan = false;
      let fetchedCount = 0;
      let nextItems: RadarLead[] = [];

      if (nextFilters.targetType === "both") {
        const pjQuantity = Math.ceil(nextFilters.quantity / 2);
        const pfQuantity = Math.max(1, nextFilters.quantity - pjQuantity);
        const [pjResult, pfResult] = await Promise.allSettled([
          pullRadar("pj", pjQuantity),
          pullRadar("pf", pfQuantity),
        ]);
        const fulfilled = [pjResult, pfResult].filter((result): result is PromiseFulfilledResult<RadarPullResponse> => result.status === "fulfilled");
        if (!fulfilled.length) {
          const rejected = [pjResult, pfResult].find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
          throw rejected?.reason || new Error("Não foi possível pesquisar CNPJ e CPF agora.");
        }
        nextItems = mergeRadarLeads(fulfilled.flatMap((result) => result.value.items || [])).slice(0, nextFilters.quantity);
        motorRan = fulfilled.some((result) => Boolean(result.value.meta?.replenish?.ran));
        fetchedCount = fulfilled.reduce((totalCount, result) => totalCount + Number(result.value.meta?.replenish?.fetchedCount || 0), 0);
      } else {
        const payload = await pullRadar(nextFilters.targetType === "agenda_pf" ? "pf" : nextFilters.targetType, nextFilters.quantity);
        nextItems = payload.items || [];
        motorRan = Boolean(payload.meta?.replenish?.ran);
        fetchedCount = Number(payload.meta?.replenish?.fetchedCount || 0);
      }

      setItems(nextItems);
      setTotal(nextItems.length);
      setPage(1);
      const motorMessage = motorRan
        ? `Motor acionado. ${fetchedCount} novo(s) card(s) entraram no banco.`
        : "Entregue direto do banco de dados, sem acionar motor.";
      setFeedback(`${nextItems.length} card(s) prontos. ${motorMessage}`);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Não foi possível pesquisar agora.");
    } finally {
      setSearching(false);
    }
  }

  async function runLeadAction(
    lead: RadarLead,
    action: "send" | "hide" | "negative" | "csx",
  ) {
    if (action === "csx") {
      // TODO: integrar endpoint CSX quando o serviço existir no backend.
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
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "sent_to_vendas", companyStatus: "imported_to_vendas" } : item));
        setFeedback("Card enviado para Vendas.");
      }

      if (action === "hide") {
        await apiFetch(`/webscraping/radar/leads/${lead.id}/event`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 15000,
          body: JSON.stringify({ eventType: "hidden", note: "Ocultado no Radar Digital." }),
        });
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "discarded", companyStatus: "discarded" } : item));
        setFeedback("Card marcado como descartado.");
      }

      if (action === "negative") {
        await apiFetch(`/webscraping/radar/${lead.id}/negative`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 15000,
          body: JSON.stringify({ status: "negative", reason: "sem_interesse", privateNotes: "Marcado no Radar Digital." }),
        });
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "negative", companyStatus: "negative" } : item));
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

  async function sendFilteredToVendas() {
    if (!items.length) {
      setFeedback(null);
      setError("Pesquise primeiro. Depois envie os cards encontrados para Vendas.");
      return;
    }

    setBulkSending(true);
    setError(null);
    setFeedback(null);
    setTelonProgress(12);
    try {
      const selectedItems = items.slice(0, effectiveFilters.quantity);
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
      setItems((current) => current.map((item) => selectedItems.some((selected) => selected.id === item.id) ? { ...item, status: "sent_to_vendas", companyStatus: "imported_to_vendas" } : item));
      setFeedback(imported.message || `${leads.length} lead(s) herdados para Vendas.`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Não foi possível herdar leads para Vendas agora.");
    } finally {
      setBulkSending(false);
    }
  }

  if (hasToken === null || loading && items.length === 0) {
    return (
      <main className="app-shell" aria-hidden="true" />
    );
  }

  if (!hasToken) return null;

  const hasMore = items.length < total;
  const availableSegments = availableFilters.segments || [];

  return (
    <DashboardScaffold
      title="Radar Digital"
      description="Pesquisa sob demanda usando o banco dos motores HBX."
      hideHeader
      showDashboardShortcut={false}
    >
      <section className={styles.shell}>
        <div className={styles.summaryBar}>
          <div>
            <span>Resultado atual</span>
            <strong>{total.toLocaleString("pt-BR")}</strong>
          </div>
          <div>
            <span>Alta oportunidade</span>
            <strong>{highOpportunityCount.toLocaleString("pt-BR")}</strong>
          </div>
          <div>
            <span>Origem</span>
            <strong>Banco ou motor</strong>
          </div>
          {isHbxList ? (
            <div>
              <span>HBX List</span>
              <strong>50 x 3 = 150 cards</strong>
            </div>
          ) : null}
        </div>

        <section className={styles.transferPanel}>
          <div>
            <span>Pesquisa sob demanda</span>
            <strong>Você escolhe o nicho; o backend decide banco ou motor.</strong>
            <p>O Radar consulta o banco primeiro. Se faltar card, aciona o motor escolhido e grava o resultado para o estoque HBX.</p>
          </div>
          <div className={styles.transferActions}>
            <button
              type="button"
              onClick={() => void runRadarSearch()}
              disabled={searching || !canSearchRadar}
              title={!canSearchRadar ? "Escolha estado, cidade e segmento antes de pesquisar." : undefined}
            >
              {searching ? "Pesquisando..." : "Pesquisar agora"}
            </button>
            <button
              type="button"
              data-variant="secondary"
              onClick={() => void sendFilteredToVendas()}
              disabled={bulkSending || !items.length}
              title={!items.length ? "Pesquise primeiro para escolher o que vai para Vendas." : undefined}
            >
              {bulkSending ? "Enviando..." : "Enviar resultado para Vendas"}
            </button>
          </div>
        </section>

        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            void runRadarSearch();
          }}
        >
          <div className={styles.filterLocation}>
            <HbxStateCityPicker
              state={filters.state}
              city={filters.city}
              onStateChange={(value) => setFilters((current) => ({ ...current, state: value, city: "" }))}
              onCityChange={(value) => setFilters((current) => ({ ...current, city: value }))}
              requiredCity
              helperText="Todos os estados e cidades oficiais estão disponíveis."
            />
          </div>
          <div className={styles.filterSegment}>
            <HbxSegmentCombobox
              value={filters.segment}
              onChange={(value) => setFilters((current) => ({ ...current, segment: value }))}
              suggestions={availableSegments.length ? availableSegments.map((item) => item.value) : undefined}
              placeholder="Ex.: odontologia, oficina mecânica, energia solar"
              helperText="Digite livremente ou escolha um segmento sugerido."
            />
          </div>
          <div className={styles.filterEngine}>
            <HbxQuantitySelector
              value={filters.quantity}
              onChange={(value) => setFilters((current) => ({ ...current, quantity: value }))}
              options={isHbxList ? [10, 20, 40, 50] : [10, 20, 40, 60, 100]}
              limitLabel="Quantidade"
              helperText={isHbxList ? "HBX List: limite visual de 50 cards por pesquisa, 3 pesquisas e total 150 cards." : "Quantidade desejada para esta pesquisa."}
            />
          </div>
          <div className={styles.filterEngine}>
            <HbxEngineSelector
              value={filters.engine}
              onChange={(value) => setFilters((current) => ({ ...current, engine: value }))}
              showDescription={false}
            />
          </div>
          <div className={styles.filterTarget}>
            <HbxTargetTypeSelector
              value={filters.targetType}
              onChange={(value) => setFilters((current) => ({ ...current, targetType: value }))}
              allowedTypes={["pj", "pf", "both"]}
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
            <button type="submit" disabled={searching || !canSearchRadar}>
              {searching ? "Pesquisando..." : "Pesquisar"}
            </button>
            <button type="button" onClick={clearFilters}>Limpar</button>
          </div>
        </form>

        {!loading && items.length === 0 ? (
          <div className={styles.emptyState}>
            <span aria-hidden="true">RD</span>
            <strong>Sem cards disponíveis ainda.</strong>
            <p>Pesquise um nicho para consultar o banco ou acionar um motor.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {items.map((lead) => {
              const score = Math.max(0, Math.min(100, Math.trunc(Number(lead.opportunityScore || 0))));
              const isHigh = score >= 70;
              const origin = [lead.sourceEngine, lead.source, ...(lead.sourceEngines || [])].filter(Boolean)[0] || "Banco dos Motores HBX";
              const status = lead.companyStatus || lead.status;
              return (
                <article key={lead.id} className={styles.card} data-high={isHigh ? "true" : "false"}>
                  <div className={styles.cardHeader}>
                    <div>
                      <span>{lead.segment || "Segmento aberto"}</span>
                      <strong>{lead.name || "Empresa sem nome"}</strong>
                    </div>
                    <div className={styles.score} style={{ ["--score" as string]: `${score}%` }}>
                      <b>{score}</b>
                      <small>{opportunityLabel(score)}</small>
                    </div>
                  </div>

                  <div className={styles.metaGrid}>
                    <span><b>WhatsApp</b>{formatPhone(lead.phone || lead.phoneDigits)}</span>
                    <span><b>Cidade/UF</b>{[lead.city, lead.state].filter(Boolean).join(" / ") || "Não informado"}</span>
                    <span><b>Website</b>{websiteLabel(lead.websiteStatus)}</span>
                    <span><b>Origem</b>{origin}</span>
                    <span><b>Status</b>{statusLabel(status)}</span>
                    <span><b>DDD</b>{lead.ddd || "Não identificado"}</span>
                  </div>

                  {lead.opportunityReason ? <p className={styles.reason}>{lead.opportunityReason}</p> : null}

                  <div className={styles.history}>
                    {(lead.historySummary || []).length ? (
                      (lead.historySummary || []).slice(0, 3).map((event) => (
                        <span key={event.id || `${lead.id}:${event.eventType}:${event.createdAt}`}>
                          {eventLabel(event.eventType)}
                          {event.createdAt ? <small>{formatDate(event.createdAt)}</small> : null}
                        </span>
                      ))
                    ) : (
                      <span>Recebido do banco dos motores <small>{formatDate(lead.lastSeenAt || lead.firstSeenAt)}</small></span>
                    )}
                  </div>

                  <div className={styles.actions}>
                    <button type="button" onClick={() => void runLeadAction(lead, "send")} disabled={Boolean(actionId)}>
                      Enviar para Vendas
                    </button>
                    <button type="button" onClick={() => void runLeadAction(lead, "csx")} disabled={Boolean(actionId)}>
                      Criar registro no CSX
                    </button>
                    <button type="button" onClick={() => void runLeadAction(lead, "hide")} disabled={Boolean(actionId)}>
                      Ocultar
                    </button>
                    <button type="button" data-danger="true" onClick={() => void runLeadAction(lead, "negative")} disabled={Boolean(actionId)}>
                      Marcar negativo
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
              {loadingMore ? "Carregando..." : "Carregar mais"}
            </button>
          </div>
        ) : null}
      </section>
    </DashboardScaffold>
  );
}
