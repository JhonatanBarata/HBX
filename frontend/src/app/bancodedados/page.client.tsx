"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type CurrentUser = {
  isSystemMaster?: boolean;
};

type TabId = "pesquisas" | "excluidos" | "reclamacoes" | "distribuicao";
type ComplaintStatus = "new" | "reviewing" | "refunded" | "denied" | "resolved";

type RadarCard = {
  id: string;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  socialStatus?: string | null;
  status?: string | null;
  targetType?: string | null;
  opportunityScore?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  companyStates?: Array<{ companyId?: number | null; status?: string | null; vendasLeadId?: string | null }>;
};

type RadarCardsPayload = {
  items?: RadarCard[];
  total?: number;
  meta?: { available?: boolean; message?: string };
};

type DeletionItem = {
  id: number;
  moduleKey: string;
  entityType: string;
  entityId: string;
  companyId?: number | null;
  motivo?: string | null;
  deletedAt: string;
  company?: { id: number; name: string } | null;
  deletedBy?: { id: number; username?: string | null; email?: string | null } | null;
};

type RadarExcludedCard = {
  id: string;
  companyId?: number | null;
  companyName?: string | null;
  radarLeadId?: string | null;
  status: "discarded" | "complaint" | string;
  reason?: string | null;
  updatedAt?: string | null;
  lead?: {
    name?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    segment?: string | null;
    website?: string | null;
  };
};

type ExclusoesPayload = {
  records?: DeletionItem[];
  radarCards?: RadarExcludedCard[];
  radarSummary?: { total?: number; discarded?: number; complaint?: number };
};

type VendasComplaint = {
  id: string;
  companyId: number;
  companyName: string;
  userName?: string | null;
  userEmail?: string | null;
  leadName?: string | null;
  leadPhone?: string | null;
  leadCity?: string | null;
  leadState?: string | null;
  leadSegment?: string | null;
  reason: string;
  status: ComplaintStatus;
  refundedCards: number;
  internalNote?: string | null;
  createdAt: string;
  contactWhatsappUrl?: string | null;
};

type ComplaintPayload = {
  ok: boolean;
  items?: VendasComplaint[];
  summary?: Record<ComplaintStatus | "total", number>;
};

type HbxTerritoryCity = {
  city: string;
  state: string;
  availableCards?: number;
};

type HbxTerritoryCityBalance = HbxTerritoryCity & {
  normalizedCity?: string;
  assignedSellerCount?: number;
  recommendedSellerCount?: number;
  sellerGap?: number;
  pressureScore?: number;
  coverageStatus?: "uncovered" | "needs_sellers" | "overcovered" | "balanced";
  actionLabel?: string;
};

type HbxTerritorySeller = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  commissionPercent?: number | null;
  inheritedCommissionPercent?: number | null;
  canRegisterHbxSellers?: boolean;
  cities: HbxTerritoryCity[];
  availableCards?: number;
  targetStock?: number;
  currentStock?: number;
  remainingStock?: number;
  distributionStatus?: "unmapped" | "needs_cards" | "full";
};

type HbxTerritoryPanel = {
  ok?: boolean;
  status?: "draft" | "active" | "paused";
  segmentMode?: string;
  territoryMode?: string;
  targetStockPerSeller?: number;
  sellers?: HbxTerritorySeller[];
  citySuggestions?: HbxTerritoryCity[];
  cityBalance?: HbxTerritoryCityBalance[];
  summary?: {
    sellerCount?: number;
    coveredSellerCount?: number;
    fullSellerCount?: number;
    pendingSellerCount?: number;
    unmappedSellerCount?: number;
    cityCount?: number;
    availableCards?: number;
    targetStock?: number;
    currentStock?: number;
    missingCards?: number;
    recommendedSellerSlots?: number;
    assignedCitySlots?: number;
    uncoveredCityCount?: number;
    overloadedCityCount?: number;
    balancedCityCount?: number;
  };
  lastActivatedAt?: string | null;
  lastRunAt?: string | null;
  updatedAt?: string | null;
  message?: string;
};

