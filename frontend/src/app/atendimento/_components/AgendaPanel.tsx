"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChatSettingsButton } from "@/components/chat/PremiumChat";
import {
  formatAgendaPreview,
  formatWeekday,
  isHoliday,
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaGroup,
  type AtendimentoAgendaSimulationPayload,
  type AtendimentoAgendaSimulationResult,
  type AtendimentoAgendaSlot,
} from "../inbox-model";
import styles from "../page.module.css";

type AgendaPanelProps = {
  agendaConfig: AtendimentoAgendaConfig;
  loadingAgenda: boolean;
  savingAgenda: boolean;
  currentUserEmail: string;
  currentUserName: string;
  currentUserRole: string;
  canManageAgenda: boolean;
  onAddGroup: () => void;
  onMoveGroup: (groupId: string, direction: -1 | 1) => void;
  onRemoveGroup: (groupId: string) => void;
  onLinkCurrentUser: (groupId: string) => void;
  onSave: () => void;
  onUpdateGroup: (
    groupId: string,
    field:
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
      | "fallbackFutureSlotsCount",
    value: string | boolean | number | number[],
  ) => void;
  onAddSlot: (groupId: string) => void;
  onRemoveSlot: (groupId: string, slotId: string) => void;
  onUpdateSlot: (
    groupId: string,
    slotId: string,
    field: "label" | "dayOfWeek" | "startTime" | "endTime" | "enabled",
    value: string | number | boolean,
  ) => void;
  onUpdateHolidays?: (holidays: string[]) => void;
  onLoadHolidays?: () => Promise<void>;
  onUpdateInitialMessage: (
    field: keyof AtendimentoAgendaConfig["initialMessage"],
    value: string,
  ) => void;
  onUpdateFlowMessage: (
    field: keyof AtendimentoAgendaConfig["flowMessages"],
    value: string,
  ) => void;
  onSimulate: (
    payload: AtendimentoAgendaSimulationPayload,
  ) => Promise<AtendimentoAgendaSimulationResult>;
};

type WeekEvent = {
  slot: AtendimentoAgendaSlot;
  startDate: Date;
  endDate: Date;
};

type DragState = {
  slotId: string;
  durationMinutes: number;
};

