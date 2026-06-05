"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxGuide1 from "@/components/HbxGuide1";
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
  preferredSegmentsJson?: string | null;
  commissionPercent?: number | null;
  inheritedCommissionPercent?: number | null;
  canRegisterHbxSellers?: boolean;
  cities: HbxTerritoryCity[];
  availableCards?: number;
  targetStock?: number;
  currentStock?: number;
  remainingStock?: number;
  dailyLimit?: number;
  deliveredToday?: number;
  dailyRemaining?: number;
  noDeliveryReason?: string | null;
  distributionStatus?: "unmapped" | "needs_cards" | "full";
};

type HbxTerritoryPanel = {
  ok?: boolean;
  status?: "draft" | "active" | "paused";
  segmentMode?: string;
  territoryMode?: string;
  targetStockPerSeller?: number;
  dailyLimitPerSeller?: number;
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
    dailyTarget?: number;
    deliveredToday?: number;
    dailyRemaining?: number;
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

const EMPTY_TERRITORY_SELLERS: HbxTerritorySeller[] = [];
const EMPTY_TERRITORY_CITIES: HbxTerritoryCity[] = [];
const EMPTY_CITY_BALANCE: HbxTerritoryCityBalance[] = [];

type TerritoryStatusFilter = "todos" | "sem_parceiro" | "precisa_cards" | "completo" | "pausada";
type TerritoryViewMode = "table" | "config";

type TerritoryFilters = {
  state: string;
  city: string;
  segment: string;
  partnerId: string;
  status: TerritoryStatusFilter;
};

type HbxTerritoryTableRow = {
  id: string;
  state: string;
  city: string;
  segmentLabel: string;
  seller: HbxTerritorySeller | null;
  cityRef: HbxTerritoryCity;
  availableCards: number;
  dailyLimit: number;
  deliveredToday: number;
  dailyRemaining: number;
  currentStock: number;
  targetStock: number;
  statusKey: TerritoryStatusFilter;
  statusLabel: string;
  preferredSegmentsLabel: string;
};

const TABS: Array<{ id: TabId; label: string; description: string }> = [
  { id: "pesquisas", label: "Pesquisas", description: "Cards pesquisados e salvos no banco Radar." },
  { id: "excluidos", label: "Excluídos", description: "Cards removidos, bloqueados ou descartados." },
  { id: "reclamacoes", label: "Reclamações", description: "Cards contestados pelos clientes." },
  { id: "distribuicao", label: "Distribuição de Cards", description: "Modo tabela para UF, cidade, parceiro e limites de distribuição." },
];

const TAB_GUIDE_ITEMS = TABS.map((tab) => ({
  key: tab.id,
  label: tab.label,
})) satisfies Array<{ key: TabId; label: string }>;

const MASS_DELETE_LOAD_LIMIT = 2000;

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

function normalizeLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const cleanMessage = message.trim();
  if (!cleanMessage || /internal server error/i.test(cleanMessage)) return "erro interno no backend local";
  return cleanMessage;
}

function preferredSegmentsLabel(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { segments?: unknown; cityRegion?: unknown } | unknown[];
    const parsedObject = !Array.isArray(parsed) && parsed && typeof parsed === "object" ? parsed : null;
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsedObject?.segments) ? parsedObject.segments : [];
    const segments = source.map((item) => String(item || "").trim()).filter(Boolean);
    const cityRegion = parsedObject ? String(parsedObject.cityRegion || "").trim() : "";
    const parts = [...segments, cityRegion].filter(Boolean);
    return parts.length ? `Prefere: ${parts.join(", ")}` : raw;
  } catch {
    return `Prefere: ${raw}`;
  }
}

