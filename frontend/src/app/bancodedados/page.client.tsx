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

type CampaignSummary = {
  id: string;
  status?: string | null;
  mode?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  targetType?: string | null;
  foundCount?: number | null;
  approvedCount?: number | null;
  targetTotal?: number | null;
  currentAttempt?: number | null;
  maxAttempts?: number | null;
  progressMessage?: string | null;
  lastErrorMessage?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type SchedulerPayload = {
  manualReservedEngines?: number;
  automaticAllowedEngines?: number;
  memoryPressurePercent?: number;
  googleMode?: "manual_only" | string;
  manualDemandActive?: boolean;
  productionMode?: "full" | "reduced" | "protected" | string;
};

type AutonomousStrategyPayload = {
  mode?: "guided" | "automatic" | string;
  selectedState?: string | null;
  selectedCity?: string | null;
  selectedSegment?: string | null;
  reason?: string | null;
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
  scheduler?: SchedulerPayload;
  autonomousStrategy?: AutonomousStrategyPayload;
  engines: DashboardEngine[];
  production: ProductionCard[];
  campaigns?: CampaignSummary[];
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
    autonomousFillEnabled: boolean;
    autonomousFillBatchSize: number;
  };
};

type WebscrapingRuntimePayload = {
  native?: {
    googleApiKeyConfigured?: boolean;
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
  autonomousFillEnabled: boolean;
  autonomousFillBatchSize: number;
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
  autonomousFillEnabled: true,
  autonomousFillBatchSize: 60,
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

function buildTurboPayload(form: FormState, options?: { enabled?: boolean }) {
  const start = parseTime(form.startTime, 20);
  const end = parseTime(form.endTime, 8);
  return {
    enabled: options?.enabled ?? true,
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
    engineCount: form.engineCount,
    intensity: form.intensity,
    memoryTargetGb: form.memoryTargetGb,
    batchSize: form.batchSize,
    maxAttemptsPerTask: form.maxAttemptsPerTask,
    autonomousFillEnabled: form.autonomousFillEnabled,
    autonomousFillBatchSize: form.autonomousFillBatchSize,
  };
}

function normalizeIntensity(value: unknown): Intensity {
  const raw = String(value || "").toLowerCase();
  if (raw === "economico" || raw === "econômico") return "economico";
  if (raw === "normal") return "normal";
  return "turbo";
}

function intensityLabel(value: unknown, scheduler?: SchedulerPayload) {
  if (scheduler) return "Inteligente";
  const normalized = normalizeIntensity(value);
  if (normalized === "economico") return "Econômico";
  if (normalized === "normal") return "Normal";
  return "Turbo";
}

function productionModeLabel(scheduler?: SchedulerPayload) {
  if (scheduler?.manualDemandActive) return "Reserva manual ativa";
  if (scheduler?.productionMode === "protected" || scheduler?.productionMode === "reduced") {
    return "Produção reduzida para proteger clientes";
  }
  return "Banco trabalhando 24h";
}

function googleApiLabel(runtime: WebscrapingRuntimePayload | null) {
  if (runtime?.native?.googleApiKeyConfigured === false) return "Google API não configurado";
  if (runtime?.native?.googleApiKeyConfigured === true) return "Google API reservado para busca manual";
  return "Google API reservado para busca manual";
}

function autonomousReasonLabel(value?: string | null) {
  if (value === "guided_filter") return "filtros do MASTER";
  if (value === "low_stock") return "estoque baixo no Radar";
  if (value === "low_duplicate_recent") return "cidade/segmento com baixa duplicidade recente";
  if (value === "unexplored") return "cidade/segmento pouco explorado";
  return "rotação nacional controlada";
}

function workLabel(strategy?: AutonomousStrategyPayload) {
  return [strategy?.selectedCity, strategy?.selectedState, strategy?.selectedSegment].filter(Boolean).join(" / ") || "Aguardando seleção automática";
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

export default function BancoDeDadosClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [runtime, setRuntime] = useState<WebscrapingRuntimePayload | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
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
      autonomousFillEnabled: Boolean(config.autonomousFillEnabled),
      autonomousFillBatchSize: clampNumber(config.autonomousFillBatchSize, 60, 1, 300),
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
      setError(err instanceof Error ? err.message : "Falha ao carregar o banco de dados dos motores.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [hydrateForm]);

  const loadRuntime = useCallback(async () => {
    try {
      const payload = await apiFetch<WebscrapingRuntimePayload>("/webscraping/runtime", {
        requireAuth: true,
        timeoutMs: 10000,
      });
      setRuntime(payload);
    } catch {
      setRuntime(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadDashboard(),
      loadRuntime(),
    ]);
  }, [loadDashboard, loadRuntime]);

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
        if (isMaster) {
          await Promise.all([
            loadDashboard(),
            loadRuntime(),
          ]);
        }
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
  }, [hasToken, loadDashboard, loadRuntime]);

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
  const scheduler = dashboard?.scheduler;
  const autonomousStrategy = dashboard?.autonomousStrategy;
  const hasGuidedFilters = Boolean(form.state || form.city || form.segment);
  const strategyModeLabel = hasGuidedFilters ? "Modo Guiado" : "Modo Automático Nacional";
  const selectedWorkLabel = workLabel(autonomousStrategy);
  const automaticAllowedEngines = scheduler?.automaticAllowedEngines ?? Math.max(1, engineStats.activeEngineLimit - 2);
  const manualReservedEngines = scheduler?.manualReservedEngines ?? Math.max(0, Math.min(2, engineStats.totalConfigured - automaticAllowedEngines));
  const dashboardDescription = productionModeLabel(scheduler);
  const clientSearchActive = Boolean(dashboard?.turbo.active);
  const clientSearchArmed = Boolean(dashboard?.config.enabled);

  function requestGuidedFilters() {
    setError(null);
    setFeedback("Use os campos de estado, cidade ou segmento para colocar o banco em Modo Guiado.");
  }

  function clearGuidedFilters() {
    setError(null);
    setForm((current) => ({ ...current, state: "", city: "", segment: "" }));
    setFeedback("Sem filtros: o banco 24h vai escolher praças automaticamente.");
  }

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
      setFeedback(`Coleta ligada até ${formatClock(payload.control.turbo.endsAt)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ligar a coleta dos motores.");
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
      setFeedback("Coleta dos motores desligada. A fila normal permanece conforme configuração salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desligar a coleta dos motores.");
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
        body: JSON.stringify(buildTurboPayload(form, { enabled: clientSearchArmed })),
      });
      setDashboard(payload.control);
      hydrateForm(payload.control);
      setFeedback("Configuração do banco de dados salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a configuração do banco de dados.");
    } finally {
      setSaving(false);
    }
  }

  async function createMassDataCampaign() {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const payload = await apiFetch<{ control: DashboardPayload }>("/modules/master/webscraping/mass-data", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 30000,
        body: JSON.stringify({
          ...buildTurboPayload(form, { enabled: clientSearchArmed }),
          state: form.state,
          city: form.city,
          segment: form.segment,
          targetType: form.targetType,
        }),
      });
      setDashboard(payload.control);
      hydrateForm(payload.control);
      setFeedback(form.state || form.city || form.segment ? "Fila guiada do banco de dados criada." : "Fila autônoma do banco de dados criada com rotação nacional.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar a fila do banco de dados.");
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
        title="Banco de Dados dos Motores"
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
      title="Banco de Dados dos Motores"
      description={dashboardDescription}
      actions={
        <div className={styles.heroActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => void refreshAll()} disabled={loading}>
            {loading ? "Atualizando" : "Atualizar"}
          </button>
        </div>
      }
    >
      <section className={styles.shell} data-critical={dashboard?.status.critical ? "true" : "false"}>
        {error ? <div className={styles.alert} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.alert} data-tone="ok">{feedback}</div> : null}

        <section className={styles.controlCenter} aria-label="Central do Banco 24h">
          <div className={styles.controlHeader}>
            <div>
              <span>Central do Banco 24h</span>
              <h2>Banco de Dados dos Motores</h2>
              <p>
                {clientSearchActive
                  ? "Banco trabalhando 24h"
                  : clientSearchArmed
                    ? "Banco 24h configurado para trabalhar na janela salva"
                    : "Banco desligado"}
              </p>
            </div>
            <div className={styles.controlStatus} data-mode={scheduler?.productionMode || "full"}>
              <strong>{productionModeLabel(scheduler)}</strong>
              <span>{dashboard?.status.operationalMessage || dashboard?.status.currentMode || "Status operacional em leitura."}</span>
            </div>
          </div>

          <div className={styles.controlCards}>
            <article className={styles.controlCard}>
              <span>Produção</span>
              <strong>{clientSearchActive ? "Banco trabalhando 24h" : clientSearchArmed ? "Janela salva" : "Desligado"}</strong>
              <p>Modo {intensityLabel(form.intensity, scheduler)} · {form.startTime} até {form.endTime}</p>
              <p>{strategyModeLabel}: {selectedWorkLabel}</p>
              <div className={styles.cardInlineActions}>
                <button type="button" data-tone="success" onClick={() => void activateForcedTurbo()} disabled={saving}>
                  Ligar banco 24h
                </button>
                <button type="button" onClick={() => void deactivateForcedTurbo()} disabled={saving || !clientSearchArmed}>
                  Desligar banco
                </button>
              </div>
            </article>

            <article className={styles.controlCard}>
              <span>Motores HBX</span>
              <strong>{metric(engineStats.online)} / {metric(engineStats.totalConfigured)} online</strong>
              <p>{metric(engineStats.running)} rodando · {metric(engineStats.paused)} pausados · {metric(engineStats.cooldown)} cooldown · {metric(engineStats.offline)} offline</p>
              <div className={styles.miniMetrics}>
                <span>Reserva manual <strong>{metric(manualReservedEngines)}</strong></span>
                <span>Automático permitido <strong>{metric(automaticAllowedEngines)}</strong></span>
              </div>
            </article>

            <article className={styles.controlCard}>
              <span>Reserva do Cliente</span>
              <strong>{scheduler?.manualDemandActive ? "Reserva manual ativa" : "Capacidade protegida"}</strong>
              <p>{scheduler?.manualDemandActive ? "Cliente usando busca manual. Produção automática reduzida." : "Motores reservados para Radar e Vendas manual."}</p>
              <div className={styles.miniMetrics}>
                <span>Manual <strong>{metric(manualReservedEngines)}</strong></span>
                <span>Fila ativa <strong>{metric(dashboard?.summary.activeQueue)}</strong></span>
              </div>
            </article>

            <article className={styles.controlCard}>
              <span>Google API</span>
              <strong>{googleApiLabel(runtime)}</strong>
              <p>Modo: Reservado para busca manual. Nunca alimenta banco automático.</p>
              <div className={styles.miniMetrics}>
                <span>Status <strong>{runtime?.native?.googleApiKeyConfigured === false ? "Não configurado" : "Manual"}</strong></span>
                <span>Banco <strong>Bloqueado</strong></span>
              </div>
            </article>

            <article className={styles.controlCard}>
              <span>Saúde</span>
              <strong>{dashboard?.diagnostics.engineHealthStatus === "error" ? "Crítico" : dashboard?.diagnostics.engineHealthStatus === "warning" ? "Atenção" : "Operacional"}</strong>
              <p>{metric(dashboard?.summary.cardsToday)} cards hoje · {metric(dashboard?.summary.errors24h)} erros 24h</p>
              <div className={styles.miniMetrics}>
                <span>Pressão <strong>{metric(scheduler?.memoryPressurePercent, "%")}</strong></span>
                <span>Fila <strong>{metric(dashboard?.summary.activeQueue)}</strong></span>
              </div>
            </article>
          </div>

          <div className={styles.controlActions}>
            <button type="button" data-tone="success" onClick={() => void activateForcedTurbo()} disabled={saving}>
              Ligar banco 24h
            </button>
            <button type="button" onClick={() => void deactivateForcedTurbo()} disabled={saving || !clientSearchArmed}>
              Desligar banco
            </button>
            <button type="button" data-tone="info" onClick={() => void activateForcedTurbo()} disabled={saving}>
              Forçar turbo agora
            </button>
            <button type="button" data-tone="info" onClick={() => void saveTurboConfig()} disabled={saving || !turboConfigDirty}>
              Salvar configuração
            </button>
            <button type="button" onClick={() => void refreshAll()} disabled={loading}>
              Atualizar status
            </button>
          </div>

          <div className={styles.configPanel}>
            <div className={styles.panelTitle}>
              <span>Configurações editáveis</span>
              <strong>{turboConfigDirty ? "Alterações pendentes" : "Configuração salva"}</strong>
            </div>

            <div className={styles.configGrid}>
              <label>
                Horário inicial
                <input type="time" value={form.startTime} onChange={(event) => updateTurboConfigForm({ startTime: event.target.value })} />
              </label>
              <label>
                Horário final
                <input type="time" value={form.endTime} onChange={(event) => updateTurboConfigForm({ endTime: event.target.value })} />
              </label>
              <label>
                Motores HBX
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
              <label>
                Batch por lote
                <input type="number" min={1} max={20} value={form.batchSize} onChange={(event) => updateTurboConfigForm({ batchSize: clampNumber(event.target.value, 20, 1, 20) })} />
              </label>
              <label>
                Tentativas por tarefa
                <input type="number" min={1} max={10} value={form.maxAttemptsPerTask} onChange={(event) => updateTurboConfigForm({ maxAttemptsPerTask: clampNumber(event.target.value, 3, 1, 10) })} />
              </label>
              <label>
                Recarga automática
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={form.autonomousFillBatchSize}
                  onChange={(event) => updateTurboConfigForm({ autonomousFillBatchSize: clampNumber(event.target.value, 60, 1, 300) })}
                />
              </label>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={form.autonomousFillEnabled}
                  onChange={(event) => updateTurboConfigForm({ autonomousFillEnabled: event.target.checked })}
                />
                <span>Banco autônomo ligado</span>
              </label>
              <label>
                Reserva manual
                <input type="number" value={manualReservedEngines} readOnly />
              </label>
            </div>
          </div>

          <div className={styles.queuePanel}>
            <div className={styles.panelTitle}>
              <span>Criar fila do banco</span>
              <strong>{strategyModeLabel}</strong>
            </div>
            <div className={styles.strategyBoard} data-mode={hasGuidedFilters ? "guided" : "automatic"}>
              <div>
                <span>Estratégia atual</span>
                <strong>{strategyModeLabel}</strong>
                <p>
                  {hasGuidedFilters
                    ? `Filtros guiados: ${[form.city, form.state, form.segment].filter(Boolean).join(" / ")}.`
                    : "Sem filtros: o banco 24h vai escolher praças automaticamente."}
                </p>
              </div>
              <div>
                <span>Escolha atual do sistema</span>
                <strong>{selectedWorkLabel}</strong>
                <p>Motivo: {autonomousReasonLabel(autonomousStrategy?.reason)}.</p>
              </div>
              <div className={styles.strategyActions}>
                <button type="button" data-active={hasGuidedFilters ? "true" : "false"} onClick={requestGuidedFilters}>
                  Usar filtros guiados
                </button>
                <button type="button" data-active={!hasGuidedFilters ? "true" : "false"} onClick={clearGuidedFilters}>
                  Deixar sistema escolher sozinho
                </button>
              </div>
            </div>
            {!hasGuidedFilters ? (
              <p className={styles.strategyHint}>Sem filtros: o banco 24h vai escolher praças automaticamente.</p>
            ) : null}
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
                  helperText="Deixe em branco para o banco varrer segmentos amplos."
                />
                <HbxTargetTypeSelector
                  value={form.targetType}
                  onChange={(value) => setForm((current) => ({ ...current, targetType: value as TargetType }))}
                  allowedTypes={["pj", "pf", "both"]}
                />
              </div>
            </div>
            <button type="button" className={styles.createCampaignButton} onClick={() => void createMassDataCampaign()} disabled={saving}>
              {form.state || form.city || form.segment ? "Criar fila guiada" : "Criar fila automática"}
            </button>
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
                  {engine.cooldownUntil ? <span>Cooldown até <strong>{formatDateTime(engine.cooldownUntil)}</strong></span> : null}
                  {engine.pausedUntil ? <span>Pausado até <strong>{formatDateTime(engine.pausedUntil)}</strong></span> : null}
                  {engine.status === "offline" ? <span>Estado <strong>Offline</strong></span> : null}
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

        <section className={styles.mainGrid}>
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

          <article className={styles.productionCard}>
            <div className={styles.cardTitle}>
              <span>Campanhas e fila</span>
              <strong>{dashboard?.campaigns?.length || 0}</strong>
            </div>
            {(dashboard?.campaigns?.length || 0) > 0 ? (
              <div className={styles.campaignList}>
                {dashboard?.campaigns?.slice(0, 8).map((campaign) => (
                  <div key={campaign.id} className={styles.campaignItem} data-status={campaign.status || "queued"}>
                    <div>
                      <strong>{[campaign.city, campaign.state].filter(Boolean).join(" / ") || "Todas as cidades"}</strong>
                      <span>{campaign.segment || "Segmentos amplos"} · {campaign.targetType || "pj"}</span>
                    </div>
                    <div>
                      <span>{campaign.progressMessage || campaign.lastErrorMessage || "Fila aguardando próximo lote."}</span>
                      <small>
                        {metric(campaign.approvedCount)} aprovados · {metric(campaign.foundCount)} encontrados · tentativa {metric(campaign.currentAttempt)}/{metric(campaign.maxAttempts)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>Nenhuma campanha ativa</strong>
                <p>Crie uma fila no painel superior para o banco começar a abastecer a produção.</p>
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
