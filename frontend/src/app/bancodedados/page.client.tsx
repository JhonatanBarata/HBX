"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type CurrentUser = {
  isSystemMaster?: boolean;
};

type AuditSummary = {
  totalCards: number;
  cardsToday: number;
  cardsLastHour: number;
  cardsLast10Min: number;
  totalCompanyStates: number;
  negatives: number;
  sentToVendas: number;
  duplicatedItemsToday: number;
  rejectedItemsToday: number;
  campaignsQueued: number;
  campaignsRunning: number;
  campaignsCompletedToday: number;
  campaignsFailedToday: number;
  searchRunsQueued: number;
  searchRunsRunning: number;
  searchRunsFailedToday: number;
  searchRunsCompletedToday: number;
  motoresRegistrados: number;
  motoresOnline: number;
  motoresBusy: number;
  motoresStandby: number;
  motoresCooldown: number;
  motoresErro: number;
  motoresPausados: number;
};

type LatestCard = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  website: string | null;
  websiteStatus: string | null;
  opportunityScore: number;
  sourceEngines: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

type DatabaseCard = LatestCard & {
  placeId?: string | null;
  ddd?: string | null;
  status?: string | null;
  companyStatus?: string | null;
  targetType?: string | null;
  assignedUserId?: number | null;
  noAnswerCount?: number;
  contactedCount?: number;
  lastContactAt?: string | null;
};

type AuditEngine = {
  id: string;
  engineIndex: number;
  status: string;
  lastHealthStatus: string | null;
  lockedRunId: string | null;
  lastError: string | null;
  lastUsedAt: string | null;
  cooldownUntil: string | null;
  manualPaused: boolean;
  pausedUntil: string | null;
  cardsLast10Min: number;
  cardsToday: number;
  duplicatesToday: number;
  rejectedToday: number;
  currentMeaning: string;
};

type AuditFactory = {
  enabled: boolean;
  status: string;
  currentState: string | null;
  currentCity: string | null;
  currentSegment: string | null;
  currentTargetType: string | null;
  lastCampaignId: string | null;
  lastRunId: string | null;
  lastSavedCount: number;
  lastDuplicateCount: number;
  lastRejectedCount: number;
  consecutiveEmptyCount: number;
  consecutiveFailureCount: number;
  lastError: string | null;
  lastWorkedAt: string | null;
  nextRunAt: string | null;
  reasonStopped: string | null;
  nextMissionPreview: {
    state?: string | null;
    city?: string | null;
    segment?: string | null;
    targetType?: string | null;
    label?: string | null;
  } | null;
};

type ClientProtection = {
  reservedEngines: number;
  clientPriorityActive: boolean;
  radarDigitalActiveRequests: number;
  factoryAllowedEngines: number;
  manualReservedEngines: number;
  automaticAllowedEngines: number;
  message: string;
};

type AuditPayload = {
  generatedAt: string;
  summary: AuditSummary;
  latestCards: LatestCard[];
  engines: AuditEngine[];
  factory: AuditFactory;
  clientProtection: ClientProtection;
  diagnostics: string[];
};

type DatabaseCardsPayload = {
  items: DatabaseCard[];
  total: number;
  meta?: {
    available?: boolean;
    page?: number;
    limit?: number;
    companyId?: number | null;
    truncated?: boolean;
  };
};

type ExportTarget = {
  userId: number;
  userName: string;
  userEmail?: string | null;
  companyId: number;
  companyName: string;
  label: string;
};

type ExportResult = {
  ok: boolean;
  exportedCount: number;
  skippedCount: number;
  protectedCount: number;
};

type CardFilters = {
  state: string;
  city: string;
  segment: string;
  targetType: string;
  filterKey: string;
  ddd: string;
  scoreRange: string;
  noWebsite: boolean;
  highOpportunity: boolean;
  includeHidden: boolean;
};

