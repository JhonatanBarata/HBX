"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type CurrentUser = {
  isSystemMaster?: boolean;
};

type TabId = "pesquisas" | "excluidos" | "reclamacoes";
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

const TABS: Array<{ id: TabId; label: string; description: string }> = [
  { id: "pesquisas", label: "Pesquisas", description: "Cards pesquisados e salvos no banco Radar." },
  { id: "excluidos", label: "Excluídos", description: "Cards removidos, bloqueados ou descartados." },
  { id: "reclamacoes", label: "Reclamações", description: "Cards contestados pelos clientes." },
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

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cardsPayload, exclusionsPayload, complaintsPayload] = await Promise.all([
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
      ]);
      setCards(cardsPayload?.items || []);
      setCardsTotal(Number(cardsPayload?.total || cardsPayload?.items?.length || 0));
      setExclusions(exclusionsPayload || {});
      setComplaints(complaintsPayload?.items || []);
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

  const tabCount: Record<TabId, number> = {
    pesquisas: filteredCards.length,
    excluidos: excludedCards.length + filteredDeletionRecords.length,
    reclamacoes: filteredComplaints.length,
  };

  const activeBatchCount = tabCount[activeTab];

  async function deleteActiveBatch() {
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
          <article><span>Reclamações</span><strong>{metric(complaints.length)}</strong></article>
          <article><span>Concluídos</span><strong>{metric(completedCards.length)}</strong></article>
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
              disabled={busyBatch || loading || activeBatchCount === 0}
              onClick={() => void deleteActiveBatch()}
            >
              {busyBatch ? "Excluindo..." : `Excluir em massa (${metric(activeBatchCount)})`}
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
              <strong>{loading ? "Carregando..." : `${metric(activeBatchCount)} item(ns)`}</strong>
            </div>
          </div>

          {!loading && activeBatchCount === 0 ? (
            <div className={styles.emptyState}>Nenhum card encontrado nesta guia.</div>
          ) : null}

          {activeTab === "pesquisas" ? <RadarCardList items={filteredCards} /> : null}
          {activeTab === "excluidos" ? <ExcludedList items={excludedCards} records={filteredDeletionRecords} /> : null}
          {activeTab === "reclamacoes" ? <ComplaintList items={filteredComplaints} /> : null}
        </section>
      </main>
    </DashboardScaffold>
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
