"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";

import {
  applyAgendaLegacy,
  agendaNoticeText,
  createAgendaPlan,
  executeAgendaDayAction,
  getAgendaActionPreview,
  getAgendaCatalogs,
  getAgendaDay,
  getAgendaDivergencias,
  getAgendaImportPreview,
  getAgendaImportSequences,
  getAgendaLegacyPreview,
  getWeeklyAgenda,
  updateAgendaOrder,
  updateAgendaPlan,
  type AgendaAccessType,
  type AgendaActionPreview,
  type AgendaAdditionalType,
  type AgendaCatalogs,
  type AgendaDayAction,
  type AgendaDayDetail,
  type AgendaDaySummary,
  type AgendaDivergencias,
  type AgendaFrequency,
  type AgendaImportarPreview,
  type AgendaLegacyPreview,
  type AgendaOpenDeliveriesAction,
  type AgendaPlan,
  type AgendaPlanPayload,
  type AgendaPlanUpdatePayload,
  type AgendaSequenciaResumo,
  type AgendaStop,
  type AgendaSummary,
  type AgendaWeekday,
  type AgendaWindowType,
} from "./weekly-agenda-api";

const WEEK_DAYS: Array<{ value: AgendaWeekday; short: string; label: string }> = [
  { value: 1, short: "SEG", label: "Segunda" },
  { value: 2, short: "TER", label: "Terça" },
  { value: 3, short: "QUA", label: "Quarta" },
  { value: 4, short: "QUI", label: "Quinta" },
  { value: 5, short: "SEX", label: "Sexta" },
  { value: 6, short: "SÁB", label: "Sábado" },
  { value: 7, short: "DOM", label: "Domingo" },
];

function dateKeyToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function currentWeekday(): AgendaWeekday {
  const weekday = new Date(`${dateKeyToday()}T12:00:00Z`).getUTCDay() || 7;
  return weekday as AgendaWeekday;
}

function dayLabel(day: AgendaWeekday): string {
  return WEEK_DAYS.find((item) => item.value === day)?.label || "Dia";
}

function humanError(error: unknown, fallback = "Não foi possível concluir."): string {
  return error instanceof Error ? error.message : fallback;
}

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function shortTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

function shortUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function windowLabel(stop: Pick<AgendaStop, "janela">): string | null {
  if (!stop.janela) return null;
  const start = shortTime(stop.janela.inicio);
  const end = shortTime(stop.janela.fim);
  const time = start && end ? `${start}–${end}` : start ? `Após ${start}` : end ? `Até ${end}` : "Horário";
  return `${time} · ${stop.janela.tipo === "RIGIDA" ? "Rígida" : "Preferencial"}`;
}

