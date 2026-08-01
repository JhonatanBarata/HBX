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

import { Av, I, ICONS, WhatsAppMark, isModuleVisible, useCurrentUser, useEntitlements, useMyModules } from "@/components/hbx/shell";
import {
  vendasEngagementMeta,
  type VendasConversationRef,
  type VendasEngagementSnapshot,
} from "@/components/hbx/detalhes-negocio";
import { FecharVendaModal } from "@/components/hbx/fechar-venda-modal";
import { CentralDoLead } from "@/components/hbx/central-do-lead";
import { VendasLeadPreview } from "@/components/hbx/vendas-lead-preview";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { Divisoria } from "@/components/hbx/divisoria";
import { esquecerMedida, gravarMedida, lerMedida, useArrastar } from "@/lib/arrastar";
import { RadarAiBadge } from "@/components/hbx/radar-ai-badge";
import { LeadsClient } from "../leads/page.client";
import { apiFetch } from "@/lib/api";

import { useTabParam } from "@/lib/use-tab-param";
import { useRadarAiStatusPoll } from "@/lib/radar-ai-status";
import { vendasCanais } from "@/lib/vendas-channels";
import { buildWaLink, buildWaMessage } from "@/lib/wa-link";

// Exportado: a Central do Lead recebe o card do board JÁ carregado (sem
// refetch) — `import type` (apagado no build, sem ciclo real).
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

// S7 LEAD-CENTRICO: os tipos TriagemItem/Triagem/LiveStatus e o dicionário
// PROSP_LABEL do painel de status da Prospecção automática (start/pause/
// resume/cancel + contadores) saíram daqui junto com o painel — a criação/
// retomada de campanha foi aposentada no backend (07-pool-raiz.md, item 2).

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

// S1 CORREÇÃO DO NOTURNO: disparo tem HORA — "Hoje" sozinho não serve pra dizer
// que o WhatsApp sai 09:15. Dia curto + hora, no fuso do próprio navegador.
function fmtQuandoHora(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
  return `${dia} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Monta o ISO a partir dos dois campos da tela. Devolve null quando a hora é lixo
// ("99:99") — antes isso virava `Invalid Date` e corrompia a agenda (B7).
function isoLocalDeDataHora(data: string, hora: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  const d = new Date(`${data}T${hora}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}


