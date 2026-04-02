"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type LeadStatus = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
type LeadBlockKey = "today" | "overdue" | "scheduled" | "closed";
type ViewMode = "kanban" | "list" | "agenda" | "timeline";
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

type LeadItem = {
  id: string;
  customerProfileId?: string | null;
  sourceType: "manual" | "webscraping";
  primarySource?: string | null;
  sourceHistoryId?: string | null;
  sourceSignature?: string | null;
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
  signals?: {
    alreadyExisted: boolean;
    cameFromWebscraping: boolean;
    hadPreviousContact: boolean;
    wasClosedBefore: boolean;
  };
  timeline?: LeadTimelineEvent[];
  quickActions: string[];
};

type BoardResponse = {
  summary: {
    total: number;
    today: number;
    overdue: number;
    scheduled: number;
    closed: number;
  };
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

type StatusColumnDefinition = {
  value: LeadStatus;
  label: string;
  hint: string;
  dropOnly?: boolean;
};

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "novo", label: "Novo lead" },
  { value: "contato", label: "Em contato" },
  { value: "retorno", label: "Retorno" },
  { value: "qualificado", label: "Qualificado" },
  { value: "encerrado", label: "Encerrado" },
];

const STATUS_COLUMNS: StatusColumnDefinition[] = [
  { value: "novo", label: "Novo lead", hint: "Entradas cruas para começar a trabalhar." },
  { value: "contato", label: "Em contato", hint: "Leads já em movimento comercial." },
  { value: "retorno", label: "Retorno", hint: "Cards que dependem de retomada." },
  { value: "qualificado", label: "Qualificado", hint: "Oportunidades que merecem foco forte." },
  { value: "encerrado", label: "Encerrar", hint: "Jogue aqui para tirar da agenda ativa.", dropOnly: true },
];

const BLOCKS: Array<{
  key: LeadBlockKey;
  title: string;
  description: string;
  accent: string;
}> = [
  {
    key: "overdue",
    title: "Atrasados",
    description: "Leads que passaram do horário e precisam voltar para o topo da operação.",
    accent: "critico",
  },
  {
    key: "today",
    title: "Agenda do dia",
    description: "O coração da rotina comercial de hoje, com prioridade para próxima ação e resposta rápida.",
    accent: "hoje",
  },
  {
    key: "scheduled",
    title: "Retornos agendados",
    description: "Movimentos futuros já posicionados para não sumirem da agenda viva.",
    accent: "futuro",
  },
  {
    key: "closed",
    title: "Encerrados",
    description: "Cards preservados para contexto e reabertura, fora da agenda ativa principal.",
    accent: "arquivo",
  },
];

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string; hint: string }> = [
  { value: "kanban", label: "Cards", hint: "Pipeline visual e arraste rápido." },
  { value: "list", label: "Lista", hint: "Leitura compacta para bater o olho." },
  { value: "agenda", label: "Agenda", hint: "Hoje, atrasados e próximos retornos." },
  { value: "timeline", label: "Timeline", hint: "Memória comercial cronológica." },
];

function formatDateTime(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function toDatetimeLocal(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
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
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
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
    ? `Olá, ${leadName}. Estou retomando nosso contato pelo HBX.`
    : "Olá. Estou retomando nosso contato pelo HBX.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

function webscrapingSourceLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "webscraping") return "Webscraping";
  if (normalized === "manual") return "Manual";
  return normalized || "Sem origem";
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
  for (const block of BLOCKS) {
    for (const lead of board.blocks[block.key] || []) {
      next[lead.id] = createDraft(lead);
    }
  }
  return next;
}

function getReturnMeta(lead: LeadItem, draft: LeadDraft, block: LeadBlockKey) {
  const effectiveReturnAt = draft.returnAt ? new Date(draft.returnAt).toISOString() : lead.returnAt || null;
  if (!effectiveReturnAt) {
    return { label: "Sem retorno definido", tone: "neutral" } as const;
  }

  if (block === "overdue") {
    return { label: `Atrasado desde ${formatDateTime(effectiveReturnAt)}`, tone: "overdue" } as const;
  }
  if (block === "today") {
    return { label: `Hoje • ${formatDateTime(effectiveReturnAt)}`, tone: "today" } as const;
  }
  if (block === "scheduled") {
    return { label: `Agendado • ${formatDateTime(effectiveReturnAt)}`, tone: "scheduled" } as const;
  }

  return { label: `Encerrado • ${formatShortDate(effectiveReturnAt)}`, tone: "closed" } as const;
}

function getLeadIntensity(block: LeadBlockKey, sourceType: LeadItem["sourceType"]) {
  if (block === "overdue") return "overdue";
  if (block === "today") return sourceType === "webscraping" ? "webscraping" : "today";
  if (block === "scheduled") return "scheduled";
  return "closed";
}