type AgendaSettingsTab = "fluxo" | "guias" | "regras" | "mensagens" | "simulacao";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_OPTIONS = WEEKDAY_ORDER.map((day) => ({ value: day, label: formatWeekday(day) }));
const HOUR_LABELS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const BOARD_START_HOUR = 8;
const BOARD_END_HOUR = 19;
const SNAP_MINUTES = 30;
const MIN_SLOT_MINUTES = 30;
const BOARD_TOTAL_MINUTES = (BOARD_END_HOUR - BOARD_START_HOUR) * 60;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function minutesToTime(totalMinutes: number) {
  const safeMinutes = clamp(totalMinutes, 0, 23 * 60 + 59);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function snapMinutes(totalMinutes: number, step: number) {
  return Math.round(totalMinutes / step) * step;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = String(hex || "").trim().replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;
  const safe = expanded.length === 6 ? expanded : "4da36f";
  const red = parseInt(safe.slice(0, 2), 16);
  const green = parseInt(safe.slice(2, 4), 16);
  const blue = parseInt(safe.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function copyDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = copyDate(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toMinutes(value: string) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function toDateTime(date: Date, value: string) {
  const next = new Date(date);
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return next;
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatDayChip(date: Date) {
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortWeekdays(days: number[]) {
  return [...days].sort(
    (left, right) => WEEKDAY_ORDER.indexOf(left) - WEEKDAY_ORDER.indexOf(right),
  );
}

function clampToToday(date: Date) {
  const today = copyDate(new Date());
  return copyDate(date).getTime() < today.getTime() ? today : copyDate(date);
}

function buildMonthMatrix(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 35 }, (_, index) => addDays(start, index));
}

function isBusinessDay(date: Date, group: AtendimentoAgendaGroup | null, holidays: string[]) {
  if (!group) return false;
  const workdays = group.workdays?.length ? group.workdays : [1, 2, 3, 4, 5];
  return workdays.includes(date.getDay()) && !isHoliday(toIsoDate(date), holidays);
}

function buildVisibleBusinessDays(
  anchorDate: Date,
  group: AtendimentoAgendaGroup | null,
  holidays: string[],
) {
  if (!group) return [] as Date[];
  const cursor = clampToToday(anchorDate);
  const visibleDays: Date[] = [];
  const limit = Math.max(1, Math.min(14, Number(group.visibleBusinessDays || 7)));
  let attempts = 0;

  while (visibleDays.length < limit && attempts < 90) {
    if (isBusinessDay(cursor, group, holidays)) {
      visibleDays.push(copyDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
    attempts += 1;
  }

  return visibleDays;
}

function moveBusinessAnchor(
  anchorDate: Date,
  direction: -1 | 1,
  group: AtendimentoAgendaGroup | null,
  holidays: string[],
) {
  if (!group) return anchorDate;
  const today = copyDate(new Date());
  const cursor = clampToToday(anchorDate);
  const jump = Math.max(1, Math.min(14, Number(group.visibleBusinessDays || 7)));
  let traversed = 0;
  let attempts = 0;

  while (traversed < jump && attempts < 120) {
    cursor.setDate(cursor.getDate() + (direction > 0 ? 1 : -1));
    if (direction < 0 && cursor.getTime() < today.getTime()) {
      return today;
    }
    if (isBusinessDay(cursor, group, holidays)) {
      traversed += 1;
    }
    attempts += 1;
  }

  return clampToToday(cursor);
}

function getWeekEventKey(event: WeekEvent) {
  return `${event.slot.id}:${toIsoDate(event.startDate)}`;
}

function buildWeekEvents(group: AtendimentoAgendaGroup | null, days: Date[]) {
  if (!group) return [] as WeekEvent[];
  return days
    .flatMap((dayDate) =>
      group.slots
        .filter((slot) => slot.enabled && slot.dayOfWeek === dayDate.getDay())
        .map((slot) => ({
          slot,
          startDate: toDateTime(dayDate, slot.startTime),
          endDate: toDateTime(dayDate, slot.endTime),
        })),
    )
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
}

export default function AgendaPanel({
  agendaConfig,
  loadingAgenda,
  savingAgenda,
  currentUserEmail,
  currentUserName,
  currentUserRole,
  canManageAgenda,
  onAddGroup,
  onMoveGroup,
  onRemoveGroup,
  onLinkCurrentUser,
  onSave,
  onUpdateGroup,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
  onUpdateHolidays,
  onLoadHolidays,
  onUpdateInitialMessage,
  onUpdateFlowMessage,
  onSimulate,
}: AgendaPanelProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(agendaConfig.groups[0]?.id || null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<AgendaSettingsTab>("fluxo");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupTitle, setEditingGroupTitle] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ dayIndex: number; topPercent: number; heightPercent: number } | null>(null);
  const [simulationStage, setSimulationStage] = useState<"abrir_guia" | "confirmar_agendamento" | "cancelar_agendamento">("abrir_guia");
  const [simulationCustomerName, setSimulationCustomerName] = useState("Cliente teste");
  const [simulationReferenceDate, setSimulationReferenceDate] = useState(() => toIsoDate(new Date()));
  const [simulationHasActiveBooking, setSimulationHasActiveBooking] = useState(true);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<AtendimentoAgendaSimulationResult | null>(null);
  const boardColumnsRef = useRef<HTMLDivElement | null>(null);
  const dayColumnRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const edgeScrollFrameRef = useRef<number | null>(null);
  const edgeScrollDirectionRef = useRef<-1 | 1 | null>(null);
  const selectedGroupRef = useRef<AtendimentoAgendaGroup | null>(null);

  useEffect(() => {
    return () => {
      if (edgeScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(edgeScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!agendaConfig.groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(agendaConfig.groups[0]?.id || null);
    }
  }, [agendaConfig.groups, selectedGroupId]);

  const selectedGroup = useMemo(
    () => agendaConfig.groups.find((group) => group.id === selectedGroupId) || agendaConfig.groups[0] || null,
    [agendaConfig.groups, selectedGroupId],
  );

  useEffect(() => {
    selectedGroupRef.current = selectedGroup;
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) {
      setEditingGroupId(null);
      setSimulationResult(null);
      return;
    }
    setEditingGroupId((current) => (current && current !== selectedGroup.id ? null : current));
    setSimulationStage(
      selectedGroup.actionType === "cancelar_agendamento" ? "cancelar_agendamento" : "abrir_guia",
    );
    setSimulationResult(null);
  }, [selectedGroup]);

  function startInlineTitleEdit(group: AtendimentoAgendaGroup) {
    if (!canManageAgenda) return;
    setEditingGroupId(group.id);
    setEditingGroupTitle(group.title);
  }

  function cancelInlineTitleEdit() {
    setEditingGroupId(null);
    setEditingGroupTitle("");
  }

  function commitInlineTitleEdit(group: AtendimentoAgendaGroup) {
    const nextValue = String(editingGroupTitle || "").trim();
    if (nextValue) {
      onUpdateGroup(group.id, "title", nextValue);
      if (!String(group.buttonLabel || "").trim() || group.buttonLabel === group.title) {
        onUpdateGroup(group.id, "buttonLabel", nextValue);
      }
    }
    cancelInlineTitleEdit();
  }

  async function runSimulation() {
    if (!selectedGroup) return;
    setSimulationLoading(true);
    try {
      const result = await onSimulate({
        groupId: selectedGroup.id,
        stage:
          selectedGroup.actionType === "cancelar_agendamento"
            ? "cancelar_agendamento"
            : simulationStage,
        selectedSlotId: selectedSlot?.id,
        referenceDate: simulationReferenceDate,
        customerName: simulationCustomerName,
        hasActiveBooking: simulationHasActiveBooking,
      });
      setSimulationResult(result);
    } catch (error) {
      setSimulationResult({
        status: "warning",
        stage: selectedGroup.actionType === "cancelar_agendamento" ? "cancelar_agendamento" : simulationStage,
        groupId: selectedGroup.id,
        groupTitle: selectedGroup.title,
        actionType: selectedGroup.actionType,
        summary: error instanceof Error ? error.message : "Falha ao executar a simulacao.",
        messages: [],
        suggestedSlots: [],
        fallbackSlots: [],
      });
    } finally {
      setSimulationLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedSlotId(null);
      return;
    }
    if (!selectedGroup.slots.some((slot) => slot.id === selectedSlotId)) {
      setSelectedSlotId(selectedGroup.slots[0]?.id || null);
    }
  }, [selectedGroup, selectedSlotId]);

  const selectedSlot = useMemo(
    () => selectedGroup?.slots.find((slot) => slot.id === selectedSlotId) || selectedGroup?.slots[0] || null,
    [selectedGroup, selectedSlotId],
  );

  const monthDays = useMemo(() => buildMonthMatrix(selectedDate), [selectedDate]);
  const today = useMemo(() => copyDate(new Date()), []);
  const visibleDays = useMemo(
    () => buildVisibleBusinessDays(selectedDate, selectedGroup, agendaConfig.holidays),
    [agendaConfig.holidays, selectedDate, selectedGroup],
  );
  const weekEvents = useMemo(() => buildWeekEvents(selectedGroup, visibleDays), [selectedGroup, visibleDays]);

  useEffect(() => {
    setSettingsOpen(false);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!weekEvents.length) {
      setSelectedEventKey(null);
      return;
    }
    if (!selectedEventKey || !weekEvents.some((event) => getWeekEventKey(event) === selectedEventKey)) {
      setSelectedEventKey(getWeekEventKey(weekEvents[0]));
    }
  }, [selectedEventKey, weekEvents]);

  const selectedEvent = useMemo(() => {
    return weekEvents.find((event) => getWeekEventKey(event) === selectedEventKey) || weekEvents[0] || null;
  }, [selectedEventKey, weekEvents]);

  const timeBreakdown = useMemo(() => {
    if (!selectedGroup) return [] as Array<{ label: string; count: number }>;
    const buckets = [
      { label: "Manha", range: [0, 12] as const },
      { label: "Almoco", range: [12, 14] as const },
      { label: "Tarde", range: [14, 18] as const },
      { label: "Noite", range: [18, 24] as const },
    ];
    return buckets.map((bucket) => ({
      label: bucket.label,
      count: selectedGroup.slots.filter((slot) => {
        const hour = Number(String(slot.startTime || "00:00").slice(0, 2));
        return slot.enabled && hour >= bucket.range[0] && hour < bucket.range[1];
      }).length,
    }));
  }, [selectedGroup]);

  const accentColor = selectedGroup?.accentColor || "#4da36f";
  const roleLabel = String(currentUserRole || "").trim().toUpperCase() || "USUARIO";

  function stopEdgeScroll() {
    edgeScrollDirectionRef.current = null;
    if (edgeScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(edgeScrollFrameRef.current);
      edgeScrollFrameRef.current = null;
    }
  }

  function startEdgeScroll(direction: -1 | 1) {
    if (edgeScrollDirectionRef.current === direction && edgeScrollFrameRef.current !== null) {
      return;
    }
    stopEdgeScroll();
    edgeScrollDirectionRef.current = direction;

    const step = () => {
      const currentGroup = selectedGroupRef.current;
      if (!currentGroup) {
        stopEdgeScroll();
        return;
      }
      setSelectedDate((current) => moveBusinessAnchor(current, direction, currentGroup, agendaConfig.holidays));
      edgeScrollFrameRef.current = window.setTimeout(() => {
        edgeScrollFrameRef.current = requestAnimationFrame(step);
      }, 220) as unknown as number;
    };

    edgeScrollFrameRef.current = requestAnimationFrame(step);
  }

  function handleSlotPointerDown(event: React.PointerEvent<HTMLButtonElement>, weekEvent: WeekEvent, dayIndex: number) {
    if (!canManageAgenda || !selectedGroup) return;

    event.preventDefault();
    const durationMinutes = Math.max(MIN_SLOT_MINUTES, toMinutes(weekEvent.slot.endTime) - toMinutes(weekEvent.slot.startTime));
    setSelectedSlotId(weekEvent.slot.id);
    setSelectedEventKey(getWeekEventKey(weekEvent));
    setDragState({ slotId: weekEvent.slot.id, durationMinutes });

    const updateFromPointer = (clientX: number, clientY: number) => {
      const boardRect = boardColumnsRef.current?.getBoundingClientRect();
      if (boardRect) {
        const edgeThreshold = 56;
        if (clientX > boardRect.right - edgeThreshold) {
          startEdgeScroll(1);
        } else if (clientX < boardRect.left + edgeThreshold) {
          startEdgeScroll(-1);
        } else {
          stopEdgeScroll();
        }
      }

      let targetDayIndex = dayIndex;
      let targetElement: HTMLDivElement | null = null;
      for (const [indexKey, element] of Object.entries(dayColumnRefs.current)) {
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          targetDayIndex = Number(indexKey);
          targetElement = element;
          break;
        }
      }

      const fallbackElement = targetElement || dayColumnRefs.current[targetDayIndex] || null;
      if (!fallbackElement) return null;
      const rect = fallbackElement.getBoundingClientRect();
      const relativeY = clamp(clientY - rect.top, 0, rect.height);
      const slotHeightPercent = (durationMinutes / BOARD_TOTAL_MINUTES) * 100;
      const maxStartMinutes = BOARD_TOTAL_MINUTES - durationMinutes;
      const snappedStartMinutes = clamp(
        snapMinutes((relativeY / rect.height) * BOARD_TOTAL_MINUTES, SNAP_MINUTES),
        0,
        maxStartMinutes,
      );
      const topPercent = (snappedStartMinutes / BOARD_TOTAL_MINUTES) * 100;
      setDragPreview({ dayIndex: targetDayIndex, topPercent, heightPercent: slotHeightPercent });
      return { targetDayIndex, snappedStartMinutes };
    };

    updateFromPointer(event.clientX, event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateFromPointer(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const next = updateFromPointer(upEvent.clientX, upEvent.clientY);
      if (next && selectedGroupRef.current) {
        const targetDate = visibleDays[next.targetDayIndex];
        const nextStartMinutes = BOARD_START_HOUR * 60 + next.snappedStartMinutes;
        const nextEndMinutes = nextStartMinutes + durationMinutes;
        if (targetDate) {
          onUpdateSlot(selectedGroupRef.current.id, weekEvent.slot.id, "dayOfWeek", targetDate.getDay());
          onUpdateSlot(selectedGroupRef.current.id, weekEvent.slot.id, "startTime", minutesToTime(nextStartMinutes));
          onUpdateSlot(selectedGroupRef.current.id, weekEvent.slot.id, "endTime", minutesToTime(nextEndMinutes));
        }
      }

      setDragState(null);
      setDragPreview(null);
      stopEdgeScroll();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <section className={styles.stackSection}>
      <article className={`${styles.workspaceCard} ${styles.agendaStudioCard}`}>
        <div className={styles.sectionHead}>
          
          <div className={styles.headerActions}>
            <span className={styles.metaBadge}>{agendaConfig.groups.length} guias</span>
            <span className={canManageAgenda ? styles.routeAtendimento : styles.blockTag}>
              {canManageAgenda ? `Edicao liberada para ${roleLabel}` : `Leitura para ${roleLabel}`}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onAddGroup} disabled={!canManageAgenda}>
              Nova guia
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onSave}
              disabled={savingAgenda || loadingAgenda || !canManageAgenda}
            >
              {savingAgenda ? "Salvando..." : "Salvar agenda"}
            </button>
          </div>
        </div>

        {loadingAgenda ? (
          <div className={styles.emptyState}>Carregando agenda...</div>
        ) : !selectedGroup ? (
          <div className={styles.emptyState}>Nenhuma guia cadastrada ainda. Crie a primeira para montar a agenda.</div>
        ) : (
          <div className={styles.agendaStudioShell}>
            <aside className={styles.agendaSidebar}>
              <div className={styles.agendaSidebarCard}>
                <div className={styles.agendaMonthHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Mes de referencia</p>
                    <strong>{formatMonthTitle(selectedDate)}</strong>
                  </div>
                  <div className={styles.headerActions}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedDate(moveBusinessAnchor(selectedDate, -1, selectedGroup, agendaConfig.holidays))}
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedDate(moveBusinessAnchor(selectedDate, 1, selectedGroup, agendaConfig.holidays))}
                    >
                      Avancar
                    </button>
                  </div>
                </div>

                <div className={styles.agendaMonthWeekdays}>
                  {["S", "T", "Q", "Q", "S", "S", "D"].map((day, index) => (
                    <span key={`${day}-${index}`}>{day}</span>
                  ))}
                </div>
                <div className={styles.agendaMonthGrid}>
                  {monthDays.map((day) => {
                    const inCurrentMonth = day.getMonth() === selectedDate.getMonth();
                    const isPastDay = day.getTime() < today.getTime();
                    const active =
                      day.getDate() === selectedDate.getDate() &&
                      day.getMonth() === selectedDate.getMonth() &&
                      day.getFullYear() === selectedDate.getFullYear();
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        className={`${styles.agendaMonthDay} ${active ? styles.agendaMonthDayActive : ""}`}
                        data-outside={!inCurrentMonth}
                        data-past={isPastDay}
                        disabled={isPastDay}
                        onClick={() => setSelectedDate(clampToToday(day))}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.agendaSidebarCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Proximas janelas</p>
                    <strong>{selectedGroup.title}</strong>
                  </div>
                  <span className={styles.metaBadge}>{weekEvents.length} visiveis</span>
                </div>
                <div className={styles.agendaMiniList}>
                  {weekEvents.length === 0 ? (
                    <div className={styles.emptyState}>{selectedGroup.emptyMessage}</div>
                  ) : (
                    weekEvents.map((event) => (
                      <button
                        key={getWeekEventKey(event)}
                        type="button"
                        className={`${styles.agendaMiniItem} ${selectedEventKey === getWeekEventKey(event) ? styles.agendaMiniItemActive : ""}`}
                        onClick={() => {
                          setSelectedEventKey(getWeekEventKey(event));
                          setSelectedSlotId(event.slot.id);
                        }}
                      >
                        <strong>{event.slot.label}</strong>
                        <span>{formatDayChip(event.startDate)} · {event.slot.startTime} - {event.slot.endTime}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className={styles.agendaSidebarCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Distribuicao</p>
                    <strong>Faixas do dia</strong>
                  </div>
                </div>
                <div className={styles.agendaBreakdownList}>
                  {timeBreakdown.map((item) => (
                    <div key={item.label} className={styles.agendaBreakdownRow}>
                      <span>{item.label}</span>
                      <div>
                        <strong>{item.count}</strong>
                        <div className={styles.agendaBreakdownBar}>
                          <span style={{ width: `${Math.min(100, item.count * 24)}%`, background: accentColor }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <div className={styles.agendaMain}>
              <div className={styles.agendaTopbar}>
                <div className={styles.agendaTabs}>
                  {agendaConfig.groups.map((group, index) => (
                    <div key={group.id} className={styles.agendaTabWrap}>
                      {editingGroupId === group.id ? (
                        <div className={`${styles.agendaTabButton} ${styles.agendaTabEditor}`}>
                          <span className={styles.agendaTabAccent} style={{ background: group.accentColor }} />
                          <input
                            className={styles.agendaTabInlineInput}
                            value={editingGroupTitle}
                            autoFocus
                            onChange={(event) => setEditingGroupTitle(event.target.value)}
                            onBlur={() => commitInlineTitleEdit(group)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitInlineTitleEdit(group);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelInlineTitleEdit();
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`${styles.agendaTabButton} ${group.id === selectedGroup.id ? styles.agendaTabButtonActive : ""}`}
                          onClick={() => setSelectedGroupId(group.id)}
                          onDoubleClick={() => startInlineTitleEdit(group)}
                          style={{ borderColor: group.id === selectedGroup.id ? group.accentColor : undefined }}
                        >
                          <span className={styles.agendaTabAccent} style={{ background: group.accentColor }} />
                          <span>{group.title}</span>
                          {!group.isActive ? <small>inativa</small> : null}
                        </button>
                      )}
                      {canManageAgenda ? (
                        <div className={styles.agendaTabActions}>
                          <button type="button" onClick={() => onMoveGroup(group.id, -1)} disabled={index === 0}>
                            ←
                          </button>
                          <button type="button" onClick={() => onMoveGroup(group.id, 1)} disabled={index === agendaConfig.groups.length - 1}>
                            →
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className={styles.agendaAccountCard}>
                  <div>
                    <p className={styles.sectionEyebrow}>Conta vinculada</p>
                    <strong>{selectedGroup.linkedUserName || "Sem responsavel"}</strong>
                    <small>{selectedGroup.linkedEmail || "Nenhum e-mail conectado"}</small>
                  </div>
                  <div className={styles.headerActions}>
                    <span className={styles.metaBadge}>{selectedGroup.connectionStatus === "connected" ? "Conectado" : selectedGroup.connectionStatus === "pending" ? "Pendente" : "Nao vinculado"}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onLinkCurrentUser(selectedGroup.id)}
                      disabled={!canManageAgenda || !currentUserEmail}
                    >
                      Usar meu e-mail
                    </button>
                    <ChatSettingsButton
                      onClick={() => setSettingsOpen(true)}
                      title={`Configurar ${selectedGroup.title}`}
                      aria-label={`Configurar ${selectedGroup.title}`}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.agendaExperienceGrid}>
                <div className={styles.agendaWeekCard}>
                  <div className={styles.agendaWeekHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Agenda interativa</p>
                      <strong>{selectedGroup.title} · {formatMonthTitle(selectedDate)}</strong>
                      <small>
                        {visibleDays.length} dias uteis visiveis · {formatAgendaPreview(selectedGroup) || selectedGroup.emptyMessage}
                      </small>
                    </div>
                    <div className={styles.headerActions}>
                      <span className={styles.routeAtendimento}>{agendaConfig.timezone}</span>
                      <span className={styles.metaBadge}>{selectedGroup.buttonLabel}</span>
                    </div>
                  </div>

                  <div className={styles.inlineNote}>
                    Dias ocultos automaticamente: passados, feriados e dias nao marcados como uteis na configuracao.
                  </div>

                  <div className={styles.agendaBoardShell}>
                    <div className={styles.agendaTimeRail}>
                      {HOUR_LABELS.map((hour) => (
                        <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
                      ))}
                    </div>

                    <div className={styles.agendaBoardColumns} ref={boardColumnsRef}>
                      {visibleDays.map((day) => {
                        const dayIndex = visibleDays.findIndex((candidate) => toIsoDate(candidate) === toIsoDate(day));
                        const dayEvents = weekEvents.filter(
                          (event) => toIsoDate(event.startDate) === toIsoDate(day),
                        );
                        const dayTint = hexToRgba(accentColor, 0.12 + (dayIndex % 4) * 0.045);
                        const dayStripe = hexToRgba(accentColor, 0.22 + (dayIndex % 3) * 0.04);
                        return (
                          <div key={day.toISOString()} className={styles.agendaDayColumn}>
                            <div className={styles.agendaDayHeader}>
                              <strong>{formatDayChip(day)}</strong>
                              <span>{day.toLocaleDateString("pt-BR", { weekday: "long" })}</span>
                            </div>
                            <div
                              className={styles.agendaDayBody}
                              ref={(element) => {
                                dayColumnRefs.current[dayIndex] = element;
                              }}
                              style={{
                                ["--agenda-day-tint" as string]: dayTint,
                                ["--agenda-day-stripe" as string]: dayStripe,
                                ["--agenda-accent" as string]: accentColor,
                              }}
                            >
                              {dayEvents.length === 0 ? (
                                <div className={styles.agendaDayEmpty}>Sem horarios</div>
                              ) : null}
                              {dragPreview && dragState && dragPreview.dayIndex === dayIndex ? (
                                <div
                                  className={styles.agendaEventGhost}
                                  style={{ top: `${dragPreview.topPercent}%`, height: `${dragPreview.heightPercent}%` }}
                                />
                              ) : null}
                              {dayEvents.map((event) => {
                                const start = toMinutes(event.slot.startTime);
                                const end = toMinutes(event.slot.endTime);
                                const top = ((start - BOARD_START_HOUR * 60) / BOARD_TOTAL_MINUTES) * 100;
                                const height = Math.max(10, ((end - start) / BOARD_TOTAL_MINUTES) * 100);
                                const isDragging = dragState?.slotId === event.slot.id;
                                return (
                                  <button
                                    key={getWeekEventKey(event)}
                                    type="button"
                                    className={`${styles.agendaEventCard} ${selectedEventKey === getWeekEventKey(event) ? styles.agendaEventCardActive : ""} ${isDragging ? styles.agendaEventCardDragging : ""}`}
                                    style={{
                                      top: `${top}%`,
                                      height: `${height}%`,
                                      ["--agenda-card-accent" as string]: accentColor,
                                      ["--agenda-card-glow" as string]: hexToRgba(accentColor, 0.38),
                                    }}
                                    onClick={() => {
                                      setSelectedEventKey(getWeekEventKey(event));
                                      setSelectedSlotId(event.slot.id);
                                    }}
                                    onPointerDown={(pointerEvent) => handleSlotPointerDown(pointerEvent, event, dayIndex)}
                                  >
                                    <strong>{event.slot.label}</strong>
                                    <span>{event.slot.startTime} - {event.slot.endTime}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <aside className={styles.agendaRightRail}>
                  <div className={styles.agendaSidebarCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Guia ativa</p>
                        <strong>{selectedGroup.title}</strong>
                      </div>
                      <span className={styles.metaBadge}>
                        {selectedGroup.actionType === "cancelar_agendamento"
                          ? "Cancelamento"
                          : selectedGroup.actionType === "acao_customizada"
                            ? "Customizada"
                            : "Abrir agenda"}
                      </span>
                    </div>
                    <div className={styles.agendaDetailList}>
                      <div className={styles.agendaDetailRow}>
                        <span>Slug</span>
                        <strong>{selectedGroup.slug}</strong>
                      </div>
                      <div className={styles.agendaDetailRow}>
                        <span>Agenda vinculada</span>
                        <strong>{selectedGroup.linkedAgendaId || "Nao vinculada"}</strong>
                      </div>
                      <div className={styles.agendaDetailRow}>
                        <span>Ordem</span>
                        <strong>{selectedGroup.sortOrder + 1}</strong>
                      </div>
                      <div className={styles.agendaDetailRow}>
                        <span>Status</span>
                        <strong>{selectedGroup.isActive ? "Ativa" : "Inativa"}</strong>
                      </div>
                    </div>
                  </div>

                  <div className={styles.agendaSidebarCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Dias uteis</p>
                        <strong>Card lateral da guia</strong>
                      </div>
                      <span className={styles.metaBadge}>{selectedGroup.workdays.length} marcados</span>
                    </div>
                    <div className={styles.weekdayGrid}>
                      {WEEKDAY_OPTIONS.map((day) => {
                        const checked = selectedGroup.workdays.includes(day.value);
                        const lockLastSelection = checked && selectedGroup.workdays.length === 1;
                        return (
                          <label key={day.value} className={`${styles.weekdayChip} ${checked ? styles.weekdayChipActive : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canManageAgenda || lockLastSelection}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? sortWeekdays([...selectedGroup.workdays, day.value])
                                  : sortWeekdays(selectedGroup.workdays.filter((item) => item !== day.value));
                                onUpdateGroup(selectedGroup.id, "workdays", next);
                              }}
                            />
                            <span>{day.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className={styles.formGrid}>
                      <label className={styles.fieldBlock}>
                        <span>Dias visiveis</span>
                        <input
                          className="field"
                          type="number"
                          min={1}
                          max={14}
                          value={selectedGroup.visibleBusinessDays}
                          disabled={!canManageAgenda}
                          onChange={(event) => onUpdateGroup(selectedGroup.id, "visibleBusinessDays", Number(event.target.value) || 7)}
                        />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Janela de busca</span>
                        <input
                          className="field"
                          type="number"
                          min={1}
                          max={30}
                          value={selectedGroup.searchWindowDays}
                          disabled={!canManageAgenda}
                          onChange={(event) => onUpdateGroup(selectedGroup.id, "searchWindowDays", Number(event.target.value) || 7)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className={styles.agendaSidebarCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Regras rapidas</p>
                        <strong>Sugestoes e fallback</strong>
                      </div>
                    </div>
                    <div className={styles.formGrid}>
                      <label className={styles.fieldBlock}>
                        <span>Qtd. sugerida</span>
                        <input
                          className="field"
                          type="number"
                          min={1}
                          max={10}
                          value={selectedGroup.suggestedSlotsCount}
                          disabled={!canManageAgenda}
                          onChange={(event) => onUpdateGroup(selectedGroup.id, "suggestedSlotsCount", Number(event.target.value) || 3)}
                        />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Fallback futuro</span>
                        <input
                          className="field"
                          type="number"
                          min={0}
                          max={10}
                          value={selectedGroup.fallbackFutureSlotsCount}
                          disabled={!canManageAgenda}
                          onChange={(event) => onUpdateGroup(selectedGroup.id, "fallbackFutureSlotsCount", Number(event.target.value) || 0)}
                        />
                      </label>
                    </div>
                    <label className={styles.fieldBlock}>
                      <span>Mensagem sem disponibilidade imediata</span>
                      <textarea
                        className="field"
                        rows={3}
                        value={selectedGroup.noImmediateAvailabilityMessage}
                        disabled={!canManageAgenda}
                        onChange={(event) => onUpdateGroup(selectedGroup.id, "noImmediateAvailabilityMessage", event.target.value)}
                      />
                    </label>
                  </div>

                  <div className={styles.agendaSidebarCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Fluxo principal</p>
                        <strong>Preview da mensagem inicial</strong>
                      </div>
                      <span className={styles.metaBadge}>{agendaConfig.initialMessage.sendType}</span>
                    </div>
                    <div className={styles.agendaPreviewBubble}>
                      <strong>{agendaConfig.initialMessage.greeting}</strong>
                      <span>{agendaConfig.initialMessage.introText}</span>
                      <small>{agendaConfig.initialMessage.fallbackText}</small>
                    </div>
                    <div className={styles.agendaButtonPreviewRow}>
                      {agendaConfig.groups
                        .filter((group) => group.isActive)
                        .map((group) => (
                          <span key={group.id} className={styles.metaBadge}>
                            {group.buttonLabel}
                          </span>
                        ))}
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            {settingsOpen ? (
              <div className={styles.agendaSettingsOverlay} onClick={() => setSettingsOpen(false)}>
                <aside className={styles.agendaSettingsDrawer} onClick={(event) => event.stopPropagation()}>
                  <div className={styles.agendaSettingsHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Construtor da jornada</p>
                      <strong>{selectedGroup.title}</strong>
                      <small>Edite fluxo, guias, regras, mensagens automaticas e simulacao sem sair do painel.</small>
                    </div>
                    <div className={styles.headerActions}>
                      <span className={styles.metaBadge}>{selectedGroup.isActive ? "Ativa" : "Inativa"}</span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSettingsOpen(false)}>
                        Fechar
                      </button>
                    </div>
                  </div>

                  <div className={styles.agendaSettingsTabs}>
                    {[
                      ["fluxo", "Fluxo principal"],
                      ["guias", "Guias / Servicos"],
                      ["regras", "Regras"],
                      ["mensagens", "Mensagens"],
                      ["simulacao", "Simulacao"],
                    ].map(([tabId, label]) => (
                      <button
                        key={tabId}
                        type="button"
                        className={`${styles.agendaSettingsTabButton} ${settingsTab === tabId ? styles.agendaSettingsTabButtonActive : ""}`}
                        onClick={() => setSettingsTab(tabId as AgendaSettingsTab)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.agendaSettingsBody}>
                    {settingsTab === "fluxo" ? (
                      <>
                        <div className={styles.agendaSidebarCard}>
                          <div className={styles.cardHeader}>
                            <div>
                              <p className={styles.sectionEyebrow}>Mensagem inicial</p>
                              <strong>Fluxo principal do WhatsApp</strong>
                            </div>
                            <span className={styles.metaBadge}>{agendaConfig.initialMessage.sendType}</span>
                          </div>

                          <div className={styles.formGrid}>
                            <label className={styles.fieldBlock}>
                              <span>Saudacao</span>
                              <input className="field" value={agendaConfig.initialMessage.greeting} disabled={!canManageAgenda} onChange={(event) => onUpdateInitialMessage("greeting", event.target.value)} />
                            </label>
                            <label className={styles.fieldBlock}>
                              <span>Nome da empresa</span>
                              <input className="field" value={agendaConfig.initialMessage.companyLabel} disabled={!canManageAgenda} onChange={(event) => onUpdateInitialMessage("companyLabel", event.target.value)} />
                            </label>
                            <label className={styles.fieldBlock}>
                              <span>Nome da atendente</span>
                              <input className="field" value={agendaConfig.initialMessage.attendantLabel} disabled={!canManageAgenda} onChange={(event) => onUpdateInitialMessage("attendantLabel", event.target.value)} />
                            </label>
                            <label className={styles.fieldBlock}>
                              <span>Tipo de envio</span>
                              <select className="field" value={agendaConfig.initialMessage.sendType} disabled={!canManageAgenda} onChange={(event) => onUpdateInitialMessage("sendType", event.target.value)}>
                                <option value="botoes">Botoes</option>
                                <option value="lista">Lista</option>
                              </select>
                            </label>
                          </div>

                          <label className={styles.fieldBlock}>
                            <span>Texto introdutorio</span>
                            <textarea className="field" rows={4} value={agendaConfig.initialMessage.introText} disabled={!canManageAgenda} onChange={(event) => onUpdateInitialMessage("introText", event.target.value)} />
                          </label>

                          <label className={styles.fieldBlock}>
                            <span>Fallback</span>
                            <textarea className="field" rows={3} value={agendaConfig.initialMessage.fallbackText} disabled={!canManageAgenda} onChange={(event) => onUpdateInitialMessage("fallbackText", event.target.value)} />
                          </label>
                        </div>

                        <div className={styles.agendaSidebarCard}>
                          <div className={styles.cardHeader}>
                            <div>
                              <p className={styles.sectionEyebrow}>Preview</p>
                              <strong>Como o cliente enxerga o menu</strong>
                            </div>
                          </div>
                          <div className={styles.agendaPreviewBubble}>
                            <strong>{agendaConfig.initialMessage.greeting}</strong>
                            <span>{agendaConfig.initialMessage.introText}</span>
                            <small>{agendaConfig.initialMessage.fallbackText}</small>
                          </div>
                          <div className={styles.agendaButtonPreviewRow}>
                            {agendaConfig.groups
                              .filter((group) => group.isActive)
                              .map((group) => (
                                <span key={group.id} className={styles.metaBadge}>
                                  {group.buttonLabel}
                                </span>
                              ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                    {settingsTab === "guias" ? (
                    <div className={styles.agendaSidebarCard}>
                      <div className={styles.cardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Configuracao da guia</p>
                          <strong>{selectedGroup.title}</strong>
                        </div>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveGroup(selectedGroup.id)} disabled={!canManageAgenda}>
                          Excluir
                        </button>
                      </div>

                      <div className={styles.formGrid}>
                        <label className={styles.fieldBlock}>
                          <span>Nome da guia</span>
                          <input className="field" value={selectedGroup.title} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "title", event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Botao do bot</span>
                          <input className="field" value={selectedGroup.buttonLabel} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "buttonLabel", event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Slug</span>
                          <input className="field" value={selectedGroup.slug} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "slug", event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Tipo de acao</span>
                          <select className="field" value={selectedGroup.actionType} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "actionType", event.target.value)}>
                            <option value="abrir_agenda">Abrir agenda</option>
                            <option value="cancelar_agendamento">Cancelar agendamento</option>
                            <option value="acao_customizada">Acao customizada</option>
                          </select>
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Agenda vinculada</span>
                          <input className="field" value={selectedGroup.linkedAgendaId} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "linkedAgendaId", event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Acao customizada</span>
                          <input className="field" value={selectedGroup.customActionKey || ""} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "customActionKey", event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Cor</span>
                          <input className="field" type="color" value={selectedGroup.accentColor} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "accentColor", event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Status</span>
                          <select className="field" value={selectedGroup.connectionStatus} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "connectionStatus", event.target.value)}>
                            <option value="not_linked">Nao vinculado</option>
                            <option value="pending">Pendente</option>
                            <option value="connected">Conectado</option>
                          </select>
                        </label>
                      </div>

                      <label className={styles.fieldBlock}>
                        <span>Descricao</span>
                        <textarea className="field" rows={3} value={selectedGroup.description} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "description", event.target.value)} />
                      </label>

                      <div className={styles.formGrid}>
                        <label className={styles.fieldBlock}>
                          <span>Responsavel</span>
                          <input className="field" value={selectedGroup.linkedUserName} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "linkedUserName", event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>E-mail vinculado</span>
                          <input className="field" type="email" value={selectedGroup.linkedEmail} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "linkedEmail", event.target.value.toLowerCase())} />
                        </label>
                      </div>

                      <label className={styles.switchRow}>
                        <input type="checkbox" checked={selectedGroup.isActive} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "isActive", event.target.checked)} />
                        <span>Guia disponivel para o bot e para a agenda</span>
                      </label>

                      <div className={styles.inlineNote}>
                        Usuario atual: <strong>{currentUserName || "Sem nome"}</strong> · {currentUserEmail || "Sem e-mail no perfil"}
                      </div>
                    </div>
                    ) : null}

                    {settingsTab === "regras" ? (
                    <div className={styles.agendaSidebarCard}>
                      <div className={styles.cardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Dias uteis</p>
                          <strong>Regras de exibicao da agenda</strong>
                        </div>
                        <span className={styles.metaBadge}>{selectedGroup.visibleBusinessDays} dias uteis</span>
                      </div>

                      <div className={styles.weekdayGrid}>
                        {WEEKDAY_OPTIONS.map((day) => {
                          const checked = selectedGroup.workdays.includes(day.value);
                          const lockLastSelection = checked && selectedGroup.workdays.length === 1;
                          return (
                            <label key={day.value} className={`${styles.weekdayChip} ${checked ? styles.weekdayChipActive : ""}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canManageAgenda || lockLastSelection}
                                onChange={(event) => {
                                  const next = event.target.checked
                                    ? sortWeekdays([...selectedGroup.workdays, day.value])
                                    : sortWeekdays(selectedGroup.workdays.filter((item) => item !== day.value));
                                  onUpdateGroup(selectedGroup.id, "workdays", next);
                                }}
                              />
                              <span>{day.label}</span>
                            </label>
                          );
                        })}
                      </div>

                      <label className={styles.fieldBlock}>
                        <span>Quantidade de dias uteis visiveis</span>
                        <input
                          className="field"
                          type="number"
                          min={1}
                          max={14}
                          value={selectedGroup.visibleBusinessDays}
                          disabled={!canManageAgenda}
                          onChange={(event) => onUpdateGroup(selectedGroup.id, "visibleBusinessDays", Number(event.target.value) || 7)}
                        />
                      </label>

                      <div className={styles.formGrid}>
                        <label className={styles.fieldBlock}>
                          <span>Janela de busca</span>
                          <input
                            className="field"
                            type="number"
                            min={1}
                            max={30}
                            value={selectedGroup.searchWindowDays}
                            disabled={!canManageAgenda}
                            onChange={(event) => onUpdateGroup(selectedGroup.id, "searchWindowDays", Number(event.target.value) || 7)}
                          />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Qtd. de horarios sugeridos</span>
                          <input
                            className="field"
                            type="number"
                            min={1}
                            max={10}
                            value={selectedGroup.suggestedSlotsCount}
                            disabled={!canManageAgenda}
                            onChange={(event) => onUpdateGroup(selectedGroup.id, "suggestedSlotsCount", Number(event.target.value) || 3)}
                          />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Fallback futuro</span>
                          <input
                            className="field"
                            type="number"
                            min={0}
                            max={10}
                            value={selectedGroup.fallbackFutureSlotsCount}
                            disabled={!canManageAgenda}
                            onChange={(event) => onUpdateGroup(selectedGroup.id, "fallbackFutureSlotsCount", Number(event.target.value) || 0)}
                          />
                        </label>
                      </div>

                      <div className={styles.inlineNote}>
                        Sabado e domingo nao aparecem na agenda enquanto nao estiverem marcados aqui.
                      </div>
                    </div>
                    ) : null}

                    {settingsTab === "regras" ? (
                    <div className={styles.agendaSidebarCard}>
                      <div className={styles.slotHeader}>
                        <strong>Horarios da guia</strong>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddSlot(selectedGroup.id)} disabled={!canManageAgenda}>
                          Adicionar horario
                        </button>
                      </div>

                      <div className={styles.agendaSlotPicker}>
                        {selectedGroup.slots.length === 0 ? (
                          <div className={styles.emptyState}>Nenhum horario cadastrado nesta guia.</div>
                        ) : (
                          selectedGroup.slots.map((slot) => (
                            <button
                              key={slot.id}
                              type="button"
                              className={`${styles.agendaSlotChip} ${selectedSlot?.id === slot.id ? styles.agendaSlotChipActive : ""}`}
                              onClick={() => setSelectedSlotId(slot.id)}
                            >
                              <strong>{formatWeekday(slot.dayOfWeek)}</strong>
                              <span>{slot.startTime} - {slot.endTime}</span>
                            </button>
                          ))
                        )}
                      </div>

                      {selectedSlot ? (
                        <>
                          <div className={styles.formGrid}>
                            <label className={styles.fieldBlock}>
                              <span>Rotulo</span>
                              <input className="field" value={selectedSlot.label} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, selectedSlot.id, "label", event.target.value)} />
                            </label>
                            <label className={styles.fieldBlock}>
                              <span>Dia</span>
                              <select className="field" value={selectedSlot.dayOfWeek} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, selectedSlot.id, "dayOfWeek", Number(event.target.value))}>
                                {WEEKDAY_OPTIONS.map((day) => (
                                  <option key={day.value} value={day.value}>{day.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className={styles.fieldBlock}>
                              <span>Inicio</span>
                              <input className="field" type="time" value={selectedSlot.startTime} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, selectedSlot.id, "startTime", event.target.value)} />
                            </label>
                            <label className={styles.fieldBlock}>
                              <span>Fim</span>
                              <input className="field" type="time" value={selectedSlot.endTime} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, selectedSlot.id, "endTime", event.target.value)} />
                            </label>
                          </div>

                          <div className={styles.headerActions}>
                            <label className={styles.switchRow}>
                              <input type="checkbox" checked={selectedSlot.enabled} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, selectedSlot.id, "enabled", event.target.checked)} />
                              <span>Horario ativo</span>
                            </label>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveSlot(selectedGroup.id, selectedSlot.id)} disabled={!canManageAgenda}>
                              Remover horario
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                    ) : null}

                    {settingsTab === "regras" ? (
                    <div className={styles.agendaSidebarCard}>
                      <div className={styles.cardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Feriados</p>
                          <strong>Datas de fechamento</strong>
                        </div>
                        <div className={styles.headerActions}>
                          <span className={styles.metaBadge}>{agendaConfig.holidays.length} feriados</span>
                        </div>
                      </div>

                      <div className={styles.holidaysList}>
                        {agendaConfig.holidays.length === 0 ? (
                          <div className={styles.emptyState}>Nenhum feriado cadastrado.</div>
                        ) : (
                          agendaConfig.holidays
                            .sort()
                            .slice(0, 10)
                            .map((dateStr) => {
                              const date = new Date(`${dateStr}T00:00:00`);
                              const formatted = date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
                              return (
                                <div key={dateStr} className={styles.holidayChip}>
                                  <span>{formatted}</span>
                                  {canManageAgenda ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = agendaConfig.holidays.filter((h) => h !== dateStr);
                                        onUpdateHolidays?.(updated);
                                      }}
                                      className="btn btn-danger btn-xs"
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })
                        )}
                      </div>

                      {agendaConfig.holidays.length > 10 ? (
                        <small style={{ color: "var(--color-muted)", display: "block", marginTop: "0.5rem" }}>
                          + {agendaConfig.holidays.length - 10} feriados nao listados
                        </small>
                      ) : null}

                      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={async () => {
                            setLoadingHolidays(true);
                            try {
                              await onLoadHolidays?.();
                            } finally {
                              setLoadingHolidays(false);
                            }
                          }}
                          disabled={!canManageAgenda || loadingHolidays || loadingAgenda || savingAgenda}
                        >
                          {loadingHolidays ? "Carregando..." : "Carregar feriados"}
                        </button>
                        <input
                          type="date"
                          className="field"
                          style={{ flex: 1, fontSize: "0.875rem" }}
                          disabled={!canManageAgenda}
                          onChange={(event) => {
                            if (event.target.value && !agendaConfig.holidays.includes(event.target.value)) {
                              onUpdateHolidays?.([...agendaConfig.holidays, event.target.value].sort());
                              event.target.value = "";
                            }
                          }}
                          title="Adicionar feriado manualmente"
                        />
                      </div>
                    </div>
                    ) : null}

                    {settingsTab === "mensagens" ? (
                    <div className={styles.agendaSidebarCard}>
                      <div className={styles.cardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Mensagens globais</p>
                          <strong>Fluxo automatico da jornada</strong>
                        </div>
                      </div>
                      <label className={styles.fieldBlock}>
                        <span>Introducao de disponibilidade</span>
                        <textarea className="field" rows={3} value={agendaConfig.flowMessages.availabilityIntro} disabled={!canManageAgenda} onChange={(event) => onUpdateFlowMessage("availabilityIntro", event.target.value)} />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Fallback de horarios futuros</span>
                        <textarea className="field" rows={3} value={agendaConfig.flowMessages.fallbackFutureSlots} disabled={!canManageAgenda} onChange={(event) => onUpdateFlowMessage("fallbackFutureSlots", event.target.value)} />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Confirmacao de agendamento</span>
                        <textarea className="field" rows={3} value={agendaConfig.flowMessages.confirmationMessage} disabled={!canManageAgenda} onChange={(event) => onUpdateFlowMessage("confirmationMessage", event.target.value)} />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Pergunta de cancelamento</span>
                        <textarea className="field" rows={3} value={agendaConfig.flowMessages.cancellationPrompt} disabled={!canManageAgenda} onChange={(event) => onUpdateFlowMessage("cancellationPrompt", event.target.value)} />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Sucesso de cancelamento</span>
                        <textarea className="field" rows={3} value={agendaConfig.flowMessages.cancellationSuccess} disabled={!canManageAgenda} onChange={(event) => onUpdateFlowMessage("cancellationSuccess", event.target.value)} />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Sem agendamento encontrado</span>
                        <textarea className="field" rows={3} value={agendaConfig.flowMessages.cancellationNotFound} disabled={!canManageAgenda} onChange={(event) => onUpdateFlowMessage("cancellationNotFound", event.target.value)} />
                      </label>
                    </div>
                    ) : null}

                    {settingsTab === "mensagens" ? (
                    <div className={styles.agendaSidebarCard}>
                      <div className={styles.cardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Mensagens do fluxo</p>
                          <strong>Texto enviado ao cliente</strong>
                        </div>
                      </div>
                      <label className={styles.fieldBlock}>
                        <span>Mensagem com horarios</span>
                        <textarea className="field" rows={4} value={selectedGroup.introMessage} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "introMessage", event.target.value)} />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Fallback sem horario</span>
                        <textarea className="field" rows={3} value={selectedGroup.emptyMessage} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "emptyMessage", event.target.value)} />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>Mensagem sem disponibilidade imediata</span>
                        <textarea className="field" rows={3} value={selectedGroup.noImmediateAvailabilityMessage} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "noImmediateAvailabilityMessage", event.target.value)} />
                      </label>
                      {selectedEvent ? (
                        <div className={styles.inlineNote}>
                          Proxima janela selecionada: <strong>{formatShortDate(selectedEvent.startDate)}</strong> · {selectedEvent.slot.startTime} - {selectedEvent.slot.endTime}
                        </div>
                      ) : null}
                    </div>
                    ) : null}

                    {settingsTab === "simulacao" ? (
                    <div className={styles.agendaSidebarCard}>
                      <div className={styles.cardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Sandbox</p>
                          <strong>Testar a jornada sem cliente real</strong>
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void runSimulation()} disabled={simulationLoading}>
                          {simulationLoading ? "Simulando..." : "Rodar simulacao"}
                        </button>
                      </div>

                      <div className={styles.formGrid}>
                        <label className={styles.fieldBlock}>
                          <span>Cliente de teste</span>
                          <input className="field" value={simulationCustomerName} onChange={(event) => setSimulationCustomerName(event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Data de referencia</span>
                          <input className="field" type="date" value={simulationReferenceDate} onChange={(event) => setSimulationReferenceDate(event.target.value)} />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span>Etapa</span>
                          <select className="field" value={selectedGroup.actionType === "cancelar_agendamento" ? "cancelar_agendamento" : simulationStage} onChange={(event) => setSimulationStage(event.target.value as "abrir_guia" | "confirmar_agendamento" | "cancelar_agendamento")} disabled={selectedGroup.actionType === "cancelar_agendamento"}>
                            <option value="abrir_guia">Clique na guia</option>
                            <option value="confirmar_agendamento">Confirmar agendamento</option>
                            <option value="cancelar_agendamento">Cancelar agendamento</option>
                          </select>
                        </label>
                      </div>

                      <label className={styles.switchRow}>
                        <input type="checkbox" checked={simulationHasActiveBooking} onChange={(event) => setSimulationHasActiveBooking(event.target.checked)} />
                        <span>Simular cliente com agendamento ativo para cancelamento</span>
                      </label>
                    </div>
                    ) : null}

                    {settingsTab === "simulacao" ? (
                    <div className={styles.agendaSidebarCard}>
                      <div className={styles.cardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Resultado</p>
                          <strong>{simulationResult?.summary || "Nenhuma simulacao executada ainda"}</strong>
                        </div>
                        {simulationResult ? <span className={styles.metaBadge}>{simulationResult.status}</span> : null}
                      </div>

                      {simulationResult ? (
                        <>
                          <div className={styles.agendaSimulationMessages}>
                            {simulationResult.messages.map((message, index) => (
                              <article
                                key={`${message.label}-${index}`}
                                className={`${styles.agendaSimulationMessage} ${
                                  message.role === "customer"
                                    ? styles.agendaSimulationMessageCustomer
                                    : message.role === "system"
                                      ? styles.agendaSimulationMessageSystem
                                      : styles.agendaSimulationMessageBot
                                }`}
                              >
                                <span>{message.label}</span>
                                <strong>{message.text}</strong>
                              </article>
                            ))}
                          </div>

                          <div className={styles.agendaSimulationSlots}>
                            <div>
                              <p className={styles.sectionEyebrow}>Horarios sugeridos</p>
                              {simulationResult.suggestedSlots.length === 0 ? (
                                <div className={styles.emptyState}>Sem horarios imediatos.</div>
                              ) : (
                                simulationResult.suggestedSlots.map((slot) => (
                                  <div key={slot.id} className={styles.agendaSimulationSlot}>
                                    <strong>{slot.label}</strong>
                                    <span>{slot.dateLabel} · {slot.startTime} - {slot.endTime}</span>
                                  </div>
                                ))
                              )}
                            </div>
                            <div>
                              <p className={styles.sectionEyebrow}>Fallback futuro</p>
                              {simulationResult.fallbackSlots.length === 0 ? (
                                <div className={styles.emptyState}>Sem fallback adicional.</div>
                              ) : (
                                simulationResult.fallbackSlots.map((slot) => (
                                  <div key={slot.id} className={styles.agendaSimulationSlot}>
                                    <strong>{slot.label}</strong>
                                    <span>{slot.dateLabel} · {slot.startTime} - {slot.endTime}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className={styles.inlineNote}>
                          Use a simulacao para validar clique na guia, retorno de horarios, confirmacao e cancelamento sem cliente real.
                        </div>
                      )}
                    </div>
                    ) : null}
                  </div>
                </aside>
              </div>
            ) : null}
          </div>
        )}
      </article>
    </section>
  );
}