// ── Quadro (kanban arrastável) — etapas reais do lead (status), independente da
// agenda (block). Arrastar entre colunas faz PATCH /vendas/lead/:id {status}.
type VendasStage = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
// Subtítulo = a AÇÃO da etapa (onboarding embutido): o vendedor lê "o que fazer
// aqui" sem tour. Mapeado sobre os 5 status reais do VendasLead (nada de máquina
// de estados nova). 31/07 (dono): coluna = onde o LEAD está, nunca o que a
// ferramenta faz — nomes no padrão de funil de mercado (Sem contato→Contato
// feito→Respondeu→Ligação marcada→Fechado). Chaves/ordem/tone INTOCADOS.
const STAGE_ORDER: { key: VendasStage; label: string; sub: string; tone: string }[] = [
  { key: "novo", label: "Sem contato", sub: "Lead na fila — ainda não recebeu mensagem", tone: "new" },
  { key: "contato", label: "Contato feito", sub: "Mensagem enviada — aguardando resposta", tone: "contact" },
  { key: "retorno", label: "Respondeu", sub: "Sua vez — responda e marque a ligação", tone: "return" },
  { key: "qualificado", label: "Ligação marcada", sub: "Conversa de venda em andamento", tone: "qualified" },
  { key: "encerrado", label: "Fechado", sub: "Ganhou ou perdeu — motivo na ficha", tone: "ended" },
];
const STAGE_LABEL: Record<VendasStage, string> = {
  novo: "Sem contato", contato: "Contato feito", retorno: "Respondeu", qualificado: "Ligação marcada", encerrado: "Fechado",
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

// ── CAMPOS DA LISTA COMERCIAL ────────────────────────────────────────────────
// Catálogo único dos fatos que o usuário pode priorizar nas faixas densas.
// A lista continua sendo de leitura: quem edita o lead é a Central do Lead.
type GridColumn = {
  key: string;
  label: string;
  width: number;
  mono?: boolean;
  gate?: "values";           // só aparece com canViewValues
  nosort?: boolean;          // conteúdo vive fora do card (ex.: status da IA)
  text: (c: VendasLead) => string;   // valor cru: ordenação e busca
};

/** Limites da alça de largura. 72px ainda mostra um rótulo curto inteiro. */
const COL_MIN = 72;
const COL_MAX = 560;

const GRID_COLUMNS: GridColumn[] = [
  { key: "name", label: "Empresa", width: 220, text: c => c.name || "" },
  { key: "icons", label: "Ícones", width: 128, text: c => vendasCanais(c).join(" ") },
  { key: "status", label: "Status", width: 140, nosort: true, text: () => "" },
  { key: "phone", label: "Telefone", width: 140, mono: true, text: c => c.phone || "" },
  { key: "city", label: "Cidade", width: 130, text: c => c.city || "" },
  { key: "state", label: "UF", width: 52, text: c => c.state || "" },
  { key: "segment", label: "Segmento", width: 160, text: c => c.segment || "" },
  { key: "stage", label: "Etapa", width: 130, text: c => STAGE_LABEL[normalizeStage(c.status)] },
  { key: "agenda", label: "Agenda", width: 110, text: c => agendaInfo(c).label },
  { key: "engage", label: "Engajamento", width: 130, text: c => vendasEngagementMeta(c.engagement, c.conversation).label },
  { key: "value", label: "Valor", width: 110, mono: true, gate: "values", text: c => leadValueLabel(c) },
  { key: "next", label: "Próximo passo", width: 200, text: c => c.nextAction || "" },
  { key: "note", label: "Nota", width: 200, text: c => c.shortNote || "" },
  { key: "owner", label: "Responsável", width: 150, text: c => c.owner?.name || "" },
  { key: "date", label: "Data", width: 110, mono: true, text: c => fmtWhen(c.block === "closed" ? c.closedAt : c.returnAt) },
  { key: "email", label: "E-mail", width: 200, text: c => c.email || "" },
  { key: "address", label: "Endereço", width: 220, text: c => c.address || "" },
  { key: "cnpj", label: "CNPJ", width: 150, mono: true, text: c => c.cnpj || "" },
  { key: "razao", label: "Razão social", width: 200, text: c => c.razaoSocial || "" },
  { key: "score", label: "Score", width: 70, mono: true, text: c => (c.opportunityScore != null ? String(c.opportunityScore) : "") },
  { key: "temp", label: "Temperatura", width: 110, text: c => c.leadTemperature || "" },
  { key: "attempts", label: "Contatos", width: 80, mono: true, text: c => String(c.attemptCount ?? 0) },
  { key: "source", label: "Origem", width: 130, text: c => c.primarySource || c.sourceType || "" },
  { key: "created", label: "Criado em", width: 110, mono: true, text: c => (c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "") },
];
const GRID_DEFAULT_KEYS = ["name", "segment", "city", "stage", "score", "next", "agenda", "engage", "value", "owner", "icons", "phone", "email", "note"];
const GRID_COLS_STORAGE = "hbx:vendas-list-fields-v2";
const GRID_SORT_STORAGE = "hbx:vendas-list-sort-v2";
const GRID_COLUMN_GROUPS = [
  { label: "Dados da empresa", keys: ["name", "icons", "phone", "city", "state", "segment", "email", "address", "cnpj", "razao"] },
  { label: "Negociação", keys: ["stage", "agenda", "engage", "value", "next", "note", "owner", "date", "score", "temp", "attempts"] },
  { label: "Controle", keys: ["status", "created", "source"] },
] as const;

function compactGridText(card: VendasLead, visibleKeys: string[], allowedKeys: readonly string[]) {
  return visibleKeys
    .filter(key => allowedKeys.includes(key))
    .map(key => GRID_COLUMNS.find(column => column.key === key)?.text(card).trim() || "")
    // O travessão é o "não tem" das células; numa legenda em linha ele vira
    // ruído puro ("— · 11"). Vazio e travessão são a mesma coisa aqui.
    .filter(valor => valor && valor !== "—")
    .join(" · ");
}

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

type BotStatus = { botModuleEnabled: boolean; botArmed: boolean } | null;
// `RetornoMode` (manual/auto_email/auto_whatsapp/auto_both) morreu com o popup de
// LEMBRETE — S1 da correção do noturno. O backend ainda aceita `retornoMode` no PATCH
// do lead (retorno de CRM em cliente), mas nenhuma tela de PROSPECÇÃO grava lembrete.

// LIGA/DESLIGA todos os efeitos de troca de guia (transição das camadas, entrada
// escalonada dos KPIs, "digitando" do título, pulso do 4º card). Pedido do dono
// 29/06: travar tudo SECO por enquanto pra validar a casca; depois ele manda
// religar = só pôr `true` aqui (o CSS lê via data-fx no .vnd-modehost).
const EFFECTS_ON = true;

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
  // visão do pipeline: lista densa (padrão — varredura) × quadro kanban
  // (arrastar entre etapas). Ordem do dono 13/06: lista padrão + quadro opcional.
  const [view, setView] = useTabParam<"list" | "board">("view", "list", ["list", "board"]);
  // Guias de etapa da LISTA (S1 LEAD-CENTRICO): 1 clique filtra as faixas por
  // etapa; clicar de novo na guia ativa limpa (null = mostra tudo). Estado
  // local só (não persiste). Seleção ativa = Glass Pill (Lei nº2).
  const [stageFilter, setStageFilter] = useState<VendasStage | null>(null);
  const stagePill = useGlassPill<HTMLButtonElement>(stageFilter || "todos");
  // A fita de etapas rola de lado quando os 5 rótulos não cabem (o rótulo
  // nunca é apagado — ver o bloco .vnd-stages em vendas-live.css). Rolar
  // sozinho é a metade que falta: sem isto, escolher "05 Fechado" numa tela
  // estreita deixaria a etapa ativa fora da vista, atrás da borda.
  //
  // A conta é feita à mão em vez de `scrollIntoView` de propósito: aquele
  // método rola TODOS os ancestrais roláveis, e a fita mora dentro do painel
  // de comando — bastaria um ancestral rolável para a página inteira dar um
  // pulo ao trocar de etapa. Aqui só a fita se mexe, por construção.
  useEffect(() => {
    const fita = document.querySelector<HTMLElement>(".vnd-stages");
    const ativa = fita?.querySelector<HTMLElement>(".vnd-stagetab.is-on");
    if (!fita || !ativa) return;
    const caixa = fita.getBoundingClientRect();
    const etapa = ativa.getBoundingClientRect();
    const FOLGA = 10; // não encosta a etapa na borda: encostado parece cortado
    const passouDireita = etapa.right - caixa.right;
    const passouEsquerda = caixa.left - etapa.left;
    if (passouDireita > 0) fita.scrollBy({ left: passouDireita + FOLGA });
    else if (passouEsquerda > 0) fita.scrollBy({ left: -(passouEsquerda + FOLGA) });
  }, [stageFilter]);
  // Campos priorizados e ordenação vivem em localStorage por navegador/usuário.
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
  // LARGURA DE CADA COLUNA — a segunda das três liberdades (decisão do dono,
  // 01/08). O `width` do GRID_COLUMNS deixou de ser lei e virou PADRÃO: a
  // partir daqui quem manda é a alça no cabeçalho, guardada por navegador.
  //
  // É daqui que saía o print do "Aguardand": a coluna Engajamento nascia com
  // 130px cravados e "Aguardando resposta" precisa de mais. Número cravado por
  // quem escreveu a tela nunca vai servir para a régua de letra de todo mundo;
  // o que serve é deixar a régua na mão de quem lê.
  // Guarda SÓ o que o usuário escolheu de fato. A distinção importa: coluna
  // sem escolha se mede pelo conteúdo (ver `trilhaDaGrade`), coluna escolhida
  // obedece o número dele. Se este mapa nascesse cheio de padrões, as duas
  // situações ficariam indistinguíveis e todo mundo herdaria o palpite.
  const [larguras, setLarguras] = useState<Record<string, number>>(() => {
    const escolhidas: Record<string, number> = {};
    if (typeof window === "undefined") return escolhidas;
    for (const col of GRID_COLUMNS) {
      const guardada = window.localStorage.getItem(`hbx:medida:vendas-col-${col.key}`);
      if (guardada !== null) escolhidas[col.key] = lerMedida(`vendas-col-${col.key}`, col.width, COL_MIN, COL_MAX);
    }
    return escolhidas;
  });
  const largurasRef = useRef(larguras);
  largurasRef.current = larguras;
  const [colsOpen, setColsOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [columnDraft, setColumnDraft] = useState<string[]>(gridKeys);
  const [columnDrag, setColumnDrag] = useState<string | null>(null);
  const [columnDropIndex, setColumnDropIndex] = useState<number | null>(null);
  // O gesto de arrasto é pendurado uma vez e vive até o dedo soltar; quando
  // ele termina, o `columnDropIndex` que ele enxerga pelo fechamento é o do
  // primeiro render. A ref é a cópia que está sempre em dia — quem desenha é
  // o estado, quem decide na soltura é esta.
  const columnDropIndexRef = useRef<number | null>(null);
  columnDropIndexRef.current = columnDropIndex;
  // Menu da faixa (botão ⋯ ou clique-direito): Fechar venda, Retorno,
  // Sem interesse, WhatsApp e Excluir.
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
        setSel(prev => focusCard || (prev && todos.find(c => c.id === prev.id)) || null);
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
  // S1 CORREÇÃO DO NOTURNO: o popup deixou de gravar lembrete e passou a AGENDAR
  // DISPARO — sem hora não existe disparo. 09:00 é só o palpite inicial; quem manda
  // no horário final é o motor de slots (pode virar 09:15 e a tela DIZ).
  const [retornoHora, setRetornoHora] = useState("09:00");
  const [obs, setObs] = useState("");
  // Popup de Retorno e Sem Interesse (substituem o clutter do cockpit)
  const [retornoOpen, setRetornoOpen] = useState(false);
  // S5 LEAD-CENTRICO (05-agenda-slots.md): preview do próximo slot livre pra data+hora
  // escolhidas. S1 (30/07): virou preview DE VERDADE — é o mesmo motor que vai reservar
  // o horário no Confirmar, então o que a tela mostra é o que vai acontecer.
  const [slotPreview, setSlotPreview] = useState<{ slot: string; conflito: boolean; motivoConflito: string | null; resumo?: string } | null>(null);
  const [slotPreviewBusy, setSlotPreviewBusy] = useState(false);
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


  // S1 CORREÇÃO DO NOTURNO (DIA-VENDEDOR-NOTURNO/01-CORRECAO.md): isto era
  // `agendarRetorno` e gravava `VendasLead.returnAt` — um lembrete de CRM que NUNCA
  // virava mensagem (B1 do teste noturno). Agora cria o disparo de verdade: o motor
  // de slots reserva o horário (janela + teto + intervalo) e a tela diz o que ficou.
  async function agendarDisparo() {
    if (!sel?.id || !retornoData || !retornoHora || acaoBusy) return;
    const desiredAt = isoLocalDeDataHora(retornoData, retornoHora);
    if (!desiredAt) { setAcaoMsg("Hora inválida. Use o formato 09:00."); return; }
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      const res = await apiFetch<{ resumo?: string }>(`/vendas/lead/${encodeURIComponent(sel.id)}/agendar-disparo`, {
        method: "POST",
        body: JSON.stringify({ desiredAt, ...(obs.trim() ? { objetivo: obs.trim().slice(0, 200) } : {}) }),
      });
      setAcaoMsg(`✓ ${res?.resumo || "Disparo agendado."}`);
      setRetornoData("");
      setObs("");
      setRetornoOpen(false);
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao agendar o disparo.");
    } finally {
      setAcaoBusy(false);
    }
  }

  // S1 (30/07): o preview consulta o MESMO motor que vai reservar, com a data E a
  // hora escolhidas (antes mandava 09:00 cravado e mentia — B3). Debounce simples
  // via cleanup do effect.
  useEffect(() => {
    if (!retornoOpen || !retornoData || !retornoHora) return;
    let alive = true;
    const desiredAt = isoLocalDeDataHora(retornoData, retornoHora);
    if (!desiredAt) { setSlotPreview(null); return; }
    const timer = setTimeout(() => {
      if (!alive) return;
      setSlotPreviewBusy(true);
      apiFetch<{ slot: string; conflito: boolean; motivoConflito: string | null; resumo?: string }>(
        `/vendas/agenda-disparo/proximo-slot?desiredAt=${encodeURIComponent(desiredAt)}`,
      )
        .then(res => { if (alive) setSlotPreview(res); })
        .catch(() => { if (alive) setSlotPreview(null); })
        .finally(() => { if (alive) setSlotPreviewBusy(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [retornoOpen, retornoData, retornoHora]);

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
        router.push("/conversas");
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
  // S4 LEAD-CENTRICO (04-robozinho.md, item 5): motivo de encerramento agora é
  // obrigatório no backend — soltar um card na coluna "Encerrado" abre este
  // popup em vez de já mandar o PATCH.
  const [closureReasonPrompt, setClosureReasonPrompt] = useState<{ leadId: string } | null>(null);
  const [closureReasonBusy, setClosureReasonBusy] = useState(false);

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
    // Encerrar exige motivo estruturado (S4) — abre o popup em vez de já mover.
    if (stage === "encerrado") {
      setClosureReasonPrompt({ leadId: id });
      return;
    }
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

  // S4 LEAD-CENTRICO (04-robozinho.md, item 5): confirma o encerramento com
  // motivo estruturado (sem_interesse | nao_atendeu | contato_invalido |
  // convertido | outro) — mesmos 5 valores que o backend aceita.
  async function confirmarEncerramento(closureReason: string) {
    const leadId = closureReasonPrompt?.leadId;
    if (!leadId || closureReasonBusy) return;
    setClosureReasonBusy(true);
    setAcaoMsg(null);
    setBoard(prev => patchCardStage(prev, leadId, "encerrado")); // otimista
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "encerrado", closureReason }),
      });
      setClosureReasonPrompt(null);
      await loadBoard();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao encerrar o lead.");
      await loadBoard();
    } finally {
      setClosureReasonBusy(false);
    }
  }

  // S7 LEAD-CENTRICO (07-pool-raiz.md, item 2): o painel de status/controles
  // (start/pause/resume/cancel) da Prospecção automática saiu daqui — a
  // criação/retomada de campanha foi aposentada no backend. `prospOpen`
  // continua: a drawer "Automações comerciais" ainda abre (config enxuta S5 +
  // assistente).
  const [prospOpen, setProspOpen] = useState(false);

  // S5 LEAD-CENTRICO (05-agenda-slots.md): config comercial ENXUTA por empresa —
  // 1 cartão, 3 campos (janela de horário, teto de disparos/dia, intervalo mínimo).
  // Substitui (sem apagar ainda — S7 faz isso) o cadastro imenso da prospecção pra
  // esse recorte específico. Leitura pra qualquer um do time; salvar é só dono/gerente
  // (board?.team só vem preenchido pra quem gerencia — mesmo gate usado no seletor
  // de vendedor do funil).
  // S2 CORREÇÃO DO NOTURNO (B5): `tetoEfetivoPorDia` = o menor entre o teto do tenant
  // e o do freio anti-ban. A tela prometia 40 e o freio entregava 10 — agora ela diz
  // o que REALMENTE sai.
  type ComercialConfig = {
    workingHoursStart: string; workingHoursEnd: string; dailyLimitPerSender: number; intervalMinutes: number;
    tetoEfetivoPorDia?: number; coldGateAtivo?: boolean; coldGateMaxPorDia?: number;
  };
  const [tetoEfetivo, setTetoEfetivo] = useState<number | null>(null);
  const [comercialConfigDraft, setComercialConfigDraft] = useState<{ workingHoursStart: string; workingHoursEnd: string; dailyLimitPerSender: string; intervalMinutes: string }>({
    workingHoursStart: "08:00", workingHoursEnd: "18:00", dailyLimitPerSender: "10", intervalMinutes: "15",
  });
  const [comercialConfigBusy, setComercialConfigBusy] = useState(false);
  const [comercialConfigMsg, setComercialConfigMsg] = useState<string | null>(null);
  const podeConfigurarDisparo = Boolean(board?.team);

  const loadComercialConfig = useCallback(() => {
    return apiFetch<ComercialConfig>("/vendas/agenda-disparo/config")
      .then(res => {
        setComercialConfigDraft({
          workingHoursStart: res.workingHoursStart,
          workingHoursEnd: res.workingHoursEnd,
          dailyLimitPerSender: String(res.dailyLimitPerSender),
          intervalMinutes: String(res.intervalMinutes),
        });
        setTetoEfetivo(Number.isFinite(res.tetoEfetivoPorDia) ? Number(res.tetoEfetivoPorDia) : null);
      })
      .catch(() => {});
  }, []);

  // CATÁLOGO COMERCIAL (30/07): a tela do "o que a empresa vende" — sem ela o
  // catalogoJson só era editável por SQL, o que reprova "ele muda sozinho?".
  // Capacidades viajam como texto simples (1 por linha; "| dores" opcional) e o
  // backend normaliza (chave nasce do ganho — a UI nunca pede jargão).
  type CatalogoView = {
    catalogo: { oQueVendemos: string; capacidades: { chave: string; ganho: string; resolve: string[] }[]; paraQuem: string[]; ancoraDePreco: string | null } | null;
    pronto: boolean;
    lacunas: string[];
  };
  const [catalogoInfo, setCatalogoInfo] = useState<CatalogoView | null>(null);
  const [catalogoDraft, setCatalogoDraft] = useState({ oQueVendemos: "", capacidades: "", paraQuem: "", ancoraDePreco: "" });
  const [catalogoBusy, setCatalogoBusy] = useState(false);
  const [catalogoMsg, setCatalogoMsg] = useState<string | null>(null);

  const espelharCatalogo = useCallback((res: CatalogoView) => {
    setCatalogoInfo(res);
    const c = res.catalogo;
    setCatalogoDraft({
      oQueVendemos: c?.oQueVendemos || "",
      capacidades: (c?.capacidades || [])
        .map(cap => (cap.resolve.length ? `${cap.ganho} | ${cap.resolve.join(", ")}` : cap.ganho))
        .join("\n"),
      paraQuem: (c?.paraQuem || []).join(", "),
      ancoraDePreco: c?.ancoraDePreco || "",
    });
  }, []);

  const loadCatalogo = useCallback(() => {
    return apiFetch<CatalogoView>("/vendas/catalogo-comercial")
      .then(espelharCatalogo)
      .catch(() => {});
  }, [espelharCatalogo]);

  useEffect(() => {
    if (!prospOpen) return;
    loadComercialConfig();
    loadCatalogo();
  }, [prospOpen, loadComercialConfig, loadCatalogo]);

  async function salvarCatalogo() {
    if (catalogoBusy) return;
    setCatalogoBusy(true);
    setCatalogoMsg(null);
    try {
      const capacidades = catalogoDraft.capacidades
        .split("\n").map(l => l.trim()).filter(Boolean)
        .map(linha => {
          const [ganho, dores] = linha.split("|");
          return { ganho: (ganho || "").trim(), resolve: (dores || "").split(",").map(s => s.trim()).filter(Boolean) };
        })
        .filter(c => c.ganho);
      const oQueVendemos = catalogoDraft.oQueVendemos.trim();
      const paraQuem = catalogoDraft.paraQuem.split(",").map(s => s.trim()).filter(Boolean);
      const ancoraDePreco = catalogoDraft.ancoraDePreco.trim();
      const vazio = !oQueVendemos && !capacidades.length && !paraQuem.length && !ancoraDePreco;
      const res = await apiFetch<CatalogoView>("/vendas/catalogo-comercial", {
        method: "PATCH",
        body: JSON.stringify({ catalogo: vazio ? null : { oQueVendemos, capacidades, paraQuem, ancoraDePreco: ancoraDePreco || null } }),
      });
      espelharCatalogo(res);
      setCatalogoMsg("✓ Catálogo salvo");
    } catch (error: any) {
      setCatalogoMsg(error?.message || "Não foi possível salvar");
    } finally {
      setCatalogoBusy(false);
    }
  }

  async function salvarComercialConfig() {
    if (comercialConfigBusy) return;
    setComercialConfigBusy(true);
    setComercialConfigMsg(null);
    try {
      const res = await apiFetch<ComercialConfig>("/vendas/agenda-disparo/config", {
        method: "PATCH",
        body: JSON.stringify({
          workingHoursStart: comercialConfigDraft.workingHoursStart,
          workingHoursEnd: comercialConfigDraft.workingHoursEnd,
          dailyLimitPerSender: Number(comercialConfigDraft.dailyLimitPerSender) || undefined,
          intervalMinutes: Number(comercialConfigDraft.intervalMinutes) || undefined,
        }),
      });
      setComercialConfigDraft({
        workingHoursStart: res.workingHoursStart,
        workingHoursEnd: res.workingHoursEnd,
        dailyLimitPerSender: String(res.dailyLimitPerSender),
        intervalMinutes: String(res.intervalMinutes),
      });
      setTetoEfetivo(Number.isFinite(res.tetoEfetivoPorDia) ? Number(res.tetoEfetivoPorDia) : null);
      setComercialConfigMsg("✓ Configuração salva.");
    } catch (err) {
      setComercialConfigMsg(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setComercialConfigBusy(false);
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

  // Guias de etapa da LISTA: contagem por etapa sobre os MESMOS leads carregados
  // (busca + equipe já aplicados em flatLeads) — bate com as colunas do quadro
  // pros mesmos dados. listLeads é a lista efetivamente renderizada: compõe
  // busca + guia de etapa (guia ativa filtra; nenhuma = mostra tudo).
  const stageCounts: Record<VendasStage, number> = { novo: 0, contato: 0, retorno: 0, qualificado: 0, encerrado: 0 };
  for (const c of flatLeads) stageCounts[normalizeStage(c.status)]++;
  const listLeads: VendasLead[] = stageFilter ? flatLeads.filter(c => normalizeStage(c.status) === stageFilter) : flatLeads;

  const roboAtivo = flatLeads.filter(c => c.automation).length;
  const canViewValues = Boolean(board?.canViewValues);
  const carteiraValue = flatLeads.reduce((total, card) => total + (Number(card.saleValue) || 0), 0);
  const carteiraValueLabel = canViewValues ? (fmtMoney(carteiraValue) || "—") : "—";

  // O status pertence ao Radar. O id comercial de Vendas nunca é usado como radarLeadId.
  const aiStatusMap = useRadarAiStatusPoll(flatLeads.map(card => card.radarLeadId || ""), {
    onTerminal: (radarLeadId) => { void refreshBoardLead(radarLeadId); },
  });

  // Colunas efetivamente visíveis: respeita a ordem escolhida pelo usuário e o
  // gate de valores (LEI DO VENDEDOR — sem canViewValues a coluna nem existe).
  const gridCols: GridColumn[] = gridKeys
    .map(k => GRID_COLUMNS.find(c => c.key === k))
    .filter((c): c is GridColumn => Boolean(c) && (c!.gate !== "values" || Boolean(board?.canViewValues)));

  function openColumnPicker() {
    setColumnDraft(gridKeys);
    setColumnSearch("");
    setColsOpen(true);
  }
  function cancelColumnPicker() {
    setColumnDraft(gridKeys);
    setColsOpen(false);
  }
  function saveColumnPicker() {
    applyGridKeys(columnDraft);
    setColsOpen(false);
  }
  function dropColumnAt(key: string, index: number) {
    const without = columnDraft.filter(k => k !== key);
    const oldIndex = columnDraft.indexOf(key);
    const adjusted = oldIndex >= 0 && oldIndex < index ? index - 1 : index;
    without.splice(Math.max(0, Math.min(adjusted, without.length)), 0, key);
    setColumnDraft(without);
    setColumnDrag(null);
    setColumnDropIndex(null);
  }
  function removeDraftColumn(key: string) {
    setColumnDraft(keys => keys.filter(k => k !== key));
  }
  /**
   * REORDENAR CAMPO — por que isto deixou de usar o arrasto nativo do HTML.
   *
   * Medido ao vivo em 01/08, com os eventos instrumentados:
   *
   *   agarrando pelo PUNHO ⠿ : dragstart -> dragover -> dragend   (sem drop)
   *   agarrando pelo NOME    : dragstart -> dragover -> drop       (move)
   *
   * O único lugar da linha que ANUNCIA "arraste aqui" era o único onde o
   * arrasto morria — o dono relatou como "a organização parou de funcionar".
   *
   * A causa imediata era o `dataTransfer` nascer vazio (sem `setData` o
   * navegador resolve `dropEffect` como "none" e recusa a soltura em
   * silêncio). Mas consertar SÓ isso seria consertar o sintoma: a API nativa
   * de arrasto continua sendo aquela em que um filho focável, um
   * `user-select` ou um dedo em vez do mouse mudam o gesto — e em que
   * nenhum teste automatizado consegue provar que funciona. Ela já tinha
   * cobrado esse preço uma vez.
   *
   * Então o gesto passou a ser o MESMO da divisória e da largura de coluna:
   * `useArrastar`, com `setPointerCapture`. Um gesto, três usos, uma
   * explicação. Ver lib/arrastar.ts.
   */
  const listaCamposRef = useRef<HTMLDivElement | null>(null);
  const arrastoCampoRef = useRef<{ key: string; origem: "ordem" | "disponivel" } | null>(null);

  /** Entre quais linhas o ponteiro está agora. Devolve índice de INSERÇÃO. */
  function indiceDeSoltura(y: number): number {
    const linhas = Array.from(listaCamposRef.current?.querySelectorAll(".vnd-colrow") ?? []);
    for (let i = 0; i < linhas.length; i++) {
      const r = linhas[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return linhas.length;
  }

  /** O ponteiro está sobre a lista de ordem (e não sobre os disponíveis)? */
  function sobreAListaDeOrdem(x: number, y: number): boolean {
    const caixa = listaCamposRef.current?.getBoundingClientRect();
    if (!caixa) return false;
    const FOLGA = 24; // soltar rente à borda ainda conta como "dentro"
    return x >= caixa.left - FOLGA && x <= caixa.right + FOLGA && y >= caixa.top - FOLGA && y <= caixa.bottom + FOLGA;
  }

  const arrastoDeCampo = useArrastar({
    aoComecar: () => setColumnDrag(arrastoCampoRef.current?.key ?? null),
    aoMover: ({ x, y }) => {
      setColumnDropIndex(sobreAListaDeOrdem(x, y) ? indiceDeSoltura(y) : null);
    },
    aoSoltar: (arrastou) => {
      const gesto = arrastoCampoRef.current;
      const destino = columnDropIndexRef.current;
      arrastoCampoRef.current = null;
      setColumnDrag(null);
      setColumnDropIndex(null);
      if (!arrastou || !gesto) return;
      if (destino === null) {
        // Soltou FORA da lista: sair da lista é remover. Para quem veio dos
        // disponíveis, soltar fora é simplesmente desistir.
        if (gesto.origem === "ordem") removeDraftColumn(gesto.key);
        return;
      }
      if (gesto.origem === "disponivel") {
        setColumnDraft(keys => {
          const sem = keys.filter(k => k !== gesto.key);
          sem.splice(Math.max(0, Math.min(destino, sem.length)), 0, gesto.key);
          return sem;
        });
        return;
      }
      dropColumnAt(gesto.key, destino);
    },
  });

  /** Pendura o gesto numa alça, lembrando de QUEM está sendo arrastado. */
  function pegarCampo(key: string, origem: "ordem" | "disponivel") {
    return (evento: React.PointerEvent) => {
      arrastoCampoRef.current = { key, origem };
      arrastoDeCampo.onPointerDown(evento);
    };
  }
  // ── A GRADE DE VERDADE ────────────────────────────────────────────────────
  // Até 01/08 o "Organizar campos" oferecia 24 campos com ordem de prioridade
  // arrastável e uma prévia com setas — e a lista embaixo tinha QUATRO colunas
  // fixas que nunca mudavam. Dos 24 campos, 4 viravam a legenda do nome (numa
  // ordem fixa, que ignorava a prioridade escolhida) e 5 viravam o texto sob
  // "Próximo passo". Os outros 15 não faziam nada.
  //
  // O dono organizou 14 campos, não viu diferença nenhuma e relatou como "a
  // organização parou de funcionar". Estava certo: o defeito não era o gesto,
  // era a PROMESSA — o modal prometia coluna e entregava legenda.
  //
  // Agora a coluna escolhida é coluna mesmo, na ordem escolhida, com a largura
  // que o usuário arrastar. As células ricas (avatar, sinais, score, dinheiro)
  // continuam ricas: cada chave conhecida tem seu desenho e o resto cai no
  // texto cru que o próprio GRID_COLUMNS já sabia produzir.
  const larguraDaColuna = (key: string) => larguras[key] ?? GRID_COLUMNS.find(c => c.key === key)?.width ?? 140;

  /**
   * A trilha da grade. `check` e `ações` são fixas nas pontas; o miolo é o que
   * o usuário escolheu. A lista ROLA de lado quando não cabe — mesma decisão
   * da fita de etapas: quem cede é o container, nunca o dado.
   *
   * A LARGURA DE FÁBRICA NÃO É UM NÚMERO, É UM PISO.
   * O `width` do GRID_COLUMNS foi escrito à mão e, medido pelo fiscal com dado
   * hostil, erra: "R$ 1.234.567,89" pede 125px numa coluna de 110, e
   * "São José do Rio Preto" pede 142 em 130. É o mesmo defeito que já tinha
   * cortado a fita de etapas e o cabeçalho da /clientes — palpite de quem
   * escreveu a tela não sobrevive à régua de letra do usuário, ao peso da
   * fonte da pele nem ao dado real do cliente.
   *
   * Então, enquanto o usuário não arrastar, a coluna é `minmax(piso,
   * max-content)`: ela MEDE o conteúdo em vez de apostar, com teto para uma
   * razão social de cartório não empurrar todo o resto para fora da tela.
   * Assim que ele arrasta, vira o número dele — e aí é escolha, não palpite.
   */
  const trilhaDaGrade = [
    "34px",
    // ARMADILHA MEDIDA EM 01/08: `minmax(130px, min(max-content, 560px))` é
    // INVÁLIDO — função matemática não aceita palavra de dimensionamento
    // intrínseco. O navegador descartou a lista de trilhas inteira, a grade
    // virou uma coluna só e a tela empilhou tudo na vertical. Sem erro no
    // console, sem build vermelho: é o "CSS morre calado" de novo.
    // O teto de largura mora no CSS (`.vnd-sales-td > *`), onde ele funciona.
    ...gridCols.map(c =>
      larguras[c.key] !== undefined
        ? `${larguraDaColuna(c.key)}px`
        : `minmax(${c.width}px, max-content)`,
    ),
    "72px",
  ].join(" ");

  const arrastoDeColunaRef = useRef<{ key: string; inicial: number } | null>(null);
  const arrastoDeColuna = useArrastar({
    eixo: "x",
    cursor: "col-resize",
    aoMover: ({ dx }) => {
      const gesto = arrastoDeColunaRef.current;
      if (!gesto) return;
      const nova = Math.min(COL_MAX, Math.max(COL_MIN, gesto.inicial + dx));
      setLarguras(atual => ({ ...atual, [gesto.key]: nova }));
    },
    aoSoltar: (arrastou) => {
      const gesto = arrastoDeColunaRef.current;
      arrastoDeColunaRef.current = null;
      if (arrastou && gesto) gravarMedida(`vendas-col-${gesto.key}`, largurasRef.current[gesto.key]);
    },
  });

  function pegarColuna(key: string) {
    return (evento: React.PointerEvent) => {
      evento.stopPropagation(); // a alça mora dentro do botão de ordenar
      // A largura de partida é a que está NA TELA, não a declarada: coluna que
      // ainda se mede pelo conteúdo pode estar em 142px com 130 declarados, e
      // partir do declarado faria a coluna dar um salto no primeiro pixel de
      // arrasto — o gesto tem que continuar de onde o olho está.
      const cabecalho = (evento.currentTarget as HTMLElement).closest(".vnd-sales-th");
      const naTela = cabecalho ? Math.round(cabecalho.getBoundingClientRect().width) : larguraDaColuna(key);
      arrastoDeColunaRef.current = { key, inicial: naTela };
      arrastoDeColuna.onPointerDown(evento);
    };
  }

  /**
   * Duplo clique devolve a coluna ao padrão — e o padrão é MEDIR o conteúdo,
   * não voltar ao número escrito à mão. Por isso a chave sai do mapa em vez de
   * receber o `col.width`.
   */
  function restaurarLargura(key: string) {
    esquecerMedida(`vendas-col-${key}`);
    setLarguras(atual => {
      const proximo = { ...atual };
      delete proximo[key];
      return proximo;
    });
  }

  /** Teclado faz o mesmo que o arrasto — ↑/↓ movem o campo de lugar. */
  function moverCampo(key: string, passo: -1 | 1) {
    const atual = columnDraft.indexOf(key);
    if (atual < 0) return;
    const destino = atual + passo;
    if (destino < 0 || destino >= columnDraft.length) return;
    const ordem = [...columnDraft];
    ordem.splice(atual, 1);
    ordem.splice(destino, 0, key);
    setColumnDraft(ordem);
  }
  function toggleGridSort(key: string) {
    applyGridSort(gridSort?.key === key ? (gridSort.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 });
  }

  function selecionarLead(card: VendasLead) {
    if (sel?.id === card.id) {
      setCockpitOpen(true);
      return;
    }
    setSel(card);
  }

  function selecionarLeadNoTeclado(event: React.KeyboardEvent<HTMLElement>, card: VendasLead) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    selecionarLead(card);
  }

  // "Selecionar todos" opera sobre a lista visível (já filtrada/ordenada — busca + guia de etapa).
  const todosSelecionados = listLeads.length > 0 && listLeads.every(c => selecionados.has(c.id));
  function toggleTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set(listLeads.map(c => c.id)));
  }

  // Navega com ↑/↓ entre leads igual Excel — só na lista desktop. Usa a MESMA
  // listLeads da tela (busca + guia de etapa) pra nunca pousar numa faixa
  // fora do que está visível na tela.
  useEffect(() => {
    if (view !== "list") return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (fecharOpen || novoOpen || prospOpen || agendaOpen || retornoOpen || semInteresseOpen || cockpitOpen) return;
      e.preventDefault();
      const list = listLeads;
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
  }, [view, board, searchQuery, gridSort, stageFilter, listLeads, sel, fecharOpen, novoOpen, prospOpen, agendaOpen, retornoOpen, semInteresseOpen, cockpitOpen]);

  const summary = board?.summary;

  // Organizador de campos — o menu inteiro. Virou variável (PAINEL-ÚNICO, 26/07)
  // porque o botão que o abre mudou de casa: saiu do cabeçalho do painel e foi
  // pro cluster de ações do painel de comando. O conteúdo é o MESMO de antes.
  const columnPicker = (
    <React.Fragment>
      <button type="button" className="vnd-team-veil" aria-label="Fechar" onClick={cancelColumnPicker} />
      <div className="vnd-colspick__menu" role="dialog" aria-label="Campos da lista">
        <div className="vnd-colspick__head">
          <span><strong>Organizar campos</strong><small>{columnDraft.length} de {GRID_COLUMNS.filter(c => c.gate !== "values" || board?.canViewValues).length} campos priorizados</small></span>
          <button type="button" className="icon-ghost" aria-label="Fechar" onClick={cancelColumnPicker}>✕</button>
        </div>
        <div className="vnd-colspick__boards">
          <section className="vnd-colspick__board">
            <div className="vnd-colspick__boardhead"><span><b>Ordem dos campos</b><small>De cima para baixo = maior prioridade</small></span><button type="button" onClick={() => setColumnDraft([])}>Remover todos</button></div>
            <div className="vnd-collist" ref={listaCamposRef}>
              {columnDraft.map((key, i) => {
                const col = GRID_COLUMNS.find(c => c.key === key);
                if (!col) return null;
                return <div key={key} className={"vnd-colrow" + (columnDropIndex === i ? " is-drop" : "") + (columnDrag === key ? " is-pegando" : "")}
                  onPointerDown={pegarCampo(key, "ordem")}>
                  <span
                    className="vnd-colrow__grip"
                    role="button"
                    tabIndex={0}
                    aria-label={`${col.label}: posição ${i + 1} de ${columnDraft.length}. Use as setas para cima e para baixo para mover.`}
                    onKeyDown={e => {
                      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                      e.preventDefault();
                      moverCampo(key, e.key === "ArrowUp" ? -1 : 1);
                    }}
                  >⠿</span><b className="vnd-colrow__num">{String(i + 1).padStart(2, "0")}</b><span className="vnd-colrow__name">{col.label}</span>
                  <button type="button" className="vnd-colrow__remove" onClick={() => removeDraftColumn(key)} aria-label={`Remover ${col.label}`}>✕</button>
                </div>;
              })}
              {columnDraft.length === 0 && <span className="vnd-colspick__empty">Arraste campos para cá</span>}
            </div>
            <small className="vnd-colspick__hint">⠿ Arraste ou use ↑ ↓ para reordenar</small>
          </section>
          <section className="vnd-colspick__board vnd-colspick__available">
            <div className="vnd-colspick__boardhead"><span><b>Campos disponíveis</b><small>Arraste ou dê dois cliques para adicionar</small></span><button type="button" onClick={() => setColumnDraft(GRID_COLUMNS.filter(c => c.gate !== "values" || board?.canViewValues).map(c => c.key))}>Adicionar todos</button></div>
            <label className="vnd-colsearch"><span aria-hidden="true">⌕</span><input value={columnSearch} onChange={e => setColumnSearch(e.target.value)} placeholder="Buscar coluna" aria-label="Buscar coluna" /></label>
            <div className="vnd-colavailable">
              {GRID_COLUMN_GROUPS.map(group => {
                const cols = group.keys.map(key => GRID_COLUMNS.find(c => c.key === key)).filter((c): c is GridColumn => Boolean(c) && !columnDraft.includes(c!.key) && (c!.gate !== "values" || Boolean(board?.canViewValues)) && c!.label.toLocaleLowerCase("pt-BR").includes(columnSearch.trim().toLocaleLowerCase("pt-BR")));
                if (!cols.length) return null;
                return <div key={group.label} className="vnd-colgroup"><b>{group.label}</b>{cols.map(col => <button key={col.key} type="button" className={columnDrag === col.key ? "is-pegando" : undefined} onPointerDown={pegarCampo(col.key, "disponivel")} onDoubleClick={() => setColumnDraft(keys => [...keys, col.key])}><span aria-hidden="true">⠿</span>{col.label}</button>)}</div>;
              })}
            </div>
            <small className="vnd-colspick__hint">Arraste para adicionar</small>
          </section>
        </div>
        <div className="vnd-colpreview"><b>Prévia:</b><span>{columnDraft.slice(0, 7).map(key => GRID_COLUMNS.find(c => c.key === key)?.label).join(" → ")}{columnDraft.length > 7 ? "…" : ""}</span></div>
        <div className="vnd-colspick__actions">
          <button type="button" className="btn-ghost" onClick={cancelColumnPicker}>Cancelar</button>
          <button type="button" className="btn-ghost" onClick={() => setColumnDraft(GRID_DEFAULT_KEYS)}>Restaurar padrão</button>
          <button type="button" className="btn-teal" onClick={saveColumnPicker}>Salvar</button>
        </div>
      </div>
    </React.Fragment>
  );

  // Modos acoplados — vivem no topo persistente da casca ÚNICA,
  // à esquerda dos 3 cards. Ficam fixos enquanto as camadas crossfadeiam por baixo.
  // Ativo destacado (preenchido).
  const segToggle = (
    <div className="vnd-segbtns glass-pill-track" role="tablist" aria-label="Modo da tela">
      <GlassPill {...segPill} />
      <button ref={segPill.itemRef("funil")} id="vendas-tab-funil" type="button" role="tab" aria-selected={modo === "funil"} aria-controls="vendas-panel-funil"
        className={"vnd-segbtn glass-pill-item" + (modo === "funil" ? " is-on" : "")} onClick={irFunil}>
        <span className="vnd-segbtn__icon"><I d={ICONS.vendas} size={16} /></span>
        <span className="vnd-segbtn__copy"><strong>Meu funil</strong></span>
      </button>
      {podeBuscarLeads && (
        <button ref={segPill.itemRef("buscar")} id="vendas-tab-buscar" type="button" role="tab" aria-selected={modo === "buscar"} aria-controls="vendas-panel-buscar" data-tut="vendas-buscar"
          className={"vnd-segbtn glass-pill-item" + (modo === "buscar" ? " is-on" : "")} onClick={irBuscar}>
          <span className="vnd-segbtn__icon"><I d={ICONS.scrape} size={16} /></span>
          <span className="vnd-segbtn__copy"><strong>Buscar empresas</strong></span>
        </button>
      )}
    </div>
  );

  return (
    <React.Fragment>
        <div className="vnd-modehost" data-mode={modo} data-fx={EFFECTS_ON ? "on" : "off"}>

          {/* ── PAINEL DE COMANDO (PAINEL-ÚNICO, 26/07) ────────────────────────
              Eram QUATRO faixas empilhadas antes do primeiro lead aparecer:
              modo+3 KPIs (vnd-funhead), cabeçalho do painel com 7 controles,
              guias de etapa e a barra de seleção — que ainda empurrava a tabela
              pra baixo quando alguém marcava um card.
              Virou UMA. As 5 etapas do lead são a navegação e carregam o número
              (os 3 KPIs repetiam esses mesmos dados); a faixa de baixo explica a
              etapa aberta e traz só as ações dela. Seleção múltipla e mensagens
              trocam o CONTEÚDO dessa mesma faixa — nada empurra a tabela. */}
          <div className="vnd-cmd" data-mode={modo}>
            <div className="vnd-cmd__top">
              {segToggle}
              <div className="vnd-flowguide">
                <div className="vnd-flowguide__viewport">
                  <div className="vnd-flowguide__panel vnd-flowguide__panel--funil" aria-hidden={modo !== "funil"}>
                  <div className="vnd-stages glass-pill-track" role="tablist" aria-label="Etapas do funil" data-tut="vendas-etapas">
                    <GlassPill {...stagePill} />
                    <button
                      ref={stagePill.itemRef("todos")}
                      type="button"
                      role="tab"
                      aria-selected={stageFilter == null}
                      className={"vnd-stagetab vnd-stagetab--all glass-pill-item" + (stageFilter == null ? " is-on" : "")}
                      onClick={() => setStageFilter(null)}
                    >
                      <span className="vnd-stagetab__step">●</span>
                      <span className="vnd-stagetab__l">Todos</span>
                      <span className="vnd-stagetab__n">{flatLeads.length}</span>
                    </button>
                    {STAGE_ORDER.map((stage, stageIndex) => {
                      const active = stageFilter === stage.key;
                      const contagem = stageCounts[stage.key];
                      // Sinal vivo: verde pulsando = robô rodando; vermelho = cliente
                      // esperando resposta. O número da etapa quente é o próprio alarme
                      // (nada de badge repetindo o mesmo número ao lado).
                      const vivo = stage.key === "contato" && roboAtivo > 0;
                      const quente = stage.key === "retorno" && contagem > 0;
                      return (
                        <button
                          ref={stagePill.itemRef(stage.key)}
                          key={stage.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          title={stage.sub}
                          className={"vnd-stagetab glass-pill-item" + (active ? " is-on" : "") + (quente ? " is-hot" : "")}
                          onClick={() => setStageFilter(f => (f === stage.key ? null : stage.key))}
                        >
                          <span className="vnd-stagetab__step">{String(stageIndex + 1).padStart(2, "0")}</span>
                          <span className="vnd-stagetab__l">
                            {vivo && <span className="vnd-stagetab__dot" aria-hidden="true" />}
                            {quente && <span className="vnd-stagetab__dot vnd-stagetab__dot--hot" aria-hidden="true" />}
                            {stage.label}
                          </span>
                          <span className="vnd-stagetab__n">{contagem}</span>
                        </button>
                      );
                    })}
                  </div>
                  </div>
                  <div className="vnd-flowguide__panel vnd-flowguide__panel--buscar" aria-hidden={modo !== "buscar"}>
                    <div id="vendas-buscar-command-slot" className="vnd-search-command-slot" />
                  </div>
                </div>
              </div>
              <div className="vnd-cmd__acts" aria-hidden={modo !== "funil"}>
                  <span className="seg-toggle" role="group" aria-label="Visão do pipeline" data-tut="vendas-visao">
                    <button type="button" className={"seg" + (view === "list" ? " on" : "")} onClick={() => setView("list")} aria-pressed={view === "list"}>Lista</button>
                    <button type="button" className={"seg" + (view === "board" ? " on" : "")} onClick={() => setView("board")} aria-pressed={view === "board"}>Quadro</button>
                  </span>
                  {view === "list" && (
                    <div className="vnd-colspick">
                      <button type="button" className="icon-ghost" aria-haspopup="menu" aria-expanded={colsOpen}
                        onClick={() => colsOpen ? cancelColumnPicker() : openColumnPicker()} title="Escolher e ordenar os campos" aria-label={`Campos da lista: ${gridCols.length} visíveis`}>
                        <I d={ICONS.edit} size={16} />
                      </button>
                      {colsOpen && columnPicker}
                    </div>
                  )}
                  <button type="button" className="icon-ghost" title="Automações comerciais" aria-label="Automações comerciais" data-tut="vendas-prosp" onClick={() => setProspOpen(true)}>
                    <I d={ICONS.bot} size={16} />
                  </button>
                  <button type="button" className="icon-ghost" title="Agenda de retornos" aria-label="Agenda de retornos" data-tut="vendas-agenda" onClick={() => setAgendaOpen(o => !o)}>
                    <I d={ICONS.clock} size={16} />
                  </button>
                  {board?.team && (() => {
                    const team = board.team;
                    const selSeller = teamFilter ? team.sellers.find(x => x.id === teamFilter) : null;
                    const label = !teamFilter ? "Todas as equipes" : selSeller ? (selSeller.isMe ? "Eu" : selSeller.name) : "Todas as equipes";
                    return (
                      <div className="vnd-team">
                        <button type="button" className="btn-ghost btn-xs" aria-haspopup="menu" aria-expanded={teamMenuOpen}
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
                  <button type="button" className="btn-teal btn-xs" data-tut="vendas-novo" onClick={() => setNovoOpen(true)}>
                    <I d={ICONS.plus} size={14} /> Novo lead
                  </button>
              </div>
            </div>
          </div>

          {/* STAGE — camadas SOBREPOSTAS em crossfade (uma casca só). */}
          <div className="vnd-stage">
            <div id="vendas-panel-funil" role="tabpanel" aria-labelledby="vendas-tab-funil"
              className={"vnd-layer" + (modo === "funil" ? " is-on" : "")} aria-hidden={modo !== "funil"}>
                <div className={"content hbx-panel-shell hbx-panel-shell--context" + (sel ? " vnd-content--preview-open" : "")}>
                  <div className="work hbx-panel-shell__main hbx-panel-shell__route-work">
            <section className="panel">
              {loadError && (
                <div style={{ padding: "12px 16px", fontSize: "var(--fz-l3)", fontWeight: 600, color: "var(--hbx-danger)" }}>
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
              {/* LISTA COMERCIAL: faixas densas com os sinais que fazem o vendedor
                  decidir. Primeiro clique abre a prévia; repetir abre a ficha. */}
              {view === "list" && board && (summary?.total ?? 0) > 0 && (
                <div className={"vnd-sales-list-wrap" + (selecionados.size > 0 ? " is-bulk" : "")}>
                  {selecionados.size > 0 ? (
                    <div className="vnd-sales-toolbar vnd-sales-toolbar--bulk">
                      <span className="hbx-selection-bar__copy">
                        <b>{selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}</b>
                        {bulkMsg && <small className={"ctx-msg " + (bulkMsg.startsWith("✓") ? "ok" : "err")}>{bulkMsg}</small>}
                      </span>
                      <span className="vnd-sales-toolbar__bulk-actions">
                      <button type="button" className="btn-ghost btn-xs" onClick={() => setSelecionados(new Set())}>Desmarcar</button>
                      <button type="button" className="btn-ghost danger btn-xs" onClick={() => { setBulkMsg(null); setExcluirMotivoOpen("bulk"); }} disabled={bulkDeleteBusy}>
                        <I d={ICONS.trash} size={13} /> {bulkDeleteBusy ? "Excluindo…" : "Excluir selecionados"}
                      </button>
                      </span>
                    </div>
                  ) : (
                    <div className="vnd-sales-toolbar">
                      <span className="vnd-sales-metric">
                        <span className="vnd-sales-metric__icon"><I d={ICONS.leads} size={15} /></span>
                        <span><strong>{flatLeads.length} lead{flatLeads.length === 1 ? "" : "s"}</strong><small>carteira ativa</small></span>
                      </span>
                      <span className="vnd-sales-metric">
                        <span className="vnd-sales-metric__icon"><I d={ICONS.money} size={15} /></span>
                        <span><strong>{carteiraValueLabel}</strong><small>{canViewValues ? "potencial" : "valores restritos"}</small></span>
                      </span>
                      <span className={"vnd-sales-metric" + (stageCounts.retorno > 0 ? " is-hot" : "")}>
                        <span className="vnd-sales-metric__icon"><I d={ICONS.msg} size={15} /></span>
                        <span><strong>{stageCounts.retorno} chamou</strong><small>responder agora</small></span>
                      </span>
                      <label className="vnd-sales-search">
                        <I d={ICONS.search} size={15} />
                        <input
                          value={searchQuery}
                          onChange={event => setSearchQuery(event.target.value)}
                          placeholder="Buscar no funil…"
                          aria-label="Buscar no funil"
                        />
                      </label>
                    </div>
                  )}

                  <div className="vnd-sales-grade" style={{ "--vnd-grade-cols": trilhaDaGrade } as React.CSSProperties}>
                  <div className="vnd-sales-head" role="row">
                    <span className="vnd-sales-check">
                      <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos}
                        aria-label={todosSelecionados ? "Desmarcar todos" : "Selecionar todos"} />
                    </span>
                    {gridCols.map(col => (
                      <span key={col.key} className="vnd-sales-th">
                        <button type="button" onClick={() => !col.nosort && toggleGridSort(col.key)}
                          disabled={col.nosort} aria-label={col.nosort ? col.label : `Ordenar por ${col.label}`}>
                          <span className="hbx-1linha">{col.label}</span>
                          {gridSort?.key === col.key && <span aria-hidden="true">{gridSort.dir === 1 ? "▲" : "▼"}</span>}
                        </button>
                        {/* A alça de largura. Fica na borda direita da coluna,
                            que é onde a mão procura. */}
                        <span
                          className="vnd-col-alca"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Largura da coluna ${col.label}. Arraste, ou duplo clique para o padrão.`}
                          title="Arraste para mudar a largura · duplo clique volta ao padrão"
                          onPointerDown={pegarColuna(col.key)}
                          onDoubleClick={event => { event.stopPropagation(); restaurarLargura(col.key); }}
                        />
                      </span>
                    ))}
                    <span aria-hidden="true" />
                  </div>

                  <div className="vnd-sales-list" role="listbox" data-tut="vendas-funil" aria-label="Leads do funil">
                    {listLeads.map(card => {
                      const engagement = vendasEngagementMeta(card.engagement, card.conversation);
                      const ag = agendaInfo(card);
                      const score = Math.max(0, Math.min(100, Math.round(Number(card.opportunityScore) || 0)));
                      const canais = vendasCanais(card);
                      const location = card.city ? `${card.city}${card.state ? `/${card.state}` : ""}` : card.state || "";
                      // LEI "mostra num lugar, edita num lugar": com a grade de
                      // verdade, todo campo escolhido virou COLUNA. Repetir o
                      // mesmo dado na legenda embaixo do nome seria mostrar
                      // duas vezes — e dado em dois lugares é bug de produto,
                      // não de layout. A legenda passou a ser o contrário do
                      // que era: mostra o que NÃO tem coluna própria hoje.
                      const semColuna = (key: string) => !gridKeys.includes(key);
                      const identityMeta = [
                        semColuna("segment") ? card.segment : null,
                        semColuna("city") && semColuna("state") ? location : null,
                        semColuna("phone") ? card.phone : null,
                        semColuna("email") ? card.email : null,
                      ].filter(Boolean).join(" · ");
                      // A legenda do "Próximo passo" carrega VALOR sem rótulo,
                      // então só entra aqui o que se explica sozinho. "Hoje" e
                      // "Sem mensagens" explicam; "11" e "—" não — com a grade
                      // nova, Contatos e Data ficaram sem coluna nesta seleção
                      // e a legenda virou "— · 11", que não informa nada.
                      // Quem quiser esses dois agora tem coluna própria.
                      const nextMeta = compactGridText(
                        card,
                        ["agenda", "engage", "note"].filter(semColuna),
                        ["agenda", "engage", "note"],
                      );
                      const dealPrimary = canViewValues ? leadValueLabel(card) : (card.product?.name || "—");
                      const owner = card.owner?.name || "Sem responsável";
                      return (
                        <article
                          key={card.id}
                          id={`vnd-row-${card.id}`}
                          className={"vnd-sales-row" + (sel?.id === card.id ? " is-selected" : "")}
                          role="option"
                          tabIndex={0}
                          aria-selected={sel?.id === card.id}
                          onClick={() => selecionarLead(card)}
                          onKeyDown={event => selecionarLeadNoTeclado(event, card)}
                          onContextMenu={event => { event.preventDefault(); setSel(card); setRowMenu({ id: card.id, x: event.clientX, y: event.clientY }); }}
                        >
                          <span className="vnd-sales-check" onClick={event => event.stopPropagation()}>
                            <input type="checkbox" checked={selecionados.has(card.id)} onChange={() => toggleSelecionado(card.id)}
                              aria-label={`Selecionar ${card.name || "card"}`} />
                          </span>

                          {gridCols.map(col => {
                            // As chaves com desenho próprio continuam com ele;
                            // trocar riqueza por texto cru seria pagar a grade
                            // com a cara da tela. O resto usa o `text()` que o
                            // próprio GRID_COLUMNS já definia — é ele, aliás,
                            // que sempre alimentou busca e ordenação, então o
                            // que se lê e o que se ordena continuam iguais.
                            let miolo: React.ReactNode;
                            switch (col.key) {
                              case "name":
                                miolo = (
                                  <span className="vnd-sales-row__lead">
                                    <span className="vnd-sales-row__avatar"><Av name={card.name || "Lead"} size={34} /></span>
                                    <span className="vnd-sales-row__identity">
                                      <span className="vnd-sales-row__name">
                                        <strong className="hbx-1linha">{card.name || "—"}</strong>
                                        {card.saleConfirmedAt && <span className="badge-win">Ganho</span>}
                                      </span>
                                      {identityMeta && <small className="hbx-1linha" title={identityMeta}>{identityMeta}</small>}
                                    </span>
                                  </span>
                                );
                                break;
                              case "icons":
                                miolo = (
                                  <span className="vnd-sales-row__signals" aria-label="Canais encontrados">
                                    {canais.slice(0, 3).map(canal => <CanalIcon key={canal} canal={canal} size="sm" />)}
                                  </span>
                                );
                                break;
                              case "status":
                                miolo = <RadarAiBadge status={aiStatusMap[card.radarLeadId || ""]} />;
                                break;
                              case "score":
                                miolo = <span className={"vnd-sales-score" + (score ? "" : " is-empty")}>{score || "—"}</span>;
                                break;
                              case "stage":
                                miolo = (
                                  <span className="vnd-sales-row__stage-copy">
                                    <strong className="hbx-1linha">{STAGE_LABEL[normalizeStage(card.status)]}</strong>
                                    <small className="hbx-1linha">{card.automation ? `Automação · passo ${card.automation.currentStep + 1}` : (card.leadTemperature || ag.label)}</small>
                                  </span>
                                );
                                break;
                              case "next":
                                miolo = (
                                  <span className="vnd-sales-row__stage-copy">
                                    <strong className="hbx-1linha">{card.nextAction || "—"}</strong>
                                    {nextMeta && <small className="hbx-1linha" title={nextMeta}>{nextMeta}</small>}
                                  </span>
                                );
                                break;
                              case "value":
                                miolo = <strong className="hbx-mono hbx-1linha">{dealPrimary}</strong>;
                                break;
                              case "owner":
                                miolo = <span className="hbx-1linha">{owner}</span>;
                                break;
                              case "engage":
                                miolo = <span className={engagement.className}>{engagement.label}</span>;
                                break;
                              case "agenda":
                                miolo = <span className={"vnd-chip vnd-chip--" + ag.tone}>{ag.label}</span>;
                                break;
                              default: {
                                const cru = col.text(card).trim();
                                miolo = (
                                  <span className={"hbx-1linha" + (col.mono ? " hbx-mono" : "")} title={cru || undefined}>
                                    {cru || "—"}
                                  </span>
                                );
                              }
                            }
                            return <span key={col.key} className="vnd-sales-td" data-col={col.key}>{miolo}</span>;
                          })}

                          <span className="vnd-sales-row__actions" onClick={event => event.stopPropagation()}>
                            <button type="button" aria-label="Ações do lead" title="Ações"
                              onClick={event => { setSel(card); setRowMenu({ id: card.id, x: event.clientX, y: event.clientY }); }}>⋯</button>
                            <button type="button" aria-label="Abrir ficha completa" title="Abrir ficha completa"
                              onClick={() => { setSel(card); setCockpitOpen(true); }}>
                              <I d={ICONS.arrow} size={14} />
                            </button>
                          </span>
                        </article>
                      );
                    })}
                    {listLeads.length === 0 && (
                      <div className="vnd-sales-list__empty">Nenhum lead encontrado.</div>
                    )}
                  </div>
                  </div>{/* /vnd-sales-grade */}

                  <footer className="vnd-sales-footer">
                    <span><strong>{listLeads.length}</strong> lead{listLeads.length === 1 ? "" : "s"} {listLeads.length === 1 ? "visível" : "visíveis"}</span>
                    <span aria-hidden="true">•</span>
                    <span><strong>{stageCounts.retorno}</strong> aguardando resposta</span>
                  </footer>
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
                                  // a ficha usa isto pra crescer de dentro DESTE card (e voltar pra ele)
                                  data-lead-id={card.id}
                                  className={"vnd-card" + (sel?.id === card.id ? " is-sel" : "") + (dragId === card.id ? " is-dragging" : "") + (card.block === "closed" ? " is-locked" : "")}
                                  draggable={card.block !== "closed"}
                                  tabIndex={0}
                                  aria-selected={sel?.id === card.id}
                                  onDragStart={card.block !== "closed" ? (e => onCardDragStart(e, card)) : undefined}
                                  onDragEnd={onCardDragEnd}
                                  onClick={() => selecionarLead(card)}
                                  onKeyDown={e => selecionarLeadNoTeclado(e, card)}
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
                                    {/* Selo de tentativa (S1 LEAD-CENTRICO): discreto, só quando já
                                        houve contato — nunca duplica o chip de agenda (ag) acima. */}
                                    {(card.attemptCount ?? 0) > 0 && (
                                      <span className="tag" title={`${card.attemptCount} tentativa${card.attemptCount === 1 ? "" : "s"} de contato`}>
                                        {card.attemptCount}º contato
                                      </span>
                                    )}
                                    {card.automation && <span className="tag warn" title={`Passo ${card.automation.currentStep + 1}`}>🤖 Robô ativo</span>}
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

                  {/* A alça entre a lista e a ficha do lead. O vendedor de
                      notebook e o de monitor grande param de herdar a mesma
                      conta de pixels — e cada máquina lembra da sua. */}
                  <Divisoria
                    chave="vendas-ficha"
                    variavel="--context-width"
                    padrao={345}
                    min={280}
                    max={720}
                    rotulo="Largura da ficha do lead"
                  />

                  <VendasLeadPreview
                    lead={sel}
                    canViewValues={canViewValues}
                    onClose={() => setSel(null)}
                    onExpand={() => setCockpitOpen(true)}
                    onSchedule={() => {
                      setRetornoData("");
                      setRetornoHora("09:00");
                      setObs("");
                      setSlotPreview(null);
                      setAcaoMsg(null);
                      setRetornoOpen(true);
                    }}
                  />
                </div>{/* /content (Meu funil) */}
            </div>{/* /vnd-layer funil */}

            <div id="vendas-panel-buscar" role="tabpanel" aria-labelledby="vendas-tab-buscar"
              className={"vnd-layer vnd-layer--buscar" + (modo === "buscar" ? " is-on" : "")} aria-hidden={modo !== "buscar"}>
              {buscarMounted ? (
                <LeadsClient
                  embedded
                  onLeadPulled={handlePulled}
                />
              ) : null}
            </div>{/* /vnd-layer buscar */}
          </div>{/* /vnd-stage */}
        </div>{/* /vnd-modehost */}


      {novoOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setNovoOpen(false); }}>
          <form className="hbx-modal" onSubmit={criarLead}
            style={{ width: "min(400px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Novo lead
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setNovoOpen(false)}>✕</span>
            </h3>
            {novoMsg && (
              <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: novoMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{novoMsg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--text-muted)" }}>Nome / Empresa</label>
              <input className="field-dark" required maxLength={120} value={novoForm.name}
                onChange={e => setNovoForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--text-muted)" }}>Telefone</label>
                <input className="field-dark" maxLength={24} placeholder="(11) 99999-9999" value={novoForm.phone}
                  onChange={e => setNovoForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--text-muted)" }}>E-mail</label>
                <input className="field-dark" type="email" placeholder="opcional" value={novoForm.email}
                  onChange={e => setNovoForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--text-muted)" }}>Próximo passo</label>
              <input className="field-dark" maxLength={140} value={novoForm.nextAction}
                onChange={e => setNovoForm(f => ({ ...f, nextAction: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--text-muted)" }}>Nota</label>
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
            {/* O menu nasce no ponto do clique. Como o ⋯ mora na ÚLTIMA coluna
                da grade, esse ponto fica colado na borda direita e o menu
                (210px) saía inteiro da tela — e nas últimas linhas saía também
                por baixo. O ref abaixo mede o menu já montado e o traz de volta
                pra dentro da janela nos dois eixos, antes do primeiro paint.
                Medir em vez de chutar a largura: o menu cresce com o nome do
                lead e com os itens que aparecem só às vezes (WhatsApp,
                Atendimento). */}
            <div className="vnd-rowmenu" role="menu" style={{ left: rowMenu.x, top: rowMenu.y }}
              ref={el => {
                if (!el) return;
                const folga = 8;
                const r = el.getBoundingClientRect();
                const x = Math.max(folga, Math.min(rowMenu.x, window.innerWidth - r.width - folga));
                const y = Math.max(folga, Math.min(rowMenu.y, window.innerHeight - r.height - folga));
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
              }}>
              <span className="vnd-rowmenu__title">{card.name || "Lead"}</span>
              <button type="button" role="menuitem" onClick={() => { fechar(); setSel(card); setCockpitOpen(true); }}>
                Abrir
              </button>
              <button type="button" role="menuitem" disabled={card.block === "closed"}
                onClick={() => { fechar(); setSel(card); abrirFechar(); }}>
                <I d={ICONS.money} size={13} /> Fechar venda
              </button>
              <button type="button" role="menuitem" disabled={card.block === "closed"}
                onClick={() => { fechar(); setSel(card); setRetornoData(""); setRetornoHora("09:00"); setObs(""); setSlotPreview(null); setAcaoMsg(null); setRetornoOpen(true); }}>
                <I d={ICONS.clock} size={13} /> Agendar disparo
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

      {/* CENTRAL DO LEAD (28/07): o Detalhes reescrito do zero no desenho
          aprovado. key por lead = estado zerado a cada card (fetches/abas
          não vazam de um lead pro outro). */}
      {cockpitOpen && sel && (
        <CentralDoLead
          key={sel.id}
          lead={sel}
          canViewValues={Boolean(board?.canViewValues)}
          open={cockpitOpen}
          onClose={() => setCockpitOpen(false)}
          onConversationChanged={loadBoard}
        />
      )}

      {prospOpen && (
        <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) setProspOpen(false); }}>
          <div className="hbx-drawer" style={{ width: 340, height: "100vh", overflowY: "auto", padding: "18px 16px", display: "grid", gap: 14, alignContent: "start" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-n2)", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Automações comerciais
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setProspOpen(false)}>✕</span>
            </h3>
            {/* S5 LEAD-CENTRICO (05-agenda-slots.md): config comercial ENXUTA — 1
                cartão, 3 campos + salvar. Vale prAutomação por lead (S4) e pra prospecção
                antiga enquanto ela existir (S7 remove o cadastro imenso, não isto). */}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="field-label">Horário e teto de disparo</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "grid", gap: 4, fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>
                  Início
                  <input className="field-dark" type="time" value={comercialConfigDraft.workingHoursStart}
                    disabled={!podeConfigurarDisparo}
                    onChange={e => setComercialConfigDraft(d => ({ ...d, workingHoursStart: e.target.value }))}
                    aria-label="Início do horário comercial" />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>
                  Fim
                  <input className="field-dark" type="time" value={comercialConfigDraft.workingHoursEnd}
                    disabled={!podeConfigurarDisparo}
                    onChange={e => setComercialConfigDraft(d => ({ ...d, workingHoursEnd: e.target.value }))}
                    aria-label="Fim do horário comercial" />
                </label>
              </div>
              <label style={{ display: "grid", gap: 4, fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>
                Teto de disparos por dia (por vendedor/chip)
                <input className="field-dark" type="number" min={1} max={200} value={comercialConfigDraft.dailyLimitPerSender}
                  disabled={!podeConfigurarDisparo}
                  onChange={e => setComercialConfigDraft(d => ({ ...d, dailyLimitPerSender: e.target.value }))}
                  aria-label="Teto de disparos por dia" />
                {tetoEfetivo != null && tetoEfetivo < (Number(comercialConfigDraft.dailyLimitPerSender) || 0) && (
                  <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--hbx-warning)" }}>
                    Na prática saem {tetoEfetivo} primeiros contatos por dia — é o freio que protege o chip.
                  </span>
                )}
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>
                Intervalo mínimo entre disparos (minutos)
                <input className="field-dark" type="number" min={1} max={240} value={comercialConfigDraft.intervalMinutes}
                  disabled={!podeConfigurarDisparo}
                  onChange={e => setComercialConfigDraft(d => ({ ...d, intervalMinutes: e.target.value }))}
                  aria-label="Intervalo mínimo entre disparos" />
              </label>
              {podeConfigurarDisparo ? (
                <React.Fragment>
                  {comercialConfigMsg && (
                    <span style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: comercialConfigMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{comercialConfigMsg}</span>
                  )}
                  <button className="btn-ghost" onClick={salvarComercialConfig} disabled={comercialConfigBusy}>
                    {comercialConfigBusy ? "Salvando…" : "Salvar horário e teto"}
                  </button>
                </React.Fragment>
              ) : (
                <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Somente o dono ou gerente pode alterar. O restante do time apenas visualiza.</span>
              )}
            </div>
            {/* CATÁLOGO COMERCIAL (30/07): sem catálogo a IA é PROIBIDA de afirmar
                produto/preço (nasceu do Copiloto oferecendo "gestão fiscal" pra
                distribuidora de água). O selo diz o estado; a lacuna cobra o que falta. */}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="field-label">O que a sua empresa vende</div>
              {catalogoInfo && (
                <span className={"tag" + (catalogoInfo.pronto ? " teal" : " warn")} style={{ justifySelf: "start" }}>
                  {catalogoInfo.pronto ? "Catálogo pronto — a IA pode ofertar" : "Sem catálogo — a IA não oferta produto"}
                </span>
              )}
              <label style={{ display: "grid", gap: 4, fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>
                O que vendemos (uma linha)
                <input className="field-dark" maxLength={240} value={catalogoDraft.oQueVendemos}
                  disabled={!podeConfigurarDisparo}
                  onChange={e => setCatalogoDraft(d => ({ ...d, oQueVendemos: e.target.value }))}
                  aria-label="O que a empresa vende" />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>
                Capacidades — uma por linha (opcional: "| dores que resolve")
                <textarea className="field-dark" rows={4} value={catalogoDraft.capacidades}
                  disabled={!podeConfigurarDisparo}
                  placeholder={"Entrega no mesmo dia | atraso, cliente esperando\nPedido pelo WhatsApp"}
                  onChange={e => setCatalogoDraft(d => ({ ...d, capacidades: e.target.value }))}
                  aria-label="Capacidades do produto, uma por linha" />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>
                Para quem serve (separe por vírgula)
                <input className="field-dark" value={catalogoDraft.paraQuem}
                  disabled={!podeConfigurarDisparo}
                  onChange={e => setCatalogoDraft(d => ({ ...d, paraQuem: e.target.value }))}
                  aria-label="Para quem o produto serve" />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>
                Se perguntarem preço (opcional)
                <input className="field-dark" maxLength={240} value={catalogoDraft.ancoraDePreco}
                  disabled={!podeConfigurarDisparo}
                  onChange={e => setCatalogoDraft(d => ({ ...d, ancoraDePreco: e.target.value }))}
                  aria-label="Comparação de preço autorizada" />
              </label>
              {podeConfigurarDisparo ? (
                <React.Fragment>
                  {catalogoInfo && !catalogoInfo.pronto && catalogoInfo.lacunas.length > 0 && (
                    <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Falta: {catalogoInfo.lacunas.join(" · ")}</span>
                  )}
                  {catalogoMsg && (
                    <span style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: catalogoMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{catalogoMsg}</span>
                  )}
                  <button className="btn-ghost" onClick={salvarCatalogo} disabled={catalogoBusy}>
                    {catalogoBusy ? "Salvando…" : "Salvar catálogo"}
                  </button>
                </React.Fragment>
              ) : (
                <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Somente o dono ou gerente pode alterar.</span>
              )}
            </div>
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
            {/* S7 LEAD-CENTRICO (07-pool-raiz.md, item 2 "matar o puxa→dispara
                PELA RAIZ"): o cadastro imenso de "Bot de prospecção" (iniciar/
                pausar/retomar/cancelar campanha + contadores) SOMEU daqui — o
                backend recusa criação/retomada de campanha nova com mensagem
                clara (vendas-automation.service.ts). O único caminho de
                disparo comercial que resta é o robozinho POR LEAD (aba
                Planejar, dentro do lead — S4) usando a config enxuta acima. */}
          </div>
        </div>
      )}

      {agendaOpen && (
        <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) setAgendaOpen(false); }}>
          <div className="hbx-drawer" style={{ width: 340, height: "100vh", overflowY: "auto", padding: "18px 16px", display: "grid", gap: 14, alignContent: "start" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-n2)", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Agenda de retornos
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setAgendaOpen(false)}>✕</span>
            </h3>
            {syncMsg && (
              <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: syncMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{syncMsg}</div>
            )}
            <button className="btn-teal" onClick={sincronizarHoje} disabled={syncBusy}>
              <WhatsAppMark size={15} /> {syncBusy ? "Sincronizando…" : "Sincronizar hoje no WhatsApp"}
            </button>
            {([["Atrasados", board?.blocks?.overdue || []], ["Hoje", board?.blocks?.today || []], ["Agendados", board?.blocks?.scheduled || []]] as [string, VendasLead[]][]).map(([label, cards]) => (
              <div key={label} style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <strong style={{ fontSize: "var(--fz-l1)" }}>{label}</strong>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>{cards.length}</span>
                </div>
                {cards.length === 0 && <span style={{ fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>Nenhum retorno.</span>}
                {cards
                  .slice()
                  .sort((a, b) => String(a.returnAt || "").localeCompare(String(b.returnAt || "")))
                  .map(card => (
                    <button key={card.id} onClick={() => { setSel(card); setAgendaOpen(false); }}
                      style={{ display: "grid", gap: 3, textAlign: "left", padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", cursor: "pointer", fontFamily: "var(--font-body)", color: "var(--text-strong)" }}>
                      <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong style={{ fontSize: "var(--fz-l2)" }}>{card.name || "—"}</strong>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtWhen(card.returnAt)}</span>
                      </span>
                      <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>{card.nextAction || card.statusLabel}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Popup: Agendar DISPARO (S1 correção do noturno — deixou de ser lembrete).
          Data + hora obrigatórias; o preview vem do MESMO motor que reserva no
          Confirmar, então o que está escrito aqui é o que vai acontecer. */}
      {retornoOpen && sel && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setRetornoOpen(false); }}>
          <div className="hbx-modal vnd-popup" onClick={e => e.stopPropagation()}>
            <div className="vnd-popup__head">
              <span className="vnd-popup__title">Agendar disparo — {sel.name || "lead"}</span>
              <button className="vnd-popup__close" onClick={() => setRetornoOpen(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="vnd-popup__body">
              {acaoMsg && (
                <div className={"ctx-msg " + (acaoMsg.startsWith("✓") ? "ok" : "err")}>{acaoMsg}</div>
              )}
              <div className="vnd-popup__field">
                <label className="dn-cockpit__label">Dia e hora do disparo</label>
                <div style={{ display: "flex", gap: "calc(0.5rem * var(--hbx-font-scale-inverse))" }}>
                  <input className="field-dark" type="date" value={retornoData} style={{ flex: 2 }}
                    onChange={e => { setRetornoData(e.target.value); setSlotPreview(null); }}
                    aria-label="Dia do disparo" />
                  <input className="field-dark" type="time" value={retornoHora} step={300} style={{ flex: 1 }}
                    onChange={e => { setRetornoHora(e.target.value); setSlotPreview(null); }}
                    aria-label="Hora do disparo" />
                </div>
                {retornoData && retornoHora && (
                  <span style={{ fontSize: "var(--fz-m2)", color: slotPreview?.conflito ? "var(--hbx-warning)" : "var(--text-muted)" }}>
                    {slotPreviewBusy
                      ? "Consultando agenda…"
                      : slotPreview
                        ? (slotPreview.resumo || `Dispara ${fmtQuandoHora(slotPreview.slot)}`)
                        : null}
                  </span>
                )}
              </div>
              <div className="vnd-popup__field">
                <label className="dn-cockpit__label">Objetivo (opcional)</label>
                <textarea className="field-dark" rows={2} maxLength={200}
                  value={obs} onChange={e => setObs(e.target.value)} />
              </div>
              {/* "Armar bot" morreu (31/07/2026): quem libera é a ENTREVISTA em
                  /automacao — o aviso encaminha pra lá, nunca mais pro suporte. */}
              {retornoData && sel.block !== "closed" && botStatus?.botModuleEnabled && !botStatus?.botArmed && (
                <div className="bot-warn">
                  <span className="warn-lbl">A IA ainda não sabe o que sua empresa faz.</span>
                  <button className="btn-ghost" onClick={() => router.push("/automacao")}>
                    Responder em Automação
                  </button>
                </div>
              )}
              <div className="vnd-popup__foot">
                <button className="btn-ghost" onClick={() => setRetornoOpen(false)}>Cancelar</button>
                <button className="btn-teal" onClick={agendarDisparo} disabled={!retornoData || !retornoHora || acaoBusy}>
                  {acaoBusy ? "Agendando…" : "Agendar disparo"}
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
                </button>
                <button type="button" className="vnd-si-opt"
                  onClick={() => (excluirMotivoOpen === "bulk" ? excluirSelecionados("unsatisfactory") : deletarCard("unsatisfactory"))}
                  disabled={bulkDeleteBusy || deleteBusy}>
                  Resultado não satisfatório
                </button>
              </div>
              <div className="vnd-popup__foot">
                <button className="btn-ghost" onClick={() => setExcluirMotivoOpen(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup: motivo de encerramento (S4 LEAD-CENTRICO, 04-robozinho.md item 5) —
          obrigatório no backend ao soltar um card na coluna "Encerrado". Alimenta
          S7 (marquinha/pool) e o reembolso futuro. */}
      {closureReasonPrompt && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setClosureReasonPrompt(null); }}>
          <div className="hbx-modal vnd-popup" onClick={e => e.stopPropagation()}>
            <div className="vnd-popup__head">
              <span className="vnd-popup__title">Por que está encerrando?</span>
              <button className="vnd-popup__close" onClick={() => setClosureReasonPrompt(null)} aria-label="Fechar">✕</button>
            </div>
            <div className="vnd-popup__body">
              {acaoMsg && <div className="ctx-msg err">{acaoMsg}</div>}
              <div className="vnd-si-opts">
                {([
                  { key: "convertido", label: "Convertido" },
                  { key: "sem_interesse", label: "Sem interesse" },
                  { key: "nao_atendeu", label: "Não atendeu" },
                  { key: "contato_invalido", label: "Contato inválido" },
                  { key: "outro", label: "Outro motivo" },
                ] as { key: string; label: string }[]).map(opt => (
                  <button key={opt.key} type="button" className="vnd-si-opt"
                    onClick={() => confirmarEncerramento(opt.key)}
                    disabled={closureReasonBusy}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="vnd-popup__foot">
                <button className="btn-ghost" onClick={() => setClosureReasonPrompt(null)}>Cancelar</button>
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