function getTimelineEventTone(eventType?: LeadTimelineEventType) {
  if (eventType === "lead_closed") return "closed";
  if (eventType === "return_scheduled") return "scheduled";
  if (eventType === "contact_made" || eventType === "result_recorded") return "contact";
  if (eventType === "origin_registered") return "origin";
  if (eventType === "lead_reused") return "existing";
  return "neutral";
}

function getTimelineEventMeta(event: LeadTimelineEvent) {
  if (event.eventType === "origin_registered") {
    return event.sourceType === "webscraping" ? "Origem webscraping" : "Origem manual";
  }
  if (event.eventType === "status_changed" && event.statusTo) {
    return `Status ${event.statusTo}`;
  }
  if (event.eventType === "result_recorded" && event.resultLabel) {
    return event.resultLabel;
  }
  if (event.eventType === "return_scheduled" && event.returnAt) {
    return formatDateTime(event.returnAt);
  }
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
  const [expandedLeadIds, setExpandedLeadIds] = useState<Record<string, boolean>>({});
  const [showClosed, setShowClosed] = useState(false);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [actionMenuLeadId, setActionMenuLeadId] = useState<string | null>(null);
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
    const timer = window.setTimeout(() => setFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setActionMenuLeadId(null);
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  const totalActive = useMemo(() => {
    if (!board) return 0;
    return board.summary.today + board.summary.overdue + board.summary.scheduled;
  }, [board]);

  const leadById = useMemo(() => {
    const map = new Map<string, { lead: LeadItem; block: LeadBlockKey }>();
    if (!board) return map;
    for (const block of BLOCKS) {
      for (const lead of board.blocks[block.key] || []) {
        map.set(lead.id, { lead, block: block.key });
      }
    }
    return map;
  }, [board]);

  const allLeads = useMemo(() => {
    const items: Array<{ lead: LeadItem; block: LeadBlockKey }> = [];
    if (!board) return items;
    for (const block of BLOCKS) {
      for (const lead of board.blocks[block.key] || []) {
        items.push({ lead, block: block.key });
      }
    }
    const orderWeight: Record<LeadBlockKey, number> = {
      overdue: 0,
      today: 1,
      scheduled: 2,
      closed: 3,
    };
    return items.sort((left, right) => {
      const blockDiff = orderWeight[left.block] - orderWeight[right.block];
      if (blockDiff !== 0) return blockDiff;
      return new Date(right.lead.updatedAt || 0).getTime() - new Date(left.lead.updatedAt || 0).getTime();
    });
  }, [board]);

  const timelineFeed = useMemo(() => {
    return allLeads
      .flatMap(({ lead, block }) =>
        (lead.timeline || []).map((event) => ({
          event,
          lead,
          block,
        })),
      )
      .sort(
        (left, right) =>
          new Date(right.event.createdAt || 0).getTime() - new Date(left.event.createdAt || 0).getTime(),
      );
  }, [allLeads]);

  const commandResults = useMemo(() => {
    const normalized = commandQuery.trim().toLowerCase();
    const items = allLeads.slice(0, 18);
    if (!normalized) return items;
    return items.filter(({ lead, block }) =>
      [
        lead.name,
        lead.phone,
        lead.email,
        lead.city,
        lead.segment,
        lead.nextAction,
        lead.shortNote,
        lead.lastResult,
        lead.primarySource,
        block,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [allLeads, commandQuery]);

  const focusMetrics = useMemo(
    () => [
      {
        title: "Atrasados",
        value: board?.summary.overdue ?? 0,
        description: "Voltam para o topo e não podem ficar escondidos.",
        tone: "critical",
      },
      {
        title: "Agenda do dia",
        value: board?.summary.today ?? 0,
        description: "O que precisa andar agora para gerar conversa real.",
        tone: "active",
      },
      {
        title: "Retornos futuros",
        value: board?.summary.scheduled ?? 0,
        description: "Fila organizada sem poluir a agenda ativa.",
        tone: "future",
      },
      {
        title: "Encerrados",
        value: board?.summary.closed ?? 0,
        description: "Ficam guardados fora do foco principal.",
        tone: "neutral",
      },
    ],
    [board?.summary.closed, board?.summary.overdue, board?.summary.scheduled, board?.summary.today],
  );

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
      setFeedback(
        payload.action === "updated"
          ? "Lead manual já existente foi atualizado no CRM."
          : "Lead manual criado no CRM de Vendas.",
      );
      setManualLead({
        name: "",
        phone: "",
        email: "",
        nextAction: "Primeiro contato",
        returnAt: plusDaysDatetimeLocal(0),
        shortNote: "",
      });
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
        ...(prev[leadId] || {
          name: "",
          phone: "",
          email: "",
          status: "novo" as LeadStatus,
          nextAction: "",
          returnAt: "",
          shortNote: "",
        }),
        ...patch,
      },
    }));
  }

  function toggleLeadEditor(leadId: string) {
    setExpandedLeadIds((prev) => ({
      ...prev,
      [leadId]: !prev[leadId],
    }));
  }

  async function saveLead(leadId: string, patch?: Partial<LeadDraft>, successMessage?: string) {
    const draft = {
      ...(drafts[leadId] || {
        name: "",
        phone: "",
        email: "",
        status: "novo" as LeadStatus,
        nextAction: "",
        returnAt: "",
        shortNote: "",
      }),
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
      setFeedback(successMessage || "Card de Vendas atualizado.");
      await loadBoard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao atualizar o lead.");
    } finally {
      setSavingLeadId(null);
    }
  }

  async function runQuickAction(lead: LeadItem, action: string) {
    setActionMenuLeadId(null);
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
      await saveLead(lead.id, {
        status: "encerrado",
        nextAction: "Lead encerrado",
        returnAt: "",
      });
      return;
    }

    if (action === "reabrir") {
      await saveLead(lead.id, {
        status: "retorno",
        nextAction: "Retomar lead",
        returnAt: plusDaysDatetimeLocal(1),
      });
    }
  }

  function focusLead(leadId: string) {
    setExpandedLeadIds((prev) => ({
      ...prev,
      [leadId]: true,
    }));
    setCommandOpen(false);
    setActionMenuLeadId(null);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-lead-id="${leadId}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  }

  async function moveLeadToStatus(leadId: string, nextStatus: LeadStatus, blockKey: LeadBlockKey) {
    const current = leadById.get(leadId);
    const lead = current?.lead;
    if (!lead) return;

    const currentDraft = drafts[leadId] || createDraft(lead);
    if (currentDraft.status === nextStatus) {
      setDragOverColumnId(null);
      setDraggedLeadId(null);
      return;
    }

    const nextLabel = STATUS_OPTIONS.find((item) => item.value === nextStatus)?.label || nextStatus;
    await saveLead(
      leadId,
      {
        status: nextStatus,
        nextAction:
          nextStatus === "encerrado"
            ? currentDraft.nextAction || "Lead encerrado"
            : currentDraft.nextAction,
        returnAt:
          nextStatus === "encerrado"
            ? ""
            : currentDraft.returnAt || (blockKey === "today" ? plusDaysDatetimeLocal(0) : currentDraft.returnAt),
      },
      `Lead movido para ${nextLabel}.`,
    );
    setDragOverColumnId(null);
    setDraggedLeadId(null);
  }

  function handleCardDragStart(event: DragEvent<HTMLElement>, leadId: string) {
    setDraggedLeadId(leadId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", leadId);
  }

  function handleCardDragEnd() {
    setDraggedLeadId(null);
    setDragOverColumnId(null);
  }

  function handleColumnDragOver(event: DragEvent<HTMLElement>, columnId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverColumnId !== columnId) {
      setDragOverColumnId(columnId);
    }
  }

  function handleColumnDragLeave(columnId: string) {
    if (dragOverColumnId === columnId) {
      setDragOverColumnId(null);
    }
  }

  async function handleColumnDrop(
    event: DragEvent<HTMLElement>,
    blockKey: LeadBlockKey,
    nextStatus: LeadStatus,
  ) {
    event.preventDefault();
    const droppedLeadId = event.dataTransfer.getData("text/plain") || draggedLeadId;
    if (!droppedLeadId) {
      setDragOverColumnId(null);
      return;
    }
    await moveLeadToStatus(droppedLeadId, nextStatus, blockKey);
  }

  function renderLeadCard(lead: LeadItem, blockKey: LeadBlockKey) {
    const draft = drafts[lead.id] || createDraft(lead);
    const callUrl = buildCallUrl(draft.phone || lead.phone);
    const whatsappUrl = buildWhatsAppUrl(draft.phone || lead.phone, draft.name || lead.name);
    const sourceLabel = lead.sourceType === "webscraping" ? "Webscraping" : "Manual";
    const isExpanded = Boolean(expandedLeadIds[lead.id]);
    const returnMeta = getReturnMeta(lead, draft, blockKey);
    const hasCommercialMemory = Boolean(
      lead.customerProfileId ||
      lead.sourceHistoryId ||
      lead.sourceSignature ||
      (lead.attemptCount || 0) > 0 ||
      lead.lastContactAt,
    );
    const visualTone = getLeadIntensity(blockKey, lead.sourceType);
    const signals = lead.signals || {
      alreadyExisted: Boolean((lead.timesSeen || 0) > 1),
      cameFromWebscraping:
        lead.sourceType === "webscraping" || String(lead.primarySource || "").toLowerCase() === "webscraping",
      hadPreviousContact: Boolean((lead.attemptCount || 0) > 0 || lead.lastContactAt),
      wasClosedBefore: Boolean(lead.wasClosedBefore),
    };

    return (
      <article
        key={lead.id}
        className={styles.leadCard}
        data-lead-id={lead.id}
        data-tone={visualTone}
        data-expanded={isExpanded ? "true" : "false"}
        data-dragging={draggedLeadId === lead.id ? "true" : "false"}
        draggable
        onDragStart={(event) => handleCardDragStart(event, lead.id)}
        onDragEnd={handleCardDragEnd}
      >
        <div className={styles.leadAccent} />

        <div className={styles.leadHeader}>
          <div className={styles.leadIdentity}>
            <div className={styles.leadHeadline}>
              <h2 className={styles.leadTitle}>{draft.name || lead.name || "Lead sem nome"}</h2>
              <span className={styles.sourceBadge} data-source={lead.sourceType}>
                {sourceLabel}
              </span>
            </div>
            <p className={styles.leadMeta}>
              {lead.segment ? `${lead.segment}` : "Segmento não informado"}
              {lead.city ? ` • ${lead.city}` : ""}
            </p>
          </div>

          <div className={styles.leadBadges}>
            <span className={styles.statusBadge} data-status={draft.status}>
              {lead.statusLabel}
            </span>
            <span className={styles.returnBadge} data-tone={returnMeta.tone}>
              {returnMeta.label}
            </span>
            <div className={styles.cardMenuWrap}>
              <button
                type="button"
                className={styles.cardMenuButton}
                onClick={() =>
                  setActionMenuLeadId((current) => (current === lead.id ? null : lead.id))
                }
              >
                Ações
              </button>
              {actionMenuLeadId === lead.id ? (
                <div className={styles.cardMenu}>
                  <button type="button" onClick={() => focusLead(lead.id)}>
                    Abrir detalhe
                  </button>
                  <button type="button" onClick={() => void runQuickAction(lead, "hoje")}>
                    Jogar para hoje
                  </button>
                  <button type="button" onClick={() => void runQuickAction(lead, "amanha")}>
                    Agendar amanhã
                  </button>
                  {lead.quickActions.includes("encerrar") ? (
                    <button type="button" onClick={() => void runQuickAction(lead, "encerrar")}>
                      Encerrar
                    </button>
                  ) : null}
                  {lead.quickActions.includes("reabrir") ? (
                    <button type="button" onClick={() => void runQuickAction(lead, "reabrir")}>
                      Reabrir
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.quickSummaryGrid}>
          <div className={styles.summaryBox} data-type="next">
            <span className={styles.summaryLabel}>Próxima ação</span>
            <strong className={styles.summaryValue}>
              {draft.nextAction || lead.nextAction || "Definir próxima ação"}
            </strong>
          </div>
          <div className={styles.summaryBox} data-type="note">
            <span className={styles.summaryLabel}>Observação curta</span>
            <strong className={styles.summaryValue}>
              {draft.shortNote || lead.shortNote || "Sem observação ainda"}
            </strong>
          </div>
        </div>

        <div className={styles.memoryRail}>
          {signals.alreadyExisted ? (
            <span className={styles.memoryChip} data-tone="existing">
              Lead já conhecido
            </span>
          ) : null}
          {signals.cameFromWebscraping ? (
            <span className={styles.memoryChip} data-tone="webscraping">
              Veio de webscraping
            </span>
          ) : null}
          {signals.hadPreviousContact ? (
            <span className={styles.memoryChip} data-tone="contact">
              Já teve contato
            </span>
          ) : null}
          {signals.wasClosedBefore ? (
            <span className={styles.memoryChip} data-tone="closed-before">
              Já foi encerrado antes
            </span>
          ) : null}
          {draft.phone || lead.phone ? (
            <span className={styles.memoryChip}>Telefone {draft.phone || lead.phone}</span>
          ) : null}
          {draft.email || lead.email ? (
            <span className={styles.memoryChip}>E-mail {draft.email || lead.email}</span>
          ) : null}
          {lead.attemptCount ? (
            <span className={styles.memoryChip}>Tentativas {lead.attemptCount}</span>
          ) : null}
          {lead.lastResult ? (
            <span className={styles.memoryChip}>Último resultado {lead.lastResult}</span>
          ) : null}
          {lead.lastContactAt ? (
            <span className={styles.memoryChip}>Último contato {formatDateTime(lead.lastContactAt)}</span>
          ) : null}
          {lead.primarySource ? (
            <span className={styles.memoryChip}>Origem principal {lead.primarySource}</span>
          ) : null}
          {lead.timesSeen && lead.timesSeen > 1 ? (
            <span className={styles.memoryChip}>Reapareceu {lead.timesSeen}x</span>
          ) : null}
          {hasCommercialMemory ? (
            <span className={styles.memoryChip} data-tone="ready">
              Memória comercial pronta
            </span>
          ) : (
            <span className={styles.memoryChip}>Memória comercial em preparação</span>
          )}
          {lead.sourceHistoryId ? (
            <span className={styles.memoryChip}>Histórico vinculado</span>
          ) : null}
        </div>

        <div className={styles.cardActions}>
          <a className="btn btn-primary" href={callUrl || undefined}>
            Ligar
          </a>
          <a className="btn btn-secondary" href={whatsappUrl || undefined} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          {lead.quickActions.includes("hoje") ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runQuickAction(lead, "hoje")}
              disabled={savingLeadId === lead.id}
            >
              Jogar para hoje
            </button>
          ) : null}
          {lead.quickActions.includes("amanha") ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runQuickAction(lead, "amanha")}
              disabled={savingLeadId === lead.id}
            >
              Amanhã cedo
            </button>
          ) : null}
          {lead.quickActions.includes("encerrar") ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runQuickAction(lead, "encerrar")}
              disabled={savingLeadId === lead.id}
            >
              Encerrar
            </button>
          ) : null}
          {lead.quickActions.includes("reabrir") ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runQuickAction(lead, "reabrir")}
              disabled={savingLeadId === lead.id}
            >
              Reabrir
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => toggleLeadEditor(lead.id)}
          >
            {isExpanded ? "Fechar edição" : "Editar rápido"}
          </button>
        </div>

        {isExpanded ? (
          <div className={styles.quickEditor}>
            <div className={styles.editorHeader}>
              <strong>Edição rápida</strong>
              <span className={styles.mutedPill}>Atualizado em {formatDateTime(lead.updatedAt)}</span>
            </div>

            <div className={styles.expandedGrid}>
              <section className={styles.timelinePanel}>
                <div className={styles.timelineHeader}>
                  <strong>Timeline comercial</strong>
                  <span className={styles.metaPill}>
                    {(lead.timeline || []).length} evento(s)
                  </span>
                </div>

                {(lead.timeline || []).length ? (
                  <div className={styles.timelineList}>
                    {(lead.timeline || []).map((event) => (
                      <article
                        key={event.id}
                        className={styles.timelineItem}
                        data-tone={getTimelineEventTone(event.eventType)}
                      >
                        <div className={styles.timelineDot} />
                        <div className={styles.timelineBody}>
                          <div className={styles.timelineTopline}>
                            <strong className={styles.timelineTitle}>{event.title}</strong>
                            <span className={styles.timelineMeta}>{getTimelineEventMeta(event)}</span>
                          </div>
                          <p className={styles.timelineText}>
                            {event.description || "Movimento comercial registrado neste lead."}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.timelineEmpty}>
                    <strong>Timeline em preparação</strong>
                    <p className={styles.emptyText}>
                      Os próximos movimentos deste lead vão aparecer aqui para dar contexto sem virar CRM pesado.
                    </p>
                  </div>
                )}
              </section>

              <div className={styles.editorPanel}>
                <div className={styles.cardGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Status</span>
                    <select
                      className={styles.fieldSelect}
                      value={draft.status}
                      onChange={(event) =>
                        setLeadDraft(lead.id, { status: event.target.value as LeadStatus })
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Telefone</span>
                    <input
                      className={styles.fieldInput}
                      value={draft.phone}
                      onChange={(event) => setLeadDraft(lead.id, { phone: event.target.value })}
                      placeholder="Telefone"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>E-mail</span>
                    <input
                      className={styles.fieldInput}
                      value={draft.email}
                      onChange={(event) => setLeadDraft(lead.id, { email: event.target.value })}
                      placeholder="Opcional"
                    />
                  </label>

                  <label className={styles.fieldWide}>
                    <span className={styles.fieldLabel}>Próxima ação</span>
                    <input
                      className={styles.fieldInput}
                      value={draft.nextAction}
                      onChange={(event) => setLeadDraft(lead.id, { nextAction: event.target.value })}
                      placeholder="Ex: ligação de diagnóstico"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Retorno agendado</span>
                    <input
                      className={styles.fieldInput}
                      type="datetime-local"
                      value={draft.returnAt}
                      onChange={(event) => setLeadDraft(lead.id, { returnAt: event.target.value })}
                    />
                  </label>

                  <label className={styles.fieldWide}>
                    <span className={styles.fieldLabel}>Observação curta</span>
                    <textarea
                      className={styles.fieldTextarea}
                      rows={3}
                      value={draft.shortNote}
                      onChange={(event) => setLeadDraft(lead.id, { shortNote: event.target.value })}
                      placeholder="Contexto operacional curto"
                    />
                  </label>
                </div>

                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void saveLead(lead.id)}
                    disabled={savingLeadId === lead.id}
                  >
                    {savingLeadId === lead.id ? "Salvando..." : "Salvar card"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </article>
    );
  }

  function renderListView() {
    if (!allLeads.length) {
      return (
        <section className={styles.blockCard}>
          <div className={styles.emptyState}>
            <strong>Nenhum lead disponível</strong>
            <p className={styles.emptyText}>Quando o CRM receber movimentos, a lista vai resumir o que está quente, atrasado e pendente.</p>
          </div>
        </section>
      );
    }

    return (
      <section className={styles.blockCard}>
        <div className={styles.sectionHeader}>
          <div>
            <strong>Lista operacional</strong>
            <p className={styles.helperText}>Leitura enxuta para bater o olho e abrir só o que importa.</p>
          </div>
          <span className={styles.metaPill}>{allLeads.length} lead(s)</span>
        </div>
        <div className={styles.listView}>
          {allLeads.map(({ lead, block }) => (
            <button
              key={`list-${lead.id}`}
              type="button"
              className={styles.listRow}
              onClick={() => focusLead(lead.id)}
            >
              <div className={styles.listMain}>
                <strong>{lead.name || "Lead sem nome"}</strong>
                <span>{lead.city || "Cidade não informada"} • {lead.segment || "Sem segmento"}</span>
              </div>
              <span className={styles.memoryChip}>{lead.statusLabel}</span>
              <span className={styles.memoryChip}>{lead.nextAction || "Sem próxima ação"}</span>
              <span className={styles.memoryChip}>{getReturnMeta(lead, drafts[lead.id] || createDraft(lead), block).label}</span>
              <span className={styles.memoryChip}>{webscrapingSourceLabel(lead.primarySource || lead.sourceType)}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderAgendaView() {
    return (
      <section className={styles.blockCard}>
        <div className={styles.sectionHeader}>
          <div>
            <strong>Agenda viva</strong>
            <p className={styles.helperText}>Blocos operacionais para saber quem precisa de ação agora, depois e o que já saiu do radar ativo.</p>
          </div>
        </div>
        <div className={styles.agendaView}>
          {BLOCKS.map((block) => {
            const leads = board?.blocks[block.key] || [];
            if (block.key === "closed" && !showClosed) return null;
            return (
              <article key={`agenda-${block.key}`} className={styles.agendaColumn} data-block={block.key}>
                <div className={styles.agendaColumnHeader}>
                  <strong>{block.title}</strong>
                  <span className={styles.metaPill}>{leads.length}</span>
                </div>
                {leads.length ? (
                  <div className={styles.agendaList}>
                    {leads.map((lead) => (
                      <button
                        key={`agenda-row-${lead.id}`}
                        type="button"
                        className={styles.agendaRow}
                        onClick={() => focusLead(lead.id)}
                      >
                        <div>
                          <strong>{lead.name || "Lead sem nome"}</strong>
                          <span>{lead.nextAction || "Sem próxima ação"}</span>
                        </div>
                        <span>{formatDateTime(lead.returnAt || lead.updatedAt)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <strong>Sem cards neste bloco</strong>
                    <p className={styles.emptyText}>A agenda vai preencher esse grupo automaticamente quando a operação gerar movimento.</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderTimelineView() {
    return (
      <section className={styles.blockCard}>
        <div className={styles.sectionHeader}>
          <div>
            <strong>Timeline da operação</strong>
            <p className={styles.helperText}>Visão cronológica para entender o que aconteceu sem abrir cada card manualmente.</p>
          </div>
          <span className={styles.metaPill}>{timelineFeed.length} evento(s)</span>
        </div>
        {timelineFeed.length ? (
          <div className={styles.feedList}>
            {timelineFeed.map(({ event, lead, block }) => (
              <article key={`feed-${event.id}`} className={styles.feedItem}>
                <div className={styles.feedDot} data-tone={getTimelineEventTone(event.eventType)} />
                <div className={styles.feedBody}>
                  <div className={styles.feedTopline}>
                    <strong>{lead.name || "Lead sem nome"}</strong>
                    <span>{formatDateTime(event.createdAt)}</span>
                  </div>
                  <p className={styles.feedTitle}>{event.title}</p>
                  <p className={styles.feedText}>
                    {event.description || "Movimento comercial registrado."}
                  </p>
                  <div className={styles.memoryRail}>
                    <span className={styles.memoryChip}>{lead.statusLabel}</span>
                    <span className={styles.memoryChip}>{BLOCKS.find((item) => item.key === block)?.title || block}</span>
                    <span className={styles.memoryChip}>{getTimelineEventMeta(event)}</span>
                    <button type="button" className={styles.commandLink} onClick={() => focusLead(lead.id)}>
                      Abrir card
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>Nenhum evento ainda</strong>
            <p className={styles.emptyText}>Quando os cards forem sendo trabalhados, a timeline geral aparece aqui para leitura rápida.</p>
          </div>
        )}
      </section>
    );
  }

  function renderKanbanView() {
    return BLOCKS.map((block) => {
      const leads = board?.blocks[block.key] || [];
      const isClosedBlock = block.key === "closed";
      const groupedByStatus = STATUS_COLUMNS.reduce<Record<LeadStatus, LeadItem[]>>(
        (accumulator, column) => {
          accumulator[column.value] = [];
          return accumulator;
        },
        {
          novo: [],
          contato: [],
          retorno: [],
          qualificado: [],
          encerrado: [],
        },
      );

      for (const lead of leads) {
        groupedByStatus[lead.status].push(lead);
      }

      if (isClosedBlock && !showClosed && leads.length === 0) {
        return null;
      }

      return (
        <section key={block.key} className={styles.blockCard} data-block={block.key} data-accent={block.accent}>
          <div className={styles.sectionHeader}>
            <div>
              <strong>{block.title}</strong>
              <p className={styles.helperText}>{block.description}</p>
            </div>
            <div className={styles.sectionActions}>
              <span className={styles.metaPill}>{leads.length} card(s)</span>
              {!isClosedBlock ? <span className={styles.mutedPill}>Arraste entre colunas para mover status</span> : null}
              {isClosedBlock ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowClosed((current) => !current)}
                >
                  {showClosed ? "Ocultar encerrados" : "Mostrar encerrados"}
                </button>
              ) : null}
            </div>
          </div>

          {isClosedBlock && !showClosed ? (
            <div className={styles.emptyState}>
              <strong>Encerrados fora do foco principal</strong>
              <p className={styles.emptyText}>Eles continuam guardados, mas não dominam a agenda ativa enquanto você está operando o dia.</p>
            </div>
          ) : leads.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>Nenhum card neste bloco</strong>
              <p className={styles.emptyText}>Assim que a rotina gerar movimentos aqui, os cards vão aparecer com destaque operacional.</p>
            </div>
          ) : !isClosedBlock ? (
            <div className={styles.statusBoard}>
              {STATUS_COLUMNS.map((column) => {
                const columnId = `${block.key}:${column.value}`;
                const columnLeads = column.dropOnly ? [] : groupedByStatus[column.value];
                const isDragTarget = dragOverColumnId === columnId;
                return (
                  <section
                    key={columnId}
                    className={styles.statusColumn}
                    data-status={column.value}
                    data-drop-only={column.dropOnly ? "true" : "false"}
                    data-dragover={isDragTarget ? "true" : "false"}
                    onDragOver={(event) => handleColumnDragOver(event, columnId)}
                    onDragLeave={() => handleColumnDragLeave(columnId)}
                    onDrop={(event) => void handleColumnDrop(event, block.key, column.value)}
                  >
                    <div className={styles.statusColumnHeader}>
                      <div>
                        <strong className={styles.statusColumnTitle}>{column.label}</strong>
                        <p className={styles.statusColumnText}>{column.hint}</p>
                      </div>
                      <span className={styles.metaPill}>{columnLeads.length}</span>
                    </div>

                    {columnLeads.length ? (
                      <div className={styles.statusColumnCards}>
                        {columnLeads.map((lead) => renderLeadCard(lead, block.key))}
                      </div>
                    ) : (
                      <div className={styles.statusDropHint}>
                        <strong>{column.dropOnly ? "Solte aqui para encerrar" : "Coluna pronta para receber"}</strong>
                        <p className={styles.emptyText}>
                          {column.dropOnly
                            ? "O card sai da agenda ativa e vai para encerrados, sem dominar o dia."
                            : "Arraste um card para reorganizar o status sem perder retorno, origem e próxima ação."}
                        </p>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className={styles.leadsGrid} data-block={block.key}>
              {leads.map((lead) => renderLeadCard(lead, block.key))}
            </div>
          )}
        </section>
      );
    });
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Vendas" description="Carregando sessão do CRM comercial.">
        <section className={styles.loadingCard}>
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLineShort} />
        </section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Vendas"
      description="CRM agenda viva para prospecção, retornos e operação comercial inicial."
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>HBX vendas</span>
            <h1 className={styles.heroTitle}>Agenda viva, retorno visível e cards prontos para operar.</h1>
            <p className={styles.heroText}>
              O módulo agora prioriza bater o olho, identificar o que está atrasado, saber a próxima ação e agir sem se perder em tela administrativa comum.
            </p>
          </div>

          <div className={styles.heroStats}>
            <div className={styles.metricCard} data-tone="primary">
              <span className={styles.metricLabel}>Agenda ativa</span>
              <strong className={styles.metricValue}>{totalActive} cards</strong>
              <small className={styles.metricHint}>Hoje, atrasados e próximos retornos no mesmo radar.</small>
            </div>
            <div className={styles.metricCard} data-tone="webscraping">
              <span className={styles.metricLabel}>Origem pronta</span>
              <strong className={styles.metricValue}>Manual + Webscraping</strong>
              <small className={styles.metricHint}>Entrada comercial preparada para memória futura.</small>
            </div>
          </div>

          <div className={styles.focusGrid}>
            {focusMetrics.map((metric) => (
              <article key={metric.title} className={styles.focusCard} data-tone={metric.tone}>
                <span className={styles.focusLabel}>{metric.title}</span>
                <strong className={styles.focusValue}>{metric.value}</strong>
                <p className={styles.focusText}>{metric.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.toolbelt}>
          <div>
            <strong>Views operacionais</strong>
            <p className={styles.helperText}>
              A mesma base de leads agora pode ser lida como cards, lista, agenda ou timeline sem refazer a estrutura.
            </p>
          </div>
          <div className={styles.viewSwitch}>
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={viewMode === option.value ? styles.viewButtonActive : styles.viewButton}
                onClick={() => setViewMode(option.value)}
                title={option.hint}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setCommandOpen(true)}>
            Abrir command palette
          </button>
        </section>

        <section className={styles.manualCard}>
          <div className={styles.sectionHeader}>
            <div>
              <strong>Entrada manual</strong>
              <p className={styles.helperText}>
                Cadastre um lead novo já com próxima ação e retorno. A ideia aqui é entrar rápido na operação, não abrir um formulário pesado.
              </p>
            </div>
            <span className={styles.statusPill}>Agenda viva pronta</span>
          </div>

          <form className={styles.formGrid} onSubmit={handleCreateManual}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Nome do lead</span>
              <input
                className={styles.fieldInput}
                value={manualLead.name}
                onChange={(event) => setManualLead((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ex: Clínica Horizonte"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Telefone</span>
              <input
                className={styles.fieldInput}
                value={manualLead.phone}
                onChange={(event) => setManualLead((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Ex: (11) 99999-0000"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>E-mail</span>
              <input
                className={styles.fieldInput}
                value={manualLead.email}
                onChange={(event) => setManualLead((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Opcional"
              />
            </label>

            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Próxima ação</span>
              <input
                className={styles.fieldInput}
                value={manualLead.nextAction}
                onChange={(event) => setManualLead((prev) => ({ ...prev, nextAction: event.target.value }))}
                placeholder="Ex: Primeira ligação com roteiro curto"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Retorno agendado</span>
              <input
                className={styles.fieldInput}
                type="datetime-local"
                value={manualLead.returnAt}
                onChange={(event) => setManualLead((prev) => ({ ...prev, returnAt: event.target.value }))}
              />
            </label>

            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Observação curta</span>
              <textarea
                className={styles.fieldTextarea}
                value={manualLead.shortNote}
                onChange={(event) => setManualLead((prev) => ({ ...prev, shortNote: event.target.value }))}
                placeholder="Contexto rápido: origem, dor percebida ou promessa do próximo contato"
                rows={3}
              />
            </label>

            <div className={styles.formActions}>
              <button type="submit" className="btn btn-primary" disabled={creatingManual}>
                {creatingManual ? "Criando..." : "Criar lead manual"}
              </button>
            </div>
          </form>
        </section>

        {error ? (
          <section className={styles.errorCard}>
            <strong className={styles.statusTitle}>Falha no CRM de Vendas</strong>
            <p className={styles.statusText}>{error}</p>
          </section>
        ) : null}

        {feedback ? (
          <section className={styles.successCard}>
            <strong className={styles.statusTitle}>Tudo certo</strong>
            <p className={styles.statusText}>{feedback}</p>
          </section>
        ) : null}

        {loading ? (
          <section className={styles.loadingCard}>
            <div className={styles.skeletonGrid}>
              <div className={styles.resultSkeleton} />
              <div className={styles.resultSkeleton} />
              <div className={styles.resultSkeleton} />
            </div>
          </section>
        ) : (
          <>
            {viewMode === "kanban" ? renderKanbanView() : null}
            {viewMode === "list" ? renderListView() : null}
            {viewMode === "agenda" ? renderAgendaView() : null}
            {viewMode === "timeline" ? renderTimelineView() : null}
          </>
        )}
      </div>

      {commandOpen ? (
        <div className="ui-popup-backdrop" onClick={() => setCommandOpen(false)}>
          <div className={styles.commandPalette} onClick={(event) => event.stopPropagation()}>
            <div className={styles.commandHeader}>
              <div>
                <strong>Command palette de Vendas</strong>
                <p className={styles.helperText}>
                  Busque lead, abra card, ligue, puxe WhatsApp ou navegue pela operação com menos atrito.
                </p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCommandOpen(false)}>
                Fechar
              </button>
            </div>
            <input
              className={styles.commandInput}
              placeholder="Buscar lead, cidade, ação, resultado ou origem..."
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              autoFocus
            />
            <div className={styles.commandList}>
              {commandResults.length ? (
                commandResults.map(({ lead, block }) => (
                  <article key={`command-${lead.id}`} className={styles.commandRow}>
                    <button type="button" className={styles.commandMain} onClick={() => focusLead(lead.id)}>
                      <strong>{lead.name || "Lead sem nome"}</strong>
                      <span>
                        {BLOCKS.find((item) => item.key === block)?.title || block} • {lead.statusLabel} • {lead.nextAction || "Sem próxima ação"}
                      </span>
                    </button>
                    <div className={styles.commandActions}>
                      <a className="btn btn-secondary btn-sm" href={buildCallUrl(lead.phone) || undefined}>
                        Ligar
                      </a>
                      <a
                        className="btn btn-secondary btn-sm"
                        href={buildWhatsAppUrl(lead.phone, lead.name) || undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    </div>
                  </article>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <strong>Nenhum resultado</strong>
                  <p className={styles.emptyText}>Tente nome, telefone, cidade, status ou próxima ação.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DashboardScaffold>
  );
}
