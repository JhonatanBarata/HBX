"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
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
  onlyProbableWhatsApp: boolean;
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
  probableWhatsApp: boolean;
  rating: number | null;
  reviews: number;
  address: string;
  website: string;
  googleMapsUrl: string;
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
};

type HistoryResponse = {
  items: SearchHistoryItem[];
};

type ImportToVendasResponse = {
  ok: boolean;
  createdCount: number;
  updatedCount: number;
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

function buildCompanyName(currentUser: CurrentUser | null) {
  return String(
    (currentUser?.masterContext?.active
      ? currentUser.masterContext.companyName
      : currentUser?.company?.name) || currentUser?.company?.name || "",
  ).trim();
}

function buildSpeakerName(currentUser: CurrentUser | null) {
  return String(currentUser?.name || currentUser?.username || "").trim();
}

function buildDefaultScriptVariables(currentUser: CurrentUser | null) {
  return {
    speaker: buildSpeakerName(currentUser) || "Julia",
    company: buildCompanyName(currentUser) || "HBX",
  };
}

function buildScriptText(result: SearchResult, city: string, segment: string, speaker: string, company: string) {
  const safeSpeaker = speaker.trim() || "[SEU NOME]";
  const safeCompany = company.trim() || "[SUA EMPRESA]";
  return [
    `Oi, tudo bem? Aqui e ${safeSpeaker} da ${safeCompany}.`,
    `Vi a ${result.name} em ${city} e trabalho com solucao para ${segment.toLowerCase()}.`,
    "Posso te explicar em 1 minuto e ver se faz sentido para voces?",
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
  if (filters.onlyProbableWhatsApp) parts.push("WhatsApp provavel");
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
  const hasToken = useRequireAuth();
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>([]);
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("Lanchonetes");
  const [customSegment, setCustomSegment] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [minRating, setMinRating] = useState("");
  const [minReviews, setMinReviews] = useState("");
  const [onlyProbableWhatsApp, setOnlyProbableWhatsApp] = useState(false);
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
  const [scriptSenderDraft, setScriptSenderDraft] = useState("");
  const [scriptCompanyDraft, setScriptCompanyDraft] = useState("");
  const [appliedScriptSender, setAppliedScriptSender] = useState("");
  const [appliedScriptCompany, setAppliedScriptCompany] = useState("");
  const [scriptPresetHydrated, setScriptPresetHydrated] = useState(false);
  const [scriptPresetDraft, setScriptPresetDraft] = useState("");
  const [scriptPresetText, setScriptPresetText] = useState<string | null>(null);

  const canSeeDiagnostics = useMemo(
    () => Boolean(currentUser?.isSystemMaster) || String(currentUser?.role || "").toUpperCase() === "ADMIN",
    [currentUser?.isSystemMaster, currentUser?.role],
  );
  const runtimeReady = runtime?.native.status === "online";
  const configurationPending = runtime?.native.code === "configuration_pending";
  const defaultScriptVariables = useMemo(() => buildDefaultScriptVariables(currentUser), [currentUser]);
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
      probableWhatsApp: true,
      rating: null,
      reviews: 0,
      address: "",
      website: "",
      googleMapsUrl: "",
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

  useEffect(() => {
    if (hasToken !== true) return;

    let cancelled = false;

    (async () => {
      setLoadingBootstrap(true);
      try {
        const [runtimePayload, profilePayload, historyPayload] = await Promise.all([
          apiFetch<RuntimeResponse>("/webscraping/runtime"),
          apiFetch<CurrentUser>("/profile/current-user"),
          apiFetch<HistoryResponse>("/webscraping/history?limit=8"),
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
            if (SEGMENT_SUGGESTIONS.includes(String(lastSegment))) {
              setSegment(String(lastSegment));
              setCustomSegment("");
            } else {
              setSegment("Outros");
              setCustomSegment(String(lastSegment));
            }
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

  // load script preset (try backend, fallback to localStorage)
  useEffect(() => {
    if (!hasToken) return;
    if (scriptPresetHydrated) return;

    let cancelled = false;
    (async () => {
      try {
        const payload = await apiFetch<{ text?: string }>("/webscraping/script-preset");
        if (cancelled) return;
        const text = String(payload?.text || "").trim();
        if (text) {
          setScriptPresetText(text);
          setScriptPresetDraft(text);
        } else {
          const fallback = localStorage.getItem("webscraping.scriptPreset") || "";
          if (fallback) {
            setScriptPresetText(fallback);
            setScriptPresetDraft(fallback);
          } else {
            setScriptPresetText(null);
            setScriptPresetDraft("");
          }
        }
      } catch {
        const fallback = localStorage.getItem("webscraping.scriptPreset") || "";
        if (!cancelled) {
          setScriptPresetText(fallback || null);
          setScriptPresetDraft(fallback || "");
        }
      } finally {
        if (!cancelled) setScriptPresetHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasToken, scriptPresetHydrated]);

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
    if (scriptPresetHydrated) return;
    setScriptSenderDraft(defaultScriptVariables.speaker);
    setScriptCompanyDraft(defaultScriptVariables.company);
    setAppliedScriptSender(defaultScriptVariables.speaker);
    setAppliedScriptCompany(defaultScriptVariables.company);
    setScriptPresetHydrated(true);
  }, [defaultScriptVariables.company, defaultScriptVariables.speaker, scriptPresetHydrated]);

  function buildPayload() {
    const effectiveSegment = segment === "Outros" ? customSegment.trim() : segment.trim();
    return {
      city: city.trim(),
      segment: effectiveSegment,
      quantity,
      minRating: minRating ? Number(minRating) : undefined,
      minReviews: minReviews ? Number(minReviews) : undefined,
      onlyProbableWhatsApp,
      onlyWithWebsite,
    };
  }

  async function refreshHistory() {
    try {
      const payload = await apiFetch<HistoryResponse>("/webscraping/history?limit=8");
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

    if (!segment.trim()) {
      setSearchError("Informe o segmento.");
      return;
    }

    setSearching(true);
    try {
      const payload = await apiFetch<SearchResponse>("/webscraping/search", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      setResults(payload.results || []);
      setActiveQuery(payload.query);
      setSearchMeta(payload.meta);
      setHasSearched(true);
      await refreshHistory();
      // persist last city/segment locally for quicker re-entry
      try {
        localStorage.setItem("webscraping.lastCity", String(payload.query.city || city || ""));
        const seg = String(payload.query.segment || (segment === "Outros" ? customSegment : segment) || "");
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
      if (SEGMENT_SUGGESTIONS.includes(String(payload.query.segment))) {
        setSegment(payload.query.segment);
        setCustomSegment("");
      } else {
        setSegment("Outros");
        setCustomSegment(payload.query.segment);
      }
      setQuantity(payload.query.quantity);
      setMinRating(payload.query.filters.minRating == null ? "" : String(payload.query.filters.minRating));
      setMinReviews(payload.query.filters.minReviews == null ? "" : String(payload.query.filters.minReviews));
      setOnlyProbableWhatsApp(Boolean(payload.query.filters.onlyProbableWhatsApp));
      setOnlyWithWebsite(Boolean(payload.query.filters.onlyWithWebsite));
      setResults(payload.results || []);
      setActiveQuery(payload.query);
      setSearchMeta(payload.meta);
      setHasSearched(true);
      setFeedback(`Pesquisa reaproveitada: ${payload.query.segment} em ${payload.query.city}.`);
      await refreshHistory();
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao reaproveitar pesquisa.");
    } finally {
      setHistoryBusyId(null);
    }
  }

  async function saveScriptPreset() {
    const text = String(scriptPresetDraft || "").trim();
    try {
      // try backend first
      await apiFetch("/webscraping/script-preset", {
        method: "PUT",
        body: JSON.stringify({ text }),
      });
      setScriptPresetText(text || null);
      setFeedback("Roteiro salvo no servidor.");
      try {
        localStorage.setItem("webscraping.scriptPreset", text);
      } catch {
        // ignore
      }
    } catch {
      // fallback to localStorage only
      try {
        localStorage.setItem("webscraping.scriptPreset", text);
        setScriptPresetText(text || null);
        setFeedback("Roteiro salvo localmente (fallback).");
      } catch {
        setFeedback("Falha ao salvar roteiro.");
      }
    }
  }

  async function resetScriptPreset() {
    const defaultText = "";
    setScriptPresetDraft(defaultText);
    try {
      await apiFetch("/webscraping/script-preset", {
        method: "PUT",
        body: JSON.stringify({ text: defaultText }),
      });
      setScriptPresetText(defaultText || null);
      setFeedback("Roteiro resetado no servidor.");
      try {
        localStorage.removeItem("webscraping.scriptPreset");
      } catch {
        // ignore
      }
    } catch {
      try {
        localStorage.removeItem("webscraping.scriptPreset");
        setScriptPresetText(null);
        setFeedback("Roteiro resetado localmente.");
      } catch {
        setFeedback("Falha ao resetar roteiro.");
      }
    }
  }

  async function handleExport() {
    const query = activeQuery || {
      city,
      segment,
      quantity,
      filters: {
        minRating: minRating ? Number(minRating) : null,
        minReviews: minReviews ? Number(minReviews) : null,
        onlyProbableWhatsApp,
        onlyWithWebsite,
      },
    };

    if (!query.city.trim() || !query.segment.trim()) {
      setSearchError("Preencha cidade e segmento antes de exportar.");
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
        onlyProbableWhatsApp: query.filters.onlyProbableWhatsApp,
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
            city: query.city,
            segment: query.segment,
            shortNote: [result.address, `Nota ${result.rating ?? "-"}`, `${result.reviews} avaliações`]
              .filter(Boolean)
              .join(" • "),
          })),
        }),
      });
      setFeedback(payload.message || "Leads enviados para o CRM de Vendas.");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Falha ao enviar leads para Vendas.");
    } finally {
      setImportingToVendas(false);
    }
  }

  function handleApplyScriptPreset() {
    const nextSender = scriptSenderDraft.trim() || defaultScriptVariables.speaker;
    const nextCompany = scriptCompanyDraft.trim() || defaultScriptVariables.company;
    setAppliedScriptSender(nextSender);
    setAppliedScriptCompany(nextCompany);
    setFeedback("Roteiro atualizado para todos os contatos carregados.");
  }

  function handleResetScriptPreset() {
    setScriptSenderDraft(defaultScriptVariables.speaker);
    setScriptCompanyDraft(defaultScriptVariables.company);
    setAppliedScriptSender(defaultScriptVariables.speaker);
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
    <DashboardScaffold
      title="Prospeccao"
      description="Prospecao local nativa, com historico persistente e exportacao direta para Excel."
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>HBX prospeccao local</span>
            <h1 className={styles.heroTitle}>Cidade e segmento primeiro. O resto entra para acelerar.</h1>
            <p className={styles.heroText}>
              Busque contatos operacionais, reaproveite pesquisas recentes e exporte uma planilha pronta para abordagem.
            </p>
          </div>

          <div className={styles.heroStats}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Motor</span>
              <strong className={styles.metricValue}>Nativo HBX</strong>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Historico</span>
              <strong className={styles.metricValue}>{historyItems.length} pesquisas recentes</strong>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Roteiro</span>
              <strong className={styles.metricValue}>{buildCompanyName(currentUser) || "Personalizado"}</strong>
            </div>
          </div>
        </section>

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

        {!loadingBootstrap && configurationPending ? (
          <section className={styles.statusCard}>
            <div>
              <strong className={styles.statusTitle}>Modulo temporariamente em configuracao</strong>
              <p className={styles.statusText}>
                A interface segue disponivel para consulta do historico e o restante da experiencia permanece limpo enquanto a configuracao final e concluida.
              </p>
            </div>
            <span className={styles.statusPill}>Configuracao em andamento</span>
          </section>
        ) : null}

        {pageError ? (
          <section className={styles.errorCard}>
            <strong className={styles.statusTitle}>Nao foi possivel carregar o modulo</strong>
            <p className={styles.statusText}>{pageError}</p>
          </section>
        ) : null}

        {canSeeDiagnostics && runtime?.diagnostics ? (
          <section className={styles.diagnosticCard}>
            <div className={styles.diagnosticHeader}>
              <strong>Diagnostico discreto</strong>
              <span className={styles.diagnosticStamp}>{formatDateTime(runtime.diagnostics.checkedAt)}</span>
            </div>
            <div className={styles.diagnosticGrid}>
              <div>
                <span className={styles.diagnosticLabel}>Nativo</span>
                <p className={styles.diagnosticText}>{runtime.diagnostics.nativeTechnicalMessage}</p>
              </div>
              <div>
                <span className={styles.diagnosticLabel}>Legado interno</span>
                <p className={styles.diagnosticText}>
                  {runtime.diagnostics.legacy
                    ? `${runtime.diagnostics.legacy.status} • ${runtime.diagnostics.legacy.code}`
                    : "Sem diagnostico do legado"}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className={styles.searchCard}>
          <div className={styles.searchTop}>
            <div>
              <strong>Consulta principal</strong>
              <p className={styles.helperText}>A entrada principal continua simples: cidade, tipo de negocio e quantidade.</p>
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
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Cidade</span>
              <input
                className={styles.fieldInput}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Ex: Sao Paulo - SP"
              />
            </label>

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
                    checked={onlyProbableWhatsApp}
                    onChange={(event) => setOnlyProbableWhatsApp(event.target.checked)}
                  />
                  <span>Somente provavel WhatsApp</span>
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
              {configurationPending
                ? "As novas consultas ficam liberadas assim que a configuracao do modulo for concluida."
                : "O modulo prioriza reaproveitamento do historico e so complementa a busca quando realmente precisa."}
            </p>
            <div className={styles.actionRow}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSearch()}
                disabled={loadingBootstrap || searching || configurationPending}
                title={configurationPending ? "Modulo temporariamente em configuracao." : undefined}
              >
                {searching ? "Buscando..." : configurationPending ? "Modulo em configuracao" : "Buscar contatos"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleExport()}
                disabled={exporting || searching || (!activeQuery && !results.length && !city.trim())}
              >
                {exporting ? "Gerando Excel..." : "Exportar Excel"}
              </button>
            </div>
          </div>
        </section>

        <section className={styles.scriptGuideCard}>
          <div className={styles.sectionHeader}>
            <div>
              <strong>Guia do roteiro</strong>
              <p className={styles.helperText}>
                Ajuste o nome e a empresa padrao para atualizar todas as frases carregadas com um clique.
              </p>
            </div>
          </div>

          <div className={styles.scriptGuideGrid}>
            <div className={styles.scriptGuidePreview}>
              <span className={styles.scriptLabel}>Frase padrao</span>
              <p className={styles.scriptText}>{scriptGuidePreview}</p>
            </div>

            <div className={styles.scriptGuideControls}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nome de quem envia</span>
                <input
                  className={styles.fieldInput}
                  value={scriptSenderDraft}
                  onChange={(event) => setScriptSenderDraft(event.target.value)}
                  placeholder="Ex: Pedro"
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
                <button type="button" className="btn btn-primary" onClick={handleApplyScriptPreset}>
                  Atualizar roteiro
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleResetScriptPreset}>
                  Resetar roteiro
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.historyCard}>
          <div className={styles.sectionHeader}>
            <div>
              <strong>Pesquisas recentes</strong>
              <p className={styles.helperText}>Reaproveite uma pesquisa pronta sem refazer trabalho desnecessario.</p>
            </div>
          </div>

          {historyItems.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>Nenhuma pesquisa salva ainda</strong>
              <p className={styles.emptyText}>Assim que voce fizer a primeira busca, ela passa a ficar disponivel aqui para reaproveitamento rapido.</p>
            </div>
          ) : (
            <div className={styles.historyGrid}>
              {historyItems.map((item) => (
                <article key={item.id} className={styles.historyItem}>
                  <div className={styles.historyTop}>
                    <div>
                      <h2 className={styles.historyTitle}>{item.segment}</h2>
                      <p className={styles.historyMeta}>{item.city} • {item.resultCount} contatos</p>
                    </div>
                    <span className={styles.historyStamp}>{formatDateTime(item.lastUsedAt)}</span>
                  </div>
                  <p className={styles.historyFilter}>{buildFilterSummary(item.filters)}</p>
                  <p className={styles.historyPreview}>
                    {item.preview.length > 0 ? item.preview.join(" • ") : "Sem preview salvo"}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void handleReuseHistory(item)}
                    disabled={historyBusyId === item.id}
                  >
                    {historyBusyId === item.id ? "Carregando..." : "Reaproveitar pesquisa"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

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
              className="btn btn-secondary"
              onClick={() => void handleSendResultsToVendas()}
              disabled={importingToVendas || !results.length}
            >
              {importingToVendas ? "Enviando..." : `Enviar ${results.length} lead(s) ao CRM`}
            </button>
          </section>
        ) : null}

        <section className={styles.resultsCard}>
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
                  className="btn btn-secondary"
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
                  <article key={`${result.name}-${result.phoneDigits}`} className={styles.resultCard}>
                    <div className={styles.resultHeader}>
                      <div>
                        <h2 className={styles.resultName}>{result.name || "Empresa sem nome"}</h2>
                        <p className={styles.resultMeta}>{result.address || "Endereco nao informado"}</p>
                        {crmPreview?.existsInCrm ? (
                          <p className={styles.resultMeta}>
                            Já existe no CRM
                            {crmPreview.leadName ? ` • ${crmPreview.leadName}` : ""}
                            {crmPreview.statusLabel ? ` • ${crmPreview.statusLabel}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className={styles.metaPills}>
                        <span className={result.probableWhatsApp ? styles.resultPillOk : styles.resultPill}>
                          {result.probableWhatsApp ? "WhatsApp provavel" : "Contato telefonico"}
                        </span>
                        {crmPreview?.existsInCrm ? (
                          <span className={styles.metaPill}>Já existe</span>
                        ) : null}
                        {crmPreview?.signals?.hadPreviousContact ? (
                          <span className={styles.metaPill}>Já teve contato</span>
                        ) : null}
                        {crmPreview?.signals?.wasClosedBefore ? (
                          <span className={styles.metaPill}>Encerrado antes</span>
                        ) : null}
                        {crmPreview?.sharedProfile?.presence?.atendimento?.present ? (
                          <span className={styles.metaPill}>Em Atendimento</span>
                        ) : null}
                        {crmPreview?.sharedProfile?.presence?.recovery?.present ? (
                          <span className={styles.metaPill}>Em Recovery</span>
                        ) : null}
                        {crmPreview?.sharedProfile?.currentContext &&
                        crmPreview.sharedProfile.currentContext !== "neutro" ? (
                          <span className={styles.metaPill}>
                            Contexto {formatSharedContextLabel(crmPreview.sharedProfile.currentContext)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.phoneRow}>
                      <span className={styles.phoneValue}>{result.phone}</span>
                      <span className={styles.resultMeta}>
                        Nota {result.rating ?? "-"} • {result.reviews} avaliacoes
                      </span>
                    </div>

                    <div className={styles.cardActions}>
                      <a className="btn btn-primary" href={callUrl || undefined}>
                        Ligar
                      </a>
                      <a className="btn btn-secondary" href={whatsappUrl || undefined} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          void copyText(result.phone);
                          setFeedback(`Numero copiado: ${result.phone}`);
                        }}
                      >
                        Copiar numero
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          void copyText(scriptText);
                          setFeedback(`Roteiro copiado para ${result.name}.`);
                        }}
                      >
                        Copiar roteiro
                      </button>
                    </div>

                    <div className={styles.scriptBox}>
                      <span className={styles.scriptLabel}>Roteiro sugerido</span>
                      <p className={styles.scriptText}>{scriptText}</p>
                    </div>

                    {(result.website || result.googleMapsUrl) ? (
                      <div className={styles.resultLinks}>
                        {result.website ? (
                          <a className="btn btn-secondary" href={result.website} target="_blank" rel="noreferrer">
                            Site
                          </a>
                        ) : null}
                        {result.googleMapsUrl ? (
                          <a className="btn btn-secondary" href={result.googleMapsUrl} target="_blank" rel="noreferrer">
                            Maps
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </DashboardScaffold>
  );
}