type HbxTerritoryRunPayload = {
  ok?: boolean;
  message?: string;
  distributedCount?: number;
  failedCount?: number;
  shortageCount?: number;
};

const TABS: Array<{ id: TabId; label: string; description: string }> = [
  { id: "pesquisas", label: "Pesquisas", description: "Cards pesquisados e salvos no banco Radar." },
  { id: "excluidos", label: "Excluídos", description: "Cards removidos, bloqueados ou descartados." },
  { id: "reclamacoes", label: "Reclamações", description: "Cards contestados pelos clientes." },
  { id: "distribuicao", label: "Distribuição HBX", description: "Cidades fixas dos vendedores USERMASTER." },
];

const COMPLAINT_LABELS: Record<ComplaintStatus, string> = {
  new: "Nova",
  reviewing: "Em análise",
  refunded: "Reembolsada",
  denied: "Negada",
  resolved: "Resolvida",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

function metric(value?: number | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString("pt-BR") : "0";
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cardStatus(card: RadarCard) {
  const stateStatus = card.companyStates?.map((item) => item.status).filter(Boolean).join(" ");
  return normalizeText(`${card.status || ""} ${stateStatus || ""}`);
}

function isCompletedCard(card: RadarCard) {
  const status = cardStatus(card);
  return ["sent_to_vendas", "imported_to_vendas", "won", "converted", "completed", "done", "resolved"].some((item) => status.includes(item));
}

export default function BancoDeDadosClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("pesquisas");
  const [loading, setLoading] = useState(false);
  const [busyBatch, setBusyBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<RadarCard[]>([]);
  const [cardsTotal, setCardsTotal] = useState(0);
  const [exclusions, setExclusions] = useState<ExclusoesPayload>({});
  const [complaints, setComplaints] = useState<VendasComplaint[]>([]);
  const [territoryPanel, setTerritoryPanel] = useState<HbxTerritoryPanel | null>(null);
  const [territoryDraft, setTerritoryDraft] = useState<HbxTerritoryPanel | null>(null);
  const [territorySaving, setTerritorySaving] = useState(false);
  const [territoryRunning, setTerritoryRunning] = useState(false);
  const [territoryInput, setTerritoryInput] = useState({ userId: 0, state: "SP", city: "" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cardsPayload, exclusionsPayload, complaintsPayload, territoryPayload] = await Promise.all([
        apiFetch<RadarCardsPayload>("/modules/master/webscraping/database-cards?limit=200&targetType=both", {
          requireAuth: true,
          timeoutMs: 20000,
        }),
        apiFetch<ExclusoesPayload>("/modules/master/exclusoes", {
          requireAuth: true,
          timeoutMs: 20000,
        }),
        apiFetch<ComplaintPayload>("/modules/master/vendas-complaints?limit=200", {
          requireAuth: true,
          timeoutMs: 20000,
        }),
        apiFetch<HbxTerritoryPanel>("/modules/master/webscraping/radar-auto-distribution", {
          requireAuth: true,
          timeoutMs: 20000,
        }),
      ]);
      setCards(cardsPayload?.items || []);
      setCardsTotal(Number(cardsPayload?.total || cardsPayload?.items?.length || 0));
      setExclusions(exclusionsPayload || {});
      setComplaints(complaintsPayload?.items || []);
      setTerritoryPanel(territoryPayload || null);
      setTerritoryDraft(territoryPayload || null);
      const firstSellerId = Number(territoryPayload?.sellers?.[0]?.id || 0);
      setTerritoryInput((current) => ({ ...current, userId: current.userId || firstSellerId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Banco de Dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    let mounted = true;
    async function checkAccessAndLoad() {
      setCheckingAccess(true);
      setError(null);
      try {
        const user = await apiFetch<CurrentUser>("/profile/current-user", { requireAuth: true });
        if (!mounted) return;
        const isMaster = Boolean(user?.isSystemMaster);
        setAllowed(isMaster);
        if (isMaster) await loadAll();
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Falha ao validar acesso MASTER.");
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    }
    void checkAccessAndLoad();
    return () => {
      mounted = false;
    };
  }, [hasToken, loadAll]);

  const filteredCards = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return cards;
    return cards.filter((item) => normalizeText([
      item.name,
      item.phone,
      item.city,
      item.state,
      item.segment,
      item.website,
      item.instagramUrl,
      item.facebookUrl,
      item.status,
    ].join(" ")).includes(term));
  }, [cards, search]);

  const completedCards = useMemo(() => filteredCards.filter(isCompletedCard), [filteredCards]);

  const excludedCards = useMemo(() => {
    const term = normalizeText(search);
    const items = exclusions.radarCards || [];
    const onlyExcluded = items.filter((item) => item.status !== "complaint");
    if (!term) return onlyExcluded;
    return onlyExcluded.filter((item) => normalizeText([
      item.lead?.name,
      item.lead?.phone,
      item.lead?.city,
      item.lead?.state,
      item.lead?.segment,
      item.companyName,
      item.reason,
    ].join(" ")).includes(term));
  }, [exclusions.radarCards, search]);

  const filteredDeletionRecords = useMemo(() => {
    const term = normalizeText(search);
    const items = exclusions.records || [];
    if (!term) return items;
    return items.filter((item) => normalizeText([
      item.moduleKey,
      item.entityType,
      item.entityId,
      item.company?.name,
      item.motivo,
      item.deletedBy?.username,
      item.deletedBy?.email,
    ].join(" ")).includes(term));
  }, [exclusions.records, search]);

  const filteredComplaints = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return complaints;
    return complaints.filter((item) => normalizeText([
      item.leadName,
      item.leadPhone,
      item.leadCity,
      item.leadState,
      item.leadSegment,
      item.companyName,
      item.userName,
      item.userEmail,
      item.reason,
      item.status,
    ].join(" ")).includes(term));
  }, [complaints, search]);

  const territorySellers = territoryDraft?.sellers || [];
  const territorySummary = territoryDraft?.summary || territoryPanel?.summary || {};
  const territoryCityCount = territorySellers.reduce((sum, seller) => sum + seller.cities.length, 0);
  const territoryPotential = territorySellers.reduce((sum, seller) => sum + Number(seller.availableCards || 0), 0);

  const tabCount: Record<TabId, number> = {
    pesquisas: filteredCards.length,
    excluidos: excludedCards.length + filteredDeletionRecords.length,
    reclamacoes: filteredComplaints.length,
    distribuicao: territorySellers.length,
  };

  const activeBatchCount = tabCount[activeTab];

  function updateTerritorySeller(userId: number, updater: (seller: HbxTerritorySeller) => HbxTerritorySeller) {
    setTerritoryDraft((current) => {
      const base = current || territoryPanel;
      if (!base) return current;
      return {
        ...base,
        sellers: (base.sellers || []).map((seller) => seller.id === userId ? updater(seller) : seller),
      };
    });
  }

  function addTerritoryCity(userId: number, cityInput?: HbxTerritoryCity) {
    const city = String(cityInput?.city || territoryInput.city || "").trim();
    const state = String(cityInput?.state || territoryInput.state || "").trim().toUpperCase();
    if (!userId || !city || !state) {
      setError("Escolha vendedor, UF e cidade para fixar o território.");
      return;
    }
    updateTerritorySeller(userId, (seller) => {
      const exists = seller.cities.some((item) => normalizeText(item.city) === normalizeText(city) && String(item.state || "").toUpperCase() === state);
      if (exists) return seller;
      const suggestion = (territoryPanel?.citySuggestions || []).find((item) => normalizeText(item.city) === normalizeText(city) && String(item.state || "").toUpperCase() === state);
      return {
        ...seller,
        cities: [...seller.cities, { city, state, availableCards: suggestion?.availableCards || 0 }],
        availableCards: Number(seller.availableCards || 0) + Number(suggestion?.availableCards || 0),
      };
    });
    setTerritoryInput((current) => ({ ...current, userId, city: "" }));
  }

  function removeTerritoryCity(userId: number, city: HbxTerritoryCity) {
    updateTerritorySeller(userId, (seller) => {
      const nextCities = seller.cities.filter((item) => !(normalizeText(item.city) === normalizeText(city.city) && String(item.state || "").toUpperCase() === String(city.state || "").toUpperCase()));
      return {
        ...seller,
        cities: nextCities,
        availableCards: nextCities.reduce((sum, item) => sum + Number(item.availableCards || 0), 0),
      };
    });
  }

  async function saveTerritories(status: "draft" | "active" = "active") {
    setTerritorySaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<HbxTerritoryPanel>("/modules/master/webscraping/radar-auto-distribution", {
        method: "PUT",
        requireAuth: true,
        timeoutMs: 20000,
        body: JSON.stringify({
          status,
          targetStockPerSeller: territoryDraft?.targetStockPerSeller || 30,
          territories: (territoryDraft?.sellers || []).map((seller) => ({
            userId: seller.id,
            cities: seller.cities.map((city) => ({ city: city.city, state: city.state })),
          })),
        }),
      });
      setTerritoryPanel(payload);
      setTerritoryDraft(payload);
      setFeedback(payload.message || "Distribuição HBX Master salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar distribuição HBX Master.");
    } finally {
      setTerritorySaving(false);
    }
  }

  async function runTerritoriesNow() {
    setTerritoryRunning(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<HbxTerritoryRunPayload>("/modules/master/webscraping/radar-auto-distribution/run", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 60000,
        body: JSON.stringify({ limit: 80 }),
      });
      setFeedback(payload.message || "Robô HBX executado.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alimentar vendedores HBX.");
    } finally {
      setTerritoryRunning(false);
    }
  }

  async function deleteActiveBatch() {
    if (activeTab === "distribuicao") return;
    setBusyBatch(true);
    setError(null);
    setFeedback(null);
    try {
      if (activeTab === "pesquisas") {
        const leadIds = filteredCards.map((item) => item.id).filter(Boolean);
        const payload = await apiFetch<{ affected?: number; searchHistoryPlaces?: number; searchRunItems?: number }>("/modules/master/webscraping/database-cards/batch", {
          method: "DELETE",
          requireAuth: true,
          body: JSON.stringify({ leadIds }),
        });
        setFeedback(`Exclusão em massa concluída. Cards: ${payload?.affected || 0}. Histórico: ${(payload?.searchHistoryPlaces || 0) + (payload?.searchRunItems || 0)}.`);
      }

      if (activeTab === "excluidos") {
        const payload = await apiFetch<{ affected?: number; radarCards?: number; searchHistoryPlaces?: number; searchRunItems?: number }>("/modules/master/exclusoes/batch", {
          method: "DELETE",
          requireAuth: true,
          body: JSON.stringify({ search: search || undefined }),
        });
        setFeedback(`Exclusão em massa concluída. Auditoria: ${payload?.affected || 0}. Cards: ${payload?.radarCards || 0}. Histórico: ${(payload?.searchHistoryPlaces || 0) + (payload?.searchRunItems || 0)}.`);
      }

      if (activeTab === "reclamacoes") {
        const payload = await apiFetch<{ affected?: number }>("/modules/master/vendas-complaints/batch", {
          method: "DELETE",
          requireAuth: true,
          body: JSON.stringify({ complaintIds: filteredComplaints.map((item) => item.id) }),
        });
        setFeedback(`Reclamações removidas em massa: ${payload?.affected || 0}.`);
      }

      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir em massa.");
    } finally {
      setBusyBatch(false);
    }
  }

  if (hasToken === null || checkingAccess) {
    return <main className={styles.shell}><div className={styles.emptyState}>Carregando...</div></main>;
  }

  if (!hasToken) return null;

  if (!allowed) {
    return (
      <DashboardScaffold title="Banco de Dados" hideHeader showDashboardShortcut={false}>
        <main className={styles.shell}>
          <div className={styles.emptyState}>Acesso exclusivo do MASTER.</div>
        </main>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Banco de Dados" showDashboardShortcut={false}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <span>MASTER</span>
            <h1>Banco de Dados de cards</h1>
            <p>Um único painel para pesquisas, excluídos e reclamações.</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => void loadAll()} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <button type="button" onClick={() => { window.location.href = "/master"; }}>
              Voltar ao Master
            </button>
          </div>
        </header>

        {error ? <div className={styles.alert} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.alert} data-tone="ok">{feedback}</div> : null}

        <section className={styles.kpiGrid} aria-label="Resumo do banco de dados">
          <article><span>Pesquisas</span><strong>{metric(cardsTotal || cards.length)}</strong></article>
          <article><span>Excluídos</span><strong>{metric(excludedCards.length + filteredDeletionRecords.length)}</strong></article>
          <article><span>Vendedores HBX</span><strong>{metric(Number(territorySummary.sellerCount || territorySellers.length))}</strong></article>
          <article><span>Cidades fixas</span><strong>{metric(Number(territorySummary.cityCount || territoryCityCount))}</strong></article>
        </section>

        <section className={styles.filterPanel}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Guias</span>
              <strong>Banco unificado</strong>
            </div>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busyBatch || loading || activeBatchCount === 0 || activeTab === "distribuicao"}
              onClick={() => void deleteActiveBatch()}
            >
              {activeTab === "distribuicao" ? "Sem exclusão em massa" : busyBatch ? "Excluindo..." : `Excluir em massa (${metric(activeBatchCount)})`}
            </button>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Banco de Dados de cards">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                data-active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <strong>{tab.label}</strong>
                <span>{tab.description}</span>
              </button>
            ))}
          </div>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, empresa, cidade, telefone, segmento, motivo..."
          />
        </section>

        <section className={styles.tableCard}>
          <div className={styles.sectionTitle}>
            <div>
              <span>{TABS.find((tab) => tab.id === activeTab)?.label}</span>
              <strong>{loading ? "Carregando..." : activeTab === "distribuicao" ? `${metric(territoryPotential)} cards potenciais` : `${metric(activeBatchCount)} item(ns)`}</strong>
            </div>
          </div>

          {!loading && activeBatchCount === 0 && activeTab !== "distribuicao" ? (
            <div className={styles.emptyState}>Nenhum card encontrado nesta guia.</div>
          ) : null}

          {activeTab === "pesquisas" ? <RadarCardList items={filteredCards} /> : null}
          {activeTab === "excluidos" ? <ExcludedList items={excludedCards} records={filteredDeletionRecords} /> : null}
          {activeTab === "reclamacoes" ? <ComplaintList items={filteredComplaints} /> : null}
          {activeTab === "distribuicao" ? (
            <HbxTerritoryPanelView
              panel={territoryDraft}
              input={territoryInput}
              saving={territorySaving}
              running={territoryRunning}
              onInputChange={setTerritoryInput}
              onAddCity={addTerritoryCity}
              onRemoveCity={removeTerritoryCity}
              onTargetChange={(value) => setTerritoryDraft((current) => current ? { ...current, targetStockPerSeller: value } : current)}
              onSave={saveTerritories}
              onRun={runTerritoriesNow}
            />
          ) : null}
        </section>
      </main>
    </DashboardScaffold>
  );
}

