"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

import { getAdminRouteAdjustments, prepareAdminRoute } from "./admin-logistica-api";
import styles from "./route-builder.module.css";
import { RouteAddressGate } from "./route-address-gate";
import { RouteConference } from "./route-conference";
import { checarEnderecos, descartarMontagem, type ChecarEnderecosResult } from "./route-conference-api";
import {
  getAgendaDayPreview,
  getWeeklyAgenda,
  type AgendaDayPreview,
  type AgendaWeekday,
} from "./weekly-agenda-api";

// PR29072026 (ordem do dono) — "/logistica tem q ter tudo q o celular tem,
// distancia (…) e quem está montando saber o q está acontecendo". Dois passos
// NOVOS, os mesmos do celular, entram no fluxo:
//   "gate"        → Endereços com erro, ANTES de materializar qualquer entrega.
//   "conferencia" → mapa + distância + previsão + crédito; só "Aceitar rota"
//                   consolida, e sair sem aceitar DESFAZ a montagem.
type Step = "home" | "saved" | "days" | "order" | "manual" | "gate" | "conferencia";

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

// 31/07 — GET /logistica/rota-modelos/estado: o que está acontecendo HOJE com
// cada rota salva. Sem isto, a única forma de descobrir que a rota estava com
// alguém era clicar e tomar 409 ("A entrega de X já está atribuída a outro
// motorista"). `podeMontar` vem do servidor com a MESMA regra do gerar.
type RouteModelState = {
  id: string;
  estado: "livre" | "montada" | "na_rua" | "devolvida";
  pessoaNome: string | null;
  pessoaEhVoce: boolean;
  comEle: number;
  total: number;
  entregues: number;
  desde: string | null;
  em: string | null;
  podeMontar: boolean;
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

// 🔴 MORREU AQUI o `AgendaSource` (F5, 09/08). A prévia do dia tinha DUAS fontes
// — a Agenda e o gerador V1 de `ClienteProduto` — e um `if (modo === "AGENDA_V2"
// && agendaV2Ativa)` escolhendo. O gerador V1 e a flag foram apagados na F1/F2;
// a condição virou sempre-verdadeira e a outra fonte, ramo morto.

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

function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * 31/07 — a frase do sub-rótulo da rota salva. Curta, sem jargão e sempre com
 * NOME e HORA: é o que responde "cadê minha rota?" antes de clicar. `alerta`
 * marca o caso que o dono precisa ver de longe — alguém aceitou e devolveu.
 */
function estadoDaRota(state: RouteModelState | undefined): { texto: string; alerta: boolean } | null {
  if (!state) return null;
  const quem = state.pessoaEhVoce ? "você" : (state.pessoaNome || "alguém");
  if (state.estado === "na_rua") {
    const hora = horaCurta(state.desde);
    const inicio = hora ? ` desde ${hora}` : "";
    return { texto: `Na rua com ${quem}${inicio} · ${state.entregues} de ${state.comEle} entregues`, alerta: false };
  }
  if (state.estado === "montada") {
    // Rota MORTA no nome de alguém: o servidor deixa assumir, então a tela
    // convida em vez de só informar (era aqui que o dono levava 409).
    const convite = state.pessoaEhVoce ? "" : " — clique para assumir";
    return { texto: `${state.pessoaEhVoce ? "Você está" : `${quem} parou`} com ${state.comEle} de ${state.total} paradas${convite}`, alerta: false };
  }
  if (state.estado === "devolvida") {
    const hora = horaCurta(state.em);
    return {
      texto: `Devolvida por ${quem}${hora ? ` às ${hora}` : ""} · ${state.entregues} de ${state.total} atendidas`,
      alerta: true,
    };
  }
  return null;
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

// MULTILOCAL — espelha `resolverCoordenadaMultilocal` do backend
// (backend/src/logistica/logistica-geo-fonte.util.ts). Cada eixo com `??` próprio
// (`local?.lat ?? cliente.lat`, `local?.lng ?? cliente.lng`) pode devolver a lat de
// uma fonte e a lng de outra — pino no meio do nada. Aqui a fonte INTEIRA é
// escolhida primeiro (local só vale com lat E lng válidos; senão perfil inteiro;
// senão null/null) e os dois eixos sempre saem da mesma fonte.
type FonteGeoCoord = {
  lat?: number | null;
  lng?: number | null;
};

function temCoordenadaValida(
  fonte: FonteGeoCoord | null | undefined,
): fonte is FonteGeoCoord & { lat: number; lng: number } {
  return (
    !!fonte &&
    typeof fonte.lat === "number" &&
    Number.isFinite(fonte.lat) &&
    typeof fonte.lng === "number" &&
    Number.isFinite(fonte.lng)
  );
}

function resolverCoordenadaMultilocal(
  local: FonteGeoCoord | null | undefined,
  perfil: FonteGeoCoord | null | undefined,
): { lat: number | null; lng: number | null } {
  const fonte = temCoordenadaValida(local) ? local : temCoordenadaValida(perfil) ? perfil : null;
  return {
    lat: fonte ? fonte.lat : null,
    lng: fonte ? fonte.lng : null,
  };
}

function normalizeAgendaPreview(result: AgendaDayPreview): DayPreview {
  return {
    date: result.date,
    clientes: result.paradas.map((stop) => {
      const coordenada = resolverCoordenadaMultilocal(stop.local, stop.cliente);
      return {
        customerProfileId: stop.customerProfileId,
        nome: stop.cliente.nome || "Cliente",
        localId: stop.localId,
        localApelido: stop.local?.apelido ?? null,
        lat: coordenada.lat,
        lng: coordenada.lng,
        itens: stop.itens.map((item) => ({
          productId: item.productId,
          nome: item.nome,
          qtd: item.qtd,
          valorUnit: item.valorUnit,
        })),
      };
    }),
  };
}

async function fetchDayPreview(day: number, date: string): Promise<DayPreview> {
  return normalizeAgendaPreview(await getAgendaDayPreview(day as AgendaWeekday, date));
}

function humanError(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível montar a rota.";
}

function itemsLabel(customer: PreviewCustomer): string {
  return customer.itens.map((item) => `${item.qtd} ${item.nome}`).join(" · ") || "Sem itens";
}

// 🔴 F3 (09/08) — `snapshotItems` MORREU AQUI. A rota salva virou só ORDEM
// (cliente + porta + posição): o que a visita leva mora na Agenda, no plano do
// cliente. Mandar `itens` no corpo agora é 400 na porta (o DTO recusa chave que
// não conhece), e a trava de "revise os preços antes de salvar" perdeu o
// motivo — salvar uma SEQUÊNCIA nunca dependeu de preço.

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
  // LEI DO VENDEDOR: número de crédito é coisa de admin. Sem a prop, a
  // conferência esconde o valor e só avisa quando o saldo NÃO cobre.
  admin = false,
}: {
  onClose: () => void;
  onCompleted: (message: string) => void;
  admin?: boolean;
}) {
  const [step, setStep] = useState<Step>("home");
  const [models, setModels] = useState<RouteModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  // 31/07 — o que está acontecendo com cada rota salva HOJE (ver RouteModelState).
  const [modelStates, setModelStates] = useState<Record<string, RouteModelState>>({});
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [sourceDates, setSourceDates] = useState<Record<number, string>>({});
  const [dayCounts, setDayCounts] = useState<Record<number, number | null | undefined>>({});
  // `previewBruto` = o que a agenda devolveu; `preview` (derivado abaixo) já
  // desconta quem o operador tirou só da rota de hoje no portão de endereços.
  const [previewBruto, setPreviewBruto] = useState<PreviewCustomer[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [saveManual, setSaveManual] = useState(false);
  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // PR29072026 — portão de endereços + conferência.
  const [gate, setGate] = useState<{ dias: number[]; dates: string[]; dados: ChecarEnderecosResult } | null>(null);
  // Clientes que o operador mandou ficar fora SÓ HOJE (o dia deles fica salvo).
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [conferencia, setConferencia] = useState<{ date: string; deliveryIds: string[] } | null>(null);
  // Recado da geração da rota salva ("N cliente(s) pulado(s)") — vira linha na
  // conferência em vez de morrer num toast que fechava a tela.
  const [aviso, setAviso] = useState<string | null>(null);
  const previewRequest = useRef(0);

  // 31/07 — estado das rotas salvas: relido toda vez que a lista aparece (a
  // pessoa pode aceitar, sair ou devolver a rota com este diálogo aberto).
  useEffect(() => {
    if (step !== "home" && step !== "saved") return undefined;
    let cancelled = false;
    apiFetch<RouteModelState[]>(`/logistica/rota-modelos/estado?date=${encodeURIComponent(operationalDate())}`)
      .then((rows) => {
        if (cancelled) return;
        setModelStates(Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [row.id, row])));
      })
      .catch(() => { /* estado é acessório: rede fora não pode derrubar o painel */ });
    return () => { cancelled = true; };
  }, [step]);

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
        setDayCounts(Object.fromEntries(WEEK_DAYS.map((day) => {
          const summary = agenda.dias.find((item) => item.diaSemana === day.n);
          return [day.n, summary?.totalParadas ?? 0];
        })));
      })
      .catch(() => {
        // A semana é a ÚNICA fonte do contador do dia. Sem ela, o dia mostra
        // vazio (`null`) em vez de esqueleto eterno — a lista continua abrindo,
        // e a prévia real vem do clique no dia.
        if (!cancelled) setDayCounts(Object.fromEntries(WEEK_DAYS.map((day) => [day.n, null])));
      })
      .finally(() => {
        if (!cancelled) setAgendaLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Na conferência o Escape não fecha seco: a rota já está materializada, e
    // sumir com ela sem desfazer deixaria o dia do cliente consumido. Lá a
    // saída é "Cancelar rota" (que desfaz) ou "Aceitar rota".
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !building && step !== "conferencia") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [building, onClose, step]);

  // "Tirar só da rota de hoje" (portão de endereços) some da prévia na hora — o
  // contador de tela conta o que a lista mostra.
  const preview = useMemo(
    () => (excluidos.length ? previewBruto.filter((customer) => !excluidos.includes(String(customer.customerProfileId))) : previewBruto),
    [excluidos, previewBruto],
  );

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

  // O contador de cada dia vem do resumo da semana, carregado ao abrir o
  // diálogo (o botão fica desabilitado até chegar). O `loadDayCounts` que
  // varria `/logistica/dia-preview` dia a dia morreu com a fonte legada.
  function openDays() {
    setError(null);
    setStep("days");
  }

  async function refreshPreview(days: number[]) {
    const requestId = ++previewRequest.current;
    if (!days.length) {
      setPreviewBruto([]);
      setSourceDates({});
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const rows = await Promise.all(days.map(async (day) => {
        const primaryDate = dateForWeekday(day);
        let result = await fetchDayPreview(day, primaryDate);
        let sourceDate = primaryDate;
        if (day === isoWeekday(operationalDate()) && result.clientes.length === 0) {
          const fallbackDate = dateForWeekday(day, 1);
          const fallback = await fetchDayPreview(day, fallbackDate);
          if (fallback.clientes.length) {
            result = fallback;
            sourceDate = fallbackDate;
          }
        }
        return { day, sourceDate, result };
      }));
      if (previewRequest.current !== requestId) return;
      setSourceDates(Object.fromEntries(rows.map((row) => [row.day, row.sourceDate])));
      setPreviewBruto(mergePreviews(rows.map((row) => row.result)));
    } catch (previewError: unknown) {
      if (previewRequest.current === requestId) {
        setPreviewBruto([]);
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

  // `fora` explícito porque quem chama daqui pode ter acabado de excluir gente
  // NESTE mesmo handler: `preview` (estado derivado) ainda seria o de antes, e a
  // ordem manual nasceria com clientes que já saíram da rota.
  function openOrderChoice(fora: string[] = excluidos) {
    const lista = fora.length
      ? previewBruto.filter((customer) => !fora.includes(String(customer.customerProfileId)))
      : previewBruto;
    setManualOrder(lista.map(previewKey));
    setSearch("");
    setStep("order");
  }

  // 🔴 PORTÃO (ordem do dono, 28/07 — hoje também no computador): antes de
  // materializar QUALQUER entrega, o backend confere os endereços e deixa a cura
  // automática resolver o que dá. Sobrou problema → a tela de erros. Zerou →
  // segue direto. Servidor sem o endpoint não pode travar o operador: segue.
  async function abrirPortao(dias: number[], dates: string[], seguir: () => void) {
    if (!dias.length) { seguir(); return; }
    setBuilding(true);
    setError(null);
    try {
      const dados = await checarEnderecos(dias, dates);
      if (!(dados.problemas || []).length) { setBuilding(false); seguir(); return; }
      setGate({ dias, dates, dados });
      setStep("gate");
      setBuilding(false);
    } catch (gateError: unknown) {
      const status = (gateError as { status?: number } | null)?.status;
      setBuilding(false);
      if (status === 404 || status === 405) { seguir(); return; }
      setError(humanError(gateError));
    }
  }

  function conferirDepoisDoPortao() {
    void abrirPortao(
      selectedDays,
      selectedDays.map((day) => sourceDates[day] || dateForWeekday(day)),
      () => openOrderChoice(),
    );
  }

  /**
   * Clientes tirados "só da rota de hoje" no portão saem da SELEÇÃO (mesmo
   * mecanismo do app): a entrega já nasceu no prepare, mas não entra nem na
   * conferência nem no planejar. O dia deles continua salvo no cadastro.
   */
  async function semExcluidos(date: string, ids: string[]): Promise<string[]> {
    if (!excluidos.length) return ids;
    const fora = new Set(excluidos.map(String));
    const route = await apiFetch<RouteForOrdering>(`/logistica/rota?date=${encodeURIComponent(date)}`);
    const donoDaParada = new Map(route.items.map((item) => [String(item.id), String(item.customerProfileId || item.cliente.id)]));
    return ids.filter((id) => !fora.has(donoDaParada.get(id) || ""));
  }

  function abrirConferencia(date: string, deliveryIds: string[]) {
    setConferencia({ date, deliveryIds });
    setStep("conferencia");
    setBuilding(false);
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
        // A prévia velha ainda barra: sequência que aponta pra cliente que saiu
        // da lista salvaria uma ordem que não existe. O que caiu (F3) foi só a
        // conferência de PREÇO — a rota salva não guarda mais item nenhum.
        const ordemAtual = manualOrder.map((key) => preview.find((customer) => previewKey(customer) === key));
        if (ordemAtual.some((customer) => !customer)) {
          throw new Error("Atualize a prévia antes de salvar esta rota.");
        }
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

      const preparedIds = await semExcluidos(today, [...new Set(prepared.plan.paradas.map((stop) => String(stop.id)))]);

      if (mode === "manual") {
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

      // Montar e conferir são a MESMA coisa: em vez do toast seco "Rota
      // planejada.", o operador cai na conferência e decide com o mapa, a
      // distância e o crédito na frente.
      abrirConferencia(today, preparedIds);
    } catch (buildError: unknown) {
      setError(humanError(buildError));
      setBuilding(false);
    }
  }

  // "Ao clicar no dia, OU EM ROTAS SALVAS" — o portão vale nos dois caminhos.
  // Rota salva sem dia da semana não tem roster de dia pra conferir: segue direto.
  function buildSavedRoute(model: RouteModel) {
    if (building) return;
    const dia = Number(model.diaSemana);
    const dias = Number.isInteger(dia) && dia >= 1 && dia <= 7 ? [dia] : [];
    void abrirPortao(dias, dias.map((day) => dateForWeekday(day)), () => void gerarRotaSalva(model));
  }

  async function gerarRotaSalva(model: RouteModel) {
    setBuilding(true);
    setError(null);
    try {
      const date = operationalDate();
      const result = await apiFetch<GenerateSavedRouteResult>(`/logistica/rota-modelos/${encodeURIComponent(model.id)}/gerar`, {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      const gerados = [...new Set((result.deliveryIds || []).map(String))];
      const deliveryIds = await semExcluidos(date, gerados);
      if (!deliveryIds.length) throw new Error(result.avisos?.[0] || "Nenhuma entrega para esta rota.");
      await apiFetch("/logistica/rota/planejar", {
        method: "POST",
        body: JSON.stringify({ date, deliveryIds, ordemManual: deliveryIds }),
      });
      setAviso(result.avisos?.length
        ? (result.avisos.length === 1 ? result.avisos[0] : `${result.avisos.length} cliente(s) pulado(s).`)
        : null);
      abrirConferencia(date, deliveryIds);
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

  // Fechar (× ou fundo). Na conferência a rota JÁ está materializada: sair sem
  // aceitar tem que DESFAZER, senão o dia do cliente fica consumido na agenda
  // sem ninguém ter confirmado nada.
  async function fechar() {
    if (building) return;
    if (step === "conferencia" && conferencia) {
      setBuilding(true);
      try {
        await descartarMontagem(conferencia.date, "Rota desfeita antes da confirmação.");
        onCompleted("Rota desfeita.");
      } catch (closeError: unknown) {
        setError(humanError(closeError));
        setBuilding(false);
      }
      return;
    }
    onClose();
  }

  const title = step === "saved"
    ? "Rotas Salvas"
    : step === "days"
      ? "Por dia"
      : step === "order"
        ? "Ordem das paradas"
        : step === "manual"
          ? "Sua ordem"
          : step === "gate"
            ? "Endereços com erro"
            : step === "conferencia"
              ? "Conferência de rota"
              : "Montar Rota";

  const gateTotal = Number(gate?.dados.total) || 0;
  const gateProblemas = gate?.dados.problemas.length || 0;

  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !building) void fechar(); }}>
      <section
        className={`${styles.dialog}${step === "conferencia" ? ` ${styles.dialogWide}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-builder-title"
      >
        <header className={styles.header}>
          <span className={styles.icon}><I d={ICONS.logistica} size={20} /></span>
          <div className={styles.heading}>
            <h2 id="route-builder-title">{title}</h2>
            {step === "days" && <p>Escolha os dias</p>}
            {step === "order" && <p>{preview.length} {preview.length === 1 ? "parada pronta" : "paradas prontas"}</p>}
            {step === "manual" && <p>Busque ou digite a posição</p>}
            {step === "gate" && <p>{gateProblemas} de {gateTotal} {gateTotal === 1 ? "cliente" : "clientes"}</p>}
            {step === "conferencia" && aviso && <p>{aviso}</p>}
          </div>
          <button type="button" className={styles.close} aria-label="Fechar" onClick={() => void fechar()} disabled={building}>×</button>
        </header>

        {step === "gate" && gate ? (
          <RouteAddressGate
            dias={gate.dias}
            dates={gate.dates}
            dados={gate.dados}
            onLimpo={() => { setGate(null); openOrderChoice(); }}
            onIgnorarNaRota={(ids) => {
              const fora = [...new Set([...excluidos, ...ids])];
              setExcluidos(fora);
              setGate(null);
              openOrderChoice(fora);
            }}
            onVoltar={() => { setGate(null); setStep(selectedDays.length ? "days" : "home"); }}
          />
        ) : step === "conferencia" && conferencia ? (
          <RouteConference
            date={conferencia.date}
            deliveryIds={conferencia.deliveryIds}
            admin={admin}
            onAccepted={(message) => onCompleted(message)}
            onDiscarded={(message) => onCompleted(message)}
          />
        ) : (
        <>
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
                .map((model) => {
                  const state = modelStates[model.id];
                  const recado = estadoDaRota(state);
                  // Vitrine e caixa, o MESMO porteiro: `podeMontar` é a régua do
                  // servidor. Rota ocupada por outra pessoa fica desligada com o
                  // motivo escrito, em vez de liberar o clique e devolver 409.
                  const ocupada = state?.podeMontar === false;
                  const motivo = ocupada
                    ? `${state?.pessoaNome || "Outra pessoa"} está com as paradas desta rota hoje.`
                    : "";
                  return (
                    <button type="button" key={model.id} className={`${styles.option} ${ocupada ? styles.bloqueada : ""}`} onClick={() => void buildSavedRoute(model)} disabled={building || ocupada} title={motivo}>
                      <span className={`${styles.optionIcon} ${styles.star}`}>☆</span>
                      <span className={styles.optionCopy}>
                        <strong>{model.nome || "Rota"}</strong>
                        <small>{model.paradas?.length || 0} parada(s)</small>
                        {recado ? <small className={recado.alerta ? styles.estadoAlerta : styles.estado}>{recado.texto}</small> : null}
                      </span>
                      <span className={styles.chevron}>›</span>
                    </button>
                  );
                }) : <p className={styles.empty}>Nenhuma rota salva.</p>}
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
              {step === "days" && <button type="button" className={styles.primary} onClick={conferirDepoisDoPortao} disabled={!selectedDays.length || !preview.length || previewLoading || building}>Próximo ›</button>}
              {step === "manual" && <button type="button" className={styles.primary} onClick={() => void buildFromDays("manual")} disabled={!manualOrder.length || building}>{building ? "Montando…" : "Gerar agora"}</button>}
            </div>
          </footer>
        )}
        </>
        )}

        {building && step !== "manual" && (
          <div className={styles.busy} role="status">
            {step === "days" ? "Conferindo os endereços…" : step === "conferencia" ? "Desfazendo a rota…" : "Montando a rota…"}
          </div>
        )}
      </section>
    </div>
  );
}
