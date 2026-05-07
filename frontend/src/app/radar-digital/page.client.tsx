"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import {
  HbxAdvancedFilters,
  type HbxAdvancedFiltersValue,
} from "@/components/prospecting-filters";
import { apiFetch } from "@/app/_lib/api";
import { useRequireModule } from "@/app/_lib/useRequireModule";
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
  ddd: string;
  scoreRange: string;
  noWebsite: boolean;
  highOpportunity: boolean;
  status: string;
};

const PAGE_SIZE = 24;

const DEFAULT_FILTERS: FilterState = {
  state: "",
  city: "",
  segment: "",
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
  if (filters.ddd.trim()) params.set("ddd", filters.ddd.replace(/\D/g, "").slice(0, 2));
  if (filters.scoreRange) params.set("scoreRange", filters.scoreRange);
  if (filters.status) params.set("status", filters.status);
  if (filters.noWebsite) params.set("noWebsite", "true");
  if (filters.highOpportunity) params.set("highOpportunity", "true");
  return params.toString();
}

export default function RadarDigitalClientPage() {
  const hasToken = useRequireModule("webscraping");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [items, setItems] = useState<RadarLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
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
    void loadCards(1, false);
  }, [hasToken, loadCards]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function applyFilters() {
    setAppliedFilters(filters);
  }

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
    setBulkSending(true);
    setError(null);
    try {
      const payload = await apiFetch<RadarPullResponse>("/webscraping/radar/pull", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 30000,
        body: JSON.stringify({
          ...appliedFilters,
          quantity: 100,
          minimumStock: 20,
          desiredStock: 100,
        }),
      });
      const leads = (payload.items || []).slice(0, 100).map(buildVendasLeadPayload);
      if (!leads.length) {
        setFeedback("Nenhum lead elegível encontrado para estes filtros.");
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
        body: JSON.stringify({ leadIds: (payload.items || []).slice(0, 100).map((lead) => lead.id) }),
      }).catch(() => null);
      await loadCards(1, false);
      setFeedback(imported.message || `${leads.length} lead(s) herdados para Vendas.`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Não foi possível herdar leads para Vendas agora.");
    } finally {
      setBulkSending(false);
    }
  }

  if (hasToken === null || loading && items.length === 0) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando Radar Digital...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  const hasMore = items.length < total;
  const availableStates = availableFilters.states || [];
  const availableSegments = availableFilters.segments || [];
  const availableCitiesForState = filters.state
    ? availableFilters.citiesByState?.[filters.state] || []
    : [];

  return (
    <DashboardScaffold
      title="Radar Digital"
      description="Cards abastecidos automaticamente pela Massa de Dados HBX."
      showDashboardShortcut
    >
      <section className={styles.shell}>
        <div className={styles.summaryBar}>
          <div>
            <span>Cards disponíveis</span>
            <strong>{total.toLocaleString("pt-BR")}</strong>
          </div>
          <div>
            <span>Alta oportunidade</span>
            <strong>{highOpportunityCount.toLocaleString("pt-BR")}</strong>
          </div>
          <div>
            <span>Origem</span>
            <strong>Massa de Dados HBX</strong>
          </div>
        </div>

        <section className={styles.transferPanel}>
          <div>
            <span>Radar para Vendas</span>
            <strong>Herdar leads com os filtros atuais</strong>
            <p>Envia no máximo 100 contatos elegíveis por operação. Negativos, bloqueados e opt-out permanecem protegidos no Radar.</p>
          </div>
          <button type="button" onClick={() => void sendFilteredToVendas()} disabled={bulkSending}>
            {bulkSending ? "Herdando..." : "Herdar até 100 para Vendas"}
          </button>
        </section>

        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
        >
          <div className={styles.filterWide}>
            <div className={styles.locationFilters}>
              <label>
                <span>Estado</span>
                <select
                  value={filters.state}
                  onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value, city: "" }))}
                >
                  <option value="">Todos os estados disponíveis</option>
                  {availableStates.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label} ({item.count})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Cidade</span>
                <select
                  value={filters.city}
                  onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
                  disabled={!filters.state}
                >
                  <option value="">{filters.state ? "Todas as cidades disponíveis" : "Escolha um estado disponível"}</option>
                  {availableCitiesForState.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label} ({item.count})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <label>
            <span>Segmento</span>
            <select
              value={filters.segment}
              onChange={(event) => setFilters((current) => ({ ...current, segment: event.target.value }))}
            >
              <option value="">Todos os segmentos disponíveis</option>
              {availableSegments.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} ({item.count})
                </option>
              ))}
            </select>
          </label>
          <div className={styles.filterWide}>
            <HbxAdvancedFilters
              mode="radar"
              filters={filters}
              onChange={updateAdvancedFilters}
            />
          </div>
          <div className={styles.filterActions}>
            <button type="submit">Aplicar filtros</button>
            <button type="button" onClick={clearFilters}>Limpar</button>
          </div>
        </form>

        {error ? <div className={styles.notice} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.notice} data-tone="ok">{feedback}</div> : null}

        {!loading && items.length === 0 ? (
          <div className={styles.emptyState}>
            <span aria-hidden="true">RD</span>
            <strong>Sem cards disponíveis ainda.</strong>
            <p>A Massa de Dados MASTER ainda está abastecendo esse filtro.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {items.map((lead) => {
              const score = Math.max(0, Math.min(100, Math.trunc(Number(lead.opportunityScore || 0))));
              const isHigh = score >= 70;
              const origin = [lead.sourceEngine, lead.source, ...(lead.sourceEngines || [])].filter(Boolean)[0] || "Massa de Dados HBX";
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
                      <span>Recebido da Massa de Dados <small>{formatDate(lead.lastSeenAt || lead.firstSeenAt)}</small></span>
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
