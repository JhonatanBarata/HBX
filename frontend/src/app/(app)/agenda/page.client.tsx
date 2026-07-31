"use client";

import { useRouter } from "next/navigation";
import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import {
  HbxContextEmpty,
  HbxContextFact,
  HbxContextFacts,
  HbxContextHeader,
  HbxContextHero,
  HbxPanelShell,
} from "@/components/hbx/panel-shell";
import {
  currentUserDisplayName,
  I,
  ICONS,
  useCurrentUser,
} from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type Atividade = {
  id: string;
  leadId: string;
  leadNome?: string | null;
  tipo: string;
  titulo: string;
  vencimento: string | null;
  duracao: number | null;
  diaInteiro: boolean;
  responsavelId: number | null;
  realizadaEm: string | null;
  resultado: string | null;
  pendente: boolean;
  atrasada: boolean;
  criadaPor: string;
};

type CardOpcao = { id: string; name: string | null };

type AgendaResponse = {
  ok?: boolean;
  counts?: { atrasadas: number; hoje: number; semana: number };
  atrasadas?: Atividade[];
  hoje?: Atividade[];
  semana?: Atividade[];
} | null;

type CalendarView = "day" | "week" | "month";

type EventPosition = {
  atividade: Atividade;
  top: number;
  height: number;
  left: number;
  width: number;
};

const TIPO_META: Record<string, { label: string; icon: keyof typeof ICONS }> = {
  ligacao: { label: "Ligação", icon: "atend" },
  reuniao: { label: "Reunião", icon: "users" },
  visita: { label: "Visita", icon: "mapin" },
  mensagem: { label: "Mensagem", icon: "msg" },
};

const TIPOS = ["ligacao", "reuniao", "visita", "mensagem"] as const;
const CALENDAR_START_HOUR = 6;
const CALENDAR_END_HOUR = 22;
const CALENDAR_HOUR_HEIGHT = 64;
const CALENDAR_HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, index) => CALENDAR_START_HOUR + index,
);
const VIEW_LABEL: Record<CalendarView, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
};

function tipoLabel(tipo: string) {
  return TIPO_META[tipo]?.label || tipo;
}

function origemLabel(origem: string) {
  if (origem === "user") return "Usuário";
  if (origem === "ia") return "IA";
  if (origem === "automacao") return "Automação";
  return origem || "—";
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function addMonths(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  return date;
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

function dateKey(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function activityDate(atividade: Atividade) {
  if (!atividade.vencimento) return null;
  const date = new Date(atividade.vencimento);
  return Number.isNaN(date.getTime()) ? null : date;
}

function durationMinutes(atividade: Atividade) {
  return Math.max(15, Math.min(480, atividade.duracao ?? 30));
}

function fmtVenc(iso: string | null, diaInteiro: boolean) {
  if (!iso) return "Sem data";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sem data";
  if (diaInteiro) {
    return capitalize(date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    }));
  }
  return capitalize(date.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }));
}

function fmtTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtTimeRange(atividade: Atividade) {
  const start = activityDate(atividade);
  if (!start) return "Horário não informado";
  if (atividade.diaInteiro) return "Dia inteiro";
  const end = new Date(start.getTime() + durationMinutes(atividade) * 60_000);
  return `${fmtTime(start)} — ${fmtTime(end)}`;
}

