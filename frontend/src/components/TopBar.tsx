"use client";
import Link from "next/link";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import {
  bootstrapWhatsAppAfterConnect,
  buildWhatsAppBootstrapKey,
} from "@/lib/whatsapp-connection-flow";
import { useWhatsAppLiveHealth } from "@/lib/useWhatsAppLiveHealth";
import {
  MASTER_CONTEXT_CHANGED_EVENT,
  dispatchMasterContextChanged,
  type MasterContextChangedDetail,
} from "../lib/masterContextEvents";
import {
  clearStoredRadarRun,
  isRadarRunNotFoundError,
  isRadarRunNotFoundPayload,
  isTerminalRadarRunStatus,
  readStoredRadarRun,
  subscribeStoredRadarRun,
  type StoredRadarRun,
} from "@/lib/radar-active-run";
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
    mode: "master_puro" | "empresa_assumida" | "master_operacional";
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
    mode: "empresa" | "master_assumido" | "master_puro" | "master_operacional" | "sem_empresa";
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
  noticeId?: string;
  href?: string;
};
type TopBarMasterNotice = {
  id: string;
  title: string;
  body: string;
  tone?: string | null;
  createdAt?: string | null;
  acknowledged?: boolean | null;
};
type TopBarMasterNoticeListResponse = {
  notices?: TopBarMasterNotice[];
};

function extractSellerEmailFromNotice(notice: TopBarMasterNotice) {
  const text = `${notice.title || ""} ${notice.body || ""}`;
  const match = /E-mail:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.exec(text);
  return match?.[1]?.trim().toLowerCase() || "";
}

function buildHeaderMasterNoticeHref(notice: TopBarMasterNotice) {
  const title = String(notice.title || "").toLowerCase();
  const body = String(notice.body || "").toLowerCase();
  const isSellerDocumentsNotice =
    title.includes("documentos confirmados") ||
    body.includes("documentos obrigatórios do cadastro hbx") ||
    body.includes("documentos obrigatorios do cadastro hbx");

  if (!isSellerDocumentsNotice) return "/gerencial";

  const params = new URLSearchParams({
    tab: "equipe",
    noticeKind: "seller-documents-confirmed",
    noticeId: String(notice.id || ""),
  });
  const sellerEmail = extractSellerEmailFromNotice(notice);
  if (sellerEmail) params.set("sellerEmail", sellerEmail);
  return `/gerencial?${params.toString()}`;
}
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
  kind?: "status" | "engines" | "whatsapp" | "attention";
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

type RadarTopbarViewState = "running" | "paused" | "stopped";

type TopbarSignalTone = "success" | "warning" | "danger" | "neutral" | "loading";
type TopbarOperationalTile = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: TopbarSignalTone;
  usage?: number | null;
};

type RadarTopbarRunResponse = {
  id?: string | null;
  runId?: string | null;
  status?: string | null;
  targetQuantity?: number | null;
  foundCount?: number | null;
  meta?: {
    requestedQuantity?: number | null;
    deliveredCount?: number | null;
    filters?: {
      state?: string | null;
      city?: string | null;
      segment?: string | null;
    } | null;
  } | null;
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

const hiddenRoutes = new Set(["/", "/login", "/register", "/reset-password", "/confirm-email", "/hbx-vendedor/onboarding", "/boasvindas", "/tutorial", "/pre-checkout", "/precheckout"]);
const SCRAPING_ENGINE_POLL_MS = 5000;
const TOPBAR_FALLBACK_HBX_ENGINE_COUNT = 4;
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

function getEngineUsage(engine: ScrapingEngineStatus) {
  const usage = Number(engine.usagePercent);
  return Number.isFinite(usage) ? Math.max(0, Math.min(100, Math.round(usage))) : engine.active ? 82 : 8;
}

function clampTopbarPercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

type HbxHeaderIconName = "memory" | "cpu" | "disk" | "logout" | "context" | "chevron" | "metric";

function HbxHeaderIcon({ name }: { name: HbxHeaderIconName }) {
  if (name === "logout") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4.75H5.75A1.75 1.75 0 0 0 4 6.5v11A1.75 1.75 0 0 0 5.75 19.25H9" />
        <path d="M14.75 7.75 19 12l-4.25 4.25" />
        <path d="M19 12H9" />
      </svg>
    );
  }

  if (name === "context") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
        <path d="M6.25 18.5a5.75 5.75 0 0 1 11.5 0" />
        <path d="M5.5 8.5h2.25M16.25 8.5h2.25M12 2.75V4.5M12 19.5v1.75" />
      </svg>
    );
  }

  if (name === "chevron") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    );
  }

  if (name === "cpu") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M9.5 2.75v2.5M14.5 2.75v2.5M9.5 18.75v2.5M14.5 18.75v2.5M2.75 9.5h2.5M2.75 14.5h2.5M18.75 9.5h2.5M18.75 14.5h2.5" />
      </svg>
    );
  }

  if (name === "disk") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.75h8.25L19 7.5v12.75H5V3.75h2Z" />
        <path d="M8 3.75v5.5h7.75M8 16.5h8M8 19h8" />
      </svg>
    );
  }

  if (name === "memory") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="4.75" width="8" height="14.5" rx="1.8" />
        <path d="M5.25 7.5H8M5.25 12H8M5.25 16.5H8M16 7.5h2.75M16 12h2.75M16 16.5h2.75M10.5 8.25h3M10.5 12h3M10.5 15.75h3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="3" />
      <path d="M9.5 12h5" />
    </svg>
  );
}

function getTopbarMetricIcon(label: string): HbxHeaderIconName {
  const normalized = label.toLowerCase();
  if (normalized.includes("mem")) return "memory";
  if (normalized.includes("cpu") || normalized.includes("fila") || normalized.includes("rodando")) return "cpu";
  if (normalized.includes("hd") || normalized.includes("disco")) return "disk";
  return "metric";
}

function getRadarTopbarViewState(status: string, active: boolean): RadarTopbarViewState {
  const normalized = String(status || "").trim().toLowerCase();
  if (!active) return "stopped";
  if (["queued", "running", "pending", "processing"].includes(normalized)) return "running";
  return "paused";
}

function TopbarCenterSummary({
  slide,
  onAction,
  actions,
}: {
  slide: BillboardSlide;
  onAction: (slide: BillboardSlide) => void;
  actions?: React.ReactNode;
}) {
  const progress = typeof slide.progress === "number" ? clampTopbarPercent(slide.progress) : null;
  const metrics = (slide.metrics || []).slice(0, 3);
  const canNavigate = Boolean(slide.href || slide.source);

  return (
    <div
      role={canNavigate ? "button" : undefined}
      tabIndex={canNavigate ? 0 : -1}
      className="hbx-module-summary"
      data-phase={slide.phase}
      onClick={() => {
        if (canNavigate) onAction(slide);
      }}
      onKeyDown={(event) => {
        if (!canNavigate) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onAction(slide);
        }
      }}
      aria-disabled={canNavigate ? undefined : true}
      aria-label={`${slide.eyebrow}: ${slide.title}. ${slide.description}`}
    >
      <span className="hbx-module-summary__copy">
        <span className="hbx-module-summary__eyebrow">
          <i aria-hidden="true" />
          {slide.eyebrow}
        </span>
        <strong>{slide.title}</strong>
        <span className="hbx-module-summary__description">{slide.description}</span>
        <span className="hbx-module-summary__pulse" aria-hidden="true">
          <svg viewBox="0 0 190 24" preserveAspectRatio="none">
            <path d="M0 14H55L59 6L64 19L70 14H94L99 10L104 16L110 14H190" />
          </svg>
          <b />
        </span>
      </span>

      {actions ? (
        <span className="hbx-module-summary__metrics hbx-module-summary__metrics--actions" onClick={(event) => event.stopPropagation()}>
          {actions}
        </span>
      ) : (
        <span className="hbx-module-summary__metrics">
          {metrics.map((metric) => (
            <span key={`${metric.label}:${metric.value}`} className="hbx-module-summary__metric">
              <span className="hbx-module-summary__metricIcon">
                <HbxHeaderIcon name={getTopbarMetricIcon(metric.label)} />
              </span>
              <span>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </span>
            </span>
          ))}
        </span>
      )}

      {progress !== null ? (
        <span
          className="hbx-module-summary__ring"
          style={{ ["--topbar-progress" as string]: `${progress}%` } as React.CSSProperties}
          aria-label={`${progress}%`}
        >
          <strong>{progress}%</strong>
        </span>
      ) : null}
    </div>
  );
}

