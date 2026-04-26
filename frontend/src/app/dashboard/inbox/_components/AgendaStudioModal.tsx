"use client";

import { useEffect, useMemo, useState } from "react";
import PremiumLaunchDialog from "@/components/PremiumLaunchDialog";
import { apiFetch } from "../../_lib/api";
import {
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  formatAgendaPreview,
  formatWeekday,
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaGroup,
} from "../inbox-model";
import styles from "../page.module.css";

export type AgendaStudioTab = "sales" | "bot";

type LeadStatus = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
type LeadBlockKey = "today" | "overdue" | "scheduled" | "closed";

type SalesLead = {
  id: string;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  segment?: string | null;
  status: LeadStatus;
  statusLabel: string;
  returnAt?: string | null;
  nextAction?: string | null;
  shortNote?: string | null;
  updatedAt?: string | null;
  sourceType?: string | null;
  primarySource?: string | null;
};

type SalesBoardResponse = {
  summary: { total: number; today: number; overdue: number; scheduled: number; closed: number };
  blocks: Record<LeadBlockKey, SalesLead[]>;
};

type SalesAgendaSettings = {
  durationMinutes: number;
  startTime: string;
  endTime: string;
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
  workdays: number[];
};

type SalesAgendaWindowDays = 7 | 14 | 30;

