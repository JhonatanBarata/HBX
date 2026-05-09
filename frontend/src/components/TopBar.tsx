"use client";
import TopbarCommandCarousel from "./TopbarCommandCarousel";
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
  type TopbarProgressCard,
  type TopbarProgressMetric,
  type TopbarProgressState,
} from "@/lib/topbar-progress";
import { usePopupTopbarLock } from "@/lib/use-popup-topbar-lock";
import {
  formatWhatsAppDateTime,
  formatWhatsAppLiveHealthStatus,
  getWhatsAppModalPlanRedirect,
  type WhatsAppCenterPayload,
  type WhatsAppDiagnosticFocus,
  type WhatsAppLiveHealthPayload,
  type WhatsAppModalPayload,
} from "@/lib/whatsapp-center";
import { useWhatsAppLiveHealth } from "@/lib/useWhatsAppLiveHealth";
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
  kind?: "status" | "engines" | "nightFactoryReward";
  eyebrow: string;
  title: string;
  description: string;
  phase: "idle" | "loading" | "success" | "warning";
  source?: string | null;
  href?: string | null;
  ctaLabel?: string | null;
  isTheater?: boolean;
  progress?: number | null;
  metrics?: TopbarProgressMetric[];
  steps?: string[];
  activeStepIndex?: number;
  cardFeed?: TopbarProgressCard[];
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