const HBX_TOPBAR_POLISH_CSS = `
  .app-topbar,
  .app-topbar__frame,
  .app-topbar__inner--controlCenter {
    overflow: visible;
  }

  .app-topbar__inner--controlCenter {
    --hbx-header-glow-primary: var(--hbx-header-next-primary, var(--selection-accent-soft, rgba(16, 185, 129, 0.12)));
    --hbx-header-glow-secondary: var(--hbx-header-next-secondary, color-mix(in srgb, var(--button-secondary, #0ea5e9) 10%, transparent));
    --hbx-header-glow-accent: var(--hbx-header-next-accent, color-mix(in srgb, var(--button-accent, #0ea5e9) 10%, transparent));
    display: grid;
    grid-template-columns: minmax(238px, 284px) minmax(0, 1fr) minmax(220px, 274px);
    align-items: stretch;
    gap: 6px;
    padding: 8px;
    border: 1px solid color-mix(in srgb, var(--brand, #10b981) 22%, var(--line, rgba(148, 163, 184, 0.22)));
    border-radius: calc(var(--panel-radius, 22px) + 4px);
    background:
      radial-gradient(circle at 16% 0%, var(--hbx-header-glow-primary), transparent 34%),
      radial-gradient(circle at 58% 6%, var(--hbx-header-glow-secondary), transparent 32%),
      radial-gradient(circle at 92% 0%, var(--hbx-header-glow-accent), transparent 30%),
      linear-gradient(135deg, var(--header-surface, var(--surface, #ffffff)), var(--surface-soft, #f8fafc));
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--brand, #10b981) 10%, transparent),
      var(--shadow-sm, 0 18px 42px -24px rgba(15, 23, 42, 0.26));
    transition:
      border-color 740ms cubic-bezier(.2, .78, .2, 1),
      box-shadow 740ms cubic-bezier(.2, .78, .2, 1),
      filter 740ms cubic-bezier(.2, .78, .2, 1);
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
    background:
      radial-gradient(circle at 12% 0%, var(--hbx-header-glow-primary, transparent), transparent 42%),
      linear-gradient(180deg, color-mix(in srgb, var(--surface-raised, #fff) 94%, transparent), color-mix(in srgb, var(--surface-soft, #f8fafc) 92%, transparent));
    box-shadow: var(--shadow-xs, 0 12px 24px -18px rgba(15, 23, 42, 0.22));
    transition:
      background 740ms cubic-bezier(.2, .78, .2, 1),
      border-color 740ms cubic-bezier(.2, .78, .2, 1),
      box-shadow 740ms cubic-bezier(.2, .78, .2, 1);
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
    --hbx-mark-primary: var(--hbx-brand-mark-next-primary, var(--brand, #10b981));
    --hbx-mark-secondary: var(--hbx-brand-mark-next-secondary, var(--button-secondary, #0ea5e9));
    --hbx-mark-accent: var(--hbx-brand-mark-next-accent, var(--button-accent, #0ea5e9));
    --hbx-mark-soft: var(--hbx-brand-mark-next-soft, var(--selection-accent-soft, rgba(16, 185, 129, 0.18)));
    width: 52px;
    height: 52px;
    border: 0;
    border-radius: 18px;
    display: grid;
    place-items: center;
    color: var(--brand-contrast, #fff);
    background:
      radial-gradient(circle at 30% 20%, rgba(255,255,255,.34), transparent 30%),
      linear-gradient(135deg, var(--hbx-mark-primary), var(--hbx-mark-accent));
    box-shadow: 0 16px 34px -22px var(--hbx-mark-primary);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .02em;
    cursor: pointer;
    position: relative;
    isolation: isolate;
    overflow: hidden;
    transition:
      transform 640ms cubic-bezier(.18, .82, .18, 1),
      box-shadow 920ms cubic-bezier(.18, .82, .18, 1),
      filter 920ms cubic-bezier(.18, .82, .18, 1);
  }

  .hbx-command-brand__mark::before,
  .hbx-command-brand__mark::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 0;
  }

  .hbx-command-brand__mark::before {
    background:
      radial-gradient(circle at 22% 18%, rgba(255, 255, 255, 0.64), transparent 19%),
      radial-gradient(circle at 74% 82%, color-mix(in srgb, var(--hbx-mark-secondary) 62%, transparent), transparent 36%),
      linear-gradient(145deg, var(--hbx-mark-primary), color-mix(in srgb, var(--hbx-mark-primary) 34%, #020617) 72%);
    opacity: 0;
    transform: scale(0.42) translate(-18%, 14%);
  }

  .hbx-command-brand__mark::after {
    background:
      radial-gradient(circle at 38% 18%, rgba(255, 255, 255, 0.62), transparent 13%),
      radial-gradient(circle at 50% 52%, rgba(255, 255, 255, 0.2), transparent 38%),
      linear-gradient(105deg, transparent 0 30%, rgba(255, 255, 255, 0.28) 42%, transparent 58% 100%);
    mix-blend-mode: screen;
    opacity: 0.22;
    transform: translateX(-18%) rotate(-8deg);
  }

  .hbx-command-brand__mark span {
    position: absolute;
    inset: 8px;
    border: 1px solid rgba(255,255,255,.42);
    border-radius: 14px;
    pointer-events: none;
    z-index: 1;
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

  .hbx-module-summary__metrics--actions {
    display: inline-grid;
    grid-template-columns: repeat(3, 38px);
    align-content: center;
    align-items: center;
    gap: 8px;
  }

  .hbx-module-summary__metrics--actions button {
    --radar-action-tone: var(--button-secondary, #009FD9);
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--radar-action-tone) 34%, var(--line, rgba(148,163,184,.34)));
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface, #fff) 88%, var(--radar-action-tone) 12%);
    color: color-mix(in srgb, var(--radar-action-tone) 82%, var(--foreground, #0f172a));
    font: inherit;
    font-size: 12px;
    font-weight: 850;
    line-height: 1;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
  }

  .hbx-module-summary__metrics--actions button[data-radar-action="play"] {
    --radar-action-tone: var(--button-secondary, #009FD9);
  }

  .hbx-module-summary__metrics--actions button[data-radar-action="pause"] {
    --radar-action-tone: var(--warning, #b45309);
  }

  .hbx-module-summary__metrics--actions button[data-radar-action="stop"] {
    --radar-action-tone: var(--danger, #ef4444);
  }

  .hbx-module-summary__metrics--actions button[data-active="true"] {
    border-color: color-mix(in srgb, var(--radar-action-tone) 68%, var(--line, rgba(148,163,184,.34)));
    background:
      radial-gradient(circle at 34% 18%, color-mix(in srgb, white 56%, transparent), transparent 34%),
      linear-gradient(145deg, color-mix(in srgb, var(--radar-action-tone) 92%, white), var(--radar-action-tone));
    color: #fff;
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--radar-action-tone) 18%, transparent),
      0 14px 26px -18px color-mix(in srgb, var(--radar-action-tone) 88%, transparent);
  }

  .hbx-module-summary__metrics--actions button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--radar-action-tone) 14%, transparent),
      0 13px 23px -18px color-mix(in srgb, var(--radar-action-tone) 90%, transparent);
  }

  .hbx-module-summary__metrics--actions button:disabled {
    cursor: wait;
    opacity: .62;
  }

  html[data-theme-mode="dark"] .hbx-module-summary__metrics--actions button {
    border-color: color-mix(in srgb, var(--radar-action-tone) 32%, rgba(96, 165, 250, .18));
    background: color-mix(in srgb, rgba(15, 33, 62, .86) 84%, var(--radar-action-tone) 16%);
    color: color-mix(in srgb, var(--radar-action-tone) 66%, #dbeafe);
  }

  html[data-theme-mode="dark"] .hbx-module-summary__metrics--actions button[data-active="true"] {
    border-color: color-mix(in srgb, var(--radar-action-tone) 72%, rgba(96, 165, 250, .18));
    background:
      radial-gradient(circle at 34% 18%, rgba(255,255,255,.32), transparent 34%),
      linear-gradient(145deg, color-mix(in srgb, var(--radar-action-tone) 86%, white), var(--radar-action-tone));
    color: #fff;
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
  .hbx-control-user__trigger, .hbx-control-logout, .hbx-control-navMode, .hbx-control-masterActions .btn, .hbx-control-vitals span { min-height: 34px; border-radius: 999px; border: 1px solid var(--line, rgba(148,163,184,.2)); background: color-mix(in srgb, var(--surface-raised, #fff) 92%, transparent); color: var(--foreground, #0f172a); box-shadow: var(--shadow-inset, inset 0 1px 0 rgba(255,255,255,.72)); }
  .hbx-control-user__trigger { width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; align-items: center; padding: 3px 10px 3px 4px; }
  .hbx-control-user .app-user__avatar { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 999px; color: var(--brand-contrast, #fff); background: linear-gradient(135deg, var(--brand, #10b981), var(--button-accent, #0ea5e9)); font-size: 12px; font-weight: 950; }
  .hbx-control-user .app-user__meta { min-width: 0; display: grid; text-align: left; }
  .hbx-control-user .app-user__name, .hbx-control-user .app-user__company { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hbx-control-user .app-user__name { color: var(--foreground, #0f172a); font-size: 12px; font-weight: 900; }
  .hbx-control-user .app-user__company { color: var(--muted, #64748b); font-size: 10px; font-weight: 700; }
  .hbx-control-logout { display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; font-size: 11px; font-weight: 900; text-decoration: none; }
  .hbx-control-navMode { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; font-size: 11px; font-weight: 950; }
  .hbx-control-navMode span { width: 18px; height: 18px; display: grid; place-items: center; border-radius: 999px; background: color-mix(in srgb, var(--button-accent, #0284c7) 14%, transparent); color: color-mix(in srgb, var(--button-accent, #0284c7) 82%, var(--foreground, #0f172a)); font-size: 15px; line-height: 1; }
  .hbx-control-masterActions .btn { padding: 0 12px; font-size: 11px; font-weight: 900; }
  .hbx-control-vitals span { display: inline-grid; align-content: center; padding: 4px 10px; color: var(--muted, #64748b); font-size: 9px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
  .hbx-control-vitals strong { color: var(--foreground, #0f172a); font-size: 12px; letter-spacing: -0.02em; }
  .hbx-control-vitals span[data-tone="green"] strong, .hbx-control-vitals span[data-tone="success"] strong { color: var(--success, #10b981); }
  .hbx-control-vitals span[data-tone="yellow"] strong, .hbx-control-vitals span[data-tone="warning"] strong { color: var(--button-secondary, var(--selection-accent, var(--brand, #10b981))); }
  .hbx-control-vitals span[data-tone="red"] strong, .hbx-control-vitals span[data-tone="danger"] strong { color: var(--danger, #ef4444); }
  .hbx-control-user .app-user__menu { right: 0; left: auto; width: min(320px, calc(100vw - 24px)); border: 1px solid var(--line, rgba(148,163,184,.2)); background: var(--surface-raised, #fff); color: var(--foreground, #0f172a); box-shadow: var(--shadow-md, 0 30px 72px -32px rgba(15,23,42,.38)); }

  @keyframes hbxBrandMarkLiquidFill {
    0% {
      opacity: 0;
      transform: scale(0.22) translate(-28%, 22%);
      filter: blur(4px);
    }
    38% {
      opacity: 0.86;
      transform: scale(1.32) translate(5%, -4%);
      filter: blur(0.5px);
    }
    68% {
      opacity: 1;
      transform: scale(0.92) translate(-1%, 1%);
      filter: blur(0);
    }
    100% {
      opacity: 1;
      transform: scale(1) translate(0, 0);
      filter: blur(0);
    }
  }

  @keyframes hbxBrandMarkCrystalSweep {
    0% {
      opacity: 0;
      transform: translateX(-86%) rotate(-10deg) scaleX(0.64);
    }
    46% {
      opacity: 0.72;
    }
    100% {
      opacity: 0.3;
      transform: translateX(56%) rotate(-10deg) scaleX(1.14);
    }
  }

  @keyframes hbxBrandMarkPulse {
    0%, 100% {
      transform: translateY(0) scale(1);
    }
    24% {
      transform: translateY(-3px) scale(1.16);
      box-shadow:
        0 0 0 7px color-mix(in srgb, var(--brand, #10b981) 28%, transparent),
        0 0 0 22px color-mix(in srgb, var(--button-secondary, #0ea5e9) 20%, transparent),
        0 0 44px color-mix(in srgb, var(--button-accent, #0ea5e9) 42%, transparent),
        0 30px 56px -18px color-mix(in srgb, var(--brand, #10b981) 86%, transparent);
    }
    52% {
      transform: translateY(1px) scale(0.94);
      box-shadow:
        0 0 0 2px color-mix(in srgb, var(--brand, #10b981) 22%, transparent),
        0 0 0 9px color-mix(in srgb, var(--button-secondary, #0ea5e9) 12%, transparent),
        0 16px 32px -22px color-mix(in srgb, var(--brand, #10b981) 76%, transparent);
    }
    78% {
      transform: translateY(-1px) scale(1.055);
      box-shadow:
        0 0 0 4px color-mix(in srgb, var(--brand, #10b981) 22%, transparent),
        0 0 0 15px color-mix(in srgb, var(--button-secondary, #0ea5e9) 14%, transparent),
        0 22px 42px -20px color-mix(in srgb, var(--brand, #10b981) 80%, transparent);
    }
  }

  @keyframes hbxHeaderAccentPulse {
    0%, 100% {
      opacity: 1;
      transform: translateY(-50%) scale(1);
    }
    46% {
      opacity: 0.82;
      transform: translateY(-50%) scale(1.5);
    }
  }

  @keyframes hbxHeaderPulse {
    0%, 100% {
      filter: saturate(1) brightness(1);
    }
    32% {
      filter: saturate(1.18) brightness(1.035);
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--brand, #10b981) 16%, transparent),
        0 0 52px color-mix(in srgb, var(--button-secondary, #0ea5e9) 16%, transparent),
        0 24px 58px -34px rgba(15, 23, 42, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.82);
    }
    58% {
      filter: saturate(0.96) brightness(0.99);
    }
    78% {
      filter: saturate(1.08) brightness(1.015);
    }
  }

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

  .app-topbar {
    padding-top: 6px !important;
  }

  .app-topbar__frame {
    --hbx-header-glow-primary: var(--hbx-header-next-primary, color-mix(in srgb, var(--button-accent, #0ea5e9) 14%, transparent));
    --hbx-header-glow-secondary: var(--hbx-header-next-secondary, color-mix(in srgb, var(--success, #10b981) 10%, transparent));
    --hbx-header-glow-accent: var(--hbx-header-next-accent, color-mix(in srgb, var(--brand, #245cff) 8%, transparent));
    min-height: 96px !important;
    border-radius: 30px !important;
    overflow: visible !important;
    border: 1px solid color-mix(in srgb, var(--brand, #0ea5e9) 26%, var(--line, rgba(148, 163, 184, 0.28))) !important;
    background:
      radial-gradient(circle at 14% 18%, var(--hbx-header-glow-primary), transparent 30%),
      radial-gradient(circle at 52% 8%, var(--hbx-header-glow-secondary), transparent 30%),
      radial-gradient(circle at 88% 16%, var(--hbx-header-glow-accent), transparent 28%),
      linear-gradient(135deg, color-mix(in srgb, var(--header-surface, #ffffff) 92%, transparent), color-mix(in srgb, var(--surface-soft, #eef8ff) 66%, var(--surface, #ffffff))) !important;
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--brand, #38bdf8) 12%, transparent),
      0 20px 48px -34px rgba(15, 23, 42, 0.34),
      inset 0 1px 0 rgba(255, 255, 255, 0.78) !important;
    transition:
      border-color 980ms cubic-bezier(.16, .86, .18, 1),
      box-shadow 980ms cubic-bezier(.16, .86, .18, 1),
      filter 980ms cubic-bezier(.16, .86, .18, 1);
  }

  .app-topbar__inner--controlCenter {
    min-height: 92px !important;
    height: auto !important;
    grid-template-columns: minmax(260px, 320px) minmax(430px, 1fr) minmax(430px, 520px) !important;
    align-items: center !important;
    gap: 16px !important;
    padding: 10px 18px !important;
    border: 0 !important;
    border-radius: 28px !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .hbx-command-brand {
    height: 74px !important;
    min-height: 74px !important;
    grid-template-columns: 62px minmax(0, 1fr) !important;
    gap: 14px !important;
    align-items: center !important;
    padding: 0 26px 0 8px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    position: relative !important;
  }

  .hbx-command-brand::after {
    content: "";
    position: absolute;
    right: 0;
    top: 9px;
    bottom: 9px;
    width: 1px;
    background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--brand, #38bdf8) 52%, transparent), transparent);
  }

  .hbx-command-brand::before {
    content: "";
    position: absolute;
    right: -3px;
    top: 50%;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--button-secondary, #67e8f9) 84%, #ffffff);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--button-secondary, #67e8f9) 18%, transparent),
      0 0 18px color-mix(in srgb, var(--button-secondary, #22d3ee) 86%, transparent);
    transform: translateY(-50%);
  }

  .hbx-command-brand__mark {
    width: 62px !important;
    height: 62px !important;
    border-radius: 999px !important;
    color: #ffffff !important;
    background:
      radial-gradient(circle at 28% 18%, rgba(255, 255, 255, 0.5), transparent 20%),
      radial-gradient(circle at 72% 84%, color-mix(in srgb, var(--hbx-mark-secondary) 58%, transparent), transparent 34%),
      linear-gradient(145deg, var(--hbx-mark-primary) 0%, color-mix(in srgb, var(--hbx-mark-primary) 32%, #020617) 72%) !important;
    box-shadow:
      0 0 0 3px var(--hbx-mark-soft),
      0 0 0 8px color-mix(in srgb, var(--hbx-mark-secondary) 12%, transparent),
      0 18px 30px -20px color-mix(in srgb, var(--hbx-mark-primary) 92%, transparent) !important;
    font-size: 13px !important;
    letter-spacing: 0 !important;
  }

  .hbx-command-brand__mark span {
    inset: 8px !important;
    border-radius: 999px !important;
    border-color: rgba(255, 255, 255, 0.36) !important;
  }

  html[data-hbx-brand-mark-transitioning="true"] .hbx-command-brand__mark {
    transform: translateY(-2px) scale(1.075);
    filter: saturate(1.34) brightness(1.08);
    box-shadow:
      0 0 0 5px var(--hbx-mark-soft),
      0 0 0 16px color-mix(in srgb, var(--hbx-mark-secondary) 18%, transparent),
      0 0 32px color-mix(in srgb, var(--hbx-mark-accent) 34%, transparent),
      0 24px 48px -18px color-mix(in srgb, var(--hbx-mark-primary) 90%, transparent) !important;
  }

  html[data-hbx-brand-mark-transitioning="true"] .app-topbar__frame {
    filter: saturate(1.12) brightness(1.02);
    border-color: color-mix(in srgb, var(--hbx-mark-primary) 42%, var(--line, rgba(148, 163, 184, 0.28))) !important;
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--hbx-mark-primary) 18%, transparent),
      0 0 38px color-mix(in srgb, var(--hbx-mark-secondary) 16%, transparent),
      0 22px 54px -34px rgba(15, 23, 42, 0.38),
      inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
  }

  html[data-hbx-brand-mark-transitioning="true"] .hbx-command-brand::after,
  html[data-hbx-brand-mark-transitioning="true"] .hbx-command-brand::before {
    animation: hbxHeaderAccentPulse 980ms cubic-bezier(.16, .86, .18, 1) both;
  }

  html[data-hbx-brand-mark-transitioning="true"] .hbx-command-brand__mark::before {
    animation: hbxBrandMarkLiquidFill 980ms cubic-bezier(.16, .86, .18, 1) both;
  }

  html[data-hbx-brand-mark-transitioning="true"] .hbx-command-brand__mark::after {
    animation: hbxBrandMarkCrystalSweep 980ms cubic-bezier(.16, .86, .18, 1) both;
  }

  html[data-hbx-brand-mark-pulse="true"] .hbx-command-brand__mark {
    animation: hbxBrandMarkPulse 1120ms cubic-bezier(.16, .86, .18, 1) both;
  }

  html[data-hbx-brand-mark-pulse="true"] .app-topbar__frame {
    animation: hbxHeaderPulse 1120ms cubic-bezier(.16, .86, .18, 1) both;
  }

  .hbx-command-brand__copy strong {
    font-size: 16px !important;
    line-height: 1 !important;
    letter-spacing: -0.02em !important;
  }

  .hbx-command-brand__copy span {
    margin-top: 3px !important;
    color: color-mix(in srgb, var(--button-accent, #0369a1) 56%, var(--muted, #64748b)) !important;
    font-size: 10px !important;
    letter-spacing: 0.055em !important;
  }

  .hbx-command-center {
    height: 74px !important;
    min-height: 74px !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    z-index: 12 !important;
  }

  .hbx-command-center::before,
  .hbx-command-center::after {
    display: none !important;
  }

  .hbx-command-center__body {
    height: 74px !important;
    min-height: 74px !important;
  }

  .hbx-module-summary {
    width: 100%;
    height: 74px;
    display: grid;
    grid-template-columns: minmax(170px, 1fr) minmax(220px, 360px) 58px;
    align-items: center;
    gap: 14px;
    padding: 8px 16px 8px 20px;
    border: 1px solid color-mix(in srgb, var(--button-accent, #38bdf8) 22%, rgba(148, 163, 184, 0.26));
    border-radius: 20px;
    background:
      radial-gradient(circle at 18% 12%, rgba(125, 211, 252, 0.2), transparent 36%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.78), color-mix(in srgb, var(--surface-soft, #f8fafc) 86%, transparent));
    color: var(--foreground, #0f172a);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 18px 40px -32px rgba(15, 23, 42, 0.36);
    cursor: pointer;
    overflow: visible;
    text-align: left;
  }

  .hbx-module-summary:disabled {
    cursor: default;
  }

  .hbx-module-summary[aria-disabled="true"] {
    cursor: default;
  }

  .hbx-module-summary__copy,
  .hbx-module-summary__metric,
  .hbx-module-summary__metric > span:last-child {
    min-width: 0;
  }

  .hbx-module-summary__copy {
    display: grid;
    gap: 2px;
  }

  .hbx-module-summary__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: color-mix(in srgb, var(--success, #10b981) 72%, #075985);
    font-size: 10px;
    font-weight: 950;
    line-height: 1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .hbx-module-summary__eyebrow i {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--success, #10b981);
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.12), 0 0 14px rgba(16, 185, 129, 0.72);
    animation: hbxHeaderDot 1.7s ease-in-out infinite;
  }

  .hbx-module-summary[data-phase="warning"] .hbx-module-summary__eyebrow {
    color: var(--warning, #b45309);
  }

  .hbx-module-summary[data-phase="warning"] .hbx-module-summary__eyebrow i {
    background: var(--warning, #b45309);
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--warning, #b45309) 14%, transparent),
      0 0 14px color-mix(in srgb, var(--warning, #b45309) 74%, transparent);
  }

  .hbx-module-summary[data-phase="idle"] .hbx-module-summary__eyebrow {
    color: var(--danger, #ef4444);
  }

  .hbx-module-summary[data-phase="idle"] .hbx-module-summary__eyebrow i {
    background: var(--danger, #ef4444);
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--danger, #ef4444) 14%, transparent),
      0 0 14px color-mix(in srgb, var(--danger, #ef4444) 72%, transparent);
  }

  .hbx-module-summary__copy > strong {
    display: block;
    color: var(--foreground, #0f172a);
    font-size: 22px;
    font-weight: 950;
    line-height: 1.02;
    letter-spacing: -0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbx-module-summary__description {
    display: block;
    max-width: 100%;
    color: color-mix(in srgb, var(--foreground-soft, #475569) 86%, var(--button-accent, #0284c7));
    font-size: 10.5px;
    font-weight: 780;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbx-module-summary__pulse {
    position: relative;
    width: min(156px, 100%);
    height: 15px;
    margin-top: 1px;
    color: color-mix(in srgb, var(--success, #10b981) 70%, #67e8f9);
    opacity: 0.84;
  }

  .hbx-module-summary__pulse svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  .hbx-module-summary__pulse path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 210;
    animation: hbxHeaderPulseLine 2.4s linear infinite;
    filter: drop-shadow(0 0 5px rgba(45, 212, 191, 0.55));
  }

  .hbx-module-summary__pulse b {
    position: absolute;
    right: -3px;
    top: 50%;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: currentColor;
    box-shadow: 0 0 12px currentColor;
    transform: translateY(-50%);
    animation: hbxHeaderDot 1.2s ease-in-out infinite;
  }

  .hbx-module-summary__metrics {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .hbx-module-summary__metric {
    height: 48px;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 5px 9px;
    border: 1px solid color-mix(in srgb, var(--button-accent, #38bdf8) 22%, rgba(148, 163, 184, 0.22));
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(241, 248, 252, 0.64));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 12px 24px -24px rgba(15, 23, 42, 0.42);
  }

  .hbx-module-summary__metricIcon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: #ffffff;
    background: linear-gradient(145deg, #06b6d4, #0284c7);
    box-shadow: 0 10px 20px -16px rgba(2, 132, 199, 0.95);
  }

  .hbx-module-summary__metricIcon svg,
  .hbx-control-logout svg,
  .hbx-control-contextButton svg,
  .hbx-control-user__chevron svg {
    width: 17px;
    height: 17px;
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .hbx-module-summary__metric small,
  .hbx-module-summary__metric strong {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbx-module-summary__metric small {
    color: var(--muted, #64748b);
    font-size: 9px;
    font-weight: 950;
    line-height: 1;
    letter-spacing: 0.035em;
    text-transform: uppercase;
  }

  .hbx-module-summary__metric strong {
    margin-top: 3px;
    color: var(--foreground, #0f172a);
    font-size: 16px;
    font-weight: 950;
    line-height: 1;
    letter-spacing: -0.025em;
  }

  .hbx-module-summary__ring {
    --topbar-ring-color: var(--success, #10b981);
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background:
      radial-gradient(circle, color-mix(in srgb, var(--surface, #ffffff) 92%, transparent) 56%, transparent 58%),
      conic-gradient(var(--topbar-ring-color) var(--topbar-progress, 0%), rgba(148, 163, 184, 0.18) 0);
    box-shadow:
      inset 0 0 0 7px rgba(255, 255, 255, 0.72),
      0 0 0 7px color-mix(in srgb, var(--topbar-ring-color) 10%, transparent),
      0 14px 22px -18px color-mix(in srgb, var(--topbar-ring-color) 90%, transparent);
  }

  .hbx-module-summary[data-phase="warning"] .hbx-module-summary__ring {
    --topbar-ring-color: #f59e0b;
  }

  .hbx-module-summary__ring strong {
    color: var(--foreground, #0f172a);
    font-size: 12px;
    font-weight: 950;
    line-height: 1;
  }

  .hbx-command-side {
    height: 74px !important;
    min-height: 74px !important;
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    align-content: center !important;
    justify-content: flex-end !important;
    gap: 10px !important;
    margin-block: auto !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  .hbx-right-themeSlot {
    flex: 0 0 56px !important;
    width: 56px !important;
    min-width: 56px !important;
    height: 50px !important;
    display: flex !important;
    align-items: center !important;
    align-self: center !important;
  }

  .hbx-command-side .theme-switcher-wrap,
  .hbx-control-user,
  .hbx-control-logout,
  .hbx-control-navMode,
  .hbx-control-contextButton {
    height: 50px !important;
    min-height: 50px !important;
    align-self: center !important;
  }

  .hbx-command-side .theme-switcher-wrap {
    width: 100% !important;
    min-width: 0 !important;
  }

  .hbx-command-side .theme-switcher__trigger,
  .hbx-control-user__trigger,
  .hbx-control-logout,
  .hbx-control-navMode,
  .hbx-control-contextButton {
    border: 1px solid color-mix(in srgb, var(--button-accent, #38bdf8) 22%, rgba(148, 163, 184, 0.28)) !important;
    border-radius: 16px !important;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(240, 248, 252, 0.74)) !important;
    color: var(--foreground, #0f172a) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 14px 26px -24px rgba(15, 23, 42, 0.36) !important;
  }

  .hbx-command-side .theme-switcher__trigger {
    width: 56px !important;
    height: 50px !important;
    min-height: 50px !important;
    display: grid !important;
    grid-template-columns: 1fr !important;
    place-items: center !important;
    gap: 0 !important;
    align-items: center !important;
    padding: 0 !important;
  }

  .hbx-command-side .theme-switcher__trigger-preview {
    width: 30px !important;
    height: 30px !important;
    border-radius: 999px !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.58), 0 8px 14px -12px rgba(2, 132, 199, 0.9) !important;
  }

  .hbx-command-side .theme-switcher__trigger-copy {
    display: none !important;
  }

  .hbx-command-side .theme-switcher__label {
    color: color-mix(in srgb, var(--button-accent, #0284c7) 74%, var(--foreground, #0f172a)) !important;
    font-size: 0 !important;
    line-height: 1 !important;
  }

  .hbx-command-side .theme-switcher__label::before {
    content: "TEMA";
    font-size: 10px;
    font-weight: 950;
    letter-spacing: 0.055em;
  }

  .hbx-command-side .theme-switcher__trigger-copy strong {
    color: var(--foreground, #0f172a) !important;
    font-size: 11px !important;
    font-weight: 950 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  .hbx-command-side .theme-switcher__modeBadge {
    display: none !important;
  }

  .hbx-command-side .theme-switcher__modeBadge::after {
    content: "";
    position: absolute;
    inset: 1px 2px 3px 2px;
    border-right: 1.8px solid color-mix(in srgb, var(--button-accent, #0284c7) 70%, var(--foreground, #0f172a));
    border-bottom: 1.8px solid color-mix(in srgb, var(--button-accent, #0284c7) 70%, var(--foreground, #0f172a));
    transform: rotate(45deg);
  }

  .hbx-control-user {
    flex: 0 0 176px !important;
    max-width: 176px !important;
    min-width: 0 !important;
    position: relative !important;
  }

  .hbx-control-user__trigger {
    width: 100% !important;
    height: 50px !important;
    display: grid !important;
    grid-template-columns: 36px minmax(0, 1fr) 14px !important;
    align-items: center !important;
    gap: 9px !important;
    padding: 0 10px 0 7px !important;
  }

  .hbx-control-user .app-user__avatar {
    width: 36px !important;
    height: 36px !important;
    border-radius: 999px !important;
    position: relative !important;
    color: #ffffff !important;
    background: linear-gradient(145deg, #0284c7, #03415f) !important;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12), 0 12px 18px -16px rgba(2, 132, 199, 0.9) !important;
    font-size: 13px !important;
  }

  .hbx-control-user .app-user__avatar::after {
    content: "";
    position: absolute;
    right: -1px;
    bottom: 1px;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #22c55e;
    border: 2px solid rgba(255, 255, 255, 0.9);
  }

  .hbx-control-user .app-user__meta {
    min-width: 0 !important;
    display: grid !important;
    gap: 2px !important;
    text-align: left !important;
  }

  .hbx-control-user .app-user__name {
    color: var(--foreground, #0f172a) !important;
    font-size: 12px !important;
    font-weight: 950 !important;
    line-height: 1 !important;
  }

  .hbx-control-user .app-user__company {
    color: var(--muted, #64748b) !important;
    font-size: 10px !important;
    font-weight: 780 !important;
    line-height: 1.05 !important;
  }

  .hbx-control-user__chevron {
    width: 14px;
    height: 14px;
    display: grid;
    place-items: center;
    color: color-mix(in srgb, var(--button-accent, #0284c7) 70%, var(--foreground, #0f172a));
  }

  .hbx-control-logout,
  .hbx-control-navMode,
  .hbx-control-contextButton {
    min-width: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 0 12px !important;
    font-size: 11px !important;
    font-weight: 950 !important;
    line-height: 1 !important;
    text-decoration: none !important;
    white-space: nowrap !important;
  }

  .hbx-control-logout {
    width: 100% !important;
    min-width: 56px !important;
    flex: 0 0 56px !important;
    padding: 0 !important;
  }

  .hbx-control-navMode {
    width: 100% !important;
    min-width: 106px !important;
    flex: 0 0 106px !important;
    border-radius: 16px !important;
  }

  .hbx-control-navMode[aria-pressed="true"] {
    border-color: color-mix(in srgb, var(--success, #10b981) 34%, rgba(148, 163, 184, 0.28)) !important;
    background: linear-gradient(180deg, color-mix(in srgb, #ecfdf5 78%, var(--surface, #ffffff)), rgba(240, 248, 252, 0.74)) !important;
  }

  .hbx-command-side .hbx-control-logout .hbx-control-logout__label {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
  }

  .hbx-control-logout svg,
  .hbx-control-contextButton svg {
    width: 18px;
    height: 18px;
    color: color-mix(in srgb, var(--button-accent, #0284c7) 76%, var(--foreground, #0f172a));
  }

  .hbx-control-contextButton {
    width: 100% !important;
  }

  .hbx-control-contextButton span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hbx-control-accountRow,
  .hbx-control-masterActions,
  .hbx-control-vitals {
    display: none !important;
  }

  .hbx-control-user .app-user__menu {
    top: calc(100% + 10px) !important;
    right: 0 !important;
    left: auto !important;
    width: min(320px, calc(100vw - 24px)) !important;
    z-index: 90 !important;
  }

  .hbx-control-notices .hbx-header-notices-menu {
    top: calc(100% + 10px) !important;
    right: 0 !important;
    left: auto !important;
    width: min(320px, calc(100vw - 24px)) !important;
    z-index: 95 !important;
    display: grid;
    gap: 0.5rem;
  }

  .hbx-header-notices-list {
    display: grid;
    gap: 0.42rem;
  }

  .hbx-header-notices-item {
    width: 100%;
    min-width: 0;
    padding: 0.56rem 0.62rem;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--line, rgba(148, 163, 184, 0.22)) 86%, transparent);
    background: color-mix(in srgb, var(--surface, #ffffff) 92%, var(--background, #f8fafc));
    color: var(--foreground, #0f172a);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.18rem;
    text-align: left;
  }

  .hbx-header-notices-itemMain {
    min-width: 0;
    display: grid;
    gap: 0.18rem;
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }

  .hbx-header-notices-itemMain strong,
  .hbx-header-notices-itemMain span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hbx-header-notices-itemMain strong {
    font-size: 0.74rem;
    font-weight: 900;
  }

  .hbx-header-notices-itemMain span {
    color: var(--muted, #64748b);
    font-size: 0.68rem;
    font-weight: 700;
  }

  .hbx-header-notices-dismiss {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 28%, var(--line, rgba(148, 163, 184, 0.22)));
    border-radius: 999px;
    background: color-mix(in srgb, var(--danger, #ef4444) 9%, var(--surface, #ffffff));
    color: color-mix(in srgb, var(--danger, #ef4444) 78%, var(--foreground, #0f172a));
    font-size: 1rem;
    font-weight: 900;
    line-height: 1;
    cursor: pointer;
  }

  @keyframes hbxHeaderDot {
    0%, 100% { transform: scale(1); opacity: 0.86; }
    50% { transform: scale(1.28); opacity: 1; }
  }

  @keyframes hbxHeaderPulseLine {
    0% { stroke-dashoffset: 210; opacity: 0.35; }
    28% { opacity: 1; }
    100% { stroke-dashoffset: -210; opacity: 0.74; }
  }

  @media (max-width: 1380px) {
    .app-topbar__inner--controlCenter {
      grid-template-columns: minmax(230px, 300px) minmax(390px, 1fr) minmax(430px, 500px) !important;
      gap: 12px !important;
      padding-inline: 14px !important;
    }

    .hbx-command-side {
      gap: 8px !important;
    }

    .hbx-right-themeSlot {
      flex-basis: 56px !important;
      width: 56px !important;
      min-width: 56px !important;
    }

    .hbx-control-user {
      flex-basis: 176px !important;
    }

    .hbx-control-navMode {
      flex-basis: 106px !important;
      min-width: 106px !important;
    }

    .hbx-control-logout {
      flex-basis: 56px !important;
      min-width: 56px !important;
    }
  }

  @media (max-width: 1220px) {
    .hbx-command-side {
      gap: 7px !important;
    }

    .hbx-right-themeSlot {
      flex-basis: 56px !important;
      width: 56px !important;
      min-width: 56px !important;
    }

    .hbx-control-user {
      flex-basis: 176px !important;
    }

    .hbx-control-navMode {
      flex-basis: 106px !important;
      min-width: 106px !important;
    }

    .hbx-control-logout {
      flex-basis: 56px !important;
      min-width: 56px !important;
      gap: 8px !important;
    }
  }

  @media (max-width: 1120px) {
    .app-topbar__inner--controlCenter {
      grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) !important;
    }

    .hbx-command-side {
      grid-column: 1 / -1 !important;
      justify-content: stretch !important;
    }
  }

  @media (max-width: 760px) {
    .app-topbar__frame {
      min-height: 0 !important;
      border-radius: 22px !important;
    }

    .app-topbar__inner--controlCenter {
      grid-template-columns: 1fr !important;
      min-height: 0 !important;
      padding: 10px !important;
    }

    .hbx-command-brand {
      height: 54px !important;
      min-height: 54px !important;
      grid-template-columns: 44px minmax(0, 1fr) 42px !important;
      padding: 0 !important;
    }

    .hbx-command-brand::before,
    .hbx-command-brand::after {
      display: none !important;
    }

    .hbx-command-brand__mark {
      width: 44px !important;
      height: 44px !important;
    }

    .hbx-command-brand__copy strong {
      font-size: 0.92rem !important;
    }

    .hbx-command-brand__copy span {
      font-size: 0.72rem !important;
    }

    .hbx-command-center,
    .hbx-command-center__body,
    .hbx-command-side {
      display: none !important;
    }

    .hbx-module-summary {
      height: auto;
      min-height: 148px;
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 14px;
    }

    .hbx-module-summary__metrics {
      grid-template-columns: 1fr;
    }

    .hbx-module-summary__ring {
      position: absolute;
      right: 14px;
      top: 14px;
    }

    .hbx-mobile-quicknav {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      padding: 0 10px 10px;
    }

    .hbx-mobile-quicknav__item {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid color-mix(in srgb, var(--button-secondary, #38bdf8) 28%, var(--line, rgba(148, 163, 184, 0.28)));
      border-radius: 14px;
      background:
        radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--button-secondary, #38bdf8) 13%, transparent), transparent 52%),
        linear-gradient(180deg, color-mix(in srgb, var(--surface-raised, #ffffff) 92%, transparent), color-mix(in srgb, var(--surface-soft, #f8fafc) 86%, transparent));
      color: var(--foreground, #0f172a);
      box-shadow: var(--shadow-inset, inset 0 1px 0 rgba(255, 255, 255, 0.72));
      font: inherit;
      font-size: 0.8rem;
      font-weight: 950;
      text-decoration: none;
    }

    .hbx-mobile-logout {
      min-height: 42px;
      width: 42px;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      border: 1px solid color-mix(in srgb, var(--button-success, #22c55e) 30%, var(--line, rgba(148, 163, 184, 0.28)));
      border-radius: 14px;
      background: color-mix(in srgb, var(--surface-raised, #ffffff) 92%, transparent);
      color: color-mix(in srgb, var(--button-success, #22c55e) 78%, var(--foreground, #0f172a));
      box-shadow: var(--shadow-inset, inset 0 1px 0 rgba(255, 255, 255, 0.72));
    }

    .hbx-mobile-logout svg {
      width: 18px;
      height: 18px;
    }
  }

  .hbx-mobile-quicknav {
    display: none;
  }

  .hbx-mobile-logout {
    display: none;
  }

  @media (max-width: 760px) {
    .hbx-mobile-quicknav {
      display: grid !important;
    }
  }

  html[data-theme-mode="dark"] .app-topbar__frame,
  html[data-theme-mode="dark"] .app-topbar .app-topbar__frame {
    background:
      radial-gradient(circle at 16% 10%, color-mix(in srgb, var(--button-success, #22c55e) 18%, transparent), transparent 30%),
      radial-gradient(circle at 78% 0%, color-mix(in srgb, var(--button-secondary, #38bdf8) 13%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, var(--header-surface, #0f172a) 94%, #020617), color-mix(in srgb, var(--surface, #111827) 84%, #020617)) !important;
    border-color: color-mix(in srgb, var(--button-success, #22c55e) 34%, var(--line, rgba(148, 163, 184, 0.28))) !important;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--button-success, #22c55e) 18%, transparent),
      0 22px 54px -32px rgba(0, 0, 0, 0.78),
      inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
  }

  html[data-theme-mode="dark"] .hbx-command-brand__copy strong,
  html[data-theme-mode="dark"] .hbx-module-summary__copy > strong,
  html[data-theme-mode="dark"] .hbx-module-summary__metric strong,
  html[data-theme-mode="dark"] .hbx-module-summary__ring strong,
  html[data-theme-mode="dark"] .hbx-control-user .app-user__name,
  html[data-theme-mode="dark"] .hbx-command-side .theme-switcher__trigger-copy strong {
    color: color-mix(in srgb, var(--foreground, #f8fafc) 96%, #ffffff) !important;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.22);
  }

  html[data-theme-mode="dark"] .hbx-command-brand__copy span,
  html[data-theme-mode="dark"] .hbx-module-summary__description,
  html[data-theme-mode="dark"] .hbx-module-summary__metric small,
  html[data-theme-mode="dark"] .hbx-control-user .app-user__company {
    color: color-mix(in srgb, var(--muted, #cbd5e1) 84%, #ffffff) !important;
  }

  html[data-theme-mode="dark"] .hbx-module-summary {
    border-color: color-mix(in srgb, var(--button-secondary, #38bdf8) 30%, var(--line, rgba(148, 163, 184, 0.24))) !important;
    background:
      radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--button-secondary, #38bdf8) 16%, transparent), transparent 38%),
      radial-gradient(circle at 74% 4%, color-mix(in srgb, var(--button-success, #22c55e) 14%, transparent), transparent 32%),
      linear-gradient(180deg, color-mix(in srgb, var(--surface-raised, #172033) 88%, #020617), color-mix(in srgb, var(--surface, #0f172a) 92%, #020617)) !important;
    color: var(--foreground, #f8fafc) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 18px 40px -30px rgba(0, 0, 0, 0.86) !important;
  }

  html[data-theme-mode="dark"] .hbx-module-summary__metric {
    border-color: color-mix(in srgb, var(--button-secondary, #38bdf8) 24%, var(--line, rgba(148, 163, 184, 0.24))) !important;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--surface, #111827) 88%, #020617), color-mix(in srgb, var(--surface-soft, #0b1220) 90%, #020617)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 12px 22px -20px rgba(0, 0, 0, 0.72) !important;
  }

  html[data-theme-mode="dark"] .hbx-module-summary__ring {
    background:
      radial-gradient(circle, color-mix(in srgb, var(--surface, #0f172a) 92%, #020617) 56%, transparent 58%),
      conic-gradient(var(--topbar-ring-color) var(--topbar-progress, 0%), color-mix(in srgb, var(--line, #334155) 58%, transparent) 0) !important;
    box-shadow:
      inset 0 0 0 7px color-mix(in srgb, var(--surface, #0f172a) 76%, #020617),
      0 0 0 7px color-mix(in srgb, var(--topbar-ring-color) 12%, transparent),
      0 14px 22px -18px color-mix(in srgb, var(--topbar-ring-color) 80%, transparent) !important;
  }

  html[data-theme-mode="dark"] .hbx-command-side .theme-switcher__trigger,
  html[data-theme-mode="dark"] .hbx-control-user__trigger,
  html[data-theme-mode="dark"] .hbx-control-logout,
  html[data-theme-mode="dark"] .hbx-control-navMode {
    border-color: color-mix(in srgb, var(--button-success, #22c55e) 34%, var(--line, rgba(148, 163, 184, 0.24))) !important;
    background:
      radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--button-secondary, #38bdf8) 13%, transparent), transparent 48%),
      linear-gradient(180deg, color-mix(in srgb, var(--surface-raised, #172033) 88%, #020617), color-mix(in srgb, var(--surface, #0f172a) 90%, #020617)) !important;
    color: var(--foreground, #f8fafc) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 14px 28px -22px rgba(0, 0, 0, 0.76) !important;
  }

  html[data-theme-mode="dark"] .hbx-command-side .theme-switcher__label::before {
    color: color-mix(in srgb, var(--button-success, #22c55e) 72%, #ffffff) !important;
  }

  html[data-theme-mode="dark"] .hbx-control-logout svg,
  html[data-theme-mode="dark"] .hbx-control-user__chevron svg,
  html[data-theme-mode="dark"] .hbx-control-navMode span {
    color: color-mix(in srgb, var(--button-success, #22c55e) 74%, #ffffff) !important;
  }

  @media (max-width: 768px) {
    .app-topbar[data-mobile-fullscreen-route="true"],
    .app-topbar[data-mobile-fullscreen-route="true"] .app-topbar__frame,
    .app-topbar[data-mobile-fullscreen-route="true"] .hbx-mobile-quicknav {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  }
`;


