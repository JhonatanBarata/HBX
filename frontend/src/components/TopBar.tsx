"use client";

import Link from "next/link";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { apiFetch, clearApiCache, clearToken, getToken } from "@/app/_lib/api";
import { useInterfaceTransition } from "@/components/InterfaceTransitionProvider";
import { useHbxTheme } from "@/components/ThemeProvider";
import {
  TOPBAR_PROGRESS_EVENT,
  type TopbarProgressEventDetail,
  type TopbarProgressMetric,
  type TopbarProgressState,
} from "@/lib/topbar-progress";
import { usePopupTopbarLock } from "@/lib/use-popup-topbar-lock";
import {
  getWhatsAppModalPlanRedirect,
  type WhatsAppCenterPayload,
  type WhatsAppDiagnosticFocus,
  type WhatsAppModalPayload,
} from "@/lib/whatsapp-center";
import {
  MASTER_CONTEXT_CHANGED_EVENT,
  dispatchMasterContextChanged,
  type MasterContextChangedDetail,
} from "../lib/masterContextEvents";
import { dispatchModulesChanged, MODULES_CHANGED_EVENT } from "../lib/module-events";
import ThemeSwitcher from "./ThemeSwitcher";
import WhatsAppOperationalDialog from "./WhatsAppOperationalDialog";

type User = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: {
    id: number;
    name?: string | null;
    onboardingStatus?: string | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    premiumAccess?: boolean | null;
    billingGraceEndsAt?: string | null;
  } | null;
  masterContext?: {
    active: boolean;
    mode: "master_puro" | "empresa_assumida";
    sessionId: string | null;
    companyId: number | null;
    companyName: string | null;
    reason?: string | null;
    startedAt?: string | null;
    expiresAt?: string | null;
  } | null;
};

type MasterOverviewCompany = {
  id: number;
  name: string;
  isActive: boolean;
  paymentStatus: string;
};

type MasterOverviewCompanyPayload = {
  id?: number | string | null;
  name?: string | null;
  isActive?: boolean | null;
  paymentStatus?: string | null;
};

type UserModule = { key: string; accessible: boolean };
type CommercialPlansTopbarPayload = {
  current?: {
    entitlements?: {
      atendimento_chat?: boolean | null;
    } | null;
  } | null;
};
type OperationalTone = "green" | "yellow" | "red";
type OperationalStatusChip = {
  key: "token" | "meta" | "webwhats" | "payment" | "access";
  label: string;
  shortLabel: string;
  tone: OperationalTone;
  value: string;
  detail: string;
  href: string;
  quality: "real" | "partial" | "stale";
  source: string[];
  updatedAt: string | null;
};
type OperationalStatusPayload = {
  generatedAt: string;
  context: {
    available: boolean;
    companyId: number | null;
    companyName: string | null;
    mode: "empresa" | "master_assumido" | "master_puro" | "sem_empresa";
    masterContext?: User["masterContext"] | null;
  };
  statuses: OperationalStatusChip[];
};
type ScrapingEngineKind = "hbx" | "google";
type ScrapingEngineStatus = {
  id: string;
  kind: ScrapingEngineKind;
  label: string;
  shortLabel: string;
  index: number | null;
  status: string;
  configured: boolean;
  active: boolean;
  online: boolean;
  busy: boolean;
  dimmed: boolean;
  url: string | null;
  lockedUntil: string | null;
  cooldownUntil: string | null;
  manualPaused?: boolean | null;
  pausedUntil?: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  detail: string;
  usagePercent?: number | null;
  stateLabel?: string | null;
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
type ScrapingEngineStatusPayload = {
  generatedAt: string;
  capacity: {
    activeEngineCount: number;
    googleEmergencyMode: boolean;
    queuedCount: number;
    runningCount: number;
    completedLast10Min?: number;
    partialLast10Min?: number;
    operationalStatus: "healthy" | "degraded";
    message: string | null;
    isTurboEnabled?: boolean;
    isTurboWindowActive?: boolean;
    isTurboForcedNow?: boolean;
    forcedUntil?: string | null;
    nextTurboAt?: string | null;
  };
  engines: ScrapingEngineStatus[];
};
type TopbarCommandPayload<TParsed = unknown> = {
  status?: string;
  raw?: string | null;
  error?: string | null;
  parsed?: TParsed | null;
};
type TopbarServiceHealth = {
  status?: string;
  responseMs?: number | null;
  error?: string | null;
};
type TopbarSystemHealthPayload = {
  generatedAt: string;
  memory?: TopbarCommandPayload<{
    totalKb?: number | null;
    availableKb?: number | null;
    usedKb?: number | null;
    usagePercent?: number | null;
  }> & { source?: string | null };
  disk?: TopbarCommandPayload<{
    filesystem?: string | null;
    size?: string | null;
    used?: string | null;
    available?: string | null;
    usagePercent?: string | number | null;
    mount?: string | null;
  }>;
  load?: TopbarCommandPayload<{
    oneMinute?: string | number | null;
    fiveMinutes?: string | number | null;
    fifteenMinutes?: string | number | null;
  }> & { loadavg?: string | null };
  uptime?: TopbarCommandPayload & {
    seconds?: number | null;
    formatted?: string | null;
  };
  postgres?: TopbarServiceHealth;
  api?: TopbarServiceHealth & {
    processUptimeSeconds?: number | null;
  };
};
type TopbarSystemVital = {
  id: "memory" | "disk";
  label: string;
  value: string;
  detail: string;
  usage: number | null;
  tone: "green" | "yellow" | "red";
};
type WhatsAppHealth = "green" | "yellow" | "red";
type RecoveryAlertConversation = {
  conversationId: number;
  customerName: string;
  customerWhatsapp: string;
  conversationWhatsapp: string;
  humanQueue: boolean;
  humanAssigned: boolean;
  isClosed: boolean;
  isBlocked: boolean;
  lastMessage: string;
  lastDirection: string;
  lastAt: string;
  metadata?: Record<string, unknown> | null;
};
type RecoveryAlertSummary = {
  pendingHumanCount: number;
  conversations: RecoveryAlertConversation[];
};
type InboxAlertMessage = {
  id?: string;
  direction: string;
  content: string;
  createdAt: string;
};

type TopBarUnreadEntry = {
  conversationId: string;
  conversationLabel: string;
  messageId: string;
  messagePreview: string;
  messageAt: string;
  unreadCount: number;
};
type InboxAlertConversation = {
  id: string;
  status: string;
  routeTarget: string;
  isBlocked: boolean;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
  customer: {
    name: string | null;
    phone: string;
  };
  messages: InboxAlertMessage[];
};
type TopBarIncomingPopup = {
  id: string;
  moduleLabel: string;
  attentionLabel: string;
  customerLabel: string;
  contactPhone: string;
  entryNumberLabel: string | null;
  preview: string;
  href: string;
  lastAt: string;
};

type BillboardSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  phase: "idle" | "loading" | "success" | "warning";
  source?: string | null;
  isTheater?: boolean;
  progress?: number | null;
  metrics?: TopbarProgressMetric[];
};

type TopbarSignalTone = "success" | "warning" | "danger" | "neutral" | "loading";
type TopbarOperationalTile = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: TopbarSignalTone;
  usage?: number | null;
};
type TopbarHostingerVital = TopbarOperationalTile & {
  source?: string | null;
};

type HbxPrefetchWindow = Window & {
  __hbx_prefetch?: {
    modules: UserModule[];
    profile: User | null;
  };
};

const RECOVERY_HUMAN_QUEUE_EVENT = "hbx-recovery-human-queue";
const ATENDIMENTO_HUMAN_QUEUE_EVENT = "atendimento-human-queue";
const RECOVERY_QUEUE_STORAGE_KEY = "hbxRecoveryPendingHumanCount";
const ATENDIMENTO_QUEUE_STORAGE_KEY = "atendimentoPendingHumanCount";
const MODULES_PEEK_EVENT = "hbx:modules-peek";
const MODULES_TRIGGER_ID = "app-modules-trigger";
const SUPPORT_PHONE = "++5519997024884";
const SUPPORT_MESSAGE = "Olá, preciso de ajuda com o HBX!";

const hiddenRoutes = new Set(["/login", "/register", "/reset-password", "/confirm-email", "/boasvindas", "/tutorial"]);
const SCRAPING_ENGINE_POLL_MS = 5000;
const SYSTEM_HEALTH_REFRESH_DETAIL = "Sem atualização automática";
const TOPBAR_HBX_ENGINE_COUNT = 20;
const HBX_GAUGE_BOOT_MS = 1350;

function buildFallbackScrapingEngine(index: number): ScrapingEngineStatus {
  return {
    id: `hbx-engine-${index + 1}`,
    kind: "hbx",
    label: `HBX Motor ${index + 1}`,
    shortLabel: `HBX ${index + 1}`,
    index,
    status: "standby",
    configured: index === 0,
    active: false,
    online: index === 0,
    busy: false,
    dimmed: true,
    url: null,
    lockedUntil: null,
    cooldownUntil: null,
    lastCheckedAt: null,
    lastError: null,
    detail: index === 0 ? "Pronto, sem solicitação ativa." : "Motor em espera.",
    usagePercent: index === 0 ? 8 : 4,
    stateLabel: index === 0 ? "Standby pronto" : "Sem healthcheck",
    lastActivityAt: null,
    activeRunId: null,
    activeCampaignId: null,
    queueShare: 0,
    processedLast10Min: 0,
    errorCount: 0,
    heartbeatAgeSeconds: null,
    isTurboEnabled: false,
    isTurboWindowActive: false,
    isTurboForcedNow: false,
  };
}

function normalizeScrapingEngines(payload: ScrapingEngineStatusPayload | null) {
  const source = Array.isArray(payload?.engines) ? payload.engines : [];
  const sourceHbxCount = source.filter((engine) => engine.kind === "hbx").length;
  const hbxEngineCount = sourceHbxCount || TOPBAR_HBX_ENGINE_COUNT;
  const hbxEngines = Array.from({ length: hbxEngineCount }, (_, index) => {
    return source.find((engine) => engine.kind === "hbx" && engine.index === index) || buildFallbackScrapingEngine(index);
  });
  const engines = hbxEngines;
  return {
    engines,
    hbxEngines,
    hasActive: engines.some((engine) => engine.active),
  };
}

function getScrapingEngineState(engine: ScrapingEngineStatus) {
  const status = String(engine.status || "").trim().toLowerCase();
  const pausedUntil = engine.pausedUntil ? new Date(engine.pausedUntil).getTime() : NaN;
  if (engine.manualPaused || status === "paused" || (Number.isFinite(pausedUntil) && pausedUntil > Date.now())) return "paused";
  if (engine.kind === "google" && engine.active) return "emergency";
  if (engine.active || status === "busy") return "busy";
  if (!engine.configured || status === "missing") return "missing";
  if (status === "offline") return "offline";
  if (status === "cooldown") return "cooldown";
  if (status === "degraded") return "degraded";
  return "standby";
}

function getScrapingEngineShortLabel(engine: ScrapingEngineStatus) {
  if (engine.kind === "google") return "G";
  return `M${Number(engine.index || 0) + 1}`;
}

function getEngineUsage(engine: ScrapingEngineStatus) {
  const usage = Number(engine.usagePercent);
  return Number.isFinite(usage) ? Math.max(0, Math.min(100, Math.round(usage))) : engine.active ? 82 : 8;
}

function clampTopbarPercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function getEngineGaugeStyle(usage: number): React.CSSProperties {
  const safeUsage = clampTopbarPercent(usage);
  const ratio = safeUsage / 100;

  return {
    ["--engine-usage" as string]: `${safeUsage}%`,
    ["--engine-angle" as string]: `${180 + safeUsage * 1.8}deg`,
    ["--engine-arc" as string]: `${safeUsage * 1.8}deg`,
    ["--engine-glow" as string]: Math.pow(ratio, 1.28).toFixed(3),
    ["--engine-neon" as string]: Math.pow(ratio, 1.86).toFixed(3),
    ["--engine-hot" as string]: Math.pow(ratio, 2.82).toFixed(3),
    ["--engine-glow-size" as string]: `${20 + Math.pow(ratio, 1.5) * 86}px`,
    ["--engine-neon-size" as string]: `${16 + Math.pow(ratio, 2.04) * 118}px`,
  } as React.CSSProperties;
}

function resolveEngineGroupState(engines: ScrapingEngineStatus[], isLive: (engine: ScrapingEngineStatus) => boolean) {
  if (engines.some((engine) => isLive(engine) || getScrapingEngineState(engine) === "busy" || engine.busy)) return "busy";
  if (engines.some((engine) => getScrapingEngineState(engine) === "degraded")) return "degraded";
  if (engines.some((engine) => getScrapingEngineState(engine) === "cooldown")) return "cooldown";
  if (engines.length && engines.every((engine) => getScrapingEngineState(engine) === "paused")) return "paused";
  if (engines.length && engines.every((engine) => getScrapingEngineState(engine) === "offline" || getScrapingEngineState(engine) === "missing")) {
    return "offline";
  }
  return "standby";
}

