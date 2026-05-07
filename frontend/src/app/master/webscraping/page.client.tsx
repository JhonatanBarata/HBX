"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import { BRAZIL_CITIES_BY_STATE, BRAZIL_STATES } from "@/lib/brazil-locations";
import styles from "./page.module.css";

type TargetType = "pf" | "pj" | "both";
type Intensity = "economico" | "normal" | "turbo";

type CurrentUser = {
  isSystemMaster?: boolean;
};

type EngineStatus = {
  id: string;
  shortLabel?: string | null;
  status: string;
  configured: boolean;
  online: boolean;
  busy: boolean;
  lastError?: string | null;
  usagePercent?: number | null;
  stateLabel?: string | null;
  detail?: string | null;
  lastActivityAt?: string | null;
  activeRunId?: string | null;
  activeCampaignId?: string | null;
  queueShare?: number | null;
  processedLast10Min?: number | null;
  errorCount?: number | null;
  heartbeatAgeSeconds?: number | null;
  isTurboEnabled?: boolean | null;
  isTurboWindowActive?: boolean | null;
  isTurboForcedNow?: boolean | null;
};

type CampaignTask = {
  id: string;
  city: string;
  state: string;
  segment: string;
  targetType?: string | null;
  status: string;
  updatedAt?: string | null;
};

type Campaign = {
  id: string;
  status: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  targetType?: string | null;
  batchSize: number;
  foundCount: number;
  approvedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  taskStatusCounts?: Record<string, number>;
  completedCityCount?: number;
  currentCity?: string | null;
  lastQueryUsed?: string | null;
  progressMessage?: string | null;
  nextRunAt?: string | null;
  updatedAt?: string | null;
  tasks?: CampaignTask[];
};

type LiveFeedItem = {
  id: string;
  type: string;
  message: string;
  detail?: string | null;
  createdAt?: string | null;
};

type MasterControl = {
  generatedAt: string;
  status: {
    resumeEnabled: boolean;
    currentMode: string;
    critical: boolean;
    criticalReason?: string | null;
    nextTurboAt?: string | null;
    localTime?: string | null;
    estimatedMemoryGb?: number | null;
    isTurboEnabled?: boolean;
    isTurboWindowActive?: boolean;
    isTurboForcedNow?: boolean;
    forcedUntil?: string | null;
    operationalMessage?: string | null;
  };
  config: {
    enabled: boolean;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    engineCount: number;
    intensity: Intensity | string;
    memoryTargetGb: number;
    batchSize: number;
    maxAttemptsPerTask: number;
    forcedUntil?: string | null;
    isTurboForcedNow?: boolean;
  };
  engines?: {
    capacity?: {
      queuedCount: number;
      runningCount: number;
      completedLast10Min: number;
      partialLast10Min?: number;
      activeEngineCount?: number;
      operationalStatus: string;
      message?: string | null;
      isTurboEnabled?: boolean;
      isTurboWindowActive?: boolean;
      isTurboForcedNow?: boolean;
      forcedUntil?: string | null;
      nextTurboAt?: string | null;
    };
    engines?: EngineStatus[];
  };
  liveFeed?: LiveFeedItem[];
  campaigns: Campaign[];
};

type FormState = {
  state: string;
  city: string;
  segment: string;
  targetType: TargetType;
  enabled: boolean;
  startTime: string;
  endTime: string;
  engineCount: number;
  intensity: Intensity;
  memoryTargetGb: number;
  batchSize: number;
  maxAttemptsPerTask: number;
};

const DEFAULT_FORM: FormState = {
  state: "",
  city: "",
  segment: "",
  targetType: "both",
  enabled: true,
  startTime: "20:00",
  endTime: "08:00",
  engineCount: 4,
  intensity: "turbo",
  memoryTargetGb: 16,
  batchSize: 20,
  maxAttemptsPerTask: 3,
};

