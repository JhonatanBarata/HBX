"use client";

import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useCallback, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import LiquidGlassCard, { liquidGlassCardStyles as glassCardStyles } from "@/components/LiquidGlassCard";
import PremiumLaunchDialog from "@/components/PremiumLaunchDialog";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
import { apiFetch } from "@/app/_lib/api";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { HBX_WINDOW_STANDARD } from "@/lib/hbx-window-system";
import styles from "./page.module.css";

type LeadStatus = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
type LeadBlockKey = "today" | "overdue" | "scheduled" | "closed";
type DateFilterKey = "overdue" | "today" | `scheduled:${string}`;
type WhatsappFilter = "all" | "with" | "without";
type InboxFilter = "all" | "in" | "out";
type LeadTimelineEventType =
  | "lead_created"
  | "origin_registered"
  | "contact_made"
  | "result_recorded"
  | "return_scheduled"
  | "status_changed"
  | "lead_closed"
  | "lead_reused"
  | "generic";

type LeadTimelineEvent = {
  id: string;
  eventType: LeadTimelineEventType;
  title: string;
  description?: string | null;
  sourceType?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  resultLabel?: string | null;
  returnAt?: string | null;
  createdAt?: string | null;
};

type SharedProfileSummary = {
  displayName?: string | null;
  phone?: string | null;
  origin?: string | null;
  lastContactAt?: string | null;
  currentContext?: "vendas" | "atendimento" | "recovery" | "neutro" | string | null;
  presence?: {
    vendas?: { present?: boolean; status?: string | null };
    atendimento?: { present?: boolean; customerId?: string | null; conversationId?: string | number | null; lastContactAt?: string | null };
    recovery?: { present?: boolean; status?: string | null; openAmount?: number | null };
  };
};

type LeadItem = {
  id: string;
  sourceType: "manual" | "webscraping";
  primarySource?: string | null;
  sourceHistoryId?: string | null;
  timesSeen?: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews?: number | null;
  city?: string | null;
  segment?: string | null;
  status: LeadStatus;
  statusLabel: string;
  nextAction?: string | null;
  returnAt?: string | null;
  shortNote?: string | null;
  lastContactAt?: string | null;
  attemptCount?: number;
  lastResult?: string | null;
  wasClosedBefore?: boolean;
  updatedAt?: string | null;
  createdAt?: string | null;
  signals?: {
    alreadyExisted: boolean;
    cameFromWebscraping: boolean;
    hadPreviousContact: boolean;
    wasClosedBefore: boolean;
  };
  whatsappAvailability?: {
    status?: "unknown" | "available" | "unavailable";
    checkedAt?: string | null;
    message?: string | null;
  } | null;
  isInInbox?: boolean;
  inboxConversationId?: string | number | null;
  atendimentoConversationId?: string | number | null;
  sharedProfile?: SharedProfileSummary | null;
  timeline?: LeadTimelineEvent[];
  quickActions: string[];
};

type BoardResponse = {
  summary: { total: number; today: number; overdue: number; scheduled: number; closed: number };
  blocks: Record<LeadBlockKey, LeadItem[]>;
};

type TodayAgendaSyncResponse = {
  ok?: boolean;
  todayLeadCount?: number;
  mirroredLeadCount?: number;
  conversationIds?: Array<string | number>;
  leadConversationIds?: Record<string, string | number>;
  activated?: number;
  updated?: number;
  deactivated?: number;
  skippedWithoutPhone?: number;
  skippedWithoutWhatsapp?: number;
  message?: string | null;
};

type LeadDraft = {
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  nextAction: string;
  returnAt: string;
  shortNote: string;
};

type DateFilterItem = {
  key: DateFilterKey;
  blockKey: Exclude<LeadBlockKey, "closed">;
  count: number;
  title: string;
  subtitle: string;
  dayLabel: string;
  isoDate?: string | null;
};

type LeadCardView = {
  lead: LeadItem;
  draft: LeadDraft;
  blockKey: LeadBlockKey;
  selected: boolean;
  saving: boolean;
  onFocus: () => void;
  onQuickAction: (action: string) => void;
  onInboxAction: (lead: LeadItem) => void;
  onEdit?: (id: string | null) => void;
  onDraftChange?: (leadId: string, patch: Partial<LeadDraft>) => void;
  onSave?: (leadId: string) => void;
  editing?: boolean;
};

type FlyAnimation = {
  leadId: string;
  lead: LeadItem;
  draft: LeadDraft;
  blockKey: LeadBlockKey;
  from: { x: number; y: number; width: number; height: number };
  to: { x: number; y: number; width: number; height: number };
};

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "novo", label: "Novo lead" },
  { value: "contato", label: "Em contato" },
  { value: "retorno", label: "Retorno" },
  { value: "qualificado", label: "Qualificado" },
  { value: "encerrado", label: "Encerrado" },
];

const BLOCK_LABELS: Record<LeadBlockKey, string> = {
  overdue: "Atrasados",
  today: "Hoje",
  scheduled: "Programados",
  closed: "Encerrados",
};

const WHATSAPP_FILTER_LABELS: Record<WhatsappFilter, string> = {
  all: "Whatsapp",
  with: "Com WhatsApp",
  without: "Sem WhatsApp",
};

const INBOX_FILTER_LABELS: Record<InboxFilter, string> = {
  all: "Inbox: Todos",
  in: "Inbox: No Inbox",
  out: "Inbox: Fora do Inbox",
};

function formatDateTime(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "-";
}

function formatShortDate(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "-";
}

