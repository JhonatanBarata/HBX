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
  schedule?: {
    allowedEngines: number;
    maxEngines: number;
    memoryGuardEngines: number;
    reservedEngines: number;
    memoryPressurePercent: number;
    reason: string;
    windowStatus: string;
    enabled: boolean;
    emergencyStop: boolean;
    weekdaysOnly?: boolean;
    weekendAlwaysOn?: boolean;
    factoryState?: string | null;
    factoryCity?: string | null;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    nextStartAt: string | null;
    nextStopAt: string | null;
  } | null;
};

type ClientProtection = {
  reservedEngines: number;
  clientPriorityActive: boolean;
  radarDigitalActiveRequests: number;
  factoryAllowedEngines: number;
  manualReservedEngines: number;
  automaticAllowedEngines: number;
  factoryReason?: string | null;
  factoryWindowStatus?: string | null;
  factoryMaxEngines?: number | null;
  factoryMemoryGuardEngines?: number | null;
  factoryNextStartAt?: string | null;
  factoryNextStopAt?: string | null;
  factoryEmergencyStop?: boolean;
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
const CARD_PAGE_LIMIT = 100;
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

function timeValue(hour?: number | null, minute?: number | null) {
  return `${String(Number(hour || 0)).padStart(2, "0")}:${String(Number(minute || 0)).padStart(2, "0")}`;
}

function normalizeFactoryTimeInput(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function parseFactoryTimeInput(value: string) {
  const normalized = normalizeFactoryTimeInput(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute, label: timeValue(hour, minute) };
}

function factoryReasonLabel(value?: string | null) {
  const reason = String(value || "").toLowerCase();
  if (reason === "outside_factory_window") return "Fora do horário";
  if (reason === "outside_business_days") return "Fora dos dias úteis";
  if (reason === "emergency_stop") return "Parado manualmente";
  if (reason === "memory_guard") return "Proteção de memória";
  if (reason === "memory_stop") return "Memória crítica";
  if (reason === "guided_location") return "Cidade fixa";
  if (reason === "client_priority" || reason === "manual_demand") return "Cliente em prioridade";
  if (reason === "factory_disabled") return "Desligada";
  if (reason === "factory_max") return "Rodando com limite";
  return "Rodando";
}

function factoryWindowLabel(schedule?: AuditFactory["schedule"]) {
  if (schedule?.factoryState && schedule?.factoryCity) return `${schedule.factoryCity}/${schedule.factoryState}`;
  const start = timeValue(schedule?.startHour ?? 22, schedule?.startMinute ?? 0);
  const end = timeValue(schedule?.endHour ?? 7, schedule?.endMinute ?? 0);
  if (start === end) return "24h por dia";
  return `${start} até ${end}`;
}

function factoryCalendarLabel(schedule?: AuditFactory["schedule"]) {
  if (schedule?.weekdaysOnly) return "Apenas dias úteis";
  if (schedule?.weekendAlwaysOn) return "Fim de semana 24h";
  return "Todos os dias na janela";
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
  const [hasSearchedCards, setHasSearchedCards] = useState(false);
  const [cardsSearchToken, setCardsSearchToken] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());
  const [selectedEnginePanelId, setSelectedEnginePanelId] = useState<string | null>(null);
  const [enginePanelBusy, setEnginePanelBusy] = useState<string | null>(null);
  const [rotatingMetricIndex, setRotatingMetricIndex] = useState(0);
  const [editingFactoryField, setEditingFactoryField] = useState<"maxEngines" | "startTime" | "endTime" | "factoryState" | "factoryCity" | null>(null);
  const [factoryMaxEnginesDraft, setFactoryMaxEnginesDraft] = useState("");
  const [factoryStartTimeDraft, setFactoryStartTimeDraft] = useState("");
  const [factoryEndTimeDraft, setFactoryEndTimeDraft] = useState("");
  const [factoryStateDraft, setFactoryStateDraft] = useState("");
  const [factoryCityDraft, setFactoryCityDraft] = useState("");

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
    if (!hasSearchedCards) return;
    void loadCards();
  }, [allowed, hasSearchedCards, cardsSearchToken, loadCards]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRotatingMetricIndex((current) => current + 1);
    }, 3500);
    return () => window.clearInterval(timer);
  }, []);

  const summary = audit?.summary;
  const factory = audit?.factory;
  const protection = audit?.clientProtection;
  const queueActive = Number(summary?.campaignsQueued || 0) + Number(summary?.campaignsRunning || 0) + Number(summary?.searchRunsQueued || 0) + Number(summary?.searchRunsRunning || 0);
  const configuredFactoryMaxEngines = Number(factory?.schedule?.maxEngines ?? protection?.factoryMaxEngines ?? 16);
  const configuredFactoryStartTime = timeValue(factory?.schedule?.startHour ?? 22, factory?.schedule?.startMinute ?? 0);
  const configuredFactoryEndTime = timeValue(factory?.schedule?.endHour ?? 7, factory?.schedule?.endMinute ?? 0);
  const configuredFactoryState = String(factory?.schedule?.factoryState || "").trim().toUpperCase();
  const configuredFactoryCity = String(factory?.schedule?.factoryCity || "").trim();
  const factoryGuidedLocation = configuredFactoryState && configuredFactoryCity ? `${configuredFactoryCity}/${configuredFactoryState}` : "";
  const factorySchedule = factory?.schedule;
  const factoryStatusText = factoryStatusLabel(factory?.status, factory?.enabled);
  const factoryReasonText = factoryReasonLabel(protection?.factoryReason);
  const factoryEmergencyStop = Boolean(factorySchedule?.emergencyStop || protection?.factoryEmergencyStop);

  useEffect(() => {
    if (editingFactoryField !== "maxEngines") setFactoryMaxEnginesDraft(String(configuredFactoryMaxEngines));
    if (editingFactoryField !== "startTime") setFactoryStartTimeDraft(configuredFactoryStartTime);
    if (editingFactoryField !== "endTime") setFactoryEndTimeDraft(configuredFactoryEndTime);
    if (editingFactoryField !== "factoryState" && editingFactoryField !== "factoryCity") {
      setFactoryStateDraft(configuredFactoryState);
      setFactoryCityDraft(configuredFactoryCity);
    }
  }, [configuredFactoryCity, configuredFactoryEndTime, configuredFactoryMaxEngines, configuredFactoryStartTime, configuredFactoryState, editingFactoryField]);

  const visibleCards = useMemo(() => cardsPayload?.items || [], [cardsPayload?.items]);
  const selectedVisibleCount = visibleCards.filter((card) => selectedCardIds.has(card.id)).length;
  const allVisibleSelected = visibleCards.length > 0 && selectedVisibleCount === visibleCards.length;
  const cardTotal = Number(cardsPayload?.total || 0);
  const cardTotalPages = Math.max(1, Math.ceil(cardTotal / CARD_PAGE_LIMIT));
  const rotatingStats = useMemo(() => {
    const sourceCards = visibleCards.length ? visibleCards : (audit?.latestCards || []);
    const countBy = (key: "city" | "state") => {
      const map = new Map<string, number>();
      for (const card of sourceCards) {
        const value = String(card[key] || "").trim();
        if (!value) continue;
        map.set(value, (map.get(value) || 0) + 1);
      }
      return [...map.entries()].sort((left, right) => right[1] - left[1]);
    };
    const cities = countBy("city");
    const states = countBy("state");
    return {
      city: cities[rotatingMetricIndex % Math.max(1, cities.length)] || null,
      state: states[rotatingMetricIndex % Math.max(1, states.length)] || null,
    };
  }, [audit?.latestCards, rotatingMetricIndex, visibleCards]);
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
        engines: groupEngines,
        allPaused: groupEngines.length > 0 && groupEngines.every((engine) => engine.manualPaused || String(engine.status || "").toLowerCase() === "paused"),
        anyActive: groupEngines.some((engine) => !engine.manualPaused && String(engine.status || "").toLowerCase() !== "paused"),
      };
    });
  }, [audit?.engines, queueActive, summary?.motoresRegistrados]);
  const selectedEnginePanel = enginePanels.find((panel) => panel.id === selectedEnginePanelId) || null;
  const mostLoadedPanel = enginePanels
    .slice()
    .sort((left, right) => right.cardsToday - left.cardsToday)[0] || null;
  const kpis = useMemo(() => {
    const errorCount = Number(summary?.motoresErro || 0) + Number(summary?.campaignsFailedToday || 0) + Number(summary?.searchRunsFailedToday || 0);
    return [
      ["Total no banco", metric(summary?.totalCards)],
      ["Erros", metric(errorCount)],
      ["Novos hoje", metric(summary?.cardsToday)],
      ["Última hora", metric(summary?.cardsLastHour)],
      ["Cidades", rotatingStats.city ? `${rotatingStats.city[0]} · ${metric(rotatingStats.city[1])}` : "-"],
      ["Estados", rotatingStats.state ? `${rotatingStats.state[0]} · ${metric(rotatingStats.state[1])}` : metric(summary?.totalCompanyStates)],
      ["Mais cheio", mostLoadedPanel ? `${mostLoadedPanel.label} · ${metric(mostLoadedPanel.cardsToday)}` : "-"],
      ["Online", metric(summary?.motoresOnline)],
      ["Permitidos", metric(protection?.factoryAllowedEngines)],
      ["Trabalhando", metric(summary?.motoresBusy)],
    ];
  }, [mostLoadedPanel, protection?.factoryAllowedEngines, rotatingStats, summary]);

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

  async function saveFactorySchedule(patch: Record<string, unknown>, successMessage = "Controle da fábrica atualizado.") {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await apiFetch("/modules/master/webscraping/turbo-noturno", {
        method: "PUT",
        requireAuth: true,
        timeoutMs: 20000,
        body: JSON.stringify({
          enabled: true,
          stopOutsideWindow: true,
          ...patch,
        }),
      });
      await loadAudit({ silent: true });
      setFeedback(successMessage);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar controle da fábrica.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function commitFactoryMaxEngines() {
    const maxEngines = Number(factoryMaxEnginesDraft);
    if (!Number.isInteger(maxEngines) || maxEngines < 0 || maxEngines > 100) {
      setError("Digite um limite de motores entre 0 e 100.");
      return;
    }
    if (maxEngines === configuredFactoryMaxEngines) {
      setEditingFactoryField(null);
      setFactoryMaxEnginesDraft(String(maxEngines));
      return;
    }
    const saved = await saveFactorySchedule({ maxEngines, engineCount: maxEngines, emergencyStop: false }, `Limite da fábrica ajustado para ${maxEngines} motor(es).`);
    if (saved) setEditingFactoryField(null);
  }

  async function commitFactoryTime(field: "startTime" | "endTime") {
    const parsed = parseFactoryTimeInput(field === "startTime" ? factoryStartTimeDraft : factoryEndTimeDraft);
    if (!parsed) {
      setError("Digite o horário no formato HH:MM, por exemplo 18:00.");
      return;
    }
    if (field === "startTime") {
      setFactoryStartTimeDraft(parsed.label);
      if (parsed.label === configuredFactoryStartTime) {
        setEditingFactoryField(null);
        return;
      }
      const saved = await saveFactorySchedule({ startHour: parsed.hour, startMinute: parsed.minute }, "Horário inicial da fábrica atualizado.");
      if (saved) setEditingFactoryField(null);
      return;
    }
    setFactoryEndTimeDraft(parsed.label);
    if (parsed.label === configuredFactoryEndTime) {
      setEditingFactoryField(null);
      return;
    }
    const saved = await saveFactorySchedule({ endHour: parsed.hour, endMinute: parsed.minute }, "Horário final da fábrica atualizado.");
    if (saved) setEditingFactoryField(null);
  }

  async function commitFactoryLocation() {
    const factoryState = factoryStateDraft.trim().toUpperCase();
    const factoryCity = factoryCityDraft.trim();
    if ((factoryState || factoryCity) && (!factoryState || !factoryCity)) {
      return;
    }
    if (factoryState && factoryState.length !== 2) {
      setError("Estado deve ter 2 letras, por exemplo SP.");
      return;
    }
    if (factoryState === configuredFactoryState && factoryCity === configuredFactoryCity) {
      setEditingFactoryField(null);
      return;
    }
    const saved = await saveFactorySchedule(
      {
        factoryState,
        factoryCity,
        emergencyStop: false,
        stopOutsideWindow: !factoryState || !factoryCity,
      },
      factoryState && factoryCity
        ? `Fábrica fixada em ${factoryCity}/${factoryState}.`
        : "Fábrica voltou a seguir a agenda.",
    );
    if (saved) setEditingFactoryField(null);
  }

  function updateCardFilter<K extends keyof CardFilters>(key: K, value: CardFilters[K]) {
    setCardFilters((current) => ({ ...current, [key]: value }));
  }

  function applyCardFilters() {
    setCardPage(1);
    setAppliedCardFilters({ ...cardFilters });
    setHasSearchedCards(true);
    setCardsSearchToken((current) => current + 1);
  }

  function resetCardFilters() {
    setCardFilters(DEFAULT_CARD_FILTERS);
    setAppliedCardFilters(DEFAULT_CARD_FILTERS);
    setCardPage(1);
    setCardsPayload(null);
    setSelectedCardIds(new Set());
    setHasSearchedCards(false);
    setCardsSearchToken((current) => current + 1);
  }

  async function toggleEnginePanel(panel: (typeof enginePanels)[number]) {
    const action = panel.allPaused ? "resume" : "pause";
    setEnginePanelBusy(panel.id);
    setError(null);
    setFeedback(null);
    try {
      await Promise.all(panel.engines.map((engine) => apiFetch(`/modules/master/webscraping/engines/${encodeURIComponent(engine.id)}/${action}`, {
        method: "POST",
        requireAuth: true,
        timeoutMs: 20000,
        body: action === "pause" ? JSON.stringify({ minutes: null }) : undefined,
      })));
      await loadAudit({ silent: true });
      setFeedback(action === "pause" ? `${panel.label} pausado.` : `${panel.label} retomado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alternar motores do painel.");
    } finally {
      setEnginePanelBusy(null);
    }
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
            <span>Painel master</span>
            <h1>Banco de Cards HBX</h1>
            <p>Filtros, motores em blocos e fábrica noturna. Atualizado em {formatDateTime(audit?.generatedAt)}.</p>
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

        <section className={styles.filterPanel}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Filtro de cards</span>
              <strong>{hasSearchedCards ? `${metric(cardTotal)} encontrados · 100 por página` : "Comece pesquisando"}</strong>
            </div>
            <small>{hasSearchedCards ? `Página ${metric(cardPage)} de ${metric(cardTotalPages)}` : "Clique em Pesquisar sem filtros para listar tudo"}</small>
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
            <button type="button" onClick={applyCardFilters} disabled={cardsLoading}>Pesquisar</button>
            <button type="button" onClick={resetCardFilters} disabled={cardsLoading}>Limpar</button>
            {hasSearchedCards ? <button type="button" onClick={() => void loadCards()} disabled={cardsLoading}>Atualizar lista</button> : null}
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
            {!hasSearchedCards ? (
              <div className={styles.emptyRow}>Nenhum card exibido ainda. Use os filtros e clique em Pesquisar. Se pesquisar sem filtro, o sistema lista tudo em páginas de 100.</div>
            ) : cardsLoading ? (
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

          {hasSearchedCards ? <div className={styles.paginationRow}>
            <button type="button" onClick={() => setCardPage((page) => Math.max(1, page - 1))} disabled={cardsLoading || cardPage <= 1}>Anterior</button>
            <span>Mostrando {metric(visibleCards.length)} de {metric(cardTotal)} resultados - 100 por página.</span>
            <button type="button" onClick={() => setCardPage((page) => Math.min(cardTotalPages, page + 1))} disabled={cardsLoading || cardPage >= cardTotalPages}>Próxima</button>
          </div> : null}

          <p className={styles.auditNote}>
            Exportar cria/atualiza o estado privado em RadarLeadCompanyState para a empresa do usuário. Negativas, bloqueios, opt-outs, tentativas e envios para Vendas continuam voltando para o banco e impedem reentrega indevida.
          </p>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Motores</span>
              <strong>Status real em blocos de 20</strong>
            </div>
            <small>{metric(summary?.motoresOnline)} online · {metric(summary?.motoresBusy)} ocupados · {metric(summary?.motoresPausados)} pausados</small>
          </div>
          <div className={styles.enginePanelGrid} aria-label="Motores agrupados de 20 em 20">
            {enginePanels.slice(0, 5).map((panel) => (
              <article key={panel.id} className={styles.enginePanel} data-status={panel.allPaused ? "paused" : panel.tone}>
                <button
                  type="button"
                  className={styles.enginePanelButton}
                  onClick={() => void toggleEnginePanel(panel)}
                  disabled={enginePanelBusy === panel.id || !panel.engines.length}
                  title={panel.allPaused ? "Clique para ativar os 20 motores" : "Clique para desativar os 20 motores"}
                >
                  <span>{panel.label}</span>
                  <strong>Motores {panel.range}</strong>
                  <b>{panel.allPaused ? "Desativado" : panel.statusLabel}</b>
                </button>
                <div className={styles.enginePanelStats}>
                  <span><strong>{metric(panel.online)}</strong> online</span>
                  <span><strong>{metric(panel.busy)}</strong> rodando</span>
                  <span><strong>{metric(panel.cardsToday)}</strong> hoje</span>
                  <span><strong>{metric(panel.erro)}</strong> erros</span>
                </div>
                <div className={styles.enginePanelFooter}>
                  <span>{panel.meaning}</span>
                  <button type="button" onClick={() => setSelectedEnginePanelId(panel.id)}>Verificar</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.factoryPanel} data-status={factoryTone(factory?.status, factory?.enabled)}>
          <div className={styles.factoryHeader}>
            <div className={styles.factoryHeading}>
              <span>Fábrica Noturna</span>
              <strong>{factoryStatusText}</strong>
              <small>{factoryReasonText} · {factoryWindowLabel(factorySchedule)} · {factoryCalendarLabel(factorySchedule)}</small>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => void runFactoryAction("start", "Fábrica ligada e próxima missão solicitada.")} disabled={saving}>Ligar</button>
              <button type="button" data-danger="true" onClick={() => void runFactoryAction("stop", "Fábrica desligada.")} disabled={saving}>Desligar</button>
            </div>
          </div>

          <div className={styles.factoryStatusStrip}>
            <div data-tone={factoryEmergencyStop ? "danger" : factory?.enabled ? "ok" : "paused"}>
              <span>Status</span>
              <strong>{factoryEmergencyStop ? "Parada total" : factoryStatusText}</strong>
            </div>
            <div>
              <span>Agora</span>
              <strong>{metric(summary?.motoresBusy)} trabalhando · {metric(protection?.factoryAllowedEngines)} permitidos</strong>
            </div>
            <div>
              <span>Próxima janela</span>
              <strong>{formatDateTime(protection?.factoryNextStartAt)}</strong>
            </div>
            <div>
              <span>Próxima parada</span>
              <strong>{formatDateTime(protection?.factoryNextStopAt)}</strong>
            </div>
          </div>

          <div className={styles.factoryGrid}>
            <label className={styles.factoryField}>
              <span>Estado</span>
              <input
                type="text"
                value={factoryStateDraft}
                onFocus={() => setEditingFactoryField("factoryState")}
                onChange={(event) => {
                  setEditingFactoryField("factoryState");
                  setFactoryStateDraft(event.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2));
                }}
                onBlur={() => void commitFactoryLocation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setFactoryStateDraft(configuredFactoryState);
                    setEditingFactoryField(null);
                    event.currentTarget.blur();
                  }
                }}
                placeholder="SP"
                maxLength={2}
                disabled={saving}
                aria-label="Estado da cidade fixa"
              />
            </label>
            <label className={styles.factoryField}>
              <span>Cidade</span>
              <input
                type="text"
                value={factoryCityDraft}
                onFocus={() => setEditingFactoryField("factoryCity")}
                onChange={(event) => {
                  setEditingFactoryField("factoryCity");
                  setFactoryCityDraft(event.target.value);
                }}
                onBlur={() => void commitFactoryLocation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setFactoryCityDraft(configuredFactoryCity);
                    setEditingFactoryField(null);
                    event.currentTarget.blur();
                  }
                }}
                placeholder="Campinas"
                disabled={saving}
                aria-label="Cidade fixa"
              />
            </label>
            <label className={styles.factoryField}>
              <span>Motores trabalhando</span>
              <input
                type="text"
                inputMode="numeric"
                value={factoryMaxEnginesDraft}
                onFocus={() => setEditingFactoryField("maxEngines")}
                onChange={(event) => {
                  setEditingFactoryField("maxEngines");
                  setFactoryMaxEnginesDraft(event.target.value.replace(/\D/g, "").slice(0, 3));
                }}
                onBlur={() => void commitFactoryMaxEngines()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    setFactoryMaxEnginesDraft(String(configuredFactoryMaxEngines));
                    setEditingFactoryField(null);
                    event.currentTarget.blur();
                  }
                }}
                disabled={saving}
                aria-label="Motores trabalhando"
              />
            </label>
            {!factoryGuidedLocation ? <label className={styles.factoryField}>
              <span>Horário início</span>
              <input
                type="time"
                placeholder="18:00"
                value={factoryStartTimeDraft}
                onFocus={() => setEditingFactoryField("startTime")}
                onChange={(event) => {
                  setEditingFactoryField("startTime");
                  setFactoryStartTimeDraft(normalizeFactoryTimeInput(event.target.value));
                }}
                onBlur={() => void commitFactoryTime("startTime")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    setFactoryStartTimeDraft(configuredFactoryStartTime);
                    setEditingFactoryField(null);
                    event.currentTarget.blur();
                  }
                }}
                disabled={saving}
                aria-label="Horário início"
              />
            </label> : null}
            {!factoryGuidedLocation ? <label className={styles.factoryField}>
              <span>Horário fim</span>
              <input
                type="time"
                placeholder="08:00"
                value={factoryEndTimeDraft}
                onFocus={() => setEditingFactoryField("endTime")}
                onChange={(event) => {
                  setEditingFactoryField("endTime");
                  setFactoryEndTimeDraft(normalizeFactoryTimeInput(event.target.value));
                }}
                onBlur={() => void commitFactoryTime("endTime")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    setFactoryEndTimeDraft(configuredFactoryEndTime);
                    setEditingFactoryField(null);
                    event.currentTarget.blur();
                  }
                }}
                disabled={saving}
                aria-label="Horário fim"
              />
            </label> : null}
            {!factoryGuidedLocation ? <label className={styles.factoryCheckField}>
              <input
                type="checkbox"
                checked={Boolean(factorySchedule?.weekdaysOnly)}
                onChange={(event) => {
                  void saveFactorySchedule({
                    weekdaysOnly: event.target.checked,
                    weekendAlwaysOn: event.target.checked ? false : Boolean(factorySchedule?.weekendAlwaysOn),
                  }, event.target.checked ? "Fábrica limitada a dias úteis." : "Fábrica liberada para todos os dias.");
                }}
                disabled={saving}
              />
              <span>Dias úteis</span>
            </label> : null}
            {!factoryGuidedLocation ? <label className={styles.factoryCheckField}>
              <input
                type="checkbox"
                checked={Boolean(factorySchedule?.weekendAlwaysOn)}
                onChange={(event) => {
                  void saveFactorySchedule({
                    weekendAlwaysOn: event.target.checked,
                    weekdaysOnly: event.target.checked ? false : Boolean(factorySchedule?.weekdaysOnly),
                  }, event.target.checked ? "Fim de semana liberado 24h." : "Fim de semana voltou a seguir a janela.");
                }}
                disabled={saving}
              />
              <span>Fim de semana 24h</span>
            </label> : null}
          </div>
        </section>

        {selectedEnginePanel ? (
          <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label={`Detalhes ${selectedEnginePanel.label}`}>
            <div className={styles.engineModal}>
              <div className={styles.sectionTitle}>
                <div>
                  <span>{selectedEnginePanel.label}</span>
                  <strong>Motores {selectedEnginePanel.range}</strong>
                </div>
                <button type="button" onClick={() => setSelectedEnginePanelId(null)}>Fechar</button>
              </div>
              <div className={styles.engineTable}>
                <div className={styles.engineHead}>
                  <span>Motor</span>
                  <span>Status</span>
                  <span>Hoje</span>
                  <span>10 min</span>
                  <span>Último uso</span>
                  <span>Função atual</span>
                  <span>Erro</span>
                </div>
                {selectedEnginePanel.engines.map((engine) => (
                  <div key={engine.id} className={styles.engineRow} data-status={statusTone(engine.status)}>
                    <span><strong>{engine.id}</strong><small>#{engine.engineIndex + 1}</small></span>
                    <span>{engine.manualPaused ? "paused" : engine.status || "-"}</span>
                    <span>{metric(engine.cardsToday)}</span>
                    <span>{metric(engine.cardsLast10Min)}</span>
                    <span>{formatDateTime(engine.lastUsedAt)}</span>
                    <span>{engine.currentMeaning}</span>
                    <span>{engine.lastError || "-"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </DashboardScaffold>
  );
}
