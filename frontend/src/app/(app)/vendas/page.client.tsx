"use client";

// Tela Vendas (template docs/TEMAS/*/corporate/index.html) ligada no board
// real: GET /vendas/board → { summary, blocks: { today, overdue, scheduled,
// closed }, usage }. O modelo real é agenda de retorno (4 blocos), não funil
// de 5 etapas — as colunas do kanban renderizam os blocos reais com a mesma
// estrutura visual do template. Sem dado para um campo → "—".
// Seções sem endpoint (Próximas tarefas, Funil de conversão) permanecem
// visuais como no template — registrado no doc do PR.

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS, KpiRow, WhatsAppMark } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
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
  city: string | null;
  state: string | null;
  segment: string | null;
  status: string;
  statusLabel: string;
  nextAction: string | null;
  returnAt: string | null;
  shortNote: string | null;
  lastContactAt: string | null;
  attemptCount: number;
  closedAt: string | null;
  saleConfirmedAt: string | null;
  saleStatus?: string | null;
  saleStatusLabel: string | null;
  saleValue: number | null;
  commissionStatusLabel?: string | null;
  commissionAmount?: number | null;
  setupValue?: number | null;
  setupCommissionAmount?: number | null;
  setupCommissionStatusLabel?: string | null;
  commissionPercentSnapshot?: number | null;
  product: { name: string | null; priceLabel: string | null; canViewPrice?: boolean } | null;
  owner: { name: string | null } | null;
  block: "today" | "overdue" | "scheduled" | "closed";
};

type BoardResponse = {
  summary: { total: number; today: number; overdue: number; scheduled: number; closed: number };
  blocks: { today: VendasLead[]; overdue: VendasLead[]; scheduled: VendasLead[]; closed: VendasLead[] };
} | null;

type Produto = {
  id: number;
  name: string;
  price?: number | null;
  priceCents?: number | null;
  billingCycle?: string | null;
  allowDiscount?: boolean;
  minPriceCents?: number | null;
  defaultCommissionPercent?: number | null;
  status?: string;
};

// Vitrine de preço do catálogo comercial (GET /commercial-plans/public-catalog):
// a vendedora vê a mensalidade por plano ANTES de fechar. Preço SÓ do catálogo
// (PAGAMENTOS.md/FRONTEND.md) — nunca hardcode. /me e /catalog zeram o preço
// para role USER; a vitrine pública entrega o valor de tabela (sem cobrança do
// cliente). Vendedor vê PREÇO do plano (ok), nunca a cobrança do cliente.
type CatalogPreco = { key: string; title: string; monthlyPrice: number | null };

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

