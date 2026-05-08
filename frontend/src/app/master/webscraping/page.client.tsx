"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import {
  HbxSegmentCombobox,
  HbxStateCityPicker,
  HbxTargetTypeSelector,
} from "@/components/prospecting-filters";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type TargetType = "pf" | "pj" | "both";
type Intensity = "economico" | "normal" | "turbo";
type OperationMode = "search" | "control" | "engines";
type EngineStatus = "running" | "waiting" | "offline" | "cooldown" | "paused";
type DiagnosticStatus = "ok" | "warning" | "error";

type CurrentUser = {
  isSystemMaster?: boolean;
};

type DashboardEngine = {
  id: string;
  label: string;
  shortLabel?: string;
  stateLabel?: string;
  detail?: string;
  status: EngineStatus;
  configured?: boolean;
  online?: boolean;
  busy?: boolean;
  active?: boolean;
  usagePercent?: number;
  cooldownUntil?: string | null;
  manualPaused?: boolean;
  pausedUntil?: string | null;
  cardsFabricated: number;
  batches?: number;
  duplicates?: number;
  rejected?: number;
  queue: number;
  lastActivityAt: string | null;
  activeCampaignId?: string | null;
  lastError?: string | null;
  lockUrl?: string | null;
  localhostInProduction?: boolean;
};

type ProductionCard = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  createdAt: string;
  dbStatus: "saved" | "pending" | "error";
};

type DashboardPayload = {
  generatedAt: string;
  turbo: {
    active: boolean;
    scheduledActive?: boolean;
    startedAt: string | null;
    endsAt: string | null;
    remainingSeconds: number;
    startLabel?: string | null;
    endLabel?: string | null;
  };
  summary: {
    cardsToday: number;
    cardsPerMinuteAvg: number;
    activeQueue: number;
    errors24h: number;
    totalConfiguredEngines?: number;
    onlineEngines: number;
    activeEngineLimit?: number;
    runningEngines?: number;
    cooldownEngines?: number;
    pausedEngines?: number;
    offlineEngines?: number;
    totalEngines: number;
  };
  engines: DashboardEngine[];
  production: ProductionCard[];
  diagnostics: {
    queueStatus: DiagnosticStatus;
    databaseStatus: DiagnosticStatus;
    engineHealthStatus: DiagnosticStatus;
    messages: string[];
  };
  warnings: Array<{
    route: string;
    statusCode: number;
    message: string;
    createdAt: string;
  }>;
  status: {
    currentMode: string;
    critical: boolean;
    criticalReason?: string | null;
    localTime?: string | null;
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
  };
};

type FormState = {
  state: string;
  city: string;
  segment: string;
  targetType: TargetType;
  startTime: string;
  endTime: string;
  engineCount: number;
  intensity: Intensity;
  memoryTargetGb: number;
  batchSize: number;
  maxAttemptsPerTask: number;
};

const BRASILIA_TIME_ZONE = "America/Sao_Paulo";
const MAX_HBX_ENGINE_COUNT = 20;
const DEFAULT_ACTIVE_ENGINE_LIMIT = 4;

const DEFAULT_FORM: FormState = {
  state: "",
  city: "",
  segment: "",
  targetType: "pj",
  startTime: "20:00",
  endTime: "08:00",
  engineCount: DEFAULT_ACTIVE_ENGINE_LIMIT,
  intensity: "turbo",
  memoryTargetGb: 16,
  batchSize: 20,
  maxAttemptsPerTask: 3,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function parseTime(value: string, fallbackHour: number) {
  const [hourRaw, minuteRaw] = String(value || "").split(":");
  return {
    hour: clampNumber(hourRaw, fallbackHour, 0, 23),
    minute: clampNumber(minuteRaw, 0, 0, 59),
  };
}

function formatTime(hour?: number | null, minute?: number | null) {
  return `${String(clampNumber(hour, 0, 0, 23)).padStart(2, "0")}:${String(clampNumber(minute, 0, 0, 59)).padStart(2, "0")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: BRASILIA_TIME_ZONE,
  });
}

function formatClock(value?: string | null) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BRASILIA_TIME_ZONE,
  });
}

function formatRemaining(seconds?: number | null) {
  const safe = Math.max(0, Math.trunc(Number(seconds || 0)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours <= 0) return `${minutes}min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function metric(value?: number | null, suffix = "") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `0${suffix}`;
  return `${parsed.toLocaleString("pt-BR")}${suffix}`;
}

function statusLabel(value: EngineStatus) {
  if (value === "paused") return "Pausado pelo usuário";
  if (value === "running") return "Rodando";
  if (value === "cooldown") return "Cooldown";
  if (value === "offline") return "Offline";
  return "Aguardando";
}

function statusTone(value: EngineStatus) {
  if (value === "paused") return "Pausado";
  if (value === "running") return "Operando";
  if (value === "cooldown") return "Cooldown";
  if (value === "offline") return "Sem sinal";
  return "Pronto";
}

function engineUsage(value?: number | null, active?: boolean) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.max(0, Math.min(100, Math.round(parsed)));
  return active ? 76 : 8;
}

