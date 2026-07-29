"use client";

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  DetalhesNegocio — card unificado (3 telas: Vendas, Atendimento, Leads)    │
// │                                                                             │
// │  ZONAS DO CARD                                                              │
// │  ZONA 1 "Quem é": header + score ring + oportunidade (1 frase) +           │
// │    fileira de canais tri-cor + bloco empresa (CNPJ/razão/CNAE/sócio)       │
// │  [costura "O que fazer"]                                                    │
// │  ZONA 2 "O que fazer": ações + meta compacta + histórico recolhido          │
// │                                                                             │
// │  S9 LEAD-CENTRICO: o gate por TIER do plano (list/lead/full) foi removido  │
// │  — era paywall morto desde o crédito virar modelo único (bacb2725). Todo   │
// │  dado do lead (inteligência + empresa) é sempre exibido.                    │
// │                                                                             │
// │  HUMANIZAÇÃO: zero snake_case na tela. Mapa central LABEL_MAP.             │
// └─────────────────────────────────────────────────────────────────────────────┘

// REGRA SAGRADA: o efeito de máquina de escrever vive nas classes
// .dn-root / .dn-kv-row / .dn-skel (transitions.css + kit.css).
// NÃO editar essas classes. Todo campo novo entra na estrutura .dn-kv-row
// para herdar o efeito automaticamente.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS, PhotoLightbox, WhatsAppMark } from "@/components/hbx/shell";
import { CanalIcon, type Canal, toCanal } from "@/components/hbx/canal-icon";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { useWaOpenMode } from "@/lib/wa-open-mode";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatBrCnae, formatBrCnpj } from "@/lib/br-document";
import type { ChannelPresence } from "@/lib/radar-channel-presence";
import { buildWaLink, buildWaMessage } from "@/lib/wa-link";

// ── Humanização: mapa de snake_case → label legível ──────────────────────────
// Tudo que pode aparecer cru (painType, recommendedChannel, tags, status) passa
// por humanize() antes de entrar em tela.
const LABEL_MAP: Record<string, string> = {
  // PainType
  sem_site: "Sem site",
  site_fraco: "Site fraco",
  whatsapp_desorganizado: "WhatsApp desorganizado",
  alta_demanda: "Alta demanda",
  pouca_presenca: "Pouca presença digital",
  sem_social: "Sem redes sociais",
  sem_email: "Sem e-mail público",
  // RadarRecommendedChannel
  whatsapp: "WhatsApp",
  email: "E-mail",
  call: "Ligação",
  review: "Avaliar",
  discard: "Descartar",
  telefone: "Telefone",
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
  // RadarSocialStatus
  found: "Encontrado",
  partial: "Parcial",
  candidate_review: "Revisar",
  missing: "Ausente",
  weak: "Fraco",
  error: "Erro",
  unknown: "Desconhecido",
  // WeaknessTags
  sem_site_oficial: "Sem site oficial",
  sem_rede_social_confirmada: "Sem rede social confirmada",
  sem_email_publico_confirmado: "Sem e-mail público confirmado",
  whatsapp_nao_confirmado: "WhatsApp não confirmado",
  // ContactQuality
  blocked: "Bloqueado",
  good: "Boa",
  fair: "Razoável",
  // WebsiteStatus
  none: "Sem site",
  present: "Com site",
  social_only: "Só redes sociais",
  unreachable: "Site inacessível",
  // Source
  webscraping: "Radar Digital",
  manual: "Manual",
  meta_lead_ads: "Anúncio (Meta)",
  website_form: "Site próprio",
  // leadTemperature
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
  // companySituation
  ativa: "Ativa",
};