type NightFactoryClaimStatusPayload = {
  eligible?: boolean;
  alreadyClaimed?: boolean;
  alreadyClaimedInWindow?: boolean;
  availableCount?: number;
  minimumRequired?: number;
  nextAvailableAt?: string | null;
  secondsUntilNextClaim?: number;
  nonCumulative?: boolean;
  rewardSize?: number;
  reason?: "cooldown" | "insufficient_leads" | "storage_unavailable" | null;
  headline?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  href?: string;
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
const TOPBAR_FALLBACK_HBX_ENGINE_COUNT = 4;
const HBX_ENGINE_GROUP_SIZE = 20;
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
  const hbxEngineCount = sourceHbxCount || TOPBAR_FALLBACK_HBX_ENGINE_COUNT;
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

type HbxEngineLoadTone = "green" | "yellow" | "red" | "muted";

const HBX_ENGINE_SPARK_WIDTH = 236;
const HBX_ENGINE_SPARK_HEIGHT = 58;

const HBX_TOPBAR_POLISH_CSS = `
  .app-topbar,
  .app-topbar__frame,
  .app-topbar__inner--controlCenter {
    overflow: visible;
  }

  .app-topbar__inner--controlCenter {
    display: grid;
    grid-template-columns: minmax(238px, 284px) minmax(0, 1fr) minmax(220px, 274px);
    align-items: stretch;
    gap: 6px;
    padding: 8px;
    border: 1px solid color-mix(in srgb, var(--brand, #10b981) 22%, var(--line, rgba(148, 163, 184, 0.22)));
    border-radius: calc(var(--panel-radius, 22px) + 4px);
    background:
      radial-gradient(circle at 18% 0%, var(--selection-accent-soft, rgba(16, 185, 129, 0.12)), transparent 34%),
      linear-gradient(135deg, var(--header-surface, var(--surface, #ffffff)), var(--surface-soft, #f8fafc));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--brand, #10b981) 10%, transparent),
      var(--shadow-sm, 0 18px 42px -24px rgba(15, 23, 42, 0.26));
  }

  .hbx-whatsapp-live-alert {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    margin: 0 8px 6px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, #f59e0b 45%, var(--line, rgba(148, 163, 184, 0.25)));
    border-radius: 14px;
    background: color-mix(in srgb, #fff7ed 84%, var(--surface, #ffffff));
    color: var(--foreground, #0f172a);
    box-shadow: 0 12px 30px -22px rgba(180, 83, 9, 0.42);
  }

  .hbx-whatsapp-live-alert[data-tone="danger"] {
    border-color: color-mix(in srgb, #dc2626 50%, var(--line, rgba(148, 163, 184, 0.25)));
    background: color-mix(in srgb, #fef2f2 86%, var(--surface, #ffffff));
  }

  .hbx-whatsapp-live-alert__text {
    min-width: 0;
    display: grid;
    gap: 1px;
    font-size: 12px;
    line-height: 1.25;
  }

  .hbx-whatsapp-live-alert__text strong {
    font-size: 12px;
    letter-spacing: 0;
  }

  .hbx-whatsapp-live-alert__text span {
    color: var(--muted, #64748b);
  }

  .hbx-whatsapp-live-alert__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .hbx-command-brand,
  .hbx-command-side,
  .hbx-command-billboard {
    border: 1px solid var(--line, rgba(148, 163, 184, 0.2));
    background: linear-gradient(180deg, color-mix(in srgb, var(--surface-raised, #fff) 94%, transparent), color-mix(in srgb, var(--surface-soft, #f8fafc) 92%, transparent));
    box-shadow: var(--shadow-xs, 0 12px 24px -18px rgba(15, 23, 42, 0.22));
  }

  .hbx-command-brand {
    min-width: 0;
    display: grid;
    grid-template-columns: 52px minmax(160px, 1fr);
    gap: 10px;
    align-items: center;
    padding: 10px;
    border-radius: var(--panel-radius, 22px);
    overflow: visible;
  }

  .hbx-command-brand__mark {
    width: 52px;
    height: 52px;
    border: 0;
    border-radius: 18px;
    display: grid;
    place-items: center;
    color: var(--brand-contrast, #fff);
    background: radial-gradient(circle at 30% 20%, rgba(255,255,255,.34), transparent 30%), linear-gradient(135deg, var(--brand, #10b981), var(--button-accent, #0ea5e9));
    box-shadow: 0 16px 34px -22px var(--brand, #10b981);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .02em;
    cursor: pointer;
    position: relative;
  }

  .hbx-command-brand__mark span {
    position: absolute;
    inset: 8px;
    border: 1px solid rgba(255,255,255,.42);
    border-radius: 14px;
    pointer-events: none;
  }

  .hbx-command-brand__copy { min-width: 0; display: grid; gap: 2px; overflow: visible; }
  .hbx-command-brand__copy strong {
    color: var(--foreground, #0f172a);
    font-size: 15px;
    font-weight: 900;
    letter-spacing: -0.03em;
    white-space: nowrap;
    overflow: visible;
    text-overflow: clip;
  }
  .hbx-command-brand__copy span {
    color: var(--muted, #64748b);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .055em;
    white-space: nowrap;
    overflow: visible;
    text-overflow: clip;
  }

  .hbx-command-center {
    --hbx-carousel-gutter: clamp(22px, 2vw, 28px);
    min-width: 0;
    height: 100%;
    position: relative;
    z-index: 8;
    margin-inline: 0;
    padding-inline: var(--hbx-carousel-gutter);
    overflow: visible;
    isolation: isolate;
  }
  .hbx-command-center::before,
  .hbx-command-center::after {
    content: "";
    position: absolute;
    top: 8px;
    bottom: 8px;
    width: calc(var(--hbx-carousel-gutter) + 8px);
    z-index: 2;
    pointer-events: none;
    border-radius: 999px;
    opacity: .5;
  }
  .hbx-command-center::before {
    left: 0;
    background: linear-gradient(90deg, color-mix(in srgb, var(--header-surface, var(--surface, #fff)) 88%, transparent), transparent);
  }
  .hbx-command-center::after {
    right: 0;
    background: linear-gradient(270deg, color-mix(in srgb, var(--header-surface, var(--surface, #fff)) 88%, transparent), transparent);
  }
  .hbx-command-center__body {
    min-width: 0;
    height: 100%;
    overflow: visible;
    position: relative;
    z-index: 1;
  }
  .hbx-command-billboard {
    position: relative;
    height: 100%;
    min-height: 126px;
    border-radius: var(--panel-radius, 22px);
    padding: 12px;
    overflow: visible;
    color: var(--foreground, #0f172a);
    cursor: pointer;
    border: 2px solid color-mix(in srgb, var(--brand, #10b981) 32%, var(--line, rgba(148,163,184,.24)));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--surface-raised, #fff) 80%, transparent),
      0 18px 48px -26px color-mix(in srgb, var(--brand, #10b981) 30%, transparent),
      var(--shadow-sm, 0 18px 42px -24px rgba(15, 23, 42, 0.26));
    transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
  }
  .hbx-command-billboard:hover,
  .hbx-command-billboard[data-paused="true"] {
    overflow: visible;
    z-index: 50;
    border-color: color-mix(in srgb, var(--brand, #10b981) 58%, var(--line, rgba(148,163,184,.24)));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--brand, #10b981) 30%, transparent),
      0 22px 64px -24px color-mix(in srgb, var(--brand, #10b981) 44%, transparent),
      var(--shadow-md, 0 30px 72px -32px rgba(15,23,42,.38));
    transform: translateY(-1px);
  }
  .hbx-command-billboard:hover::after,
  .hbx-command-billboard[data-paused="true"]::after {
    content: attr(data-full-title) " • " attr(data-full-description);
    position: absolute;
    left: 10px;
    right: 10px;
    top: calc(100% + 8px);
    z-index: 70;
    padding: 9px 12px;
    border-radius: 16px;
    border: 1px solid color-mix(in srgb, var(--brand, #10b981) 30%, var(--line, rgba(148,163,184,.22)));
    background: color-mix(in srgb, var(--surface-raised, #fff) 96%, transparent);
    color: var(--foreground, #0f172a);
    box-shadow: var(--shadow-md, 0 30px 72px -32px rgba(15,23,42,.38));
    font-size: 11px;
    line-height: 1.28;
    font-weight: 750;
    letter-spacing: -0.01em;
    white-space: normal;
    pointer-events: none;
  }
  .hbx-command-billboard::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: radial-gradient(circle at 8% 18%, var(--selection-accent-soft, rgba(16,185,129,.14)), transparent 28%), linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand, #10b981) 10%, transparent), transparent);
    opacity: .68;
  }
  .hbx-command-billboard__scan {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: .26;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.38), transparent);
    transform: translateX(-120%);
    animation: hbxTopbarScan 5.5s ease-in-out infinite;
  }
  .hbx-command-carouselNav {
    position: absolute;
    top: 50%;
    z-index: 140;
    width: 22px;
    min-width: 22px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--line, rgba(148,163,184,.25)) 62%, transparent);
    background: color-mix(in srgb, var(--surface-raised, #fff) 28%, transparent);
    color: color-mix(in srgb, var(--foreground, #0f172a) 92%, var(--brand, #10b981));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--surface, #fff) 24%, transparent),
      0 12px 24px -20px color-mix(in srgb, var(--foreground, #0f172a) 26%, transparent);
    -webkit-backdrop-filter: blur(9px) saturate(145%);
    backdrop-filter: blur(9px) saturate(145%);
    opacity: .18;
    font-size: 22px;
    font-weight: 950;
    line-height: 1;
    cursor: pointer;
    transition:
      opacity .16s ease,
      transform .16s ease,
      border-color .16s ease,
      box-shadow .16s ease,
      background .16s ease,
      color .16s ease;
  }
  .hbx-command-carouselNav:hover,
  .hbx-command-carouselNav:focus-visible,
  .hbx-command-center:hover .hbx-command-carouselNav {
    opacity: .72;
  }
  .hbx-command-carouselNav:hover,
  .hbx-command-carouselNav:focus-visible {
    border-color: color-mix(in srgb, var(--brand, #10b981) 44%, var(--line, rgba(148,163,184,.25)));
    background: color-mix(in srgb, var(--surface-raised, #fff) 62%, transparent);
    color: color-mix(in srgb, var(--brand, #10b981) 70%, var(--foreground, #0f172a));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--brand, #10b981) 16%, transparent),
      0 20px 44px -24px color-mix(in srgb, var(--brand, #10b981) 34%, transparent),
      var(--shadow-xs, 0 12px 24px -18px rgba(15,23,42,.26));
    opacity: .96;
    outline: none;
  }
  .hbx-command-carouselNav--prev {
    left: 1px;
    transform: translateY(-50%);
  }
  .hbx-command-carouselNav--next {
    right: 1px;
    transform: translateY(-50%);
  }
  .hbx-command-carouselNav--prev:hover,
  .hbx-command-carouselNav--prev:focus-visible { transform: translateY(-50%) translateX(-1px) scale(1.04); }
  .hbx-command-carouselNav--next:hover,
  .hbx-command-carouselNav--next:focus-visible { transform: translateY(-50%) translateX(1px) scale(1.04); }
  .hbx-command-billboard__main,
  .hbx-command-billboard__metrics,
  .hbx-command-kpis--billboard,
  .hbx-command-chips--billboard,
  .hbx-command-billboard__steps,
  .hbx-command-billboard__feed,
  .hbx-command-engine-map { position: relative; z-index: 1; }

  .hbx-command-billboard__main {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }
  .hbx-command-billboard__orb {
    width: 42px;
    height: 42px;
    border-radius: 16px;
    background: radial-gradient(circle at 35% 28%, rgba(255,255,255,.78), transparent 28%), linear-gradient(135deg, var(--brand, #10b981), var(--button-accent, #0ea5e9));
    box-shadow: 0 0 0 6px var(--selection-accent-soft, rgba(16,185,129,.13));
  }
  .hbx-command-billboard__main span {
    display: block;
    color: var(--menu-active, var(--brand, #059669));
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .hbx-command-billboard__main strong {
    display: block;
    margin-top: 2px;
    color: var(--foreground, #0f172a);
    font-size: clamp(16px, 1.35vw, 22px);
    font-weight: 950;
    letter-spacing: -0.045em;
    line-height: 1.04;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hbx-command-billboard__main p {
    margin: 3px 0 0;
    color: var(--foreground-soft, #475569);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hbx-command-billboard__main b {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--foreground, #0f172a);
    background: conic-gradient(var(--brand, #10b981) var(--engine-usage, 0%), var(--line, rgba(148,163,184,.22)) 0), var(--surface, #fff);
    box-shadow: inset 0 0 0 7px var(--surface, #fff), var(--shadow-xs, 0 10px 22px -16px rgba(15,23,42,.24));
    font-size: 12px;
  }
  .hbx-command-billboard__track { position: relative; z-index: 1; display: block; height: 7px; margin-top: 10px; border-radius: 999px; background: var(--surface-soft, #f1f5f9); overflow: hidden; }
  .hbx-command-billboard__track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--brand, #10b981), var(--button-accent, #0ea5e9)); }

  .hbx-command-billboard__metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
  .hbx-command-billboard__metrics span,
  .hbx-command-chips--billboard span,
  .hbx-command-kpis--billboard button,
  .hbx-command-billboard__steps span,
  .hbx-command-billboard__feed span {
    border: 1px solid var(--line, rgba(148,163,184,.18));
    background: color-mix(in srgb, var(--surface-raised, #fff) 90%, transparent);
    box-shadow: var(--shadow-inset, inset 0 1px 0 rgba(255,255,255,.7));
  }
  .hbx-command-billboard__metrics span { display: grid; gap: 2px; padding: 8px 10px; border-radius: 14px; color: var(--muted, #64748b); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
  .hbx-command-billboard__metrics strong { color: var(--foreground, #0f172a); font-size: 14px; letter-spacing: -0.02em; }

  .hbx-command-kpis--billboard { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
  .hbx-command-kpis--billboard button { min-width: 0; display: grid; gap: 2px; text-align: left; padding: 8px 9px; border-radius: 15px; color: var(--foreground, #0f172a); cursor: pointer; position: relative; overflow: hidden; }
  .hbx-command-kpis--billboard button::before { content: ""; position: absolute; inset: auto 0 0 0; height: 3px; width: var(--kpi-usage, 0%); background: var(--brand, #10b981); opacity: .9; }
  .hbx-command-kpis--billboard button[data-tone="warning"]::before { background: var(--button-secondary, var(--selection-accent, var(--brand, #10b981))); }
  .hbx-command-kpis--billboard button[data-tone="danger"]::before { background: var(--danger, #ef4444); }
  .hbx-command-kpis--billboard button[data-tone="neutral"]::before { background: var(--muted, #64748b); }
  .hbx-command-kpis--billboard em { color: var(--muted, #64748b); font-size: 9px; font-style: normal; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hbx-command-kpis--billboard strong { color: var(--foreground, #0f172a); font-size: 12px; font-weight: 900; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hbx-command-kpis--billboard small { color: var(--foreground-soft, #475569); font-size: 9px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hbx-command-billboard:hover .hbx-command-kpis--billboard button,
  .hbx-command-billboard[data-paused="true"] .hbx-command-kpis--billboard button { overflow: visible; }
  .hbx-command-billboard:hover .hbx-command-kpis--billboard small,
  .hbx-command-billboard[data-paused="true"] .hbx-command-kpis--billboard small,
  .hbx-command-billboard:hover .hbx-command-kpis--billboard em,
  .hbx-command-billboard[data-paused="true"] .hbx-command-kpis--billboard em { overflow: visible; text-overflow: clip; }

  .hbx-command-chips--billboard { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
  .hbx-command-chips--billboard span { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 4px 9px; border-radius: 999px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
  .hbx-command-chips--billboard strong { color: var(--foreground, #0f172a); font-size: 11px; }
  .hbx-command-chips--billboard span::before { content: ""; width: 7px; height: 7px; border-radius: 999px; background: var(--muted, #64748b); }
  .hbx-command-chips--billboard span[data-tone="success"]::before { background: var(--success, #10b981); box-shadow: 0 0 10px var(--success, #10b981); }
  .hbx-command-chips--billboard span[data-tone="warning"]::before { background: var(--button-secondary, var(--selection-accent, var(--brand, #10b981))); box-shadow: 0 0 10px color-mix(in srgb, var(--button-secondary, var(--selection-accent, var(--brand, #10b981))) 60%, transparent); }
  .hbx-command-chips--billboard span[data-tone="danger"]::before { background: var(--danger, #ef4444); box-shadow: 0 0 10px var(--danger, #ef4444); }

  .hbx-command-billboard__steps, .hbx-command-billboard__feed { display: grid; gap: 6px; margin-top: 9px; }
  .hbx-command-billboard__steps { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .hbx-command-billboard__feed { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .hbx-command-billboard__steps span { display: flex; align-items: center; gap: 6px; padding: 7px 8px; border-radius: 13px; color: var(--foreground-soft, #475569); font-size: 10px; font-weight: 800; }
  .hbx-command-billboard__steps i { width: 8px; height: 8px; border-radius: 999px; background: var(--muted, #94a3b8); }
  .hbx-command-billboard__steps span[data-state="active"] i { background: var(--button-secondary, var(--selection-accent, var(--brand, #10b981))); box-shadow: 0 0 10px color-mix(in srgb, var(--button-secondary, var(--selection-accent, var(--brand, #10b981))) 60%, transparent); }
  .hbx-command-billboard__steps span[data-state="done"] i { background: var(--success, #10b981); }
  .hbx-command-billboard__feed span { display: grid; gap: 1px; padding: 7px 8px; border-radius: 13px; min-width: 0; }
  .hbx-command-billboard__feed strong, .hbx-command-billboard__feed small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .hbx-command-billboard--reward {
    border-color: color-mix(in srgb, var(--success, var(--brand, #10b981)) 54%, var(--line, rgba(148,163,184,.24)));
    background:
      radial-gradient(circle at 12% 10%, color-mix(in srgb, var(--success, var(--brand, #10b981)) 20%, transparent), transparent 34%),
      radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--button-accent, var(--brand, #0ea5e9)) 16%, transparent), transparent 30%),
      linear-gradient(180deg, color-mix(in srgb, var(--surface-raised, #fff) 96%, transparent), color-mix(in srgb, var(--surface-soft, #f8fafc) 94%, transparent));
  }
  .hbx-command-reward,
  .hbx-command-reward__main,
  .hbx-command-reward__slots { position: relative; z-index: 1; }
  .hbx-command-reward { display: grid; gap: 10px; }
  .hbx-command-reward__main {
    display: grid;
    grid-template-columns: minmax(108px, auto) minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }
  .hbx-command-reward__badge,
  .hbx-command-reward__cta {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--success, var(--brand, #10b981)) 34%, var(--line, rgba(148,163,184,.22)));
    background: color-mix(in srgb, var(--success, var(--brand, #10b981)) 11%, var(--surface-raised, #fff));
    color: color-mix(in srgb, var(--success, var(--brand, #10b981)) 78%, var(--foreground, #0f172a));
    padding: 0 11px;
    font-size: 10px;
    font-weight: 950;
    letter-spacing: .08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .hbx-command-reward__cta {
    background: linear-gradient(135deg, var(--brand, #10b981), var(--button-accent, #0ea5e9));
    color: var(--brand-contrast, #fff);
    letter-spacing: 0;
    text-transform: none;
    box-shadow: 0 16px 30px -22px var(--brand, #10b981);
  }
  .hbx-command-reward__main strong {
    display: block;
    color: var(--foreground, #0f172a);
    font-size: clamp(16px, 1.35vw, 22px);
    font-weight: 950;
    letter-spacing: -0.035em;
    line-height: 1.05;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hbx-command-reward__main p {
    margin: 3px 0 0;
    color: var(--foreground-soft, #475569);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hbx-command-reward__slots {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  .hbx-command-reward__slots i {
    min-height: 20px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--success, var(--brand, #10b981)) 36%, var(--line, rgba(148,163,184,.22)));
    background:
      radial-gradient(circle at 30% 28%, color-mix(in srgb, var(--surface-raised, #fff) 80%, transparent), transparent 28%),
      linear-gradient(135deg, var(--success, var(--brand, #10b981)), var(--button-accent, #0ea5e9));
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--success, var(--brand, #10b981)) 10%, transparent),
      0 12px 22px -18px color-mix(in srgb, var(--success, var(--brand, #10b981)) 80%, transparent);
  }

  .hbx-command-engine-map { height: 100%; }
  .hbx-command-engines--billboard { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; height: 100%; }
  .hbx-command-engine { min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--engine-tone-color, var(--brand, #10b981)) 28%, var(--line, rgba(148,163,184,.2))); background: radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--engine-tone-color, #10b981) 12%, transparent), transparent 42%), color-mix(in srgb, var(--surface-raised, #fff) 94%, transparent); box-shadow: var(--shadow-inset, inset 0 1px 0 rgba(255,255,255,.72)); }
  .hbx-command-engine__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .hbx-command-engine__range { display: block; color: var(--muted, #64748b); font-size: 10px; font-weight: 800; line-height: 1; }
  .hbx-command-engine__top strong { display: block; margin-top: 4px; color: var(--foreground, #0f172a); font-size: 24px; font-weight: 950; letter-spacing: -0.06em; line-height: 1; }
  .hbx-command-engine__top > span:last-child { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 999px; color: var(--engine-tone-color, #059669); background: color-mix(in srgb, var(--engine-tone-color, #059669) 12%, transparent); border: 1px solid color-mix(in srgb, var(--engine-tone-color, #059669) 22%, transparent); font-size: 10px; font-weight: 900; white-space: nowrap; }
  .hbx-command-engine__top > span:last-child::before { content: ""; width: 7px; height: 7px; border-radius: 999px; background: currentColor; box-shadow: 0 0 10px currentColor; }
  .hbx-command-engine__mid { min-height: 58px; display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 8px; align-items: end; }
  .hbx-command-engine__gauge { width: 52px; height: 52px; border-radius: 999px; display: grid; place-items: center; align-content: center; color: var(--foreground, #0f172a); background: conic-gradient(var(--engine-tone-color, #10b981) var(--engine-usage, 0%), var(--line, rgba(148,163,184,.22)) 0), var(--surface, #fff); box-shadow: inset 0 0 0 6px var(--surface, #fff), var(--shadow-xs, 0 10px 22px -16px rgba(15,23,42,.24)); }
  .hbx-command-engine__gauge b { font-size: 13px; font-weight: 950; letter-spacing: -0.04em; line-height: 1; }
  .hbx-command-engine__gauge small { margin-top: -11px; color: var(--muted, #64748b); font-size: 8px; font-weight: 900; text-transform: uppercase; }
  .hbx-command-engine__spark { color: var(--foreground, #0f172a); mix-blend-mode: normal; }
  .hbx-command-engine__dots { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; padding: 0 4px 0 63px; }
  .hbx-command-engine__dots i { width: 7px; height: 7px; justify-self: center; border-radius: 999px; }

  .hbx-command-side { min-width: 0; display: grid; grid-template-columns: 1fr; align-content: start; gap: 8px; padding: 10px; border-radius: var(--panel-radius, 22px); }
  .hbx-control-accountRow, .hbx-control-masterActions, .hbx-control-vitals { min-width: 0; display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
  .hbx-control-user { min-width: 0; flex: 1 1 150px; position: relative; }
  .hbx-control-user__trigger, .hbx-control-logout, .hbx-control-masterActions .btn, .hbx-control-vitals span { min-height: 34px; border-radius: 999px; border: 1px solid var(--line, rgba(148,163,184,.2)); background: color-mix(in srgb, var(--surface-raised, #fff) 92%, transparent); color: var(--foreground, #0f172a); box-shadow: var(--shadow-inset, inset 0 1px 0 rgba(255,255,255,.72)); }
  .hbx-control-user__trigger { width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; align-items: center; padding: 3px 10px 3px 4px; }
  .hbx-control-user .app-user__avatar { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 999px; color: var(--brand-contrast, #fff); background: linear-gradient(135deg, var(--brand, #10b981), var(--button-accent, #0ea5e9)); font-size: 12px; font-weight: 950; }
  .hbx-control-user .app-user__meta { min-width: 0; display: grid; text-align: left; }
  .hbx-control-user .app-user__name, .hbx-control-user .app-user__company { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hbx-control-user .app-user__name { color: var(--foreground, #0f172a); font-size: 12px; font-weight: 900; }
  .hbx-control-user .app-user__company { color: var(--muted, #64748b); font-size: 10px; font-weight: 700; }
  .hbx-control-logout { display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; font-size: 11px; font-weight: 900; text-decoration: none; }
  .hbx-control-masterActions .btn { padding: 0 12px; font-size: 11px; font-weight: 900; }
  .hbx-control-vitals span { display: inline-grid; align-content: center; padding: 4px 10px; color: var(--muted, #64748b); font-size: 9px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
  .hbx-control-vitals strong { color: var(--foreground, #0f172a); font-size: 12px; letter-spacing: -0.02em; }
  .hbx-control-vitals span[data-tone="green"] strong, .hbx-control-vitals span[data-tone="success"] strong { color: var(--success, #10b981); }
  .hbx-control-vitals span[data-tone="yellow"] strong, .hbx-control-vitals span[data-tone="warning"] strong { color: var(--button-secondary, var(--selection-accent, var(--brand, #10b981))); }
  .hbx-control-vitals span[data-tone="red"] strong, .hbx-control-vitals span[data-tone="danger"] strong { color: var(--danger, #ef4444); }
  .hbx-control-user .app-user__menu { right: 0; left: auto; width: min(320px, calc(100vw - 24px)); border: 1px solid var(--line, rgba(148,163,184,.2)); background: var(--surface-raised, #fff); color: var(--foreground, #0f172a); box-shadow: var(--shadow-md, 0 30px 72px -32px rgba(15,23,42,.38)); }

  @keyframes hbxTopbarScan { 0%, 66% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
  @media (max-width: 1240px) {
    .app-topbar__inner--controlCenter { grid-template-columns: minmax(220px, 260px) minmax(0, 1fr); }
    .hbx-command-side { grid-column: 1 / -1; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
    .hbx-control-vitals { justify-content: flex-end; }
  }
  @media (max-width: 920px) {
    .app-topbar__inner--controlCenter { grid-template-columns: 1fr; }
    .hbx-command-engines--billboard { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hbx-command-kpis--billboard { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hbx-command-reward__main { grid-template-columns: 1fr; align-items: stretch; }
    .hbx-command-reward__badge,
    .hbx-command-reward__cta { width: fit-content; }
    .hbx-command-billboard__feed, .hbx-command-billboard__steps, .hbx-command-billboard__metrics { grid-template-columns: 1fr; }
    .hbx-whatsapp-live-alert { align-items: stretch; }
    .hbx-whatsapp-live-alert__actions { width: 100%; }
  }
`;


function getEngineUsageTone(usage: number, state?: string | null): HbxEngineLoadTone {
  const normalizedState = String(state || "").trim().toLowerCase();
  if (normalizedState === "offline" || normalizedState === "missing" || normalizedState === "paused") return "muted";
  if (normalizedState === "degraded" || normalizedState === "error") return "red";
  if (normalizedState === "cooldown") return "yellow";

  const safeUsage = clampTopbarPercent(usage);
  if (safeUsage <= 33) return "green";
  if (safeUsage <= 66) return "yellow";
  return "red";
}

function getEngineToneColor(tone: HbxEngineLoadTone) {
  if (tone === "green") return "var(--success, var(--brand, #059669))";
  if (tone === "yellow") return "var(--button-secondary, var(--selection-accent, var(--brand, #059669)))";
  if (tone === "red") return "var(--danger, var(--button-accent, #dc2626))";
  return "var(--muted, #94a3b8)";
}

function getEngineToneSoftColor(tone: HbxEngineLoadTone) {
  if (tone === "green") return "color-mix(in srgb, var(--success, var(--brand, #059669)) 16%, transparent)";
  if (tone === "yellow") return "color-mix(in srgb, var(--button-secondary, var(--selection-accent, var(--brand, #059669))) 18%, transparent)";
  if (tone === "red") return "color-mix(in srgb, var(--danger, var(--button-accent, #dc2626)) 16%, transparent)";
  return "color-mix(in srgb, var(--muted, #94a3b8) 14%, transparent)";
}

function buildEngineSparkSamples(
  engine: ScrapingEngineStatus,
  usage: number,
  active: boolean,
  groupIndex: number,
  engineIndex: number,
) {
  const state = getScrapingEngineState(engine);
  const safeUsage = clampTopbarPercent(usage);
  const processed = Math.max(0, Math.min(30, Math.trunc(Number(engine.processedLast10Min || 0))));
  const queueShare = Math.max(0, Math.min(100, Number(engine.queueShare || 0)));
  const heartbeatAge = Math.max(0, Math.min(180, Math.trunc(Number(engine.heartbeatAgeSeconds || 0))));
  const errors = Math.max(0, Math.min(10, Math.trunc(Number(engine.errorCount || 0))));
  const patterns = [
    [0.14, 0.2, 0.36, 0.28, 0.46, 0.34, 0.52, 0.42],
    [0.2, 0.44, 0.31, 0.68, 0.56, 0.72, 0.48, 0.64],
    [0.34, 0.3, 0.58, 0.46, 0.82, 0.62, 0.74, 0.5],
    [0.22, 0.62, 0.38, 0.48, 0.32, 0.7, 0.42, 0.58],
    [0.18, 0.28, 0.5, 0.76, 0.45, 0.66, 0.54, 0.86],
  ];
  const pattern = patterns[(groupIndex + engineIndex) % patterns.length];
  const floor = Math.max(4, Math.min(40, safeUsage * (active ? 0.34 : 0.22)));
  const telemetryBoost = Math.min(28, processed * 1.4 + queueShare * 0.16 + (active ? 12 : 0));
  const heartbeatPenalty = heartbeatAge > 45 ? Math.min(18, (heartbeatAge - 45) / 6) : 0;
  const errorBoost = errors > 0 ? Math.min(22, errors * 5) : 0;
  const ceiling = Math.max(floor + 8, Math.min(96, safeUsage + telemetryBoost + errorBoost - heartbeatPenalty));
  const stateFactor = state === "cooldown" ? 0.72 : state === "paused" ? 0.34 : state === "offline" || state === "missing" ? 0.22 : 1;

  return pattern.map((weight, sampleIndex) => {
    const jitter = ((groupIndex + 1) * 5 + (engineIndex + 1) * 7 + sampleIndex * 3) % 13;
    const shaped = floor + (ceiling - floor) * weight * stateFactor + jitter - 6;
    return Math.max(4, Math.min(96, Math.round(shaped)));
  });
}

function buildEngineSparkSegment(
  engine: ScrapingEngineStatus,
  engineIndex: number,
  groupIndex: number,
  active: boolean,
  visibleState: string,
  usage: number,
  groupSize = 5,
) {
  const safeGroupSize = Math.max(1, Math.trunc(Number(groupSize || 1)));
  const segmentGap = safeGroupSize > 10 ? 3 : 10;
  const horizontalPadding = 10;
  const segmentWidth = Math.max(
    4,
    (HBX_ENGINE_SPARK_WIDTH - horizontalPadding * 2 - segmentGap * Math.max(0, safeGroupSize - 1)) / safeGroupSize,
  );
  const xStart = horizontalPadding + engineIndex * (segmentWidth + segmentGap);
  const yBase = 49;
  const yTop = 11;
  const samples = buildEngineSparkSamples(engine, usage, active, groupIndex, engineIndex);
  const points = samples.map((sample, sampleIndex) => {
    const x = xStart + (sampleIndex * segmentWidth) / Math.max(1, samples.length - 1);
    const y = yBase - (sample / 100) * (yBase - yTop);
    return `${Number(x.toFixed(1))},${Number(y.toFixed(1))}`;
  });
  const tone = getEngineUsageTone(usage, visibleState);
  const color = getEngineToneColor(tone);
  const softColor = getEngineToneSoftColor(tone);
  const areaPoints = [
    `${xStart},${yBase}`,
    ...points,
    `${xStart + segmentWidth},${yBase}`,
  ].join(" ");

  return {
    id: engine.id || `${groupIndex}:${engineIndex}`,
    label: getScrapingEngineShortLabel(engine),
    shortLabel: String(groupIndex * safeGroupSize + engineIndex + 1).padStart(2, "0"),
    usage: clampTopbarPercent(usage),
    state: visibleState,
    active,
    tone,
    color,
    softColor,
    points: points.join(" "),
    areaPoints,
    centerX: xStart + segmentWidth / 2,
    separatorX: xStart + segmentWidth + segmentGap / 2,
  };
}


function buildSyntheticGroupChildEngine(
  engine: ScrapingEngineStatus,
  groupIndex: number,
  childIndex: number,
): ScrapingEngineStatus {
  const baseUsage = getEngineUsage(engine);
  const pattern = [0.74, 1.18, 0.92, 1.36, 0.58][(groupIndex + childIndex) % 5];
  const offsetPattern = [-10, 7, -2, 14, -6][(childIndex + groupIndex * 2) % 5];
  const processed = Math.max(0, Math.trunc(Number(engine.processedLast10Min || 0)));
  const queueShare = Math.max(0, Math.min(100, Number(engine.queueShare || 0)));
  const pressureBoost = Math.min(18, processed * 0.7 + queueShare * 0.11);
  const syntheticUsage = clampTopbarPercent(baseUsage * pattern + offsetPattern + pressureBoost);
  const activeSlots = Math.max(1, Math.min(5, Math.ceil(Math.max(baseUsage, syntheticUsage) / 22)));
  const sourceState = getScrapingEngineState(engine);
  const childNumber = groupIndex * 5 + childIndex + 1;
  const inheritedStatus =
    sourceState === "offline" ||
    sourceState === "missing" ||
    sourceState === "paused" ||
    sourceState === "cooldown" ||
    sourceState === "degraded"
      ? sourceState
      : childIndex < activeSlots
        ? "busy"
        : "standby";

  return {
    ...engine,
    id: `${engine.id || `hbx-main-${groupIndex + 1}`}:sub-${childIndex + 1}`,
    label: `HBX Motor ${childNumber}`,
    shortLabel: `HBX ${childNumber}`,
    index: childNumber - 1,
    active: Boolean(engine.active || engine.busy) && childIndex < activeSlots,
    busy: Boolean(engine.busy || engine.active) && childIndex < activeSlots,
    online: engine.online || engine.configured,
    dimmed: childIndex >= activeSlots && !engine.active && !engine.busy,
    status: inheritedStatus,
    usagePercent: syntheticUsage,
    processedLast10Min: Math.max(0, Math.round(processed * (0.1 + pattern * 0.18))),
    queueShare: Math.max(0, Math.min(100, Math.round(queueShare * pattern))),
    errorCount: childIndex === 0 ? engine.errorCount : Math.max(0, Math.floor(Number(engine.errorCount || 0) * 0.35)),
    heartbeatAgeSeconds: Number.isFinite(Number(engine.heartbeatAgeSeconds))
      ? Math.max(0, Math.trunc(Number(engine.heartbeatAgeSeconds || 0)) + childIndex * 3)
      : engine.heartbeatAgeSeconds,
    detail: `${engine.label || `M${groupIndex + 1}`} controla submotor ${childIndex + 1}/5`,
  };
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
    normalized === "night_factory" ||
    normalized === "night-factory" ||
    normalized === "atendimento" ||
    normalized.startsWith("atendimento-");
}

function isEngineProgressSource(source: string | null | undefined) {
  const normalized = String(source || "").trim().toLowerCase();
  return normalized === "webscraping" ||
    normalized === "radar" ||
    normalized === "radar-digital" ||
    normalized === "vendas" ||
    normalized === "night_factory" ||
    normalized === "night-factory" ||
    normalized === "atendimento" ||
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

function buildWhatsAppLiveHealthDetail(health: WhatsAppLiveHealthPayload) {
  const checked = formatWhatsAppDateTime(health.lastCheckedAt);
  const inbound = health.lastInboundMessageAt ? formatWhatsAppDateTime(health.lastInboundMessageAt) : "sem registro";
  return `${health.reason} Checagem: ${checked}. Última recebida: ${inbound}.`;
}

function topbarTileFromWhatsAppLiveHealth(health: WhatsAppLiveHealthPayload): TopbarOperationalTile {
  const base = {
    id: "qr",
    label: "QR Code",
    detail: buildWhatsAppLiveHealthDetail(health),
  };

  if (health.liveConfirmed && health.status === "healthy") {
    return { ...base, value: "QR vivo confirmado", tone: "success", usage: 100 };
  }
  if (health.status === "reconnecting") {
    return { ...base, value: "Reconectando", tone: "warning", usage: 58 };
  }
  if (health.status === "disconnected") {
    return { ...base, value: "Desconectado", tone: "danger", usage: 12 };
  }
  if (health.status === "error") {
    return { ...base, value: health.providerReachable ? "Erro" : "Provider indisponível", tone: "danger", usage: 18 };
  }
  return {
    ...base,
    value: health.inboundStale && health.liveConfirmed ? "Sem mensagens recentes" : "Status salvo, sem confirmação",
    tone: "warning",
    usage: 46,
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
  const [billboardPaused, setBillboardPaused] = useState(false);
  const [nightFactoryReward, setNightFactoryReward] = useState<NightFactoryClaimStatusPayload | null>(null);
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
  const whatsAppQrActionInFlightRef = useRef(false);
  const scrapingEngineBackoffUntilRef = useRef(0);
  const scrapingEngineBackoffMsRef = useRef(SCRAPING_ENGINE_POLL_MS);
  const authResolved = authenticated !== null;
  const pendingCheckoutLocked = false;
  const pendingCheckoutHref = "/pagamento?focus=payment&reason=pending_checkout";
  const dashboardHref = pendingCheckoutLocked ? pendingCheckoutHref : user?.isSystemMaster ? "/master" : "/boasvindas";
  const isMasterWebscrapingRoute = Boolean(
    pathname?.startsWith("/master/webscraping") || pathname?.startsWith("/dashboard/master/webscraping"),
  );
  const isAtendimentoRoute = Boolean(pathname?.startsWith("/atendimento") || pathname?.startsWith("/dashboard/atendimento"));
  const hasWhatsAppLiveContext = Boolean(authenticated === true && !pendingCheckoutLocked && !isMasterWebscrapingRoute && (user?.company?.id || user?.masterContext?.active));
  const whatsAppLiveHealth = useWhatsAppLiveHealth({
    enabled: hasWhatsAppLiveContext,
    intervalMs: isAtendimentoRoute ? 15000 : 30000,
  });

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
  const visibleHbxEngineCount = Math.max(1, scrapingEngineView.hbxEngines.length || TOPBAR_FALLBACK_HBX_ENGINE_COUNT);
  const liveWebscrapingProgress = Boolean(topbarProgress && isEngineProgressSource(topbarProgress.source) && topbarProgress.phase === "loading");
  const topbarProgressPercent = Math.round(Math.max(0, Math.min(100, topbarProgress?.progress || 0)));
  const progressEngineIds = useMemo(
    () => new Set((topbarProgress?.activeEngineIds || []).map((engineId) => String(engineId || "").trim()).filter(Boolean)),
    [topbarProgress?.activeEngineIds],
  );
  const progressEngineIndex =
    typeof topbarProgress?.activeEngineIndex === "number" && Number.isInteger(topbarProgress.activeEngineIndex)
      ? Math.max(0, Math.min(visibleHbxEngineCount - 1, topbarProgress.activeEngineIndex))
      : liveWebscrapingProgress
        ? Math.max(0, Math.min(visibleHbxEngineCount - 1, Math.floor((topbarProgressPercent / 100) * visibleHbxEngineCount)))
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
      metric: `${hbxEngineOnlineCount}/${visibleHbxEngineCount} online`,
      detail: `${hbxActiveEngineLimit}/${visibleHbxEngineCount} ativos agora`,
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
      value: `${hbxEngineOnlineCount}/${visibleHbxEngineCount}`,
      tone: hbxEngineOnlineCount >= hbxEngineTotal && hbxEngineTotal > 0 ? "success" : "warning",
    },
    {
      label: "Ativos agora",
      value: `${hbxActiveEngineLimit}/${visibleHbxEngineCount}`,
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
    const liveStatus = whatsAppLiveHealth.health?.status;
    if (whatsAppLiveHealth.health?.liveConfirmed && liveStatus === "healthy") return "green";
    if (liveStatus === "disconnected" || liveStatus === "error") return "red";
    if (liveStatus === "stale" || liveStatus === "reconnecting") return "yellow";
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
  }, [operationalStatusMap, whatsAppLiveHealth.health?.liveConfirmed, whatsAppLiveHealth.health?.status]);

  const whatsAppHealthLabel = useMemo(() => {
    const live = whatsAppLiveHealth.health;
    if (live) {
      return `WebWhats: ${formatWhatsAppLiveHealthStatus(live.status)}`;
    }
    const metaChip = operationalStatusMap.get("meta");
    const webWhatsChip = operationalStatusMap.get("webwhats");
    const tokenChip = operationalStatusMap.get("token");
    const preferred = [metaChip, webWhatsChip, tokenChip].find(Boolean) || null;
    if (!preferred) {
      return "Motores WhatsApp: em leitura";
    }
    return `${preferred.label}: ${preferred.value}`;
  }, [operationalStatusMap, whatsAppLiveHealth.health]);
  const qrOperationalTile = useMemo<TopbarOperationalTile>(() => {
    if (whatsAppLiveHealth.health) {
      return topbarTileFromWhatsAppLiveHealth(whatsAppLiveHealth.health);
    }
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
    whatsAppLiveHealth.health,
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
      setNightFactoryReward(null);
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
    if (authenticated !== true || !user) {
      setNightFactoryReward(null);
      return;
    }

    let mounted = true;
    const loadNightFactoryReward = () => {
      apiFetch<NightFactoryClaimStatusPayload>("/night-factory/claim-status", { requireAuth: true, timeoutMs: 9000 })
        .then((payload) => {
          if (!mounted) return;
          setNightFactoryReward(payload?.eligible ? payload : null);
        })
        .catch(() => {
          if (mounted) setNightFactoryReward(null);
        });
    };

    loadNightFactoryReward();
    window.addEventListener("night-factory-reward-changed", loadNightFactoryReward);

    return () => {
      mounted = false;
      window.removeEventListener("night-factory-reward-changed", loadNightFactoryReward);
    };
  }, [authenticated, user?.id, user?.company?.id, user?.masterContext?.active, user?.masterContext?.companyId]);

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
      void whatsAppLiveHealth.refresh(true);
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
      void whatsAppLiveHealth.refresh(true);
      void refreshOperationalStatus(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao registrar o interesse na migracao oficial.";
      setWhatsAppDetailError(message);
    } finally {
      setWhatsAppDetailBusy(null);
    }
  }

  async function startQrWhatsAppConnection() {
    if (whatsAppQrActionInFlightRef.current) return;
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return;
    }
    whatsAppQrActionInFlightRef.current = true;
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
      void whatsAppLiveHealth.refresh(true);
      void refreshOperationalStatus(true);
    } catch (error) {
      setWhatsAppQrRequested(false);
      const message = error instanceof Error ? error.message : "Falha ao iniciar a conexão rápida por QR.";
      setWhatsAppDetailError(message);
    } finally {
      whatsAppQrActionInFlightRef.current = false;
      setWhatsAppDetailBusy(null);
    }
  }

  async function disconnectQrWhatsAppConnection() {
    if (whatsAppQrActionInFlightRef.current) return;
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return;
    }
    whatsAppQrActionInFlightRef.current = true;
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
      void whatsAppLiveHealth.refresh(true);
      void refreshOperationalStatus(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao desconectar a conexão rápida por QR.";
      setWhatsAppDetailError(message);
    } finally {
      whatsAppQrActionInFlightRef.current = false;
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

  function openWhatsAppOperationalDetail(focus: WhatsAppDiagnosticFocus = "status") {
    setWhatsAppDetailFocus(focus);
    setWhatsAppDetailOpen(true);
    setWhatsAppQrRequested(false);
    void loadWhatsAppCenter({ background: true });
    void loadWhatsAppModal({ background: true, includeQr: false });
  }

  function handleBillboardAction(slide: BillboardSlide) {
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return;
    }

    if (showOperationalCompanyPicker) {
      void openMasterContextModal();
      return;
    }

    if (slide.source === "qr" || slide.source === "modules") {
      openWhatsAppOperationalDetail(slide.source === "qr" ? "qr" : "status");
      return;
    }

    if (slide.source === "incoming" && incomingPopup?.href) {
      router.push(incomingPopup.href);
      return;
    }

    if (slide.source === "night-factory-reward" || slide.kind === "nightFactoryReward") {
      router.push(slide.href || "/night-factory");
      return;
    }

    if (slide.source === "queue") {
      handleQueueShortcut(atendimentoPendingHumanCount > 0 ? "atendimento" : "recovery");
      return;
    }

    if (slide.source === "hostinger") {
      router.push("/master/sistema");
      return;
    }

    if (slide.source === "engines" || slide.source === "webscraping") {
      router.push(user?.isSystemMaster ? "/master/webscraping" : "/radar-digital");
      return;
    }

    if (slide.source === "operational") {
      if (user?.isSystemMaster && !user.masterContext?.active) {
        void openMasterContextModal();
      } else if (user?.isSystemMaster) {
        router.push("/master");
      } else {
        router.push("/boasvindas");
      }
    }
  }

  function handleCommandKpiAction(id: TopbarOperationalTile["id"]) {
    if (pendingCheckoutLocked) {
      router.push(pendingCheckoutHref);
      return;
    }

    if (id === "qr") {
      openWhatsAppOperationalDetail("qr");
      return;
    }

    if (id === "messages") {
      if (pendingHumanCount > 0) {
        handleQueueShortcut(atendimentoPendingHumanCount > 0 ? "atendimento" : "recovery");
      } else {
        void toggleUnreadInboxPopup();
      }
      return;
    }

    if (id === "queue") {
      router.push(user?.isSystemMaster ? "/master/webscraping" : "/radar-digital");
      return;
    }

    if (id === "memory" || id === "disk") {
      router.push(user?.isSystemMaster ? "/master/sistema" : "/boasvindas");
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
            : isEngineProgressSource(topbarProgress.source)
              ? progressEngineLabel
                ? `${progressEngineLabel} ao vivo`
                : "Motores HBX"
            : topbarProgress.phase === "warning"
              ? "Atenção"
              : "Confirmado";
      const fallbackMetrics =
        isEngineProgressSource(topbarProgress.source)
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
          steps: topbarProgress.steps,
          activeStepIndex: topbarProgress.activeStepIndex,
          cardFeed: topbarProgress.cardFeed,
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
        kind: "status",
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

    slides.push({
      id: "engines",
      kind: "engines",
      eyebrow: "Motores HBX",
      title: `${hbxCapacityRunningCount} rodando`,
      description: `${hbxEngineOnlineCount}/${visibleHbxEngineCount} online • ${hbxActiveEngineLimit}/${visibleHbxEngineCount} ativos agora`,
      phase: hbxOperationalErrorCount > 0 ? "warning" : hbxCapacityRunningCount > 0 || hasActiveScrapingEngine ? "loading" : "success",
      source: "engines",
      progress: hbxUsageAverage,
      metrics: [
        { label: "Online", value: `${hbxEngineOnlineCount}/${visibleHbxEngineCount}` },
        { label: "Rodando", value: String(hbxCapacityRunningCount) },
        { label: "Cooldown", value: String(hbxCooldownCount) },
      ],
    });

    if (nightFactoryReward?.eligible) {
      slides.push({
        id: `night-factory-reward:${nightFactoryReward.availableCount || 5}`,
        kind: "nightFactoryReward",
        eyebrow: "🎁 Night Factory",
        title: "5 leads premium liberados",
        description: "Recompensa diária disponível",
        phase: "success",
        source: "night-factory-reward",
        href: nightFactoryReward.href || "/night-factory",
        ctaLabel: nightFactoryReward.ctaLabel || "Resgatar recompensa",
        progress: 100,
        metrics: [
          { label: "Leads", value: `${nightFactoryReward.rewardSize || nightFactoryReward.minimumRequired || 5}/${nightFactoryReward.rewardSize || nightFactoryReward.minimumRequired || 5}` },
          { label: "Uso", value: "Diário" },
          { label: "Score", value: "Premium" },
        ],
      });
    }

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
    hbxActiveEngineLimit,
    hbxCapacityRunningCount,
    hbxCooldownCount,
    hbxEngineOnlineCount,
    hbxEngineTotal,
    hbxOperationalErrorCount,
    hostingerSummaryTile,
    hostingerVitals,
    hbxProcessedLast10Min,
    hbxRunningCount,
    hbxUsageAverage,
    incomingPopup,
    masterContextToast,
    nightFactoryReward,
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
  }, [billboardSlideSignature]);

  useEffect(() => {
    if (billboardPaused || billboardSlides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setBillboardSlideIndex((index) => (index + 1) % billboardSlides.length);
    }, 2600);

    return () => window.clearInterval(timer);
  }, [billboardPaused, billboardSlideSignature, billboardSlides.length]);

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
      qrRequested={whatsAppQrRequested}
      onClose={() => {
        setWhatsAppQrRequested(false);
        setWhatsAppDetailOpen(false);
      }}
      onFocusChange={(focus) => {
        setWhatsAppDetailFocus(focus);
        void loadWhatsAppCenter({ background: true });
        if (focus === "qr") {
          void loadWhatsAppModal({ includeQr: false });
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
  const displayLabel = displayName || user?.username || "";
  const hbxEngineSource = scrapingEngineView.hbxEngines.length
    ? scrapingEngineView.hbxEngines
    : Array.from({ length: visibleHbxEngineCount }, (_, index) => buildFallbackScrapingEngine(index));
  const hbxEngineGroupCount = Math.max(1, Math.ceil(hbxEngineSource.length / HBX_ENGINE_GROUP_SIZE));
  const hbxEngineGroups = Array.from({ length: hbxEngineGroupCount }, (_, groupIndex) => {
    const sourceEngines = scrapingEngineView.hbxEngines.length
      ? scrapingEngineView.hbxEngines
      : hbxEngineSource;
    const mainEngineMode = sourceEngines.length <= 4;
    const firstIndex = groupIndex * HBX_ENGINE_GROUP_SIZE + 1;
    const lastIndex = Math.min(sourceEngines.length, firstIndex + HBX_ENGINE_GROUP_SIZE - 1);
    const sourceMainEngine = sourceEngines[groupIndex] || buildFallbackScrapingEngine(groupIndex);
    const groupEngines = mainEngineMode
      ? Array.from({ length: HBX_ENGINE_GROUP_SIZE }, (_, childIndex) => buildSyntheticGroupChildEngine(sourceMainEngine, groupIndex, childIndex))
      : sourceEngines.slice(firstIndex - 1, lastIndex);
    const safeGroupEngines = groupEngines.length
      ? groupEngines
      : Array.from({ length: HBX_ENGINE_GROUP_SIZE }, (_, childIndex) => buildFallbackScrapingEngine(groupIndex * HBX_ENGINE_GROUP_SIZE + childIndex));
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
    const sparkSegments = safeGroupEngines.slice(0, HBX_ENGINE_GROUP_SIZE).map((engine, engineIndex) => {
      const engineUsage = getEngineUsage(engine);
      const engineState = getVisibleScrapingEngineState(engine);
      const active = engine.active || engine.busy || isLiveScrapingEngine(engine) || engineState === "busy" || engineState === "emergency";
      return buildEngineSparkSegment(engine, engineIndex, groupIndex, active, engineState, engineUsage, HBX_ENGINE_GROUP_SIZE);
    });
    while (sparkSegments.length < HBX_ENGINE_GROUP_SIZE) {
      const fallbackIndex = groupIndex * HBX_ENGINE_GROUP_SIZE + sparkSegments.length;
      const fallbackEngine = buildFallbackScrapingEngine(fallbackIndex);
      const fallbackUsage = getEngineUsage(fallbackEngine);
      sparkSegments.push(
        buildEngineSparkSegment(fallbackEngine, sparkSegments.length, groupIndex, false, getScrapingEngineState(fallbackEngine), fallbackUsage, HBX_ENGINE_GROUP_SIZE),
      );
    }
    const groupTone = getEngineUsageTone(usage, state);

    return {
      id: `hbx-group-${groupIndex + 1}`,
      label: `M${groupIndex + 1}`,
      range: `${firstIndex}-${lastIndex}`,
      state,
      stateLabel,
      usage,
      tone: groupTone,
      toneColor: getEngineToneColor(groupTone),
      onlineCount,
      runningCount,
      total: safeGroupEngines.length,
      sparkSegments,
    };
  });
  const hbxEngineGroupCards = hbxEngineGroups.map((group) => (
    <article
      key={group.id}
      className="hbx-command-engine"
      data-state={group.state}
      data-tone={group.tone}
      style={
        {
          ...getEngineGaugeStyle(group.usage),
          ["--engine-tone-color" as string]: group.toneColor,
        } as React.CSSProperties
      }
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
        <span
          className="hbx-command-engine__bars hbx-command-engine__spark"
          aria-hidden="true"
          style={{
            display: "block",
            flex: "1 1 auto",
            minWidth: 0,
            height: 58,
            padding: "0 2px",
            background: "transparent",
          }}
        >
          <svg
            viewBox={`0 0 ${HBX_ENGINE_SPARK_WIDTH} ${HBX_ENGINE_SPARK_HEIGHT}`}
            preserveAspectRatio="none"
            focusable="false"
            style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }}
          >
            <line x1="8" y1="49" x2="229" y2="49" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
            <line x1="8" y1="30" x2="229" y2="30" stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
            {group.sparkSegments.slice(0, -1).map((segment) => (
              <line
                key={`${segment.id}:separator`}
                x1={segment.separatorX}
                y1="10"
                x2={segment.separatorX}
                y2="51"
                stroke="currentColor"
                strokeOpacity="0.18"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
            ))}
            {group.sparkSegments.map((segment) => (
              <g key={segment.id}>
                <text
                  x={segment.centerX}
                  y="7"
                  textAnchor="middle"
                  fontSize="7"
                  fontWeight="700"
                  fill="currentColor"
                  fillOpacity="0.58"
                >
                  {segment.shortLabel}
                </text>
                <polygon points={segment.areaPoints} fill={segment.softColor} />
                <polyline
                  points={segment.points}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={segment.active ? "2.4" : "1.75"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={segment.state === "offline" || segment.state === "missing" ? "0.5" : "1"}
                />
              </g>
            ))}
          </svg>
        </span>
      </div>
      <div className="hbx-command-engine__dots" aria-hidden="true">
        {group.sparkSegments.map((segment) => (
          <i
            key={segment.id}
            data-state={segment.state}
            data-tone={segment.tone}
            data-active={segment.active ? "true" : "false"}
            style={{
              background: segment.color,
              boxShadow: segment.active ? `0 0 0 3px ${segment.softColor}, 0 0 12px ${segment.color}` : undefined,
              opacity: segment.state === "offline" || segment.state === "missing" ? 0.42 : 1,
            }}
            title={`${segment.label}: ${segment.usage}%`}
          />
        ))}
      </div>
    </article>
  ));
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
  const shouldShowTopbarWhatsAppAlert = Boolean(
    isAtendimentoRoute &&
      whatsAppLiveHealth.health &&
      (
        !whatsAppLiveHealth.health.liveConfirmed ||
        whatsAppLiveHealth.health.status !== "healthy" ||
        whatsAppLiveHealth.health.inboundStale
      ),
  );
  const topbarWhatsAppAlertTitle = whatsAppLiveHealth.health?.liveConfirmed
    ? "WhatsApp conectado, mas sem mensagens recentes no Atendimento."
    : "WhatsApp pode estar desconectado. Conversas podem não estar chegando.";
  const topbarWhatsAppAlertTone =
    whatsAppLiveHealth.health?.status === "disconnected" || whatsAppLiveHealth.health?.status === "error"
      ? "danger"
      : "warning";
  if (hiddenRoutes.has(pathname)) {
    return null;
  }

  return (
    <header className={`app-topbar${topbarHiddenByScroll ? " app-topbar--hidden" : ""}`}>
      <style>{HBX_TOPBAR_POLISH_CSS}</style>
      <div ref={topbarFrameRef} className="app-topbar__frame">
        {shouldShowTopbarWhatsAppAlert ? (
          <div className="hbx-whatsapp-live-alert" data-tone={topbarWhatsAppAlertTone}>
            <span className="hbx-whatsapp-live-alert__text">
              <strong>{topbarWhatsAppAlertTitle}</strong>
              <span>
                {whatsAppLiveHealth.health
                  ? `${formatWhatsAppLiveHealthStatus(whatsAppLiveHealth.health.status)}: ${whatsAppLiveHealth.health.reason}`
                  : "Sem confirmação viva do provider."}
              </span>
            </span>
            <span className="hbx-whatsapp-live-alert__actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void whatsAppLiveHealth.refresh(true)}>
                Revalidar agora
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push("/whatsapp?focus=qr")}>
                Abrir QR
              </button>
            </span>
          </div>
        ) : null}
        <div className="app-topbar__inner app-topbar__inner--controlCenter">
          <section className="hbx-command-brand" aria-label="HBXSYSTEM">
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
              <strong>HBXSYSTEM</strong>
              <span>Central operacional</span>
            </div>
          </section>

          <section
            className="hbx-command-center"
            data-active={hasActiveScrapingEngine ? "true" : "false"}
            data-live={liveWebscrapingProgress ? "true" : "false"}
            aria-label="Status operacional HBX"
          >
            {billboardSlides.length > 1 ? (
              <button
                type="button"
                className="hbx-command-carouselNav hbx-command-carouselNav--prev"
                aria-label="Voltar slide operacional"
                title="Voltar"
                onMouseEnter={() => setBillboardPaused(true)}
                onMouseLeave={() => setBillboardPaused(false)}
                onClick={(event) => {
                  event.stopPropagation();
                  setBillboardSlideIndex((index) => (index - 1 + billboardSlides.length) % billboardSlides.length);
                }}
              >
                ‹
              </button>
            ) : null}
            {billboardSlides.length > 1 ? (
              <button
                type="button"
                className="hbx-command-carouselNav hbx-command-carouselNav--next"
                aria-label="Avançar slide operacional"
                title="Avançar"
                onMouseEnter={() => setBillboardPaused(true)}
                onMouseLeave={() => setBillboardPaused(false)}
                onClick={(event) => {
                  event.stopPropagation();
                  setBillboardSlideIndex((index) => (index + 1) % billboardSlides.length);
                }}
              >
                ›
              </button>
            ) : null}
                        <div className="hbx-command-center__body">
              <TopbarCommandCarousel
                slides={billboardSlides}
                engineCards={hbxEngineGroupCards}
onNavigate={(href) => router.push(href)}
              />
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