function parseTime(value: string, fallbackHour: number) {
  const [hourRaw, minuteRaw] = String(value || "").split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return {
    hour: Number.isFinite(hour) ? Math.min(Math.max(Math.trunc(hour), 0), 23) : fallbackHour,
    minute: Number.isFinite(minute) ? Math.min(Math.max(Math.trunc(minute), 0), 59) : 0,
  };
}

function formatTime(hour?: number | null, minute?: number | null) {
  const safeHour = Number.isFinite(Number(hour)) ? Math.min(Math.max(Math.trunc(Number(hour)), 0), 23) : 0;
  const safeMinute = Number.isFinite(Number(minute)) ? Math.min(Math.max(Math.trunc(Number(minute)), 0), 59) : 0;
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function engineTone(engine?: EngineStatus | null) {
  const status = String(engine?.status || "").toLowerCase();
  const label = String(engine?.stateLabel || "").toLowerCase();
  if (!engine || !engine.configured || !engine.online || status === "offline" || status === "missing") return "offline";
  if (status === "cooldown" || status === "paused" || status === "retry") return "paused";
  if (status === "error" || status === "degraded") return "error";
  if (engine.busy || status === "busy" || status === "running" || label.includes("rodando")) return "running";
  if (label.includes("fila") || label.includes("turbo")) return "standby";
  return "standby";
}

function engineUsage(engine?: EngineStatus | null) {
  const usage = Number(engine?.usagePercent);
  if (Number.isFinite(usage)) return Math.max(0, Math.min(100, Math.round(usage)));
  const tone = engineTone(engine);
  if (tone === "running") return 84;
  if (tone === "paused") return 12;
  if (tone === "offline" || tone === "error") return 0;
  return 8;
}

function engineStateLabel(engine?: EngineStatus | null) {
  if (!engine) return "Sem healthcheck";
  return engine.stateLabel || statusLabel(engine.status);
}

function statusLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "running") return "Rodando";
  if (status === "queued") return "Na fila";
  if (status === "sleeping") return "Dormindo";
  if (status === "paused") return "Pausada";
  if (status === "completed") return "Concluida";
  if (status === "exhausted") return "Esgotada";
  if (status === "failed") return "Falha";
  if (status === "canceled") return "Cancelada";
  return value || "-";
}

function minutesSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - time) / 60000);
}

function buildPayload(form: FormState) {
  const start = parseTime(form.startTime, 20);
  const end = parseTime(form.endTime, 8);
  return {
    enabled: form.enabled,
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
    engineCount: form.engineCount,
    intensity: form.intensity,
    memoryTargetGb: form.memoryTargetGb,
    batchSize: form.batchSize,
    maxAttemptsPerTask: form.maxAttemptsPerTask,
  };
}

function metricValue(value?: number | null) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "0";
}

function operationalMessage(control: MasterControl | null) {
  if (!control) return "Carregando operação.";
  if (control.status.operationalMessage) return control.status.operationalMessage;
  const capacity = control.engines?.capacity;
  const engines = control.engines?.engines || [];
  const hbx = engines.filter((engine) => String(engine.id || "").startsWith("hbx-engine") && engine.configured);
  const allOffline = hbx.length > 0 && hbx.every((engine) => !engine.online && ["offline", "missing"].includes(String(engine.status || "").toLowerCase()));
  if (allOffline) return "Todos os motores HBX falharam no healthcheck.";
  if (control.status.isTurboForcedNow) return "Turbo forçado ativo.";
  if (control.status.isTurboEnabled && !control.status.isTurboWindowActive) return `Turbo armado para ${formatDateTime(control.status.nextTurboAt)}.`;
  if (Number(capacity?.queuedCount || 0) > 0 && Number(capacity?.runningCount || 0) === 0) return "Fila aguardando motor elegível.";
  if (capacity?.operationalStatus === "degraded") return capacity.message || "Capacidade degradada.";
  if (Number(capacity?.queuedCount || 0) === 0) return "Motores em standby, aguardando trabalho.";
  return "Operação ativa.";
}