// Exportado (LEAD-COCKPIT, 11/07): o cockpit do lead reusa o MESMO vocabulário
// humanizado (canal/dor/fonte/situação) em vez de criar um segundo mapa.
export function humanize(raw: string | null | undefined): string {
  if (!raw) return "—";
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return LABEL_MAP[key] || raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Payloads do motor são dados operacionais, não conteúdo para o cliente. */
export function clientTimelineDescription(raw: string | null | undefined): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (/^[{[]/.test(text)) return "";
  if (/(?:asyncEnrichmentJobs|postDeliveryJobs|enrichmentJobSummary|traceId|lastError)/i.test(text)) return "";
  return text;
}

// ── Seções secundárias: ocultas sob o chevron "Mais detalhes" (default fechado)
const CARD_SECONDARY: string[] = [
  "detalhes",
  "intelligence",
  "origin",
  "dates",
];

// ── Modelo normalizado ────────────────────────────────────────────────────────

export type NegocioDetailHistory = {
  id: string;
  title?: string | null;
  description?: string | null;
  resultLabel?: string | null;
  returnAt?: string | null;
  createdAt?: string | null;
};

export type NegocioSale = {
  statusLabel?: string | null;
  status?: string | null;
  valueLabel?: string | null;
  /** @deprecated use valueLabel */
  value?: number | null;
  commissionLabel?: string | null;
  commissionValueLabel?: string | null;
  setupLabel?: string | null;
  /** @deprecated passado diretamente — use commissionValueLabel */
  commissionStatusLabel?: string | null;
  /** @deprecated use commissionValueLabel */
  commissionAmount?: number | null;
  setupValue?: number | null;
  setupCommissionStatusLabel?: string | null;
  setupCommissionAmount?: number | null;
  // detalhe de comissão estendido
  commissionDueAt?: string | null;       // vence em
  commissionRecurring?: boolean | null;  // recorrente?
  commissionNote?: string | null;        // nota da comissão
};

// Fachada canônica Vendas ↔ conversa. Estes tipos são compartilhados pelo
// board, pelo cockpit e pela casca mobile para que todos mostrem o MESMO estado
// comercial sem inferir resposta a partir de `isInInbox`.
export type VendasConversationRef = {
  id?: string | null;
  exists?: boolean | null;
  contact?: string | null;
  channel?: string | null;
  linkedAt?: string | null;
};

export type VendasEngagementState =
  | "no_conversation"
  | "no_messages"
  | "queued"
  | "sending"
  | "awaiting_reply"
  | "replied"
  | "failed"
  | "canceled";

export type VendasEngagementSnapshot = {
  state?: VendasEngagementState | null;
  hasSuccessfulOutbound?: boolean | null;
  hasInboundMessage?: boolean | null;
  hasInboundReply?: boolean | null;
  firstSuccessfulOutboundAt?: string | null;
  lastOutboundAt?: string | null;
  lastOutboundStatus?: string | null;
  lastInboundAt?: string | null;
  lastMessageAt?: string | null;
  lastMessageDirection?: string | null;
  lastMessageStatus?: string | null;
  lastMessagePreview?: string | null;
  failureReason?: string | null;
};

export type VendasConversationSnapshot = {
  conversation?: VendasConversationRef | null;
  engagement?: VendasEngagementSnapshot | null;
};

const VENDAS_ENGAGEMENT_META: Record<VendasEngagementState, { label: string; className: string }> = {
  no_conversation: { label: "Sem conversa", className: "tag" },
  no_messages: { label: "Sem mensagens", className: "tag" },
  queued: { label: "Na fila", className: "tag warn" },
  sending: { label: "Enviando", className: "tag warn" },
  awaiting_reply: { label: "Aguardando resposta", className: "tag warn" },
  replied: { label: "Cliente respondeu", className: "tag teal" },
  failed: { label: "Falha no envio", className: "tag red" },
  canceled: { label: "Envio cancelado", className: "tag red" },
};

function normalizeEngagementState(
  engagement?: VendasEngagementSnapshot | null,
  conversation?: VendasConversationRef | null,
): VendasEngagementState {
  const raw = String(engagement?.state || "").trim().toLowerCase() as VendasEngagementState;
  if (Object.prototype.hasOwnProperty.call(VENDAS_ENGAGEMENT_META, raw)) return raw;

  const status = String(engagement?.lastMessageStatus || engagement?.lastOutboundStatus || "").trim().toUpperCase();
  if (status === "FAILED") return "failed";
  if (status === "CANCELED" || status === "CANCELLED") return "canceled";
  if (engagement?.hasInboundReply) return "replied";
  if (status === "QUEUED" || status === "PENDING") return "queued";
  if (status === "SENDING" || status === "PROCESSING") return "sending";
  if (engagement?.hasSuccessfulOutbound) return "awaiting_reply";
  return conversation?.exists || conversation?.id ? "no_messages" : "no_conversation";
}

export function vendasEngagementMeta(
  engagement?: VendasEngagementSnapshot | null,
  conversation?: VendasConversationRef | null,
): { state: VendasEngagementState; label: string; className: string } {
  const state = normalizeEngagementState(engagement, conversation);
  return { state, ...VENDAS_ENGAGEMENT_META[state] };
}

export type NegocioDetail = {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
  online?: boolean;

  phone?: string | null;
  email?: string | null;
  website?: string | null;
  channel?: string | null;
  /** Presença sanitizada: colore canais sem revelar valores ou criar links. */
  channelPresence?: ChannelPresence | null;
  // Multi-contatos acumulados pelo scraper (até 3) — captura-e-acumula, nunca descarta.
  emails?: string[] | null;
  phones?: string[] | null;
  // Mapa digits→tem WhatsApp? (motor dedicado). Telefone extra só é exibido se confirmado aqui.
  phonesWhatsapp?: Record<string, boolean> | null;
  cnpj?: string | null;
  cnae?: string | null;
  razaoSocial?: string | null;
  ownerName?: string | null;
  ownerNames?: string[] | null;
  // WORM-16: PESSOAS estruturadas (sócio da Receita = nome + cargo). Cada uma vira linha na
  // seção "Pessoas" com botão wa.me + copiar. Opcional — card antigo sem `people` não mostra a seção.
  people?: Array<{ name: string; role?: string | null; source?: string | null; phoneDigits?: string | null }> | null;
  // Dados PESSOAIS do dono/sócio (L4 CNPJ→qsa).
  ownerPhone?: string | null;
  ownerInstagram?: string | null;
  ownerFacebook?: string | null;
  companySituation?: string | null;

  city?: string | null;
  state?: string | null;
  segment?: string | null;
  address?: string | null;

  statusLabel?: string | null;
  doNotCall?: boolean;
  leadTemperature?: string | null;

  valueLabel?: string | null;
  /** @deprecated use valueLabel */
  value?: string | null;
  productName?: string | null;
  rating?: number | null;
  reviews?: number | null;
  opportunityScore?: number | null;

  returnAt?: string | null;
  lastContactAt?: string | null;
  lastMessageAt?: string | null;
  attemptCount?: number | null;
  owner?: { name?: string | null; avatarUrl?: string | null } | null;
  nextAction?: string | null;
  shortNote?: string | null;
  lastResult?: string | null;
  timesSeen?: number | null;
  botActive?: boolean | null;
  humanAssigned?: boolean | null;
  isInInbox?: boolean | null;
  conversation?: VendasConversationRef | null;
  engagement?: VendasEngagementSnapshot | null;

  // enriquecimento
  enriched?: boolean;

  // datas meta
  createdAt?: string | null;
  updatedAt?: string | null;

  // origem
  sourceType?: string | null;
  primarySource?: string | null;
  /** Cadeia de fontes reais do card (P1, 02/07): "rfb" | "web" | "rfb+web". Opcional — ausente
   * em cards antigos, badge simplesmente não aparece. */
  sourceChain?: string | null;
  /** HOT-07 (empresa recém-aberta): true quando a empresa abriu há ≤30 dias
   * (openedAt do CnpjPublicCompany, casado no enriquecimento). Opcional — ausente
   * em leads sem CNPJ casado, badge 🐣 simplesmente não aparece. */
  isFreshCompany?: boolean | null;
  /** Dias desde a abertura da empresa (companheiro de isFreshCompany). */
  daysSinceOpened?: number | null;

  // camada de inteligência (leadIntelligence enriquecida)
  leadIntelligence?: {
    whatsappStatus?: string | null;
    emailStatus?: string | null;
    websiteStatus?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    opportunityReason?: string | null;
    leadReasonTags?: string[] | null;
    recommendedChannel?: string | null;
    painType?: string | null;
    painPitch?: string | null;
    // O board serializa templates[0] do enrichment: pode vir string OU objeto
    // {id,context,tone,text}. Renderizar o objeto cru estoura React #31.
    messageTemplate?: string | { id?: string; context?: string; tone?: string; text?: string } | null;
    contactQuality?: string | null;
  } | null;

  sale?: NegocioSale | null;
  history?: NegocioDetailHistory[] | null;
  observations?: string | null;
};

// ── Props ─────────────────────────────────────────────────────────────────────

export type DetalhesNegocioProps = {
  detail?: NegocioDetail | null;
  /** @deprecated use detail */
  negocio?: NegocioDetail | null;

  title?: string;
  onClose?: () => void;
  /**
   * LEAD-COCKPIT (PR11072026): quando presente, renderiza o botão de expandir
   * (⤢) ao lado do ✕ do header — abre o cockpit do lead (overlay grande).
   * OPCIONAL e opt-in: ausente = DOM idêntico ao atual (Atendimento/Leads
   * intactos; só Vendas passa).
   */
  onExpand?: () => void;
  heroAction?: React.ReactNode;
  /** Slot opcional para coroa de enriquecido (preenchido pelo PLAN-C) */
  crownSlot?: React.ReactNode;
  actions?: React.ReactNode;
  emptyHint?: string;
  /** Exclui o card e devolve ao pool — aparece como 7° ícone na fileira de canais */
  onDelete?: () => void;

  /** quando true exibe skeleton shimmer nos campos que vêm da API de card */
  loading?: boolean;

  /**
   * Estado "enriquecendo AGORA" — o MEIO entre `loading` (card inteiro carregando
   * do backend) e a coroa `enriched` (motor já terminou). Quando true:
   *  - acende o selo "✨ Enriquecendo…" no header;
   *  - campos ainda vazios mas que o motor busca (telefone, e-mail, segmento,
   *    CNPJ, razão, sócio) viram shimmer em vez de "Sem X neste card." (não
   *    afirma ausência enquanto ainda procura).
   * Quando o dado chega, o campo assenta sozinho (reusa TypedText). Default
   * `false` → card sem a prop é IDÊNTICO ao comportamento de hoje.
   * Como o pai liga: `enriching={enrichmentStatus === 'pending' || 'partial'}`
   * (enum do pipeline RadarPipelineEnrichmentStatus no backend).
   */
  enriching?: boolean;

  // ── compat props ─────────────────────────────────────────────────────────
  /** @deprecated passe pelo slot heroAction */
  waPhone?: string | null;
  /** @deprecated passe pelo slot heroAction */
  waName?: string | null;
  /** @deprecated passe pelo slot heroAction */
  waQrActive?: boolean;
  /** @deprecated passe pelo slot heroAction */
  waCanInternal?: boolean;
  /** @deprecated passe pelo slot heroAction */
  onWaOpenExternal?: () => void;
  /** @deprecated passe pelo slot heroAction */
  onWaOpenInternal?: () => void;
  /** @deprecated passe pelo slot heroAction */
  waStartBusy?: boolean;
  /** @deprecated passe pelo slot heroAction */
  waStartError?: string | null;

  obsDraft?: string;
  onObsChange?: (v: string) => void;
  onObsSave?: () => void;
  obsBusy?: boolean;
  onToggleDoNotCall?: () => void;
  /**
   * Chamado quando o operador escolhe "Sem interesse" + motivo no Atendimento.
   * Se passado, substitui o botão "Não ligar mais" por "Sem interesse" com submenu de motivos.
   * O callback recebe o slug do motivo (ex: "sem_interesse", "ja_tem", "preco", "sem_perfil").
   */
  onSemInteresse?: (reason: string) => void;
  historyLabel?: string;
  kvExtra?: React.ReactNode;

  /**
   * WORM-11 — conversa WhatsApp embutida no card (não alterna de tela).
   * Quando `true` e o lead tem telefone, o CENTRO do card ganha as abas
   * WhatsApp / E-mail com o thread da conversa (lido/enviado pela rotina NORMAL
   * do Atendimento — `/inbox/conversations/*`), mais o toggle "IA por conversa".
   * Default `true`: o painel é o CENTRO do card (spec WORM-11). É "click-to-open" —
   * NÃO bate no motor até o usuário clicar "Abrir conversa", então aparecer em todo
   * card é barato (nenhuma chamada automática ao Webwhats). Uma tela que já tem o
   * thread cheio (Atendimento) pode passar `showConversation={false}` para suprimir.
   */
  showConversation?: boolean;

  /**
   * Opt-in exclusivo do módulo Vendas. Quando presente, ConversationPanel usa
   * a fachada `/vendas/lead/:leadId/conversation*`; consumidores antigos sem a
   * prop continuam no fluxo legado do Atendimento.
   */
  conversationLeadId?: string | null;
  onConversationChanged?: (snapshot?: VendasConversationSnapshot) => void | Promise<void>;

  /**
   * Agenda embutida do lead (pedido do dono, item 2 da revisão — "mover
   * agenda pra dentro do card já puxado"). Quando `true`, renderiza a lista de
   * compromissos (Atividades) do lead + criação já vinculada, usando
   * `/atividades/lead/:leadId` (endpoint que já existia, nunca consumido por
   * nenhuma tela). Exige `detail.id` = id do VendasLead — por isso é opt-in
   * (default `false`): Atendimento/Leads/casca continuam idênticos.
   */
  showAgenda?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatPhoneDisplay(value: string | null | undefined): string {
  const original = String(value || "").trim();
  if (!original) return "—";

  let digits = original.replace(/\D/g, "");
  let country = "";
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    country = "+55 ";
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return `${country}(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${country}(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return original;
}

function fmtSourceLabel(sourceType?: string | null, primarySource?: string | null) {
  const src = String(primarySource || sourceType || "").trim().toLowerCase();
  return humanize(src) || "—";
}

// sourceChain (P1, 02/07 — cutover ordem fixa): rótulo amigável da cadeia real de fontes.
const SOURCE_CHAIN_LABEL: Record<string, string> = {
  rfb: "Receita Federal",
  web: "Web",
  "rfb+web": "Receita Federal + Web",
};

function fmtSourceChainLabel(sourceChain?: string | null): string | null {
  const key = String(sourceChain || "").trim().toLowerCase();
  if (!key) return null;
  return SOURCE_CHAIN_LABEL[key] || null;
}

// HOT-07 (empresa recém-aberta): rótulo do badge de urgência. Só monta texto
// quando o backend confirma isFreshCompany — sem isso o badge nem entra no DOM.
function fmtFreshCompanyBadge(isFreshCompany?: boolean | null, daysSinceOpened?: number | null): string | null {
  if (!isFreshCompany) return null;
  const days = Math.max(0, Math.trunc(Number(daysSinceOpened ?? 0)) || 0);
  if (days <= 0) return "🐣 Aberta hoje";
  if (days === 1) return "🐣 Aberta há 1 dia";
  return `🐣 Aberta há ${days} dias`;
}

const STATE_FULL: Record<string, string> = {
  AC:"Acre",AL:"Alagoas",AM:"Amazonas",AP:"Amapá",BA:"Bahia",CE:"Ceará",DF:"Distrito Federal",
  ES:"Espírito Santo",GO:"Goiás",MA:"Maranhão",MG:"Minas Gerais",MS:"Mato Grosso do Sul",
  MT:"Mato Grosso",PA:"Pará",PB:"Paraíba",PE:"Pernambuco",PI:"Piauí",PR:"Paraná",
  RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",RO:"Rondônia",RR:"Roraima",
  RS:"Rio Grande do Sul",SC:"Santa Catarina",SE:"Sergipe",SP:"São Paulo",TO:"Tocantins",
};

function buildLocationLine(
  city: string | null | undefined,
  state: string | null | undefined,
  address: string | null | undefined,
): string {
  const base = `${city}${state ? `, ${state}` : ""}`;
  if (!address) return base;

  const cep = (address.match(/\d{5}-?\d{3}/) || [])[0]?.replace(/(\d{5})-?(\d{3})/, "$1-$2") ?? null;

  const stateUpper = (state || "").trim().toUpperCase();
  const stateFull = STATE_FULL[stateUpper] || "";
  const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let street = address
    .replace(/\d{5}-?\d{3}/g, "")
    .replace(city ? new RegExp(`,?\\s*${escRx(city)}`, "gi") : /(?:)/, "")
    .replace(stateFull ? new RegExp(`,?\\s*${escRx(stateFull)}`, "gi") : /(?:)/, "")
    .replace(stateUpper ? new RegExp(`,?\\s*\\b${escRx(stateUpper)}\\b`, "g") : /(?:)/, "")
    .replace(/[,\s]+$/g, "").replace(/^[,\s]+/, "")
    .trim();

  if (/^atendimento\s+online$/i.test(street) || /^online$/i.test(street)) {
    street = "";
  }

  let result = base;
  if (street) result += ` - ${street}`;
  if (cep) result += ` CEP ${cep}`;
  return result;
}

// ── TypedText — efeito de digitação letra por letra ───────────────────────────

function TypedTextCore({ text, speed, delay }: { text: string; speed: number; delay: number }) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) { return; }
    let iv: ReturnType<typeof setInterval>;
    const timer = setTimeout(() => {
      let i = 0;
      iv = setInterval(() => {
        i++;
        setShown(text.slice(0, i));
        if (i >= text.length) { clearInterval(iv); setDone(true); }
      }, speed);
    }, delay);
    return () => { clearTimeout(timer); clearInterval(iv); };
  }, [text, speed, delay]);

  return <span className={"dn-typed" + (done ? " done" : "")} title={text}>{shown}</span>;
}

function TypedText({ text, speed = 48, delay = 0 }: { text: string; speed?: number; delay?: number }) {
  return <TypedTextCore key={text} text={text} speed={speed} delay={delay} />;
}

// ── FieldSkel — placeholder pulsante de VALOR pendente (enriquecendo) ─────────
// Marca o 3º estado por campo: "estou buscando isto agora". Some sozinho quando
// o dado chega (o campo real volta a renderizar via TypedText). Só largura —
// toda cor/shimmer vive na classe central .dn-field-skel (kit.css).
function FieldSkel({ variant }: { variant?: "wide" | "full" }) {
  const cls = "dn-field-skel" + (variant ? ` dn-field-skel--${variant}` : "");
  return <span className={cls} aria-hidden="true" />;
}

// ── Bloco recolhível para textos longos ───────────────────────────────────────

function CollapsibleText({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dn-collapsible">
      <button className="dn-collapsible-toggle" onClick={() => setOpen(o => !o)} type="button">
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.16s" }}>
          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <p className="dn-collapsible-body">{text}</p>}
    </div>
  );
}

// ⤢ Expandir (maximize) — botão opcional do header que abre o cockpit do lead
// (LEAD-COCKPIT). Traço no padrão do kit de ícones (stroke, currentColor).
const EXPAND_ICON_D = ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"];

// ── Chevron SVG (expand/collapse) ─────────────────────────────────────────────

function ChevronDown() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M3 5l3.5 3.5L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Score ring circular ───────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div className="dn-score-ring-wrap" title={`Score de oportunidade: ${score}/100`}>
      <svg className="dn-score-ring-svg" viewBox="0 0 54 54" aria-hidden="true">
        <circle className="dn-score-ring-bg" cx="27" cy="27" r={r} />
        <circle
          className="dn-score-ring-fill"
          cx="27" cy="27" r={r}
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={0}
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        />
      </svg>
      <div className="dn-score-ring-label">
        <span className="dn-score-ring-num">{score}</span>
        <span className="dn-score-ring-sub">/100</span>
      </div>
    </div>
  );
}

// ── Pessoa (WORM-16): sócio da Receita / contato estruturado ──────────────────
// Nome + cargo + (quando houver) botão wa.me e copiar. Fonte "receita_qsa" = sócio
// oficial da Receita. Visual 100% em classes centrais (kit.css .dn-person*).
type PersonView = { name: string; role?: string | null; source?: string | null; phoneDigits?: string | null };

function waHrefFromDigits(digits: string): string {
  const d = String(digits || "").replace(/\D/g, "");
  const withCountry = /^(\d{10,11})$/.test(d) ? `55${d}` : d;
  return `https://wa.me/${withCountry}`;
}

function PersonRow({ person }: { person: PersonView }) {
  const [copied, setCopied] = useState(false);
  const digits = String(person.phoneDigits || "").replace(/\D/g, "");
  const fromReceita = String(person.source || "") === "receita_qsa";

  function copiar() {
    const text = digits ? `${person.name} — ${digits}` : person.name;
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1600); },
      () => undefined,
    );
  }

  return (
    <div className="dn-person">
      <span className="dn-person__ico"><I d={ICONS.users} size={13} /></span>
      <span className="dn-person__body">
        <span className="dn-person__name">{person.name}</span>
        {person.role && <span className="dn-person__role">{humanize(person.role)}</span>}
      </span>
      <span className="dn-person__acts">
        {fromReceita && <span className="tag teal dn-person__badge">Receita</span>}
        {digits && (
          <a
            href={waHrefFromDigits(digits)}
            target="_blank"
            rel="noopener noreferrer"
            className="dn-person__btn"
            aria-label={`WhatsApp de ${person.name}`}
            title="Abrir no WhatsApp"
          >
            <WhatsAppMark size={14} />
          </a>
        )}
        <button
          type="button"
          className="dn-person__btn"
          onClick={copiar}
          aria-label={`Copiar contato de ${person.name}`}
          title={copied ? "Copiado" : "Copiar"}
        >
          <I d={copied ? ICONS.check : ICONS.doc} size={13} />
        </button>
      </span>
    </div>
  );
}

// ── Fileira dos 6 ícones de canal — tri-cor: verde/vermelho/cinza ─────────────

