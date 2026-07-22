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
import {
  vendasEngagementMeta,
  type VendasConversationRef,
  type VendasEngagementSnapshot,
} from "@/components/hbx/detalhes-negocio";
import { FecharVendaModal } from "@/components/hbx/fechar-venda-modal";
import { LeadCockpitModal } from "@/components/hbx/lead-cockpit-modal";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { RadarAiBadge } from "@/components/hbx/radar-ai-badge";
import { LeadsClient } from "../leads/page.client";
import { apiFetch } from "@/lib/api";

import { useTabParam } from "@/lib/use-tab-param";
import { useRadarAiStatusPoll } from "@/lib/radar-ai-status";
import { buildWaLink, buildWaMessage } from "@/lib/wa-link";

// Exportado (LEAD-COCKPIT, 11/07): o LeadCockpitModal recebe o card do board
// JÁ carregado (sem refetch) — `import type` (apagado no build, sem ciclo real).
export type VendasLead = {
  id: string;
  radarLeadId?: string | null;
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
  // HOT-07 (empresa recém-aberta): badge de urgência. Opcional.
  isFreshCompany?: boolean | null;
  daysSinceOpened?: number | null;
  // presença no Atendimento
  isInInbox?: boolean | null;
  conversation?: VendasConversationRef | null;
  engagement?: VendasEngagementSnapshot | null;
  automation?: {
    enrollmentId: string;
    kind: string;
    definitionId: string;
    status: string;
    currentStep: number;
    nextStepAt: string | null;
    label: string;
  } | null;
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
  // LEI DO VENDEDOR (docs/Rules/PAGAMENTOS.md): quando false (vendedor comum),
  // valores R$ SOMEM — soma por coluna e valor no card do quadro nunca aparecem.
  // Fonte da verdade = backend (products.viewPrice). Ausente = trata como false.
  canViewValues?: boolean;
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
  // Seletor de vendedor do funil — só vem preenchido para admin/gerente
  // (canManageTeam). Vendedor comum recebe ausente/null → o botão SOME.
  team?: {
    sellers: Array<{ id: number; name: string; active: boolean; isMe: boolean }>;
    selectedSellerId: number | null;
  } | null;
  assistant?: {
    configured: boolean;
    publicName: string | null;
    published: boolean;
    runtimeEnabled: boolean;
    channelArmed: boolean;
    active: boolean;
    updatedAt: string | null;
  };
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

// Persistência do filtro de vendedor (admin) — sobrevive reload/navegação.
const TEAM_FILTER_KEY = "hbx:vendas-team-filter";

const BLOCK_ORDER: { key: keyof NonNullable<BoardResponse>["blocks"]; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "overdue", label: "Atrasados" },
  { key: "scheduled", label: "Agendados" },
  { key: "closed", label: "Fechados" },
];

