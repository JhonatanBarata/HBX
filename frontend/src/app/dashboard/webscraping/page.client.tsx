"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const QUANTITY_OPTIONS = [5, 10, 15, 20];

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
  reviews: number;
  address: string;
  website: string;
};

type SearchResponse = {
  query: {
    city: string;
    segment: string;
    quantity: number;
    filters: SearchFilters;
  };
  meta: {
    historyId: string | null;
    source: "history" | "google" | "hybrid" | "global_cache";
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
  return [
    `Oi, tudo bem? Aqui é ${safeSpeaker} da ${safeCompany}.`,
    `Vi a ${result.name} em ${city} e trabalho com solução para ${segment.toLowerCase()}.`,
    "Posso te explicar em 1 minuto e ver se faz sentido para vocês?",
  ].join(" ");
}

function buildWhatsAppUrl(result: SearchResult, scriptText: string) {
  const digits = normalizePhoneDigits(result.phoneDigits || result.phone);
  if (!digits) return "";
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
  return "google";
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
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("Lanchonetes");
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

  const runtimeReady = runtime?.native.status === "online";
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
  const crmPreviewSummary = useMemo(() => {
    const items = Object.values(crmPreviewByPhone);
    return {
      existing: items.filter((item) => item.existsInCrm).length,
      previousContact: items.filter((item) => item.signals?.hadPreviousContact).length,
      previouslyClosed: items.filter((item) => item.signals?.wasClosedBefore).length,
    };
  }, [crmPreviewByPhone]);
  const scriptGuidePreview = useMemo(() => {
    const previewResult: SearchResult = {
      name: results[0]?.name || "Big Hugo Lanchonete",
      phone: "",
      phoneDigits: "",
      rating: null,
      reviews: 0,
      address: "",
      website: "",
    };
    return buildScriptText(
      previewResult,
      (activeQuery?.city || city || "Rio Claro").trim(),
      (activeQuery?.segment || segment || "Lanchonetes").trim(),
      appliedScriptSender || defaultScriptVariables.speaker,
      appliedScriptCompany || defaultScriptVariables.company,
    );
  }, [
    activeQuery?.city,
    activeQuery?.segment,
    appliedScriptCompany,
    appliedScriptSender,
    city,
    defaultScriptVariables.company,
    defaultScriptVariables.speaker,
    results,
    segment,
  ]);

  function openVendasDashboard() {
    crmLaunchNotice.clear();
    router.push("/dashboard/vendas");
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
    const query = activeQuery || (city.trim() && segment.trim() ? { city, segment } : null);
    if (!results.length || !query) {
      setCrmPreviewByPhone({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const payload = await apiFetch<CrmPreviewResponse>("/vendas/import/webscraping/preview", {
          method: "POST",
          body: JSON.stringify({
            sourceHistoryId: searchMeta?.historyId || undefined,
            leads: results.map((result) => ({
              name: result.name,
              phone: result.phone,
              phoneDigits: result.phoneDigits,
              city: query.city,
              segment: query.segment,
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
  }, [activeQuery, city, results, searchMeta?.historyId, segment]);

  useEffect(() => {
    const fallbackSender = String(currentUser?.email || "").trim();
    setScriptSenderDraft("");
    setScriptCompanyDraft(defaultScriptVariables.company);
    setAppliedScriptSender(fallbackSender);
    setAppliedScriptCompany(defaultScriptVariables.company);
  }, [currentUser?.email, defaultScriptVariables.company]);

  function buildPayload() {
    return {
      city: city.trim(),
      segment: segment.trim(),
      quantity,
      minRating: minRating ? Number(minRating) : undefined,
      minReviews: minReviews ? Number(minReviews) : undefined,
      onlyWithWebsite,
    };
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

    if (!segment.trim()) {
      setSearchError("Informe o segmento.");
      return;
    }

    setSearching(true);
    try {
      const payload = await apiFetch<SearchResponse>("/webscraping/search", {
        method: "POST",
        body: JSON.stringify({ ...buildPayload(), city: selectedCity }),
      });
      setResults(payload.results || []);
      setActiveQuery(payload.query);
      setSearchMeta(payload.meta);
      setHasSearched(true);
      await refreshHistory();
      // persist last city/segment locally for quicker re-entry
      try {
        localStorage.setItem("webscraping.lastCity", String(payload.query.city || city || ""));
        const seg = String(payload.query.segment || segment || "");
        localStorage.setItem("webscraping.lastSegment", seg);
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      setResults([]);
      setActiveQuery(null);
      setSearchMeta(null);
      setHasSearched(true);
      setSearchError(error instanceof Error ? error.message : "Falha ao buscar contatos.");
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
      // respect known segments and custom ones
      setSegment(payload.query.segment);
      setQuantity(payload.query.quantity);
      setMinRating(payload.query.filters.minRating == null ? "" : String(payload.query.filters.minRating));
      setMinReviews(payload.query.filters.minReviews == null ? "" : String(payload.query.filters.minReviews));
      setOnlyWithWebsite(Boolean(payload.query.filters.onlyWithWebsite));
      setResults(payload.results || []);
      setActiveQuery(payload.query);
      setSearchMeta(payload.meta);
      setHasSearched(true);
      setFeedback(`Pesquisa reaproveitada: ${payload.query.segment} em ${payload.query.city}.`);
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
      segment,
      quantity,
      filters: {
        minRating: minRating ? Number(minRating) : null,
        minReviews: minReviews ? Number(minReviews) : null,
        onlyWithWebsite,
      },
    };

    if (!query.city.trim() || !query.segment.trim()) {
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
      await downloadExcel({
        city: query.city,
        segment: query.segment,
        quantity: query.quantity,
        minRating: query.filters.minRating ?? undefined,
        minReviews: query.filters.minReviews ?? undefined,
        onlyWithWebsite: query.filters.onlyWithWebsite,
      });
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
      segment,
    };

    if (!results.length || !query.city.trim() || !query.segment.trim()) {
      setSearchError("Faça uma busca antes de enviar leads para Vendas.");
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
          leads: results.map((result) => ({
            name: result.name,
            phone: result.phone,
            phoneDigits: result.phoneDigits,
            address: result.address,
            website: result.website,
            rating: result.rating,
            reviews: result.reviews,
            city: query.city,
            segment: query.segment,
            scriptText: buildScriptText(
              result,
              query.city,
              query.segment,
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

        <section className={styles.runtimeVisionCard}>
          <div className={styles.runtimeHeader}>
            <article className={styles.runtimeVisionMetric}>
              <span className={styles.runtimeVisionLabel}>Pesquisas Restantes na API</span>
              <strong className={styles.runtimeVisionValue}>{remainingSearchesLabel}</strong>
            </article>
            <article
              className={styles.runtimeVisionMetric}
              data-online={runtimeReady && !configurationPending ? "true" : "false"}
            >
              <span className={styles.runtimeVisionLabel}>Motor</span>
              <strong className={styles.runtimeVisionValue}>
                {runtimeReady && !configurationPending ? "Online" : "Offline"}
              </strong>
            </article>
          </div>

          <div className={styles.glassTabs}>
            <button
              type="button"
              className={panelMode === "search" ? styles.glassTabActive : styles.glassTab}
              onClick={() => setPanelMode("search")}
            >
              Consulta principal
            </button>
            <button
              type="button"
              className={panelMode === "script" ? styles.glassTabActive : styles.glassTab}
              onClick={() => setPanelMode("script")}
            >
              Guia de roteiro
            </button>
            <button
              type="button"
              className={panelMode === "history" ? styles.glassTabActive : styles.glassTab}
              onClick={() => setPanelMode("history")}
            >
              Pesquisas recentes
            </button>
          </div>
        </section>

        {panelMode === "search" ? (
          <section className={styles.searchCard}>
            <div className={styles.searchTop}>
              <div>
                <strong>Consulta principal</strong>
                <p className={styles.helperText}>Cidade, segmento e quantidade. O resto fica compacto.</p>
              </div>
              <div className={styles.segmentChips}>
                {SEGMENT_SUGGESTIONS.map((option) => (
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

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="webscraping-city">
                  Cidade
                </label>
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
                  placeholder="Digite e selecione: Rio Claro - SP"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={shouldShowCitySuggestions}
                  aria-controls="webscraping-city-suggestions"
                />
                {shouldShowCitySuggestions ? (
                  <div
                    id="webscraping-city-suggestions"
                    className={styles.citySuggestions}
                    role="listbox"
                  >
                    {citySuggestionItems.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={styles.citySuggestion}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setCity(option);
                          setCitySuggestionsOpen(false);
                        }}
                        role="option"
                        aria-selected={option === cityExactOption}
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

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Segmento / tipo de negocio</span>
                <input
                  className={styles.fieldInput}
                  value={segment}
                  onChange={(event) => setSegment(event.target.value)}
                  placeholder="Ex: Clinicas odontologicas"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Quantidade</span>
                <select
                  className={styles.fieldSelect}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                >
                  {QUANTITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} contatos
                    </option>
                  ))}
                </select>
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
                </div>
              ) : null}
            </div>

            <div className={styles.searchActions}>
              <p className={styles.helperText}>
                Primeiro reaproveita histórico global. Só depois gasta API.
              </p>
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={`${styles.glassButton} ${styles.glassButtonPrimary}`}
                  onClick={() => void handleSearch()}
                  disabled={loadingBootstrap || searching}
                >
                  {searching ? "Buscando..." : "Buscar contatos"}
                </button>
                <button
                  type="button"
                  className={styles.glassButton}
                  onClick={() => void handleExport()}
                  disabled={exporting || searching || (!activeQuery && !results.length && !city.trim())}
                >
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
                <strong>Guia do roteiro</strong>
                <p className={styles.helperText}>
                  O nome nao vem preenchido. Você controla o que vai herdar para Vendas.
                </p>
              </div>
            </div>

            <div className={styles.scriptGuideGrid}>
              <div className={styles.scriptGuidePreview}>
                <span className={styles.scriptLabel}>Prévia</span>
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
                    Atualizar roteiro
                  </button>
                  <button type="button" className={styles.glassButton} onClick={handleResetScriptPreset}>
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
                <strong>Pesquisas recentes</strong>
                <p className={styles.helperText}>Histórico completo, incluindo reaproveitamento global entre empresas.</p>
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
                          <h2 className={styles.historyTitle}>{item.segment}</h2>
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

        {!searching && results.length > 0 ? (
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
              disabled={importingToVendas || !results.length}
            >
              {importingToVendas ? "Enviando..." : `Enviar ${results.length} lead(s) ao CRM`}
            </button>
          </section>
        ) : null}

        <section ref={resultsRef} className={styles.resultsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <strong>Resultados</strong>
              <p className={styles.helperText}>
                {searchMeta && activeQuery
                  ? `${results.length} contatos para ${activeQuery.segment} em ${activeQuery.city}. Fonte: ${searchSourceLabel(searchMeta.source)}.`
                  : "Os contatos qualificados vao aparecer aqui com acoes rapidas e roteiro pronto."}
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
                  disabled={importingToVendas || !results.length}
                >
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

          {!searching && results.length === 0 && !hasSearched ? (
            <div className={styles.emptyState}>
              <strong>Pronto para sua proxima busca</strong>
              <p className={styles.emptyText}>Informe cidade, segmento e quantidade para carregar os primeiros contatos deduplicados.</p>
            </div>
          ) : null}

          {!searching && results.length > 0 ? (
            <div className={styles.resultsGrid}>
              {results.map((result) => {
                const queryCity = activeQuery?.city || city;
                const querySegment = activeQuery?.segment || segment;
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
                          Nota {result.rating ?? "-"} • {result.reviews} avaliacoes
                        </span>
                      </div>
                    }
                    actions={
                      <div className={glassCardStyles.cluster}>
                        <a className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`} href={whatsappUrl || undefined} target="_blank" rel="noreferrer">
                          WhatsApp
                        </a>
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
                          <strong className={glassCardStyles.metricValue}>{result.reviews}</strong>
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

        <PremiumLaunchDialog notice={crmLaunchNotice.notice} onOpen={crmLaunchNotice.openNow} />
      </div>
    </DashboardScaffold>
  );
}