function durationLabel(atividade: Atividade) {
  if (atividade.diaInteiro) return "Dia inteiro";
  const minutes = durationMinutes(atividade);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultVencInput(): string {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function calendarTitle(view: CalendarView, anchor: Date) {
  if (view === "day") {
    return capitalize(anchor.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }));
  }
  if (view === "month") {
    return capitalize(anchor.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    }));
  }

  const start = startOfWeek(anchor);
  const end = addDays(start, 4);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} — ${end.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}`;
  }
  return `${start.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })} — ${end.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridEnd = addDays(startOfWeek(last), 6);
  const minimumEnd = addDays(gridStart, 34);
  const finalDay = gridEnd < minimumEnd ? minimumEnd : gridEnd;
  const days: Date[] = [];
  for (let cursor = gridStart; cursor <= finalDay; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

function positionEvents(atividades: Atividade[]): EventPosition[] {
  const source = atividades
    .map((atividade) => {
      const date = activityDate(atividade);
      if (!date) return null;
      const start = date.getHours() * 60 + date.getMinutes();
      return {
        atividade,
        start,
        end: start + durationMinutes(atividade),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const positioned: EventPosition[] = [];
  let cluster: typeof source = [];
  let clusterEnd = -1;

  function flushCluster() {
    if (!cluster.length) return;
    const trackEnds: number[] = [];
    const tracked = cluster.map((item) => {
      let track = trackEnds.findIndex((end) => end <= item.start);
      if (track === -1) {
        track = trackEnds.length;
        trackEnds.push(item.end);
      } else {
        trackEnds[track] = item.end;
      }
      return { ...item, track };
    });
    const tracks = Math.max(1, trackEnds.length);

    for (const item of tracked) {
      const rawTop = ((item.start - CALENDAR_START_HOUR * 60) / 60) * CALENDAR_HOUR_HEIGHT;
      const top = Math.max(0, Math.min(
        (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_HOUR_HEIGHT - 28,
        rawTop,
      ));
      const available = (
        (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_HOUR_HEIGHT
        - top
      );
      const height = Math.max(28, Math.min(
        (durationMinutes(item.atividade) / 60) * CALENDAR_HOUR_HEIGHT,
        available,
      ));
      positioned.push({
        atividade: item.atividade,
        top,
        height,
        left: (item.track / tracks) * 100,
        width: 100 / tracks,
      });
    }
    cluster = [];
    clusterEnd = -1;
  }

  for (const item of source) {
    if (cluster.length && item.start >= clusterEnd) flushCluster();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flushCluster();
  return positioned;
}

function eventStyle(position: EventPosition): CSSProperties {
  return {
    "--age-event-top": `${position.top}px`,
    "--age-event-height": `${position.height}px`,
    "--age-event-left": `${position.left}%`,
    "--age-event-width": `${position.width}%`,
  } as CSSProperties;
}

function EventBlock({
  position,
  selected,
  onSelect,
}: {
  position: EventPosition;
  selected: boolean;
  onSelect: (atividade: Atividade) => void;
}) {
  const atividade = position.atividade;
  const date = activityDate(atividade);
  return (
    <button
      type="button"
      className={`age-event age-event--${atividade.tipo}${atividade.atrasada ? " is-overdue" : ""}${selected ? " is-selected" : ""}`}
      style={eventStyle(position)}
      onClick={() => onSelect(atividade)}
      aria-label={`${atividade.titulo}, ${date ? fmtTime(date) : "sem horário"}`}
    >
      <span className="age-event__time">{date ? fmtTime(date) : "—"}</span>
      <strong>{atividade.titulo}</strong>
      <small>{atividade.leadNome || tipoLabel(atividade.tipo)}</small>
    </button>
  );
}

export function AgendaClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<AgendaResponse>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tipoFilter, setTipoFilter] = useState("");
  const tipoPill = useGlassPill<HTMLButtonElement>(tipoFilter || "todos");
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [clockNow, setClockNow] = useState(() => new Date());
  const [selectedAtividade, setSelectedAtividade] = useState<Atividade | null>(null);
  const [concluindo, setConcluindo] = useState<Atividade | null>(null);
  const [remarcarInput, setRemarcarInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [novaLeadId, setNovaLeadId] = useState("");
  const [novaLeadNome, setNovaLeadNome] = useState<string | null>(null);
  const [novaTitulo, setNovaTitulo] = useState("");
  const [novaTipo, setNovaTipo] = useState<string>("ligacao");
  const [novaVenc, setNovaVenc] = useState<string>(defaultVencInput());
  const [novaDuracao, setNovaDuracao] = useState("30");
  const [novaBusy, setNovaBusy] = useState(false);
  const [novaError, setNovaError] = useState<string | null>(null);
  const [boardOpcoes, setBoardOpcoes] = useState<CardOpcao[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [pickerBusca, setPickerBusca] = useState("");

  const carregarCards = useCallback(() => {
    setBoardLoading(true);
    setBoardError(null);
    return apiFetch<{ blocks?: Record<string, Array<{ id: string; name?: string | null }>> }>("/vendas/board")
      .then((response) => {
        const seen = new Set<string>();
        const options: CardOpcao[] = [];
        for (const list of Object.values(response?.blocks || {})) {
          for (const card of list || []) {
            if (!card?.id || seen.has(card.id)) continue;
            seen.add(card.id);
            options.push({ id: card.id, name: card.name ?? null });
          }
        }
        options.sort((a, b) => (
          (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" })
        ));
        setBoardOpcoes(options);
      })
      .catch((error: unknown) => {
        setBoardError(error instanceof Error ? error.message : "Não foi possível carregar os cards.");
      })
      .finally(() => setBoardLoading(false));
  }, []);

  useEffect(() => {
    if (!novaOpen) return;
    const frame = requestAnimationFrame(() => { carregarCards(); });
    return () => cancelAnimationFrame(frame);
  }, [novaOpen, carregarCards]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const cardsFiltrados = useMemo(() => {
    const query = pickerBusca.trim().toLowerCase();
    if (!query) return boardOpcoes;
    return boardOpcoes.filter((option) => (
      (option.name || option.id).toLowerCase().includes(query)
    ));
  }, [boardOpcoes, pickerBusca]);

  function escolherCard(option: CardOpcao) {
    setNovaLeadId(option.id);
    setNovaLeadNome(option.name);
    setPickerBusca("");
  }

  function trocarCard() {
    setNovaLeadId("");
    setNovaLeadNome(null);
  }

  const load = useCallback((tipo: string) => {
    setLoading(true);
    const query = tipo ? `?tipo=${encodeURIComponent(tipo)}` : "";
    return apiFetch<AgendaResponse>(`/atividades/agenda${query}`)
      .then((response) => {
        setData(response);
        const refreshed = [
          ...(response?.atrasadas || []),
          ...(response?.hoje || []),
          ...(response?.semana || []),
        ];
        setSelectedAtividade((current) => {
          if (current) {
            return refreshed.find((atividade) => atividade.id === current.id) ?? refreshed[0] ?? null;
          }
          return refreshed[0] ?? null;
        });
        setLoadError(null);
      })
      .catch((error: unknown) => {
        const requestError = error as Error & { status?: number };
        setLoadError(requestError?.message || "Não foi possível carregar a agenda.");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza a tela com a API
    load(tipoFilter);
  }, [load, tipoFilter]);

  const allActivities = useMemo(() => {
    const unique = new Map<string, Atividade>();
    for (const atividade of [
      ...(data?.atrasadas || []),
      ...(data?.hoje || []),
      ...(data?.semana || []),
    ]) {
      unique.set(atividade.id, atividade);
    }
    return [...unique.values()].sort((a, b) => {
      const aTime = activityDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = activityDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [data]);

  const activitiesByDay = useMemo(() => {
    const grouped = new Map<string, Atividade[]>();
    for (const atividade of allActivities) {
      const date = activityDate(atividade);
      if (!date) continue;
      const key = dateKey(date);
      const list = grouped.get(key) || [];
      list.push(atividade);
      grouped.set(key, list);
    }
    return grouped;
  }, [allActivities]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 5 }, (_, index) => addDays(start, index));
  }, [anchorDate]);

  const monthDays = useMemo(() => monthGrid(anchorDate), [anchorDate]);
  const selectedDate = selectedAtividade ? activityDate(selectedAtividade) : null;
  const miniAnchor = selectedDate || anchorDate;
  const miniDays = useMemo(() => monthGrid(miniAnchor), [miniAnchor]);

  const visibleActivities = useMemo(() => {
    if (view === "day") {
      return activitiesByDay.get(dateKey(anchorDate)) || [];
    }
    if (view === "week") {
      const keys = new Set(weekDays.map(dateKey));
      return allActivities.filter((atividade) => {
        const date = activityDate(atividade);
        return date ? keys.has(dateKey(date)) : false;
      });
    }
    return allActivities.filter((atividade) => {
      const date = activityDate(atividade);
      return Boolean(
        date
        && date.getMonth() === anchorDate.getMonth()
        && date.getFullYear() === anchorDate.getFullYear()
      );
    });
  }, [activitiesByDay, allActivities, anchorDate, view, weekDays]);

  useEffect(() => {
    if (view === "month") return;
    const node = calendarScrollRef.current;
    if (!node) return;
    const visibleToday = view === "day"
      ? sameDay(anchorDate, clockNow)
      : weekDays.some((date) => sameDay(date, clockNow));
    const hour = visibleToday
      ? Math.max(CALENDAR_START_HOUR, clockNow.getHours() - 1)
      : 8;
    const frame = requestAnimationFrame(() => {
      node.scrollTop = Math.max(
        0,
        (hour - CALENDAR_START_HOUR) * CALENDAR_HOUR_HEIGHT,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorDate, clockNow, view, weekDays]);

  function activitiesForDay(date: Date) {
    return activitiesByDay.get(dateKey(date)) || [];
  }

  function timedForDay(date: Date) {
    return activitiesForDay(date).filter((atividade) => !atividade.diaInteiro);
  }

  function allDayForDay(date: Date) {
    return activitiesForDay(date).filter((atividade) => atividade.diaInteiro);
  }

  function changePeriod(direction: -1 | 1) {
    setAnchorDate((current) => {
      if (view === "day") return addDays(current, direction);
      if (view === "week") return addDays(current, direction * 7);
      return addMonths(current, direction);
    });
  }

  function goToday() {
    setAnchorDate(startOfDay(new Date()));
  }

  function openDay(date: Date) {
    setAnchorDate(startOfDay(date));
    setView("day");
  }

  function iniciarConclusao(atividade: Atividade) {
    setSelectedAtividade(atividade);
    setConcluindo(atividade);
    setRemarcarInput("");
    setMsg(null);
  }

  function iniciarRemarcacao(atividade: Atividade) {
    setSelectedAtividade(atividade);
    setConcluindo(atividade);
    setRemarcarInput(defaultVencInput());
    setMsg(null);
  }

  async function concluir(atividade: Atividade, resultado: "sim" | "nao" | "remarcar") {
    if (busyId) return;
    if (resultado === "remarcar" && !remarcarInput) {
      setMsg("Escolha a nova data para remarcar.");
      return;
    }
    setBusyId(atividade.id);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { resultado };
      if (resultado === "remarcar") body.remarcarPara = localInputToIso(remarcarInput);
      await apiFetch(`/atividades/${encodeURIComponent(atividade.id)}/concluir`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMsg(
        resultado === "remarcar"
          ? "✓ Atividade remarcada."
          : resultado === "sim"
            ? "✓ Concluída — atendeu."
            : "✓ Concluída — sem interesse.",
      );
      setConcluindo(null);
      setRemarcarInput("");
      await load(tipoFilter);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusyId(null);
    }
  }

  async function remover(atividade: Atividade) {
    if (busyId) return;
    if (!window.confirm(`Remover a atividade “${atividade.titulo}”?`)) return;
    setBusyId(atividade.id);
    setMsg(null);
    try {
      await apiFetch(`/atividades/${encodeURIComponent(atividade.id)}`, { method: "DELETE" });
      setMsg("✓ Atividade removida.");
      await load(tipoFilter);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Não foi possível remover.");
    } finally {
      setBusyId(null);
    }
  }

  function abrirCard(leadId: string) {
    try {
      sessionStorage.setItem("hbx:vendas-focus-lead", leadId);
    } catch {
      // O card ainda abre mesmo sem storage disponível.
    }
    router.push("/vendas");
  }

  async function criarNova() {
    if (novaBusy) return;
    setNovaError(null);
    const iso = localInputToIso(novaVenc);
    if (!novaLeadId.trim()) return setNovaError("Escolha o card.");
    if (!novaTitulo.trim()) return setNovaError("Informe o título da atividade.");
    if (!iso) return setNovaError("Vencimento inválido.");
    setNovaBusy(true);
    try {
      await apiFetch("/atividades", {
        method: "POST",
        body: JSON.stringify({
          leadId: novaLeadId.trim(),
          titulo: novaTitulo.trim(),
          tipo: novaTipo,
          vencimento: iso,
          duracao: Number(novaDuracao),
        }),
      });
      setNovaOpen(false);
      setNovaLeadId("");
      setNovaLeadNome(null);
      setNovaTitulo("");
      setNovaTipo("ligacao");
      setNovaVenc(defaultVencInput());
      setNovaDuracao("30");
      setPickerBusca("");
      setMsg("✓ Atividade criada.");
      await load(tipoFilter);
    } catch (error) {
      setNovaError(error instanceof Error ? error.message : "Não foi possível criar a atividade.");
    } finally {
      setNovaBusy(false);
    }
  }

  const nowTop = (
    ((clockNow.getHours() * 60 + clockNow.getMinutes()) - CALENDAR_START_HOUR * 60)
    / 60
  ) * CALENDAR_HOUR_HEIGHT;
  const nowInRange = nowTop >= 0
    && nowTop <= (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_HOUR_HEIGHT;

  function renderTimeCanvas(days: Date[]) {
    return (
      <>
        <div className="age-calendar__days-head">
          <span className="age-calendar__corner">GMT−3</span>
          {days.map((date) => (
            <button
              type="button"
              key={dateKey(date)}
              className={`age-calendar__day-head${sameDay(date, clockNow) ? " is-today" : ""}`}
              onClick={() => openDay(date)}
            >
              <span>{capitalize(date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""))}</span>
              <strong>{date.getDate()}</strong>
            </button>
          ))}
        </div>

        <div className="age-calendar__all-day">
          <span>Dia inteiro</span>
          {days.map((date) => (
            <div key={dateKey(date)} className="age-calendar__all-day-lane">
              {allDayForDay(date).map((atividade) => (
                <button
                  type="button"
                  key={atividade.id}
                  className={`age-all-day age-event--${atividade.tipo}${selectedAtividade?.id === atividade.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedAtividade(atividade)}
                >
                  {atividade.titulo}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="age-calendar__scroll" ref={calendarScrollRef}>
          <div className="age-calendar__time-canvas">
            <div className="age-calendar__hours" aria-hidden="true">
              {CALENDAR_HOURS.map((hour) => (
                <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
              ))}
            </div>
            <div
              className="age-calendar__lanes"
              data-columns={days.length}
            >
              {days.map((date) => (
                <div key={dateKey(date)} className="age-calendar__lane">
                  {positionEvents(timedForDay(date)).map((position) => (
                    <EventBlock
                      key={position.atividade.id}
                      position={position}
                      selected={selectedAtividade?.id === position.atividade.id}
                      onSelect={setSelectedAtividade}
                    />
                  ))}
                  {sameDay(date, clockNow) && nowInRange ? (
                    <span
                      className="age-calendar__now-line"
                      style={{ "--age-now-top": `${nowTop}px` } as CSSProperties}
                    >
                      <small>{fmtTime(clockNow)}</small>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  const selectedStatus = selectedAtividade?.atrasada
    ? "Atrasada"
    : selectedAtividade?.pendente
      ? "No prazo"
      : "Concluída";

  return (
    <div className="work age-work">
      <header className="age-commandbar">
        <div className="age-commandbar__period">
          <button type="button" className="age-icon-button" onClick={() => changePeriod(-1)} aria-label="Período anterior">
            <I d={ICONS.back} size={13} />
          </button>
          <button type="button" className="age-commandbar__today" onClick={goToday}>Hoje</button>
          <button type="button" className="age-icon-button is-next" onClick={() => changePeriod(1)} aria-label="Próximo período">
            <I d={ICONS.arrow} size={13} />
          </button>
          <span className="age-commandbar__title">{calendarTitle(view, anchorDate)}</span>
        </div>

        <div className="age-commandbar__filters">
          <div className="age-tabs glass-pill-track" aria-label="Filtrar por tipo">
            <GlassPill {...tipoPill} />
            <button
              type="button"
              ref={tipoPill.itemRef("todos")}
              className={`glass-pill-item age-tab${tipoFilter === "" ? " is-on" : ""}`}
              onClick={() => setTipoFilter("")}
            >
              Todos
            </button>
            {TIPOS.map((tipo) => (
              <button
                type="button"
                key={tipo}
                ref={tipoPill.itemRef(tipo)}
                className={`glass-pill-item age-tab${tipoFilter === tipo ? " is-on" : ""}`}
                onClick={() => setTipoFilter(tipo)}
              >
                {tipoLabel(tipo)}
              </button>
            ))}
          </div>
        </div>

        <div className="age-commandbar__actions">
          <div className="age-view-switch" aria-label="Visualização do calendário">
            {(Object.keys(VIEW_LABEL) as CalendarView[]).map((key) => (
              <button
                type="button"
                key={key}
                className={view === key ? "is-on" : ""}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {VIEW_LABEL[key]}
              </button>
            ))}
          </div>
          <button type="button" className="btn-teal age-new-button" onClick={() => setNovaOpen(true)}>
            <I d={ICONS.plus} size={13} />
            Nova atividade
          </button>
        </div>
      </header>

      <HbxPanelShell
        variant="context"
        ariaLabel="Agenda operacional"
        className="age-shell"
        contentClassName="age-shell__content"
        contextLabel="Detalhes da atividade"
        contextClassName="hbx-panel-context--dense age-context"
        main={(
          <>
            <div className="age-calendar__caption">
              <div>
                <strong>{VIEW_LABEL[view]}</strong>
                <span>
                  {visibleActivities.length} atividade{visibleActivities.length === 1 ? "" : "s"} neste período
                </span>
              </div>
              <div className="age-calendar__legend" aria-label="Legenda">
                {TIPOS.map((tipo) => (
                  <span key={tipo} className={`age-legend-dot age-legend-dot--${tipo}`}>
                    {tipoLabel(tipo)}
                  </span>
                ))}
              </div>
            </div>

            <div className={`age-calendar age-calendar--${view}`}>
              {view === "week" ? renderTimeCanvas(weekDays) : null}
              {view === "day" ? renderTimeCanvas([anchorDate]) : null}
              {view === "month" ? (
                <>
                  <div className="age-month__weekdays" aria-hidden="true">
                    {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="age-month__grid">
                    {monthDays.map((date) => {
                      const dayActivities = activitiesForDay(date);
                      return (
                        <div
                          key={dateKey(date)}
                          className={`age-month__day${date.getMonth() !== anchorDate.getMonth() ? " is-outside" : ""}${sameDay(date, clockNow) ? " is-today" : ""}`}
                        >
                          <button type="button" className="age-month__date" onClick={() => openDay(date)}>
                            {date.getDate()}
                          </button>
                          <div className="age-month__events">
                            {dayActivities.slice(0, 3).map((atividade) => (
                              <button
                                type="button"
                                key={atividade.id}
                                className={`age-month-event age-event--${atividade.tipo}${selectedAtividade?.id === atividade.id ? " is-selected" : ""}`}
                                onClick={() => setSelectedAtividade(atividade)}
                              >
                                <span>{atividade.diaInteiro ? "Dia" : activityDate(atividade) ? fmtTime(activityDate(atividade) as Date) : "—"}</span>
                                {atividade.titulo}
                              </button>
                            ))}
                            {dayActivities.length > 3 ? (
                              <button type="button" className="age-month__more" onClick={() => openDay(date)}>
                                +{dayActivities.length - 3} atividade{dayActivities.length - 3 === 1 ? "" : "s"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {loading ? (
                <div className="age-calendar-state">
                  <span className="age-calendar-state__icon"><I d={ICONS.clock} size={19} /></span>
                  <strong>Montando seu calendário…</strong>
                </div>
              ) : null}

              {!loading && loadError ? (
                <div className="age-calendar-state is-error">
                  <span className="age-calendar-state__icon"><I d={ICONS.agenda} size={19} /></span>
                  <strong>A agenda não carregou</strong>
                  <span>{loadError}</span>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => load(tipoFilter)}>
                    Tentar novamente
                  </button>
                </div>
              ) : null}

              {!loading && !loadError && allActivities.length === 0 ? (
                <div className="age-calendar-state">
                  <span className="age-calendar-state__icon"><I d={ICONS.agenda} size={19} /></span>
                  <strong>Seu calendário está livre</strong>
                  <span>Crie uma atividade e ela aparecerá no horário certo.</span>
                  <button type="button" className="btn-teal btn-xs" onClick={() => setNovaOpen(true)}>
                    <I d={ICONS.plus} size={12} /> Nova atividade
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
        context={(
          <>
            <HbxContextHeader
              eyebrow="Agenda"
              title={selectedAtividade ? "Detalhes da atividade" : "Nenhuma atividade selecionada"}
              subtitle={selectedAtividade ? fmtVenc(selectedAtividade.vencimento, selectedAtividade.diaInteiro) : "Escolha um bloco no calendário"}
              status={selectedAtividade ? (
                <span className={`age-status${selectedAtividade.atrasada ? " is-overdue" : ""}`}>
                  {selectedStatus}
                </span>
              ) : undefined}
            />

            {selectedAtividade ? (
              <>
                <div className="age-context__scroll">
                  <HbxContextHero
                    visual={<I d={ICONS[TIPO_META[selectedAtividade.tipo]?.icon || "clock"]} size={20} />}
                    title={selectedAtividade.titulo}
                    subtitle={selectedAtividade.leadNome || selectedAtividade.leadId}
                    meta={`${tipoLabel(selectedAtividade.tipo)} · ${durationLabel(selectedAtividade)}`}
                    trailing={selectedAtividade.criadaPor !== "user" ? (
                      <span className="age-origin">{origemLabel(selectedAtividade.criadaPor)}</span>
                    ) : undefined}
                  />

                  <section className="age-context__schedule">
                    <span className="age-context__schedule-icon"><I d={ICONS.clock} size={17} /></span>
                    <div>
                      <small>Quando</small>
                      <strong>{fmtVenc(selectedAtividade.vencimento, selectedAtividade.diaInteiro)}</strong>
                      <span>{fmtTimeRange(selectedAtividade)} · {durationLabel(selectedAtividade)}</span>
                    </div>
                  </section>

                  <div className="age-context__quick-actions">
                    <button type="button" onClick={() => abrirCard(selectedAtividade.leadId)} disabled={busyId === selectedAtividade.id}>
                      <I d={ICONS.arrow} size={14} /><span>Abrir card</span>
                    </button>
                    {selectedAtividade.pendente ? (
                      <button type="button" onClick={() => iniciarRemarcacao(selectedAtividade)} disabled={busyId === selectedAtividade.id}>
                        <I d={ICONS.agenda} size={14} /><span>Remarcar</span>
                      </button>
                    ) : null}
                    <button type="button" className="is-danger" onClick={() => remover(selectedAtividade)} disabled={busyId === selectedAtividade.id}>
                      <I d={ICONS.trash} size={14} /><span>Remover</span>
                    </button>
                  </div>

                  {concluindo?.id === selectedAtividade.id ? (
                    <section className="age-result-panel">
                      <div>
                        <small>Registrar resultado</small>
                        <strong>Como foi esta atividade?</strong>
                      </div>
                      <div className="age-result-panel__buttons">
                        <button type="button" className="btn-result btn-result--ok" onClick={() => concluir(selectedAtividade, "sim")} disabled={busyId === selectedAtividade.id}>Atendeu</button>
                        <button type="button" className="btn-result btn-result--cold" onClick={() => concluir(selectedAtividade, "nao")} disabled={busyId === selectedAtividade.id}>Não atendeu</button>
                        <button type="button" className="btn-result" onClick={() => concluir(selectedAtividade, "remarcar")} disabled={busyId === selectedAtividade.id}>Remarcar</button>
                      </div>
                      <label className="field-label" htmlFor={`remarcar-${selectedAtividade.id}`}>Nova data, se for remarcar</label>
                      <input
                        id={`remarcar-${selectedAtividade.id}`}
                        type="datetime-local"
                        className="field-dark"
                        value={remarcarInput}
                        onChange={(event) => setRemarcarInput(event.target.value)}
                      />
                      <button
                        type="button"
                        className="age-result-panel__cancel"
                        onClick={() => {
                          setConcluindo(null);
                          setRemarcarInput("");
                        }}
                        disabled={busyId === selectedAtividade.id}
                      >
                        Cancelar
                      </button>
                    </section>
                  ) : null}

                  <HbxContextFacts>
                    <HbxContextFact label="Tipo" value={tipoLabel(selectedAtividade.tipo)} />
                    <HbxContextFact label="Responsável" value={selectedAtividade.responsavelId ? currentUserDisplayName(currentUser) : "Não informado"} />
                    <HbxContextFact label="Origem" value={origemLabel(selectedAtividade.criadaPor)} />
                    <HbxContextFact label="Duração" value={durationLabel(selectedAtividade)} />
                    <HbxContextFact label="Situação" value={selectedStatus} />
                  </HbxContextFacts>

                  <section className="age-context__note">
                    <div>
                      <I d={ICONS.doc} size={13} />
                      <strong>Anotação</strong>
                    </div>
                    <p>Sem anotação adicional nesta atividade.</p>
                  </section>

                  <section className="age-mini">
                    <header>
                      <strong>{capitalize(miniAnchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }))}</strong>
                      <span>{activitiesByDay.size} dia{activitiesByDay.size === 1 ? "" : "s"} com agenda</span>
                    </header>
                    <div className="age-mini__weekdays" aria-hidden="true">
                      {["S", "T", "Q", "Q", "S", "S", "D"].map((day, index) => (
                        <span key={`${day}-${index}`}>{day}</span>
                      ))}
                    </div>
                    <div className="age-mini__grid">
                      {miniDays.map((date) => {
                        const hasActivity = (activitiesByDay.get(dateKey(date)) || []).length > 0;
                        return (
                          <button
                            type="button"
                            key={dateKey(date)}
                            className={`${date.getMonth() !== miniAnchor.getMonth() ? "is-outside " : ""}${sameDay(date, clockNow) ? "is-today " : ""}${selectedDate && sameDay(date, selectedDate) ? "is-selected " : ""}${hasActivity ? "has-activity" : ""}`}
                            onClick={() => openDay(date)}
                          >
                            {date.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <footer className="age-context__footer">
                  <button type="button" className="btn-ghost" onClick={() => abrirCard(selectedAtividade.leadId)} disabled={busyId === selectedAtividade.id}>
                    Abrir card
                  </button>
                  {selectedAtividade.pendente ? (
                    <button type="button" className="btn-teal" onClick={() => iniciarConclusao(selectedAtividade)} disabled={busyId === selectedAtividade.id}>
                      <I d={ICONS.check} size={13} /> Concluir atividade
                    </button>
                  ) : null}
                </footer>
              </>
            ) : (
              <HbxContextEmpty
                icon={<I d={ICONS.agenda} size={20} />}
                title="Escolha uma atividade"
                description="Clique em um compromisso para ver horário, lead e ações."
              />
            )}
          </>
        )}
      />

      {msg ? <div className="hbx-toast age-toast" aria-live="polite">{msg}</div> : null}

      {novaOpen ? (
        <div className="hbx-veil" onClick={() => !novaBusy && setNovaOpen(false)}>
          <div
            className="hbx-modal age-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="age-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="age-modal-title">
              Nova atividade
              <button type="button" className="btn-ghost btn-xs" onClick={() => setNovaOpen(false)} disabled={novaBusy}>
                Fechar
              </button>
            </h3>

            <div className="age-modal__body">
              <div className="age-modal__field">
                <label className="field-label" htmlFor="nova-lead-busca">Card (lead)</label>
                {novaLeadId ? (
                  <div className="age-modal__selected-card">
                    <span className="badge-win">{novaLeadNome || `${novaLeadId.slice(0, 8)}…`}</span>
                    <button type="button" className="btn-ghost btn-xs" onClick={trocarCard}>Trocar</button>
                  </div>
                ) : (
                  <>
                    <input
                      id="nova-lead-busca"
                      className="field-dark"
                      value={pickerBusca}
                      onChange={(event) => setPickerBusca(event.target.value)}
                      placeholder="Buscar card pelo nome…"
                    />
                    {boardLoading ? <span className="age-modal__hint">Carregando cards…</span> : null}
                    {!boardLoading && boardError ? (
                      <div className="age-modal__load-error">
                        <span>{boardError}</span>
                        <button type="button" className="btn-ghost btn-xs" onClick={carregarCards}>Tentar novamente</button>
                      </div>
                    ) : null}
                    {!boardLoading && !boardError && boardOpcoes.length === 0 ? (
                      <span className="age-modal__hint">Nenhum card no seu funil.</span>
                    ) : null}
                    {!boardLoading && !boardError && boardOpcoes.length > 0 ? (
                      <div className="age-modal__cards">
                        {cardsFiltrados.length === 0 ? (
                          <span className="age-modal__hint">Nenhum card encontrado.</span>
                        ) : null}
                        {cardsFiltrados.map((option) => (
                          <button type="button" key={option.id} onClick={() => escolherCard(option)}>
                            <span>{option.name || `${option.id.slice(0, 8)}…`}</span>
                            <I d={ICONS.arrow} size={12} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="age-modal__field">
                <label className="field-label" htmlFor="nova-titulo">Título</label>
                <input
                  id="nova-titulo"
                  className="field-dark"
                  value={novaTitulo}
                  onChange={(event) => setNovaTitulo(event.target.value)}
                />
              </div>

              <div className="age-modal__row">
                <div className="age-modal__field">
                  <label className="field-label" htmlFor="nova-tipo">Tipo</label>
                  <select id="nova-tipo" className="field-dark" value={novaTipo} onChange={(event) => setNovaTipo(event.target.value)}>
                    {TIPOS.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipoLabel(tipo)}</option>
                    ))}
                  </select>
                </div>
                <div className="age-modal__field is-wide">
                  <label className="field-label" htmlFor="nova-venc">Data e horário</label>
                  <input id="nova-venc" type="datetime-local" className="field-dark" value={novaVenc} onChange={(event) => setNovaVenc(event.target.value)} />
                </div>
                <div className="age-modal__field">
                  <label className="field-label" htmlFor="nova-duracao">Duração</label>
                  <select id="nova-duracao" className="field-dark" value={novaDuracao} onChange={(event) => setNovaDuracao(event.target.value)}>
                    {[15, 30, 45, 60, 90, 120].map((minutes) => (
                      <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} min` : `${minutes / 60}h`}</option>
                    ))}
                  </select>
                </div>
              </div>

              {novaError ? <span className="age-modal__error">{novaError}</span> : null}
              <div className="age-modal__footer">
                <button type="button" className="btn-ghost" onClick={() => setNovaOpen(false)} disabled={novaBusy}>Cancelar</button>
                <button type="button" className="btn-teal" onClick={criarNova} disabled={novaBusy}>
                  {novaBusy ? "Criando…" : "Criar atividade"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