function dbStatusLabel(value: ProductionCard["dbStatus"]) {
  if (value === "saved") return "Gravado no banco";
  if (value === "error") return "Erro";
  return "Pendente";
}

function buildTurboPayload(form: FormState) {
  const start = parseTime(form.startTime, 20);
  const end = parseTime(form.endTime, 8);
  return {
    enabled: true,
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

function normalizeIntensity(value: unknown): Intensity {
  const raw = String(value || "").toLowerCase();
  if (raw === "economico" || raw === "econômico") return "economico";
  if (raw === "normal") return "normal";
  return "turbo";
}

function emptyEngines(engines?: DashboardEngine[], count = MAX_HBX_ENGINE_COUNT) {
  const byIndex = new Map((engines || []).map((engine, index) => [index, engine]));
  const engineCount = Math.max(engines?.length || 0, clampNumber(count, MAX_HBX_ENGINE_COUNT, 1, MAX_HBX_ENGINE_COUNT));
  return Array.from({ length: engineCount }, (_, index) => byIndex.get(index) || {
    id: `hbx-engine-${index + 1}`,
    label: `M${index + 1}`,
    status: "offline" as const,
    configured: false,
    online: false,
    busy: false,
    cardsFabricated: 0,
    batches: 0,
    duplicates: 0,
    rejected: 0,
    queue: 0,
    lastActivityAt: null,
    activeCampaignId: null,
    lastError: null,
    lockUrl: null,
    cooldownUntil: null,
    manualPaused: false,
    pausedUntil: null,
    localhostInProduction: false,
  });
}

export default function MasterWebscrapingClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [operationMode, setOperationMode] = useState<OperationMode>("search");
  const [turboConfigDirty, setTurboConfigDirtyState] = useState(false);
  const turboConfigDirtyRef = useRef(false);

  const setTurboConfigDirty = useCallback((value: boolean) => {
    turboConfigDirtyRef.current = value;
    setTurboConfigDirtyState(value);
  }, []);

  const updateTurboConfigForm = useCallback((patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setTurboConfigDirty(true);
  }, [setTurboConfigDirty]);

  const hydrateForm = useCallback((payload: DashboardPayload, options?: { preserveDirty?: boolean }) => {
    if (options?.preserveDirty && turboConfigDirtyRef.current) return;
    const config = payload.config;
    const activeLimit = payload.summary.activeEngineLimit ?? config.engineCount ?? DEFAULT_ACTIVE_ENGINE_LIMIT;
    setForm((current) => ({
      ...current,
      startTime: formatTime(config.startHour, config.startMinute),
      endTime: formatTime(config.endHour, config.endMinute),
      engineCount: clampNumber(config.engineCount, activeLimit, 1, MAX_HBX_ENGINE_COUNT),
      intensity: normalizeIntensity(config.intensity),
      memoryTargetGb: clampNumber(config.memoryTargetGb, 16, 1, 256),
      batchSize: clampNumber(config.batchSize, 20, 1, 20),
      maxAttemptsPerTask: clampNumber(config.maxAttemptsPerTask, 3, 1, 10),
    }));
    setTurboConfigDirty(false);
  }, [setTurboConfigDirty]);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<DashboardPayload>("/modules/master/webscraping/mass-data", {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setDashboard(payload);
      hydrateForm(payload, { preserveDirty: Boolean(options?.silent) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o dashboard de webscraping.");
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
        const user = await apiFetch<CurrentUser>("/profile/current-user", { requireAuth: true });
        if (!mounted) return;
        const isMaster = Boolean(user?.isSystemMaster);
        setAllowed(isMaster);
        if (isMaster) await loadDashboard();
      } catch (err) {
        if (!mounted) return;
        setAllowed(false);
        setError(err instanceof Error ? err.message : "Falha ao validar acesso MASTER.");
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
    const running = (dashboard?.engines || []).some((engine) => engine.status === "running")
      || Number(dashboard?.summary.activeQueue || 0) > 0;
    const timer = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, running ? 3000 : 10000);
    return () => window.clearInterval(timer);
  }, [allowed, dashboard?.engines, dashboard?.summary.activeQueue, loadDashboard]);

  const engines = useMemo(() => {
    const count = dashboard?.summary.totalConfiguredEngines ?? dashboard?.summary.totalEngines ?? form.engineCount;
    return emptyEngines(dashboard?.engines, count);
  }, [dashboard?.engines, dashboard?.summary.totalConfiguredEngines, dashboard?.summary.totalEngines, form.engineCount]);
  const engineStats = useMemo(() => {
    const totalConfigured = dashboard?.summary.totalConfiguredEngines ?? dashboard?.summary.totalEngines ?? (engines.length || form.engineCount);
    const online = dashboard?.summary.onlineEngines ?? engines.filter((engine) => engine.online && engine.status !== "offline").length;
    const activeEngineLimit = dashboard?.summary.activeEngineLimit ?? Math.min(form.engineCount, totalConfigured);
    const running = dashboard?.summary.runningEngines ?? engines.filter((engine) => engine.status === "running" || engine.busy).length;
    const cooldown = dashboard?.summary.cooldownEngines ?? engines.filter((engine) => engine.status === "cooldown").length;
    const paused = dashboard?.summary.pausedEngines ?? engines.filter((engine) => engine.status === "paused" || engine.manualPaused || engine.pausedUntil).length;
    const offline = dashboard?.summary.offlineEngines ?? engines.filter((engine) => engine.status === "offline").length;
    const issues = offline + cooldown + engines.filter((engine) => engine.localhostInProduction || engine.lastError).length;
    return { totalConfigured, online, activeEngineLimit, running, cooldown, paused, offline, issues };
  }, [dashboard?.summary, engines, form.engineCount]);
  const speedometerPanels = useMemo(() => {
    const total = Math.max(1, engineStats.totalConfigured);
    const onlinePercent = Math.round((engineStats.online / total) * 100);
    const activePercent = Math.round((engineStats.activeEngineLimit / total) * 100);
    const rhythmPercent = Math.min(100, Math.round((Number(dashboard?.summary.cardsPerMinuteAvg || 0) / 2) * 100));
    return [
      { label: "Online", value: onlinePercent, metric: `${metric(engineStats.online)}/${metric(engineStats.totalConfigured)}`, detail: "motores com sinal" },
      { label: "Ativos agora", value: activePercent, metric: `${metric(engineStats.activeEngineLimit)}/${metric(engineStats.totalConfigured)}`, detail: "limite da fila" },
      { label: "Ritmo 10 min", value: rhythmPercent, metric: metric(dashboard?.summary.cardsPerMinuteAvg), detail: "cards/min médio" },
    ];
  }, [dashboard?.summary.cardsPerMinuteAvg, engineStats.activeEngineLimit, engineStats.online, engineStats.totalConfigured]);
  const dashboardDescription = dashboard?.turbo.active
    ? `Turbo forçado ativo até ${formatClock(dashboard.turbo.endsAt)}`
    : `Turbo forçado pronto para operar até ${dashboard?.turbo.endLabel || form.endTime}`;
  const clientSearchActive = Boolean(dashboard?.turbo.active);
  const clientSearchArmed = Boolean(dashboard?.config.enabled);
  const operationTabs: Array<{ id: OperationMode; label: string; detail: string }> = [
    {
      id: "search",
      label: "Pesquisa",
      detail: form.state ? [form.city, form.state].filter(Boolean).join(" / ") : "Escolha praça",
    },
    {
      id: "control",
      label: "Ativação",
      detail: clientSearchActive ? "Forçada agora" : clientSearchArmed ? "Agendada" : "Desligada",
    },
    {
      id: "engines",
      label: "Motores",
      detail: `${metric(engineStats.online)} online`,
    },
  ];

  async function activateForcedTurbo() {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<{ control: DashboardPayload }>("/modules/master/webscraping/turbo-noturno/force-now", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 15000,
        body: JSON.stringify({
          ...buildTurboPayload(form),
          forceNow: true,
        }),
      });
      setDashboard(payload.control);
      hydrateForm(payload.control);
      setFeedback(`Turbo forçado ativo até ${formatClock(payload.control.turbo.endsAt)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ativar Turbo Forçado.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateForcedTurbo() {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<{ config: DashboardPayload["config"]; control: DashboardPayload }>("/modules/master/webscraping/turbo-noturno", {
        method: "PUT",
        requireAuth: true,
        timeoutMs: 15000,
        body: JSON.stringify({
          ...buildTurboPayload(form),
          enabled: false,
          forcedUntil: "1970-01-01T00:00:00.000Z",
        }),
      });
      setDashboard(payload.control);
      hydrateForm(payload.control);
      setFeedback("Busca de clientes desligada. Ative novamente para retomar os motores.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desligar o Turbo Forçado.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTurboConfig() {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<{ config: DashboardPayload["config"]; control: DashboardPayload }>("/modules/master/webscraping/turbo-noturno", {
        method: "PUT",
        requireAuth: true,
        timeoutMs: 15000,
        body: JSON.stringify(buildTurboPayload(form)),
      });
      setDashboard(payload.control);
      hydrateForm(payload.control);
      setFeedback("Configuração do Turbo salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a configuração do Turbo.");
    } finally {
      setSaving(false);
    }
  }

  async function createMassDataCampaign() {
    if (!form.state) {
      setError("Escolha um estado para criar a fila de Massa de Dados.");
      return;
    }
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<{ control: DashboardPayload }>("/modules/master/webscraping/mass-data", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 30000,
        body: JSON.stringify({
          ...buildTurboPayload(form),
          state: form.state,
          city: form.city,
          segment: form.segment,
          targetType: form.targetType,
        }),
      });
      setDashboard(payload.control);
      hydrateForm(payload.control);
      setFeedback("Fila de Massa de Dados criada com lotes pequenos.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar a fila de Massa de Dados.");
    } finally {
      setSaving(false);
    }
  }

  async function updateEnginePause(engine: DashboardEngine, action: "pause" | "resume", minutes?: number) {
    if (!engine.id) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const control = await apiFetch<DashboardPayload>(`/modules/master/webscraping/engines/${engine.id}/${action}`, {
        method: "POST",
        requireAuth: true,
        timeoutMs: 15000,
        body: action === "pause" && minutes ? JSON.stringify({ minutes }) : undefined,
      });
      setDashboard(control);
      hydrateForm(control, { preserveDirty: true });
      setFeedback(action === "resume" ? `${engine.label} retomado.` : minutes ? `${engine.label} pausado por 1h.` : `${engine.label} pausado pelo usuário.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar pausa do motor.");
    } finally {
      setSaving(false);
    }
  }

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
        title="Master Webscraping"
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
      title="Master Webscraping"
      description={dashboardDescription}
      actions={
        <div className={styles.heroActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? "Atualizando" : "Atualizar"}
          </button>
        </div>
      }
    >
      <section className={styles.shell} data-critical={dashboard?.status.critical ? "true" : "false"}>
        {error ? <div className={styles.alert} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.alert} data-tone="ok">{feedback}</div> : null}

        <header className={styles.pageHeader}>
          <div className={styles.speedometerPanel} aria-label="Velocímetros operacionais HBX">
            {speedometerPanels.map((panel) => (
              <article
                key={panel.label}
                className={styles.speedometerCard}
                style={{
                  ["--speedometer-value" as string]: `${panel.value}%`,
                  ["--speedometer-angle" as string]: `${panel.value * 1.8}deg`,
                }}
              >
                <span>{panel.label}</span>
                <div className={styles.speedometerDial} aria-hidden="true">
                  <i />
                  <strong>{panel.value}%</strong>
                </div>
                <p>
                  <strong>{panel.metric}</strong>
                  <span>{panel.detail}</span>
                </p>
              </article>
            ))}
          </div>
          <div className={styles.operationalCenter}>
            <div className={styles.operationalHead}>
              <span>Centro operacional</span>
              <h2>{dashboard?.status.currentMode || "STANDBY"}</h2>
              <p>{dashboard?.status.operationalMessage || "Status operacional em leitura."}</p>
            </div>
            <div className={styles.headerOps}>
              <div>
                <span>Online</span>
                <strong>{metric(engineStats.online)} / {metric(engineStats.totalConfigured)}</strong>
              </div>
              <div>
                <span>Ativos agora</span>
                <strong>{metric(engineStats.activeEngineLimit)} / {metric(engineStats.totalConfigured)}</strong>
              </div>
              <div>
                <span>Rodando</span>
                <strong>{metric(engineStats.running)}</strong>
              </div>
              <div>
                <span>Cooldown</span>
                <strong>{metric(engineStats.cooldown)}</strong>
              </div>
              <div>
                <span>Fila</span>
                <strong>{metric(dashboard?.summary.activeQueue)}</strong>
              </div>
              <div className={styles.headerClock}>
                <span>Horário</span>
                <strong>{dashboard?.generatedAt ? formatClock(dashboard.generatedAt) : "--:--"}</strong>
              </div>
            </div>
          </div>
        </header>

        <section className={styles.engineOverview} aria-label="Resumo dos motores HBX">
          <div>
            <span>Total configurado</span>
            <strong>{metric(engineStats.totalConfigured)} motores</strong>
          </div>
          <div>
            <span>Pausados</span>
            <strong>{metric(engineStats.paused)}</strong>
          </div>
          <div>
            <span>Offline</span>
            <strong>{metric(engineStats.offline)}</strong>
          </div>
          <div>
            <span>Batch por lote</span>
            <strong>{metric(form.batchSize)}</strong>
          </div>
        </section>

        <section className={styles.engineGrid} aria-label="Motores HBX">
          {engines.map((engine, index) => {
            const usage = engineUsage(engine.usagePercent, engine.active || engine.busy || engine.status === "running");
            return (
              <article key={engine.id} className={styles.engineCard} data-status={engine.status} style={{ ["--engine-usage" as string]: `${usage}%` }}>
                <div className={styles.engineTop}>
                  <span>{engine.shortLabel || `M${index + 1}`}</span>
                  <strong>{statusTone(engine.status)}</strong>
                </div>
                <div className={styles.engineGauge} aria-hidden="true">
                  <span />
                </div>
                <div className={styles.engineMainMetric}>
                  <span>{engine.stateLabel || statusLabel(engine.status)}</span>
                  <strong>{metric(engine.cardsFabricated)}</strong>
                </div>
                <div className={styles.engineMeta}>
                  <span>Fila <strong>{metric(engine.queue)}</strong></span>
                  <span>Batches <strong>{metric(engine.batches)}</strong></span>
                  <span>Duplicados/Rejeitados <strong>{metric(engine.duplicates)} / {metric(engine.rejected)}</strong></span>
                  <span>Última atividade <strong>{formatDateTime(engine.lastActivityAt)}</strong></span>
                </div>
                <div className={styles.engineActions}>
                  {engine.status === "paused" || engine.manualPaused || engine.pausedUntil ? (
                    <button type="button" onClick={() => void updateEnginePause(engine, "resume")} disabled={saving}>
                      Retomar
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => void updateEnginePause(engine, "pause")} disabled={saving}>
                        Pausar
                      </button>
                      <button type="button" onClick={() => void updateEnginePause(engine, "pause", 60)} disabled={saving}>
                        Pausar 1h
                      </button>
                    </>
                  )}
                </div>
                {engine.localhostInProduction ? (
                  <div className={styles.engineIssue} data-tone="critical">
                    <strong>localhost em produção</strong>
                    <span>{engine.lockUrl || "Corrigir URLs dos motores"}</span>
                  </div>
                ) : engine.lastError ? (
                  <div className={styles.engineIssue}>
                    <strong>Último erro</strong>
                    <span>{engine.lastError}</span>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <div className={styles.economyNotice}>
          Pausar no painel impede uso na fila, mas não desliga o container. Para economizar RAM, reduza HBX_ENGINE_COUNT ou pare os containers.
        </div>

        <section className={styles.smartPanel} aria-label="Painel inteligente de busca de clientes">
          <div className={styles.cardTitle}>
            <span>Painel inteligente</span>
            <strong>{clientSearchActive ? "Busca ativa" : Number(dashboard?.summary.activeQueue || 0) > 0 ? "Fila armada" : "Pronto"}</strong>
          </div>

          <div className={styles.smartTabs} role="tablist" aria-label="Menus de operação">
            {operationTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={operationMode === tab.id}
                data-active={operationMode === tab.id ? "true" : "false"}
                onClick={() => setOperationMode(tab.id)}
              >
                <span>{tab.label}</span>
                <strong>{tab.detail}</strong>
              </button>
            ))}
          </div>

          <div className={styles.smartLayout}>
            <aside className={styles.smartSummary}>
              <div>
                <span>Status</span>
                <strong>{clientSearchActive ? "Turbo forçado" : !clientSearchArmed ? "Busca desligada" : dashboard?.turbo.scheduledActive ? "Janela noturna" : "Standby"}</strong>
                <p>{clientSearchActive ? `Ativo até ${formatClock(dashboard?.turbo.endsAt)}` : !clientSearchArmed ? "Use Ativação para retomar." : `Próxima janela salva até ${dashboard?.turbo.endLabel || form.endTime}`}</p>
              </div>
              <div>
                <span>Fila ativa</span>
                <strong>{metric(dashboard?.summary.activeQueue)}</strong>
                <p>Cards fabricados hoje: {metric(dashboard?.summary.cardsToday)}</p>
              </div>
              <div>
                <span>Entrega</span>
                <strong>Vendas + Atendimento</strong>
                <p>O master mantém a fabricação e os módulos operacionais herdam os cards.</p>
              </div>
            </aside>

            <div className={styles.smartWorkspace}>
              {operationMode === "search" ? (
                <>
                  <div className={styles.smartWorkspaceHeader}>
                    <div>
                      <span>Nova fila Mass Data</span>
                      <strong>Lote pequeno</strong>
                    </div>
                    <button
                      type="button"
                      className={styles.smartInlineAction}
                      onClick={() => setOperationMode("control")}
                    >
                      Ativar ou desligar
                    </button>
                  </div>
                  <div className={styles.campaignForm}>
                    <div className={styles.campaignRow}>
                      <HbxStateCityPicker
                        state={form.state}
                        city={form.city}
                        onStateChange={(value) => setForm((current) => ({ ...current, state: value, city: "" }))}
                        onCityChange={(value) => setForm((current) => ({ ...current, city: value }))}
                        allowAllCities
                      />
                    </div>
                    <div className={styles.campaignRow}>
                      <HbxSegmentCombobox
                        value={form.segment}
                        onChange={(value) => setForm((current) => ({ ...current, segment: value }))}
                        placeholder="Todos os segmentos"
                        helperText="Deixe em branco para a Massa de Dados varrer segmentos amplos."
                      />
                      <HbxTargetTypeSelector
                        value={form.targetType}
                        onChange={(value) => setForm((current) => ({ ...current, targetType: value as TargetType }))}
                        allowedTypes={["pj", "pf", "both"]}
                      />
                    </div>
                    <div className={styles.campaignRow}>
                      <label>
                        Batch por lote
                        <input type="number" min={1} max={20} value={form.batchSize} onChange={(event) => setForm((current) => ({ ...current, batchSize: clampNumber(event.target.value, 20, 1, 20) }))} />
                      </label>
                      <label>
                        Tentativas
                        <input type="number" min={1} max={10} value={form.maxAttemptsPerTask} onChange={(event) => setForm((current) => ({ ...current, maxAttemptsPerTask: clampNumber(event.target.value, 3, 1, 10) }))} />
                      </label>
                    </div>
                    <div className={styles.campaignHelp}>
                      <span>Batch = quantidade por rodada</span>
                      <span>Tentativas = retries por busca</span>
                    </div>
                  </div>
                  <button type="button" className={styles.createCampaignButton} onClick={() => void createMassDataCampaign()} disabled={saving || !form.state}>
                    Criar fila de clientes
                  </button>
                </>
              ) : null}

              {operationMode === "control" ? (
                <>
                  <div className={styles.smartWorkspaceHeader}>
                    <div>
                      <span>Controle de busca</span>
                      <strong>{clientSearchActive ? `Ativo até ${formatClock(dashboard?.turbo.endsAt)}` : "Pronto para ativar"}</strong>
                    </div>
                  </div>
                  <div className={styles.smartActionGrid}>
                    <button type="button" data-tone="start" onClick={() => void activateForcedTurbo()} disabled={saving}>
                      <span>Ativar busca agora</span>
                      <strong>Forçar motores até {form.endTime}</strong>
                    </button>
                    <button type="button" data-tone="stop" onClick={() => void deactivateForcedTurbo()} disabled={saving || !clientSearchArmed}>
                      <span>Desativar busca agora</span>
                      <strong>Pausa janela e turbo forçado</strong>
                    </button>
                    <button type="button" data-tone="save" onClick={() => void saveTurboConfig()} disabled={saving || !turboConfigDirty}>
                      <span>Salvar janela</span>
                      <strong>{turboConfigDirty ? "Há alterações" : "Tudo salvo"}</strong>
                    </button>
                  </div>
                  <div className={styles.smartFacts}>
                    <span>Início <strong>{form.startTime}</strong></span>
                    <span>Fim <strong>{form.endTime}</strong></span>
                    <span>Motores <strong>{metric(form.engineCount)}</strong></span>
                    <span>Intensidade <strong>{form.intensity}</strong></span>
                  </div>
                </>
              ) : null}

              {operationMode === "engines" ? (
                <>
                  <div className={styles.smartWorkspaceHeader}>
                    <div>
                      <span>Controle rápido dos motores</span>
                      <strong>{metric(engineStats.running)} rodando</strong>
                    </div>
                  </div>
                  <div className={styles.smartEngineList}>
                    {engines.slice(0, 8).map((engine) => {
                      const paused = engine.status === "paused" || engine.manualPaused || engine.pausedUntil;
                      return (
                        <article key={engine.id} data-status={engine.status}>
                          <div>
                            <span>{engine.shortLabel || engine.label}</span>
                            <strong>{statusTone(engine.status)}</strong>
                          </div>
                          <button
                            type="button"
                            onClick={() => void updateEnginePause(engine, paused ? "resume" : "pause")}
                            disabled={saving}
                          >
                            {paused ? "Retomar" : "Pausar"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className={styles.mainGrid}>
          <article className={styles.turboCard}>
            <div className={styles.cardTitle}>
              <span>Controle do Turbo Forçado</span>
              <strong>{dashboard?.turbo.active ? "Ativo" : clientSearchArmed ? "Pronto" : "Desligado"}</strong>
            </div>
            <button
              type="button"
              className={styles.turboButton}
              data-active={dashboard?.turbo.active ? "true" : "false"}
              onClick={() => void (dashboard?.turbo.active ? deactivateForcedTurbo() : activateForcedTurbo())}
              disabled={saving}
            >
              <span>{dashboard?.turbo.active ? "Desligar Turbo Forçado" : "Ativar Turbo Forçado"}</span>
              <strong>{dashboard?.turbo.active ? `ativo até ${formatClock(dashboard.turbo.endsAt)}` : `até ${form.endTime}`}</strong>
            </button>
            <div className={styles.turboFacts}>
              <span>Início do turbo <strong>{dashboard?.turbo.startedAt ? formatDateTime(dashboard.turbo.startedAt) : form.startTime}</strong></span>
              <span>Desligamento programado <strong>{dashboard?.turbo.endsAt ? formatDateTime(dashboard.turbo.endsAt) : form.endTime}</strong></span>
              <span>Tempo restante <strong>{dashboard?.turbo.active ? formatRemaining(dashboard.turbo.remainingSeconds) : "Aguardando ativação"}</strong></span>
            </div>
            <div className={styles.configGrid}>
              <label>
                Início
                <input type="time" value={form.startTime} onChange={(event) => updateTurboConfigForm({ startTime: event.target.value })} />
              </label>
              <label>
                Fim
                <input type="time" value={form.endTime} onChange={(event) => updateTurboConfigForm({ endTime: event.target.value })} />
              </label>
              <label>
                Motores
                <input type="number" min={1} max={MAX_HBX_ENGINE_COUNT} value={form.engineCount} onChange={(event) => updateTurboConfigForm({ engineCount: clampNumber(event.target.value, MAX_HBX_ENGINE_COUNT, 1, MAX_HBX_ENGINE_COUNT) })} />
              </label>
              <label>
                Intensidade
                <select value={form.intensity} onChange={(event) => updateTurboConfigForm({ intensity: event.target.value as Intensity })}>
                  <option value="economico">Econômico</option>
                  <option value="normal">Normal</option>
                  <option value="turbo">Turbo</option>
                </select>
              </label>
              <label>
                Memória alvo
                <input type="number" min={1} max={256} value={form.memoryTargetGb} onChange={(event) => updateTurboConfigForm({ memoryTargetGb: clampNumber(event.target.value, 16, 1, 256) })} />
              </label>
            </div>
            <div className={styles.configActions}>
              <span data-dirty={turboConfigDirty ? "true" : "false"}>
                {turboConfigDirty ? "Alterações pendentes" : "Configuração salva"}
              </span>
              <button type="button" className={styles.secondaryButton} onClick={() => void saveTurboConfig()} disabled={saving || !turboConfigDirty}>
                {saving ? "Salvando" : "Salvar configuração"}
              </button>
            </div>
          </article>

          <aside className={styles.diagnosticsCard}>
            <div className={styles.cardTitle}>
              <span>Diagnóstico</span>
              <strong>{dashboard?.diagnostics.engineHealthStatus === "error" ? "Crítico" : dashboard?.diagnostics.engineHealthStatus === "warning" ? "Atenção" : "OK"}</strong>
            </div>
            <div className={styles.diagnosticList}>
              <div data-status={dashboard?.diagnostics.queueStatus || "warning"}>
                <span>Fila de processamento</span>
                <strong>{dashboard?.diagnostics.queueStatus === "error" ? "Erro" : dashboard?.diagnostics.queueStatus === "warning" ? "Atenção" : "OK"}</strong>
              </div>
              <div data-status={dashboard?.diagnostics.databaseStatus || "warning"}>
                <span>Gravações no banco</span>
                <strong>{dashboard?.diagnostics.databaseStatus === "error" ? "Erro" : dashboard?.diagnostics.databaseStatus === "warning" ? "Atenção" : "OK"}</strong>
              </div>
              <div data-status={dashboard?.diagnostics.engineHealthStatus || "warning"}>
                <span>Saúde dos motores</span>
                <strong>{dashboard?.diagnostics.engineHealthStatus === "error" ? "Offline" : dashboard?.diagnostics.engineHealthStatus === "warning" ? "Atenção" : "OK"}</strong>
              </div>
            </div>
            <div className={styles.diagnosticMessages}>
              {(dashboard?.diagnostics.messages || []).length ? (
                dashboard?.diagnostics.messages.slice(0, 6).map((message) => <p key={message}>{message}</p>)
              ) : (
                <p>Sem avisos relevantes no momento.</p>
              )}
            </div>
          </aside>
        </section>

        <section className={styles.kpiGrid} aria-label="Resumo operacional">
          <article>
            <span>Cards fabricados hoje</span>
            <strong>{metric(dashboard?.summary.cardsToday)}</strong>
          </article>
          <article>
            <span>Ativos agora</span>
            <strong>{metric(engineStats.activeEngineLimit)} / {metric(engineStats.totalConfigured)}</strong>
          </article>
          <article>
            <span>Fila ativa</span>
            <strong>{metric(dashboard?.summary.activeQueue)}</strong>
          </article>
          <article>
            <span>Erros 24h</span>
            <strong>{metric(dashboard?.summary.errors24h)}</strong>
          </article>
          <article>
            <span>Online</span>
            <strong>{metric(engineStats.online)} / {metric(engineStats.totalConfigured)}</strong>
          </article>
        </section>

        <section className={styles.lowerGrid}>
          <article className={styles.productionCard}>
            <div className={styles.cardTitle}>
              <span>Cards entregues ao operacional</span>
              <strong>{dashboard?.production.length || 0}</strong>
            </div>
            {(dashboard?.production.length || 0) > 0 ? (
              <div className={styles.productionTable}>
                <div className={styles.productionHead}>
                  <span>Nome / Contato</span>
                  <span>Cidade</span>
                  <span>Fonte</span>
                  <span>Horário</span>
                  <span>Status</span>
                </div>
                {dashboard?.production.map((item) => (
                  <div key={item.id} className={styles.productionRow} data-status={item.dbStatus}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.phone || "Sem telefone"}</small>
                    </span>
                    <span>{[item.city, item.state].filter(Boolean).join(" / ") || "-"}</span>
                    <span>{item.source || "-"}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                    <span><b>{dbStatusLabel(item.dbStatus)}</b></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>Nenhum card gravado ainda</strong>
                <p>Quando os motores salvarem registros reais no banco, Vendas e Atendimento recebem automaticamente.</p>
              </div>
            )}
          </article>
        </section>

        {(dashboard?.warnings.length || 0) > 0 ? (
          <section className={styles.warningStrip}>
            {dashboard?.warnings.slice(0, MAX_HBX_ENGINE_COUNT).map((warning) => (
              <p key={`${warning.route}-${warning.createdAt}`}>
                <strong>{warning.route}</strong>
                <span>{warning.message}</span>
              </p>
            ))}
          </section>
        ) : null}
      </section>
    </DashboardScaffold>
  );
}