function HbxTerritoryPanelView({
  panel,
  input,
  saving,
  running,
  onInputChange,
  onAddCity,
  onRemoveCity,
  onTargetChange,
  onSave,
  onRun,
}: {
  panel: HbxTerritoryPanel | null;
  input: { userId: number; state: string; city: string };
  saving: boolean;
  running: boolean;
  onInputChange: (next: { userId: number; state: string; city: string }) => void;
  onAddCity: (userId: number, city?: HbxTerritoryCity) => void;
  onRemoveCity: (userId: number, city: HbxTerritoryCity) => void;
  onTargetChange: (value: number) => void;
  onSave: (status?: "draft" | "active") => Promise<void>;
  onRun: () => Promise<void>;
}) {
  const sellers = panel?.sellers || [];
  const suggestions = panel?.citySuggestions || [];
  const cityBalance = panel?.cityBalance || [];
  const selectedSeller = sellers.find((seller) => seller.id === input.userId) || sellers[0] || null;
  const summary = panel?.summary || {};
  const lastRunLabel = panel?.lastRunAt ? formatDateTime(panel.lastRunAt) : "Nunca executado";

  if (!panel) {
    return <div className={styles.emptyState}>Carregando distribuição HBX Master...</div>;
  }

  return (
    <div className={styles.territoryLayout}>
      <section className={styles.territoryHero}>
        <div>
          <span>HBX Master</span>
          <strong>Cidades fixas, segmentos livres</strong>
          <p>O USERMASTER fixa onde cada vendedor pode receber cards. Dentro do Vendas, o vendedor trabalha segmentos livres dentro da cidade liberada.</p>
        </div>
        <div className={styles.territoryStatus}>
          <span>Status</span>
          <strong>{panel.status === "active" ? "Ativa" : panel.status === "paused" ? "Pausada" : "Rascunho"}</strong>
          <small>{lastRunLabel}</small>
        </div>
      </section>

      <section className={styles.territoryInsightGrid} aria-label="Resumo operacional da distribuição HBX">
        <article>
          <span>Estoque em Vendas</span>
          <strong>{metric(summary.currentStock)}</strong>
          <small>meta {metric(summary.targetStock)}</small>
        </article>
        <article>
          <span>Faltando agora</span>
          <strong>{metric(summary.missingCards)}</strong>
          <small>{metric(summary.pendingSellerCount)} vendedor(es)</small>
        </article>
        <article>
          <span>Cobertura</span>
          <strong>{metric(summary.coveredSellerCount)}/{metric(summary.sellerCount)}</strong>
          <small>{metric(summary.unmappedSellerCount)} sem cidade</small>
        </article>
        <article>
          <span>Banco disponível</span>
          <strong>{metric(summary.availableCards)}</strong>
          <small>nas cidades fixas</small>
        </article>
        <article>
          <span>Slots recomendados</span>
          <strong>{metric(summary.assignedCitySlots)}/{metric(summary.recommendedSellerSlots)}</strong>
          <small>{metric(summary.uncoveredCityCount)} cidade(s) sem vendedor</small>
        </article>
      </section>

      {cityBalance.length ? (
        <section className={styles.territoryBalancePanel}>
          <header>
            <div>
              <span>Mapa de demanda</span>
              <strong>Regiões por pressão</strong>
            </div>
            <small>{metric(summary.overloadedCityCount)} região(ões) pedindo mais vendedores</small>
          </header>
          <div className={styles.territoryBalanceList}>
            {cityBalance.slice(0, 12).map((city) => {
              const status = city.coverageStatus || "balanced";
              return (
                <button
                  type="button"
                  key={`${city.city}-${city.state}-${status}`}
                  data-status={status}
                  onClick={() => selectedSeller ? onAddCity(selectedSeller.id, city) : undefined}
                >
                  <span>{city.city}/{city.state}</span>
                  <strong>{metric(city.availableCards)}</strong>
                  <small>{metric(city.assignedSellerCount)}/{metric(city.recommendedSellerCount)} vendedor(es)</small>
                  <em>{city.actionLabel || "Cobertura ok"}</em>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className={styles.territoryControls}>
        <label>
          <span>Cards para manter por vendedor</span>
          <input
            type="number"
            min={1}
            max={500}
            value={panel.targetStockPerSeller || 30}
            onChange={(event) => onTargetChange(Math.max(1, Math.min(500, Math.trunc(Number(event.target.value || 0) || 1))))}
          />
        </label>
        <label>
          <span>Vendedor</span>
          <select value={selectedSeller?.id || 0} onChange={(event) => onInputChange({ ...input, userId: Number(event.target.value || 0) })}>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>{seller.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>UF</span>
          <input value={input.state} maxLength={2} onChange={(event) => onInputChange({ ...input, state: event.target.value.toUpperCase() })} />
        </label>
        <label>
          <span>Cidade</span>
          <input value={input.city} onChange={(event) => onInputChange({ ...input, city: event.target.value })} placeholder="Ex.: São Paulo" />
        </label>
        <button type="button" onClick={() => onAddCity(Number(selectedSeller?.id || 0))}>
          Adicionar cidade
        </button>
      </section>

      {suggestions.length ? (
        <section className={styles.territorySuggestions}>
          <span>Cidades com mais cards no banco</span>
          <div>
            {suggestions.slice(0, 12).map((city) => (
              <button
                type="button"
                key={`${city.city}-${city.state}`}
                onClick={() => selectedSeller ? onAddCity(selectedSeller.id, city) : undefined}
              >
                {city.city}/{city.state} · {metric(city.availableCards)}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.territorySellerGrid}>
        {sellers.map((seller) => {
          const stock = Math.max(0, Number(seller.currentStock || 0));
          const target = Math.max(1, Number(seller.targetStock || panel.targetStockPerSeller || 30));
          const missing = Math.max(0, Number(seller.remainingStock ?? target - stock));
          const stockPercent = Math.max(0, Math.min(100, Math.round((stock / target) * 100)));
          const status = seller.distributionStatus || (seller.cities.length ? missing > 0 ? "needs_cards" : "full" : "unmapped");
          const statusLabel = status === "full" ? "Completo" : status === "needs_cards" ? "Precisa card" : "Sem cidade";
          return (
            <article key={seller.id} className={styles.territorySellerCard}>
              <header>
                <div>
                  <span>Vendedor HBX</span>
                  <strong>{seller.name}</strong>
                  <small>{seller.email || seller.phone || "Sem contato salvo"}</small>
                </div>
                <div>
                  <span>Estoque</span>
                  <strong>{metric(stock)}/{metric(target)}</strong>
                </div>
              </header>
              <div className={styles.territoryMeter} aria-label={`Estoque de ${seller.name}`}>
                <span style={{ width: `${stockPercent}%` }} />
              </div>
              <div className={styles.territoryBadges}>
                <span data-status={status}>{statusLabel}</span>
                <span>{metric(seller.availableCards)} potenciais</span>
                <span>{metric(missing)} faltando</span>
              </div>
              <div className={styles.metaGrid}>
                <span>Comissão: {Number(seller.commissionPercent || 0).toLocaleString("pt-BR")}%</span>
                <span>Herdada: {Number(seller.inheritedCommissionPercent || 0).toLocaleString("pt-BR")}%</span>
                <span>Subvendedores: {seller.canRegisterHbxSellers ? "liberado" : "bloqueado"}</span>
                <span>Cidades: {metric(seller.cities.length)}</span>
              </div>
              <div className={styles.cityChips}>
                {seller.cities.length ? seller.cities.map((city) => (
                  <button key={`${seller.id}-${city.city}-${city.state}`} type="button" onClick={() => onRemoveCity(seller.id, city)}>
                    {city.city}/{city.state} · {metric(city.availableCards)}
                  </button>
                )) : <em>Nenhuma cidade fixa. Este vendedor ainda não entra no mapa HBX.</em>}
              </div>
            </article>
          );
        })}
      </div>

      <footer className={styles.territoryFooter}>
        <button type="button" onClick={() => void onSave("draft")} disabled={saving}>
          {saving ? "Salvando..." : "Salvar rascunho"}
        </button>
        <button type="button" data-primary="true" onClick={() => void onSave("active")} disabled={saving}>
          {saving ? "Ativando..." : "Ativar territórios"}
        </button>
        <button type="button" data-primary="true" onClick={() => void onRun()} disabled={saving || running || panel.status !== "active"}>
          {running ? "Alimentando..." : "Alimentar agora"}
        </button>
      </footer>
    </div>
  );
}

function RadarCardList({ items, completed = false }: { items: RadarCard[]; completed?: boolean }) {
  return (
    <div className={styles.cardList}>
      {items.map((item) => (
        <article key={item.id} className={styles.dataCard}>
          <header>
            <div>
              <span>{completed ? "Concluído" : item.targetType || "Pesquisa"}</span>
              <strong>{item.name || "Card sem nome"}</strong>
              <small>{[item.city, item.state, item.segment].filter(Boolean).join(" / ") || "Sem localização"}</small>
            </div>
            <small>{formatDateTime(item.createdAt || item.updatedAt)}</small>
          </header>
          <div className={styles.metaGrid}>
            <span>Telefone: {item.phone || "-"}</span>
            <span>Status: {item.status || "-"}</span>
            <span>Score: {metric(item.opportunityScore)}</span>
            <span>Social: {item.socialStatus || (item.instagramUrl || item.facebookUrl ? "found" : "missing")}</span>
          </div>
          <p>
            {[item.website, item.instagramUrl, item.facebookUrl].filter(Boolean).join(" · ") || "Sem site/social salvo no card."}
          </p>
        </article>
      ))}
    </div>
  );
}

function ExcludedList({ items, records }: { items: RadarExcludedCard[]; records: DeletionItem[] }) {
  return (
    <div className={styles.cardList}>
      {items.map((item) => (
        <article key={item.id} className={styles.dataCard}>
          <header>
            <div>
              <span>Card removido</span>
              <strong>{item.lead?.name || "Card sem nome"}</strong>
              <small>{item.companyName ? `${item.companyName} (#${item.companyId})` : `Empresa #${item.companyId || "-"}`}</small>
            </div>
            <small>{formatDateTime(item.updatedAt)}</small>
          </header>
          <div className={styles.metaGrid}>
            <span>Telefone: {item.lead?.phone || "-"}</span>
            <span>{[item.lead?.city, item.lead?.state].filter(Boolean).join("/") || "Sem cidade"}</span>
            <span>{item.lead?.segment || "Sem segmento"}</span>
            <span>Status: {item.status || "-"}</span>
          </div>
          <p>Motivo: {item.reason || "-"}</p>
        </article>
      ))}
      {records.map((item) => (
        <article key={`record-${item.id}`} className={styles.dataCard}>
          <header>
            <div>
              <span>Auditoria</span>
              <strong>#{item.id} · {item.moduleKey} · {item.entityType}</strong>
              <small>{item.company ? `${item.company.name} (#${item.company.id})` : `Empresa #${item.companyId || "-"}`}</small>
            </div>
            <small>{formatDateTime(item.deletedAt)}</small>
          </header>
          <p>Motivo: {item.motivo || "-"}</p>
        </article>
      ))}
    </div>
  );
}

function ComplaintList({ items }: { items: VendasComplaint[] }) {
  return (
    <div className={styles.cardList}>
      {items.map((item) => (
        <article key={item.id} className={styles.dataCard} data-status={item.status}>
          <header>
            <div>
              <span>{COMPLAINT_LABELS[item.status]}</span>
              <strong>{item.leadName || "Card sem nome"}</strong>
              <small>{item.companyName} · {formatDateTime(item.createdAt)}</small>
            </div>
            {item.contactWhatsappUrl ? <a href={item.contactWhatsappUrl} target="_blank" rel="noreferrer">Chamar cliente</a> : null}
          </header>
          <p>{item.reason || "Sem motivo informado."}</p>
          <div className={styles.metaGrid}>
            <span>Lead: {item.leadPhone || "sem telefone"}</span>
            <span>{[item.leadCity, item.leadState].filter(Boolean).join("/") || "sem cidade"}</span>
            <span>{item.leadSegment || "sem segmento"}</span>
            <span>{item.userName || item.userEmail || "usuário não identificado"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
