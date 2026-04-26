"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type MouseEvent as ReactMouseEvent,
  type FormEvent,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChatActionGrid,
  ChatAvatar,
  ChatEmptyState,
  ChatFieldNote,
  ChatGlyph,
  ChatIconButton,
  ChatQueue,
  ChatQueueItem,
  ChatInfoCard,
} from "@/components/chat/PremiumChat";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxConfirmDialog from "@/components/HbxConfirmDialog";
import LiquidGlassCard, { liquidGlassCardStyles as glassCardStyles } from "@/components/LiquidGlassCard";
import PremiumLaunchDialog from "@/components/PremiumLaunchDialog";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
import ConversationActionList from "@/components/workspace/ConversationActionList";
import ConversationContextPanel from "@/components/workspace/ConversationContextPanel";
import ConversationListPane from "@/components/workspace/ConversationListPane";
import ConversationQueueFilterBar, {
  type ConversationQueueFilterValue,
} from "@/components/workspace/ConversationQueueFilterBar";
import WorkspaceSegmentedControl from "@/components/workspace/WorkspaceSegmentedControl";
import ConversationWorkspaceStatus from "@/components/workspace/ConversationWorkspaceStatus";
import {
  buildAtendimentoContextActions,
  buildAtendimentoContextSummary,
  buildAtendimentoRecoveryPaymentHistory,
  buildAtendimentoRecoverySummary,
  formatAtendimentoRecoveryPaymentStatusLabel,
  getAtendimentoRecoveryPaymentDate,
  getAtendimentoConversationStatusMeta,
  hasAtendimentoRecoveryContext,
  isAtendimentoAgendaConversation,
  mapAtendimentoConversationToneToQueueTone,
} from "@/components/workspace/adapters/atendimento";
import { acquirePopupTopbarLock } from "@/lib/popup-visibility";
import { apiFetch, getDashboardApiBaseUrl, getToken } from "../_lib/api";
import { startSmartPolling } from "../_lib/polling";
import { useRequireAuth } from "../_lib/useRequireAuth";
import AgendaStudioModal, { type AgendaStudioTab } from "./_components/AgendaStudioModal";
import BotPanel from "./_components/BotPanel";
import TemplatesPanel, { type TemplateComposer } from "./_components/TemplatesPanel";
import type {
  RecoveryMetaTemplateItem,
  RecoveryMetaTemplatesPayload,
} from "../../hbx-recovery/recovery-model";
import {
  ATENDIMENTO_QUEUE_EVENT,
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  buildAgendaActionId,
  fetchBrazilianHolidays,
  formatCurrency,
  getMessagePreview,
  type InboxBootstrapPayload,
  normalizeAgendaConfig,
  normalizeBotConfig,
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaSimulationPayload,
  type AtendimentoAgendaSimulationResult,
  type AtendimentoBotActionGuide,
  type AtendimentoBotConfig,
  type InboxConversation,
  type InboxFullBootstrapPayload,
  type InboxMessage,
} from "./inbox-model";
import styles from "./page.module.css";

type InboxTab = "messages" | "automation";
type InboxQueue = "all" | "groups" | "recovery" | "scheduled" | "bot" | "archived";
type ContextTab = "conversa" | "financeiro" | "agenda";
type QueueActionMenuPosition = { top: number; left: number };
type AtendimentoSection = "conversa" | "financeiro" | "agenda" | "automacao";
type AgendaMode = "sales" | "bot";
type StatusFilter = "all" | "new" | "open" | "closed" | "blocked";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

type InboxAttachmentPreview = {
  file: File;
  url: string;
  kind: "image" | "video" | "document" | "audio";
  mimeType: string;
  size: number;
  fileName: string;
};

type OpenedInboxAsset = {
  kind: "image" | "document";
  src: string;
  alt: string;
  title?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
};

type InboxMessagePagePayload = {
  messages: InboxMessage[];
  hasMore?: boolean;
  nextBefore?: string | null;
};

type InboxRealtimeEvent = {
  companyId: number;
  kind: "message" | "status" | "conversation";
  conversationId?: string | number | null;
  messageId?: string | number | null;
  at?: string | null;
};

type InboxAlertKind = "human_queue" | "new_message";

type ActionOption = {
  value: string;
  label: string;
};

type AgendaGroupEditableField =
  | "title"
  | "slug"
  | "description"
  | "buttonLabel"
  | "actionType"
  | "linkedAgendaId"
  | "customActionKey"
  | "sortOrder"
  | "introMessage"
  | "emptyMessage"
  | "noImmediateAvailabilityMessage"
  | "linkedEmail"
  | "linkedUserName"
  | "connectionStatus"
  | "accentColor"
  | "isActive"
  | "workdays"
  | "visibleBusinessDays"
  | "searchWindowDays"
  | "suggestedSlotsCount"
  | "fallbackFutureSlotsCount";

type CurrentUserProfile = {
  id?: number | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: {
    id?: number | null;
    name?: string | null;
  } | null;
};

type UserModule = {
  key: string;
  accessible: boolean;
};

type DeletedConversationAliasMap = Record<string, string>;

type VendasAgendaQueueMetadata = {
  active?: boolean;
  leadId?: string | null;
  sourceModule?: string | null;
  sourceBlock?: string | null;
  status?: string | null;
  nextAction?: string | null;
  returnAt?: string | null;
  draftMessage?: string | null;
  draftPending?: boolean;
  syncedAt?: string | null;
  lastManualSendAt?: string | null;
  manualSent?: boolean | string | number | null;
  manualSentAt?: string | null;
  botEligible?: boolean | string | number | null;
  botEntryPending?: boolean | string | number | null;
  manualQueueOverride?: string | null;
  manualQueueOverriddenAt?: string | null;
  whatsappAvailabilityStatus?: string | null;
};

type CustomerConversationCardPayload = {
  customer: {
    profileId?: string | null;
    name?: string | null;
    phone?: string | null;
    phoneNormalized?: string | null;
    doNotCall?: boolean | null;
    doNotCallReason?: string | null;
    observations?: string | null;
    updatedAt?: string | null;
  };
  lead?: {
    id?: string | null;
    status?: string | null;
    statusLabel?: string | null;
    nextAction?: string | null;
    returnAt?: string | null;
    attemptCount?: number | null;
    timesSeen?: number | null;
    sourceType?: string | null;
    shortNote?: string | null;
    lastContactAt?: string | null;
    updatedAt?: string | null;
  } | null;
  history?: Array<{
    id: string;
    eventType?: string | null;
    title?: string | null;
    description?: string | null;
    resultLabel?: string | null;
    returnAt?: string | null;
    createdAt?: string | null;
  }>;
};

type CustomerConversationCardDraft = {
  doNotCall: boolean;
  returnAt: string;
  observations: string;
};

const INBOX_QUEUE_ORDER: InboxQueue[] = [
  "all",
  "archived",
  "groups",
  "recovery",
  "scheduled",
  "bot",
];

const INBOX_MANUAL_QUEUE_STORAGE_KEY = "hbx:inbox:manual-queue-overrides";
const INBOX_DELETED_CONVERSATION_ALIASES_STORAGE_KEY = "hbx:inbox:deleted-conversation-aliases";
const INBOX_GLOBAL_BOT_ENABLED_STORAGE_KEY = "hbx:inbox:global-bot-enabled";
const INBOX_INITIAL_MIRROR_SESSION_KEY = "hbx:inbox:full-bootstrap:session";
const INBOX_BOOTSTRAP_STAGE_SEQUENCE = [
  { label: "Lendo motor", value: "01/04" },
  { label: "Espelhando conversas", value: "02/04" },
  { label: "Baixando historico", value: "03/04" },
  { label: "Gravando nomes, fotos e midias", value: "04/04" },
] as const;

const ATENDIMENTO_PENDING_STORAGE_KEY = "atendimentoPendingHumanCount";
const DEFAULT_META_TEMPLATES_PAYLOAD: RecoveryMetaTemplatesPayload = {
  phoneNumberId: null,
  wabaId: null,
  lastSyncAt: null,
  syncError: null,
  counters: {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    hbxActive: 0,
    eligible: 0,
  },
  templates: [],
  history: [],
};

const DEFAULT_TEMPLATE_COMPOSER: TemplateComposer = {
  name: "",
  category: "UTILITY",
  language: "pt_BR",
  bodyText:
    "Olá, tudo bem? Aqui é da {{empresa}}.\nFalo com {{cliente}}?\nTemos um assunto financeiro pendente referente ao serviço realizado em {{data_servico}}.\nEu poderia te mostrar opções de pagamentos?",
  footerText: "Recovery",
  buttonsText: "Sim\nNão, obrigado",
  activateInHbx: true,
  headerFormat: "NONE",
  headerText: "",
  headerHandle: "",
  headerMediaUrl: "",
};

const CONTEXT_TAB_ITEMS: Array<{ id: ContextTab; label: string }> = [
  { id: "conversa", label: "Conversa" },
  { id: "financeiro", label: "Financeiro" },
  { id: "agenda", label: "Agenda" },
];

function normalizeInboxTab(value: string | null | undefined): InboxTab | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "messages") {
    return "messages";
  }
  if (normalized === "automation" || normalized === "recovery") {
    return "automation";
  }
  return null;
}

function normalizeInboxQueueParam(value: string | null | undefined): InboxQueue | null {
  const normalized = String(value || "").trim().toLowerCase();
  return INBOX_QUEUE_ORDER.includes(normalized as InboxQueue) ? (normalized as InboxQueue) : null;
}

function normalizeAtendimentoSectionParam(value: string | null | undefined): AtendimentoSection | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "conversa" || normalized === "financeiro" || normalized === "agenda" || normalized === "automacao") {
    return normalized;
  }
  if (normalized === "automation") return "automacao";
  return null;
}

function getInboxQueueLabel(queue: InboxQueue) {
  switch (queue) {
    case "groups":
      return "Grupos";
    case "recovery":
      return "Chat • Recovery";
    case "scheduled":
      return "Chat • Agendamento";
    case "bot":
      return "Chat • BOT";
    case "archived":
      return "Excluídos";
    default:
      return "Conversas";
  }
}

function getConversationNoteStorageKey(companyId: number | null | undefined, conversationId: string | null) {
  if (!companyId || !conversationId) return null;
  return `hbx:inbox:note:${companyId}:${conversationId}`;
}

const ACTION_KIND_LABELS: Record<AtendimentoBotActionGuide["kind"], string> = {
  reply: "Responder",
  human_handoff: "Humano",
  recovery_handoff: "Recovery",
  close: "Encerrar",
  show_menu: "Mostrar menu",
  agenda: "Agenda",
};

type DockGlyph = "note" | "wallet" | "clock" | "gear" | "spark" | "user";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function readStoredGlobalBotEnabled() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(INBOX_GLOBAL_BOT_ENABLED_STORAGE_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function writeStoredGlobalBotEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INBOX_GLOBAL_BOT_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
}

function normalizeDeletedConversationAliasMap(raw: unknown): DeletedConversationAliasMap {
  if (Array.isArray(raw)) {
    const fallbackDeletedAt = new Date().toISOString();
    return Object.fromEntries(
      raw
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .map((alias) => [alias, fallbackDeletedAt]),
    );
  }

  if (!raw || typeof raw !== "object") {
    return {};
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([alias, deletedAt]) => [String(alias || "").trim(), String(deletedAt || "").trim()] as const)
    .filter(([alias, deletedAt]) => alias && deletedAt);

  return Object.fromEntries(entries);
}

function normalizeInboxConversationId(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  if (lowered === "undefined" || lowered === "null" || lowered === "nan") return null;
  return normalized;
}

function getInboxConversationRuntimeId(conversation: unknown) {
  if (!conversation || typeof conversation !== "object" || Array.isArray(conversation)) {
    return null;
  }

  const record = conversation as Record<string, unknown>;
  const nestedConversation =
    record.conversation && typeof record.conversation === "object" && !Array.isArray(record.conversation)
      ? (record.conversation as Record<string, unknown>)
      : null;
  const metadata =
    record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : null;
  const customer =
    record.customer && typeof record.customer === "object" && !Array.isArray(record.customer)
      ? (record.customer as Record<string, unknown>)
      : null;

  const candidates = [
    record.id,
    record.conversationId,
    record.conversation_id,
    nestedConversation?.id,
    nestedConversation?.conversationId,
    metadata?.conversationId,
    metadata?.companyConversationId,
    customer?.conversationId,
  ];

  for (const candidate of candidates) {
    const id = normalizeInboxConversationId(candidate);
    if (id) return id;
  }

  return null;
}

function normalizeInboxConversationPayload(
  conversation: InboxConversation | null | undefined,
) {
  const id = getInboxConversationRuntimeId(conversation);
  if (!id || !conversation) return null;
  return {
    ...conversation,
    id,
  } as InboxConversation;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 20 20" />
    </svg>
  );
}

function DockButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: DockGlyph;
  label: string;
  active?: boolean;
  badge?: number | string | null;
  onClick: () => void;
}) {
  const hasBadge = badge !== null && badge !== undefined && badge !== "" && badge !== 0;

  return (
    <button
      type="button"
      className={styles.commandDockButton}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span className={styles.commandDockIcon}>
        <ChatGlyph name={icon} />
      </span>
      {hasBadge ? <span className={styles.commandDockBadge}>{badge}</span> : null}
    </button>
  );
}

function makeClientId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const INBOX_RECENT_MESSAGES_LIMIT = 200;
const WHATSAPP_ASSET_EXPIRY_GRACE_MS = 5 * 60 * 1000;

function getInboxApiBaseUrl() {
  return getDashboardApiBaseUrl();
}

function getWhatsAppAssetExpiryMs(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value, getInboxApiBaseUrl());
    if (!/(^|\.)whatsapp\.net$/i.test(parsed.hostname)) return null;
    const rawExpiry = parsed.searchParams.get("oe");
    if (!rawExpiry) return null;
    const expirySeconds = /^[0-9a-f]+$/i.test(rawExpiry)
      ? Number.parseInt(rawExpiry, 16)
      : Number(rawExpiry);
    if (!Number.isFinite(expirySeconds) || expirySeconds <= 0) return null;
    return expirySeconds * 1000;
  } catch {
    return null;
  }
}

function isExpiredWhatsAppAssetUrl(raw: string) {
  const expiresAt = getWhatsAppAssetExpiryMs(raw);
  return Boolean(expiresAt && expiresAt <= Date.now() + WHATSAPP_ASSET_EXPIRY_GRACE_MS);
}

function parseInboxRealtimeEventBlock(block: string) {
  const lines = block.split("\n");
  let eventName = "";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
    const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trimStart() : "";

    if (field === "event") {
      eventName = value;
      continue;
    }

    if (field === "data") {
      dataLines.push(value);
    }
  }

  if (eventName && eventName !== "inbox") return null;
  if (!dataLines.length) return null;

  try {
    const payload = JSON.parse(dataLines.join("\n")) as InboxRealtimeEvent;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function readInboxRealtimeStream(input: {
  signal: AbortSignal;
  onEvent: (event: InboxRealtimeEvent) => void;
}) {
  const token = getToken();
  if (!token) return;

  const response = await fetch(`${getInboxApiBaseUrl()}/inbox/events`, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(`Falha ao conectar stream da inbox (${response.status}).`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!input.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex >= 0) {
        const block = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);

        if (block) {
          const event = parseInboxRealtimeEventBlock(block);
          if (event) {
            input.onEvent(event);
          }
        }

        boundaryIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function isLikelyImageUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return false;
  const isUrl = /^https?:\/\/\S+$/i.test(value) || /^\/\S+$/.test(value);
  if (!isUrl) return false;
  const noQuery = value.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(noQuery);
}

function isLikelyVideoUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return false;
  const isUrl = /^https?:\/\/\S+$/i.test(value) || /^\/\S+$/.test(value);
  if (!isUrl) return false;
  const noQuery = value.split("?")[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(noQuery);
}

function isLikelyAudioUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return false;
  const isUrl = /^https?:\/\/\S+$/i.test(value) || /^\/\S+$/.test(value);
  if (!isUrl) return false;
  const noQuery = value.split("?")[0].toLowerCase();
  return /\.(mp3|ogg|wav|m4a|opus|aac|webm)$/.test(noQuery);
}

function isLikelyDocumentUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return false;
  const isUrl = /^https?:\/\/\S+$/i.test(value) || /^\/\S+$/.test(value);
  if (!isUrl) return false;
  const noQuery = value.split("?")[0].toLowerCase();
  return /\.(pdf|doc|docx|xls|xlsx|csv|txt)$/.test(noQuery);
}

function canPreviewDocumentInOverlay(url: string, mimeType?: string | null, fileName?: string | null) {
  const normalizedUrl = String(url || "").trim().toLowerCase();
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const normalizedName = String(fileName || "").trim().toLowerCase();
  return (
    normalizedMime.includes("pdf") ||
    normalizedMime.includes("xml") ||
    normalizedMime.includes("text/") ||
    normalizedMime.includes("json") ||
    /\.(pdf|xml|txt|csv|json|html?)($|\?)/.test(normalizedUrl) ||
    /\.(pdf|xml|txt|csv|json|html?)$/.test(normalizedName)
  );
}