const CANAIS_ORDEM: Canal[] = ["whatsapp", "telefone", "email", "instagram", "facebook", "site"];

type CanalState = "active" | "missing" | "unverified";

function ChannelRow({
  n,
  onWaExternal,
  onWaInternal,
  waQrActive,
  waCanInternal,
  onDelete,
}: {
  n: NegocioDetail;
  onWaExternal?: () => void;
  onWaInternal?: () => void;
  waQrActive?: boolean;
  waCanInternal?: boolean;
  onDelete?: () => void;
}) {
  const li = n.leadIntelligence;
  const mode = useWaOpenMode();
  const internalReady = Boolean(waCanInternal && waQrActive);
  const useInternal = mode === "internal" && internalReady && Boolean(onWaInternal);
  const [deleteArm, setDeleteArm] = useState(false);
  useEffect(() => {
    if (!deleteArm) return;
    const t = setTimeout(() => setDeleteArm(false), 3000);
    return () => clearTimeout(t);
  }, [deleteArm]);

  function getHref(canal: Canal): string | null {
    switch (canal) {
      case "whatsapp": {
        const text = buildWaMessage({ name: n.name, segment: n.segment, city: n.city });
        return buildWaLink(n.phone, { text });
      }
      case "telefone":
        return n.phone ? `tel:${n.phone.replace(/[^\d+]/g, "")}` : null;
      case "email":
        return n.email ? `mailto:${n.email}` : null;
      case "instagram":
        return li?.instagramUrl || null;
      case "facebook":
        return li?.facebookUrl || null;
      case "site":
        return n.website ? (n.website.startsWith("http") ? n.website : `https://${n.website}`) : null;
      default:
        return null;
    }
  }

  function getCanalState(canal: Canal): CanalState {
    const presence = n.channelPresence?.[canal];
    if (typeof presence === "boolean") return presence ? "active" : "missing";

    switch (canal) {
      case "whatsapp": {
        if (!n.phone) return "missing";
        const ws = li?.whatsappStatus;
        if (ws === "confirmed") return "active";
        if (ws === "missing" || ws === "invalid") return "missing";
        return "unverified";
      }
      case "telefone":
        return n.phone ? "active" : "missing";
      case "email": {
        if (n.email) return "active";
        const es = li?.emailStatus;
        if (es === "confirmed" || es === "probable") return "active";
        if (es === "missing" || es === "invalid") return "missing";
        return "unverified";
      }
      case "instagram":
        if (li?.instagramUrl) return "active";
        return li ? "missing" : "unverified";
      case "facebook":
        if (li?.facebookUrl) return "active";
        return li ? "missing" : "unverified";
      case "site": {
        if (n.website) return "active";
        const ws2 = li?.websiteStatus;
        if (ws2 === "confirmed" || ws2 === "present") return "active";
        if (ws2 === "none") return "missing";
        return "unverified";
      }
      default:
        return "unverified";
    }
  }

  const waVerified = li?.whatsappStatus === "confirmed";

  return (
    <div style={{ display: "grid", gap: 6 }}>
    <div className="dn-channels-row">
      {onDelete && (
        <button
          type="button"
          className="chan-ico--delete"
          title={deleteArm ? "Confirmar exclusão" : "Excluir card (devolve ao pool)"}
          aria-label={deleteArm ? "Confirmar exclusão" : "Excluir card"}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: deleteArm ? "var(--hbx-danger)" : "var(--text-muted)",
            transition: "color 0.15s",
          }}
          onClick={() => {
            if (deleteArm) { onDelete(); setDeleteArm(false); }
            else setDeleteArm(true);
          }}
        >
          <I d={ICONS.trash} size={22} />
        </button>
      )}
      {CANAIS_ORDEM.map(canal => {
        const canalState = getCanalState(canal);
        const href = canalState === "active" ? getHref(canal) : null;
        const isExternal = canal === "instagram" || canal === "facebook" || canal === "site" || canal === "whatsapp";

        const cls =
          canalState === "active" ? "chan-ico--on" :
          canalState === "missing" ? "chan-ico--missing" :
          "chan-ico--off";

        if (canal === "whatsapp" && canalState === "active" && Boolean(n.phone) && (onWaExternal || onWaInternal)) {
          return (
            <span key={canal} className={cls} style={{ cursor: "pointer" }}
              onClick={() => { if (useInternal) onWaInternal!(); else if (onWaExternal) onWaExternal(); }}
              role="button" aria-label="WhatsApp">
              <CanalIcon canal={canal} size="xl" />
            </span>
          );
        }

        if (href) {
          return (
            <a
              key={canal}
              href={href}
              className={cls}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              aria-label={canal.charAt(0).toUpperCase() + canal.slice(1)}
            >
              <CanalIcon canal={canal} size="xl" />
            </a>
          );
        }

        return (
          <span key={canal} className={cls} aria-label={`${humanize(canal)} — ${canalState === "missing" ? "sem dado" : "não verificado"}`}>
            <CanalIcon canal={canal} size="xl" />
          </span>
        );
      })}
    </div>
    {waVerified && (
      <span className="dn-wa-verified">
        ✓ WhatsApp VERIFICADO
      </span>
    )}
    </div>
  );
}

// ── ConversationPanel (WORM-11) — thread WhatsApp embutido no card ────────────
// Núcleo do aceite: ler o thread da conversa do lead SEM sair da tela, responder
// pela rotina NORMAL do Atendimento e ligar/desligar a IA por conversa.
//
// REGRA DURA (Webwhats): nunca chamar API crua do motor nem abrir socket novo.
// Em Vendas (`leadId` presente), toda leitura/criação/envio passa pela fachada
// `/vendas/lead/:leadId/conversation*`, que preserva vínculo e projeção do cockpit.
// Consumidores antigos sem `leadId` continuam exatamente em `/inbox/conversations/*`.
// Handoff da IA segue na rotina existente; "devolver pra IA" religa via bulk-bot.

type ConvoMessage = {
  id: string;
  direction: string; // "inbound" | "outbound"
  content: string;
  createdAt: string | null;
  messageType?: string;
  status?: string;
  error?: string | null;
};

