"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

import { getAdminRouteAdjustments, prepareAdminRoute } from "../../entrega/admin-logistica-api";
import styles from "./route-builder.module.css";
import {
  getAgendaDayPreview,
  getWeeklyAgenda,
  type AgendaDayPreview,
  type AgendaWeekday,
} from "./weekly-agenda-api";

type Step = "home" | "saved" | "days" | "order" | "manual";

type RouteModelStop = {
  customerProfileId: string;
  localId?: string | null;
  itens?: Array<{
    productId: number;
    qtd: number;
    valorUnit: number;
  }>;
};

type RouteModel = {
  id: string;
  nome: string;
  diaSemana?: number | null;
  paradas?: RouteModelStop[];
};

type PreviewItem = {
  productId: number;
  nome: string;
  qtd: number;
  valorUnit?: number | null;
};

type PreviewCustomer = {
  customerProfileId: string;
  nome: string;
  localId: string | null;
  localApelido: string | null;
  lat: number | null;
  lng: number | null;
  itens: PreviewItem[];
};

type DayPreview = {
  date: string;
  clientes: PreviewCustomer[];
};

type AgendaSource = "AGENDA_V2" | "LEGADO";

type RouteForOrdering = {
  items: Array<{
    id: string;
    customerProfileId?: string | null;
    localId?: string | null;
    localApelido?: string | null;
    cliente: { id: string };
  }>;
};

type GenerateSavedRouteResult = {
  deliveryIds?: string[];
  avisos?: string[];
};

const WEEK_DAYS = [
  { n: 1, label: "SEG" },
  { n: 2, label: "TER" },
  { n: 3, label: "QUA" },
  { n: 4, label: "QUI" },
  { n: 5, label: "SEX" },
  { n: 6, label: "SÁB" },
  { n: 7, label: "DOM" },
];

function operationalDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isoWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

