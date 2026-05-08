"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import type { CommercialPlansPayload } from "@/lib/commercial-plans";
import { clearTopbarProgress, dispatchTopbarProgress } from "@/lib/topbar-progress";
import styles from "./page.module.css";

type StatusPayload = {
  generatedAt: string;
  product: string;
  status: "dormindo" | "rodando" | "pausado" | "erro";
  window: {
    activeNow: boolean;
    nextWindowLabel: string;
  };
  summary: {
    totalLeads: number;
    leadsProcessedToday: number;
    leadsEnrichedToday: number;
    premiumOpportunities: number;
    recoveryOpportunities: number;
    potentialRevenueEstimate: number;
  };
  worker: {
    running: boolean;
    paused: boolean;
    lastRunAt: string | null;
    lastFinishedAt: string | null;
    lastError: string | null;
    lastRunStats: {
      processed: number;
      enriched: number;
      failed: number;
      premium: number;
      recovery: number;
    };
  };
  pipeline: Array<{
    key: string;
    label: string;
    quantity: number;
    status: string;
  }>;
  topCities: Array<{ city: string; state?: string | null; totalLeads: number; averageScore: number; recommendedOffer?: string }>;
  topSegments: Array<{ segment: string; totalLeads: number; averageScore: number }>;
  copy?: {
    title: string;
    subtitle: string;
    action: string;
  };
};

type Opportunity = {
  id: string;
  radarLeadId: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  score: number;
  level?: string | null;
  reason?: string | null;
  recommendedOffer?: string | null;
  suggestedApproach?: string | null;
  suggestedWhatsappMessage?: string | null;
  miniAudit?: {
    title?: string | null;
    summary?: string | null;
    status?: string | null;
  };
};

type RecoveryOpportunity = {
  id: string;
  sourceType: string;
  sourceId: string;
  companyId?: number | null;
  name?: string | null;
  phone?: string | null;
  recoveryReason: string;
  recoveryScore: number;
  suggestedFlow?: string | null;
  suggestedMessage?: string | null;
  status: string;
};

type ReportPayload = {
  generatedAt: string;
  title: string;
  greeting: string;
  summary: {
    cardsRaw: number;
    cleanLeads: number;
    premiumOpportunities: number;
    weakSites: number;
    noWhatsapp: number;
    recoveryOpportunities: number;
    scriptsGenerated: number;
    topSegment: string;
    topCity: string;
    potentialRevenueEstimate: number;
  };
  recommendedAction: string;
};

const NIGHT_FACTORY_PROGRESS_STEPS = ["lendo banco", "filtrando negativos", "selecionando melhores cards", "alimentando Vendas/Prospecção"];

