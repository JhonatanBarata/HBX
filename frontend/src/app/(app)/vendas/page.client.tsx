"use client";

// Tela Vendas (template docs/TEMAS/*/corporate/index.html) ligada no board
// real: GET /vendas/board → { summary, blocks: { today, overdue, scheduled,
// closed }, usage }. O modelo real é agenda de retorno (4 blocos), não funil
// de 5 etapas — as colunas do kanban renderizam os blocos reais com a mesma
// estrutura visual do template. Sem dado para um campo → "—".
// Detalhe do negócio liga os campos reais do card (score de oportunidade,
// temperatura, avaliação, observação, histórico/timeline). As seções fake do
// template (Próximas tarefas, Funil) foram removidas — só dado real (21/06).

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS, KpiRow, WhatsAppMark, isModuleVisible, useCurrentUser, useEntitlements, useMyModules } from "@/components/hbx/shell";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { FecharVendaModal } from "@/components/hbx/fechar-venda-modal";
import { VendasModoFoco } from "@/components/hbx/vendas-modo-foco";
import { FocoGame, type FocoLead } from "@/components/hbx/foco-game";
import { LeadsClient } from "../leads/page.client";
import { apiFetch } from "@/lib/api";
import { useTabParam } from "@/lib/use-tab-param";
import { useIsMobile } from "@/lib/use-is-mobile";

type VendasLead = {
  id: string;
  customerProfileId?: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  address?: string | null;
  website?: string | null;
  cnpj?: string | null;
  cnae?: string | null;
  razaoSocial?: string | null;
  ownerName?: string | null;
  ownerNames?: string[] | null;
  ownerPhone?: string | null;
  ownerInstagram?: string | null;
  ownerFacebook?: string | null;
  companySituation?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  phonesWhatsapp?: Record<string, boolean> | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  rating?: number | null;
  reviews?: number | null;
  opportunityScore?: number | null;       // 0–100, herdado do Radar
  leadTemperature?: string | null;         // frio | morno | quente
  timesSeen?: number | null;
  status: string;
  statusLabel: string;
  nextAction: string | null;
  returnAt: string | null;
  shortNote: string | null;
  lastContactAt: string | null;
  attemptCount: number;
  lastResult?: string | null;
  closedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  // origem do lead
  sourceType?: string | null;
  primarySource?: string | null;
  // presença no Atendimento
  isInInbox?: boolean | null;
  timeline?: Array<{
    id: string;
    eventType?: string | null;
    title: string | null;
    description: string | null;
    resultLabel?: string | null;
    returnAt?: string | null;
    createdAt?: string | null;
  }> | null;
  saleConfirmedAt: string | null;
  saleStatus?: string | null;
  saleStatusLabel: string | null;
  saleValue: number | null;
  commissionStatusLabel?: string | null;
  commissionAmount?: number | null;
  commissionDueAt?: string | null;
  commissionRecurring?: boolean | null;
  commissionNote?: string | null;
  setupValue?: number | null;
  setupCommissionAmount?: number | null;
  setupCommissionStatusLabel?: string | null;
  commissionPercentSnapshot?: number | null;
  product: { name: string | null; priceLabel: string | null; canViewPrice?: boolean } | null;
  leadIntelligence?: {
    whatsappStatus?: string | null;   // 'confirmed' | 'missing' | 'invalid' | 'unverified'
    emailStatus?: string | null;      // 'confirmed' | 'probable' | 'missing' | 'invalid' | 'unverified'
    websiteStatus?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    // camada de inteligência (Lead Plus / enriquecimento)
    opportunityReason?: string | null;
    leadReasonTags?: string[] | null;
    recommendedChannel?: string | null;
    painType?: string | null;
    painPitch?: string | null;
    messageTemplate?: string | null;
    contactQuality?: string | null;
    enrichedAt?: string | null;       // ISO — presente quando o lead foi enriquecido
  } | null;
  owner: { name: string | null } | null;
  block: "today" | "overdue" | "scheduled" | "closed";
};

type BoardResponse = {
  summary: { total: number; today: number; overdue: number; scheduled: number; closed: number };
  blocks: { today: VendasLead[]; overdue: VendasLead[]; scheduled: VendasLead[]; closed: VendasLead[] };
  // Opt-in: tenant HBX admin (revende planos HBX) — habilita o seletor de plano
  // no Fechar venda. Cliente comum vem ausente/false e nunca vê o seletor.
  sellsHbxPlans?: boolean;
  // Capacidade da carteira → faixa "por que o Radar parou de buscar". O motor
  // pausa o reabastecimento quando a lista enche (teto de cards ativos).
  radarSupply?: {
    isSeller: boolean;
    // unlimited = carteira sem teto (lei do dono 27/06). Mostra "à vontade",
    // sem denominador/medidor de vagas.
    unlimited?: boolean;
    activeCards: number;
    capacity: number;
    availableSlots: number;
    full: boolean;
    paused: boolean;
    code: string | null;
  } | null;
} | null;

type TriagemItem = { key: string; label: string; ok: boolean };
type Triagem = { confirmed: boolean; confirmedAt?: string | null; itens: TriagemItem[]; pendentes: string[]; pronto: boolean };
type LiveStatus = {
  status: string;
  text?: string | null;
  active?: boolean;
  counters?: { todayPending: number; overdue: number; future: number; sent: number; positives: number; archived: number; failed: number };
  nextScheduledAt?: string | null;
  triagem?: Triagem | null;
} | null;

const PROSP_LABEL: Record<string, string> = {
  parado: "Parada", pausado: "Pausada", erro: "Erro", dormindo: "Fora do horário",
  buscando: "Buscando leads", importando: "Importando", agendando: "Agendando",
  enviando: "Enviando", aguardando: "Aguardando",
};

const BLOCK_ORDER: { key: keyof NonNullable<BoardResponse>["blocks"]; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "overdue", label: "Atrasados" },
  { key: "scheduled", label: "Agendados" },
  { key: "closed", label: "Fechados" },
];


function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function leadValueLabel(lead: VendasLead) {
  return lead.product?.priceLabel || fmtMoney(lead.saleValue) || "—";
}

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameDay(d, today)) return "Hoje";
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, tomorrow)) return "Amanhã";
  return d.toLocaleDateString("pt-BR");
}


// ── Quadro (kanban arrastável) — etapas reais do lead (status), independente da
// agenda (block). Arrastar entre colunas faz PATCH /vendas/lead/:id {status}.
type VendasStage = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
const STAGE_ORDER: { key: VendasStage; label: string; tone: string }[] = [
  { key: "novo", label: "Novo", tone: "new" },
  { key: "contato", label: "Em contato", tone: "contact" },
  { key: "retorno", label: "Retorno", tone: "return" },
  { key: "qualificado", label: "Qualificado", tone: "qualified" },
  { key: "encerrado", label: "Encerrado", tone: "ended" },
];
const STAGE_LABEL: Record<VendasStage, string> = {
  novo: "Novo lead", contato: "Em contato", retorno: "Retorno", qualificado: "Qualificado", encerrado: "Encerrado",
};
function normalizeStage(status: string | null | undefined): VendasStage {
  const s = String(status || "").trim().toLowerCase();
  if (s === "contato") return "contato";
  if (s === "retorno") return "retorno";
  if (s === "qualificado") return "qualificado";
  if (s === "encerrado") return "encerrado";
  return "novo";
}

// Chip de agenda no card do quadro: a cor carrega a urgência (texto mínimo).
function agendaInfo(card: VendasLead): { tone: string; label: string } {
  if (card.block === "overdue") return { tone: "danger", label: "Atrasado" };
  if (card.block === "today") return { tone: "today", label: "Hoje" };
  if (card.block === "closed") return { tone: "done", label: card.closedAt ? fmtWhen(card.closedAt) : "Fechado" };
  return { tone: "soft", label: fmtWhen(card.returnAt) };
}

// Move otimista: troca o status do card no estado local sem esperar a rede.
function patchCardStage(board: BoardResponse, id: string, stage: VendasStage): BoardResponse {
  if (!board) return board;
  const patch = (arr: VendasLead[]) =>
    arr.map(c => (c.id === id ? { ...c, status: stage, statusLabel: STAGE_LABEL[stage] } : c));
  return {
    ...board,
    blocks: {
      today: patch(board.blocks.today),
      overdue: patch(board.blocks.overdue),
      scheduled: patch(board.blocks.scheduled),
      closed: patch(board.blocks.closed),
    },
  };
}

// 4º botão do topo (visual DIFERENTÃO): os dados da faixa "Buscando empresas"
// viram um card destacado ao lado dos 3 KPIs. Nunca invade o card de detalhe —
// mora dentro da barra do topo, que é limitada à coluna da esquerda.
function RadarSupplyCard({
  supply,
  onLiberar,
}: {
  supply: NonNullable<NonNullable<BoardResponse>["radarSupply"]>;
  onLiberar: () => void;
}) {
  const unlimited = Boolean(supply.unlimited) && !supply.paused;
  const capacity = Math.max(1, supply.capacity || 1);
  const used = Math.max(0, Math.min(supply.activeCards ?? 0, capacity));
  const pct = used / capacity;
  const state = unlimited ? "ok" : supply.full ? "full" : (supply.paused || pct >= 0.8) ? "warn" : "ok";
  const count = unlimited ? Math.max(0, supply.activeCards ?? 0) : used;
  const label = supply.paused ? "Distribuição pausada"
    : state === "full" ? "Lista cheia"
    : state === "warn" ? "Lista quase cheia"
    : "Buscando empresas";
  const unit = unlimited ? "na lista" : `/ ${capacity}`;
  const clickable = state === "full";
  return (
    <div
      className={"vnd-supcard vnd-supcard--" + state + (clickable ? " is-clickable" : "")}
      role={clickable ? "button" : "status"}
      tabIndex={clickable ? 0 : undefined}
      aria-label={label}
      onClick={clickable ? onLiberar : undefined}
      onKeyDown={clickable ? (e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onLiberar(); } }) : undefined}
    >
      <span className="vnd-supcard__halo" aria-hidden="true" />
      <span className="vnd-supcard__ic" aria-hidden="true">
        <I d={state === "full" ? ICONS.pause : ICONS.scrape} size={16} />
      </span>
      <span className="vnd-supcard__txt">
        <span className="vnd-supcard__label">{label}</span>
        <span className="vnd-supcard__val"><b>{count}</b> <span>{unit}</span></span>
      </span>
      {clickable && <span className="vnd-supcard__cta">Liberar</span>}
    </div>
  );
}