function isEngineProgressSource(source: string | null | undefined) {
  const normalized = String(source || "").trim().toLowerCase();
  return normalized === "webscraping" ||
    normalized === "radar" ||
    normalized === "radar-digital" ||
    normalized === "vendas" ||
    normalized === "atendimento" ||
    normalized.startsWith("atendimento-");
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
  const inboundStale = health.inboundStale
    ? ` Sem entrada recente no Atendimento${health.inboundStaleMinutes ? ` há ${health.inboundStaleMinutes} min` : ""}.`
    : "";
  return `${health.reason}${inboundStale} Checagem: ${checked}. Última recebida: ${inbound}.`;
}

function topbarTileFromWhatsAppLiveHealth(health: WhatsAppLiveHealthPayload): TopbarOperationalTile {
  const base = {
    id: "qr",
    label: "QR Code",
    detail: buildWhatsAppLiveHealthDetail(health),
  };

  if (health.liveConfirmed && health.inboundStale) {
    return { ...base, value: "Sem mensagens recentes", tone: "warning", usage: 46 };
  }
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
  const isTopbarHiddenRoute = hiddenRoutes.has(pathname || "") || String(pathname || "").startsWith("/mobile");
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
  const [scrapingEngines, setScrapingEngines] = useState<ScrapingEngineStatusPayload | null>(null);
  const [scrapingEngineStatusMessage, setScrapingEngineStatusMessage] = useState<string | null>(null);
  const [hbxGaugeBooting, setHbxGaugeBooting] = useState(true);
  const [hbxGaugeBootUsage, setHbxGaugeBootUsage] = useState(0);
  const [radarTopbarRun, setRadarTopbarRun] = useState<StoredRadarRun | null>(null);
  const [radarTopbarBusy, setRadarTopbarBusy] = useState<"play" | "pause" | "stop" | null>(null);
  const [unreadInboxOpen, setUnreadInboxOpen] = useState(false);
  const [unreadInboxLoading, setUnreadInboxLoading] = useState(false);
  const [unreadInboxError, setUnreadInboxError] = useState<string | null>(null);
  const [unreadInboxEntries, setUnreadInboxEntries] = useState<TopBarUnreadEntry[]>([]);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [masterNoticeCount, setMasterNoticeCount] = useState(0);
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
  const whatsAppBootstrapInFlightRef = useRef(false);
  const lastWhatsAppBootstrapKeyRef = useRef<string | null>(null);
  const scrapingEngineBackoffUntilRef = useRef(0);
  const scrapingEngineBackoffMsRef = useRef(SCRAPING_ENGINE_POLL_MS);
  const authResolved = authenticated !== null;
  const pendingCheckoutLocked = false;
  const pendingCheckoutHref = "/pagamento?focus=payment&reason=pending_checkout";
  const dashboardHref = pendingCheckoutLocked
    ? pendingCheckoutHref
    : pathname?.startsWith("/master")
      ? "/master"
      : "/boasvindas";
  const isMasterWebscrapingRoute = Boolean(
    pathname?.startsWith("/master/webscraping") || pathname?.startsWith("/dashboard/master/webscraping"),
  );
  const isVendasRoute = Boolean(pathname?.startsWith("/vendas") || pathname?.startsWith("/dashboard/vendas"));
  const isAtendimentoRoute = Boolean(pathname?.startsWith("/atendimento") || pathname?.startsWith("/dashboard/atendimento"));
  const isRadarDigitalRoute = Boolean(pathname?.startsWith("/radar-digital") || pathname?.startsWith("/dashboard/radar-digital"));
  const isPagamentoRoute = Boolean(pathname?.startsWith("/pagamento") || pathname?.startsWith("/dashboard/financeiro"));
  const isMobileFullscreenRoute = isVendasRoute || isRadarDigitalRoute || isPagamentoRoute;
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

      if (window.matchMedia("(max-width: 760px)").matches) {
        router.push(dashboardHref);
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
  }, []);

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

  const runWhatsAppBootstrapAfterConnect = React.useCallback(async (payload: WhatsAppModalPayload) => {
    const bootstrapKey = buildWhatsAppBootstrapKey(payload);
    if (
      payload.status !== "connected" ||
      whatsAppBootstrapInFlightRef.current ||
      lastWhatsAppBootstrapKeyRef.current === bootstrapKey
    ) {
      return;
    }

    whatsAppBootstrapInFlightRef.current = true;
    lastWhatsAppBootstrapKeyRef.current = bootstrapKey;
    setWhatsAppDetailMessage("Espelhando conversas e clientes...");
    setWhatsAppDetailError(null);

    try {
      await bootstrapWhatsAppAfterConnect(payload);
      setWhatsAppDetailMessage("WhatsApp conectado. Fila atualizada.");
      void loadWhatsAppCenter({ background: true });
      void loadWhatsAppModal({ background: true, includeQr: false });
      void whatsAppLiveHealth.refresh(true);
      void refreshOperationalStatus(true);
    } catch (error) {
      setWhatsAppDetailError(error instanceof Error ? error.message : "WhatsApp conectou, mas falhou ao espelhar conversas e clientes.");
    } finally {
      whatsAppBootstrapInFlightRef.current = false;
    }
  }, [
    loadWhatsAppCenter,
    loadWhatsAppModal,
    refreshOperationalStatus,
    whatsAppLiveHealth,
  ]);

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
  const hbxEngineTotal = scrapingEngineView.hbxEngines.length;
  const hbxEngineOnlineCount = scrapingEngineView.hbxEngines.filter((engine) => engine.configured && engine.online).length;
  const hbxActiveEngineLimit = Math.max(
    0,
    Math.trunc(Number(scrapingEngines?.capacity?.activeEngineCount ?? (hbxEngineTotal || 0))),
  );
  const hbxMainGaugeUsage = hbxGaugeBooting ? hbxGaugeBootUsage : hbxUsageAverage;
  const hbxMainGaugeDetail = hbxGaugeBooting
    ? "Partida dos motores em varrida de luz"
    : `${hbxEngineOnlineCount}/${hbxEngineTotal} online • ${hbxActiveEngineLimit}/${hbxEngineTotal} ativos agora`;
  const hbxQueueCount = Math.max(0, Math.trunc(Number(scrapingEngines?.capacity?.queuedCount ?? 0)));
  const hbxEngineIssueCount = scrapingEngineView.hbxEngines.filter((engine) => {
    const state = getVisibleScrapingEngineState(engine);
    return state === "degraded" || state === "offline" || state === "missing";
  }).length;
  const hbxEngineReportedErrorCount = scrapingEngineView.hbxEngines.reduce(
    (sum, engine) => sum + Math.max(0, Math.trunc(Number(engine.errorCount || 0))),
    0,
  );
  const hbxOperationalErrorCount = Math.max(hbxEngineIssueCount, hbxEngineReportedErrorCount);
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
      if (isTopbarHiddenRoute) {
        setAuthenticated(false);
        return;
      }
      setAuthenticated(Boolean(getToken()));
    }

    refreshAuthState();
    window.addEventListener("auth-change", refreshAuthState);
    window.addEventListener("storage", refreshAuthState);
    return () => {
      window.removeEventListener("auth-change", refreshAuthState);
      window.removeEventListener("storage", refreshAuthState);
    };
  }, [isTopbarHiddenRoute]);

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
      setStorageUserId(null);
      if (typeof window !== "undefined") {
        delete (window as HbxPrefetchWindow).__hbx_prefetch;
      }
      return;
    }

    let mounted = true;

    async function loadUser() {
      try {
        const [profile, myModules, nextOperationalStatus] = await Promise.all([
          apiFetch<User>("/profile/current-user"),
          apiFetch<UserModule[]>("/modules/me"),
          isMasterWebscrapingRoute ? Promise.resolve(null) : refreshOperationalStatus(false),
        ]);
        if (mounted) {
          setUser(profile);
          setModules(myModules || []);
          setOperationalStatus(nextOperationalStatus);
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
    if (typeof window === "undefined") return undefined;
    const syncRadarRun = () => setRadarTopbarRun(readStoredRadarRun());
    syncRadarRun();
    return subscribeStoredRadarRun(syncRadarRun);
  }, []);

  useEffect(() => {
    if (authenticated !== true || !isVendasRoute) return undefined;
    const runId = radarTopbarRun?.runId;
    if (!runId || isTerminalRadarRunStatus(radarTopbarRun?.status)) return undefined;

    let active = true;
    const stableRunId = runId;
    async function refreshRadarTopbarRun() {
      try {
        const payload = await apiFetch<RadarTopbarRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(stableRunId)}`, {
          requireAuth: true,
          timeoutMs: 12000,
        });
        if (!active) return;
        if (isRadarRunNotFoundPayload(payload)) {
          clearStoredRadarRun(stableRunId);
          setRadarTopbarRun(null);
          return;
        }
        if (payload.status === "canceled") {
          clearStoredRadarRun(stableRunId);
          setRadarTopbarRun(null);
          return;
        }
        setRadarTopbarRun({
          runId: payload.runId || payload.id || stableRunId,
          status: payload.status || radarTopbarRun?.status || null,
          city: payload.meta?.filters?.city || radarTopbarRun?.city || null,
          state: payload.meta?.filters?.state || radarTopbarRun?.state || null,
          segment: payload.meta?.filters?.segment || radarTopbarRun?.segment || null,
          targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || radarTopbarRun?.targetQuantity || 0) || null,
          deliveredCount: Number(payload.meta?.deliveredCount || payload.foundCount || radarTopbarRun?.deliveredCount || 0) || 0,
          updatedAt: Date.now(),
        });
      } catch (error) {
        if (isRadarRunNotFoundError(error)) {
          clearStoredRadarRun(stableRunId);
          if (active) setRadarTopbarRun(null);
          return;
        }
        if (active) setRadarTopbarRun(readStoredRadarRun());
      }
    }

    void refreshRadarTopbarRun();
    const timer = window.setInterval(() => {
      void refreshRadarTopbarRun();
    }, 6500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    authenticated,
    isVendasRoute,
    radarTopbarRun?.city,
    radarTopbarRun?.deliveredCount,
    radarTopbarRun?.runId,
    radarTopbarRun?.segment,
    radarTopbarRun?.state,
    radarTopbarRun?.status,
    radarTopbarRun?.targetQuantity,
  ]);

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

    if (
      whatsAppDetailOpen &&
      whatsAppQrRequested &&
      whatsAppModal?.status === "connected" &&
      previousStatus &&
      previousStatus !== "connected"
    ) {
      void runWhatsAppBootstrapAfterConnect(whatsAppModal);
    }

    if (!currentStatus || currentStatus === previousStatus) return;
    if (currentStatus !== "connected" && previousStatus !== "connected") return;

    dispatchModulesChanged({
      reason: currentStatus === "connected" ? "whatsapp_connected" : "whatsapp_disconnected",
    });
  }, [
    runWhatsAppBootstrapAfterConnect,
    whatsAppDetailOpen,
    whatsAppModal,
    whatsAppQrRequested,
  ]);

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
      setMasterNoticeCount(0);
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

  function handleMobileSupportClick() {
    if (typeof window === "undefined") return;
    const phone = SUPPORT_PHONE.replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;
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

  const loadHeaderMasterNoticeEntries = useCallback(async (options?: { menu?: boolean }) => {
    if (options?.menu) {
      setUnreadInboxLoading(true);
      setUnreadInboxError(null);
    }
    try {
      const role = String(user?.role || "").trim().toUpperCase();
      const audience = role === "ADMIN" || user?.isSystemMaster ? "customer" : "seller";
      const payload = await apiFetch<TopBarMasterNoticeListResponse>(`/vendas/master-notices?audience=${encodeURIComponent(audience)}`);
      const notices = (Array.isArray(payload?.notices) ? payload.notices : []).filter((notice) => !notice.acknowledged);
      const entries = notices.map((notice) => ({
        conversationId: "master",
        conversationLabel: String(notice.title || "Aviso Master").trim() || "Aviso Master",
        messageId: String(notice.id || ""),
        messagePreview: String(notice.body || "").trim() || "Aviso interno HBX.",
        messageAt: String(notice.createdAt || ""),
        unreadCount: 1,
        noticeId: String(notice.id || ""),
        href: buildHeaderMasterNoticeHref(notice),
      }));
      setMasterNoticeCount(entries.length);
      if (options?.menu) setUnreadInboxEntries(entries);
    } catch (error) {
      if (options?.menu) {
        const message = error instanceof Error ? error.message : "Falha ao carregar avisos Master.";
        setUnreadInboxError(message);
        setUnreadInboxEntries([]);
      }
    } finally {
      if (options?.menu) setUnreadInboxLoading(false);
    }
  }, [user?.isSystemMaster, user?.role]);

  async function acknowledgeHeaderMasterNotice(noticeId: string) {
    const normalizedNoticeId = String(noticeId || "").trim();
    if (!normalizedNoticeId) return;
    setUnreadInboxEntries((current) => current.filter((entry) => entry.noticeId !== normalizedNoticeId));
    setMasterNoticeCount((current) => Math.max(0, current - 1));
    try {
      await apiFetch(`/vendas/master-notices/${encodeURIComponent(normalizedNoticeId)}/ack`, { method: "POST" });
    } finally {
      await loadHeaderMasterNoticeEntries({ menu: unreadInboxOpen });
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

  async function openHeaderNotices() {
    setOpen(false);

    if (isVendasRoute && typeof window !== "undefined") {
      setUnreadInboxOpen(false);
      window.dispatchEvent(new CustomEvent("hbx:vendas-master-notices"));
      return;
    }

    if (unreadInboxOpen) {
      setUnreadInboxOpen(false);
      return;
    }
    setUnreadInboxOpen(true);
    await loadHeaderMasterNoticeEntries({ menu: true });
  }

  useEffect(() => {
    if (authenticated !== true) {
      setMasterNoticeCount(0);
      return;
    }
    void loadHeaderMasterNoticeEntries();
    const refreshFromWorkflow = () => {
      void loadHeaderMasterNoticeEntries();
    };
    window.addEventListener("hbx:master-notices-refresh", refreshFromWorkflow);
    const timer = window.setInterval(() => void loadHeaderMasterNoticeEntries(), 60000);
    return () => {
      window.removeEventListener("hbx:master-notices-refresh", refreshFromWorkflow);
      window.clearInterval(timer);
    };
  }, [authenticated, loadHeaderMasterNoticeEntries, user?.company?.id]);

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

  useEffect(() => {
    const onOpenWhatsAppQr = (event: Event) => {
      if (pendingCheckoutLocked) {
        router.push(pendingCheckoutHref);
        return;
      }
      const detail = event instanceof CustomEvent ? event.detail : null;
      const focus = String(detail?.focus || "qr") === "official" ? "official" : String(detail?.focus || "qr") === "status" ? "status" : "qr";
      setWhatsAppDetailFocus(focus);
      setWhatsAppDetailOpen(true);
      setWhatsAppQrRequested(false);
      void loadWhatsAppCenter({ background: true });
      void loadWhatsAppModal({ background: true, includeQr: focus === "qr" });
    };

    window.addEventListener("hbx:open-whatsapp-qr", onOpenWhatsAppQr);
    return () => {
      window.removeEventListener("hbx:open-whatsapp-qr", onOpenWhatsAppQr);
    };
  }, [loadWhatsAppCenter, loadWhatsAppModal, pendingCheckoutHref, pendingCheckoutLocked, router]);

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

    if (slide.source === "queue") {
      handleQueueShortcut(atendimentoPendingHumanCount > 0 ? "atendimento" : "recovery");
      return;
    }

    if (slide.source === "engines" || slide.source === "webscraping") {
      if (user?.isSystemMaster) {
        router.push("/master/webscraping");
      } else if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("hbx:radar-popup", { detail: { source: "topbar" } }));
      }
      return;
    }

    if (slide.source === "operational") {
      if (user?.isSystemMaster && !user.masterContext?.active) {
        void openMasterContextModal();
      } else if (user?.isSystemMaster) {
        router.push("/boasvindas");
      } else {
        router.push("/boasvindas");
      }
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

      clearApiCache("/profile/current-user");
      clearApiCache("/modules/me");
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

      clearApiCache("/profile/current-user");
      clearApiCache("/modules/me");
      const [profile, myModules] = await Promise.all([
        apiFetch<User>("/profile/current-user"),
        apiFetch<UserModule[]>("/modules/me"),
      ]);
      const exitedProfile: User = profile.masterContext?.active
        ? {
            ...profile,
            masterContext: {
              ...profile.masterContext,
              active: false,
              mode: "master_puro",
              sessionId: null,
              companyId: null,
              companyName: null,
            },
          }
        : profile;
      setUser(exitedProfile);
      setModules(myModules || []);
      if (typeof window !== "undefined") {
        (window as HbxPrefetchWindow).__hbx_prefetch = {
          modules: myModules || [],
          profile: exitedProfile,
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
  const headerNoticeCount = Math.max(0, masterNoticeCount);
  const headerNoticeBadge = headerNoticeCount > 99 ? "99+" : headerNoticeCount > 0 ? String(headerNoticeCount) : "!";
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
  const billboardSlides = useMemo<BillboardSlide[]>(() => {
    if (masterContextToast) {
      return [
        {
          id: `master-context:${masterContextToast}`,
          eyebrow: "Contexto",
          title: "Contexto atualizado",
          description: masterContextToast,
          phase: "success",
          source: "master-context",
          progress: 100,
          metrics: [{ label: "MASTER", value: "OK" }],
        },
      ];
    }

    if (isVendasRoute) {
      const status = String(radarTopbarRun?.status || "");
      const active = Boolean(radarTopbarRun?.runId && !isTerminalRadarRunStatus(status));
      const state = getRadarTopbarViewState(status, active);
      const delivered = Math.max(0, Math.trunc(Number(radarTopbarRun?.deliveredCount || 0)));
      const target = Math.max(1, Math.trunc(Number(radarTopbarRun?.targetQuantity || 20)));
      const context = [radarTopbarRun?.city || "", radarTopbarRun?.state || ""].filter(Boolean).join(" / ");
      const progress = state === "stopped" ? 0 : clampTopbarPercent((delivered / target) * 100);
      const title = state === "running" ? "Radar rodando" : state === "paused" ? "Radar pausado" : "Radar parado";
      const description =
        state === "running"
          ? `${delivered} de ${target} cards${context ? ` · ${context}` : ""}`
          : state === "paused"
            ? `Retomar no Radar${context ? ` · ${context}` : ""}`
            : "Abrir Radar";

      return [
        {
          id: `radar-vendas:${state}:${delivered}:${target}:${context}`,
          kind: "engines",
          eyebrow: "Radar",
          title,
          description,
          phase: state === "paused" ? "warning" : state === "running" ? "success" : "idle",
          source: null,
          href: null,
          progress,
          metrics: [],
        },
      ];
    }

    if (isAtendimentoRoute) {
      const liveHealth = whatsAppLiveHealth.health;
      const hasLiveHealthWarning = Boolean(
        liveHealth &&
          (!liveHealth.liveConfirmed || liveHealth.status !== "healthy" || liveHealth.inboundStale),
      );
      const whatsappWarningCount = hasLiveHealthWarning ? 1 : qrOperationalTile.tone === "success" ? 0 : 1;
      const attentionCount =
        pendingHumanCount +
        unreadInboxCount +
        whatsappWarningCount +
        (incomingPopup ? 1 : 0);
      const progress = qrOperationalTile.usage ?? (attentionCount > 0 ? 58 : 94);
      const title = incomingPopup
        ? incomingPopup.customerLabel
        : pendingHumanCount > 0
          ? `${pendingHumanCount} na fila`
          : liveHealth?.liveConfirmed && liveHealth.inboundStale
            ? "Sem mensagens recentes"
            : hasLiveHealthWarning
              ? "WhatsApp precisa validar"
              : unreadInboxCount > 0
                ? `${unreadInboxCount} não lidas`
                : "Atendimento OK";
      const description = incomingPopup?.preview ||
        (pendingHumanCount > 0
          ? "Fila humana aguardando atendimento."
          : liveHealth?.liveConfirmed && liveHealth.inboundStale
            ? `Conectado, mas sem entrada recente no Atendimento. ${liveHealth.actionLabel || "Revalidar agora"}.`
            : hasLiveHealthWarning && liveHealth
              ? `${formatWhatsAppLiveHealthStatus(liveHealth.status)}. ${liveHealth.actionLabel || "Ver diagnóstico"}.`
              : whatsAppHealthLabel);
      const connectionMetric = liveHealth?.liveConfirmed && liveHealth.inboundStale
        ? "Sem entrada"
        : qrOperationalTile.value;
      const actionMetric = hasLiveHealthWarning
        ? liveHealth?.recommendedAction === "open_qr"
          ? "Abrir QR"
          : liveHealth?.recommendedAction === "restart"
            ? "Reiniciar"
            : liveHealth?.recommendedAction === "disconnect_reconnect"
              ? "Reconectar"
              : "Revalidar"
        : String(attentionCount);

      return [
        {
          id: `atendimento:${pendingHumanCount}:${unreadInboxCount}:${qrOperationalTile.value}:${liveHealth?.status || "none"}:${liveHealth?.inboundStale ? "stale-inbound" : "fresh"}:${incomingPopup?.id || "none"}`,
          kind: "whatsapp",
          eyebrow: "Atendimento",
          title,
          description,
          phase: attentionCount > 0 ? "warning" : "success",
          source: "queue",
          href: "#atendimento-alerts",
          progress,
          metrics: [
            { label: "Conexão", value: connectionMetric },
            { label: "Não lidas", value: String(unreadInboxCount) },
            { label: hasLiveHealthWarning ? "Ação" : "Pendências", value: actionMetric },
          ],
        },
      ];
    }

    if (isRadarDigitalRoute || isMasterWebscrapingRoute) {
      const progress = liveWebscrapingProgress ? topbarProgressPercent : hbxMainGaugeUsage;
      const title = liveWebscrapingProgress
        ? `${progressEngineLabel || "HBX"} coletando`
        : hbxOperationalErrorCount > 0
          ? `${hbxOperationalErrorCount} alerta${hbxOperationalErrorCount === 1 ? "" : "s"} nos motores`
          : `${hbxEngineOnlineCount}/${visibleHbxEngineCount} motores online`;

      return [
        {
          id: `radar:${hbxEngineOnlineCount}:${visibleHbxEngineCount}:${hbxQueueCount}:${hbxOperationalErrorCount}:${progress}`,
          kind: "engines",
          eyebrow: "Radar digital",
          title,
          description: scrapingEngineStatusMessage || hbxMainGaugeDetail,
          phase: hbxOperationalErrorCount > 0 || hbxQueueCount > visibleHbxEngineCount ? "warning" : "success",
          source: "webscraping",
          href: user?.isSystemMaster ? "/master/webscraping" : "/boasvindas?radar=1",
          progress,
          metrics: [
            { label: "Disponíveis", value: `${hbxEngineOnlineCount}/${visibleHbxEngineCount}` },
            { label: "Fila", value: String(hbxQueueCount) },
            { label: "Erros", value: String(hbxOperationalErrorCount) },
          ],
        },
      ];
    }

    return [
      {
        id: `operational:${operationalSummaryMessage}:${pendingHumanCount}:${hbxEngineOnlineCount}:${visibleHbxEngineCount}`,
        kind: "status",
        eyebrow: "Operação",
        title: showOperationalCompanyPicker
          ? "Selecionar empresa"
          : pendingHumanCount > 0
            ? `${pendingHumanCount} pendente${pendingHumanCount === 1 ? "" : "s"}`
            : operationalStatusReady
              ? "Operação ativa"
              : "Painel ativo",
        description: operationalSummaryMessage,
        phase: showOperationalCompanyPicker || pendingHumanCount > 0 ? "warning" : "success",
        source: "operational",
        href: showOperationalCompanyPicker ? null : "/boasvindas",
        progress: showOperationalCompanyPicker ? 42 : pendingHumanCount > 0 ? 62 : 94,
        metrics: [
          { label: "WhatsApp", value: qrOperationalTile.value },
          { label: "Fila", value: String(pendingHumanCount) },
          { label: "Motores", value: `${hbxEngineOnlineCount}/${visibleHbxEngineCount}` },
        ],
      },
    ];

  }, [
    hbxEngineOnlineCount,
    hbxMainGaugeDetail,
    hbxMainGaugeUsage,
    hbxOperationalErrorCount,
    hbxQueueCount,
    incomingPopup,
    isAtendimentoRoute,
    isMasterWebscrapingRoute,
    isRadarDigitalRoute,
    isVendasRoute,
    liveWebscrapingProgress,
    masterContextToast,
    operationalStatusReady,
    operationalSummaryMessage,
    pendingHumanCount,
    progressEngineLabel,
    qrOperationalTile,
    radarTopbarRun?.city,
    radarTopbarRun?.deliveredCount,
    radarTopbarRun?.runId,
    radarTopbarRun?.state,
    radarTopbarRun?.status,
    radarTopbarRun?.targetQuantity,
    scrapingEngineStatusMessage,
    showOperationalCompanyPicker,
    topbarProgressPercent,
    unreadInboxCount,
    user?.isSystemMaster,
    visibleHbxEngineCount,
    whatsAppLiveHealth.health,
    whatsAppHealthLabel,
  ]);
  const activeBillboardSlide = billboardSlides[0];
  const radarTopbarRawStatus = String(radarTopbarRun?.status || "");
  const radarTopbarActive = Boolean(radarTopbarRun?.runId && !isTerminalRadarRunStatus(radarTopbarRawStatus));
  const radarTopbarControlState = getRadarTopbarViewState(radarTopbarRawStatus, radarTopbarActive);

  function openDesktopRadarPopup(action: "play" | "pause" | "stop" = "play") {
    const detail = { action };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hbx:radar-popup", { detail }));
    }
  }

  async function handleRadarTopbarAction(action: "play" | "pause" | "stop") {
    if (radarTopbarBusy) return;
    if (action !== "stop") {
      setRadarTopbarBusy(action);
      try {
        openDesktopRadarPopup(action);
      } finally {
        window.setTimeout(() => setRadarTopbarBusy(null), 300);
      }
      return;
    }

    const runId = radarTopbarRun?.runId;
    if (!runId || !radarTopbarActive) {
      openDesktopRadarPopup("stop");
      return;
    }

    setRadarTopbarBusy("stop");
    try {
      await apiFetch<RadarTopbarRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        requireAuth: true,
        timeoutMs: 15000,
      });
      clearStoredRadarRun(runId);
      setRadarTopbarRun(null);
    } catch {
      openDesktopRadarPopup("stop");
    } finally {
      setRadarTopbarBusy(null);
    }
  }

  function handleTopbarSummaryAction(slide: BillboardSlide) {
    if (slide.href === "#atendimento-alerts") {
      if (pendingCheckoutLocked) {
        router.push(pendingCheckoutHref);
        return;
      }
      if (pendingHumanCount > 0) {
        handleQueueShortcut(atendimentoPendingHumanCount > 0 ? "atendimento" : "recovery");
        return;
      }
      if (unreadInboxCount > 0) {
        void toggleUnreadInboxPopup();
        return;
      }
      openWhatsAppOperationalDetail("status");
      return;
    }

    if (slide.href) {
      router.push(slide.href);
      return;
    }

    handleBillboardAction(slide);
  }

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
  if (isTopbarHiddenRoute) {
    return null;
  }

  return (
    <header
      className={`app-topbar${topbarHiddenByScroll ? " app-topbar--hidden" : ""}`}
      data-mobile-fullscreen-route={isMobileFullscreenRoute ? "true" : "false"}
    >
      <style>{HBX_TOPBAR_POLISH_CSS}</style>
      <div ref={topbarFrameRef} className="app-topbar__frame">
        <div
          className="app-topbar__inner app-topbar__inner--controlCenter"
          style={{
            gridTemplateColumns: "minmax(240px, 300px) minmax(360px, 1fr) minmax(430px, 520px)",
            alignItems: "center",
          }}
        >
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
            {authenticated === true ? (
              <button
                type="button"
                className="hbx-mobile-logout"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={isShuttingDown}
                title="Sair do sistema"
                aria-label="Sair do sistema"
              >
                <HbxHeaderIcon name="logout" />
              </button>
            ) : null}
          </section>

          <section
            className="hbx-command-center"
            data-active={hasActiveScrapingEngine ? "true" : "false"}
            data-live={liveWebscrapingProgress ? "true" : "false"}
            aria-label="Status operacional HBX"
          >
            <div className="hbx-command-center__body">
              {activeBillboardSlide ? (
                <TopbarCenterSummary
                  slide={activeBillboardSlide}
                  onAction={handleTopbarSummaryAction}
                  actions={isVendasRoute ? (
                    <>
                      <button
                        type="button"
                        data-radar-action="play"
                        data-active={radarTopbarControlState === "running" ? "true" : "false"}
                        onClick={() => void handleRadarTopbarAction("play")}
                        disabled={radarTopbarBusy !== null}
                        aria-label="Abrir ou iniciar Radar"
                        title="Play Radar"
                      >
                        <span aria-hidden="true">▶</span>
                      </button>
                      <button
                        type="button"
                        data-radar-action="pause"
                        data-active={radarTopbarControlState === "paused" ? "true" : "false"}
                        onClick={() => void handleRadarTopbarAction("pause")}
                        disabled={radarTopbarBusy !== null}
                        aria-label="Pausar Radar"
                        title="Pause Radar"
                      >
                        <span aria-hidden="true">Ⅱ</span>
                      </button>
                      <button
                        type="button"
                        data-radar-action="stop"
                        data-active={radarTopbarControlState === "stopped" ? "true" : "false"}
                        onClick={() => void handleRadarTopbarAction("stop")}
                        disabled={radarTopbarBusy !== null}
                        aria-label="Parar Radar"
                        title="Stop Radar"
                      >
                        <span aria-hidden="true">■</span>
                      </button>
                    </>
                  ) : null}
                />
              ) : null}
            </div>
          </section>

          <section
            className="hbx-command-side"
            aria-label="Tema e usuário"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              height: 74,
              minHeight: 74,
              alignSelf: "center",
              marginBlock: "auto",
              padding: 0,
              border: 0,
              background: "transparent",
              boxShadow: "none",
              overflow: "visible",
            }}
          >
            {authenticated === true ? (
              <div
                ref={unreadMenuRef}
                className="hbx-control-notices"
                style={{ flex: "0 0 106px", minWidth: 106, height: 50, alignSelf: "center", position: "relative" }}
              >
                <button
                  type="button"
                  className="hbx-control-navMode"
                  onClick={() => {
                    void openHeaderNotices();
                  }}
                  aria-expanded={isVendasRoute ? undefined : unreadInboxOpen}
                  title="Avisos"
                  style={{ width: "100%", height: 50 }}
                >
                  <span aria-hidden="true">{headerNoticeBadge}</span>
                  <strong>Avisos</strong>
                </button>
                {unreadInboxOpen && !isVendasRoute ? (
                  <div className="app-user__menu hbx-header-notices-menu" role="dialog" aria-label="Avisos Master">
                    <p className="app-user__menu-title">Avisos Master</p>
                    {unreadInboxLoading ? <p className="text-xs text-muted leading-5">Carregando...</p> : null}
                    {unreadInboxError ? <div className="alert alert-error">{unreadInboxError}</div> : null}
                    {!unreadInboxLoading && !unreadInboxError && unreadInboxEntries.length === 0 ? (
                      <p className="text-xs text-muted leading-5">Nenhum aviso pendente.</p>
                    ) : null}
                    {!unreadInboxLoading && unreadInboxEntries.length > 0 ? (
                      <div className="hbx-header-notices-list">
                        {unreadInboxEntries.slice(0, 6).map((entry) => (
                          <div
                            key={`${entry.conversationId}:${entry.messageId}`}
                            className="hbx-header-notices-item"
                          >
                            <button
                              type="button"
                              className="hbx-header-notices-itemMain"
                              onClick={() => {
                                setUnreadInboxOpen(false);
                                router.push(entry.href || "/gerencial");
                              }}
                            >
                              <strong>{entry.conversationLabel}</strong>
                              <span>{entry.messagePreview}</span>
                            </button>
                            {entry.noticeId ? (
                              <button
                                type="button"
                                className="hbx-header-notices-dismiss"
                                onClick={() => void acknowledgeHeaderMasterNotice(entry.noticeId || "")}
                                aria-label="Remover aviso"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="hbx-right-themeSlot">
              <ThemeSwitcher />
            </div>
            {authenticated === true ? (
              <div
                ref={userMenuRef}
                className="app-user hbx-control-user"
                style={{ flex: "0 0 176px", maxWidth: 176, minWidth: 0, height: 50, alignSelf: "center" }}
              >
                <button
                  type="button"
                  className="app-user__trigger hbx-control-user__trigger"
                  onClick={() => setOpen((value) => !value)}
                  aria-expanded={open}
                >
                    <span className="app-user__avatar">{displayInitial}</span>
                    <span className="app-user__meta">
                      <span className="app-user__name">{displayLabel || user?.username || "Usuário"}</span>
                      <span className="app-user__company">
                      {user?.isSystemMaster
                        ? user.masterContext?.active
                          ? `MASTER em ${user.masterContext.companyName || "Empresa"}`
                          : "Administrador"
                        : user?.company?.name ?? "Conta ativa"}
                    </span>
                  </span>
                  <span className="hbx-control-user__chevron">
                    <HbxHeaderIcon name="chevron" />
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
                          disabled={changing || newPass.length < 8}
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
                title="Sair do sistema"
                aria-label="Sair do sistema"
                style={{ flex: "0 0 56px", minWidth: 56, width: 56, height: 50, alignSelf: "center", position: "relative" }}
              >
                <HbxHeaderIcon name="logout" />
                <span className="hbx-control-logout__label">
                  {isShuttingDown ? "Saindo..." : "Sair do sistema"}
                </span>
              </button>
            ) : authResolved ? (
              <Link href="/login" prefetch={false} className="hbx-control-logout">
                Entrar
              </Link>
            ) : null}
          </section>
        </div>

        {/* dock removed: counter is shown on individual icons (wa-health__queue-badge) */}
        <nav className="hbx-mobile-quicknav" aria-label="Navegação mobile">
          <Link href="/vendas" className="hbx-mobile-quicknav__item">
            <span>Vendas</span>
          </Link>
          <button type="button" className="hbx-mobile-quicknav__item" onClick={handleMobileSupportClick}>
            <span>Suporte</span>
          </button>
        </nav>
      </div>

      {/* incomingPopup UI removed — notifications are disabled for now */}
      {portalReady ? createPortal(whatsAppDialogNode, document.body) : null}

      {portalReady && masterContextModalNode ? createPortal(masterContextModalNode, document.body) : null}

    </header>
  );
}