// Preço de tabela com centavos (Full = 349,90): fmtMoney corta os centavos,
// então a vitrine de plano usa o formato cheio de moeda.
function fmtPreco(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
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
  const [tasks, setTasks] = useState([true, false, false]);
  // agenda embutida (ordem do dono): painel lateral com os retornos reais
  // do board + sincronização da agenda de hoje no WhatsApp
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

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
  }, []);

  // Fechamento de venda com produto (trilha Produtos & Comissão, item 1):
  // PATCH /vendas/lead/:id {productId, saleValue, saleStatus} para venda
  // direta; POST .../hbx-handoff para produto sob consulta (fechamento
  // assistido). Produtos vêm de GET /products (cadastro da empresa).
  const [fecharOpen, setFecharOpen] = useState(false);
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [planosPreco, setPlanosPreco] = useState<CatalogPreco[] | null>(null);
  const [prodId, setProdId] = useState("");
  const [valor, setValor] = useState("");
  const [setupValor, setSetupValor] = useState("");
  const [fecharBusy, setFecharBusy] = useState(false);
  const [fecharMsg, setFecharMsg] = useState<string | null>(null);

  // quick actions reais do card (caminho da vendedora, 12/06/2026): marcar
  // RESULTADO da ligação + observação (POST lead/:id/attempt grava a tentativa
  // na timeline + contador; PATCH lead/:id {shortNote} deixa o resultado
  // visível no card) e mover etapa/agendar retorno (PATCH lead/:id
  // {status|returnAt}). Só endpoints existentes — sem mexer no backend.
  const [acaoBusy, setAcaoBusy] = useState(false);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [moverStatus, setMoverStatus] = useState("");
  const [retornoData, setRetornoData] = useState("");
  const [obs, setObs] = useState("");
  const [negMotivo, setNegMotivo] = useState("");
  const [negArm, setNegArm] = useState(false); // confirma em 2 cliques (padrão do kit)

  // Negativar com MOTIVO (dono 14/06): leve volta pro pool pros outros; dura some
  // pra todos. Tira o card da carteira. POST /vendas/lead/:id/negativar { status, note }.
  async function negativarLead() {
    if (!sel?.id || !negMotivo || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      const res = await apiFetch<{ message?: string }>(`/vendas/lead/${encodeURIComponent(sel.id)}/negativar`, {
        method: "POST",
        body: JSON.stringify({ status: negMotivo, note: obs.trim() || undefined }),
      });
      setAcaoMsg(`✓ ${res?.message || "Lead negativado."}`);
      setNegMotivo("");
      setObs("");
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível negativar o lead.");
    } finally {
      setAcaoBusy(false);
      setNegArm(false);
    }
  }

  async function registrarResultado(outcome: string) {
    if (!sel?.id || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    const note = (obs.trim() ? `${outcome} · ${obs.trim()}` : outcome).slice(0, 280);
    try {
      // tentativa: incrementa contador + último contato + evento na timeline
      await apiFetch(`/vendas/lead/${encodeURIComponent(sel.id)}/attempt`, {
        method: "POST",
        body: JSON.stringify({ channel: outcome }),
      });
      // resultado visível no card (a aside não mostra a timeline; shortNote sim)
      await apiFetch(`/vendas/lead/${encodeURIComponent(sel.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ shortNote: note }),
      });
      setAcaoMsg(`✓ Resultado: ${outcome}.`);
      setObs("");
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao registrar o resultado.");
    } finally {
      setAcaoBusy(false);
    }
  }

  async function moverEtapa() {
    if (!sel?.id || !moverStatus || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(sel.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: moverStatus }),
      });
      setAcaoMsg("✓ Etapa atualizada.");
      setMoverStatus("");
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao mover a etapa.");
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
      await apiFetch(`/vendas/lead/${encodeURIComponent(sel.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setAcaoMsg("✓ Retorno agendado.");
      setRetornoData("");
      setRetornoMode("manual");
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao agendar o retorno.");
    } finally {
      setAcaoBusy(false);
    }
  }

  function precoDoProduto(p?: Produto | null) {
    if (!p) return null;
    if (p.priceCents != null && Number.isFinite(p.priceCents)) return p.priceCents / 100;
    if (p.price != null && Number.isFinite(p.price)) return p.price;
    return null;
  }

  function abrirFechar() {
    if (!sel?.id) return;
    setFecharMsg(null);
    setLinkInfo(null);
    setSetupValor(deal?.setupValue ? String(deal.setupValue) : "");
    setFecharOpen(true);
    if (produtos === null) {
      apiFetch<Produto[] | { items?: Produto[] }>("/products?status=active")
        .then(res => {
          const list = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
          setProdutos(list);
        })
        .catch(() => setProdutos([]));
    }
    if (planosPreco === null) {
      // Vitrine pública do catálogo: List/Lead+/Full com a mensalidade de tabela.
      apiFetch<{ plans?: CatalogPreco[] }>("/commercial-plans/public-catalog")
        .then(res => setPlanosPreco(Array.isArray(res?.plans) ? res.plans : []))
        .catch(() => setPlanosPreco([]));
    }
  }

  function escolherProduto(id: string) {
    setProdId(id);
    const p = (produtos || []).find(x => String(x.id) === id) || null;
    const preco = precoDoProduto(p);
    setValor(preco != null ? String(preco) : "");
  }

  // Modelo real do fechamento (descoberto no contrato): a venda NUNCA é
  // confirmada na mão — o vendedor GERA O LINK de contratação (hbx-handoff:
  // /register?plan=X&hbxLead=card) e envia ao cliente; quando o cliente
  // ativa/paga, o backend confirma a venda e calcula a comissão sozinho.
  const [linkInfo, setLinkInfo] = useState<{ registerUrl: string; message: string; planLabel: string } | null>(null);

  async function gerarLink() {
    if (!sel?.id || fecharBusy) return;
    setFecharBusy(true);
    setFecharMsg(null);
    try {
      // Persiste a implantação acordada antes do handoff: quando o cliente
      // ativar pelo link, o motor calcula a comissão do setup a partir daqui.
      if (setupValor) {
        await apiFetch(`/vendas/lead/${encodeURIComponent(sel.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ setupValue: Number(setupValor) }),
        }).catch(() => {});
      }
      const res = await apiFetch<{ ok?: boolean; registerUrl?: string; registerPath?: string; message?: string; planLabel?: string }>(
        `/vendas/lead/${encodeURIComponent(sel.id)}/hbx-handoff`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(prodId ? { productId: Number(prodId) } : {}),
            origin: window.location.origin,
          }),
        },
      );
      setLinkInfo({
        registerUrl: res?.registerUrl || res?.registerPath || "",
        message: res?.message || "",
        planLabel: res?.planLabel || "",
      });
      await loadBoard();
    } catch (err) {
      setFecharMsg(err instanceof Error ? err.message : "Não foi possível gerar o link.");
    } finally {
      setFecharBusy(false);
    }
  }

  async function salvarProdutoValor() {
    if (!sel?.id || fecharBusy) return;
    setFecharBusy(true);
    setFecharMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(sel.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(prodId ? { productId: Number(prodId) } : {}),
          ...(valor ? { saleValue: Number(valor) } : {}),
          ...(setupValor ? { setupValue: Number(setupValor) } : {}),
        }),
      });
      setFecharMsg("✓ Produto e valor salvos no card.");
      await loadBoard();
    } catch (err) {
      setFecharMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setFecharBusy(false);
    }
  }

  function copiarMensagem() {
    if (!linkInfo) return;
    navigator.clipboard?.writeText(linkInfo.message || linkInfo.registerUrl).then(
      () => setFecharMsg("✓ Mensagem copiada."),
      () => setFecharMsg("Copie manualmente o texto acima."),
    );
  }

  function abrirWhatsApp() {
    if (!linkInfo || !sel?.phone) return;
    const digits = sel.phone.replace(/\D/g, "");
    const target = digits.length >= 12 ? digits : `55${digits}`;
    window.open(`https://wa.me/${target}?text=${encodeURIComponent(linkInfo.message)}`, "_blank", "noopener");
  }

  // Cliente no fechamento (raciocínio do dono, 12/06/2026): o vendedor pode
  // CADASTRAR o cliente direto do card (dados puxados de lá) e tem o atalho
  // da "carta" para abrir o card do cliente quando ele existe. O perfil tem
  // externalSource/externalCustomerId — os points de integração (TOTVS etc.).
  type ClienteProfile = { id?: string; name?: string | null; phone?: string | null; email?: string | null; document?: string | null; status?: string | null; externalSource?: string | null; externalCustomerId?: string | null };
  const [cadOpen, setCadOpen] = useState(false);
  const [cadForm, setCadForm] = useState({ name: "", phone: "", email: "", document: "" });
  const [cadBusy, setCadBusy] = useState(false);
  const [cadMsg, setCadMsg] = useState<string | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [cliente, setCliente] = useState<ClienteProfile | null | "nao_encontrado">(null);

  function abrirCadastrarCliente() {
    if (!sel) return;
    setCadForm({ name: sel.name || "", phone: sel.phone || "", email: sel.email || "", document: "" });
    setCadMsg(null);
    setCadOpen(true);
  }

  async function cadastrarCliente(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (cadBusy) return;
    setCadBusy(true);
    setCadMsg(null);
    try {
      await apiFetch("/cadastros/customer-profiles", {
        method: "POST",
        body: JSON.stringify({
          name: cadForm.name || undefined,
          phone: cadForm.phone || undefined,
          email: cadForm.email || undefined,
          document: cadForm.document || undefined,
        }),
      });
      setCadMsg("✓ Cliente cadastrado — vinculado pelo telefone do card.");
      setCadOpen(false);
      await loadBoard();
    } catch (err) {
      setCadMsg(err instanceof Error ? err.message : "Não foi possível cadastrar o cliente.");
    } finally {
      setCadBusy(false);
    }
  }

  async function verCliente() {
    if (!sel?.phone) return;
    setCliente(null);
    setClienteOpen(true);
    try {
      const res = await apiFetch<ClienteProfile | null>(`/cadastros/customer-profiles/by-phone?phone=${encodeURIComponent(sel.phone)}`);
      setCliente(res && (res.name || res.phone || res.id) ? res : "nao_encontrado");
    } catch {
      setCliente("nao_encontrado");
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

  // Mobile kanban: dots de navegação + menu "mover para" por toque
  const isMobile = useIsMobile();
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
      setMoverStatus("");
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao mover a etapa.");
    } finally {
      setAcaoBusy(false);
    }
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

  const summary = board?.summary;
  const deal = sel;

  return (
    <React.Fragment>
        <div className="content">
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
                  <span>{board ? `${summary?.total ?? 0} cards` : loadError ? "" : "Carregando…"}</span>
                  <span className="seg-toggle" role="group" aria-label="Visão do pipeline">
                    <button className={"seg" + (view === "list" ? " on" : "")} onClick={() => setView("list")} aria-pressed={view === "list"}>Lista</button>
                    <button className={"seg" + (view === "board" ? " on" : "")} onClick={() => setView("board")} aria-pressed={view === "board"}>Quadro</button>
                  </span>
                  <button className="icon-ghost" title="Prospecção automática" aria-label="Prospecção automática" onClick={() => setProspOpen(true)}>
                    <I d={ICONS.bot} size={16} />
                  </button>
                  <button className="icon-ghost" title="Agenda de retornos" aria-label="Agenda de retornos" onClick={() => setAgendaOpen(o => !o)}>
                    <I d={ICONS.clock} size={16} />
                  </button>
                  <button className="btn-ghost">Todas as equipes ▾</button>
                  <button className="btn-teal" onClick={() => setNovoOpen(true)}><I d={ICONS.plus} size={14} /> Novo lead</button>
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
              {/* LISTA DENSA (padrão): varredura rápida de todos os leads —
                  tabela central do kit, clique na linha abre o detalhe lateral. */}
              {view === "list" && board && (summary?.total ?? 0) > 0 && (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Empresa</th><th>Segmento</th><th>Etapa</th><th>Valor</th>
                        <th>Próximo passo</th><th>Responsável</th><th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BLOCK_ORDER.flatMap(({ key, label }) =>
                        (board?.blocks?.[key] || []).map(card => {
                          const tagCls = key === "overdue" ? "tag warn" : key === "closed" ? "tag teal" : "tag";
                          return (
                            <tr key={card.id} className={sel?.id === card.id ? "sel" : ""} onClick={() => setSel(card)}>
                              <td><div className="co"><strong>{card.name || "—"}</strong>{card.city && <div className="sub2">{card.city}</div>}</div></td>
                              <td>{card.segment || "—"}</td>
                              <td><span className={tagCls}>{label}</span>{card.saleConfirmedAt && <span className="badge-win" style={{ marginLeft: 6 }}>Ganho</span>}</td>
                              <td className="hbx-mono">{leadValueLabel(card)}</td>
                              <td><span className="nowrap-cell" style={{ maxWidth: 240, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }} title={card.nextAction || card.shortNote || ""}>{card.nextAction || card.statusLabel || "—"}</span></td>
                              <td>{card.owner?.name ? <span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><Av name={card.owner.name} size={20} />{card.owner.name}</span> : "—"}</td>
                              <td className="hbx-mono">{fmtWhen(card.block === "closed" ? card.closedAt : card.returnAt)}</td>
                            </tr>
                          );
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* QUADRO (kanban) — opcional, para arrastar entre etapas. */}
              {view === "board" && (
              <>
              <div className="board" ref={boardRef} onScroll={isMobile ? onBoardScroll : undefined}>
                {BLOCK_ORDER.map(({ key, label }) => {
                  const cards = board?.blocks?.[key] || [];
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

          <aside className="ctx">
            <h3>Detalhes do negócio <span className="x" onClick={() => setSel(null)}>✕</span></h3>

            <div key={deal?.id ?? "empty"} className="ctx-body">
            {/* Hero: avatar + nome + segmento + etapa */}
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Av name={deal?.name || "—"} size={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="company">{deal?.name || "Selecione um card"}</span>
                <div className="sub">{deal?.segment || deal?.city || "—"}</div>
                {deal?.city && deal?.segment && (
                  <div className="sub" style={{ marginTop: 3, display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <I d={ICONS.mapin} size={11} /> {deal.city}{deal.state ? `, ${deal.state}` : ""}
                  </div>
                )}
                <div style={{ marginTop: 6 }}><span className="tag">{deal?.statusLabel || "—"}</span></div>
              </div>
            </div>

            {/* Canais de contato */}
            {deal?.phone ? (
              <a href={`tel:${deal.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone">
                <CanalIcon canal="telefone" /> {deal.phone}
              </a>
            ) : deal ? (
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Sem telefone neste card.</div>
            ) : null}
            {deal?.website && (
              <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className="ctx-phone" style={{ marginTop: 4 }}>
                <CanalIcon canal="site" /> {deal.website}
              </a>
            )}

            <div className="kv">
              <div className="row"><span className="k">Valor</span><span className="v" style={{ fontFamily: "var(--font-mono)" }}>{deal ? leadValueLabel(deal) : "—"}</span></div>
              <div className="row"><span className="k">Produto</span><span className="v">{deal?.product?.name || "—"}</span></div>
              <div className="row"><span className="k">Etapa atual</span><span className="v">{deal?.statusLabel || "—"}</span></div>
              <div className="row"><span className="k">Próximo retorno</span><span className="v">{fmtDate(deal?.returnAt ?? null)}</span></div>
              <div className="row"><span className="k">Último contato</span><span className="v">{fmtDate(deal?.lastContactAt ?? null)}</span></div>
              <div className="row"><span className="k">Tentativas</span><span className="v" style={{ fontFamily: "var(--font-mono)" }}>{deal ? deal.attemptCount : "—"}</span></div>
              <div className="row"><span className="k">Responsável</span><span className="v" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{deal?.owner?.name ? <React.Fragment><Av name={deal.owner.name} size={18} />{deal.owner.name}</React.Fragment> : "—"}</span></div>
              {deal?.saleStatus && deal.saleStatus !== "none" && (
                <React.Fragment>
                  <div className="row"><span className="k">Venda</span><span className="v"><span className={"tag" + (deal.saleStatus === "sale_confirmed" ? " teal" : deal.saleStatus === "canceled" ? " warn" : "")}>{deal.saleStatusLabel || deal.saleStatus}</span></span></div>
                  <div className="row"><span className="k">Valor fechado</span><span className="v" style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(deal.saleValue) || "—"}</span></div>
                  <div className="row"><span className="k">Comissão</span><span className="v">{deal.commissionStatusLabel || "—"}{deal.commissionAmount != null ? <span style={{ fontFamily: "var(--font-mono)", marginLeft: 6 }}>{fmtMoney(deal.commissionAmount)}</span> : null}</span></div>
                  {deal.setupValue ? (
                    <React.Fragment>
                      <div className="row"><span className="k">Implantação</span><span className="v">{fmtMoney(deal.setupValue) || "—"}</span></div>
                      <div className="row"><span className="k">Comissão implantação</span><span className="v">{deal.setupCommissionStatusLabel || "—"}{deal.setupCommissionAmount != null ? ` · ${fmtMoney(deal.setupCommissionAmount)}` : ""}</span></div>
                    </React.Fragment>
                  ) : null}
                </React.Fragment>
              )}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {fecharMsg && (
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: fecharMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{fecharMsg}</div>
              )}
              <button className="btn-teal" onClick={abrirFechar} disabled={!deal || deal.block === "closed"}>
                <I d={ICONS.check} size={14} /> {deal?.block === "closed" ? "Card já fechado" : "Fechar venda"}
              </button>
              {acaoMsg && (
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: acaoMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{acaoMsg}</div>
              )}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>
                  <I d={ICONS.phone} size={13} /> Resultado da ligação
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {["Atendeu", "Não atendeu", "Caixa postal", "Sem interesse"].map(o => (
                    <button key={o} className="btn-ghost" style={{ minHeight: 34, fontSize: "0.72rem" }}
                      onClick={() => registrarResultado(o)} disabled={!deal || acaoBusy || deal.block === "closed"}>
                      {o}
                    </button>
                  ))}
                </div>
                <textarea className="field-dark" rows={2} maxLength={240}
                  placeholder="Observação da ligação (opcional) — vai pro card"
                  value={obs} onChange={e => setObs(e.target.value)} disabled={!deal || deal.block === "closed"}
                  style={{ resize: "vertical", fontFamily: "var(--font-body)" }} />
              </div>
              <div className="vendas-neg">
                <label>Negativar lead (sai da carteira)</label>
                <div className="neg-row">
                  <select className="field-dark" value={negMotivo} disabled={!deal || acaoBusy || deal.block === "closed"}
                    onChange={e => { setNegMotivo(e.target.value); setNegArm(false); }} aria-label="Motivo da negativação">
                    <option value="">Motivo…</option>
                    <option value="negative">Sem interesse</option>
                    <option value="no_answer">Não atende / não existe</option>
                    <option value="no_whatsapp">Sem WhatsApp</option>
                    <option value="opt_out">Pediu pra não receber</option>
                    <option value="complaint">Reclamou</option>
                  </select>
                  <button className="btn-ghost" onClick={() => (negArm ? negativarLead() : setNegArm(true))}
                    disabled={!deal || !negMotivo || acaoBusy}>
                    {negArm ? "Confirmar" : "Negativar"}
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <select className="field-dark" style={{ minHeight: 36 }} value={moverStatus} disabled={!deal || deal.block === "closed"}
                  onChange={e => setMoverStatus(e.target.value)} aria-label="Mover para etapa">
                  <option value="">Mover etapa…</option>
                  <option value="novo">Novo</option>
                  <option value="contato">Contato</option>
                  <option value="retorno">Retorno</option>
                  <option value="qualificado">Qualificado</option>
                  <option value="encerrado">Encerrado</option>
                </select>
                <button className="btn-ghost" onClick={moverEtapa} disabled={!deal || !moverStatus || acaoBusy}>Mover</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input className="field-dark" type="date" style={{ minHeight: 36 }} value={retornoData} disabled={!deal || deal.block === "closed"}
                  onChange={e => { setRetornoData(e.target.value); setRetornoMode("manual"); }} aria-label="Data do retorno" />
                <button className="btn-ghost" onClick={agendarRetorno} disabled={!deal || !retornoData || acaoBusy}>Agendar</button>
              </div>
              {retornoData && deal && deal.block !== "closed" && botStatus?.botModuleEnabled && botStatus?.botArmed && (
                <div className="retorno-mode">
                  <span className="lbl">Tipo de retorno</span>
                  <div className="radios">
                    {(["manual", ...(deal.email ? ["auto_email"] : []), ...(deal.phone ? ["auto_whatsapp"] : []), ...(deal.email && deal.phone ? ["auto_both"] : [])] as RetornoMode[]).map(mode => {
                      const labels: Record<RetornoMode, string> = { manual: "Manual", auto_email: "E-mail automático", auto_whatsapp: "WhatsApp automático", auto_both: "E-mail + WhatsApp" };
                      return (
                        <label key={mode} className="radio-lbl">
                          <input type="radio" name="retorno-mode" value={mode} checked={retornoMode === mode} onChange={() => setRetornoMode(mode)} />
                          {labels[mode]}
                        </label>
                      );
                    })}
                  </div>
                  {retornoMode === "auto_both" && <span className="collision">⚠ E-mail e WhatsApp agendados para o mesmo dia.</span>}
                </div>
              )}
              {retornoData && deal && deal.block !== "closed" && botStatus?.botModuleEnabled && !botStatus?.botArmed && (
                <div className="bot-warn">
                  <span className="warn-lbl">Bot sem configuração.</span>
                  <button className="btn-ghost" onClick={notifyBotMaster} disabled={masterNotified}>
                    {masterNotified ? "✓ Suporte avisado" : "Contate o suporte"}
                  </button>
                </div>
              )}
              {cadMsg && (
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: cadMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{cadMsg}</div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <button className="btn-ghost" onClick={abrirCadastrarCliente} disabled={!deal}>
                  <I d={ICONS.users} size={13} /> Cadastrar cliente
                </button>
                <button className="icon-ghost" onClick={verCliente} disabled={!deal?.phone}
                  title="Card do cliente 🃏" aria-label="Abrir card do cliente">
                  <I d={ICONS.doc} size={15} />
                </button>
              </div>
            </div>
            <div className="sep"></div>
            <div>
              <h3 style={{ marginBottom: 6 }}>Próximas tarefas</h3>
              {[
                { t: "Aguardar retorno da proposta", d: "22/06/2026", r: "Juliana Costa" },
                { t: "Reunião técnica com o cliente", d: "23/06/2026", r: "Rafael Martins" },
                { t: "Enviar proposta ajustada", d: "26/06/2026", r: "Juliana Costa" },
              ].map((t, i) => (
                <label className="task" key={t.t}>
                  <input type="checkbox" checked={tasks[i]} onChange={() => setTasks(ts => ts.map((v, j) => j === i ? !v : v))} />
                  <span>
                    <span className="t" style={{ textDecoration: tasks[i] ? "line-through" : "none", opacity: tasks[i] ? 0.6 : 1 }}>{t.t}</span>
                    <span className="d">{t.d} · {t.r}</span>
                  </span>
                </label>
              ))}
              <span className="link">Ver todas as tarefas</span>
            </div>
            <div className="sep"></div>
            <div>
              <h3 style={{ marginBottom: 10 }}>Funil de conversão (mês)</h3>
              <div style={{ display: "grid", gap: 4, justifyItems: "center", padding: "6px 0 2px" }}>
                {([["var(--hbx-info)", 170], ["var(--hbx-brand)", 130], ["var(--hbx-brand-strong)", 92], ["var(--hbx-warning)", 56]] as [string, number][]).map(([c, w], i) => (
                  <div key={i} style={{ width: w, height: 22, background: c, borderRadius: 4, opacity: 0.92 }}></div>
                ))}
              </div>
              <div className="fleg" style={{ marginTop: 8 }}>
                {([["var(--hbx-info)", "Leads captados", "1.248 (100%)"], ["var(--hbx-brand)", "Propostas", "342 (27,4%)"], ["var(--hbx-brand-strong)", "Negociação", "78 (6,3%)"], ["var(--hbx-warning)", "Fechados", "36 (2,9%)"]] as [string, string, string][]).map(([c, l, v]) => (
                  <div className="row" key={l}><span className="swatch" style={{ background: c }}></span>{l}<span style={{ marginLeft: "auto", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.64rem" }}>{v}</span></div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}><span className="link">Ver relatório completo</span></div>
            </div>

            </div>{/* /ctx-body */}
          </aside>
        </div>

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

      {fecharOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setFecharOpen(false); }}>
          <div className="hbx-modal" style={{ width: "min(420px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Fechar venda — {sel?.name || "card"}
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setFecharOpen(false)}>✕</span>
            </h3>
            {fecharMsg && !fecharMsg.startsWith("✓") && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-danger)" }}>{fecharMsg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">Produto</label>
              {produtos === null && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Carregando produtos…</span>}
              {produtos !== null && produtos.length === 0 && (
                <span style={{ fontSize: "0.72rem", color: "var(--hbx-warning)", lineHeight: 1.5 }}>
                  Nenhum produto cadastrado na empresa — dá para fechar só com o valor, ou cadastrar produtos (tela chega na sequência da trilha).
                </span>
              )}
              {produtos !== null && produtos.length > 0 && (
                <select className="select-dark" value={prodId} onChange={e => escolherProduto(e.target.value)} style={{ width: "100%" }}>
                  <option value="">Sem produto (só valor)</option>
                  {produtos.map(p => {
                    const preco = precoDoProduto(p);
                    return <option key={p.id} value={String(p.id)}>{p.name}{preco != null ? ` — ${preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : " — sob consulta"}</option>;
                  })}
                </select>
              )}
            </div>
            {planosPreco && planosPreco.some(p => fmtPreco(p.monthlyPrice)) && (
              <div className="doc-slot" style={{ display: "grid", gap: 6 }}>
                <span className="field-label">Mensalidade por plano (referência)</span>
                <div className="kv">
                  {planosPreco.filter(p => fmtPreco(p.monthlyPrice)).map(p => (
                    <div className="row" key={p.key}>
                      <span className="k">{p.title}</span>
                      <span className="v">{fmtPreco(p.monthlyPrice)}/mês</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">Mensalidade / valor (R$)</label>
              <input className="field-dark" type="number" min={0} step="0.01" placeholder="0,00"
                value={valor} onChange={e => setValor(e.target.value)} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">Implantação (R$) — valor acordado da instalação</label>
              <input className="field-dark" type="number" min={0} step="0.01" placeholder="0,00"
                value={setupValor} onChange={e => setSetupValor(e.target.value)} />
            </div>
            {!linkInfo && (
              <React.Fragment>
                <button className="btn-teal" onClick={gerarLink} disabled={fecharBusy} style={{ minHeight: 42 }}>
                  {fecharBusy ? "Gerando…" : "Gerar link de contratação →"}
                </button>
                <button className="btn-ghost" onClick={salvarProdutoValor} disabled={fecharBusy} style={{ minHeight: 38 }}>
                  Salvar produto/valor no card
                </button>
                <p style={{ margin: 0, fontSize: "0.64rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
                  O cliente ativa pelo link — e a venda confirma SOZINHA no seu card, com a comissão calculada sobre o valor real. Transparência total, sem digitação manual de status.
                </p>
              </React.Fragment>
            )}
            {linkInfo && (
              <React.Fragment>
                <div className="ok show" style={{ display: "grid", gap: 6 }}>
                  <strong style={{ fontSize: "0.74rem" }}>✓ Link de contratação gerado{linkInfo.planLabel ? ` — ${linkInfo.planLabel}` : ""}</strong>
                  <span style={{ fontSize: "0.66rem", lineHeight: 1.5, whiteSpace: "pre-line", wordBreak: "break-all" }}>{linkInfo.message || linkInfo.registerUrl}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className="btn-ghost" onClick={copiarMensagem} style={{ minHeight: 38 }}>Copiar mensagem</button>
                  <button className="btn-teal" onClick={abrirWhatsApp} disabled={!sel?.phone} style={{ minHeight: 38 }}
                    title={sel?.phone ? "Abrir conversa no WhatsApp com a mensagem pronta" : "Card sem telefone"}>
                    Enviar no WhatsApp →
                  </button>
                </div>
                <button className="btn-ghost" onClick={() => { setLinkInfo(null); setFecharOpen(false); }} style={{ minHeight: 36 }}>
                  Concluir — acompanhar ativação no card
                </button>
              </React.Fragment>
            )}
          </div>
        </div>
      )}

      {cadOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setCadOpen(false); }}>
          <form className="hbx-modal" onSubmit={cadastrarCliente}
            style={{ width: "min(400px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Cadastrar cliente
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setCadOpen(false)}>✕</span>
            </h3>
            <p style={{ margin: 0, fontSize: "0.68rem", color: "var(--text-muted)" }}>Dados puxados do card — ajuste o que precisar.</p>
            {cadMsg && !cadMsg.startsWith("✓") && (
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-danger)" }}>{cadMsg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Nome *</label>
              <input className="field-dark" required maxLength={160} value={cadForm.name}
                onChange={e => setCadForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Telefone</label>
                <input className="field-dark" maxLength={30} value={cadForm.phone}
                  onChange={e => setCadForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>CPF/CNPJ</label>
                <input className="field-dark" maxLength={40} placeholder="opcional" value={cadForm.document}
                  onChange={e => setCadForm(f => ({ ...f, document: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>E-mail</label>
              <input className="field-dark" type="email" maxLength={160} placeholder="opcional" value={cadForm.email}
                onChange={e => setCadForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <button className="btn-teal" type="submit" disabled={cadBusy} style={{ minHeight: 42 }}>
              {cadBusy ? "Cadastrando…" : "Cadastrar cliente"}
            </button>
          </form>
        </div>
      )}

      {clienteOpen && (
        <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) setClienteOpen(false); }}>
          <div className="hbx-drawer" style={{ width: 330, height: "100vh", overflowY: "auto", padding: "18px 16px", display: "grid", gap: 14, alignContent: "start" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "0.9rem", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Card do cliente 🃏
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setClienteOpen(false)}>✕</span>
            </h3>
            {cliente === null && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Consultando…</span>}
            {cliente === "nao_encontrado" && (
              <div style={{ display: "grid", gap: 10 }}>
                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Este contato ainda não tem cadastro de cliente.
                </span>
                <button className="btn-teal" onClick={() => { setClienteOpen(false); abrirCadastrarCliente(); }}>Cadastrar agora</button>
              </div>
            )}
            {cliente !== null && cliente !== "nao_encontrado" && (
              <div className="kv">
                <div className="row"><span className="k">Nome</span><span className="v">{cliente.name || "—"}</span></div>
                <div className="row"><span className="k">Telefone</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{cliente.phone || "—"}</span></div>
                <div className="row"><span className="k">E-mail</span><span className="v" style={{ fontSize: "0.68rem" }}>{cliente.email || "—"}</span></div>
                <div className="row"><span className="k">CPF/CNPJ</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{cliente.document || "—"}</span></div>
                <div className="row"><span className="k">Status</span><span className="v">{cliente.status || "—"}</span></div>
                <div className="row"><span className="k">Integração</span><span className="v">{cliente.externalSource ? `${cliente.externalSource}${cliente.externalCustomerId ? ` · ${cliente.externalCustomerId}` : ""}` : "— (point TOTVS/ERP futuro)"}</span></div>
              </div>
            )}
          </div>
        </div>
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
    </React.Fragment>
  );
}