type BotStatus = { botModuleEnabled: boolean; botArmed: boolean } | null;
type RetornoMode = 'manual' | 'auto_email' | 'auto_whatsapp' | 'auto_both';

// LIGA/DESLIGA todos os efeitos de troca de guia (transição das camadas, entrada
// escalonada dos KPIs, "digitando" do título, pulso do 4º card). Pedido do dono
// 29/06: travar tudo SECO por enquanto pra validar a casca; depois ele manda
// religar = só pôr `true` aqui (o CSS lê via data-fx no .vnd-modehost).
const EFFECTS_ON = true;

// ── TypedText — efeito "digitando" (mesmo do card de detalhe) ─────────────────
// Re-digita a cada montagem; o caller passa key={...} pra re-rodar na troca de
// modo. Sem setState síncrono no corpo do effect (lint react-hooks é erro aqui):
// o reset vem do key, os updates rodam só dentro do interval/rAF.
function TypedTextCore({ text, speed }: { text: string; speed: number }) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!text) return;
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!EFFECTS_ON || reduce) {
      const id = requestAnimationFrame(() => { setShown(text); setDone(true); });
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); setDone(true); }
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed]);
  return <span className={"vnd-typed" + (done ? " is-done" : "")}>{shown}<i className="vnd-caret" aria-hidden="true" /></span>;
}
function TypedText({ text, speed = 42 }: { text: string; speed?: number }) {
  return <TypedTextCore key={text} text={text} speed={speed} />;
}

