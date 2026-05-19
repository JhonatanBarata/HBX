"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type CurrentUser = {
  isSystemMaster?: boolean;
};

type ComplaintStatus = "new" | "reviewing" | "refunded" | "denied" | "resolved";

type VendasComplaint = {
  id: string;
  companyId: number;
  companyName: string;
  userName?: string | null;
  userEmail?: string | null;
  vendasLeadId?: string | null;
  radarLeadId?: string | null;
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
  updatedAt?: string | null;
  resolvedAt?: string | null;
  contactPhone?: string | null;
  contactWhatsappUrl?: string | null;
};

type ComplaintPayload = {
  ok: boolean;
  items: VendasComplaint[];
  summary?: Record<ComplaintStatus | "total", number>;
};

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: "Nova",
  reviewing: "Em análise",
  refunded: "Reembolsada",
  denied: "Negada",
  resolved: "Resolvida",
};

const STATUS_OPTIONS: Array<{ value: "all" | ComplaintStatus; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "new", label: "Novas" },
  { value: "reviewing", label: "Em análise" },
  { value: "refunded", label: "Reembolsadas" },
  { value: "denied", label: "Negadas" },
  { value: "resolved", label: "Resolvidas" },
];

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

export default function BancoDeDadosClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | ComplaintStatus>("all");
  const [complaints, setComplaints] = useState<VendasComplaint[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refunds, setRefunds] = useState<Record<string, string>>({});

  const summary = useMemo(() => ({
    total: complaints.length,
    new: complaints.filter((item) => item.status === "new").length,
    reviewing: complaints.filter((item) => item.status === "reviewing").length,
    refunded: complaints.filter((item) => item.status === "refunded").length,
    denied: complaints.filter((item) => item.status === "denied").length,
    resolved: complaints.filter((item) => item.status === "resolved").length,
  }), [complaints]);

  const loadComplaints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (statusFilter !== "all") params.set("status", statusFilter);
      const payload = await apiFetch<ComplaintPayload>(`/modules/master/vendas-complaints?${params.toString()}`, {
        requireAuth: true,
        timeoutMs: 20000,
      });
      const items = payload?.items || [];
      setComplaints(items);
      setNotes(Object.fromEntries(items.map((item) => [item.id, item.internalNote || ""])));
      setRefunds(Object.fromEntries(items.map((item) => [item.id, String(item.refundedCards || 1)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar reclamações.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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
        if (isMaster) await loadComplaints();
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
  }, [hasToken, loadComplaints]);

  useEffect(() => {
    if (!allowed) return;
    void loadComplaints();
  }, [allowed, loadComplaints]);

  async function updateComplaint(complaint: VendasComplaint, patch: { status?: ComplaintStatus; refundCards?: number }) {
    setBusyId(complaint.id);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<ComplaintPayload>(`/modules/master/vendas-complaints/${encodeURIComponent(complaint.id)}`, {
        method: "PATCH",
        requireAuth: true,
        body: JSON.stringify({
          ...patch,
          internalNote: notes[complaint.id] || "",
        }),
      });
      const items = payload?.items || [];
      setComplaints(items);
      setNotes(Object.fromEntries(items.map((item) => [item.id, item.internalNote || ""])));
      setRefunds(Object.fromEntries(items.map((item) => [item.id, String(item.refundedCards || 1)])));
      setFeedback("Análise da reclamação atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar reclamação.");
    } finally {
      setBusyId(null);
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
    <DashboardScaffold title="Banco de Dados" hideHeader showDashboardShortcut={false}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div>
            <span>Banco de Dados</span>
            <h1>Reclamações de cards</h1>
            <p>Fila operacional para analisar reclamações, registrar decisão e reembolsar cards quando fizer sentido.</p>
          </div>
          <button type="button" onClick={() => void loadComplaints()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </header>

        {error ? <div className={styles.alert} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.alert} data-tone="ok">{feedback}</div> : null}

        <section className={styles.kpiGrid} aria-label="Resumo de reclamações">
          <article><span>Total</span><strong>{metric(summary.total)}</strong></article>
          <article><span>Novas</span><strong>{metric(summary.new)}</strong></article>
          <article><span>Em análise</span><strong>{metric(summary.reviewing)}</strong></article>
          <article><span>Reembolsadas</span><strong>{metric(summary.refunded)}</strong></article>
          <article><span>Negadas</span><strong>{metric(summary.denied)}</strong></article>
        </section>

        <section className={styles.filterPanel}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Filtro</span>
              <strong>Status da reclamação</strong>
            </div>
          </div>
          <div className={styles.statusTabs}>
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={statusFilter === option.value}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Reclamações</span>
              <strong>{loading ? "Carregando..." : `${metric(complaints.length)} item(ns)`}</strong>
            </div>
          </div>

          {!loading && complaints.length === 0 ? (
            <div className={styles.emptyState}>Nenhuma reclamação encontrada para este filtro.</div>
          ) : null}

          <div className={styles.complaintList}>
            {complaints.map((complaint) => {
              const busy = busyId === complaint.id;
              const refundValue = Math.max(1, Math.trunc(Number(refunds[complaint.id] || complaint.refundedCards || 1) || 1));
              return (
                <article key={complaint.id} className={styles.complaintCard} data-status={complaint.status}>
                  <header>
                    <div>
                      <span>{STATUS_LABELS[complaint.status]}</span>
                      <strong>{complaint.leadName || "Card sem nome"}</strong>
                      <small>{complaint.companyName} · {formatDateTime(complaint.createdAt)}</small>
                    </div>
                    {complaint.contactWhatsappUrl ? (
                      <a href={complaint.contactWhatsappUrl} target="_blank" rel="noreferrer">Chamar cliente</a>
                    ) : null}
                  </header>

                  <p>{complaint.reason || "Sem motivo informado."}</p>

                  <div className={styles.metaGrid}>
                    <span>Lead: {complaint.leadPhone || "sem telefone"}</span>
                    <span>{[complaint.leadCity, complaint.leadState].filter(Boolean).join("/") || "sem cidade"}</span>
                    <span>{complaint.leadSegment || "sem segmento"}</span>
                    <span>{complaint.userName || complaint.userEmail || "usuário não identificado"}</span>
                  </div>

                  <textarea
                    value={notes[complaint.id] || ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [complaint.id]: event.target.value }))}
                    placeholder="Nota interna da análise"
                  />

                  <div className={styles.actions}>
                    <select
                      value={complaint.status}
                      onChange={(event) => void updateComplaint(complaint, { status: event.target.value as ComplaintStatus })}
                      disabled={busy}
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={refunds[complaint.id] || String(complaint.refundedCards || 1)}
                      onChange={(event) => setRefunds((current) => ({ ...current, [complaint.id]: event.target.value }))}
                      aria-label="Cards para reembolsar"
                    />
                    <button type="button" onClick={() => void updateComplaint(complaint, { status: complaint.status })} disabled={busy}>
                      Salvar análise
                    </button>
                    <button type="button" data-primary="true" onClick={() => void updateComplaint(complaint, { status: "refunded", refundCards: refundValue })} disabled={busy}>
                      {busy ? "Processando..." : "Reembolsar card"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </DashboardScaffold>
  );
}
