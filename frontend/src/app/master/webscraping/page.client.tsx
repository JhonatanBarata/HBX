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
type EngineStatus = "running" | "waiting" | "offline" | "cooldown";
type DiagnosticStatus = "ok" | "warning" | "error";

type CurrentUser = {
  isSystemMaster?: boolean;
};

type DashboardEngine = {
  id: string;
  label: string;
  status: EngineStatus;
  online?: boolean;
  busy?: boolean;
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
    onlineEngines: number;
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

const DEFAULT_FORM: FormState = {
  state: "",
  city: "",
  segment: "",
  targetType: "both",
  startTime: "20:00",
  endTime: "08:00",
  engineCount: MAX_HBX_ENGINE_COUNT,
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
  if (value === "running") return "Rodando";
  if (value === "cooldown") return "Cooldown";
  if (value === "offline") return "Offline";
  return "Aguardando";
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
    setForm((current) => ({
      ...current,
      startTime: formatTime(config.startHour, config.startMinute),
      endTime: formatTime(config.endHour, config.endMinute),
      engineCount: clampNumber(config.engineCount, MAX_HBX_ENGINE_COUNT, 1, MAX_HBX_ENGINE_COUNT),
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

  const engines = useMemo(() => emptyEngines(dashboard?.engines, dashboard?.summary.totalEngines), [dashboard?.engines, dashboard?.summary.totalEngines]);
  const dashboardDescription = dashboard?.turbo.active
    ? `Turbo forçado ativo até ${formatClock(dashboard.turbo.endsAt)}`
    : `Turbo forçado pronto para operar até ${dashboard?.turbo.endLabel || form.endTime}`;

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
          <Link href="/radar-digital" className={styles.secondaryLink}>Ver Radar Digital</Link>
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
          <div>
            <span>{dashboard?.status.currentMode || "STANDBY"}</span>
            <h2>Radar operacional dos motores HBX</h2>
            <p>{dashboard?.status.operationalMessage || "Status operacional em leitura."}</p>
          </div>
          <div className={styles.headerClock}>
            <span>Horário atual</span>
            <strong>{dashboard?.generatedAt ? formatClock(dashboard.generatedAt) : "--:--"}</strong>
          </div>
        </header>

        <section className={styles.engineGrid} aria-label="Motores HBX">
          {engines.map((engine, index) => (
            <article key={engine.id} className={styles.engineCard} data-status={engine.status}>
              <div className={styles.engineBackgroundIcon} aria-hidden="true" />
              <div className={styles.engineTop}>
                <span>{engine.label || `M${index + 1}`}</span>
                <strong>{statusLabel(engine.status)}</strong>
              </div>
              <div className={styles.engineMainMetric}>
                <span>Cards fabricados</span>
                <strong>{metric(engine.cardsFabricated)}</strong>
              </div>
              <div className={styles.engineMeta}>
                <span>Fila <strong>{metric(engine.queue)}</strong></span>
                <span>Batches <strong>{metric(engine.batches)}</strong></span>
                <span>Duplicados/Rejeitados <strong>{metric(engine.duplicates)} / {metric(engine.rejected)}</strong></span>
                <span>Última atividade <strong>{formatDateTime(engine.lastActivityAt)}</strong></span>
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
          ))}
        </section>

        <section className={styles.mainGrid}>
          <article className={styles.turboCard}>
            <div className={styles.cardTitle}>
              <span>Controle do Turbo Forçado</span>
              <strong>{dashboard?.turbo.active ? "Ativo" : "Pronto"}</strong>
            </div>
            <button
              type="button"
              className={styles.turboButton}
              data-active={dashboard?.turbo.active ? "true" : "false"}
              onClick={() => void activateForcedTurbo()}
              disabled={saving}
            >
              <span>{dashboard?.turbo.active ? "Turbo Forçado Ativo" : "Ativar Turbo Forçado"}</span>
              <strong>{dashboard?.turbo.active ? `até ${formatClock(dashboard.turbo.endsAt)}` : `até ${form.endTime}`}</strong>
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
            <span>Cards/min médio</span>
            <strong>{metric(dashboard?.summary.cardsPerMinuteAvg)}</strong>
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
            <span>Motores online</span>
            <strong>{metric(dashboard?.summary.onlineEngines)} / {metric(dashboard?.summary.totalEngines)}</strong>
          </article>
        </section>

        <section className={styles.lowerGrid}>
          <article className={styles.productionCard}>
            <div className={styles.cardTitle}>
              <span>Produção em tempo real</span>
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
                <p>Quando os motores salvarem registros reais no banco, eles aparecem aqui automaticamente.</p>
              </div>
            )}
          </article>

          <article className={styles.campaignCard}>
            <div className={styles.cardTitle}>
              <span>Nova fila Mass Data</span>
              <strong>Lote pequeno</strong>
            </div>
            <div className={styles.campaignForm}>
              <div className={styles.campaignWide}>
                <HbxStateCityPicker
                  state={form.state}
                  city={form.city}
                  onStateChange={(value) => setForm((current) => ({ ...current, state: value, city: "" }))}
                  onCityChange={(value) => setForm((current) => ({ ...current, city: value }))}
                  allowAllCities
                />
              </div>
              <HbxSegmentCombobox
                value={form.segment}
                onChange={(value) => setForm((current) => ({ ...current, segment: value }))}
                placeholder="Todos os segmentos"
                helperText="Deixe em branco para a Massa de Dados varrer segmentos amplos."
              />
              <HbxTargetTypeSelector
                value={form.targetType}
                onChange={(value) => setForm((current) => ({ ...current, targetType: value as TargetType }))}
                allowedTypes={["both", "pj", "pf"]}
              />
              <label>
                Batch por lote
                <input type="number" min={1} max={20} value={form.batchSize} onChange={(event) => setForm((current) => ({ ...current, batchSize: clampNumber(event.target.value, 20, 1, 20) }))} />
              </label>
              <label>
                Tentativas por isca
                <input type="number" min={1} max={10} value={form.maxAttemptsPerTask} onChange={(event) => setForm((current) => ({ ...current, maxAttemptsPerTask: clampNumber(event.target.value, 3, 1, 10) }))} />
              </label>
            </div>
            <button type="button" className={styles.createCampaignButton} onClick={() => void createMassDataCampaign()} disabled={saving || !form.state}>
              Criar fila de Massa de Dados
            </button>
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