export default function BancoDeDadosClientPage({ embedded = false }: { embedded?: boolean } = {}) {
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
      const [cardsResult, exclusionsResult, complaintsResult, territoryResult] = await Promise.allSettled([
        apiFetch<RadarCardsPayload>(`/modules/master/webscraping/database-cards?limit=${MASS_DELETE_LOAD_LIMIT}&targetType=both`, {
          requireAuth: true,
          timeoutMs: 60000,
        }),
        apiFetch<ExclusoesPayload>("/modules/master/exclusoes", {
          requireAuth: true,
          timeoutMs: 20000,
        }),
        apiFetch<ComplaintPayload>(`/modules/master/vendas-complaints?limit=${MASS_DELETE_LOAD_LIMIT}`, {
          requireAuth: true,
          timeoutMs: 60000,
        }),
        apiFetch<HbxTerritoryPanel>("/modules/master/webscraping/radar-auto-distribution", {
          requireAuth: true,
          timeoutMs: 20000,
        }),
      ]);
      const failures: string[] = [];

      if (cardsResult.status === "fulfilled") {
        const cardsPayload = cardsResult.value;
        setCards(cardsPayload?.items || []);
        setCardsTotal(Number(cardsPayload?.total || cardsPayload?.items?.length || 0));
      } else {
        failures.push(`Pesquisas (${normalizeLoadError(cardsResult.reason)})`);
      }

      if (exclusionsResult.status === "fulfilled") {
        setExclusions(exclusionsResult.value || {});
      } else {
        failures.push(`Excluídos (${normalizeLoadError(exclusionsResult.reason)})`);
      }

      if (complaintsResult.status === "fulfilled") {
        setComplaints(complaintsResult.value?.items || []);
      } else {
        failures.push(`Reclamações (${normalizeLoadError(complaintsResult.reason)})`);
      }

      if (territoryResult.status === "fulfilled") {
        const territoryPayload = territoryResult.value;
        setTerritoryPanel(territoryPayload || null);
        setTerritoryDraft(territoryPayload || null);
        const firstSellerId = Number(territoryPayload?.sellers?.[0]?.id || 0);
        setTerritoryInput((current) => ({ ...current, userId: current.userId || firstSellerId }));
      } else {
        failures.push(`Distribuição de Cards (${normalizeLoadError(territoryResult.reason)})`);
      }

      if (failures.length) {
        setError(`Banco carregado parcialmente. Falharam: ${failures.join("; ")}.`);
      }
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

  function moveTerritoryCity(fromUserId: number | null, toUserId: number, city: HbxTerritoryCity) {
    const targetUserId = Math.trunc(Number(toUserId || 0));
    const normalizedCity = String(city.city || "").trim();
    const state = String(city.state || "").trim().toUpperCase();
    if (!targetUserId || !normalizedCity || !state) {
      setError("Escolha parceiro, UF e cidade para distribuir o card.");
      return;
    }
    setTerritoryDraft((current) => {
      const base = current || territoryPanel;
      if (!base) return current;
      return {
        ...base,
        sellers: (base.sellers || []).map((seller) => {
          const withoutCity = seller.cities.filter((item) => !(normalizeText(item.city) === normalizeText(normalizedCity) && String(item.state || "").toUpperCase() === state));
          if (seller.id !== targetUserId) {
            return seller.id === fromUserId ? { ...seller, cities: withoutCity } : seller;
          }
          const exists = withoutCity.some((item) => normalizeText(item.city) === normalizeText(normalizedCity) && String(item.state || "").toUpperCase() === state);
          return {
            ...seller,
            cities: exists ? withoutCity : [...withoutCity, { city: normalizedCity, state, availableCards: city.availableCards || 0 }],
          };
        }),
      };
    });
    setFeedback(fromUserId ? "Parceiro trocado no rascunho. Salve para aplicar." : "Parceiro atribuído no rascunho. Salve para aplicar.");
  }

  async function saveTerritories(status: "draft" | "active" | "paused" = "active") {
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
          dailyLimitPerSeller: territoryDraft?.dailyLimitPerSeller ?? 20,
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
    const deniedContent = (
      <main className={styles.shell}>
        <div className={styles.emptyState}>Acesso exclusivo do MASTER.</div>
      </main>
    );
    return embedded ? deniedContent : (
      <DashboardScaffold title="Banco de Dados" hideHeader showDashboardShortcut={false}>
        {deniedContent}
      </DashboardScaffold>
    );
  }

  const content = (
    <main className={styles.shell}>
        {error ? <div className={styles.alert} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.alert} data-tone="ok">{feedback}</div> : null}

        <section className={styles.filterPanel}>
          <div className={styles.databaseToolbar}>
            <div className="hbx-guide1-slot">
              <HbxGuide1
                tabs={TAB_GUIDE_ITEMS}
                activeKey={activeTab}
                ariaLabel="Banco de Dados"
                onChange={setActiveTab}
              />
            </div>
            <div className={styles.headerActions}>
              <button type="button" onClick={() => void loadAll()} disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
              <button type="button" onClick={() => { window.location.href = "/master"; }}>
                Master
              </button>
            </div>
          </div>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, empresa, cidade, telefone, segmento, motivo..."
          />
        </section>

        <section className={styles.kpiGrid} aria-label="Resumo do banco de dados">
          <article><span>Pesquisas</span><strong>{metric(cardsTotal || cards.length)}</strong></article>
          <article><span>Excluídos</span><strong>{metric(excludedCards.length + filteredDeletionRecords.length)}</strong></article>
          <article><span>Vendedores HBX</span><strong>{metric(Number(territorySummary.sellerCount || territorySellers.length))}</strong></article>
          <article><span>Cidades fixas</span><strong>{metric(Number(territorySummary.cityCount || territoryCityCount))}</strong></article>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.sectionTitle}>
            <div>
              <span>{TABS.find((tab) => tab.id === activeTab)?.label}</span>
              <strong>{loading ? "Carregando..." : activeTab === "distribuicao" ? `${metric(territoryPotential)} cards potenciais` : `${metric(activeBatchCount)} item(ns)`}</strong>
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
              onDailyLimitChange={(value) => setTerritoryDraft((current) => current ? { ...current, dailyLimitPerSeller: value } : current)}
              onMoveCity={moveTerritoryCity}
              onSave={saveTerritories}
              onRun={runTerritoriesNow}
            />
          ) : null}
        </section>
      </main>
  );

  if (embedded) return content;

  return (
    <DashboardScaffold title="Banco de Dados" hideHeader showDashboardShortcut={false}>
      {content}
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
  onDailyLimitChange,
  onMoveCity,
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
  onDailyLimitChange: (value: number) => void;
  onMoveCity: (fromUserId: number | null, toUserId: number, city: HbxTerritoryCity) => void;
  onSave: (status?: "draft" | "active" | "paused") => Promise<void>;
  onRun: () => Promise<void>;
}) {
  const [territoryFilters, setTerritoryFilters] = useState<TerritoryFilters>({
    state: "todos",
    city: "",
    segment: "",
    partnerId: "todos",
    status: "todos",
  });
  const [territoryViewMode, setTerritoryViewMode] = useState<TerritoryViewMode>("table");
  const [selectedPartnerByRow, setSelectedPartnerByRow] = useState<Record<string, string>>({});
  const sellers = panel?.sellers || EMPTY_TERRITORY_SELLERS;
  const suggestions = panel?.citySuggestions || EMPTY_TERRITORY_CITIES;
  const cityBalance = panel?.cityBalance || EMPTY_CITY_BALANCE;
  const selectedSeller = sellers.find((seller) => seller.id === input.userId) || sellers[0] || null;
  const summary = panel?.summary || {};
  const lastRunLabel = panel?.lastRunAt ? formatDateTime(panel.lastRunAt) : "Nunca executado";
  const assignedCityKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const seller of sellers) {
      for (const city of seller.cities || []) {
        keys.add(`${normalizeText(city.city)}:${String(city.state || "").toUpperCase()}`);
      }
    }
    return keys;
  }, [sellers]);
  const distributionRows = useMemo<HbxTerritoryTableRow[]>(() => {
    const rows: HbxTerritoryTableRow[] = [];
    for (const seller of sellers) {
      const stock = Math.max(0, Number(seller.currentStock || 0));
      const target = Math.max(1, Number(seller.targetStock || panel?.targetStockPerSeller || 30));
      const missing = Math.max(0, Number(seller.remainingStock ?? target - stock));
      const dailyLimit = Math.max(0, Number(seller.dailyLimit ?? panel?.dailyLimitPerSeller ?? 20));
      const deliveredToday = Math.max(0, Number(seller.deliveredToday || 0));
      const dailyRemaining = Math.max(0, Number(seller.dailyRemaining ?? Math.max(0, dailyLimit - deliveredToday)));
      const status = panel?.status === "paused"
        ? { key: "pausada" as TerritoryStatusFilter, label: "Pausada" }
        : missing > 0
          ? { key: "precisa_cards" as TerritoryStatusFilter, label: "Precisa cards" }
          : { key: "completo" as TerritoryStatusFilter, label: "Completo" };
      for (const city of seller.cities || []) {
        rows.push({
          id: `seller-${seller.id}-${normalizeText(city.city)}-${String(city.state || "").toUpperCase()}`,
          state: String(city.state || "").toUpperCase() || "-",
          city: city.city || "Sem cidade",
          segmentLabel: "Livre no Vendas",
          seller,
          cityRef: city,
          availableCards: Number(city.availableCards || 0),
          dailyLimit,
          deliveredToday,
          dailyRemaining,
          currentStock: stock,
          targetStock: target,
          statusKey: status.key,
          statusLabel: status.label,
          preferredSegmentsLabel: preferredSegmentsLabel(seller.preferredSegmentsJson),
        });
      }
    }
    for (const city of cityBalance.length ? cityBalance : suggestions) {
      const state = String(city.state || "").toUpperCase();
      const key = `${normalizeText(city.city)}:${state}`;
      if (!city.city || !state || assignedCityKeys.has(key)) continue;
      rows.push({
        id: `unassigned-${normalizeText(city.city)}-${state}`,
        state,
        city: city.city,
        segmentLabel: "Livre no Vendas",
        seller: null,
        cityRef: city,
        availableCards: Number(city.availableCards || 0),
        dailyLimit: Number(panel?.dailyLimitPerSeller ?? 20),
        deliveredToday: 0,
        dailyRemaining: Number(panel?.dailyLimitPerSeller ?? 20),
        currentStock: 0,
        targetStock: Number(panel?.targetStockPerSeller ?? 30),
        statusKey: "sem_parceiro",
        statusLabel: "Sem parceiro",
        preferredSegmentsLabel: "",
      });
    }
    return rows.sort((left, right) => left.state.localeCompare(right.state, "pt-BR") || left.city.localeCompare(right.city, "pt-BR") || (left.seller?.name || "").localeCompare(right.seller?.name || "", "pt-BR"));
  }, [assignedCityKeys, cityBalance, panel?.dailyLimitPerSeller, panel?.status, panel?.targetStockPerSeller, sellers, suggestions]);
  const stateOptions = useMemo(() => Array.from(new Set(distributionRows.map((row) => row.state).filter(Boolean))).sort(), [distributionRows]);
  const filteredDistributionRows = useMemo(() => {
    const cityTerm = normalizeText(territoryFilters.city);
    const segmentTerm = normalizeText(territoryFilters.segment);
    return distributionRows.filter((row) => {
      if (territoryFilters.state !== "todos" && row.state !== territoryFilters.state) return false;
      if (territoryFilters.partnerId !== "todos" && String(row.seller?.id || 0) !== territoryFilters.partnerId) return false;
      if (territoryFilters.status !== "todos" && row.statusKey !== territoryFilters.status) return false;
      if (cityTerm && !normalizeText(`${row.city} ${row.state}`).includes(cityTerm)) return false;
      if (segmentTerm && !normalizeText(`${row.segmentLabel} ${row.preferredSegmentsLabel}`).includes(segmentTerm)) return false;
      return true;
    });
  }, [distributionRows, territoryFilters]);

  if (!panel) {
    return <div className={styles.emptyState}>Carregando distribuição HBX Master...</div>;
  }

  return (
    <div className={styles.territoryLayout}>
      <section className={styles.territoryHero}>
        <div>
          <span>HBX Master</span>
          <strong>Distribuição de Cards</strong>
          <p>Modo tabela para o Master distribuir cards por UF, cidade e parceiro. Parceiro HBX trabalha os cards no Vendas.</p>
        </div>
        <div className={styles.territoryHeroAside}>
          <div className={styles.territoryStatus}>
            <span>Status</span>
            <strong>{panel.status === "active" ? "Ativa" : panel.status === "paused" ? "Pausada" : "Rascunho"}</strong>
            <small>{lastRunLabel}</small>
          </div>
          <div className={styles.territoryModeSwitch} role="tablist" aria-label="Modo da distribuição de cards">
            <button type="button" role="tab" aria-selected={territoryViewMode === "table"} data-active={territoryViewMode === "table" ? "true" : "false"} onClick={() => setTerritoryViewMode("table")}>
              Modo tabela
            </button>
            <button type="button" role="tab" aria-selected={territoryViewMode === "config"} data-active={territoryViewMode === "config" ? "true" : "false"} onClick={() => setTerritoryViewMode("config")}>
              Configuração
            </button>
          </div>
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
          <span>Entregues hoje</span>
          <strong>{metric(summary.deliveredToday)}</strong>
          <small>restam {metric(summary.dailyRemaining)} de {metric(summary.dailyTarget)}</small>
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
              <span>Demanda operacional</span>
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

      {territoryViewMode === "table" ? (
      <section className={styles.territoryDistributionPanel} aria-label="Distribuição de Cards por UF, cidade e parceiro">
        <header className={styles.territoryTableHeader}>
          <div>
            <span>Modo tabela</span>
            <strong>{metric(filteredDistributionRows.length)} linha(s)</strong>
            <p>UF, cidade, categoria, parceiro, preferências e limites em uma visão operacional. Segmento fica livre para o Parceiro HBX trabalhar no Vendas.</p>
          </div>
          <div className={styles.territoryTableActions}>
            <button type="button" onClick={() => void onSave("draft")} disabled={saving}>
              {saving ? "Salvando..." : "Salvar rascunho"}
            </button>
            <button type="button" onClick={() => void onSave(panel.status === "active" ? "paused" : "active")} disabled={saving}>
              {panel.status === "active" ? "Pausar" : "Ativar"}
            </button>
            <button type="button" data-primary="true" onClick={() => void onRun()} disabled={saving || running || panel.status !== "active"}>
              {running ? "Rodando..." : "Rodar distribuição"}
            </button>
          </div>
        </header>

        <div className={styles.territoryFilterGrid}>
          <label>
            <span>UF</span>
            <select value={territoryFilters.state} onChange={(event) => setTerritoryFilters((current) => ({ ...current, state: event.target.value }))}>
              <option value="todos">Todas</option>
              {stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label>
            <span>Cidade</span>
            <input value={territoryFilters.city} onChange={(event) => setTerritoryFilters((current) => ({ ...current, city: event.target.value }))} placeholder="Filtrar cidade" />
          </label>
          <label>
            <span>Segmento</span>
            <input value={territoryFilters.segment} onChange={(event) => setTerritoryFilters((current) => ({ ...current, segment: event.target.value }))} placeholder="Livre ou preferência" />
          </label>
          <label>
            <span>Parceiro</span>
            <select value={territoryFilters.partnerId} onChange={(event) => setTerritoryFilters((current) => ({ ...current, partnerId: event.target.value }))}>
              <option value="todos">Todos</option>
              <option value="0">Sem parceiro</option>
              {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={territoryFilters.status} onChange={(event) => setTerritoryFilters((current) => ({ ...current, status: event.target.value as TerritoryStatusFilter }))}>
              <option value="todos">Todos</option>
              <option value="sem_parceiro">Sem parceiro</option>
              <option value="precisa_cards">Precisa cards</option>
              <option value="completo">Completo</option>
              <option value="pausada">Pausada</option>
            </select>
          </label>
        </div>

        <div className={styles.territoryTableWrap}>
          <table className={styles.territoryTable}>
            <thead>
              <tr>
                <th>UF</th>
                <th>Cidade/região</th>
                <th>Segmento/categoria</th>
                <th>Parceiro</th>
                <th>Preferências do parceiro</th>
                <th>Limite diário</th>
                <th>Cards entregues hoje</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredDistributionRows.map((row) => {
                const selectedPartnerId = selectedPartnerByRow[row.id] ?? String(row.seller?.id || "");
                const canAssign = Number(selectedPartnerId || 0) > 0 && Number(selectedPartnerId) !== Number(row.seller?.id || 0);
                return (
                  <tr key={row.id} data-status={row.statusKey}>
                    <td data-label="UF">{row.state}</td>
                    <td data-label="Cidade/região">
                      <strong>{row.city}</strong>
                      <span>{metric(row.availableCards)} cards potenciais</span>
                    </td>
                    <td data-label="Segmento/categoria">
                      <strong>{row.segmentLabel}</strong>
                      <span>Parceiro escolhe a abordagem no trabalho dos cards.</span>
                    </td>
                    <td data-label="Parceiro">
                      <strong>{row.seller?.name || "Sem parceiro"}</strong>
                      <span>{row.seller?.email || row.seller?.phone || "Sem contato salvo"}</span>
                    </td>
                    <td data-label="Preferências do parceiro">
                      <strong>{row.preferredSegmentsLabel || "Sem preferência declarada"}</strong>
                      <span>Usado para priorizar distribuição e abordagem.</span>
                    </td>
                    <td data-label="Limite diário">{row.seller ? metric(row.dailyLimit) : "-"}</td>
                    <td data-label="Cards entregues hoje">
                      {row.seller ? `${metric(row.deliveredToday)}/${metric(row.dailyLimit)}` : "-"}
                      {row.seller ? <span>{metric(row.dailyRemaining)} restantes</span> : null}
                    </td>
                    <td data-label="Status">
                      <span className={styles.territoryStatusBadge} data-status={row.statusKey}>{row.statusLabel}</span>
                    </td>
                    <td data-label="Ações">
                      <div className={styles.territoryRowActions}>
                        <select
                          value={selectedPartnerId}
                          onChange={(event) => setSelectedPartnerByRow((current) => ({ ...current, [row.id]: event.target.value }))}
                          aria-label={`Parceiro para ${row.city}/${row.state}`}
                        >
                          <option value="">Selecionar parceiro</option>
                          {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
                        </select>
                        <button type="button" onClick={() => onMoveCity(row.seller?.id || null, Number(selectedPartnerId), row.cityRef)} disabled={!canAssign}>
                          {row.seller ? "Trocar parceiro" : "Atribuir parceiro"}
                        </button>
                        <button type="button" onClick={() => void onSave(panel.status === "active" ? "paused" : "active")} disabled={saving}>
                          {panel.status === "active" ? "Pausar" : "Ativar"}
                        </button>
                        <button type="button" onClick={() => void onRun()} disabled={saving || running || panel.status !== "active"}>
                          Rodar distribuição
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredDistributionRows.length ? <div className={styles.emptyState}>Nenhuma distribuição encontrada com estes filtros.</div> : null}
        </div>
      </section>
      ) : null}

      {territoryViewMode === "config" ? (
      <>
      <section className={styles.territoryControls}>
        <label>
          <span>Estoque alvo por vendedor</span>
          <input
            type="number"
            min={1}
            max={500}
            value={panel.targetStockPerSeller || 30}
            onChange={(event) => onTargetChange(Math.max(1, Math.min(500, Math.trunc(Number(event.target.value || 0) || 1))))}
          />
        </label>
        <label>
          <span>Limite diário por vendedor</span>
          <input
            type="number"
            min={0}
            max={500}
            value={panel.dailyLimitPerSeller ?? 20}
            onChange={(event) => onDailyLimitChange(Math.max(0, Math.min(500, Math.trunc(Number(event.target.value || 0) || 0))))}
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
          const dailyLimit = Math.max(0, Number(panel.dailyLimitPerSeller ?? seller.dailyLimit ?? 20));
          const deliveredToday = Math.max(0, Number(seller.deliveredToday || 0));
          const dailyRemaining = Math.max(0, Number(seller.dailyRemaining ?? Math.max(0, dailyLimit - deliveredToday)));
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
                <span>Hoje {metric(deliveredToday)}/{metric(dailyLimit)}</span>
                <span>{metric(dailyRemaining)} restantes</span>
                {seller.noDeliveryReason ? <span>{seller.noDeliveryReason}</span> : null}
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
                )) : <em>Nenhuma cidade fixa. Este vendedor ainda não entra na distribuição HBX.</em>}
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
      </>
      ) : null}
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