type PlannedSalesLead = SalesLead & {
  sourceBlock: LeadBlockKey | "unscheduled";
  plannedAt: string | null;
  fixed: boolean;
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

type AgendaStudioModalProps = {
  initialTab: AgendaStudioTab;
  allowSalesTab?: boolean;
  onClose: () => void;
  agendaConfig: AtendimentoAgendaConfig;
  loadingAgenda: boolean;
  savingAgenda: boolean;
  botAgendaDirty: boolean;
  canManageAgenda: boolean;
  currentUserEmail: string;
  currentUserName: string;
  onSaveBotAgenda: () => void;
  onAddGroup: () => void;
  onRemoveGroup: (groupId: string) => void;
  onResetBotAgenda: () => void;
  onLinkCurrentUser: (groupId: string) => void;
  onUpdateGroup: (
    groupId: string,
    field: AgendaGroupEditableField,
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
};

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_OPTIONS = WEEKDAY_ORDER.map((day) => ({ value: day, label: formatWeekday(day) }));
const DEFAULT_SALES_SETTINGS: SalesAgendaSettings = {
  durationMinutes: 30,
  startTime: "09:00",
  endTime: "18:00",
  lunchEnabled: true,
  lunchStart: "12:00",
  lunchEnd: "13:00",
  workdays: [1, 2, 3, 4, 5],
};

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function toMinutes(value: string) {
  const [hoursRaw, minutesRaw] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minutesToTime(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDateTime(value?: string | null) {
  const parsed = parseDate(value);
  return parsed
    ? parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "Sem horário";
}

function formatDayLabel(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return parsed.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function buildDateTime(dateKey: string, minutes: number) {
  const local = new Date(`${dateKey}T${minutesToTime(minutes)}:00`);
  return local.toISOString();
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function buildUsefulTimeSlots(settings: SalesAgendaSettings, daysToBuild = 10) {
  const slots: Array<{ key: string; dateKey: string; time: string; dateTime: string }> = [];
  const startMinutes = toMinutes(settings.startTime);
  const endMinutes = toMinutes(settings.endTime);
  const lunchStart = toMinutes(settings.lunchStart);
  const lunchEnd = toMinutes(settings.lunchEnd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let dayCursor = today;
  let usefulDays = 0;
  let guard = 0;

  while (usefulDays < daysToBuild && guard < 240) {
    const dateKey = toLocalDateKey(dayCursor);
    if (settings.workdays.includes(dayCursor.getDay())) {
      for (let cursor = startMinutes; cursor + settings.durationMinutes <= endMinutes; cursor += settings.durationMinutes) {
        const crossesLunch = settings.lunchEnabled && cursor < lunchEnd && cursor + settings.durationMinutes > lunchStart;
        if (!crossesLunch) {
          slots.push({
            key: `${dateKey}-${cursor}`,
            dateKey,
            time: minutesToTime(cursor),
            dateTime: buildDateTime(dateKey, cursor),
          });
        }
      }
      usefulDays += 1;
    }
    dayCursor = addDays(dayCursor, 1);
    guard += 1;
  }

  return slots;
}

function countSlotsPerUsefulDay(settings: SalesAgendaSettings) {
  const startMinutes = toMinutes(settings.startTime);
  const endMinutes = toMinutes(settings.endTime);
  const lunchStart = toMinutes(settings.lunchStart);
  const lunchEnd = toMinutes(settings.lunchEnd);
  let count = 0;
  for (let cursor = startMinutes; cursor + settings.durationMinutes <= endMinutes; cursor += settings.durationMinutes) {
    const crossesLunch = settings.lunchEnabled && cursor < lunchEnd && cursor + settings.durationMinutes > lunchStart;
    if (!crossesLunch) count += 1;
  }
  return Math.max(1, count);
}

function countCalendarDaysUntil(dateTime: string | null | undefined) {
  const parsed = parseDate(dateTime);
  if (!parsed) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000)) + 1;
}

export function summarizeSalesAgenda(board: SalesBoardResponse | null) {
  const blocks = board?.blocks;
  const leads = blocks ? [...blocks.overdue, ...blocks.today, ...blocks.scheduled] : [];
  return {
    inherited: leads.length,
    today: blocks?.today.length || 0,
    overdue: blocks?.overdue.length || 0,
    unscheduled: leads.filter((lead) => !parseDate(lead.returnAt)).length,
    scheduled: blocks?.scheduled.length || 0,
  };
}

function collectSalesLeads(board: SalesBoardResponse | null) {
  if (!board) return [] as PlannedSalesLead[];
  const addBlock = (block: LeadBlockKey): PlannedSalesLead[] =>
    (board.blocks[block] || []).map((lead) => ({
      ...lead,
      sourceBlock: (parseDate(lead.returnAt) ? block : "unscheduled") as LeadBlockKey | "unscheduled",
      plannedAt: lead.returnAt || null,
      fixed: false,
    }));
  const unique = new Map<string, PlannedSalesLead>();
  [...addBlock("overdue"), ...addBlock("today"), ...addBlock("scheduled")].forEach((lead) => {
    if (!unique.has(lead.id)) unique.set(lead.id, lead);
  });
  return Array.from(unique.values());
}

export function distributeSalesCards(
  leads: PlannedSalesLead[],
  settings: SalesAgendaSettings,
  currentPlan: Record<string, string | null>,
  fixedLeadIds: Set<string>,
) {
  const slots = buildUsefulTimeSlots(settings, Math.max(10, Math.ceil(leads.length / countSlotsPerUsefulDay(settings)) + 3));
  const usedSlots = new Set(
    leads
      .filter((lead) => fixedLeadIds.has(lead.id) && currentPlan[lead.id])
      .map((lead) => String(currentPlan[lead.id])),
  );
  const nextPlan = { ...currentPlan };
  let slotIndex = 0;
  const weight = (lead: PlannedSalesLead) => {
    if (lead.sourceBlock === "overdue") return 0;
    if (lead.sourceBlock === "today") return 1;
    if (lead.sourceBlock === "unscheduled") return 2;
    return 3;
  };

  [...leads].sort((left, right) => weight(left) - weight(right)).forEach((lead) => {
    if (fixedLeadIds.has(lead.id)) return;
    while (slots[slotIndex] && usedSlots.has(slots[slotIndex].dateTime)) slotIndex += 1;
    const slot = slots[slotIndex];
    if (!slot) return;
    nextPlan[lead.id] = slot.dateTime;
    usedSlots.add(slot.dateTime);
    slotIndex += 1;
  });

  return nextPlan;
}

export function canDeleteAgendaGuide(group: AtendimentoAgendaGroup) {
  if (group.id === DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups[0]?.id) {
    return {
      allowed: false,
      reason: "A guia padrão Técnicos não pode ser excluída. Desative ou edite a guia, se necessário.",
    };
  }
  const hasActiveSlots = group.slots.some((slot) => slot.enabled);
  // TODO: trocar este bloqueio seguro por validação backend de agendamento futuro ativo vinculado à guia.
  // Horários configurados bloqueiam por enquanto porque ainda não há checagem real de vínculo futuro.
  const hasFutureLinkedBooking = hasActiveSlots;
  return {
    allowed: !hasFutureLinkedBooking,
    reason: hasFutureLinkedBooking
      ? "Esta guia possui horários ativos. Desative os horários antes de excluir, até a validação de agendamentos futuros estar disponível."
      : "",
  };
}

function SalesAgendaTab() {
  const [board, setBoard] = useState<SalesBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SalesAgendaSettings>(DEFAULT_SALES_SETTINGS);
  const [windowDays, setWindowDays] = useState<SalesAgendaWindowDays>(14);
  const [plan, setPlan] = useState<Record<string, string | null>>({});
  const [fixedLeadIds, setFixedLeadIds] = useState<Set<string>>(() => new Set());
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState<{ done: number; total: number } | null>(null);
  const [failedSaves, setFailedSaves] = useState<Array<{ id: string; name: string; error: string }>>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<SalesBoardResponse>("/vendas/board")
      .then((payload) => {
        if (!active) return;
        setBoard(payload);
        const initialPlan: Record<string, string | null> = {};
        collectSalesLeads(payload).forEach((lead) => {
          initialPlan[lead.id] = lead.returnAt || null;
        });
        setPlan(initialPlan);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "Falha ao carregar cards de Vendas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => summarizeSalesAgenda(board), [board]);
  const leads = useMemo(() => collectSalesLeads(board), [board]);
  const visibleDaysToBuild = useMemo(() => {
    const requiredByVolume = Math.ceil(leads.length / countSlotsPerUsefulDay(settings));
    const requiredByPlan = Math.max(0, ...Object.values(plan).map((plannedAt) => countCalendarDaysUntil(plannedAt)));
    return Math.max(windowDays, requiredByVolume, requiredByPlan, 1);
  }, [leads.length, plan, settings, windowDays]);
  const slots = useMemo(() => buildUsefulTimeSlots(settings, visibleDaysToBuild), [settings, visibleDaysToBuild]);
  const slotsByDay = useMemo(() => {
    const map = new Map<string, typeof slots>();
    slots.forEach((slot) => map.set(slot.dateKey, [...(map.get(slot.dateKey) || []), slot]));
    return Array.from(map.entries());
  }, [slots]);
  const plannedBySlot = useMemo(() => {
    const map = new Map<string, PlannedSalesLead[]>();
    leads.forEach((lead) => {
      const plannedAt = plan[lead.id];
      if (!plannedAt) return;
      map.set(plannedAt, [...(map.get(plannedAt) || []), lead]);
    });
    return map;
  }, [leads, plan]);

  const organize = (mode: "preserve" | "all" = "preserve") => {
    const fixedSet = mode === "all" ? new Set<string>() : fixedLeadIds;
    setPlan(distributeSalesCards(leads, settings, plan, fixedSet));
    if (mode === "all") setFixedLeadIds(new Set());
    setMessage("Prévia criada. Revise os horários antes de aplicar.");
  };

  const clearPreview = () => {
    const restored: Record<string, string | null> = {};
    leads.forEach((lead) => {
      restored[lead.id] = lead.returnAt || null;
    });
    setPlan(restored);
    setFixedLeadIds(new Set());
    setMessage("Prévia limpa.");
  };

  const applyPlan = async () => {
    const changed = leads.filter((lead) => (plan[lead.id] || null) !== (lead.returnAt || null));
    if (!changed.length) {
      setMessage("Nenhuma alteração para aplicar.");
      return;
    }
    setSaving(true);
    setSavingProgress({ done: 0, total: changed.length });
    setFailedSaves([]);
    setMessage(null);
    const failures: Array<{ id: string; name: string; error: string }> = [];
    let saved = 0;
    try {
      for (const lead of changed) {
        try {
          await apiFetch(`/vendas/lead/${lead.id}`, {
            method: "PATCH",
            body: JSON.stringify({ returnAt: plan[lead.id] || "" }),
          });
          saved += 1;
        } catch (error) {
          failures.push({
            id: lead.id,
            name: lead.name || "Lead sem nome",
            error: error instanceof Error ? error.message : "Falha ao salvar card.",
          });
        } finally {
          setSavingProgress({ done: saved + failures.length, total: changed.length });
        }
      }
      const payload = await apiFetch<SalesBoardResponse>("/vendas/board");
      setBoard(payload);
      setFailedSaves(failures);
      setMessage(failures.length ? `${saved} card(s) salvos. ${failures.length} falharam.` : `${saved} card(s) atualizados na Agenda Vendas.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao aplicar organização.");
    } finally {
      setSaving(false);
      setSavingProgress(null);
    }
  };

  const moveLeadToSlot = (leadId: string, dateTime: string) => {
    setPlan((current) => ({ ...current, [leadId]: dateTime }));
    setFixedLeadIds((current) => new Set([...Array.from(current), leadId]));
  };

  return (
    <div className={styles.agendaStudioTabBody}>
      {savingProgress ? (
        <PremiumLaunchDialog
          notice={{
            phase: "loading",
            progress: Math.max(4, Math.min(100, Math.round((savingProgress.done / Math.max(1, savingProgress.total)) * 100))),
            title: "Aplicando Agenda Vendas",
            description: "Salvando os horários dos cards internos sem acionar a Agenda Bot.",
            ctaLabel: "Concluir",
          }}
          onOpen={() => undefined}
          progressLabel="Salvando cards"
          progressValueLabel={`${savingProgress.done} de ${savingProgress.total}`}
          loadingLabel="Aplicando..."
          detailRows={[
            { label: "Agenda", value: "Vendas" },
            { label: "Origem", value: "Cards internos" },
          ]}
        />
      ) : null}
      <section className={styles.salesAgendaSummaryGrid}>
        {[
          ["Cards herdados", summary.inherited],
          ["Hoje", summary.today],
          ["Atrasados", summary.overdue],
          ["Sem horário", summary.unscheduled],
          ["Programados", summary.scheduled],
        ].map(([label, value]) => (
          <article key={String(label)} className={styles.salesAgendaMetric}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className={styles.salesAgendaPlanner}>
        <div className={styles.salesAgendaConfig}>
          <label>
            <span>Duração média</span>
            <input className="field" type="number" min={15} max={180} step={15} value={settings.durationMinutes} onChange={(event) => setSettings((current) => ({ ...current, durationMinutes: Number(event.target.value) || 30 }))} />
          </label>
          <label>
            <span>Início</span>
            <input className="field" type="time" value={settings.startTime} onChange={(event) => setSettings((current) => ({ ...current, startTime: event.target.value }))} />
          </label>
          <label>
            <span>Fim</span>
            <input className="field" type="time" value={settings.endTime} onChange={(event) => setSettings((current) => ({ ...current, endTime: event.target.value }))} />
          </label>
          <label>
            <span>Almoço início</span>
            <input className="field" type="time" disabled={!settings.lunchEnabled} value={settings.lunchStart} onChange={(event) => setSettings((current) => ({ ...current, lunchStart: event.target.value }))} />
          </label>
          <label>
            <span>Almoço fim</span>
            <input className="field" type="time" disabled={!settings.lunchEnabled} value={settings.lunchEnd} onChange={(event) => setSettings((current) => ({ ...current, lunchEnd: event.target.value }))} />
          </label>
          <label className={styles.switchRow}>
            <input type="checkbox" checked={settings.lunchEnabled} onChange={(event) => setSettings((current) => ({ ...current, lunchEnabled: event.target.checked }))} />
            <span>Intervalo de almoço</span>
          </label>
        </div>

        <div className={styles.salesAgendaWeekdays}>
          {WEEKDAY_OPTIONS.map((day) => {
            const checked = settings.workdays.includes(day.value);
            return (
              <label key={day.value} className={`${styles.weekdayChip} ${checked ? styles.weekdayChipActive : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...settings.workdays, day.value]
                      : settings.workdays.filter((item) => item !== day.value);
                    setSettings((current) => ({ ...current, workdays: WEEKDAY_ORDER.filter((item) => next.includes(item)) }));
                  }}
                />
                <span>{day.label}</span>
              </label>
            );
          })}
        </div>

        <div className={styles.salesAgendaActions}>
          <div className={styles.agendaWindowSwitch}>
            {([7, 14, 30] as SalesAgendaWindowDays[]).map((days) => (
              <button key={days} type="button" className={windowDays === days ? styles.agendaWindowSwitchActive : ""} onClick={() => setWindowDays(days)}>
                {days} dias
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => organize("preserve")} disabled={loading || !leads.length}>Organizar automaticamente</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => organize("all")} disabled={loading || !leads.length}>Reorganizar tudo</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={applyPlan} disabled={saving || loading}>{saving ? "Aplicando..." : "Aplicar organização"}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearPreview} disabled={loading}>Limpar prévia</button>
        </div>
        {message ? <div className={styles.inlineNote}>{message}</div> : null}
        {failedSaves.length ? (
          <div className={styles.salesAgendaFailureList}>
            {failedSaves.map((failure) => (
              <span key={failure.id}>{failure.name}: {failure.error}</span>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.salesAgendaGrid}>
        {loading ? <div className={styles.emptyState}>Carregando cards de Vendas...</div> : null}
        {slotsByDay.map(([dateKey, daySlots]) => (
          <div key={dateKey} className={styles.salesAgendaDay}>
            <div className={styles.salesAgendaDayHeader}>
              <strong>{formatDayLabel(dateKey)}</strong>
              <span>{daySlots.length} horários</span>
            </div>
            <div className={styles.salesAgendaSlotList}>
              {daySlots.map((slot) => {
                const slotLeads = plannedBySlot.get(slot.dateTime) || [];
                return (
                  <div
                    key={slot.key}
                    className={styles.salesAgendaSlot}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragLeadId) moveLeadToSlot(dragLeadId, slot.dateTime);
                      setDragLeadId(null);
                    }}
                  >
                    <span>{slot.time}</span>
                    {slotLeads.map((lead) => (
                      <article
                        key={lead.id}
                        className={styles.salesAgendaLeadCard}
                        draggable
                        onDragStart={() => setDragLeadId(lead.id)}
                        onDragEnd={() => setDragLeadId(null)}
                      >
                        <strong>{lead.name || "Lead sem nome"}</strong>
                        <small>{lead.nextAction || lead.statusLabel} · {fixedLeadIds.has(lead.id) ? "manual" : formatDateTime(plan[lead.id])}</small>
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className={styles.salesAgendaBacklog}>
          <div className={styles.salesAgendaDayHeader}>
            <strong>Sem encaixe</strong>
            <span>{leads.filter((lead) => !plan[lead.id]).length} cards</span>
          </div>
          {leads.filter((lead) => !plan[lead.id]).map((lead) => (
            <article
              key={lead.id}
              className={styles.salesAgendaLeadCard}
              draggable
              onDragStart={() => setDragLeadId(lead.id)}
              onDragEnd={() => setDragLeadId(null)}
            >
              <strong>{lead.name || "Lead sem nome"}</strong>
              <small>{lead.sourceBlock === "overdue" ? "Atrasado" : lead.statusLabel}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function BotAgendaTab({
  agendaConfig,
  loadingAgenda,
  canManageAgenda,
  currentUserEmail,
  currentUserName,
  onAddGroup,
  onRemoveGroup,
  onResetBotAgenda,
  onLinkCurrentUser,
  onUpdateGroup,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
}: Omit<AgendaStudioModalProps, "initialTab" | "onClose" | "savingAgenda" | "onSaveBotAgenda">) {
  const [selectedGroupId, setSelectedGroupId] = useState(agendaConfig.groups[0]?.id || "");
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const selectedGroupIdSafe = agendaConfig.groups.some((group) => group.id === selectedGroupId)
    ? selectedGroupId
    : agendaConfig.groups[0]?.id || "";
  const selectedGroup = agendaConfig.groups.find((group) => group.id === selectedGroupIdSafe) || agendaConfig.groups[0] || null;

  if (loadingAgenda) return <div className={styles.emptyState}>Carregando Agenda Bot...</div>;

  return (
    <div className={styles.agendaStudioTabBody}>
      <section className={styles.botAgendaLayout}>
        <div className={styles.botAgendaGuideList}>
          <div className={styles.botAgendaListHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Agenda Bot</span>
              <strong>Guias do bot</strong>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!canManageAgenda}
                onClick={() => {
                  if (!window.confirm("Resetar a Agenda Bot para a guia padrão Técnicos? As guias antigas serão removidas da configuração local e você ainda precisa salvar.")) return;
                  onResetBotAgenda();
                  setSelectedGroupId(DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups[0]?.id || "");
                  setDeleteMessage(null);
                }}
              >
                Resetar padrão
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onAddGroup} disabled={!canManageAgenda}>Nova guia</button>
            </div>
          </div>
          {agendaConfig.groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`${styles.botAgendaGuideCard} ${selectedGroup?.id === group.id ? styles.botAgendaGuideCardActive : ""}`}
              onClick={() => {
                setSelectedGroupId(group.id);
                setDeleteMessage(null);
              }}
            >
              <span style={{ background: group.accentColor }} />
              <div>
                <strong>{group.title}</strong>
                <small>{group.isActive ? "Ativa" : "Inativa"} · {group.slots.filter((slot) => slot.enabled).length} horários · {formatAgendaPreview(group) || "Sem horários"}</small>
              </div>
            </button>
          ))}
        </div>

        {selectedGroup ? (
          <div className={styles.botAgendaEditor}>
            <div className={styles.botAgendaEditorHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Guia selecionada</span>
                <strong>{selectedGroup.title}</strong>
              </div>
              <div className={styles.headerActions}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!canManageAgenda} onClick={() => onUpdateGroup(selectedGroup.id, "isActive", !selectedGroup.isActive)}>
                  {selectedGroup.isActive ? "Desativar" : "Ativar"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={!canManageAgenda}
                  onClick={() => {
                    const result = canDeleteAgendaGuide(selectedGroup);
                    if (!result.allowed) {
                      setDeleteMessage(result.reason);
                      return;
                    }
                    if (!window.confirm(`Excluir a guia "${selectedGroup.title}"? Esta ação remove a guia da Agenda Bot.`)) {
                      return;
                    }
                    onRemoveGroup(selectedGroup.id);
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>

            {deleteMessage ? <div className={styles.inlineNote}>{deleteMessage}</div> : null}

            <div className={styles.botAgendaFormGrid}>
              <label>
                <span>Nome</span>
                <input className="field" value={selectedGroup.title} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "title", event.target.value)} />
              </label>
              <label>
                <span>Botão no bot</span>
                <input className="field" value={selectedGroup.buttonLabel} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "buttonLabel", event.target.value)} />
              </label>
              <label>
                <span>Cor</span>
                <input className="field" type="color" value={selectedGroup.accentColor} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "accentColor", event.target.value)} />
              </label>
              <label>
                <span>Slots sugeridos</span>
                <input className="field" type="number" min={1} max={10} value={selectedGroup.suggestedSlotsCount} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "suggestedSlotsCount", Number(event.target.value) || 3)} />
              </label>
            </div>

            <details className={styles.botAgendaAdvanced}>
              <summary>Avançado</summary>
              <div className={styles.botAgendaFormGrid}>
                <label>
                  <span>Slug</span>
                  <input className="field" value={selectedGroup.slug} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "slug", event.target.value)} />
                </label>
                <label>
                  <span>Agenda vinculada</span>
                  <input className="field" value={selectedGroup.linkedAgendaId} disabled={!canManageAgenda} onChange={(event) => onUpdateGroup(selectedGroup.id, "linkedAgendaId", event.target.value)} />
                </label>
              </div>
            </details>

            <div className={styles.salesAgendaWeekdays}>
              {WEEKDAY_OPTIONS.map((day) => {
                const checked = selectedGroup.workdays.includes(day.value);
                return (
                  <label key={day.value} className={`${styles.weekdayChip} ${checked ? styles.weekdayChipActive : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canManageAgenda || (checked && selectedGroup.workdays.length === 1)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...selectedGroup.workdays, day.value]
                          : selectedGroup.workdays.filter((item) => item !== day.value);
                        onUpdateGroup(selectedGroup.id, "workdays", WEEKDAY_ORDER.filter((item) => next.includes(item)));
                      }}
                    />
                    <span>{day.label}</span>
                  </label>
                );
              })}
            </div>

            <div className={styles.botAgendaSlotsHeader}>
              <strong>Horários configurados</strong>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!canManageAgenda} onClick={() => onAddSlot(selectedGroup.id)}>Adicionar horário</button>
            </div>

            <div className={styles.botAgendaSlotList}>
              {selectedGroup.slots.map((slot) => (
                <article key={slot.id} className={styles.botAgendaSlotRow}>
                  <input className="field" value={slot.label} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, slot.id, "label", event.target.value)} />
                  <select className="field" value={slot.dayOfWeek} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, slot.id, "dayOfWeek", Number(event.target.value))}>
                    {WEEKDAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                  </select>
                  <input className="field" type="time" value={slot.startTime} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, slot.id, "startTime", event.target.value)} />
                  <input className="field" type="time" value={slot.endTime} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, slot.id, "endTime", event.target.value)} />
                  <label className={styles.switchRow}>
                    <input type="checkbox" checked={slot.enabled} disabled={!canManageAgenda} onChange={(event) => onUpdateSlot(selectedGroup.id, slot.id, "enabled", event.target.checked)} />
                    <span>Ativo</span>
                  </label>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!canManageAgenda} onClick={() => onRemoveSlot(selectedGroup.id, slot.id)}>Remover</button>
                </article>
              ))}
              {!selectedGroup.slots.length ? <div className={styles.emptyState}>Sem horários configurados.</div> : null}
            </div>

            <div className={styles.botAgendaLinkedAccount}>
              <div>
                <span className={styles.sectionEyebrow}>Conta vinculada</span>
                <strong>{selectedGroup.linkedUserName || "Sem responsável"}</strong>
                <small>{selectedGroup.linkedEmail || "Nenhum e-mail conectado"}</small>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!canManageAgenda || !currentUserEmail} onClick={() => onLinkCurrentUser(selectedGroup.id)}>
                {currentUserName ? `Usar ${currentUserName}` : "Usar meu e-mail"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>Nenhuma guia cadastrada.</div>
        )}
      </section>
    </div>
  );
}

export default function AgendaStudioModal(props: AgendaStudioModalProps) {
  const allowSalesTab = Boolean(props.allowSalesTab);
  const initialCompatibleTab = props.initialTab === "sales" && allowSalesTab ? "sales" : "bot";
  const [tabState, setTabState] = useState<{ source: AgendaStudioTab; value: AgendaStudioTab }>(() => ({
    source: initialCompatibleTab,
    value: initialCompatibleTab,
  }));
  const activeTab = tabState.source === initialCompatibleTab ? tabState.value : initialCompatibleTab;
  const selectTab = (value: AgendaStudioTab) => {
    setTabState({ source: initialCompatibleTab, value });
  };

  return (
    <div className={`${styles.botStudioOverlay} ${styles.botStudioOverlayActive}`}>
      <div className={`${styles.botStudioFrame} ${styles.botStudioFrameActive} ${styles.agendaStudioFrame}`}>
        <div className={`${styles.botStudioChrome} ${styles.agendaStudioChrome}`}>
          <div>
            <p className={styles.botStudioChromeEyebrow}>Agenda</p>
            <strong>{activeTab === "sales" ? "Agenda Vendas" : "Agenda Bot"}</strong>
          </div>
          {allowSalesTab ? (
            <div className={styles.agendaStudioHeaderTabs} role="tablist" aria-label="Tipo de agenda">
              <button type="button" className={activeTab === "sales" ? styles.agendaStudioHeaderTabActive : ""} onClick={() => selectTab("sales")}>Agenda Vendas</button>
              <button type="button" className={activeTab === "bot" ? styles.agendaStudioHeaderTabActive : ""} onClick={() => selectTab("bot")}>Agenda Bot</button>
            </div>
          ) : (
            <span className={styles.metaBadge}>Agenda Bot separada da Agenda Vendas</span>
          )}
          <div className={styles.headerActions}>
            {activeTab === "bot" && props.botAgendaDirty ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={props.onSaveBotAgenda} disabled={props.savingAgenda || !props.canManageAgenda}>
                {props.savingAgenda ? "Salvando..." : "Salvar"}
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary btn-sm" onClick={props.onClose}>Fechar</button>
          </div>
        </div>
        <div className={`${styles.botStudioBody} ${styles.agendaStudioBody}`}>
          {activeTab === "sales" ? <SalesAgendaTab /> : <BotAgendaTab {...props} />}
        </div>
      </div>
    </div>
  );
}