function dateForWeekday(day: number, extraWeeks = 0): string {
  const today = operationalDate();
  const date = new Date(`${today}T00:00:00Z`);
  const delta = (day - isoWeekday(today) + 7) % 7 + Math.max(0, extraWeeks) * 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function previewKey(customer: PreviewCustomer): string {
  return `${customer.customerProfileId}:${customer.localId || ""}`;
}

function mergePreviews(previews: DayPreview[]): PreviewCustomer[] {
  const merged = new Map<string, PreviewCustomer>();
  previews.forEach((preview) => preview.clientes.forEach((customer) => {
    const key = previewKey(customer);
    const current = merged.get(key) || { ...customer, itens: [] };
    const items = new Map(current.itens.map((item) => [String(item.productId), { ...item }]));
    customer.itens.forEach((item) => {
      const existing = items.get(String(item.productId));
      items.set(
        String(item.productId),
        existing ? { ...existing, qtd: Number(existing.qtd || 0) + Number(item.qtd || 0) } : { ...item },
      );
    });
    current.itens = [...items.values()];
    merged.set(key, current);
  }));
  return [...merged.values()];
}

function normalizeAgendaPreview(result: AgendaDayPreview): DayPreview {
  return {
    date: result.date,
    clientes: result.paradas.map((stop) => ({
      customerProfileId: stop.customerProfileId,
      nome: stop.cliente.nome || "Cliente",
      localId: stop.localId,
      localApelido: stop.local?.apelido ?? null,
      lat: stop.local?.lat ?? null,
      lng: stop.local?.lng ?? null,
      itens: stop.itens.map((item) => ({
        productId: item.productId,
        nome: item.nome,
        qtd: item.qtd,
        valorUnit: item.valorUnit,
      })),
    })),
  };
}

async function fetchDayPreview(source: AgendaSource, day: number, date: string): Promise<DayPreview> {
  if (source === "AGENDA_V2") {
    return normalizeAgendaPreview(await getAgendaDayPreview(day as AgendaWeekday, date));
  }
  return apiFetch<DayPreview>(`/logistica/dia-preview?date=${encodeURIComponent(date)}`);
}

function humanError(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível montar a rota.";
}

function itemsLabel(customer: PreviewCustomer): string {
  return customer.itens.map((item) => `${item.qtd} ${item.nome}`).join(" · ") || "Sem itens";
}

function snapshotItems(customer: PreviewCustomer): Array<{ productId: number; qtd: number; valorUnit: number }> {
  if (!customer.itens.length) {
    throw new Error(`Revise os preços de ${customer.nome || "um cliente"} antes de salvar esta rota.`);
  }
  return customer.itens.map((item) => {
    const valorUnit = item.valorUnit;
    if (
      !Number.isInteger(item.productId)
      || item.productId <= 0
      || !Number.isInteger(item.qtd)
      || item.qtd <= 0
      || typeof valorUnit !== "number"
      || !Number.isFinite(valorUnit)
      || valorUnit < 0
    ) {
      throw new Error(`Revise os preços de ${customer.nome || "um cliente"} antes de salvar esta rota.`);
    }
    return {
      productId: item.productId,
      qtd: item.qtd,
      valorUnit,
    };
  });
}

function routeItemMatches(customer: PreviewCustomer, item: RouteForOrdering["items"][number]): boolean {
  const profileId = item.customerProfileId || item.cliente.id;
  if (String(profileId) !== String(customer.customerProfileId)) return false;
  if (!customer.localId) return true;
  if (item.localId && String(item.localId) === String(customer.localId)) return true;
  if (customer.localApelido && item.localApelido) return customer.localApelido === item.localApelido;
  return !item.localId;
}

function ManualPositionInput({
  name,
  position,
  max,
  disabled,
  onMove,
}: {
  name: string;
  position: number;
  max: number;
  disabled: boolean;
  onMove: (position: number) => void;
}) {
  const [draft, setDraft] = useState(String(position));
  const skipBlurCommit = useRef(false);

  function commit() {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false;
      setDraft(String(position));
      return;
    }
    const parsed = Math.trunc(Number(draft));
    if (!Number.isFinite(parsed) || parsed < 1) {
      setDraft(String(position));
      return;
    }
    const next = Math.min(max, parsed);
    setDraft(String(next));
    if (next !== position) onMove(next);
  }

  return (
    <label className={styles.positionEditor}>
      <span aria-hidden>#</span>
      <input
        value={draft}
        inputMode="numeric"
        type="number"
        min={1}
        max={max}
        aria-label={`Posição de ${name}`}
        disabled={disabled}
        onFocus={(event) => {
          skipBlurCommit.current = false;
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            skipBlurCommit.current = true;
            setDraft(String(position));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export function RouteBuilderDialog({
  onClose,
  onCompleted,
}: {
  onClose: () => void;
  onCompleted: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>("home");
  const [models, setModels] = useState<RouteModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [agendaSource, setAgendaSource] = useState<AgendaSource>("LEGADO");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [sourceDates, setSourceDates] = useState<Record<number, string>>({});
  const [dayCounts, setDayCounts] = useState<Record<number, number | null | undefined>>({});
  const [preview, setPreview] = useState<PreviewCustomer[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [saveManual, setSaveManual] = useState(false);
  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<RouteModel[]>("/logistica/rota-modelos")
      .then((savedModels) => {
        if (!cancelled) setModels(Array.isArray(savedModels) ? savedModels : []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(humanError(loadError));
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    getWeeklyAgenda()
      .then((agenda) => {
        if (cancelled) return;
        if (agenda.modo === "AGENDA_V2" && agenda.agendaV2Ativa) {
          setAgendaSource("AGENDA_V2");
          setDayCounts(Object.fromEntries(WEEK_DAYS.map((day) => {
            const summary = agenda.dias.find((item) => item.diaSemana === day.n);
            return [day.n, summary?.totalParadas ?? 0];
          })));
        } else {
          setAgendaSource("LEGADO");
        }
      })
      .catch(() => {
        if (!cancelled) setAgendaSource("LEGADO");
      })
      .finally(() => {
        if (!cancelled) setAgendaLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !building) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [building, onClose]);

  const visiblePreview = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return preview;
    return preview.filter((customer) => `${customer.nome} ${customer.localApelido || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [preview, search]);

  const visibleManualOrder = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return manualOrder;
    return manualOrder.filter((key) => {
      const customer = preview.find((item) => previewKey(item) === key);
      return customer
        ? `${customer.nome} ${customer.localApelido || ""} ${itemsLabel(customer)}`.toLocaleLowerCase("pt-BR").includes(query)
        : false;
    });
  }, [manualOrder, preview, search]);

  async function loadDayCounts(days: number[]) {
    if (agendaSource === "AGENDA_V2") return;
    setDayCounts(Object.fromEntries(days.map((day) => [day, undefined])));
    await Promise.all(days.map(async (day) => {
      try {
        const result = await fetchDayPreview("LEGADO", day, dateForWeekday(day));
        setDayCounts((current) => ({ ...current, [day]: result.clientes.length }));
      } catch {
        setDayCounts((current) => ({ ...current, [day]: null }));
      }
    }));
  }

  function openDays() {
    setError(null);
    setStep("days");
    void loadDayCounts(WEEK_DAYS.map((day) => day.n));
  }

  async function refreshPreview(days: number[]) {
    const requestId = ++previewRequest.current;
    if (!days.length) {
      setPreview([]);
      setSourceDates({});
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const rows = await Promise.all(days.map(async (day) => {
        const primaryDate = dateForWeekday(day);
        let result = await fetchDayPreview(agendaSource, day, primaryDate);
        let sourceDate = primaryDate;
        if (day === isoWeekday(operationalDate()) && result.clientes.length === 0) {
          const fallbackDate = dateForWeekday(day, 1);
          const fallback = await fetchDayPreview(agendaSource, day, fallbackDate);
          if (fallback.clientes.length) {
            result = fallback;
            sourceDate = fallbackDate;
          }
        }
        return { day, sourceDate, result };
      }));
      if (previewRequest.current !== requestId) return;
      setSourceDates(Object.fromEntries(rows.map((row) => [row.day, row.sourceDate])));
      setPreview(mergePreviews(rows.map((row) => row.result)));
    } catch (previewError: unknown) {
      if (previewRequest.current === requestId) {
        setPreview([]);
        setError(humanError(previewError));
      }
    } finally {
      if (previewRequest.current === requestId) setPreviewLoading(false);
    }
  }

  function toggleDay(day: number) {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((value) => value !== day)
      : [...selectedDays, day].sort((a, b) => a - b);
    setSelectedDays(next);
    void refreshPreview(next);
  }

  function openOrderChoice() {
    setManualOrder(preview.map(previewKey));
    setSearch("");
    setStep("order");
  }

  function moveManual(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= manualOrder.length) return;
    setManualOrder((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function moveManualTo(key: string, position: number) {
    setManualOrder((current) => {
      const from = current.indexOf(key);
      if (from < 0) return current;
      const target = Math.max(0, Math.min(current.length - 1, position - 1));
      if (from === target) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(target, 0, key);
      return next;
    });
  }

  async function saveManualModel() {
    if (!saveManual || selectedDays.length !== 1) return;
    const day = selectedDays[0];
    const stops = manualOrder
      .map((key) => preview.find((customer) => previewKey(customer) === key))
      .filter((customer): customer is PreviewCustomer => !!customer)
      .map((customer) => ({
        customerProfileId: customer.customerProfileId,
        ...(customer.localId ? { localId: customer.localId } : {}),
        itens: snapshotItems(customer),
      }));
    if (!stops.length) return;
    const existing = models.find((model) => Number(model.diaSemana) === day);
    if (existing) {
      await apiFetch(`/logistica/rota-modelos/${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ paradas: stops }),
      });
      return;
    }
    const dayLabel = WEEK_DAYS.find((item) => item.n === day)?.label || "";
    await apiFetch("/logistica/rota-modelos", {
      method: "POST",
      body: JSON.stringify({ nome: `Minha rota de ${dayLabel}`, diaSemana: day, paradas: stops }),
    });
  }

  async function buildFromDays(mode: "automatic" | "manual") {
    if (!selectedDays.length || building) return;
    setBuilding(true);
    setError(null);
    try {
      if (mode === "manual" && saveManual && selectedDays.length === 1) {
        const snapshotCustomers = manualOrder.map((key) => preview.find((customer) => previewKey(customer) === key));
        if (snapshotCustomers.some((customer) => !customer)) {
          throw new Error("Atualize a prévia antes de salvar esta rota.");
        }
        snapshotCustomers.forEach((customer) => snapshotItems(customer as PreviewCustomer));
      }
      const today = operationalDate();
      const selectedSourceDates = selectedDays.map((day) => sourceDates[day] || dateForWeekday(day));
      const adjustments = await getAdminRouteAdjustments(today);
      const pendingDeliveryIds = adjustments.pending
        .filter((item) => item.sourceDate && selectedSourceDates.includes(item.sourceDate))
        .map((item) => item.id);
      const prepared = await prepareAdminRoute({
        operationalDate: today,
        sourceDates: selectedSourceDates,
        pendingDeliveryIds,
      });

      if (mode === "manual") {
        const preparedIds = [...new Set(prepared.plan.paradas.map((stop) => String(stop.id)))];
        const preparedSet = new Set(preparedIds);
        const route = await apiFetch<RouteForOrdering>(`/logistica/rota?date=${encodeURIComponent(today)}`);
        const used = new Set<string>();
        const manualIds = manualOrder.flatMap((key) => {
          const customer = preview.find((item) => previewKey(item) === key);
          if (!customer) return [];
          const match = route.items.find((item) => {
            const id = String(item.id);
            return preparedSet.has(id) && !used.has(id) && routeItemMatches(customer, item);
          });
          if (!match) return [];
          used.add(String(match.id));
          return [String(match.id)];
        });
        if (manualIds.length) {
          await apiFetch("/logistica/rota/planejar", {
            method: "POST",
            body: JSON.stringify({ date: today, deliveryIds: preparedIds, ordemManual: manualIds }),
          });
        }
        await saveManualModel();
      }

      onCompleted("Rota planejada.");
    } catch (buildError: unknown) {
      setError(humanError(buildError));
      setBuilding(false);
    }
  }

  async function buildSavedRoute(model: RouteModel) {
    if (building) return;
    setBuilding(true);
    setError(null);
    try {
      const date = operationalDate();
      const result = await apiFetch<GenerateSavedRouteResult>(`/logistica/rota-modelos/${encodeURIComponent(model.id)}/gerar`, {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      const deliveryIds = [...new Set((result.deliveryIds || []).map(String))];
      if (!deliveryIds.length) throw new Error(result.avisos?.[0] || "Nenhuma entrega para esta rota.");
      await apiFetch("/logistica/rota/planejar", {
        method: "POST",
        body: JSON.stringify({ date, deliveryIds, ordemManual: deliveryIds }),
      });
      const notice = result.avisos?.length
        ? `Rota planejada. ${result.avisos.length === 1 ? result.avisos[0] : `${result.avisos.length} cliente(s) pulado(s).`}`
        : "Rota planejada.";
      onCompleted(notice);
    } catch (buildError: unknown) {
      setError(humanError(buildError));
      setBuilding(false);
    }
  }

  function back() {
    setError(null);
    if (step === "saved" || step === "days") setStep("home");
    else if (step === "order") setStep("days");
    else if (step === "manual") setStep("order");
  }

  const title = step === "saved"
    ? "Rotas Salvas"
    : step === "days"
      ? "Por dia"
      : step === "order"
        ? "Ordem das paradas"
        : step === "manual"
          ? "Sua ordem"
          : "Montar Rota";

  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !building) onClose(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="route-builder-title">
        <header className={styles.header}>
          <span className={styles.icon}><I d={ICONS.logistica} size={20} /></span>
          <div className={styles.heading}>
            <h2 id="route-builder-title">{title}</h2>
            {step === "days" && <p>Escolha os dias</p>}
            {step === "order" && <p>{preview.length} {preview.length === 1 ? "parada pronta" : "paradas prontas"}</p>}
            {step === "manual" && <p>Busque ou digite a posição</p>}
          </div>
          <button type="button" className={styles.close} aria-label="Fechar" onClick={onClose} disabled={building}>×</button>
        </header>

        <div className={styles.body}>
          {error && <p className={styles.error}>{error}</p>}

          {step === "home" && (
            <div className={styles.homeActions}>
              <button type="button" className={styles.option} onClick={() => setStep("saved")} disabled={modelsLoading || building}>
                <span className={`${styles.optionIcon} ${styles.star}`}>☆</span>
                <span className={styles.optionCopy}>
                  <strong>Rotas Salvas</strong>
                  <small>{modelsLoading ? "Carregando…" : models.length ? `${models.length} rota${models.length === 1 ? "" : "s"} salva${models.length === 1 ? "" : "s"}` : "Nenhuma salva ainda"}</small>
                </span>
                <span className={styles.chevron}>›</span>
              </button>
              <button type="button" className={styles.option} onClick={openDays} disabled={agendaLoading || building}>
                <span className={styles.optionIcon}><I d={ICONS.logistica} size={19} /></span>
                <span className={styles.optionCopy}>
                  <strong>Por dia</strong>
                  <small>{agendaLoading ? "Carregando…" : "Clientes agendados do dia"}</small>
                </span>
                <span className={styles.chevron}>›</span>
              </button>
            </div>
          )}

          {step === "saved" && (
            <div className={styles.list}>
              {modelsLoading ? <p className={styles.empty}>Carregando rotas salvas…</p> : models.length ? [...models]
                .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                .map((model) => (
                  <button type="button" className={styles.option} key={model.id} onClick={() => void buildSavedRoute(model)} disabled={building}>
                    <span className={`${styles.optionIcon} ${styles.star}`}>☆</span>
                    <span className={styles.optionCopy}>
                      <strong>{model.nome || "Rota"}</strong>
                      <small>{model.paradas?.length || 0} parada(s)</small>
                    </span>
                    <span className={styles.chevron}>›</span>
                  </button>
                )) : <p className={styles.empty}>Nenhuma rota salva.</p>}
            </div>
          )}

          {step === "days" && (
            <>
              <div className={styles.dayList}>
                {WEEK_DAYS.map((day) => {
                  const count = dayCounts[day.n];
                  const selected = selectedDays.includes(day.n);
                  return (
                    <button type="button" className={`${styles.dayRow} ${selected ? styles.selected : ""}`} key={day.n} aria-pressed={selected} onClick={() => toggleDay(day.n)} disabled={building}>
                      <strong>{day.label}</strong>
                      {count === undefined ? <span className={styles.countSkeleton} aria-label="Carregando" /> : count === null ? <span /> : <span>{count} {count === 1 ? "cliente" : "clientes"}</span>}
                    </button>
                  );
                })}
              </div>

              {selectedDays.length > 0 && (
                <div className={styles.summary}>
                  <strong>{preview.length}</strong>
                  <span>{preview.length === 1 ? "parada" : "paradas"} em {selectedDays.length} {selectedDays.length === 1 ? "dia" : "dias"}</span>
                </div>
              )}

              <label className={styles.search}>
                <span aria-hidden>⌕</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente na prévia" />
              </label>

              {previewLoading && !preview.length ? <p className={styles.empty}>Carregando clientes…</p> : !selectedDays.length ? <p className={styles.empty}>Escolha ao menos um dia.</p> : visiblePreview.length ? (
                <div className={styles.previewList}>
                  {visiblePreview.map((customer) => (
                    <div className={styles.previewRow} key={previewKey(customer)}>
                      <span className={styles.avatar}>{customer.nome.trim().slice(0, 1).toLocaleUpperCase("pt-BR") || "C"}</span>
                      <span className={styles.previewCopy}>
                        <strong>{customer.nome || "Cliente"}{customer.localApelido ? ` · ${customer.localApelido}` : ""}</strong>
                        <small>{itemsLabel(customer)}</small>
                      </span>
                      {(typeof customer.lat !== "number" || typeof customer.lng !== "number") && <b className={styles.gpsWarning}>GPS</b>}
                    </div>
                  ))}
                </div>
              ) : <p className={styles.empty}>Nenhum cliente nos dias escolhidos.</p>}
            </>
          )}

          {step === "order" && (
            <div className={styles.homeActions}>
              <button type="button" className={styles.option} onClick={() => { setSaveManual(false); setSearch(""); setStep("manual"); }} disabled={building}>
                <span className={styles.optionIcon}>↕</span>
                <span className={styles.optionCopy}>
                  <strong>Minha ordem</strong>
                  <small>Você organiza a sequência das paradas</small>
                </span>
                <span className={styles.chevron}>›</span>
              </button>
              <button type="button" className={styles.option} onClick={() => void buildFromDays("automatic")} disabled={building}>
                <span className={styles.optionIcon}>✨</span>
                <span className={styles.optionCopy}>
                  <strong>Automática <b className={styles.optionalBadge}>Opcional</b></strong>
                  <small>Sugere o caminho mais curto</small>
                </span>
                <span className={styles.chevron}>›</span>
              </button>
            </div>
          )}

          {step === "manual" && (
            <>
              <label className={styles.search}>
                <span aria-hidden>⌕</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar na ordem" aria-label="Buscar cliente na ordem manual" />
              </label>
              {visibleManualOrder.length ? (
                <div className={styles.manualList}>
                  {visibleManualOrder.map((key) => {
                    const customer = preview.find((item) => previewKey(item) === key);
                    const index = manualOrder.indexOf(key);
                    if (!customer || index < 0) return null;
                    return (
                      <div className={styles.orderRow} key={key}>
                        <ManualPositionInput
                          key={`${key}:${index}`}
                          name={customer.nome}
                          position={index + 1}
                          max={manualOrder.length}
                          disabled={building}
                          onMove={(position) => moveManualTo(key, position)}
                        />
                        <span className={styles.previewCopy}>
                          <strong>{customer.nome}{customer.localApelido ? ` · ${customer.localApelido}` : ""}</strong>
                          <small>{itemsLabel(customer)}</small>
                        </span>
                        <span className={styles.arrows}>
                          <button type="button" onClick={() => moveManual(index, -1)} disabled={index === 0 || building} aria-label={`Mover ${customer.nome} para cima`}>▲</button>
                          <button type="button" onClick={() => moveManual(index, 1)} disabled={index === manualOrder.length - 1 || building} aria-label={`Mover ${customer.nome} para baixo`}>▼</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : <p className={styles.empty}>Nenhuma parada encontrada.</p>}
            </>
          )}
        </div>

        {step !== "home" && (
          <footer className={styles.footer}>
            {step === "manual" && selectedDays.length === 1 && manualOrder.length > 0 && (
              <label className={styles.saveRoute}>
                <span>Salvar como minha rota de {WEEK_DAYS.find((day) => day.n === selectedDays[0])?.label}</span>
                <input type="checkbox" checked={saveManual} onChange={(event) => setSaveManual(event.target.checked)} disabled={building} />
              </label>
            )}
            <div className={styles.footerActions}>
              <button type="button" className={styles.secondary} onClick={back} disabled={building}>Voltar</button>
              {step === "days" && <button type="button" className={styles.primary} onClick={openOrderChoice} disabled={!selectedDays.length || !preview.length || previewLoading || building}>Próximo ›</button>}
              {step === "manual" && <button type="button" className={styles.primary} onClick={() => void buildFromDays("manual")} disabled={!manualOrder.length || building}>{building ? "Montando…" : "Gerar agora"}</button>}
            </div>
          </footer>
        )}

        {building && step !== "manual" && <div className={styles.busy} role="status">Montando a rota…</div>}
      </section>
    </div>
  );
}