function normalizePercentValue(value?: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value * 10) / 10)) : null;
  }
  const parsed = Number(String(value || "").replace("%", "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed * 10) / 10)) : null;
}

function isTopbarTheaterSource(source: string | null | undefined) {
  const normalized = String(source || "").trim().toLowerCase();
  return normalized === "vendas" ||
    normalized === "radar" ||
    normalized === "radar-digital" ||
    normalized.startsWith("atendimento-");
}

function formatTopbarPercent(value?: string | number | null) {
  const parsed = normalizePercentValue(value);
  if (parsed === null) return "--";
  return Number.isInteger(parsed) ? `${parsed}%` : `${parsed.toFixed(1)}%`;
}

function formatTopbarKb(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  const gb = numeric / 1024 / 1024;
  if (gb >= 1) return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
  const mb = numeric / 1024;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function formatTopbarDateTime(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTopbarMs(value?: number | null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.max(0, Math.round(numeric))} ms` : "--";
}

function serviceStatusLabel(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "ok") return "OK";
  if (normalized === "error") return "Erro";
  if (normalized === "unavailable") return "Indisponível";
  return status ? String(status) : "Em leitura";
}

function serviceTone(status?: string | null): TopbarSignalTone {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "ok") return "success";
  if (normalized === "error") return "danger";
  return "warning";
}

function systemVitalTone(usage: number | null): TopbarSystemVital["tone"] {
  if (usage === null) return "yellow";
  if (usage >= 86) return "red";
  if (usage >= 72) return "yellow";
  return "green";
}

function extractEntryNumberLabel(metadata?: Record<string, unknown> | null) {
  const endpointLabel = String(metadata?.whatsappEntryEndpointLabel || "").trim();
  const displayNumber = String(metadata?.whatsappEntryDisplayNumber || "").trim();
  if (endpointLabel && displayNumber) return `${endpointLabel} (${displayNumber})`;
  if (endpointLabel) return endpointLabel;
  if (displayNumber) return displayNumber;
  return null;
}

function formatInboxPreview(conversation: InboxAlertConversation) {
  const latestMessage = conversation.messages?.[0];
  const content = String(latestMessage?.content || "").trim();
  if (content) return content;
  return "Nova mensagem aguardando resposta.";
}

function shouldLoadModalQr(nextPayload: WhatsAppModalPayload | null, includeQr: boolean) {
  if (!includeQr || !nextPayload?.data.available) return false;
  return nextPayload.status !== "connected";
}

function mergeModalPayload(
  statusPayload: WhatsAppModalPayload,
  qrPayload: WhatsAppModalPayload,
): WhatsAppModalPayload {
  if (qrPayload.data.qrCodeDataUrl || qrPayload.status === "connected") {
    return {
      ...qrPayload,
      data: {
        ...statusPayload.data,
        ...qrPayload.data,
      },
    };
  }

  return {
    ...statusPayload,
    data: {
      ...statusPayload.data,
      updatedAt: qrPayload.data.updatedAt || statusPayload.data.updatedAt,
      lastError: qrPayload.data.lastError || statusPayload.data.lastError,
      qrCodeDataUrl: qrPayload.data.qrCodeDataUrl || null,
    },
  };
}

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const topbarFrameRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const unreadMenuRef = useRef<HTMLDivElement | null>(null);
  const { isShuttingDown, runGlobalShutdown } = useInterfaceTransition();
  const { setStorageUserId } = useHbxTheme();

  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [modulesPeekAvailable, setModulesPeekAvailable] = useState(false);
  const [modulesPeekOpen, setModulesPeekOpen] = useState(false);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [attendantName, setAttendantName] = useState("");
  const [savingAttendantName, setSavingAttendantName] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeMsg, setChangeMsg] = useState<string | null>(null);
  const [operationalStatus, setOperationalStatus] = useState<OperationalStatusPayload | null>(null);
  const [recoveryPendingHumanCount, setRecoveryPendingHumanCount] = useState(0);
  const [atendimentoPendingHumanCount, setAtendimentoPendingHumanCount] = useState(0);
  const [topbarProgress, setTopbarProgress] = useState<TopbarProgressState | null>(null);
  const [billboardSlideIndex, setBillboardSlideIndex] = useState(0);
  const [scrapingEngines, setScrapingEngines] = useState<ScrapingEngineStatusPayload | null>(null);
  const [scrapingEngineStatusMessage, setScrapingEngineStatusMessage] = useState<string | null>(null);
  const [hbxGaugeBooting, setHbxGaugeBooting] = useState(true);
  const [hbxGaugeBootUsage, setHbxGaugeBootUsage] = useState(0);
  const [systemHealth, setSystemHealth] = useState<TopbarSystemHealthPayload | null>(null);
  const [unreadInboxOpen, setUnreadInboxOpen] = useState(false);
  const [unreadInboxLoading, setUnreadInboxLoading] = useState(false);
  const [unreadInboxError, setUnreadInboxError] = useState<string | null>(null);
  const [unreadInboxEntries, setUnreadInboxEntries] = useState<TopBarUnreadEntry[]>([]);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [incomingPopup, setIncomingPopup] = useState<TopBarIncomingPopup | null>(null);
  const [masterContextModalOpen, setMasterContextModalOpen] = useState(false);
  const [masterContextActionBusy, setMasterContextActionBusy] = useState(false);
  const [masterContextMessage, setMasterContextMessage] = useState<string | null>(null);
  const [masterCompanyOptions, setMasterCompanyOptions] = useState<MasterOverviewCompany[]>([]);
  const [selectedMasterCompanyId, setSelectedMasterCompanyId] = useState<string>("");
  const [masterContextReason, setMasterContextReason] = useState("");
  const [masterContextToast, setMasterContextToast] = useState<string | null>(null);
  const [topbarHiddenByScroll, setTopbarHiddenByScroll] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [whatsAppDetailOpen, setWhatsAppDetailOpen] = useState(false);
  const [whatsAppDetailFocus, setWhatsAppDetailFocus] = useState<WhatsAppDiagnosticFocus>("status");
  const [whatsAppDetailLoading, setWhatsAppDetailLoading] = useState(false);
  const [whatsAppDetailBusy, setWhatsAppDetailBusy] = useState<string | null>(null);
  const [whatsAppDetailError, setWhatsAppDetailError] = useState<string | null>(null);
  const [whatsAppDetailMessage, setWhatsAppDetailMessage] = useState<string | null>(null);
  const [whatsAppModalLoading, setWhatsAppModalLoading] = useState(false);
  const [whatsAppCenter, setWhatsAppCenter] = useState<WhatsAppCenterPayload | null>(null);
  const [whatsAppModal, setWhatsAppModal] = useState<WhatsAppModalPayload | null>(null);
  const [whatsAppQrRequested, setWhatsAppQrRequested] = useState(false);
  const [supportHasInternalChat, setSupportHasInternalChat] = useState<boolean | null>(null);
  const recoveryLastSeenRef = useRef<Map<number, string>>(new Map());
  const recoveryHumanQueueRef = useRef<Map<number, boolean>>(new Map());
  const recoveryAlertReadyRef = useRef(false);
  const atendimentoLastSeenRef = useRef<Map<string, string>>(new Map());
  const atendimentoAlertReadyRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioArmedRef = useRef(false);
  const masterContextToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollYRef = useRef(0);
  const previousWhatsAppModalStatusRef = useRef<string | null>(null);
  const scrapingEngineBackoffUntilRef = useRef(0);
  const scrapingEngineBackoffMsRef = useRef(SCRAPING_ENGINE_POLL_MS);
  const authResolved = authenticated !== null;
  const pendingCheckoutLocked = false;
  const pendingCheckoutHref = "/pagamento?focus=payment&reason=pending_checkout";
  const dashboardHref = pendingCheckoutLocked ? pendingCheckoutHref : user?.isSystemMaster ? "/master" : "/boasvindas";
  const isMasterWebscrapingRoute = Boolean(
    pathname?.startsWith("/master/webscraping") || pathname?.startsWith("/dashboard/master/webscraping"),
  );

  usePopupTopbarLock(whatsAppDetailOpen || masterContextModalOpen);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setHbxGaugeBooting(false);
      setHbxGaugeBootUsage(100);
      return undefined;
    }

    let frame = 0;
    let settleTimer: number | null = null;
    const startedAt = window.performance.now();

    setHbxGaugeBooting(true);
    setHbxGaugeBootUsage(0);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / HBX_GAUGE_BOOT_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setHbxGaugeBootUsage(Math.round(eased * 100));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      setHbxGaugeBootUsage(100);
      settleTimer = window.setTimeout(() => setHbxGaugeBooting(false), 180);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, []);

  useEffect(() => {
    const handleTopbarProgress = (event: Event) => {
      const detail = (event as CustomEvent<TopbarProgressEventDetail>).detail;
      if (!detail) return;

      if (detail.action === "show") {
        setTopbarProgress(detail.payload);
        return;
      }

      setTopbarProgress((current) => {
        if (!current) return current;
        if (detail.source && current.source !== detail.source) return current;
        return null;
      });
    };

    window.addEventListener(TOPBAR_PROGRESS_EVENT, handleTopbarProgress as EventListener);
    return () => {
      window.removeEventListener(TOPBAR_PROGRESS_EVENT, handleTopbarProgress as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!topbarProgress || topbarProgress.phase === "loading") return undefined;
    const timer = window.setTimeout(() => {
      setTopbarProgress((current) => {
        if (!current || current.source !== topbarProgress.source || current.title !== topbarProgress.title) {
          return current;
        }
        return null;
      });
    }, topbarProgress.phase === "warning" ? 5600 : topbarProgress.source === "vendas" ? 5200 : 3600);

    return () => window.clearTimeout(timer);
  }, [topbarProgress]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const root = document.documentElement;
    const syncPeekState = () => {
      setModulesPeekAvailable(root.dataset.hbxModulesPeekAvailable === "true");
      setModulesPeekOpen(root.dataset.hbxModulesPeekOpen === "true");
    };

    syncPeekState();

    const observer = new MutationObserver(syncPeekState);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-hbx-modules-peek-available", "data-hbx-modules-peek-open"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleModulesTrigger = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (authenticated !== true) {
        router.push("/login");
        return;
      }

      if (pendingCheckoutLocked) {
        router.push(pendingCheckoutHref);
        return;
      }

      if (!modulesPeekAvailable) {
        router.push(dashboardHref);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent(MODULES_PEEK_EVENT, {
          detail: {
            action: "toggle",
            anchorRect: {
              bottom: rect.bottom,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              width: rect.width,
            },
          },
        }),
      );
    },
    [authenticated, dashboardHref, modulesPeekAvailable, pendingCheckoutHref, pendingCheckoutLocked, router],
  );

  const refreshMasterAwareState = React.useCallback(async () => {
    const [profile, myModules, supportPlans] = await Promise.all([
      apiFetch<User>("/profile/current-user"),
      apiFetch<UserModule[]>("/modules/me"),
      isMasterWebscrapingRoute
        ? Promise.resolve(null)
        : apiFetch<CommercialPlansTopbarPayload>("/commercial-plans/me").catch(() => null),
    ]);
    setUser(profile);
    setModules(myModules || []);
    setSupportHasInternalChat(Boolean(supportPlans?.current?.entitlements?.atendimento_chat));
    if (typeof window !== "undefined") {
      (window as HbxPrefetchWindow).__hbx_prefetch = {
        modules: myModules || [],
        profile,
      };
    }
  }, [isMasterWebscrapingRoute]);

  const refreshOperationalStatus = React.useCallback(async (refreshLive = false) => {
    try {
      const suffix = refreshLive ? "?refresh=true" : "";
      const payload = await apiFetch<OperationalStatusPayload>(`/companies/me/operational-status${suffix}`);
      setOperationalStatus(payload);
      return payload;
    } catch {
      setOperationalStatus(null);
      return null;
    }
  }, []);

  const refreshScrapingEngines = React.useCallback(async () => {
    const hasWebscrapingModule = (modules || []).some((module) => module.key === "webscraping" && module.accessible);
    const isMaster = Boolean(user?.isSystemMaster);
    if (authenticated !== true || pendingCheckoutLocked || !user || (!isMaster && !hasWebscrapingModule)) {
      setScrapingEngines(null);
      setScrapingEngineStatusMessage(null);
      return null;
    }

    if (scrapingEngineBackoffUntilRef.current > Date.now()) {
      return null;
    }

    try {
      const endpoint = isMaster ? "/modules/master/webscraping/engines/status" : "/webscraping/engines/status";
      const payload = await apiFetch<ScrapingEngineStatusPayload>(endpoint, { timeoutMs: 12000 });
      setScrapingEngines(payload);
      setScrapingEngineStatusMessage(null);
      scrapingEngineBackoffMsRef.current = SCRAPING_ENGINE_POLL_MS;
      scrapingEngineBackoffUntilRef.current = 0;
      return payload;
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      if (status === 403) {
        scrapingEngineBackoffMsRef.current = Math.min(
          Math.max(scrapingEngineBackoffMsRef.current * 2, 30000),
          5 * 60 * 1000,
        );
        scrapingEngineBackoffUntilRef.current = Date.now() + scrapingEngineBackoffMsRef.current;
        setScrapingEngineStatusMessage(isMaster ? "Status dos motores em revalidação." : "Sem permissão para status dos motores.");
      } else {
        scrapingEngineBackoffUntilRef.current = Date.now() + 20000;
        setScrapingEngineStatusMessage("Status dos motores indisponível.");
      }
      setScrapingEngines(null);
      return null;
    }
  }, [authenticated, modules, pendingCheckoutLocked, user]);

  const refreshSystemHealth = React.useCallback(async () => {
    if (authenticated !== true || !user?.isSystemMaster) {
      setSystemHealth(null);
      return null;
    }

    try {
      const payload = await apiFetch<TopbarSystemHealthPayload>("/admin/system-health", {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setSystemHealth(payload);
      return payload;
    } catch {
      return null;
    }
  }, [authenticated, user?.isSystemMaster]);

  const loadWhatsAppCenter = React.useCallback(async (options?: { background?: boolean }) => {
    if (authenticated !== true) return null;
    if (pendingCheckoutLocked) {
      if (!options?.background) {
        setWhatsAppDetailError("Finalize sua contratação para liberar a conexão do WhatsApp.");
        router.push(pendingCheckoutHref);
      }
      return null;
    }
    if (!options?.background) setWhatsAppDetailLoading(true);
    setWhatsAppDetailError(null);
    try {
      const payload = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center");
      setWhatsAppCenter(payload);
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar o diagnostico do WhatsApp.";
      if (!options?.background) setWhatsAppDetailError(message);
      return null;
    } finally {
      if (!options?.background) setWhatsAppDetailLoading(false);
    }
  }, [authenticated, pendingCheckoutHref, pendingCheckoutLocked, router]);

  const loadWhatsAppModal = React.useCallback(async (options?: { background?: boolean; includeQr?: boolean }) => {
    if (authenticated !== true) return null;
    if (pendingCheckoutLocked) {
      if (!options?.background) {
        setWhatsAppDetailError("Finalize sua contratação para liberar a conexão do WhatsApp.");
        router.push(pendingCheckoutHref);
      }
      return null;
    }
    if (!options?.background) setWhatsAppModalLoading(true);
    setWhatsAppDetailError(null);
    try {
      const statusPayload = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status");
      let nextPayload = statusPayload;

      if (shouldLoadModalQr(statusPayload, Boolean(options?.includeQr))) {
        const qrPayload = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
        nextPayload = mergeModalPayload(statusPayload, qrPayload);
      } else {
        nextPayload = {
          ...statusPayload,
          data: {
            ...statusPayload.data,
            qrCodeDataUrl: statusPayload.data.qrCodeDataUrl || null,
          },
        };
      }

      setWhatsAppModal(nextPayload);
      const planRedirect = getWhatsAppModalPlanRedirect(nextPayload);
      if (planRedirect) {
        router.push(planRedirect);
      }
      return nextPayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar a conexão rápida por QR.";
      if (!options?.background) setWhatsAppDetailError(message);
      return null;
    } finally {
      if (!options?.background) setWhatsAppModalLoading(false);
    }
  }, [authenticated, pendingCheckoutHref, pendingCheckoutLocked, router]);

  const waitForWhatsAppModalQr = React.useCallback(async (statusPayload: WhatsAppModalPayload) => {
    let latestPayload = statusPayload;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const qrPayload = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
      latestPayload = mergeModalPayload(latestPayload, qrPayload);
      setWhatsAppModal(latestPayload);
      const planRedirect = getWhatsAppModalPlanRedirect(latestPayload);
      if (planRedirect) {
        router.push(planRedirect);
        return latestPayload;
      }
      if (latestPayload.data.qrCodeDataUrl || latestPayload.status === "connected") {
        return latestPayload;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }

    return latestPayload;
  }, [router]);

  const showMasterContextToast = React.useCallback((detail?: MasterContextChangedDetail | null) => {
    const mode = detail?.mode;
    const companyName = String(detail?.companyName || "").trim();
    const nextMessage =
      mode === "assumed"
        ? `Contexto alterado para ${companyName || "a empresa selecionada"}.`
        : "Contexto MASTER encerrado.";

    if (masterContextToastTimerRef.current) {
      clearTimeout(masterContextToastTimerRef.current);
    }

    setMasterContextToast(nextMessage);
    masterContextToastTimerRef.current = setTimeout(() => {
      setMasterContextToast(null);
      masterContextToastTimerRef.current = null;
    }, 3200);
  }, []);

  const playIncomingAlertTone = React.useCallback(() => {
    if (typeof window === "undefined" || !audioArmedRef.current) return;
    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) return;

    const audioContext =
      audioContextRef.current || new AudioContextCtor();
    audioContextRef.current = audioContext;
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.26);
  }, []);

  const presentIncomingPopup = React.useCallback((nextPopup: TopBarIncomingPopup) => {
    setIncomingPopup((current) => {
      if (
        current &&
        current.id === nextPopup.id &&
        new Date(current.lastAt).getTime() >= new Date(nextPopup.lastAt).getTime()
      ) {
        return current;
      }
      return nextPopup;
    });
    playIncomingAlertTone();
  }, [playIncomingAlertTone]);

  const accessibleModules = useMemo(() => {
    return new Set((modules || []).filter((m) => m.accessible).map((m) => m.key));
  }, [modules]);

  const operationalStatusMap = useMemo(() => {
    return new Map((operationalStatus?.statuses || []).map((chip) => [chip.key, chip]));
  }, [operationalStatus]);

  const scrapingEngineView = useMemo(() => normalizeScrapingEngines(scrapingEngines), [scrapingEngines]);
  const liveWebscrapingProgress = topbarProgress?.source === "webscraping" && topbarProgress.phase === "loading";
  const topbarProgressPercent = Math.round(Math.max(0, Math.min(100, topbarProgress?.progress || 0)));
  const progressEngineIds = useMemo(
    () => new Set((topbarProgress?.activeEngineIds || []).map((engineId) => String(engineId || "").trim()).filter(Boolean)),
    [topbarProgress?.activeEngineIds],
  );
  const progressEngineIndex =
    typeof topbarProgress?.activeEngineIndex === "number" && Number.isInteger(topbarProgress.activeEngineIndex)
      ? Math.max(0, Math.min(TOPBAR_HBX_ENGINE_COUNT - 1, topbarProgress.activeEngineIndex))
      : liveWebscrapingProgress
        ? Math.max(0, Math.min(TOPBAR_HBX_ENGINE_COUNT - 1, Math.floor(Math.max(0, Math.min(99, topbarProgress?.progress || 0)) / 5)))
        : null;
  const progressEngineLabel =
    topbarProgress?.activeEngineLabel ||
    (typeof progressEngineIndex === "number" ? `M${progressEngineIndex + 1}` : null);

  const isLiveScrapingEngine = React.useCallback(
    (engine: ScrapingEngineStatus) => {
      if (!liveWebscrapingProgress || engine.kind !== "hbx") return false;
      if (progressEngineIds.has(engine.id)) return true;
      return typeof progressEngineIndex === "number" && engine.index === progressEngineIndex;
    },
    [liveWebscrapingProgress, progressEngineIds, progressEngineIndex],
  );

  const getVisibleScrapingEngineState = React.useCallback(
    (engine: ScrapingEngineStatus) => {
      const state = getScrapingEngineState(engine);
      if (!isLiveScrapingEngine(engine)) return state;
      if (state === "offline" || state === "degraded" || state === "cooldown" || state === "paused") return state;
      return "busy";
    },
    [isLiveScrapingEngine],
  );

  const hasActiveScrapingEngine = scrapingEngineView.hasActive || liveWebscrapingProgress;
  const hbxUsageAverage = useMemo(() => {
    const engines = scrapingEngineView.hbxEngines;
    if (!engines.length) return 0;
    return Math.round(engines.reduce((sum, engine) => sum + getEngineUsage(engine), 0) / engines.length);
  }, [scrapingEngineView.hbxEngines]);
  const hbxProcessedLast10Min = useMemo(
    () => scrapingEngineView.hbxEngines.reduce((sum, engine) => sum + Math.max(0, Math.trunc(Number(engine.processedLast10Min || 0))), 0),
    [scrapingEngineView.hbxEngines],
  );
  const hbxRunningCount = scrapingEngineView.hbxEngines.filter((engine) => getScrapingEngineState(engine) === "busy" || engine.busy).length;
  const hbxEngineTotal = scrapingEngineView.hbxEngines.length;
  const hbxEngineOnlineCount = scrapingEngineView.hbxEngines.filter((engine) => engine.configured && engine.online).length;
  const hbxActiveEngineLimit = Math.max(
    0,
    Math.trunc(Number(scrapingEngines?.capacity?.activeEngineCount ?? (hbxEngineTotal || 0))),
  );
  const hbxCooldownCount = scrapingEngineView.hbxEngines.filter((engine) => getScrapingEngineState(engine) === "cooldown").length;
  const hbxPausedCount = scrapingEngineView.hbxEngines.filter((engine) => getScrapingEngineState(engine) === "paused").length;
  const hbxMainGaugeUsage = hbxGaugeBooting ? hbxGaugeBootUsage : hbxUsageAverage;
  const hbxMainGaugeState = useMemo(
    () => (hbxGaugeBooting ? "busy" : resolveEngineGroupState(scrapingEngineView.hbxEngines, isLiveScrapingEngine)),
    [hbxGaugeBooting, isLiveScrapingEngine, scrapingEngineView.hbxEngines],
  );
  const hbxMainGaugeActive = hbxGaugeBooting || hasActiveScrapingEngine || hbxMainGaugeUsage > 0;
  const hbxMainGaugeDetail = hbxGaugeBooting
    ? "Partida dos motores em varrida de luz"
    : `${hbxEngineOnlineCount}/${hbxEngineTotal} online • ${hbxActiveEngineLimit}/${hbxEngineTotal} ativos agora`;
  const hbxMainGaugeTitle = hbxGaugeBooting
    ? `Motores HBX aquecendo: ${hbxMainGaugeUsage}%`
    : `Motores HBX: ${hbxUsageAverage}% de uso geral. ${hbxMainGaugeDetail}.`;
  const hbxQueueCount = Math.max(0, Math.trunc(Number(scrapingEngines?.capacity?.queuedCount ?? 0)));
  const hbxCapacityRunningCount = Math.max(
    hbxRunningCount,
    Math.max(0, Math.trunc(Number(scrapingEngines?.capacity?.runningCount ?? 0))),
  );
  const hbxTenMinuteCount = Math.max(
    0,
    Math.trunc(Number(scrapingEngines?.capacity?.completedLast10Min ?? hbxProcessedLast10Min)),
  );
  const hbxQueueGaugeUsage = clampTopbarPercent((hbxQueueCount / Math.max(1, hbxEngineTotal * 3)) * 100);
  const hbxTenMinuteGaugeUsage = hbxGaugeBooting
    ? hbxMainGaugeUsage
    : clampTopbarPercent((hbxTenMinuteCount / Math.max(40, hbxEngineTotal * 5)) * 100);
  const hbxEngineIssueCount = scrapingEngineView.hbxEngines.filter((engine) => {
    const state = getVisibleScrapingEngineState(engine);
    return state === "degraded" || state === "offline" || state === "missing";
  }).length;
  const hbxEngineReportedErrorCount = scrapingEngineView.hbxEngines.reduce(
    (sum, engine) => sum + Math.max(0, Math.trunc(Number(engine.errorCount || 0))),
    0,
  );
  const hbxOperationalErrorCount = Math.max(hbxEngineIssueCount, hbxEngineReportedErrorCount);
  const hbxGaugePanels = [
    {
      id: "usage",
      label: "Uso geral",
      value: hbxMainGaugeUsage,
      metric: `${hbxEngineOnlineCount}/${hbxEngineTotal || TOPBAR_HBX_ENGINE_COUNT} online`,
      detail: `${hbxActiveEngineLimit}/${hbxEngineTotal || TOPBAR_HBX_ENGINE_COUNT} ativos agora`,
      state: hbxMainGaugeState,
      active: hbxMainGaugeActive,
      title: hbxMainGaugeTitle,
    },
    {
      id: "queue",
      label: "Pressão da fila",
      value: hbxQueueGaugeUsage,
      metric: String(hbxQueueCount),
      detail: hbxQueueCount > 0 ? "aguardando motor" : "fila zerada",
      state: hbxQueueGaugeUsage >= 82 ? "busy" : hbxQueueCount > 0 ? "cooldown" : "standby",
      active: hbxQueueCount > 0,
      title: `Fila HBX: ${hbxQueueCount} itens. Pressão operacional ${hbxQueueGaugeUsage}%.`,
    },
    {
      id: "tempo",
      label: "Ritmo 10 min",
      value: hbxTenMinuteGaugeUsage,
      metric: String(hbxTenMinuteCount),
      detail: "cards processados",
      state: hbxTenMinuteCount > 0 || liveWebscrapingProgress ? "busy" : hbxMainGaugeState,
      active: hbxTenMinuteCount > 0 || liveWebscrapingProgress,
      title: `Ritmo HBX: ${hbxTenMinuteCount} cards em 10 min. Força do velocímetro ${hbxTenMinuteGaugeUsage}%.`,
    },
  ];
  const hbxCommandChips = [
    {
      label: "Online",
      value: `${hbxEngineOnlineCount}/${hbxEngineTotal || TOPBAR_HBX_ENGINE_COUNT}`,
      tone: hbxEngineOnlineCount >= hbxEngineTotal && hbxEngineTotal > 0 ? "success" : "warning",
    },
    {
      label: "Ativos agora",
      value: `${hbxActiveEngineLimit}/${hbxEngineTotal || TOPBAR_HBX_ENGINE_COUNT}`,
      tone: hbxActiveEngineLimit > 0 ? "success" : "neutral",
    },
    {
      label: "Rodando",
      value: String(hbxCapacityRunningCount),
      tone: hbxCapacityRunningCount > 0 ? "success" : "neutral",
    },
    {
      label: "Cooldown",
      value: String(hbxCooldownCount),
      tone: hbxCooldownCount > 0 ? "warning" : "neutral",
    },
    {
      label: "Pausados",
      value: String(hbxPausedCount),
      tone: hbxPausedCount > 0 ? "warning" : "neutral",
    },
    {
      label: "Erros",
      value: String(hbxOperationalErrorCount),
      tone: hbxOperationalErrorCount > 0 ? "danger" : "neutral",
    },
  ];
  const topbarSystemVitals = useMemo<TopbarSystemVital[]>(() => {
    const memory = systemHealth?.memory?.parsed;
    const disk = systemHealth?.disk?.parsed;
    const memoryUsage = normalizePercentValue(memory?.usagePercent);
    const diskUsage = normalizePercentValue(disk?.usagePercent);

    return [
      {
        id: "memory",
        label: "Memória",
        value: formatTopbarPercent(memory?.usagePercent),
        detail: memory
          ? `${formatTopbarKb(memory.usedKb)} usados • ${formatTopbarKb(memory.availableKb)} livres`
          : "Aguardando leitura da VPS",
        usage: memoryUsage,
        tone: systemVitalTone(memoryUsage),
      },
      {
        id: "disk",
        label: "HD",
        value: formatTopbarPercent(disk?.usagePercent),
        detail: disk
          ? `${disk.used || "-"} usados • ${disk.available || "-"} livres`
          : "Aguardando leitura do disco",
        usage: diskUsage,
        tone: systemVitalTone(diskUsage),
      },
    ];
  }, [systemHealth]);
  const hostingerVitals = useMemo<TopbarHostingerVital[]>(() => {
    const memory = systemHealth?.memory?.parsed;
    const disk = systemHealth?.disk?.parsed;
    const load = systemHealth?.load?.parsed;
    const memoryUsage = normalizePercentValue(memory?.usagePercent);
    const diskUsage = normalizePercentValue(disk?.usagePercent);
    const postgresTone = serviceTone(systemHealth?.postgres?.status);
    const apiTone = serviceTone(systemHealth?.api?.status);

    return [
      {
        id: "memory",
        label: "RAM",
        value: memory
          ? `${formatTopbarKb(memory.usedKb)} / ${formatTopbarKb(memory.totalKb)} (${formatTopbarPercent(memory.usagePercent)})`
          : "--",
        detail: systemHealth?.memory?.source || "free -h",
        tone: memoryUsage === null ? "warning" : memoryUsage >= 86 ? "danger" : memoryUsage >= 72 ? "warning" : "success",
        usage: memoryUsage,
        source: systemHealth?.memory?.source || "free -h",
      },
      {
        id: "load",
        label: "CPU / Load",
        value: load
          ? `${load.oneMinute ?? "-"} / ${load.fiveMinutes ?? "-"} / ${load.fifteenMinutes ?? "-"}`
          : "--",
        detail: "1m / 5m / 15m",
        tone: systemHealth?.load?.status === "ok" ? "success" : "warning",
        usage: null,
      },
      {
        id: "disk",
        label: "Disco",
        value: formatTopbarPercent(disk?.usagePercent),
        detail: disk ? `${disk.used || "-"} usados de ${disk.size || "-"} em ${disk.mount || "/"}` : "Aguardando leitura do disco",
        tone: diskUsage === null ? "warning" : diskUsage >= 86 ? "danger" : diskUsage >= 72 ? "warning" : "success",
        usage: diskUsage,
      },
      {
        id: "uptime",
        label: "Uptime",
        value: String(systemHealth?.uptime?.formatted || "--"),
        detail: "Uptime do sistema",
        tone: systemHealth?.uptime?.status === "ok" ? "success" : "warning",
        usage: null,
      },
      {
        id: "postgres",
        label: "Postgres",
        value: serviceStatusLabel(systemHealth?.postgres?.status),
        detail: formatTopbarMs(systemHealth?.postgres?.responseMs),
        tone: postgresTone,
        usage: postgresTone === "success" ? 100 : postgresTone === "danger" ? 18 : 48,
      },
      {
        id: "api",
        label: "API",
        value: serviceStatusLabel(systemHealth?.api?.status),
        detail: formatTopbarMs(systemHealth?.api?.responseMs),
        tone: apiTone,
        usage: apiTone === "success" ? 100 : apiTone === "danger" ? 18 : 48,
      },
      {
        id: "updated",
        label: "Atualizado em",
        value: formatTopbarDateTime(systemHealth?.generatedAt),
        detail: SYSTEM_HEALTH_REFRESH_DETAIL,
        tone: systemHealth?.generatedAt ? "neutral" : "warning",
        usage: null,
      },
    ];
  }, [systemHealth]);

  const operationalStatusReady = Boolean(
    authenticated &&
      !pendingCheckoutLocked &&
      operationalStatus?.context.available &&
      operationalStatus.statuses.length,
  );

  const showOperationalCompanyPicker = Boolean(
    authenticated &&
      !operationalStatusReady &&
      user?.isSystemMaster &&
      !user.masterContext?.active,
  );

  const whatsAppHealth = useMemo<WhatsAppHealth>(() => {
    const candidates = [
      operationalStatusMap.get("meta"),
      operationalStatusMap.get("webwhats"),
      operationalStatusMap.get("token"),
    ].filter(Boolean) as OperationalStatusChip[];

    if (candidates.some((chip) => chip.tone === "green")) {
      return "green";
    }
    if (candidates.some((chip) => chip.tone === "yellow")) {
      return "yellow";
    }
    if (candidates.length > 0) {
      return "red";
    }
    return "yellow";
  }, [operationalStatusMap]);

  const whatsAppHealthLabel = useMemo(() => {
    const metaChip = operationalStatusMap.get("meta");
    const webWhatsChip = operationalStatusMap.get("webwhats");
    const tokenChip = operationalStatusMap.get("token");
    const preferred = [metaChip, webWhatsChip, tokenChip].find(Boolean) || null;
    if (!preferred) {
      return "Motores WhatsApp: em leitura";
    }
    return `${preferred.label}: ${preferred.value}`;
  }, [operationalStatusMap]);
  const qrOperationalTile = useMemo<TopbarOperationalTile>(() => {
    const qrConnection = whatsAppCenter?.center.qrConnection;
    const modalStatus = whatsAppModal?.status || null;
    const providerHealth = whatsAppModal?.data.providerHealth || null;
    const webWhatsChip = operationalStatusMap.get("webwhats");
    const qrDetailSource =
      whatsAppModal?.data.phone ||
      qrConnection?.displayNumber ||
      whatsAppModal?.data.lastError ||
      qrConnection?.errorMessage ||
      webWhatsChip?.detail ||
      "Saúde do QR Code";

    if (whatsAppModalLoading) {
      return {
        id: "qr",
        label: "QR Code",
        value: "Carregando",
        detail: qrDetailSource,
        tone: "loading",
        usage: 58,
      };
    }

    if (modalStatus === "connected" || qrConnection?.liveStatus === "connected") {
      return {
        id: "qr",
        label: "QR Code",
        value: "Conectado",
        detail: qrDetailSource,
        tone: "success",
        usage: 100,
      };
    }

    if (modalStatus === "waiting_qr" || qrConnection?.liveStatus === "qr_ready") {
      return {
        id: "qr",
        label: "QR Code",
        value: "Aguardando leitura",
        detail: qrDetailSource,
        tone: "warning",
        usage: 72,
      };
    }

    if (modalStatus === "starting") {
      return {
        id: "qr",
        label: "QR Code",
        value: "Iniciando",
        detail: qrDetailSource,
        tone: "loading",
        usage: 48,
      };
    }

    if (modalStatus === "error" || qrConnection?.liveStatus === "error" || providerHealth === "misconfigured") {
      return {
        id: "qr",
        label: "QR Code",
        value: "Atenção",
        detail: qrDetailSource,
        tone: "danger",
        usage: 20,
      };
    }

    if (
      modalStatus === "offline" ||
      modalStatus === "disconnected" ||
      providerHealth === "disabled" ||
      providerHealth === "unavailable" ||
      qrConnection?.liveStatus === "idle"
    ) {
      return {
        id: "qr",
        label: "QR Code",
        value: "Off",
        detail: qrDetailSource === "Saúde do QR Code" ? "QR rápido offline, sem sessão ativa." : qrDetailSource,
        tone: "neutral",
        usage: 12,
      };
    }

    if (providerHealth === "healthy" || webWhatsChip?.tone === "green") {
      return {
        id: "qr",
        label: "QR Code",
        value: webWhatsChip?.value || "Saudável",
        detail: qrDetailSource,
        tone: "success",
        usage: 88,
      };
    }

    return {
      id: "qr",
      label: "QR Code",
      value: webWhatsChip?.value || "Em leitura",
      detail: qrDetailSource,
      tone: webWhatsChip?.tone === "red" ? "danger" : webWhatsChip?.tone === "yellow" ? "warning" : "warning",
      usage: 42,
    };
  }, [
    operationalStatusMap,
    whatsAppCenter?.center.qrConnection,
    whatsAppModal?.data.lastError,
    whatsAppModal?.data.phone,
    whatsAppModal?.data.providerHealth,
    whatsAppModal?.status,
    whatsAppModalLoading,
  ]);

  useLayoutEffect(() => {
    function refreshAuthState() {
      setAuthenticated(Boolean(getToken()));
    }

    refreshAuthState();
    window.addEventListener("auth-change", refreshAuthState);
    window.addEventListener("storage", refreshAuthState);
    return () => {
      window.removeEventListener("auth-change", refreshAuthState);
      window.removeEventListener("storage", refreshAuthState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const armAudio = () => {
      audioArmedRef.current = true;
    };

    window.addEventListener("pointerdown", armAudio, { once: true });
    window.addEventListener("keydown", armAudio, { once: true });

    return () => {
      if (masterContextToastTimerRef.current) {
        clearTimeout(masterContextToastTimerRef.current);
      }
      window.removeEventListener("pointerdown", armAudio);
      window.removeEventListener("keydown", armAudio);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => undefined);
      }
      audioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (authenticated === null) {
      return;
    }

    if (!authenticated) {
      setUser(null);
      setModules([]);
      setOperationalStatus(null);
      setRecoveryPendingHumanCount(0);
      setAtendimentoPendingHumanCount(0);
      setSupportHasInternalChat(null);
      setStorageUserId(null);
      if (typeof window !== "undefined") {
        delete (window as HbxPrefetchWindow).__hbx_prefetch;
      }
      return;
    }

    let mounted = true;

    async function loadUser() {
      try {
        const [profile, myModules, nextOperationalStatus, supportPlans] = await Promise.all([
          apiFetch<User>("/profile/current-user"),
          apiFetch<UserModule[]>("/modules/me"),
          isMasterWebscrapingRoute ? Promise.resolve(null) : refreshOperationalStatus(false),
          isMasterWebscrapingRoute
            ? Promise.resolve(null)
            : apiFetch<CommercialPlansTopbarPayload>("/commercial-plans/me").catch(() => null),
        ]);
        if (mounted) {
          setUser(profile);
          setModules(myModules || []);
          setOperationalStatus(nextOperationalStatus);
          setSupportHasInternalChat(Boolean(supportPlans?.current?.entitlements?.atendimento_chat));
          if (typeof window !== "undefined") {
            (window as HbxPrefetchWindow).__hbx_prefetch = {
              modules: myModules || [],
              profile,
            };
          }
        }
      } catch {
        if (mounted) {
          setUser(null);
          setModules([]);
          setOperationalStatus(null);
          setSupportHasInternalChat(null);
        }
      }
    }

    void loadUser();

    function handleMasterContextChanged(event: Event) {
      const customEvent = event as CustomEvent<MasterContextChangedDetail>;
      clearApiCache();
      void refreshMasterAwareState().catch(() => undefined);
      if (!isMasterWebscrapingRoute) {
        void refreshOperationalStatus(false).catch(() => undefined);
      }
      showMasterContextToast(customEvent.detail);
    }

    function handleModulesChanged() {
      clearApiCache("/modules/me");
      void refreshMasterAwareState().catch(() => undefined);
      if (!isMasterWebscrapingRoute) {
        void refreshOperationalStatus(true).catch(() => undefined);
      }
    }

    window.addEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
    window.addEventListener(MODULES_CHANGED_EVENT, handleModulesChanged);

    return () => {
      mounted = false;
      window.removeEventListener(MASTER_CONTEXT_CHANGED_EVENT, handleMasterContextChanged);
      window.removeEventListener(MODULES_CHANGED_EVENT, handleModulesChanged);
    };
  }, [authenticated, isMasterWebscrapingRoute, refreshMasterAwareState, refreshOperationalStatus, setStorageUserId, showMasterContextToast]);

  useEffect(() => {
    setStorageUserId(user?.id ?? null);
  }, [setStorageUserId, user?.id]);

  useEffect(() => {
    if (authenticated === null) {
      return;
    }

    if (!authenticated || isMasterWebscrapingRoute) {
      setOperationalStatus(null);
      return;
    }

    const timer = window.setInterval(() => {
      void refreshOperationalStatus(false);
    }, 45000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authenticated, isMasterWebscrapingRoute, refreshOperationalStatus]);

  useEffect(() => {
    const hasWebscrapingModule = (modules || []).some((module) => module.key === "webscraping" && module.accessible);
    if (authenticated !== true || pendingCheckoutLocked || !user || (!user.isSystemMaster && !hasWebscrapingModule)) {
      setScrapingEngines(null);
      setScrapingEngineStatusMessage(null);
      return;
    }

    void refreshScrapingEngines();
    const timer = window.setInterval(() => {
      void refreshScrapingEngines();
    }, SCRAPING_ENGINE_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [authenticated, modules, pendingCheckoutLocked, refreshScrapingEngines, user]);

  useEffect(() => {
    if (authenticated !== true || !user?.isSystemMaster) {
      setSystemHealth(null);
      return;
    }

    void refreshSystemHealth();
  }, [authenticated, refreshSystemHealth, user?.isSystemMaster]);

  useEffect(() => {
    const hasWhatsAppContext = Boolean(user?.company?.id || user?.masterContext?.active);
    if (authenticated !== true || pendingCheckoutLocked || isMasterWebscrapingRoute || !hasWhatsAppContext) {
      setWhatsAppCenter(null);
      setWhatsAppModal(null);
      return;
    }

    void loadWhatsAppCenter({ background: true });
    void loadWhatsAppModal({ background: true, includeQr: false });

    const timer = window.setInterval(() => {
      void loadWhatsAppCenter({ background: true });
      void loadWhatsAppModal({ background: true, includeQr: false });
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    authenticated,
    isMasterWebscrapingRoute,
    loadWhatsAppCenter,
    loadWhatsAppModal,
    pendingCheckoutLocked,
    user?.company?.id,
    user?.masterContext?.active,
  ]);

  useEffect(() => {
    if (!whatsAppDetailMessage) return;
    const keepQrMessageVisible = Boolean(
      whatsAppDetailMessage.startsWith("QR gerado") &&
        whatsAppModal?.data.qrCodeDataUrl,
    );
    if (keepQrMessageVisible) return;
    const timer = window.setTimeout(() => setWhatsAppDetailMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [whatsAppDetailMessage, whatsAppModal?.data.qrCodeDataUrl]);

  useEffect(() => {
    if (!whatsAppDetailOpen || whatsAppDetailFocus !== "qr" || !whatsAppModal?.data.available) return;
    if (
      whatsAppModal.status !== "waiting_qr"
      && whatsAppModal.status !== "connected"
      && whatsAppModal.status !== "starting"
    ) return;

    const timer = window.setInterval(() => {
      void loadWhatsAppModal({
        background: true,
        includeQr:
          whatsAppQrRequested
          && whatsAppModal.status !== "connected",
      });
      void refreshOperationalStatus(false);
    }, whatsAppModal.status === "connected" ? 20000 : 9000);

    return () => window.clearInterval(timer);
  }, [
    loadWhatsAppModal,
    refreshOperationalStatus,
    whatsAppDetailFocus,
    whatsAppDetailOpen,
    whatsAppModal?.data.available,
    whatsAppModal?.status,
    whatsAppQrRequested,
  ]);

  useEffect(() => {
    const currentStatus = whatsAppModal?.status || null;
    const previousStatus = previousWhatsAppModalStatusRef.current;
    previousWhatsAppModalStatusRef.current = currentStatus;

    if (!currentStatus || currentStatus === previousStatus) return;
    if (currentStatus !== "connected" && previousStatus !== "connected") return;

    dispatchModulesChanged({
      reason: currentStatus === "connected" ? "whatsapp_connected" : "whatsapp_disconnected",
    });
  }, [whatsAppModal?.status]);

  useEffect(() => {
    if (!user) return;
    setAttendantName(String(user.name || "").trim());
  }, [user]);

  useEffect(() => {
    if (authenticated === null) {
      return;
    }

    if (!authenticated) {
      setRecoveryPendingHumanCount(0);
      setAtendimentoPendingHumanCount(0);
      setUnreadInboxCount(0);
      return;
    }

    const applyCount = (
      setter: React.Dispatch<React.SetStateAction<number>>,
      value: unknown,
    ) => {
      const next = Number(value);
      setter(Number.isFinite(next) ? Math.max(0, Math.trunc(next)) : 0);
    };

    const readStoredCount = () => {
      try {
        applyCount(setRecoveryPendingHumanCount, window.localStorage.getItem(RECOVERY_QUEUE_STORAGE_KEY) || 0);
        applyCount(
          setAtendimentoPendingHumanCount,
          window.localStorage.getItem(ATENDIMENTO_QUEUE_STORAGE_KEY) || 0,
        );
      } catch {
        applyCount(setRecoveryPendingHumanCount, 0);
        applyCount(setAtendimentoPendingHumanCount, 0);
      }
    };

    const handleRecoveryQueueEvent = (event: Event) => {
      applyCount(
        setRecoveryPendingHumanCount,
        (event as CustomEvent<{ count?: number }>).detail?.count ?? 0,
      );
    };

    const handleAtendimentoQueueEvent = (event: Event) => {
      applyCount(
        setAtendimentoPendingHumanCount,
        (event as CustomEvent<{ count?: number }>).detail?.count ?? 0,
      );
    };

    readStoredCount();
    window.addEventListener(RECOVERY_HUMAN_QUEUE_EVENT, handleRecoveryQueueEvent as EventListener);
    window.addEventListener(
      ATENDIMENTO_HUMAN_QUEUE_EVENT,
      handleAtendimentoQueueEvent as EventListener,
    );
    window.addEventListener("storage", readStoredCount);

    return () => {
      window.removeEventListener(
        RECOVERY_HUMAN_QUEUE_EVENT,
        handleRecoveryQueueEvent as EventListener,
      );
      window.removeEventListener(
        ATENDIMENTO_HUMAN_QUEUE_EVENT,
        handleAtendimentoQueueEvent as EventListener,
      );
      window.removeEventListener("storage", readStoredCount);
    };
  }, [authenticated]);

  useEffect(() => {
    if (authenticated === null) {
      return;
    }

    // Keep the TopBar off the heavy queue readers. Inbox/recovery pages own their
    // own data refresh, and global alerts need a lightweight counter endpoint.
    const shouldPollHeavyQueues =
      process.env.NEXT_PUBLIC_ENABLE_TOPBAR_QUEUE_POLLING === "true" &&
      !pathname.includes("/atendimento") &&
      !pathname.includes("/atendimento/recovery");

    if (!authenticated || !user || user.isSystemMaster || !user.company?.id || !shouldPollHeavyQueues) {
      recoveryLastSeenRef.current = new Map();
      recoveryHumanQueueRef.current = new Map();
      recoveryAlertReadyRef.current = false;
      atendimentoLastSeenRef.current = new Map();
      atendimentoAlertReadyRef.current = false;
      setIncomingPopup(null);
      return;
    }

    let cancelled = false;

    const pollIncomingAlerts = async () => {
      const popupCandidates: TopBarIncomingPopup[] = [];

      if (accessibleModules.has("atendimento")) {
        try {
          const payload = await apiFetch<RecoveryAlertSummary>("/hbx-recovery/interactions?queue=all");
          if (cancelled) return;

          setRecoveryPendingHumanCount(
            Number.isFinite(Number(payload?.pendingHumanCount))
              ? Math.max(0, Math.trunc(Number(payload?.pendingHumanCount)))
              : 0,
          );

          const previousLastSeen = recoveryLastSeenRef.current;
          const previousHumanQueue = recoveryHumanQueueRef.current;
          const nextLastSeen = new Map<number, string>();
          const nextHumanQueue = new Map<number, boolean>();

          for (const item of Array.isArray(payload?.conversations) ? payload.conversations : []) {
            nextLastSeen.set(item.conversationId, item.lastAt);
            nextHumanQueue.set(item.conversationId, Boolean(item.humanQueue));
            const previousTimestamp = previousLastSeen.get(item.conversationId);
            const previousQueued = previousHumanQueue.get(item.conversationId);
            const isInbound = String(item.lastDirection || "").trim().toUpperCase() === "INBOUND";
            const requiresHumanAttention = Boolean(item.humanQueue || item.humanAssigned);
            const becameHumanQueue = Boolean(item.humanQueue) && previousQueued !== true;
            const hasNewInbound = Boolean(
              previousTimestamp &&
                isInbound &&
                new Date(item.lastAt).getTime() > new Date(previousTimestamp).getTime(),
            );
            const isNewConversation = !previousTimestamp && isInbound && requiresHumanAttention;
            if (
              recoveryAlertReadyRef.current &&
              !item.isClosed &&
              !item.isBlocked &&
              (becameHumanQueue || hasNewInbound || isNewConversation)
            ) {
              popupCandidates.push({
                id: `recovery:${item.conversationId}:${item.lastAt}:${becameHumanQueue ? "human_queue" : "new_message"}`,
                moduleLabel: "Atendimento / Cobranca",
                attentionLabel: becameHumanQueue ? "Fila humana" : "Nova mensagem",
                customerLabel: item.customerName || item.customerWhatsapp || "Cliente em cobranca",
                contactPhone: item.customerWhatsapp || item.conversationWhatsapp || "-",
                entryNumberLabel: extractEntryNumberLabel(item.metadata),
                preview:
                  String(item.lastMessage || "").trim() ||
                  (becameHumanQueue
                    ? "Cliente solicitou atendimento humano."
                    : "Nova mensagem aguardando resposta na cobranca."),
                href: "/atendimento/recovery",
                lastAt: item.lastAt,
              });
            }
          }

          recoveryLastSeenRef.current = nextLastSeen;
          recoveryHumanQueueRef.current = nextHumanQueue;
          recoveryAlertReadyRef.current = true;
        } catch {
          // keep local counters when polling fails
        }
      } else {
        setRecoveryPendingHumanCount(0);
        recoveryLastSeenRef.current = new Map();
        recoveryHumanQueueRef.current = new Map();
        recoveryAlertReadyRef.current = false;
      }

      if (accessibleModules.has("atendimento")) {
        try {
          const payload = await apiFetch<InboxAlertConversation[]>("/inbox/conversations");
          if (cancelled) return;

          const rows = Array.isArray(payload) ? payload : [];
          const unreadTotal = rows.reduce((acc, conversation) => {
            const isAtendimento = conversation.routeTarget === "atendimento";
            const isActive = !conversation.isBlocked && (conversation.status === "new" || conversation.status === "open");
            if (!isAtendimento || !isActive) return acc;
            const unread = Math.max(0, Math.trunc(Number(conversation?.metadata?.whatsappUnreadCount || 0)));
            return acc + unread;
          }, 0);
          setUnreadInboxCount(unreadTotal);

          const pendingRows = rows.filter(
            (conversation) =>
              conversation.routeTarget === "atendimento" &&
              !conversation.isBlocked &&
              (conversation.status === "new" || conversation.status === "open"),
          );
          setAtendimentoPendingHumanCount(pendingRows.length);

          const previousLastSeen = atendimentoLastSeenRef.current;
          const nextLastSeen = new Map<string, string>();

          for (const conversation of pendingRows) {
            const latestMessage = conversation.messages?.[0];
            const lastAt = String(latestMessage?.createdAt || conversation.updatedAt || "");
            if (!lastAt) continue;
            nextLastSeen.set(conversation.id, lastAt);

            const previousTimestamp = previousLastSeen.get(conversation.id);
            const isInbound =
              String(latestMessage?.direction || "").trim().toLowerCase() === "inbound";
            const hasNewInbound = Boolean(
              previousTimestamp &&
                isInbound &&
                new Date(lastAt).getTime() > new Date(previousTimestamp).getTime(),
            );
            const isNewConversation = !previousTimestamp && isInbound;

            if (atendimentoAlertReadyRef.current && (hasNewInbound || isNewConversation)) {
              popupCandidates.push({
                id: `atendimento:${conversation.id}:${lastAt}`,
                moduleLabel: "Atendimento",
                attentionLabel: conversation.status === "open" ? "Fila humana" : "Nova mensagem",
                customerLabel: conversation.customer.name || conversation.customer.phone || "Cliente",
                contactPhone: conversation.customer.phone || "-",
                entryNumberLabel: extractEntryNumberLabel(conversation.metadata),
                preview: formatInboxPreview(conversation),
                href: "/atendimento",
                lastAt,
              });
            }
          }

          atendimentoLastSeenRef.current = nextLastSeen;
          atendimentoAlertReadyRef.current = true;
        } catch {
          // keep local counters when polling fails
        }
      } else {
        setAtendimentoPendingHumanCount(0);
        setUnreadInboxCount(0);
        atendimentoLastSeenRef.current = new Map();
        atendimentoAlertReadyRef.current = false;
      }

      const newestPopup = [...popupCandidates].sort(
        (left, right) =>
          new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime(),
      )[0];
      if (newestPopup) {
        presentIncomingPopup(newestPopup);
      }
    };

    const timer = window.setInterval(() => {
      void pollIncomingAlerts();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authenticated, accessibleModules, pathname, presentIncomingPopup, user]);

  useEffect(() => {
    setOpen(false);
    setWhatsAppDetailOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (authenticated === null) return;
    if (authenticated) return;
    setWhatsAppDetailOpen(false);
    setWhatsAppCenter(null);
    setWhatsAppDetailError(null);
    setWhatsAppDetailMessage(null);
  }, [authenticated]);

  useEffect(() => {
    if (!portalReady) return;
    const shouldLockBody = whatsAppDetailOpen || masterContextModalOpen;
    if (!shouldLockBody) return;

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "contain";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [portalReady, whatsAppDetailOpen, masterContextModalOpen]);

  useEffect(() => {
    if (!whatsAppDetailOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWhatsAppDetailOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [whatsAppDetailOpen]);

  useEffect(() => {
    if (!masterContextModalOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMasterContextModalOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [masterContextModalOpen]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (!userMenuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const topbar = topbarFrameRef.current;
    if (!root || !topbar) return;

    const setVar = () => {
      const rect = topbar.getBoundingClientRect();
      root.style.setProperty("--topbar-total-height", `${Math.ceil(rect.height)}px`);
    };

    setVar();

    let observer: ResizeObserver | null = null;
    try {
      observer = new ResizeObserver(setVar);
      observer.observe(topbar);
    } catch {
      window.addEventListener("resize", setVar);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", setVar);
    };
  }, [authenticated, incomingPopup, open, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    lastScrollYRef.current = window.scrollY || 0;

    const handleScroll = () => {
      const currentY = window.scrollY || 0;
      const delta = currentY - lastScrollYRef.current;

      if (currentY <= 24) {
        setTopbarHiddenByScroll(false);
        lastScrollYRef.current = currentY;
        return;
      }

      if (delta > 8) {
        setTopbarHiddenByScroll(true);
      } else if (delta < -8) {
        setTopbarHiddenByScroll(false);
      }

      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  async function handleLogout() {
    await runGlobalShutdown(async () => {
      try {
        await apiFetch("/auth/logout", {
          method: "POST",
          requireAuth: true,
        });
      } finally {
        clearToken();
        setAuthenticated(false);
        setUser(null);
        router.push("/login");
      }
    });
  }

  function clearQueueBadge(
    moduleKey: "atendimento" | "recovery",
    options?: { dismissPopup?: boolean },
  ) {
    if (typeof window !== "undefined") {
      try {
        const storageKey =
          moduleKey === "atendimento"
            ? ATENDIMENTO_QUEUE_STORAGE_KEY
            : RECOVERY_QUEUE_STORAGE_KEY;
        const eventName =
          moduleKey === "atendimento"
            ? ATENDIMENTO_HUMAN_QUEUE_EVENT
            : RECOVERY_HUMAN_QUEUE_EVENT;
        window.localStorage.setItem(storageKey, "0");
        window.dispatchEvent(
          new CustomEvent<{ count: number }>(eventName, {
            detail: { count: 0 },
          }),
        );
      } catch {
        // ignore storage/event errors
      }
    }

    if (moduleKey === "atendimento") {
      setAtendimentoPendingHumanCount(0);
    } else {
      setRecoveryPendingHumanCount(0);
    }

    if (
      options?.dismissPopup &&
      incomingPopup &&
      ((moduleKey === "atendimento" && incomingPopup.href === "/atendimento") ||
        (moduleKey === "recovery" && incomingPopup.href === "/atendimento/recovery"))
    ) {
      setIncomingPopup(null);
    }
  }

  function handleQueueShortcut(moduleKey: "atendimento" | "recovery") {
    clearQueueBadge(moduleKey, { dismissPopup: true });
    router.push(moduleKey === "atendimento" ? "/atendimento" : "/atendimento/recovery");
  }

  function handleSupportClick() {
    if (supportHasInternalChat === true) {
      const params = new URLSearchParams({
        support: "1",
        phone: SUPPORT_PHONE,
        message: SUPPORT_MESSAGE,
      });
      router.push(`/atendimento?${params.toString()}`);
      return;
    }

    if (typeof window === "undefined") return;
    const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(SUPPORT_PHONE)}&text=${encodeURIComponent(SUPPORT_MESSAGE)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function loadUnreadInboxEntries() {
    setUnreadInboxLoading(true);
    setUnreadInboxError(null);
    try {
      const rows = await apiFetch<InboxAlertConversation[]>('/inbox/conversations');
      const normalizedRows = Array.isArray(rows) ? rows : [];
      const unreadSummaries = normalizedRows.filter((conversation) =>
        Math.max(0, Math.trunc(Number(conversation?.metadata?.whatsappUnreadCount || 0))) > 0,
      );
      const unreadTotal = unreadSummaries.reduce((acc, conversation) => {
        const unread = Math.max(0, Math.trunc(Number(conversation?.metadata?.whatsappUnreadCount || 0)));
        return acc + unread;
      }, 0);
      setUnreadInboxCount(unreadTotal);
      const unreadConversations = await Promise.all(
        unreadSummaries.map(async (conversation) => {
          const conversationId = String(conversation?.id || '').trim();
          if (!conversationId) return conversation;
          try {
            return await apiFetch<InboxAlertConversation>(`/inbox/conversations/${conversationId}`);
          } catch {
            return conversation;
          }
        }),
      );
      const entries: TopBarUnreadEntry[] = [];

      for (const conversation of unreadConversations) {
        const unreadCount = Math.max(0, Math.trunc(Number(conversation?.metadata?.whatsappUnreadCount || 0)));
        if (!unreadCount) continue;

        const allMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
        const inboundMessages = allMessages.filter(
          (message) => String(message?.direction || "").trim().toLowerCase() === "inbound",
        );
        const unreadMessages = (inboundMessages.length ? inboundMessages : allMessages).slice(-unreadCount);
        const baseLabel = String(conversation.customer?.name || "").trim() || conversation.customer?.phone || "Cliente";
        if (!unreadMessages.length) {
          entries.push({
            conversationId: String(conversation.id),
            conversationLabel: baseLabel,
            messageId: `pending-${String(conversation.id)}`,
            messagePreview: "Mensagem pendente no WhatsApp.",
            messageAt: String(conversation.updatedAt || ""),
            unreadCount,
          });
          continue;
        }

        for (const message of unreadMessages) {
          const rawId = String(message?.id || "").trim();
          const messageAt = String(message?.createdAt || conversation.updatedAt || "");
          const messageId = rawId || `pending-${String(conversation.id)}-${messageAt || "now"}`;
          entries.push({
            conversationId: String(conversation.id),
            conversationLabel: baseLabel,
            messageId,
            messagePreview: String(message?.content || "Nova mensagem").trim() || "Nova mensagem",
            messageAt,
            unreadCount,
          });
        }
      }

      entries.sort((a, b) => new Date(b.messageAt).getTime() - new Date(a.messageAt).getTime());
      setUnreadInboxEntries(entries);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar mensagens não lidas.";
      setUnreadInboxError(message);
      setUnreadInboxEntries([]);
    } finally {
      setUnreadInboxLoading(false);
    }
  }

  async function toggleUnreadInboxPopup() {
    if (unreadInboxOpen) {
      setUnreadInboxOpen(false);
      return;
    }
    setUnreadInboxOpen(true);
    await loadUnreadInboxEntries();
  }

  async function markUnreadConversationAsRead(conversationId: string) {
    if (!conversationId) return;
    try {
      await apiFetch(`/inbox/conversations/${conversationId}/read`, {
        method: "PATCH",
      });
      let removedUnread = 1;
      setUnreadInboxEntries((current) => {
        const fromConversation = current.filter((entry) => entry.conversationId === conversationId);
        const first = fromConversation[0];
        if (first) {
          removedUnread = Math.max(1, Math.trunc(Number(first.unreadCount || 0)));
        }
        return current.filter((entry) => entry.conversationId !== conversationId);
      });
      setUnreadInboxCount((current) => Math.max(0, current - removedUnread));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao marcar conversa como lida.";
      setUnreadInboxError(message);
    }
  }

  async function deleteUnreadMessage(entry: TopBarUnreadEntry) {
    try {
      await apiFetch(
        `/inbox/conversations/${entry.conversationId}/messages/${entry.messageId}/local`,
        {
          method: "DELETE",
        },
      );
      setUnreadInboxEntries((current) =>
        current.filter((row) => !(row.conversationId === entry.conversationId && row.messageId === entry.messageId)),
      );
      setUnreadInboxCount((current) => Math.max(0, current - 1));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao excluir mensagem.";
      setUnreadInboxError(message);
    }
  }

  useEffect(() => {
    if (!unreadInboxOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!unreadMenuRef.current?.contains(event.target as Node)) {
        setUnreadInboxOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUnreadInboxOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [unreadInboxOpen]);

  async function ensureWhatsAppQrMode() {
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return null;
    }
    if (whatsAppCenter?.center.mode === "QR") {
      return whatsAppCenter;
    }

    const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center", {
      method: "PATCH",
      body: JSON.stringify({ mode: "QR" }),
    });
    setWhatsAppCenter(next);
    return next;
  }

  async function chooseWhatsAppMode(mode: "QR" | "OFFICIAL") {
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return;
    }
    setWhatsAppDetailBusy(mode);
    setWhatsAppDetailError(null);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center", {
        method: "PATCH",
        body: JSON.stringify({ mode }),
      });
      setWhatsAppCenter(next);
      setWhatsAppDetailFocus(mode === "QR" ? "qr" : "official");
      setWhatsAppDetailMessage(
        mode === "QR"
          ? "Conexão rápida por QR selecionada para ativação inicial."
          : "Meta oficial selecionada para esta empresa.",
      );
      void refreshOperationalStatus(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar o modo do WhatsApp.";
      setWhatsAppDetailError(message);
    } finally {
      setWhatsAppDetailBusy(null);
    }
  }

  async function requestWhatsAppMigration() {
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return;
    }
    setWhatsAppDetailBusy("migration");
    setWhatsAppDetailError(null);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center/migration-interest", {
        method: "POST",
        body: JSON.stringify({ source: "topbar_operational_detail" }),
      });
      setWhatsAppCenter(next);
      setWhatsAppDetailMessage("Aceite registrado. O time tecnico ja consegue enxergar esta necessidade.");
      void refreshOperationalStatus(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao registrar o interesse na migracao oficial.";
      setWhatsAppDetailError(message);
    } finally {
      setWhatsAppDetailBusy(null);
    }
  }

  async function startQrWhatsAppConnection() {
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return;
    }
    setWhatsAppDetailBusy("qr-connect");
    setWhatsAppDetailError(null);
    try {
      const requestQrOnly =
        whatsAppModal?.status === "waiting_qr"
        && !whatsAppModal.data.qrCodeDataUrl;
      setWhatsAppQrRequested(true);
      setWhatsAppDetailMessage(requestQrOnly ? "Atualizando o QR..." : "Conectando ao motor...");
      if (!requestQrOnly) {
        await ensureWhatsAppQrMode();
      }
      const response = requestQrOnly
        ? await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr")
        : await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/start", {
            method: "POST",
          });
      let nextPayload = response;
      if (shouldLoadModalQr(response, true) && !response.data.qrCodeDataUrl) {
        setWhatsAppDetailMessage("Motor respondeu. Solicitando o QR code...");
        nextPayload = await waitForWhatsAppModalQr(response);
      }
      setWhatsAppModal(nextPayload);
      const planRedirect = getWhatsAppModalPlanRedirect(nextPayload);
      if (planRedirect) {
        setWhatsAppDetailError(nextPayload.message);
        router.push(planRedirect);
        return;
      }
      void loadWhatsAppCenter({ background: true });
      setWhatsAppDetailFocus("qr");
      setWhatsAppDetailMessage(
        nextPayload.data.qrCodeDataUrl
          ? "QR pronto para leitura."
          : nextPayload.status === "connected"
            ? "WhatsApp conectado."
            : "Motor respondeu. Ainda aguardando o QR code."
      );
      void refreshOperationalStatus(true);
    } catch (error) {
      setWhatsAppQrRequested(false);
      const message = error instanceof Error ? error.message : "Falha ao iniciar a conexão rápida por QR.";
      setWhatsAppDetailError(message);
    } finally {
      setWhatsAppDetailBusy(null);
    }
  }

  async function disconnectQrWhatsAppConnection() {
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return;
    }
    setWhatsAppDetailBusy("qr-disconnect");
    setWhatsAppDetailError(null);
    try {
      setWhatsAppQrRequested(false);
      setWhatsAppDetailMessage("Encerrando a sessão no motor...");
      const response = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/disconnect", {
        method: "POST",
      });
      setWhatsAppModal(response);
      void loadWhatsAppCenter({ background: true });
      setWhatsAppDetailMessage("Conexão rápida por QR desconectada.");
      void refreshOperationalStatus(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao desconectar a conexão rápida por QR.";
      setWhatsAppDetailError(message);
    } finally {
      setWhatsAppDetailBusy(null);
    }
  }

  async function openMasterContextModal() {
    setMasterContextMessage(null);
    setMasterContextModalOpen(true);
    if (masterCompanyOptions.length) return;
    try {
      const payload = await apiFetch<MasterOverviewCompanyPayload[]>("/modules/master/companies");
      const normalized = (Array.isArray(payload) ? payload : []).map((item) => ({
        id: Number(item?.id || 0),
        name: String(item?.name || `Empresa ${item?.id || ""}`),
        isActive: Boolean(item?.isActive),
        paymentStatus: String(item?.paymentStatus || "PENDING"),
      })).filter((item) => item.id > 0);
      setMasterCompanyOptions(normalized);
      if (normalized[0] && !selectedMasterCompanyId) {
        setSelectedMasterCompanyId(String(normalized[0].id));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar empresas.";
      setMasterContextMessage(message);
    }
  }

  async function assumeMasterContext() {
    const companyId = Number(selectedMasterCompanyId || 0);
    const selectedCompany = masterCompanyOptions.find((company) => company.id === companyId) || null;
    if (!companyId) {
      setMasterContextMessage("Selecione uma empresa para assumir contexto.");
      return;
    }

    setMasterContextActionBusy(true);
    setMasterContextMessage(null);
    try {
      await apiFetch("/master-context/assume", {
        method: "POST",
        body: JSON.stringify({
          companyId,
          reason: masterContextReason || undefined,
        }),
      });

      const [profile, myModules] = await Promise.all([
        apiFetch<User>("/profile/current-user"),
        apiFetch<UserModule[]>("/modules/me"),
      ]);
      setUser(profile);
      setModules(myModules || []);
      if (typeof window !== "undefined") {
        (window as HbxPrefetchWindow).__hbx_prefetch = {
          modules: myModules || [],
          profile,
        };
      }
      setMasterContextModalOpen(false);
      setMasterContextReason("");
      dispatchMasterContextChanged({
        mode: "assumed",
        companyName: profile.masterContext?.companyName || selectedCompany?.name || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao assumir contexto da empresa.";
      setMasterContextMessage(message);
    } finally {
      setMasterContextActionBusy(false);
    }
  }

  async function exitMasterContext() {
    setMasterContextActionBusy(true);
    setMasterContextMessage(null);
    try {
      await apiFetch("/master-context/exit", {
        method: "POST",
        body: JSON.stringify({ reason: "manual_exit" }),
      });

      const [profile, myModules] = await Promise.all([
        apiFetch<User>("/profile/current-user"),
        apiFetch<UserModule[]>("/modules/me"),
      ]);
      setUser(profile);
      setModules(myModules || []);
      if (typeof window !== "undefined") {
        (window as HbxPrefetchWindow).__hbx_prefetch = {
          modules: myModules || [],
          profile,
        };
      }
      setMasterContextModalOpen(false);
      setMasterContextReason("");
      dispatchMasterContextChanged({
        mode: "exited",
        companyName: profile.masterContext?.companyName || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sair do contexto assumido.";
      setMasterContextMessage(message);
    } finally {
      setMasterContextActionBusy(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChanging(true);
    setChangeMsg(null);

    try {
      await apiFetch("/profile/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: curPass,
          newPassword: newPass,
        }),
      });
      setChangeMsg("Senha atualizada com sucesso.");
      setCurPass("");
      setNewPass("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar senha.";
      setChangeMsg(message);
    } finally {
      setChanging(false);
    }
  }

  async function handleDisplayNameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = attendantName.trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      setChangeMsg("Informe o nome do atendente/vendedor.");
      return;
    }

    setSavingAttendantName(true);
    setChangeMsg(null);
    try {
      const profile = await apiFetch<User>("/profile/display-name", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      clearApiCache("/profile/current-user");
      setUser(profile);
      setAttendantName(String(profile?.name || name).trim());
      setChangeMsg("Nome do atendente/vendedor atualizado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar nome.";
      setChangeMsg(message);
    } finally {
      setSavingAttendantName(false);
    }
  }

  const pendingHumanCount = recoveryPendingHumanCount + atendimentoPendingHumanCount;
  const accountContext = authenticated === true
    ? user?.isSystemMaster
      ? user.masterContext?.active
        ? `MASTER em ${user.masterContext.companyName || "Empresa"}`
        : "MASTER GLOBAL"
      : user?.company?.name || "Operacao sem empresa"
    : "Plataforma operacional HBX";
  const operationalSummaryMessage = pendingCheckoutLocked
    ? "Finalize contratação"
    : showOperationalCompanyPicker
    ? "Selecione uma empresa"
    : scrapingEngineStatusMessage
    ? scrapingEngineStatusMessage
    : liveWebscrapingProgress
    ? `${progressEngineLabel || "HBX"} coletando ${topbarProgressPercent}%`
    : scrapingEngines?.capacity?.isTurboForcedNow
    ? "Turbo forçado ativo"
    : scrapingEngines?.capacity?.isTurboEnabled && !scrapingEngines?.capacity?.isTurboWindowActive
    ? "Turbo armado"
    : operationalStatusReady
      ? `Empresa: ${operationalStatus?.context.companyName || "Operação ativa"}`
      : pendingHumanCount > 0
        ? `${pendingHumanCount} na fila`
        : "Status em leitura";
  const hostingerSummaryTile = useMemo<TopbarOperationalTile>(() => {
    const critical = hostingerVitals.some((vital) => vital.tone === "danger");
    const attention = hostingerVitals.some((vital) => vital.tone === "warning" || vital.tone === "loading");
    const ram = hostingerVitals.find((vital) => vital.id === "memory");
    const disk = hostingerVitals.find((vital) => vital.id === "disk");
    const postgres = hostingerVitals.find((vital) => vital.id === "postgres");
    const api = hostingerVitals.find((vital) => vital.id === "api");

    return {
      id: "hostinger",
      label: "Hostinger",
      value: critical ? "Atenção" : attention ? "Em leitura" : "OK",
      detail: `${ram?.label || "RAM"} ${ram?.value || "--"} • HD ${disk?.value || "--"} • PG ${postgres?.detail || "--"} • API ${api?.detail || "--"}`,
      tone: critical ? "danger" : attention ? "warning" : "success",
      usage: critical ? 28 : attention ? 58 : 94,
    };
  }, [hostingerVitals]);
  const visibleOperationalStatusChips = useMemo(() => {
    if (pendingCheckoutLocked) return [];
    return (operationalStatus?.statuses || []).filter((chip) => {
      if (chip.key === "payment") return false;
      if (chip.key === "token" && operationalStatusMap.get("webwhats")?.tone === "green") return false;
      return true;
    });
  }, [operationalStatus?.statuses, operationalStatusMap, pendingCheckoutLocked]);
  const billboardSlides = useMemo<BillboardSlide[]>(() => {
    if (topbarProgress) {
      const theaterSource = isTopbarTheaterSource(topbarProgress.source);
      const sourceLabel =
        theaterSource
          ? "Telão"
          : topbarProgress.source === "webscraping"
            ? progressEngineLabel
              ? `${progressEngineLabel} ao vivo`
              : "Motores HBX"
            : topbarProgress.phase === "warning"
              ? "Atenção"
              : "Confirmado";
      const fallbackMetrics =
        topbarProgress.source === "webscraping"
          ? [
              { label: "Fila", value: String(scrapingEngines?.capacity?.queuedCount ?? 0) },
              { label: "Rodando", value: String(scrapingEngines?.capacity?.runningCount ?? hbxRunningCount) },
              { label: "10 min", value: String(scrapingEngines?.capacity?.completedLast10Min ?? hbxProcessedLast10Min) },
            ]
          : [];

      return [
        {
          id: `progress:${topbarProgress.source}:${topbarProgress.phase}:${topbarProgress.title}`,
          eyebrow: theaterSource
            ? topbarProgress.phase === "success"
              ? "Telão OK"
              : topbarProgress.phase === "warning"
                ? "Telão Alerta"
                : "Telão ao vivo"
            : topbarProgress.phase === "success"
              ? "Confirmado"
              : topbarProgress.phase === "warning"
                ? "Atenção"
                : sourceLabel,
          title: topbarProgress.title,
          description: topbarProgress.status,
          phase: topbarProgress.phase,
          source: topbarProgress.source,
          isTheater: theaterSource,
          progress: topbarProgressPercent,
          metrics: (topbarProgress.metrics?.length ? topbarProgress.metrics : fallbackMetrics).slice(0, 3),
        },
      ];
    }

    if (masterContextToast) {
      return [
        {
          id: `master-context:${masterContextToast}`,
          eyebrow: "Confirmado",
          title: "Contexto atualizado",
          description: masterContextToast,
          phase: "success",
          source: "master-context",
          progress: 100,
          metrics: [{ label: "MASTER", value: "OK" }],
        },
      ];
    }

    const capacity = scrapingEngines?.capacity;
    const slides: BillboardSlide[] = [
      {
      id: "operational",
      eyebrow: "Status operacional",
      title: operationalSummaryMessage,
      description: accountContext,
      phase: pendingCheckoutLocked || showOperationalCompanyPicker ? "warning" : hasActiveScrapingEngine ? "loading" : "idle",
      source: "operational",
      progress: hasActiveScrapingEngine ? hbxUsageAverage : null,
        metrics: [
          { label: "Uso", value: `${hbxUsageAverage}%` },
          { label: "Fila", value: String(capacity?.queuedCount ?? 0) },
          { label: "10 min", value: String(capacity?.completedLast10Min ?? hbxProcessedLast10Min) },
        ],
      },
    ];

    if (incomingPopup) {
      slides.push({
        id: `incoming:${incomingPopup.id}`,
        eyebrow: incomingPopup.attentionLabel || "Mensagem",
        title: `${incomingPopup.contactPhone || incomingPopup.customerLabel || "Cliente"} mandou mensagem`,
        description: incomingPopup.preview || incomingPopup.moduleLabel || "Nova mensagem aguardando ação.",
        phase: "warning",
        source: "incoming",
        progress: null,
        metrics: [
          { label: "Origem", value: incomingPopup.moduleLabel },
          { label: "Fila", value: String(pendingHumanCount) },
          { label: "Não lidas", value: String(unreadInboxCount) },
        ],
      });
    }

    if (qrOperationalTile.tone !== "neutral") {
      slides.push({
        id: `qr:${qrOperationalTile.value}:${qrOperationalTile.tone}`,
        eyebrow: "Saúde do QR Code",
        title: qrOperationalTile.value,
        description: qrOperationalTile.detail,
        phase: qrOperationalTile.tone === "danger" || qrOperationalTile.tone === "warning" ? "warning" : qrOperationalTile.tone === "loading" ? "loading" : "success",
        source: "qr",
        progress: qrOperationalTile.usage,
        metrics: [
          { label: "QR", value: qrOperationalTile.value },
          { label: "WhatsApp", value: whatsAppHealthLabel },
        ],
      });
    }

    if (user?.isSystemMaster) {
      slides.push({
        id: `hostinger:${systemHealth?.generatedAt || "pending"}`,
        eyebrow: "Hostinger",
        title: hostingerSummaryTile.value,
        description: hostingerSummaryTile.detail,
        phase: hostingerSummaryTile.tone === "danger" || hostingerSummaryTile.tone === "warning" ? "warning" : "success",
        source: "hostinger",
        progress: hostingerSummaryTile.usage,
        metrics: hostingerVitals
          .filter((vital) => vital.id === "memory" || vital.id === "disk" || vital.id === "api")
          .map((vital) => ({ label: vital.label, value: vital.value }))
          .slice(0, 3),
      });
    }

    if (visibleOperationalStatusChips.length) {
      const chipMetrics = visibleOperationalStatusChips.slice(0, 3).map((chip) => ({
        label: chip.shortLabel || chip.label,
        value: chip.value,
      }));
      slides.push({
        id: "modules",
        eyebrow: "Módulos",
        title: visibleOperationalStatusChips.slice(0, 2).map((chip) => `${chip.shortLabel}: ${chip.value}`).join(" · "),
        description: whatsAppHealthLabel,
        phase: whatsAppHealth === "green" ? "success" : whatsAppHealth === "red" ? "warning" : "idle",
        source: "modules",
        progress: whatsAppHealth === "green" ? 100 : null,
        metrics: chipMetrics,
      });
    }

    if (pendingHumanCount > 0) {
      slides.push({
        id: "queue",
        eyebrow: "Atenção",
        title: `${pendingHumanCount} atendimento${pendingHumanCount === 1 ? "" : "s"} na fila humana`,
        description: "Mensagens e cobranças aguardando operador.",
        phase: "warning",
        source: "queue",
        progress: null,
        metrics: [
          { label: "Inbox", value: String(atendimentoPendingHumanCount) },
          { label: "Cobrança", value: String(recoveryPendingHumanCount) },
        ],
      });
    }

    return slides;
  }, [
    accountContext,
    atendimentoPendingHumanCount,
    hasActiveScrapingEngine,
    hostingerSummaryTile,
    hostingerVitals,
    hbxProcessedLast10Min,
    hbxRunningCount,
    hbxUsageAverage,
    incomingPopup,
    masterContextToast,
    operationalSummaryMessage,
    pendingCheckoutLocked,
    pendingHumanCount,
    progressEngineLabel,
    qrOperationalTile,
    recoveryPendingHumanCount,
    scrapingEngines?.capacity,
    showOperationalCompanyPicker,
    systemHealth?.generatedAt,
    topbarProgress,
    topbarProgressPercent,
    unreadInboxCount,
    visibleOperationalStatusChips,
    user?.isSystemMaster,
    whatsAppHealth,
    whatsAppHealthLabel,
  ]);
  const billboardSlideSignature = billboardSlides.map((slide) => slide.id).join("|");

  useEffect(() => {
    setBillboardSlideIndex(0);
    if (billboardSlides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setBillboardSlideIndex((index) => (index + 1) % billboardSlides.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [billboardSlideSignature, billboardSlides.length]);

  const activeBillboardSlide: BillboardSlide =
    billboardSlides[billboardSlideIndex % Math.max(1, billboardSlides.length)] || {
      id: "fallback",
      eyebrow: "Status operacional",
      title: "Status em leitura",
      description: "Aguardando dados do sistema.",
      phase: "idle",
      source: "fallback",
      progress: null,
      metrics: [],
    };
  const activeBillboardProgress =
    typeof activeBillboardSlide?.progress === "number"
      ? Math.round(Math.max(0, Math.min(100, activeBillboardSlide.progress)))
      : null;
  const whatsAppDialogNode = (
    <WhatsAppOperationalDialog
      isOpen={whatsAppDetailOpen}
      focus={whatsAppDetailFocus}
      loading={whatsAppDetailLoading}
      modalLoading={whatsAppModalLoading}
      busyAction={whatsAppDetailBusy}
      payload={whatsAppCenter}
      modalPayload={whatsAppModal}
      error={whatsAppDetailError}
      modalError={null}
      message={whatsAppDetailMessage}
      onClose={() => {
        setWhatsAppQrRequested(false);
        setWhatsAppDetailOpen(false);
      }}
      onFocusChange={(focus) => {
        setWhatsAppDetailFocus(focus);
        void loadWhatsAppCenter({ background: true });
        if (focus === "qr") {
          void loadWhatsAppModal({ includeQr: whatsAppQrRequested });
        }
      }}
      onChooseMode={(mode) => {
        void chooseWhatsAppMode(mode);
      }}
      onRequestMigration={() => {
        void requestWhatsAppMigration();
      }}
      onStartQrConnection={() => {
        void startQrWhatsAppConnection();
      }}
      onDisconnectQrConnection={() => {
        void disconnectQrWhatsAppConnection();
      }}
    />
  );
  const masterContextModalNode =
    masterContextModalOpen && authenticated === true && user?.isSystemMaster ? (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 150,
          background: "rgba(6, 19, 38, 0.42)",
          display: "grid",
          placeItems: "center",
          padding: "16px",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Assumir contexto da empresa"
        onClick={() => setMasterContextModalOpen(false)}
      >
        <div
          className="panel"
          style={{ width: "min(620px, 100%)", padding: 16, maxHeight: "88vh", overflow: "auto" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Suporte interno MASTER</p>
              <h3 className="mt-1 text-lg font-semibold">Assumir contexto da empresa</h3>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMasterContextModalOpen(false)}>
              Fechar
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {masterContextMessage ? (
              <div className="alert alert-error">{masterContextMessage}</div>
            ) : null}

            <label className="grid gap-1 text-sm">
              Empresa
              <select
                className="field"
                value={selectedMasterCompanyId}
                onChange={(event) => setSelectedMasterCompanyId(event.target.value)}
              >
                <option value="">Selecione...</option>
                {masterCompanyOptions.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.name} | {company.isActive ? "ativa" : "inativa"} | {company.paymentStatus}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              Motivo (opcional)
              <textarea
                className="field"
                rows={3}
                value={masterContextReason}
                onChange={(event) => setMasterContextReason(event.target.value)}
                placeholder="Ex.: diagnostico de webhook Meta para empresa X"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={assumeMasterContext}
                disabled={masterContextActionBusy}
              >
                {masterContextActionBusy ? "Aplicando..." : "Assumir contexto"}
              </button>
              {user.masterContext?.active ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={exitMasterContext}
                  disabled={masterContextActionBusy}
                >
                  Sair do contexto atual
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    ) : null;
  const displayName = (user?.name || user?.username || user?.email || "").trim();
  const _initialSource = displayName || String(user?.username || user?.email || "");
  const displayInitial = _initialSource ? _initialSource.charAt(0).toUpperCase() : "U";
  const displayLabel = displayName ? `User: ${displayName}` : user?.username ? `User: ${user.username}` : "";
  const hbxEngineGroups = Array.from({ length: 4 }, (_, groupIndex) => {
    const engines = scrapingEngineView.hbxEngines.length
      ? scrapingEngineView.hbxEngines
      : Array.from({ length: TOPBAR_HBX_ENGINE_COUNT }, (_, index) => buildFallbackScrapingEngine(index));
    const groupSize = Math.max(1, Math.ceil(engines.length / 4));
    const groupEngines = engines.slice(groupIndex * groupSize, (groupIndex + 1) * groupSize);
    const safeGroupEngines = groupEngines.length ? groupEngines : [buildFallbackScrapingEngine(groupIndex)];
    const onlineCount = safeGroupEngines.filter((engine) => engine.configured && engine.online).length;
    const runningCount = safeGroupEngines.filter((engine) => {
      const state = getVisibleScrapingEngineState(engine);
      return engine.active || engine.busy || isLiveScrapingEngine(engine) || state === "busy" || state === "emergency";
    }).length;
    const cooldownCount = safeGroupEngines.filter((engine) => getVisibleScrapingEngineState(engine) === "cooldown").length;
    const pausedCount = safeGroupEngines.filter((engine) => getVisibleScrapingEngineState(engine) === "paused").length;
    const errorCount = safeGroupEngines.filter((engine) => {
      const state = getVisibleScrapingEngineState(engine);
      return state === "degraded" || state === "offline" || state === "missing";
    }).length;
    const usage = Math.round(
      safeGroupEngines.reduce((sum, engine) => sum + getEngineUsage(engine), 0) / Math.max(1, safeGroupEngines.length),
    );
    const state =
      errorCount > 0
        ? "error"
        : runningCount > 0
          ? "running"
          : cooldownCount > 0
            ? "cooldown"
            : pausedCount > 0
              ? "paused"
              : onlineCount > 0
                ? "standby"
                : "offline";
    const stateLabel =
      state === "running"
        ? "Rodando"
        : state === "cooldown"
          ? "Cooldown"
          : state === "paused"
            ? "Pausado"
            : state === "error"
              ? "Erro"
              : state === "offline"
                ? "Off"
                : "Standby";
    const firstIndex = groupIndex * groupSize + 1;
    const lastIndex = firstIndex + safeGroupEngines.length - 1;

    return {
      id: `hbx-group-${groupIndex + 1}`,
      label: `M${groupIndex + 1}`,
      range: `${firstIndex}-${lastIndex}`,
      state,
      stateLabel,
      usage,
      onlineCount,
      runningCount,
      total: safeGroupEngines.length,
      bars: safeGroupEngines.map((engine) => {
        const engineUsage = getEngineUsage(engine);
        const engineState = getVisibleScrapingEngineState(engine);
        return {
          id: engine.id,
          label: getScrapingEngineShortLabel(engine),
          usage: Math.max(8, engineUsage),
          state: engineState,
          active: engine.active || engine.busy || isLiveScrapingEngine(engine) || engineState === "busy" || engineState === "emergency",
        };
      }),
    };
  });
  const commandKpis = [
    {
      id: "memory",
      label: "Memória Hostinger",
      value: hostingerVitals.find((vital) => vital.id === "memory")?.value || "--",
      detail: hostingerVitals.find((vital) => vital.id === "memory")?.detail || "free -h",
      tone: hostingerVitals.find((vital) => vital.id === "memory")?.tone || "neutral",
      usage: hostingerVitals.find((vital) => vital.id === "memory")?.usage ?? null,
    },
    {
      id: "disk",
      label: "Espaço",
      value: hostingerVitals.find((vital) => vital.id === "disk")?.value || "--",
      detail: hostingerVitals.find((vital) => vital.id === "disk")?.detail || "Disco da VPS",
      tone: hostingerVitals.find((vital) => vital.id === "disk")?.tone || "neutral",
      usage: hostingerVitals.find((vital) => vital.id === "disk")?.usage ?? null,
    },
    {
      id: "messages",
      label: "Mensagens recebidas",
      value: String(Math.max(unreadInboxCount, pendingHumanCount)),
      detail: pendingHumanCount > 0 ? `${pendingHumanCount} na fila humana` : "Inbox sem pressão",
      tone: pendingHumanCount > 0 || unreadInboxCount > 0 ? "warning" : "success",
      usage: pendingHumanCount > 0 || unreadInboxCount > 0 ? 72 : 100,
    },
    {
      id: "queue",
      label: "Cards esperando",
      value: String(hbxQueueCount),
      detail: `${hbxCapacityRunningCount} rodando agora`,
      tone: hbxQueueCount > 0 ? "warning" : "success",
      usage: hbxQueueGaugeUsage,
    },
    {
      id: "qr",
      label: "QR Code",
      value: qrOperationalTile.value,
      detail: qrOperationalTile.detail,
      tone: qrOperationalTile.tone,
      usage: qrOperationalTile.usage ?? null,
    },
  ];
  if (hiddenRoutes.has(pathname)) {
    return null;
  }

  return (
    <header className={`app-topbar${topbarHiddenByScroll ? " app-topbar--hidden" : ""}`}>
      <div ref={topbarFrameRef} className="app-topbar__frame">
        <div className="app-topbar__inner app-topbar__inner--controlCenter">
          <section className="hbx-command-brand" aria-label="HBX Control Center">
            <button
              id={MODULES_TRIGGER_ID}
              type="button"
              className={`hbx-command-brand__mark${modulesPeekOpen ? " is-open" : ""}`}
              onClick={handleModulesTrigger}
              aria-controls="workspace-hover-module-nav"
              aria-expanded={modulesPeekAvailable ? modulesPeekOpen : undefined}
              aria-label={modulesPeekAvailable ? "Abrir modulos pelo HBX" : "Ir para o dashboard"}
              title={modulesPeekAvailable ? "HBX Modulos" : "Dashboard"}
            >
              HBX
              <span aria-hidden="true" />
            </button>
            <div className="hbx-command-brand__copy">
              <strong>HBX Control Center</strong>
              <span>Central operacional</span>
            </div>
          </section>

          <section
            className="hbx-command-center"
            data-active={hasActiveScrapingEngine ? "true" : "false"}
            data-live={liveWebscrapingProgress ? "true" : "false"}
            aria-label="Status operacional HBX"
          >
            <div className="hbx-command-center__body">
              <div className="hbx-command-engines" aria-label="Motores HBX agrupados">
                {hbxEngineGroups.map((group) => (
                  <article
                    key={group.id}
                    className="hbx-command-engine"
                    data-state={group.state}
                    style={getEngineGaugeStyle(group.usage)}
                    title={`${group.label}: ${group.stateLabel}. Motores ${group.range}. ${group.runningCount}/${group.total} rodando, ${group.onlineCount}/${group.total} online.`}
                  >
                    <div className="hbx-command-engine__top">
                      <div>
                        <span className="hbx-command-engine__range">Motores {group.range}</span>
                        <strong>{group.label}</strong>
                      </div>
                      <span>{group.stateLabel}</span>
                    </div>
                    <div className="hbx-command-engine__mid">
                      <span className="hbx-command-engine__gauge" aria-hidden="true">
                        <b>{group.usage}%</b>
                        <small>uso</small>
                      </span>
                      <span className="hbx-command-engine__bars" aria-hidden="true">
                        {group.bars.map((bar) => (
                          <i
                            key={bar.id}
                            data-state={bar.state}
                            data-active={bar.active ? "true" : "false"}
                            style={{ height: `${bar.usage}%` }}
                            title={`${bar.label}: ${bar.usage}%`}
                          />
                        ))}
                      </span>
                    </div>
                    <div className="hbx-command-engine__dots" aria-hidden="true">
                      {group.bars.map((bar) => (
                        <i key={bar.id} data-state={bar.state} data-active={bar.active ? "true" : "false"} />
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <article
                key={activeBillboardSlide.id}
                className="hbx-command-billboard"
                data-phase={activeBillboardSlide.phase}
                data-theater={activeBillboardSlide.isTheater ? "true" : "false"}
                aria-label="Billboard operacional"
              >
                <span className="hbx-command-billboard__scan" aria-hidden="true" />
                <div className="hbx-command-billboard__main">
                  <span className="hbx-command-billboard__orb" aria-hidden="true" />
                  <div>
                    <span>{activeBillboardSlide.eyebrow}</span>
                    <strong>{activeBillboardSlide.title}</strong>
                    <p>{activeBillboardSlide.description}</p>
                  </div>
                  {activeBillboardProgress !== null ? (
                    <b>{activeBillboardProgress}%</b>
                  ) : null}
                </div>
                {activeBillboardProgress !== null ? (
                  <span className="hbx-command-billboard__track" aria-hidden="true">
                    <i style={{ width: `${activeBillboardProgress}%` }} />
                  </span>
                ) : null}
                <div className="hbx-command-billboard__metrics">
                  {(activeBillboardSlide.metrics?.length ? activeBillboardSlide.metrics : hbxGaugePanels).slice(0, 3).map((metricItem) => (
                    <span key={`${metricItem.label}:${metricItem.value}`}>
                      {metricItem.label}
                      <strong>{metricItem.value}</strong>
                    </span>
                  ))}
                </div>

                <div className="hbx-command-kpis hbx-command-kpis--billboard" aria-label="Sinais conectados ao backend">
                  {commandKpis.map((item) => (
                    <span
                      key={item.id}
                      data-tone={item.tone}
                      title={`${item.label}: ${item.value}. ${item.detail}`}
                      style={
                        typeof item.usage === "number"
                          ? ({ ["--kpi-usage" as string]: `${clampTopbarPercent(item.usage)}%` } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <em>{item.label}</em>
                      <strong>{item.value}</strong>
                      <small>{item.detail}</small>
                      <i aria-hidden="true" />
                    </span>
                  ))}
                </div>

                <div className="hbx-command-chips hbx-command-chips--billboard" aria-label="Resumo operacional dos motores">
                  {hbxCommandChips.slice(0, 4).map((chip) => (
                    <span key={`${chip.label}:${chip.value}`} data-tone={chip.tone}>
                      {chip.label}
                      <strong>{chip.value}</strong>
                    </span>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="hbx-command-side" aria-label="Tema e usuário">
            <ThemeSwitcher />
            <div className="hbx-control-accountRow">
              {user ? (
                <div ref={userMenuRef} className="app-user hbx-control-user">
                  <button
                    type="button"
                    className="app-user__trigger hbx-control-user__trigger"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                  >
                    <span className="app-user__avatar">{displayInitial}</span>
                    <span className="app-user__meta">
                      <span className="app-user__name">{displayLabel || user?.username || ""}</span>
                      <span className="app-user__company">
                        {user.isSystemMaster
                          ? user.masterContext?.active
                            ? `MASTER em ${user.masterContext.companyName || "Empresa"}`
                            : "Administrador"
                          : user.company?.name ?? "Sem empresa"}
                      </span>
                    </span>
                  </button>

                  {open ? (
                    <div className="app-user__menu">
                      <p className="app-user__menu-title">Atendente/vendedor</p>
                      <form onSubmit={handleDisplayNameSubmit} className="app-user__form">
                        <input
                          type="text"
                          placeholder="Nome do atendente/vendedor"
                          value={attendantName}
                          onChange={(event) => setAttendantName(event.target.value)}
                          className="field"
                          autoComplete="name"
                        />
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={savingAttendantName || attendantName.trim().length < 2}
                        >
                          {savingAttendantName ? "Salvando..." : "Salvar nome"}
                        </button>
                      </form>
                      <p className="app-user__menu-title">Editar senha</p>
                      <form onSubmit={handlePasswordSubmit} className="app-user__form">
                        <input
                          type="password"
                          placeholder="Senha atual"
                          value={curPass}
                          onChange={(event) => setCurPass(event.target.value)}
                          className="field"
                        />
                        <input
                          type="password"
                          placeholder="Nova senha (mín. 8)"
                          value={newPass}
                          onChange={(event) => setNewPass(event.target.value)}
                          className="field"
                        />
                        {changeMsg ? <p className="text-xs text-muted leading-5">{changeMsg}</p> : null}
                        <div className="app-user__menu-actions">
                          <button
                            type="submit"
                            className="btn btn-primary btn-sm"
                            disabled={changing || newPass.length < 4}
                          >
                            {changing ? "Salvando..." : "Salvar senha"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setOpen(false)}
                          >
                            Fechar
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {authenticated === true ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleLogout();
                  }}
                  className="hbx-control-logout"
                  disabled={isShuttingDown}
                >
                  <span aria-hidden="true">↪</span>
                  {isShuttingDown ? "Saindo..." : "Sair"}
                </button>
              ) : authResolved ? (
                <Link href="/login" prefetch={false} className="hbx-control-logout">
                  Entrar
                </Link>
              ) : null}
            </div>
            <div className="hbx-control-masterActions">
              {authenticated === true && user?.isSystemMaster ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={openMasterContextModal}
              >
                Contexto
              </button>
            ) : null}
            {authenticated === true && user?.isSystemMaster && user.masterContext?.active ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={exitMasterContext}
                disabled={masterContextActionBusy}
              >
                Sair contexto
              </button>
            ) : null}
            </div>
            {user?.isSystemMaster ? (
              <div className="hbx-control-vitals" aria-label="Uso ao vivo de memória e HD">
                {topbarSystemVitals.map((vital) => (
                  <span key={vital.id} data-tone={vital.tone} title={`${vital.label}: ${vital.value}. ${vital.detail}`}>
                    {vital.label}
                    <strong>{vital.value}</strong>
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        {/* dock removed: counter is shown on individual icons (wa-health__queue-badge) */}
      </div>

      {/* incomingPopup UI removed — notifications are disabled for now */}
      {portalReady ? createPortal(whatsAppDialogNode, document.body) : null}

      {portalReady && masterContextModalNode ? createPortal(masterContextModalNode, document.body) : null}

    </header>
  );
}