const BRASILIA_TIME_ZONE = "America/Sao_Paulo";
const CARD_PAGE_LIMIT = 50;
const ENGINE_PANEL_SIZE = 20;
const DEFAULT_CARD_FILTERS: CardFilters = {
  state: "",
  city: "",
  segment: "",
  targetType: "both",
  filterKey: "",
  ddd: "",
  scoreRange: "",
  noWebsite: false,
  highOpportunity: false,
  includeHidden: false,
};

function metric(value?: number | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString("pt-BR") : "0";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: BRASILIA_TIME_ZONE,
  });
}

function shortId(value?: string | null) {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function factoryStatusLabel(status?: string | null, enabled?: boolean) {
  if (!enabled) return "Parada";
  const normalized = String(status || "").toLowerCase();
  if (normalized === "running") return "Rodando";
  if (normalized === "error") return "Erro";
  if (normalized === "paused") return "Pausada";
  return "Sem missão";
}

function factoryTone(status?: string | null, enabled?: boolean) {
  if (!enabled || status === "paused") return "paused";
  if (status === "running") return "running";
  if (status === "error") return "error";
  return "idle";
}

function statusTone(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (["busy", "running", "online"].includes(normalized)) return "running";
  if (["cooldown", "degraded"].includes(normalized)) return "warning";
  if (["paused"].includes(normalized)) return "paused";
  if (["offline", "inactive"].includes(normalized)) return "error";
  return "idle";
}

export default function BancoDeDadosClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [targets, setTargets] = useState<ExportTarget[]>([]);
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [cardFilters, setCardFilters] = useState<CardFilters>(DEFAULT_CARD_FILTERS);
  const [appliedCardFilters, setAppliedCardFilters] = useState<CardFilters>(DEFAULT_CARD_FILTERS);
  const [cardPage, setCardPage] = useState(1);
  const [cardsPayload, setCardsPayload] = useState<DatabaseCardsPayload | null>(null);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());

  const selectedTarget = useMemo(() => {
    if (!selectedTargetKey) return null;
    const [kind, rawId] = selectedTargetKey.split(":");
    if (kind !== "user") return null;
    const userId = Number(rawId);
    return targets.find((target) => target.userId === userId) || null;
  }, [selectedTargetKey, targets]);

  const loadTargets = useCallback(async () => {
    try {
      const payload = await apiFetch<{ items: ExportTarget[] }>("/modules/master/webscraping/export-targets", {
        requireAuth: true,
        timeoutMs: 20000,
      });
      setTargets(Array.isArray(payload?.items) ? payload.items : []);
    } catch {
      setTargets([]);
    }
  }, []);

  const loadCards = useCallback(async () => {
    setCardsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(cardPage));
      params.set("limit", String(CARD_PAGE_LIMIT));
      Object.entries(appliedCardFilters).forEach(([key, value]) => {
        if (typeof value === "boolean") {
          if (value) params.set(key, "true");
          return;
        }
        if (String(value || "").trim()) params.set(key, String(value).trim());
      });
      if (selectedTarget?.companyId) params.set("companyId", String(selectedTarget.companyId));
      const payload = await apiFetch<DatabaseCardsPayload>(`/modules/master/webscraping/database-cards?${params.toString()}`, {
        requireAuth: true,
        timeoutMs: 25000,
      });
      setCardsPayload(payload);
      setSelectedCardIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar cards filtrados.");
    } finally {
      setCardsLoading(false);
    }
  }, [appliedCardFilters, cardPage, selectedTarget?.companyId]);

  const loadAudit = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<AuditPayload>("/modules/master/webscraping/database-audit", {
        requireAuth: true,
        timeoutMs: 20000,
      });
      setAudit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar auditoria do banco.");
    } finally {
      if (!options?.silent) setLoading(false);
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
        if (isMaster) {
          await Promise.all([loadAudit(), loadTargets()]);
        }
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
  }, [hasToken, loadAudit, loadTargets]);

  useEffect(() => {
    if (!allowed) return;
    const timer = window.setInterval(() => void loadAudit({ silent: true }), 10000);
    return () => window.clearInterval(timer);
  }, [allowed, loadAudit]);

  useEffect(() => {
    if (!allowed) return;
    void loadCards();
  }, [allowed, loadCards]);

  const summary = audit?.summary;
  const factory = audit?.factory;
  const protection = audit?.clientProtection;
  const queueActive = Number(summary?.campaignsQueued || 0) + Number(summary?.campaignsRunning || 0) + Number(summary?.searchRunsQueued || 0) + Number(summary?.searchRunsRunning || 0);

  const kpis = useMemo(() => [
    ["Total no banco", metric(summary?.totalCards)],
    ["Novos hoje", metric(summary?.cardsToday)],
    ["Última hora", metric(summary?.cardsLastHour)],
    ["Últimos 10 min", metric(summary?.cardsLast10Min)],
    ["Negativos", metric(summary?.negatives)],
    ["Enviados para Vendas", metric(summary?.sentToVendas)],
    ["Fila ativa", metric(queueActive)],
    ["Motores com erro", metric(summary?.motoresErro)],
    ["Motores reservados cliente", metric(protection?.reservedEngines)],
    ["Fábrica Noturna", factoryStatusLabel(factory?.status, factory?.enabled)],
  ], [factory?.enabled, factory?.status, protection?.reservedEngines, queueActive, summary]);
  const visibleCards = cardsPayload?.items || [];
  const selectedVisibleCount = visibleCards.filter((card) => selectedCardIds.has(card.id)).length;
  const allVisibleSelected = visibleCards.length > 0 && selectedVisibleCount === visibleCards.length;
  const cardTotal = Number(cardsPayload?.total || 0);
  const cardTotalPages = Math.max(1, Math.ceil(cardTotal / CARD_PAGE_LIMIT));
  const enginePanels = useMemo(() => {
    const engines = [...(audit?.engines || [])].sort((left, right) => left.engineIndex - right.engineIndex);
    const maxEngineNumber = Math.max(
      Number(summary?.motoresRegistrados || 0),
      ...engines.map((engine) => Number(engine.engineIndex || 0) + 1),
      ENGINE_PANEL_SIZE,
    );
    const panelCount = Math.max(1, Math.ceil(maxEngineNumber / ENGINE_PANEL_SIZE));
    return Array.from({ length: panelCount }, (_, panelIndex) => {
      const startIndex = panelIndex * ENGINE_PANEL_SIZE;
      const endIndex = startIndex + ENGINE_PANEL_SIZE - 1;
      const groupEngines = engines.filter((engine) => engine.engineIndex >= startIndex && engine.engineIndex <= endIndex);
      const byIndex = new Map(groupEngines.map((engine) => [engine.engineIndex, engine]));
      const online = groupEngines.filter((engine) => !["offline", "inactive"].includes(String(engine.status || "").toLowerCase()) && String(engine.lastHealthStatus || "").toLowerCase() !== "offline").length;
      const busy = groupEngines.filter((engine) => String(engine.status || "").toLowerCase() === "busy" || engine.lockedRunId).length;
      const cooldown = groupEngines.filter((engine) => String(engine.status || "").toLowerCase() === "cooldown").length;
      const paused = groupEngines.filter((engine) => engine.manualPaused || String(engine.status || "").toLowerCase() === "paused").length;
      const erro = groupEngines.filter((engine) => ["offline", "degraded", "inactive"].includes(String(engine.status || "").toLowerCase()) || engine.lastError).length;
      const cardsToday = groupEngines.reduce((sum, engine) => sum + Number(engine.cardsToday || 0), 0);
      const cardsLast10Min = groupEngines.reduce((sum, engine) => sum + Number(engine.cardsLast10Min || 0), 0);
      const duplicatesToday = groupEngines.reduce((sum, engine) => sum + Number(engine.duplicatesToday || 0), 0);
      const rejectedToday = groupEngines.reduce((sum, engine) => sum + Number(engine.rejectedToday || 0), 0);
      const lastUsedAt = groupEngines
        .map((engine) => engine.lastUsedAt)
        .filter(Boolean)
        .sort((left, right) => new Date(String(right)).getTime() - new Date(String(left)).getTime())[0] || null;
      const tone = erro > 0 ? "error" : busy > 0 || cardsLast10Min > 0 ? "running" : cooldown > 0 ? "warning" : paused > 0 ? "paused" : online > 0 ? "idle" : "error";
      const statusLabel = erro > 0
        ? "Atenção"
        : busy > 0 || cardsLast10Min > 0
          ? "Produzindo"
          : cooldown > 0
            ? "Cooldown"
            : paused > 0
              ? "Pausado"
              : online > 0
                ? "Standby"
                : "Sem sinal";
      const meaning = cardsLast10Min > 0
        ? "Salvando cards agora"
        : busy > 0
          ? "Buscando ou processando lote"
          : queueActive > 0
            ? "Aguardando fila"
            : "Sem missão ativa";
      return {
        id: `engines-${startIndex + 1}-${endIndex + 1}`,
        label: `Painel ${panelIndex + 1}`,
        range: `${startIndex + 1}-${endIndex + 1}`,
        startIndex,
        byIndex,
        statusLabel,
        tone,
        meaning,
        total: groupEngines.length,
        online,
        busy,
        cooldown,
        paused,
        erro,
        cardsToday,
        cardsLast10Min,
        duplicatesToday,
        rejectedToday,
        lastUsedAt,
      };
    });
  }, [audit?.engines, queueActive, summary?.motoresRegistrados]);

  async function runFactoryAction(path: string, successMessage: string) {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await apiFetch(`/modules/master/webscraping/factory/${path}`, {
        method: "POST",
        requireAuth: true,
        timeoutMs: 20000,
      });
      await loadAudit({ silent: true });
      setFeedback(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao comandar a fábrica.");
    } finally {
      setSaving(false);
    }
  }

  function updateCardFilter<K extends keyof CardFilters>(key: K, value: CardFilters[K]) {
    setCardFilters((current) => ({ ...current, [key]: value }));
  }

  function applyCardFilters() {
    setCardPage(1);
    setAppliedCardFilters({ ...cardFilters });
  }

  function resetCardFilters() {
    setCardFilters(DEFAULT_CARD_FILTERS);
    setAppliedCardFilters(DEFAULT_CARD_FILTERS);
    setCardPage(1);
  }

  function toggleCard(cardId: string, checked: boolean) {
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (checked) next.add(cardId);
      else next.delete(cardId);
      return next;
    });
  }

  function toggleAllVisibleCards(checked: boolean) {
    setSelectedCardIds((current) => {
      const next = new Set(current);
      for (const card of cardsPayload?.items || []) {
        if (checked) next.add(card.id);
        else next.delete(card.id);
      }
      return next;
    });
  }

  async function exportSelectedCards() {
    setFeedback(null);
    setError(null);
    if (!selectedTarget) {
      setError("Escolha o usuário de destino antes de exportar.");
      return;
    }
    const leadIds = Array.from(selectedCardIds);
    if (!leadIds.length) {
      setError("Selecione pelo menos um card para exportar.");
      return;
    }
    setExporting(true);
    try {
      const result = await apiFetch<ExportResult>("/modules/master/webscraping/export-cards", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 25000,
        body: JSON.stringify({
          leadIds,
          userId: selectedTarget.userId,
          companyId: selectedTarget.companyId,
        }),
      });
      setFeedback(`Exportados ${metric(result.exportedCount)} cards para ${selectedTarget.userName}. Pulados: ${metric(result.skippedCount)}.`);
      await Promise.all([loadCards(), loadAudit({ silent: true })]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao exportar cards.");
    } finally {
      setExporting(false);
    }
  }

  if (hasToken === null || checkingAccess || loading && !audit) {
    return <main className="app-shell" aria-hidden="true" />;
  }

  if (!hasToken) return null;

  if (!allowed) {
    return (
      <DashboardScaffold title="Banco de Cards HBX" hideHeader showDashboardShortcut={false}>
        <section className={styles.shell}>
          <div className={styles.alert} data-tone="error">Acesso restrito ao MASTER.</div>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Banco de Cards HBX" hideHeader showDashboardShortcut={false}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <span>Auditoria operacional</span>
            <h1>Banco de Cards HBX</h1>
            <p>Estoque real, produção recente, fábrica e motores. Atualizado em {formatDateTime(audit?.generatedAt)}.</p>
          </div>
          <button type="button" onClick={() => void loadAudit()} disabled={loading || saving}>Atualizar</button>
        </header>

        {error ? <div className={styles.alert} data-tone="error">{error}</div> : null}
        {feedback ? <div className={styles.alert} data-tone="ok">{feedback}</div> : null}

        <section className={styles.kpiGrid} aria-label="Resumo do banco">
          {kpis.map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>

        <section className={styles.factoryPanel} data-status={factoryTone(factory?.status, factory?.enabled)}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Fábrica Noturna</span>
              <strong>{factoryStatusLabel(factory?.status, factory?.enabled)}</strong>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => void runFactoryAction("start", "Fábrica ligada e próxima missão solicitada.")} disabled={saving}>Ligar fábrica</button>
              <button type="button" onClick={() => void runFactoryAction("stop", "Fábrica pausada.")} disabled={saving}>Pausar fábrica</button>
              <button type="button" onClick={() => void runFactoryAction("force-next", "Próximo cursor forçado.")} disabled={saving}>Criar próxima missão agora</button>
              <button type="button" onClick={() => void runFactoryAction("force-next", "Cursor avançado para o próximo eixo.")} disabled={saving}>Forçar próximo cursor</button>
              <button
                type="button"
                data-danger="true"
                onClick={() => {
                  if (window.confirm("Resetar o cursor da Fábrica Noturna para o início?")) {
                    void runFactoryAction("reset-cursor", "Cursor resetado.");
                  }
                }}
                disabled={saving}
              >
                Resetar cursor
              </button>
            </div>
          </div>

          <div className={styles.factoryGrid}>
            <div><span>Agora trabalhando</span><strong>{[factory?.currentState, factory?.currentCity, factory?.currentSegment, factory?.currentTargetType?.toUpperCase()].filter(Boolean).join(" / ") || "-"}</strong></div>
            <div><span>Próxima missão</span><strong>{factory?.nextMissionPreview?.label || "-"}</strong></div>
            <div><span>Última campanha</span><strong>{shortId(factory?.lastCampaignId)}</strong></div>
            <div><span>Cards salvos hoje</span><strong>{metric(summary?.cardsToday)}</strong></div>
            <div><span>Duplicados hoje</span><strong>{metric(summary?.duplicatedItemsToday)}</strong></div>
            <div><span>Falhas hoje</span><strong>{metric((summary?.campaignsFailedToday || 0) + (summary?.searchRunsFailedToday || 0))}</strong></div>
            <div><span>Último lote</span><strong>{metric(factory?.lastSavedCount)} salvos · {metric(factory?.lastDuplicateCount)} dup · {metric(factory?.lastRejectedCount)} rej</strong></div>
            <div><span>Motivo de parada</span><strong>{factory?.reasonStopped || "-"}</strong></div>
          </div>
        </section>

        <section className={styles.protectionBox}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Radar Digital do cliente</span>
              <strong>{protection?.reservedEngines ? "Protegido" : "Sem reserva"}</strong>
            </div>
          </div>
          <div className={styles.factoryGrid}>
            <div><span>Reserva cliente</span><strong>{metric(protection?.reservedEngines)}</strong></div>
            <div><span>Prioridade comercial</span><strong>{protection?.clientPriorityActive ? "Ativa" : "Fora da janela"}</strong></div>
            <div><span>Fábrica pode usar</span><strong>{metric(protection?.factoryAllowedEngines)}</strong></div>
            <div><span>Demanda cliente</span><strong>{metric(protection?.radarDigitalActiveRequests)}</strong></div>
          </div>
          <p>{protection?.message || "Sem métrica de proteção carregada."}</p>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Estoque real</span>
              <strong>Últimos cards salvos</strong>
            </div>
            <small>{metric(audit?.latestCards.length)} registros recentes</small>
          </div>
          <div className={styles.cardTable}>
            <div className={styles.cardHead}>
              <span>Nome</span>
              <span>Telefone</span>
              <span>Cidade</span>
              <span>Estado</span>
              <span>Segmento</span>
              <span>Site</span>
              <span>Score</span>
              <span>Criado em</span>
            </div>
            {(audit?.latestCards || []).map((card) => (
              <div key={card.id} className={styles.cardRow}>
                <span><strong>{card.name || "-"}</strong><small>{shortId(card.id)}</small></span>
                <span>{card.phone || "-"}</span>
                <span>{card.city || "-"}</span>
                <span>{card.state || "-"}</span>
                <span>{card.segment || "-"}</span>
                <span>{card.website || card.websiteStatus || "-"}</span>
                <span>{metric(card.opportunityScore)}</span>
                <span>{formatDateTime(card.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Motores</span>
              <strong>Status real em blocos de 20</strong>
            </div>
            <small>{metric(summary?.motoresOnline)} online · {metric(summary?.motoresBusy)} ocupados · {metric(summary?.motoresStandby)} standby</small>
          </div>
          <div className={styles.enginePanelGrid} aria-label="Motores agrupados de 20 em 20">
            {enginePanels.map((panel) => (
              <article key={panel.id} className={styles.enginePanel} data-status={panel.tone}>
                <div className={styles.enginePanelTop}>
                  <div>
                    <span>Motores {panel.range}</span>
                    <strong>{panel.label}</strong>
                  </div>
                  <b>{panel.statusLabel}</b>
                </div>
                <div className={styles.enginePanelStats}>
                  <span><strong>{metric(panel.online)}</strong> online</span>
                  <span><strong>{metric(panel.busy)}</strong> rodando</span>
                  <span><strong>{metric(panel.cardsLast10Min)}</strong> 10 min</span>
                  <span><strong>{metric(panel.cardsToday)}</strong> hoje</span>
                </div>
                <div className={styles.engineMiniMap} aria-label={`Mapa dos motores ${panel.range}`}>
                  {Array.from({ length: ENGINE_PANEL_SIZE }, (_, offset) => {
                    const engineIndex = panel.startIndex + offset;
                    const engine = panel.byIndex.get(engineIndex);
                    const status = engine ? engine.lastError ? "error" : statusTone(engine.status) : "idle";
                    const label = engine
                      ? `${engine.id}: ${engine.currentMeaning}. Hoje: ${metric(engine.cardsToday)} cards. Erro: ${engine.lastError || "nenhum"}.`
                      : `Motor ${engineIndex + 1}: sem registro.`;
                    return (
                      <span key={`${panel.id}:${offset}`} data-status={status} title={label}>
                        {engineIndex + 1}
                      </span>
                    );
                  })}
                </div>
                <div className={styles.enginePanelFooter}>
                  <span>{panel.meaning}</span>
                  <span>{metric(panel.duplicatesToday)} duplicados · {metric(panel.rejectedToday)} rejeitados</span>
                  <span>Último uso: {formatDateTime(panel.lastUsedAt)}</span>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.engineTable}>
            <div className={styles.engineHead}>
              <span>Motor</span>
              <span>Status real</span>
              <span>O que está fazendo</span>
              <span>Último uso</span>
              <span>Cards hoje</span>
              <span>Últimos 10 min</span>
              <span>Duplicados</span>
              <span>Rejeitados</span>
              <span>Erro</span>
            </div>
            {(audit?.engines || []).map((engine) => (
              <div key={engine.id} className={styles.engineRow} data-status={statusTone(engine.status)}>
                <span><strong>{engine.id}</strong><small>#{engine.engineIndex + 1}</small></span>
                <span>{engine.status || "-"}</span>
                <span>{engine.currentMeaning}</span>
                <span>{formatDateTime(engine.lastUsedAt)}</span>
                <span>{metric(engine.cardsToday)}</span>
                <span>{metric(engine.cardsLast10Min)}</span>
                <span>{metric(engine.duplicatesToday)}</span>
                <span>{metric(engine.rejectedToday)}</span>
                <span>{engine.lastError || "-"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.diagnostics}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Diagnóstico</span>
              <strong>Mensagens diretas</strong>
            </div>
          </div>
          {(audit?.diagnostics || []).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </section>

        <section className={styles.filterPanel}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Filtro de cards</span>
              <strong>Ver estoque e exportar para usuário</strong>
            </div>
            <small>{metric(cardTotal)} encontrados · {metric(selectedCardIds.size)} selecionados</small>
          </div>

          <div className={styles.exportBar}>
            <label>
              <span>Usuário de destino</span>
              <select value={selectedTargetKey} onChange={(event) => { setSelectedTargetKey(event.target.value); setCardPage(1); }}>
                <option value="">Escolha um usuário</option>
                {targets.map((target) => (
                  <option key={`${target.userId}:${target.companyId}`} value={`user:${target.userId}`}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void exportSelectedCards()} disabled={exporting || !selectedTarget || selectedCardIds.size === 0}>
              {exporting ? "Exportando..." : "Exportar selecionados"}
            </button>
          </div>

          <div className={styles.filterGrid}>
            <label>
              <span>Estado</span>
              <input value={cardFilters.state} onChange={(event) => updateCardFilter("state", event.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
            </label>
            <label>
              <span>Cidade</span>
              <input value={cardFilters.city} onChange={(event) => updateCardFilter("city", event.target.value)} placeholder="Campinas" />
            </label>
            <label>
              <span>Segmento</span>
              <input value={cardFilters.segment} onChange={(event) => updateCardFilter("segment", event.target.value)} placeholder="restaurantes" />
            </label>
            <label>
              <span>Tipo</span>
              <select value={cardFilters.targetType} onChange={(event) => updateCardFilter("targetType", event.target.value)}>
                <option value="both">PJ e PF</option>
                <option value="pj">PJ</option>
                <option value="pf">PF</option>
                <option value="agenda_pf">Agenda PF</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={cardFilters.filterKey} onChange={(event) => updateCardFilter("filterKey", event.target.value)}>
                <option value="">Todos</option>
                <option value="clean">Limpos</option>
                <option value="delivered">Entregues</option>
                <option value="sent_to_vendas">Enviados para Vendas</option>
                <option value="negative">Negados/negativos</option>
                <option value="blocked">Bloqueados</option>
                <option value="opt_out">Opt-out</option>
                <option value="no_answer">Tentativas sem resposta</option>
                <option value="no_whatsapp">Contato inválido</option>
                <option value="no_website">Sem site</option>
                <option value="score_high">Score alto</option>
              </select>
            </label>
            <label>
              <span>DDD</span>
              <input value={cardFilters.ddd} onChange={(event) => updateCardFilter("ddd", event.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="19" inputMode="numeric" />
            </label>
            <label>
              <span>Score</span>
              <select value={cardFilters.scoreRange} onChange={(event) => updateCardFilter("scoreRange", event.target.value)}>
                <option value="">Todos</option>
                <option value="high">Alto</option>
                <option value="medium">Médio</option>
                <option value="low">Baixo</option>
              </select>
            </label>
            <label className={styles.checkboxField}>
              <input type="checkbox" checked={cardFilters.noWebsite} onChange={(event) => updateCardFilter("noWebsite", event.target.checked)} />
              <span>Sem site</span>
            </label>
            <label className={styles.checkboxField}>
              <input type="checkbox" checked={cardFilters.highOpportunity} onChange={(event) => updateCardFilter("highOpportunity", event.target.checked)} />
              <span>Alta oportunidade</span>
            </label>
            <label className={styles.checkboxField}>
              <input type="checkbox" checked={cardFilters.includeHidden} onChange={(event) => updateCardFilter("includeHidden", event.target.checked)} />
              <span>Incluir negativos do alvo</span>
            </label>
          </div>

          <div className={styles.cardsActionRow}>
            <button type="button" onClick={applyCardFilters} disabled={cardsLoading}>Filtrar</button>
            <button type="button" onClick={resetCardFilters} disabled={cardsLoading}>Limpar</button>
            <button type="button" onClick={() => void loadCards()} disabled={cardsLoading}>Atualizar lista</button>
          </div>

          <div className={styles.databaseCardTable}>
            <div className={styles.databaseCardHead}>
              <span><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisibleCards(event.target.checked)} aria-label="Selecionar cards visíveis" /></span>
              <span>Nome</span>
              <span>Telefone</span>
              <span>Cidade</span>
              <span>Estado</span>
              <span>Segmento</span>
              <span>Tipo</span>
              <span>Status</span>
              <span>Tentativas</span>
              <span>Site</span>
              <span>Score</span>
            </div>
            {cardsLoading ? (
              <div className={styles.emptyRow}>Carregando cards...</div>
            ) : visibleCards.length ? visibleCards.map((card) => (
              <div key={card.id} className={styles.databaseCardRow}>
                <span><input type="checkbox" checked={selectedCardIds.has(card.id)} onChange={(event) => toggleCard(card.id, event.target.checked)} aria-label={`Selecionar ${card.name}`} /></span>
                <span><strong>{card.name || "-"}</strong><small>{shortId(card.id)}</small></span>
                <span>{card.phone || "-"}</span>
                <span>{card.city || "-"}</span>
                <span>{card.state || "-"}</span>
                <span>{card.segment || "-"}</span>
                <span>{String(card.targetType || "pj").toUpperCase()}</span>
                <span>{card.companyStatus || card.status || "-"}</span>
                <span>{metric((card.noAnswerCount || 0) + (card.contactedCount || 0))}</span>
                <span>{card.website || card.websiteStatus || "-"}</span>
                <span>{metric(card.opportunityScore)}</span>
              </div>
            )) : (
              <div className={styles.emptyRow}>Nenhum card encontrado para esse filtro.</div>
            )}
          </div>

          <div className={styles.paginationRow}>
            <button type="button" onClick={() => setCardPage((page) => Math.max(1, page - 1))} disabled={cardsLoading || cardPage <= 1}>Anterior</button>
            <span>Página {metric(cardPage)} de {metric(cardTotalPages)}</span>
            <button type="button" onClick={() => setCardPage((page) => Math.min(cardTotalPages, page + 1))} disabled={cardsLoading || cardPage >= cardTotalPages}>Próxima</button>
          </div>

          <p className={styles.auditNote}>
            Exportar cria/atualiza o estado privado em RadarLeadCompanyState para a empresa do usuário. Negativas, bloqueios, opt-outs, tentativas e envios para Vendas continuam voltando para o banco e impedem reentrega indevida.
          </p>
        </section>
      </section>
    </DashboardScaffold>
  );
}