function toUploadedInboxAssetPath(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;

  const relative = value
    .replace(/^\.\//, "")
    .replace(/^public\//i, "")
    .trim();
  if (!relative) return "";
  if (relative.startsWith("uploads/")) return `/${relative}`;
  if (/^[^\\/?#:*"<>|]+\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|m4v|mp3|ogg|oga|wav|m4a|opus|aac|pdf|docx?|xlsx?|csv|txt)$/i.test(relative)) {
    return `/uploads/inbox/${relative}`;
  }
  return "";
}

function toAbsoluteAssetUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const assetPath = toUploadedInboxAssetPath(value);
  const apiBase = getInboxApiBaseUrl();
  const resolved = /^https?:\/\//i.test(value)
    ? value
    : assetPath
      ? `${apiBase}${assetPath}`
      : "";
  if (!resolved) return "";
  return isExpiredWhatsAppAssetUrl(resolved) ? "" : resolved;
}

function normalizePathologicalLineBreaks(raw: string) {
  const value = String(raw || "");
  if (!value.includes("\n")) return value;
  const lines = value.split("\n");
  const compact = lines.map((line) => line.trim()).filter(Boolean);
  if (compact.length < 4) return value;

  // Heuristic: if most lines are 1-2 chars, it is likely a broken wrap artifact.
  const shortLines = compact.filter((line) => line.length <= 2).length;
  if (shortLines / compact.length < 0.7) return value;

  return compact.join("");
}

function getInboxMessageMetadata(message?: InboxMessage | null): Record<string, unknown> | null {
  const metadata = message?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

function normalizeInboxMessageType(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  const rawType = String(metadata?.normalizedMessageType || message?.messageType || "text")
    .trim()
    .toLowerCase();
  if (rawType.includes("deleted")) return "deleted" as const;
  if (rawType.includes("image")) return "image" as const;
  if (rawType.includes("video") || rawType.includes("ptv")) return "video" as const;
  if (rawType.includes("document")) return "document" as const;
  if (rawType.includes("audio")) return "audio" as const;
  if (rawType.includes("sticker")) return "sticker" as const;
  if (rawType.includes("reaction")) return "reaction" as const;
  if (rawType.includes("interactive") || rawType.includes("button") || rawType.includes("list")) {
    return "interactive" as const;
  }
  return "text" as const;
}

function splitInboxQuotedBlock(raw: string) {
  const value = String(raw || "").trim();
  if (!value.startsWith("> ")) {
    return { quotedText: null as string | null, text: value };
  }

  const lines = value.split("\n");
  const quotedLines: string[] = [];
  let index = 0;
  while (index < lines.length && lines[index].startsWith(">")) {
    quotedLines.push(lines[index].replace(/^>\s?/, ""));
    index += 1;
  }
  if (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }

  return {
    quotedText: quotedLines.join("\n").trim() || null,
    text: lines.slice(index).join("\n").trim(),
  };
}

function normalizeInboxFileSize(raw: unknown) {
  const value = Number(raw || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function formatInboxFileSizeLabel(raw: unknown) {
  const size = normalizeInboxFileSize(raw);
  if (!size) return null;
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

function formatInboxDurationLabel(raw: unknown) {
  const totalSeconds = Number(raw || 0);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function resolveInboxAttachmentKind(file: { type?: string | null; name?: string | null }) {
  const mimeType = String(file?.type || "").trim().toLowerCase();
  const name = String(file?.name || "").trim().toLowerCase();
  if (mimeType.startsWith("image/")) return "image" as const;
  if (mimeType.startsWith("video/")) return "video" as const;
  if (mimeType.startsWith("audio/")) return "audio" as const;
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("sheet") ||
    mimeType.includes("text/") ||
    mimeType.includes("csv")
  ) {
    return "document" as const;
  }
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image" as const;
  if (/\.(mp4|webm|mov|m4v)$/.test(name)) return "video" as const;
  if (/\.(mp3|ogg|wav|m4a|opus|aac)$/.test(name)) return "audio" as const;
  return "document" as const;
}

function createInboxAttachmentPreview(file: File): InboxAttachmentPreview {
  return {
    file,
    url: URL.createObjectURL(file),
    kind: resolveInboxAttachmentKind(file),
    mimeType: String(file.type || "").trim(),
    size: Number(file.size || 0),
    fileName: String(file.name || "arquivo").trim() || "arquivo",
  };
}

function getInboxGroupSenderColor(seed: string) {
  const palette = ["#53bdeb", "#06cf9c", "#ff8f40", "#ff7292", "#7e8fff", "#ffd279"];
  const source = String(seed || "sender");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function parseInboxMessageMedia(message: InboxMessage, conversation?: InboxConversation | null) {
  const metadata = getInboxMessageMetadata(message);
  const normalizedType = normalizeInboxMessageType(message);
  const isDeleted = Boolean(metadata?.isDeleted || normalizedType === "deleted");
  const rawContent = normalizePathologicalLineBreaks(String(message?.content || "")).trim();
  const quotedParts = splitInboxQuotedBlock(rawContent);
  let text = quotedParts.text;
  if (isDeleted) {
    return {
      kind: "deleted",
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
      documentUrl: null,
      fileName: null,
      mimeType: null,
      fileSize: null,
      durationSeconds: null,
      isVoiceNote: false,
      quotedText: null,
      senderName: null,
      senderColor: null,
      text: "Mensagem apagada",
      isDeleted: true,
      mediaExpired: false,
      deletedOriginalText: String(metadata?.deletedOriginalText || "").trim() || null,
      deletedRevealUntil: String(metadata?.deletedRevealUntil || "").trim() || null,
    };
  }
  const explicitMediaUrlRaw = String(metadata?.mediaUrl || metadata?.previewUrl || "").trim();
  const explicitMediaUrl = toAbsoluteAssetUrl(explicitMediaUrlRaw);
  const explicitMediaExpired = Boolean(explicitMediaUrlRaw && !explicitMediaUrl && isExpiredWhatsAppAssetUrl(explicitMediaUrlRaw));
  const firstLine = String(text.split("\n")[0] || "").trim();
  const firstLineIsUrl = Boolean(toAbsoluteAssetUrl(firstLine));
  const fallbackMediaUrlRaw = firstLineIsUrl ? firstLine : "";
  const fallbackMediaUrl = fallbackMediaUrlRaw ? toAbsoluteAssetUrl(fallbackMediaUrlRaw) : "";
  const fallbackMediaExpired = Boolean(fallbackMediaUrlRaw && !fallbackMediaUrl && isExpiredWhatsAppAssetUrl(fallbackMediaUrlRaw));
  let mediaKind = normalizedType;
  const fallbackMediaKindSource = fallbackMediaUrl || fallbackMediaUrlRaw;
  if (mediaKind === "text" && fallbackMediaKindSource) {
    if (isLikelyImageUrl(fallbackMediaKindSource)) mediaKind = "image";
    else if (isLikelyVideoUrl(fallbackMediaKindSource)) mediaKind = "video";
    else if (isLikelyAudioUrl(fallbackMediaKindSource)) mediaKind = "audio";
    else if (isLikelyDocumentUrl(fallbackMediaKindSource)) mediaKind = "document";
  }

  const resolvedMediaUrl = explicitMediaUrl || fallbackMediaUrl;
  const mediaExpired = explicitMediaExpired || fallbackMediaExpired;
  const imageUrl = mediaKind === "image" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const videoUrl = mediaKind === "video" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const audioUrl = mediaKind === "audio" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const documentUrl = mediaKind === "document" && resolvedMediaUrl ? resolvedMediaUrl : null;
  const apiBase = getInboxApiBaseUrl();

  if (resolvedMediaUrl && fallbackMediaUrl && firstLine === fallbackMediaUrl.replace(apiBase, "")) {
    text = text.split("\n").slice(1).join("\n").trim();
  } else if (resolvedMediaUrl && fallbackMediaUrl && firstLineIsUrl) {
    text = text.split("\n").slice(1).join("\n").trim();
  } else if (mediaExpired && fallbackMediaUrlRaw && firstLineIsUrl) {
    text = text.split("\n").slice(1).join("\n").trim();
  }

  const senderPhone =
    formatInboxPhoneLabel(String(metadata?.senderPhone || metadata?.participantAlt || metadata?.participant || "")) ||
    null;
  const senderNameCandidate = normalizeConversationDisplayNameCandidate(
    metadata?.senderName,
    String(metadata?.senderPhone || metadata?.participantAlt || metadata?.participant || ""),
  );
  const senderName =
    conversation && isInboxGroupRemoteJid(extractInboxRawContact(conversation))
      ? senderNameCandidate || senderPhone
      : null;

  return {
    kind: mediaKind,
    imageUrl,
    videoUrl,
    audioUrl,
    documentUrl,
    fileName: String(metadata?.fileName || "").trim() || null,
    mimeType: String(metadata?.mimeType || "").trim() || null,
    fileSize: normalizeInboxFileSize(metadata?.fileSize),
    durationSeconds: normalizeInboxFileSize(metadata?.durationSeconds),
    isVoiceNote: Boolean(metadata?.isVoiceNote),
    quotedText: String(metadata?.quotedPreview || quotedParts.quotedText || "").trim() || null,
    senderName,
    senderColor: senderName ? getInboxGroupSenderColor(String(metadata?.senderPhone || senderName || message.id)) : null,
    text: text || (rawContent ? String(getMessagePreview(message) || "").trim() : String(getMessagePreview(message) || "").trim()),
    isDeleted: false,
    mediaExpired,
    deletedOriginalText: null,
    deletedRevealUntil: null,
  };
}

function getInboxMessageProviderKeyId(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  return String(metadata?.providerKeyId || "").trim() || null;
}

function getInboxMessageReactionTargetKeyId(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  return String(metadata?.reactionTargetKeyId || "").trim() || null;
}

function getInboxMessageReactionEmoji(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  return String(metadata?.reactionEmoji || message?.content || "").trim() || null;
}

function isInboxReactionMessage(message?: InboxMessage | null) {
  return normalizeInboxMessageType(message) === "reaction";
}

function buildInboxReactionIndex(messages?: InboxMessage[] | null) {
  const index = new Map<string, string[]>();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!isInboxReactionMessage(message)) continue;
    const targetKey = getInboxMessageReactionTargetKeyId(message);
    const emoji = getInboxMessageReactionEmoji(message);
    if (!targetKey || !emoji) continue;
    const current = index.get(targetKey) || [];
    current.push(emoji);
    index.set(targetKey, current);
  }
  return index;
}

function shouldHideInboxMessageFromTimeline(message?: InboxMessage | null) {
  return isInboxReactionMessage(message) && Boolean(getInboxMessageReactionTargetKeyId(message));
}

function getInboxOldestMessageDate(messages?: InboxMessage[] | null) {
  const sorted = sortInboxMessagesChronologically(Array.isArray(messages) ? messages : []);
  return sorted[0]?.createdAt ? String(sorted[0].createdAt) : null;
}

function canRevealDeletedInboxMessage(message?: InboxMessage | null) {
  const metadata = getInboxMessageMetadata(message);
  if (!metadata?.deletedRevealUntil || !metadata?.deletedOriginalText) return false;
  const revealUntil = new Date(String(metadata.deletedRevealUntil));
  return !Number.isNaN(revealUntil.getTime()) && revealUntil.getTime() >= Date.now();
}

/** Renders WhatsApp-style inline formatting: *bold*, _italic_, ~strike~, `mono` */
function formatWhatsAppText(raw: string): React.ReactNode {
  if (!raw) return null;
  // Split into lines, process each
  const lines = raw.split("\n");
  const result: React.ReactNode[] = [];
  lines.forEach((line, li) => {
    if (li > 0) result.push(<br key={`br${li}`} />);
    // Tokenize: *bold*, _italic_, ~strike~, `mono`, regular
    const regex = /(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(`[^`\n]+`)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    const parts: React.ReactNode[] = [];
    while ((match = regex.exec(line)) !== null) {
      if (match.index > last) parts.push(line.slice(last, match.index));
      const token = match[0];
      const key = `${li}-${match.index}`;
      if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(<strong key={key}>{token.slice(1, -1)}</strong>);
      } else if (token.startsWith("_") && token.endsWith("_")) {
        parts.push(<em key={key}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith("~") && token.endsWith("~")) {
        parts.push(<del key={key}>{token.slice(1, -1)}</del>);
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(<code key={key} style={{ background: "rgba(0,0,0,0.18)", borderRadius: 3, padding: "0 3px", fontFamily: "monospace", fontSize: "0.9em" }}>{token.slice(1, -1)}</code>);
      }
      last = match.index + token.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    result.push(...parts);
  });
  return result.length ? result : raw;
}

function formatDateLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleString("pt-BR");
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getLocalCalendarDayDistance(left: Date, right: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfLocalDay(left).getTime() - startOfLocalDay(right).getTime()) / dayMs);
}

function formatTimeLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "-";
  if (!mounted) return parsed.toISOString();

  const now = new Date();
  const dayDistance = getLocalCalendarDayDistance(now, parsed);
  if (dayDistance <= 0) {
    return parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (dayDistance === 1) {
    return "Ontem";
  }
  if (dayDistance < 7) {
    return ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][parsed.getDay()] ||
      parsed.toLocaleDateString("pt-BR", { weekday: "long" });
  }

  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatShortDateTimeLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "-";
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocalValue(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocalDateTime(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildTomorrowReturnLocalValue() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return formatDateTimeLocalValue(tomorrow.toISOString());
}

function buildCustomerConversationCardDraft(
  payload: CustomerConversationCardPayload | null,
): CustomerConversationCardDraft {
  return {
    doNotCall: Boolean(payload?.customer?.doNotCall),
    returnAt: formatDateTimeLocalValue(payload?.lead?.returnAt || null),
    observations: String(payload?.customer?.observations || payload?.lead?.shortNote || ""),
  };
}

function getCustomerConversationCardWhatsappAvailability(
  payload: CustomerConversationCardPayload | null,
) {
  const history = Array.isArray(payload?.history) ? payload.history : [];
  for (const event of history) {
    const resultLabel = String(event?.resultLabel || "").trim().toLowerCase();
    if (resultLabel === "unavailable") return "unavailable" as const;
    if (resultLabel === "available") return "available" as const;

    const title = String(event?.title || "").trim().toLowerCase();
    if (title.includes("numero sem whatsapp no motor")) return "unavailable" as const;
    if (title.includes("whatsapp confirmado no motor")) return "available" as const;
  }

  return "unknown" as const;
}

function getInboxConversationWhatsappAvailabilityFromMetadata(conversation?: InboxConversation | null) {
  const queue = getInboxVendasAgendaQueue(conversation);
  const queueStatus = String(queue?.whatsappAvailabilityStatus || "").trim().toLowerCase();
  if (queueStatus === "unavailable") return "unavailable" as const;
  if (queueStatus === "available") return "available" as const;

  const metadata = getInboxConversationMetadata(conversation);
  const directStatus = String(
    metadata?.whatsappAvailabilityStatus ||
    metadata?.vendasWhatsappAvailabilityStatus ||
    "",
  ).trim().toLowerCase();
  if (directStatus === "unavailable") return "unavailable" as const;
  if (directStatus === "available") return "available" as const;

  return "unknown" as const;
}

function getCustomerConversationCardPhoneDigits(
  payload: CustomerConversationCardPayload | null,
  conversation?: InboxConversation | null,
) {
  return String(payload?.customer?.phoneNormalized || payload?.customer?.phone || conversation?.customer?.phone || "")
    .replace(/\D/g, "");
}

function normalizeConversationDisplayNameCandidate(
  value: unknown,
  phone?: string | null,
) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (!normalized) return null;

  const lowered = normalized.toLowerCase();
  if (lowered === "você" || lowered === "voce" || lowered === "you" || lowered === "eu") {
    return null;
  }
  if (lowered.includes("@lid") || lowered.includes("@s.whatsapp.net")) {
    return null;
  }
  if (/^\d{14,}$/.test(normalized.replace(/\s+/g, ""))) {
    return null;
  }

  const candidateDigits = normalized.replace(/\D/g, "");
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  if (candidateDigits && phoneDigits && candidateDigits === phoneDigits) {
    return null;
  }

  return normalized;
}

function getInboxConversationMetadata(
  conversation?: InboxConversation | null,
): Record<string, unknown> | null {
  const metadata = conversation?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

function parseInboxBooleanFlag(raw: unknown) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim";
}

function hasConversationUnavailableWhatsapp(
  conversationId: string | null | undefined,
  cache: Map<string, CustomerConversationCardPayload>,
  currentCard: CustomerConversationCardPayload | null,
  conversation?: InboxConversation | null,
) {
  if (getInboxConversationWhatsappAvailabilityFromMetadata(conversation) === "unavailable") return true;
  const normalizedId = String(conversationId || "").trim();
  if (!normalizedId) return false;
  const payload = currentCard && String(currentCard?.lead?.id || "").trim() !== ""
    ? cache.get(normalizedId) || currentCard
    : cache.get(normalizedId) || currentCard;
  return getCustomerConversationCardWhatsappAvailability(payload) === "unavailable";
}

function isInboxConversationArchived(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  if (!metadata) return false;
  return [
    metadata.whatsappArchived,
    metadata.chatArchived,
    metadata.isArchived,
    metadata.archived,
    metadata.whatsappChatArchived,
  ].some((value) => parseInboxBooleanFlag(value));
}

function parseInboxDateOnlyKey(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeInboxComparableDate(value: unknown) {
  const asDateOnly = parseInboxDateOnlyKey(String(value || ""));
  if (asDateOnly) return asDateOnly;
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameInboxCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isInboxWebscrapingToday(conversation?: InboxConversation | null) {
  if (!conversation) return false;
  const vendasAgendaQueue = getInboxVendasAgendaQueue(conversation);
  if (parseInboxBooleanFlag(vendasAgendaQueue?.active)) return true;

  const metadata = getInboxConversationMetadata(conversation);
  const sourceCandidates = [
    conversation.latestSourceModule,
    metadata?.latestSourceModule,
    metadata?.sourceModule,
    metadata?.originFlow,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  const fromWebscraping = sourceCandidates.some((value) => value.includes("webscraping"));
  if (!fromWebscraping) return false;

  const activityAt = normalizeInboxComparableDate(getInboxConversationActivityAt(conversation));
  if (!activityAt) return false;
  return isSameInboxCalendarDay(activityAt, new Date());
}

function getInboxConversationQueue(
  conversation: InboxConversation,
  manualQueueOverrides?: Record<string, InboxQueue>,
): InboxQueue {
  const manualQueue = manualQueueOverrides?.[String(conversation.id)];
  if (manualQueue && INBOX_QUEUE_ORDER.includes(manualQueue)) {
    return manualQueue;
  }
  const metadata = getInboxConversationMetadata(conversation);
  const vendasAgendaQueue = getInboxVendasAgendaQueue(conversation);
  if (
    parseInboxBooleanFlag(metadata?.inboxLocalDeleted) ||
    parseInboxBooleanFlag(metadata?.localDeleted)
  ) {
    return "archived";
  }
  const persistedQueue = String(
    metadata?.inboxManualQueueOverride || vendasAgendaQueue?.manualQueueOverride || "",
  )
    .trim()
    .toLowerCase();
  if (INBOX_QUEUE_ORDER.includes(persistedQueue as InboxQueue)) {
    return persistedQueue as InboxQueue;
  }

  if (isInboxConversationArchived(conversation)) return "archived";
  if (isInboxGroupRemoteJid(extractInboxRawContact(conversation))) return "groups";
  if (Number(conversation.recoveryOpenAmount || 0) > 0) return "recovery";
  if (isInboxWebscrapingToday(conversation)) return "scheduled";
  if (conversation.botActive === true && !conversation.humanAssigned) return "bot";
  return "all";
}

function getInboxConversationUnreadCount(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  const unreadCount = Number(metadata?.whatsappUnreadCount || 0);
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) return 0;
  return Math.floor(unreadCount);
}

function getInboxMergedConversationIds(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  const mergedIds = Array.isArray(metadata?.__mergedConversationIds)
    ? metadata.__mergedConversationIds
    : null;
  const normalized = (mergedIds || [conversation?.id])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function getInboxVendasAgendaQueue(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  if (
    !metadata?.vendasAgendaQueue ||
    typeof metadata.vendasAgendaQueue !== "object" ||
    Array.isArray(metadata.vendasAgendaQueue)
  ) {
    return null;
  }
  return metadata.vendasAgendaQueue as VendasAgendaQueueMetadata;
}

function getInboxVendasAgendaPendingDraft(conversation?: InboxConversation | null) {
  const queue = getInboxVendasAgendaQueue(conversation);
  if (!queue || !parseInboxBooleanFlag(queue.active)) return null;
  if (parseInboxBooleanFlag(queue.manualSent) || String(queue.manualSentAt || "").trim()) return null;
  if (queue.draftPending === false) return null;
  const draftMessage = String(queue.draftMessage || "").trim();
  return draftMessage || null;
}

function isInboxGroupRemoteJid(raw: string | null | undefined) {
  const value = String(raw || "").trim().toLowerCase();
  return value.includes("@g.us");
}

function getInboxStableRemoteKey(conversation?: InboxConversation | null) {
  return String(extractInboxRawContact(conversation) || "").trim().toLowerCase();
}

function resolveInboxAvatarUrl(conversation?: InboxConversation | null) {
  if (!conversation) return null;
  const metadata = getInboxConversationMetadata(conversation);
  const candidates = [
    conversation.customer?.avatarUrl,
    metadata?.whatsappAvatarUrl,
    metadata?.avatarUrl,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (!normalized) continue;
    return toAbsoluteAssetUrl(normalized);
  }

  return null;
}

function resolveInboxConversationDisplayName(conversation?: InboxConversation | null) {
  if (!conversation) return "Cliente";
  const phone = String(conversation.customer?.phone || "").trim();
  const metadata = getInboxConversationMetadata(conversation);
  const candidates = [
    conversation.customer?.name,
    metadata?.whatsappContactName,
    metadata?.waNickname,
    metadata?.whatsappName,
    metadata?.whatsappProfileName,
    phone,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeConversationDisplayNameCandidate(candidate, phone);
    if (normalized) return normalized;
  }

  return (
    formatInboxPhoneLabel(extractInboxRawContact(conversation)) ||
    formatInboxPhoneLabel(phone) ||
    "Contato WhatsApp"
  );
}

function getInboxConversationInitials(conversation?: InboxConversation | null) {
  const displayName = resolveInboxConversationDisplayName(conversation);
  const phone = String(conversation?.customer?.phone || "").trim();
  const digits = displayName.replace(/\D/g, "");
  if (digits && digits === phone.replace(/\D/g, "")) {
    return digits.slice(-2).padStart(2, "0");
  }

  const words = displayName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }

  return displayName.slice(0, 2).toUpperCase();
}

function extractInboxRawContact(conversation?: InboxConversation | null) {
  const metadata = getInboxConversationMetadata(conversation);
  const candidates = [
    metadata?.whatsappRemoteJid,
    metadata?.remoteJid,
    metadata?.whatsappRemoteJidAlt,
    metadata?.remoteJidAlt,
    conversation?.customer?.phone,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const nonLid = candidates.find((value) => !value.toLowerCase().includes("@lid"));
  return nonLid || candidates[0] || "";
}

function extractInboxContactDigits(raw: string | null | undefined) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

function formatInboxPhoneLabel(raw: string | null | undefined) {
  const digits = extractInboxContactDigits(raw);
  if (!digits) return null;

  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return digits;
}

function getInboxConversationDisplayPhone(conversation?: InboxConversation | null) {
  if (!conversation) return null;
  return (
    formatInboxPhoneLabel(conversation.customer?.phone) ||
    formatInboxPhoneLabel(extractInboxRawContact(conversation))
  );
}

function isInboxDisplayNameEquivalentToPhone(displayName: string, rawPhone?: string | null) {
  const nameDigits = displayName.replace(/\D/g, "");
  const phoneDigits = extractInboxContactDigits(rawPhone);
  return Boolean(nameDigits && phoneDigits && nameDigits === phoneDigits);
}

function getInboxConversationIdentityAliases(conversation?: InboxConversation | null) {
  if (!conversation) return ["conversation:none"];
  const aliases = new Set<string>();
  const rawContact = extractInboxRawContact(conversation);
  const stableRemoteKey = getInboxStableRemoteKey(conversation);
  if (stableRemoteKey) aliases.add(`jid:${stableRemoteKey}`);
  const phoneDigits = extractInboxContactDigits(rawContact);
  if (phoneDigits && !isInboxGroupRemoteJid(rawContact)) aliases.add(`phone:${phoneDigits}`);

  const conversationId = normalizeInboxConversationId(conversation.id);
  if (conversationId) aliases.add(`conversation:${conversationId}`);
  return Array.from(aliases);
}

function isInboxConversationHiddenByDelete(
  conversation: InboxConversation | null | undefined,
  deletedAliases: DeletedConversationAliasMap,
) {
  void conversation;
  void deletedAliases;
  return false;
}

function getInboxConversationQualityScore(conversation: InboxConversation) {
  const hasPhone = Boolean(extractInboxContactDigits(extractInboxRawContact(conversation)));
  const hasAvatar = Boolean(resolveInboxAvatarUrl(conversation));
  const displayName = resolveInboxConversationDisplayName(conversation);
  const hasRealName = !isInboxDisplayNameEquivalentToPhone(
    displayName,
    extractInboxRawContact(conversation),
  );
  const hasSharedProfile = Boolean(String(conversation.customer?.sharedProfile?.profileId || "").trim());
  const hasCustomerProfile = Boolean(String(conversation.customer?.customerProfileId || "").trim());
  const hasRecoveryLink = Boolean(String(conversation.recoveryCustomerId || "").trim());
  const messageCount = Array.isArray(conversation.messages) ? conversation.messages.length : 0;

  return (
    (hasRealName ? 8 : 0) +
    (hasPhone ? 6 : 0) +
    (hasAvatar ? 4 : 0) +
    (hasSharedProfile ? 4 : 0) +
    (hasCustomerProfile ? 3 : 0) +
    (hasRecoveryLink ? 2 : 0) +
    Math.min(messageCount, 3)
  );
}

function mergeInboxMessageLists(
  leftMessages?: InboxMessage[] | null,
  rightMessages?: InboxMessage[] | null,
) {
  const merged = [...(Array.isArray(leftMessages) ? leftMessages : []), ...(Array.isArray(rightMessages) ? rightMessages : [])];
  const byId = new Map<string, InboxMessage>();
  for (const message of merged) {
    byId.set(String(message.id), message);
  }

  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = new Date(String(left.createdAt || "")).getTime();
    const rightTime = new Date(String(right.createdAt || "")).getTime();
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });
}

function mergeInboxConversations(
  current: InboxConversation,
  incoming: InboxConversation,
) {
  const currentScore = getInboxConversationQualityScore(current);
  const incomingScore = getInboxConversationQualityScore(incoming);
  const shouldPreferIncoming =
    incomingScore > currentScore ||
    (incomingScore === currentScore &&
      new Date(getInboxConversationActivityAt(incoming)).getTime() >
        new Date(getInboxConversationActivityAt(current)).getTime());
  const primary = shouldPreferIncoming ? incoming : current;
  const secondary = primary === incoming ? current : incoming;

  const mergedMessages = mergeInboxMessageLists(primary.messages, secondary.messages);
  const mergedMetadata = {
    ...((secondary.metadata as Record<string, unknown> | null | undefined) || {}),
    ...((primary.metadata as Record<string, unknown> | null | undefined) || {}),
    __mergedConversationIds: Array.from(
      new Set([
        ...getInboxMergedConversationIds(primary),
        ...getInboxMergedConversationIds(secondary),
      ]),
    ),
  };

  return {
    ...secondary,
    ...primary,
    metadata: mergedMetadata,
    customer: {
      ...secondary.customer,
      ...primary.customer,
      name:
        normalizeConversationDisplayNameCandidate(primary.customer?.name, primary.customer?.phone) ||
        normalizeConversationDisplayNameCandidate(secondary.customer?.name, secondary.customer?.phone) ||
        primary.customer?.name ||
        secondary.customer?.name ||
        null,
      phone:
        extractInboxContactDigits(extractInboxRawContact(primary))
          ? String(primary.customer?.phone || extractInboxRawContact(primary) || "").trim()
          : String(secondary.customer?.phone || extractInboxRawContact(secondary) || "").trim(),
      avatarUrl:
        String(primary.customer?.avatarUrl || "").trim() ||
        String(secondary.customer?.avatarUrl || "").trim() ||
        null,
      sharedProfile: primary.customer?.sharedProfile || secondary.customer?.sharedProfile || null,
    },
    messages: mergedMessages,
  };
}

function mergeDuplicateInboxConversations(conversationList: InboxConversation[]) {
  const source = Array.isArray(conversationList) ? conversationList : [];
  if (source.length <= 1) return source;

  const parent = source.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[rightRoot] = leftRoot;
    }
  };

  const aliasToFirstIndex = new Map<string, number>();
  source.forEach((conversation, index) => {
    for (const alias of getInboxConversationIdentityAliases(conversation)) {
      const first = aliasToFirstIndex.get(alias);
      if (first === undefined) {
        aliasToFirstIndex.set(alias, index);
      } else {
        union(first, index);
      }
    }
  });

  const groups = new Map<number, InboxConversation[]>();
  source.forEach((conversation, index) => {
    const root = find(index);
    const list = groups.get(root);
    if (list) {
      list.push(conversation);
    } else {
      groups.set(root, [conversation]);
    }
  });

  return Array.from(groups.values()).map((group) =>
    group.slice(1).reduce((acc, item) => mergeInboxConversations(acc, item), group[0]),
  );
}

function getInboxConversationActivityAt(
  conversation?: Partial<Pick<InboxConversation, "createdAt" | "updatedAt" | "lastMessageAt" | "blockedAt" | "messages">> | null,
) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const messageCandidates = [
    conversation?.lastMessageAt,
    ...messages.map((message) => message.createdAt),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const latestMessageAt = messageCandidates.reduce((latest, candidate) => {
    if (!latest) return candidate;
    const latestTime = new Date(latest).getTime();
    const candidateTime = new Date(candidate).getTime();
    if (!Number.isFinite(candidateTime)) return latest;
    if (!Number.isFinite(latestTime) || candidateTime > latestTime) {
      return candidate;
    }
    return latest;
  }, "");
  if (latestMessageAt) return latestMessageAt;

  const fallbackCandidates = [
    conversation?.updatedAt,
    conversation?.blockedAt,
    conversation?.createdAt,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (fallbackCandidates.length === 0) return "";
  return fallbackCandidates.reduce((latest, candidate) => {
    if (!latest) return candidate;
    const latestTime = new Date(latest).getTime();
    const candidateTime = new Date(candidate).getTime();
    if (!Number.isFinite(candidateTime)) return latest;
    if (!Number.isFinite(latestTime) || candidateTime > latestTime) {
      return candidate;
    }
    return latest;
  }, "");
}

function getInboxConversationFreshness(
  conversation?:
    | Pick<InboxConversation, "createdAt" | "blockedAt" | "messages">
    | null,
) {
  return getInboxConversationActivityAt(conversation);
}

function getInboxConversationPreview(conversation?: InboxConversation | null) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const latestMessage = [...messages].sort((left, right) => {
    const leftTime = new Date(String(left.createdAt || "")).getTime();
    const rightTime = new Date(String(right.createdAt || "")).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  })[0];
  const preview = String(getMessagePreview(latestMessage) || "").trim();
  if (preview) return preview;
  if (!conversation) return "";
  const pendingDraft = getInboxVendasAgendaPendingDraft(conversation);
  if (pendingDraft) return `Roteiro pendente: ${pendingDraft}`;
  if (isAtendimentoAgendaConversation(conversation)) return "Agendamento em andamento";
  if (conversation.isBlocked) return "Contato bloqueado";
  if (conversation.status === "closed") return "Conversa encerrada";
  return "Sem mensagens ainda";
}

function getInboxConversationSubtitle(conversation?: InboxConversation | null) {
  if (!conversation) return undefined;
  const rawContact = extractInboxRawContact(conversation);
  if (isInboxGroupRemoteJid(rawContact)) {
    return "Grupo";
  }
  return undefined;
}

function parseTemplateButtonLines(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeMetaTemplatesPayload(
  payload: RecoveryMetaTemplatesPayload | null | undefined,
): RecoveryMetaTemplatesPayload {
  const counters = payload?.counters;
  return {
    ...DEFAULT_META_TEMPLATES_PAYLOAD,
    ...(payload || {}),
    syncError:
      payload?.syncError !== undefined && payload?.syncError !== null
        ? String(payload.syncError)
        : null,
    counters: {
      total: Number(counters?.total || 0),
      approved: Number(counters?.approved || 0),
      pending: Number(counters?.pending || 0),
      rejected: Number(counters?.rejected || 0),
      hbxActive: Number(counters?.hbxActive || 0),
      eligible: Number(counters?.eligible || 0),
    },
    templates: Array.isArray(payload?.templates) ? payload.templates : [],
    history: Array.isArray(payload?.history) ? payload.history : [],
  };
}

function fillTemplateComposerFromTemplate(template: RecoveryMetaTemplateItem): TemplateComposer {
  const normalized = template.normalized;
  const buttons =
    Array.isArray(normalized?.buttons) && normalized.buttons.length > 0
      ? normalized.buttons.map((button) => String(button.text || "").trim()).filter(Boolean)
      : Array.isArray(template.buttonLabels)
        ? template.buttonLabels
        : [];

  return {
    name: String(template.name || ""),
    category:
      String(template.category || "").toUpperCase() === "MARKETING"
        ? "MARKETING"
        : String(template.category || "").toUpperCase() === "AUTHENTICATION"
          ? "AUTHENTICATION"
          : "UTILITY",
    language: String(template.language || "pt_BR"),
    bodyText: String(normalized?.body?.text ?? template.bodyText ?? ""),
    footerText: String(normalized?.footer?.text ?? template.footerText ?? ""),
    buttonsText: buttons.join("\n"),
    activateInHbx: Boolean(template.hbxActive),
    headerFormat:
      normalized?.header?.format === "TEXT" ||
      normalized?.header?.format === "IMAGE" ||
      normalized?.header?.format === "DOCUMENT" ||
      normalized?.header?.format === "VIDEO"
        ? normalized.header.format
        : "NONE",
    headerText: String(normalized?.header?.text ?? template.headerText ?? ""),
    headerHandle: String(normalized?.header?.exampleHandle ?? template.headerHandle ?? ""),
    headerMediaUrl: String(normalized?.header?.mediaUrl ?? template.headerMediaUrl ?? ""),
  };
}

function shouldReloadInboxConversation(
  summary?: InboxConversation | null,
  detail?: InboxConversation | null,
) {
  if (!summary) return false;
  if (!detail) return true;
  if (summary.id !== detail.id) return true;
  return getInboxConversationFreshness(summary) !== getInboxConversationFreshness(detail);
}

function mergeInboxConversationSummary(
  summary?: InboxConversation | null,
  detail?: InboxConversation | null,
) {
  if (!summary && !detail) return null;
  if (!summary) return detail || null;
  if (!detail || detail.id !== summary.id) return summary;

  const summaryMetadata =
    (summary.metadata as Record<string, unknown> | null | undefined) || {};
  const detailMetadata =
    (detail.metadata as Record<string, unknown> | null | undefined) || {};
  const mergedCustomerName =
    normalizeConversationDisplayNameCandidate(detail.customer?.name, detail.customer?.phone) ||
    normalizeConversationDisplayNameCandidate(summary.customer?.name, summary.customer?.phone) ||
    detail.customer?.name ||
    summary.customer?.name ||
    null;

  return {
    ...summary,
    ...detail,
    metadata: {
      ...summaryMetadata,
      ...detailMetadata,
      __mergedConversationIds: Array.from(
        new Set([
          ...getInboxMergedConversationIds(summary),
          ...getInboxMergedConversationIds(detail),
        ]),
      ),
    },
    customer: {
      ...summary.customer,
      ...detail.customer,
      name: mergedCustomerName,
      phone:
        String(detail.customer?.phone || "").trim() ||
        String(summary.customer?.phone || "").trim() ||
        "",
      avatarUrl:
        String(detail.customer?.avatarUrl || "").trim() ||
        String(summary.customer?.avatarUrl || "").trim() ||
        null,
      sharedProfile:
        detail.customer?.sharedProfile || summary.customer?.sharedProfile || null,
    },
    messages:
      Array.isArray(detail.messages) && detail.messages.length > 0
        ? detail.messages
        : summary.messages,
  };
}

function markInboxConversationAsSummaryOnly(conversation?: InboxConversation | null) {
  if (!conversation) return null;
  const metadata = getInboxConversationMetadata(conversation);
  return {
    ...conversation,
    metadata: {
      ...(metadata || {}),
      __summaryOnly: true,
    },
    messages: [],
  } as InboxConversation;
}

function clearInboxConversationSummaryOnly(conversation?: InboxConversation | null) {
  if (!conversation) return null;
  const metadata = { ...(getInboxConversationMetadata(conversation) || {}) };
  delete metadata.__summaryOnly;
  return {
    ...conversation,
    metadata,
  } as InboxConversation;
}

function isInboxConversationSummaryOnly(conversation?: InboxConversation | null) {
  return Boolean(getInboxConversationMetadata(conversation)?.__summaryOnly);
}

function areInboxMessageListsEquivalent(
  leftMessages?: InboxMessage[] | null,
  rightMessages?: InboxMessage[] | null,
) {
  const left = Array.isArray(leftMessages) ? leftMessages : [];
  const right = Array.isArray(rightMessages) ? rightMessages : [];
  if (left.length !== right.length) return false;

  return left.every((message, index) => {
    const candidate = right[index];
    if (!candidate) return false;
    return (
      String(message.id) === String(candidate.id) &&
      String(message.createdAt || "") === String(candidate.createdAt || "") &&
      String(message.direction || "") === String(candidate.direction || "") &&
      String(message.senderType || "") === String(candidate.senderType || "") &&
      String(message.status || "") === String(candidate.status || "") &&
      String(message.content || "") === String(candidate.content || "")
    );
  });
}

function didInboxConversationViewChange(
  current?: InboxConversation | null,
  next?: InboxConversation | null,
) {
  if (!current && !next) return false;
  if (!current || !next) return true;
  if (current.id !== next.id) return true;

  const comparableFields = [
    "status",
    "routeTarget",
    "routeReason",
    "currentFlow",
    "flowResult",
    "latestSourceModule",
    "isBlocked",
    "blockedAt",
    "blockedReason",
    "humanAssigned",
    "botActive",
    "updatedAt",
    "lastMessageAt",
    "recoveryCustomerId",
    "recoveryCurrentStep",
    "recoveryStatus",
    "recoveryOpenAmount",
    "recoveryTotalPaid",
  ] as const;

  if (
    comparableFields.some(
      (field) => String(current[field] ?? "") !== String(next[field] ?? ""),
    )
  ) {
    return true;
  }

  if (getInboxConversationFreshness(current) !== getInboxConversationFreshness(next)) return true;
  if (
    resolveInboxConversationDisplayName(current) !== resolveInboxConversationDisplayName(next)
  ) {
    return true;
  }
  if (String(current.customer?.phone || "") !== String(next.customer?.phone || "")) return true;
  if (String(resolveInboxAvatarUrl(current) || "") !== String(resolveInboxAvatarUrl(next) || "")) return true;
  if (String(current.customer?.customerProfileId || "") !== String(next.customer?.customerProfileId || "")) return true;
  if (String(current.customer?.email || "") !== String(next.customer?.email || "")) return true;
  if (String(current.customer?.document || "") !== String(next.customer?.document || "")) return true;
  if (String(current.customer?.customerProfileStatus || "") !== String(next.customer?.customerProfileStatus || "")) return true;
  if (String(current.customer?.registrationStatus || "") !== String(next.customer?.registrationStatus || "")) return true;

  return !areInboxMessageListsEquivalent(current.messages, next.messages);
}

function sortInboxConversationsByActivity(conversationList: InboxConversation[]) {
  return [...conversationList].sort((left, right) => {
    const leftTime = new Date(getInboxConversationActivityAt(left)).getTime();
    const rightTime = new Date(getInboxConversationActivityAt(right)).getTime();
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    if (safeRight !== safeLeft) return safeRight - safeLeft;
    const leftId = Number(left.id);
    const rightId = Number(right.id);
    return (Number.isFinite(rightId) ? rightId : 0) - (Number.isFinite(leftId) ? leftId : 0);
  });
}

function sortInboxMessagesChronologically(messages: InboxMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(String(left.createdAt || "")).getTime();
    const rightTime = new Date(String(right.createdAt || "")).getTime();
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    if (safeLeft !== safeRight) return safeLeft - safeRight;
    const leftId = Number(left.id);
    const rightId = Number(right.id);
    return (Number.isFinite(leftId) ? leftId : 0) - (Number.isFinite(rightId) ? rightId : 0);
  });
}

function getInboxMessageStableKey(message?: InboxMessage | null) {
  if (!message) return "";
  const metadata = (message.metadata || {}) as Record<string, unknown>;
  return String(
    metadata.providerMessageId ||
      metadata.rawProviderMessageId ||
      message.id ||
      `${message.direction}:${message.createdAt}:${message.content}`,
  );
}

function getInboxLatestMessage(messages?: InboxMessage[] | null) {
  const sorted = sortInboxMessagesChronologically(Array.isArray(messages) ? messages : []);
  return sorted[sorted.length - 1] || null;
}

function isInboxInboundMessage(message?: InboxMessage | null) {
  if (!message) return false;
  return String(message.direction || "").trim().toLowerCase() === "inbound";
}

function formatInboxIncomingNotice(conversation: InboxConversation, message: InboxMessage) {
  const name = resolveInboxConversationDisplayName(conversation) || "Contato";
  const preview = getMessagePreview(message).trim() || "Nova mensagem recebida.";
  return `${name}: ${preview.length > 90 ? `${preview.slice(0, 90)}...` : preview}`;
}

function normalizeInboxConversationList(conversationList: InboxConversation[]) {
  const normalized = (Array.isArray(conversationList) ? conversationList : [])
    .map((conversation) => normalizeInboxConversationPayload(conversation))
    .filter((conversation): conversation is InboxConversation => Boolean(conversation));

  return sortInboxConversationsByActivity(
    mergeDuplicateInboxConversations(sortInboxConversationsByActivity(normalized)),
  );
}

function areInboxConversationListsEquivalent(
  currentList?: InboxConversation[] | null,
  nextList?: InboxConversation[] | null,
) {
  const current = Array.isArray(currentList) ? currentList : [];
  const next = Array.isArray(nextList) ? nextList : [];
  if (current.length !== next.length) return false;

  return current.every((conversation, index) =>
    !didInboxConversationViewChange(conversation, next[index]),
  );
}

function mapInboxBubbleTone(message: InboxMessage) {
  const direction = String(message.direction || "").trim().toLowerCase();
  const senderType = String(message.senderType || "").trim().toLowerCase();
  if (senderType === "system") return "system" as const;
  if (senderType === "human") return "human" as const;
  if (direction === "outbound") return "outbound" as const;
  return "inbound" as const;
}

function formatInboxMessageTimeLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInboxMessageDayLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString().slice(0, 10);
  const today = new Date();
  const isSameDay =
    parsed.getDate() === today.getDate() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getFullYear() === today.getFullYear();
  if (isSameDay) return "Hoje";
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function isInboxSameCalendarDay(
  leftDate: string | null | undefined,
  rightDate: string | null | undefined,
) {
  if (!leftDate || !rightDate) return false;
  const left = new Date(leftDate);
  const right = new Date(rightDate);
  return (
    left.getDate() === right.getDate() &&
    left.getMonth() === right.getMonth() &&
    left.getFullYear() === right.getFullYear()
  );
}

function removeButtonFromSections(config: AtendimentoBotConfig, actionId: string): AtendimentoBotConfig {
  return {
    ...config,
    welcomeButtons: config.welcomeButtons.filter((button) => button.actionId !== actionId),
    returningCustomerButtons: config.returningCustomerButtons.filter(
      (button) => button.actionId !== actionId,
    ),
    mainMenuButtons: config.mainMenuButtons.filter((button) => button.actionId !== actionId),
    recoveryDetectedButtons: config.recoveryDetectedButtons.filter(
      (button) => button.actionId !== actionId,
    ),
    postActionButtons: config.postActionButtons.filter((button) => button.actionId !== actionId),
  };
}

const COMMON_EMOJIS = [
  "😀", "😂", "🥲", "😊", "🥰", "😍", "😘", "😭", "😅", "🤣",
  "😤", "😡", "🤔", "😴", "🤗", "😱", "😎", "🥺", "😒", "😔",
  "👍", "👏", "🙏", "🤝", "💪", "🫡", "🫶", "✌️", "👀", "💯",
  "❤️", "🔥", "⭐", "✨", "🎉", "✅", "❌", "🚀", "💬", "😬",
];

function MessageStatusTick({ status }: { status: string }) {
  const s = String(status || "").toLowerCase();
  if (s === "read") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3 }} title="Lido">
        <svg width={18} height={10} viewBox="0 0 18 10" fill="none" aria-hidden="true">
          <path d="M1 5l4 4L13 1" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 5l4 4L17 1" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (s === "delivered") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3 }} title="Entregue">
        <svg width={18} height={10} viewBox="0 0 18 10" fill="none" aria-hidden="true">
          <path d="M1 5l4 4L13 1" stroke="#8696a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 5l4 4L17 1" stroke="#8696a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (s === "sent") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3 }} title="Enviado">
        <svg width={12} height={10} viewBox="0 0 12 10" fill="none" aria-hidden="true">
          <path d="M1 5l4 4L11 1" stroke="#8696a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (s === "failed" || s === "error") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3, color: "#ff6b6b", fontWeight: 700, fontSize: "0.78rem" }} title="Falha no envio">!</span>
    );
  }
  if (s === "pending" || s === "queued" || s === "processing") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 3 }} title="Enviando">
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <circle cx="5" cy="5" r="4" stroke="#8696a0" strokeWidth="1.5" />
          <path d="M5 2.5V5l2 1.5" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return null;
}

export default function InboxClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = useMemo(
    () => normalizeInboxTab(searchParams?.get("atendimentoTab")) || "messages",
    [searchParams],
  );
  const requestedQueue = useMemo(
    () => normalizeInboxQueueParam(searchParams?.get("atendimentoQueue") || searchParams?.get("queue")),
    [searchParams],
  );
  const requestedSection = useMemo(
    () => normalizeAtendimentoSectionParam(searchParams?.get("atendimentoSection")),
    [searchParams],
  );
  const requestedAgendaStudioOpen = useMemo(
    () => searchParams?.get("agendaStudio") === "1",
    [searchParams],
  );
  const requestedAgendaMode = useMemo<AgendaMode>(
    () => (searchParams?.get("agendaMode") === "sales" ? "sales" : "bot"),
    [searchParams],
  );
  const requestedAgendaReturnTo = useMemo(
    () => String(searchParams?.get("returnTo") || "").trim(),
    [searchParams],
  );
  const requestedConversationId = useMemo(
    () => normalizeInboxConversationId(searchParams?.get("conversationId") || searchParams?.get("selectedConversationId")),
    [searchParams],
  );
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<InboxTab>(requestedTab);
  const [inboxQueue, setInboxQueue] = useState<InboxQueue>("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const [manualQueueOverrides, setManualQueueOverrides] = useState<Record<string, InboxQueue>>({});
  const [deletedConversationAliases, setDeletedConversationAliases] = useState<DeletedConversationAliasMap>({});
  const [draggedConversationId, setDraggedConversationId] = useState<string | null>(null);
  const [draggedQueueId, setDraggedQueueId] = useState<InboxQueue | null>(null);
  const [dropOverQueue, setDropOverQueue] = useState<InboxQueue | null>(null);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [olderMessagesHasMore, setOlderMessagesHasMore] = useState(false);
  const [olderMessagesBefore, setOlderMessagesBefore] = useState<string | null>(null);
  const [loadingBot, setLoadingBot] = useState(false);
  const [savingBot, setSavingBot] = useState(false);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [agendaDirty, setAgendaDirty] = useState(false);
  const [botConfigDirtyFromAgendaReset, setBotConfigDirtyFromAgendaReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationListError, setConversationListError] = useState<string | null>(null);
  const [conversationDetailError, setConversationDetailError] = useState<string | null>(null);
  const [inboxRealtimeFallbackActive, setInboxRealtimeFallbackActive] = useState(false);
  const [lastConversationSyncAt, setLastConversationSyncAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<InboxMessage | null>(null);
  const [imagePreview, setImagePreview] = useState<InboxAttachmentPreview | null>(null);
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; url: string; mimeType: string; seconds: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [openedAsset, setOpenedAsset] = useState<OpenedInboxAsset | null>(null);
  const [failedInboxMediaUrls, setFailedInboxMediaUrls] = useState<Record<string, true>>({});
  const [queueActionConversationId, setQueueActionConversationId] = useState<string | null>(null);
  const [queueActionMenuPosition, setQueueActionMenuPosition] = useState<QueueActionMenuPosition | null>(null);
  const [messageReactionTargetId, setMessageReactionTargetId] = useState<string | null>(null);
  const [blockDialog, setBlockDialog] = useState<{ conversationId: string; reason: string } | null>(null);
  const [deleteConversationDialog, setDeleteConversationDialog] = useState<{ conversationId: string } | null>(null);
  const [deleteMessageDialog, setDeleteMessageDialog] = useState<{ messageId: string } | null>(null);
  const [revealedDeletedMessageIds, setRevealedDeletedMessageIds] = useState<Record<string, boolean>>({});
  const [customerConversationCard, setCustomerConversationCard] =
    useState<CustomerConversationCardPayload | null>(null);
  const [customerConversationCardDraft, setCustomerConversationCardDraft] =
    useState<CustomerConversationCardDraft>({
      doNotCall: false,
      returnAt: "",
      observations: "",
    });
  const [loadingCustomerConversationCard, setLoadingCustomerConversationCard] = useState(false);
  const [savingCustomerConversationCard, setSavingCustomerConversationCard] = useState(false);
  const [customerConversationCardError, setCustomerConversationCardError] = useState<string | null>(null);
  const [customerCardShortcutOpen, setCustomerCardShortcutOpen] = useState(false);
  const [agendaStudioOpen, setAgendaStudioOpen] = useState(false);
  const [automationStudioOpen, setAutomationStudioOpen] = useState(false);
  const [templatesStudioOpen, setTemplatesStudioOpen] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [contextTab, setContextTab] = useState<ContextTab>("conversa");
  const [internalNote, setInternalNote] = useState("");
  const [botConfig, setBotConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(
    DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  );
  const [metaTemplates, setMetaTemplates] = useState<RecoveryMetaTemplatesPayload>(
    DEFAULT_META_TEMPLATES_PAYLOAD,
  );
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [editingTemplateLabel, setEditingTemplateLabel] = useState<string | null>(null);
  const [templateComposer, setTemplateComposer] = useState<TemplateComposer>(
    DEFAULT_TEMPLATE_COMPOSER,
  );
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
  const [expandedAlerts, setExpandedAlerts] = useState<Record<InboxAlertKind | "system_notice", boolean>>({
    human_queue: false,
    new_message: false,
    system_notice: false,
  });
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<InboxAlertKind, boolean>>({
    human_queue: false,
    new_message: false,
  });
  const previousHumanCountRef = useRef(0);
  const previousNewCountRef = useRef(0);
  const humanAlertTimerRef = useRef<number | null>(null);
  const newAlertTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const skipNotePersistRef = useRef(false);
  const chatTimelineRef = useRef<HTMLDivElement | null>(null);
  const chatComposerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const queueActionMenuRef = useRef<HTMLDivElement | null>(null);
  const messageReactionPickerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null);
  const recordingLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingMaxPeakRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsRef = useRef(0);
  const customerReturnInputRef = useRef<HTMLInputElement | null>(null);
  const customerReturnAutoSaveTimerRef = useRef<number | null>(null);
  const conversationsRef = useRef<InboxConversation[]>([]);
  const conversationDetailCacheRef = useRef<Map<string, InboxConversation>>(new Map());
  const customerConversationCardCacheRef = useRef<Map<string, CustomerConversationCardPayload>>(new Map());
  const manualQueueOverridesRef = useRef<Record<string, InboxQueue>>({});
  const deletedConversationAliasesRef = useRef<DeletedConversationAliasMap>({});
  const selectedIdRef = useRef<string | null>(null);
  const selectedConversationRef = useRef<InboxConversation | null>(null);
  const activeConversationLatestMessageKeyRef = useRef<Record<string, string>>({});
  const inboxQueueRef = useRef<InboxQueue>("all");
  const conversationLoadTokenRef = useRef(0);
  const autoPrefetchedOlderMessagesRef = useRef<Record<string, true>>({});
  const botConfigLoadedRef = useRef(false);
  const agendaConfigLoadedRef = useRef(false);
  const sendTextDirtyRef = useRef(false);
  const lastSectionChangeRef = useRef<{ section: AtendimentoSection | null; at: number }>({
    section: null,
    at: 0,
  });
  const skipAutomationAutoOpenRef = useRef(false);
  const deferredConversationSearch = useDeferredValue(conversationSearch);
  const inboxBootstrapLaunchNotice = useQuickLaunchNotice();
  const initialMirrorBootstrapStartedRef = useRef(false);
  const [inboxBootstrapProgressLabel, setInboxBootstrapProgressLabel] = useState<string | null>(null);
  const [inboxBootstrapProgressValueLabel, setInboxBootstrapProgressValueLabel] = useState<string | null>(null);
  const [inboxBootstrapDetailRows, setInboxBootstrapDetailRows] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [inboxBootstrapCelebrate, setInboxBootstrapCelebrate] = useState(false);
  const inboxBootstrapStageTimerRef = useRef<number | null>(null);

  const markInboxMediaUrlFailed = useCallback((url?: string | null) => {
    const normalized = String(url || "").trim();
    if (!normalized) return;
    setFailedInboxMediaUrls((current) =>
      current[normalized] ? current : { ...current, [normalized]: true },
    );
  }, []);

  useEffect(() => {
    setFailedInboxMediaUrls((current) => (Object.keys(current).length ? {} : current));
  }, [selectedId, selectedConversation?.updatedAt, selectedConversation?.messages?.length]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handle = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!openedAsset) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenedAsset(null);
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openedAsset]);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (
        queueActionMenuRef.current &&
        !queueActionMenuRef.current.contains(event.target as Node)
      ) {
        setQueueActionConversationId(null);
      }
      if (
        messageReactionPickerRef.current &&
        !messageReactionPickerRef.current.contains(event.target as Node)
      ) {
        setMessageReactionTargetId(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (!queueActionConversationId) {
      setQueueActionMenuPosition(null);
      return;
    }

    const closeMenu = () => {
      setQueueActionConversationId(null);
      setQueueActionMenuPosition(null);
    };

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [queueActionConversationId]);

  const toggleQueueConversationMenu = useCallback(
    (conversationId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setQueueActionConversationId((current) => {
        if (current === conversationId) {
          setQueueActionMenuPosition(null);
          return null;
        }
        setQueueActionMenuPosition({
          top: rect.bottom + 8,
          left: Math.max(12, rect.right - 144),
        });
        return conversationId;
      });
    },
    [],
  );

  useEffect(() => {
    if (skipAutomationAutoOpenRef.current) {
      const timer = window.setTimeout(() => {
        skipAutomationAutoOpenRef.current = false;
      }, 50);
      return () => window.clearTimeout(timer);
    }
    if (requestedTab !== "automation" || automationStudioOpen) return;
    setAutomationStudioOpen(true);
    setAgendaStudioOpen(false);
    setTemplatesStudioOpen(false);
    setActiveTab("messages");
  }, [automationStudioOpen, requestedTab]);

  useEffect(() => {
    if (requestedQueue) {
      setInboxQueue(requestedQueue);
    }
    if (!requestedSection) return;

    setActiveTab("messages");
    setAutomationStudioOpen(false);
    setTemplatesStudioOpen(false);
    if (requestedSection === "agenda") {
      setAgendaStudioOpen(requestedAgendaStudioOpen);
      setContextTab("agenda");
      return;
    }
    if (requestedSection === "automacao") {
      setAutomationStudioOpen(true);
      setAgendaStudioOpen(false);
      return;
    }
    setAgendaStudioOpen(false);
    setContextTab(requestedSection);
  }, [requestedAgendaStudioOpen, requestedQueue, requestedSection]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INBOX_MANUAL_QUEUE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, InboxQueue>;
      if (!parsed || typeof parsed !== "object") return;
      const nextEntries = Object.entries(parsed).filter(
        ([, queue]) => typeof queue === "string" && INBOX_QUEUE_ORDER.includes(queue),
      );
      setManualQueueOverrides(Object.fromEntries(nextEntries));
    } catch {
      // ignore persisted parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INBOX_DELETED_CONVERSATION_ALIASES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const normalized = normalizeDeletedConversationAliasMap(parsed);
      setDeletedConversationAliases(normalized);
      deletedConversationAliasesRef.current = normalized;
    } catch {
      setDeletedConversationAliases({});
      deletedConversationAliasesRef.current = {};
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INBOX_MANUAL_QUEUE_STORAGE_KEY, JSON.stringify(manualQueueOverrides));
  }, [manualQueueOverrides]);

  useEffect(() => {
    deletedConversationAliasesRef.current = deletedConversationAliases;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      INBOX_DELETED_CONVERSATION_ALIASES_STORAGE_KEY,
      JSON.stringify(deletedConversationAliases),
    );
  }, [deletedConversationAliases]);

  useEffect(() => {
    if (!agendaStudioOpen && !automationStudioOpen && !templatesStudioOpen) return;
    const releaseTopbarLock = acquirePopupTopbarLock();
    return releaseTopbarLock;
  }, [agendaStudioOpen, automationStudioOpen, templatesStudioOpen]);

  useEffect(() => {
    if (!agendaStudioOpen && !automationStudioOpen && !templatesStudioOpen) {
      setOverlayVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setOverlayVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [agendaStudioOpen, automationStudioOpen, templatesStudioOpen]);


  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    manualQueueOverridesRef.current = manualQueueOverrides;
  }, [manualQueueOverrides]);

  useEffect(() => {
    inboxQueueRef.current = inboxQueue;
  }, [inboxQueue]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation, selectedId]);

  const rememberConversationDetail = useCallback((conversation?: InboxConversation | null) => {
    if (!conversation || isInboxConversationSummaryOnly(conversation)) return;
    conversationDetailCacheRef.current.set(conversation.id, clearInboxConversationSummaryOnly(conversation) || conversation);
  }, []);

  const clearInboxBootstrapStageTimer = useCallback(() => {
    if (inboxBootstrapStageTimerRef.current !== null && typeof window !== "undefined") {
      window.clearInterval(inboxBootstrapStageTimerRef.current);
    }
    inboxBootstrapStageTimerRef.current = null;
  }, []);

  const closeInboxBootstrapLaunchDialog = useCallback(() => {
    clearInboxBootstrapStageTimer();
    setInboxBootstrapProgressLabel(null);
    setInboxBootstrapProgressValueLabel(null);
    setInboxBootstrapDetailRows([]);
    setInboxBootstrapCelebrate(false);
    inboxBootstrapLaunchNotice.clear();
  }, [clearInboxBootstrapStageTimer, inboxBootstrapLaunchNotice]);

  const buildInboxBootstrapDetailRows = useCallback(
    (payload?: Partial<InboxFullBootstrapPayload> | null) => [
      {
        label: "Motor",
        value: payload?.connected === false ? "Offline" : "Online",
      },
      {
        label: "Contatos",
        value: String(Math.max(0, Number(payload?.contactsSynced || 0))),
      },
      {
        label: "Conversas",
        value: `${Math.max(0, Number(payload?.conversationsMirrored || 0))}/${Math.max(
          0,
          Number(payload?.conversationsDiscovered || 0),
        )}`,
      },
      {
        label: "Mensagens",
        value: String(Math.max(0, Number(payload?.messagesMirrored || 0))),
      },
    ],
    [],
  );

  const runInitialInboxMirrorBootstrap = useCallback(async () => {
    if (typeof window === "undefined") return null;
    if (window.sessionStorage.getItem(INBOX_INITIAL_MIRROR_SESSION_KEY) === "done") {
      return null;
    }

    clearInboxBootstrapStageTimer();
    setInboxBootstrapCelebrate(false);
    setInboxBootstrapDetailRows(buildInboxBootstrapDetailRows());
    setInboxBootstrapProgressLabel(INBOX_BOOTSTRAP_STAGE_SEQUENCE[0].label);
    setInboxBootstrapProgressValueLabel(INBOX_BOOTSTRAP_STAGE_SEQUENCE[0].value);
    inboxBootstrapLaunchNotice.start({
      loadingTitle: "Carregando WhatsApp",
      loadingDescription:
        "Baixando conversas, nomes, fotos e midias do motor para deixar a inbox pronta no backend.",
      successTitle: "Inbox pronta",
      successDescription: "Tudo espelhado no backend. Vamos abrir o Atendimento.",
      ctaLabel: "Abrir inbox",
      onOpen: closeInboxBootstrapLaunchDialog,
    });

    let stageIndex = 0;
    inboxBootstrapStageTimerRef.current = window.setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, INBOX_BOOTSTRAP_STAGE_SEQUENCE.length - 1);
      const stage = INBOX_BOOTSTRAP_STAGE_SEQUENCE[stageIndex];
      setInboxBootstrapProgressLabel(stage.label);
      setInboxBootstrapProgressValueLabel(stage.value);
    }, 900);

    try {
      const payload = await apiFetch<InboxFullBootstrapPayload>("/inbox/bootstrap/full/background?take=120", {
        method: "POST",
      });
      clearInboxBootstrapStageTimer();
      setInboxBootstrapProgressLabel(
        payload.heavySync ? "Espelhamento pesado concluido" : "Espelhamento concluido",
      );
      setInboxBootstrapProgressValueLabel(
        payload.pagesFetched > 0 ? `${payload.pagesFetched} pag.` : "100%",
      );
      setInboxBootstrapDetailRows(buildInboxBootstrapDetailRows(payload));
      setInboxBootstrapCelebrate(Boolean(payload.heavySync));
      window.sessionStorage.setItem(INBOX_INITIAL_MIRROR_SESSION_KEY, "done");
      if (payload.message) {
        setNotice({ tone: "success", text: payload.message });
      }
      inboxBootstrapLaunchNotice.markSuccess({
        successDescription:
          payload.message ||
          "Conversas, nomes, fotos e historico foram puxados do motor e gravados no backend.",
      });
      return payload;
    } catch (bootstrapError) {
      clearInboxBootstrapStageTimer();
      closeInboxBootstrapLaunchDialog();
      throw bootstrapError;
    }
  }, [
    buildInboxBootstrapDetailRows,
    clearInboxBootstrapStageTimer,
    closeInboxBootstrapLaunchDialog,
    inboxBootstrapLaunchNotice,
  ]);

  const bootstrapInbox = useCallback(async (options?: { take?: number }) => {
    const take = Math.max(1, Math.min(200, Number(options?.take || 200) || 200));
    setBootstrapReady(false);
    setLoadingList(true);
    setLoadingConversation(true);
    setError(null);
    setConversationListError(null);
    setConversationDetailError(null);
    try {
      const payload = await apiFetch<InboxBootstrapPayload>(`/inbox/bootstrap?take=${take}`, {
        requireAuth: true,
        timeoutMs: 25000,
      });
      const nextList = normalizeInboxConversationList(
        Array.isArray(payload?.conversations) ? payload.conversations : [],
      ).filter(
        (conversation) =>
          !isInboxConversationHiddenByDelete(conversation, deletedConversationAliasesRef.current),
      );
      const normalizedDetail = normalizeInboxConversationPayload(payload?.selectedConversation);
      const detail =
        normalizedDetail &&
        !isInboxConversationHiddenByDelete(normalizedDetail, deletedConversationAliasesRef.current)
          ? normalizedDetail
          : null;
      const preferredId = detail?.id || nextList[0]?.id || null;
      const summary = preferredId
        ? nextList.find((conversation) => conversation.id === preferredId) || null
        : null;
      const mergedSelected = mergeInboxConversationSummary(summary, detail);

      setConversations(nextList);
      setSelectedId(mergedSelected?.id || preferredId);
      setSelectedConversation(mergedSelected);
      rememberConversationDetail(mergedSelected);
      setOlderMessagesBefore(getInboxOldestMessageDate(mergedSelected?.messages));
      setOlderMessagesHasMore((mergedSelected?.messages?.length || 0) >= INBOX_RECENT_MESSAGES_LIMIT);
      setLastConversationSyncAt(new Date().toISOString());
      setBootstrapReady(true);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar a inbox.";
      setConversationListError(message);
      setError(message);
    } finally {
      setLoadingList(false);
      setLoadingConversation(false);
    }
  }, [rememberConversationDetail]);

  const loadConversation = useCallback(async (
    id: string | null | undefined,
    options?: { silent?: boolean; forceRefresh?: boolean },
  ) => {
    const silent = options?.silent ?? false;
    const forceRefresh = options?.forceRefresh ?? false;
    const conversationId = normalizeInboxConversationId(id);
    if (!conversationId) {
      const message = "Conversa sem identificador valido. Recarregue a fila para sincronizar novamente.";
      setConversationDetailError(message);
      setError(message);
      setOlderMessagesBefore(null);
      setOlderMessagesHasMore(false);
      if (!silent) setLoadingConversation(false);
      return;
    }

    const requestToken = ++conversationLoadTokenRef.current;
    const summary =
      conversationsRef.current.find((conversation) => conversation.id === conversationId) || null;
    const cachedDetail =
      conversationDetailCacheRef.current.get(conversationId) ||
      (selectedConversationRef.current?.id === conversationId &&
        !isInboxConversationSummaryOnly(selectedConversationRef.current)
        ? selectedConversationRef.current
        : null);
    const cachedDetailIsFresh = cachedDetail
      ? !shouldReloadInboxConversation(summary, cachedDetail)
      : false;
    const mergedSummary = mergeInboxConversationSummary(
      summary,
      cachedDetail,
    );
    setSelectedId(conversationId);
    selectedIdRef.current = conversationId;
    if (mergedSummary) {
      const nextConversation =
        cachedDetail || (silent && selectedConversationRef.current?.id === conversationId)
          ? mergedSummary
          : markInboxConversationAsSummaryOnly(mergedSummary);
      setSelectedConversation(nextConversation);
      selectedConversationRef.current = nextConversation;
    } else if (!silent || selectedConversationRef.current?.id !== conversationId) {
      setSelectedConversation(null);
      selectedConversationRef.current = null;
    }
    setConversationDetailError(null);
    if (cachedDetail && cachedDetailIsFresh && !forceRefresh) {
      setOlderMessagesBefore(getInboxOldestMessageDate(cachedDetail.messages));
      setOlderMessagesHasMore((cachedDetail.messages?.length || 0) >= INBOX_RECENT_MESSAGES_LIMIT);
      setLoadingConversation(false);
      setBootstrapReady(true);
      return;
    }
    if (!silent && !cachedDetail) setLoadingConversation(true);
    try {
      const rawData = await apiFetch<InboxConversation>(`/inbox/conversations/${conversationId}`, {
        requireAuth: true,
        timeoutMs: 10000,
      });
      const data = normalizeInboxConversationPayload(rawData);
      if (!data) {
        throw new Error("Conversa sem identificador valido retornada pelo servidor.");
      }

      if (requestToken !== conversationLoadTokenRef.current) {
        return;
      }

      if (isInboxConversationHiddenByDelete(data, deletedConversationAliasesRef.current)) {
        if (selectedIdRef.current === conversationId) {
          setSelectedId(null);
          setSelectedConversation(null);
          selectedIdRef.current = null;
          selectedConversationRef.current = null;
          setOlderMessagesBefore(null);
          setOlderMessagesHasMore(false);
        }
        return;
      }

      const detailedConversation = clearInboxConversationSummaryOnly(data);
      setSelectedConversation((current) =>
        detailedConversation && !(silent && !didInboxConversationViewChange(current, detailedConversation))
          ? detailedConversation
          : current,
      );
      if (detailedConversation) {
        selectedConversationRef.current = detailedConversation;
        rememberConversationDetail(detailedConversation);
        const latestMessage = getInboxLatestMessage(detailedConversation.messages);
        const latestKey = getInboxMessageStableKey(latestMessage);
        if (latestKey) {
          activeConversationLatestMessageKeyRef.current[detailedConversation.id] = latestKey;
        }
        setOlderMessagesBefore(getInboxOldestMessageDate(detailedConversation.messages));
        setOlderMessagesHasMore((detailedConversation.messages?.length || 0) >= INBOX_RECENT_MESSAGES_LIMIT);
      }
      if (data) {
        setSelectedId(data.id);
      }
      setConversationDetailError(null);
      setBootstrapReady(true);
    } catch (loadError) {
      if (requestToken !== conversationLoadTokenRef.current) {
        return;
      }
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar conversa.";
      setConversationDetailError(message);
      setError(message);
    } finally {
      if (!silent && requestToken === conversationLoadTokenRef.current) {
        setLoadingConversation(false);
      }
    }
  }, [rememberConversationDetail]);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = normalizeInboxConversationId(selectedIdRef.current || selectedId);
    const currentConversation =
      selectedConversationRef.current?.id === conversationId ? selectedConversationRef.current : null;
    const before = olderMessagesBefore || getInboxOldestMessageDate(currentConversation?.messages);
    if (!conversationId || !before || loadingOlderMessages) return;

    setLoadingOlderMessages(true);
    setConversationDetailError(null);
    try {
      const payload = await apiFetch<InboxMessagePagePayload>(
        `/inbox/conversations/${conversationId}/messages?limit=${INBOX_RECENT_MESSAGES_LIMIT}&before=${encodeURIComponent(before)}`,
      );
      const olderMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      const baseConversation =
        selectedConversationRef.current?.id === conversationId ? selectedConversationRef.current : currentConversation;
      if (!baseConversation) return;

      const byId = new Map<string, InboxMessage>();
      for (const message of [...olderMessages, ...(baseConversation.messages || [])]) {
        byId.set(String(message.id), message);
      }
      const nextConversation = {
        ...baseConversation,
        messages: sortInboxMessagesChronologically(Array.from(byId.values())),
      };
      setSelectedConversation(nextConversation);
      selectedConversationRef.current = nextConversation;
      rememberConversationDetail(nextConversation);
      setOlderMessagesBefore(payload?.nextBefore || getInboxOldestMessageDate(nextConversation.messages));
      setOlderMessagesHasMore(Boolean(payload?.hasMore));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar mensagens antigas.";
      setConversationDetailError(message);
      setError(message);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [loadingOlderMessages, olderMessagesBefore, rememberConversationDetail, selectedId]);

  const refreshSelectedConversationMessages = useCallback(async () => {
    const conversationId = normalizeInboxConversationId(selectedIdRef.current);
    if (!conversationId) return;

    try {
      const currentConversation =
        selectedConversationRef.current?.id === conversationId ? selectedConversationRef.current : null;
      if (!currentConversation || isInboxConversationSummaryOnly(currentConversation)) {
        await loadConversation(conversationId, { silent: true, forceRefresh: true });
        return;
      }

      const payload = await apiFetch<InboxMessagePagePayload>(
        `/inbox/conversations/${conversationId}/messages?limit=${INBOX_RECENT_MESSAGES_LIMIT}`,
        {
          requireAuth: true,
          timeoutMs: 15000,
        },
      );
      const latestMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      if (!latestMessages.length) return;

      const byId = new Map<string, InboxMessage>();
      for (const message of [...(currentConversation.messages || []), ...latestMessages]) {
        byId.set(String(message.id), message);
      }
      const nextMessages = sortInboxMessagesChronologically(Array.from(byId.values()));
      if (areInboxMessageListsEquivalent(currentConversation.messages, nextMessages)) return;

      const latestMessage = getInboxLatestMessage(nextMessages);
      const latestKey = getInboxMessageStableKey(latestMessage);
      const previousKey = activeConversationLatestMessageKeyRef.current[conversationId] || "";
      const nextConversation: InboxConversation = {
        ...currentConversation,
        messages: nextMessages,
        lastMessageAt: latestMessage?.createdAt || currentConversation.lastMessageAt,
        updatedAt: latestMessage?.createdAt || currentConversation.updatedAt,
      };

      setSelectedConversation(nextConversation);
      selectedConversationRef.current = nextConversation;
      rememberConversationDetail(nextConversation);
      setOlderMessagesBefore(getInboxOldestMessageDate(nextMessages));
      setOlderMessagesHasMore((nextMessages?.length || 0) >= INBOX_RECENT_MESSAGES_LIMIT || Boolean(payload?.hasMore));
      setLastConversationSyncAt(new Date().toISOString());

      setConversations((current) =>
        sortInboxConversationsByActivity(current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                lastMessageAt: nextConversation.lastMessageAt,
                updatedAt: nextConversation.updatedAt,
                messages: conversation.messages,
              }
            : conversation,
        )),
      );

      if (latestKey) {
        activeConversationLatestMessageKeyRef.current[conversationId] = latestKey;
      }
      if (previousKey && latestKey && previousKey !== latestKey && latestMessage && isInboxInboundMessage(latestMessage)) {
        setNotice({ tone: "info", text: formatInboxIncomingNotice(nextConversation, latestMessage) });
      }
    } catch (refreshError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Falha ao atualizar mensagens da conversa aberta.", refreshError);
      }
    }
  }, [loadConversation, rememberConversationDetail]);

  const loadConversations = useCallback(
    async (options?: { preferredId?: string | null; silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoadingList(true);
      setError(null);
      setConversationListError(null);
      try {
        const response = await apiFetch<InboxConversation[]>("/inbox/conversations?take=200", {
          requireAuth: true,
          timeoutMs: 15000,
        });
        const data = normalizeInboxConversationList(Array.isArray(response) ? response : []).filter(
          (conversation) =>
            !isInboxConversationHiddenByDelete(conversation, deletedConversationAliasesRef.current),
        );
        const currentList = conversationsRef.current;
        const listChanged = !areInboxConversationListsEquivalent(currentList, data);

        if (listChanged) {
          setConversations(data);
        }
        setConversationListError(null);
        setBootstrapReady(true);
        if (listChanged || currentList.length === 0) {
          setLastConversationSyncAt(new Date().toISOString());
        }

        const preferredId = options && Object.prototype.hasOwnProperty.call(options, "preferredId")
          ? options.preferredId
          : selectedIdRef.current;
        const selectedSummary =
          preferredId ? data.find((conversation) => conversation.id === preferredId) || null : null;
        const currentQueue = inboxQueueRef.current;
        const fallbackSummary =
          (currentQueue === "all"
            ? data[0]
            : data.find((conversation) => getInboxConversationQueue(conversation) === currentQueue)) ??
          data[0] ??
          null;
        const nextSummary = selectedSummary || fallbackSummary;
        const nextId = nextSummary?.id ?? null;

        if (nextId !== selectedIdRef.current) {
          setSelectedId(nextId);
        }

        const mergedConversation = mergeInboxConversationSummary(
          nextSummary,
          selectedConversationRef.current?.id === nextId
            ? selectedConversationRef.current
            : nextId
              ? conversationDetailCacheRef.current.get(nextId) || null
              : null,
        );

        if (mergedConversation) {
          setSelectedConversation((current) =>
            !listChanged && silent && !didInboxConversationViewChange(current, mergedConversation)
              ? current
              : mergedConversation,
          );
        } else if (!nextId) {
          setSelectedConversation(null);
          setOlderMessagesBefore(null);
          setOlderMessagesHasMore(false);
        }

        if (
          listChanged &&
          nextId &&
          shouldReloadInboxConversation(nextSummary, selectedConversationRef.current)
        ) {
          void loadConversation(nextId, { silent: true, forceRefresh: true });
        } else if (nextSummary && selectedConversationRef.current?.id === nextId) {
          setSelectedConversation((current) =>
            current && current.id === nextId
              ? didInboxConversationViewChange(current, {
                  ...current,
                  ...nextSummary,
                  messages: current.messages,
                })
                ? {
                    ...current,
                    ...nextSummary,
                    messages: current.messages,
                  }
                : current
              : current,
          );
          } else if (!nextSummary) {
          setSelectedConversation(null);
          setOlderMessagesBefore(null);
          setOlderMessagesHasMore(false);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar conversas.";
        setConversationListError(message);
        if (!silent || conversationsRef.current.length === 0) {
          setError(message);
        }
      } finally {
        if (!silent) setLoadingList(false);
      }
    },
    [loadConversation],
  );

  useEffect(() => {
    if (hasToken !== true || !requestedConversationId) return;
    setActiveTab("messages");
    void loadConversations({ preferredId: requestedConversationId, silent: true });
    void loadConversation(requestedConversationId, { silent: true });
  }, [hasToken, loadConversation, loadConversations, requestedConversationId]);

  const loadCustomerConversationCard = useCallback(async (conversationId: string | null | undefined) => {
    const normalizedId = normalizeInboxConversationId(conversationId);
    if (!normalizedId) {
      setCustomerConversationCard(null);
      setCustomerConversationCardDraft({
        doNotCall: false,
        returnAt: "",
        observations: "",
      });
      setCustomerConversationCardError(null);
      return;
    }
    const cached = customerConversationCardCacheRef.current.get(normalizedId);
    if (cached) {
      setCustomerConversationCard(cached);
      setCustomerConversationCardDraft(buildCustomerConversationCardDraft(cached));
      setCustomerConversationCardError(null);
      setLoadingCustomerConversationCard(false);
      return;
    }
    setLoadingCustomerConversationCard(true);
    setCustomerConversationCardError(null);
    try {
      const payload = await apiFetch<CustomerConversationCardPayload>(
        `/inbox/conversations/${normalizedId}/status-card`,
      );
      customerConversationCardCacheRef.current.set(normalizedId, payload);
      setCustomerConversationCard(payload);
      setCustomerConversationCardDraft(buildCustomerConversationCardDraft(payload));
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar card do cliente.";
      setCustomerConversationCardError(message);
    } finally {
      setLoadingCustomerConversationCard(false);
    }
  }, []);

  const saveCustomerConversationCard = useCallback(
    async (
      patch?: Partial<{
        doNotCall: boolean;
        returnAt: string | null;
        observations: string;
      }>,
    ) => {
      if (!selectedId) return;
      if (customerReturnAutoSaveTimerRef.current) {
        window.clearTimeout(customerReturnAutoSaveTimerRef.current);
        customerReturnAutoSaveTimerRef.current = null;
      }

      const hasDoNotCallPatch =
        Boolean(patch) && Object.prototype.hasOwnProperty.call(patch, "doNotCall");
      const nextDoNotCall = hasDoNotCallPatch
        ? Boolean(patch?.doNotCall)
        : customerConversationCardDraft.doNotCall;
      const nextReturnAt =
        patch && Object.prototype.hasOwnProperty.call(patch, "returnAt")
          ? patch.returnAt ?? null
          : toIsoFromLocalDateTime(customerConversationCardDraft.returnAt);
      const nextObservations = patch?.observations ?? customerConversationCardDraft.observations;
      const body: Record<string, unknown> = {
        returnAt: nextReturnAt,
        observations: nextObservations,
      };
      if (hasDoNotCallPatch || customerConversationCardDraft.doNotCall) {
        body.doNotCall = nextDoNotCall;
      }

      setSavingCustomerConversationCard(true);
      setCustomerConversationCardError(null);
      try {
        const payload = await apiFetch<CustomerConversationCardPayload>(
          `/inbox/conversations/${selectedId}/status-card`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        );
        customerConversationCardCacheRef.current.set(selectedId, payload);
        setCustomerConversationCard(payload);
        setCustomerConversationCardDraft(buildCustomerConversationCardDraft(payload));
        setNotice({ tone: "success", text: "Card do cliente salvo." });
        await loadConversations({ preferredId: selectedId, silent: true });
      } catch (saveError) {
        const message =
          saveError instanceof Error ? saveError.message : "Falha ao salvar card do cliente.";
        setCustomerConversationCardError(message);
        setNotice({ tone: "error", text: message });
      } finally {
        setSavingCustomerConversationCard(false);
      }
    },
    [customerConversationCardDraft, loadConversations, selectedId],
  );

  const handleCustomerReturnChange = useCallback(
    (value: string) => {
      setCustomerConversationCardDraft((current) => ({ ...current, returnAt: value }));
      if (customerReturnAutoSaveTimerRef.current) {
        window.clearTimeout(customerReturnAutoSaveTimerRef.current);
        customerReturnAutoSaveTimerRef.current = null;
      }
      const isoValue = toIsoFromLocalDateTime(value);
      if (!isoValue) return;
      customerReturnAutoSaveTimerRef.current = window.setTimeout(() => {
        void saveCustomerConversationCard({
          ...(customerConversationCardDraft.doNotCall ? { doNotCall: false } : {}),
          returnAt: isoValue,
        });
      }, 700);
    },
    [customerConversationCardDraft.doNotCall, saveCustomerConversationCard],
  );

  const scheduleCustomerReturnTomorrow = useCallback(() => {
    const localValue = buildTomorrowReturnLocalValue();
    setCustomerConversationCardDraft((current) => ({
      ...current,
      doNotCall: false,
      returnAt: localValue,
    }));
    const isoValue = toIsoFromLocalDateTime(localValue);
    void saveCustomerConversationCard({
      ...(customerConversationCardDraft.doNotCall ? { doNotCall: false } : {}),
      returnAt: isoValue,
    });
  }, [customerConversationCardDraft.doNotCall, saveCustomerConversationCard]);

  const markCustomerDoNotCall = useCallback(() => {
    setCustomerConversationCardDraft((current) => ({
      ...current,
      doNotCall: true,
      returnAt: "",
    }));
    void saveCustomerConversationCard({ doNotCall: true, returnAt: null });
  }, [saveCustomerConversationCard]);

  const openCustomerReturnPicker = useCallback(() => {
    const input = customerReturnInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    input?.showPicker?.();
    input?.focus();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setCustomerConversationCard(null);
      setCustomerCardShortcutOpen(false);
      return;
    }
    if (contextTab !== "conversa") return;
    setCustomerCardShortcutOpen(false);
    const cached = customerConversationCardCacheRef.current.get(selectedId);
    if (cached) {
      setCustomerConversationCard(cached);
      setCustomerConversationCardDraft(buildCustomerConversationCardDraft(cached));
      setCustomerConversationCardError(null);
      setLoadingCustomerConversationCard(false);
      return;
    }
    setCustomerConversationCard(null);
    setCustomerConversationCardDraft({
      doNotCall: false,
      returnAt: "",
      observations: "",
    });
    setCustomerConversationCardError(null);
    void loadCustomerConversationCard(selectedId);
  }, [contextTab, loadCustomerConversationCard, selectedId]);

  useEffect(() => {
    return () => {
      if (customerReturnAutoSaveTimerRef.current) {
        window.clearTimeout(customerReturnAutoSaveTimerRef.current);
      }
    };
  }, []);

  const loadBotConfig = useCallback(async (options?: { force?: boolean }) => {
    if (botConfigLoadedRef.current && !options?.force) return;
    setLoadingBot(true);
    try {
      const data = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config");
      const normalized = normalizeBotConfig(data);
      writeStoredGlobalBotEnabled(normalized.routingRules.globalBotEnabled !== false);
      setBotConfig(normalized);
      botConfigLoadedRef.current = true;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar editor.";
      setError(message);
    } finally {
      setLoadingBot(false);
    }
  }, []);

  useEffect(() => {
    const stored = readStoredGlobalBotEnabled();
    if (stored === null) return;
    setBotConfig((current) =>
      normalizeBotConfig({
        ...current,
        routingRules: {
          ...current.routingRules,
          globalBotEnabled: stored,
        },
      }),
    );
  }, []);

  const loadAgendaConfig = useCallback(async (options?: { force?: boolean }) => {
    if (agendaConfigLoadedRef.current && !options?.force) return;
    setLoadingAgenda(true);
    try {
      const data = await apiFetch<AtendimentoAgendaConfig>("/inbox/agenda");
      setAgendaConfig(normalizeAgendaConfig(data));
      setAgendaDirty(false);
      agendaConfigLoadedRef.current = true;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar agenda.";
      setError(message);
    } finally {
      setLoadingAgenda(false);
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const data = await apiFetch<CurrentUserProfile>("/profile/current-user");
      setCurrentUserProfile(data || null);
    } catch {
      setCurrentUserProfile(null);
    }
  }, []);

  const loadUserModules = useCallback(async () => {
    try {
      const data = await apiFetch<UserModule[]>("/modules/me");
      setUserModules(Array.isArray(data) ? data : []);
    } catch {
      setUserModules([]);
    }
  }, []);

  useEffect(() => () => clearInboxBootstrapStageTimer(), [clearInboxBootstrapStageTimer]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (initialMirrorBootstrapStartedRef.current) return;
    initialMirrorBootstrapStartedRef.current = true;
    let cancelled = false;
    let stopPolling: (() => void) | undefined;

    void (async () => {
      await bootstrapInbox({ take: 200 });
      if (cancelled) return;
      stopPolling = startSmartPolling(() => loadConversations({ silent: true }), {
        intervalMs: 90000,
        immediate: false,
      });
    })();

    return () => {
      cancelled = true;
      stopPolling?.();
    };
  }, [bootstrapInbox, hasToken, loadConversations]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (activeTab !== "messages") return;

    const QUICK_STREAM_FAILURE_MS = 8000;
    const MAX_QUICK_STREAM_FAILURES = 2;
    const controller = new AbortController();
    let reconnectTimer: number | null = null;
    let scheduledRefresh: number | null = null;
    let consecutiveQuickFailures = 0;

    const scheduleRefresh = () => {
      if (scheduledRefresh !== null) return;
      scheduledRefresh = window.setTimeout(() => {
        scheduledRefresh = null;
        void refreshSelectedConversationMessages();
      }, 180);
    };

    const waitBeforeReconnect = () =>
      new Promise<void>((resolve) => {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          resolve();
        }, 2000);
      });

    const recordStreamDisconnect = (startedAt: number) => {
      if (controller.signal.aborted) return;
      const lifetimeMs = Date.now() - startedAt;
      if (lifetimeMs < QUICK_STREAM_FAILURE_MS) {
        consecutiveQuickFailures += 1;
        if (consecutiveQuickFailures >= MAX_QUICK_STREAM_FAILURES) {
          setInboxRealtimeFallbackActive(true);
        }
        return;
      }

      consecutiveQuickFailures = 0;
      setInboxRealtimeFallbackActive(false);
    };

    const connect = async () => {
      while (!controller.signal.aborted) {
        const startedAt = Date.now();
        try {
          await readInboxRealtimeStream({
            signal: controller.signal,
            onEvent: (event) => {
              const selectedConversationId = normalizeInboxConversationId(selectedIdRef.current);
              const eventConversationId = normalizeInboxConversationId(event.conversationId);
              if (!selectedConversationId || !eventConversationId) return;
              if (selectedConversationId !== eventConversationId) return;
              scheduleRefresh();
            },
          });
          recordStreamDisconnect(startedAt);
        } catch {
          // Silent reconnect: transient network hiccups should not spam the console.
          recordStreamDisconnect(startedAt);
        }

        if (controller.signal.aborted) return;
        await waitBeforeReconnect();
      }
    };

    void connect();

    return () => {
      controller.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (scheduledRefresh !== null) window.clearTimeout(scheduledRefresh);
    };
  }, [activeTab, hasToken, refreshSelectedConversationMessages]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (activeTab !== "messages") return;
    if (!inboxRealtimeFallbackActive) return;

    const stopConversationPolling = startSmartPolling(() => refreshSelectedConversationMessages(), {
      intervalMs: 5000,
      immediate: true,
    });
    const stopQueuePolling = startSmartPolling(() => loadConversations({ silent: true }), {
      intervalMs: 15000,
      immediate: true,
    });

    return () => {
      stopConversationPolling();
      stopQueuePolling();
    };
  }, [activeTab, hasToken, inboxRealtimeFallbackActive, loadConversations, refreshSelectedConversationMessages]);

  useEffect(() => {
    if (hasToken === false) return;
    void Promise.all([loadCurrentUser(), loadUserModules()]);
  }, [hasToken, loadCurrentUser, loadUserModules]);

  useEffect(() => {
    if (hasToken === false) return;
    void loadBotConfig();
  }, [hasToken, loadBotConfig]);

  useEffect(() => {
    if (hasToken === false) return;
    if (!agendaStudioOpen) return;
    void loadAgendaConfig();
  }, [agendaStudioOpen, hasToken, loadAgendaConfig]);

  const queueByConversationId = useMemo(() => {
    const entries = conversations.map((conversation) => [
      conversation.id,
      getInboxConversationQueue(conversation, manualQueueOverrides),
    ] as const);
    return Object.fromEntries(entries) as Record<string, InboxQueue>;
  }, [conversations, manualQueueOverrides]);

  const queueCounts = useMemo(() => {
    const base: Record<InboxQueue, number> = {
      all: 0,
      archived: 0,
      groups: 0,
      recovery: 0,
      scheduled: 0,
      bot: 0,
    };
    for (const conversation of conversations) {
      const queue = queueByConversationId[conversation.id] || "all";
      base[queue] += 1;
    }
    return base;
  }, [conversations, queueByConversationId]);

  const queueUnreadCounts = useMemo(() => {
    const base: Record<InboxQueue, number> = {
      all: 0,
      archived: 0,
      groups: 0,
      recovery: 0,
      scheduled: 0,
      bot: 0,
    };
    for (const conversation of conversations) {
      const queue = queueByConversationId[conversation.id] || "all";
      base[queue] += getInboxConversationUnreadCount(conversation);
    }
    return base;
  }, [conversations, queueByConversationId]);

  const globalBotEnabled = botConfig.routingRules.globalBotEnabled !== false;

  const filteredConversations = useMemo(() => {
    const normalizedSearch = deferredConversationSearch.trim().toLowerCase();
    const filtered = conversations.filter((conversation) => {
      const queue = queueByConversationId[conversation.id] || "all";
      if (queue !== inboxQueue) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        resolveInboxConversationDisplayName(conversation),
        conversation.customer?.phone,
        getInboxConversationSubtitle(conversation),
        getInboxConversationPreview(conversation),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return sortInboxConversationsByActivity(filtered);
  }, [conversations, deferredConversationSearch, inboxQueue, queueByConversationId]);

  const inboxQueueDiagnostics = useMemo(
    () => [
      {
        label: "Sessao",
        value: hasToken === true ? "ativa" : hasToken === false ? "sem token" : "validando",
      },
      {
        label: "Fila",
        value: getInboxQueueLabel(inboxQueue),
      },
      {
        label: "Recebidas",
        value: String(conversations.length),
      },
      {
        label: "Visiveis",
        value: String(filteredConversations.length),
      },
      {
        label: "Selecionada",
        value: selectedId || "--",
      },
      {
        label: "Ultima leitura",
        value: lastConversationSyncAt ? formatDateLabel(lastConversationSyncAt, mounted) : "nenhuma",
      },
    ],
    [conversations.length, filteredConversations.length, hasToken, inboxQueue, lastConversationSyncAt, mounted, selectedId],
  );

  const inboxDetailDiagnostics = useMemo(
    () => [
      {
        label: "Conversa",
        value: selectedId || "--",
      },
      {
        label: "Fila",
        value: getInboxQueueLabel(inboxQueue),
      },
      {
        label: "Mensagens em cache",
        value: String(selectedConversation?.messages.length || 0),
      },
      {
        label: "Ultima leitura",
        value: lastConversationSyncAt ? formatDateLabel(lastConversationSyncAt, mounted) : "nenhuma",
      },
    ],
    [inboxQueue, lastConversationSyncAt, mounted, selectedConversation?.messages.length, selectedId],
  );

  const retryConversationList = useCallback(() => {
    if (!bootstrapReady && conversationsRef.current.length === 0) {
      void bootstrapInbox({ take: 200 });
      return;
    }
    void loadConversations({ preferredId: selectedIdRef.current });
  }, [bootstrapInbox, bootstrapReady, loadConversations]);

  const retryConversationDetail = useCallback(() => {
    if (!selectedIdRef.current) return;
    void loadConversation(selectedIdRef.current);
  }, [loadConversation]);

  useEffect(() => {
    if (!bootstrapReady) return;
    if (activeTab !== "messages") return;

    const currentConversationId = selectedConversation?.id ?? selectedId ?? null;
    const nextConversation = currentConversationId
      ? filteredConversations.find((conversation) => conversation.id === currentConversationId) || null
      : null;

    if (nextConversation) {
      if (selectedId !== nextConversation.id) {
        setSelectedId(nextConversation.id);
      }
      return;
    }

    const fallbackConversation = filteredConversations[0] ?? null;
    if (!fallbackConversation) {
      if (selectedId !== null) setSelectedId(null);
      if (selectedConversation !== null) setSelectedConversation(null);
      return;
    }

    if (selectedId === fallbackConversation.id || loadingConversation) return;
    void loadConversation(fallbackConversation.id);
  }, [
    activeTab,
    bootstrapReady,
    filteredConversations,
    loadConversation,
    loadingConversation,
    selectedConversation,
    selectedId,
  ]);

  useEffect(() => {
    if (activeTab !== "messages") return;
    if (loadingConversation || loadingOlderMessages) return;
    if (!olderMessagesHasMore) return;

    const conversationId = normalizeInboxConversationId(selectedConversation?.id ?? selectedId);
    if (!conversationId) return;

    const activeConversation =
      selectedConversationRef.current?.id === conversationId
        ? selectedConversationRef.current
        : selectedConversation;
    const messageCount = activeConversation?.messages?.length || 0;
    if (messageCount < INBOX_RECENT_MESSAGES_LIMIT) return;
    if (autoPrefetchedOlderMessagesRef.current[conversationId]) return;

    autoPrefetchedOlderMessagesRef.current[conversationId] = true;
    void loadOlderMessages();
  }, [
    activeTab,
    loadOlderMessages,
    loadingConversation,
    loadingOlderMessages,
    olderMessagesHasMore,
    selectedConversation,
    selectedId,
  ]);

  const pendingAtendimentoConversations = useMemo(
    () =>
      [...conversations]
        .filter(
          (conversation) =>
            getInboxConversationQueue(conversation, manualQueueOverrides) !== "archived" &&
            conversation.routeTarget === "atendimento" &&
            (conversation.status === "new" || conversation.status === "open"),
        )
        .sort(
          (left, right) =>
            new Date(getInboxConversationActivityAt(right)).getTime() -
            new Date(getInboxConversationActivityAt(left)).getTime(),
        ),
    [conversations, manualQueueOverrides],
  );

  const pendingAtendimentoCount = pendingAtendimentoConversations.length;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ATENDIMENTO_PENDING_STORAGE_KEY, String(pendingAtendimentoCount));
    } catch {
      // ignore storage errors
    }

    try {
      window.dispatchEvent(
        new CustomEvent<{ count: number }>(ATENDIMENTO_QUEUE_EVENT, {
          detail: { count: pendingAtendimentoCount },
        }),
      );
    } catch {
      // ignore event dispatch errors
    }
  }, [pendingAtendimentoCount]);

  const humanAttentionConversations = useMemo(
    () => pendingAtendimentoConversations.filter((conversation) => conversation.status === "open"),
    [pendingAtendimentoConversations],
  );

  const newInboundConversations = useMemo(
    () => pendingAtendimentoConversations.filter((conversation) => conversation.status === "new"),
    [pendingAtendimentoConversations],
  );

  const actionOptions = useMemo(() => {
    const options = new Map<string, ActionOption>();

    for (const action of botConfig.actionCatalog) {
      options.set(action.actionId, {
        value: action.actionId,
        label: `${action.title} • ${ACTION_KIND_LABELS[action.kind] || action.kind}`,
      });
    }

    for (const group of agendaConfig.groups) {
      const actionId = buildAgendaActionId(group.id);
      options.set(actionId, {
        value: actionId,
        label: `Agenda • ${group.title}`,
      });
    }

    [
      ...botConfig.welcomeButtons,
      ...botConfig.returningCustomerButtons,
      ...botConfig.mainMenuButtons,
      ...botConfig.recoveryDetectedButtons,
      ...botConfig.postActionButtons,
    ].forEach((button) => {
      if (!options.has(button.actionId)) {
        options.set(button.actionId, {
          value: button.actionId,
          label: `Acao atual • ${button.actionId}`,
        });
      }
    });

    return Array.from(options.values());
  }, [
    agendaConfig.groups,
    botConfig.actionCatalog,
    botConfig.mainMenuButtons,
    botConfig.postActionButtons,
    botConfig.recoveryDetectedButtons,
    botConfig.returningCustomerButtons,
    botConfig.welcomeButtons,
  ]);

  const agendaOptions = useMemo(
    () => agendaConfig.groups.map((group) => ({ id: group.id, title: group.title })),
    [agendaConfig.groups],
  );

  const canManageAgenda = useMemo(() => {
    if (currentUserProfile?.isSystemMaster) return true;
    const role = String(currentUserProfile?.role || "").trim().toUpperCase();
    return role === "ADMIN";
  }, [currentUserProfile?.isSystemMaster, currentUserProfile?.role]);

  const hasRecoveryCapability = useMemo(
    () =>
      userModules.some(
        (module) => module.accessible && (module.key === "atendimento" || module.key === "hbx_recovery"),
      ),
    [userModules],
  );

  const conversationForView = useMemo(
    () => {
      const summary = selectedId
        ? conversations.find((conversation) => conversation.id === selectedId) || null
        : null;
      if (selectedConversation?.id === selectedId) {
        return selectedConversation;
      }
      return summary;
    },
    [conversations, selectedConversation, selectedId],
  );

  const isConversationStageSwitching = Boolean(
    loadingConversation &&
      selectedId &&
      conversationForView &&
      conversationForView.id !== selectedId,
  );

  const selectedStatus = conversationForView?.status ?? "new";
  const selectedBlocked = Boolean(conversationForView?.isBlocked);
  const selectedConversationDisplayName = resolveInboxConversationDisplayName(conversationForView);
  const selectedConversationStatusMeta = conversationForView
    ? getAtendimentoConversationStatusMeta(conversationForView, hasRecoveryCapability)
    : null;
  const customerCardName =
    customerConversationCard?.customer?.name || selectedConversationDisplayName || "Cliente";
  const customerCardPhone =
    customerConversationCard?.customer?.phone ||
    conversationForView?.customer?.phone ||
    customerConversationCard?.customer?.phoneNormalized ||
    "";
  const customerCardPhoneDigits = getCustomerConversationCardPhoneDigits(
    customerConversationCard,
    conversationForView,
  );
  const selectedConversationWhatsappAvailability =
    getCustomerConversationCardWhatsappAvailability(customerConversationCard);
  const selectedConversationWithoutWhatsapp =
    selectedConversationWhatsappAvailability === "unavailable" ||
    getInboxConversationWhatsappAvailabilityFromMetadata(conversationForView) === "unavailable";
  const selectedConversationInteractionBlocked =
    selectedBlocked || selectedConversationWithoutWhatsapp;
  const customerCardCanOpenWhatsapp =
    Boolean(customerCardPhoneDigits) && !selectedConversationWithoutWhatsapp;
  const customerCardReturnAt = customerConversationCard?.lead?.returnAt || null;
  const customerCardLastContactAt =
    customerConversationCard?.lead?.lastContactAt ||
    customerConversationCard?.lead?.updatedAt ||
    conversationForView?.updatedAt ||
    null;
  const customerCardAttempts = Number(customerConversationCard?.lead?.attemptCount || 0);
  const customerCardTimesSeen = Math.max(1, Number(customerConversationCard?.lead?.timesSeen || 1));
  const customerCardHistory = useMemo(
    () => (Array.isArray(customerConversationCard?.history) ? customerConversationCard.history : []),
    [customerConversationCard?.history],
  );
  const selectedConversationIsAgenda = conversationForView
    ? isAtendimentoAgendaConversation(conversationForView)
    : false;
  const selectedVendasAgendaDraftMessage = useMemo(
    () => getInboxVendasAgendaPendingDraft(conversationForView),
    [conversationForView],
  );
  const conversationMessagesForView = useMemo(
    () => sortInboxMessagesChronologically(
      (Array.isArray(conversationForView?.messages) ? conversationForView.messages : []).filter(
        (message) => !shouldHideInboxMessageFromTimeline(message),
      ),
    ),
    [conversationForView],
  );
  const latestVisibleMessageKey = useMemo(
    () => getInboxMessageStableKey(getInboxLatestMessage(conversationMessagesForView)),
    [conversationMessagesForView],
  );
  const conversationReactionIndex = useMemo(
    () => buildInboxReactionIndex(conversationForView?.messages),
    [conversationForView],
  );
  const selectedConversationHasRecoveryContext =
    hasRecoveryCapability && conversationForView
      ? hasAtendimentoRecoveryContext(conversationForView)
      : false;

  useEffect(() => {
    if (!selectedId || selectedBlocked) return;
    const frame = window.requestAnimationFrame(() => {
      chatComposerInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedBlocked, selectedId]);

  const noteStorageKey = useMemo(
    () =>
      getConversationNoteStorageKey(
        currentUserProfile?.company?.id ?? null,
        selectedConversation?.id ?? null,
      ),
    [currentUserProfile?.company?.id, selectedConversation?.id],
  );
  const activeDockSection = templatesStudioOpen
    ? "templates"
    : automationStudioOpen
      ? "automacao"
      : agendaStudioOpen || contextTab === "agenda"
        ? "agenda"
        : contextTab === "financeiro"
          ? "financeiro"
          : "conversa";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!noteStorageKey) {
      setInternalNote("");
      return;
    }
    skipNotePersistRef.current = true;
    try {
      setInternalNote(window.localStorage.getItem(noteStorageKey) || "");
    } catch {
      setInternalNote("");
    }
  }, [noteStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !noteStorageKey) return;
    if (skipNotePersistRef.current) {
      skipNotePersistRef.current = false;
      return;
    }
    try {
      if (internalNote.trim()) {
        window.localStorage.setItem(noteStorageKey, internalNote);
      } else {
        window.localStorage.removeItem(noteStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [internalNote, noteStorageKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const summaryParts = [
      `Atendimento na aba ${activeTab}`,
      agendaStudioOpen ? "agenda aberta" : "agenda fechada",
      selectedConversation?.customer?.name
        ? `conversa selecionada com ${selectedConversation.customer.name}`
        : selectedId
          ? `conversa selecionada ${selectedId}`
          : "sem conversa selecionada",
    ];
    if (selectedConversation?.routeTarget) {
      summaryParts.push(`rota ${selectedConversation.routeTarget}`);
    }
    if (selectedBlocked) {
      summaryParts.push("contato bloqueado");
    }

    window.dispatchEvent(
      new CustomEvent("hbx-tech-assistant:page-context", {
        detail: {
          moduleKey: "atendimento",
          route: "/dashboard/inbox",
          summary: summaryParts.join(", "),
          tags: [
            activeTab,
            selectedStatus,
            selectedConversation?.routeTarget || "sem_rota",
            agendaStudioOpen ? "agenda_aberta" : "agenda_fechada",
            selectedBlocked ? "bloqueado" : "ativo",
          ],
          details: {
            activeTab,
            selectedConversationId: selectedId || null,
            selectedConversationName: selectedConversation?.customer?.name || null,
            selectedConversationPhone: selectedConversation?.customer?.phone || null,
            selectedCustomerProfileId: selectedConversation?.customer?.customerProfileId || null,
            selectedStatus,
            selectedRoute: selectedConversation?.routeTarget || null,
            selectedBlocked,
            loadingConversation,
            loadingBot,
            savingBot,
            loadingAgenda,
            savingAgenda,
            agendaStudioOpen,
            humanAttentionCount: humanAttentionConversations.length,
            newInboundCount: newInboundConversations.length,
            conversationsCount: conversations.length,
          },
        },
      }),
    );
  }, [
    activeTab,
    agendaStudioOpen,
    conversations.length,
    humanAttentionConversations.length,
    loadingAgenda,
    loadingBot,
    loadingConversation,
    newInboundConversations.length,
    savingAgenda,
    savingBot,
    selectedBlocked,
    selectedConversation?.customer?.customerProfileId,
    selectedConversation?.customer?.name,
    selectedConversation?.customer?.phone,
    selectedConversation?.routeTarget,
    selectedId,
    selectedStatus,
  ]);

  const handleSectionChange = useCallback((nextSection: AtendimentoSection) => {
    const now = Date.now();
    if (lastSectionChangeRef.current.section === nextSection && now - lastSectionChangeRef.current.at < 400) {
      return;
    }
    lastSectionChangeRef.current = { section: nextSection, at: now };

    const params = new URLSearchParams(searchParams?.toString() || "");
    if (nextSection === "automacao") {
      setActiveTab("messages");
      setAutomationStudioOpen(true);
      setTemplatesStudioOpen(false);
      setAgendaStudioOpen(false);
      params.set("atendimentoTab", "automation");
    } else if (nextSection === "agenda") {
      setActiveTab("messages");
      setAgendaStudioOpen(true);
      setAutomationStudioOpen(false);
      setTemplatesStudioOpen(false);
      setContextTab("agenda");
      params.delete("atendimentoTab");
    } else {
      setAutomationStudioOpen(false);
      setTemplatesStudioOpen(false);
      setAgendaStudioOpen(false);
      setContextTab(nextSection);
      params.delete("atendimentoTab");
    }
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  const resetTemplateComposer = useCallback(() => {
    setTemplateComposer(DEFAULT_TEMPLATE_COMPOSER);
    setEditingTemplateLabel(null);
  }, []);

  const loadMetaTemplates = useCallback(async (refresh = false) => {
    setLoadingTemplates(true);
    try {
      const query = refresh ? "?refresh=true" : "";
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>(`/hbx-recovery/meta-templates${query}`);
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      if (safePayload.syncError) {
        setNotice({ tone: "error", text: `Falha ao carregar templates Meta: ${safePayload.syncError}` });
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar templates Meta.";
      setNotice({ tone: "error", text: message });
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const syncMetaTemplatesNow = useCallback(async () => {
    setSyncingTemplates(true);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates/sync", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setNotice({
        tone: safePayload.syncError ? "error" : "success",
        text: safePayload.syncError || "Templates Meta sincronizados com sucesso.",
      });
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : "Falha ao sincronizar templates Meta.";
      setNotice({ tone: "error", text: message });
    } finally {
      setSyncingTemplates(false);
    }
  }, []);

  const openTemplatesSettings = useCallback(() => {
    setAutomationStudioOpen(false);
    setAgendaStudioOpen(false);
    setTemplatesStudioOpen(true);
    void loadMetaTemplates();
  }, [loadMetaTemplates]);

  const closeAutomationExperience = useCallback(() => {
    // Prevent the auto-open effect from re-opening the studio while we navigate
    skipAutomationAutoOpenRef.current = true;
    setAutomationStudioOpen(false);
    setTemplatesStudioOpen(false);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("atendimentoTab");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
    // Ensure the skip flag is cleared after a short delay in case navigation is async
    window.setTimeout(() => {
      skipAutomationAutoOpenRef.current = false;
    }, 200);
  }, [pathname, router, searchParams]);

  const editMetaTemplate = useCallback((template: RecoveryMetaTemplateItem) => {
    setTemplateComposer(fillTemplateComposerFromTemplate(template));
    setEditingTemplateLabel(`${template.name} • ${template.language}`);
  }, []);

  const toggleTemplateActivation = useCallback(
    async (template: RecoveryMetaTemplateItem, active: boolean) => {
      try {
        const payload = await apiFetch<RecoveryMetaTemplatesPayload>(
          "/hbx-recovery/meta-templates/activation",
          {
            method: "PATCH",
            body: JSON.stringify({
              name: template.name,
              language: template.language,
              active,
            }),
          },
        );
        setMetaTemplates(normalizeMetaTemplatesPayload(payload));
        setNotice({
          tone: "success",
          text: active
            ? `Template ${template.name} ativado no HBX.`
            : `Template ${template.name} ocultado no HBX.`,
        });
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : "Falha ao atualizar template.";
        setNotice({ tone: "error", text: message });
      }
    },
    [],
  );

  const deleteMetaTemplate = useCallback(async (template: RecoveryMetaTemplateItem) => {
    const deletingKey = `${template.name}:${template.language}`;
    setDeletingTemplateId(deletingKey);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates", {
        method: "DELETE",
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          language: template.language,
        }),
      });
      setMetaTemplates(normalizeMetaTemplatesPayload(payload));
      setNotice({ tone: "success", text: `Template ${template.name} excluido com sucesso.` });
      if (editingTemplateLabel?.startsWith(template.name)) {
        resetTemplateComposer();
      }
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Falha ao excluir template.";
      setNotice({ tone: "error", text: message });
    } finally {
      setDeletingTemplateId(null);
    }
  }, [editingTemplateLabel, resetTemplateComposer]);

  const createMetaTemplate = useCallback(async () => {
    const normalizedName = String(templateComposer.name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const bodyText = String(templateComposer.bodyText || "").trim();
    if (!normalizedName) {
      setNotice({ tone: "error", text: "Informe um nome interno valido para o template." });
      return;
    }
    if (bodyText.length < 10) {
      setNotice({ tone: "error", text: "O corpo do template ainda esta muito curto." });
      return;
    }
    setCreatingTemplate(true);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates/create", {
        method: "POST",
        body: JSON.stringify({
          name: normalizedName,
          category: templateComposer.category,
          language: templateComposer.language || "pt_BR",
          headerFormat:
            templateComposer.headerFormat === "NONE" ? undefined : templateComposer.headerFormat,
          headerText: templateComposer.headerText || "",
          headerHandle: templateComposer.headerHandle || "",
          headerMediaUrl: templateComposer.headerMediaUrl || "",
          bodyText,
          footerText: templateComposer.footerText || "",
          buttons: parseTemplateButtonLines(templateComposer.buttonsText),
          variableExamples: {},
          activateInHbx: templateComposer.activateInHbx,
        }),
      });
      setMetaTemplates(normalizeMetaTemplatesPayload(payload));
      setNotice({ tone: "success", text: `Template ${normalizedName} enviado para aprovacao.` });
      resetTemplateComposer();
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Falha ao criar template.";
      setNotice({ tone: "error", text: message });
    } finally {
      setCreatingTemplate(false);
    }
  }, [resetTemplateComposer, templateComposer]);

  useEffect(() => {
    if (!templatesStudioOpen) return;
    if (metaTemplates.templates.length > 0) return;
    void loadMetaTemplates();
  }, [loadMetaTemplates, metaTemplates.templates.length, templatesStudioOpen]);

  const initialAgendaStudioTab = useMemo<AgendaStudioTab>(
    () => (requestedAgendaMode === "sales" ? "sales" : "bot"),
    [requestedAgendaMode],
  );

  const closeAgendaStudio = useCallback(() => {
    setAgendaStudioOpen(false);
    if (requestedAgendaMode === "sales") {
      router.push(requestedAgendaReturnTo || "/dashboard/vendas");
      return;
    }

    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("agendaStudio");
    params.delete("agendaMode");
    params.delete("returnTo");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, requestedAgendaMode, requestedAgendaReturnTo, router, searchParams]);

  const renderAgendaPanel = () => (
    <AgendaStudioModal
      initialTab={initialAgendaStudioTab}
      onClose={closeAgendaStudio}
      agendaConfig={agendaConfig}
      loadingAgenda={loadingAgenda}
      savingAgenda={savingAgenda}
      botAgendaDirty={agendaDirty}
      currentUserEmail={String(currentUserProfile?.email || "")}
      currentUserName={String(currentUserProfile?.name || "")}
      canManageAgenda={canManageAgenda}
      onAddGroup={addAgendaGroup}
      onRemoveGroup={removeAgendaGroup}
      onResetBotAgenda={resetBotAgendaToDefault}
      onLinkCurrentUser={linkAgendaToCurrentUser}
      onSaveBotAgenda={() => {
        setNotice(null);
        void saveAgenda();
      }}
      onUpdateGroup={updateAgendaGroup}
      onAddSlot={addAgendaSlot}
      onRemoveSlot={removeAgendaSlot}
      onUpdateSlot={updateAgendaSlot}
    />
  );

  const updateStatus = useCallback(
    async (status: Exclude<StatusFilter, "all" | "blocked">) => {
      if (!selectedId) return;
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        setSelectedConversation(data);
        rememberConversationDetail(data);
        setNotice({ tone: "success", text: `Conversa atualizada para ${status}.` });
        await loadConversations({ preferredId: data.id, silent: true });
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : "Falha ao atualizar status.";
        setError(message);
      }
    },
    [loadConversations, rememberConversationDetail, selectedId],
  );

  const toggleGlobalBot = useCallback(async () => {
    const enabled = !globalBotEnabled;
    const nextConfig = normalizeBotConfig({
      ...botConfig,
      routingRules: {
        ...botConfig.routingRules,
        globalBotEnabled: enabled,
      },
    });
    setSavingBot(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
      });
      const normalized = normalizeBotConfig(payload);
      writeStoredGlobalBotEnabled(normalized.routingRules.globalBotEnabled !== false);
      setBotConfig(normalized);
      setNotice({
        tone: "success",
        text: enabled
          ? "BOT global ativado para novas mensagens."
          : "BOT global desativado para novas mensagens.",
      });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Falha ao atualizar BOT global.");
      setBotConfig(botConfig);
    } finally {
      setSavingBot(false);
    }
  }, [botConfig, globalBotEnabled]);

  const moveConversationToQueue = useCallback(
    async (
      conversationId: string,
      targetQueue: InboxQueue,
      options?: { skipReload?: boolean; skipBotSync?: boolean },
    ) => {
      if (!conversationId || !targetQueue) return;
      const numericConversationId = Number(conversationId);
      if (!Number.isFinite(numericConversationId)) return;

      setError(null);
      try {
        if (!options?.skipBotSync && (targetQueue === "bot" || targetQueue === "all")) {
          await apiFetch(`/inbox/conversations/bulk-bot`, {
            method: "PATCH",
            body: JSON.stringify({ ids: [numericConversationId], enabled: targetQueue === "bot" }),
          });
        }

        const updatedConversation = await apiFetch<InboxConversation>(`/inbox/conversations/${conversationId}/queue`, {
          method: "PATCH",
          body: JSON.stringify({ queue: targetQueue }),
        });
        const normalizedUpdatedConversation = normalizeInboxConversationPayload(updatedConversation);
        if (normalizedUpdatedConversation) {
          rememberConversationDetail(normalizedUpdatedConversation);
          setSelectedConversation((current) =>
            current?.id === normalizedUpdatedConversation.id ? normalizedUpdatedConversation : current,
          );
        }

        setManualQueueOverrides((current) => ({
          ...current,
          [conversationId]: targetQueue,
        }));

        if (!options?.skipReload) {
          await loadConversations({ preferredId: conversationId, silent: true });
        }
      } catch (moveError) {
        const message = moveError instanceof Error ? moveError.message : "Falha ao mover conversa de fila.";
        setError(message);
        throw moveError;
      }
    },
    [loadConversations, rememberConversationDetail],
  );

  const moveQueueToQueue = useCallback(
    async (sourceQueue: InboxQueue, targetQueue: InboxQueue) => {
      if (!sourceQueue || !targetQueue || sourceQueue === targetQueue) return;

      const conversationIds = conversationsRef.current
        .filter(
          (conversation) =>
            getInboxConversationQueue(conversation, manualQueueOverridesRef.current) === sourceQueue,
        )
        .map((conversation) => conversation.id)
        .filter(Boolean);

      if (!conversationIds.length) {
        setNotice({
          tone: "error",
          text: `Nenhuma conversa encontrada em ${getInboxQueueLabel(sourceQueue)}.`,
        });
        return;
      }

      setError(null);
      try {
        const numericIds = conversationIds
          .map((conversationId) => Number(conversationId))
          .filter((conversationId) => Number.isFinite(conversationId));

        if (numericIds.length && (targetQueue === "bot" || targetQueue === "all")) {
          await apiFetch(`/inbox/conversations/bulk-bot`, {
            method: "PATCH",
            body: JSON.stringify({ ids: numericIds, enabled: targetQueue === "bot" }),
          });
        }

        const moveResults = await Promise.allSettled(
          conversationIds.map((conversationId) =>
            moveConversationToQueue(conversationId, targetQueue, {
              skipReload: true,
              skipBotSync: true,
            }),
          ),
        );

        const failedMoves = moveResults.filter((result) => result.status === "rejected").length;
        await loadConversations({ preferredId: selectedIdRef.current, silent: true });
        setInboxQueue(targetQueue);

        if (failedMoves > 0) {
          const movedCount = conversationIds.length - failedMoves;
          const message = `Falha ao mover ${failedMoves} conversa(s) de ${getInboxQueueLabel(sourceQueue)}.`;
          setError(message);
          setNotice({
            tone: movedCount > 0 ? "success" : "error",
            text:
              movedCount > 0
                ? `${movedCount} de ${conversationIds.length} conversa(s) foram enviadas para ${getInboxQueueLabel(targetQueue)}.`
                : message,
          });
          return;
        }

        setNotice({
          tone: "success",
          text: `${conversationIds.length} conversa(s) enviadas para ${getInboxQueueLabel(targetQueue)}.`,
        });
      } catch (bulkMoveError) {
        const message = bulkMoveError instanceof Error ? bulkMoveError.message : "Falha ao mover a fila inteira.";
        setError(message);
      }
    },
    [loadConversations, moveConversationToQueue],
  );

  const handleQueueDrop = useCallback(
    (targetQueue: InboxQueue) => {
      if (draggedQueueId) {
        void moveQueueToQueue(draggedQueueId, targetQueue);
      } else if (draggedConversationId) {
        void moveConversationToQueue(draggedConversationId, targetQueue);
      } else {
        return;
      }
      setDropOverQueue(null);
      setDraggedConversationId(null);
      setDraggedQueueId(null);
    },
    [draggedConversationId, draggedQueueId, moveConversationToQueue, moveQueueToQueue],
  );

  const blockConversationById = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    const targetConversation =
      conversationsRef.current.find((conversation) => conversation.id === conversationId) ||
      (selectedConversationRef.current?.id === conversationId ? selectedConversationRef.current : null);
    setBlockDialog({
      conversationId,
      reason: targetConversation?.blockedReason || "Bloqueado manualmente pelo operador.",
    });
  }, []);

  const confirmBlockConversation = useCallback(async () => {
    if (!blockDialog?.conversationId) return;
    const conversationId = blockDialog.conversationId;
    const reason = blockDialog.reason;
    setError(null);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${conversationId}/block`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      if (selectedIdRef.current === conversationId) {
        setSelectedConversation(data);
      }
      rememberConversationDetail(data);
      setQueueActionConversationId(null);
      setQueueActionMenuPosition(null);
      setBlockDialog(null);
      setNotice({ tone: "success", text: "Contato bloqueado no Atendimento." });
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Falha ao bloquear contato.";
      setError(message);
    }
  }, [blockDialog, loadConversations, rememberConversationDetail]);

  const blockConversation = useCallback(async () => {
    if (!selectedId) return;
    await blockConversationById(selectedId);
  }, [blockConversationById, selectedId]);

  const unblockConversation = useCallback(async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/unblock`, {
        method: "PATCH",
      });
      setSelectedConversation(data);
      rememberConversationDetail(data);
      setNotice({ tone: "success", text: "Contato desbloqueado no Atendimento." });
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Falha ao desbloquear contato.";
      setError(message);
    }
  }, [loadConversations, rememberConversationDetail, selectedId]);

  const deleteConversationById = useCallback(
    async (conversationId: string) => {
      if (!conversationId) return;
      setDeleteConversationDialog({ conversationId });
    },
    [],
  );

  const confirmDeleteConversation = useCallback(
    async () => {
      const conversationId = deleteConversationDialog?.conversationId;
      if (!conversationId) return;
      setError(null);
      try {
        const response = await apiFetch<{ message?: string; deleted?: boolean }>(`/inbox/conversations/${conversationId}`, {
          method: "DELETE",
        });
        setQueueActionConversationId(null);
        setQueueActionMenuPosition(null);
        setDeleteConversationDialog(null);
        conversationDetailCacheRef.current.delete(conversationId);
        customerConversationCardCacheRef.current.delete(conversationId);
        if (response?.deleted) {
          setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
          if (selectedIdRef.current === conversationId) {
            setSelectedId(null);
            setSelectedConversation(null);
            selectedIdRef.current = null;
            selectedConversationRef.current = null;
          }
          setManualQueueOverrides((current) => {
            const next = { ...current };
            delete next[conversationId];
            return next;
          });
        } else {
          setManualQueueOverrides((current) => {
            return { ...current, [conversationId]: "archived" };
          });
        }
        setNotice({
          tone: "success",
          text:
            String(response?.message || "").trim() ||
            "Conversa enviada para Excluídos apenas no HBX.",
        });
        await loadConversations({ preferredId: response?.deleted ? null : conversationId, silent: true });
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : "Falha ao excluir conversa.";
        setError(message);
      }
    },
    [deleteConversationDialog?.conversationId, loadConversations],
  );

  const reactToMessage = useCallback(
    async (messageId: string, reaction: string) => {
      if (!selectedId || !messageId || !reaction) return;
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(
          `/inbox/conversations/${selectedId}/messages/${messageId}/reaction`,
          {
            method: "POST",
            body: JSON.stringify({ reaction }),
          },
        );
        setSelectedConversation(data);
        rememberConversationDetail(data);
        setMessageReactionTargetId(null);
        await loadConversations({ preferredId: data.id, silent: true });
      } catch (reactionError) {
        const message = reactionError instanceof Error ? reactionError.message : "Falha ao reagir à mensagem.";
        setError(message);
      }
    },
    [loadConversations, rememberConversationDetail, selectedId],
  );

  const deleteSentMessage = useCallback(
    async (messageId: string) => {
      if (!selectedId || !messageId) return;
      setDeleteMessageDialog({ messageId });
    },
    [selectedId],
  );

  const confirmDeleteSentMessage = useCallback(
    async () => {
      const messageId = deleteMessageDialog?.messageId;
      if (!selectedId || !messageId) return;
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(
          `/inbox/conversations/${selectedId}/messages/${messageId}`,
          {
            method: "DELETE",
          },
        );
        setSelectedConversation(data);
        rememberConversationDetail(data);
        setMessageReactionTargetId(null);
        setDeleteMessageDialog(null);
        setNotice({ tone: "success", text: "Mensagem apagada para todos." });
        await loadConversations({ preferredId: data.id, silent: true });
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : "Falha ao apagar mensagem.";
        setError(message);
      }
    },
    [deleteMessageDialog?.messageId, loadConversations, rememberConversationDetail, selectedId],
  );

  const sendMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedId || selectedConversationInteractionBlocked) return;
      if (!sendText.trim() && !imagePreview) return;
      setSending(true);
      setError(null);
      try {
        let content = sendText.trim();
        let uploadedAttachment:
          | {
              kind: InboxAttachmentPreview["kind"];
              url: string;
              previewUrl: string;
              mimeType: string;
              fileName: string;
              fileSize: number;
            }
          | null = null;
        if (imagePreview) {
          const formData = new FormData();
          formData.append("file", imagePreview.file);
          const mediaResult = await apiFetch<{
            url: string;
            filename: string;
            mimeType: string;
            size: number;
          }>(`/inbox/conversations/${selectedId}/media`, {
            method: "POST",
            body: formData,
          });
          uploadedAttachment = {
            kind: imagePreview.kind,
            url: mediaResult.url,
            previewUrl: mediaResult.url,
            mimeType: mediaResult.mimeType,
            fileName: imagePreview.fileName || mediaResult.filename,
            fileSize: mediaResult.size,
          };
          content = content ? `${mediaResult.url}\n${content}` : mediaResult.url;
        }
        const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/message`, {
          method: "POST",
          body: JSON.stringify({
            content,
            quotedMessageId: replyingTo?.id,
            quotedContent: replyingTo ? getMessagePreview(replyingTo).slice(0, 200) : undefined,
            attachmentKind: uploadedAttachment?.kind,
            attachmentUrl: uploadedAttachment?.url,
            attachmentPreviewUrl: uploadedAttachment?.previewUrl,
            attachmentMimeType: uploadedAttachment?.mimeType,
            attachmentFileName: uploadedAttachment?.fileName,
            attachmentFileSize: uploadedAttachment?.fileSize,
          }),
        });
        if (imagePreview) {
          URL.revokeObjectURL(imagePreview.url);
          setImagePreview(null);
        }
        setSendText("");
        sendTextDirtyRef.current = false;
        setReplyingTo(null);
        setSelectedConversation(data);
        selectedConversationRef.current = data;
        rememberConversationDetail(data);
        const latestMessage = getInboxLatestMessage(data.messages);
        const latestKey = getInboxMessageStableKey(latestMessage);
        if (latestKey) {
          activeConversationLatestMessageKeyRef.current[data.id] = latestKey;
        }
        setNotice({ tone: "success", text: "Mensagem manual enfileirada com sucesso." });
        void loadConversations({ preferredId: data.id, silent: true });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Falha ao enviar mensagem.";
        setError(message);
      } finally {
        setSending(false);
      }
    },
    [
      loadConversations,
      rememberConversationDetail,
      selectedConversationInteractionBlocked,
      selectedId,
      sendText,
      replyingTo,
      imagePreview,
    ],
  );

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingLevelTimerRef.current) {
      clearInterval(recordingLevelTimerRef.current);
      recordingLevelTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const context = new AudioContextCtor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        const samples = new Float32Array(analyser.fftSize);
        analyser.fftSize = 2048;
        source.connect(analyser);
        recordingAudioContextRef.current = context;
        recordingAnalyserRef.current = analyser;
        recordingMaxPeakRef.current = 0;
        recordingLevelTimerRef.current = setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let peak = 0;
          for (const value of samples) {
            peak = Math.max(peak, Math.abs(value));
          }
          recordingMaxPeakRef.current = Math.max(recordingMaxPeakRef.current, peak);
        }, 200);
      }
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (recordingLevelTimerRef.current) {
          clearInterval(recordingLevelTimerRef.current);
          recordingLevelTimerRef.current = null;
        }
        recordingAnalyserRef.current = null;
        const audioContext = recordingAudioContextRef.current;
        recordingAudioContextRef.current = null;
        if (audioContext && audioContext.state !== "closed") {
          void audioContext.close().catch(() => undefined);
        }
        stream.getTracks().forEach((t) => t.stop());
        const baseMime = mimeType.split(";")[0];
        const blob = new Blob(audioChunksRef.current, { type: baseMime });
        const maxPeak = recordingMaxPeakRef.current;
        recordingMaxPeakRef.current = 0;
        if (!blob.size || maxPeak < 0.005) {
          setAudioPreview(null);
          setError("Não detectei som no microfone. Verifique o dispositivo de entrada do Windows antes de gravar áudio.");
          audioChunksRef.current = [];
          return;
        }
        const url = URL.createObjectURL(blob);
        setAudioPreview({ blob, url, mimeType: baseMime, seconds: recordingSecondsRef.current });
        audioChunksRef.current = [];
      };
      recorder.start(200);
      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds((s) => {
          const next = s + 1;
          if (next >= 120) stopRecording();
          return next;
        });
      }, 1000);
    } catch {
      setError("Microfone não acessível. Verifique as permissões do navegador.");
    }
  }, [stopRecording]);

  const sendAudioPreview = useCallback(async () => {
    if (!selectedId || !audioPreview) return;
    setSending(true);
    setError(null);
    try {
      const ext = audioPreview.mimeType.includes("ogg") ? ".ogg" : ".webm";
      const file = new File([audioPreview.blob], `voz_${Date.now()}${ext}`, { type: audioPreview.mimeType });
      const formData = new FormData();
      formData.append("file", file);
      const mediaResult = await apiFetch<{ url: string; filename: string; mimeType: string; size: number }>(
        `/inbox/conversations/${selectedId}/media`,
        { method: "POST", body: formData },
      );
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/message`, {
        method: "POST",
        body: JSON.stringify({
          content: mediaResult.url,
          attachmentKind: "audio",
          attachmentUrl: mediaResult.url,
          attachmentPreviewUrl: mediaResult.url,
          attachmentMimeType: mediaResult.mimeType,
          attachmentFileName: mediaResult.filename,
          attachmentFileSize: mediaResult.size,
          attachmentDurationSeconds: audioPreview.seconds,
        }),
      });
      URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
      setSelectedConversation(data);
      selectedConversationRef.current = data;
      rememberConversationDetail(data);
      setNotice({ tone: "success", text: "Áudio enfileirado com sucesso." });
      void loadConversations({ preferredId: data.id, silent: true });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Falha ao enviar áudio.";
      setError(message);
    } finally {
      setSending(false);
    }
  }, [audioPreview, loadConversations, rememberConversationDetail, selectedId]);

  const handleComposerPaste = useCallback(
    (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      if (selectedBlocked || sending) return;

      const clipboardItems = Array.from(event.clipboardData?.items || []);
      const fileFromItem = clipboardItems.find((item) => item.kind === "file")?.getAsFile() || null;
      const fileFromList = Array.from(event.clipboardData?.files || [])[0] || null;
      const file = fileFromItem || fileFromList;
      if (!file) return;

      event.preventDefault();
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview.url);
      }
      setImagePreview(createInboxAttachmentPreview(file));
    },
    [imagePreview, selectedBlocked, sending],
  );

  const inboxWorkspaceComponents = useMemo(
    () => ({
      list: () => (
        <ConversationListPane
          eyebrow={undefined}
          title={undefined}
          description={undefined}
          count={undefined}
          actions={undefined}
          className={`${styles.workspaceDockPanel} ${styles.inboxListPanel}`}
          bodyClassName={`${styles.workspaceDockBody} ${styles.inboxListBody}`}
        >
          <div className={styles.listSearchRow}>
            <label className={styles.listSearchField}>
              <SearchIcon className={styles.listSearchIcon} />
              <input
                type="search"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Buscar conversa, telefone ou trecho..."
                className={styles.listSearchInput}
                aria-label="Buscar conversa"
              />
            </label>
            <button
              type="button"
              className={styles.listSearchAction}
              onClick={() => setConversationSearch("")}
              disabled={!conversationSearch.trim()}
            >
              Limpar
            </button>
          </div>
          <ConversationQueueFilterBar
            value={inboxQueue as ConversationQueueFilterValue}
            counts={queueCounts as Record<ConversationQueueFilterValue, number>}
            unreadCounts={queueUnreadCounts as Record<ConversationQueueFilterValue, number>}
            dropOverQueue={dropOverQueue as ConversationQueueFilterValue | null}
            allowQueueCardDrag
            draggedQueue={draggedQueueId as ConversationQueueFilterValue | null}
            onChange={(value) => setInboxQueue(value as InboxQueue)}
            onQueueCardDragStart={(queue) => {
              setDraggedConversationId(null);
              setDraggedQueueId(queue as InboxQueue);
            }}
            onQueueCardDragEnd={() => {
              setDraggedQueueId(null);
              setDropOverQueue(null);
            }}
            onQueueDragOver={(queue) => setDropOverQueue(queue as InboxQueue)}
            onQueueDragLeave={() => setDropOverQueue(null)}
            onQueueDrop={(queue) => handleQueueDrop(queue as InboxQueue)}
          />
          {loadingList ? (
            <ChatEmptyState title="Carregando conversas">A fila sera montada assim que a leitura inicial terminar.</ChatEmptyState>
          ) : conversationListError && filteredConversations.length === 0 ? (
            <ConversationWorkspaceStatus
              title="Falha ao carregar conversas"
              description={conversationListError}
              tone="error"
              diagnostics={inboxQueueDiagnostics}
              onRetry={retryConversationList}
              retryLabel="Recarregar fila"
            />
          ) : filteredConversations.length === 0 ? (
            <ChatEmptyState title="Nenhuma conversa encontrada">Ajuste o filtro ou aguarde novas mensagens entrarem na fila.</ChatEmptyState>
          ) : (
            <ChatQueue className={styles.conversationList}>
              {filteredConversations.map((conversation, idx) => {
                const active = conversation.id === selectedId;
                const unreadCount = getInboxConversationUnreadCount(conversation);
                const statusMeta = getAtendimentoConversationStatusMeta(
                  conversation,
                  hasRecoveryCapability,
                );
                const conversationWithoutWhatsapp = hasConversationUnavailableWhatsapp(
                  conversation.id,
                  customerConversationCardCacheRef.current,
                  conversation.id === selectedId ? customerConversationCard : null,
                  conversation,
                );
                const displayName = resolveInboxConversationDisplayName(conversation);
                const subtitleLabel = getInboxConversationSubtitle(conversation);
                const previewLabel = getInboxConversationPreview(conversation);
                const activityAtLabel = formatTimeLabel(
                  getInboxConversationActivityAt(conversation),
                  mounted,
                );
                return (
                  <ChatQueueItem
                    key={conversation.id}
                    active={active}
                    onClick={() => loadConversation(conversation.id)}
                    style={{ "--reveal-index": idx } as CSSProperties}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(conversation.id));
                      setDraggedQueueId(null);
                      setDraggedConversationId(String(conversation.id));
                    }}
                    onDragEnd={() => {
                      setDraggedConversationId(null);
                      setDraggedQueueId(null);
                      setDropOverQueue(null);
                    }}
                    initials={getInboxConversationInitials(conversation)}
                    imageUrl={resolveInboxAvatarUrl(conversation)}
                    label={conversationWithoutWhatsapp ? "S/WA" : statusMeta.shortLabel}
                    tone={
                      conversationWithoutWhatsapp
                        ? "danger"
                        : mapAtendimentoConversationToneToQueueTone(statusMeta.tone)
                    }
                    title={displayName}
                    subtitle={subtitleLabel}
                    preview={previewLabel}
                    badges={
                      unreadCount > 0 ? (
                        <span className={styles.conversationUnreadBadge}>
                          {unreadCount === 1 ? "1 não lida" : `${unreadCount} não lidas`}
                        </span>
                      ) : undefined
                    }
                    meta={
                      <div className={styles.conversationQueueMetaStack}>
                        <span className={styles.conversationQueueMetaTime}>{activityAtLabel}</span>
                        <div className={styles.conversationQueueMetaMenuWrap}>
                          <button
                            type="button"
                            className={styles.conversationQueueMetaButton}
                            aria-label="Abrir ações da conversa"
                            title="Ações da conversa"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => toggleQueueConversationMenu(conversation.id, event)}
                          >
                            <ChatGlyph name="gear" />
                          </button>
                        </div>
                      </div>
                    }
                    className={joinClassNames(
                      styles.conversationQueueItem,
                      queueActionConversationId === conversation.id && styles.conversationQueueItemMenuOpen,
                      (conversation.isBlocked || isInboxConversationArchived(conversation))
                        && styles.conversationQueueItemMuted,
                      conversationWithoutWhatsapp && styles.conversationQueueItemUnavailable,
                      unreadCount > 0 && styles.conversationQueueItemUnread,
                    )}
                    data-unread={unreadCount > 0 ? "true" : "false"}
                    aria-label={`${displayName}${unreadCount > 0 ? `, ${unreadCount} não lida${unreadCount === 1 ? "" : "s"}` : ""}`}
                  />
                );
              })}
            </ChatQueue>
          )}
        </ConversationListPane>
      ),
      main: () => (
        <section className={`${styles.workspaceDockPanel} ${styles.inboxMainPanel} ${styles.chatStagePanel}`}>
          {conversationDetailError && selectedId && !conversationForView ? (
            <ConversationWorkspaceStatus
              title="Falha ao abrir conversa"
              description={conversationDetailError}
              tone="error"
              diagnostics={inboxDetailDiagnostics}
              onRetry={retryConversationDetail}
              retryLabel="Reabrir conversa"
            />
          ) : !conversationForView ? (
            <ChatEmptyState title="Nenhuma conversa selecionada">Escolha uma conversa na fila para abrir o chat.</ChatEmptyState>
          ) : (
            <section
              key={conversationForView.id}
              className={`${styles.whatsAppConversationShell} ${styles.whatsAppConversationShellTransition} ${
                isConversationStageSwitching ? styles.whatsAppConversationShellLoading : ""
              }`}
            >
              {isConversationStageSwitching ? (
                <div className={styles.whatsAppConversationLoadingMask} aria-hidden="true">
                  <span className={styles.whatsAppConversationLoadingChip}>Abrindo conversa...</span>
                </div>
              ) : null}
              <header className={styles.whatsAppConversationHeader}>
                <div className={styles.whatsAppConversationIdentity}>
                  <ChatAvatar
                    initials={getInboxConversationInitials(conversationForView)}
                    imageUrl={resolveInboxAvatarUrl(conversationForView)}
                    tone={
                      selectedConversationWithoutWhatsapp
                        ? "danger"
                        : mapAtendimentoConversationToneToQueueTone(selectedConversationStatusMeta?.tone || "bot")
                    }
                  />
                  <div className={styles.whatsAppConversationIdentityText}>
                    <strong>{selectedConversationDisplayName}</strong>
                    <div className={styles.conversationIdentityMeta}>
                      {selectedConversationWithoutWhatsapp ? (
                        <span
                          className={styles.conversationContextBadge}
                          data-tone="danger"
                        >
                          Sem WhatsApp
                        </span>
                      ) : null}
                      {selectedConversationStatusMeta ? (
                        <span
                          className={styles.conversationContextBadge}
                          data-tone={selectedConversationStatusMeta.tone}
                        >
                          {selectedConversationStatusMeta.label}
                        </span>
                      ) : null}
                      {getInboxConversationSubtitle(conversationForView) ? (
                        <span className={styles.conversationIdentitySubtitle}>
                          {getInboxConversationSubtitle(conversationForView)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className={styles.whatsAppConversationActions}>
                  {selectedConversationHasRecoveryContext ? (
                    <ChatIconButton
                      icon="wallet"
                      onClick={() => setContextTab("financeiro")}
                      title="Abrir contexto financeiro"
                      aria-label="Abrir contexto financeiro"
                    />
                  ) : null}
                  {selectedConversationIsAgenda ? (
                    <ChatIconButton
                      icon="clock"
                      onClick={() => setContextTab("agenda")}
                      title="Abrir contexto de agenda"
                      aria-label="Abrir contexto de agenda"
                    />
                  ) : null}
                  <ChatIconButton
                    icon="gear"
                    onClick={() => handleSectionChange("automacao")}
                    title="Abrir automacao"
                    aria-label="Abrir automacao"
                  />
                  <button
                    type="button"
                    className={styles.conversationPrimaryAction}
                    onClick={() => void updateStatus(selectedStatus === "closed" ? "open" : "closed")}
                    disabled={sending}
                  >
                    {selectedStatus === "closed" ? "Reabrir atendimento" : "Finalizar atendimento"}
                  </button>
                </div>
              </header>

              <div ref={chatTimelineRef} className={styles.whatsAppTimeline}>
                {loadingConversation || isInboxConversationSummaryOnly(conversationForView) ? (
                  <ChatEmptyState title="Carregando conversa">Preparando historico do cliente.</ChatEmptyState>
                ) : conversationMessagesForView.length === 0 ? (
                  selectedVendasAgendaDraftMessage ? (
                    <ChatEmptyState title="Roteiro carregado">
                      A mensagem de Vendas esta pre-carregada abaixo para envio manual.
                    </ChatEmptyState>
                  ) : (
                    <ChatEmptyState title="Sem mensagens">Esta conversa ainda nao tem historico registrado.</ChatEmptyState>
                  )
                ) : (
                  <>
                    {olderMessagesHasMore ? (
                      <div className={styles.whatsAppOlderMessagesRow}>
                        <button
                          type="button"
                          className={styles.whatsAppOlderMessagesButton}
                          onClick={() => void loadOlderMessages()}
                          disabled={loadingOlderMessages}
                        >
                          {loadingOlderMessages ? "Carregando..." : "Carregar mensagens anteriores"}
                        </button>
                      </div>
                    ) : null}
                    {conversationMessagesForView.map((message, index) => {
                    const tone = mapInboxBubbleTone(message);
                    let rendered = parseInboxMessageMedia(message, conversationForView);
                    const mediaFailedInBrowser = Boolean(
                      (rendered.imageUrl && failedInboxMediaUrls[rendered.imageUrl]) ||
                        (rendered.videoUrl && failedInboxMediaUrls[rendered.videoUrl]) ||
                        (rendered.audioUrl && failedInboxMediaUrls[rendered.audioUrl]) ||
                        (rendered.documentUrl && failedInboxMediaUrls[rendered.documentUrl]),
                    );
                    if (mediaFailedInBrowser) {
                      rendered = {
                        ...rendered,
                        imageUrl: null,
                        videoUrl: null,
                        audioUrl: null,
                        documentUrl: null,
                        mediaExpired: true,
                      };
                    }
                    const previousMessage =
                      index > 0 ? conversationMessagesForView[index - 1] : null;
                    const showDayDivider = !previousMessage
                      || !isInboxSameCalendarDay(previousMessage.createdAt, message.createdAt);
                    const isOutbound = tone === "human" || tone === "outbound";
                    const showGroupSender =
                      !isOutbound
                      && tone !== "system"
                      && isInboxGroupRemoteJid(extractInboxRawContact(conversationForView))
                      && Boolean(rendered.senderName);
                    const reactionKey = getInboxMessageProviderKeyId(message);
                    const reactionEmojis = reactionKey
                      ? conversationReactionIndex.get(reactionKey) || []
                      : [];
                    const canDeleteMessage =
                      isOutbound &&
                      !rendered.isDeleted &&
                      Boolean(reactionKey);
                    const canRevealDeleted = rendered.isDeleted && canRevealDeletedInboxMessage(message);
                    const isDeletedRevealed = Boolean(revealedDeletedMessageIds[message.id]);
                    const canPreviewDocument =
                      Boolean(rendered.documentUrl) &&
                      canPreviewDocumentInOverlay(
                        rendered.documentUrl || "",
                        rendered.mimeType,
                        rendered.fileName,
                      );
                    return (
                      <div key={message.id} className={styles.whatsAppMessageBlock}>
                        {showDayDivider ? (
                          <div className={styles.whatsAppDayDivider}>
                            <span>{formatInboxMessageDayLabel(message.createdAt, mounted)}</span>
                          </div>
                        ) : null}
                        <div
                          className={`${styles.whatsAppMessageRow} ${
                            isOutbound
                              ? styles.whatsAppMessageRowOutbound
                              : tone === "system"
                                ? styles.whatsAppMessageRowSystem
                                : styles.whatsAppMessageRowInbound
                          }`}
                        >
                          {tone !== "system" ? (
                            <div
                              className={`${styles.whatsAppHoverActionRail} ${
                                isOutbound
                                  ? styles.whatsAppHoverActionRailOutbound
                                  : styles.whatsAppHoverActionRailInbound
                              }`}
                            >
                              <button
                                type="button"
                                className={styles.whatsAppReplyButtonHover}
                                title="Responder"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setReplyingTo(message);
                                  chatComposerInputRef.current?.focus();
                                }}
                              >
                                ↩
                              </button>
                              <button
                                type="button"
                                className={styles.whatsAppReplyButtonHover}
                                title="Reagir"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                  setMessageReactionTargetId((current) =>
                                    current === message.id ? null : message.id,
                                  )
                                }
                              >
                                <ChatGlyph name="smile" />
                              </button>
                              {canDeleteMessage ? (
                                <button
                                  type="button"
                                  className={styles.whatsAppReplyButtonHover}
                                  title="Apagar para todos"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => void deleteSentMessage(message.id)}
                                >
                                  <ChatGlyph name="trash" />
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          <div className={styles.whatsAppBubbleWrap}>
                            <div
                              className={`${styles.whatsAppBubble} ${
                                isOutbound
                                  ? styles.whatsAppBubbleOutbound
                                  : tone === "system"
                                    ? styles.whatsAppBubbleSystem
                                    : styles.whatsAppBubbleInbound
                              } ${rendered.imageUrl ? styles.whatsAppBubbleWithMedia : ""} ${
                                ["image", "video", "document", "audio"].includes(String(rendered.kind || ""))
                                  ? styles.whatsAppBubbleWithAttachment
                                  : ""
                              }`}
                            >
                              {rendered.quotedText ? (
                                <div className={styles.whatsAppQuotedSnippet}>
                                  <span className={styles.whatsAppQuotedSnippetLabel}>Mensagem respondida</span>
                                  <p className={styles.whatsAppQuotedSnippetText}>
                                    {formatWhatsAppText(rendered.quotedText)}
                                  </p>
                                </div>
                              ) : null}
                              {showGroupSender ? (
                                <span
                                  className={styles.whatsAppBubbleSender}
                                  style={rendered.senderColor ? { color: rendered.senderColor } : undefined}
                                >
                                  {rendered.senderName}
                                </span>
                              ) : null}
                              {rendered.mediaExpired ? (
                                <div className={styles.whatsAppExpiredMediaCard}>
                                  <span className={styles.whatsAppDocumentIcon}>EXP</span>
                                  <span className={styles.whatsAppDocumentBody}>
                                    <strong>Midia temporaria expirada</strong>
                                    <span>Atualize a conversa para tentar obter um novo link.</span>
                                  </span>
                                </div>
                              ) : null}
                              {rendered.imageUrl ? (
                                <button
                                  type="button"
                                  className={styles.whatsAppBubbleImageButton}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    setOpenedAsset({
                                      kind: "image",
                                      src: rendered.imageUrl || "",
                                      alt: "Imagem da conversa",
                                    })
                                  }
                                  aria-label="Abrir imagem"
                                  title="Abrir imagem"
                                >
                                  <img
                                    src={rendered.imageUrl}
                                    alt="Imagem enviada"
                                    className={styles.whatsAppBubbleImage}
                                    loading="lazy"
                                    onError={() => markInboxMediaUrlFailed(rendered.imageUrl)}
                                  />
                                </button>
                              ) : null}
                              {rendered.videoUrl ? (
                                <video
                                  className={styles.whatsAppBubbleVideo}
                                  controls
                                  preload="metadata"
                                  onError={() => markInboxMediaUrlFailed(rendered.videoUrl)}
                                >
                                  <source src={rendered.videoUrl} />
                                </video>
                              ) : null}
                              {rendered.documentUrl || rendered.kind === "document" ? (
                                rendered.documentUrl ? (
                                  <button
                                    type="button"
                                    className={styles.whatsAppDocumentCard}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      if (canPreviewDocument) {
                                        setOpenedAsset({
                                          kind: "document",
                                          src: rendered.documentUrl || "",
                                          alt: rendered.fileName || "Documento",
                                          title: rendered.fileName || "Documento",
                                          mimeType: rendered.mimeType,
                                          fileName: rendered.fileName,
                                        });
                                        return;
                                      }
                                      window.open(rendered.documentUrl || "", "_blank", "noopener,noreferrer");
                                    }}
                                  >
                                    <span className={styles.whatsAppDocumentIcon}>DOC</span>
                                    <span className={styles.whatsAppDocumentBody}>
                                      <strong>{rendered.fileName || "Documento"}</strong>
                                      <span>
                                        {[rendered.mimeType, formatInboxFileSizeLabel(rendered.fileSize)]
                                          .filter(Boolean)
                                          .join(" • ") || "Abrir documento"}
                                      </span>
                                    </span>
                                  </button>
                                ) : (
                                  <div className={styles.whatsAppDocumentCard}>
                                    <span className={styles.whatsAppDocumentIcon}>DOC</span>
                                    <span className={styles.whatsAppDocumentBody}>
                                      <strong>{rendered.fileName || "Documento"}</strong>
                                      <span>
                                        {[rendered.mimeType, formatInboxFileSizeLabel(rendered.fileSize)]
                                          .filter(Boolean)
                                          .join(" • ") || "Documento recebido"}
                                      </span>
                                    </span>
                                  </div>
                                )
                              ) : null}
                              {rendered.audioUrl || rendered.kind === "audio" ? (
                                <div className={styles.whatsAppAudioCard}>
                                  <span className={styles.whatsAppAudioIcon}>
                                    {rendered.isVoiceNote ? "VOZ" : "AUDIO"}
                                  </span>
                                  <div className={styles.whatsAppAudioBody}>
                                    {rendered.audioUrl ? (
                                      <audio
                                        key={rendered.audioUrl}
                                        className={styles.whatsAppAudioPlayer}
                                        controls
                                        preload="metadata"
                                        src={rendered.audioUrl}
                                        onError={() => markInboxMediaUrlFailed(rendered.audioUrl)}
                                      />
                                    ) : (
                                      <div className={styles.whatsAppAudioWavePlaceholder} />
                                    )}
                                    <span className={styles.whatsAppAudioMeta}>
                                      {rendered.isVoiceNote ? "Mensagem de voz" : "Áudio recebido"}
                                      {rendered.durationSeconds ? ` • ${formatInboxDurationLabel(rendered.durationSeconds)}` : ""}
                                    </span>
                                  </div>
                                </div>
                              ) : null}
                              {rendered.text ? (
                                <p className={styles.whatsAppBubbleText}>{formatWhatsAppText(rendered.text)}</p>
                              ) : null}
                              {rendered.isDeleted && canRevealDeleted ? (
                                <button
                                  type="button"
                                  className={styles.whatsAppDeletedRevealButton}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    setRevealedDeletedMessageIds((current) => ({
                                      ...current,
                                      [message.id]: !current[message.id],
                                    }))
                                  }
                                >
                                  {isDeletedRevealed && rendered.deletedOriginalText
                                    ? formatWhatsAppText(rendered.deletedOriginalText)
                                    : "Toque para revelar por 7 dias"}
                                </button>
                              ) : null}
                              <span
                                className={`${styles.whatsAppBubbleMeta} ${
                                  rendered.imageUrl ? styles.whatsAppBubbleMetaOnMedia : ""
                                }`}
                              >
                                {formatInboxMessageTimeLabel(message.createdAt, mounted)}
                                {isOutbound ? (
                                  <MessageStatusTick status={message.status} />
                                ) : null}
                              </span>
                            </div>
                            {reactionEmojis.length ? (
                              <div className={styles.whatsAppReactionChipRow}>
                                {Array.from(new Set(reactionEmojis)).map((emoji) => {
                                  const count = reactionEmojis.filter((item) => item === emoji).length;
                                  return (
                                    <span key={`${message.id}:${emoji}`} className={styles.whatsAppReactionChip}>
                                      <span>{emoji}</span>
                                      {count > 1 ? <strong>{count}</strong> : null}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : null}
                            {messageReactionTargetId === message.id ? (
                              <div
                                ref={messageReactionPickerRef}
                                className={`${styles.whatsAppReactionPickerBubble} ${
                                  isOutbound
                                    ? styles.whatsAppReactionPickerBubbleOutbound
                                    : styles.whatsAppReactionPickerBubbleInbound
                                }`}
                              >
                                {["👍", "❤️", "😂", "🙏", "😮", "😢"].map((emoji) => (
                                  <button
                                    key={`${message.id}:${emoji}`}
                                    type="button"
                                    className={styles.whatsAppReactionPickerItem}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => void reactToMessage(message.id, emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </>
                )}
              </div>

              <form className={styles.whatsAppComposerForm} onSubmit={sendMessage}>
                {replyingTo ? (
                  <div className={styles.whatsAppReplyBar}>
                    <div className={styles.whatsAppReplyBarContent}>
                      <span className={styles.whatsAppReplyBarLabel}>Respondendo a</span>
                      <p className={styles.whatsAppReplyBarText}>{getMessagePreview(replyingTo).slice(0, 100)}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.whatsAppReplyBarClose}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setReplyingTo(null)}
                      aria-label="Cancelar resposta"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                {imagePreview ? (
                  <div className={styles.whatsAppImagePreviewBar}>
                    {imagePreview.kind === "image" ? (
                      <img src={imagePreview.url} alt="preview" className={styles.whatsAppImagePreviewThumb} />
                    ) : (
                      <div className={styles.whatsAppAttachmentPreviewIcon}>
                        {imagePreview.kind === "audio"
                          ? "AUDIO"
                          : imagePreview.kind === "video"
                            ? "VIDEO"
                            : "DOC"}
                      </div>
                    )}
                    <div className={styles.whatsAppAttachmentPreviewBody}>
                      <span className={styles.whatsAppImagePreviewName}>{imagePreview.fileName}</span>
                      <small className={styles.whatsAppAttachmentPreviewMeta}>
                        {[imagePreview.kind, formatInboxFileSizeLabel(imagePreview.size)]
                          .filter(Boolean)
                          .join(" • ")}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={styles.whatsAppImagePreviewClose}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        URL.revokeObjectURL(imagePreview.url);
                        setImagePreview(null);
                      }}
                      aria-label="Remover imagem"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                {audioPreview ? (
                  <div className={styles.whatsAppAudioPreviewBar}>
                    <audio controls src={audioPreview.url} className={styles.whatsAppAudioPreviewPlayer} />
                    <span className={styles.whatsAppAudioPreviewMeta}>
                      🎙️ {audioPreview.seconds}s · pronto para enviar
                    </span>
                    <button
                      type="button"
                      className={`btn ${styles.whatsAppAudioPreviewSend}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void sendAudioPreview()}
                      disabled={sending}
                    >
                      {sending ? "Enviando..." : "Enviar áudio"}
                    </button>
                    <button
                      type="button"
                      className={styles.whatsAppImagePreviewClose}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        URL.revokeObjectURL(audioPreview.url);
                        setAudioPreview(null);
                      }}
                      aria-label="Cancelar áudio"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                <div className={styles.whatsAppComposerRow}>
                  <div className={styles.whatsAppEmojiWrapper} ref={emojiPickerRef}>
                    <button
                      type="button"
                      className={styles.whatsAppEmojiButton}
                      onClick={() => setEmojiPickerOpen((prev) => !prev)}
                      title="Emojis"
                      aria-label="Abrir seletor de emojis"
                    >
                      😊
                    </button>
                    {emojiPickerOpen ? (
                      <div className={styles.whatsAppEmojiPicker}>
                        {COMMON_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className={styles.whatsAppEmojiItem}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const textarea = chatComposerInputRef.current;
                              if (!textarea) {
                                sendTextDirtyRef.current = true;
                                setSendText((prev) => prev + emoji);
                                setEmojiPickerOpen(false);
                                return;
                              }
                              const start = textarea.selectionStart ?? textarea.value.length;
                              const end = textarea.selectionEnd ?? textarea.value.length;
                              const next = textarea.value.substring(0, start) + emoji + textarea.value.substring(end);
                              sendTextDirtyRef.current = true;
                              setSendText(next);
                              setEmojiPickerOpen(false);
                              window.requestAnimationFrame(() => {
                                textarea.focus();
                                const cur = start + [...emoji].length;
                                textarea.setSelectionRange(cur, cur);
                              });
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={styles.whatsAppAttachButton}
                    title="Anexar arquivo"
                    aria-label="Anexar arquivo"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={selectedConversationInteractionBlocked || sending || isRecording}
                  >
                    📎
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,audio/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (imagePreview) URL.revokeObjectURL(imagePreview.url);
                      setImagePreview(createInboxAttachmentPreview(file));
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={`${styles.whatsAppAttachButton} ${isRecording ? styles.whatsAppMicActive : ""}`}
                    title={isRecording ? `Parar gravação (${recordingSeconds}s)` : "Gravar áudio"}
                    aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (isRecording ? stopRecording() : void startRecording())}
                    disabled={selectedConversationInteractionBlocked || sending}
                  >
                    {isRecording ? `🔴 ${recordingSeconds}s` : "🎙️"}
                  </button>
                  <textarea
                    id="atendimento-chat-reply"
                    name="atendimentoChatReply"
                    ref={chatComposerInputRef}
                    className={`field ${styles.whatsAppComposerInput}`}
                    rows={1}
                    spellCheck={true}
                    lang="pt-BR"
                    value={sendText}
                    onChange={(event) => {
                      sendTextDirtyRef.current = true;
                      setSendText(event.target.value);
                    }}
                    onPaste={handleComposerPaste}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      chatComposerInputRef.current?.focus();
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={
                      selectedBlocked
                        ? "Contato bloqueado. Desbloqueie para responder."
                        : selectedConversationWithoutWhatsapp
                          ? "Número sem WhatsApp. O envio manual fica bloqueado."
                        : "Digite uma mensagem"
                    }
                    disabled={selectedConversationInteractionBlocked || sending}
                  />
                  <button
                    type="submit"
                    className={`btn ${styles.whatsAppComposerButton} ${selectedConversationWithoutWhatsapp ? styles.whatsAppComposerButtonUnavailable : ""}`}
                    disabled={
                      sending
                      || (!sendText.trim() && !imagePreview)
                      || selectedConversationInteractionBlocked
                    }
                    aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}
                    title={
                      selectedConversationWithoutWhatsapp
                        ? "Motor confirmou que este número não possui WhatsApp."
                        : sending
                          ? "Enviando..."
                          : "Enviar"
                    }
                  >
                    {sending ? <span className={styles.whatsAppComposerButtonSpinner} aria-hidden="true" /> : "➤"}
                  </button>
                </div>
                {selectedBlocked ? (
                  <small className={styles.whatsAppComposerHint}>
                    Contato bloqueado. Desbloqueie para responder.
                  </small>
                ) : selectedConversationWithoutWhatsapp ? (
                  <small className={`${styles.whatsAppComposerHint} ${styles.whatsAppComposerHintUnavailable}`}>
                    Motor confirmou que este número não possui WhatsApp. O envio manual fica bloqueado.
                  </small>
                ) : selectedVendasAgendaDraftMessage ? (
                  <small className={styles.whatsAppComposerHint}>
                    Roteiro de Vendas carregado. Revise e envie manualmente.
                  </small>
                ) : null}
              </form>

              {openedAsset ? (
                <div
                  className={styles.whatsAppImageLightbox}
                  role="dialog"
                  aria-modal="true"
                  aria-label={
                    openedAsset.kind === "document"
                      ? "Visualizador de documento"
                      : "Visualizador de imagem"
                  }
                  onClick={() => setOpenedAsset(null)}
                >
                  <button
                    type="button"
                    className={styles.whatsAppImageLightboxClose}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setOpenedAsset(null)}
                    aria-label="Fechar visualizador"
                  >
                    ✕
                  </button>
                  <div
                    className={
                      openedAsset.kind === "document"
                        ? styles.whatsAppDocumentLightboxCard
                        : styles.whatsAppImageLightboxCard
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    {openedAsset.kind === "document" ? (
                      <>
                        <div className={styles.whatsAppDocumentLightboxHeader}>
                          <div className={styles.whatsAppDocumentLightboxTitle}>
                            <strong>{openedAsset.title || openedAsset.fileName || "Documento"}</strong>
                            {openedAsset.mimeType ? <span>{openedAsset.mimeType}</span> : null}
                          </div>
                          <a
                            href={openedAsset.src}
                            target="_blank"
                            rel="noreferrer"
                            className={`btn btn-secondary btn-sm ${styles.whatsAppDocumentLightboxLink}`}
                          >
                            Abrir em nova guia
                          </a>
                        </div>
                        <iframe
                          src={openedAsset.src}
                          title={openedAsset.title || openedAsset.fileName || "Documento"}
                          className={styles.whatsAppDocumentLightboxFrame}
                        />
                      </>
                    ) : (
                      <img
                        src={openedAsset.src}
                        alt={openedAsset.alt}
                        className={styles.whatsAppImageLightboxImage}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          )}
        </section>
      ),
      context: () => (
        <ConversationContextPanel
          eyebrow={undefined}
          title={undefined}
          description={undefined}
          count={undefined}
          actions={
            selectedConversation ? (
              <WorkspaceSegmentedControl
                items={CONTEXT_TAB_ITEMS}
                value={contextTab}
                onChange={(nextValue) => setContextTab(nextValue as ContextTab)}
                className={styles.contextTabs}
                highlightClassName={styles.contextTabHighlight}
                buttonClassName={styles.contextTab}
                activeButtonClassName={styles.contextTabActive}
                role="tablist"
                buttonRole="tab"
                ariaLabel="Abas de contexto do cliente"
              />
            ) : undefined
          }
          className={`${styles.workspaceDockPanel} ${styles.inboxContextPanel}`}
          bodyClassName={`${styles.workspaceDockBody} ${styles.inboxContextBody}`}
        >
          {!selectedConversation ? (
            <ChatEmptyState title="Sem contexto ativo">Abra uma conversa para liberar os atalhos operacionais.</ChatEmptyState>
          ) : (
            <div className={styles.contextStack}>
              {contextTab === "conversa" ? (
                <div className={styles.contextGrid}>
                  <ChatInfoCard
                    title="Card do cliente"
                    meta={selectedConversationWithoutWhatsapp ? "Sem WhatsApp" : customerConversationCard?.lead?.statusLabel || "Vendas"}
                  >
                    <LiquidGlassCard
                      accentTone={selectedConversationWithoutWhatsapp ? "danger" : "success"}
                      header={
                        <div className={styles.customerCardHeader}>
                          <div>
                            <strong className={glassCardStyles.title}>{customerCardName}</strong>
                            <span className={glassCardStyles.subtitle}>{customerCardPhone ? formatInboxPhoneLabel(customerCardPhone) || customerCardPhone : "Sem telefone"}</span>
                          </div>
                          <div className={styles.customerCardHeaderActions}>
                            <button
                              type="button"
                              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                              onClick={() => setCustomerCardShortcutOpen((current) => !current)}
                            >
                              Cadastro
                            </button>
                            <button
                              type="button"
                              className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`}
                              onClick={openCustomerReturnPicker}
                            >
                              Retorno
                            </button>
                          </div>
                        </div>
                      }
                      lead={
                        <div className={glassCardStyles.stack}>
                          {customerCardShortcutOpen ? (
                            <div className={`${styles.customerCardShortcut} ${glassCardStyles.subtlePanel}`}>
                              <strong>{customerCardName}</strong>
                              <span>Perfil #{customerConversationCard?.customer?.profileId || "--"}</span>
                              <span>
                                {selectedConversationWithoutWhatsapp
                                  ? "Sem WhatsApp confirmado no motor"
                                  : customerConversationCardDraft.doNotCall
                                    ? "Não ligar mais"
                                    : "Contato liberado"}
                              </span>
                            </div>
                          ) : null}

                          <div className={`${styles.customerCardReturnLine} ${glassCardStyles.subtlePanel}`}>
                            <span>
                              {customerCardReturnAt
                                ? `Retorno ${formatShortDateTimeLabel(customerCardReturnAt, mounted)}`
                                : `Hoje · ${formatShortDateTimeLabel(customerCardLastContactAt, mounted)}`}
                            </span>
                            {selectedConversationWithoutWhatsapp ? (
                              <em>Sem WhatsApp</em>
                            ) : customerConversationCardDraft.doNotCall ? <em>Não ligar mais</em> : null}
                          </div>
                        </div>
                      }
                      actions={
                        <div className={glassCardStyles.cluster}>
                          <button
                            type="button"
                            className={`${glassCardStyles.actionButton} ${selectedConversationWithoutWhatsapp ? glassCardStyles.actionDanger : glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`}
                            onClick={() => {
                              if (!customerCardCanOpenWhatsapp) return;
                              window.open(`https://wa.me/${customerCardPhoneDigits}`, "_blank", "noopener,noreferrer");
                            }}
                            disabled={!customerCardCanOpenWhatsapp}
                          >
                            {selectedConversationWithoutWhatsapp ? "Sem WhatsApp" : "WhatsApp"}
                          </button>
                          <button
                            type="button"
                            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                            onClick={() => {
                              if (!customerCardPhoneDigits) return;
                              window.location.href = `tel:+${customerCardPhoneDigits}`;
                            }}
                            disabled={!customerCardPhoneDigits}
                          >
                            Ligar
                          </button>
                          <button
                            type="button"
                            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                            onClick={scheduleCustomerReturnTomorrow}
                            disabled={savingCustomerConversationCard}
                          >
                            Amanhã
                          </button>
                          <button
                            type="button"
                            className={`${glassCardStyles.actionButton} ${glassCardStyles.actionDanger} ${glassCardStyles.noBreak}`}
                            onClick={markCustomerDoNotCall}
                            disabled={savingCustomerConversationCard || customerConversationCardDraft.doNotCall}
                          >
                            Não ligar mais
                          </button>
                        </div>
                      }
                      highlight={
                        <div className={glassCardStyles.stack}>
                          <div className={styles.customerCardSummaryBox}>
                            <label>
                              <span>Observações</span>
                              <textarea
                                className={`field ${styles.customerCardTextarea}`}
                                rows={4}
                                value={customerConversationCardDraft.observations}
                                onChange={(event) =>
                                  setCustomerConversationCardDraft((current) => ({
                                    ...current,
                                    observations: event.target.value,
                                  }))
                                }
                                placeholder="Digite o contexto comercial, combinado ou restrição..."
                              />
                            </label>
                          </div>

                          <div className={styles.customerCardReturnEditor}>
                            <label>
                              <span>Retorno</span>
                              <input
                                ref={customerReturnInputRef}
                                type="datetime-local"
                                className="field"
                                value={customerConversationCardDraft.returnAt}
                                onChange={(event) => handleCustomerReturnChange(event.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                              onClick={() => void saveCustomerConversationCard()}
                              disabled={savingCustomerConversationCard}
                            >
                              {savingCustomerConversationCard ? "Salvando..." : "Salvar"}
                            </button>
                          </div>
                        </div>
                      }
                      metrics={
                        <div className={glassCardStyles.metricGrid}>
                          <div className={glassCardStyles.metricCard}>
                            <span className={glassCardStyles.metricLabel}>Tentativas</span>
                            <strong className={glassCardStyles.metricValue}>{customerCardAttempts}</strong>
                          </div>
                          <div className={glassCardStyles.metricCard}>
                            <span className={glassCardStyles.metricLabel}>Reaparicoes</span>
                            <strong className={glassCardStyles.metricValue}>{customerCardTimesSeen}</strong>
                          </div>
                          <div className={glassCardStyles.metricCard}>
                            <span className={glassCardStyles.metricLabel}>Ultimo contato</span>
                            <strong className={glassCardStyles.metricValue}>{formatShortDateTimeLabel(customerCardLastContactAt, mounted)}</strong>
                          </div>
                        </div>
                      }
                    >
                      <div className={styles.customerCardHistory}>
                        <div className={styles.customerCardHistoryHeader}>
                          <strong>Histórico</strong>
                          <span>{loadingCustomerConversationCard ? "Carregando" : `${customerCardHistory.length}`}</span>
                        </div>
                        {customerConversationCardError ? (
                          <ChatFieldNote>{customerConversationCardError}</ChatFieldNote>
                        ) : customerCardHistory.length > 0 ? (
                          customerCardHistory.slice(0, 5).map((event) => (
                            <article key={event.id} className={styles.customerCardHistoryItem}>
                              <strong>{event.title || "Atualização"}</strong>
                              <p>{event.description || event.resultLabel || "Registro salvo no histórico."}</p>
                              <span>{formatShortDateTimeLabel(event.createdAt, mounted)}</span>
                            </article>
                          ))
                        ) : (
                          <ChatFieldNote>Nenhum histórico comercial registrado para este telefone.</ChatFieldNote>
                        )}
                      </div>
                    </LiquidGlassCard>
                  </ChatInfoCard>

                  <ChatInfoCard title="Acoes rapidas" meta="Operacao">
                    <ChatActionGrid className={styles.quickActionsGrid}>
                      <ConversationActionList
                        actions={buildAtendimentoContextActions({
                          conversation: selectedConversation,
                          selectedStatus,
                          selectedBlocked,
                          allowRecoveryCapability: hasRecoveryCapability,
                          openFinance: () => handleSectionChange("financeiro"),
                          openAutomation: () => handleSectionChange("automacao"),
                          openAgenda: () => {
                            setContextTab("agenda");
                            setAgendaStudioOpen(true);
                          },
                          updateStatus,
                          closeConversation: () => {
                            if (selectedId) void deleteConversationById(selectedId);
                          },
                          blockConversation,
                          unblockConversation,
                        })}
                      />
                    </ChatActionGrid>
                  </ChatInfoCard>
                </div>
              ) : null}

              {contextTab === "financeiro" ? (
                selectedConversationHasRecoveryContext ? (
                  <div className={styles.contextGrid}>
                    <ChatInfoCard title="Resumo financeiro" meta={selectedConversation.recoveryStatus || "cobranca"}>
                      {buildAtendimentoRecoverySummary({
                        conversation: selectedConversation,
                        formatCurrency,
                      }).map((item) => (
                        <p key={item.label}>
                          <strong>{item.label}:</strong> {item.value}
                        </p>
                      ))}
                    </ChatInfoCard>

                    <ChatInfoCard title="Inadimplencia" meta={selectedConversation.recoveryCurrentStep || "ativa"}>
                      <p>
                        <strong>Valor pendente:</strong> {formatCurrency(Number(selectedConversation.recoveryOpenAmount || 0))}
                      </p>
                      <p>
                        <strong>Status:</strong> {selectedConversation.recoveryStatus || "-"}
                      </p>
                      <p>
                        <strong>Fluxo atual:</strong> {selectedConversation.currentFlow || "-"}
                      </p>
                      <p>
                        <strong>Origem:</strong> {selectedConversation.latestSourceModule || "-"}
                      </p>
                      <div className={styles.contextButtonRow}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void updateStatus("open")}
                          disabled={selectedBlocked}
                        >
                          Atendimento humano
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setContextTab("agenda");
                            setAgendaStudioOpen(true);
                          }}
                        >
                          Abrir agenda
                        </button>
                      </div>
                    </ChatInfoCard>

                    <ChatInfoCard title="Historico de pagamentos" meta={selectedConversation.recoveryTotalPaid > 0 ? formatCurrency(selectedConversation.recoveryTotalPaid) : "sem baixa"}>
                      <p>
                        <strong>Total recuperado:</strong> {formatCurrency(Number(selectedConversation.recoveryTotalPaid || 0))}
                      </p>
                      <p>
                        <strong>Eventos recentes:</strong> {buildAtendimentoRecoveryPaymentHistory(selectedConversation).length}
                      </p>
                      <p>
                        <strong>Ultima atualizacao:</strong> {formatDateLabel(selectedConversation.updatedAt, mounted)}
                      </p>
                    </ChatInfoCard>

                    <ChatInfoCard title="Pagamentos recentes" meta={buildAtendimentoRecoveryPaymentHistory(selectedConversation).length}>
                      {buildAtendimentoRecoveryPaymentHistory(selectedConversation).length > 0 ? (
                        <div className={styles.recoveryPaymentHistory}>
                          {buildAtendimentoRecoveryPaymentHistory(selectedConversation).map((payment) => (
                            <article key={payment.id} className={styles.recoveryPaymentRow}>
                              <div>
                                <strong>{formatCurrency(payment.amount)}</strong>
                                <p>
                                  {formatAtendimentoRecoveryPaymentStatusLabel(payment.status)}
                                  {payment.chargeType
                                    ? ` • ${payment.chargeType === "parcelado" ? "Parcelado" : "A vista"}`
                                    : ""}
                                </p>
                                <p>{formatDateLabel(getAtendimentoRecoveryPaymentDate(payment), mounted)}</p>
                              </div>
                              {payment.paymentUrl ? (
                                <span className={styles.recoveryPaymentLinkText}>Link disponivel no financeiro</span>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <ChatFieldNote>Nenhum pagamento recente vinculado a esta cobranca.</ChatFieldNote>
                      )}
                    </ChatInfoCard>
                  </div>
                ) : (
                  <ChatEmptyState title="Sem contexto financeiro">Esta conversa ainda nao tem sinais financeiros relevantes. O foco continua na conversa central.</ChatEmptyState>
                )
              ) : null}

              {contextTab === "agenda" ? (
                <div className={styles.contextGrid}>
                  <ChatInfoCard title="Agenda" meta={`${agendaConfig.groups.length} guias`}>
                    <p>
                      <strong>Contexto:</strong>{" "}
                      {selectedConversationIsAgenda
                        ? "Cliente em jornada de agendamento ou follow-up agendado."
                        : "Nenhum sinal forte de agenda nesta conversa agora."}
                    </p>
                    <p>
                      <strong>Guias ativas:</strong> {agendaConfig.groups.filter((group) => group.isActive).length}
                    </p>
                    <p>
                      <strong>Conexoes prontas:</strong>{" "}
                      {
                        agendaConfig.groups.filter((group) => group.connectionStatus === "connected")
                          .length
                      }
                    </p>
                  </ChatInfoCard>

                  <ChatInfoCard title="Operacao de agenda" meta="Acesso rapido" muted>
                    <div className={styles.contextButtonRow}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setAgendaStudioOpen(true);
                        }}
                      >
                        Abrir agenda
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSectionChange("automacao")}
                      >
                        Ver automacao
                      </button>
                    </div>
                    <ChatFieldNote>
                      A agenda continua separada como configuracao, mas aparece aqui como contexto da mesma inbox.
                    </ChatFieldNote>
                  </ChatInfoCard>
                </div>
              ) : null}

            </div>
          )}
        </ConversationContextPanel>
      ),
    }),
    [
      agendaConfig.groups,
      blockConversation,
      conversationDetailError,
      conversationListError,
      conversationSearch,
      contextTab,
      customerCardAttempts,
      customerCardCanOpenWhatsapp,
      customerCardHistory,
      customerCardLastContactAt,
      customerCardName,
      customerCardPhone,
      customerCardPhoneDigits,
      customerCardReturnAt,
      customerCardShortcutOpen,
      customerCardTimesSeen,
      customerConversationCard,
      customerConversationCardDraft,
      customerConversationCardError,
      hasRecoveryCapability,
      filteredConversations,
      handleSectionChange,
      handleComposerPaste,
      handleCustomerReturnChange,
      inboxDetailDiagnostics,
      inboxQueue,
      inboxQueueDiagnostics,
      isConversationStageSwitching,
      isRecording,
      deleteConversationById,
      deleteSentMessage,
      draggedQueueId,
      failedInboxMediaUrls,
      loadConversation,
      loadOlderMessages,
      loadingConversation,
      loadingCustomerConversationCard,
      loadingList,
      loadingOlderMessages,
      markCustomerDoNotCall,
      markInboxMediaUrlFailed,
      mounted,
      openCustomerReturnPicker,
      openedAsset,
      olderMessagesHasMore,
      queueActionConversationId,
      queueCounts,
      queueUnreadCounts,
      reactToMessage,
      recordingSeconds,
      retryConversationDetail,
      retryConversationList,
      revealedDeletedMessageIds,
      selectedConversationInteractionBlocked,
      selectedBlocked,
      selectedConversation,
      conversationForView,
      conversationMessagesForView,
      conversationReactionIndex,
      selectedConversationDisplayName,
      selectedConversationHasRecoveryContext,
      selectedConversationIsAgenda,
      selectedConversationStatusMeta,
      selectedConversationWithoutWhatsapp,
      selectedVendasAgendaDraftMessage,
      selectedId,
      selectedStatus,
      saveCustomerConversationCard,
      savingCustomerConversationCard,
      scheduleCustomerReturnTomorrow,
      dropOverQueue,
      handleQueueDrop,
      sendMessage,
      sendText,
      sending,
      emojiPickerOpen,
      setEmojiPickerOpen,
      setOpenedAsset,
      replyingTo,
      setReplyingTo,
      audioPreview,
      imagePreview,
      sendAudioPreview,
      setImagePreview,
      messageReactionTargetId,
      startRecording,
      stopRecording,
      toggleQueueConversationMenu,
      unblockConversation,
      updateStatus,
    ],
  );

  const addAgendaGroup = useCallback(() => {
    setAgendaDirty(true);
    setAgendaConfig((current) => ({
      ...current,
      groups: [
        ...current.groups,
        {
          id: makeClientId("agenda_group"),
          slug: `nova_guia_${current.groups.length + 1}`,
          title: `Nova guia ${current.groups.length + 1}`,
          description: "Explique rapidamente quando esse time deve ser usado.",
          buttonLabel: "Nova guia",
          actionType: "abrir_agenda",
          linkedAgendaId: "",
          customActionKey: null,
          sortOrder: current.groups.length,
          introMessage:
            "Esses sao os horarios disponiveis para {{agenda_nome}}.\n\n{{agenda_slots}}",
          emptyMessage: "No momento nao ha horarios ativos para essa agenda.",
          noImmediateAvailabilityMessage:
            "Nao encontrei disponibilidade imediata para esta guia. Vou priorizar os proximos horarios futuros.",
          linkedEmail: String(currentUserProfile?.email || "").trim().toLowerCase(),
          linkedUserName: String(currentUserProfile?.name || "").trim(),
          connectionStatus: currentUserProfile?.email ? "pending" : "not_linked",
          accentColor: ["#4da36f", "#5d83ff", "#e57b47", "#9b59b6"][current.groups.length % 4],
          isActive: true,
          workdays: [1, 2, 3, 4, 5],
          visibleBusinessDays: 7,
          searchWindowDays: 7,
          suggestedSlotsCount: 3,
          fallbackFutureSlotsCount: 3,
          slots: [],
        },
      ],
    }));
  }, [currentUserProfile?.email, currentUserProfile?.name]);

  const removeAgendaGroup = useCallback((groupId: string) => {
    setAgendaDirty(true);
    const actionId = buildAgendaActionId(groupId);
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }));
    setBotConfig((current) => {
      const next = removeButtonFromSections(current, actionId);
      return {
        ...next,
        actionCatalog: next.actionCatalog.map((action) =>
          action.agendaGroupId === groupId ? { ...action, agendaGroupId: null } : action,
        ),
      };
    });
  }, []);

  const resetBotAgendaToDefault = useCallback(() => {
    setAgendaDirty(true);
    setBotConfigDirtyFromAgendaReset(true);
    setAgendaConfig(normalizeAgendaConfig(DEFAULT_ATENDIMENTO_AGENDA_CONFIG));
    setBotConfig((current) => ({
      ...current,
      actionCatalog: current.actionCatalog.map((action) =>
        action.actionId === "schedule_service" ? { ...action, agendaGroupId: "agenda_tecnicos" } : action,
      ),
    }));
  }, []);

  const updateAgendaGroup = useCallback(
    (
      groupId: string,
      field: AgendaGroupEditableField,
      value: string | boolean | number | number[],
    ) => {
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, [field]: value } : group,
        ),
      }));
    },
    [],
  );

  const moveAgendaGroup = useCallback((groupId: string, direction: -1 | 1) => {
    setAgendaDirty(true);
    setAgendaConfig((current) => {
      const index = current.groups.findIndex((group) => group.id === groupId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.groups.length) return current;
      const groups = [...current.groups];
      const [group] = groups.splice(index, 1);
      groups.splice(nextIndex, 0, group);
      return {
        ...current,
        groups: groups.map((item, itemIndex) => ({
          ...item,
          sortOrder: itemIndex,
        })),
      };
    });
  }, []);

  const linkAgendaToCurrentUser = useCallback(
    (groupId: string) => {
      const email = String(currentUserProfile?.email || "").trim().toLowerCase();
      if (!email) return;
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                linkedEmail: email,
                linkedUserName: String(currentUserProfile?.name || "").trim(),
                connectionStatus: "connected",
              }
            : group,
        ),
      }));
    },
    [currentUserProfile?.email, currentUserProfile?.name],
  );

  const addAgendaSlot = useCallback((groupId: string) => {
    setAgendaDirty(true);
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              slots: [
                ...group.slots,
                {
                  id: makeClientId(`${groupId}_slot`),
                  label: "Novo horario",
                  dayOfWeek: 1,
                  startTime: "09:00",
                  endTime: "10:00",
                  enabled: true,
                },
              ],
            }
          : group,
      ),
    }));
  }, []);

  const removeAgendaSlot = useCallback((groupId: string, slotId: string) => {
    setAgendaDirty(true);
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? { ...group, slots: group.slots.filter((slot) => slot.id !== slotId) }
          : group,
      ),
    }));
  }, []);

  const updateAgendaSlot = useCallback(
    (
      groupId: string,
      slotId: string,
      field: "label" | "dayOfWeek" | "startTime" | "endTime" | "enabled",
      value: string | number | boolean,
    ) => {
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                slots: group.slots.map((slot) =>
                  slot.id === slotId ? { ...slot, [field]: value } : slot,
                ),
              }
            : group,
        ),
      }));
    },
    [],
  );

  const updateAgendaHolidays = useCallback((holidays: string[]) => {
    setAgendaConfig((current) => ({
      ...current,
      holidays: holidays.sort(),
    }));
  }, []);

  const updateAgendaInitialMessage = useCallback(
    (
      field: keyof AtendimentoAgendaConfig["initialMessage"],
      value: string,
    ) => {
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        initialMessage: {
          ...current.initialMessage,
          [field]: value,
        },
      }));
    },
    [],
  );

  const updateAgendaFlowMessage = useCallback(
    (
      field: keyof AtendimentoAgendaConfig["flowMessages"],
      value: string,
    ) => {
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        flowMessages: {
          ...current.flowMessages,
          [field]: value,
        },
      }));
    },
    [],
  );

  const loadAgendaHolidaysFromAPI = useCallback(async () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    try {
      const holidays = await fetchBrazilianHolidays(currentYear);
      if (holidays.length === 0) {
        setError("Nenhum feriado encontrado para o ano atual.");
        return;
      }
      setAgendaDirty(true);
      setAgendaConfig((current) => ({
        ...current,
        holidays: Array.from(new Set([...current.holidays, ...holidays])).sort(),
      }));
      setNotice({ tone: "success", text: `${holidays.length} feriados carregados com sucesso.` });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar feriados.";
      setError(message);
    }
  }, []);

  const saveAgenda = useCallback(async () => {
    setSavingAgenda(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoAgendaConfig>("/inbox/agenda", {
        method: "PATCH",
        body: JSON.stringify(agendaConfig),
      });
      if (botConfigDirtyFromAgendaReset) {
        const botPayload = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
          method: "PATCH",
          body: JSON.stringify(botConfig),
        });
        setBotConfig(normalizeBotConfig(botPayload));
        setBotConfigDirtyFromAgendaReset(false);
      }
      setAgendaConfig(normalizeAgendaConfig(payload));
      setAgendaDirty(false);
      setNotice({ tone: "success", text: "Agenda salva com sucesso." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar agenda.";
      setError(message);
    } finally {
      setSavingAgenda(false);
    }
  }, [agendaConfig, botConfig, botConfigDirtyFromAgendaReset]);

  const simulateAgendaFlow = useCallback(
    async (payload: AtendimentoAgendaSimulationPayload) => {
      return apiFetch<AtendimentoAgendaSimulationResult>("/inbox/agenda/simulate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    [],
  );

  const syncBotConfig = useCallback((nextConfig: AtendimentoBotConfig) => {
    setBotConfig(nextConfig);
  }, []);

  const saveBot = useCallback(async (nextConfig: AtendimentoBotConfig = botConfig) => {
    setSavingBot(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
      });
      const normalized = normalizeBotConfig(payload);
      writeStoredGlobalBotEnabled(normalized.routingRules.globalBotEnabled !== false);
      setBotConfig(normalized);
      setNotice({ tone: "success", text: "Editor do bot salvo com sucesso." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar editor.";
      setError(message);
    } finally {
      setSavingBot(false);
    }
  }, [botConfig]);

  function scheduleAlertCollapse(
    key: InboxAlertKind | "system_notice",
    timerRef: { current: number | null },
  ) {
    if (typeof window === "undefined") return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setExpandedAlerts((current) => ({ ...current, [key]: false }));
    }, 5000);
  }

  useEffect(() => {
    if (!selectedConversation || !chatTimelineRef.current) return;
    if (typeof window === "undefined") return;
    const timeline = chatTimelineRef.current;
    const scrollToBottom = () => {
      timeline.scrollTop = timeline.scrollHeight;
    };
    const frame = window.requestAnimationFrame(scrollToBottom);
    const shortTimer = window.setTimeout(scrollToBottom, 80);
    const mediaTimer = window.setTimeout(scrollToBottom, 300);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(shortTimer);
      window.clearTimeout(mediaTimer);
    };
  }, [latestVisibleMessageKey, selectedConversation?.id, selectedConversation?.messages.length]);

  // Clear composer state when switching conversations
  useEffect(() => {
    setReplyingTo(null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setOpenedAsset(null);
    setSendText("");
    sendTextDirtyRef.current = false;
    setQueueActionConversationId(null);
    setMessageReactionTargetId(null);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || selectedBlocked || !selectedVendasAgendaDraftMessage) return;
    setSendText((current) => {
      const normalizedCurrent = String(current || "").trim();
      if (sendTextDirtyRef.current && normalizedCurrent) return current;
      if (normalizedCurrent && normalizedCurrent !== selectedVendasAgendaDraftMessage) return current;
      sendTextDirtyRef.current = false;
      return selectedVendasAgendaDraftMessage;
    });
  }, [selectedBlocked, selectedId, selectedVendasAgendaDraftMessage]);

  useEffect(() => {
    if (humanAlertTimerRef.current !== null) {
      window.clearTimeout(humanAlertTimerRef.current);
      humanAlertTimerRef.current = null;
    }
    if (humanAttentionConversations.length === 0) {
      setExpandedAlerts((current) => ({ ...current, human_queue: false }));
      setDismissedAlerts((current) => ({ ...current, human_queue: false }));
      previousHumanCountRef.current = 0;
      return;
    }
    if (humanAttentionConversations.length > previousHumanCountRef.current) {
      setDismissedAlerts((current) => ({ ...current, human_queue: false }));
      setExpandedAlerts((current) => ({ ...current, human_queue: true }));
      scheduleAlertCollapse("human_queue", humanAlertTimerRef);
    }
    previousHumanCountRef.current = humanAttentionConversations.length;
  }, [humanAttentionConversations.length]);

  useEffect(() => {
    if (newAlertTimerRef.current !== null) {
      window.clearTimeout(newAlertTimerRef.current);
      newAlertTimerRef.current = null;
    }
    if (newInboundConversations.length === 0) {
      setExpandedAlerts((current) => ({ ...current, new_message: false }));
      setDismissedAlerts((current) => ({ ...current, new_message: false }));
      previousNewCountRef.current = 0;
      return;
    }
    if (newInboundConversations.length > previousNewCountRef.current) {
      setDismissedAlerts((current) => ({ ...current, new_message: false }));
      setExpandedAlerts((current) => ({ ...current, new_message: true }));
      scheduleAlertCollapse("new_message", newAlertTimerRef);
    }
    previousNewCountRef.current = newInboundConversations.length;
  }, [newInboundConversations.length]);

  useEffect(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    if (!notice) {
      setExpandedAlerts((current) => ({ ...current, system_notice: false }));
      return;
    }
    setExpandedAlerts((current) => ({ ...current, system_notice: true }));
    if (typeof window === "undefined") return;
    noticeTimerRef.current = window.setTimeout(() => {
      setExpandedAlerts((current) => ({ ...current, system_notice: false }));
      setNotice(null);
      noticeTimerRef.current = null;
    }, 5000);
  }, [notice]);

  useEffect(
    () => () => {
      [humanAlertTimerRef, newAlertTimerRef, noticeTimerRef].forEach((timerRef) => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
      });
    },
    [],
  );

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <>
      <DashboardScaffold
        title="Atendimento"
        description="Inbox unificada com conversa dominante, contexto financeiro real e atalhos operacionais enxutos."
        hideHeader={true}
        hideNavigationRail={true}
        layoutMode="workspace"
      >
        {error ? <div className="alert alert-error">{error}</div> : null}
        {notice ? (
          <div
            className={`alert ${
              notice.tone === "error"
                ? "alert-error"
                : notice.tone === "success"
                  ? "alert-success"
                  : "alert-info"
            }`}
            role="status"
            aria-live="polite"
          >
            {notice.text}
          </div>
        ) : null}

        {activeTab === "messages" ? (
          <section className={styles.premiumInboxShell} data-ui-no-reveal="true">
            <section className={styles.inboxCanvas}>
              <aside className={styles.commandDock}>
                <div className={styles.commandDockTop}>
                  <button
                    type="button"
                    className={styles.commandDockBrand}
                    data-active={globalBotEnabled ? "true" : "false"}
                    onClick={() => void toggleGlobalBot()}
                    aria-label={globalBotEnabled ? "Desativar BOT global" : "Ativar BOT global"}
                    title={globalBotEnabled ? "BOT global ativo" : "BOT global desativado"}
                  >
                    <span>Hbot</span>
                  </button>
                </div>
                <div className={styles.commandDockNav}>
                  <DockButton
                    icon="note"
                    label="Conversas"
                    active={activeDockSection === "conversa"}
                    badge={newInboundConversations.length || null}
                    onClick={() => handleSectionChange("conversa")}
                  />
                  <DockButton
                    icon="wallet"
                    label="Financeiro"
                    active={activeDockSection === "financeiro"}
                    badge={queueCounts.recovery || null}
                    onClick={() => handleSectionChange("financeiro")}
                  />
                  <DockButton
                    icon="clock"
                    label="Agenda"
                    active={activeDockSection === "agenda"}
                    badge={selectedConversationIsAgenda ? "!" : null}
                    onClick={() => handleSectionChange("agenda")}
                  />
                  <DockButton
                    icon="gear"
                    label="Automacao"
                    active={activeDockSection === "automacao"}
                    badge={queueCounts.bot || null}
                    onClick={() => handleSectionChange("automacao")}
                  />
                  <DockButton
                    icon="spark"
                    label="Templates"
                    active={activeDockSection === "templates"}
                    badge={metaTemplates.counters.approved || null}
                    onClick={openTemplatesSettings}
                  />
                </div>
                <div className={styles.commandDockBottom}>
                  <DockButton
                    icon="user"
                    label="Operador"
                    active={false}
                    badge={null}
                    onClick={() => handleSectionChange("conversa")}
                  />
                </div>
              </aside>

              <div className={styles.inboxStageList}>
                {inboxWorkspaceComponents.list()}
              </div>
              <div className={styles.inboxStageMain}>
                {inboxWorkspaceComponents.main()}
              </div>
              <div className={styles.inboxStageContext}>
                {inboxWorkspaceComponents.context()}
              </div>
            </section>
          </section>
        ) : null}

      </DashboardScaffold>

      {agendaStudioOpen ? (
        renderAgendaPanel()
      ) : null}

      {typeof document !== "undefined" &&
      queueActionConversationId &&
      queueActionMenuPosition
        ? createPortal(
            <div
              ref={queueActionMenuRef}
              className={`${styles.conversationQueueMetaPopup} ${styles.conversationQueueMetaPopupPortal}`}
              style={{
                top: `${queueActionMenuPosition.top}px`,
                left: `${queueActionMenuPosition.left}px`,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={styles.conversationQueueMetaPopupAction}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void blockConversationById(queueActionConversationId);
                }}
              >
                Bloquear
              </button>
              <button
                type="button"
                className={`${styles.conversationQueueMetaPopupAction} ${styles.conversationQueueMetaPopupActionDanger}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void deleteConversationById(queueActionConversationId);
                }}
              >
                Excluir
              </button>
            </div>,
            document.body,
          )
        : null}

      {automationStudioOpen ? (
        <div className={`${styles.botStudioOverlay} ${overlayVisible ? styles.botStudioOverlayActive : ""}`}>
          <div className={`${styles.botStudioFrame} ${overlayVisible ? styles.botStudioFrameActive : ""}`}>
            <div className={styles.botStudioChrome}>
              <div>
                <p className={styles.botStudioChromeEyebrow}>Atendimento</p>
                <strong>Automacao</strong>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.metaBadge}>Fluxo principal</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={openTemplatesSettings}>
                  Configuracoes
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={closeAutomationExperience}>
                  Fechar
                </button>
              </div>
            </div>
            <div className={styles.botStudioBody}>
              <BotPanel
                botConfig={botConfig}
                loadingBot={loadingBot}
                savingBot={savingBot}
                actionOptions={actionOptions}
                agendaOptions={agendaOptions}
                onSave={(nextConfig) => {
                  setNotice(null);
                  void saveBot(nextConfig);
                }}
                onConfigChange={syncBotConfig}
                onOpenSettings={openTemplatesSettings}
              />
            </div>
          </div>
        </div>
      ) : null}

      {templatesStudioOpen ? (
        <div className={`${styles.botStudioOverlay} ${overlayVisible ? styles.botStudioOverlayActive : ""}`}>
          <div className={`${styles.botStudioFrame} ${overlayVisible ? styles.botStudioFrameActive : ""}`}>
            <div className={styles.botStudioChrome}>
              <div>
                <p className={styles.botStudioChromeEyebrow}>Automacao</p>
                <strong>Templates Meta</strong>
              </div>
              <div className={styles.headerActions}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadMetaTemplates(true)}>
                  Recarregar
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={syncMetaTemplatesNow} disabled={syncingTemplates}>
                  {syncingTemplates ? "Sincronizando..." : "Sincronizar"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setTemplatesStudioOpen(false);
                    setAutomationStudioOpen(true);
                  }}
                >
                  Fechar configuracoes
                </button>
              </div>
            </div>
            <div className={styles.botStudioBody}>
              <TemplatesPanel
                loadingTemplates={loadingTemplates}
                syncingTemplates={syncingTemplates}
                metaTemplates={metaTemplates}
                templateComposer={templateComposer}
                creatingTemplate={creatingTemplate}
                deletingTemplateId={deletingTemplateId}
                editingTemplateLabel={editingTemplateLabel}
                onReload={() => void loadMetaTemplates(true)}
                onSync={() => void syncMetaTemplatesNow()}
                onToggleActivation={(template, active) => void toggleTemplateActivation(template, active)}
                onComposerChange={(updater) => setTemplateComposer((current) => updater(current))}
                onCreateTemplate={() => void createMetaTemplate()}
                onDeleteTemplate={(template) => void deleteMetaTemplate(template)}
                onEditTemplate={editMetaTemplate}
                onResetComposer={resetTemplateComposer}
              />
            </div>
          </div>
        </div>
      ) : null}

      <HbxConfirmDialog
        open={blockDialog !== null}
        title="Bloquear contato"
        description="O contato ficará bloqueado no Atendimento até ser liberado novamente."
        confirmLabel="Bloquear"
        destructive
        onCancel={() => setBlockDialog(null)}
        onConfirm={() => void confirmBlockConversation()}
      >
        <label className="text-xs uppercase tracking-[0.08em] font-semibold text-muted">
          Motivo do bloqueio
        </label>
        <textarea
          className="field min-h-24"
          value={blockDialog?.reason || ""}
          onChange={(event) =>
            setBlockDialog((current) => current ? { ...current, reason: event.target.value } : current)
          }
        />
      </HbxConfirmDialog>

      <PremiumLaunchDialog
        notice={inboxBootstrapLaunchNotice.notice}
        onOpen={closeInboxBootstrapLaunchDialog}
        progressLabel={inboxBootstrapProgressLabel}
        progressValueLabel={inboxBootstrapProgressValueLabel}
        detailRows={inboxBootstrapDetailRows}
        celebrate={inboxBootstrapCelebrate}
      />

      <HbxConfirmDialog
        open={deleteConversationDialog !== null}
        title="Enviar conversa para Excluídos"
        description="A conversa será removida apenas no HBX. Nenhum comando será enviado ao WhatsApp."
        confirmLabel="Enviar para Excluídos"
        destructive
        onCancel={() => setDeleteConversationDialog(null)}
        onConfirm={() => void confirmDeleteConversation()}
      />

      <HbxConfirmDialog
        open={deleteMessageDialog !== null}
        title="Apagar mensagem"
        description="A mensagem será apagada para todos quando o provedor aceitar a operação."
        confirmLabel="Apagar para todos"
        destructive
        onCancel={() => setDeleteMessageDialog(null)}
        onConfirm={() => void confirmDeleteSentMessage()}
      />
    </>
  );
}