export default function MasterWebscrapingClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [control, setControl] = useState<MasterControl | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const hydrateForm = useCallback((payload: MasterControl) => {
    const config = payload.config;
    setForm((current) => ({
      ...current,
      enabled: Boolean(config.enabled),
      startTime: formatTime(config.startHour, config.startMinute),
      endTime: formatTime(config.endHour, config.endMinute),
      engineCount: Math.min(Math.max(Number(config.engineCount || 4), 1), 4),
      intensity: String(config.intensity || "turbo") === "economico" ? "economico" : String(config.intensity || "turbo") === "normal" ? "normal" : "turbo",
      memoryTargetGb: Number(config.memoryTargetGb || 16),
      batchSize: Math.min(Math.max(Number(config.batchSize || 20), 1), 20),
      maxAttemptsPerTask: Math.min(Math.max(Number(config.maxAttemptsPerTask || 3), 1), 10),
    }));
  }, []);

  const loadControl = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<MasterControl>("/modules/master/webscraping/mass-data", {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setControl(payload);
      hydrateForm(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Massa de Dados.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [hydrateForm]);

  useEffect(() => {
    if (hasToken !== true) return;
    let mounted = true;

    async function checkAccessAndLoad() {
      setCheckingAccess(true);
      setError(null);
      try {
        const user = await apiFetch<CurrentUser>("/profile/current-user");
        if (!mounted) return;
        const isMaster = Boolean(user?.isSystemMaster);
        setAllowed(isMaster);
        if (isMaster) await loadControl();
      } catch (err) {
        if (!mounted) return;
        setAllowed(false);
        setError(err instanceof Error ? err.message : "Falha ao validar acesso.");
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    }

    void checkAccessAndLoad();
    return () => {
      mounted = false;
    };
  }, [hasToken, loadControl]);

  useEffect(() => {
    if (!allowed) return;
    const running = control?.campaigns.some((campaign) => ["running", "queued", "partial_error"].includes(String(campaign.status || "")))
      || Number(control?.engines?.capacity?.runningCount || 0) > 0
      || Number(control?.engines?.capacity?.queuedCount || 0) > 0;
    const timer = window.setInterval(() => {
      void loadControl({ silent: true });
    }, running ? 3000 : 10000);
    return () => window.clearInterval(timer);
  }, [allowed, control?.campaigns, control?.engines?.capacity?.queuedCount, control?.engines?.capacity?.runningCount, loadControl]);

  const cityOptions = useMemo(() => {
    if (!form.state) return [];
    return BRAZIL_CITIES_BY_STATE[form.state] || [];
  }, [form.state]);

  const hbxEngines = useMemo(() => {
    const engines = (control?.engines?.engines || []).filter((engine) => String(engine.id || "").startsWith("hbx-engine"));
    return Array.from({ length: 4 }, (_, index) => engines[index] || null);
  }, [control?.engines?.engines]);

  const activeCampaign = useMemo(() => {
    return control?.campaigns.find((campaign) => ["running", "queued", "sleeping", "partial_error"].includes(String(campaign.status))) || control?.campaigns[0] || null;
  }, [control?.campaigns]);

  const liveFeed = useMemo(() => control?.liveFeed || [], [control?.liveFeed]);
  const leadsPerMinute = liveFeed.filter((item) => item.type === "lead_saved" && minutesSince(item.createdAt) <= 1).length;
  const tasksPerMinute = liveFeed.filter((item) => item.type.startsWith("task_") && minutesSince(item.createdAt) <= 1).length;
  const taskCounts = activeCampaign?.taskStatusCounts || {};
  const totalTasks = Object.values(taskCounts).reduce((sum, value) => sum + Number(value || 0), 0);

  async function saveTurboConfig() {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<{ control: MasterControl }>("/modules/master/webscraping/turbo-noturno", {
        method: "PUT",
        requireAuth: true,
        timeoutMs: 15000,
        body: JSON.stringify(buildPayload(form)),
      });
      setControl(payload.control);
      hydrateForm(payload.control);
      setFeedback("Turbo Noturno salvo no banco.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar Turbo Noturno.");
    } finally {
      setSaving(false);
    }
  }

  async function activateMassData() {
    if (!form.state) {
      setError("Escolha um estado para ativar a Massa de Dados.");
      return;
    }
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<{ control: MasterControl }>("/modules/master/webscraping/mass-data", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 30000,
        body: JSON.stringify({
          ...buildPayload(form),
          state: form.state,
          city: form.city,
          segment: form.segment,
          targetType: form.targetType,
        }),
      });
      setControl(payload.control);
      hydrateForm(payload.control);
      setFeedback("Massa de Dados ativada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ativar Massa de Dados.");
    } finally {
      setSaving(false);
    }
  }

  async function forceTurboNow() {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<{ control: MasterControl }>("/modules/master/webscraping/turbo-noturno/force-now", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 15000,
        body: JSON.stringify(buildPayload({ ...form, enabled: true })),
      });
      setControl(payload.control);
      hydrateForm(payload.control);
      setFeedback("Turbo forçado ativo agora.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao forçar Turbo agora.");
    } finally {
      setSaving(false);
    }
  }

  async function runCampaignAction(campaignId: string, action: "pause" | "resume" | "cancel") {
    setActionId(`${campaignId}:${action}`);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<MasterControl>(`/modules/master/webscraping/mass-data/${campaignId}/${action}`, {
        method: "POST",
        requireAuth: true,
        timeoutMs: 15000,
      });
      setControl(payload);
      hydrateForm(payload);
      setFeedback(action === "pause" ? "Campanha pausada." : action === "resume" ? "Campanha retomada." : "Campanha cancelada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar ação.");
    } finally {
      setActionId(null);
    }
  }

  if (hasToken === null || checkingAccess) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando painel Master...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  if (!allowed) {
    return (
      <DashboardScaffold
        title="Master / Webscraping / Radar"
        description="Acesso exclusivo do usuário MASTER."
        actions={<Link href="/master" className="btn btn-secondary btn-sm">Voltar ao Master</Link>}
      >
        <section className="panel p-4">
          <p className="text-sm text-muted">Seu usuário não tem permissão para acessar esta tela.</p>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Master / Webscraping / Radar"
      description="Massa de Dados Noturna com retomada automática e quatro motores HBX."
      actions={
        <div className="flex flex-wrap gap-2 justify-end">
          <Link href="/webscraping" className="btn btn-secondary btn-sm">Ver banco</Link>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadControl()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void forceTurboNow()} disabled={saving}>
            Forçar Turbo Agora
          </button>
          <Link href="/master" className="btn btn-secondary btn-sm">Voltar</Link>
        </div>
      }
    >
      <section className={styles.shell} data-critical={control?.status.critical ? "true" : "false"}>
        {error ? <div className={styles.alert} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.alert} data-tone="ok">{feedback}</div> : null}

        <div className={styles.headerGrid}>
          <article className={styles.heroPanel}>
            <div className={styles.heroTopline}>
              <span>{control?.status.currentMode || "STANDBY"}</span>
              <strong>continua de onde parou: {control?.status.resumeEnabled ? "ligado" : "desligado"}</strong>
            </div>
            <p className={styles.operationalMessage}>{operationalMessage(control)}</p>
            <div className={styles.engineRow}>
              {hbxEngines.map((engine, index) => (
                <div
                  key={engine?.id || index}
                  className={styles.battery}
                  data-state={engineTone(engine)}
                  style={{ ["--usage" as string]: `${engineUsage(engine)}%` }}
                  title={engine?.detail || engine?.lastError || statusLabel(engine?.status)}
                >
                  <div>
                    <span>M{index + 1}</span>
                    <strong>{engineStateLabel(engine)}</strong>
                  </div>
                  <b>{engineUsage(engine)}%</b>
                  <i />
                </div>
              ))}
            </div>
            <div className={styles.heroMetrics}>
              <span>Agora <strong>{control?.status.localTime || "-"}</strong></span>
              <span>Próximo turbo <strong>{formatDateTime(control?.status.nextTurboAt)}</strong></span>
              <span>Turbo forçado <strong>{control?.status.isTurboForcedNow ? `até ${formatDateTime(control?.status.forcedUntil)}` : "inativo"}</strong></span>
              <span>Fila <strong>{metricValue(control?.engines?.capacity?.queuedCount)} cards</strong></span>
              <span>Rodando <strong>{metricValue(control?.engines?.capacity?.runningCount)} tarefas</strong></span>
              <span>Últimos 10 min <strong>{metricValue(control?.engines?.capacity?.completedLast10Min)} lotes</strong></span>
            </div>
            {control?.status.critical ? (
              <p className={styles.critical}>{control.status.criticalReason || "Falha crítica no radar."}</p>
            ) : null}
          </article>

          <article className={styles.graphPanel}>
            <div className={styles.graphHeader}>
              <span>Gráfico vivo</span>
              <strong>{leadsPerMinute} leads/min</strong>
            </div>
            <div className={styles.bars}>
              <i style={{ height: `${Math.max(16, Math.min(100, leadsPerMinute * 22))}%` }} />
              <i style={{ height: `${Math.max(16, Math.min(100, tasksPerMinute * 24))}%` }} />
              <i style={{ height: `${Math.max(16, Math.min(100, hbxEngines.filter((engine) => engineTone(engine) === "running").length * 25))}%` }} />
            </div>
            <div className={styles.graphLegend}>
              <span>Leads/min</span>
              <span>Tasks/min</span>
              <span>Motores</span>
            </div>
          </article>
        </div>

        <div className={styles.grid}>
          <article className={styles.controlCard}>
            <div className={styles.cardTitle}>
              <span>Massa de Dados Noturna</span>
              <strong>Turbo Noturno</strong>
            </div>
            <div className={styles.formGrid}>
              <label>
                Estado
                <select value={form.state} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value, city: "" }))}>
                  <option value="">Escolha</option>
                  {BRAZIL_STATES.map((state) => (
                    <option key={state.uf} value={state.uf}>{state.uf} - {state.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Cidade
                <select value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} disabled={!form.state}>
                  <option value="">Todas</option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </label>
              <label>
                Segmento
                <input value={form.segment} onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))} placeholder="Aberto" />
              </label>
              <label>
                Tipo
                <select value={form.targetType} onChange={(event) => setForm((current) => ({ ...current, targetType: event.target.value as TargetType }))}>
                  <option value="both">PF + PJ</option>
                  <option value="pj">PJ</option>
                  <option value="pf">PF</option>
                </select>
              </label>
              <label>
                Início
                <input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} />
              </label>
              <label>
                Fim
                <input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} />
              </label>
              <label>
                Motores
                <input type="number" min={1} max={4} value={form.engineCount} onChange={(event) => setForm((current) => ({ ...current, engineCount: Math.min(Math.max(Number(event.target.value || 4), 1), 4) }))} />
              </label>
              <label>
                Intensidade
                <select value={form.intensity} onChange={(event) => setForm((current) => ({ ...current, intensity: event.target.value as Intensity }))}>
                  <option value="economico">Econômico</option>
                  <option value="normal">Normal</option>
                  <option value="turbo">Turbo</option>
                </select>
              </label>
              <label>
                Memória alvo
                <input type="number" min={1} max={256} value={form.memoryTargetGb} onChange={(event) => setForm((current) => ({ ...current, memoryTargetGb: Number(event.target.value || 16) }))} />
              </label>
              <label>
                Batch por lote
                <input type="number" min={1} max={20} value={form.batchSize} onChange={(event) => setForm((current) => ({ ...current, batchSize: Math.min(Math.max(Number(event.target.value || 20), 1), 20) }))} />
              </label>
              <label>
                Tentativas por isca
                <input type="number" min={1} max={10} value={form.maxAttemptsPerTask} onChange={(event) => setForm((current) => ({ ...current, maxAttemptsPerTask: Math.min(Math.max(Number(event.target.value || 3), 1), 10) }))} />
              </label>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => void saveTurboConfig()} disabled={saving}>
                Ativar Turbo Noturno
              </button>
              <button type="button" onClick={() => void forceTurboNow()} disabled={saving}>
                Forçar Turbo Agora
              </button>
              <button type="button" data-primary="true" onClick={() => void activateMassData()} disabled={saving || !form.state}>
                Ativar Massa de Dados
              </button>
            </div>
          </article>

          <article className={styles.statusCard}>
            <div className={styles.cardTitle}>
              <span>Operação atual</span>
              <strong>{statusLabel(activeCampaign?.status)}</strong>
            </div>
            <div className={styles.kpiGrid}>
              <span>Cidade atual <strong>{activeCampaign?.currentCity || activeCampaign?.city || "Todas"}</strong></span>
              <span>Estado <strong>{activeCampaign?.state || form.state || "-"}</strong></span>
              <span>Cidades finalizadas <strong>{metricValue(activeCampaign?.completedCityCount)}</strong></span>
              <span>Leads únicos <strong>{metricValue(activeCampaign?.approvedCount)}</strong></span>
              <span>Duplicados <strong>{metricValue(activeCampaign?.duplicateCount)}</strong></span>
              <span>Rejeitados <strong>{metricValue(activeCampaign?.rejectedCount)}</strong></span>
            </div>
            <div className={styles.taskPills}>
              {["queued", "running", "completed", "exhausted", "failed"].map((status) => (
                <span key={status}>{statusLabel(status)} <strong>{metricValue(taskCounts[status])}</strong></span>
              ))}
            </div>
            <p className={styles.queryLine}>{activeCampaign?.lastQueryUsed || activeCampaign?.progressMessage || `Total de tarefas: ${totalTasks}`}</p>
          </article>
        </div>

        <div className={styles.grid}>
          <article className={styles.feedCard}>
            <div className={styles.cardTitle}>
              <span>Feed ao vivo</span>
              <strong>{liveFeed.length}</strong>
            </div>
            <div className={styles.feedList}>
              {liveFeed.length === 0 ? (
                <p>{Number(control?.engines?.capacity?.queuedCount || 0) > 0 || activeCampaign ? "Aguardando próximo lote com a fila carregada." : "Motores em standby, aguardando trabalho."}</p>
              ) : liveFeed.slice(0, 12).map((item) => (
                <div key={item.id} className={styles.feedItem} data-type={item.type}>
                  <strong>{item.message}</strong>
                  <span>{item.detail || "-"}</span>
                  <small>{formatDateTime(item.createdAt)}</small>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.campaignCard}>
            <div className={styles.cardTitle}>
              <span>Campanhas</span>
              <strong>{control?.campaigns.length || 0}</strong>
            </div>
            <div className={styles.campaignList}>
              {(control?.campaigns || []).length === 0 ? (
                <p>Nenhuma campanha mass_data criada.</p>
              ) : control?.campaigns.map((campaign) => (
                <div key={campaign.id} className={styles.campaignRow}>
                  <div>
                    <strong>{campaign.state || "-"} / {campaign.currentCity || campaign.city || "Todas"}</strong>
                    <span>{statusLabel(campaign.status)} · {campaign.targetType?.toUpperCase() || "PF+PJ"} · lote {campaign.batchSize}</span>
                  </div>
                  <div className={styles.rowActions}>
                    <button type="button" onClick={() => void runCampaignAction(campaign.id, "pause")} disabled={Boolean(actionId) || !["queued", "running", "sleeping", "partial_error"].includes(campaign.status)}>
                      Pausar
                    </button>
                    <button type="button" onClick={() => void runCampaignAction(campaign.id, "resume")} disabled={Boolean(actionId) || campaign.status !== "paused"}>
                      Continuar
                    </button>
                    <button type="button" onClick={() => void runCampaignAction(campaign.id, "cancel")} disabled={Boolean(actionId) || ["completed", "failed", "canceled"].includes(campaign.status)}>
                      Cancelar
                    </button>
                    <Link href="/webscraping">Ver banco</Link>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </DashboardScaffold>
  );
}