type ConvoStart = { id?: number | string; botActive?: boolean | null; humanAssigned?: boolean | null };
type ConvoMessagesResponse = VendasConversationSnapshot & {
  messages?: unknown[];
  hasMore?: boolean;
  nextBefore?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeConvoMessage(value: unknown, index: number): ConvoMessage {
  const raw = asRecord(value);
  const createdAtRaw = raw.createdAt ?? raw.timestamp ?? null;
  return {
    id: String(raw.id ?? `message-${index}`),
    direction: String(raw.direction || "").trim().toLowerCase(),
    content: String(raw.content ?? raw.body ?? ""),
    createdAt: createdAtRaw == null ? null : String(createdAtRaw),
    messageType: String(raw.messageType || "text").trim().toLowerCase(),
    status: String(raw.status || "").trim().toUpperCase(),
    error: raw.error == null ? null : String(raw.error),
  };
}

function normalizeConvoMessages(value: unknown): ConvoMessage[] {
  return Array.isArray(value) ? value.map(normalizeConvoMessage) : [];
}

function parseVendasSnapshot(value: unknown): VendasConversationSnapshot {
  const root = asRecord(value);
  const nested = asRecord(root.data);
  const source = ("conversation" in nested || "engagement" in nested || "messages" in nested) ? nested : root;

  if ("conversation" in source || "engagement" in source) {
    const conversationRaw = source.conversation;
    const engagementRaw = source.engagement;
    return {
      ...("conversation" in source
        ? { conversation: conversationRaw == null ? null : asRecord(conversationRaw) as VendasConversationRef }
        : {}),
      ...("engagement" in source
        ? { engagement: engagementRaw == null ? null : asRecord(engagementRaw) as VendasEngagementSnapshot }
        : {}),
    };
  }

  // Compatibilidade defensiva com respostas diretas (`{id, exists}` ou o
  // próprio engagement), sem enfraquecer o contrato canônico em envelope.
  if ("id" in source || "exists" in source) {
    return { conversation: source as VendasConversationRef };
  }
  if ("state" in source || "hasInboundReply" in source || "lastMessageStatus" in source) {
    return { engagement: source as VendasEngagementSnapshot };
  }
  return {};
}

function snapshotSignature(snapshot: VendasConversationSnapshot): string {
  return JSON.stringify({
    conversation: snapshot.conversation ?? null,
    engagement: snapshot.engagement ?? null,
  });
}

function mergeVendasSnapshot(
  current: VendasConversationSnapshot,
  incoming: VendasConversationSnapshot,
): VendasConversationSnapshot {
  return {
    conversation: Object.prototype.hasOwnProperty.call(incoming, "conversation")
      ? incoming.conversation ?? null
      : current.conversation,
    engagement: Object.prototype.hasOwnProperty.call(incoming, "engagement")
      ? incoming.engagement ?? null
      : current.engagement,
  };
}

function messageDeliveryLabel(statusRaw: string | null | undefined): string | null {
  const status = String(statusRaw || "").trim().toUpperCase();
  if (status === "QUEUED" || status === "PENDING") return "Na fila";
  if (status === "SENDING" || status === "PROCESSING") return "Enviando";
  if (status === "SENT") return "Enviado";
  if (status === "DELIVERED") return "Entregue";
  if (status === "READ") return "Lida";
  if (status === "FAILED") return "Falha no envio";
  if (status === "CANCELED" || status === "CANCELLED") return "Envio cancelado";
  return null;
}

function fmtMsgTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Exportado (LEADS-FINAL/02, 06/07): a página /leads/[id] reusa este painel
// SOZINHO (sem o card inteiro do DetalhesNegocio) na aba central "WhatsApp" —
// mesma rotina de sempre quando não recebe `leadId`, zero mudança no motor
// Webwhats. O <DetalhesNegocio> da coluna esquerda passa showConversation={false}
// pra não duplicar o painel nas duas colunas.
export function ConversationPanel({
  phone,
  name,
  draftSignal,
  leadId,
  conversationId,
  conversationSnapshot,
  onConversationChanged,
}: {
  phone: string;
  name?: string | null;
  // LEADS-FINAL/05 — Copiloto: injeta um RASCUNHO no campo de digitação (só
  // preenche, NUNCA envia). `seq` muda a cada clique pra re-disparar o efeito.
  draftSignal?: { text: string; seq: number };
  leadId?: string | null;
  conversationId?: string | number | null;
  conversationSnapshot?: VendasConversationSnapshot | null;
  onConversationChanged?: (snapshot?: VendasConversationSnapshot) => void | Promise<void>;
}) {
  const vendasMode = Boolean(leadId);
  const initialConversationId = conversationId != null
    ? String(conversationId)
    : conversationSnapshot?.conversation?.id != null
      ? String(conversationSnapshot.conversation.id)
      : null;
  const initialSnapshot: VendasConversationSnapshot = vendasMode
    ? {
        conversation: conversationSnapshot?.conversation
          ?? (initialConversationId ? { id: initialConversationId, exists: true } : null),
        engagement: conversationSnapshot?.engagement ?? null,
      }
    : {};
  const [tab, setTab] = useState<"whatsapp" | "email">("whatsapp");
  const tabPill = useGlassPill<HTMLButtonElement>(tab);
  const [opened, setOpened] = useState(false); // só bate no motor após clique explícito
  const [convoId, setConvoId] = useState<string | null>(initialConversationId);
  const [snapshot, setSnapshot] = useState<VendasConversationSnapshot>(initialSnapshot);
  const [messages, setMessages] = useState<ConvoMessage[]>([]);
  const [botActive, setBotActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<VendasConversationSnapshot>(initialSnapshot);
  const onConversationChangedRef = useRef(onConversationChanged);
  const lastNotifiedSnapshotRef = useRef(snapshotSignature(initialSnapshot));
  const pollBusyRef = useRef(false);
  const postSendTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onConversationChangedRef.current = onConversationChanged;
  }, [onConversationChanged]);

  const applyVendasSnapshot = useCallback((payload: unknown, notify: boolean) => {
    const parsed = parseVendasSnapshot(payload);
    const next = mergeVendasSnapshot(snapshotRef.current, parsed);
    const previousSignature = snapshotSignature(snapshotRef.current);
    const nextSignature = snapshotSignature(next);
    snapshotRef.current = next;
    if (nextSignature !== previousSignature) setSnapshot(next);

    const nextId = next.conversation?.id != null ? String(next.conversation.id) : null;
    setConvoId(current => current === nextId ? current : nextId);

    if (notify && nextSignature !== lastNotifiedSnapshotRef.current) {
      lastNotifiedSnapshotRef.current = nextSignature;
      void onConversationChangedRef.current?.(next);
    } else if (!notify) {
      lastNotifiedSnapshotRef.current = nextSignature;
    }
    return next;
  }, []);

  const applyMessagePayload = useCallback((payload: unknown, options?: { prepend?: boolean; notify?: boolean }) => {
    const root = Array.isArray(payload) ? { messages: payload } : asRecord(payload);
    const nested = asRecord(root.data);
    const source = ("messages" in nested || "conversation" in nested || "engagement" in nested) ? nested : root;
    const hasMessagesField = "messages" in source;
    if (hasMessagesField) {
      const nextMessages = normalizeConvoMessages(source.messages);
      if (options?.prepend) setMessages(current => [...nextMessages, ...current]);
      else setMessages(nextMessages);
      const fallbackBefore = Boolean(source.hasMore) ? nextMessages[0]?.createdAt ?? null : null;
      setNextBefore(source.nextBefore == null ? fallbackBefore : String(source.nextBefore));
    }
    if ("hasMore" in source) setHasMore(Boolean(source.hasMore));
    if (!hasMessagesField && "nextBefore" in source) {
      setNextBefore(source.nextBefore == null ? null : String(source.nextBefore));
    }
    return applyVendasSnapshot(source, Boolean(options?.notify));
  }, [applyVendasSnapshot]);

  // O board pode ser invalidado após envio/poll e entregar uma projeção mais
  // nova sem remontar o painel. Sincroniza só a projeção; nunca abre a conversa.
  const incomingSnapshotSignature = vendasMode
    ? snapshotSignature({
        conversation: conversationSnapshot?.conversation
          ?? (conversationId != null ? { id: String(conversationId), exists: true } : null),
        engagement: conversationSnapshot?.engagement ?? null,
      })
    : "legacy";
  useEffect(() => {
    if (!vendasMode) return;
    const incoming = JSON.parse(incomingSnapshotSignature) as VendasConversationSnapshot;
    queueMicrotask(() => applyVendasSnapshot(incoming, false));
  }, [applyVendasSnapshot, incomingSnapshotSignature, vendasMode]);

  const refreshVendasThread = useCallback(async (notify = true) => {
    if (!leadId || pollBusyRef.current) return;
    pollBusyRef.current = true;
    try {
      const response = await apiFetch<unknown>(
        `/vendas/lead/${encodeURIComponent(leadId)}/conversation/messages?limit=30`,
      );
      applyMessagePayload(response, { notify });
    } catch {
      // Poll fail-soft: conserva o thread visível e tenta novamente no próximo ciclo.
    } finally {
      pollBusyRef.current = false;
    }
  }, [applyMessagePayload, leadId]);

  // Clique explícito: em Vendas primeiro faz leitura pura da fachada. Só cria ou
  // vincula quando a leitura confirma que não há conversa. Fora de Vendas, mantém
  // integralmente o find-or-create legado do Atendimento.
  const resolveThread = useCallback(async () => {
    setOpened(true);
    setLoading(true);
    setError(null);
    try {
      if (vendasMode && leadId) {
        const leadPath = `/vendas/lead/${encodeURIComponent(leadId)}/conversation`;
        const found = await apiFetch<unknown>(leadPath);
        let current = applyVendasSnapshot(found, true);
        let id = current.conversation?.id != null ? String(current.conversation.id) : null;

        if (!id) {
          const created = await apiFetch<unknown>(leadPath, {
            method: "POST",
            body: JSON.stringify({}),
          });
          current = applyVendasSnapshot(created, true);
          id = current.conversation?.id != null ? String(current.conversation.id) : null;
        }
        if (!id) throw new Error("Não foi possível abrir a conversa.");

        const response = await apiFetch<unknown>(
          `${leadPath}/messages?limit=30`,
        );
        applyMessagePayload(response, { notify: true });
        return;
      }

      const started = await apiFetch<ConvoStart>("/inbox/conversations/start", {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim(), ...(name ? { name: name.trim() } : {}) }),
      });
      const id = started?.id != null ? String(started.id) : null;
      if (!id) {
        throw new Error("Não foi possível abrir a conversa.");
      }
      setConvoId(id);
      setBotActive(Boolean(started.botActive));
      const res = await apiFetch<ConvoMessagesResponse>(
        `/inbox/conversations/${encodeURIComponent(id)}/messages?limit=30`,
      );
      setMessages(normalizeConvoMessages(res?.messages));
      setHasMore(Boolean(res?.hasMore));
      setNextBefore(res?.nextBefore ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir a conversa.");
    } finally {
      setLoading(false);
    }
  }, [applyMessagePayload, applyVendasSnapshot, leadId, name, phone, vendasMode]);

  // Rola pro fim quando o thread muda (mensagem nova / carga inicial).
  useEffect(() => {
    if (tab === "whatsapp" && endRef.current) {
      endRef.current.scrollTop = endRef.current.scrollHeight;
    }
  }, [messages, tab]);

  const conversationState = normalizeEngagementState(snapshot.engagement, snapshot.conversation);
  const hasExistingConversation = conversationState !== "no_conversation" && conversationState !== "no_messages";

  // Copiloto (LEADS-FINAL/05): rascunho vindo de fora → preenche o campo de
  // digitação. Em Vendas, ele só abre automaticamente quando a conversa JÁ
  // existe; criar/vincular uma nova conversa continua exigindo clique explícito.
  // GUARDRAIL: só PREENCHE o draft; jamais chama enviar(). O setState sai do corpo
  // síncrono do efeito (queueMicrotask) — mesmo cuidado do react-hooks/set-state.
  const lastDraftSeq = useRef(0);
  useEffect(() => {
    if (!draftSignal || draftSignal.seq === lastDraftSeq.current) return;
    lastDraftSeq.current = draftSignal.seq;
    const text = draftSignal.text;
    if (!text) return;
    const alreadyOpen = opened;
    queueMicrotask(() => {
      setDraft(text);
      setTab("whatsapp");
      if (!alreadyOpen && (!vendasMode || hasExistingConversation)) void resolveThread();
    });
  }, [draftSignal, hasExistingConversation, opened, resolveThread, vendasMode]);

  // Sem SSE neste corte: enquanto o thread está aberto, reconcilia status e
  // inbound a cada 9 s. O callback só invalida o board quando a projeção mudou.
  useEffect(() => {
    if (!vendasMode || !opened || !convoId) return;
    const intervalId = window.setInterval(() => { void refreshVendasThread(true); }, 9_000);
    return () => window.clearInterval(intervalId);
  }, [convoId, opened, refreshVendasThread, vendasMode]);

  useEffect(() => () => {
    if (postSendTimerRef.current != null) window.clearTimeout(postSendTimerRef.current);
  }, []);

  async function carregarMaisAntigas() {
    if (!convoId || !nextBefore || olderBusy) return;
    setOlderBusy(true);
    try {
      if (vendasMode && leadId) {
        const response = await apiFetch<unknown>(
          `/vendas/lead/${encodeURIComponent(leadId)}/conversation/messages?limit=30&before=${encodeURIComponent(nextBefore)}`,
        );
        applyMessagePayload(response, { prepend: true, notify: true });
        return;
      }
      const res = await apiFetch<ConvoMessagesResponse>(
        `/inbox/conversations/${encodeURIComponent(convoId)}/messages?limit=30&before=${encodeURIComponent(nextBefore)}`,
      );
      const older = normalizeConvoMessages(res?.messages);
      setMessages((cur) => [...older, ...cur]);
      setHasMore(Boolean(res?.hasMore));
      setNextBefore(res?.nextBefore ?? null);
    } catch {
      // silencioso — o botão fica; o usuário tenta de novo
    } finally {
      setOlderBusy(false);
    }
  }

  async function enviar() {
    const content = draft.trim();
    if (!content || !convoId || sendBusy) return;
    setSendBusy(true);
    setSendError(null);
    const optimisticId = `queued-${Date.now()}`;
    try {
      if (vendasMode && leadId) {
        const now = new Date().toISOString();
        const optimisticMessage: ConvoMessage = {
          id: optimisticId,
          direction: "outbound",
          content,
          createdAt: now,
          messageType: "text",
          status: "QUEUED",
          error: null,
        };
        setMessages(current => [...current, optimisticMessage]);
        const optimisticSnapshot: VendasConversationSnapshot = {
          conversation: snapshotRef.current.conversation,
          engagement: {
            ...snapshotRef.current.engagement,
            state: "queued",
            lastOutboundAt: now,
            lastOutboundStatus: "QUEUED",
            lastMessageAt: now,
            lastMessageDirection: "outbound",
            lastMessageStatus: "QUEUED",
            lastMessagePreview: content.slice(0, 160),
            failureReason: null,
          },
        };
        snapshotRef.current = optimisticSnapshot;
        setSnapshot(optimisticSnapshot);

        const response = await apiFetch<unknown>(
          `/vendas/lead/${encodeURIComponent(leadId)}/conversation/message`,
          { method: "POST", body: JSON.stringify({ body: content }) },
        );
        setDraft("");
        setBotActive(false);
        applyMessagePayload(response, { notify: true });
        if (postSendTimerRef.current != null) window.clearTimeout(postSendTimerRef.current);
        postSendTimerRef.current = window.setTimeout(() => {
          postSendTimerRef.current = null;
          void refreshVendasThread(true);
        }, 1_500);
        return;
      }

      await apiFetch(`/inbox/conversations/${encodeURIComponent(convoId)}/message`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setDraft("");
      // Handoff: o backend já derruba o bot ao enviar humano. Espelha na UI.
      setBotActive(false);
      // Recarrega a janela recente pra ver a mensagem enviada assentar.
      const res = await apiFetch<ConvoMessagesResponse>(
        `/inbox/conversations/${encodeURIComponent(convoId)}/messages?limit=30`,
      );
      setMessages(normalizeConvoMessages(res?.messages));
      setHasMore(Boolean(res?.hasMore));
      setNextBefore(res?.nextBefore ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível enviar a mensagem.";
      setSendError(message);
      if (vendasMode) {
        setMessages(current => current.map(item => item.id === optimisticId
          ? { ...item, status: "FAILED", error: message }
          : item));
        const failedSnapshot: VendasConversationSnapshot = {
          conversation: snapshotRef.current.conversation,
          engagement: {
            ...snapshotRef.current.engagement,
            state: "failed",
            lastMessageStatus: "FAILED",
            lastOutboundStatus: "FAILED",
            failureReason: message,
          },
        };
        snapshotRef.current = failedSnapshot;
        setSnapshot(failedSnapshot);
        void onConversationChangedRef.current?.(failedSnapshot);
      }
    } finally {
      setSendBusy(false);
    }
  }

  // Toggle IA por conversa via bulk-bot (mesma rotina do Atendimento). Ligar =
  // "devolver pra IA"; desligar = "assumo eu". Erros de bot-não-armado/setup viram hint.
  async function toggleIa() {
    if (!convoId || aiBusy) return;
    const next = !botActive;
    const botConversationId = /^\d+$/.test(convoId) ? Number(convoId) : convoId;
    setAiBusy(true);
    setAiHint(null);
    try {
      await apiFetch("/inbox/conversations/bulk-bot", {
        method: "PATCH",
        body: JSON.stringify({ ids: [botConversationId], enabled: next }),
      });
      setBotActive(next);
    } catch (err) {
      const payload = (err as ApiError)?.payload as { message?: string } | undefined;
      setAiHint(payload?.message || (err instanceof Error ? err.message : "Não foi possível alternar a IA."));
    } finally {
      setAiBusy(false);
    }
  }

  const engagementMeta = vendasMode
    ? vendasEngagementMeta(snapshot.engagement, snapshot.conversation)
    : null;
  const lastMessagePreview = snapshot.engagement?.lastMessagePreview?.trim() || null;
  const failureReason = snapshot.engagement?.failureReason?.trim() || null;

  return (
    <div className="dn-convo">
      <div className="dn-convo__tabs glass-pill-track">
        <GlassPill {...tabPill} />
        <button
          type="button"
          ref={tabPill.itemRef("whatsapp")}
          className={"dn-convo__tab" + (tab === "whatsapp" ? " is-active" : "")}
          onClick={() => setTab("whatsapp")}
        >
          <I d={ICONS.msg} size={14} /> WhatsApp
        </button>
        <button
          type="button"
          ref={tabPill.itemRef("email")}
          className={"dn-convo__tab" + (tab === "email" ? " is-active" : "")}
          onClick={() => setTab("email")}
        >
          <I d={ICONS.mail} size={14} /> E-mail
        </button>
        {tab === "whatsapp" && convoId != null && !vendasMode && (
          <span className="dn-convo__ai" title="Deixar a IA responder esta conversa (some quando você digita)">
            <span className="dn-convo__ai-label">
              <I d={ICONS.bot} size={12} /> IA
            </span>
            <button
              type="button"
              className={"dn-ai-switch" + (botActive ? " is-on" : "")}
              onClick={toggleIa}
              disabled={aiBusy}
              aria-pressed={botActive}
              aria-label={botActive ? "IA no ar — clique para assumir" : "Devolver conversa para a IA"}
            />
          </span>
        )}
      </div>

      {tab === "whatsapp" && engagementMeta && (
        <div className="dn-convo__hint" role="status" aria-live="polite">
          <span className={engagementMeta.className} title={failureReason || undefined}>
            {engagementMeta.label}
          </span>
          {lastMessagePreview && (
            <span title={lastMessagePreview}> · {lastMessagePreview.length > 90 ? `${lastMessagePreview.slice(0, 87)}…` : lastMessagePreview}</span>
          )}
          {failureReason && <div className="dn-convo__err">{failureReason}</div>}
        </div>
      )}

      {tab === "email" ? (
        <div className="dn-convo__hint">
          E-mail ainda não tem caixa de entrada embutida no card. Use o e-mail do lead
          acima para escrever pelo seu cliente de e-mail.
        </div>
      ) : !opened ? (
        <div className="dn-convo__body">
          <div className="dn-convo__hint">
            {hasExistingConversation
              ? "A conversa já existe. Continue do ponto em que parou."
              : "Veja e responda a conversa deste lead sem sair do card."}
          </div>
          <button
            type="button"
            className="btn-teal"
            style={{ margin: "0 auto 14px", minWidth: 160 }}
            onClick={() => void resolveThread()}
          >
            <I d={ICONS.msg} size={15} /> {hasExistingConversation ? "Continuar conversa" : "Abrir conversa"}
          </button>
        </div>
      ) : loading ? (
        <div className="dn-convo__load">Abrindo conversa…</div>
      ) : error ? (
        <div className="dn-convo__body">
          <div className="dn-convo__hint">{error}</div>
          <button type="button" className="dn-convo__more" onClick={() => void resolveThread()}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className="dn-convo__body">
          <div className="msgs" ref={endRef}>
            {hasMore && (
              <button type="button" className="dn-convo__more" onClick={carregarMaisAntigas} disabled={olderBusy}>
                {olderBusy ? "Carregando…" : "Carregar anteriores ▴"}
              </button>
            )}
            {messages.length === 0 ? (
              <div className="dn-convo__hint">Sem mensagens. Envie a primeira abaixo.</div>
            ) : (
              messages.map((m) => {
                const out = m.direction === "outbound";
                const status = String(m.status || "").toUpperCase();
                const failed = status === "FAILED";
                const canceled = status === "CANCELED" || status === "CANCELLED";
                const deliveryLabel = out ? messageDeliveryLabel(status) : null;
                return (
                  <div key={m.id} className={"msg " + (out ? "out" : "in")}>
                    {!out && <Av name={name || "—"} size={26} />}
                    <div style={{ display: "grid", minWidth: 0 }}>
                      <div className={"bubble" + (failed || canceled ? " deleted" : "")} title={m.error || undefined}>
                        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {m.content || (m.messageType && m.messageType !== "text" ? `[${humanize(m.messageType)}]` : "")}
                        </span>
                        <div className="tm">
                          {fmtMsgTime(m.createdAt)}
                          {deliveryLabel && <span className="muted-note" style={{ margin: 0 }}> · {deliveryLabel}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {aiHint && <div className="dn-convo__ai-armhint">{aiHint}</div>}
          {sendError && <div className="dn-convo__err">{sendError}</div>}

          <div className="dn-convo__composer">
            <textarea
              className="field-dark"
              rows={2}
              maxLength={4000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              disabled={sendBusy || convoId == null}
            />
            <button
              type="button"
              className="btn-teal"
              style={{ minWidth: 44, alignSelf: "stretch" }}
              onClick={() => void enviar()}
              disabled={sendBusy || convoId == null || !draft.trim()}
              aria-label="Enviar mensagem"
              title="Enviar (Enter)"
            >
              {sendBusy ? "…" : <I d={ICONS.send} size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AgendaLeadPanel — compromissos do LEAD embutidos na ficha (item 2 da
// revisão do dono, 07/07): "mover agenda pra dentro do card já puxado". Não é
// a agenda GLOBAL do vendedor (isso mora em /agenda, tela própria) — aqui é só
// os compromissos DESTE lead, com criação já vinculada (sem digitar ID).
// Endpoints já existiam prontos pra isso e nunca tinham sido consumidos por
// nenhuma tela (comentário original do controller: "usado no detalhe do lead
// — WORM-11"): GET /atividades/lead/:leadId, POST /atividades, POST
// /atividades/:id/concluir (1 tap + resultado sim|nao|remarcar, igual à tela
// /agenda), DELETE /atividades/:id. Zero endpoint novo.

type DnAtividade = {
  id: string;
  leadId: string;
  tipo: string;
  titulo: string;
  vencimento: string | null;
  duracao: number | null;
  diaInteiro: boolean;
  realizadaEm: string | null;
  resultado: string | null;
  pendente: boolean;
  atrasada: boolean;
  criadaPor: string;
};

const AGENDA_TIPOS = ["ligacao", "reuniao", "visita", "mensagem"] as const;
// Mesmo mapa de /agenda (TIPO_META) — ícone + rótulo por tipo de atividade.
const AGENDA_TIPO_META: Record<string, { label: string; icon: keyof typeof ICONS }> = {
  ligacao: { label: "Ligação", icon: "atend" },
  reuniao: { label: "Reunião", icon: "users" },
  visita: { label: "Visita", icon: "search" },
  mensagem: { label: "Mensagem", icon: "msg" },
};
const AGENDA_RESULT_LABEL: Record<string, string> = {
  sim: "Atendeu", nao: "Não atendeu", remarcar: "Remarcado", outro: "Outro",
};

// input datetime-local → ISO (mantém o fuso local do vendedor) — mesmo helper de /agenda.
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function defaultVencInput(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AgendaLeadPanel({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<DnAtividade[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [novaOpen, setNovaOpen] = useState(false);
  const [novaTitulo, setNovaTitulo] = useState("");
  const [novaTipo, setNovaTipo] = useState<string>("ligacao");
  const [novaVenc, setNovaVenc] = useState(defaultVencInput());
  const [novaBusy, setNovaBusy] = useState(false);
  const [novaError, setNovaError] = useState<string | null>(null);

  const [concluindoId, setConcluindoId] = useState<string | null>(null);
  const [remarcarInput, setRemarcarInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ ok?: boolean; atividades?: DnAtividade[] }>(
        `/atividades/lead/${encodeURIComponent(leadId)}`,
      );
      setItems(Array.isArray(res?.atividades) ? res!.atividades! : []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Não foi possível carregar a agenda deste lead.");
      setItems(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  // IIFE async: load() só faz setState após o await (react-hooks/set-state-in-effect).
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function criar() {
    if (novaBusy) return;
    setNovaError(null);
    const titulo = novaTitulo.trim();
    const iso = localInputToIso(novaVenc);
    if (!titulo) { setNovaError("Informe o título."); return; }
    if (!iso) { setNovaError("Data inválida."); return; }
    setNovaBusy(true);
    try {
      await apiFetch("/atividades", {
        method: "POST",
        body: JSON.stringify({ leadId, titulo, tipo: novaTipo, vencimento: iso }),
      });
      setNovaTitulo("");
      setNovaTipo("ligacao");
      setNovaVenc(defaultVencInput());
      setNovaOpen(false);
      setMsg("✓ Atividade criada.");
      await load();
    } catch (err) {
      setNovaError(err instanceof Error ? err.message : "Não foi possível criar a atividade.");
    } finally {
      setNovaBusy(false);
    }
  }

  async function concluir(item: DnAtividade, resultado: "sim" | "nao" | "remarcar") {
    if (busyId) return;
    if (resultado === "remarcar" && !remarcarInput) { setMsg("Escolha a nova data para remarcar."); return; }
    setBusyId(item.id);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { resultado };
      if (resultado === "remarcar") body.remarcarPara = localInputToIso(remarcarInput);
      await apiFetch(`/atividades/${encodeURIComponent(item.id)}/concluir`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setConcluindoId(null);
      setRemarcarInput("");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setBusyId(null);
    }
  }

  async function remover(item: DnAtividade) {
    if (busyId) return;
    setBusyId(item.id);
    setMsg(null);
    try {
      await apiFetch(`/atividades/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível remover.");
    } finally {
      setBusyId(null);
    }
  }

  const pendentes = (items || [])
    .filter(a => a.pendente)
    .sort((a, b) => String(a.vencimento || "").localeCompare(String(b.vencimento || "")));
  const concluidas = (items || [])
    .filter(a => !a.pendente)
    .sort((a, b) => String(b.realizadaEm || "").localeCompare(String(a.realizadaEm || "")));

  function renderItem(item: DnAtividade, done: boolean) {
    const meta = AGENDA_TIPO_META[item.tipo] || AGENDA_TIPO_META.ligacao;
    const aberto = concluindoId === item.id;
    return (
      <div key={item.id} className={"dn-agenda__item" + (item.atrasada ? " is-late" : "") + (done ? " is-done" : "")}>
        <div className="dn-agenda__item-top">
          <span className="dn-agenda__item-tipo"><I d={ICONS[meta.icon]} size={11} /> {meta.label}</span>
          <span className="dn-agenda__item-when">{fmtDateTime(done ? item.realizadaEm : item.vencimento)}</span>
          {item.atrasada && <span className="tag red">Atrasada</span>}
          {done && item.resultado && <span className="tag teal">{AGENDA_RESULT_LABEL[item.resultado] || item.resultado}</span>}
        </div>
        <span className="dn-agenda__item-title">{item.titulo}</span>
        {!done && (aberto ? (
          <div className="dn-agenda__concluir">
            <div className="dn-agenda__concluir-btns">
              <button type="button" className="btn-result btn-result--ok" onClick={() => concluir(item, "sim")} disabled={busyId === item.id}>Sim</button>
              <button type="button" className="btn-result btn-result--cold" onClick={() => concluir(item, "nao")} disabled={busyId === item.id}>Não</button>
              <button type="button" className="btn-result" onClick={() => concluir(item, "remarcar")} disabled={busyId === item.id}>Remarcar</button>
            </div>
            <div className="dn-agenda__remarcar">
              <input type="datetime-local" className="field-dark" value={remarcarInput} onChange={e => setRemarcarInput(e.target.value)} aria-label="Nova data" />
              <button type="button" className="btn-ghost btn-xs" onClick={() => { setConcluindoId(null); setRemarcarInput(""); }} disabled={busyId === item.id}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="dn-agenda__item-acts">
            <button type="button" className="btn-teal btn-xs" onClick={() => { setConcluindoId(item.id); setRemarcarInput(""); setMsg(null); }} disabled={busyId === item.id}>
              <I d={ICONS.check} size={11} /> Concluir
            </button>
            <button type="button" className="btn-ghost btn-xs danger" onClick={() => remover(item)} disabled={busyId === item.id}>Remover</button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dn-agenda">
      <div className="dn-agenda__head">
        <span className="dn-section-head"><I d={ICONS.clock} size={11} /> Agenda</span>
        <button type="button" className="dn-agenda__add" onClick={() => setNovaOpen(o => !o)}>
          {novaOpen ? "Cancelar" : "+ Atividade"}
        </button>
      </div>

      {novaOpen && (
        <div className="dn-agenda__form">
          <div className="dn-agenda__form-row">
            <select className="field-dark" value={novaTipo} onChange={e => setNovaTipo(e.target.value)} aria-label="Tipo de atividade">
              {AGENDA_TIPOS.map(t => <option key={t} value={t}>{AGENDA_TIPO_META[t].label}</option>)}
            </select>
            <input type="datetime-local" className="field-dark" value={novaVenc} onChange={e => setNovaVenc(e.target.value)} aria-label="Vencimento" />
          </div>
          <input className="field-dark" maxLength={160} placeholder="Título (ex.: Ligar para fechar)" value={novaTitulo} onChange={e => setNovaTitulo(e.target.value)} />
          {novaError && <span className="ctx-msg err">{novaError}</span>}
          <button type="button" className="btn-teal btn-xs" onClick={() => void criar()} disabled={novaBusy}>
            {novaBusy ? "Criando…" : "Criar atividade"}
          </button>
        </div>
      )}

      {msg && <span className={"ctx-msg " + (msg.startsWith("✓") ? "ok" : "err")}>{msg}</span>}

      {loading ? (
        <span className="dn-skel dn-skel-md dn-skel-w60" />
      ) : loadError ? (
        <p className="muted-note">{loadError}</p>
      ) : pendentes.length === 0 && concluidas.length === 0 ? (
        <p className="muted-note">Nenhum compromisso ainda.</p>
      ) : (
        <>
          {pendentes.length > 0 && <div className="dn-agenda__list">{pendentes.map(item => renderItem(item, false))}</div>}
          {concluidas.length > 0 && (
            <>
              <button type="button" className="dn-history-toggle" onClick={() => setShowDone(o => !o)}>
                {showDone ? "Ocultar concluídas" : `Ver concluídas (${concluidas.length})`}
              </button>
              {showDone && <div className="dn-agenda__list">{concluidas.map(item => renderItem(item, true))}</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export function DetalhesNegocio({
  detail,
  negocio,
  // Título unificado nas 3 telas (27/06): mesmo card = mesmo nome. "Detalhes" sem
  // jargão ("lead"/"negócio") — o nome da empresa já aparece no herói logo abaixo.
  title = "Detalhes",
  onClose,
  onExpand,
  heroAction,
  crownSlot,
  actions,
  emptyHint,
  loading = false,
  enriching = false,
  waQrActive = false,
  waCanInternal = false,
  onWaOpenExternal,
  onWaOpenInternal,
  obsDraft,
  onObsChange,
  onObsSave,
  obsBusy,
  onToggleDoNotCall,
  onSemInteresse,
  historyLabel = "Histórico",
  kvExtra,
  showConversation = true,
  conversationLeadId,
  onConversationChanged,
  showAgenda = false,
  onDelete,
}: DetalhesNegocioProps) {
  const n = detail !== undefined ? detail : (negocio !== undefined ? negocio : null);
  const detailEngagementMeta = n?.conversation !== undefined
    ? vendasEngagementMeta(n.engagement, n.conversation)
    : null;
  const [internalTab, setInternalTab] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [semInteresseOpen, setSemInteresseOpen] = useState(false);
  const [deleteArm, setDeleteArm] = useState(false);
  useEffect(() => {
    if (!deleteArm) return;
    const timer = window.setTimeout(() => setDeleteArm(false), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteArm]);

  const waOpenMode = useWaOpenMode();

  const li = n?.leadIntelligence;
  const recChannel = li?.recommendedChannel ? toCanal(li.recommendedChannel) : null;
  // HOT-07 (empresa recém-aberta): badge só monta texto quando o backend confirma.
  const freshCompanyBadge = fmtFreshCompanyBadge(n?.isFreshCompany, n?.daysSinceOpened);

  // ── Estado "enriquecendo agora" — só acende no MEIO: card já carregou do
  // backend (!loading) e o motor ainda trabalha (enriching). A coroa (enriched)
  // é o "terminou": quando ela existe, o badge não briga — some. Os 3 estados
  // (loading · enriquecendo · enriquecido) nunca aparecem juntos.
  const isEnriching = Boolean(enriching) && !loading && !n?.enriched;
  // Placeholder de campo pendente só faz sentido enquanto enriquece.
  const fieldPending = (has: boolean) => isEnriching && !has;
  const primaryWaInternal = waOpenMode === "internal"
    && waCanInternal
    && waQrActive
    && Boolean(onWaOpenInternal);

  function openPrimaryWhatsApp() {
    if (primaryWaInternal) {
      onWaOpenInternal?.();
      return;
    }
    if (onWaOpenExternal) {
      onWaOpenExternal();
      return;
    }
    const fallback = buildWaLink(n?.phone, {
      text: buildWaMessage({ name: n?.name, segment: n?.segment, city: n?.city }),
    });
    if (fallback && typeof window !== "undefined") {
      window.open(fallback, "_blank", "noopener");
    }
  }

  // ── Renderizadores de seção ───────────────────────────────────────────────

  function renderScore() {
    if (!n) return null;
    if (n.opportunityScore == null || n.opportunityScore <= 0) return null;
    const content = (
      <div className="dn-score-inline">
        <ScoreRing score={n.opportunityScore} />
        <span className="dn-score-inline-label">Score de oportunidade</span>
      </div>
    );
    return content;
  }

  function renderOpportunityTeaser() {
    if (!n || !li) return null;
    const reason = li.opportunityReason;
    const painType = li.painType;
    if (!reason && !painType) return null;

    let text = "";
    if (reason) {
      text = reason.length > 120 ? reason.slice(0, 117) + "…" : reason;
    } else if (painType) {
      text = humanize(painType);
    }

    const content = (
      <div className="dn-opportunity-teaser">
        <span className="dn-opportunity-teaser__icon">💡</span>
        <p className="dn-opportunity-teaser__text">{text}</p>
      </div>
    );
    return content;
  }

  function renderStatusChip() {
    if (!n) return null;
    const hasBot = n.botActive !== undefined && n.botActive !== null;
    const hasHuman = n.humanAssigned !== undefined && n.humanAssigned !== null;
    if (!hasBot && !hasHuman) return null;
    const botOn = n.botActive === true;
    const human = n.humanAssigned === true;
    let cls = "dn-status-chip";
    let label: string;
    if (botOn) {
      cls += " is-bot";
      label = human ? "Bot ativo · Humano" : "Bot ativo";
    } else if (human) {
      cls += " is-human";
      label = hasBot ? "Bot off · Humano" : "Humano";
    } else {
      label = "Bot off";
    }
    return <span className={cls}>{label}</span>;
  }

  function renderContacts() {
    if (!n) return null;
    const hasCompanyData = Boolean(n.cnpj || n.razaoSocial || n.cnae || n.ownerName || n.ownerPhone || n.companySituation);
    // Regra do dono: telefone extra só aparece se passou pelo motor do WhatsApp (confirmado).
    const waOk = (p: string) => (n.phonesWhatsapp || {})[String(p).replace(/\D/g, "")] === true;
    // Telefones extras (2/3): além do principal, SÓ os verificados no WhatsApp. Sem verificado → vazio → card idêntico.
    const extraPhones = (Array.isArray(n.phones) ? n.phones : [])
      .filter((p) => p && p !== n.phone && waOk(p)).filter((p, i, a) => a.indexOf(p) === i).slice(0, 3);
    // E-mails extras (2/3): além do principal, já validados na captura. Sem extra → card idêntico.
    const extraEmails = (Array.isArray(n.emails) ? n.emails : [])
      .filter((e) => e && e !== n.email).filter((e, i, a) => a.indexOf(e) === i).slice(0, 3);
    // Pessoas estruturadas (WORM-16): sócio da Receita etc. Cai no fallback ownerName quando o
    // backend não mandou `people` (blob antigo). Dedup por nome; teto discreto.
    const peopleList: PersonView[] = (Array.isArray(n.people) ? n.people : [])
      .filter((p) => p && String(p.name || "").trim())
      .filter((p, i, a) => a.findIndex((x) => String(x.name).trim().toLowerCase() === String(p.name).trim().toLowerCase()) === i)
      .slice(0, 6);
    if (!peopleList.length && n.ownerName) {
      peopleList.push({ name: n.ownerName, role: null, source: "receita_qsa", phoneDigits: n.ownerPhone || null });
    }
    return (
      // .kv dá o layout de "tabela" (label/valor alinhados + hairline entre linhas) às
      // .row/.k/.v abaixo — sem essa classe elas caem em fluxo inline (bug: "E-mail" e
      // o valor grudados, sem separador, quebrando linha de qualquer jeito).
      <div className={"kv" + (showAgenda ? " dn-contact-block" : "")} style={{ gap: 6 }}>
        {n.phone ? (
          showAgenda ? (
            <div className="dn-contact-primary-card">
              <span className="dn-contact-eyebrow">Contato principal</span>
              <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone dn-contact-primary">
                <CanalIcon canal="telefone" />
                <TypedText text={formatPhoneDisplay(n.phone)} speed={46} delay={20} />
                {li?.whatsappStatus === "confirmed" && (
                  <span className="dn-contact-verified">
                    <I d={ICONS.check} size={10} /> Verificado
                  </span>
                )}
              </a>
              <div className="dn-contact-primary-actions">
                <button type="button" className="btn-ghost" onClick={openPrimaryWhatsApp}>
                  <WhatsAppMark size={14} /> WhatsApp
                </button>
                <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="btn-teal">
                  <CanalIcon canal="telefone" size="sm" /> Ligar
                </a>
              </div>
            </div>
          ) : (
            <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone">
              <CanalIcon canal="telefone" /> {n.phone}
            </a>
          )
        ) : fieldPending(false) ? (
          // Enriquecendo: procurando telefone — placeholder, NÃO "ausente".
          <span className="dn-contact-skel" aria-label="Buscando telefone…" role="status" />
        ) : !loading ? (
          <div className="dn-no-phone muted-note">Sem telefone neste card.</div>
        ) : null}

        {extraPhones.map((p, i) => (
          <a key={`xp-${i}`} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="ctx-phone ctx-phone--inline">
            <CanalIcon canal="telefone" /> {showAgenda ? <TypedText text={formatPhoneDisplay(p)} speed={44} delay={40 + i * 25} /> : p}
          </a>
        ))}

        {n.website && (
          <a
            href={n.website.startsWith("http") ? n.website : `https://${n.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ctx-phone ctx-phone--site"
          >
            <CanalIcon canal="site" /> {showAgenda ? <TypedText text={n.website} speed={42} delay={70} /> : n.website}
          </a>
        )}

        {/* Bloco EMPRESA */}
        {hasCompanyData && (
            <div style={{ display: "grid", gap: 4 }}>
              <span className="dn-section-head">
                <I d={ICONS.mapin} size={11} /> Empresa
              </span>
              {n.cnpj && (
                <div className="row dn-kv-row">
                  <span className="k">CNPJ</span>
                  <span className="v hbx-mono"><TypedText text={formatBrCnpj(n.cnpj)} speed={46} delay={60} /></span>
                </div>
              )}
              {n.razaoSocial && (
                <div className="row dn-kv-row">
                  <span className="k">Razão social</span>
                  <span className="v"><TypedText text={n.razaoSocial} speed={46} delay={80} /></span>
                </div>
              )}
              {n.cnae && (
                <div className="row dn-kv-row">
                  <span className="k">CNAE</span>
                  <span className="v"><TypedText text={formatBrCnae(n.cnae)} speed={46} delay={100} /></span>
                </div>
              )}
              {n.ownerName && (
                <div className="row dn-kv-row">
                  <span className="k">Sócio</span>
                  <span className="v"><TypedText text={n.ownerName} speed={46} delay={120} /></span>
                </div>
              )}
              {n.ownerPhone && (
                <div className="row dn-kv-row">
                  <span className="k">Tel. do dono</span>
                  <span className="v">
                    <a
                      href={`tel:${n.ownerPhone.replace(/[^\d+]/g, "")}`}
                      className="ctx-phone ctx-phone--inline"
                      title={formatPhoneDisplay(n.ownerPhone)}
                    >
                      {showAgenda ? formatPhoneDisplay(n.ownerPhone) : n.ownerPhone}
                    </a>
                  </span>
                </div>
              )}
              {(n.ownerInstagram || n.ownerFacebook) && (
                <div className="row dn-kv-row">
                  <span className="k">Redes do dono</span>
                  <span className="v" style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                    {n.ownerInstagram && (
                      <a href={n.ownerInstagram} target="_blank" rel="noopener noreferrer">Instagram</a>
                    )}
                    {n.ownerFacebook && (
                      <a href={n.ownerFacebook} target="_blank" rel="noopener noreferrer">Facebook</a>
                    )}
                  </span>
                </div>
              )}
              {n.companySituation && (
                <div className="row dn-kv-row">
                  <span className="k">Situação</span>
                  <span className="v">
                    <span className={"tag" + (n.companySituation.toLowerCase().includes("ativa") ? " teal" : " warn")}>
                      <TypedText text={humanize(n.companySituation)} speed={46} delay={140} />
                    </span>
                  </span>
                </div>
              )}
            </div>
        )}

        {/* Bloco PESSOAS (WORM-16) — sócio da Receita e contatos estruturados, com wa.me + copiar. */}
        {peopleList.length > 0 && (
            <div style={{ display: "grid", gap: 4 }}>
              <span className="dn-section-head">
                <I d={ICONS.users} size={11} /> {peopleList.length > 1 ? "Pessoas" : "Pessoa"}
              </span>
              {peopleList.map((p, i) => (
                <PersonRow key={`person-${i}-${p.name}`} person={p} />
              ))}
            </div>
        )}

        {/* Empresa AINDA sendo buscada (enriquecendo, sem dado):
            placeholder pulsante das linhas-chave em vez de sumir a seção. */}
        {isEnriching && !hasCompanyData && (
          <div style={{ display: "grid", gap: 4 }}>
            <span className="dn-section-head">
              <I d={ICONS.mapin} size={11} /> Empresa
            </span>
            {[
              { k: "CNPJ", variant: "wide" as const },
              { k: "Razão social", variant: "full" as const },
              { k: "Sócio", variant: "wide" as const },
            ].map(({ k, variant }) => (
              <div className="row dn-kv-row" key={k}>
                <span className="k">{k}</span>
                <span className="v"><FieldSkel variant={variant} /></span>
              </div>
            ))}
          </div>
        )}

        {n.email && !n.channel && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <I d={ICONS.mail} size={13} /> E-mail
            </span>
            <span className="v"><TypedText text={n.email} speed={44} delay={40} /></span>
          </div>
        )}

        {/* E-mail sendo buscado (enriquecendo, sem e-mail nem canal). */}
        {!n.email && !n.channel && fieldPending(false) && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <I d={ICONS.mail} size={13} /> E-mail
            </span>
            <span className="v"><FieldSkel variant="wide" /></span>
          </div>
        )}

        {extraEmails.length > 0 && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <I d={ICONS.mail} size={13} /> {extraEmails.length > 1 ? "Outros e-mails" : "Outro e-mail"}
            </span>
            <span className="v" style={{ display: "grid", gap: 2 }}>
              {extraEmails.map((e, i) => (
                <span key={`em-${i}`} style={{ display: "block" }}>
                  <TypedText text={e} speed={44} delay={40 + i * 30} />
                </span>
              ))}
            </span>
          </div>
        )}

        {n.channel && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <I d={ICONS.msg} size={13} /> Canal
            </span>
            <span className="v"><span className="chan wa"><TypedText text={humanize(n.channel)} speed={46} delay={40} /></span></span>
          </div>
        )}

        {kvExtra}
      </div>
    );
  }

  function renderKvMain() {
    if (!n) return null;
    return (
      <div className="kv">
        {(n.valueLabel != null || n.value != null) && (
          <div className="row dn-kv-row">
            <span className="k">Valor</span>
            <span className="v is-strong">
              <TypedText text={String(n.valueLabel ?? n.value ?? "—")} speed={50} delay={0} />
            </span>
          </div>
        )}
        {n.productName && (
          <div className="row dn-kv-row">
            <span className="k">Produto</span>
            <span className="v"><TypedText text={n.productName} speed={46} delay={40} /></span>
          </div>
        )}
        {n.rating != null && (
          <div className="row dn-kv-row">
            <span className="k">Avaliação</span>
            <span className="v">
              <TypedText text={`★ ${n.rating.toFixed(1)}${n.reviews ? ` · ${n.reviews} avaliações` : ""}`} speed={46} delay={60} />
            </span>
          </div>
        )}
        {n.nextAction && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <I d={ICONS.clock} size={11} /> Próxima ação
            </span>
            <span className="v"><TypedText text={n.nextAction} speed={46} delay={80} /></span>
          </div>
        )}
        {n.lastResult && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <I d={ICONS.bolt} size={11} /> Último resultado
            </span>
            <span className="v"><TypedText text={n.lastResult} speed={46} delay={100} /></span>
          </div>
        )}
      </div>
    );
  }

  function renderSale() {
    if (!n || !n.sale || n.sale.status === "none") return null;
    const s = n.sale;
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <span className="dn-section-head">
          <I d={ICONS.money} size={11} /> Venda
        </span>
        <div className="kv">
          <div className="row dn-kv-row">
            <span className="k">Status</span>
            <span className="v">
              <span className={"tag" + (s.status === "sale_confirmed" ? " teal" : s.status === "canceled" ? " warn" : "")}>
                {s.statusLabel || humanize(s.status)}
              </span>
            </span>
          </div>
          <div className="row dn-kv-row">
            <span className="k">Valor fechado</span>
            <span className="v is-strong">
              <TypedText text={s.valueLabel ?? (s.value != null ? fmtMoney(s.value) : "—")} speed={46} delay={40} />
            </span>
          </div>
          <div className="row dn-kv-row">
            <span className="k">Comissão</span>
            <span className="v">
              {s.commissionLabel ?? s.commissionStatusLabel ?? "—"}
              {s.commissionValueLabel && (
                <span className="hbx-mono" style={{ marginLeft: 6 }}>{s.commissionValueLabel}</span>
              )}
              {!s.commissionValueLabel && s.commissionAmount != null && (
                <span className="hbx-mono" style={{ marginLeft: 6 }}>{fmtMoney(s.commissionAmount)}</span>
              )}
            </span>
          </div>
          {s.commissionRecurring && (
            <div className="row dn-kv-row">
              <span className="k">Tipo</span>
              <span className="v"><span className="tag teal">Recorrente</span></span>
            </div>
          )}
          {s.commissionDueAt && (
            <div className="row dn-kv-row">
              <span className="k">Vence</span>
              <span className="v"><TypedText text={fmtDate(s.commissionDueAt)} speed={46} delay={60} /></span>
            </div>
          )}
          {s.setupLabel && (
            <div className="row dn-kv-row">
              <span className="k">Implantação</span>
              <span className="v"><TypedText text={s.setupLabel} speed={46} delay={80} /></span>
            </div>
          )}
          {!s.setupLabel && s.setupValue != null && s.setupValue > 0 && (
            <React.Fragment>
              <div className="row dn-kv-row">
                <span className="k">Implantação</span>
                <span className="v">{fmtMoney(s.setupValue)}</span>
              </div>
              <div className="row dn-kv-row">
                <span className="k">Comissão implantação</span>
                <span className="v">
                  {s.setupCommissionStatusLabel || "—"}
                  {s.setupCommissionAmount != null ? ` · ${fmtMoney(s.setupCommissionAmount)}` : ""}
                </span>
              </div>
            </React.Fragment>
          )}
        </div>
        {s.commissionNote && (
          <div className="ctx-note">
            <span className="ctx-note-lbl">Nota</span>
            <p className="ctx-note-txt">{s.commissionNote}</p>
          </div>
        )}
      </div>
    );
  }

  function renderObs() {
    if (!n) return null;
    return (
      <>
        {!loading && onObsChange && (
          <div className="dn-obs-block">
            <h3>Observações</h3>
            <textarea
              className="field-dark"
              rows={3}
              maxLength={500}
              placeholder="Anotações deste contato…"
              value={obsDraft ?? ""}
              onChange={e => onObsChange(e.target.value)}
              style={{ resize: "vertical", paddingTop: 8, paddingBottom: 8 }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              {onSemInteresse ? (
                <span style={{ position: "relative", display: "grid" }}>
                  {n.doNotCall ? (
                    <button className="btn-ghost" onClick={onToggleDoNotCall}>Liberar contato</button>
                  ) : (
                    <button className="btn-ghost" onClick={() => setSemInteresseOpen(o => !o)}>
                      Sem interesse ▾
                    </button>
                  )}
                  {semInteresseOpen && !n.doNotCall && (
                    <div className="hbx-pop" style={{ position: "absolute", left: 0, bottom: "calc(100% + 4px)", zIndex: 30, minWidth: 210, padding: 6, display: "grid", gap: 2 }}>
                      {[
                        { key: "sem_interesse", label: "Sem interesse geral" },
                        { key: "ja_tem", label: "Já tem solução" },
                        { key: "preco", label: "Preço alto demais" },
                        { key: "sem_perfil", label: "Fora do perfil" },
                        { key: "nao_ligar", label: "Não ligar mais" },
                      ].map(({ key, label }) => (
                        <button key={key} className="nav-item" style={{ minHeight: 32, textAlign: "left" }}
                          onClick={() => { setSemInteresseOpen(false); onSemInteresse(key); }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              ) : onToggleDoNotCall ? (
                <button className="btn-ghost" onClick={onToggleDoNotCall}>
                  {n.doNotCall ? "Liberar contato" : "Não ligar mais"}
                </button>
              ) : null}
              {onObsSave && (
                <button className="btn-teal" style={{ minHeight: 36 }} disabled={obsBusy} onClick={onObsSave}>
                  {obsBusy ? "Salvando…" : "Salvar"}
                </button>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  function renderIntelligence() {
    if (!n || !li) return null;
    const hasOpportunityReason = Boolean(li.opportunityReason);
    const hasPainPitch = Boolean(li.painPitch);
    // `messageTemplate` pode vir string OU objeto {id,context,tone,text} (o board
    // expõe templates[0] do enrichment). Só o texto vira React child — renderizar
    // o objeto cru estoura React #31. Extrai o texto dos dois formatos.
    const templateText =
      typeof li.messageTemplate === "string"
        ? li.messageTemplate
        : String((li.messageTemplate as { text?: string } | null | undefined)?.text || "");
    const hasMessageTemplate = Boolean(templateText);
    const hasLeadReasonTags = Array.isArray(li.leadReasonTags) && li.leadReasonTags.length > 0;
    const hasPainType = Boolean(li.painType);

    if (!hasOpportunityReason && !hasPainPitch && !hasMessageTemplate && !hasLeadReasonTags && !hasPainType) {
      return null;
    }

    const content = (
      <div style={{ display: "grid", gap: 10 }}>
        <span className="dn-section-head">Inteligência do lead</span>

        {hasLeadReasonTags && (
          <div className="dn-chip-row">
            {(li.leadReasonTags as string[]).map(tag => (
              <span key={tag} className="tag">{humanize(tag)}</span>
            ))}
          </div>
        )}

        {hasPainType && (
          <div className="row dn-kv-row">
            <span className="k">Tipo de dor</span>
            <span className="v"><TypedText text={humanize(li.painType)} speed={46} delay={0} /></span>
          </div>
        )}

        {hasOpportunityReason && (
          <CollapsibleText label="Por que é oportunidade" text={li.opportunityReason!} />
        )}
        {hasPainPitch && (
          <CollapsibleText label="Pitch de dor" text={li.painPitch!} />
        )}
        {hasMessageTemplate && (
          <CollapsibleText label="Modelo de mensagem" text={templateText} />
        )}
      </div>
    );
    return content;
  }

  function renderOrigin() {
    if (!n) return null;
    const hasOrigin = Boolean(n.sourceType || n.primarySource);
    const sourceChainLabel = fmtSourceChainLabel(n.sourceChain);
    if (!hasOrigin && !sourceChainLabel) return null;
    return (
      <div className="kv">
        {hasOrigin && (
          <div className="row dn-kv-row">
            <span className="k">Origem</span>
            <span className="v">
              <span className="tag teal">
                <TypedText text={fmtSourceLabel(n.sourceType, n.primarySource)} speed={46} delay={0} />
              </span>
            </span>
          </div>
        )}
        {sourceChainLabel && (
          <div className="row dn-kv-row">
            <span className="k">Motores</span>
            <span className="v">
              <span className="tag" title="Cadeia de fontes que localizou este card">
                {sourceChainLabel}
              </span>
            </span>
          </div>
        )}
      </div>
    );
  }

  function renderDates() {
    if (!n) return null;
    if (!n.createdAt) return null;
    return (
      <div className="kv">
        <div className="row dn-kv-row">
          <span className="k">Criado em</span>
          <span className="v chip"><TypedText text={fmtDateTime(n.createdAt)} speed={46} delay={0} /></span>
        </div>
      </div>
    );
  }

  function renderHistoryList(entries: NegocioDetailHistory[]) {
    return (
      <ul className="ctx-timeline">
        {entries.map(ev => (
          <li className="ctx-tl-item" key={ev.id}>
            <span className="ctx-tl-dot" aria-hidden="true" />
            <div className="ctx-tl-body">
              <span className="ctx-tl-title" title={ev.title || undefined}>{ev.title || "Atualização"}</span>
              {clientTimelineDescription(ev.description) && (
                <span className="ctx-tl-desc" title={clientTimelineDescription(ev.description)}>{clientTimelineDescription(ev.description)}</span>
              )}
              <div className="ctx-tl-foot">
                {ev.resultLabel && <span className="tag teal">{ev.resultLabel}</span>}
                {ev.returnAt && <span className="tag warn">Retorno {fmtDate(ev.returnAt)}</span>}
                <span className="ctx-tl-when">{fmtDate(ev.createdAt)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function renderHistory() {
    if (!n) return null;
    if (loading) {
      return (
        <div className="ctx-sec">
          <h3 style={{ margin: 0 }}>{historyLabel}</h3>
          <div style={{ display: "grid", gap: 12, marginTop: 4 }}>
            {[75, 60, 80].map((w, i) => (
              <div key={i} style={{ display: "grid", gap: 5 }}>
                <span className="dn-skel dn-skel-md" style={{ width: `${w}%` }} />
                <span className="dn-skel dn-skel-sm dn-skel-w45" />
              </div>
            ))}
          </div>
        </div>
      );
    }
    const hist = n.history;
    if (!hist || hist.length === 0) {
      return (
        <div className="ctx-sec">
          <h3 style={{ margin: 0 }}>{historyLabel}</h3>
          <p className="muted-note">Sem histórico ainda.</p>
        </div>
      );
    }
    const preview = hist.slice(0, 3);
    const hasMore = hist.length > 3;
    return (
      <div className="dn-history">
        <div className="dn-history-head">
          <span className="dn-history-title">{historyLabel}</span>
          {hasMore && (
            <button
              type="button"
              className="link dn-history-toggle"
              onClick={() => setInternalTab(internalTab === 0 ? 1 : 0)}
            >
              {internalTab === 0 ? `Ver todas (${hist.length})` : "← Voltar"}
            </button>
          )}
        </div>
        {internalTab === 0 ? renderHistoryList(preview) : renderHistoryList(hist)}
      </div>
    );
  }

  function renderDetalhes() {
    if (!n) return null;
    const hasReturnAt = n.returnAt !== undefined;
    const hasLastContact = n.lastContactAt !== undefined;
    const hasLastMsg = n.lastMessageAt !== undefined;
    const hasAttempts = n.attemptCount != null;
    const hasOwner = Boolean(n.owner?.name);
    const hasSeen = n.timesSeen != null && n.timesSeen > 1;
    const hasRecChannel = Boolean(recChannel);
    const hasQuality = Boolean(li?.contactQuality && li.contactQuality !== "review");
    const hasHistory = Boolean(n.history);

    const hasAnyKv = hasReturnAt || hasLastContact || hasLastMsg || hasAttempts || hasOwner || hasSeen || hasRecChannel || hasQuality;
    if (!hasAnyKv && !hasHistory) return null;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {hasAnyKv && (
          <div className="kv">
            {hasRecChannel && (
              <div className="row dn-kv-row">
                <span className="k">Canal recomendado</span>
                <span className="v">
                  <CanalIcon canal={recChannel!} size="sm" />{" "}
                  <TypedText text={humanize(recChannel)} speed={46} delay={0} />
                </span>
              </div>
            )}
            {hasQuality && (
              <div className="row dn-kv-row">
                <span className="k">Qualidade de contato</span>
                <span className="v">
                  <span className={"tag" + (li!.contactQuality === "blocked" ? " red" : "")}>
                    {humanize(li!.contactQuality)}
                  </span>
                </span>
              </div>
            )}
            {hasReturnAt && (
              <div className="row dn-kv-row">
                <span className="k">Próximo retorno</span>
                <span className={"v chip" + (n.returnAt ? "" : " is-empty")}>
                  <TypedText text={fmtDate(n.returnAt)} speed={50} delay={0} />
                </span>
              </div>
            )}
            {hasLastContact && (
              <div className="row dn-kv-row">
                <span className="k">Último contato</span>
                <span className={"v chip" + (n.lastContactAt ? "" : " is-empty")}>
                  <TypedText text={fmtDate(n.lastContactAt)} speed={50} delay={40} />
                </span>
              </div>
            )}
            {hasLastMsg && (
              <div className="row dn-kv-row">
                <span className="k">Última mensagem</span>
                <span className="v chip"><TypedText text={fmtDateTime(n.lastMessageAt)} speed={46} delay={80} /></span>
              </div>
            )}
            {hasAttempts && (
              <div className="row dn-kv-row">
                <span className="k">Tentativas</span>
                <span className={"v chip" + (n.attemptCount! > 0 ? "" : " is-empty")}>
                  <TypedText text={String(n.attemptCount)} speed={50} delay={120} />
                </span>
              </div>
            )}
            {hasSeen && (
              <div className="row dn-kv-row">
                <span className="k">Visto</span>
                <span className="v chip"><TypedText text={`${n.timesSeen}×`} speed={50} delay={140} /></span>
              </div>
            )}
            {hasOwner && (
              <div className="row dn-kv-row">
                <span className="k">Responsável</span>
                <span className="v" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Av name={n.owner!.name!} size={18} />
                  <TypedText text={n.owner!.name!} speed={50} delay={160} />
                </span>
              </div>
            )}
          </div>
        )}
        {hasHistory && renderHistory()}
      </div>
    );
  }

  function renderActions() {
    if (!actions) return null;
    return <div className="dn-actions">{actions}</div>;
  }

  // ── Mapa de seções secundárias ───────────────────────────────────────────

  const sectionMap: Record<string, React.ReactNode> = {
    detalhes: !loading ? renderDetalhes() : null,
    intelligence: !loading ? renderIntelligence() : null,
    origin: !loading ? renderOrigin() : null,
    dates: !loading ? renderDates() : null,
  };

  const secondarySections = CARD_SECONDARY.map(k => sectionMap[k]).filter(Boolean);

  // Zona 1 premium: score + teaser (só mostrar box se tem conteúdo)
  const scoreNode = renderScore();
  const teaserNode = renderOpportunityTeaser();
  const hasZone1Intel = Boolean(scoreNode || teaserNode);

  // Costura: só mostra se zona 2 tem conteúdo relevante
  const hasZone2 = Boolean(actions || n?.returnAt || n?.attemptCount != null || n?.owner?.name || n?.valueLabel || n?.value || n?.sale);

  return (
    <div className={"dn-root" + (showAgenda ? " dn-root--vendas" : "")}>

      {/* ── Título com expandir (opt-in) + fechar ─────────────────────── */}
      {/* Sem showAgenda o DOM continua idêntico para Atendimento/Leads. */}
      <h3 className={showAgenda ? "dn-root__topbar" : undefined}>
        {title}
        {showAgenda ? (
          <span className="dn-root__top-actions">
            {onDelete && (
              <button
                type="button"
                className={"dn-root__top-action dn-root__top-action--danger" + (deleteArm ? " is-armed" : "")}
                onClick={() => {
                  if (deleteArm) {
                    onDelete?.();
                    setDeleteArm(false);
                  } else {
                    setDeleteArm(true);
                  }
                }}
                aria-label={deleteArm ? "Confirmar exclusão do card" : "Excluir card"}
                title={deleteArm ? "Clique novamente para confirmar" : "Excluir card"}
              >
                <I d={ICONS.trash} size={15} />
              </button>
            )}
            {onExpand && (
              <button type="button" className="dn-root__top-action" onClick={onExpand} aria-label="Abrir cockpit" title="Abrir cockpit">
                <I d={EXPAND_ICON_D} size={14} />
              </button>
            )}
            {onClose && (
              <button type="button" className="dn-root__top-action" onClick={onClose} aria-label="Fechar painel" title="Fechar">
                <I d={ICONS.x} size={14} />
              </button>
            )}
          </span>
        ) : onExpand ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span className="x" onClick={onExpand} role="button" aria-label="Abrir cockpit" title="Abrir cockpit">
              <I d={EXPAND_ICON_D} size={14} />
            </span>
            {onClose && (
              <span className="x" onClick={onClose} role="button" aria-label="Fechar painel">✕</span>
            )}
          </span>
        ) : (
          onClose && (
            <span className="x" onClick={onClose} role="button" aria-label="Fechar painel">✕</span>
          )
        )}
      </h3>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!n && (
        <div className="ctx-empty">
          <span className="ctx-empty__icon">←</span>
          <span className="ctx-empty__hint">{emptyHint || "Selecione um item para ver os detalhes."}</span>
        </div>
      )}

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      {n && (
        <>
          {lightboxSrc && <PhotoLightbox src={lightboxSrc} name={n.name || undefined} onClose={() => setLightboxSrc(null)} />}

          {/* ── ZONA 1 "Quem é" ─────────────────────────────────────── */}
          <div className="dn-zone dn-zone--1">

            {/* Header: avatar + nome + canais */}
            <div className="dn-header">
              <div className="ctx-hero">
                <span
                  onClick={() => { if (n.avatarUrl) setLightboxSrc(n.avatarUrl); }}
                  style={{ cursor: n.avatarUrl ? "zoom-in" : "default", display: "inline-flex" }}
                >
                  <Av name={n.name || "—"} src={n.avatarUrl ?? undefined} online={n.online} size={56} />
                </span>
                <div className="ident">
                  <div className="ident-top">
                    <span className="company" style={{ flex: 1, minWidth: 0 }}>
                      <TypedText text={n.name || "—"} speed={62} delay={0} />
                    </span>
                    {isEnriching && (
                      <span className="dn-enriching-badge" title="A IA está enriquecendo este lead agora" aria-label="Enriquecendo este lead agora" role="status">
                        <span className="dn-enriching-badge__spark" aria-hidden="true">✨</span>
                        Enriquecendo…
                      </span>
                    )}
                    {n.enriched && (
                      <span className="dn-crown" title="Lead enriquecido" aria-label="Lead enriquecido">
                        <I d={ICONS.crown} size={15} />
                      </span>
                    )}
                    {crownSlot && <>{crownSlot}</>}
                    {heroAction && <>{heroAction}</>}
                  </div>
                  {n.segment ? (
                    <div className="sub sub--seg">
                      <TypedText text={n.segment} speed={50} delay={180} />
                    </div>
                  ) : fieldPending(false) ? (
                    <div className="sub sub--seg"><FieldSkel variant="wide" /></div>
                  ) : !n.city ? (
                    <div className="sub sub--seg">
                      <TypedText text="—" speed={50} delay={180} />
                    </div>
                  ) : null}
                  {n.city && (
                    <div className="sub sub--loc">
                      <I d={ICONS.mapin} size={11} />{" "}
                      <TypedText text={buildLocationLine(n.city, n.state, n.address)} speed={46} delay={300} />
                    </div>
                  )}
                  <div className="ctx-tags">
                    {n.statusLabel && <span className="tag">{n.statusLabel}</span>}
                    {detailEngagementMeta && !showAgenda && <span className={detailEngagementMeta.className}>{detailEngagementMeta.label}</span>}
                    {n.doNotCall && <span className="tag red">Não ligar</span>}
                    {n.leadTemperature && (
                      <span className={"tag" + (n.leadTemperature === "quente" ? " red" : n.leadTemperature === "morno" ? " warn" : "")}>
                        {humanize(n.leadTemperature)}
                      </span>
                    )}
                    {freshCompanyBadge && (
                      <span className="tag teal" title="Empresa aberta recentemente — urgência real de venda">
                        {freshCompanyBadge}
                      </span>
                    )}
                    {renderStatusChip()}
                    {loading && !n.statusLabel && !n.leadTemperature && (
                      <span className="dn-skel dn-skel-pill" />
                    )}
                  </div>
                </div>
              </div>

              {/* Fileira dos canais tri-cor */}
              <ChannelRow
                n={n}
                onWaExternal={onWaOpenExternal ?? undefined}
                onWaInternal={onWaOpenInternal ?? undefined}
                waQrActive={waQrActive}
                waCanInternal={waCanInternal}
                onDelete={showAgenda ? undefined : onDelete}
              />
            </div>

            {/* Score ring + teaser — premium (só se há dados) */}
            {hasZone1Intel && (
              <div className="dn-zone1-intel">
                {scoreNode}
                {teaserNode}
              </div>
            )}

            {/* Contatos + empresa */}
            {renderContacts()}

          </div>

          {/* ── WORM-11: conversa WhatsApp embutida (centro do card) ──── */}
          {showConversation && !loading && n.phone && (
            <div className="dn-zone dn-zone--convo">
              {showAgenda && (
                <div className="dn-vendas-section-head">
                  <span className="dn-section-head"><I d={ICONS.msg} size={12} /> Conversa</span>
                  {detailEngagementMeta && (
                    <span className={detailEngagementMeta.className}>{detailEngagementMeta.label}</span>
                  )}
                </div>
              )}
              <ConversationPanel
                key={conversationLeadId || n.phone}
                phone={n.phone}
                name={n.name}
                leadId={conversationLeadId}
                conversationId={n.conversation?.id}
                conversationSnapshot={{ conversation: n.conversation, engagement: n.engagement }}
                onConversationChanged={onConversationChanged}
              />
            </div>
          )}

          {/* ── Agenda do lead embutida (item 2 da revisão, 07/07) ──────
              Compromissos deste card + criação já vinculada, sem sair da ficha. */}
          {showAgenda && !loading && (
            <div className="dn-zone dn-zone--agenda">
              <AgendaLeadPanel key={n.id} leadId={n.id} />
            </div>
          )}

          {/* ── COSTURA "O que fazer" ─────────────────────────────────── */}
          {hasZone2 && (
            <div className="dn-zone-sep">
              <span className="dn-zone-sep__label">O que fazer</span>
            </div>
          )}

          {/* ── ZONA 2 "O que fazer" ──────────────────────────────────── */}
          {hasZone2 && (
            <div className="dn-zone dn-zone--2">
              {loading ? (
                <div className="kv">
                  <div className="row"><span className="k">Etapa</span><span className="v"><span className="dn-skel dn-skel-pill" /></span></div>
                  <div className="row"><span className="k">Próxima ação</span><span className="v"><span className="dn-skel dn-skel-md dn-skel-w60" /></span></div>
                  <div className="row"><span className="k">Valor</span><span className="v"><span className="dn-skel dn-skel-sm dn-skel-w45" /></span></div>
                </div>
              ) : (
                <>
                  {renderKvMain()}
                  {renderSale()}
                  {renderObs()}
                  {renderActions()}
                </>
              )}
            </div>
          )}

          {/* ── SEPARADOR + CHEVRON "Mais detalhes" ─────────────────── */}
          {secondarySections.length > 0 && (
            <>
              <div className="sep" />
              <button
                className={"dn-expand-btn" + (expanded ? " is-open" : "")}
                type="button"
                onClick={() => setExpanded(o => !o)}
                aria-expanded={expanded}
              >
                <ChevronDown />
                Mais detalhes
              </button>
            </>
          )}

          {/* ── SEÇÕES SECUNDÁRIAS (sob o chevron) ───────────────────── */}
          {expanded && secondarySections.map((section, idx) => (
            <React.Fragment key={idx}>{section}</React.Fragment>
          ))}
        </>
      )}

    </div>
  );
}
