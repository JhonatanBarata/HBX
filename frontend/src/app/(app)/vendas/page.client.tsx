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

import { Av, I, ICONS, KpiRow, WhatsAppMark } from "@/components/hbx/shell";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { FecharVendaModal } from "@/components/hbx/fechar-venda-modal";
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


type BotStatus = { botModuleEnabled: boolean; botArmed: boolean } | null;
type RetornoMode = 'manual' | 'auto_email' | 'auto_whatsapp' | 'auto_both';

export function VendasClient() {
  const router = useRouter();
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

  // Excluir card: devolve ao pool sem edições. POST /vendas/leads/:id/delete
  const [deleteBusy, setDeleteBusy] = useState(false);
  async function deletarCard() {
    if (!sel?.id || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/vendas/leads/${encodeURIComponent(sel.id)}/delete`, { method: "POST", body: JSON.stringify({}) });
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
  const [bulkDeleteArm, setBulkDeleteArm] = useState(false); // confirma em 2 cliques (padrão do kit)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  function toggleSelecionado(id: string) {
    setBulkDeleteArm(false);
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function excluirSelecionados() {
    const ids = Array.from(selecionados);
    if (ids.length === 0 || bulkDeleteBusy) return;
    setBulkDeleteBusy(true);
    setBulkMsg(null);
    try {
      const res = await apiFetch<{ deletedCount?: number }>("/vendas/leads/delete-bulk", {
        method: "POST",
        body: JSON.stringify({ leadIds: ids }),
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
      setBulkDeleteArm(false);
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

  // Mobile kanban legado: dots de navegação + menu "mover para" por toque
  // (mantido para o quadro desktop e view=board; não usado na lista mobile)
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [activeDot, setActiveDot] = useState(0);
  const [cardMoveOpen, setCardMoveOpen] = useState<string | null>(null); // card.id com menu aberto

  // Atualiza o dot ativo conforme o scroll horizontal do board
  function onBoardScroll() {
    const el = boardRef.current;
    if (!el) return;
    const colW = el.scrollWidth / BLOCK_ORDER.length;
    const dot = Math.round(el.scrollLeft / colW);
    setActiveDot(Math.min(Math.max(0, dot), BLOCK_ORDER.length - 1));
  }

  // Mover card via toque: ação inline p/ não depender do estado async de moverStatus
  async function moverCardPorToque(card: VendasLead, status: string) {
    if (acaoBusy) return;
    setCardMoveOpen(null);
    setSel(card);
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(card.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setAcaoMsg("✓ Etapa atualizada.");
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao mover a etapa.");
    } finally {
      setAcaoBusy(false);
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
    setBulkDeleteArm(false);
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

  return (
    <React.Fragment>
        <div className={"content" + (isMobile ? " vnd-page" : "")}>
          <div className="work">
            <KpiRow items={[
              { icon: "users", label: "Cards no funil", value: summary ? String(summary.total) : "—", delta: "—" },
              { icon: "clock", label: "Para hoje", value: summary ? String(summary.today) : "—", delta: "—" },
              { icon: "doc", label: "Atrasados", value: summary ? String(summary.overdue) : "—", delta: "—", down: Boolean(summary && summary.overdue > 0) },
              { icon: "check", label: "Fechados", value: summary ? String(summary.closed) : "—", delta: "—" },
            ]} />

            <section className="panel">
              <div className="panel-head">
                <h2>Pipeline de vendas</h2>
                <div className="meta">
                  <span>
                    {board
                      ? searchQuery
                        ? `${flatLeads.length} de ${summary?.total ?? 0} cards`
                        : `${summary?.total ?? 0} cards`
                      : loadError ? "" : "Carregando…"}
                  </span>
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
                          onClick={() => (bulkDeleteArm ? excluirSelecionados() : setBulkDeleteArm(true))}
                          disabled={bulkDeleteBusy}
                        >
                          <I d={ICONS.trash} size={13} />{" "}
                          {bulkDeleteBusy ? "Excluindo…" : bulkDeleteArm ? `Confirmar exclusão (${selecionados.size})` : "Excluir selecionados"}
                        </button>
                        {bulkDeleteArm && !bulkDeleteBusy && (
                          <button className="btn-ghost btn-xs" onClick={() => setBulkDeleteArm(false)}>Cancelar</button>
                        )}
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

              {/* QUADRO (kanban) — opcional, para arrastar entre etapas. Desktop only. */}
              {!isMobile && view === "board" && (
              <>
              <div className="board" ref={boardRef} onScroll={isMobile ? onBoardScroll : undefined}>
                {BLOCK_ORDER.map(({ key, label }) => {
                  const cards = (board?.blocks?.[key] || []).filter(matchSearch);
                  const sumCents = cards.reduce((acc, c) => acc + (c.saleValue || 0), 0);
                  return (
                    <div key={key}>
                      <div className="col-head"><strong>{label}</strong><span className="sum">{sumCents > 0 ? fmtMoney(sumCents) : "—"}</span></div>
                      <div className="col-count">{cards.length} {cards.length === 1 ? "lead" : "leads"}</div>
                      <div className="col-cards">
                        {cards.map(card => (
                          <article key={card.id} className={"deal" + (sel?.id === card.id ? " sel" : "")} onClick={() => { setSel(card); if (cardMoveOpen === card.id) setCardMoveOpen(null); }}>
                            <strong>{card.name || "—"}</strong>
                            <span className="who">{card.segment || card.city || card.phone || "—"}</span>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span className="val">{leadValueLabel(card)}</span>
                              {card.saleConfirmedAt && <span className="badge-win">Ganho</span>}
                            </div>
                            <span className="line">{card.shortNote || card.statusLabel}</span>
                            {card.nextAction && <span className="line">Próximo passo: {card.nextAction}</span>}
                            <div className="foot">
                              {card.owner?.name ? <React.Fragment><Av name={card.owner.name} size={18} />{card.owner.name}</React.Fragment> : <span>—</span>}
                              <span className="when">{fmtWhen(card.block === "closed" ? card.closedAt : card.returnAt)}</span>
                            </div>
                            {/* Botão "Mover para" — visível só no mobile via CSS (.deal-move-btn) */}
                            <button
                              className="deal-move-btn"
                              type="button"
                              aria-label="Mover para outra etapa"
                              disabled={acaoBusy || card.block === "closed"}
                              onClick={e => { e.stopPropagation(); setCardMoveOpen(cardMoveOpen === card.id ? null : card.id); }}
                            >
                              <I d={ICONS.arrow} size={13} /> Mover para…
                            </button>
                            {cardMoveOpen === card.id && (
                              <div className="deal-move-menu" onClick={e => e.stopPropagation()}>
                                {[
                                  { value: "novo", label: "Novo" },
                                  { value: "contato", label: "Contato" },
                                  { value: "retorno", label: "Retorno" },
                                  { value: "qualificado", label: "Qualificado" },
                                  { value: "encerrado", label: "Encerrado" },
                                ].map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    disabled={acaoBusy}
                                    onClick={() => moverCardPorToque(card, opt.value)}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Dots de navegação — visíveis só no mobile via CSS (.board-dots) */}
              <div className="board-dots" aria-hidden="true">
                {BLOCK_ORDER.map((_, i) => (
                  <button
                    key={i}
                    className={"board-dot" + (activeDot === i ? " active" : "")}
                    type="button"
                    aria-label={`Coluna ${i + 1}`}
                    onClick={() => {
                      const el = boardRef.current;
                      if (!el) return;
                      const colW = el.scrollWidth / BLOCK_ORDER.length;
                      el.scrollTo({ left: i * colW, behavior: "smooth" });
                      setActiveDot(i);
                    }}
                  />
                ))}
              </div>
              </>
              )}
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
                onDelete={deal ? () => deletarCard() : undefined}
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
        </div>

      {/* MOBILE: pop-up de detalhe do negócio — abre ao tocar uma linha da lista */}
      {isMobile && mobileDetailOpen && sel && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setMobileDetailOpen(false); }}>
          <div className="vnd-detail" onClick={e => e.stopPropagation()}>
            <DetalhesNegocio
              detail={toNegocioDetail(sel)}
              title={sel.name || "Negócio"}
              onClose={() => setMobileDetailOpen(false)}
              onWaOpenExternal={sel.phone ? () => abrirWhatsAppExterno(sel.phone) : undefined}
              onWaOpenInternal={sel.phone ? () => abrirWhatsAppInterno({ phone: sel.phone, name: sel.name }) : undefined}
              waQrActive={waQrActive}
              waCanInternal={canAtendimento}
              onDelete={() => { setMobileDetailOpen(false); deletarCard(); }}
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
          onClose={() => setFecharOpen(false)}
          onDone={loadBoard}
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