function metric(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function money(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(status?: string) {
  if (status === "rodando") return "Rodando";
  if (status === "pausado") return "Pausado";
  if (status === "erro") return "Erro";
  return "Dormindo";
}

function radarSearchUrl(params: { city?: string | null; state?: string | null; segment?: string | null; radarLeadId?: string | null }) {
  const query = new URLSearchParams();
  if (params.city) query.set("city", params.city);
  if (params.state) query.set("state", params.state);
  if (params.segment) query.set("segment", params.segment);
  if (params.radarLeadId) query.set("radarLeadId", params.radarLeadId);
  const suffix = query.toString();
  return suffix ? `/radar-digital?${suffix}` : "/radar-digital";
}

function recoverySourceLabel(value?: string | null) {
  const source = String(value || "").trim().toLowerCase();
  if (source === "vendas") return "Retorno comercial";
  if (source === "radar") return "Radar sem ação";
  if (source === "atendimento") return "Atendimento pendente";
  return "Oportunidade parada";
}

function recoveryCopy(item: RecoveryOpportunity) {
  const reason = String(item.recoveryReason || "").trim().toLowerCase();
  if (reason.includes("retorno")) return "Já existe histórico. Reabrir com contexto antes que esfrie.";
  if (reason.includes("sem_resposta") || reason.includes("no_answer")) return "Contato sem resposta precisa de uma nova abordagem simples.";
  if (reason.includes("duplicate")) return "Lead repetido pode virar follow-up correto em vez de ficar perdido.";
  return "Clique para abrir o contexto e decidir o próximo passo.";
}

function recoveryUrl(item: RecoveryOpportunity) {
  const source = String(item.sourceType || "").trim().toLowerCase();
  if (source === "vendas") return `/vendas?leadId=${encodeURIComponent(item.sourceId)}`;
  return radarSearchUrl({ radarLeadId: item.sourceId });
}

export default function MasterNightFactoryClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [recovery, setRecovery] = useState<RecoveryOpportunity[]>([]);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [nightVisualCount, setNightVisualCount] = useState(0);
  const premiumConfettiShownRef = useRef(false);

  const triggerConfetti = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setConfettiBurst(Date.now());
    window.setTimeout(() => setConfettiBurst(0), 1100);
  }, []);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [statusResult, topResult, recoveryResult, reportResult] = await Promise.allSettled([
        apiFetch<StatusPayload>("/modules/master/night-factory/status", { requireAuth: true, timeoutMs: 20000 }),
        apiFetch<{ items: Opportunity[] }>("/modules/master/night-factory/top-opportunities", { requireAuth: true, timeoutMs: 20000 }),
        apiFetch<{ items: RecoveryOpportunity[] }>("/modules/master/night-factory/recovery-opportunities", { requireAuth: true, timeoutMs: 20000 }),
        apiFetch<ReportPayload>("/modules/master/night-factory/daily-report", { requireAuth: true, timeoutMs: 20000 }),
      ]);
      if (statusResult.status === "fulfilled") setStatus(statusResult.value);
      if (topResult.status === "fulfilled") setOpportunities(topResult.value.items || []);
      if (recoveryResult.status === "fulfilled") setRecovery(recoveryResult.value.items || []);
      if (reportResult.status === "fulfilled") setReport(reportResult.value);
      const failed = [statusResult, topResult, recoveryResult, reportResult].find((item) => item.status === "rejected");
      if (failed && statusResult.status !== "fulfilled") {
        throw failed.reason;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Night Factory.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const premiumCount = Number(status?.summary.premiumOpportunities || report?.summary.premiumOpportunities || opportunities.length || 0);
    if (!allowed || loading || premiumCount <= 0 || premiumConfettiShownRef.current) return;
    premiumConfettiShownRef.current = true;
    triggerConfetti();
  }, [allowed, loading, opportunities.length, report?.summary.premiumOpportunities, status?.summary.premiumOpportunities, triggerConfetti]);

  useEffect(() => {
    if (hasToken !== true) return;
    let mounted = true;

    async function checkAccessAndLoad() {
      setCheckingAccess(true);
      setError(null);
      try {
        const plans = await apiFetch<CommercialPlansPayload>("/commercial-plans/me", { requireAuth: true });
        if (!mounted) return;
        const hasNightFactory = Boolean(plans?.current?.entitlements?.night_factory);
        setAllowed(hasNightFactory);
        if (hasNightFactory) await loadDashboard();
      } catch (err) {
        if (!mounted) return;
        setAllowed(false);
        setError(err instanceof Error ? err.message : "Falha ao validar acesso ao Night Factory.");
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    }

    void checkAccessAndLoad();
    return () => {
      mounted = false;
    };
  }, [hasToken, loadDashboard]);

  useEffect(() => {
    if (!allowed) return;
    const timer = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, status?.worker.running ? 5000 : 20000);
    return () => window.clearInterval(timer);
  }, [allowed, loadDashboard, status?.worker.running]);

  const heroCopy = useMemo(() => {
    if (report?.summary.premiumOpportunities) {
      return `${report.summary.premiumOpportunities} premium • top segmento ${report.summary.topSegment} • top cidade ${report.summary.topCity}`;
    }
    return status?.copy?.subtitle || "Seu servidor transformando ociosidade em oportunidade comercial.";
  }, [report, status?.copy?.subtitle]);

  async function postAction(path: string, success: string) {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await apiFetch(`/modules/master/night-factory/${path}`, {
        method: "POST",
        requireAuth: true,
        timeoutMs: path === "run-now" ? 60000 : 20000,
      });
      setFeedback(success);
      await loadDashboard({ silent: true });
      const premiumCount = Number(status?.summary.premiumOpportunities || report?.summary.premiumOpportunities || opportunities.length || 0);
      if (path === "run-now" && premiumCount > 0) triggerConfetti();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar ação.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const live = loading || saving || Boolean(status?.worker.running);
    if (!live) {
      setNightVisualCount(0);
      clearTopbarProgress("night_factory");
      return undefined;
    }
    const target = Math.max(1, opportunities.length || Number(status?.summary.premiumOpportunities || 0) || 12);
    setNightVisualCount(1);
    const timer = window.setInterval(() => {
      setNightVisualCount((current) => Math.min(target, current + 1));
    }, 190);
    return () => window.clearInterval(timer);
  }, [loading, opportunities.length, saving, status?.summary.premiumOpportunities, status?.worker.running]);

  useEffect(() => {
    const live = loading || saving || Boolean(status?.worker.running);
    if (!live) return;
    dispatchTopbarProgress({
      source: "night_factory",
      phase: "loading",
      title: saving ? "Rodando Night Factory" : "Night Factory acordada",
      status: "A fábrica da madrugada está lendo banco, filtrando negativos e separando oportunidades premium.",
      progress: saving ? 72 : status?.worker.running ? 58 : 34,
      steps: NIGHT_FACTORY_PROGRESS_STEPS,
      activeStepIndex: saving || status?.worker.running ? 2 : 0,
      cardFeed: opportunities.slice(0, Math.max(1, nightVisualCount)).slice(-4).map((lead) => ({
        id: `night:${lead.id}`,
        title: lead.name || "Lead premium",
        meta: [lead.segment, lead.city].filter(Boolean).join(" • ") || "Oportunidade quente detectada",
        score: lead.score,
      })),
      metrics: [
        { label: "Premium", value: metric(status?.summary.premiumOpportunities || opportunities.length) },
        { label: "Recovery", value: metric(status?.summary.recoveryOpportunities) },
        { label: "Status", value: statusLabel(status?.status) },
      ],
    });
  }, [
    loading,
    nightVisualCount,
    opportunities,
    saving,
    status?.status,
    status?.summary.premiumOpportunities,
    status?.summary.recoveryOpportunities,
    status?.worker.running,
  ]);

  if (hasToken === null || checkingAccess) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <section className={styles.loadingShell}>
            <span />
            <span />
            <span />
          </section>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  if (!allowed) {
    return (
      <DashboardScaffold
        title="HBX Night Factory"
        description="Disponível para HBX Lead e HBX Full — Bot e IA."
        actions={<Link href="/planos?intent=night_factory" className="btn btn-secondary btn-sm">Fazer upgrade</Link>}
      >
        <section className={styles.lockedPanel}>
          <span>Night Factory bloqueada</span>
          <h2>A fábrica da madrugada entra no HBX Lead.</h2>
          <p>O HBX List continua com Radar Digital + Vendas. Para rodar oportunidades premium de madrugada, libere o entitlement Night Factory no HBX Lead ou no HBX Full — Bot e IA.</p>
          <Link href="/planos?intent=night_factory">Ver upgrade</Link>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="HBX Night Factory"
      description="Seu servidor transformando ociosidade em oportunidade comercial."
      actions={
        <div className={styles.heroActions}>
          <Link href="/master/webscraping" className="btn btn-secondary btn-sm">Banco dos motores</Link>
          <Link href="/master/sistema" className="btn btn-secondary btn-sm">Command Center</Link>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? "Atualizando" : "Atualizar"}
          </button>
        </div>
      }
    >
      <section className={styles.shell} data-status={status?.status || "dormindo"}>
        {confettiBurst ? (
          <div className={styles.confettiLayer} aria-hidden="true">
            {Array.from({ length: 26 }, (_, index) => (
              <span
                key={`${confettiBurst}:${index}`}
                style={{
                  ["--x" as string]: `${8 + ((index * 17) % 86)}vw`,
                  ["--delay" as string]: `${(index % 7) * 34}ms`,
                  ["--rot" as string]: `${(index * 37) % 360}deg`,
                }}
              />
            ))}
          </div>
        ) : null}
        {error ? <div className={styles.alert} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.alert} data-tone="ok">{feedback}</div> : null}

        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span>Night Factory</span>
            <h2>{status?.copy?.title || "Enquanto você dorme, o HBX caça oportunidades."}</h2>
            <p>{heroCopy}</p>
            {Number(status?.summary.premiumOpportunities || report?.summary.premiumOpportunities || 0) > 0 ? (
              <strong className={styles.emotionalLine}>A fábrica da madrugada encontrou leads premium</strong>
            ) : null}
            <div className={styles.heroButtons}>
              <button type="button" onClick={() => void postAction("run-now", "Night Factory rodada manualmente.")} disabled={saving || status?.worker.running}>
                Rodar agora
              </button>
              {status?.worker.paused ? (
                <button type="button" onClick={() => void postAction("resume", "Night Factory retomada.")} disabled={saving}>
                  Retomar
                </button>
              ) : (
                <button type="button" onClick={() => void postAction("pause", "Night Factory pausada.")} disabled={saving}>
                  Pausar
                </button>
              )}
            </div>
          </div>

          <aside className={styles.statusPanel}>
            <span>Status</span>
            <strong>{statusLabel(status?.status)}</strong>
            <p>{status?.window.nextWindowLabel || "00:00-06:00 America/Sao_Paulo"}</p>
            <small>Última execução {formatDateTime(status?.worker.lastFinishedAt)}</small>
          </aside>
        </header>

        <section className={styles.kpiGrid}>
          <article>
            <span>Leads processados</span>
            <strong>{metric(status?.summary.leadsProcessedToday)}</strong>
          </article>
          <article>
            <span>Oportunidades premium</span>
            <strong>{metric(status?.summary.premiumOpportunities)}</strong>
          </article>
          <article>
            <span>Recovery</span>
            <strong>{metric(status?.summary.recoveryOpportunities)}</strong>
          </article>
          <article>
            <span>Receita potencial</span>
            <strong>{money(status?.summary.potentialRevenueEstimate)}</strong>
          </article>
        </section>

        <section className={styles.pipeline} aria-label="Esteira da madrugada">
          {(status?.pipeline || []).map((step, index) => (
            <article key={step.key} data-state={step.status}>
              <b>{index + 1}</b>
              <span>{step.label}</span>
              <strong>{metric(step.quantity)}</strong>
              <small>{step.status}</small>
            </article>
          ))}
        </section>

        <section className={styles.mainGrid}>
          <article className={styles.topList}>
            <div className={styles.sectionTitle}>
              <div>
                <span>Radar Premium</span>
                <h3>Top Oportunidades</h3>
              </div>
              <strong>{opportunities.length}</strong>
            </div>
            <div className={styles.opportunityList}>
              {opportunities.slice(0, 12).map((lead) => (
                <div key={lead.id} className={styles.opportunityCard} onClick={triggerConfetti} role="button" tabIndex={0} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") triggerConfetti();
                }}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>{[lead.city, lead.state].filter(Boolean).join(" / ") || "Sem cidade"} • {lead.segment || "Segmento aberto"}</span>
                  </div>
                  <b>{lead.score}</b>
                  <p>{lead.reason || "Oportunidade quente detectada pela Night Factory."}</p>
                  <small>{lead.recommendedOffer || "Cards fodões prontos para ação"}</small>
                  <em>Oportunidade quente detectada</em>
                  <div className={styles.rowActions}>
                    <Link href={radarSearchUrl({ radarLeadId: lead.radarLeadId })} onClick={triggerConfetti}>Abrir no Radar</Link>
                    <button type="button" title={lead.miniAudit?.summary || "Mini-auditoria pronta"}>Auditoria</button>
                    <button type="button">Recovery</button>
                  </div>
                </div>
              ))}
              {!opportunities.length ? (
                <div className={styles.emptyState}>
                  <strong>Nenhuma oportunidade enriquecida ainda</strong>
                  <p>Rode agora ou aguarde a janela da madrugada para gerar Radar Premium.</p>
                </div>
              ) : null}
            </div>
          </article>

          <aside className={styles.sideStack}>
            <section className={styles.panelBlock}>
              <div className={styles.sectionTitle}>
                <div>
                  <span>Mapa local</span>
                  <h3>Cidades quentes</h3>
                </div>
              </div>
              {(status?.topCities || []).slice(0, 6).map((city) => (
                <Link key={`${city.city}-${city.state}`} href={radarSearchUrl({ city: city.city, state: city.state })} className={styles.compactRow}>
                  <span>{[city.city, city.state].filter(Boolean).join(" / ")}</span>
                  <strong>{city.averageScore}</strong>
                  <small>{metric(city.totalLeads)} leads</small>
                </Link>
              ))}
            </section>

            <section className={styles.panelBlock}>
              <div className={styles.sectionTitle}>
                <div>
                  <span>Playbooks</span>
                  <h3>Segmentos quentes</h3>
                </div>
              </div>
              {(status?.topSegments || []).slice(0, 6).map((segment) => (
                <Link key={segment.segment} href={radarSearchUrl({ segment: segment.segment })} className={styles.compactRow}>
                  <span>{segment.segment}</span>
                  <strong>{segment.averageScore}</strong>
                  <small>{metric(segment.totalLeads)} leads</small>
                </Link>
              ))}
            </section>
          </aside>
        </section>

        <section className={styles.recoveryBlock}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Recovery 2.0</span>
              <h3>Receita esquecida</h3>
            </div>
            <strong>{recovery.length}</strong>
          </div>
          <div className={styles.recoveryGrid}>
            {recovery.slice(0, 8).map((item) => (
              <Link key={item.id} href={recoveryUrl(item)} className={styles.recoveryCard}>
                <span>{recoverySourceLabel(item.sourceType)}</span>
                <strong>{item.name || "Lead com histórico"}</strong>
                <p>{recoveryCopy(item)}</p>
                <small>Score {item.recoveryScore} • {item.suggestedFlow || "follow-up humano"}</small>
              </Link>
            ))}
            {!recovery.length ? <p className={styles.emptyInline}>Sem oportunidades de recovery agora.</p> : null}
          </div>
        </section>
      </section>
    </DashboardScaffold>
  );
}
