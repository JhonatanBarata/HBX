"use client";

import { useDeferredValue, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type LeadStatus = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
type LeadBlockKey = "today" | "overdue" | "scheduled" | "closed";
type DateFilterKey = "overdue" | "today" | `scheduled:${string}`;
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
    atendimento?: { present?: boolean; lastContactAt?: string | null };
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
  sharedProfile?: SharedProfileSummary | null;
  timeline?: LeadTimelineEvent[];
  quickActions: string[];
};

type BoardResponse = {
  summary: { total: number; today: number; overdue: number; scheduled: number; closed: number };
  blocks: Record<LeadBlockKey, LeadItem[]>;
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

export default function VendasClientPage() {
  const hasToken = useRequireAuth();
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
  const [selectedDateKey, setSelectedDateKey] = useState<DateFilterKey>("today");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [manualLead, setManualLead] = useState({
    name: "",
    phone: "",
    email: "",
    nextAction: "Primeiro contato",
    returnAt: plusDaysDatetimeLocal(0),
    shortNote: "",
  });

  async function loadBoard() {
    setError(null);
    try {
      const payload = await apiFetch<BoardResponse>("/vendas/board");
      setBoard(payload);
      setDrafts(hydrateDrafts(payload));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o CRM de Vendas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    void loadBoard();
  }, [hasToken]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

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
      [lead.name, lead.phone, lead.email, lead.city, lead.segment, lead.nextAction, lead.shortNote, lead.lastResult, lead.primarySource, block]
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
    const futureBase = Array.from({ length: 7 }, (_, index) => {
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
    if (selectedFilter.key === "overdue") return board.blocks.overdue || [];
    if (selectedFilter.key === "today") return board.blocks.today || [];
    return (board.blocks.scheduled || []).filter((lead) => buildLocalDateKey(lead.returnAt || lead.updatedAt) === selectedFilter.isoDate);
  }, [board, selectedFilter]);

  useEffect(() => {
    setSelectedLeadId((current) => {
      if (current && filteredLeads.some((lead) => lead.id === current)) return current;
      if (current && showClosed && (board?.blocks.closed || []).some((lead) => lead.id === current)) return current;
      return filteredLeads[0]?.id || (showClosed ? board?.blocks.closed?.[0]?.id || null : null);
    });
  }, [board?.blocks.closed, filteredLeads, showClosed]);

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
      const payload = await apiFetch<{ ok: boolean; action: string }>("/vendas/manual", {
        method: "POST",
        body: JSON.stringify({
          name: manualLead.name,
          phone: manualLead.phone,
          email: manualLead.email,
          nextAction: manualLead.nextAction,
          returnAt: manualLead.returnAt ? new Date(manualLead.returnAt).toISOString() : undefined,
          shortNote: manualLead.shortNote,
        }),
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
    setSavingLeadId(leadId);
    setError(null);
    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name,
          phone: draft.phone,
          email: draft.email,
          status: draft.status,
          nextAction: draft.nextAction,
          returnAt: draft.returnAt ? new Date(draft.returnAt).toISOString() : "",
          shortNote: draft.shortNote,
        }),
      });
      setFeedback(successMessage || "Lead atualizado com sucesso.");
      await loadBoard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao atualizar o lead.");
    } finally {
      setSavingLeadId(null);
    }
  }

  async function runQuickAction(lead: LeadItem, action: string) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    if (action === "hoje") {
      await saveLead(lead.id, {
        status: currentDraft.status === "novo" ? "contato" : currentDraft.status,
        nextAction: currentDraft.nextAction || "Retomar hoje",
        returnAt: plusDaysDatetimeLocal(0),
      });
      return;
    }
    if (action === "amanha") {
      await saveLead(lead.id, {
        status: "retorno",
        nextAction: currentDraft.nextAction || "Retomar contato amanhã",
        returnAt: plusDaysDatetimeLocal(1),
      });
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
    window.setTimeout(() => {
      document.querySelector<HTMLElement>("[data-detail-panel='true']")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function renderLeadCard(lead: LeadItem, blockKey: LeadBlockKey) {
    const draft = drafts[lead.id] || createDraft(lead);
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
      lead.city || null,
    ].filter(Boolean);
    return (
      <article key={lead.id} className={styles.leadCard} data-selected={selectedLeadId === lead.id ? "true" : "false"} data-tone={blockKey}>
        <div className={styles.leadAccent} />
        <button type="button" className={styles.leadMainButton} onClick={() => focusLead(lead.id)}>
          <div className={styles.leadCardTop}>
            <div className={styles.leadIdentity}>
              <span className={styles.leadEyebrow}>{sourceLabel(lead.primarySource || lead.sourceType)}</span>
              <strong className={styles.leadName}>{draft.name || lead.name || "Lead sem nome"}</strong>
              <span className={styles.leadSubline}>
                {lead.segment || "Sem segmento"}
                {lead.city ? ` • ${lead.city}` : ""}
              </span>
            </div>
            <span className={styles.statusBadge} data-status={draft.status}>{statusLabel(draft.status)}</span>
          </div>
          <span className={styles.returnBadge} data-tone={meta.tone}>{meta.label}</span>
          <div className={styles.leadSummaryPanel}>
            <span className={styles.summaryLabel}>Próxima ação</span>
            <strong>{draft.nextAction || lead.nextAction || "Definir próxima ação"}</strong>
            <p>{draft.shortNote || lead.shortNote || "Sem observação curta registrada."}</p>
          </div>
          <div className={styles.leadChipRow}>
            {chips.slice(0, 3).map((chip) => <span key={`${lead.id}-${chip}`} className={styles.memoryChip}>{chip}</span>)}
          </div>
        </button>
        <div className={styles.leadActionRow}>
          <button type="button" className={styles.ghostAction} onClick={() => focusLead(lead.id)}>Abrir</button>
          {lead.quickActions.includes("hoje") ? <button type="button" className={styles.ghostAction} onClick={() => void runQuickAction(lead, "hoje")} disabled={savingLeadId === lead.id}>Hoje</button> : null}
          {lead.quickActions.includes("amanha") ? <button type="button" className={styles.ghostAction} onClick={() => void runQuickAction(lead, "amanha")} disabled={savingLeadId === lead.id}>Amanhã</button> : null}
          {lead.quickActions.includes("encerrar") ? <button type="button" className={styles.ghostAction} onClick={() => void runQuickAction(lead, "encerrar")} disabled={savingLeadId === lead.id}>Encerrar</button> : null}
          {lead.quickActions.includes("reabrir") ? <button type="button" className={styles.ghostAction} onClick={() => void runQuickAction(lead, "reabrir")} disabled={savingLeadId === lead.id}>Reabrir</button> : null}
        </div>
      </article>
    );
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
        <div className={styles.detailRail}>
          <span>Fluxo UX: {selectedFilter?.title || "Hoje"} → cliente selecionado → operação detalhada</span>
          <span className={styles.miniPill}>Etapa 3 de 3</span>
        </div>

        <div className={styles.detailHero}>
          <div>
            <span className={styles.panelEyebrow}>Cliente selecionado</span>
            <h2 className={styles.detailTitle}>{selectedLeadDraft.name || selectedLead.name || "Lead sem nome"}</h2>
            <p className={styles.detailText}>
              {selectedLead.segment || "Sem segmento"}
              {selectedLead.city ? ` • ${selectedLead.city}` : ""}
              {selectedLead.primarySource ? ` • ${sourceLabel(selectedLead.primarySource)}` : ""}
            </p>
          </div>
          <div className={styles.detailBadgeColumn}>
            <span className={styles.statusBadge} data-status={selectedLeadDraft.status}>{statusLabel(selectedLeadDraft.status)}</span>
            <span className={styles.returnBadge} data-tone={meta.tone}>{meta.label}</span>
          </div>
        </div>

        <div className={styles.detailLayout}>
          <div className={styles.detailColumn}>
            <section className={styles.detailSection}>
              <div className={styles.sectionTopline}>
                <div><span className={styles.panelEyebrow}>Resumo</span><strong>Leitura rápida</strong></div>
                <span className={styles.miniPill}>{BLOCK_LABELS[selectedLeadBlock]}</span>
              </div>
              <div className={styles.detailMetrics}>
                <article className={styles.detailMetric}><span>Tentativas</span><strong>{selectedLead.attemptCount || 0}</strong></article>
                <article className={styles.detailMetric}><span>Reaparições</span><strong>{selectedLead.timesSeen || 1}x</strong></article>
                <article className={styles.detailMetric}><span>Último contato</span><strong>{formatShortDate(selectedLead.lastContactAt)}</strong></article>
                <article className={styles.detailMetric}><span>Atualizado</span><strong>{formatShortDate(selectedLead.updatedAt)}</strong></article>
              </div>
            </section>

            <section className={styles.detailSection}>
              <div className={styles.sectionTopline}>
                <div><span className={styles.panelEyebrow}>Ações</span><strong>Operação do cliente</strong></div>
              </div>
              <div className={styles.detailActions}>
                <a className={styles.primaryAction} href={whatsappUrl || undefined} target={whatsappUrl ? "_blank" : undefined} rel={whatsappUrl ? "noreferrer" : undefined} aria-disabled={!whatsappUrl}>WhatsApp</a>
                <a className={styles.secondaryAction} href={callUrl || undefined} aria-disabled={!callUrl}>Ligar</a>
                {selectedLead.quickActions.includes("hoje") ? <button type="button" className={styles.secondaryAction} onClick={() => void runQuickAction(selectedLead, "hoje")} disabled={savingLeadId === selectedLead.id}>Hoje</button> : null}
                {selectedLead.quickActions.includes("amanha") ? <button type="button" className={styles.secondaryAction} onClick={() => void runQuickAction(selectedLead, "amanha")} disabled={savingLeadId === selectedLead.id}>Amanhã</button> : null}
                {selectedLead.quickActions.includes("encerrar") ? <button type="button" className={styles.secondaryAction} onClick={() => void runQuickAction(selectedLead, "encerrar")} disabled={savingLeadId === selectedLead.id}>Encerrar</button> : null}
                {selectedLead.quickActions.includes("reabrir") ? <button type="button" className={styles.secondaryAction} onClick={() => void runQuickAction(selectedLead, "reabrir")} disabled={savingLeadId === selectedLead.id}>Reabrir</button> : null}
              </div>
            </section>

            <section className={styles.detailSection}>
              <div className={styles.sectionTopline}>
                <div><span className={styles.panelEyebrow}>Operação</span><strong>Editar sem sair da tela</strong></div>
              </div>
              <div className={styles.fieldGrid}>
                <label className={styles.field}><span className={styles.fieldLabel}>Nome</span><input className={styles.fieldInput} value={selectedLeadDraft.name} onChange={(event) => setLeadDraft(selectedLead.id, { name: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>Telefone</span><input className={styles.fieldInput} value={selectedLeadDraft.phone} onChange={(event) => setLeadDraft(selectedLead.id, { phone: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>E-mail</span><input className={styles.fieldInput} value={selectedLeadDraft.email} onChange={(event) => setLeadDraft(selectedLead.id, { email: event.target.value })} /></label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Status</span>
                  <select className={styles.fieldInput} value={selectedLeadDraft.status} onChange={(event) => setLeadDraft(selectedLead.id, { status: event.target.value as LeadStatus })}>
                    {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className={styles.fieldWide}><span className={styles.fieldLabel}>Próxima ação</span><input className={styles.fieldInput} value={selectedLeadDraft.nextAction} onChange={(event) => setLeadDraft(selectedLead.id, { nextAction: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>Retorno</span><input className={styles.fieldInput} type="datetime-local" value={selectedLeadDraft.returnAt} onChange={(event) => setLeadDraft(selectedLead.id, { returnAt: event.target.value })} /></label>
                <label className={styles.fieldWide}><span className={styles.fieldLabel}>Observação curta</span><textarea className={styles.fieldTextarea} rows={4} value={selectedLeadDraft.shortNote} onChange={(event) => setLeadDraft(selectedLead.id, { shortNote: event.target.value })} /></label>
              </div>
              <div className={styles.detailFooterActions}>
                <button type="button" className={styles.primaryAction} onClick={() => void saveLead(selectedLead.id)} disabled={savingLeadId === selectedLead.id}>
                  {savingLeadId === selectedLead.id ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </section>

            {sharedProfile ? (
              <section className={styles.detailSection}>
                <div className={styles.sectionTopline}>
                  <div><span className={styles.panelEyebrow}>Contexto</span><strong>Memória compartilhada</strong></div>
                  <span className={styles.miniPill}>{contextLabel(sharedProfile.currentContext)}</span>
                </div>
                <div className={styles.sharedGrid}>
                  <article className={styles.sharedCard}><span>Nome base</span><strong>{sharedProfile.displayName || selectedLeadDraft.name || selectedLead.name || "-"}</strong></article>
                  <article className={styles.sharedCard}><span>Telefone</span><strong>{sharedProfile.phone || selectedLeadDraft.phone || selectedLead.phone || "-"}</strong></article>
                  <article className={styles.sharedCard}><span>Origem</span><strong>{sharedProfile.origin || sourceLabel(selectedLead.primarySource || selectedLead.sourceType)}</strong></article>
                  <article className={styles.sharedCard}><span>Último contato</span><strong>{formatDateTime(sharedLastContact)}</strong></article>
                </div>
                <div className={styles.sharedPresenceRow}>
                  {sharedProfile.presence?.atendimento?.present ? <span className={styles.memoryChip}>Também em Atendimento</span> : null}
                  {sharedProfile.presence?.recovery?.present ? <span className={styles.memoryChip}>Também em Recovery</span> : null}
                  {sharedProfile.presence?.vendas?.present ? <span className={styles.memoryChip}>Presente em Vendas</span> : null}
                </div>
              </section>
            ) : null}
          </div>

          <section className={styles.timelineSection}>
            <div className={styles.sectionTopline}>
              <div><span className={styles.panelEyebrow}>Timeline</span><strong>O que aconteceu aqui dentro</strong></div>
              <span className={styles.miniPill}>{(selectedLead.timeline || []).length} evento(s)</span>
            </div>
            {(selectedLead.timeline || []).length ? (
              <div className={styles.timelineList}>
                {(selectedLead.timeline || []).map((event) => (
                  <article key={event.id} className={styles.timelineItem} data-tone={timelineTone(event.eventType)}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineBody}>
                      <div className={styles.timelineTopline}><strong>{event.title}</strong><span>{event.createdAt ? formatDateTime(event.createdAt) : "Agora"}</span></div>
                      <p>{event.description || "Movimento comercial registrado."}</p>
                      <span className={styles.timelineMeta}>{timelineMeta(event)}</span>
                    </div>
                  </article>
                ))}
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
          </div>
          <div className={styles.toolbar}>
            <button type="button" className={styles.secondaryAction} onClick={() => setComposerOpen(true)}>Novo lead</button>
            <button type="button" className={styles.secondaryAction} onClick={() => setCommandOpen(true)}>Buscar</button>
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
        ? "E-mail inválido no cadastro manual."
        : error || feedback;
    headerActions = (
      <div className={styles.headerNotice} data-tone={error ? "error" : "success"}>
        {compactMessage}
      </div>
    );
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Vendas" description="Carregando sessão do CRM comercial.">
        <section className={styles.loadingCard}><div className={styles.skeletonHero} /><div className={styles.skeletonBoard} /></section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Vendas" actions={headerActions}>
      <div className={styles.page}>
        <section className={styles.filterRail}>
          <div className={styles.filterRailHeader}>
            <div><span className={styles.panelEyebrow}>Filtro por datas</span><strong>Agenda comercial</strong></div>
          </div>
          <div className={styles.filterRailScroller}>
            {dateFilters.map((item) => (
              <button key={item.key} type="button" className={styles.dateFilterCard} data-active={selectedDateKey === item.key ? "true" : "false"} data-tone={item.blockKey} onClick={() => setSelectedDateKey(item.key)}>
                <span className={styles.dateFilterDay}>{item.dayLabel}</span>
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
                <b>{item.count}</b>
              </button>
            ))}
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
          <section className={styles.archiveSection}>
            <div className={styles.sectionTopline}>
              <div><span className={styles.panelEyebrow}>Arquivo</span><strong>Encerrados</strong></div>
              <button type="button" className={styles.secondaryAction} onClick={() => setShowClosed(false)}>Ocultar arquivo</button>
            </div>
            {closedLeads.length ? <div className={styles.cardsGrid}>{closedLeads.map((lead) => renderLeadCard(lead, "closed"))}</div> : <div className={styles.emptyPanel}><strong>Nenhum encerrado ainda</strong><p>Os cards arquivados aparecem aqui.</p></div>}
          </section>
        ) : null}
      </div>

      {composerOpen ? (
        <div className="ui-popup-backdrop" onClick={() => setComposerOpen(false)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.sectionTopline}>
              <div><span className={styles.panelEyebrow}>Novo lead manual</span><strong>Cadastro rápido</strong></div>
              <button type="button" className={styles.secondaryAction} onClick={() => setComposerOpen(false)}>Fechar</button>
            </div>
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
      ) : null}

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