// S4-AVISO-DE-HORARIO — "10:35" na fala do dono ("chega ~10h35, recebe até 10h").
function hourWord(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

// Estimativa v1 (soma simples, sem OSRM) — o tooltip deixa isso explícito e curto.
function etaTooltip(stop: Pick<AgendaStop, "eta" | "janela">): string {
  const chegada = stop.eta ? `Chega ~${hourWord(stop.eta)} (estimativa)` : "";
  const limite = stop.janela?.fim ? `recebe até ${hourWord(stop.janela.fim)}` : "";
  return [chegada, limite].filter(Boolean).join(" · ");
}

function compactChipText(value: string, limit = 34): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1)).trim()}…` : text;
}

function accessChip(stop: Pick<AgendaStop, "acesso">): { text: string; title: string; warning: boolean } | null {
  const access = stop.acesso;
  if (!access) return null;
  const base = access.tipo === "ESCADA"
    ? `Escada${access.andares ? ` · ${access.andares} and.` : ""}`
    : access.tipo === "ELEVADOR"
      ? "Elevador"
      : access.tipo === "TERREO"
        ? "Térreo"
        : "Outro";
  const title = access.observacao?.trim() ? `${base} · ${access.observacao.trim()}` : base;
  return {
    text: compactChipText(title),
    title,
    warning: access.tipo === "ESCADA" || access.tipo === "OUTRO",
  };
}

function additionalChip(stop: Pick<AgendaStop, "adicional">): { text: string; title: string } | null {
  if (!stop.adicional) return null;
  const value = `+${formatMoney(stop.adicional.valor)}${stop.adicional.tipo === "POR_UNIDADE" ? "/un" : ""}`;
  const title = stop.adicional.motivo?.trim() ? `${value} · ${stop.adicional.motivo.trim()}` : value;
  return { text: compactChipText(title), title };
}

function addressLabel(stop: Pick<AgendaStop, "local" | "cliente">): string {
  const place = stop.local ?? stop.cliente;
  const street = [place?.endereco, place?.numero].filter(Boolean).join(", ");
  const city = [place?.bairro, place?.cidade].filter(Boolean).join(" · ");
  return (stop.local?.apelido) || [street, city].filter(Boolean).join(" — ") || "Local principal";
}

function itemsLabel(stop: Pick<AgendaStop, "itens">): string {
  return stop.itens.map((item) => `${item.qtd}× ${item.nome}`).join(" · ") || "Sem itens";
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `agenda-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function useEscape(enabled: boolean, onClose: () => void) {
  const callback = useRef(onClose);
  useEffect(() => { callback.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") callback.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

type ItemDraft = {
  key: string;
  productId: string;
  qtd: string;
  valorUnit: string;
};

function itemDraft(productId = "", qtd = "1", valorUnit = ""): ItemDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    productId,
    qtd,
    valorUnit,
  };
}

function PlanEditorModal({
  day,
  plan,
  catalogs,
  catalogsLoading,
  catalogsError,
  onClose,
  onSaved,
}: {
  day: AgendaWeekday;
  plan: AgendaPlan | null;
  catalogs: AgendaCatalogs | null;
  catalogsLoading: boolean;
  catalogsError: string | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(plan?.customerProfileId || "");
  const [localId, setLocalId] = useState(plan?.localId || "");
  const [frequency, setFrequency] = useState<AgendaFrequency>(plan?.frequencia || "SEMANAL");
  const [intervalWeeks, setIntervalWeeks] = useState(
    plan?.intervaloDias ? String(Math.max(1, Math.round(plan.intervaloDias / 7))) : "",
  );
  const [nextDate, setNextDate] = useState(plan?.proximaData?.slice(0, 10) || "");
  const [active, setActive] = useState(plan?.ativo ?? true);
  const [items, setItems] = useState<ItemDraft[]>(
    plan?.itens.length
      ? plan.itens.map((item) => itemDraft(String(item.productId), String(item.qtd), String(item.valorUnit)))
      : [itemDraft()],
  );
  const [windowStart, setWindowStart] = useState(shortTime(plan?.janela?.inicio));
  const [windowEnd, setWindowEnd] = useState(shortTime(plan?.janela?.fim));
  const [windowType, setWindowType] = useState<AgendaWindowType>(plan?.janela?.tipo || "PREFERENCIAL");
  const [stopMinutes, setStopMinutes] = useState(plan?.tempoParadaMin ? String(plan.tempoParadaMin) : "");
  const [instructions, setInstructions] = useState(plan?.instrucoes || "");
  const [accessType, setAccessType] = useState<AgendaAccessType | "">(plan?.acesso?.tipo || "");
  const [floors, setFloors] = useState(plan?.acesso?.andares ? String(plan.acesso.andares) : "");
  const [hasElevator, setHasElevator] = useState(
    plan?.acesso?.temElevador === true ? "sim" : plan?.acesso?.temElevador === false ? "nao" : "",
  );
  const [accessNote, setAccessNote] = useState(plan?.acesso?.observacao || "");
  const [additionalType, setAdditionalType] = useState<AgendaAdditionalType>(plan?.adicional?.tipo || "FIXO");
  const [additionalValue, setAdditionalValue] = useState(plan?.adicional ? String(plan.adicional.valor) : "");
  const [additionalReason, setAdditionalReason] = useState(plan?.adicional?.motivo || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscape(!saving, onClose);

  const clients = useMemo(
    () => [...(catalogs?.clientes || [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [catalogs],
  );
  const products = useMemo(
    () => [...(catalogs?.produtos || [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [catalogs],
  );
  const selectedClient = clients.find((client) => client.id === customerId) || null;

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function selectProduct(item: ItemDraft, productId: string) {
    const product = products.find((entry) => String(entry.id) === productId);
    updateItem(item.key, {
      productId,
      valorUnit: product && typeof product.preco === "number" && Number.isFinite(product.preco)
        ? String(product.preco)
        : "",
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalogs || saving) return;
    setError(null);

    const parsedItems = items.map((item) => ({
      productId: Number(item.productId),
      qtd: Number(item.qtd),
      valorUnit: Number(item.valorUnit),
    }));
    if (!customerId) {
      setError("Escolha o cliente.");
      return;
    }
    if (
      !parsedItems.length
      || parsedItems.some((item) =>
        !item.productId
        || !Number.isInteger(item.qtd)
        || item.qtd <= 0
        || !Number.isFinite(item.valorUnit)
        || item.valorUnit < 0)
    ) {
      setError("Revise os itens.");
      return;
    }
    if (frequency === "INTERVALO" && Number(intervalWeeks) < 1) {
      setError("Informe o intervalo.");
      return;
    }

    const editablePayload: AgendaPlanUpdatePayload = {
      localId: localId || null,
      diaSemana: day,
      frequencia: frequency,
      intervaloDias: frequency === "INTERVALO" ? Number(intervalWeeks) * 7 : null,
      proximaData: nextDate || null,
      ativo: active,
      janela: windowStart || windowEnd
        ? {
            inicio: windowStart || null,
            fim: windowEnd || null,
            tipo: windowType,
          }
        : null,
      tempoParadaMin: stopMinutes ? Number(stopMinutes) : null,
      instrucoes: instructions.trim() || null,
      acesso: accessType
        ? {
            tipo: accessType,
            andares: floors ? Number(floors) : null,
            temElevador: hasElevator === "sim" ? true : hasElevator === "nao" ? false : null,
            observacao: accessNote.trim() || null,
          }
        : null,
      adicional: additionalValue && Number(additionalValue) > 0
        ? {
            tipo: additionalType,
            valor: Number(additionalValue),
            motivo: additionalReason.trim() || null,
          }
        : null,
      itens: parsedItems,
    };

    setSaving(true);
    try {
      if (plan) {
        await updateAgendaPlan(plan.id, editablePayload);
      } else {
        const createPayload: AgendaPlanPayload = {
          customerProfileId: customerId,
          ...editablePayload,
        };
        await createAgendaPlan(createPayload);
      }
      await onSaved(plan ? "Parada atualizada." : "Parada adicionada.");
    } catch (saveError: unknown) {
      setError(humanError(saveError, "Não foi possível salvar a parada."));
      setSaving(false);
    }
  }

  return (
    <div className="hbx-veil" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form
        className="hbx-modal log-agenda-modal log-agenda-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-agenda-editor-title"
        onSubmit={submit}
      >
        <header className="log-agenda-modal__head">
          <span className="log-agenda-stop__order" aria-hidden>
            <I d={plan ? ICONS.edit : ICONS.plus} size={16} />
          </span>
          <div className="log-agenda-modal__title">
            <h2 id="log-agenda-editor-title">{plan ? "Editar parada" : "Nova parada"}</h2>
            <p>{dayLabel(day)}</p>
          </div>
          <button type="button" className="log-agenda-modal__close" aria-label="Fechar" onClick={onClose} disabled={saving}>
            <I d={ICONS.x} size={15} />
          </button>
        </header>

        <div className="log-agenda-modal__body">
          {catalogsLoading && (
            <div className="log-agenda__feedback">
              <span>Carregando cadastro…</span>
            </div>
          )}
          {catalogsError && !catalogs && (
            <p className="log-agenda-form__error">{catalogsError}</p>
          )}
          {catalogs && (
            <div className="log-agenda-form">
              <section className="log-agenda-form__section">
                <h3 className="log-agenda-form__section-title">Parada</h3>
                <div className="log-agenda-form__grid">
                  <label className="log-agenda-form__field">
                    <span>Cliente</span>
                    <select
                      className="field-dark"
                      value={customerId}
                      onChange={(event) => {
                        setCustomerId(event.target.value);
                        setLocalId("");
                      }}
                      disabled={!!plan}
                      required
                    >
                      <option value="">Escolha</option>
                      {clients.map((client) => <option value={client.id} key={client.id}>{client.nome}</option>)}
                    </select>
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Local</span>
                    <select
                      className="field-dark"
                      value={localId}
                      onChange={(event) => setLocalId(event.target.value)}
                      disabled={!customerId}
                    >
                      <option value="">Principal</option>
                      {(selectedClient?.locais || []).map((local) => (
                        <option value={local.id} key={local.id}>
                          {local.apelido || [local.endereco, local.numero].filter(Boolean).join(", ") || "Local"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Frequência</span>
                    <select className="field-dark" value={frequency} onChange={(event) => setFrequency(event.target.value as AgendaFrequency)}>
                      <option value="SEMANAL">Semanal</option>
                      <option value="QUINZENAL">Quinzenal</option>
                      <option value="INTERVALO">Por intervalo</option>
                    </select>
                  </label>
                  {frequency === "INTERVALO" ? (
                    <label className="log-agenda-form__field">
                      <span>Intervalo (semanas)</span>
                      <input className="field-dark" type="number" min={1} max={52} value={intervalWeeks} onChange={(event) => setIntervalWeeks(event.target.value)} required />
                    </label>
                  ) : (
                    <label className="log-agenda-form__field">
                      <span>Próxima data</span>
                      <input className="field-dark" type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} />
                    </label>
                  )}
                  <label className="log-agenda-form__check log-agenda-form__field--full">
                    <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
                    <span>Parada ativa</span>
                  </label>
                </div>
              </section>

              <section className="log-agenda-form__section">
                <h3 className="log-agenda-form__section-title">Itens</h3>
                <div className="log-agenda-form__products">
                  {items.map((item) => (
                    <div className="log-agenda-product" key={item.key}>
                      <label className="log-agenda-form__field">
                        <span>Produto</span>
                        <select className="field-dark" value={item.productId} onChange={(event) => selectProduct(item, event.target.value)} required>
                          <option value="">Escolha</option>
                          {products.map((product) => (
                            <option value={product.id} key={product.id}>
                              {product.nome}{product.unidade ? ` · ${product.unidade}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="log-agenda-form__field">
                        <span>Qtd.</span>
                        <input className="field-dark" type="number" min={1} step={1} value={item.qtd} onChange={(event) => updateItem(item.key, { qtd: event.target.value })} required />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>Valor unit.</span>
                        <input className="field-dark" type="number" min={0} step="0.01" value={item.valorUnit} onChange={(event) => updateItem(item.key, { valorUnit: event.target.value })} required />
                      </label>
                      <button
                        type="button"
                        className="log-agenda-product__remove"
                        aria-label="Remover item"
                        onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                        disabled={items.length === 1}
                      >
                        <I d={ICONS.trash} size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-ghost btn-xs log-agenda-form__add" onClick={() => setItems((current) => [...current, itemDraft()])}>
                  <I d={ICONS.plus} size={13} /> Item
                </button>
              </section>

              <section className="log-agenda-form__section">
                <h3 className="log-agenda-form__section-title">Atendimento</h3>
                <div className="log-agenda-form__grid log-agenda-form__grid--three">
                  <label className="log-agenda-form__field">
                    <span>Início</span>
                    <input className="field-dark" type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Fim</span>
                    <input className="field-dark" type="time" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Tipo</span>
                    <select className="field-dark" value={windowType} onChange={(event) => setWindowType(event.target.value as AgendaWindowType)}>
                      <option value="PREFERENCIAL">Preferencial</option>
                      <option value="RIGIDA">Rígido</option>
                    </select>
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Tempo (min)</span>
                    <input className="field-dark" type="number" min={1} value={stopMinutes} onChange={(event) => setStopMinutes(event.target.value)} />
                  </label>
                  <label className="log-agenda-form__field log-agenda-form__field--full">
                    <span>Instrução</span>
                    <textarea className="field-dark" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Portaria, chave, referência…" />
                  </label>
                </div>
              </section>

              <section className="log-agenda-form__section">
                <h3 className="log-agenda-form__section-title">Acesso e adicional</h3>
                <div className="log-agenda-form__grid log-agenda-form__grid--three">
                  <label className="log-agenda-form__field">
                    <span>Acesso</span>
                    <select className="field-dark" value={accessType} onChange={(event) => setAccessType(event.target.value as AgendaAccessType | "")}>
                      <option value="">Padrão do local</option>
                      <option value="TERREO">Térreo</option>
                      <option value="ESCADA">Escada</option>
                      <option value="ELEVADOR">Elevador</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Andares</span>
                    <input className="field-dark" type="number" min={0} value={floors} onChange={(event) => setFloors(event.target.value)} disabled={!accessType} />
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Elevador</span>
                    <select className="field-dark" value={hasElevator} onChange={(event) => setHasElevator(event.target.value)} disabled={!accessType}>
                      <option value="">Não informado</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </label>
                  <label className="log-agenda-form__field log-agenda-form__field--full">
                    <span>Detalhe do acesso</span>
                    <input className="field-dark" value={accessNote} onChange={(event) => setAccessNote(event.target.value)} disabled={!accessType} />
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Adicional</span>
                    <input className="field-dark" type="number" min={0} step="0.01" value={additionalValue} onChange={(event) => setAdditionalValue(event.target.value)} placeholder="R$ 0,00" />
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Cálculo</span>
                    <select className="field-dark" value={additionalType} onChange={(event) => setAdditionalType(event.target.value as AgendaAdditionalType)} disabled={!additionalValue}>
                      <option value="FIXO">Fixo</option>
                      <option value="POR_UNIDADE">Por unidade</option>
                    </select>
                  </label>
                  <label className="log-agenda-form__field">
                    <span>Motivo</span>
                    <input className="field-dark" value={additionalReason} onChange={(event) => setAdditionalReason(event.target.value)} disabled={!additionalValue} placeholder="Ex.: escada" />
                  </label>
                </div>
              </section>

              {error && <p className="log-agenda-form__error">{error}</p>}
            </div>
          )}
        </div>

        <footer className="log-agenda-modal__foot">
          <div className="log-agenda-modal__actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn-teal" disabled={!catalogs || saving}>
              <I d={ICONS.check} size={14} /> {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function MoveStopModal({
  stop,
  stops,
  onClose,
  onMove,
}: {
  stop: AgendaStop;
  stops: AgendaStop[];
  onClose: () => void;
  onMove: (payload: { planoId: string; posicao: number } | { planoId: string; depoisDePlanoId: string | null }) => Promise<void>;
}) {
  const [position, setPosition] = useState(String(stop.ordem));
  const [after, setAfter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscape(!saving, onClose);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (after) {
        await onMove({
          planoId: stop.planoEntregaId,
          depoisDePlanoId: after === "__inicio__" ? null : after,
        });
      } else {
        const nextPosition = Math.max(1, Math.min(stops.length, Number(position) || 1));
        await onMove({ planoId: stop.planoEntregaId, posicao: nextPosition });
      }
    } catch (moveError: unknown) {
      setError(humanError(moveError, "Não foi possível mover a parada."));
      setSaving(false);
    }
  }

  return (
    <div className="hbx-veil" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="hbx-modal log-agenda-modal log-agenda-modal--small" role="dialog" aria-modal="true" aria-labelledby="log-agenda-move-title" onSubmit={submit}>
        <header className="log-agenda-modal__head">
          <span className="log-agenda-stop__order" aria-hidden>{stop.ordem}</span>
          <div className="log-agenda-modal__title">
            <h2 id="log-agenda-move-title">Mover parada</h2>
            <p>{stop.cliente.nome}</p>
          </div>
          <button type="button" className="log-agenda-modal__close" aria-label="Fechar" onClick={onClose} disabled={saving}>
            <I d={ICONS.x} size={15} />
          </button>
        </header>
        <div className="log-agenda-modal__body">
          <div className="log-agenda-move">
            <label className="log-agenda-form__field">
              <span>Nova posição</span>
              <input
                className="field-dark"
                type="number"
                min={1}
                max={stops.length}
                value={position}
                onChange={(event) => {
                  setPosition(event.target.value);
                  setAfter("");
                }}
              />
            </label>
            <span className="log-agenda-move__or">ou</span>
            <label className="log-agenda-form__field">
              <span>Inserir depois de</span>
              <select
                className="field-dark"
                value={after}
                onChange={(event) => {
                  setAfter(event.target.value);
                  if (event.target.value) setPosition("");
                }}
              >
                <option value="">Usar posição</option>
                <option value="__inicio__">No início</option>
                {stops.filter((entry) => entry.planoEntregaId !== stop.planoEntregaId).map((entry) => (
                  <option value={entry.planoEntregaId} key={entry.planoEntregaId}>
                    {entry.ordem}. {entry.cliente.nome}
                  </option>
                ))}
              </select>
            </label>
            {error && <p className="log-agenda-form__error">{error}</p>}
          </div>
        </div>
        <footer className="log-agenda-modal__foot">
          <div className="log-agenda-modal__actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn-teal" disabled={saving}>
              <I d={ICONS.check} size={14} /> {saving ? "Movendo…" : "Mover"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function DayActionModal({
  day,
  onClose,
  onCompleted,
}: {
  day: AgendaWeekday;
  onClose: () => void;
  onCompleted: (message: string) => Promise<void>;
}) {
  const [action, setAction] = useState<AgendaDayAction>("PAUSAR");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(dateKeyToday());
  const [openDeliveries, setOpenDeliveries] = useState<AgendaOpenDeliveriesAction>("MANTER");
  const [preview, setPreview] = useState<AgendaActionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(idempotencyKey);
  const actionPill = useGlassPill<HTMLButtonElement>(action);

  useEscape(!saving, onClose);

  useEffect(() => {
    if (action === "MOVER" && !destination) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const result = await getAgendaActionPreview(day, {
          acao: action,
          ...(action === "MOVER" ? { destinoDiaSemana: Number(destination) as AgendaWeekday } : {}),
          ...(startDate ? { dataInicio: startDate } : {}),
        });
        if (!cancelled) setPreview(result);
      } catch (error: unknown) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(humanError(error, "Não foi possível calcular o impacto."));
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [action, day, destination, startDate]);

  function changeAction(next: AgendaDayAction) {
    setAction(next);
    setOpenDeliveries("MANTER");
    setPreview(null);
    setKey(idempotencyKey());
  }

  async function execute() {
    if (!preview || saving) return;
    setSaving(true);
    setPreviewError(null);
    try {
      await executeAgendaDayAction(day, {
        idempotencyKey: key,
        acao: action,
        ...(action === "MOVER" ? { destinoDiaSemana: Number(destination) as AgendaWeekday } : {}),
        ...(startDate ? { dataInicio: startDate } : {}),
        entregasAbertas: openDeliveries,
      });
      await onCompleted(action === "MOVER" ? "Dia movido." : "Dia pausado.");
    } catch (error: unknown) {
      setPreviewError(humanError(error, "Não foi possível alterar o dia."));
      setSaving(false);
    }
  }

  const firstWarning = preview?.avisos?.[0] ? agendaNoticeText(preview.avisos[0]) : null;

  return (
    <div className="hbx-veil" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="hbx-modal log-agenda-modal" role="dialog" aria-modal="true" aria-labelledby="log-agenda-action-title">
        <header className="log-agenda-modal__head">
          <span className="log-agenda-stop__order" aria-hidden>
            <I d={ICONS.config} size={16} />
          </span>
          <div className="log-agenda-modal__title">
            <h2 id="log-agenda-action-title">Organizar dia</h2>
            <p>{dayLabel(day)}</p>
          </div>
          <button type="button" className="log-agenda-modal__close" aria-label="Fechar" onClick={onClose} disabled={saving}>
            <I d={ICONS.x} size={15} />
          </button>
        </header>

        <div className="log-agenda-modal__body">
          <div className="log-agenda-form">
            <div className="log-agenda-action-tabs glass-pill-track">
              <GlassPill {...actionPill} />
              <button
                ref={actionPill.itemRef("PAUSAR")}
                type="button"
                className={`glass-pill-item${action === "PAUSAR" ? " is-active" : ""}`}
                onClick={() => changeAction("PAUSAR")}
              >
                Pausar
              </button>
              <button
                ref={actionPill.itemRef("MOVER")}
                type="button"
                className={`glass-pill-item${action === "MOVER" ? " is-active" : ""}`}
                onClick={() => changeAction("MOVER")}
              >
                Mover
              </button>
            </div>

            <div className="log-agenda-form__grid">
              {action === "MOVER" && (
                <label className="log-agenda-form__field">
                  <span>Novo dia</span>
                  <select
                    className="field-dark"
                    value={destination}
                    onChange={(event) => {
                      setDestination(event.target.value);
                      if (!event.target.value) setPreview(null);
                      setPreviewError(null);
                      setKey(idempotencyKey());
                    }}
                  >
                    <option value="">Escolha</option>
                    {WEEK_DAYS.filter((item) => item.value !== day).map((item) => (
                      <option value={item.value} key={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="log-agenda-form__field">
                <span>A partir de</span>
                <input
                  className="field-dark"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setKey(idempotencyKey());
                  }}
                />
              </label>
            </div>

            <section className="log-agenda-form__section">
              <h3 className="log-agenda-form__section-title">Entregas já abertas</h3>
              <div className="log-agenda-impact__actions">
                <button
                  type="button"
                  className={`log-agenda-impact__choice${openDeliveries === "MANTER" ? " is-active" : ""}`}
                  onClick={() => {
                    setOpenDeliveries("MANTER");
                    setKey(idempotencyKey());
                  }}
                >
                  {action === "MOVER" ? "Manter datas" : "Manter abertas"}
                </button>
                {action === "MOVER" ? (
                  <button
                    type="button"
                    className={`log-agenda-impact__choice${openDeliveries === "MOVER" ? " is-active" : ""}`}
                    onClick={() => {
                      setOpenDeliveries("MOVER");
                      setKey(idempotencyKey());
                    }}
                  >
                    Mover agendadas
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`log-agenda-impact__choice is-danger${openDeliveries === "CANCELAR" ? " is-active" : ""}`}
                    onClick={() => {
                      setOpenDeliveries("CANCELAR");
                      setKey(idempotencyKey());
                    }}
                  >
                    Retirar agendadas
                  </button>
                )}
              </div>
            </section>

            <section className="log-agenda-form__section">
              <h3 className="log-agenda-form__section-title">Impacto</h3>
              {previewLoading && <p className="log-agenda-impact__notice">Calculando…</p>}
              {!previewLoading && preview && (
                <div className="log-agenda-impact">
                  <div className="log-agenda-impact__stats">
                    <div className="log-agenda-impact__stat">
                      <strong>{preview.planosAfetados}</strong>
                      <span>Planos</span>
                    </div>
                    <div className="log-agenda-impact__stat">
                      <strong>{preview.paradasAfetadas}</strong>
                      <span>Paradas</span>
                    </div>
                    <div className="log-agenda-impact__stat">
                      <strong>{preview.entregasAgendadasAfetadas}</strong>
                      <span>Agendadas</span>
                    </div>
                  </div>
                  <p className="log-agenda-impact__notice">
                    {openDeliveries === "CANCELAR"
                      ? "Retiradas ficam no histórico. Concluídas e financeiro ficam intactos."
                      : "Em rota, concluídas e financeiro ficam intactos."}
                  </p>
                  {firstWarning && <p className="log-agenda-impact__notice">{firstWarning}</p>}
                </div>
              )}
              {previewError && <p className="log-agenda-form__error">{previewError}</p>}
            </section>
          </div>
        </div>

        <footer className="log-agenda-modal__foot">
          <div className="log-agenda-modal__actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Voltar</button>
            <button type="button" className="btn-teal" onClick={() => void execute()} disabled={!preview || previewLoading || saving}>
              <I d={action === "MOVER" ? ICONS.arrow : ICONS.pause} size={14} />
              {saving ? "Aplicando…" : action === "MOVER" ? "Mover dia" : "Pausar dia"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function LegacyMigrationModal({
  onClose,
  onCompleted,
}: {
  onClose: () => void;
  onCompleted: (message: string) => Promise<void>;
}) {
  const [preview, setPreview] = useState<AgendaLegacyPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(idempotencyKey);

  useEscape(!applying, onClose);

  useEffect(() => {
    let cancelled = false;
    getAgendaLegacyPreview()
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
          setError(null);
        }
      })
      .catch((previewError: unknown) => {
        if (!cancelled) setError(humanError(previewError, "Não foi possível preparar a agenda."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function apply() {
    if (!preview?.podeAplicar || applying) return;
    setApplying(true);
    setError(null);
    try {
      const result = await applyAgendaLegacy(key);
      await onCompleted(`${result.planosCriados} planos organizados.`);
    } catch (applyError: unknown) {
      setError(humanError(applyError, "Não foi possível organizar a agenda."));
      setApplying(false);
    }
  }

  const firstWarning = preview?.avisos?.[0] ? agendaNoticeText(preview.avisos[0]) : null;

  return (
    <div className="hbx-veil" onMouseDown={(event) => { if (event.target === event.currentTarget && !applying) onClose(); }}>
      <section className="hbx-modal log-agenda-modal" role="dialog" aria-modal="true" aria-labelledby="log-agenda-legacy-title">
        <header className="log-agenda-modal__head">
          <span className="log-agenda-stop__order" aria-hidden>
            <I d={ICONS.agenda} size={16} />
          </span>
          <div className="log-agenda-modal__title">
            <h2 id="log-agenda-legacy-title">Organizar agenda</h2>
            <p>Prévia segura</p>
          </div>
          <button type="button" className="log-agenda-modal__close" aria-label="Fechar" onClick={onClose} disabled={applying}>
            <I d={ICONS.x} size={15} />
          </button>
        </header>

        <div className="log-agenda-modal__body">
          {loading && <p className="log-agenda-impact__notice">Calculando…</p>}
          {!loading && preview && (
            <div className="log-agenda-impact">
              <p className="log-agenda-impact__notice">Cadastros atuais continuam intactos.</p>
              <div className="log-agenda-impact__stats">
                <div className="log-agenda-impact__stat">
                  <strong>{preview.totalVinculos}</strong>
                  <span>Vínculos</span>
                </div>
                <div className="log-agenda-impact__stat">
                  <strong>{preview.totalPlanos}</strong>
                  <span>Planos</span>
                </div>
                <div className="log-agenda-impact__stat">
                  <strong>{preview.totalItens}</strong>
                  <span>Itens</span>
                </div>
              </div>
              <div className="log-agenda-legacy__days" aria-label="Planos por dia">
                {preview.dias.map((day) => (
                  <span className="log-agenda-legacy__day" key={day.diaSemana}>
                    <b>{WEEK_DAYS.find((item) => item.value === day.diaSemana)?.short}</b>
                    {day.totalPlanos}
                  </span>
                ))}
              </div>
              {firstWarning && (
                <p className="log-agenda-impact__notice">
                  {firstWarning}{preview.avisos.length > 1 ? ` · +${preview.avisos.length - 1}` : ""}
                </p>
              )}
            </div>
          )}
          {error && <p className="log-agenda-form__error">{error}</p>}
        </div>

        <footer className="log-agenda-modal__foot">
          <div className="log-agenda-modal__actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={applying}>Voltar</button>
            <button type="button" className="btn-teal" onClick={() => void apply()} disabled={!preview?.podeAplicar || applying}>
              <I d={ICONS.check} size={14} /> {applying ? "Organizando…" : "Organizar agora"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ImportSequenceModal({
  day,
  onClose,
  onApply,
}: {
  day: AgendaWeekday;
  onClose: () => void;
  onApply: (planoIds: string[]) => Promise<void>;
}) {
  const [sequences, setSequences] = useState<AgendaSequenciaResumo[] | null>(null);
  const [sequencesLoading, setSequencesLoading] = useState(true);
  const [sequencesError, setSequencesError] = useState<string | null>(null);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [preview, setPreview] = useState<AgendaImportarPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEscape(!applying, onClose);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setSequencesLoading(true);
      try {
        const result = await getAgendaImportSequences(day);
        if (!cancelled) {
          setSequences(result);
          setSequencesError(null);
        }
      } catch (error: unknown) {
        if (!cancelled) setSequencesError(humanError(error, "Não foi possível listar as rotas salvas."));
      } finally {
        if (!cancelled) setSequencesLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [day]);

  useEffect(() => {
    if (!modeloId) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const result = await getAgendaImportPreview(day, modeloId);
        if (!cancelled) setPreview(result);
      } catch (error: unknown) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(humanError(error, "Não foi possível montar a prévia."));
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [day, modeloId]);

  function chooseAnother() {
    setModeloId(null);
    setPreview(null);
    setPreviewError(null);
  }

  async function apply() {
    if (!preview?.aplicavel || applying) return;
    const planoIds = [
      ...[...preview.ordem].sort((a, b) => a.posicao - b.posicao).map((item) => item.planoId),
      ...preview.foraDaSequencia.map((item) => item.planoId),
      ...preview.ambiguos.map((item) => item.planoId),
    ];
    setApplying(true);
    setPreviewError(null);
    try {
      await onApply(planoIds);
    } catch (error: unknown) {
      setPreviewError(humanError(error, "Não foi possível aplicar a sequência."));
      setApplying(false);
    }
  }

  const selectedSequence = sequences?.find((item) => item.id === modeloId) || null;

  return (
    <div className="hbx-veil" onMouseDown={(event) => { if (event.target === event.currentTarget && !applying) onClose(); }}>
      <section className="hbx-modal log-agenda-modal" role="dialog" aria-modal="true" aria-labelledby="log-agenda-import-title">
        <header className="log-agenda-modal__head">
          <span className="log-agenda-stop__order" aria-hidden>
            <I d={ICONS.download} size={16} />
          </span>
          <div className="log-agenda-modal__title">
            <h2 id="log-agenda-import-title">Importar sequência</h2>
            <p>{selectedSequence ? selectedSequence.nome : dayLabel(day)}</p>
          </div>
          <button type="button" className="log-agenda-modal__close" aria-label="Fechar" onClick={onClose} disabled={applying}>
            <I d={ICONS.x} size={15} />
          </button>
        </header>

        <div className="log-agenda-modal__body">
          {!modeloId && (
            <div className="log-agenda-form">
              {sequencesLoading && <p className="log-agenda-impact__notice">Procurando rotas salvas…</p>}
              {!sequencesLoading && sequencesError && <p className="log-agenda-form__error">{sequencesError}</p>}
              {!sequencesLoading && !sequencesError && sequences?.length === 0 && (
                <p className="log-agenda-impact__notice">Nenhuma rota salva ainda. Salve uma rota na Leitura de Rota ou aqui na Agenda.</p>
              )}
              {!sequencesLoading && !sequencesError && !!sequences?.length && (
                <div className="log-agenda-import__list">
                  {sequences.map((sequence) => (
                    <button
                      type="button"
                      className="log-agenda-import__route"
                      key={sequence.id}
                      onClick={() => setModeloId(sequence.id)}
                    >
                      <span className="log-agenda-import__route-name">
                        <strong>{sequence.nome}</strong>
                        <span>{sequence.totalParadas} paradas · atualizada {shortUpdatedAt(sequence.updatedAt)}</span>
                      </span>
                      {sequence.diaSemana === day && (
                        <span className="log-agenda-import__route-badge">Deste dia</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {modeloId && (
            <div className="log-agenda-form">
              <button type="button" className="btn-ghost btn-xs log-agenda-form__add" onClick={chooseAnother} disabled={applying}>
                <I d={ICONS.back} size={13} /> Trocar rota
              </button>

              {previewLoading && <p className="log-agenda-impact__notice">Montando a prévia…</p>}
              {!previewLoading && previewError && <p className="log-agenda-form__error">{previewError}</p>}

              {!previewLoading && preview && (
                <>
                  <section className="log-agenda-import__block">
                    <div className="log-agenda-import__block-head">
                      <h4>Vai ficar nesta ordem</h4>
                      <span>{preview.ordem.length}</span>
                    </div>
                    {preview.ordem.length === 0 && (
                      <p className="log-agenda-impact__notice">Nenhum cliente desta rota está no dia hoje.</p>
                    )}
                    {preview.ordem.length > 0 && (
                      <div className="log-agenda-import__rows">
                        {preview.ordem.map((item) => (
                          <div className="log-agenda-import__row" key={item.planoId}>
                            <span className="log-agenda-import__row-index">{item.posicao}</span>
                            <span className="log-agenda-import__row-name">{item.clienteNome}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {(preview.foraDaSequencia.length > 0 || preview.ambiguos.length > 0) && (
                    <section className="log-agenda-import__block">
                      <div className="log-agenda-import__block-head">
                        <h4>Fica no fim</h4>
                        <span>{preview.foraDaSequencia.length + preview.ambiguos.length}</span>
                      </div>
                      <div className="log-agenda-import__rows">
                        {preview.foraDaSequencia.map((item) => (
                          <div className="log-agenda-import__row" key={item.planoId}>
                            <span className="log-agenda-import__row-index" aria-hidden>—</span>
                            <span className="log-agenda-import__row-name">{item.clienteNome}</span>
                          </div>
                        ))}
                        {preview.ambiguos.map((item) => (
                          <div className="log-agenda-import__row is-ambiguous" key={item.planoId} title={item.motivo}>
                            <span className="log-agenda-import__row-index" aria-hidden>?</span>
                            <span className="log-agenda-import__row-name">{item.clienteNome}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {preview.semPlano.length > 0 && (
                    <section className="log-agenda-import__block">
                      <div className="log-agenda-import__block-head">
                        <h4>Na sequência, sem plano hoje</h4>
                        <span>{preview.semPlano.length}</span>
                      </div>
                      <p className="log-agenda-form__hint">Nada será criado — é só informativo.</p>
                      <div className="log-agenda-import__rows">
                        {preview.semPlano.map((item, index) => (
                          <div className="log-agenda-import__row" key={`${item.clienteNome}-${index}`}>
                            <span className="log-agenda-import__row-index" aria-hidden>—</span>
                            <span className="log-agenda-import__row-name">
                              {item.clienteNome}
                              {item.endereco && <span className="log-agenda-import__row-sub"> · {item.endereco}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <footer className="log-agenda-modal__foot">
          <div className="log-agenda-modal__actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={applying}>Cancelar</button>
            {modeloId && (
              <button type="button" className="btn-teal" onClick={() => void apply()} disabled={!preview?.aplicavel || previewLoading || applying}>
                <I d={ICONS.check} size={14} /> {applying ? "Aplicando…" : "Aplicar ordem"}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

// S3 — conferência de divergência plano×parada. Read-only puro: sem botão de
// corrigir/sincronizar, só mostra e deixa abrir a ficha do plano quando existe
// (SO_NA_ROTA e DUPLICADO não têm planoId — não há o que abrir).
function DivergenceModal({
  day,
  onClose,
  onOpenPlan,
}: {
  day: AgendaWeekday;
  onClose: () => void;
  onOpenPlan: (planoId: string) => void;
}) {
  const [data, setData] = useState<AgendaDivergencias | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEscape(true, onClose);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const result = await getAgendaDivergencias(day);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (fetchError: unknown) {
        if (!cancelled) setError(humanError(fetchError, "Não foi possível conferir a rota salva."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [day]);

  const soNaRota = (data?.itens || []).filter((item) => item.tipo === "SO_NA_ROTA");
  const soNoPlano = (data?.itens || []).filter((item) => item.tipo === "SO_NO_PLANO");
  const duplicado = (data?.itens || []).filter((item) => item.tipo === "DUPLICADO");

  return (
    <div className="hbx-veil" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="hbx-modal log-agenda-modal" role="dialog" aria-modal="true" aria-labelledby="log-agenda-divergence-title">
        <header className="log-agenda-modal__head">
          <span className="log-agenda-stop__order" aria-hidden>
            <I d={ICONS.bell} size={16} />
          </span>
          <div className="log-agenda-modal__title">
            <h2 id="log-agenda-divergence-title">Conferência da rota</h2>
            <p>{dayLabel(day)}</p>
          </div>
          <button type="button" className="log-agenda-modal__close" aria-label="Fechar" onClick={onClose}>
            <I d={ICONS.x} size={15} />
          </button>
        </header>

        <div className="log-agenda-modal__body">
          {loading && <p className="log-agenda-impact__notice">Comparando os planos com a rota salva…</p>}
          {!loading && error && <p className="log-agenda-form__error">{error}</p>}

          {!loading && !error && data?.semRotaSalva && (
            <p className="log-agenda-impact__notice">Ainda não existe rota salva para {dayLabel(day)}.</p>
          )}

          {!loading && !error && data && !data.semRotaSalva && data.total === 0 && (
            <p className="log-agenda-impact__notice">Tudo certo: os planos do dia batem com a rota salva.</p>
          )}

          {!loading && !error && soNaRota.length > 0 && (
            <section className="log-agenda-import__block">
              <div className="log-agenda-import__block-head">
                <h4>Estão na rota salva, sem visita marcada</h4>
                <span>{soNaRota.length}</span>
              </div>
              <p className="log-agenda-form__hint">Ninguém foi alterado — é só o aviso. A decisão é sua.</p>
              <div className="log-agenda-import__rows">
                {soNaRota.map((item, index) => (
                  <div className="log-agenda-import__row" key={`sonarota-${index}`}>
                    <span className="log-agenda-import__row-index" aria-hidden>—</span>
                    <span className="log-agenda-import__row-name">
                      {item.clienteNome}
                      {item.endereco && <span className="log-agenda-import__row-sub"> · {item.endereco}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!loading && !error && soNoPlano.length > 0 && (
            <section className="log-agenda-import__block">
              <div className="log-agenda-import__block-head">
                <h4>Têm visita marcada, sem estar na rota salva</h4>
                <span>{soNoPlano.length}</span>
              </div>
              <div className="log-agenda-import__rows">
                {soNoPlano.map((item, index) => (
                  <button
                    type="button"
                    className="log-agenda-import__row log-agenda-import__row--action"
                    key={item.planoId || `sonoplano-${index}`}
                    onClick={() => item.planoId && onOpenPlan(item.planoId)}
                    disabled={!item.planoId}
                    title={item.detalhe}
                  >
                    <span className="log-agenda-import__row-index" aria-hidden>—</span>
                    <span className="log-agenda-import__row-name">
                      {item.clienteNome}
                      {item.endereco && <span className="log-agenda-import__row-sub"> · {item.endereco}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!loading && !error && duplicado.length > 0 && (
            <section className="log-agenda-import__block">
              <div className="log-agenda-import__block-head">
                <h4>Repetidos na rota salva</h4>
                <span>{duplicado.length}</span>
              </div>
              <div className="log-agenda-import__rows">
                {duplicado.map((item, index) => (
                  <div className="log-agenda-import__row is-ambiguous" key={`dup-${index}`}>
                    <span className="log-agenda-import__row-index" aria-hidden>2×</span>
                    <span className="log-agenda-import__row-name">
                      {item.clienteNome}
                      {item.endereco && <span className="log-agenda-import__row-sub"> · {item.endereco}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="log-agenda-modal__foot">
          <div className="log-agenda-modal__actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Fechar</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function WeeklyAgenda({ onOpenRouteBuilder }: { onOpenRouteBuilder: () => void }) {
  const [summary, setSummary] = useState<AgendaSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<AgendaWeekday>(currentWeekday);
  const [detail, setDetail] = useState<AgendaDayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editorPlan, setEditorPlan] = useState<AgendaPlan | null | undefined>(undefined);
  const [moveStop, setMoveStop] = useState<AgendaStop | null>(null);
  const [dayActionOpen, setDayActionOpen] = useState(false);
  const [importSequenceOpen, setImportSequenceOpen] = useState(false);
  const [legacyMigrationOpen, setLegacyMigrationOpen] = useState(false);
  const [catalogs, setCatalogs] = useState<AgendaCatalogs | null>(null);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);
  const [divergencias, setDivergencias] = useState<AgendaDivergencias | null>(null);
  const [divergenceModalOpen, setDivergenceModalOpen] = useState(false);
  const dayRequest = useRef(0);
  const divergenceRequest = useRef(0);
  const dayPill = useGlassPill<HTMLButtonElement>(String(selectedDay), summary?.dias.length);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const result = await getWeeklyAgenda();
      setSummary(result);
      setSummaryError(null);
    } catch (error: unknown) {
      setSummary(null);
      setSummaryError(humanError(error, "Não foi possível carregar a semana."));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadDay = useCallback(async (day: AgendaWeekday) => {
    const requestId = ++dayRequest.current;
    setDetailLoading(true);
    try {
      const result = await getAgendaDay(day);
      if (dayRequest.current !== requestId || result.diaSemana !== day) return;
      setDetail(result);
      setDetailError(null);
    } catch (error: unknown) {
      if (dayRequest.current !== requestId) return;
      setDetail(null);
      setDetailError(humanError(error, "Não foi possível carregar o dia."));
    } finally {
      if (dayRequest.current === requestId) setDetailLoading(false);
    }
  }, []);

  // S3 — badge "⚠ N diferenças" no cabeçalho do dia aberto. Falha aqui nunca
  // vira erro visível (endpoint pode estar guardado com agendaV2 desligada,
  // ou o dia simplesmente não tem rota salva) — o badge só some.
  const loadDivergencias = useCallback(async (day: AgendaWeekday) => {
    const requestId = ++divergenceRequest.current;
    try {
      const result = await getAgendaDivergencias(day);
      if (divergenceRequest.current === requestId) setDivergencias(result);
    } catch {
      if (divergenceRequest.current === requestId) setDivergencias(null);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial da semana; efeito legítimo de sincronização com a API.
  useEffect(() => { void loadSummary(); }, [loadSummary]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- troca de dia dispara o fetch correspondente; efeito legítimo.
  useEffect(() => { void loadDay(selectedDay); }, [loadDay, selectedDay]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- troca de dia dispara a conferência do badge; efeito legítimo.
  useEffect(() => { void loadDivergencias(selectedDay); }, [loadDivergencias, selectedDay]);

  const ensureCatalogs = useCallback(async () => {
    if (catalogs || catalogsLoading) return;
    setCatalogsLoading(true);
    setCatalogsError(null);
    try {
      setCatalogs(await getAgendaCatalogs());
    } catch (error: unknown) {
      setCatalogsError(humanError(error, "Não foi possível carregar clientes e produtos."));
    } finally {
      setCatalogsLoading(false);
    }
  }, [catalogs, catalogsLoading]);

  function openEditor(plan: AgendaPlan | null) {
    if (detailLoading || detail?.diaSemana !== selectedDay) return;
    setEditorPlan(plan);
    void ensureCatalogs();
  }

  function openMove(stop: AgendaStop) {
    if (detailLoading || detail?.diaSemana !== selectedDay) return;
    setMoveStop(stop);
  }

  async function refresh(messageText?: string) {
    await Promise.all([loadSummary(), loadDay(selectedDay), loadDivergencias(selectedDay)]);
    if (messageText) setMessage(messageText);
  }

  function closeDivergenceModal() {
    setDivergenceModalOpen(false);
    // Sem F5 forçado: o que gerou a divergência foi corrigido em outra tela
    // (ficha do plano, Leitura de Rota…) — ao fechar, refaz a conferência.
    void loadDivergencias(selectedDay);
  }

  function openPlanFromDivergence(planoId: string) {
    const plan = planById.get(planoId) || null;
    setDivergenceModalOpen(false);
    if (plan) openEditor(plan);
  }

  async function saveCompleted(messageText: string) {
    await refresh(messageText);
    setEditorPlan(undefined);
  }

  async function moveCompleted(
    payload: { planoId: string; posicao: number } | { planoId: string; depoisDePlanoId: string | null },
  ) {
    if (detail?.diaSemana !== selectedDay) throw new Error("O dia mudou. Abra a parada novamente.");
    const updated = await updateAgendaOrder(selectedDay, payload);
    setDetail(updated);
    setMoveStop(null);
    setMessage("Ordem atualizada.");
    await loadSummary();
  }

  async function importSequenceApplied(planoIds: string[]) {
    if (detail?.diaSemana !== selectedDay) throw new Error("O dia mudou. Abra a importação novamente.");
    const updated = await updateAgendaOrder(selectedDay, { planoIds });
    setDetail(updated);
    setImportSequenceOpen(false);
    setMessage("Sequência aplicada.");
    await loadSummary();
  }

  async function dayActionCompleted(messageText: string) {
    setDayActionOpen(false);
    await refresh(messageText);
  }

  async function legacyMigrationCompleted(messageText: string) {
    setLegacyMigrationOpen(false);
    await refresh(messageText);
  }

  const legacyMode = summary?.modo === "LEGADO" || detail?.modo === "LEGADO";
  const legacyLinks = summary?.migracao.totalVinculos ?? detail?.migracao.totalVinculos ?? 0;
  const summaryByDay = useMemo(
    () => new Map((summary?.dias || []).map((day) => [day.diaSemana, day])),
    [summary],
  );
  const selectedSummary: AgendaDaySummary | null = summaryByDay.get(selectedDay) || null;
  const planById = useMemo(
    () => new Map((detail?.planos || []).map((plan) => [plan.id, plan])),
    [detail],
  );
  const visibleStops = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return detail?.paradas || [];
    return (detail?.paradas || []).filter((stop) =>
      [
        stop.cliente.nome,
        stop.local?.apelido,
        stop.local?.endereco,
        stop.local?.bairro,
        ...stop.itens.map((item) => item.nome),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );
  }, [detail, search]);

  const firstNotice = detail?.avisos?.[0] ? agendaNoticeText(detail.avisos[0]) : null;
  // S4 — conta o dia inteiro (não só o resultado filtrado da busca), só existe quando N>0.
  const etaConflitosCount = (detail?.paradas || []).filter((stop) => !!stop.alertaJanela).length;

  return (
    <section id="logistica-view-weekly" className="log-agenda hbx-page-mobile-enter" role="tabpanel" aria-labelledby="log-tab-weekly">
      <div className="log-agenda__days">
        <div className="log-agenda__days-scroller glass-pill-track" role="tablist" aria-label="Dias da semana">
          <GlassPill {...dayPill} />
          {WEEK_DAYS.map((day) => {
            const row = summaryByDay.get(day.value);
            const active = selectedDay === day.value;
            const paused = row ? !row.ativo : false;
            const empty = !row || row.totalParadas === 0;
            return (
              <button
                ref={dayPill.itemRef(String(day.value))}
                id={`log-agenda-day-${day.value}-tab`}
                type="button"
                role="tab"
                aria-controls="log-agenda-day-panel"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className={[
                  "log-agenda__day glass-pill-item",
                  active ? "is-active" : "",
                  paused ? "is-paused" : "",
                  empty ? "is-empty" : "",
                ].filter(Boolean).join(" ")}
                key={day.value}
                onClick={() => {
                  if (day.value === selectedDay) return;
                  dayRequest.current += 1;
                  setSelectedDay(day.value);
                  setDetail(null);
                  setDetailLoading(true);
                  setDetailError(null);
                  setEditorPlan(undefined);
                  setMoveStop(null);
                  setDayActionOpen(false);
                  setImportSequenceOpen(false);
                  setDivergenceModalOpen(false);
                  setDivergencias(null);
                  setSearch("");
                  setMessage(null);
                }}
              >
                <strong>{day.short}</strong>
                <span className="log-agenda__day-count">{summaryLoading ? "…" : row?.totalParadas ?? 0}</span>
                <span className="log-agenda__day-state">{paused ? "Pausado" : empty ? "Livre" : "Ativo"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="log-agenda-day-panel" className="log-agenda__surface" role="tabpanel" aria-labelledby={`log-agenda-day-${selectedDay}-tab`}>
        {legacyMode && (
          <div className="log-agenda-legacy">
            <strong>Agenda antiga · {legacyLinks} vínculos</strong>
            <button type="button" className="btn-teal btn-xs" onClick={() => setLegacyMigrationOpen(true)}>
              Organizar agora
            </button>
          </div>
        )}

        <header className="log-agenda__head">
          <div className="log-agenda__head-main">
            <div className="log-agenda__head-copy">
              <h2>{detail?.nome || selectedSummary?.nome || dayLabel(selectedDay)}</h2>
              <p>{detail?.totais.paradas ?? selectedSummary?.totalParadas ?? 0} paradas · {detail?.totais.clientes ?? selectedSummary?.totalClientes ?? 0} clientes</p>
            </div>
            {/* S3 — zero divergência = nada na tela; badge só existe quando há o que conferir. */}
            {!!divergencias && divergencias.total > 0 && (
              <button
                type="button"
                className="log-agenda__divergence-badge"
                onClick={() => setDivergenceModalOpen(true)}
              >
                ⚠ {divergencias.total} {divergencias.total === 1 ? "diferença" : "diferenças"}
              </button>
            )}
            {/* S4 — só informa (nunca bloqueia); zero conflito = nada na tela. */}
            {etaConflitosCount > 0 && (
              <span className="log-agenda__eta-badge" title="Estimativa v1 sem OSRM — some quando a rota é reordenada.">
                {etaConflitosCount} {etaConflitosCount === 1 ? "conflito" : "conflitos"} de horário
              </span>
            )}
            <span className={`log-agenda__state ${detail?.ativo === false ? "is-paused" : "is-active"}`}>
              {detail?.ativo === false ? "Pausado" : "Ativo"}
            </span>
          </div>
          <div className="log-agenda__actions">
            {!legacyMode && (
              <button type="button" className="btn-ghost btn-xs" onClick={() => setDayActionOpen(true)} disabled={detailLoading || !detail}>
                <I d={ICONS.config} size={13} /> Organizar dia
              </button>
            )}
            {!legacyMode && (
              <button type="button" className="btn-ghost btn-xs" onClick={() => setImportSequenceOpen(true)} disabled={detailLoading || !detail}>
                <I d={ICONS.download} size={13} /> Importar sequência
              </button>
            )}
            <button type="button" className="btn-ghost btn-xs" onClick={onOpenRouteBuilder}>
              <I d={ICONS.logistica} size={13} /> Montar rota
            </button>
            {!legacyMode && (
              <button type="button" className="btn-teal btn-xs" onClick={() => openEditor(null)} disabled={detailLoading}>
                <I d={ICONS.plus} size={13} /> Parada
              </button>
            )}
          </div>
        </header>

        <div className="log-agenda__tools">
          <label className="log-agenda__search">
            <I d={ICONS.search} size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou produto" />
          </label>
          <div className="log-agenda__meta" role="status">
            {message && <span>{message}</span>}
            {!message && detail?.rota && <span>Versão {detail.rota.versao}</span>}
          </div>
        </div>

        {summaryError && !summary && (
          <div className="log-agenda__feedback is-error">
            <strong>Semana indisponível</strong>
            <span>{summaryError}</span>
            <button type="button" className="btn-ghost" onClick={() => void loadSummary()}>Tentar novamente</button>
          </div>
        )}

        {detailLoading && (
          <div className="log-agenda__list" aria-label="Carregando paradas">
            {[0, 1, 2].map((item) => (
              <div className="log-agenda__skeleton" key={item}><span className="log-agenda__skeleton-line" /></div>
            ))}
          </div>
        )}

        {!detailLoading && detailError && (
          <div className="log-agenda__feedback is-error">
            <strong>Dia indisponível</strong>
            <span>{detailError}</span>
            <button type="button" className="btn-ghost" onClick={() => void loadDay(selectedDay)}>Tentar novamente</button>
          </div>
        )}

        {!detailLoading && !detailError && firstNotice && (
          <p className="log-agenda-impact__notice">
            {firstNotice}{(detail?.avisos.length || 0) > 1 ? ` · +${(detail?.avisos.length || 0) - 1}` : ""}
          </p>
        )}

        {!detailLoading && !detailError && detail && !detail.paradas.length && (
          <div className="log-agenda__feedback">
            <strong>Dia livre</strong>
            <span>{legacyMode ? "Organize a agenda para editar." : "Adicione a primeira parada."}</span>
            {!legacyMode && (
              <button type="button" className="btn-teal" onClick={() => openEditor(null)}>
                <I d={ICONS.plus} size={14} /> Adicionar
              </button>
            )}
          </div>
        )}

        {!detailLoading && !detailError && detail && detail.paradas.length > 0 && !visibleStops.length && (
          <div className="log-agenda__feedback">
            <strong>Nenhum resultado</strong>
            <button type="button" className="btn-ghost" onClick={() => setSearch("")}>Limpar busca</button>
          </div>
        )}

        {!detailLoading && !detailError && visibleStops.length > 0 && (
          <div className="log-agenda__list">
            {visibleStops.map((stop) => {
              const plan = planById.get(stop.planoEntregaId) || null;
              const time = windowLabel(stop);
              const access = accessChip(stop);
              const additional = additionalChip(stop);
              return (
                <article className={`log-agenda-stop hbx-card-enter${plan?.ativo === false ? " is-paused" : ""}`} key={stop.id}>
                  {legacyMode ? (
                    <span className="log-agenda-stop__order" aria-hidden>{stop.ordem}</span>
                  ) : (
                    <button
                      type="button"
                      className="log-agenda-stop__order"
                      onClick={() => openMove(stop)}
                      aria-label={`Mover ${stop.cliente.nome}, posição ${stop.ordem}`}
                      title="Mover parada"
                    >
                      {stop.ordem}
                    </button>
                  )}
                  <div className="log-agenda-stop__copy">
                    <span className="log-agenda-stop__name">
                      {stop.cliente.nome}
                      <span className="log-agenda-stop__place"> · {addressLabel(stop)}</span>
                    </span>
                    <span className="log-agenda-stop__items">
                      {itemsLabel(stop)}
                      {/* S4 — hora estimada discreta (v1 sem OSRM, soma simples); nunca substitui a janela do cliente. */}
                      {stop.eta && <span className="log-agenda-stop__eta"> · chega ~{hourWord(stop.eta)}</span>}
                    </span>
                    <span className="log-agenda-stop__meta">
                      {time && <span className="log-agenda-stop__chip"><I d={ICONS.clock} size={11} /> {time}</span>}
                      {stop.tempoParadaMin && <span className="log-agenda-stop__chip">{stop.tempoParadaMin} min</span>}
                      {access && <span className={`log-agenda-stop__chip${access.warning ? " is-warning" : ""}`} title={access.title}>{access.text}</span>}
                      {additional && <span className="log-agenda-stop__chip" title={additional.title}><I d={ICONS.money} size={11} /> {additional.text}</span>}
                      {plan?.ativo === false && <span className="log-agenda-stop__chip is-warning">Pausada</span>}
                      {stop.alertaJanela && (
                        <span
                          className={`log-agenda-stop__chip${stop.alertaJanela === "CONFLITO" ? " is-conflict" : " is-warning"}`}
                          title={etaTooltip(stop)}
                        >
                          {stop.alertaJanela === "CONFLITO" ? "Conflito" : "Apertado"}
                        </span>
                      )}
                    </span>
                  </div>
                  {!legacyMode && (
                    <div className="log-agenda-stop__actions">
                      <button type="button" className="log-agenda-stop__action" onClick={() => openMove(stop)}>
                        <I d={ICONS.arrow} size={12} /> Mover
                      </button>
                      <button type="button" className="log-agenda-stop__action" onClick={() => plan && openEditor(plan)} disabled={!plan}>
                        <I d={ICONS.edit} size={12} /> Editar
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editorPlan !== undefined && (
        <PlanEditorModal
          day={selectedDay}
          plan={editorPlan}
          catalogs={catalogs}
          catalogsLoading={catalogsLoading}
          catalogsError={catalogsError}
          onClose={() => setEditorPlan(undefined)}
          onSaved={saveCompleted}
        />
      )}

      {moveStop && detail && (
        <MoveStopModal
          stop={moveStop}
          stops={detail.paradas}
          onClose={() => setMoveStop(null)}
          onMove={moveCompleted}
        />
      )}

      {dayActionOpen && (
        <DayActionModal
          day={selectedDay}
          onClose={() => setDayActionOpen(false)}
          onCompleted={dayActionCompleted}
        />
      )}

      {importSequenceOpen && (
        <ImportSequenceModal
          day={selectedDay}
          onClose={() => setImportSequenceOpen(false)}
          onApply={importSequenceApplied}
        />
      )}

      {legacyMigrationOpen && (
        <LegacyMigrationModal
          onClose={() => setLegacyMigrationOpen(false)}
          onCompleted={legacyMigrationCompleted}
        />
      )}

      {divergenceModalOpen && (
        <DivergenceModal
          day={selectedDay}
          onClose={closeDivergenceModal}
          onOpenPlan={openPlanFromDivergence}
        />
      )}
    </section>
  );
}