function toDatetimeLocal(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function plusDaysDatetimeLocal(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  now.setHours(days > 0 ? 9 : now.getHours(), days > 0 ? 0 : now.getMinutes(), 0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function normalizePhoneDigits(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function buildCallUrl(phone?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  return digits ? `tel:+55${digits}` : "";
}

function buildWhatsAppUrl(phone?: string | null, leadName?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  if (!digits) return "";
  const message = leadName
    ? `Olá, ${leadName}. Estou retomando nosso contato pelo HBX Vendas.`
    : "Olá. Estou retomando nosso contato pelo HBX Vendas.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

function getLeadWhatsappStatus(lead: LeadItem) {
  return lead.whatsappAvailability?.status || "unknown";
}

function matchesWhatsappFilter(lead: LeadItem, filter: WhatsappFilter) {
  const status = getLeadWhatsappStatus(lead);
  if (filter === "with") return status === "available";
  if (filter === "without") return status === "unavailable";
  return true;
}

function isLeadInInbox(lead: LeadItem) {
  return Boolean(
    lead.isInInbox ||
      lead.inboxConversationId ||
      lead.atendimentoConversationId ||
      lead.sharedProfile?.presence?.atendimento?.present,
  );
}

function getLeadInboxConversationId(lead: LeadItem) {
  return String(
    lead.inboxConversationId ||
      lead.atendimentoConversationId ||
      lead.sharedProfile?.presence?.atendimento?.conversationId ||
      "",
  ).trim();
}

function matchesInboxFilter(lead: LeadItem, filter: InboxFilter) {
  if (filter === "in") return isLeadInInbox(lead);
  if (filter === "out") return !isLeadInInbox(lead);
  return true;
}

function nextInboxFilter(current: InboxFilter): InboxFilter {
  if (current === "all") return "in";
  if (current === "in") return "out";
  return "all";
}

function nextWhatsappFilter(current: WhatsappFilter): WhatsappFilter {
  if (current === "all") return "with";
  if (current === "with") return "without";
  return "all";
}

function sourceLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "webscraping") return "Webscraping";
  if (normalized === "manual") return "Manual";
  return normalized || "Sem origem";
}

function contextLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "vendas") return "Vendas";
  if (normalized === "atendimento") return "Atendimento";
  if (normalized === "recovery") return "Recovery";
  return "Neutro";
}

function statusLabel(status: LeadStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function createDraft(lead: LeadItem): LeadDraft {
  return {
    name: String(lead.name || ""),
    phone: String(lead.phone || ""),
    email: String(lead.email || ""),
    status: lead.status,
    nextAction: String(lead.nextAction || ""),
    returnAt: toDatetimeLocal(lead.returnAt),
    shortNote: String(lead.shortNote || ""),
  };
}

function buildLeadWebscrapingSummary(lead: LeadItem) {
  const parts: string[] = [];
  if (lead.rating != null) parts.push(`Nota ${Number(lead.rating).toFixed(1)}`);
  if (Number(lead.reviews || 0) > 0) parts.push(`${Number(lead.reviews)} avaliações`);
  return parts.join(" • ");
}

function hydrateDrafts(board: BoardResponse | null) {
  const next: Record<string, LeadDraft> = {};
  if (!board) return next;
  (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach((blockKey) => {
    (board.blocks[blockKey] || []).forEach((lead) => {
      next[lead.id] = createDraft(lead);
    });
  });
  return next;
}

function buildLocalDateKey(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, "0")}-${`${parsed.getDate()}`.padStart(2, "0")}`;
}

function railTitle(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Programado"
    : parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function railDay(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "Data" : parsed.toLocaleDateString("pt-BR", { weekday: "short" });
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function returnMeta(lead: LeadItem, draft: LeadDraft, block: LeadBlockKey) {
  const effective = draft.returnAt ? new Date(draft.returnAt).toISOString() : lead.returnAt || null;
  if (!effective) return { label: "Sem retorno definido", tone: "neutral" } as const;
  if (block === "overdue") return { label: `Atrasado desde ${formatDateTime(effective)}`, tone: "overdue" } as const;
  if (block === "today") return { label: `Hoje • ${formatDateTime(effective)}`, tone: "today" } as const;
  if (block === "scheduled") return { label: `Agendado • ${formatDateTime(effective)}`, tone: "scheduled" } as const;
  return { label: `Arquivo • ${formatShortDate(effective)}`, tone: "closed" } as const;
}

function timelineTone(type?: LeadTimelineEventType) {
  if (type === "lead_closed") return "closed";
  if (type === "return_scheduled") return "scheduled";
  if (type === "contact_made" || type === "result_recorded") return "contact";
  if (type === "origin_registered") return "origin";
  if (type === "lead_reused") return "existing";
  return "neutral";
}

function timelineMeta(event: LeadTimelineEvent) {
  if (event.eventType === "origin_registered") return event.sourceType === "webscraping" ? "Origem webscraping" : "Origem manual";
  if (event.eventType === "status_changed" && event.statusTo) return `Status ${event.statusTo}`;
  if (event.eventType === "result_recorded" && event.resultLabel) return event.resultLabel;
  if (event.eventType === "return_scheduled" && event.returnAt) return formatDateTime(event.returnAt);
  return event.createdAt ? formatDateTime(event.createdAt) : "Agora";
}

function recomputeSummary(blocks: BoardResponse["blocks"]) {
  return {
    total: blocks.overdue.length + blocks.today.length + blocks.scheduled.length + blocks.closed.length,
    today: blocks.today.length,
    overdue: blocks.overdue.length,
    scheduled: blocks.scheduled.length,
    closed: blocks.closed.length,
  };
}

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeBoardForLocalAgenda(input: BoardResponse) {
  const todayKey = localDateKeyFromDate(new Date());
  const blocks: BoardResponse["blocks"] = {
    overdue: [],
    today: [],
    scheduled: [],
    closed: [],
  };

  const allLeads = [
    ...input.blocks.overdue,
    ...input.blocks.today,
    ...input.blocks.scheduled,
    ...input.blocks.closed,
  ];

  for (const lead of allLeads) {
    if (lead.status === "encerrado") {
      blocks.closed.push(lead);
      continue;
    }

    const leadDateKey = buildLocalDateKey(lead.returnAt || lead.updatedAt);
    if (!leadDateKey) {
      blocks.today.push(lead);
      continue;
    }

    const compare = compareDateKeys(leadDateKey, todayKey);
    if (compare < 0) blocks.overdue.push(lead);
    else if (compare > 0) blocks.scheduled.push(lead);
    else blocks.today.push(lead);
  }

  return {
    blocks,
    summary: recomputeSummary(blocks),
  };
}

function markBoardLeadsInInbox(
  board: BoardResponse | null,
  leadIds: string[],
  leadConversationIds?: Record<string, string | number>,
  fallbackConversationId?: string | number | null,
) {
  if (!board || !leadIds.length) return board;
  const targetIds = new Set(leadIds.map((leadId) => String(leadId || "").trim()).filter(Boolean));
  if (!targetIds.size) return board;

  let changed = false;
  const blocks = (Object.fromEntries(
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).map((blockKey) => [
      blockKey,
      (board.blocks[blockKey] || []).map((lead) => {
        if (!targetIds.has(lead.id)) return lead;
        const conversationId = leadConversationIds?.[lead.id] || fallbackConversationId || lead.inboxConversationId || lead.atendimentoConversationId || null;
        if (!conversationId && isLeadInInbox(lead)) return lead;
        changed = true;
        return {
          ...lead,
          isInInbox: true,
          inboxConversationId: conversationId,
          atendimentoConversationId: conversationId,
          sharedProfile: {
            ...(lead.sharedProfile || {}),
            presence: {
              ...(lead.sharedProfile?.presence || {}),
              atendimento: {
                ...(lead.sharedProfile?.presence?.atendimento || {}),
                present: true,
                conversationId,
              },
            },
          },
        };
      }),
    ]),
  ) as BoardResponse["blocks"]);

  return changed ? { ...board, blocks } : board;
}

function formatDatetimeLocal(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function localDateKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function buildTargetDatetimeLocal(dateKey: string, currentReturnAt?: string | null, fallbackHour = 9, fallbackMinute = 0) {
  const base = currentReturnAt ? new Date(currentReturnAt) : new Date(`${dateKey}T09:00:00`);
  const next = new Date(base);
  next.setFullYear(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)));
  if (!currentReturnAt) next.setHours(fallbackHour, fallbackMinute, 0, 0);
  return formatDatetimeLocal(next);
}

function DateDropSlot({
  item,
  active,
  pulse,
  dragging,
  ignoreClick,
  onDateShortcut,
  onSelect,
  register,
}: {
  item: DateFilterItem;
  active: boolean;
  pulse: boolean;
  dragging: boolean;
  ignoreClick: () => boolean;
  onDateShortcut: () => void;
  onSelect: () => void;
  register: (node: HTMLElement | null) => void;
}) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: item.key, data: { type: "date-filter", key: item.key } });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `date:${item.key}`, data: { type: "date-filter", key: item.key } });

  const setCombinedRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setDragRef(node);
    register(node);
  };

  const rawSubtitle = String(item.subtitle || "").trim();
  let showSubtitle = Boolean(rawSubtitle);
  try {
    const normalized = rawSubtitle
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w\s]/g, "")
      .toLowerCase()
      .trim();
    if (["sem pendencia", "fluxo principal", "sem agenda"].includes(normalized)) {
      showSubtitle = false;
    }
  } catch {
    const fallback = rawSubtitle.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (["sem pendencia", "fluxo principal", "sem agenda"].includes(fallback)) {
      showSubtitle = false;
    }
  }

  // UX: hide the "retorno futuro" subtitle for scheduled date cards
  // (removes strings like "1 retorno futuro" that clutter the small cards)
  if (item.blockKey === "scheduled") {
    showSubtitle = false;
  }

  return (
    <div
      className={styles.dateFilterCard}
      data-active={active ? "true" : "false"}
      data-tone={item.blockKey}
      data-dropover={isOver ? "true" : "false"}
      data-pulse={pulse ? "true" : "false"}
      data-dragging={dragging || isDragging ? "true" : "false"}
      onClick={() => {
        if (ignoreClick()) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (ignoreClick()) return;
          onSelect();
        }
      }}
      ref={setCombinedRef}
      {...attributes}
      {...listeners}
    >
      <span className={styles.dateFilterDay}>{item.dayLabel}</span>
      <strong>{item.title}</strong>
      {showSubtitle ? <span>{item.subtitle}</span> : null}

      {active ? (
        <button
          type="button"
          className={styles.atendimentoShortcut}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDateShortcut();
          }}
          title="Enviar cards visíveis desta data para Prospecção"
          aria-label="Enviar cards visíveis desta data para Prospecção"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}

      <AnimatedCount value={item.count} />
      <span className={styles.receiveHint}>Solte aqui</span>
    </div>
  );
}

function AnimatedCount({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const [rolling, setRolling] = useState(false);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    const diff = Math.abs(to - from);
    const DURATION = Math.max(240, Math.min(560, 220 + diff * 10));
    const startTime = performance.now();
    setRolling(true);
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / DURATION, 1);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        setRolling(false);
      }
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <b data-rolling={rolling ? "true" : "false"}>{displayed}</b>;
}

function LeadCardView({ lead, draft, blockKey, selected, saving, onFocus, onQuickAction, onInboxAction, onEdit, onDraftChange, onSave, editing }: LeadCardView) {
  const meta = returnMeta(lead, draft, blockKey);
  const signals = lead.signals || {
    alreadyExisted: Boolean((lead.timesSeen || 0) > 1),
    cameFromWebscraping: lead.sourceType === "webscraping" || String(lead.primarySource || "").toLowerCase() === "webscraping",
    hadPreviousContact: Boolean((lead.attemptCount || 0) > 0 || lead.lastContactAt),
    wasClosedBefore: Boolean(lead.wasClosedBefore),
  };
  const chips = [
    signals.alreadyExisted ? "Lead conhecido" : null,
    signals.cameFromWebscraping ? "Webscraping" : null,
    signals.hadPreviousContact ? "Com histórico" : null,
    signals.wasClosedBefore ? "Já encerrado" : null,
    lead.whatsappAvailability?.status === "unavailable" ? "Sem WhatsApp" : null,
    lead.city || null,
  ].filter(Boolean);

  const callUrl = buildCallUrl(draft.phone || lead.phone);
  const whatsappBlocked = lead.whatsappAvailability?.status === "unavailable";
  const whatsappUrl = whatsappBlocked ? "" : buildWhatsAppUrl(draft.phone || lead.phone, draft.name || lead.name);
  const leadSource = lead.primarySource || lead.sourceType;
  const inInbox = isLeadInInbox(lead);
  const webscrapingSummary = buildLeadWebscrapingSummary(lead);

  // inline editor mount/animation control — uses global motion timings
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [editorRendered, setEditorRendered] = useState<boolean>(Boolean(editing));
  const [editorAnimating, setEditorAnimating] = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    const motion = HBX_WINDOW_STANDARD.motion;
    let timer: number | undefined;

    if (editing) {
      setEditorRendered(true);
      // open animation
      requestAnimationFrame(() => {
        if (!el) return;
        el.style.overflow = "hidden";
        el.style.maxHeight = "0px";
        el.style.opacity = "0";
        el.style.transition = `max-height ${motion.enterMs}ms ${motion.enterEasing}, opacity ${motion.enterMs}ms ${motion.enterEasing}`;
        requestAnimationFrame(() => {
          if (!el) return;
          el.style.maxHeight = `${el.scrollHeight}px`;
          el.style.opacity = "1";
        });
        setEditorAnimating(true);
        timer = window.setTimeout(() => {
          if (!el) return;
          el.style.maxHeight = "";
          el.style.overflow = "";
          el.style.transition = "";
          setEditorAnimating(false);
        }, motion.enterMs + 20);
      });
    } else {
      // close animation
      if (!el) {
        setEditorRendered(false);
      } else {
        el.style.overflow = "hidden";
        el.style.maxHeight = `${el.scrollHeight}px`;
        el.style.opacity = "1";
        el.style.transition = `max-height ${motion.exitMs}ms ${motion.exitEasing}, opacity ${motion.exitMs}ms ${motion.exitEasing}`;
        requestAnimationFrame(() => {
          if (!el) return;
          el.style.maxHeight = "0px";
          el.style.opacity = "0";
        });
        setEditorAnimating(true);
        timer = window.setTimeout(() => {
          setEditorAnimating(false);
          setEditorRendered(false);
          if (el) {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.transition = "";
          }
        }, motion.exitMs + 20);
      }
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [editing]);

  return (
    <LiquidGlassCard
      as="article"
      className={styles.leadCard}
      accentTone={
        blockKey === "today"
          ? "success"
          : blockKey === "overdue"
            ? "danger"
            : blockKey === "scheduled"
              ? "info"
              : "warning"
      }
      data-selected={selected ? "true" : "false"}
      data-tone={blockKey}
      data-whatsapp={getLeadWhatsappStatus(lead)}
      header={
        <div
          className={styles.leadMainButton}
          role="button"
          tabIndex={0}
          onClick={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onFocus();
            }
          }}
        >
          <div className={styles.leadCardTop}>
            <div className={styles.leadIdentity}>
              {leadSource && String(leadSource).trim().toLowerCase() !== "manual" && (
                <span className={`${styles.leadEyebrow} ${glassCardStyles.eyebrow}`}>{sourceLabel(leadSource)}</span>
              )}
              <strong className={`${styles.leadName} ${glassCardStyles.title}`}>{draft.name || lead.name || "Lead sem nome"}</strong>
              <span className={`${styles.returnBadge} ${glassCardStyles.pill} ${glassCardStyles.noBreak}`} data-tone={meta.tone}>{meta.label}</span>
              <span className={`${styles.leadSubline} ${glassCardStyles.subtitle}`}>
                {lead.segment ? (
                  <>
                    {lead.segment}
                    {lead.city ? ` • ${lead.city}` : null}
                  </>
                ) : lead.city ? lead.city : null}
              </span>
            </div>
            <div className={glassCardStyles.headerAside}>
              <button type="button" className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} onClick={() => onEdit?.(lead.id)} aria-label="Editar">Editar</button>
              <button
                type="button"
                className={`${styles.inboxLeadButton} ${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                data-state={inInbox ? "in" : "out"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onInboxAction(lead);
                }}
                disabled={saving || blockKey === "closed"}
              >
                {inInbox ? "Inbox" : "Importar"}
              </button>
            </div>
          </div>
          <div className={glassCardStyles.cluster}>
            {chips.slice(0, 3).map((chip) => <span key={`${lead.id}-${chip}`} className={`${styles.memoryChip} ${glassCardStyles.pill} ${glassCardStyles.noBreak}`}>{chip}</span>)}
          </div>
        </div>
      }
      lead={editorRendered ? (
        <div
          ref={editorRef}
          className={styles.inlineEdit}
          aria-hidden={!editing && editorAnimating}
        >
          <div className={styles.fieldGrid}>
            <label className={styles.field}><span className={styles.fieldLabel}>Nome</span><input className={styles.fieldInput} value={draft.name} onChange={(e) => onDraftChange?.(lead.id, { name: e.target.value })} /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>Telefone</span><input className={styles.fieldInput} value={draft.phone} onChange={(e) => onDraftChange?.(lead.id, { phone: e.target.value })} /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>E-mail</span><input className={styles.fieldInput} value={draft.email} onChange={(e) => onDraftChange?.(lead.id, { email: e.target.value })} /></label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Status</span>
              <select className={styles.fieldInput} value={draft.status} onChange={(e) => onDraftChange?.(lead.id, { status: e.target.value as LeadStatus })}>
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className={styles.fieldWide}><span className={styles.fieldLabel}>Próxima ação</span><input className={styles.fieldInput} value={draft.nextAction} onChange={(e) => onDraftChange?.(lead.id, { nextAction: e.target.value })} /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>Retorno</span><input className={styles.fieldInput} type="datetime-local" value={draft.returnAt} onChange={(e) => onDraftChange?.(lead.id, { returnAt: e.target.value })} /></label>
            <label className={styles.fieldWide}><span className={styles.fieldLabel}>Observação curta</span><textarea className={styles.fieldTextarea} rows={3} value={draft.shortNote} onChange={(e) => onDraftChange?.(lead.id, { shortNote: e.target.value })} /></label>
          </div>
          <div className={styles.detailFooterActions}>
            <button type="button" className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`} onClick={() => onSave?.(lead.id)} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
            <button type="button" className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} onClick={() => onEdit?.(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}
      actions={
        <div className={styles.leadActionRow}>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${styles.whatsappAction} ${glassCardStyles.noBreak} ${whatsappBlocked ? styles.whatsappUnavailable : ""}`}
            href={whatsappUrl || undefined}
            target={whatsappUrl ? "_blank" : undefined}
            rel={whatsappUrl ? "noreferrer" : undefined}
            aria-disabled={!whatsappUrl}
            title={whatsappBlocked ? "Motor confirmou que este numero nao possui WhatsApp." : "Abrir conversa no WhatsApp"}
            onClick={() => {
              if (whatsappUrl) onQuickAction("tentativa_whatsapp");
            }}
          >
            {whatsappBlocked ? "Sem WhatsApp" : "WhatsApp"}
          </a>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
            href={callUrl || undefined}
            aria-disabled={!callUrl}
            onClick={() => {
              if (callUrl) onQuickAction("tentativa_call");
            }}
          >
            Ligar
          </a>
          {lead.quickActions.includes("amanha") ? <button type="button" className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} onClick={() => onQuickAction("amanha")} disabled={saving}>Amanhã</button> : null}
          {lead.quickActions.includes("encerrar") ? <button type="button" className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} onClick={() => onQuickAction("encerrar")} disabled={saving}>Encerrar</button> : null}
          {lead.quickActions.includes("reabrir") ? <button type="button" className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} onClick={() => onQuickAction("reabrir")} disabled={saving}>Reabrir</button> : null}
        </div>
      }
      highlight={
        <div className={`${glassCardStyles.stack} ${styles.leadQuickReadStack}`}>
          <div className={styles.leadInfoBlock}>
            <span className={glassCardStyles.sectionLabel}>Endereço</span>
            <strong className={glassCardStyles.sectionTitle}>Localização</strong>
            <p className={glassCardStyles.bodyText}>{lead.address || "Sem endereço registrado."}</p>
          </div>
          <div className={styles.leadInfoBlock}>
            <span className={glassCardStyles.sectionLabel}>Resumo</span>
            <strong className={glassCardStyles.sectionTitle}>Leitura rapida</strong>
            <p className={glassCardStyles.bodyText}>{draft.shortNote || lead.shortNote || webscrapingSummary || "Sem observação curta registrada."}</p>
          </div>
        </div>
      }
      metrics={
        <div className={glassCardStyles.metricGrid}>
          <div className={glassCardStyles.metricCard}><span className={glassCardStyles.metricLabel}>Tentativas</span><strong className={glassCardStyles.metricValue}>{lead.attemptCount || 0}</strong></div>
          <div className={glassCardStyles.metricCard}><span className={glassCardStyles.metricLabel}>Ultimo contato</span><strong className={glassCardStyles.metricValue}>{formatShortDate(lead.lastContactAt)}</strong></div>
          {lead.rating != null ? <div className={glassCardStyles.metricCard}><span className={glassCardStyles.metricLabel}>Nota</span><strong className={glassCardStyles.metricValue}>{Number(lead.rating).toFixed(1)}</strong></div> : null}
          {Number(lead.reviews || 0) > 0 ? <div className={glassCardStyles.metricCard}><span className={glassCardStyles.metricLabel}>Avaliacoes</span><strong className={glassCardStyles.metricValue}>{lead.reviews}</strong></div> : null}
        </div>
      }
    >
      {lead.website ? (
        <div className={glassCardStyles.cluster}>
          <a className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`} href={lead.website} target="_blank" rel="noreferrer">
            Site
          </a>
        </div>
      ) : null}
    </LiquidGlassCard>
  );
}

function DraggableLeadCard({
  lead,
  draft,
  blockKey,
  selected,
  saving,
  disabled,
  hidden,
  onFocus,
  onQuickAction,
  onInboxAction,
  onEdit,
  onDraftChange,
  onSave,
  editing,
  register,
}: LeadCardView & { disabled: boolean; hidden: boolean; register: (node: HTMLElement | null) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    disabled,
    data: { type: "lead", leadId: lead.id },
  });

  const style = transform
    ? ({
        transform: CSS.Translate.toString(transform),
      } satisfies CSSProperties)
    : undefined;

  return (
    <div
      className={styles.draggableWrap}
      data-dragging={isDragging ? "true" : "false"}
      data-flying={hidden ? "true" : "false"}
      style={style}
      ref={(node) => {
        setNodeRef(node);
        register(node);
      }}
      {...attributes}
      {...listeners}
    >
      <LeadCardView
        lead={lead}
        draft={draft}
        blockKey={blockKey}
        selected={selected}
        saving={saving}
        onFocus={onFocus}
        onQuickAction={onQuickAction}
        onInboxAction={onInboxAction}
        onEdit={onEdit}
        onDraftChange={onDraftChange}
        onSave={onSave}
        editing={editing}
      />
    </div>
  );
}

export default function VendasClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasToken = useRequireModule("vendas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LeadDraft>>({});
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [whatsappFilter, setWhatsappFilter] = useState<WhatsappFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [selectedDateKey, setSelectedDateKey] = useState<DateFilterKey>("today");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedTimelineEventId, setExpandedTimelineEventId] = useState<string | null>(null);
  const [activeDragLeadId, setActiveDragLeadId] = useState<string | null>(null);
  const [activeDragDateKey, setActiveDragDateKey] = useState<string | null>(null);
  const [pulseDateKey, setPulseDateKey] = useState<DateFilterKey | null>(null);
  const [flyAnimation, setFlyAnimation] = useState<FlyAnimation | null>(null);
  const [manualLead, setManualLead] = useState({
    name: "",
    phone: "",
    email: "",
    nextAction: "Primeiro contato",
    returnAt: plusDaysDatetimeLocal(0),
    shortNote: "",
  });
  const leadCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const dateFilterRefs = useRef<Record<string, HTMLElement | null>>({});
  const archiveRef = useRef<HTMLElement | null>(null);
  const lastDragEndedAtRef = useRef(0);
  const filterScrollerRef = useRef<HTMLDivElement | null>(null);
  const [visibleDateCount, setVisibleDateCount] = useState<number>(Infinity);
  const [scrollerReady, setScrollerReady] = useState(false);
  const todayAgendaLaunchNotice = useQuickLaunchNotice();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const detectDateFilterCollision = useMemo<CollisionDetection>(
    () => ({ pointerCoordinates, droppableContainers }) => {
      if (!pointerCoordinates) return [];

      for (const container of droppableContainers) {
        const id = String(container.id);
        const node = dateFilterRefs.current[id];
        const rect = node?.getBoundingClientRect();
        if (!rect) continue;

        if (
          pointerCoordinates.x >= rect.left &&
          pointerCoordinates.x <= rect.right &&
          pointerCoordinates.y >= rect.top &&
          pointerCoordinates.y <= rect.bottom
        ) {
          return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
        }
      }

      return [];
    },
    [],
  );

  async function loadBoard() {
    setError(null);
    try {
      const payload = await apiFetch<BoardResponse>("/vendas/board");
      const normalizedPayload = normalizeBoardForLocalAgenda(payload);
      setBoard(normalizedPayload);
      setDrafts(hydrateDrafts(normalizedPayload));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o CRM de Vendas.");
    } finally {
      setLoading(false);
    }
  }

  const openInboxAgenda = useCallback((conversationId?: string | number | null) => {
    todayAgendaLaunchNotice.clear();
    const params = new URLSearchParams({
      atendimentoQueue: "bot",
      atendimentoSection: "conversa",
    });
    if (conversationId) params.set("conversationId", String(conversationId));
    router.push(`/atendimento?${params.toString()}`);
  }, [router, todayAgendaLaunchNotice]);

  const syncLeadsToInbox = useCallback(async (leads: LeadItem[], options?: { openAfter?: boolean; title?: string; description?: string }) => {
    const visibleLeadIds = leads.map((lead) => lead.id).filter(Boolean);
    if (!visibleLeadIds.length) {
      setFeedback("Nenhum card visível para importar ao Inbox.");
      return null;
    }

    todayAgendaLaunchNotice.start({
      loadingTitle: options?.title || "Abrindo Inbox",
      loadingDescription: options?.description || "Enviando os cards visíveis para Prospecção.",
      successTitle: "Prospecção pronta",
      successDescription: "Tudo certo. Os cards foram preparados em Prospecção.",
      ctaLabel: "Abrir Prospecção",
      onOpen: () => openInboxAgenda(),
    });

    try {
      const syncResult = await apiFetch<TodayAgendaSyncResponse>("/vendas/agenda/whatsapp/sync-today", {
        method: "POST",
        body: JSON.stringify({ leadIds: visibleLeadIds }),
      });
      const todayLeadCount = Number(syncResult?.todayLeadCount || 0);
      const mirroredLeadCount = Number(syncResult?.mirroredLeadCount || 0);
      if (!syncResult?.ok) {
        throw new Error(
          syncResult?.message ||
            "Os cards visíveis nao foram enviados para Prospecção. Recarregue e tente novamente.",
        );
      }
      const firstConversationId =
        syncResult?.conversationIds?.[0] ||
        (syncResult?.leadConversationIds ? syncResult.leadConversationIds[visibleLeadIds[0]] : null) ||
        null;
      const importedLeadIds = syncResult?.leadConversationIds
        ? Object.keys(syncResult.leadConversationIds)
        : firstConversationId && visibleLeadIds.length === 1
          ? visibleLeadIds
          : [];
      if (importedLeadIds.length) {
        setBoard((currentBoard) => markBoardLeadsInInbox(currentBoard, importedLeadIds, syncResult?.leadConversationIds, firstConversationId));
      }
      todayAgendaLaunchNotice.markSuccess({
        successDescription:
          String(syncResult?.message || "").trim() ||
          (todayLeadCount
            ? `${mirroredLeadCount} card(s) foram preparados em Prospecção com roteiro pendente para envio manual.`
            : "Nao ha cards visíveis para preparar em Prospecção."),
      });
      await loadBoard();
      if (options?.openAfter) openInboxAgenda(firstConversationId);
      return syncResult;
    } catch (syncError) {
      todayAgendaLaunchNotice.clear();
      setError(syncError instanceof Error ? syncError.message : "Falha ao importar cards para Prospecção.");
      return null;
    }
  }, [openInboxAgenda, todayAgendaLaunchNotice]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadBoard();
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (searchParams?.get("agendaStudio") !== "1") return;
    const mode = searchParams?.get("agendaMode") || "sales";
    if (mode !== "sales") return;
    router.replace("/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas");
  }, [hasToken, router, searchParams]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!pulseDateKey) return;
    const timer = window.setTimeout(() => setPulseDateKey(null), 560);
    return () => window.clearTimeout(timer);
  }, [pulseDateKey]);

  useEffect(() => {
    if (!flyAnimation) return;
    const timer = window.setTimeout(() => setFlyAnimation(null), 460);
    return () => window.clearTimeout(timer);
  }, [flyAnimation]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  const leadById = useMemo(() => {
    const map = new Map<string, { lead: LeadItem; block: LeadBlockKey }>();
    if (!board) return map;
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach((blockKey) => {
      (board.blocks[blockKey] || []).forEach((lead) => map.set(lead.id, { lead, block: blockKey }));
    });
    return map;
  }, [board]);

  const allLeads = useMemo(() => {
    const items: Array<{ lead: LeadItem; block: LeadBlockKey }> = [];
    if (!board) return items;
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach((blockKey) => {
      (board.blocks[blockKey] || []).forEach((lead) => items.push({ lead, block: blockKey }));
    });
    const orderWeight: Record<LeadBlockKey, number> = { overdue: 0, today: 1, scheduled: 2, closed: 3 };
    return items.sort((left, right) => {
      const blockDiff = orderWeight[left.block] - orderWeight[right.block];
      if (blockDiff !== 0) return blockDiff;
      return new Date(right.lead.updatedAt || 0).getTime() - new Date(left.lead.updatedAt || 0).getTime();
    });
  }, [board]);

  const deferredCommandQuery = useDeferredValue(commandQuery);
  const commandResults = useMemo(() => {
    const normalized = deferredCommandQuery.trim().toLowerCase();
    const items = allLeads.slice(0, 20);
    if (!normalized) return items;
    return items.filter(({ lead, block }) =>
      [lead.name, lead.phone, lead.email, lead.address, lead.city, lead.segment, lead.nextAction, lead.shortNote, lead.lastResult, lead.primarySource, block]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [allLeads, deferredCommandQuery]);

  const dateFilters = useMemo<DateFilterItem[]>(() => {
    const scheduledGroups = new Map<string, LeadItem[]>();
    (board?.blocks.scheduled || []).forEach((lead) => {
      const dateKey = buildLocalDateKey(lead.returnAt || lead.updatedAt);
      if (!dateKey) return;
      scheduledGroups.set(dateKey, [...(scheduledGroups.get(dateKey) || []), lead]);
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureBase = Array.from({ length: 14 }, (_, index) => {
      const current = new Date(today);
      current.setDate(today.getDate() + index + 1);
      const dateKey = buildLocalDateKey(current.toISOString());
      const leads = scheduledGroups.get(dateKey) || [];
      return {
        key: `scheduled:${dateKey}` as const,
        blockKey: "scheduled" as const,
        count: leads.length,
        title: railTitle(dateKey),
        subtitle: leads.length ? pluralize(leads.length, "retorno futuro", "retornos futuros") : "Sem agenda",
        dayLabel: railDay(dateKey),
        isoDate: dateKey,
      };
    });
    const lastFutureKey = futureBase[futureBase.length - 1]?.isoDate || "";
    const extraFuture = Array.from(scheduledGroups.entries())
      .filter(([dateKey]) => dateKey > lastFutureKey)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([dateKey, leads]) => ({
        key: `scheduled:${dateKey}` as const,
        blockKey: "scheduled" as const,
        count: leads.length,
        title: railTitle(dateKey),
        subtitle: pluralize(leads.length, "retorno futuro", "retornos futuros"),
        dayLabel: railDay(dateKey),
        isoDate: dateKey,
      }));
    return [
      {
        key: "overdue",
        blockKey: "overdue",
        count: board?.summary.overdue || 0,
        title: "Atrasados",
        subtitle: board?.summary.overdue ? "Ontem para trás." : "Sem pendência.",
        dayLabel: "Prioridade",
      },
      {
        key: "today",
        blockKey: "today",
        count: board?.summary.today || 0,
        title: "Hoje",
        subtitle: board?.summary.today ? "Fluxo principal." : "Sem agenda.",
        dayLabel: "Operação",
      },
      ...futureBase,
      ...extraFuture,
    ];
  }, [board]);

  useEffect(() => {
    if (!dateFilters.length) return;
    setSelectedDateKey((current) => {
      if (dateFilters.some((item) => item.key === current)) return current;
      return dateFilters.find((item) => item.count > 0)?.key || dateFilters[0].key;
    });
  }, [dateFilters]);

  const selectedFilter = useMemo(
    () => dateFilters.find((item) => item.key === selectedDateKey) || dateFilters[0] || null,
    [dateFilters, selectedDateKey],
  );

  const filteredLeads = useMemo(() => {
    if (!board || !selectedFilter) return [];
    const scopedLeads =
      selectedFilter.key === "overdue"
        ? board.blocks.overdue || []
        : selectedFilter.key === "today"
          ? board.blocks.today || []
          : (board.blocks.scheduled || []).filter((lead) => buildLocalDateKey(lead.returnAt || lead.updatedAt) === selectedFilter.isoDate);
    return scopedLeads.filter((lead) => matchesWhatsappFilter(lead, whatsappFilter) && matchesInboxFilter(lead, inboxFilter));
  }, [board, selectedFilter, whatsappFilter, inboxFilter]);

  const handleActiveDateShortcut = useCallback(async () => {
    if (!selectedFilter) return;
    await syncLeadsToInbox(filteredLeads, {
      title: "Abrindo Inbox",
      description: `Enviando os cards visíveis de ${selectedFilter.title} para Prospecção.`,
    });
  }, [filteredLeads, selectedFilter, syncLeadsToInbox]);

  useEffect(() => {
    setSelectedLeadId((current) => {
      if (current && filteredLeads.some((lead) => lead.id === current)) return current;
      if (current && showClosed && (board?.blocks.closed || []).some((lead) => lead.id === current)) return current;
      // Do not auto-select the first lead by default. Keep selection null
      // until user explicitly focuses a lead to avoid the first card
      // being treated differently on initial render.
      return null;
    });
  }, [board?.blocks.closed, filteredLeads, showClosed]);

  useEffect(() => {
    if (!showClosed || !archiveRef.current) return;
    const id = window.setTimeout(() => {
      archiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      archiveRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, [showClosed]);

  // Responsive visible date count: hide furthest dates first when space shrinks
  useEffect(() => {
    const el = filterScrollerRef.current;
    if (!el) return;
    const calculate = () => {
      // ~64px for "+" button + 12px gap reserved at the end
      const PLUS_RESERVED = 76;
      // 120px min card width + 12px gap = 132px per slot
      const CARD_SLOT = 132;
      const fits = Math.max(2, Math.floor((el.clientWidth - PLUS_RESERVED) / CARD_SLOT));
      setVisibleDateCount(fits);
      setScrollerReady(true);
    };
    const id = requestAnimationFrame(calculate);
    const ro = new ResizeObserver(calculate);
    ro.observe(el);
    return () => { cancelAnimationFrame(id); ro.disconnect(); };
  }, []);

  const selectedLeadRecord = selectedLeadId ? leadById.get(selectedLeadId) || null : null;
  const selectedLead = selectedLeadRecord?.lead || null;
  const selectedLeadBlock = selectedLeadRecord?.block || "today";
  const selectedLeadDraft = selectedLead ? drafts[selectedLead.id] || createDraft(selectedLead) : null;
  const closedLeads = board?.blocks.closed || [];

  async function handleCreateManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingManual(true);
    setError(null);
    try {
      const body: any = {
        name: manualLead.name || undefined,
        phone: manualLead.phone || undefined,
        nextAction: manualLead.nextAction || undefined,
        returnAt: manualLead.returnAt || undefined,
        shortNote: manualLead.shortNote || undefined,
      };
      if (manualLead.email && String(manualLead.email).trim()) body.email = manualLead.email;

      const payload = await apiFetch<{ ok: boolean; action: string }>("/vendas/manual", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setFeedback(payload.action === "updated" ? "Lead manual atualizado no CRM." : "Lead manual criado no CRM.");
      setManualLead({
        name: "",
        phone: "",
        email: "",
        nextAction: "Primeiro contato",
        returnAt: plusDaysDatetimeLocal(0),
        shortNote: "",
      });
      setComposerOpen(false);
      await loadBoard();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Falha ao criar lead manual.");
    } finally {
      setCreatingManual(false);
    }
  }

  function setLeadDraft(leadId: string, patch: Partial<LeadDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [leadId]: {
        ...(prev[leadId] || { name: "", phone: "", email: "", status: "novo" as LeadStatus, nextAction: "", returnAt: "", shortNote: "" }),
        ...patch,
      },
    }));
  }

  async function saveLead(leadId: string, patch?: Partial<LeadDraft>, successMessage?: string) {
    const draft = {
      ...(drafts[leadId] || { name: "", phone: "", email: "", status: "novo" as LeadStatus, nextAction: "", returnAt: "", shortNote: "" }),
      ...(patch || {}),
    };
    const email = String(draft.email || "").trim();
    setSavingLeadId(leadId);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: draft.name,
        phone: draft.phone,
        email: email || null,
        status: draft.status,
        nextAction: draft.nextAction,
        returnAt: draft.returnAt || "",
        shortNote: draft.shortNote,
      };
      await apiFetch(`/vendas/lead/${leadId}`, { method: "PATCH", body: JSON.stringify(body) });
      setFeedback(successMessage || "Lead atualizado com sucesso.");
      await loadBoard();
      // If the saved lead was being edited inline, close the inline editor
      if (editingLeadId === leadId) setEditingLeadId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao atualizar o lead.");
    } finally {
      setSavingLeadId(null);
    }
  }

  function applyOptimisticAttemptIncrement(currentBoard: BoardResponse, leadId: string) {
    const blocks: BoardResponse["blocks"] = {
      overdue: [...currentBoard.blocks.overdue],
      today: [...currentBoard.blocks.today],
      scheduled: [...currentBoard.blocks.scheduled],
      closed: [...currentBoard.blocks.closed],
    };

    let found = false;
    ([("overdue" as LeadBlockKey), ("today" as LeadBlockKey), ("scheduled" as LeadBlockKey), ("closed" as LeadBlockKey)]).forEach((blockKey) => {
      blocks[blockKey] = blocks[blockKey].map((lead) => {
        if (lead.id !== leadId) return lead;
        found = true;
        return { ...lead, attemptCount: (lead.attemptCount || 0) + 1, updatedAt: new Date().toISOString() };
      });
    });

    if (!found) return currentBoard;
    return { blocks, summary: recomputeSummary(blocks) };
  }

  async function incrementAttempt(leadId: string) {
    if (!board) return;
    const currentRecord = leadById.get(leadId);
    const currentAttempt = currentRecord?.lead.attemptCount || 0;
    const nextAttempt = currentAttempt + 1;
    const previousBoard = board;
    const optimisticBoard = applyOptimisticAttemptIncrement(board, leadId);
    setBoard(optimisticBoard);
    setSavingLeadId(leadId);
    setError(null);
    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ attemptCount: nextAttempt }),
      });
      setFeedback("Tentativa registrada.");
      await loadBoard();
    } catch (err) {
      setBoard(previousBoard);
      setError(err instanceof Error ? err.message : "Falha ao registrar tentativa.");
    } finally {
      setSavingLeadId(null);
    }
  }

  async function runQuickAction(lead: LeadItem, action: string) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    if (action === "tentativa_whatsapp" || action === "tentativa_call") {
      await incrementAttempt(lead.id);
      return;
    }
    if (action === "hoje") {
      await saveLead(lead.id, {
        status: currentDraft.status === "novo" ? "contato" : currentDraft.status,
        nextAction: currentDraft.nextAction || "Retomar hoje",
        returnAt: plusDaysDatetimeLocal(0),
      });
      return;
    }
    if (action === "amanha") {
      // Move the lead to the next available date filter instead of only setting a datetime.
      // Compute the lead's current date key and find its index inside `dateFilters`.
      const currentRecord = leadById.get(lead.id);
      const leadBlock = currentRecord?.block || "today";
      const currentDateKey =
        leadBlock === "scheduled"
          ? (`scheduled:${buildLocalDateKey(lead.returnAt || lead.updatedAt)}` as DateFilterKey)
          : (leadBlock as DateFilterKey);

      const idx = dateFilters.findIndex((item) => item.key === currentDateKey);
      const nextIndex = idx >= 0 ? Math.min(idx + 1, Math.max(0, dateFilters.length - 1)) : 0;
      const targetKey = dateFilters[nextIndex]?.key || (dateFilters[0]?.key as DateFilterKey) || "today";

      await handleDateMove(lead.id, targetKey);
      return;
    }
    if (action === "encerrar") {
      await saveLead(lead.id, { status: "encerrado", nextAction: currentDraft.nextAction || "Lead encerrado", returnAt: "" });
      return;
    }
    if (action === "reabrir") {
      await saveLead(lead.id, { status: "retorno", nextAction: currentDraft.nextAction || "Retomar lead", returnAt: plusDaysDatetimeLocal(1) });
    }
  }

  async function handleLeadInboxAction(lead: LeadItem) {
    if (isLeadInInbox(lead)) {
      openInboxAgenda(getLeadInboxConversationId(lead) || null);
      return;
    }
    setSavingLeadId(lead.id);
    try {
      await syncLeadsToInbox([lead], {
        title: "Importando para Inbox",
        description: "Preparando este card no Inbox interno.",
      });
    } finally {
      setSavingLeadId(null);
    }
  }

  function focusLead(leadId: string) {
    const current = leadById.get(leadId);
    if (!current) return;
    if (current.block === "overdue") setSelectedDateKey("overdue");
    if (current.block === "today") setSelectedDateKey("today");
    if (current.block === "scheduled") {
      const dateKey = buildLocalDateKey(current.lead.returnAt || current.lead.updatedAt);
      if (dateKey) setSelectedDateKey(`scheduled:${dateKey}`);
    }
    if (current.block === "closed") setShowClosed(true);
    setSelectedLeadId(leadId);
    setCommandOpen(false);
    // After changing selected block/lead, wait a tick for DOM to update
    // then scroll the actual card into view and move keyboard focus there.
    window.setTimeout(() => {
      const node = leadCardRefs.current[leadId];
      if (node) {
        try {
          node.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        } catch (e) {
          node.scrollIntoView({ behavior: "smooth" });
        }
        // focus the primary interactive element inside the card if present
        const focusable = (node.querySelector("button, [role=\"button\"], a, input, textarea, [tabindex]") as HTMLElement | null);
        if (focusable) focusable.focus();
      } else {
        // fallback: ensure detail panel is visible
        document.querySelector<HTMLElement>("[data-detail-panel='true']")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }

  function registerLeadCardRef(leadId: string, node: HTMLElement | null) {
    leadCardRefs.current[leadId] = node;
  }

  function registerDateFilterRef(filterKey: DateFilterKey, node: HTMLElement | null) {
    dateFilterRefs.current[filterKey] = node;
  }

  function createPatchedDraft(lead: LeadItem, targetKey: DateFilterKey) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    let returnAt = currentDraft.returnAt || toDatetimeLocal(lead.returnAt) || "";
    let status = currentDraft.status;

    if (targetKey === "today") {
      returnAt = buildTargetDatetimeLocal(localDateKeyFromDate(new Date()), null, 12, 0);
    } else if (targetKey === "overdue") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      returnAt = buildTargetDatetimeLocal(localDateKeyFromDate(yesterday), returnAt || null);
    } else {
      returnAt = buildTargetDatetimeLocal(targetKey.slice("scheduled:".length), returnAt || null);
      if (status !== "encerrado" && status !== "qualificado") status = "retorno";
    }

    return {
      ...currentDraft,
      status,
      returnAt: toDatetimeLocal(returnAt),
    };
  }

  function applyOptimisticDateMove(currentBoard: BoardResponse, leadId: string, targetKey: DateFilterKey, nextDraft: LeadDraft) {
    const blocks: BoardResponse["blocks"] = {
      overdue: [...currentBoard.blocks.overdue],
      today: [...currentBoard.blocks.today],
      scheduled: [...currentBoard.blocks.scheduled],
      closed: [...currentBoard.blocks.closed],
    };
    let movingLead: LeadItem | null = null;

    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach((blockKey) => {
      blocks[blockKey] = blocks[blockKey].filter((lead) => {
        if (lead.id !== leadId) return true;
        movingLead = lead;
        return false;
      });
    });

    if (!movingLead) return currentBoard;

    const patchedLead: LeadItem = {
      ...(movingLead as LeadItem),
      status: nextDraft.status,
      statusLabel: statusLabel(nextDraft.status),
      returnAt: nextDraft.returnAt ? new Date(nextDraft.returnAt).toISOString() : "",
      updatedAt: new Date().toISOString(),
    };

    if (targetKey === "today") blocks.today.unshift(patchedLead);
    else if (targetKey === "overdue") blocks.overdue.unshift(patchedLead);
    else blocks.scheduled.unshift(patchedLead);

    return { blocks, summary: recomputeSummary(blocks) };
  }

  async function handleDateMove(leadId: string, targetKey: DateFilterKey) {
    if (!board) return;
    const currentRecord = leadById.get(leadId);
    if (!currentRecord || currentRecord.block === "closed") return;

    const currentDateKey =
      currentRecord.block === "scheduled"
        ? (`scheduled:${buildLocalDateKey(currentRecord.lead.returnAt || currentRecord.lead.updatedAt)}` as DateFilterKey)
        : (currentRecord.block as DateFilterKey);
    if (currentDateKey === targetKey) return;

    const previousBoard = board;
    const previousDrafts = drafts;
    const nextDraft = createPatchedDraft(currentRecord.lead, targetKey);
    const optimisticBoard = applyOptimisticDateMove(board, leadId, targetKey, nextDraft);

    setBoard(optimisticBoard);
    setDrafts((prev) => ({ ...prev, [leadId]: nextDraft }));
    setSelectedLeadId(leadId);
    setSavingLeadId(leadId);

    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextDraft.status,
          nextAction: nextDraft.nextAction,
          returnAt: nextDraft.returnAt || "",
        }),
      });
      setFeedback("Lead movido na agenda.");
      await loadBoard();
    } catch (moveError) {
      setBoard(previousBoard);
      setDrafts(previousDrafts);
      setError(moveError instanceof Error ? moveError.message : "Falha ao mover o lead na agenda.");
    } finally {
      setSavingLeadId(null);
    }
  }
  async function moveAllLeadsFromSourceToTarget(sourceKey: DateFilterKey, targetKey: DateFilterKey) {
    if (!board) return;
    let leadsToMove: LeadItem[] = [];
    if (sourceKey === "overdue") leadsToMove = [...board.blocks.overdue];
    else if (sourceKey === "today") leadsToMove = [...board.blocks.today];
    else if (sourceKey.startsWith("scheduled:")) {
      const iso = sourceKey.slice("scheduled:".length);
      leadsToMove = (board.blocks.scheduled || []).filter((l) => buildLocalDateKey(l.returnAt || l.updatedAt) === iso);
    } else {
      return;
    }

    if (!leadsToMove.length) return;
    const totalMoves = leadsToMove.length;
    const nextDraftByLeadId: Record<string, LeadDraft> = {};
    const failedLeadIds: string[] = [];
    let completedMoves = 0;

    for (const lead of leadsToMove) {
      nextDraftByLeadId[lead.id] = createPatchedDraft(lead, targetKey);
    }

    setError(null);
    setFeedback(`Movendo 0/${totalMoves} retornos...`);
    setSelectedDateKey(targetKey);
    setSelectedLeadId(null);

    const concurrency = Math.min(3, totalMoves);
    let cursor = 0;

    async function moveOneLead(lead: LeadItem) {
      const nextDraft = nextDraftByLeadId[lead.id];
      try {
        await apiFetch(`/vendas/lead/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: nextDraft.status,
            nextAction: nextDraft.nextAction,
            returnAt: nextDraft.returnAt || "",
          }),
        });

        completedMoves += 1;
        setDrafts((prev) => ({ ...prev, [lead.id]: nextDraft }));
        setBoard((currentBoard) => (currentBoard ? applyOptimisticDateMove(currentBoard, lead.id, targetKey, nextDraft) : currentBoard));
        setFeedback(
          completedMoves >= totalMoves
            ? `Movidos ${completedMoves} retornos.`
            : `Movendo ${completedMoves}/${totalMoves} retornos...`,
        );
      } catch (moveError) {
        failedLeadIds.push(lead.id);
      }
    }

    async function worker() {
      while (cursor < leadsToMove.length) {
        const lead = leadsToMove[cursor];
        cursor += 1;
        if (!lead) break;
        await moveOneLead(lead);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    await loadBoard();

    if (failedLeadIds.length) {
      setError(
        failedLeadIds.length === totalMoves
          ? "Falha ao mover os retornos da agenda."
          : `Falha ao mover ${failedLeadIds.length} de ${totalMoves} retornos.`,
      );
      return;
    }

    setFeedback(`Movidos ${totalMoves} retornos.`);
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id || "");
    if (activeId.startsWith("date:")) {
      setActiveDragDateKey(activeId.slice("date:".length));
      setActiveDragLeadId(null);
    } else {
      setActiveDragLeadId(activeId);
      setActiveDragDateKey(null);
    }
  }

  function handleDragCancel() {
    setActiveDragLeadId(null);
    setActiveDragDateKey(null);
    lastDragEndedAtRef.current = performance.now();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id || "");
    const targetKey = event.over?.id as DateFilterKey | undefined;
    if (!activeId || !targetKey) {
      setActiveDragLeadId(null);
      setActiveDragDateKey(null);
      return;
    }

    if (activeId.startsWith("date:")) {
      setActiveDragLeadId(null);
      setActiveDragDateKey(null);
      const sourceKey = activeId.slice("date:".length) as DateFilterKey;
      if (sourceKey === targetKey) {
        lastDragEndedAtRef.current = performance.now();
        return;
      }
      setPulseDateKey(targetKey);
      await moveAllLeadsFromSourceToTarget(sourceKey, targetKey);
      lastDragEndedAtRef.current = performance.now();
      return;
    }

    const leadId = activeId;
    const record = leadById.get(leadId);
    const draft = record ? drafts[leadId] || createDraft(record.lead) : null;
    const fromRect = leadCardRefs.current[leadId]?.getBoundingClientRect();
    const targetRect = dateFilterRefs.current[targetKey]?.getBoundingClientRect();
    if (record && draft && fromRect && targetRect) {
      setFlyAnimation({
        leadId,
        lead: record.lead,
        draft,
        blockKey: record.block,
        from: { x: fromRect.left, y: fromRect.top, width: fromRect.width, height: fromRect.height },
        to: { x: targetRect.left, y: targetRect.top, width: targetRect.width, height: targetRect.height },
      });
    }
    setActiveDragLeadId(null);
    setActiveDragDateKey(null);
    setPulseDateKey(targetKey);
    await handleDateMove(leadId, targetKey);
    lastDragEndedAtRef.current = performance.now();
  }

  function renderLeadCard(lead: LeadItem, blockKey: LeadBlockKey) {
    const draft = drafts[lead.id] || createDraft(lead);
    const commonProps = {
      lead,
      draft,
      blockKey,
      selected: selectedLeadId === lead.id,
      saving: savingLeadId === lead.id,
      onFocus: () => focusLead(lead.id),
      onQuickAction: (action: string) => void runQuickAction(lead, action),
      onInboxAction: (targetLead: LeadItem) => void handleLeadInboxAction(targetLead),
      onEdit: (id: string | null) => {
        setEditingLeadId((cur) => (cur === id ? null : id));
        if (id) focusLead(id);
      },
      onDraftChange: (leadId: string, patch: Partial<LeadDraft>) => setLeadDraft(leadId, patch),
      onSave: (leadId: string) => void saveLead(leadId),
      editing: editingLeadId === lead.id,
    };

    if (blockKey === "closed") {
      return <LeadCardView key={lead.id} {...commonProps} />;
    }

    return <DraggableLeadCard key={lead.id} {...commonProps} disabled={false} hidden={flyAnimation?.leadId === lead.id} register={(node) => registerLeadCardRef(lead.id, node)} />;
  }

  function renderDetailPanel() {
    if (!selectedLead || !selectedLeadDraft) {
      return (
        <aside className={styles.detailPanel} data-detail-panel="true">
          <div className={styles.detailRail}>
            <span>Fluxo UX: selecione um cliente</span>
            <span className={styles.miniPill}>Operação</span>
          </div>
          <div className={styles.detailEmpty}>
            <span className={styles.panelEyebrow}>Cliente</span>
            <strong>Escolha um card para abrir a lateral.</strong>
            <p>O detalhe fica mais estreito e mostra só o que precisa ser operado agora.</p>
          </div>
        </aside>
      );
    }

    const callUrl = buildCallUrl(selectedLeadDraft.phone || selectedLead.phone);
    const whatsappUrl = buildWhatsAppUrl(selectedLeadDraft.phone || selectedLead.phone, selectedLeadDraft.name || selectedLead.name);
    const meta = returnMeta(selectedLead, selectedLeadDraft, selectedLeadBlock);
    const sharedProfile = selectedLead.sharedProfile || null;
    const sharedLastContact = sharedProfile?.lastContactAt || sharedProfile?.presence?.atendimento?.lastContactAt || selectedLead.lastContactAt || null;

    return (
      <aside className={styles.detailPanel} data-detail-panel="true">
        <div className={styles.detailLayout}>
          <section className={styles.timelineSection}>
            <div className={styles.sectionTopline}>
              <div><span className={styles.panelEyebrow}>Timeline</span></div>
              <span className={styles.miniPill}>{(selectedLead.timeline || []).length} evento(s)</span>
            </div>
            {(selectedLead.timeline || []).length ? (
              <div className={styles.timelineList}>
                {(selectedLead.timeline || []).map((event) => {
                  const isExpanded = expandedTimelineEventId === event.id;
                  const titleText = event.eventType === "return_scheduled" ? "Retorno agendado" : event.title;
                  return (
                    <article
                      key={event.id}
                      className={styles.timelineItem}
                      data-tone={timelineTone(event.eventType)}
                      data-expanded={isExpanded ? "true" : "false"}
                      onClick={() => setExpandedTimelineEventId(isExpanded ? null : event.id)}
                    >
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineBody}>
                        <div className={styles.timelineTopline}>
                          <strong>{titleText}</strong>
                          <span>{isExpanded ? (event.createdAt ? formatDateTime(event.createdAt) : "Agora") : ""}</span>
                        </div>
                        {isExpanded ? <p>{event.description || "Movimento comercial registrado."}</p> : null}
                        {isExpanded ? <span className={styles.timelineMeta}>{timelineMeta(event)}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyPanel}><strong>Nenhum evento registrado</strong><p>A timeline aparece conforme o lead é movimentado.</p></div>
            )}
          </section>
        </div>
      </aside>
    );
  }

  function renderPipelineBoard() {
    if (!selectedFilter) {
      return <section className={styles.boardShell}><div className={styles.emptyBoard}><strong>Nenhuma janela de datas disponível</strong><p>Assim que houver agenda, os cards aparecem aqui.</p></div></section>;
    }

    return (
      <section className={styles.boardShell}>
        <div className={styles.cardsHeader}>
          <div>
            <span className={styles.panelEyebrow}>Clientes</span>
            <h2 className={styles.boardTitle}>{selectedFilter.title}</h2>
            <p className={styles.boardSubtitle}>Acompanhe quem você já chamou e quem precisa de retorno.</p>
          </div>
          <div className={styles.toolbar}>
            <button type="button" className={`${styles.secondaryAction} ${styles.toolbarHighlight}`} onClick={() => setComposerOpen(true)}>Criar novo Lead</button>
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight} ${styles.whatsappFilterButton}`}
              data-active={whatsappFilter !== "all" ? "true" : "false"}
              onClick={() => setWhatsappFilter((current) => nextWhatsappFilter(current))}
              aria-pressed={whatsappFilter !== "all"}
              title="Alternar filtro com WhatsApp / sem WhatsApp"
            >
              {WHATSAPP_FILTER_LABELS[whatsappFilter]}
            </button>
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight} ${styles.inboxFilterButton}`}
              data-active={inboxFilter !== "all" ? "true" : "false"}
              onClick={() => setInboxFilter((current) => nextInboxFilter(current))}
              aria-pressed={inboxFilter !== "all"}
              title="Alternar filtro de presença no Inbox"
            >
              {INBOX_FILTER_LABELS[inboxFilter]}
            </button>
            <button type="button" className={styles.secondaryAction} onClick={() => setShowClosed((current) => !current)}>
              {showClosed ? "Ocultar arquivo" : `Arquivo (${closedLeads.length})`}
            </button>
          </div>
        </div>

        {filteredLeads.length ? (
          <div className={styles.cardsGrid}>
            {filteredLeads.map((lead) => renderLeadCard(lead, selectedFilter.blockKey))}
          </div>
        ) : (
          <div className={styles.emptyBoard}><strong>Sem cards nesta data</strong><p>Nenhum cliente caiu nessa janela ainda.</p></div>
        )}
      </section>
    );
  }

  let headerActions: ReactNode = null;
  if (error || feedback) {
    const compactMessage =
      error && error.toLowerCase().includes("deve ser um e-mail válido")
        ? "E-mail inválido. Remova ou informe um endereço válido."
        : error || feedback;
    headerActions = (
      <div className={styles.headerNotice} data-tone={error ? "error" : "success"}>
        {compactMessage}
      </div>
    );
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Vendas" description="Carregando sessão do CRM comercial." hideHeader={true}>
        <section className={styles.loadingCard}><div className={styles.skeletonHero} /><div className={styles.skeletonBoard} /></section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  const activeDragRecord = activeDragLeadId ? leadById.get(activeDragLeadId) || null : null;
  const activeDragLead = activeDragRecord?.lead || null;
  const activeDragDraft = activeDragLead ? drafts[activeDragLead.id] || createDraft(activeDragLead) : null;
  const flyStyle = flyAnimation
    ? ({
        ["--fly-start-x" as string]: `${flyAnimation.from.x}px`,
        ["--fly-start-y" as string]: `${flyAnimation.from.y}px`,
        ["--fly-width" as string]: `${flyAnimation.from.width}px`,
        ["--fly-height" as string]: `${flyAnimation.from.height}px`,
        ["--fly-end-x" as string]: `${flyAnimation.to.x + flyAnimation.to.width / 2 - flyAnimation.from.width / 2}px`,
        ["--fly-end-y" as string]: `${flyAnimation.to.y + flyAnimation.to.height / 2 - flyAnimation.from.height / 2}px`,
        ["--fly-scale-x" as string]: `${Math.max(0.28, flyAnimation.to.width / flyAnimation.from.width)}`,
        ["--fly-scale-y" as string]: `${Math.max(0.24, flyAnimation.to.height / flyAnimation.from.height)}`,
      } satisfies CSSProperties)
    : undefined;

    const activeDragDateItem = activeDragDateKey ? dateFilters.find((f) => f.key === activeDragDateKey) : null;

  return (
    <DashboardScaffold title="Vendas" actions={headerActions} hideHeader={true}>
      <DndContext
        sensors={sensors}
        collisionDetection={detectDateFilterCollision}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={(event) => void handleDragEnd(event)}
      >
        <div className={styles.premiumBackdrop}>
          <div className={styles.premiumBg} />
          <div className={styles.page}>
            <section className={styles.filterRail}>
              <div className={styles.filterRailHeader}>
                <div><span className={styles.panelEyebrow}>Filtro por datas</span><strong>Agenda comercial</strong></div>
                <div className={styles.filterRailActions}>
                  <Link href="/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas" prefetch={false} className={styles.secondaryAction}>
                    Agenda Vendas
                  </Link>
                </div>
              </div>
              <div className={styles.filterRailScroller} ref={filterScrollerRef} data-ready={scrollerReady ? "true" : undefined}>
                {dateFilters.slice(0, visibleDateCount).map((item) => (
                  <DateDropSlot
                    key={item.key}
                    item={item}
                    active={selectedDateKey === item.key}
                    pulse={pulseDateKey === item.key}
                    dragging={Boolean(activeDragLeadId || activeDragDateKey)}
                    ignoreClick={() => performance.now() - lastDragEndedAtRef.current < 70}
                    onDateShortcut={() => void handleActiveDateShortcut()}
                    onSelect={() => setSelectedDateKey(item.key)}
                    register={(node) => registerDateFilterRef(item.key, node)}
                  />
                ))}

                {/* +Agenda button: rendered after all date cards so it is always last */}
                <button
                  type="button"
                  className={`${styles.dateFilterCard} ${styles.addAgendaButton}`}
                  aria-label="+Agenda"
                  title="+Agenda"
                  onClick={() => { /* graphical placeholder - no action */ }}
                >
                  <span className={styles.dateFilterDay} />
                  <strong>+</strong>
                  <span />
                  <b />
                  <span className={styles.receiveHint} />
                </button>
              </div>
            </section>

            {loading ? (
              <section className={styles.loadingCard}><div className={styles.skeletonBoard} /></section>
            ) : (
              <div className={styles.stageGrid}>
                <div className={styles.stageMain}>{renderPipelineBoard()}</div>
                <div className={styles.stageAside}>{renderDetailPanel()}</div>
              </div>
            )}

            {showClosed ? (
              <section ref={archiveRef} tabIndex={-1} className={styles.archiveSection} aria-labelledby="archive-heading">
                <div className={styles.sectionTopline}>
                  <div id="archive-heading"><span className={styles.panelEyebrow}>Arquivo</span><strong>Encerrados</strong></div>
                  <button type="button" className={styles.secondaryAction} onClick={() => setShowClosed(false)}>Ocultar arquivo</button>
                </div>
                {closedLeads.length ? <div className={styles.cardsGrid}>{closedLeads.map((lead) => renderLeadCard(lead, "closed"))}</div> : <div className={styles.emptyPanel}><strong>Nenhum encerrado ainda</strong><p>Os cards arquivados aparecem aqui.</p></div>}
              </section>
            ) : null}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragLead && activeDragDraft ? (
            <div className={styles.dragOverlayCard}>
              <LeadCardView
                lead={activeDragLead}
                draft={activeDragDraft}
                blockKey={activeDragRecord?.block || "today"}
                selected={selectedLeadId === activeDragLead.id}
                saving={savingLeadId === activeDragLead.id}
                onFocus={() => focusLead(activeDragLead.id)}
                onQuickAction={(action) => void runQuickAction(activeDragLead, action)}
                onInboxAction={(targetLead) => void handleLeadInboxAction(targetLead)}
              />
            </div>
          ) : activeDragDateItem ? (
            <div className={`${styles.dragOverlayCard} ${styles.dragOverlayDateCard}`}>
              <div className={styles.dateFilterCard} style={{ pointerEvents: "none" }}>
                <span className={styles.dateFilterDay}>{activeDragDateItem.dayLabel}</span>
                <strong>{activeDragDateItem.title}</strong>
                <span>{activeDragDateItem.subtitle}</span>
                <b>{activeDragDateItem.count}</b>
                <span className={styles.receiveHint}>Mover todos</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>

        {flyAnimation ? (
          <div className={styles.flyCard} style={flyStyle}>
            <LeadCardView
              lead={flyAnimation.lead}
              draft={flyAnimation.draft}
              blockKey={flyAnimation.blockKey}
              selected={false}
              saving={false}
              onFocus={() => {}}
              onQuickAction={() => {}}
              onInboxAction={() => {}}
            />
          </div>
        ) : null}
      </DndContext>

      {composerOpen ? (
        <div className={`${styles.systemPopupOverlay} ${styles.systemPopupOverlayActive}`} onClick={() => setComposerOpen(false)}>
          <div className={styles.systemPopupFrame} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-lead-title">
            <div className={styles.systemPopupChrome}>
              <div>
                <p className={styles.systemPopupEyebrow}>Vendas</p>
                <strong id="new-lead-title">Novo lead</strong>
              </div>
              <div className={styles.systemPopupActions}>
                <span className={styles.metaBadge}>Cadastro rápido</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setComposerOpen(false)}>Fechar</button>
              </div>
            </div>
            <div className={styles.systemPopupBody}>
              <form className={styles.composerForm} onSubmit={handleCreateManual}>
                <label className={styles.field}><span className={styles.fieldLabel}>Nome</span><input className={styles.fieldInput} value={manualLead.name} onChange={(event) => setManualLead((prev) => ({ ...prev, name: event.target.value }))} placeholder="Ex: Clínica Horizonte" /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>Telefone</span><input className={styles.fieldInput} value={manualLead.phone} onChange={(event) => setManualLead((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Ex: (11) 99999-0000" /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>E-mail</span><input className={styles.fieldInput} value={manualLead.email} onChange={(event) => setManualLead((prev) => ({ ...prev, email: event.target.value }))} placeholder="Opcional" /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>Retorno</span><input className={styles.fieldInput} type="datetime-local" value={manualLead.returnAt} onChange={(event) => setManualLead((prev) => ({ ...prev, returnAt: event.target.value }))} /></label>
                <label className={styles.fieldWide}><span className={styles.fieldLabel}>Próxima ação</span><input className={styles.fieldInput} value={manualLead.nextAction} onChange={(event) => setManualLead((prev) => ({ ...prev, nextAction: event.target.value }))} placeholder="Ex: Primeiro contato" /></label>
                <label className={styles.fieldWide}><span className={styles.fieldLabel}>Observação</span><textarea className={styles.fieldTextarea} rows={4} value={manualLead.shortNote} onChange={(event) => setManualLead((prev) => ({ ...prev, shortNote: event.target.value }))} placeholder="Contexto rápido do lead." /></label>
                <div className={styles.formFooter}><button type="submit" className={styles.primaryAction} disabled={creatingManual}>{creatingManual ? "Criando..." : "Criar lead"}</button></div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <PremiumLaunchDialog notice={todayAgendaLaunchNotice.notice} onOpen={todayAgendaLaunchNotice.openNow} />

      {commandOpen ? (
        <div className="ui-popup-backdrop" onClick={() => setCommandOpen(false)}>
          <div className={styles.commandPalette} onClick={(event) => event.stopPropagation()}>
            <div className={styles.sectionTopline}>
              <div><span className={styles.panelEyebrow}>Command palette</span><strong>Buscar lead, cidade, ação, histórico ou origem</strong></div>
              <button type="button" className={styles.secondaryAction} onClick={() => setCommandOpen(false)}>Fechar</button>
            </div>
            <input className={styles.commandInput} placeholder="Digite nome, telefone, cidade, origem ou próxima ação..." value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} autoFocus />
            <div className={styles.commandList}>
              {commandResults.length ? commandResults.map(({ lead, block }) => (
                <article key={`command-${lead.id}`} className={styles.commandRow}>
                  <button type="button" className={styles.commandMain} onClick={() => focusLead(lead.id)}>
                    <strong>{lead.name || "Lead sem nome"}</strong>
                    <span>{BLOCK_LABELS[block]} • {lead.statusLabel} • {lead.nextAction || "Sem próxima ação"}</span>
                  </button>
                  <div className={styles.commandActionRow}>
                    <a className={styles.secondaryAction} href={buildCallUrl(lead.phone) || undefined}>Ligar</a>
                    <a className={styles.secondaryAction} href={buildWhatsAppUrl(lead.phone, lead.name) || undefined} target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>
                </article>
              )) : <div className={styles.emptyPanel}><strong>Nenhum resultado</strong><p>Tente nome, telefone, cidade, status ou próxima ação.</p></div>}
            </div>
          </div>
        </div>
      ) : null}
    </DashboardScaffold>
  );
}