function replaceBoardLead(board: BoardResponse, updated: VendasLead): BoardResponse {
  if (!board) return board;
  const blocks = { ...board.blocks };
  for (const { key } of BLOCK_ORDER) {
    blocks[key] = (blocks[key] || []).map(card => card.id === updated.id ? updated : card);
  }
  return { ...board, blocks };
}


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
// Subtítulo = a AÇÃO da etapa (onboarding embutido): o vendedor lê "o que fazer
// aqui" sem tour. Mapeado sobre os 5 status reais do VendasLead (nada de máquina
// de estados nova). Prospecção→Qualificação→Proposta→Negociação→Fechamento.
const STAGE_ORDER: { key: VendasStage; label: string; sub: string; tone: string }[] = [
  { key: "novo", label: "Prospecção", sub: "Novos leads — faça o 1º contato", tone: "new" },
  { key: "contato", label: "Qualificação", sub: "Classifique e ranqueie", tone: "contact" },
  { key: "retorno", label: "Proposta", sub: "Em negociação — envie a oferta", tone: "return" },
  { key: "qualificado", label: "Negociação", sub: "Follow-up até o sim", tone: "qualified" },
  { key: "encerrado", label: "Fechamento", sub: "Contrato e compromissos", tone: "ended" },
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

// Termômetro (1–5) DERIVADO — nós = estrela viva (não estrela na mão). Combina o
// score de oportunidade do Radar (0–100) com sinais de engajamento reais do card:
// temperatura, tentativas e a projeção canônica da conversa. `isInInbox` significa
// somente existência de conversa e JAMAIS é tratado como resposta.
// Retorna a nota + o "porquê" (tooltip) pra ninguém adivinhar de onde saiu.
function deriveTermometro(card: VendasLead): { score: number; why: string } {
  const reasons: string[] = [];
  // Base: score de oportunidade (0–100 → 0–5). Sem score → base 2 (neutro).
  let pts = 0;
  const opp = Number(card.opportunityScore ?? 0);
  if (opp > 0) {
    pts += (opp / 100) * 3; // até 3 estrelas do score
    reasons.push(`Score ${opp}/100`);
  } else {
    pts += 1;
  }
  // Temperatura do lead (sinal do Radar/enriquecimento)
  const temp = String(card.leadTemperature || "").toLowerCase();
  if (temp === "quente") { pts += 1.4; reasons.push("Lead quente"); }
  else if (temp === "morno") { pts += 0.7; reasons.push("Lead morno"); }
  else if (temp === "frio") { reasons.push("Lead frio"); }
  // Engajamento canônico: inbound real vale mais; outbound confirmado é só um
  // sinal de contato e mantém o lead aguardando resposta.
  if (card.engagement?.hasInboundReply) { pts += 0.8; reasons.push("Cliente respondeu"); }
  else if (card.engagement?.hasSuccessfulOutbound) { pts += 0.3; reasons.push("Contato enviado"); }
  if ((card.attemptCount ?? 0) >= 2) { pts += 0.4; reasons.push(`${card.attemptCount} contatos`); }
  const score = Math.max(1, Math.min(5, Math.round(pts)));
  const why = reasons.length ? reasons.join(" · ") : "Sem sinais suficientes";
  return { score, why };
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

// Move otimista genérico: aplica campos soltos no card sem esperar a rede
// (edição inline da grade). Devolve o board novo; o rollback é o board antigo.
function patchCardFields(board: BoardResponse, id: string, patch: Partial<VendasLead>): BoardResponse {
  if (!board) return board;
  const apply = (arr: VendasLead[]) => arr.map(c => (c.id === id ? { ...c, ...patch } : c));
  return {
    ...board,
    blocks: {
      today: apply(board.blocks.today),
      overdue: apply(board.blocks.overdue),
      scheduled: apply(board.blocks.scheduled),
      closed: apply(board.blocks.closed),
    },
  };
}

// ── GRADE (planilha) ─────────────────────────────────────────────────────────
// Catálogo ÚNICO de colunas da lista. Cada lead vira UMA linha; cada dado tem
// sua coluna (nada empilhado dentro da célula). `edit` só existe nas colunas
// que o PATCH /vendas/lead/:id realmente aceita — inventar campo aqui vira
// erro 400 na cara do vendedor.
type GridEdit = {
  field: "name" | "phone" | "email" | "address" | "nextAction" | "shortNote" | "saleValue" | "status" | "returnAt";
  type: "text" | "email" | "number" | "date" | "select";
  max?: number;
};
type GridColumn = {
  key: string;
  label: string;
  width: number;
  mono?: boolean;
  edit?: GridEdit;
  gate?: "values";           // só aparece com canViewValues
  text: (c: VendasLead) => string;   // valor cru: ordenação, busca e edição
};

const GRID_COLUMNS: GridColumn[] = [
  { key: "name", label: "Empresa", width: 220, edit: { field: "name", type: "text", max: 120 }, text: c => c.name || "" },
  { key: "phone", label: "Telefone", width: 140, mono: true, edit: { field: "phone", type: "text", max: 24 }, text: c => c.phone || "" },
  { key: "city", label: "Cidade", width: 130, text: c => c.city || "" },
  { key: "state", label: "UF", width: 52, text: c => c.state || "" },
  { key: "segment", label: "Segmento", width: 160, text: c => c.segment || "" },
  { key: "stage", label: "Etapa", width: 130, edit: { field: "status", type: "select" }, text: c => STAGE_LABEL[normalizeStage(c.status)] },
  { key: "agenda", label: "Agenda", width: 110, text: c => agendaInfo(c).label },
  { key: "engage", label: "Engajamento", width: 130, text: c => vendasEngagementMeta(c.engagement, c.conversation).label },
  { key: "value", label: "Valor", width: 110, mono: true, gate: "values", edit: { field: "saleValue", type: "number" }, text: c => leadValueLabel(c) },
  { key: "next", label: "Próximo passo", width: 200, edit: { field: "nextAction", type: "text", max: 140 }, text: c => c.nextAction || "" },
  { key: "note", label: "Nota", width: 200, edit: { field: "shortNote", type: "text", max: 280 }, text: c => c.shortNote || "" },
  { key: "owner", label: "Responsável", width: 150, text: c => c.owner?.name || "" },
  { key: "date", label: "Data", width: 110, mono: true, edit: { field: "returnAt", type: "date" }, text: c => fmtWhen(c.block === "closed" ? c.closedAt : c.returnAt) },
  { key: "email", label: "E-mail", width: 200, edit: { field: "email", type: "email" }, text: c => c.email || "" },
  { key: "address", label: "Endereço", width: 220, edit: { field: "address", type: "text", max: 280 }, text: c => c.address || "" },
  { key: "cnpj", label: "CNPJ", width: 150, mono: true, text: c => c.cnpj || "" },
  { key: "razao", label: "Razão social", width: 200, text: c => c.razaoSocial || "" },
  { key: "score", label: "Score", width: 70, mono: true, text: c => (c.opportunityScore != null ? String(c.opportunityScore) : "") },
  { key: "temp", label: "Temperatura", width: 110, text: c => c.leadTemperature || "" },
  { key: "attempts", label: "Contatos", width: 80, mono: true, text: c => String(c.attemptCount ?? 0) },
  { key: "source", label: "Origem", width: 130, text: c => c.primarySource || c.sourceType || "" },
  { key: "created", label: "Criado em", width: 110, mono: true, text: c => (c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "") },
];
const GRID_DEFAULT_KEYS = ["name", "phone", "city", "state", "segment", "stage", "agenda", "engage", "value", "next", "owner", "date"];
const GRID_COLS_STORAGE = "hbx:vendas-grid-cols";
const GRID_SORT_STORAGE = "hbx:vendas-grid-sort";

// Termômetro visual (1–5 estrelas) — nota derivada + tooltip do porquê. Só
// classes/tokens centrais (Lei nº4): a cor nasce do .vnd-therm em screens.css.
function Termometro({ score, why }: { score: number; why: string }) {
  return (
    <span className="vnd-therm" data-score={score} title={`Termômetro ${score}/5 — ${why}`} aria-label={`Termômetro ${score} de 5: ${why}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={"vnd-therm__pip" + (i <= score ? " is-on" : "")} aria-hidden="true" />
      ))}
    </span>
  );
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
  const segPill = useGlassPill<HTMLButtonElement>(modo);
  const [buscarMounted, setBuscarMounted] = useState(false);
  // 3 números do Radar pro topo da casca ÚNICA (vêm do LeadsClient via callback) —
  // o topo é o mesmo nos 2 modos; só os DADOS trocam. 29/06.
  const [buscarStats, setBuscarStats] = useState<{ totalBrasil: number | null; disponiveis: number | null; cotaLabel: string; cotaValue: string; cotaPct: number }>(
    { totalBrasil: null, disponiveis: null, cotaLabel: "Cota do mês", cotaValue: "—", cotaPct: 0 });
  const [board, setBoard] = useState<BoardResponse>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Filtro de vendedor (admin): null = todas as equipes; id = carteira de UM
  // vendedor (inclui "Eu" quando o admin prospecta). Refaz o board ao mudar.
  // PERSISTE em localStorage → sobrevive reload/navegação. Initializer lazy com
  // guarda de window (SSR devolve null; o dropdown só monta depois do board, então
  // não há mismatch de hidratação) — sem double-fetch na montagem.
  const [teamFilter, setTeamFilter] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try { return Number(localStorage.getItem(TEAM_FILTER_KEY) || 0) || null; } catch { return null; }
  });
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const applyTeamFilter = useCallback((id: number | null) => {
    setTeamFilter(id);
    try {
      if (id) localStorage.setItem(TEAM_FILTER_KEY, String(id));
      else localStorage.removeItem(TEAM_FILTER_KEY);
    } catch { /* sem storage */ }
  }, []);
  const [sel, setSel] = useState<VendasLead | null>(null);
  // LEAD-COCKPIT (PR11072026): overlay grande com o detalhe avançado do card.
  // Abre por duplo-clique (lista/quadro) ou pelo botão expandir (⤢) do Detalhes.
  const [cockpitOpen, setCockpitOpen] = useState(false);
  // Quantos leads estão esperando no pool do Radar agora (pra deixar CLARO,
  // no funil vazio, por que está vazio e o que fazer). Conta real da vitrine.
  const [poolDisponivel, setPoolDisponivel] = useState<number | null>(null);
  // (item 5) standing-order/"Automático" removido — sem estado de auto-feed aqui.
  // Status do bot para a empresa (F5): bot-módulo habilitado + chave-mestra armada.
  // Carregado uma vez na montagem; null = ainda consultando.
  const [botStatus, setBotStatus] = useState<BotStatus>(null);
  const [masterNotified, setMasterNotified] = useState(false);
  const [retornoMode, setRetornoMode] = useState<RetornoMode>('manual');
  // visão do pipeline: lista densa (padrão — varredura) × quadro kanban
  // (arrastar entre etapas). Ordem do dono 13/06: lista padrão + quadro opcional.
  const [view, setView] = useTabParam<"list" | "board">("view", "list", ["list", "board"]);
  // ── Grade (planilha): colunas do usuário, ordenação por coluna, edição inline.
  // Colunas e ordenação vivem em localStorage (por navegador/usuário logado).
  const [gridKeys, setGridKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return GRID_DEFAULT_KEYS;
    try {
      const raw = JSON.parse(localStorage.getItem(GRID_COLS_STORAGE) || "null");
      if (Array.isArray(raw) && raw.length) {
        const valid = raw.filter((k: unknown) => GRID_COLUMNS.some(c => c.key === k)) as string[];
        if (valid.length) return valid;
      }
    } catch { /* sem storage */ }
    return GRID_DEFAULT_KEYS;
  });
  const [gridSort, setGridSort] = useState<{ key: string; dir: 1 | -1 } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = JSON.parse(localStorage.getItem(GRID_SORT_STORAGE) || "null");
      if (raw && typeof raw.key === "string" && GRID_COLUMNS.some(c => c.key === raw.key)) {
        return { key: raw.key, dir: raw.dir === -1 ? -1 : 1 };
      }
    } catch { /* sem storage */ }
    return null;
  });
  const [colsOpen, setColsOpen] = useState(false);
  // Modo edição: com ele LIGADO a grade vira planilha e o clique na célula edita
  // em vez de abrir o cockpit (a bridge de 1 clique respeita data-cockpit-ignore).
  const [editMode, setEditMode] = useState(false);
  const [editCell, setEditCell] = useState<{ id: string; key: string } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [cellMsg, setCellMsg] = useState<string | null>(null);
  // Menu da linha (botão ⋯ ou clique-direito): as ações que antes só existiam
  // no painel morto — Fechar venda, Retorno, Sem interesse, WhatsApp, Excluir.
  const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const applyGridKeys = useCallback((keys: string[]) => {
    setGridKeys(keys);
    try { localStorage.setItem(GRID_COLS_STORAGE, JSON.stringify(keys)); } catch { /* sem storage */ }
  }, []);
  const applyGridSort = useCallback((next: { key: string; dir: 1 | -1 } | null) => {
    setGridSort(next);
    try {
      if (next) localStorage.setItem(GRID_SORT_STORAGE, JSON.stringify(next));
      else localStorage.removeItem(GRID_SORT_STORAGE);
    } catch { /* sem storage */ }
  }, []);

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

  // Foco vindo da Agenda ("Abrir card"): guarda o leadId a focar assim que o
  // board tiver esse card (consumo único). boardRef espelha `board` de forma
  // síncrona — só serve pra decidir, no efeito de leitura do sessionStorage
  // abaixo, se o board já tinha chegado antes daquele rAF rodar.
  const focusLeadRef = useRef<string | null>(null);
  const boardRef = useRef<BoardResponse>(null);

  const loadBoard = useCallback(() => {
    const qs = teamFilter ? `?sellerId=${teamFilter}` : "";
    return apiFetch<BoardResponse>(`/vendas/board${qs}`)
      .then(res => {
        setBoard(res);
        boardRef.current = res;
        setLoadError(null);
        // Auto-cura: filtro persistido que o backend rejeitou (vendedor desativado/
        // removido → selectedSellerId volta null) é limpo p/ não ficar fantasma.
        if (res?.team && teamFilter && res.team.selectedSellerId == null) applyTeamFilter(null);
        const todos = BLOCK_ORDER.map(b => res?.blocks?.[b.key] || []).flat();
        // Foco da Agenda tem prioridade sobre a seleção anterior — consumo único:
        // só limpa o ref quando o card é encontrado; se não existir no board
        // (ex.: fora do filtro de vendedor), ignora silencioso e mantém o
        // comportamento atual (preserva seleção ou cai no 1º card).
        const focusId = focusLeadRef.current;
        const focusCard = focusId ? todos.find(c => c.id === focusId) : null;
        if (focusCard) focusLeadRef.current = null;
        // mantém a seleção, mas sempre com a versão FRESCA do card
        setSel(prev => focusCard || (prev && todos.find(c => c.id === prev.id)) || todos[0] || null);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar o board de Vendas.");
      });
  }, [teamFilter, applyTeamFilter]);

  const refreshBoardLead = useCallback(async (radarLeadId: string) => {
    const current = BLOCK_ORDER
      .flatMap(({ key }) => boardRef.current?.blocks?.[key] || [])
      .find(card => card.radarLeadId === radarLeadId);
    if (!current) return;

    try {
      const response = await apiFetch<{ lead?: VendasLead }>(`/vendas/lead/${encodeURIComponent(current.id)}/card`);
      if (!response?.lead) return;
      const updated = response.lead;
      setBoard(previous => {
        const next = replaceBoardLead(previous, updated);
        boardRef.current = next;
        return next;
      });
      setSel(previous => previous?.id === updated.id ? updated : previous);
    } catch {
      await loadBoard();
    }
  }, [loadBoard]);

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

  // Foco vindo da Agenda ("Abrir card"): mesmo padrão sessionStorage+rAF do modo
  // buscar acima. O consumo pode acontecer aqui (se o board já tiver carregado
  // antes deste rAF rodar) ou dentro do loadBoard (se o fetch ainda não tinha
  // resolvido) — não assume qual chega primeiro.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const leadId = sessionStorage.getItem("hbx:vendas-focus-lead");
        if (!leadId) return;
        sessionStorage.removeItem("hbx:vendas-focus-lead");
        const atual = boardRef.current;
        if (atual) {
          const todos = BLOCK_ORDER.map(b => atual.blocks?.[b.key] || []).flat();
          const card = todos.find(c => c.id === leadId);
          if (card) { setSel(card); return; }
        }
        // board ainda não carregou (ou o card não estava lá) — guarda pro
        // loadBoard aplicar assim que o fetch resolver.
        focusLeadRef.current = leadId;
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
      setExcluirMotivoOpen(null);
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
  function abrirWhatsAppExterno(phone: string | null | undefined, text?: string) {
    const link = buildWaLink(phone, { text });
    if (link) window.open(link, "_blank", "noopener");
  }

  // Atalho explícito para o Atendimento. Em Vendas, consulta primeiro o vínculo
  // canônico (leitura sem efeito colateral) e só cria/vincula se ainda não existir.
  async function abrirWhatsAppInterno(lead: Pick<VendasLead, "id" | "phone" | "conversation">) {
    if (!lead.phone || waStartBusy) return;
    setWaStartBusy(true);
    setWaStartError(null);
    try {
      const path = `/vendas/lead/${encodeURIComponent(lead.id)}/conversation`;
      let conversationId = lead.conversation?.id ? String(lead.conversation.id) : null;
      if (!conversationId) {
        const found = await apiFetch<{ conversation?: VendasConversationRef | null; id?: string | number | null }>(path);
        conversationId = found?.conversation?.id != null
          ? String(found.conversation.id)
          : found?.id != null ? String(found.id) : null;
      }
      if (!conversationId) {
        const created = await apiFetch<{ conversation?: VendasConversationRef | null; id?: string | number | null }>(path, {
          method: "POST",
          body: JSON.stringify({}),
        });
        conversationId = created?.conversation?.id != null
          ? String(created.conversation.id)
          : created?.id != null ? String(created.id) : null;
        void loadBoard();
      }
      if (conversationId) {
        // Handoff via sessionStorage — o atendimento lê ao montar e seleciona a conversa.
        try { sessionStorage.setItem("hbx:abrir-conversa", conversationId); } catch { /* sem storage */ }
        router.push("/atendimento");
      } else {
        throw new Error("Não foi possível abrir a conversa.");
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
          ? "Prospecção automática requer o módulo Bot IA liberado."
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

  function matchSearch(card: VendasLead): boolean {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [card.name, card.phone, card.email, card.segment, card.city, card.state, card.nextAction, card.shortNote]
      .some(v => v?.toLowerCase().includes(q));
  }

  // Ordenação da grade: numérica quando a coluna é numérica, senão alfabética
  // pt-BR. Vazio vai sempre pro fim, nas duas direções (linha sem dado não
  // rouba o topo da tela).
  function sortLeads(list: VendasLead[], sort: { key: string; dir: 1 | -1 } | null): VendasLead[] {
    if (!sort) return list;
    const col = GRID_COLUMNS.find(c => c.key === sort.key);
    if (!col) return list;
    const num = (v: string) => {
      const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    return [...list].sort((a, b) => {
      const va = col.text(a).trim();
      const vb = col.text(b).trim();
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      const na = num(va);
      const nb = num(vb);
      if (na != null && nb != null && na !== nb) return (na - nb) * sort.dir;
      return va.localeCompare(vb, "pt-BR", { sensitivity: "base" }) * sort.dir;
    });
  }

  const flatLeads: VendasLead[] = (() => {
    if (!board) return [];
    const list = BLOCK_ORDER.flatMap(({ key }) => (board.blocks?.[key] || []).filter(matchSearch));
    return sortLeads(list, gridSort);
  })();

  // O status pertence ao Radar. O id comercial de Vendas nunca é usado como radarLeadId.
  const aiStatusMap = useRadarAiStatusPoll(flatLeads.map(card => card.radarLeadId || ""), {
    onTerminal: (radarLeadId) => { void refreshBoardLead(radarLeadId); },
  });

  // Colunas efetivamente visíveis: respeita a ordem escolhida pelo usuário e o
  // gate de valores (LEI DO VENDEDOR — sem canViewValues a coluna nem existe).
  const gridCols: GridColumn[] = gridKeys
    .map(k => GRID_COLUMNS.find(c => c.key === k))
    .filter((c): c is GridColumn => Boolean(c) && (c!.gate !== "values" || Boolean(board?.canViewValues)));

  function toggleGridCol(key: string) {
    applyGridKeys(gridKeys.includes(key) ? gridKeys.filter(k => k !== key) : [...gridKeys, key]);
  }
  function moveGridCol(key: string, delta: -1 | 1) {
    const i = gridKeys.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= gridKeys.length) return;
    const next = [...gridKeys];
    [next[i], next[j]] = [next[j], next[i]];
    applyGridKeys(next);
  }
  function resetGrid() {
    applyGridKeys(GRID_DEFAULT_KEYS);
    applyGridSort(null);
    setColsOpen(false);
  }
  function toggleGridSort(key: string) {
    applyGridSort(gridSort?.key === key ? (gridSort.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 });
  }

  // Valor que entra no input ao abrir a célula: data vira YYYY-MM-DD (input
  // date) e valor vira número puro — o resto é o texto cru do campo.
  function draftFor(card: VendasLead, col: GridColumn): string {
    const ed = col.edit;
    if (!ed) return "";
    if (ed.field === "returnAt") {
      const iso = card.block === "closed" ? card.closedAt : card.returnAt;
      return iso ? new Date(iso).toISOString().slice(0, 10) : "";
    }
    if (ed.field === "saleValue") return card.saleValue != null ? String(card.saleValue) : "";
    if (ed.field === "status") return normalizeStage(card.status);
    const raw = (card as unknown as Record<string, unknown>)[ed.field];
    return raw == null ? "" : String(raw);
  }

  function abrirCelula(card: VendasLead, col: GridColumn) {
    if (!col.edit || card.block === "closed") return;
    setCellMsg(null);
    setSel(card);
    setEditDraft(draftFor(card, col));
    setEditCell({ id: card.id, key: col.key });
  }

  // Salva UMA célula: otimista no board local + PATCH; erro devolve o board
  // anterior (rollback) e mostra o motivo. Sem undo multi-célula — v1 é isso.
  async function salvarCelula(card: VendasLead, col: GridColumn, raw: string) {
    const ed = col.edit;
    if (!ed) return;
    const antes = boardRef.current;
    const valor = raw.trim();
    const body: Record<string, unknown> = {};
    const local: Partial<VendasLead> = {};

    if (ed.field === "returnAt") {
      if (!valor) { setEditCell(null); return; }
      const iso = new Date(`${valor}T09:00:00`).toISOString();
      body.returnAt = iso;
      local.returnAt = iso;
    } else if (ed.field === "saleValue") {
      const n = Number(valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) { setCellMsg("Valor inválido."); return; }
      body.saleValue = n;
      local.saleValue = n;
    } else if (ed.field === "status") {
      const stage = normalizeStage(valor);
      if (stage === normalizeStage(card.status)) { setEditCell(null); return; }
      body.status = stage;
      local.status = stage;
      local.statusLabel = STAGE_LABEL[stage];
    } else {
      const atual = String((card as unknown as Record<string, unknown>)[ed.field] ?? "");
      if (valor === atual.trim()) { setEditCell(null); return; }
      if (ed.max && valor.length > ed.max) { setCellMsg(`Máximo de ${ed.max} caracteres.`); return; }
      body[ed.field] = valor;
      (local as Record<string, unknown>)[ed.field] = valor || null;
    }

    setEditCell(null);
    setBoard(prev => {
      const next = patchCardFields(prev, card.id, local);
      boardRef.current = next;
      return next;
    });
    setSel(prev => (prev?.id === card.id ? { ...prev, ...local } : prev));
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(card.id)}`, { method: "PATCH", body: JSON.stringify(body) });
      await loadBoard();
    } catch (err) {
      setBoard(antes);
      boardRef.current = antes;
      setCellMsg(err instanceof Error ? err.message : "Não foi possível salvar a célula.");
    }
  }

  // Tab dentro da grade: salva e pula pra próxima coluna editável da MESMA linha.
  function proximaEditavel(col: GridColumn, delta: -1 | 1): GridColumn | null {
    const editaveis = gridCols.filter(c => c.edit);
    const i = editaveis.findIndex(c => c.key === col.key);
    return editaveis[i + delta] ?? null;
  }

  // "Selecionar todos" opera sobre a lista visível (já filtrada/ordenada).
  const todosSelecionados = flatLeads.length > 0 && flatLeads.every(c => selecionados.has(c.id));
  function toggleTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set(flatLeads.map(c => c.id)));
  }

  // Navega com ↑/↓ entre leads igual Excel — só na lista desktop
  useEffect(() => {
    if (view !== "list") return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (fecharOpen || novoOpen || prospOpen || agendaOpen || retornoOpen || semInteresseOpen || cockpitOpen) return;
      e.preventDefault();
      const q = searchQuery.toLowerCase();
      const list = sortLeads(BLOCK_ORDER.flatMap(({ key }) => (board?.blocks?.[key] || []).filter(card =>
        !searchQuery || [card.name, card.phone, card.email, card.segment, card.city, card.state, card.nextAction, card.shortNote].some(v => v?.toLowerCase().includes(q))
      )), gridSort);
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
  }, [view, board, searchQuery, gridSort, sel, fecharOpen, novoOpen, prospOpen, agendaOpen, retornoOpen, semInteresseOpen, cockpitOpen]);

  const summary = board?.summary;

  // Modos acoplados — vivem no topo persistente da casca ÚNICA,
  // à esquerda dos 3 cards. Ficam fixos enquanto as camadas crossfadeiam por baixo.
  // Ativo destacado (preenchido).
  const segToggle = (
    <div className="vnd-segbtns glass-pill-track" role="tablist" aria-label="Modo da tela">
      <GlassPill {...segPill} />
      <button ref={segPill.itemRef("funil")} id="vendas-tab-funil" type="button" role="tab" aria-selected={modo === "funil"} aria-controls="vendas-panel-funil"
        className={"vnd-segbtn glass-pill-item" + (modo === "funil" ? " is-on" : "")} onClick={irFunil}>
        <I d={ICONS.vendas} size={16} /> <span>Meu funil</span>
      </button>
      {podeBuscarLeads && (
        <button ref={segPill.itemRef("buscar")} id="vendas-tab-buscar" type="button" role="tab" aria-selected={modo === "buscar"} aria-controls="vendas-panel-buscar" data-tut="vendas-buscar"
          className={"vnd-segbtn glass-pill-item" + (modo === "buscar" ? " is-on" : "")} onClick={irBuscar}>
          <I d={ICONS.scrape} size={16} /> <span>Buscar empresas</span>
        </button>
      )}
    </div>
  );

  return (
    <React.Fragment>
        <div className="vnd-modehost" data-mode={modo} data-fx={EFFECTS_ON ? "on" : "off"}>

          {/* TOPO — UMA casca: toggle + cards. Os NÚMEROS trocam por modo
              (funil ↔ Radar ↔ status) em crossfade no MESMO lugar. */}
          <div className="vnd-funhead">
            {segToggle}
            <div className="vnd-stats">
              <div className={"vnd-stats__layer" + (modo === "funil" ? " is-on" : "")} aria-hidden={modo !== "funil"}>
                <KpiRow items={[
                  // board.team só vem preenchido pra quem gerencia o time (canManageTeam,
                  // ver tipo BoardResponse acima) — pra esse perfil o summary é o AGREGADO
                  // da empresa (todos os vendedores), nunca "meu funil" (VENDAS-REFAB 04/07).
                  { icon: "users", label: board?.team ? "Cards no funil (empresa)" : "Cards no funil", value: summary ? String(summary.total) : "—", delta: "—" },
                  { icon: "doc", label: "Atrasados", value: summary ? String(summary.overdue) : "—", delta: "—", down: Boolean(summary && summary.overdue > 0) },
                  { icon: "check", label: "Fechados", value: summary ? String(summary.closed) : "—", delta: "—" },
                ]} />
              </div>
              <div className={"vnd-stats__layer" + (modo === "buscar" ? " is-on" : "")} aria-hidden={modo !== "buscar"}>
                {/* Cards puxados (mês) foi removido: o indicador não representa
                    mais uma regra operacional válida. */}
                <KpiRow items={[
                  { icon: "scrape", label: "Total no Brasil", value: buscarStats.totalBrasil != null ? buscarStats.totalBrasil.toLocaleString("pt-BR") : "—", delta: "—" },
                  { icon: "users", label: "Disponíveis", value: buscarStats.disponiveis != null ? buscarStats.disponiveis.toLocaleString("pt-BR") : "—", delta: "—" },
                ]} />
              </div>
            </div>
            {/* 4º botão — a faixa "Buscando empresas" virou card destacado (persistente
                nos 2 modos). Mora na barra (limitada à esquerda) → não invade o card. */}
            {board?.radarSupply && (
              <RadarSupplyCard supply={board.radarSupply} onLiberar={() => { irFunil(); setView("list"); }} />
            )}
          </div>

          {/* STAGE — camadas SOBREPOSTAS em crossfade (uma casca só). */}
          <div className="vnd-stage">
            <div id="vendas-panel-funil" role="tabpanel" aria-labelledby="vendas-tab-funil"
              className={"vnd-layer" + (modo === "funil" ? " is-on" : "")} aria-hidden={modo !== "funil"}>
                <div className="content">
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
                  {view === "list" && (
                    <React.Fragment>
                      <button className={"btn-ghost" + (editMode ? " on" : "")} onClick={() => { setEditMode(m => !m); setEditCell(null); setCellMsg(null); }}
                        title={editMode ? "Sair do modo edição (volta a abrir os detalhes no clique)" : "Editar as células como planilha"}
                        aria-pressed={editMode}>
                        <I d={ICONS.edit} size={14} /> {editMode ? "Editando" : "Editar"}
                      </button>
                      <div className="vnd-colspick">
                        <button type="button" className="btn-ghost" aria-haspopup="menu" aria-expanded={colsOpen}
                          onClick={() => setColsOpen(o => !o)} title="Escolher colunas">
                          Colunas ▾
                        </button>
                        {colsOpen && (
                          <React.Fragment>
                            <button type="button" className="vnd-team-veil" aria-label="Fechar" onClick={() => setColsOpen(false)} />
                            <div className="vnd-colspick__menu" role="menu">
                              <div className="vnd-colspick__head">
                                <strong>Colunas da planilha</strong>
                                <button type="button" className="btn-ghost btn-xs" onClick={resetGrid}>Reiniciar layout</button>
                              </div>
                              <div className="vnd-colspick__list">
                                {gridKeys.map((key, i) => {
                                  const col = GRID_COLUMNS.find(c => c.key === key);
                                  if (!col) return null;
                                  if (col.gate === "values" && !board?.canViewValues) return null;
                                  return (
                                    <div key={key} className="vnd-colspick__item is-on">
                                      <label>
                                        <input type="checkbox" checked onChange={() => toggleGridCol(key)} />
                                        {col.label}
                                      </label>
                                      <span className="vnd-colspick__ord">
                                        <button type="button" onClick={() => moveGridCol(key, -1)} disabled={i === 0} aria-label="Mover para a esquerda">↑</button>
                                        <button type="button" onClick={() => moveGridCol(key, 1)} disabled={i === gridKeys.length - 1} aria-label="Mover para a direita">↓</button>
                                      </span>
                                    </div>
                                  );
                                })}
                                {GRID_COLUMNS.filter(c => !gridKeys.includes(c.key) && (c.gate !== "values" || board?.canViewValues)).map(col => (
                                  <div key={col.key} className="vnd-colspick__item">
                                    <label>
                                      <input type="checkbox" checked={false} onChange={() => toggleGridCol(col.key)} />
                                      {col.label}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </React.Fragment>
                        )}
                      </div>
                    </React.Fragment>
                  )}
                  <button className="icon-ghost" title="Automações comerciais" aria-label="Automações comerciais" data-tut="vendas-prosp" onClick={() => setProspOpen(true)}>
                    <I d={ICONS.bot} size={16} />
                  </button>
                  <button className="icon-ghost" title="Agenda de retornos" aria-label="Agenda de retornos" data-tut="vendas-agenda" onClick={() => setAgendaOpen(o => !o)}>
                    <I d={ICONS.clock} size={16} />
                  </button>
                  {board?.team && (() => {
                    const team = board.team;
                    const selSeller = teamFilter ? team.sellers.find(x => x.id === teamFilter) : null;
                    const label = !teamFilter ? "Todas as equipes" : selSeller ? (selSeller.isMe ? "Eu" : selSeller.name) : "Todas as equipes";
                    return (
                      <div className="vnd-team">
                        <button type="button" className="btn-ghost" aria-haspopup="menu" aria-expanded={teamMenuOpen}
                          onClick={() => setTeamMenuOpen(o => !o)}>
                          {label} ▾
                        </button>
                        {teamMenuOpen && (
                          <React.Fragment>
                            <button type="button" className="vnd-team-veil" aria-label="Fechar" onClick={() => setTeamMenuOpen(false)} />
                            <div className="vnd-team-menu" role="menu">
                              <button type="button" role="menuitem" className={"vnd-team-item" + (!teamFilter ? " on" : "")}
                                onClick={() => { applyTeamFilter(null); setTeamMenuOpen(false); }}>
                                Todas as equipes
                              </button>
                              {team.sellers.map(s => (
                                <button key={s.id} type="button" role="menuitem"
                                  className={"vnd-team-item" + (teamFilter === s.id ? " on" : "")}
                                  onClick={() => { applyTeamFilter(s.id); setTeamMenuOpen(false); }}>
                                  {s.isMe ? "Eu (prospectar)" : s.name}
                                </button>
                              ))}
                            </div>
                          </React.Fragment>
                        )}
                      </div>
                    );
                  })()}
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
                      {/* Item 5: botão "@ Automático" (standing-order auto-feed) REMOVIDO
                          — só puxar manual. */}
                      <button className="btn-teal" onClick={() => router.push("/leads")}>Puxar leads →</button>
                      <button className="btn-ghost" onClick={() => router.push("/leads")}>Ver o Radar</button>
                    </div>
                  </div>
                </div>
              )}
              {/* GRADE (planilha): 1 linha por lead, 1 dado por coluna. Clique
                  simples abre o cockpit em tela cheia (VendasFullscreenBridge);
                  no modo Editar a grade ganha data-cockpit-ignore e o clique
                  passa a editar a célula. */}
              {view === "list" && board && (summary?.total ?? 0) > 0 && (
                <div className="vnd-grid-wrap" data-cockpit-ignore={editMode ? "" : undefined}>
                  {(selecionados.size > 0 || bulkMsg || cellMsg) && (
                    <div className="vnd-grid-bar">
                      {selecionados.size > 0 && (
                        <React.Fragment>
                          <span className="sub2">{selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}</span>
                          <button className="btn-ghost danger btn-xs" onClick={() => { setBulkMsg(null); setExcluirMotivoOpen("bulk"); }} disabled={bulkDeleteBusy}>
                            <I d={ICONS.trash} size={13} /> {bulkDeleteBusy ? "Excluindo…" : "Excluir selecionados"}
                          </button>
                        </React.Fragment>
                      )}
                      {bulkMsg && <span className={"ctx-msg " + (bulkMsg.startsWith("✓") ? "ok" : "err")}>{bulkMsg}</span>}
                      {cellMsg && <span className="ctx-msg err">{cellMsg}</span>}
                    </div>
                  )}
                  <div className="tbl-wrap">
                  <table className="tbl vnd-grid" data-tut="vendas-funil" data-edit={editMode ? "on" : "off"}>
                    <thead>
                      <tr>
                        <th className="vnd-grid__chk">
                          <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos}
                            aria-label={todosSelecionados ? "Desmarcar todos" : "Selecionar todos"} />
                        </th>
                        {gridCols.map(col => (
                          <th key={col.key} className="vnd-grid__th" onClick={() => toggleGridSort(col.key)}
                            title={`Ordenar por ${col.label}`} aria-sort={gridSort?.key === col.key ? (gridSort.dir === 1 ? "ascending" : "descending") : "none"}>
                            {col.label}
                            {gridSort?.key === col.key && <span className="vnd-grid__sort">{gridSort.dir === 1 ? "▲" : "▼"}</span>}
                          </th>
                        ))}
                        <th className="vnd-grid__acts" aria-label="Ações" />
                      </tr>
                    </thead>
                    <tbody>
                      {flatLeads.map(card => {
                        const engagement = vendasEngagementMeta(card.engagement, card.conversation);
                        const ag = agendaInfo(card);
                        const locked = card.block === "closed";
                        return (
                          <tr key={card.id} id={`vnd-row-${card.id}`} className={sel?.id === card.id ? "sel" : ""}
                            onClick={() => setSel(card)}
                            onDoubleClick={() => { if (!editMode) { setSel(card); setCockpitOpen(true); } }}
                            onContextMenu={e => { e.preventDefault(); setSel(card); setRowMenu({ id: card.id, x: e.clientX, y: e.clientY }); }}>
                            <td className="vnd-grid__chk" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selecionados.has(card.id)} onChange={() => toggleSelecionado(card.id)}
                                aria-label={`Selecionar ${card.name || "card"}`} />
                            </td>
                            {gridCols.map(col => {
                              const editando = editCell?.id === card.id && editCell.key === col.key;
                              const editavel = Boolean(col.edit) && !locked;
                              const texto = col.text(card);
                              if (editando && col.edit) {
                                const fechar = () => setEditCell(null);
                                const teclas = (e: React.KeyboardEvent) => {
                                  if (e.key === "Escape") { e.preventDefault(); fechar(); }
                                  else if (e.key === "Enter") { e.preventDefault(); void salvarCelula(card, col, editDraft); }
                                  else if (e.key === "Tab") {
                                    e.preventDefault();
                                    const prox = proximaEditavel(col, e.shiftKey ? -1 : 1);
                                    void salvarCelula(card, col, editDraft).then(() => { if (prox) abrirCelula(card, prox); });
                                  }
                                };
                                return (
                                  <td key={col.key} className="vnd-grid__td is-editing" onClick={e => e.stopPropagation()}>
                                    {col.edit.type === "select" ? (
                                      <select className="vnd-grid__input" autoFocus value={editDraft}
                                        onChange={e => { setEditDraft(e.target.value); void salvarCelula(card, col, e.target.value); }}
                                        onKeyDown={teclas} onBlur={fechar} aria-label={col.label}>
                                        {STAGE_ORDER.map(s => <option key={s.key} value={s.key}>{STAGE_LABEL[s.key]}</option>)}
                                      </select>
                                    ) : (
                                      <input className="vnd-grid__input" autoFocus
                                        type={col.edit.type === "number" ? "number" : col.edit.type === "date" ? "date" : col.edit.type === "email" ? "email" : "text"}
                                        maxLength={col.edit.max} value={editDraft}
                                        onChange={e => setEditDraft(e.target.value)}
                                        onKeyDown={teclas}
                                        onBlur={() => void salvarCelula(card, col, editDraft)}
                                        aria-label={col.label} />
                                    )}
                                  </td>
                                );
                              }
                              return (
                                <td key={col.key}
                                  className={"vnd-grid__td" + (col.mono ? " hbx-mono" : "") + (editavel ? " is-editable" : "") + (editMode && editavel ? " is-armed" : "")}
                                  title={texto || undefined}
                                  onClick={editMode && editavel ? (e => { e.stopPropagation(); abrirCelula(card, col); }) : undefined}>
                                  {col.key === "name" ? (
                                    <span className="vnd-grid__name">
                                      <span className="vnd-grid__txt">{texto || "—"}</span>
                                      <RadarAiBadge status={aiStatusMap[card.radarLeadId || ""]} />
                                      {card.saleConfirmedAt && <span className="badge-win">Ganho</span>}
                                    </span>
                                  ) : col.key === "agenda" ? (
                                    <span className={"tag" + (card.block === "overdue" ? " warn" : card.block === "closed" ? " teal" : "")}>{ag.label}</span>
                                  ) : col.key === "engage" ? (
                                    <span className={engagement.className}>{engagement.label}</span>
                                  ) : col.key === "stage" ? (
                                    <React.Fragment>
                                      <span className="tag">{texto}</span>
                                      {card.automation && <span className="tag warn vnd-grid__gap" title={`Passo ${card.automation.currentStep + 1}`}>{card.automation.label}</span>}
                                    </React.Fragment>
                                  ) : col.key === "owner" && card.owner?.name ? (
                                    <span className="vnd-grid__owner"><Av name={card.owner.name} size={18} />{card.owner.name}</span>
                                  ) : (
                                    <span className="vnd-grid__txt">{texto || "—"}</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="vnd-grid__acts" onClick={e => e.stopPropagation()}>
                              <button type="button" className="vnd-grid__more" aria-label="Ações do lead"
                                onClick={e => { setSel(card); setRowMenu({ id: card.id, x: e.clientX, y: e.clientY }); }}>⋯</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* QUADRO — pipeline arrastável por ETAPA (status). Desktop only.
                  Arraste um card para outra coluna: a etapa muda na hora. A cor do
                  chip carrega a urgência da agenda (atrasado/hoje). */}
              {view === "board" && board && (summary?.total ?? 0) > 0 && (() => {
                const stageCards: Record<VendasStage, VendasLead[]> = { novo: [], contato: [], retorno: [], qualificado: [], encerrado: [] };
                for (const c of flatLeads) stageCards[normalizeStage(c.status)].push(c);
                // LEI DO VENDEDOR: valores R$ (soma por coluna + valor no card) só
                // aparecem quando o backend autoriza. Vendedor comum → funil em contagem.
                const canViewValues = Boolean(board.canViewValues);
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
                          // eslint-disable-next-line react-hooks/refs -- soltarNaEtapa só roda no handler onDrop (evento real), nunca durante o render
                          onDrop={e => { e.preventDefault(); soltarNaEtapa(stage.key); }}
                        >
                          <header className="vnd-pipe-col__head">
                            <span className="vnd-pipe-col__dot" aria-hidden="true" />
                            <span className="vnd-pipe-col__titles">
                              <strong className="vnd-pipe-col__name">{stage.label}</strong>
                              <span className="vnd-pipe-col__sub">{stage.sub}</span>
                            </span>
                            <span className="vnd-pipe-col__count">{cards.length}</span>
                            {canViewValues && sumCents > 0 && <span className="vnd-pipe-col__sum">{fmtMoney(sumCents)}</span>}
                          </header>
                          <div className="vnd-pipe-col__body">
                            {cards.length === 0 && (
                              <div className="vnd-pipe-col__empty">{isOver ? "Solte aqui" : "Arraste cards"}</div>
                            )}
                            {cards.map(card => {
                              const ag = agendaInfo(card);
                              const therm = deriveTermometro(card);
                              const engagement = vendasEngagementMeta(card.engagement, card.conversation);
                              return (
                                <article
                                  key={card.id}
                                  className={"vnd-card" + (sel?.id === card.id ? " is-sel" : "") + (dragId === card.id ? " is-dragging" : "") + (card.block === "closed" ? " is-locked" : "")}
                                  draggable={card.block !== "closed"}
                                  onDragStart={card.block !== "closed" ? (e => onCardDragStart(e, card)) : undefined}
                                  onDragEnd={onCardDragEnd}
                                  onClick={() => setSel(card)}
                                  onDoubleClick={() => { setSel(card); setCockpitOpen(true); }}
                                >
                                  <span className="vnd-card__grip" aria-hidden="true" />
                                  <div className="vnd-card__top">
                                    <strong className="vnd-card__name">{card.name || "—"}</strong>
                                    {card.saleConfirmedAt && <span className="badge-win">Ganho</span>}
                                  </div>
                                  <span className="vnd-card__sub">{card.segment || card.city || card.phone || "—"}</span>
                                  <RadarAiBadge status={aiStatusMap[card.radarLeadId || ""]} />
                                  <div className="vnd-card__row">
                                    <Termometro score={therm.score} why={therm.why} />
                                    {canViewValues && <span className="vnd-card__val">{leadValueLabel(card)}</span>}
                                    <span className={"vnd-chip vnd-chip--" + ag.tone}>{ag.label}</span>
                                  </div>
                                  <div className="vnd-card__foot">
                                    {card.owner?.name
                                      ? <span className="vnd-card__owner"><Av name={card.owner.name} size={16} />{card.owner.name}</span>
                                      : <span className="vnd-card__owner vnd-card__owner--none">Sem dono</span>}
                                    <span className={engagement.className}>{engagement.label}</span>
                                    {card.automation && <span className="tag warn" title={`Passo ${card.automation.currentStep + 1}`}>{card.automation.label}</span>}
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

                </div>{/* /content (Meu funil) */}
            </div>{/* /vnd-layer funil */}

            <div id="vendas-panel-buscar" role="tabpanel" aria-labelledby="vendas-tab-buscar"
              className={"vnd-layer vnd-layer--buscar" + (modo === "buscar" ? " is-on" : "")} aria-hidden={modo !== "buscar"}>
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

      {/* Menu da linha (⋯ ou clique-direito). Guarda as ações que antes só
          existiam no painel lateral desligado — sem ele, "Fechar venda",
          Retorno, Sem interesse e excluir card ficavam inalcançáveis na lista. */}
      {rowMenu && (() => {
        const card = flatLeads.find(c => c.id === rowMenu.id);
        if (!card) return null;
        const fechar = () => setRowMenu(null);
        return (
          <React.Fragment>
            <button type="button" className="vnd-team-veil" aria-label="Fechar" onClick={fechar} />
            <div className="vnd-rowmenu" role="menu" style={{ left: rowMenu.x, top: rowMenu.y }}>
              <span className="vnd-rowmenu__title">{card.name || "Lead"}</span>
              <button type="button" role="menuitem" onClick={() => { fechar(); setSel(card); setCockpitOpen(true); }}>
                Abrir detalhes
              </button>
              <button type="button" role="menuitem" disabled={card.block === "closed"}
                onClick={() => { fechar(); setSel(card); abrirFechar(); }}>
                <I d={ICONS.money} size={13} /> Fechar venda
              </button>
              <button type="button" role="menuitem" disabled={card.block === "closed"}
                onClick={() => { fechar(); setSel(card); setRetornoData(""); setObs(""); setAcaoMsg(null); setRetornoOpen(true); }}>
                <I d={ICONS.clock} size={13} /> Agendar retorno
              </button>
              <button type="button" role="menuitem" disabled={card.block === "closed"}
                onClick={() => { fechar(); setSel(card); setSemInteresseMotivo(""); setAcaoMsg(null); setSemInteresseOpen(true); }}>
                Sem interesse
              </button>
              {card.phone && (
                <button type="button" role="menuitem"
                  onClick={() => { fechar(); abrirWhatsAppExterno(card.phone, buildWaMessage({ name: card.name, segment: card.segment, city: card.city })); }}>
                  <WhatsAppMark size={13} /> WhatsApp {waQrActive ? "(externo)" : ""}
                </button>
              )}
              {card.phone && canAtendimento && (
                <button type="button" role="menuitem" disabled={waStartBusy}
                  onClick={() => { fechar(); void abrirWhatsAppInterno(card); }}>
                  {waStartBusy ? "Abrindo…" : "Abrir no Atendimento"}
                </button>
              )}
              <button type="button" role="menuitem" className="danger"
                onClick={() => { fechar(); setSel(card); setAcaoMsg(null); setExcluirMotivoOpen("card"); }}>
                <I d={ICONS.trash} size={13} /> Excluir card
              </button>
              {waStartError && <span className="ctx-msg err">{waStartError}</span>}
            </div>
          </React.Fragment>
        );
      })()}

      {fecharOpen && sel && (
        <FecharVendaModal
          mode={{ kind: "lead", leadId: sel.id }}
          leadName={sel.name}
          phone={sel.phone}
          sellsHbxPlans={Boolean(board?.sellsHbxPlans)}
          onClose={() => setFecharOpen(false)}
          onDone={() => loadBoard()}
        />
      )}

      {/* LEAD-COCKPIT: detalhe avançado do card em overlay grande (3 guias).
          key por lead = estado zerado a cada card (fetches/abas não vazam). */}
      {cockpitOpen && sel && (
        <LeadCockpitModal
          key={sel.id}
          lead={sel}
          aiStatus={aiStatusMap[sel.radarLeadId || ""]}
          canViewValues={Boolean(board?.canViewValues)}
          open={cockpitOpen}
          onClose={() => setCockpitOpen(false)}
          onConversationChanged={loadBoard}
        />
      )}

      {prospOpen && (
        <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) setProspOpen(false); }}>
          <div className="hbx-drawer" style={{ width: 340, height: "100vh", overflowY: "auto", padding: "18px 16px", display: "grid", gap: 14, alignContent: "start" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "0.9rem", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Automações comerciais
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setProspOpen(false)}>✕</span>
            </h3>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="field-label">Assistente de conversa</div>
              <div className="kv">
                <div className="row">
                  <span className="k">Nome público</span>
                  <span className="v">{board?.assistant?.publicName || "Não configurada"}</span>
                </div>
                <div className="row">
                  <span className="k">WhatsApp</span>
                  <span className={"tag" + (board?.assistant?.active ? " teal" : " warn")}>
                    {board?.assistant?.active
                      ? "Ativa"
                      : !board?.assistant?.configured
                        ? "Não configurada"
                        : !board?.assistant?.published
                          ? "Rascunho"
                          : !board?.assistant?.runtimeEnabled
                            ? "Aguardando liberação"
                            : "Conecte o canal"}
                  </span>
                </div>
              </div>
              <p className="muted-note">
                Responde mensagens recebidas e não ocupa a automação comercial ativa do lead.
              </p>
              <button className="btn-ghost" onClick={() => { setProspOpen(false); router.push("/automacao?secao=atendente&cerebro=ia"); }}>
                Configurar assistente
              </button>
            </div>
            <div className="field-label">Bot de prospecção</div>
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