export function VendasClient() {
  const router = useRouter();
  // Gate do botão "Buscar empresas" (boca do funil): mesmo veredito da navegação —
  // sem acesso ao Radar, o botão SOME (não mostrar-e-barrar; FRONTEND.md).
  const entVnd = useEntitlements();
  const userVnd = useCurrentUser();
  const modsVnd = useMyModules();
  const podeBuscarLeads = isModuleVisible("leads", entVnd, userVnd, modsVnd);
  // Slide Funil ↔ Buscar empresas (27/06): UMA tela, 2 modos. buscarMounted monta o
  // Radar só quando precisa (lazy) e o mantém montado depois (slide fluido).
  const [modo, setModo] = useState<"funil" | "buscar">("funil");
  const [buscarMounted, setBuscarMounted] = useState(false);
  // 3 números do Radar pro topo da casca ÚNICA (vêm do LeadsClient via callback) —
  // o topo é o mesmo nos 2 modos; só os DADOS trocam. 29/06.
  const [buscarStats, setBuscarStats] = useState<{ totalBrasil: number | null; disponiveis: number | null; cotaLabel: string; cotaValue: string; cotaPct: number }>(
    { totalBrasil: null, disponiveis: null, cotaLabel: "Cota do mês", cotaValue: "—", cotaPct: 0 });
  const [board, setBoard] = useState<BoardResponse>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sel, setSel] = useState<VendasLead | null>(null);
  // Quantos leads estão esperando no pool do Radar agora (pra deixar CLARO,
  // no funil vazio, por que está vazio e o que fazer). Conta real da vitrine.
  const [poolDisponivel, setPoolDisponivel] = useState<number | null>(null);
  // Automático — standing order compartilhado com /leads
  const [autoAtivo, setAutoAtivo] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  // Status do bot para a empresa (F5): bot-módulo habilitado + chave-mestra armada.
  // Carregado uma vez na montagem; null = ainda consultando.
  const [botStatus, setBotStatus] = useState<BotStatus>(null);
  const [masterNotified, setMasterNotified] = useState(false);
  const [retornoMode, setRetornoMode] = useState<RetornoMode>('manual');
  // visão do pipeline: lista densa (padrão — varredura) × quadro kanban
  // (arrastar entre etapas). Ordem do dono 13/06: lista padrão + quadro opcional.
  const [view, setView] = useTabParam<"list" | "board">("view", "list", ["list", "board"]);
  const [sortBy, setSortBy] = useState<"default" | "az" | "za">("default");
  // Filtro de texto: sincronizado com o campo de busca do topbar (hbx:search-query)
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const handler = (e: Event) => setSearchQuery((e as CustomEvent<string>).detail ?? "");
    window.addEventListener("hbx:search-query", handler);
    return () => window.removeEventListener("hbx:search-query", handler);
  }, []);

  // agenda embutida (ordem do dono): painel lateral com os retornos reais
  // do board + sincronização da agenda de hoje no WhatsApp
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // WhatsApp action button: sessão QR acessível + acesso ao módulo Atendimento.
  // Carregado uma vez ao montar; não precisa de poll (mesmo critério do Atendimento).
  const [waQrActive, setWaQrActive] = useState(false);
  const [canAtendimento, setCanAtendimento] = useState(false);
  // Estado do "WhatsApp Interno": POST /inbox/conversations/start + navegação
  const [waStartBusy, setWaStartBusy] = useState(false);
  const [waStartError, setWaStartError] = useState<string | null>(null);

  async function sincronizarHoje() {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const res = await apiFetch<{ message?: string }>("/vendas/agenda/whatsapp/sync-today", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSyncMsg(res?.message || "✓ Agenda de hoje sincronizada no WhatsApp.");
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Não foi possível sincronizar a agenda.");
    } finally {
      setSyncBusy(false);
    }
  }

  const loadBoard = useCallback(() => {
    return apiFetch<BoardResponse>("/vendas/board")
      .then(res => {
        setBoard(res);
        setLoadError(null);
        const todos = BLOCK_ORDER.map(b => res?.blocks?.[b.key] || []).flat();
        // mantém a seleção, mas sempre com a versão FRESCA do card
        setSel(prev => (prev && todos.find(c => c.id === prev.id)) || todos[0] || null);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar o board de Vendas.");
      });
  }, []);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  // Entrar já no modo "Buscar empresas" quando vier de fora (/leads redireciona pra
  // cá com a flag). setState DENTRO do rAF (não no corpo do effect) p/ respeitar
  // react-hooks/set-state-in-effect (é erro de lint neste repo).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (sessionStorage.getItem("hbx:vendas-modo") === "buscar") {
          sessionStorage.removeItem("hbx:vendas-modo");
          setBuscarMounted(true);
          setModo("buscar");
        }
      } catch { /* sem storage */ }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function irBuscar() { setBuscarMounted(true); setModo("buscar"); }
  function irFunil() { setModo("funil"); }
  // Lead puxado no Radar embutido entrou no funil → recarrega o board; focus desliza
  // pro funil mostrando ele (puxar manual). Auto-pull manda focus=false (só recarrega).
  function handlePulled(focus?: boolean) { loadBoard(); if (focus) setModo("funil"); }

  // Conta os leads disponíveis no pool (vitrine) — só pra mostrar no funil vazio.
  useEffect(() => {
    apiFetch<{ total?: number; meta?: { totalAvailable?: number } }>("/webscraping/radar/leads?scope=vitrine&limit=1")
      .then(res => setPoolDisponivel(Math.max(0, Math.trunc(Number(res?.meta?.totalAvailable ?? res?.total ?? 0)) || 0)))
      .catch(() => setPoolDisponivel(null));
    apiFetch<{ standingOrder?: { active?: boolean } }>("/webscraping/radar/standing-order")
      .then(res => { if (typeof res?.standingOrder?.active === "boolean") setAutoAtivo(res.standingOrder.active); })
      .catch(() => null);
    apiFetch<BotStatus>("/vendas/bot-status")
      .then(res => setBotStatus(res))
      .catch(() => setBotStatus({ botModuleEnabled: false, botArmed: false }));
    // QR ativo: whatsappSession.accessible = sessão do vendedor (própria ou compartilhada)
    apiFetch<{ whatsappSession?: { accessible?: boolean } }>("/inbox/whatsapp-session")
      .then(res => setWaQrActive(res?.whatsappSession?.accessible === true))
      .catch(() => setWaQrActive(false));
    // Acesso ao Atendimento: /modules/me devolve a mesma lista que o app-shell usa
    // para mostrar (ou não) o item do menu — se accessible:true, o vendedor atende.
    // No modo COMPARTILHADO com retenção (admin não repassa inbox), accessible é false
    // para o subordinado, então o Interno fica desabilitado — o mesmo que o start faria.
    apiFetch<Array<{ key: string; accessible?: boolean }>>("/modules/me")
      .then(list => {
        const mods = Array.isArray(list) ? list : [];
        const atend = mods.find(m => String(m.key || "").trim().toLowerCase() === "atendimento");
        setCanAtendimento(atend?.accessible === true);
      })
      .catch(() => { setCanAtendimento(false); });
  }, []);

  // Fechamento de venda com produto (trilha Produtos & Comissão, item 1):
  // PATCH /vendas/lead/:id {productId, saleValue, saleStatus} para venda
  // direta; POST .../hbx-handoff para produto sob consulta (fechamento
  // assistido). Produtos vêm de GET /products (cadastro da empresa).
  const [fecharOpen, setFecharOpen] = useState(false);

  // quick actions reais do card (caminho da vendedora, 12/06/2026): marcar
  // RESULTADO da ligação + observação (POST lead/:id/attempt grava a tentativa
  // na timeline + contador; PATCH lead/:id {shortNote} deixa o resultado
  // visível no card) e mover etapa/agendar retorno (PATCH lead/:id
  // {status|returnAt}). Só endpoints existentes — sem mexer no backend.
  const [acaoBusy, setAcaoBusy] = useState(false);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [fecharMsg, setFecharMsg] = useState<string | null>(null);
  const [retornoData, setRetornoData] = useState("");
  const [obs, setObs] = useState("");
  // Popup de Retorno e Sem Interesse (substituem o clutter do cockpit)
  const [retornoOpen, setRetornoOpen] = useState(false);
  const [semInteresseOpen, setSemInteresseOpen] = useState(false);
  const [semInteresseMotivo, setSemInteresseMotivo] = useState<string>("");

  // Excluir card: devolve ao pool COM MOTIVO (matriz de disposição PR24062026).
  // "só excluir" (excluir) → card reaparece na vitrine da própria empresa; "resultado
  // não satisfatório" (unsatisfactory) → some pra você, volta pros outros.
  // POST /vendas/leads/:id/delete { reason }.
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Modal de motivo da exclusão (unitária OU em massa). alvo='card' → exclusão do card
  // selecionado; alvo='bulk' → exclusão dos selecionados.
  const [excluirMotivoOpen, setExcluirMotivoOpen] = useState<null | "card" | "bulk">(null);
  async function deletarCard(reason: string) {
    if (!sel?.id || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/vendas/leads/${encodeURIComponent(sel.id)}/delete`, { method: "POST", body: JSON.stringify({ reason }) });
      setSel(null);
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível excluir o card.");
    } finally {
      setDeleteBusy(false);
    }
  }

  // Seleção em massa (lista desktop): checkbox por linha + "Selecionar todos" +
  // excluir em lote. POST /vendas/leads/delete-bulk { leadIds } devolve cada card
  // ao pool (mesmo efeito do delete unitário) e responde { deletedCount }.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function excluirSelecionados(reason: string) {
    const ids = Array.from(selecionados);
    if (ids.length === 0 || bulkDeleteBusy) return;
    setBulkDeleteBusy(true);
    setBulkMsg(null);
    try {
      const res = await apiFetch<{ deletedCount?: number }>("/vendas/leads/delete-bulk", {
        method: "POST",
        body: JSON.stringify({ leadIds: ids, reason }),
      });
      const n = res?.deletedCount ?? ids.length;
      if (sel && ids.includes(sel.id)) setSel(null);
      setSelecionados(new Set());
      setBulkMsg(`✓ ${n} card${n === 1 ? "" : "s"} excluído${n === 1 ? "" : "s"}.`);
      await loadBoard();
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : "Não foi possível excluir os cards.");
    } finally {
      setBulkDeleteBusy(false);
      setExcluirMotivoOpen(null);
    }
  }

  // Negativar via popup "Sem Interesse" (3 motivos fixos, contrato com backend).
  async function negativarLead(motivo: string) {
    if (!sel?.id || !motivo || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch<{ message?: string }>(`/vendas/lead/${encodeURIComponent(sel.id)}/negativar`, {
        method: "POST",
        body: JSON.stringify({ status: motivo }),
      });
      setSemInteresseOpen(false);
      setSemInteresseMotivo("");
      await loadBoard();
      setSel(null);
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível negativar o lead.");
    } finally {
      setAcaoBusy(false);
    }
  }


  async function notifyBotMaster() {
    if (masterNotified) return;
    setMasterNotified(true);
    apiFetch("/vendas/notify-bot-config-missing", { method: "POST", body: JSON.stringify({}) }).catch(() => null);
  }

  async function agendarRetorno() {
    if (!sel?.id || !retornoData || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      const effectiveMode = botStatus?.botModuleEnabled && botStatus?.botArmed ? retornoMode : 'manual';
      const body: Record<string, unknown> = { returnAt: new Date(`${retornoData}T09:00:00`).toISOString() };
      if (effectiveMode !== 'manual') body.retornoMode = effectiveMode;
      if (obs.trim()) body.shortNote = obs.trim().slice(0, 280);
      await apiFetch(`/vendas/lead/${encodeURIComponent(sel.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setAcaoMsg("✓ Retorno agendado.");
      setRetornoData("");
      setObs("");
      setRetornoMode("manual");
      setRetornoOpen(false);
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao agendar o retorno.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // O FecharVendaModal compartilhado carrega catálogos/perfil e gerencia o próprio
  // estado (pré-cadastro, plano/valor, implantação, salvar, gerar link). Aqui só abre.
  function abrirFechar() {
    if (!sel?.id) return;
    setFecharOpen(true);
  }

  // Abre no WhatsApp Externo (wa.me) direto do ícone de ação — sem link pré-digitado
  // (o link pré-digitado só existe depois de gerar o link de contratação no fecharOpen).
  function abrirWhatsAppExterno(phone: string | null | undefined) {
    if (!phone) return;
    const digits = phone.replace(/\D/g, "");
    const target = digits.length >= 12 ? digits : `55${digits}`;
    window.open(`https://wa.me/${target}`, "_blank", "noopener");
  }

  // Abre o WhatsApp Interno: POST /inbox/conversations/start → navega pro /atendimento
  // usando sessionStorage (mecanismo já existente no atendimento — hbx:abrir-conversa).
  // O backend já valida QR e acesso internamente; trate o erro com mensagem amigável.
  async function abrirWhatsAppInterno(lead: { phone: string | null; name: string | null }) {
    if (!lead.phone || waStartBusy) return;
    setWaStartBusy(true);
    setWaStartError(null);
    try {
      const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
        method: "POST",
        body: JSON.stringify({
          phone: lead.phone.trim(),
          ...(lead.name ? { name: lead.name.trim() } : {}),
        }),
      });
      if (res?.id != null) {
        // Handoff via sessionStorage — o atendimento lê ao montar e seleciona a conversa.
        try { sessionStorage.setItem("hbx:abrir-conversa", String(res.id)); } catch { /* sem storage */ }
        router.push("/atendimento");
      }
    } catch (err) {
      setWaStartError(err instanceof Error ? err.message : "Não foi possível abrir a conversa.");
    } finally {
      setWaStartBusy(false);
    }
  }

  // Novo lead manual (POST /vendas/manual)
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoForm, setNovoForm] = useState({ name: "", phone: "", email: "", shortNote: "", nextAction: "" });
  const [novoBusy, setNovoBusy] = useState(false);
  const [novoMsg, setNovoMsg] = useState<string | null>(null);

  // "+" da topbar: abre o Novo lead — via sessionStorage (vindo de outra tela)
  // ou via evento direto (já estava em /vendas e o shell disparou sem remount)
  useEffect(() => {
    const openModal = () => {
      try { sessionStorage.removeItem("hbx:abrir-novo-lead"); } catch { /* */ }
      setNovoOpen(true);
    };
    window.addEventListener("hbx:abrir-novo-lead", openModal);
    const t = setTimeout(() => {
      try {
        if (sessionStorage.getItem("hbx:abrir-novo-lead") === "1") openModal();
      } catch { /* sem storage */ }
    }, 0);
    return () => {
      window.removeEventListener("hbx:abrir-novo-lead", openModal);
      clearTimeout(t);
    };
  }, []);

  // Mobile: lista agrupada + pop-up de detalhe (substitui kanban swipe)
  const isMobile = useIsMobile();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  // Mobile: Modo Foco (overlay 1 lead de cada vez — hoje+atrasados)
  const [modoFocoOpen, setModoFocoOpen] = useState(false);
  // Ponte Modo Foco → FecharVendaModal: o foco passa um callback de "avançar quando
  // a venda for REALMENTE concluída"; ligamos ao onDone do modal (sucesso). Cancelar
  // (✕) só fecha o modal e devolve o MESMO lead, sem avançar/contar.
  const focoWinConfirmRef = useRef<(() => void) | null>(null);
  // Desktop: Modo Foco GAME (cinematográfico — queima + tablado 4 etapas + missões).
  // Separado do mobile acima; só monta em !isMobile. EDIT 1 = casca front-first.
  const [focoGameOpen, setFocoGameOpen] = useState(false);

  // Quadro arrastável (drag-and-drop nativo): arrastar um card pra outra coluna
  // muda a ETAPA (status). dragId = card sendo arrastado; dragOverStage = coluna
  // sob o cursor (highlight). Move é otimista + PATCH + reconcilia no loadBoard.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<VendasStage | null>(null);

  function onCardDragStart(e: React.DragEvent, card: VendasLead) {
    setDragId(card.id);
    setSel(card);
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.id);
    } catch { /* alguns navegadores travam setData */ }
  }
  function onCardDragEnd() {
    setDragId(null);
    setDragOverStage(null);
  }

  async function soltarNaEtapa(stage: VendasStage) {
    const id = dragId;
    setDragOverStage(null);
    setDragId(null);
    if (!id) return;
    const card = BLOCK_ORDER.flatMap(({ key }) => board?.blocks?.[key] || []).find(c => c.id === id);
    if (!card || normalizeStage(card.status) === stage) return;
    setAcaoMsg(null);
    setBoard(prev => patchCardStage(prev, id, stage)); // otimista
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: stage }),
      });
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao mover a etapa.");
      await loadBoard(); // desfaz o otimista voltando à verdade do servidor
    }
  }

  // Abre o detalhe do negócio no mobile
  function abrirDetalhe(card: VendasLead) {
    setSel(card);
    setAcaoMsg(null);
    setFecharMsg(null);
    setMobileDetailOpen(true);
  }

  // Prospecção automática (GET /vendas/automation/live-status + controles;
  // exige entitlement Bot IA — sem plano, mostra o aviso do backend)
  const [prospOpen, setProspOpen] = useState(false);
  const [prosp, setProsp] = useState<LiveStatus>(null);
  const [prospError, setProspError] = useState<string | null>(null);
  const [prospBusy, setProspBusy] = useState(false);
  const [prospCancelArm, setProspCancelArm] = useState(false);

  const loadProsp = useCallback(() => {
    return apiFetch<LiveStatus>("/vendas/automation/live-status")
      .then(res => { setProsp(res); setProspError(null); })
      .catch((err: unknown) => {
        const e = err as Error & { status?: number };
        setProsp(null);
        setProspError(e?.status === 402
          ? "Prospecção automática requer plano com Bot IA."
          : e?.message || "Falha ao consultar a prospecção.");
      });
  }, []);

  useEffect(() => {
    if (!prospOpen) return;
    let alive = true;
    loadProsp();
    const timer = setInterval(() => { if (alive) loadProsp(); }, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, [prospOpen, loadProsp]);

  async function prospAcao(path: string) {
    if (prospBusy) return;
    setProspBusy(true);
    try {
      await apiFetch(`/vendas/automation/prospecting/${path}`, { method: "POST", body: JSON.stringify({}) });
      await loadProsp();
    } catch (err) {
      setProspError(err instanceof Error ? err.message : "Ação falhou.");
    } finally {
      setProspBusy(false);
      setProspCancelArm(false);
    }
  }

  async function criarLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (novoBusy) return;
    setNovoBusy(true);
    setNovoMsg(null);
    try {
      await apiFetch("/vendas/manual", {
        method: "POST",
        body: JSON.stringify({
          name: novoForm.name || undefined,
          phone: novoForm.phone || undefined,
          email: novoForm.email || undefined,
          shortNote: novoForm.shortNote || undefined,
          nextAction: novoForm.nextAction || undefined,
        }),
      });
      setNovoMsg("✓ Card criado.");
      setNovoForm({ name: "", phone: "", email: "", shortNote: "", nextAction: "" });
      await loadBoard();
      setNovoOpen(false);
      setNovoMsg(null);
    } catch (err) {
      setNovoMsg(err instanceof Error ? err.message : "Não foi possível criar o card.");
    } finally {
      setNovoBusy(false);
    }
  }

  // Mapeia VendasLead → NegocioDetail (shape normalizado)
  // Todos os campos disponíveis no payload do backend são mapeados aqui.
  // Campos ausentes/null somem automaticamente no componente.
  function toNegocioDetail(d: VendasLead): NegocioDetail {
    return {
      id: d.id,
      enriched: Boolean(d.leadIntelligence?.enrichedAt),
      name: d.name,
      phone: d.phone,
      email: d.email,
      website: d.website,
      cnpj: d.cnpj ?? null,
      cnae: d.cnae ?? null,
      razaoSocial: d.razaoSocial ?? null,
      ownerName: d.ownerName ?? null,
      ownerNames: d.ownerNames ?? null,
      ownerPhone: d.ownerPhone ?? null,
      ownerInstagram: d.ownerInstagram ?? null,
      ownerFacebook: d.ownerFacebook ?? null,
      companySituation: d.companySituation ?? null,
      emails: d.emails ?? null,
      phones: d.phones ?? null,
      phonesWhatsapp: d.phonesWhatsapp ?? null,
      address: d.address ?? null,
      city: d.city,
      state: d.state,
      segment: d.segment,
      statusLabel: d.statusLabel,
      leadTemperature: d.leadTemperature,
      opportunityScore: d.opportunityScore,
      rating: d.rating,
      reviews: d.reviews,
      valueLabel: leadValueLabel(d),
      productName: d.product?.name ?? null,
      returnAt: d.returnAt,
      lastContactAt: d.lastContactAt,
      attemptCount: d.attemptCount,
      nextAction: d.nextAction,
      shortNote: d.shortNote,
      lastResult: d.lastResult,
      timesSeen: d.timesSeen,
      isInInbox: d.isInInbox ?? null,
      createdAt: d.createdAt ?? null,
      updatedAt: d.updatedAt ?? null,
      sourceType: d.sourceType ?? null,
      primarySource: d.primarySource ?? null,
      owner: d.owner ? { name: d.owner.name } : null,
      leadIntelligence: d.leadIntelligence
        ? {
            whatsappStatus: d.leadIntelligence.whatsappStatus ?? null,
            emailStatus: d.leadIntelligence.emailStatus ?? null,
            websiteStatus: d.leadIntelligence.websiteStatus ?? null,
            instagramUrl: d.leadIntelligence.instagramUrl ?? null,
            facebookUrl: d.leadIntelligence.facebookUrl ?? null,
            opportunityReason: d.leadIntelligence.opportunityReason ?? null,
            leadReasonTags: d.leadIntelligence.leadReasonTags ?? null,
            recommendedChannel: d.leadIntelligence.recommendedChannel ?? null,
            painType: d.leadIntelligence.painType ?? null,
            painPitch: d.leadIntelligence.painPitch ?? null,
            messageTemplate: d.leadIntelligence.messageTemplate ?? null,
            contactQuality: d.leadIntelligence.contactQuality ?? null,
          }
        : null,
      sale: d.saleStatus && d.saleStatus !== "none"
        ? {
            status: d.saleStatus,
            statusLabel: d.saleStatusLabel,
            valueLabel: fmtMoney(d.saleValue),
            commissionLabel: d.commissionStatusLabel ?? null,
            commissionValueLabel: d.commissionAmount != null ? fmtMoney(d.commissionAmount) : null,
            commissionDueAt: d.commissionDueAt ?? null,
            commissionRecurring: d.commissionRecurring ?? null,
            commissionNote: d.commissionNote ?? null,
            setupLabel: d.setupValue != null && d.setupValue > 0
              ? `${fmtMoney(d.setupValue)}${d.setupCommissionAmount != null ? ` · comissão: ${fmtMoney(d.setupCommissionAmount)}` : ""}`
              : null,
            setupValue: d.setupValue ?? null,
            setupCommissionAmount: d.setupCommissionAmount ?? null,
            setupCommissionStatusLabel: d.setupCommissionStatusLabel ?? null,
          }
        : null,
      history: d.timeline?.map(ev => ({
        id: ev.id,
        title: ev.title ?? "Atualização",
        description: ev.description,
        resultLabel: ev.resultLabel,
        returnAt: ev.returnAt,
        createdAt: ev.createdAt,
      })) ?? null,
    };
  }

  function matchSearch(card: VendasLead): boolean {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [card.name, card.phone, card.email, card.segment, card.city, card.state, card.nextAction, card.shortNote]
      .some(v => v?.toLowerCase().includes(q));
  }

  const flatLeads: VendasLead[] = (() => {
    if (!board) return [];
    let list = BLOCK_ORDER.flatMap(({ key }) => (board.blocks?.[key] || []).filter(matchSearch));
    if (sortBy === "az") list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" }));
    else if (sortBy === "za") list = [...list].sort((a, b) => (b.name || "").localeCompare(a.name || "", "pt-BR", { sensitivity: "base" }));
    return list;
  })();

  // "Selecionar todos" opera sobre a lista visível (já filtrada/ordenada).
  const todosSelecionados = flatLeads.length > 0 && flatLeads.every(c => selecionados.has(c.id));
  function toggleTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set(flatLeads.map(c => c.id)));
  }

  // Navega com ↑/↓ entre leads igual Excel — só na lista desktop
  useEffect(() => {
    if (isMobile || view !== "list") return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (fecharOpen || novoOpen || prospOpen || agendaOpen || mobileDetailOpen || retornoOpen || semInteresseOpen) return;
      e.preventDefault();
      const q = searchQuery.toLowerCase();
      let list = BLOCK_ORDER.flatMap(({ key }) => (board?.blocks?.[key] || []).filter(card =>
        !searchQuery || [card.name, card.phone, card.email, card.segment, card.city, card.state, card.nextAction, card.shortNote].some(v => v?.toLowerCase().includes(q))
      ));
      if (sortBy === "az") list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" }));
      else if (sortBy === "za") list = [...list].sort((a, b) => (b.name || "").localeCompare(a.name || "", "pt-BR", { sensitivity: "base" }));
      const idx = sel ? list.findIndex(c => c.id === sel.id) : -1;
      const next = e.key === "ArrowDown"
        ? (idx < list.length - 1 ? list[idx + 1] : list[0]) ?? null
        : (idx > 0 ? list[idx - 1] : list[list.length - 1]) ?? null;
      if (next) {
        setSel(next);
        setTimeout(() => document.getElementById(`vnd-row-${next.id}`)?.scrollIntoView({ block: "nearest" }), 0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, view, board, searchQuery, sortBy, sel, fecharOpen, novoOpen, prospOpen, agendaOpen, mobileDetailOpen, retornoOpen, semInteresseOpen]);

  const summary = board?.summary;
  const deal = sel;

  // Modo Foco GAME (desktop): mapeia os leads reais nas 4 etapas da jornada.
  // novo→Pesquisa · contato→Análise · inbox/retorno/qualificado→Atendimento ·
  // encerrado/fechado→Fechamento. O componente FILTRA pelo foco escolhido (1
  // segmento + cidade) e corta em 10 — nunca mistura segmentos/cidades.
  const focoLeads: FocoLead[] = board
    ? BLOCK_ORDER.flatMap(({ key }) => board.blocks?.[key] || []).map(c => {
        const st = normalizeStage(c.status);
        const col: FocoLead["col"] =
          c.block === "closed" || c.saleConfirmedAt || st === "encerrado" ? "fechamento"
          : c.isInInbox || st === "retorno" || st === "qualificado" ? "atendimento"
          : st === "contato" ? "analise"
          : "pesquisa";
        return { id: c.id, name: c.name, segment: c.segment, city: c.city, phone: c.phone, col, inInbox: c.isInInbox ?? false };
      })
    : [];

  // 2 botões acoplados (toggle de modo) — vivem no topo persistente da casca ÚNICA,
  // à esquerda dos 3 cards. Ficam fixos enquanto as camadas crossfadeiam por baixo.
  // Ativo destacado (preenchido).
  const segToggle = (
    <div className="vnd-segbtns" role="tablist" aria-label="Modo da tela">
      <button type="button" role="tab" aria-selected={modo === "funil"}
        className={"vnd-segbtn" + (modo === "funil" ? " is-on" : "")} onClick={irFunil}>
        <I d={ICONS.vendas} size={16} /> <span>Meu funil</span>
      </button>
      {podeBuscarLeads && (
        <button type="button" role="tab" aria-selected={modo === "buscar"} data-tut="vendas-buscar"
          className={"vnd-segbtn" + (modo === "buscar" ? " is-on" : "")} onClick={irBuscar}>
          <I d={ICONS.scrape} size={16} /> <span>Buscar empresas</span>
        </button>
      )}
    </div>
  );

  return (
    <React.Fragment>
        {!isMobile && focoGameOpen && board && (
          <FocoGame
            summary={summary ? { total: summary.total, overdue: summary.overdue, closed: summary.closed } : null}
            leads={focoLeads}
            canRobot={Boolean(botStatus?.botModuleEnabled)}
            onExit={() => setFocoGameOpen(false)}
            onOpenProspector={() => setProspOpen(true)}
            onSelectLead={id => { const c = BLOCK_ORDER.flatMap(({ key }) => board?.blocks?.[key] || []).find(x => x.id === id); if (c) setSel(c); }}
          />
        )}
        <div className="vnd-modehost" data-mode={modo} data-fx={EFFECTS_ON ? "on" : "off"}>

          {/* TOPO — UMA casca: toggle + 3 cards. Os NÚMEROS trocam por modo
              (funil ↔ Radar) em crossfade no MESMO lugar; nada desliza. 29/06. */}
          <div className="vnd-funhead">
            {segToggle}
            {!isMobile && canAtendimento && (
              <button type="button" className="foco-enter" onClick={() => setFocoGameOpen(true)}>
                <I d={ICONS.bolt} size={15} /> Ativar modo foco
              </button>
            )}
            <div className="vnd-stats">
              <div className={"vnd-stats__layer" + (modo === "funil" ? " is-on" : "")} aria-hidden={modo !== "funil"}>
                <KpiRow items={[
                  { icon: "users", label: "Cards no funil", value: summary ? String(summary.total) : "—", delta: "—" },
                  { icon: "doc", label: "Atrasados", value: summary ? String(summary.overdue) : "—", delta: "—", down: Boolean(summary && summary.overdue > 0) },
                  { icon: "check", label: "Fechados", value: summary ? String(summary.closed) : "—", delta: "—" },
                ]} />
              </div>
              <div className={"vnd-stats__layer" + (modo === "buscar" ? " is-on" : "")} aria-hidden={modo !== "buscar"}>
                <KpiRow items={[
                  { icon: "scrape", label: "Total no Brasil", value: buscarStats.totalBrasil != null ? buscarStats.totalBrasil.toLocaleString("pt-BR") : "—", delta: "—" },
                  { icon: "users", label: "Disponíveis", value: buscarStats.disponiveis != null ? buscarStats.disponiveis.toLocaleString("pt-BR") : "—", delta: "—" },
                  { icon: "bolt", label: buscarStats.cotaLabel || "Cota do mês", value: buscarStats.cotaValue || "—", delta: "—" },
                ]} />
              </div>
            </div>
            {/* 4º botão — a faixa "Buscando empresas" virou card destacado (persistente
                nos 2 modos). Mora na barra (limitada à esquerda) → não invade o card. */}
            {board?.radarSupply && (
              <RadarSupplyCard supply={board.radarSupply} onLiberar={() => { irFunil(); setView("list"); }} />
            )}
          </div>

          {/* STAGE — 2 camadas SOBREPOSTAS em crossfade (uma casca só) */}
          <div className="vnd-stage">
            <div className={"vnd-layer" + (modo === "funil" ? " is-on" : "")} aria-hidden={modo !== "funil"}>
                <div className={"content" + (isMobile ? " vnd-page" : "")}>
                  <div className="work">
            <section className="panel">
              <div className="panel-head">
                <h2><TypedText key={"t-funil-" + modo} text="Pipeline de vendas" />{board && <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>{searchQuery ? `${flatLeads.length} de ${summary?.total ?? 0} cards` : `${summary?.total ?? 0} cards`}</span>}
                </h2>
                <div className="meta">
                  <span className="seg-toggle" role="group" aria-label="Visão do pipeline" data-tut="vendas-visao">
                    <button className={"seg" + (view === "list" ? " on" : "")} onClick={() => setView("list")} aria-pressed={view === "list"}>Lista</button>
                    <button className={"seg" + (view === "board" ? " on" : "")} onClick={() => setView("board")} aria-pressed={view === "board"}>Quadro</button>
                  </span>
                  {!isMobile && view === "list" && (
                    <button className="btn-ghost" onClick={() => setSortBy(s => s === "default" ? "az" : s === "az" ? "za" : "default")}
                      title="Ordenar por nome" aria-label="Ordenar por nome">
                      {sortBy === "az" ? "A→Z" : sortBy === "za" ? "Z→A" : "A→Z"}
                    </button>
                  )}
                  <button className="icon-ghost" title="Prospecção automática" aria-label="Prospecção automática" data-tut="vendas-prosp" onClick={() => setProspOpen(true)}>
                    <I d={ICONS.bot} size={16} />
                  </button>
                  <button className="icon-ghost" title="Agenda de retornos" aria-label="Agenda de retornos" data-tut="vendas-agenda" onClick={() => setAgendaOpen(o => !o)}>
                    <I d={ICONS.clock} size={16} />
                  </button>
                  <button className="btn-ghost">Todas as equipes ▾</button>
                  {isMobile && board && ((board.blocks?.today?.length ?? 0) + (board.blocks?.overdue?.length ?? 0)) > 0 && (
                    <button className="btn-teal vf-entry-btn" data-tut="vendas-modo-foco" onClick={() => setModoFocoOpen(true)}>
                      <I d={ICONS.bolt} size={14} /> Modo foco
                    </button>
                  )}
                  <button className="btn-teal" data-tut="vendas-novo" onClick={() => setNovoOpen(true)}><I d={ICONS.plus} size={14} /> Novo lead</button>
                </div>
              </div>
              {loadError && (
                <div style={{ padding: "12px 16px", fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>
                  {loadError}
                </div>
              )}
              {!loadError && board && (summary?.total ?? 0) === 0 && (
                <div className="funil-empty">
                  <div className="funil-empty-why">
                    <h3>Seu funil está vazio</h3>
                    <p>Card só nasce aqui quando você <strong>puxa</strong> um lead pra sua carteira — e você ainda não puxou nenhum.</p>
                  </div>
                  <div className="funil-flow" aria-hidden="true">
                    <span className="step"><span className="step-h"><I d={ICONS.scrape} size={16} /> Radar</span><small>acha</small></span>
                    <span className="arrow">→</span>
                    <span className="step on"><span className="step-h"><I d={ICONS.leads} size={16} /> Leads</span><small>você puxa</small></span>
                    <span className="arrow">→</span>
                    <span className="step"><span className="step-h"><I d={ICONS.vendas} size={16} /> Vendas</span><small>trabalha e fecha</small></span>
                  </div>
                  <div className="funil-cta">
                    <span className="funil-cta-count">
                      {poolDisponivel == null
                        ? "Tem leads esperando no Radar."
                        : poolDisponivel > 0
                          ? <React.Fragment>Tem <strong>{poolDisponivel.toLocaleString("pt-BR")} leads disponíveis</strong> no Radar agora.</React.Fragment>
                          : "O pool está sendo reabastecido — volte em instantes."}
                    </span>
                    <div className="funil-cta-acts">
                      <button className="btn-teal" onClick={() => router.push("/leads")}>Puxar leads →</button>
                      <button
                        className={"btn-teal radar2-auto" + (autoAtivo ? " radar2-auto--on" : "")}
                        disabled={autoBusy}
                        aria-pressed={autoAtivo}
                        onClick={async () => {
                          setAutoBusy(true);
                          try {
                            const res = await apiFetch<{ standingOrder?: { active?: boolean } }>("/webscraping/radar/standing-order", {
                              method: "PUT",
                              body: JSON.stringify({ active: !autoAtivo }),
                            });
                            if (typeof res?.standingOrder?.active === "boolean") setAutoAtivo(res.standingOrder.active);
                          } catch { /**/ } finally { setAutoBusy(false); }
                        }}
                      >
                        {autoAtivo ? "◉ Automático" : "◎ Automático"}
                      </button>
                      <button className="btn-ghost" onClick={() => router.push("/leads")}>Ver o Radar</button>
                    </div>
                  </div>
                </div>
              )}
              {/* MOBILE: lista agrupada — substitui tabela e kanban no mobile.
                  Toque na linha abre pop-up de detalhe (.hbx-veil + .vnd-detail). */}
              {isMobile && board && (summary?.total ?? 0) > 0 && (
                <div className="vnd-list">
                  {BLOCK_ORDER.map(({ key, label }) => {
                    const cards = (board?.blocks?.[key] || []).filter(matchSearch);
                    if (cards.length === 0) return null;
                    return (
                      <React.Fragment key={key}>
                        <div className="vnd-group-head">
                          {label}
                          <span className="vnd-group-badge">{cards.length}</span>
                        </div>
                        {cards.map(card => {
                          const when = fmtWhen(card.block === "closed" ? card.closedAt : card.returnAt);
                          const isWarn = key === "overdue";
                          return (
                            <div
                              key={card.id}
                              className="vnd-row"
                              role="button"
                              tabIndex={0}
                              aria-label={`Abrir detalhes de ${card.name || "negócio"}`}
                              onClick={() => abrirDetalhe(card)}
                              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") abrirDetalhe(card); }}
                            >
                              <div className="vnd-row-main">
                                <span className="vnd-row-name">{card.name || "—"}</span>
                                <span className="vnd-row-sub">
                                  {card.segment || card.city || card.statusLabel || "—"}
                                </span>
                              </div>
                              <div className="vnd-row-end">
                                <span className="vnd-row-val">{leadValueLabel(card)}</span>
                                <span className={"vnd-row-when" + (isWarn ? " vnd-row-when--warn" : "")}>{when}</span>
                              </div>
                              <span className="vnd-row-arrow" aria-hidden="true">›</span>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* LISTA DENSA (padrão): varredura rápida de todos os leads —
                  tabela central do kit, clique na linha abre o detalhe lateral. */}
              {!isMobile && view === "list" && board && (summary?.total ?? 0) > 0 && (
                <>
                  {/* Barra de seleção em massa: "Selecionar todos" + excluir em lote */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "0 16px 8px" }}>
                    <button className="btn-ghost btn-xs" onClick={toggleTodos}>
                      {todosSelecionados ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                    {selecionados.size > 0 && (
                      <>
                        <span className="sub2">{selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}</span>
                        <button
                          className="btn-ghost danger btn-xs"
                          onClick={() => { setBulkMsg(null); setExcluirMotivoOpen("bulk"); }}
                          disabled={bulkDeleteBusy}
                        >
                          <I d={ICONS.trash} size={13} />{" "}
                          {bulkDeleteBusy ? "Excluindo…" : "Excluir selecionados"}
                        </button>
                      </>
                    )}
                    {bulkMsg && <span className={"ctx-msg " + (bulkMsg.startsWith("✓") ? "ok" : "err")}>{bulkMsg}</span>}
                  </div>
                  <div className="tbl-wrap">
                  <table className="tbl" data-tut="vendas-funil">
                    <thead>
                      <tr>
                        <th style={{ width: 34 }}>
                          <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos}
                            aria-label={todosSelecionados ? "Desmarcar todos" : "Selecionar todos"} />
                        </th>
                        <th>Empresa</th><th>Segmento</th><th>Etapa</th><th>Valor</th>
                        <th>Próximo passo</th><th>Responsável</th><th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const blockLbl: Record<string, string> = { today: "Hoje", overdue: "Atrasados", scheduled: "Agendados", closed: "Fechados" };
                        return flatLeads.map(card => {
                          const tagCls = card.block === "overdue" ? "tag warn" : card.block === "closed" ? "tag teal" : "tag";
                          return (
                            <tr key={card.id} id={`vnd-row-${card.id}`} className={sel?.id === card.id ? "sel" : ""} onClick={() => setSel(card)}>
                              <td onClick={e => e.stopPropagation()}>
                                <input type="checkbox" checked={selecionados.has(card.id)} onChange={() => toggleSelecionado(card.id)}
                                  aria-label={`Selecionar ${card.name || "card"}`} />
                              </td>
                              <td><div className="co"><strong>{card.name || "—"}</strong>{card.city && <div className="sub2"><I d={ICONS.mapin} size={10} /> {card.city}</div>}</div></td>
                              <td>{card.segment || "—"}</td>
                              <td><span className={tagCls}>{blockLbl[card.block] ?? card.block}</span>{card.saleConfirmedAt && <span className="badge-win" style={{ marginLeft: 6 }}>Ganho</span>}</td>
                              <td className="hbx-mono">{leadValueLabel(card)}</td>
                              <td><span className="nowrap-cell" style={{ maxWidth: 240, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }} title={card.nextAction || card.shortNote || ""}>{card.nextAction || card.statusLabel || "—"}</span></td>
                              <td>{card.owner?.name ? <span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><Av name={card.owner.name} size={20} />{card.owner.name}</span> : "—"}</td>
                              <td className="hbx-mono">{fmtWhen(card.block === "closed" ? card.closedAt : card.returnAt)}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                  </div>
                </>
              )}

              {/* QUADRO — pipeline arrastável por ETAPA (status). Desktop only.
                  Arraste um card para outra coluna: a etapa muda na hora. A cor do
                  chip carrega a urgência da agenda (atrasado/hoje). */}
              {!isMobile && view === "board" && board && (summary?.total ?? 0) > 0 && (() => {
                const stageCards: Record<VendasStage, VendasLead[]> = { novo: [], contato: [], retorno: [], qualificado: [], encerrado: [] };
                for (const c of flatLeads) stageCards[normalizeStage(c.status)].push(c);
                return (
                  <div className={"vnd-pipe" + (dragId ? " is-dragging" : "")}>
                    {STAGE_ORDER.map(stage => {
                      const cards = stageCards[stage.key];
                      const sumCents = cards.reduce((acc, c) => acc + (c.saleValue || 0), 0);
                      const isOver = dragOverStage === stage.key;
                      return (
                        <section
                          key={stage.key}
                          className={"vnd-pipe-col" + (isOver ? " is-over" : "")}
                          data-tone={stage.tone}
                          onDragEnter={e => { e.preventDefault(); if (dragOverStage !== stage.key) setDragOverStage(stage.key); }}
                          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverStage !== stage.key) setDragOverStage(stage.key); }}
                          onDrop={e => { e.preventDefault(); soltarNaEtapa(stage.key); }}
                        >
                          <header className="vnd-pipe-col__head">
                            <span className="vnd-pipe-col__dot" aria-hidden="true" />
                            <strong className="vnd-pipe-col__name">{stage.label}</strong>
                            <span className="vnd-pipe-col__count">{cards.length}</span>
                            {sumCents > 0 && <span className="vnd-pipe-col__sum">{fmtMoney(sumCents)}</span>}
                          </header>
                          <div className="vnd-pipe-col__body">
                            {cards.length === 0 && (
                              <div className="vnd-pipe-col__empty">{isOver ? "Solte aqui" : "Arraste cards"}</div>
                            )}
                            {cards.map(card => {
                              const ag = agendaInfo(card);
                              return (
                                <article
                                  key={card.id}
                                  className={"vnd-card" + (sel?.id === card.id ? " is-sel" : "") + (dragId === card.id ? " is-dragging" : "") + (card.block === "closed" ? " is-locked" : "")}
                                  draggable={card.block !== "closed"}
                                  onDragStart={card.block !== "closed" ? (e => onCardDragStart(e, card)) : undefined}
                                  onDragEnd={onCardDragEnd}
                                  onClick={() => setSel(card)}
                                >
                                  <span className="vnd-card__grip" aria-hidden="true" />
                                  <div className="vnd-card__top">
                                    <strong className="vnd-card__name">{card.name || "—"}</strong>
                                    {card.saleConfirmedAt && <span className="badge-win">Ganho</span>}
                                  </div>
                                  <span className="vnd-card__sub">{card.segment || card.city || card.phone || "—"}</span>
                                  <div className="vnd-card__row">
                                    <span className="vnd-card__val">{leadValueLabel(card)}</span>
                                    <span className={"vnd-chip vnd-chip--" + ag.tone}>{ag.label}</span>
                                  </div>
                                  <div className="vnd-card__foot">
                                    {card.owner?.name
                                      ? <span className="vnd-card__owner"><Av name={card.owner.name} size={16} />{card.owner.name}</span>
                                      : <span className="vnd-card__owner vnd-card__owner--none">Sem dono</span>}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                );
              })()}
            </section>
          </div>

          <aside className="ctx" data-tut="vendas-painel">
            <div key={deal?.id ?? "empty"} className="ctx-body">
              <DetalhesNegocio
                detail={deal ? toNegocioDetail(deal) : null}
                onClose={() => setSel(null)}
                onWaOpenExternal={deal?.phone ? () => abrirWhatsAppExterno(deal.phone) : undefined}
                onWaOpenInternal={deal?.phone ? () => abrirWhatsAppInterno({ phone: deal.phone, name: deal.name }) : undefined}
                waQrActive={waQrActive}
                waCanInternal={canAtendimento}
                onDelete={deal ? () => { setAcaoMsg(null); setExcluirMotivoOpen("card"); } : undefined}
                actions={deal ? (
                  <div className="dn-cockpit">
                    {/* TIER 1 — Fechar venda (herói bonito, mesmo do Atendimento) */}
                    <div className="dn-cockpit__group">
                      <button className="fv-open-cta" onClick={abrirFechar} disabled={deal.block === "closed"} data-tut="vendas-fechar">
                        <span className="fv-open-cta-ic"><I d={ICONS.money} size={18} /></span>
                        <span className="fv-open-cta-txt">
                          <b>{deal.block === "closed" ? "Card já fechado" : "Fechar venda"}</b>
                          <small>Gere o link e garanta sua comissão</small>
                        </span>
                        <I d={ICONS.arrow} size={16} />
                      </button>
                    </div>

                    {/* TIER 2 — Retorno + Sem Interesse */}
                    <div className="dn-cockpit__group">
                      {acaoMsg && (
                        <div className={"ctx-msg " + (acaoMsg.startsWith("✓") ? "ok" : "err")}>{acaoMsg}</div>
                      )}
                      <div className="vnd-quick-acts">
                        <button className="btn-result btn-result--ok" onClick={() => { setRetornoData(""); setObs(""); setAcaoMsg(null); setRetornoOpen(true); }} disabled={deal.block === "closed"}>
                          <I d={ICONS.clock} size={14} /> Retorno
                        </button>
                        <button className="btn-result btn-result--cold" onClick={() => { setSemInteresseMotivo(""); setAcaoMsg(null); setSemInteresseOpen(true); }} disabled={deal.block === "closed"}>
                          Sem Interesse
                        </button>
                      </div>
                    </div>
                  </div>
                ) : undefined}
              />
            </div>{/* /ctx-body */}
          </aside>
                </div>{/* /content (Meu funil) */}
            </div>{/* /vnd-layer funil */}

            <div className={"vnd-layer vnd-layer--buscar" + (modo === "buscar" ? " is-on" : "")} aria-hidden={modo !== "buscar"}>
              {/* MESMA casca: o título "Pipeline de pesquisa" digita DENTRO do painel do
                  Radar (prop embedTitle) — mesmo tratamento do "Pipeline de vendas".
                  Conteúdo intacto; os 3 números do topo vêm por callback. 29/06. */}
              {buscarMounted ? (
                <LeadsClient
                  embedded
                  onLeadPulled={handlePulled}
                  onEmbedStats={setBuscarStats}
                  embedTitle={<TypedText key={"t-busca-" + modo} text="Pipeline de pesquisa" />}
                />
              ) : null}
            </div>{/* /vnd-layer buscar */}
          </div>{/* /vnd-stage */}
        </div>{/* /vnd-modehost */}

      {/* MOBILE: pop-up de detalhe do negócio — abre ao tocar uma linha da lista.
          Folha que ENCOSTA NO TOPO e usa a tela toda (veil deixa de centralizar). */}
      {isMobile && mobileDetailOpen && sel && (
        <div className="hbx-veil vnd-detail-veil" onClick={e => { if (e.target === e.currentTarget) setMobileDetailOpen(false); }}>
          <div className="vnd-detail" onClick={e => e.stopPropagation()}>
            <DetalhesNegocio
              detail={toNegocioDetail(sel)}
              title={sel.name || "Negócio"}
              onClose={() => setMobileDetailOpen(false)}
              onWaOpenExternal={sel.phone ? () => abrirWhatsAppExterno(sel.phone) : undefined}
              onWaOpenInternal={sel.phone ? () => abrirWhatsAppInterno({ phone: sel.phone, name: sel.name }) : undefined}
              waQrActive={waQrActive}
              waCanInternal={canAtendimento}
              onDelete={() => { setMobileDetailOpen(false); setAcaoMsg(null); setExcluirMotivoOpen("card"); }}
              actions={
                <div className="dn-cockpit">
                  {/* TIER 1 — Fechar venda (herói bonito, mesmo do Atendimento) */}
                  <div className="dn-cockpit__group">
                    <button className="fv-open-cta" onClick={() => { setMobileDetailOpen(false); abrirFechar(); }} disabled={sel.block === "closed"}>
                      <span className="fv-open-cta-ic"><I d={ICONS.money} size={18} /></span>
                      <span className="fv-open-cta-txt">
                        <b>{sel.block === "closed" ? "Card já fechado" : "Fechar venda"}</b>
                        <small>Gere o link e garanta sua comissão</small>
                      </span>
                      <I d={ICONS.arrow} size={16} />
                    </button>
                  </div>

                  {/* TIER 2 — Retorno + Sem Interesse */}
                  <div className="dn-cockpit__group">
                    {acaoMsg && (
                      <div className={acaoMsg.startsWith("✓") ? "vnd-msg-ok" : "vnd-msg-err"}>{acaoMsg}</div>
                    )}
                    <div className="vnd-quick-acts">
                      <button className="btn-result btn-result--ok" onClick={() => { setRetornoData(""); setObs(""); setAcaoMsg(null); setRetornoOpen(true); }} disabled={sel.block === "closed"}>
                        <I d={ICONS.clock} size={14} /> Retorno
                      </button>
                      <button className="btn-result btn-result--cold" onClick={() => { setSemInteresseMotivo(""); setAcaoMsg(null); setSemInteresseOpen(true); }} disabled={sel.block === "closed"}>
                        Sem Interesse
                      </button>
                    </div>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      )}

      {/* MOBILE — Modo Foco: overlay full-screen 1 lead de cada vez (hoje+atrasados). */}
      {isMobile && modoFocoOpen && board && (
        <VendasModoFoco
          board={board}
          onExit={() => setModoFocoOpen(false)}
          onWhatsApp={lead => {
            setModoFocoOpen(false);
            abrirWhatsAppInterno({ phone: lead.phone, name: lead.name });
          }}
          onCall={lead => {
            if (lead.phone) window.location.href = `tel:${lead.phone.replace(/\D/g, "")}`;
          }}
          onWinSale={(lead, onConfirmed) => {
            // Mantém o foco montado (z 80); o FecharVendaModal (z 90) abre por cima.
            // Guarda o avanço; só dispara no onDone do modal (venda concluída).
            focoWinConfirmRef.current = onConfirmed;
            setSel(lead as unknown as VendasLead);
            setFecharOpen(true);
          }}
          onMutated={loadBoard}
        />
      )}

      {novoOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setNovoOpen(false); }}>
          <form className="hbx-modal" onSubmit={criarLead}
            style={{ width: "min(400px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Novo lead
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setNovoOpen(false)}>✕</span>
            </h3>
            {novoMsg && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: novoMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{novoMsg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nome / Empresa</label>
              <input className="field-dark" required maxLength={120} value={novoForm.name}
                onChange={e => setNovoForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Telefone</label>
                <input className="field-dark" maxLength={24} placeholder="(11) 99999-9999" value={novoForm.phone}
                  onChange={e => setNovoForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>E-mail</label>
                <input className="field-dark" type="email" placeholder="opcional" value={novoForm.email}
                  onChange={e => setNovoForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Próximo passo</label>
              <input className="field-dark" maxLength={140} placeholder="Ex.: Ligar amanhã" value={novoForm.nextAction}
                onChange={e => setNovoForm(f => ({ ...f, nextAction: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nota</label>
              <input className="field-dark" maxLength={280} placeholder="opcional" value={novoForm.shortNote}
                onChange={e => setNovoForm(f => ({ ...f, shortNote: e.target.value }))} />
            </div>
            <button className="btn-teal" type="submit" disabled={novoBusy} style={{ minHeight: 40 }}>
              {novoBusy ? "Criando…" : "Criar card"}
            </button>
          </form>
        </div>
      )}

      {fecharOpen && sel && (
        <FecharVendaModal
          mode={{ kind: "lead", leadId: sel.id }}
          leadName={sel.name}
          phone={sel.phone}
          sellsHbxPlans={Boolean(board?.sellsHbxPlans)}
          onClose={() => {
            // Fechar puro (✕/fora): se o foco está aberto e a venda NÃO foi concluída
            // (ref ainda setado), cancela sem avançar nem contar.
            focoWinConfirmRef.current = null;
            setFecharOpen(false);
          }}
          onDone={() => {
            loadBoard();
            // Venda concluída (gerou link / salvou no card): avança o foco + conta
            // como fechado. Consome o ref pra não re-disparar no onClose seguinte.
            const confirm = focoWinConfirmRef.current;
            focoWinConfirmRef.current = null;
            confirm?.();
          }}
        />
      )}

      {prospOpen && (
        <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) setProspOpen(false); }}>
          <div className="hbx-drawer" style={{ width: 340, height: "100vh", overflowY: "auto", padding: "18px 16px", display: "grid", gap: 14, alignContent: "start" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "0.9rem", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Prospecção automática
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setProspOpen(false)}>✕</span>
            </h3>
            {prospError && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-warning)" }}>{prospError}</div>
            )}
            {prosp && (
              <React.Fragment>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={"tag" + (prosp.active ? " teal" : prosp.status === "erro" ? " red" : " warn")}>
                    {prosp.triagem && !prosp.triagem.confirmed ? "Aguardando triagem" : (PROSP_LABEL[prosp.status] || prosp.status)}
                  </span>
                  {prosp.nextScheduledAt && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.64rem", color: "var(--text-muted)" }}>
                      próximo: {new Date(prosp.nextScheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {prosp.text && <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.5, color: "var(--text-muted)" }}>{prosp.text}</p>}
                <div className="kv">
                  <div className="row"><span className="k">Para hoje</span><span className="v" style={{ fontFamily: "var(--font-mono)" }}>{prosp.counters?.todayPending ?? 0}</span></div>
                  <div className="row"><span className="k">Atrasados</span><span className="v" style={{ fontFamily: "var(--font-mono)" }}>{prosp.counters?.overdue ?? 0}</span></div>
                  <div className="row"><span className="k">Futuros</span><span className="v" style={{ fontFamily: "var(--font-mono)" }}>{prosp.counters?.future ?? 0}</span></div>
                  <div className="row"><span className="k">Enviados</span><span className="v" style={{ fontFamily: "var(--font-mono)" }}>{prosp.counters?.sent ?? 0}</span></div>
                  <div className="row"><span className="k">Positivos</span><span className="v" style={{ fontFamily: "var(--font-mono)", color: "var(--hbx-brand-strong)" }}>{prosp.counters?.positives ?? 0}</span></div>
                  <div className="row"><span className="k">Falhas</span><span className="v" style={{ fontFamily: "var(--font-mono)", color: "var(--hbx-danger)" }}>{prosp.counters?.failed ?? 0}</span></div>
                </div>
                {prosp.triagem && !prosp.triagem.confirmed && (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="field-label">Triagem {prosp.triagem.pronto ? "completa — pronta para armar" : "pendente"}</div>
                    <div className="kv">
                      {prosp.triagem.itens.map(it => (
                        <div className="row" key={it.key}>
                          <span className="k">{it.label}</span>
                          <span className={"tag" + (it.ok ? " teal" : " warn")}>{it.ok ? "✓ ok" : "pendente"}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-ink-muted" style={{ margin: 0, fontSize: "0.7rem", lineHeight: 1.5 }}>
                      {prosp.triagem.pronto
                        ? "O robô só dispara depois que o dono/gerente armar. Vendedor não liga."
                        : "Configure os itens pendentes antes de ligar o robô. Sem triagem completa, a prospecção fica travada."}
                    </p>
                  </div>
                )}
                <div style={{ display: "grid", gap: 8 }}>
                  {prosp.status === "parado" && (
                    <button className="btn-teal" onClick={() => prospAcao("start")} disabled={prospBusy || (prosp.triagem ? !prosp.triagem.pronto : false)}>{prospBusy ? "Aguarde…" : "▶ Iniciar prospecção"}</button>
                  )}
                  {prosp.active && prosp.status !== "pausado" && (
                    <button className="btn-ghost" onClick={() => prospAcao("pause")} disabled={prospBusy}>Pausar</button>
                  )}
                  {prosp.status === "pausado" && (
                    <button className="btn-teal" onClick={() => prospAcao("resume")} disabled={prospBusy}>Retomar</button>
                  )}
                  {prosp.active && (
                    prospCancelArm ? (
                      <button className="btn-ghost" style={{ color: "var(--hbx-danger)", borderColor: "color-mix(in srgb, var(--hbx-danger) 40%, transparent)" }} onClick={() => prospAcao("cancel")} disabled={prospBusy}>
                        Confirmar cancelamento
                      </button>
                    ) : (
                      <button className="btn-ghost" onClick={() => setProspCancelArm(true)} disabled={prospBusy}>Cancelar campanha</button>
                    )
                  )}
                </div>
              </React.Fragment>
            )}
            {!prosp && !prospError && (
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Consultando…</span>
            )}
          </div>
        </div>
      )}

      {agendaOpen && (
        <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) setAgendaOpen(false); }}>
          <div className="hbx-drawer" style={{ width: 340, height: "100vh", overflowY: "auto", padding: "18px 16px", display: "grid", gap: 14, alignContent: "start" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "0.9rem", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Agenda de retornos
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setAgendaOpen(false)}>✕</span>
            </h3>
            {syncMsg && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: syncMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{syncMsg}</div>
            )}
            <button className="btn-teal" onClick={sincronizarHoje} disabled={syncBusy}>
              <WhatsAppMark size={15} /> {syncBusy ? "Sincronizando…" : "Sincronizar hoje no WhatsApp"}
            </button>
            {([["Atrasados", board?.blocks?.overdue || []], ["Hoje", board?.blocks?.today || []], ["Agendados", board?.blocks?.scheduled || []]] as [string, VendasLead[]][]).map(([label, cards]) => (
              <div key={label} style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <strong style={{ fontSize: "0.8rem" }}>{label}</strong>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.64rem", color: "var(--text-muted)" }}>{cards.length}</span>
                </div>
                {cards.length === 0 && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Nenhum retorno.</span>}
                {cards
                  .slice()
                  .sort((a, b) => String(a.returnAt || "").localeCompare(String(b.returnAt || "")))
                  .map(card => (
                    <button key={card.id} onClick={() => { setSel(card); setAgendaOpen(false); }}
                      style={{ display: "grid", gap: 3, textAlign: "left", padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", cursor: "pointer", fontFamily: "var(--font-body)", color: "var(--text-strong)" }}>
                      <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong style={{ fontSize: "0.76rem" }}>{card.name || "—"}</strong>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.64rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtWhen(card.returnAt)}</span>
                      </span>
                      <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>{card.nextAction || card.statusLabel}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Popup: Agendar Retorno */}
      {retornoOpen && sel && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setRetornoOpen(false); }}>
          <div className="hbx-modal vnd-popup" onClick={e => e.stopPropagation()}>
            <div className="vnd-popup__head">
              <span className="vnd-popup__title">Retorno — {sel.name || "lead"}</span>
              <button className="vnd-popup__close" onClick={() => setRetornoOpen(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="vnd-popup__body">
              {acaoMsg && (
                <div className={"ctx-msg " + (acaoMsg.startsWith("✓") ? "ok" : "err")}>{acaoMsg}</div>
              )}
              <div className="vnd-popup__field">
                <label className="dn-cockpit__label">Data do retorno</label>
                <input className="field-dark" type="date" value={retornoData}
                  onChange={e => { setRetornoData(e.target.value); setRetornoMode("manual"); }}
                  aria-label="Data do retorno" />
              </div>
              <div className="vnd-popup__field">
                <label className="dn-cockpit__label">Observação (opcional)</label>
                <textarea className="field-dark" rows={2} maxLength={240}
                  placeholder="Ex.: cliente pediu pra mandar fotos do produto"
                  value={obs} onChange={e => setObs(e.target.value)} />
              </div>
              {retornoData && sel.block !== "closed" && botStatus?.botModuleEnabled && botStatus?.botArmed && (
                <div className="retorno-mode">
                  <span className="lbl">Tipo de retorno</span>
                  <div className="radios">
                    {(["manual", ...(sel.email ? ["auto_email"] : []), ...(sel.phone ? ["auto_whatsapp"] : []), ...(sel.email && sel.phone ? ["auto_both"] : [])] as RetornoMode[]).map(mode => {
                      const labels: Record<RetornoMode, string> = { manual: "Manual", auto_email: "E-mail automático", auto_whatsapp: "WhatsApp automático", auto_both: "E-mail + WhatsApp" };
                      return (
                        <label key={mode} className="radio-lbl">
                          <input type="radio" name="retorno-mode-popup" value={mode} checked={retornoMode === mode} onChange={() => setRetornoMode(mode)} />
                          {labels[mode]}
                        </label>
                      );
                    })}
                  </div>
                  {retornoMode === "auto_both" && <span className="collision">⚠ E-mail e WhatsApp agendados para o mesmo dia.</span>}
                </div>
              )}
              {retornoData && sel.block !== "closed" && botStatus?.botModuleEnabled && !botStatus?.botArmed && (
                <div className="bot-warn">
                  <span className="warn-lbl">Bot sem configuração.</span>
                  <button className="btn-ghost" onClick={notifyBotMaster} disabled={masterNotified}>
                    {masterNotified ? "✓ Suporte avisado" : "Contate o suporte"}
                  </button>
                </div>
              )}
              <div className="vnd-popup__foot">
                <button className="btn-ghost" onClick={() => setRetornoOpen(false)}>Cancelar</button>
                <button className="btn-teal" onClick={agendarRetorno} disabled={!retornoData || acaoBusy}>
                  {acaoBusy ? "Agendando…" : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup: motivo da exclusão (unitária OU em massa) — matriz de disposição.
          "Só excluir" devolve o card pra vitrine da própria empresa; "Resultado não
          satisfatório" some pra você e volta pros outros. */}
      {excluirMotivoOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setExcluirMotivoOpen(null); }}>
          <div className="hbx-modal vnd-popup" onClick={e => e.stopPropagation()}>
            <div className="vnd-popup__head">
              <span className="vnd-popup__title">
                {excluirMotivoOpen === "bulk" ? `Excluir ${selecionados.size} card${selecionados.size === 1 ? "" : "s"}` : "Excluir card"}
              </span>
              <button className="vnd-popup__close" onClick={() => setExcluirMotivoOpen(null)} aria-label="Fechar">✕</button>
            </div>
            <div className="vnd-popup__body">
              <p className="sub2">Por que está excluindo?</p>
              {(excluirMotivoOpen === "bulk" ? bulkMsg : acaoMsg) && (
                <div className={"ctx-msg err"}>{excluirMotivoOpen === "bulk" ? bulkMsg : acaoMsg}</div>
              )}
              <div className="vnd-si-opts">
                <button type="button" className="vnd-si-opt"
                  onClick={() => (excluirMotivoOpen === "bulk" ? excluirSelecionados("excluir") : deletarCard("excluir"))}
                  disabled={bulkDeleteBusy || deleteBusy}>
                  Só excluir
                  <span className="vnd-si-opt__hint">volta pra sua vitrine</span>
                </button>
                <button type="button" className="vnd-si-opt"
                  onClick={() => (excluirMotivoOpen === "bulk" ? excluirSelecionados("unsatisfactory") : deletarCard("unsatisfactory"))}
                  disabled={bulkDeleteBusy || deleteBusy}>
                  Resultado não satisfatório
                  <span className="vnd-si-opt__hint">some pra você, libera pros outros</span>
                </button>
              </div>
              <div className="vnd-popup__foot">
                <button className="btn-ghost" onClick={() => setExcluirMotivoOpen(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup: Sem Interesse */}
      {semInteresseOpen && sel && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setSemInteresseOpen(false); }}>
          <div className="hbx-modal vnd-popup" onClick={e => e.stopPropagation()}>
            <div className="vnd-popup__head">
              <span className="vnd-popup__title">Motivo?</span>
              <button className="vnd-popup__close" onClick={() => setSemInteresseOpen(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="vnd-popup__body">
              {acaoMsg && (
                <div className={"ctx-msg " + (acaoMsg.startsWith("✓") ? "ok" : "err")}>{acaoMsg}</div>
              )}
              <div className="vnd-si-opts">
                {([
                  { status: "no_answer", label: "Não atendeu" },
                  { status: "voicemail", label: "Caixa postal" },
                  { status: "not_interested_product", label: "Não quer produto" },
                ] as { status: string; label: string }[]).map(opt => (
                  <button key={opt.status} type="button"
                    className={"vnd-si-opt" + (semInteresseMotivo === opt.status ? " is-sel" : "")}
                    onClick={() => setSemInteresseMotivo(opt.status)}
                    disabled={acaoBusy}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="vnd-popup__foot">
                <button className="btn-ghost" onClick={() => setSemInteresseOpen(false)}>Cancelar</button>
                <button className="btn-teal" onClick={() => negativarLead(semInteresseMotivo)}
                  disabled={!semInteresseMotivo || acaoBusy}>
                  {acaoBusy ? "Enviando…" : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
