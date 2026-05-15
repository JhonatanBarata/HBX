"use client";

import Link from "next/link";
import Image from "next/image";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import LiquidGlassCard, {
  liquidGlassCardStyles as glassCardStyles,
} from "@/components/LiquidGlassCard";
import HbxMobileDock from "@/components/mobile/HbxMobileDock";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
import { apiFetch } from "@/app/_lib/api";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { HBX_WINDOW_STANDARD } from "@/lib/hbx-window-system";
import {
  clearStoredRadarRun,
  formatPtBrReceivedCards,
  isTerminalRadarRunStatus,
  readStoredRadarRun,
  saveStoredRadarRun,
  subscribeStoredRadarRun,
  type StoredRadarRun,
} from "@/lib/radar-active-run";
import {
  clearTopbarProgress,
  dispatchTopbarProgress,
} from "@/lib/topbar-progress";
import styles from "./page.module.css";

type LeadStatus = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
type LeadBlockKey = "today" | "overdue" | "scheduled" | "closed";
type DateFilterKey = "overdue" | "today" | `scheduled:${string}`;
type MobileAgendaTab = "overdue" | "today" | "upcoming";
type WhatsappFilter = "all" | "with" | "without";
type InboxFilter = "all" | "in" | "out";
type RadarSearchRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial_error"
  | "completed_insufficient_results"
  | "failed"
  | "canceled";
type RadarSearchRunResponse = {
  id: string;
  runId: string;
  status: RadarSearchRunStatus;
  targetQuantity: number;
  foundCount: number;
  message?: string | null;
  meta?: {
    requestedQuantity?: number;
    deliveredCount?: number;
    progress?: number;
    terminal?: boolean;
    filters?: {
      state?: string | null;
      city?: string | null;
      segment?: string | null;
    };
  };
};
type LeadTimelineEventType =
  | "lead_created"
  | "origin_registered"
  | "contact_made"
  | "result_recorded"
  | "return_scheduled"
  | "status_changed"
  | "lead_closed"
  | "lead_reused"
  | "generic";

type LeadTimelineEvent = {
  id: string;
  eventType: LeadTimelineEventType;
  title: string;
  description?: string | null;
  sourceType?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  resultLabel?: string | null;
  returnAt?: string | null;
  createdAt?: string | null;
};

type SharedProfileSummary = {
  displayName?: string | null;
  phone?: string | null;
  origin?: string | null;
  lastContactAt?: string | null;
  currentContext?:
    | "vendas"
    | "atendimento"
    | "recovery"
    | "neutro"
    | string
    | null;
  presence?: {
    vendas?: { present?: boolean; status?: string | null };
    atendimento?: {
      present?: boolean;
      customerId?: string | null;
      conversationId?: string | number | null;
      lastContactAt?: string | null;
    };
    recovery?: {
      present?: boolean;
      status?: string | null;
      openAmount?: number | null;
    };
  };
};

type LeadMessageTemplate = {
  id: string;
  context: string;
  tone: string;
  text: string;
};

type LeadIntelligence = {
  email?: string | null;
  emailStatus?: "confirmed" | "probable" | "missing" | "unverified" | string;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  socialStatus?: "found" | "missing" | "weak" | "unknown" | string;
  socialConfidence?: number | null;
  primarySocial?: "instagram" | "facebook" | "both" | null;
  whatsappStatus?: "confirmed" | "missing" | "invalid" | "unverified" | string;
  contactQuality?: "ready" | "review" | "weak" | "blocked" | string;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
  leadReasonTags?: string[];
  nextBestAction?: "whatsapp" | "call" | "email" | "review" | "discard" | string;
  lastVerifiedAt?: string | null;
  verifiedBy?: "hbx_master" | "client_engine" | "manual" | string | null;
  messageTemplate?: LeadMessageTemplate | null;
  messageTemplates?: LeadMessageTemplate[];
  templateLibrarySize?: number;
  premiumTeaser?: {
    label?: string | null;
    cta?: string | null;
  } | null;
};

type VendasCapabilities = {
  canSeeLeadIntelligence?: boolean;
  canSeeOpportunityReason?: boolean;
  canSeeSocialLinks?: boolean | "teaser_only";
  canSeeMessageTemplates?: boolean;
  canUseAdvancedFilters?: boolean;
  canUseVerifiedWhatsapp?: boolean | "limited";
  canUseFilteredQuota?: boolean;
};

type LeadItem = {
  id: string;
  sourceType: "manual" | "webscraping";
  primarySource?: string | null;
  sourceHistoryId?: string | null;
  timesSeen?: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews?: number | null;
  city?: string | null;
  segment?: string | null;
  status: LeadStatus;
  statusLabel: string;
  nextAction?: string | null;
  returnAt?: string | null;
  shortNote?: string | null;
  lastContactAt?: string | null;
  attemptCount?: number;
  lastResult?: string | null;
  wasClosedBefore?: boolean;
  updatedAt?: string | null;
  createdAt?: string | null;
  signals?: {
    alreadyExisted: boolean;
    cameFromWebscraping: boolean;
    hadPreviousContact: boolean;
    wasClosedBefore: boolean;
  };
  whatsappAvailability?: {
    status?: "unknown" | "available" | "unavailable";
    checkedAt?: string | null;
    message?: string | null;
  } | null;
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  leadIntelligence?: LeadIntelligence | null;
  isInInbox?: boolean;
  inboxConversationId?: string | number | null;
  atendimentoConversationId?: string | number | null;
  sharedProfile?: SharedProfileSummary | null;
  timeline?: LeadTimelineEvent[];
  quickActions: string[];
};

type BoardResponse = {
  summary: {
    total: number;
    today: number;
    overdue: number;
    scheduled: number;
    closed: number;
  };
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  blocks: Record<LeadBlockKey, LeadItem[]>;
};

type TodayAgendaSyncResponse = {
  ok?: boolean;
  todayLeadCount?: number;
  mirroredLeadCount?: number;
  conversationIds?: Array<string | number>;
  leadConversationIds?: Record<string, string | number>;
  activated?: number;
  updated?: number;
  deactivated?: number;
  skippedWithoutPhone?: number;
  skippedWithoutWhatsapp?: number;
  message?: string | null;
};

type BulkDeleteLeadsResponse = {
  ok?: boolean;
  deletedCount?: number;
};

type ReportLeadErrorResponse = {
  ok?: boolean;
  deletedCount?: number;
  autoSent?: boolean;
  whatsappUrl?: string | null;
  message?: string | null;
};

type LeadEnrichmentResponse = {
  ok?: boolean;
  leadId: string;
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  whatsappAvailability?: LeadItem["whatsappAvailability"];
  leadIntelligence?: LeadIntelligence | null;
};

type LeadDraft = {
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  nextAction: string;
  returnAt: string;
  shortNote: string;
};

type DateFilterItem = {
  key: DateFilterKey;
  blockKey: Exclude<LeadBlockKey, "closed">;
  count: number;
  title: string;
  subtitle: string;
  dayLabel: string;
  isoDate?: string | null;
};

type LeadCardView = {
  lead: LeadItem;
  draft: LeadDraft;
  blockKey: LeadBlockKey;
  selected: boolean;
  saving: boolean;
  onFocus: () => void;
  onQuickAction: (action: string) => void;
  onInboxAction: (lead: LeadItem) => void;
  onEdit?: (id: string | null) => void;
  onDraftChange?: (leadId: string, patch: Partial<LeadDraft>) => void;
  onEditingActiveChange?: (active: boolean) => void;
  onSave?: (leadId: string) => void;
  editing?: boolean;
  bulkSelectionMode?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: (leadId: string) => void;
};

type FlyAnimation = {
  leadId: string;
  lead: LeadItem;
  draft: LeadDraft;
  blockKey: LeadBlockKey;
  from: { x: number; y: number; width: number; height: number };
  to: { x: number; y: number; width: number; height: number };
};

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "novo", label: "Novo lead" },
  { value: "contato", label: "Em contato" },
  { value: "retorno", label: "Retorno" },
  { value: "qualificado", label: "Qualificado" },
  { value: "encerrado", label: "Encerrado" },
];

const BLOCK_LABELS: Record<LeadBlockKey, string> = {
  overdue: "Atrasados",
  today: "Hoje",
  scheduled: "Programados",
  closed: "Encerrados",
};
const VENDAS_PROGRESS_STEPS = [
  "lendo banco",
  "filtrando negativos",
  "selecionando melhores cards",
  "alimentando Vendas/Prospecção",
];
const MOBILE_READY_MESSAGE_PREF_KEY = "hbx.vendas.mobile.readyMessagePreference.v1";
const MOBILE_PREFERRED_CALLER_NAME_KEY = "hbx.vendas.mobile.preferredCallerName.v1";
const MOBILE_OPEN_LEAD_KEY = "hbx.vendas.mobile.openLeadId.v1";
const MOBILE_READY_MESSAGE_LIBRARY = [
  "Olá, {{name}}. Vi a {{company}} em {{city}} e queria te mostrar uma forma simples de organizar contatos, retornos e oportunidades sem depender de planilha.",
  "Oi, {{name}}. Notei que empresas de {{segment}} costumam perder retorno por falta de acompanhamento. Posso te mandar uma ideia rápida para resolver isso?",
  "Olá! Vi a {{company}} e achei que o HBX pode ajudar vocês a acompanhar interessados, lembretes e próximos contatos em um só lugar.",
  "Oi, tudo bem? Trabalho com uma solução para organizar prospecção e atendimento pelo WhatsApp. Faz sentido eu te explicar em 1 minuto?",
  "Olá, {{name}}. Posso te mostrar como deixar os contatos de {{segment}} mais organizados e com retorno automático no momento certo?",
  "Oi! Passei pelo perfil da {{company}} e vi espaço para melhorar acompanhamento de clientes. Posso te enviar uma explicação curta?",
  "Olá. O HBX ajuda empresas locais a não esquecerem retorno, orçamento e follow-up. Posso te mostrar como ficaria para {{segment}}?",
  "Oi, {{name}}. Se hoje vocês anotam contatos em WhatsApp, agenda ou planilha, tenho uma forma mais simples de centralizar isso. Posso mandar?",
  "Olá! Vi a {{company}} em {{city}}. Posso te mostrar uma ideia para transformar contatos soltos em uma fila clara de próximas ações?",
  "Oi. Ajudo empresas a organizar leads, retornos e atendimentos para vender com mais previsibilidade. Posso te explicar rapidamente?",
  "Olá, {{name}}. Tenho uma sugestão prática para melhorar o controle dos contatos que chegam pelo WhatsApp. Posso te enviar?",
  "Oi! A ideia é simples: cada contato vira um card com status, lembrete e próxima ação. Quer ver como isso pode funcionar para {{company}}?",
  "Olá. Vi que {{segment}} depende muito de retorno rápido. Posso te mostrar uma ferramenta para não deixar interessados esfriarem?",
  "Oi, {{name}}. O HBX organiza quem precisa ser chamado hoje, amanhã e depois. Posso te mandar um exemplo aplicado à {{company}}?",
  "Olá! Posso te mostrar uma forma de acompanhar orçamento, retorno e conversa sem perder histórico no WhatsApp?",
  "Oi. Trabalho com automação comercial para pequenas empresas. A proposta é ganhar controle sem complicar a rotina. Posso explicar?",
  "Olá, {{name}}. Se fizer sentido, te mostro como a {{company}} pode ter uma fila diária de contatos prioritários para chamar.",
  "Oi! Vi a {{company}} e pensei em uma melhoria simples: lembrar automaticamente quem precisa de retorno. Posso mandar a ideia?",
  "Olá. O HBX ajuda a separar contato novo, retorno e cliente interessado. Posso te mostrar como isso reduz esquecimentos?",
  "Oi, tudo bem? Tenho uma solução para organizar atendimento e prospecção em uma visão de app. Posso te mandar um resumo?",
  "Olá, {{name}}. Empresas de {{segment}} costumam ganhar muito quando cada conversa já nasce com próxima ação. Posso te mostrar?",
  "Oi! Posso te enviar uma ideia para acompanhar leads por prioridade, com WhatsApp, ligação e observação no mesmo lugar?",
  "Olá. Vi a {{company}} e queria sugerir um jeito de melhorar retorno comercial sem contratar mais gente agora.",
  "Oi, {{name}}. O objetivo é simples: menos contato perdido e mais follow-up no dia certo. Posso te explicar como?",
  "Olá! Se vocês recebem pedidos, dúvidas ou orçamentos pelo WhatsApp, o HBX pode organizar isso em cards. Posso mostrar?",
  "Oi. Posso te mandar um exemplo de fluxo para a {{company}} acompanhar contatos e oportunidades com mais clareza?",
  "Olá, {{name}}. Tenho uma ideia curta para transformar o WhatsApp em uma agenda comercial organizada. Faz sentido eu enviar?",
  "Oi! Vi a {{company}} em {{city}} e achei que vocês podem se beneficiar de uma rotina mais clara de retorno aos clientes.",
  "Olá. O HBX mostra o próximo contato certo e evita que leads fiquem esquecidos. Posso te mostrar a ideia?",
  "Oi, {{name}}. Posso te explicar como organizar clientes interessados por status, data de retorno e canal de contato?",
  "Olá! Trabalho com uma plataforma que ajuda empresas a venderem com mais organização no WhatsApp. Posso te mandar uma prévia?",
  "Oi. Se hoje vocês dependem de memória para retornar clientes, tenho uma solução simples para automatizar lembretes. Posso mostrar?",
  "Olá, {{name}}. Vi a {{company}} e pensei em uma forma de melhorar acompanhamento sem mudar o jeito que vocês atendem.",
  "Oi! Posso te mandar uma ideia rápida para organizar prospecção, contatos e retornos usando o HBX?",
  "Olá. Para {{segment}}, velocidade de retorno faz diferença. Posso te mostrar como priorizar quem chamar primeiro?",
  "Oi, {{name}}. O HBX ajuda a enxergar quem está quente, quem precisa de retorno e quem deve ser descartado. Quer ver?",
  "Olá! Tenho uma forma de deixar o comercial mais visual: cards, score, próxima ação e mensagem pronta. Posso enviar?",
  "Oi. Vi a {{company}} e queria te mostrar um jeito de reduzir retrabalho no acompanhamento dos contatos.",
  "Olá, {{name}}. Posso te mostrar como o HBX organiza WhatsApp, ligação e observações em uma rotina diária de vendas?",
  "Oi! A proposta é ajudar a {{company}} a não perder oportunidades por falta de follow-up. Posso te explicar?",
  "Olá. Se vocês fazem orçamento ou atendimento consultivo, o HBX pode lembrar cada próxima etapa. Posso mandar um resumo?",
  "Oi, {{name}}. Tenho uma ideia para deixar o retorno ao cliente mais rápido e rastreável. Posso compartilhar?",
  "Olá! Vi a {{company}} e achei que uma agenda comercial inteligente pode ajudar no dia a dia. Posso te mostrar?",
  "Oi. Posso te enviar uma explicação bem objetiva de como o HBX organiza leads e retornos para empresas locais?",
  "Olá, {{name}}. O HBX cria uma fila de ação para o time saber quem chamar agora. Posso mostrar como seria para {{segment}}?",
  "Oi! Se fizer sentido, te mando um exemplo de mensagem, card e próxima ação para a rotina comercial da {{company}}.",
  "Olá. Ajudo empresas a terem mais controle dos contatos vindos do WhatsApp. Posso te mandar uma ideia rápida?",
  "Oi, {{name}}. Vi a {{company}} e pensei em uma melhoria simples para organizar oportunidades sem perder o histórico.",
  "Olá! Posso te mostrar como priorizar contatos bons, descartar negativos e manter retornos no prazo?",
  "Oi. Tenho uma sugestão curta para melhorar a cadência comercial da {{company}} com menos esforço manual. Posso enviar?",
] as const;

const WHATSAPP_FILTER_LABELS: Record<WhatsappFilter, string> = {
  all: "Whatsapp",
  with: "Com WhatsApp",
  without: "Sem WhatsApp",
};

const INBOX_FILTER_LABELS: Record<InboxFilter, string> = {
  all: "Inbox: Todos",
  in: "Inbox: No Inbox",
  out: "Inbox: Fora do Inbox",
};

function formatDateTime(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
}

function formatShortDate(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "-";
}

function toDatetimeLocal(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function plusDaysDatetimeLocal(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  now.setHours(
    days > 0 ? 9 : now.getHours(),
    days > 0 ? 0 : now.getMinutes(),
    0,
    0,
  );
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function normalizePhoneDigits(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function buildCallUrl(phone?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  return digits ? `tel:+55${digits}` : "";
}

function buildWhatsAppUrl(phone?: string | null, leadName?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  if (!digits) return "";
  const message = leadName
    ? `Olá, ${leadName}. Estou retomando nosso contato pelo HBX Vendas.`
    : "Olá. Estou retomando nosso contato pelo HBX Vendas.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

function buildWhatsAppUrlWithMessage(phone?: string | null, message?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  if (!digits) return "";
  const text = String(message || "").trim() || "Olá. Estou retomando nosso contato pelo HBX Vendas.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(text)}`;
}

function leadEmailForDisplay(lead: LeadItem) {
  return String(lead.email || lead.leadIntelligence?.email || "").trim();
}

function leadWebsiteForDisplay(lead: LeadItem) {
  return String(lead.website || "").trim();
}

function normalizeExternalUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function leadCapabilities(lead: LeadItem, board?: BoardResponse | null): VendasCapabilities {
  return lead.capabilities || board?.capabilities || {};
}

function canSeeLeadIntelligence(lead: LeadItem, board?: BoardResponse | null) {
  return leadCapabilities(lead, board).canSeeLeadIntelligence === true;
}

function canSeeSocialLinks(lead: LeadItem, board?: BoardResponse | null) {
  return leadCapabilities(lead, board).canSeeSocialLinks === true;
}

function socialBadgeLabel(primarySocial?: LeadIntelligence["primarySocial"]) {
  if (primarySocial === "instagram") return "IG";
  if (primarySocial === "facebook") return "f";
  if (primarySocial === "both") return "Redes";
  return "";
}

function readMobileReadyMessagePreference() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(MOBILE_READY_MESSAGE_PREF_KEY));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function saveMobileReadyMessagePreference(index: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOBILE_READY_MESSAGE_PREF_KEY, String(Math.max(0, Math.floor(index))));
}

function readMobileOpenLeadId() {
  if (typeof window === "undefined") return "";
  return String(window.sessionStorage.getItem(MOBILE_OPEN_LEAD_KEY) || "").trim();
}

function saveMobileOpenLeadId(leadId: string | null) {
  if (typeof window === "undefined") return;
  const normalized = String(leadId || "").trim();
  if (normalized) window.sessionStorage.setItem(MOBILE_OPEN_LEAD_KEY, normalized);
  else window.sessionStorage.removeItem(MOBILE_OPEN_LEAD_KEY);
}

function mobileMessageTokenValue(value: string | null | undefined, fallback: string) {
  return String(value || "").trim() || fallback;
}

function readMobilePreferredCallerName() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(MOBILE_PREFERRED_CALLER_NAME_KEY) || "").trim();
}

function saveMobilePreferredCallerName(value: string) {
  if (typeof window === "undefined") return;
  const trimmed = String(value || "").trim();
  if (trimmed) window.localStorage.setItem(MOBILE_PREFERRED_CALLER_NAME_KEY, trimmed);
  else window.localStorage.removeItem(MOBILE_PREFERRED_CALLER_NAME_KEY);
}

function personalizeMobileReadyMessage(
  template: string,
  lead: LeadItem,
  preferredPersonName?: string | null,
) {
  const company = mobileMessageTokenValue(lead.name, "sua empresa");
  const fromPerson = String(preferredPersonName || "").trim();
  const greetingName = fromPerson || company.split(/\s+/)[0] || "tudo bem";
  const city = mobileMessageTokenValue(lead.city, "sua região");
  const segment = mobileMessageTokenValue(lead.segment, "empresas locais");
  const source = mobileMessageTokenValue(lead.primarySource, "Radar Digital");
  return template
    .replaceAll("{{name}}", greetingName)
    .replaceAll("{{company}}", company)
    .replaceAll("{{city}}", city)
    .replaceAll("{{segment}}", segment)
    .replaceAll("{{source}}", source);
}

function boardsPayloadEqual(left: BoardResponse | null, right: BoardResponse | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function radarRunResponseEqual(left: RadarSearchRunResponse | null, right: RadarSearchRunResponse | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isMobileVendasViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
}

function isTextEntryElementActive() {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
    return true;
  }
  return active instanceof HTMLElement && active.isContentEditable;
}

function buildMobileReadyMessageTemplates(lead: LeadItem, preferredPersonName?: string | null) {
  const backendTemplates = [
    ...(lead.leadIntelligence?.messageTemplates || []),
    ...(lead.leadIntelligence?.messageTemplate ? [lead.leadIntelligence.messageTemplate] : []),
  ];
  const generatedTemplates = MOBILE_READY_MESSAGE_LIBRARY.map((template, index) => ({
    id: `mobile-smart-${index + 1}`,
    context: "entrada_inteligente",
    tone: "consultiva",
    text: personalizeMobileReadyMessage(template, lead, preferredPersonName),
  }));
  const seen = new Set<string>();
  return [...backendTemplates, ...generatedTemplates].filter((template) => {
    const text = String(template.text || "").trim();
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function intelligenceScoreLabel(score?: number | null) {
  const value = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  if (value >= 80) return "Alta prioridade";
  if (value >= 62) return "Boa prioridade";
  if (value >= 42) return "Revisar";
  return "Baixa prioridade";
}

function leadTagLabel(tag: string) {
  const labels: Record<string, string> = {
    sem_site: "Sem site",
    whatsapp_confirmado: "WhatsApp confirmado",
    email_encontrado: "E-mail encontrado",
    cidade_alvo: "Cidade alvo",
    segmento_alvo: "Segmento alvo",
    boa_avaliacao: "Boa avaliação",
    prova_social: "Prova social",
    instagram_encontrado: "Instagram",
    facebook_encontrado: "Facebook",
    rede_social_confirmada: "Rede social",
    rede_social_sem_site: "Social sem site",
  };
  return labels[tag] || tag.replace(/_/g, " ");
}

function whatsappStatusLabel(status?: string | null) {
  if (status === "confirmed") return "WhatsApp verificado";
  if (status === "missing") return "Sem WhatsApp";
  if (status === "invalid") return "Telefone inválido";
  return "WhatsApp pendente";
}

function nextBestActionLabel(action?: string | null) {
  if (action === "whatsapp") return "Chamar no WhatsApp";
  if (action === "call") return "Tentar ligação";
  if (action === "email") return "Enviar e-mail";
  if (action === "discard") return "Não chamar";
  return "Revisar card";
}

function getLeadWhatsappStatus(lead: LeadItem) {
  return lead.whatsappAvailability?.status || "unknown";
}

function matchesWhatsappFilter(lead: LeadItem, filter: WhatsappFilter) {
  const status = getLeadWhatsappStatus(lead);
  if (filter === "with") return status === "available";
  if (filter === "without") return status === "unavailable";
  return true;
}

function isLeadInInbox(lead: LeadItem) {
  return Boolean(
    lead.isInInbox ||
    lead.inboxConversationId ||
    lead.atendimentoConversationId ||
    lead.sharedProfile?.presence?.atendimento?.present,
  );
}

function getLeadInboxConversationId(lead: LeadItem) {
  return String(
    lead.inboxConversationId ||
      lead.atendimentoConversationId ||
      lead.sharedProfile?.presence?.atendimento?.conversationId ||
      "",
  ).trim();
}

function matchesInboxFilter(lead: LeadItem, filter: InboxFilter) {
  if (filter === "in") return isLeadInInbox(lead);
  if (filter === "out") return !isLeadInInbox(lead);
  return true;
}

function nextInboxFilter(current: InboxFilter): InboxFilter {
  if (current === "all") return "in";
  if (current === "in") return "out";
  return "all";
}

function nextWhatsappFilter(current: WhatsappFilter): WhatsappFilter {
  if (current === "all") return "with";
  if (current === "with") return "without";
  return "all";
}

function sourceLabel(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "webscraping") return "Radar Digital";
  if (normalized === "manual") return "Manual";
  return normalized || "Sem origem";
}

function statusLabel(status: LeadStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function compactVendasMessage(message: string | null) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (text.toLowerCase().includes("deve ser um e-mail válido")) {
    return "E-mail inválido. Remova ou informe um endereço válido.";
  }
  return text;
}

function setVendasCardDragLock(active: boolean) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (active) {
    root.dataset.vendasDraggingCard = "true";
    root.dataset.hbxTopbarDragLock = "true";
    return;
  }

  delete root.dataset.vendasDraggingCard;
  delete root.dataset.hbxTopbarDragLock;
}

function createDraft(lead: LeadItem): LeadDraft {
  return {
    name: String(lead.name || ""),
    phone: String(lead.phone || ""),
    email: String(lead.email || ""),
    status: lead.status,
    nextAction: String(lead.nextAction || ""),
    returnAt: toDatetimeLocal(lead.returnAt),
    shortNote: String(lead.shortNote || ""),
  };
}

function buildLeadWebscrapingSummary(lead: LeadItem) {
  const parts: string[] = [];
  if (lead.rating != null) parts.push(`Nota ${Number(lead.rating).toFixed(1)}`);
  if (Number(lead.reviews || 0) > 0)
    parts.push(`${Number(lead.reviews)} avaliações`);
  return parts.join(" • ");
}

function hydrateDrafts(board: BoardResponse | null) {
  const next: Record<string, LeadDraft> = {};
  if (!board) return next;
  (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
    (blockKey) => {
      (board.blocks[blockKey] || []).forEach((lead) => {
        next[lead.id] = createDraft(lead);
      });
    },
  );
  return next;
}

function mergeHydratedDraftsPreservingInput(
  board: BoardResponse | null,
  currentDrafts: Record<string, LeadDraft>,
) {
  const hydrated = hydrateDrafts(board);
  const next = { ...hydrated };
  Object.keys(currentDrafts).forEach((leadId) => {
    if (hydrated[leadId]) next[leadId] = currentDrafts[leadId];
  });
  try {
    return JSON.stringify(next) === JSON.stringify(currentDrafts)
      ? currentDrafts
      : next;
  } catch {
    return next;
  }
}

function buildLocalDateKey(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, "0")}-${`${parsed.getDate()}`.padStart(2, "0")}`;
}

function railTitle(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Programado"
    : parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function railDay(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Data"
    : parsed.toLocaleDateString("pt-BR", { weekday: "short" });
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function returnMeta(lead: LeadItem, draft: LeadDraft, block: LeadBlockKey) {
  const effective = draft.returnAt
    ? new Date(draft.returnAt).toISOString()
    : lead.returnAt || null;
  if (!effective)
    return { label: "Sem retorno definido", tone: "neutral" } as const;
  if (block === "overdue")
    return {
      label: `Atrasado desde ${formatDateTime(effective)}`,
      tone: "overdue",
    } as const;
  if (block === "today")
    return {
      label: `Hoje • ${formatDateTime(effective)}`,
      tone: "today",
    } as const;
  if (block === "scheduled")
    return {
      label: `Agendado • ${formatDateTime(effective)}`,
      tone: "scheduled",
    } as const;
  return {
    label: `Arquivo • ${formatShortDate(effective)}`,
    tone: "closed",
  } as const;
}

function timelineTone(type?: LeadTimelineEventType) {
  if (type === "lead_closed") return "closed";
  if (type === "return_scheduled") return "scheduled";
  if (type === "contact_made" || type === "result_recorded") return "contact";
  if (type === "origin_registered") return "origin";
  if (type === "lead_reused") return "existing";
  return "neutral";
}

function timelineMeta(event: LeadTimelineEvent) {
  if (event.eventType === "origin_registered")
    return event.sourceType === "webscraping"
      ? "Origem Radar Digital"
      : "Origem manual";
  if (event.eventType === "status_changed" && event.statusTo)
    return `Status ${event.statusTo}`;
  if (event.eventType === "result_recorded" && event.resultLabel)
    return event.resultLabel;
  if (event.eventType === "return_scheduled" && event.returnAt)
    return formatDateTime(event.returnAt);
  return event.createdAt ? formatDateTime(event.createdAt) : "Agora";
}

function recomputeSummary(blocks: BoardResponse["blocks"]) {
  return {
    total:
      blocks.overdue.length +
      blocks.today.length +
      blocks.scheduled.length +
      blocks.closed.length,
    today: blocks.today.length,
    overdue: blocks.overdue.length,
    scheduled: blocks.scheduled.length,
    closed: blocks.closed.length,
  };
}

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeBoardForLocalAgenda(input: BoardResponse) {
  const todayKey = localDateKeyFromDate(new Date());
  const blocks: BoardResponse["blocks"] = {
    overdue: [],
    today: [],
    scheduled: [],
    closed: [],
  };

  const allLeads = [
    ...input.blocks.overdue,
    ...input.blocks.today,
    ...input.blocks.scheduled,
    ...input.blocks.closed,
  ];

  for (const lead of allLeads) {
    if (lead.status === "encerrado") {
      blocks.closed.push(lead);
      continue;
    }

    const leadDateKey = buildLocalDateKey(lead.returnAt || lead.updatedAt);
    if (!leadDateKey) {
      blocks.today.push(lead);
      continue;
    }

    const compare = compareDateKeys(leadDateKey, todayKey);
    if (compare < 0) blocks.overdue.push(lead);
    else if (compare > 0) blocks.scheduled.push(lead);
    else blocks.today.push(lead);
  }

  return {
    blocks,
    summary: recomputeSummary(blocks),
  };
}

function markBoardLeadsInInbox(
  board: BoardResponse | null,
  leadIds: string[],
  leadConversationIds?: Record<string, string | number>,
  fallbackConversationId?: string | number | null,
) {
  if (!board || !leadIds.length) return board;
  const targetIds = new Set(
    leadIds.map((leadId) => String(leadId || "").trim()).filter(Boolean),
  );
  if (!targetIds.size) return board;

  let changed = false;
  const blocks = Object.fromEntries(
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).map(
      (blockKey) => [
        blockKey,
        (board.blocks[blockKey] || []).map((lead) => {
          if (!targetIds.has(lead.id)) return lead;
          const conversationId =
            leadConversationIds?.[lead.id] ||
            fallbackConversationId ||
            lead.inboxConversationId ||
            lead.atendimentoConversationId ||
            null;
          if (!conversationId && isLeadInInbox(lead)) return lead;
          changed = true;
          return {
            ...lead,
            isInInbox: true,
            inboxConversationId: conversationId,
            atendimentoConversationId: conversationId,
            sharedProfile: {
              ...(lead.sharedProfile || {}),
              presence: {
                ...(lead.sharedProfile?.presence || {}),
                atendimento: {
                  ...(lead.sharedProfile?.presence?.atendimento || {}),
                  present: true,
                  conversationId,
                },
              },
            },
          };
        }),
      ],
    ),
  ) as BoardResponse["blocks"];

  return changed ? { ...board, blocks } : board;
}

function formatDatetimeLocal(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function localDateKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function buildTargetDatetimeLocal(
  dateKey: string,
  currentReturnAt?: string | null,
  fallbackHour = 9,
  fallbackMinute = 0,
) {
  const base = currentReturnAt
    ? new Date(currentReturnAt)
    : new Date(`${dateKey}T09:00:00`);
  const next = new Date(base);
  next.setFullYear(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
  );
  if (!currentReturnAt) next.setHours(fallbackHour, fallbackMinute, 0, 0);
  return formatDatetimeLocal(next);
}

function DateDropSlot({
  item,
  active,
  pulse,
  dragging,
  ignoreClick,
  onDateShortcut,
  onSelect,
  register,
}: {
  item: DateFilterItem;
  active: boolean;
  pulse: boolean;
  dragging: boolean;
  ignoreClick: () => boolean;
  onDateShortcut: () => void;
  onSelect: () => void;
  register: (node: HTMLElement | null) => void;
}) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: item.key,
    data: { type: "date-filter", key: item.key },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `date:${item.key}`,
    data: { type: "date-filter", key: item.key },
  });

  const setCombinedRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setDragRef(node);
    register(node);
  };

  const rawSubtitle = String(item.subtitle || "").trim();
  let showSubtitle = Boolean(rawSubtitle);
  try {
    const normalized = rawSubtitle
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w\s]/g, "")
      .toLowerCase()
      .trim();
    if (
      ["sem pendencia", "fluxo principal", "sem agenda"].includes(normalized)
    ) {
      showSubtitle = false;
    }
  } catch {
    const fallback = rawSubtitle
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
    if (["sem pendencia", "fluxo principal", "sem agenda"].includes(fallback)) {
      showSubtitle = false;
    }
  }

  // UX: hide the "retorno futuro" subtitle for scheduled date cards
  // (removes strings like "1 retorno futuro" that clutter the small cards)
  if (item.blockKey === "scheduled") {
    showSubtitle = false;
  }

  return (
    <div
      className={styles.dateFilterCard}
      data-active={active ? "true" : "false"}
      data-tone={item.blockKey}
      data-dropover={isOver ? "true" : "false"}
      data-pulse={pulse ? "true" : "false"}
      data-dragging={dragging || isDragging ? "true" : "false"}
      onClick={() => {
        if (ignoreClick()) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (ignoreClick()) return;
          onSelect();
        }
      }}
      ref={setCombinedRef}
      {...attributes}
      {...listeners}
    >
      <span className={styles.dateFilterDay}>{item.dayLabel}</span>
      <strong>{item.title}</strong>
      {showSubtitle ? <span>{item.subtitle}</span> : null}

      {active ? (
        <button
          type="button"
          className={styles.atendimentoShortcut}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDateShortcut();
          }}
          title="Enviar cards visíveis desta data para Prospecção"
          aria-label="Enviar cards visíveis desta data para Prospecção"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      <AnimatedCount value={item.count} />
      <span className={styles.receiveHint}>Solte aqui</span>
    </div>
  );
}

function AnimatedCount({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const [rolling, setRolling] = useState(false);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    const diff = Math.abs(to - from);
    const DURATION = Math.max(240, Math.min(560, 220 + diff * 10));
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / DURATION, 1);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        setRolling(false);
      }
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame((now) => {
      setRolling(true);
      tick(now);
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <b data-rolling={rolling ? "true" : "false"}>{displayed}</b>;
}

function LeadCardView({
  lead,
  draft,
  blockKey,
  selected,
  saving,
  onFocus,
  onQuickAction,
  onInboxAction,
  onEdit,
  onDraftChange,
  onEditingActiveChange,
  onSave,
  editing,
  bulkSelectionMode,
  bulkSelected,
  onBulkToggle,
}: LeadCardView) {
  const meta = returnMeta(lead, draft, blockKey);
  const signals = lead.signals || {
    alreadyExisted: Boolean((lead.timesSeen || 0) > 1),
    cameFromWebscraping:
      lead.sourceType === "webscraping" ||
      String(lead.primarySource || "").toLowerCase() === "webscraping",
    hadPreviousContact: Boolean(
      (lead.attemptCount || 0) > 0 || lead.lastContactAt,
    ),
    wasClosedBefore: Boolean(lead.wasClosedBefore),
  };
  const chips = [
    signals.alreadyExisted ? "Lead conhecido" : null,
    signals.cameFromWebscraping ? "Radar Digital" : null,
    signals.hadPreviousContact ? "Com histórico" : null,
    signals.wasClosedBefore ? "Já encerrado" : null,
    lead.whatsappAvailability?.status === "unavailable" ? "Sem WhatsApp" : null,
    lead.city || null,
  ].filter(Boolean);

  const callUrl = buildCallUrl(draft.phone || lead.phone);
  const whatsappBlocked = lead.whatsappAvailability?.status === "unavailable";
  const whatsappUrl = whatsappBlocked
    ? ""
    : buildWhatsAppUrl(draft.phone || lead.phone, draft.name || lead.name);
  const leadSource = lead.primarySource || lead.sourceType;
  const inInbox = isLeadInInbox(lead);
  const webscrapingSummary = buildLeadWebscrapingSummary(lead);

  // inline editor mount/animation control — uses global motion timings
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [editorRendered, setEditorRendered] = useState<boolean>(
    Boolean(editing),
  );
  const [editorAnimating, setEditorAnimating] = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    const motion = HBX_WINDOW_STANDARD.motion;
    let timer: number | undefined;

    if (editing) {
      requestAnimationFrame(() => {
        setEditorRendered(true);
      });
      // open animation
      requestAnimationFrame(() => {
        if (!el) return;
        el.style.overflow = "hidden";
        el.style.maxHeight = "0px";
        el.style.opacity = "0";
        el.style.transition = `max-height ${motion.enterMs}ms ${motion.enterEasing}, opacity ${motion.enterMs}ms ${motion.enterEasing}`;
        requestAnimationFrame(() => {
          if (!el) return;
          el.style.maxHeight = `${el.scrollHeight}px`;
          el.style.opacity = "1";
        });
        requestAnimationFrame(() => {
          setEditorAnimating(true);
        });
        timer = window.setTimeout(() => {
          if (!el) return;
          el.style.maxHeight = "";
          el.style.overflow = "";
          el.style.transition = "";
          setEditorAnimating(false);
        }, motion.enterMs + 20);
      });
    } else {
      // close animation
      if (!el) {
        requestAnimationFrame(() => {
          setEditorRendered(false);
        });
      } else {
        el.style.overflow = "hidden";
        el.style.maxHeight = `${el.scrollHeight}px`;
        el.style.opacity = "1";
        el.style.transition = `max-height ${motion.exitMs}ms ${motion.exitEasing}, opacity ${motion.exitMs}ms ${motion.exitEasing}`;
        requestAnimationFrame(() => {
          if (!el) return;
          el.style.maxHeight = "0px";
          el.style.opacity = "0";
        });
        requestAnimationFrame(() => {
          setEditorAnimating(true);
        });
        timer = window.setTimeout(() => {
          setEditorAnimating(false);
          setEditorRendered(false);
          if (el) {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.transition = "";
          }
        }, motion.exitMs + 20);
      }
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [editing]);

  return (
    <LiquidGlassCard
      as="article"
      className={styles.leadCard}
      accentTone={
        blockKey === "today"
          ? "success"
          : blockKey === "overdue"
            ? "danger"
            : blockKey === "scheduled"
              ? "info"
              : "warning"
      }
      data-selected={selected ? "true" : "false"}
      data-bulk-selected={bulkSelected ? "true" : "false"}
      data-tone={blockKey}
      data-whatsapp={getLeadWhatsappStatus(lead)}
      header={
        <div
          className={styles.leadMainButton}
          role="button"
          tabIndex={0}
          onClick={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onFocus();
            }
          }}
        >
          <div className={styles.leadCardTop}>
            {bulkSelectionMode ? (
              <button
                type="button"
                className={styles.bulkSelectCardButton}
                data-selected={bulkSelected ? "true" : "false"}
                aria-pressed={bulkSelected ? "true" : "false"}
                aria-label={
                  bulkSelected ? "Remover card da seleção" : "Selecionar card"
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onBulkToggle?.(lead.id);
                }}
              >
                {bulkSelected ? "✓" : ""}
              </button>
            ) : null}
            <div className={styles.leadIdentity}>
              {leadSource &&
                String(leadSource).trim().toLowerCase() !== "manual" && (
                  <span
                    className={`${styles.leadEyebrow} ${glassCardStyles.eyebrow}`}
                  >
                    {sourceLabel(leadSource)}
                  </span>
                )}
              <strong className={`${styles.leadName} ${glassCardStyles.title}`}>
                {draft.name || lead.name || "Lead sem nome"}
              </strong>
              <span
                className={`${styles.returnBadge} ${glassCardStyles.pill} ${glassCardStyles.noBreak}`}
                data-tone={meta.tone}
              >
                {meta.label}
              </span>
              <span
                className={`${styles.leadSubline} ${glassCardStyles.subtitle}`}
              >
                {lead.segment ? (
                  <>
                    {lead.segment}
                    {lead.city ? ` • ${lead.city}` : null}
                  </>
                ) : lead.city ? (
                  lead.city
                ) : null}
              </span>
            </div>
            <div className={glassCardStyles.headerAside}>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                onClick={() => onEdit?.(lead.id)}
                aria-label="Editar"
              >
                Editar
              </button>
              <button
                type="button"
                className={`${styles.inboxLeadButton} ${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                data-state={inInbox ? "in" : "out"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onInboxAction(lead);
                }}
                disabled={saving || blockKey === "closed"}
              >
                {inInbox ? "Inbox" : "Importar"}
              </button>
            </div>
          </div>
          <div className={glassCardStyles.cluster}>
            {chips.slice(0, 3).map((chip) => (
              <span
                key={`${lead.id}-${chip}`}
                className={`${styles.memoryChip} ${glassCardStyles.pill} ${glassCardStyles.noBreak}`}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      }
      lead={
        editorRendered ? (
          <div
            ref={editorRef}
            className={styles.inlineEdit}
            aria-hidden={!editing && editorAnimating}
            onFocus={() => onEditingActiveChange?.(true)}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
              onEditingActiveChange?.(false);
            }}
          >
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nome</span>
                <input
                  className={styles.fieldInput}
                  value={draft.name}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { name: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Telefone</span>
                <input
                  className={styles.fieldInput}
                  value={draft.phone}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { phone: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>E-mail</span>
                <input
                  className={styles.fieldInput}
                  value={draft.email}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { email: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Status</span>
                <select
                  className={styles.fieldInput}
                  value={draft.status}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, {
                      status: e.target.value as LeadStatus,
                    })
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldWide}>
                <span className={styles.fieldLabel}>Próxima ação</span>
                <input
                  className={styles.fieldInput}
                  value={draft.nextAction}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { nextAction: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Retorno</span>
                <input
                  className={styles.fieldInput}
                  type="datetime-local"
                  value={draft.returnAt}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { returnAt: e.target.value })
                  }
                />
              </label>
              <label className={styles.fieldWide}>
                <span className={styles.fieldLabel}>Observação curta</span>
                <textarea
                  className={styles.fieldTextarea}
                  rows={3}
                  value={draft.shortNote}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { shortNote: e.target.value })
                  }
                />
              </label>
            </div>
            <div className={styles.detailFooterActions}>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`}
                onClick={() => onSave?.(lead.id)}
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                onClick={() => onEdit?.(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null
      }
      actions={
        <div className={styles.leadActionRow}>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${styles.whatsappAction} ${glassCardStyles.noBreak} ${whatsappBlocked ? styles.whatsappUnavailable : ""}`}
            href={whatsappUrl || undefined}
            target={whatsappUrl ? "_blank" : undefined}
            rel={whatsappUrl ? "noreferrer" : undefined}
            aria-disabled={!whatsappUrl}
            title={
              whatsappBlocked
                ? "Motor confirmou que este numero nao possui WhatsApp."
                : "Abrir conversa no WhatsApp"
            }
            onClick={() => {
              if (whatsappUrl) onQuickAction("tentativa_whatsapp");
            }}
          >
            {whatsappBlocked ? "Sem WhatsApp" : "WhatsApp"}
          </a>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
            href={callUrl || undefined}
            aria-disabled={!callUrl}
            onClick={() => {
              if (callUrl) onQuickAction("tentativa_call");
            }}
          >
            Ligar
          </a>
          {lead.quickActions.includes("amanha") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("amanha")}
              disabled={saving}
            >
              Amanhã
            </button>
          ) : null}
          {lead.quickActions.includes("encerrar") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("encerrar")}
              disabled={saving}
            >
              Encerrar
            </button>
          ) : null}
          {lead.quickActions.includes("reabrir") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("reabrir")}
              disabled={saving}
            >
              Reabrir
            </button>
          ) : null}
        </div>
      }
      highlight={
        <div
          className={`${glassCardStyles.stack} ${styles.leadQuickReadStack}`}
        >
          <div className={styles.leadInfoBlock}>
            <span className={glassCardStyles.sectionLabel}>Endereço</span>
            <strong className={glassCardStyles.sectionTitle}>
              Localização
            </strong>
            <p className={glassCardStyles.bodyText}>
              {lead.address || "Sem endereço registrado."}
            </p>
          </div>
          <div className={styles.leadInfoBlock}>
            <span className={glassCardStyles.sectionLabel}>Resumo</span>
            <strong className={glassCardStyles.sectionTitle}>
              Leitura rapida
            </strong>
            <p className={glassCardStyles.bodyText}>
              {draft.shortNote ||
                lead.shortNote ||
                webscrapingSummary ||
                "Sem observação curta registrada."}
            </p>
          </div>
        </div>
      }
      metrics={
        <div className={glassCardStyles.metricGrid}>
          <div className={glassCardStyles.metricCard}>
            <span className={glassCardStyles.metricLabel}>Tentativas</span>
            <strong className={glassCardStyles.metricValue}>
              {lead.attemptCount || 0}
            </strong>
          </div>
          <div className={glassCardStyles.metricCard}>
            <span className={glassCardStyles.metricLabel}>Ultimo contato</span>
            <strong className={glassCardStyles.metricValue}>
              {formatShortDate(lead.lastContactAt)}
            </strong>
          </div>
          {lead.rating != null ? (
            <div className={glassCardStyles.metricCard}>
              <span className={glassCardStyles.metricLabel}>Nota</span>
              <strong className={glassCardStyles.metricValue}>
                {Number(lead.rating).toFixed(1)}
              </strong>
            </div>
          ) : null}
          {Number(lead.reviews || 0) > 0 ? (
            <div className={glassCardStyles.metricCard}>
              <span className={glassCardStyles.metricLabel}>Avaliacoes</span>
              <strong className={glassCardStyles.metricValue}>
                {lead.reviews}
              </strong>
            </div>
          ) : null}
        </div>
      }
    >
      {lead.website ? (
        <div className={glassCardStyles.cluster}>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
            href={lead.website}
            target="_blank"
            rel="noreferrer"
          >
            Site
          </a>
        </div>
      ) : null}
    </LiquidGlassCard>
  );
}

function DraggableLeadCard({
  lead,
  draft,
  blockKey,
  selected,
  saving,
  disabled,
  hidden,
  onFocus,
  onQuickAction,
  onInboxAction,
  onEdit,
  onDraftChange,
  onSave,
  editing,
  bulkSelectionMode,
  bulkSelected,
  onBulkToggle,
  register,
}: LeadCardView & {
  disabled: boolean;
  hidden: boolean;
  register: (node: HTMLElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled,
    data: { type: "lead", leadId: lead.id },
  });

  return (
    <div
      className={styles.draggableWrap}
      data-dragging={isDragging ? "true" : "false"}
      data-flying={hidden ? "true" : "false"}
      ref={(node) => {
        setNodeRef(node);
        register(node);
      }}
      {...attributes}
      {...listeners}
    >
      <LeadCardView
        lead={lead}
        draft={draft}
        blockKey={blockKey}
        selected={selected}
        saving={saving}
        onFocus={onFocus}
        onQuickAction={onQuickAction}
        onInboxAction={onInboxAction}
        onEdit={onEdit}
        onDraftChange={onDraftChange}
        onSave={onSave}
        editing={editing}
        bulkSelectionMode={bulkSelectionMode}
        bulkSelected={bulkSelected}
        onBulkToggle={onBulkToggle}
      />
    </div>
  );
}

export default function VendasClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasToken = useRequireModule("vendas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LeadDraft>>({});
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const [selectedMobileLeadId, setSelectedMobileLeadId] = useState<string | null>(null);
  const [mobileNoteLead, setMobileNoteLead] = useState<LeadItem | null>(null);
  const [mobileNoteDraft, setMobileNoteDraft] = useState("");
  const [mobileSavingNote, setMobileSavingNote] = useState(false);
  const [mobileEnrichmentLoadingId, setMobileEnrichmentLoadingId] = useState<string | null>(null);
  const [mobileTemplateIndex, setMobileTemplateIndex] = useState(() => readMobileReadyMessagePreference());
  const [mobileReportLead, setMobileReportLead] = useState<LeadItem | null>(null);
  const [mobileReportReason, setMobileReportReason] = useState("");
  const [mobileReporting, setMobileReporting] = useState(false);
  const [whatsappFilter, setWhatsappFilter] = useState<WhatsappFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [selectedBulkLeadIds, setSelectedBulkLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkSelectAllAccount, setBulkSelectAllAccount] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [vendasVisualCount, setVendasVisualCount] = useState(0);
  const [storedRadarRun, setStoredRadarRun] = useState<StoredRadarRun | null>(null);
  const [liveRadarRun, setLiveRadarRun] = useState<RadarSearchRunResponse | null>(null);
  const [radarStatusPulseKey, setRadarStatusPulseKey] = useState(0);
  const [selectedDateKey, setSelectedDateKey] =
    useState<DateFilterKey>("today");
  const [mobileAgendaTab, setMobileAgendaTab] =
    useState<MobileAgendaTab>("today");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [mobilePreferredCallerName, setMobilePreferredCallerName] = useState("");
  const [accountProfile, setAccountProfile] = useState<{
    email?: string | null;
    company?: {
      paymentStatus?: string | null;
      subscriptionStatus?: string | null;
      premiumAccess?: boolean | null;
    } | null;
  } | null>(null);
  const [accountProfileLoading, setAccountProfileLoading] = useState(false);
  const composerOpenRef = useRef(false);
  const mobileSkipDraftHydrateRef = useRef(false);
  const [expandedTimelineEventId, setExpandedTimelineEventId] = useState<
    string | null
  >(null);
  const [activeDragLeadId, setActiveDragLeadId] = useState<string | null>(null);
  const [activeDragDateKey, setActiveDragDateKey] = useState<string | null>(
    null,
  );
  const [pulseDateKey, setPulseDateKey] = useState<DateFilterKey | null>(null);
  const [flyAnimation, setFlyAnimation] = useState<FlyAnimation | null>(null);
  const [manualLead, setManualLead] = useState({
    name: "",
    phone: "",
    email: "",
    nextAction: "Primeiro contato",
    returnAt: plusDaysDatetimeLocal(0),
    shortNote: "",
  });
  const leadCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const boardRef = useRef<BoardResponse | null>(null);
  const dateFilterRefs = useRef<Record<string, HTMLElement | null>>({});
  const archiveRef = useRef<HTMLElement | null>(null);
  const editingInputActiveRef = useRef(false);
  const pendingVisualBoardRef = useRef<BoardResponse | null>(null);
  const lastDragEndedAtRef = useRef(0);
  const filterScrollerRef = useRef<HTMLDivElement | null>(null);
  const lastRadarStatusSnapshotRef = useRef<{ count: number; status: string } | null>(null);
  const lastRadarBoardRefreshCountRef = useRef(0);
  const radarBoardRefreshInFlightRef = useRef(false);
  const todayAgendaLaunchNotice = useQuickLaunchNotice();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const detectDateFilterCollision = useMemo<CollisionDetection>(
    () =>
      ({ pointerCoordinates, droppableContainers }) => {
        if (!pointerCoordinates) return [];

        for (const container of droppableContainers) {
          const id = String(container.id);
          const node = dateFilterRefs.current[id];
          const rect = node?.getBoundingClientRect();
          if (!rect) continue;

          if (
            pointerCoordinates.x >= rect.left &&
            pointerCoordinates.x <= rect.right &&
            pointerCoordinates.y >= rect.top &&
            pointerCoordinates.y <= rect.bottom
          ) {
            return [
              {
                id: container.id,
                data: { droppableContainer: container, value: 0 },
              },
            ];
          }
        }

        return [];
      },
    [],
  );

  function applyBoardPayload(
    normalizedPayload: BoardResponse,
    options?: { forceHydrateDrafts?: boolean },
  ) {
    setBoard((previous) =>
      boardsPayloadEqual(previous, normalizedPayload) ? previous : normalizedPayload,
    );
    const skipHydrate =
      !options?.forceHydrateDrafts &&
      (composerOpenRef.current ||
        editingInputActiveRef.current ||
        Boolean(editingLeadId) ||
        (typeof window !== "undefined" &&
          window.matchMedia("(max-width: 820px)").matches &&
          mobileSkipDraftHydrateRef.current));
    if (skipHydrate) {
      setDrafts((current) =>
        mergeHydratedDraftsPreservingInput(normalizedPayload, current),
      );
    } else {
      setDrafts(hydrateDrafts(normalizedPayload));
    }
  }

  async function loadBoard(options?: {
    forceHydrateDrafts?: boolean;
    forceVisualRefresh?: boolean;
  }) {
    setError(null);
    try {
      const payload = await apiFetch<BoardResponse>("/vendas/board");
      const normalizedPayload = normalizeBoardForLocalAgenda(payload);
      if (!options?.forceVisualRefresh && isTextEntryElementActive()) {
        pendingVisualBoardRef.current = normalizedPayload;
      } else {
        pendingVisualBoardRef.current = null;
        applyBoardPayload(normalizedPayload, options);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar o CRM de Vendas.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const syncStoredRun = () => {
      const next = readStoredRadarRun();
      setStoredRadarRun((previous) => {
        try {
          return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
        } catch {
          return next;
        }
      });
    };
    syncStoredRun();
    return subscribeStoredRadarRun(syncStoredRun);
  }, []);

  useEffect(() => {
    if (hasToken !== true) return undefined;
    const runId = storedRadarRun?.runId;
    if (!runId) {
      setLiveRadarRun(null);
      return undefined;
    }
    const activeRunId = runId;

    async function refreshRadarRun() {
      const payload = await apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(activeRunId)}`, {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setLiveRadarRun((previous) => {
        return radarRunResponseEqual(previous, payload) ? previous : payload;
      });
      if (payload.status === "canceled") {
        clearStoredRadarRun(activeRunId);
        return;
      }
      const deliveredCount = Number(payload.meta?.deliveredCount || payload.foundCount || storedRadarRun?.deliveredCount || 0) || 0;
      saveStoredRadarRun({
        runId: payload.runId || payload.id,
        status: payload.status,
        city: payload.meta?.filters?.city || storedRadarRun?.city || null,
        state: payload.meta?.filters?.state || storedRadarRun?.state || null,
        segment: payload.meta?.filters?.segment || storedRadarRun?.segment || null,
        targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || storedRadarRun?.targetQuantity || 0) || null,
        deliveredCount,
      });
      if (
        deliveredCount > lastRadarBoardRefreshCountRef.current &&
        !composerOpenRef.current &&
        !radarBoardRefreshInFlightRef.current
      ) {
        lastRadarBoardRefreshCountRef.current = deliveredCount;
        radarBoardRefreshInFlightRef.current = true;
        void loadBoard().finally(() => {
          radarBoardRefreshInFlightRef.current = false;
        });
      }
    }

    if (isTerminalRadarRunStatus(storedRadarRun?.status)) {
      void refreshRadarRun().catch(() => null);
      return undefined;
    }

    return startSmartPolling(async () => {
      if (composerOpenRef.current) return;
      try {
        await refreshRadarRun();
      } catch {
        // keep the last visible Radar status if one poll fails
      }
    }, {
      intervalMs: isMobileVendasViewport() ? 6500 : 2200,
      immediate: true,
      pauseWhenHidden: true,
    });
  }, [hasToken, storedRadarRun?.city, storedRadarRun?.deliveredCount, storedRadarRun?.runId, storedRadarRun?.segment, storedRadarRun?.state, storedRadarRun?.status, storedRadarRun?.targetQuantity]);

  useEffect(() => {
    if (composerOpenRef.current || mobileSkipDraftHydrateRef.current) return;
    const pendingCount = Math.max(
      0,
      (board?.summary.overdue || 0) + (board?.summary.today || 0) + (board?.summary.scheduled || 0),
    );
    const deliveredCount = Math.max(
      pendingCount,
      Number(liveRadarRun?.meta?.deliveredCount || liveRadarRun?.foundCount || storedRadarRun?.deliveredCount || 0),
    );
    const status = String(liveRadarRun?.status || storedRadarRun?.status || "");
    const previous = lastRadarStatusSnapshotRef.current;
    if (previous && (deliveredCount > previous.count || (status && status !== previous.status))) {
      setRadarStatusPulseKey((current) => current + 1);
    }
    lastRadarStatusSnapshotRef.current = { count: deliveredCount, status };
  }, [
    board?.summary.overdue,
    board?.summary.scheduled,
    board?.summary.today,
    liveRadarRun?.foundCount,
    liveRadarRun?.meta?.deliveredCount,
    liveRadarRun?.status,
    storedRadarRun?.deliveredCount,
    storedRadarRun?.status,
  ]);

  const openInboxAgenda = useCallback(
    (conversationId?: string | number | null) => {
      todayAgendaLaunchNotice.clear();
      const params = new URLSearchParams({
        atendimentoQueue: "bot",
        atendimentoSection: "conversa",
      });
      if (conversationId) params.set("conversationId", String(conversationId));
      router.push(`/atendimento?${params.toString()}`);
    },
    [router, todayAgendaLaunchNotice],
  );

  const syncLeadsToInbox = useCallback(
    async (
      leads: LeadItem[],
      options?: { openAfter?: boolean; title?: string; description?: string },
    ) => {
      const visibleLeadIds = leads.map((lead) => lead.id).filter(Boolean);
      if (!visibleLeadIds.length) {
        setFeedback("Nenhum card visível para importar ao Inbox.");
        return null;
      }

      todayAgendaLaunchNotice.start({
        loadingTitle: options?.title || "Abrindo Inbox",
        loadingDescription:
          options?.description || "Enviando os cards visíveis para Prospecção.",
        successTitle: "Prospecção pronta",
        successDescription:
          "Tudo certo. Os cards foram preparados em Prospecção.",
        ctaLabel: "Abrir Prospecção",
        onOpen: () => openInboxAgenda(),
      });

      try {
        const syncResult = await apiFetch<TodayAgendaSyncResponse>(
          "/vendas/agenda/whatsapp/sync-today",
          {
            method: "POST",
            body: JSON.stringify({ leadIds: visibleLeadIds }),
          },
        );
        const todayLeadCount = Number(syncResult?.todayLeadCount || 0);
        const mirroredLeadCount = Number(syncResult?.mirroredLeadCount || 0);
        if (!syncResult?.ok) {
          throw new Error(
            syncResult?.message ||
              "Os cards visíveis nao foram enviados para Prospecção. Recarregue e tente novamente.",
          );
        }
        const firstConversationId =
          syncResult?.conversationIds?.[0] ||
          (syncResult?.leadConversationIds
            ? syncResult.leadConversationIds[visibleLeadIds[0]]
            : null) ||
          null;
        const importedLeadIds = syncResult?.leadConversationIds
          ? Object.keys(syncResult.leadConversationIds)
          : firstConversationId && visibleLeadIds.length === 1
            ? visibleLeadIds
            : [];
        if (importedLeadIds.length) {
          setBoard((currentBoard) =>
            markBoardLeadsInInbox(
              currentBoard,
              importedLeadIds,
              syncResult?.leadConversationIds,
              firstConversationId,
            ),
          );
        }
        todayAgendaLaunchNotice.markSuccess({
          successDescription:
            String(syncResult?.message || "").trim() ||
            (todayLeadCount
              ? `${mirroredLeadCount} card(s) foram preparados em Prospecção com roteiro pendente para envio manual.`
              : "Nao ha cards visíveis para preparar em Prospecção."),
        });
        await loadBoard();
        if (options?.openAfter) openInboxAgenda(firstConversationId);
        return syncResult;
      } catch (syncError) {
        todayAgendaLaunchNotice.clear();
        setError(
          syncError instanceof Error
            ? syncError.message
            : "Falha ao importar cards para Prospecção.",
        );
        return null;
      }
    },
    [openInboxAgenda, todayAgendaLaunchNotice],
  );

  useEffect(() => {
    if (hasToken !== true) return;
    void loadBoard();
  }, [hasToken]);

  useEffect(() => {
    composerOpenRef.current = composerOpen;
  }, [composerOpen]);

  useEffect(() => {
    setMobilePreferredCallerName(readMobilePreferredCallerName());
    setAccountNameDraft(readMobilePreferredCallerName());
  }, []);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    function handleFocusOut() {
      window.setTimeout(() => {
        if (isTextEntryElementActive()) return;
        const pending = pendingVisualBoardRef.current;
        if (!pending) return;
        pendingVisualBoardRef.current = null;
        applyBoardPayload(pending);
      }, 220);
    }

    document.addEventListener("focusout", handleFocusOut);
    return () => document.removeEventListener("focusout", handleFocusOut);
  });

  useEffect(() => {
    if (!accountSheetOpen || hasToken !== true) return;
    let cancelled = false;
    setAccountProfileLoading(true);
    void (async () => {
      try {
        const profile = await apiFetch<{
          email?: string | null;
          company?: {
            paymentStatus?: string | null;
            subscriptionStatus?: string | null;
            premiumAccess?: boolean | null;
          } | null;
        }>("/profile/current-user");
        if (!cancelled) setAccountProfile(profile);
      } catch {
        if (!cancelled) setAccountProfile(null);
      } finally {
        if (!cancelled) setAccountProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountSheetOpen, hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (searchParams?.get("agendaStudio") !== "1") return;
    const mode = searchParams?.get("agendaMode") || "sales";
    if (mode !== "sales") return;
    router.replace(
      "/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas",
    );
  }, [hasToken, router, searchParams]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!pulseDateKey) return;
    const timer = window.setTimeout(() => setPulseDateKey(null), 560);
    return () => window.clearTimeout(timer);
  }, [pulseDateKey]);

  useEffect(() => {
    if (!flyAnimation) return;
    const timer = window.setTimeout(() => setFlyAnimation(null), 460);
    return () => window.clearTimeout(timer);
  }, [flyAnimation]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  const leadById = useMemo(() => {
    const map = new Map<string, { lead: LeadItem; block: LeadBlockKey }>();
    if (!board) return map;
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        (board.blocks[blockKey] || []).forEach((lead) =>
          map.set(lead.id, { lead, block: blockKey }),
        );
      },
    );
    return map;
  }, [board]);

  const allLeads = useMemo(() => {
    const items: Array<{ lead: LeadItem; block: LeadBlockKey }> = [];
    if (!board) return items;
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        (board.blocks[blockKey] || []).forEach((lead) =>
          items.push({ lead, block: blockKey }),
        );
      },
    );
    const orderWeight: Record<LeadBlockKey, number> = {
      overdue: 0,
      today: 1,
      scheduled: 2,
      closed: 3,
    };
    return items.sort((left, right) => {
      const blockDiff = orderWeight[left.block] - orderWeight[right.block];
      if (blockDiff !== 0) return blockDiff;
      return (
        new Date(right.lead.updatedAt || 0).getTime() -
        new Date(left.lead.updatedAt || 0).getTime()
      );
    });
  }, [board]);

  const mobileLeads = useMemo(() => {
    const normalized = mobileSearch.trim().toLowerCase();
    const liveLeads = allLeads.filter(({ block }) => {
      if (mobileAgendaTab === "overdue") return block === "overdue";
      if (mobileAgendaTab === "today") return block === "today";
      return block === "scheduled";
    }).sort((left, right) => {
      if (mobileAgendaTab !== "upcoming") return 0;
      return (
        new Date(left.lead.returnAt || left.lead.updatedAt || 0).getTime() -
        new Date(right.lead.returnAt || right.lead.updatedAt || 0).getTime()
      );
    });
    if (!normalized) return liveLeads.slice(0, 24);
    return liveLeads
      .filter(({ lead, block }) =>
        [
          lead.name,
          lead.city,
          lead.address,
          lead.segment,
          lead.statusLabel,
          lead.nextAction,
          lead.shortNote,
          block,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 24);
  }, [allLeads, mobileAgendaTab, mobileSearch]);

  const selectedMobileLead = useMemo(() => {
    if (!selectedMobileLeadId) return null;
    return allLeads.find(({ lead }) => lead.id === selectedMobileLeadId)?.lead || null;
  }, [allLeads, selectedMobileLeadId]);

  useEffect(() => {
    if (selectedMobileLeadId) saveMobileOpenLeadId(selectedMobileLeadId);
  }, [selectedMobileLeadId]);

  useEffect(() => {
    const storedOpenLeadId = readMobileOpenLeadId();
    if (!storedOpenLeadId || selectedMobileLeadId) return;
    const record = allLeads.find(({ lead }) => lead.id === storedOpenLeadId);
    if (record) {
      setSelectedMobileLeadId(record.lead.id);
      setMobileNoteLead(record.lead);
      setMobileNoteDraft("");
    }
  }, [allLeads, selectedMobileLeadId]);

  useEffect(() => {
    if (!selectedMobileLeadId) return;
    const record = allLeads.find(({ lead }) => lead.id === selectedMobileLeadId);
    if (!record || record.lead === mobileNoteLead) return;
    setMobileNoteLead(record.lead);
  }, [allLeads, mobileNoteLead, selectedMobileLeadId]);

  const loadedLeadIds = useMemo(
    () => allLeads.map(({ lead }) => lead.id).filter(Boolean),
    [allLeads],
  );

  useEffect(() => {
    if (bulkSelectAllAccount) return;
    const availableIds = new Set(loadedLeadIds);
    setSelectedBulkLeadIds((current) => {
      const next = new Set(
        [...current].filter((leadId) => availableIds.has(leadId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [bulkSelectAllAccount, loadedLeadIds]);

  const deferredCommandQuery = useDeferredValue(commandQuery);
  const commandResults = useMemo(() => {
    const normalized = deferredCommandQuery.trim().toLowerCase();
    const items = allLeads.slice(0, 20);
    if (!normalized) return items;
    return items.filter(({ lead, block }) =>
      [
        lead.name,
        lead.phone,
        lead.email,
        lead.address,
        lead.city,
        lead.segment,
        lead.nextAction,
        lead.shortNote,
        lead.lastResult,
        lead.primarySource,
        block,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [allLeads, deferredCommandQuery]);

  const dateFilters = useMemo<DateFilterItem[]>(() => {
    const scheduledGroups = new Map<string, LeadItem[]>();
    (board?.blocks.scheduled || []).forEach((lead) => {
      const dateKey = buildLocalDateKey(lead.returnAt || lead.updatedAt);
      if (!dateKey) return;
      scheduledGroups.set(dateKey, [
        ...(scheduledGroups.get(dateKey) || []),
        lead,
      ]);
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureBase = Array.from({ length: 14 }, (_, index) => {
      const current = new Date(today);
      current.setDate(today.getDate() + index + 1);
      const dateKey = buildLocalDateKey(current.toISOString());
      const leads = scheduledGroups.get(dateKey) || [];
      return {
        key: `scheduled:${dateKey}` as const,
        blockKey: "scheduled" as const,
        count: leads.length,
        title: railTitle(dateKey),
        subtitle: leads.length
          ? pluralize(leads.length, "retorno futuro", "retornos futuros")
          : "Sem agenda",
        dayLabel: railDay(dateKey),
        isoDate: dateKey,
      };
    });
    const lastFutureKey = futureBase[futureBase.length - 1]?.isoDate || "";
    const extraFuture = Array.from(scheduledGroups.entries())
      .filter(([dateKey]) => dateKey > lastFutureKey)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([dateKey, leads]) => ({
        key: `scheduled:${dateKey}` as const,
        blockKey: "scheduled" as const,
        count: leads.length,
        title: railTitle(dateKey),
        subtitle: pluralize(leads.length, "retorno futuro", "retornos futuros"),
        dayLabel: railDay(dateKey),
        isoDate: dateKey,
      }));
    return [
      {
        key: "overdue",
        blockKey: "overdue",
        count: board?.summary.overdue || 0,
        title: "Atrasados",
        subtitle: board?.summary.overdue
          ? "Ontem para trás."
          : "Sem pendência.",
        dayLabel: "Prioridade",
      },
      {
        key: "today",
        blockKey: "today",
        count: board?.summary.today || 0,
        title: "Hoje",
        subtitle: board?.summary.today ? "Fluxo principal." : "Sem agenda.",
        dayLabel: "Operação",
      },
      ...futureBase,
      ...extraFuture,
    ];
  }, [board]);

  useEffect(() => {
    if (!dateFilters.length) return;
    setSelectedDateKey((current) => {
      if (dateFilters.some((item) => item.key === current)) return current;
      return (
        dateFilters.find((item) => item.count > 0)?.key || dateFilters[0].key
      );
    });
  }, [dateFilters]);

  const selectedFilter = useMemo(
    () =>
      dateFilters.find((item) => item.key === selectedDateKey) ||
      dateFilters[0] ||
      null,
    [dateFilters, selectedDateKey],
  );

  const filteredLeads = useMemo(() => {
    if (!board || !selectedFilter) return [];
    const scopedLeads =
      selectedFilter.key === "overdue"
        ? board.blocks.overdue || []
        : selectedFilter.key === "today"
          ? board.blocks.today || []
          : (board.blocks.scheduled || []).filter(
              (lead) =>
                buildLocalDateKey(lead.returnAt || lead.updatedAt) ===
                selectedFilter.isoDate,
            );
    return scopedLeads.filter(
      (lead) =>
        matchesWhatsappFilter(lead, whatsappFilter) &&
        matchesInboxFilter(lead, inboxFilter),
    );
  }, [board, selectedFilter, whatsappFilter, inboxFilter]);

  useEffect(() => {
    const notice = todayAgendaLaunchNotice.notice;
    const live = loading || notice?.phase === "loading";
    if (!live) {
      setVendasVisualCount(0);
      return undefined;
    }
    const target = Math.max(
      1,
      filteredLeads.length || board?.summary.total || 12,
    );
    setVendasVisualCount(1);
    const timer = window.setInterval(() => {
      setVendasVisualCount((current) => Math.min(target, current + 1));
    }, 210);
    return () => window.clearInterval(timer);
  }, [
    board?.summary.total,
    filteredLeads.length,
    loading,
    todayAgendaLaunchNotice.notice,
  ]);

  useEffect(() => {
    const notice = todayAgendaLaunchNotice.notice;
    const totalVisible = filteredLeads.length;
    const archivedCount = board?.summary.closed || 0;
    const metrics = [
      { label: "Restante", value: String(totalVisible) },
      { label: "Descarte", value: String(archivedCount) },
    ];
    const errorMessage = compactVendasMessage(error);
    const liveCards = filteredLeads
      .slice(0, Math.max(1, vendasVisualCount))
      .slice(-4)
      .map((lead) => ({
        id: `vendas:${lead.id}`,
        title: lead.name || "Card em Vendas",
        meta:
          [lead.segment, lead.city, lead.statusLabel]
            .filter(Boolean)
            .join(" • ") || "Prospecção",
        score: lead.timesSeen ? `${lead.timesSeen}x` : undefined,
      }));

    if (errorMessage) {
      dispatchTopbarProgress({
        source: "vendas",
        phase: "warning",
        title: "Vendas precisa de atenção",
        status: errorMessage,
        progress: 100,
        metrics,
      });
      return;
    }

    if (feedback) {
      dispatchTopbarProgress({
        source: "vendas",
        phase: "success",
        title: "Vendas atualizado",
        status: feedback,
        progress: 100,
        metrics,
      });
      return;
    }

    if (!notice && !loading) {
      clearTopbarProgress("vendas");
      return;
    }

    dispatchTopbarProgress({
      source: "vendas",
      phase: notice?.phase || "loading",
      title:
        notice?.phase === "success"
          ? notice.title
          : loading
            ? "Carregando Vendas"
            : "Sincronizando Vendas",
      status:
        notice?.statusLabel ||
        (loading
          ? "Motores lendo banco e preparando a agenda comercial..."
          : "Filtrando negativos e alimentando Prospecção..."),
      progress: notice?.progress ?? 18,
      steps: VENDAS_PROGRESS_STEPS,
      activeStepIndex: loading ? 0 : 3,
      cardFeed: liveCards,
      metrics,
    });
  }, [
    board?.summary.closed,
    error,
    feedback,
    filteredLeads,
    filteredLeads.length,
    loading,
    todayAgendaLaunchNotice.notice,
    vendasVisualCount,
  ]);

  useEffect(() => () => clearTopbarProgress("vendas"), []);

  useEffect(() => () => setVendasCardDragLock(false), []);

  const handleActiveDateShortcut = useCallback(async () => {
    if (!selectedFilter) return;
    await syncLeadsToInbox(filteredLeads, {
      title: "Abrindo Inbox",
      description: `Enviando os cards visíveis de ${selectedFilter.title} para Prospecção.`,
    });
  }, [filteredLeads, selectedFilter, syncLeadsToInbox]);

  useEffect(() => {
    setSelectedLeadId((current) => {
      if (current && filteredLeads.some((lead) => lead.id === current))
        return current;
      if (
        current &&
        showClosed &&
        (board?.blocks.closed || []).some((lead) => lead.id === current)
      )
        return current;
      // Do not auto-select the first lead by default. Keep selection null
      // until user explicitly focuses a lead to avoid the first card
      // being treated differently on initial render.
      return null;
    });
  }, [board?.blocks.closed, filteredLeads, showClosed]);

  useEffect(() => {
    if (!showClosed || !archiveRef.current) return;
    const id = window.setTimeout(() => {
      archiveRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      archiveRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, [showClosed]);

  const selectedLeadRecord = selectedLeadId
    ? leadById.get(selectedLeadId) || null
    : null;
  const selectedLead = selectedLeadRecord?.lead || null;
  const selectedLeadDraft = selectedLead
    ? drafts[selectedLead.id] || createDraft(selectedLead)
    : null;
  const closedLeads = board?.blocks.closed || [];
  const mobileLeadCount = Math.max(
    board?.summary.total || 0,
    (board?.summary.overdue || 0) +
      (board?.summary.today || 0) +
      (board?.summary.scheduled || 0),
  );
  const mobileFutureCount = board?.summary.scheduled || 0;

  function mobileLeadPlace(lead: LeadItem) {
    const city = String(lead.city || "").trim();
    const address = String(lead.address || "").trim();
    const stateMatch = address.match(/\b([A-Z]{2})\b(?:\s*,?\s*Brasil)?$/);
    const state = stateMatch?.[1] || "";
    if (city && state && !city.includes(state)) return `${city} / ${state}`;
    return city || address || "Local não informado";
  }

  function mobileReturnLabel(lead: LeadItem) {
    const parsed = lead.returnAt ? new Date(lead.returnAt) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return "Sem retorno";
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const sameDay = (left: Date, right: Date) =>
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate();
    const time = parsed.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (sameDay(parsed, today)) return `Hoje ${time}`;
    if (sameDay(parsed, tomorrow)) return `Amanhã ${time}`;
    return formatDateTime(lead.returnAt);
  }

  function mobilePhoneLabel(lead: LeadItem) {
    const digits = normalizePhoneDigits(String(lead.phone || ""));
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return lead.phone || "Telefone não informado";
  }

  function mobileLeadSourceLabel(lead: LeadItem) {
    if (lead.primarySource) return lead.primarySource;
    if (lead.sourceType === "webscraping") return "Radar Digital";
    return "Cadastro manual";
  }

  function mergeMobileLeadPatch(leadId: string, patch: Partial<LeadItem>) {
    setBoard((currentBoard) => {
      if (!currentBoard) return currentBoard;
      let changed = false;
      const blocks = Object.fromEntries(
        (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).map(
          (blockKey) => [
            blockKey,
            (currentBoard.blocks[blockKey] || []).map((lead) => {
              if (lead.id !== leadId) return lead;
              changed = true;
              return { ...lead, ...patch };
            }),
          ],
        ),
      ) as BoardResponse["blocks"];
      return changed ? { ...currentBoard, blocks } : currentBoard;
    });
  }

  async function loadMobileLeadEnrichment(lead: LeadItem) {
    setMobileEnrichmentLoadingId(lead.id);
    try {
      const payload = await apiFetch<LeadEnrichmentResponse>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/enrichment`,
        { method: "POST", body: JSON.stringify({ templateOffset: 0 }) },
      );
      const patch: Partial<LeadItem> = {
        whatsappAvailability: payload.whatsappAvailability || lead.whatsappAvailability || null,
        leadIntelligence: payload.leadIntelligence || lead.leadIntelligence || null,
        planTier: payload.planTier || lead.planTier,
        capabilities: payload.capabilities || lead.capabilities,
      };
      mergeMobileLeadPatch(lead.id, patch);
      setMobileNoteLead((current) =>
        current?.id === lead.id ? { ...current, ...patch } : current,
      );
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : "Não foi possível enriquecer o card agora.",
      );
    } finally {
      setMobileEnrichmentLoadingId((current) => (current === lead.id ? null : current));
    }
  }

  function openMobileLeadDetail(lead: LeadItem) {
    setMobileTemplateIndex(readMobileReadyMessagePreference());
    setMobilePreferredCallerName(readMobilePreferredCallerName());
    saveMobileOpenLeadId(lead.id);
    setSelectedMobileLeadId(lead.id);
    setMobileNoteLead(lead);
    setMobileNoteDraft("");
    void loadMobileLeadEnrichment(lead);
  }

  function closeMobileLeadDetail() {
    saveMobileOpenLeadId(null);
    setSelectedMobileLeadId(null);
    setMobileNoteLead(null);
    setMobileNoteDraft("");
  }

  function activeMobileTemplate(lead: LeadItem) {
    const templates = buildMobileReadyMessageTemplates(lead, mobilePreferredCallerName);
    return templates[mobileTemplateIndex % templates.length];
  }

  function refreshMobileTemplate(lead: LeadItem) {
    const total = Math.max(1, buildMobileReadyMessageTemplates(lead, mobilePreferredCallerName).length);
    setMobileTemplateIndex((current) => {
      if (total <= 1) return current;
      let next = Math.floor(Math.random() * total);
      if (next === current % total) next = (next + 1) % total;
      saveMobileReadyMessagePreference(next);
      return next;
    });
  }

  async function copyMobileText(text: string, successMessage: string) {
    const value = String(text || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(successMessage);
    } catch {
      setFeedback("Não foi possível copiar automaticamente.");
    }
  }

  async function saveMobileNote() {
    const targetLead = selectedMobileLead || mobileNoteLead;
    if (!targetLead) return;
    setMobileSavingNote(true);
    try {
      await saveLead(
        targetLead.id,
        { shortNote: mobileNoteDraft },
        "Observação salva.",
      );
      mergeMobileLeadPatch(targetLead.id, { shortNote: mobileNoteDraft });
      setMobileNoteLead((current) =>
        current?.id === targetLead.id
          ? { ...current, shortNote: mobileNoteDraft }
          : current,
      );
    } finally {
      setMobileSavingNote(false);
    }
  }

  function openMobileReport(lead: LeadItem) {
    setMobileReportLead(lead);
    setMobileReportReason("");
  }

  async function submitMobileReport() {
    if (!mobileReportLead) return;
    const reason = mobileReportReason.trim();
    if (!reason) {
      setError("Informe o motivo do erro antes de reportar.");
      return;
    }
    setMobileReporting(true);
    setError(null);
    try {
      const payload = await apiFetch<ReportLeadErrorResponse>(
        `/vendas/leads/${encodeURIComponent(mobileReportLead.id)}/report-error`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
      if (payload?.whatsappUrl && !payload.autoSent) {
        window.open(payload.whatsappUrl, "_blank", "noopener,noreferrer");
      }
      setFeedback(payload?.message || "Card reportado e removido do Vendas.");
      setMobileReportLead(null);
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : "Falha ao reportar o card.",
      );
    } finally {
      setMobileReporting(false);
    }
  }

  function renderMobileVendas() {
    const mobilePendingCount = Math.max(
      0,
      (board?.summary.overdue || 0) + (board?.summary.today || 0) + (board?.summary.scheduled || 0),
    );
    const radarRunStatus = String(liveRadarRun?.status || storedRadarRun?.status || "");
    const radarRunDelivered = Math.max(
      0,
      Number(liveRadarRun?.meta?.deliveredCount || liveRadarRun?.foundCount || storedRadarRun?.deliveredCount || 0),
    );
    const radarRunTarget = Math.max(1, Number(liveRadarRun?.targetQuantity || liveRadarRun?.meta?.requestedQuantity || storedRadarRun?.targetQuantity || 1));
    const radarRunTerminal = isTerminalRadarRunStatus(radarRunStatus);
    const radarRunActive = Boolean((liveRadarRun?.runId || storedRadarRun?.runId) && !radarRunTerminal);
    const radarProgressLabel = radarRunTarget > 1 && radarRunDelivered > 0
      ? `${Math.min(radarRunDelivered, radarRunTarget)} de ${radarRunTarget} cards`
      : formatPtBrReceivedCards(radarRunDelivered);
    const radarAdjustParams = new URLSearchParams();
    const radarFilters = liveRadarRun?.meta?.filters;
    const radarState = radarFilters?.state || storedRadarRun?.state || "";
    const radarCity = radarFilters?.city || storedRadarRun?.city || "";
    const radarSegment = radarFilters?.segment || storedRadarRun?.segment || "";
    if (radarState) radarAdjustParams.set("state", radarState);
    if (radarCity) radarAdjustParams.set("city", radarCity);
    if (radarSegment) radarAdjustParams.set("segment", radarSegment);
    radarAdjustParams.set("quantity", String(radarRunTarget || 40));
    const radarAdjustHref = `/radar-digital?${radarAdjustParams.toString()}`;
    const mobileRadarState =
      radarRunStatus === "failed" ? "warning" :
      radarRunStatus === "completed_insufficient_results" || radarRunStatus === "partial_error" ? "partial" :
      radarRunActive && radarRunDelivered > 0 ? "receiving" :
      radarRunActive || loading ? "searching" :
      radarRunDelivered > 0 || mobilePendingCount > 0 ? "received" :
      "ready";
    const mobileRadarStatusLabel =
      mobileRadarState === "searching"
        ? "Pesquisando leads"
        : mobileRadarState === "receiving"
          ? radarProgressLabel
          : mobileRadarState === "partial"
            ? radarProgressLabel
            : mobileRadarState === "warning"
              ? "Radar precisa de ajuste"
              : mobileRadarState === "received"
                ? formatPtBrReceivedCards(Math.max(radarRunDelivered, mobilePendingCount))
                : "Motor pronto";
    const mobileRadarStatusText =
      mobileRadarState === "searching"
        ? "Motores cruzando dados"
        : mobileRadarState === "receiving"
          ? "Abastecendo sua agenda"
          : mobileRadarState === "partial"
            ? "Amplie cidade ou segmento"
            : mobileRadarState === "warning"
              ? "Abra o Radar para revisar"
              : mobileRadarState === "received"
                ? mobilePendingCount >= 40
            ? "Finalize ou delete para liberar"
            : "Radar alimentou o Vendas"
                : "Radar pronto para buscar";
    function renderMobileLeadDetail(lead: LeadItem) {
      const intelligence = lead.leadIntelligence || {};
      const capabilities = leadCapabilities(lead, board);
      const intelligenceVisible = canSeeLeadIntelligence(lead, board);
      const socialLinksVisible = canSeeSocialLinks(lead, board);
      const score = Math.max(
        0,
        Math.min(100, Math.round(Number(intelligenceVisible ? intelligence.opportunityScore || 0 : 0))),
      );
      const scoreLabel = intelligenceScoreLabel(score);
      const template = activeMobileTemplate(lead);
      const readyMessage = capabilities.canSeeMessageTemplates
        ? template.text
        : `Olá, tudo bem? Encontrei a ${lead.name || "sua empresa"} e queria apresentar uma solução simples para organizar contatos e retornos.`;
      const whatsappHref = buildWhatsAppUrlWithMessage(
        lead.phone,
        readyMessage,
      );
      const callHref = buildCallUrl(lead.phone);
      const email = leadEmailForDisplay(lead);
      const emailHref = email ? `mailto:${email}` : "";
      const website = leadWebsiteForDisplay(lead);
      const instagramHref = socialLinksVisible ? normalizeExternalUrl(intelligence.instagramUrl) : "";
      const facebookHref = socialLinksVisible ? normalizeExternalUrl(intelligence.facebookUrl) : "";
      const socialBadge = socialBadgeLabel(intelligence.primarySocial);
      const whatsappStatus = intelligence.whatsappStatus || lead.whatsappAvailability?.status || null;
      const whatsappReady = whatsappStatus === "confirmed" || lead.whatsappAvailability?.status === "available";
      const whatsappUnavailable = whatsappStatus === "missing" || whatsappStatus === "invalid" || lead.whatsappAvailability?.status === "unavailable";
      const tags = (intelligence.leadReasonTags || []).slice(0, 4);
      const reasonChips = [
        !website ? { label: "Sem site", tone: "danger" } : null,
        whatsappReady ? { label: "WhatsApp confirmado", tone: "success" } : null,
        email ? { label: "E-mail encontrado", tone: "success" } : null,
        lead.city ? { label: "Cidade alvo", tone: "primary" } : null,
        intelligenceVisible && (intelligence.contactQuality === "ready" || score >= 70)
          ? { label: "Lead inteligente", tone: "smart" }
          : null,
        ...tags.map((tag) => ({ label: leadTagLabel(tag), tone: "neutral" })),
      ].filter(Boolean) as Array<{ label: string; tone: string }>;
      const quickNotes = [
        "Interessado",
        "Retorno amanhã",
        "Sem site",
        "WhatsApp ok",
      ];
      const appendQuickNote = (value: string) => {
        setMobileNoteDraft((current) => {
          const normalized = String(current || "").trim();
          if (normalized.toLowerCase().includes(value.toLowerCase())) return current;
          return normalized ? `${normalized}\n${value}` : value;
        });
      };
      const loadingEnrichment = mobileEnrichmentLoadingId === lead.id;
      const timeline = (lead.timeline || []).slice(0, 4);
      const detailPlace = mobileLeadPlace(lead);
      const status = lead.statusLabel || statusLabel(lead.status);
      const suggestedAction = lead.nextAction || nextBestActionLabel(intelligence.nextBestAction);
      const priorityLabel = score ? scoreLabel : "Aguardando dados";
      const premiumTeaser = !intelligenceVisible && (intelligence.premiumTeaser || intelligence.primarySocial)
        ? { label: "Disponível no HBX Lead", cta: "Ver card inteligente" }
        : null;

      return (
        <section className={`${styles.mobileVendasShell} ${styles.mobileLeadDetailShell} hbx-mobile-page`} aria-label="Detalhe do lead mobile">
          <div className={`${styles.mobileLeadDetailScreen} hbx-mobile-page`}>
            <header className={`${styles.mobileLeadDetailHeader} hbx-mobile-header`}>
              <button
                type="button"
                className={`${styles.mobileLeadBackButton} hbx-mobile-secondary-button`}
                onClick={closeMobileLeadDetail}
              >
                Voltar
              </button>
              <div className={styles.mobileLeadDetailTitle}>
                <strong>HBX</strong>
                <span>Detalhes do lead</span>
              </div>
              <button
                type="button"
                className={styles.mobileLeadPlusButton}
                onClick={() => setComposerOpen(true)}
              >
                Lead+
              </button>
            </header>

            <div className={styles.mobileLeadDetailBody}>
              {feedback ? <div className={`${styles.feedback} hbx-mobile-notice`}>{feedback}</div> : null}
              {error ? <div className={`${styles.errorBanner} hbx-mobile-notice`} data-tone="error">{error}</div> : null}

              <section className={`${styles.mobileLeadHeroPremium} hbx-mobile-hero hbx-mobile-glass`}>
                <span className={styles.mobileLeadHeroVisual} aria-hidden="true" />
                <div className={styles.mobileLeadHeroIdentity}>
                  <div className={styles.mobileLeadPlusAvatar} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 19h16" />
                      <path d="M6 19V9h12v10" />
                      <path d="M8 9V6h8v3" />
                      <path d="M9 13h6" />
                      <path d="M9 16h6" />
                    </svg>
                  </div>
                  <div>
                    <strong>{lead.name || "Lead sem nome"}</strong>
                    <span>{lead.segment || "Segmento não informado"}</span>
                    <em>{detailPlace}</em>
                  </div>
                </div>
                <div
                  className={styles.mobileLeadScoreBox}
                  data-locked={!intelligenceVisible ? "true" : "false"}
                  style={{ ["--lead-score" as string]: `${score}%` } as CSSProperties}
                  aria-label={`Score ${score || 0}`}
                >
                  <span>{!intelligenceVisible ? "♕ Score" : "Score"}</span>
                  <strong>{intelligenceVisible ? score || "--" : "Lead"}</strong>
                  <small>{intelligenceVisible ? priorityLabel : "Disponível no HBX Lead"}</small>
                </div>
                <div className={styles.mobileLeadHeroMeta} aria-label="Resumo do lead">
                  <span>{status}</span>
                  <span>{mobileReturnLabel(lead)}</span>
                  {socialBadge ? <span data-tone="social">{socialBadge}</span> : null}
                  <span>{mobileLeadSourceLabel(lead)}</span>
                </div>
              </section>

              <section className={`${styles.mobileLeadContactPanel} hbx-mobile-card`} aria-label="Contato do lead">
                <div className={styles.mobileLeadContactRows}>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M6.6 10.8c1.5 3 3.6 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.2 1.3.4 2.6.7 4 .7.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.8 21.6 2.4 13.2 2.4 3.4c0-.7.5-1.2 1.2-1.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.7 4 .1.4 0 .9-.3 1.2l-2.1 2.2Z" />
                      </svg>
                    </span>
                    <strong>{mobilePhoneLabel(lead)}</strong>
                    <b data-tone={whatsappUnavailable ? "danger" : whatsappReady ? "success" : "muted"}>
                      {whatsappStatusLabel(whatsappStatus)}
                    </b>
                  </div>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 6h16v12H4z" />
                        <path d="m4 7 8 6 8-6" />
                      </svg>
                    </span>
                    <strong>{email || "E-mail não encontrado"}</strong>
                    <b data-tone={email ? "success" : "muted"}>{email ? "E-mail encontrado" : "Sem e-mail"}</b>
                  </div>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3 12h18" />
                        <path d="M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21" />
                        <path d="M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9" />
                      </svg>
                    </span>
                    <strong>{website || "Sem site"}</strong>
                    <b data-tone={website ? "smart" : "muted"}>{website ? "Site encontrado" : "Sem site"}</b>
                  </div>
                  {socialBadge ? (
                    <div>
                      <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                        {socialBadge}
                      </span>
                      <strong>{socialLinksVisible ? "Rede social encontrada" : "Rede social detectada"}</strong>
                      <b data-tone={socialLinksVisible ? "success" : "muted"}>
                        {socialLinksVisible ? "Links liberados" : "Disponível no HBX Lead"}
                      </b>
                    </div>
                  ) : null}
                </div>
                {(instagramHref || facebookHref) ? (
                  <div className={styles.mobileLeadSocialActions}>
                    {instagramHref ? (
                      <a href={instagramHref} target="_blank" rel="noreferrer">
                        Abrir Instagram
                      </a>
                    ) : null}
                    {facebookHref ? (
                      <a href={facebookHref} target="_blank" rel="noreferrer">
                        Abrir Facebook
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {premiumTeaser ? (
                <section className={`${styles.mobileLeadPremiumTeaser} hbx-mobile-card`}>
                  <span aria-hidden="true">♕</span>
                  <div>
                    <strong>{premiumTeaser.label}</strong>
                    <small>{premiumTeaser.cta}</small>
                  </div>
                </section>
              ) : null}

              <section className={`${styles.mobileLeadReasonBlock} hbx-mobile-card`} data-locked={!capabilities.canSeeOpportunityReason ? "true" : "false"}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3" />
                    <path d="M22 12h-3" />
                  </svg>
                  Sinais comerciais
                </h3>
                <div>
                  {(reasonChips.length ? reasonChips : [{ label: "Cidade alvo", tone: "primary" }]).map((chip) => (
                    <span key={`${chip.label}:${chip.tone}`} data-tone={chip.tone}>
                      {chip.label}
                    </span>
                  ))}
                </div>
                <p>
                  {capabilities.canSeeOpportunityReason
                    ? intelligence.opportunityReason || "Revise os sinais comerciais antes da abordagem."
                    : "Motivo da oportunidade disponível no HBX Lead."}
                </p>
              </section>

              <section className={`${styles.mobileLeadNextActionBox} hbx-mobile-card`}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
                  </svg>
                  Próxima ação
                </h3>
                <a
                  href={whatsappHref || undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!whatsappHref}
                  onClick={(event) => {
                    if (!whatsappHref) event.preventDefault();
                    else void incrementAttempt(lead.id);
                  }}
                >
                  <span aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M19.05 4.94A9.8 9.8 0 0 0 12.06 2C6.59 2 2.13 6.46 2.13 11.93c0 1.75.46 3.46 1.32 4.97L2 22l5.27-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.47 0 9.93-4.46 9.93-9.93a9.86 9.86 0 0 0-2.95-6.97Z" />
                    </svg>
                  </span>
                  {suggestedAction}
                  <b aria-hidden="true">›</b>
                </a>
              </section>

              <section className={`${styles.mobileLeadReadyMessage} hbx-mobile-card`}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h16v11H7l-3 3V5Z" />
                    <path d="M8 9h8" />
                    <path d="M8 13h5" />
                  </svg>
                  Mensagem pronta
                </h3>
                <p>
                  {!capabilities.canSeeMessageTemplates
                    ? "Mensagem pronta por segmento disponível no HBX Lead."
                    : loadingEnrichment
                      ? "Verificando WhatsApp no motor HBX Master..."
                      : readyMessage}
                </p>
                <div className={styles.mobileLeadQuickGrid}>
                  <a
                    href={callHref || undefined}
                    aria-disabled={!callHref}
                    onClick={(event) => {
                      if (!callHref) event.preventDefault();
                      else void incrementAttempt(lead.id);
                    }}
                  >
                    Ligar
                  </a>
                  <a href={emailHref || undefined} aria-disabled={!emailHref}>
                    E-mail
                  </a>
                  <button
                    type="button"
                    data-tone="primary"
                    onClick={() => void copyMobileText(readyMessage, "Mensagem copiada.")}
                    disabled={!capabilities.canSeeMessageTemplates}
                  >
                    Copiar msg
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshMobileTemplate(lead)}
                    disabled={!capabilities.canSeeMessageTemplates}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 7v5h-5" />
                      <path d="M4 17v-5h5" />
                      <path d="M6.1 9A7 7 0 0 1 18 6.2L20 8" />
                      <path d="M17.9 15A7 7 0 0 1 6 17.8L4 16" />
                    </svg>
                    Atualizar
                  </button>
                </div>
              </section>

              <section id="mobile-lead-note" className={`${styles.mobileLeadObservationCard} hbx-mobile-card`}>
                <span className={styles.mobileLeadObservationVisual} aria-hidden="true" />
                <div className={styles.mobileLeadObservationHeader}>
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 5h14v11H8l-3 3V5Z" />
                      <path d="M9 9h6" />
                      <path d="M9 13h4" />
                    </svg>
                    Observações
                  </h3>
                  <span>{mobileNoteDraft.length}/280</span>
                </div>
                {lead.shortNote ? (
                  <p className={styles.mobileLeadSavedNote}>{lead.shortNote}</p>
                ) : null}
                <label className={styles.mobileLeadNoteEditor}>
                  <span>Nova observação</span>
                  <textarea
                    value={mobileNoteDraft}
                    onChange={(event) => setMobileNoteDraft(event.target.value)}
                    onFocus={() => {
                      mobileSkipDraftHydrateRef.current = true;
                    }}
                    onBlur={() => {
                      mobileSkipDraftHydrateRef.current = false;
                      const snapshot = boardRef.current;
                      if (snapshot) setDrafts(hydrateDrafts(snapshot));
                    }}
                    rows={4}
                    maxLength={280}
                    placeholder="Escreva o contexto do atendimento, objeções, próximos passos ou qualquer detalhe importante."
                  />
                </label>
                <div className={styles.mobileLeadSmartChips} aria-label="Chips rápidos de observação">
                  {quickNotes.map((note) => (
                    <button
                      type="button"
                      key={note}
                      onClick={() => appendQuickNote(note)}
                    >
                      {note}
                    </button>
                  ))}
                </div>
                <p className={styles.mobileLeadSuggestedAction}>
                  Próxima ação sugerida: <strong>{suggestedAction}</strong>
                </p>
                <button
                  type="button"
                  className={`${styles.mobileLeadSaveNoteButton} hbx-mobile-primary-button`}
                  onClick={() => void saveMobileNote()}
                  disabled={mobileSavingNote || savingLeadId === lead.id}
                >
                  {mobileSavingNote ? "Salvando" : "Salvar observação"}
                </button>
                <button
                  type="button"
                  className={`${styles.mobileLeadRefreshButton} hbx-mobile-secondary-button`}
                  onClick={() => refreshMobileTemplate(lead)}
                >
                  Atualizar mensagem
                </button>
              </section>

              <section className={`${styles.mobileLeadTimeline} hbx-mobile-card`}>
                <span className={styles.mobileTimelineVisual} aria-hidden="true" />
                <h3>Histórico</h3>
                {(timeline.length
                  ? timeline
                  : [
                      {
                        id: "empty",
                        eventType: "generic",
                        title: "Lead validado pelo HBX",
                        description: intelligence.opportunityReason || "Aguardando primeira observação.",
                        createdAt: new Date().toISOString(),
                        sourceType: "hbx",
                      } as LeadTimelineEvent,
                    ]
                ).map((event) => (
                  <div key={event.id} data-tone={timelineTone(event.eventType)}>
                    <span aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 8v4l3 2" />
                        <circle cx="12" cy="12" r="8" />
                      </svg>
                    </span>
                    <p>
                      <strong>{timelineMeta(event)}</strong>
                      {event.title || event.description || "Atendimento atualizado."}
                    </p>
                  </div>
                ))}
              </section>
            </div>

            <nav className={`${styles.mobileLeadDetailActionBar} hbx-mobile-action-bar`} aria-label="Ações do lead">
              <a
                className="hbx-mobile-primary-button"
                href={whatsappHref || undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!whatsappHref}
                data-tone="whatsapp"
                onClick={(event) => {
                  if (!whatsappHref) event.preventDefault();
                  else void incrementAttempt(lead.id);
                }}
              >
                WhatsApp
              </a>
              <button
                type="button"
                className="hbx-mobile-secondary-button"
                onClick={() => void runQuickAction(lead, "amanha")}
                disabled={savingLeadId === lead.id}
              >
                Retorno
              </button>
              <button
                type="button"
                className="hbx-mobile-secondary-button"
                data-tone="danger"
                onClick={() => void runQuickAction(lead, "encerrar")}
                disabled={savingLeadId === lead.id}
              >
                Negativo
              </button>
            </nav>
            <HbxMobileDock
              primaryLabel="Incluir lead manual"
              onPrimaryAction={() => setComposerOpen(true)}
              onConta={() => {
                setAccountNameDraft(mobilePreferredCallerName || readMobilePreferredCallerName());
                setAccountSheetOpen(true);
              }}
            />
          </div>
        </section>
      );
    }

    if (selectedMobileLead) return renderMobileLeadDetail(selectedMobileLead);

    return (
      <section className={`${styles.mobileVendasShell} ${styles.mobileLeadListScreen}`} aria-label="Vendas mobile">
        <div className={styles.mobileVendasContextBar}>
          <header className={`${styles.mobileVendasHeader} hbx-mobile-header`}>
            <a
              className={styles.mobileRadarMotorStatus}
              data-state={mobileRadarState}
              data-pulse={radarStatusPulseKey}
              href="/radar-digital"
              aria-label="Abrir Radar Digital"
            >
              <span key={`burst-${radarStatusPulseKey}`} className={styles.mobileRadarStatusBurst} aria-hidden="true" />
              <span key={mobileRadarState} className={styles.mobileRadarMotorIcon} aria-hidden="true">
                {mobileRadarState === "ready" ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : mobileRadarState === "searching" ? (
                  <i />
                ) : mobileRadarState === "receiving" ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M7 7h10" />
                    <path d="M7 12h7" />
                    <path d="M7 17h4" />
                    <path d="m15 14 3 3 3-3" />
                  </svg>
                ) : mobileRadarState === "partial" || mobileRadarState === "warning" ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M12 4 3 20h18L12 4Z" />
                    <path d="M12 9v5" />
                    <path d="M12 17h.01" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24">
                    <path d="M13 5h6v14h-6" />
                    <path d="M5 12h12" />
                    <path d="m13 8 4 4-4 4" />
                  </svg>
                )}
              </span>
              <span className={styles.mobileRadarMotorDivider} aria-hidden="true" />
              <span key={`${mobileRadarState}:copy`} className={styles.mobileRadarMotorCopy}>
                <small>Status do motor - Radar Digital</small>
                <strong>{mobileRadarStatusLabel}</strong>
                <em>{mobileRadarStatusText}</em>
              </span>
            </a>
            {mobileRadarState === "partial" || mobileRadarState === "warning" ? (
              <a className={styles.mobileRadarActionNotice} href={radarAdjustHref}>
                <strong>Preciso de atenção</strong>
                <span>O Radar entregou o que encontrou aqui. Toque para ampliar a busca e completar os 40 cards.</span>
              </a>
            ) : null}
          </header>

          <div className={`${styles.mobileVendasKpis} hbx-mobile-grid`}>
            <button
              type="button"
              className="hbx-mobile-card"
              data-tone="danger"
              data-active={mobileAgendaTab === "overdue" ? "true" : "false"}
              onClick={() => setMobileAgendaTab("overdue")}
            >
              <span>Atrasados</span>
              <strong>{board?.summary.overdue ?? 0}</strong>
              <small>Precisam de ação</small>
            </button>
            <button
              type="button"
              className="hbx-mobile-card"
              data-tone="primary"
              data-active={mobileAgendaTab === "today" ? "true" : "false"}
              onClick={() => setMobileAgendaTab("today")}
            >
              <span>Hoje</span>
              <strong>{board?.summary.today ?? mobileLeadCount}</strong>
              <small>Agendados para hoje</small>
            </button>
            <button
              type="button"
              className="hbx-mobile-card"
              data-tone="success"
              data-active={mobileAgendaTab === "upcoming" ? "true" : "false"}
              onClick={() => setMobileAgendaTab("upcoming")}
            >
              <span>Próximos</span>
              <strong>{mobileFutureCount}</strong>
              <small>Próximos 7 dias</small>
            </button>
          </div>

          <div className={styles.mobileVendasSearchRow}>
            <label className={styles.mobileVendasSearch}>
              <span aria-hidden="true">⌕</span>
              <input
                value={mobileSearch}
                onChange={(event) => setMobileSearch(event.target.value)}
                placeholder="Buscar leads"
              />
            </label>
            <button type="button" aria-label="Ajustar filtros">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 7h8" />
                <path d="M17 7h2" />
                <path d="M5 17h2" />
                <path d="M11 17h8" />
                <path d="M13 5v4" />
                <path d="M9 15v4" />
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className={`${styles.mobileVendasLoading} hbx-mobile-empty`}>
            <span />
            <strong>Carregando agenda</strong>
          </div>
        ) : (
          <div className={styles.mobileVendasList}>
            {mobileLeads.length ? (
              mobileLeads.map(({ lead }, index) => {
                const status = lead.statusLabel || statusLabel(lead.status);
                const whatsappHref = buildWhatsAppUrl(lead.phone, lead.name);
                const callHref = buildCallUrl(lead.phone);
                const compactSocialBadge = socialBadgeLabel(lead.leadIntelligence?.primarySocial);
                return (
                  <article
                    className={`${styles.mobileVendasCard} hbx-mobile-card`}
                    key={lead.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openMobileLeadDetail(lead)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openMobileLeadDetail(lead);
                      }
                    }}
                    style={{ ["--mobile-card-index" as string]: index } as CSSProperties}
                  >
                    <div
                      className={styles.mobileVendasAvatar}
                      data-variant={index % 2 === 0 ? "green" : "violet"}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M5 21V5.8C5 4.8 5.8 4 6.8 4h10.4c1 0 1.8.8 1.8 1.8V21" />
                        <path d="M8.5 8h2" />
                        <path d="M13.5 8h2" />
                        <path d="M8.5 12h2" />
                        <path d="M13.5 12h2" />
                        <path d="M10 21v-4h4v4" />
                      </svg>
                    </div>
                    <div className={styles.mobileVendasCardMain}>
                      <div className={styles.mobileVendasCardTitle}>
                        <div>
                          <strong>{lead.name || "Lead sem nome"}</strong>
                          <span>{mobileLeadPlace(lead)}</span>
                        </div>
                        <div className={styles.mobileVendasCardActions}>
                          <button
                            type="button"
                            data-action="report"
                            onClick={(event) => {
                              event.stopPropagation();
                              openMobileReport(lead);
                            }}
                            aria-label={`Reportar erro em ${lead.name || "lead"}`}
                            disabled={mobileReporting}
                          >
                            !
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openMobileLeadDetail(lead);
                            }}
                            aria-label={`Abrir observação de ${lead.name || "lead"}`}
                          >
                            ...
                          </button>
                        </div>
                      </div>
                      <div className={styles.mobileVendasCardMeta}>
                        <span data-status={lead.status}>{status}</span>
                        <small>
                          Retorno <b>{mobileReturnLabel(lead)}</b>
                        </small>
                        {compactSocialBadge ? (
                          <small data-tone="social">
                            {compactSocialBadge}
                          </small>
                        ) : null}
                      </div>
                      <div className={styles.mobileVendasNextAction}>
                        <span>Próxima ação</span>
                        <strong>
                          {lead.nextAction || "Ligação de apresentação"}
                        </strong>
                      </div>
                    </div>
                    <div className={styles.mobileVendasContactActions}>
                      <a
                        href={whatsappHref || undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!whatsappHref}
                        onClick={(event) => {
                          event.stopPropagation();
                          void incrementAttempt(lead.id);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M19.05 4.94A9.8 9.8 0 0 0 12.06 2C6.59 2 2.13 6.46 2.13 11.93c0 1.75.46 3.46 1.32 4.97L2 22l5.27-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.47 0 9.93-4.46 9.93-9.93a9.86 9.86 0 0 0-2.95-6.97ZM12.07 20.2h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.2 8.2 0 0 1-1.26-4.4c0-4.53 3.69-8.22 8.24-8.22 2.2 0 4.27.85 5.82 2.4a8.17 8.17 0 0 1 2.4 5.82c0 4.54-3.69 8.23-8.2 8.23Zm4.5-6.15c-.25-.13-1.47-.72-1.7-.8-.23-.08-.4-.12-.57.12-.17.25-.65.8-.8.97-.15.17-.3.19-.56.06-.25-.13-1.06-.39-2.01-1.26-.74-.66-1.24-1.48-1.39-1.73-.15-.25-.02-.38.11-.5.11-.11.25-.3.38-.45.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.57-1.37-.78-1.88-.21-.5-.42-.43-.57-.44l-.49-.01c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.45 1.02 2.62c.13.17 1.77 2.7 4.3 3.79.6.26 1.08.42 1.44.54.61.19 1.16.16 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.3Z" />
                        </svg>
                      </a>
                      <a
                        href={callHref || undefined}
                        aria-disabled={!callHref}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!callHref) event.preventDefault();
                          void incrementAttempt(lead.id);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6.6 10.8c1.5 3 3.6 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.2 1.3.4 2.6.7 4 .7.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.8 21.6 2.4 13.2 2.4 3.4c0-.7.5-1.2 1.2-1.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.7 4 .1.4 0 .9-.3 1.2l-2.1 2.2Z" />
                        </svg>
                      </a>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className={`${styles.mobileVendasEmpty} hbx-mobile-empty`}>
                <div className={styles.mobileEmptyVisual} aria-hidden="true">
                  <Image
                    src="/hbx-visuals/states/empty-vendas.webp"
                    alt=""
                    width={280}
                    height={200}
                  />
                </div>
                <strong>Nenhum lead disponível agora</strong>
                <span>Troque a guia, limpe a busca ou volte ao Radar para ampliar cidade e segmento.</span>
              </div>
            )}
          </div>
        )}

        <HbxMobileDock
          primaryLabel="Incluir lead manual"
          onPrimaryAction={() => setComposerOpen(true)}
          onConta={() => {
            setAccountNameDraft(mobilePreferredCallerName || readMobilePreferredCallerName());
            setAccountSheetOpen(true);
          }}
        />

        {mobileReportLead ? (
          <div
            className={styles.mobileVendasSheetBackdrop}
            onClick={() => setMobileReportLead(null)}
          >
            <section
              className={`${styles.mobileVendasNoteSheet} ${styles.mobileVendasReportSheet}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-vendas-report-title"
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.mobileVendasSheetHandle} />
              <div className={styles.mobileVendasSheetHeader}>
                <h2 id="mobile-vendas-report-title">Reportar erro</h2>
                <button type="button" onClick={() => setMobileReportLead(null)}>
                  ×
                </button>
              </div>
              <p className={styles.mobileVendasReportLead}>
                {mobileReportLead.name || "Lead sem nome"}
              </p>
              <textarea
                value={mobileReportReason}
                onChange={(event) => setMobileReportReason(event.target.value)}
                rows={5}
                placeholder="Descreva o erro encontrado neste card"
              />
              <div className={styles.mobileVendasSheetFooter}>
                <button
                  type="button"
                  className={styles.mobileVendasDeleteButton}
                  onClick={() => setMobileReportLead(null)}
                  disabled={mobileReporting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitMobileReport()}
                  disabled={mobileReporting || !mobileReportReason.trim()}
                >
                  {mobileReporting ? "Enviando" : "Reportar"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  function scrollDateRail(direction: -1 | 1) {
    const el = filterScrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(260, Math.round(el.clientWidth * 0.72)),
      behavior: "smooth",
    });
  }

  function clearBulkSelection() {
    setSelectedBulkLeadIds(new Set());
    setBulkSelectAllAccount(false);
  }

  function toggleBulkSelectionMode() {
    if (bulkSelectionMode) clearBulkSelection();
    setBulkSelectionMode((current) => !current);
  }

  function toggleLeadBulkSelection(leadId: string) {
    const normalizedLeadId = String(leadId || "").trim();
    if (!normalizedLeadId) return;
    setBulkSelectionMode(true);
    setBulkSelectAllAccount(false);
    setSelectedBulkLeadIds((current) => {
      const next = new Set(current);
      if (next.has(normalizedLeadId)) next.delete(normalizedLeadId);
      else next.add(normalizedLeadId);
      return next;
    });
  }

  function toggleBulkSelectAll() {
    setBulkSelectionMode(true);
    if (bulkSelectAllAccount) {
      clearBulkSelection();
      return;
    }
    setBulkSelectAllAccount(true);
    setSelectedBulkLeadIds(new Set(loadedLeadIds));
  }

  async function deleteSelectedLeadsBulk() {
    const selectedIds = Array.from(selectedBulkLeadIds);
    if (!bulkSelectAllAccount && !selectedIds.length) return;

    const targetLabel = bulkSelectAllAccount
      ? "todos os cards da conta atual"
      : `${selectedIds.length} card(s) selecionado(s)`;
    const confirmed = window.confirm(
      `Excluir ${targetLabel} do Vendas? Os cards somem da tela, mas a base do Radar Digital continua preservada.`,
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    setError(null);
    try {
      const payload = await apiFetch<BulkDeleteLeadsResponse>(
        "/vendas/leads/delete-bulk",
        {
          method: "POST",
          body: JSON.stringify(
            bulkSelectAllAccount ? { all: true } : { leadIds: selectedIds },
          ),
        },
      );
      const deletedCount = Number(payload?.deletedCount || 0);
      setFeedback(
        deletedCount
          ? `${deletedCount} card(s) excluído(s) do Vendas.`
          : "Nenhum card novo para excluir.",
      );
      clearBulkSelection();
      setBulkSelectionMode(false);
      setSelectedLeadId(null);
      await loadBoard();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao excluir cards em massa.",
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleCreateManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingManual(true);
    setError(null);
    try {
      const body: {
        name?: string;
        phone?: string;
        nextAction?: string;
        returnAt?: string;
        shortNote?: string;
        email?: string;
      } = {
        name: manualLead.name || undefined,
        phone: manualLead.phone || undefined,
        nextAction: manualLead.nextAction || undefined,
        returnAt: manualLead.returnAt || undefined,
        shortNote: manualLead.shortNote || undefined,
      };
      if (manualLead.email && String(manualLead.email).trim())
        body.email = manualLead.email;

      const payload = await apiFetch<{ ok: boolean; action: string }>(
        "/vendas/manual",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setFeedback(
        payload.action === "updated"
          ? "Lead manual atualizado no CRM."
          : "Lead manual criado no CRM.",
      );
      setManualLead({
        name: "",
        phone: "",
        email: "",
        nextAction: "Primeiro contato",
        returnAt: plusDaysDatetimeLocal(0),
        shortNote: "",
      });
      setComposerOpen(false);
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Falha ao criar lead manual.",
      );
    } finally {
      setCreatingManual(false);
    }
  }

  function setLeadDraft(leadId: string, patch: Partial<LeadDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [leadId]: {
        ...(prev[leadId] || {
          name: "",
          phone: "",
          email: "",
          status: "novo" as LeadStatus,
          nextAction: "",
          returnAt: "",
          shortNote: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveLead(
    leadId: string,
    patch?: Partial<LeadDraft>,
    successMessage?: string,
  ) {
    const draft = {
      ...(drafts[leadId] || {
        name: "",
        phone: "",
        email: "",
        status: "novo" as LeadStatus,
        nextAction: "",
        returnAt: "",
        shortNote: "",
      }),
      ...(patch || {}),
    };
    const email = String(draft.email || "").trim();
    setSavingLeadId(leadId);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: draft.name,
        phone: draft.phone,
        email: email || null,
        status: draft.status,
        nextAction: draft.nextAction,
        returnAt: draft.returnAt || "",
        shortNote: draft.shortNote,
      };
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setFeedback(successMessage || "Lead atualizado com sucesso.");
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
      // If the saved lead was being edited inline, close the inline editor
      if (editingLeadId === leadId) {
        editingInputActiveRef.current = false;
        setEditingLeadId(null);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Falha ao atualizar o lead.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }

  function applyOptimisticAttemptIncrement(
    currentBoard: BoardResponse,
    leadId: string,
  ) {
    const blocks: BoardResponse["blocks"] = {
      overdue: [...currentBoard.blocks.overdue],
      today: [...currentBoard.blocks.today],
      scheduled: [...currentBoard.blocks.scheduled],
      closed: [...currentBoard.blocks.closed],
    };

    let found = false;
    [
      "overdue" as LeadBlockKey,
      "today" as LeadBlockKey,
      "scheduled" as LeadBlockKey,
      "closed" as LeadBlockKey,
    ].forEach((blockKey) => {
      blocks[blockKey] = blocks[blockKey].map((lead) => {
        if (lead.id !== leadId) return lead;
        found = true;
        return {
          ...lead,
          attemptCount: (lead.attemptCount || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      });
    });

    if (!found) return currentBoard;
    return { blocks, summary: recomputeSummary(blocks) };
  }

  async function incrementAttempt(leadId: string) {
    if (!board) return;
    const currentRecord = leadById.get(leadId);
    const currentAttempt = currentRecord?.lead.attemptCount || 0;
    const nextAttempt = currentAttempt + 1;
    const previousBoard = board;
    const optimisticBoard = applyOptimisticAttemptIncrement(board, leadId);
    setBoard(optimisticBoard);
    setSavingLeadId(leadId);
    setError(null);
    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ attemptCount: nextAttempt }),
      });
      setFeedback("Tentativa registrada.");
      await loadBoard();
    } catch (err) {
      setBoard(previousBoard);
      setError(
        err instanceof Error ? err.message : "Falha ao registrar tentativa.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }

  async function runQuickAction(lead: LeadItem, action: string) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    if (action === "tentativa_whatsapp" || action === "tentativa_call") {
      await incrementAttempt(lead.id);
      return;
    }
    if (action === "hoje") {
      await saveLead(lead.id, {
        status:
          currentDraft.status === "novo" ? "contato" : currentDraft.status,
        nextAction: currentDraft.nextAction || "Retomar hoje",
        returnAt: plusDaysDatetimeLocal(0),
      });
      return;
    }
    if (action === "amanha") {
      // Move the lead to the next available date filter instead of only setting a datetime.
      // Compute the lead's current date key and find its index inside `dateFilters`.
      const currentRecord = leadById.get(lead.id);
      const leadBlock = currentRecord?.block || "today";
      const currentDateKey =
        leadBlock === "scheduled"
          ? (`scheduled:${buildLocalDateKey(lead.returnAt || lead.updatedAt)}` as DateFilterKey)
          : (leadBlock as DateFilterKey);

      const idx = dateFilters.findIndex((item) => item.key === currentDateKey);
      const nextIndex =
        idx >= 0 ? Math.min(idx + 1, Math.max(0, dateFilters.length - 1)) : 0;
      const targetKey =
        dateFilters[nextIndex]?.key ||
        (dateFilters[0]?.key as DateFilterKey) ||
        "today";

      await handleDateMove(lead.id, targetKey);
      return;
    }
    if (action === "encerrar") {
      await saveLead(lead.id, {
        status: "encerrado",
        nextAction: currentDraft.nextAction || "Lead encerrado",
        returnAt: "",
      });
      return;
    }
    if (action === "reabrir") {
      await saveLead(lead.id, {
        status: "retorno",
        nextAction: currentDraft.nextAction || "Retomar lead",
        returnAt: plusDaysDatetimeLocal(1),
      });
    }
  }

  async function handleLeadInboxAction(lead: LeadItem) {
    if (isLeadInInbox(lead)) {
      openInboxAgenda(getLeadInboxConversationId(lead) || null);
      return;
    }
    setSavingLeadId(lead.id);
    try {
      await syncLeadsToInbox([lead], {
        title: "Importando para Inbox",
        description: "Preparando este card no Inbox interno.",
      });
    } finally {
      setSavingLeadId(null);
    }
  }

  function focusLead(leadId: string) {
    const current = leadById.get(leadId);
    if (!current) return;
    if (current.block === "overdue") setSelectedDateKey("overdue");
    if (current.block === "today") setSelectedDateKey("today");
    if (current.block === "scheduled") {
      const dateKey = buildLocalDateKey(
        current.lead.returnAt || current.lead.updatedAt,
      );
      if (dateKey) setSelectedDateKey(`scheduled:${dateKey}`);
    }
    if (current.block === "closed") setShowClosed(true);
    setSelectedLeadId(leadId);
    setCommandOpen(false);
    // After changing selected block/lead, wait a tick for DOM to update
    // then scroll the actual card into view and move keyboard focus there.
    window.setTimeout(() => {
      const node = leadCardRefs.current[leadId];
      if (node) {
        try {
          node.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        } catch {
          node.scrollIntoView({ behavior: "smooth" });
        }
        // focus the primary interactive element inside the card if present
        const focusable = node.querySelector(
          'button, [role="button"], a, input, textarea, [tabindex]',
        ) as HTMLElement | null;
        if (focusable) focusable.focus();
      } else {
        // fallback: ensure detail panel is visible
        document
          .querySelector<HTMLElement>("[data-detail-panel='true']")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }

  function registerLeadCardRef(leadId: string, node: HTMLElement | null) {
    leadCardRefs.current[leadId] = node;
  }

  function registerDateFilterRef(
    filterKey: DateFilterKey,
    node: HTMLElement | null,
  ) {
    dateFilterRefs.current[filterKey] = node;
  }

  function createPatchedDraft(lead: LeadItem, targetKey: DateFilterKey) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    let returnAt =
      currentDraft.returnAt || toDatetimeLocal(lead.returnAt) || "";
    let status = currentDraft.status;

    if (targetKey === "today") {
      returnAt = buildTargetDatetimeLocal(
        localDateKeyFromDate(new Date()),
        null,
        12,
        0,
      );
    } else if (targetKey === "overdue") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      returnAt = buildTargetDatetimeLocal(
        localDateKeyFromDate(yesterday),
        returnAt || null,
      );
    } else {
      returnAt = buildTargetDatetimeLocal(
        targetKey.slice("scheduled:".length),
        returnAt || null,
      );
      if (status !== "encerrado" && status !== "qualificado")
        status = "retorno";
    }

    return {
      ...currentDraft,
      status,
      returnAt: toDatetimeLocal(returnAt),
    };
  }

  function applyOptimisticDateMove(
    currentBoard: BoardResponse,
    leadId: string,
    targetKey: DateFilterKey,
    nextDraft: LeadDraft,
  ) {
    const blocks: BoardResponse["blocks"] = {
      overdue: [...currentBoard.blocks.overdue],
      today: [...currentBoard.blocks.today],
      scheduled: [...currentBoard.blocks.scheduled],
      closed: [...currentBoard.blocks.closed],
    };
    let movingLead: LeadItem | null = null;

    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        blocks[blockKey] = blocks[blockKey].filter((lead) => {
          if (lead.id !== leadId) return true;
          movingLead = lead;
          return false;
        });
      },
    );

    if (!movingLead) return currentBoard;

    const patchedLead: LeadItem = {
      ...(movingLead as LeadItem),
      status: nextDraft.status,
      statusLabel: statusLabel(nextDraft.status),
      returnAt: nextDraft.returnAt
        ? new Date(nextDraft.returnAt).toISOString()
        : "",
      updatedAt: new Date().toISOString(),
    };

    if (targetKey === "today") blocks.today.unshift(patchedLead);
    else if (targetKey === "overdue") blocks.overdue.unshift(patchedLead);
    else blocks.scheduled.unshift(patchedLead);

    return { blocks, summary: recomputeSummary(blocks) };
  }

  async function handleDateMove(leadId: string, targetKey: DateFilterKey) {
    if (!board) return;
    const currentRecord = leadById.get(leadId);
    if (!currentRecord || currentRecord.block === "closed") return;

    const currentDateKey =
      currentRecord.block === "scheduled"
        ? (`scheduled:${buildLocalDateKey(currentRecord.lead.returnAt || currentRecord.lead.updatedAt)}` as DateFilterKey)
        : (currentRecord.block as DateFilterKey);
    if (currentDateKey === targetKey) return;

    const previousBoard = board;
    const previousDrafts = drafts;
    const nextDraft = createPatchedDraft(currentRecord.lead, targetKey);
    const optimisticBoard = applyOptimisticDateMove(
      board,
      leadId,
      targetKey,
      nextDraft,
    );

    setBoard(optimisticBoard);
    setDrafts((prev) => ({ ...prev, [leadId]: nextDraft }));
    setSelectedLeadId(leadId);
    setSavingLeadId(leadId);

    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextDraft.status,
          nextAction: nextDraft.nextAction,
          returnAt: nextDraft.returnAt || "",
        }),
      });
      setFeedback("Lead movido na agenda.");
      await loadBoard();
    } catch (moveError) {
      setBoard(previousBoard);
      setDrafts(previousDrafts);
      setError(
        moveError instanceof Error
          ? moveError.message
          : "Falha ao mover o lead na agenda.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }
  async function moveAllLeadsFromSourceToTarget(
    sourceKey: DateFilterKey,
    targetKey: DateFilterKey,
  ) {
    if (!board) return;
    let leadsToMove: LeadItem[] = [];
    if (sourceKey === "overdue") leadsToMove = [...board.blocks.overdue];
    else if (sourceKey === "today") leadsToMove = [...board.blocks.today];
    else if (sourceKey.startsWith("scheduled:")) {
      const iso = sourceKey.slice("scheduled:".length);
      leadsToMove = (board.blocks.scheduled || []).filter(
        (l) => buildLocalDateKey(l.returnAt || l.updatedAt) === iso,
      );
    } else {
      return;
    }

    if (!leadsToMove.length) return;
    const totalMoves = leadsToMove.length;
    const nextDraftByLeadId: Record<string, LeadDraft> = {};
    const failedLeadIds: string[] = [];
    let completedMoves = 0;

    for (const lead of leadsToMove) {
      nextDraftByLeadId[lead.id] = createPatchedDraft(lead, targetKey);
    }

    setError(null);
    setFeedback(`Movendo 0/${totalMoves} retornos...`);
    setSelectedDateKey(targetKey);
    setSelectedLeadId(null);

    const concurrency = Math.min(3, totalMoves);
    let cursor = 0;

    async function moveOneLead(lead: LeadItem) {
      const nextDraft = nextDraftByLeadId[lead.id];
      try {
        await apiFetch(`/vendas/lead/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: nextDraft.status,
            nextAction: nextDraft.nextAction,
            returnAt: nextDraft.returnAt || "",
          }),
        });

        completedMoves += 1;
        setDrafts((prev) => ({ ...prev, [lead.id]: nextDraft }));
        setBoard((currentBoard) =>
          currentBoard
            ? applyOptimisticDateMove(
                currentBoard,
                lead.id,
                targetKey,
                nextDraft,
              )
            : currentBoard,
        );
        setFeedback(
          completedMoves >= totalMoves
            ? `Movidos ${completedMoves} retornos.`
            : `Movendo ${completedMoves}/${totalMoves} retornos...`,
        );
      } catch {
        failedLeadIds.push(lead.id);
      }
    }

    async function worker() {
      while (cursor < leadsToMove.length) {
        const lead = leadsToMove[cursor];
        cursor += 1;
        if (!lead) break;
        await moveOneLead(lead);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    await loadBoard();

    if (failedLeadIds.length) {
      setError(
        failedLeadIds.length === totalMoves
          ? "Falha ao mover os retornos da agenda."
          : `Falha ao mover ${failedLeadIds.length} de ${totalMoves} retornos.`,
      );
      return;
    }

    setFeedback(`Movidos ${totalMoves} retornos.`);
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id || "");
    const isLeadDrag = Boolean(activeId && !activeId.startsWith("date:"));
    setVendasCardDragLock(isLeadDrag);

    if (activeId.startsWith("date:")) {
      setActiveDragDateKey(activeId.slice("date:".length));
      setActiveDragLeadId(null);
    } else {
      setActiveDragLeadId(activeId);
      setActiveDragDateKey(null);
    }
  }

  function handleDragCancel() {
    setVendasCardDragLock(false);
    setActiveDragLeadId(null);
    setActiveDragDateKey(null);
    lastDragEndedAtRef.current = performance.now();
  }

  async function handleDragEnd(event: DragEndEvent) {
    try {
      const activeId = String(event.active.id || "");
      const targetKey = event.over?.id as DateFilterKey | undefined;
      if (!activeId || !targetKey) {
        setActiveDragLeadId(null);
        setActiveDragDateKey(null);
        return;
      }

      if (activeId.startsWith("date:")) {
        setActiveDragLeadId(null);
        setActiveDragDateKey(null);
        const sourceKey = activeId.slice("date:".length) as DateFilterKey;
        if (sourceKey === targetKey) {
          lastDragEndedAtRef.current = performance.now();
          return;
        }
        setPulseDateKey(targetKey);
        await moveAllLeadsFromSourceToTarget(sourceKey, targetKey);
        lastDragEndedAtRef.current = performance.now();
        return;
      }

      const leadId = activeId;
      const record = leadById.get(leadId);
      const draft = record ? drafts[leadId] || createDraft(record.lead) : null;
      const fromRect = leadCardRefs.current[leadId]?.getBoundingClientRect();
      const targetRect =
        dateFilterRefs.current[targetKey]?.getBoundingClientRect();
      if (record && draft && fromRect && targetRect) {
        setFlyAnimation({
          leadId,
          lead: record.lead,
          draft,
          blockKey: record.block,
          from: {
            x: fromRect.left,
            y: fromRect.top,
            width: fromRect.width,
            height: fromRect.height,
          },
          to: {
            x: targetRect.left,
            y: targetRect.top,
            width: targetRect.width,
            height: targetRect.height,
          },
        });
      }
      setActiveDragLeadId(null);
      setActiveDragDateKey(null);
      setPulseDateKey(targetKey);
      await handleDateMove(leadId, targetKey);
      lastDragEndedAtRef.current = performance.now();
    } finally {
      setVendasCardDragLock(false);
    }
  }

  function renderLeadCard(lead: LeadItem, blockKey: LeadBlockKey) {
    const draft = drafts[lead.id] || createDraft(lead);
    const commonProps = {
      lead,
      draft,
      blockKey,
      selected: selectedLeadId === lead.id,
      saving: savingLeadId === lead.id,
      onFocus: () => focusLead(lead.id),
      onQuickAction: (action: string) => void runQuickAction(lead, action),
      onInboxAction: (targetLead: LeadItem) =>
        void handleLeadInboxAction(targetLead),
      onEdit: (id: string | null) => {
        const next = editingLeadId === id ? null : id;
        editingInputActiveRef.current = Boolean(next);
        setEditingLeadId(next);
        if (next) focusLead(next);
      },
      onDraftChange: (leadId: string, patch: Partial<LeadDraft>) =>
        setLeadDraft(leadId, patch),
      onEditingActiveChange: (active: boolean) => {
        editingInputActiveRef.current = active;
      },
      onSave: (leadId: string) => void saveLead(leadId),
      editing: editingLeadId === lead.id,
      bulkSelectionMode,
      bulkSelected: bulkSelectAllAccount || selectedBulkLeadIds.has(lead.id),
      onBulkToggle: (leadId: string) => toggleLeadBulkSelection(leadId),
    };

    if (blockKey === "closed") {
      return <LeadCardView key={lead.id} {...commonProps} />;
    }

    return (
      <DraggableLeadCard
        key={lead.id}
        {...commonProps}
        disabled={false}
        hidden={flyAnimation?.leadId === lead.id}
        register={(node) => registerLeadCardRef(lead.id, node)}
      />
    );
  }

  function renderDetailPanel() {
    if (!selectedLead || !selectedLeadDraft) {
      return (
        <aside className={styles.detailPanel} data-detail-panel="true">
          <div className={styles.detailRail}>
            <span>Fluxo UX: selecione um cliente</span>
            <span className={styles.miniPill}>Operação</span>
          </div>
          <div className={styles.detailEmpty}>
            <span className={styles.panelEyebrow}>Cliente</span>
            <strong>Escolha um card para abrir a lateral.</strong>
            <p>
              O detalhe fica mais estreito e mostra só o que precisa ser operado
              agora.
            </p>
          </div>
        </aside>
      );
    }

    return (
      <aside className={styles.detailPanel} data-detail-panel="true">
        <div className={styles.detailLayout}>
          <section className={styles.timelineSection}>
            <div className={styles.sectionTopline}>
              <div>
                <span className={styles.panelEyebrow}>Timeline</span>
              </div>
              <span className={styles.miniPill}>
                {(selectedLead.timeline || []).length} evento(s)
              </span>
            </div>
            {(selectedLead.timeline || []).length ? (
              <div className={styles.timelineList}>
                {(selectedLead.timeline || []).map((event) => {
                  const isExpanded = expandedTimelineEventId === event.id;
                  const titleText =
                    event.eventType === "return_scheduled"
                      ? "Retorno agendado"
                      : event.title;
                  return (
                    <article
                      key={event.id}
                      className={styles.timelineItem}
                      data-tone={timelineTone(event.eventType)}
                      data-expanded={isExpanded ? "true" : "false"}
                      onClick={() =>
                        setExpandedTimelineEventId(isExpanded ? null : event.id)
                      }
                    >
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineBody}>
                        <div className={styles.timelineTopline}>
                          <strong>{titleText}</strong>
                          <span>
                            {isExpanded
                              ? event.createdAt
                                ? formatDateTime(event.createdAt)
                                : "Agora"
                              : ""}
                          </span>
                        </div>
                        {isExpanded ? (
                          <p>
                            {event.description ||
                              "Movimento comercial registrado."}
                          </p>
                        ) : null}
                        {isExpanded ? (
                          <span className={styles.timelineMeta}>
                            {timelineMeta(event)}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyPanel}>
                <strong>Nenhum evento registrado</strong>
                <p>A timeline aparece conforme o lead é movimentado.</p>
              </div>
            )}
          </section>
        </div>
      </aside>
    );
  }

  function renderPipelineBoard() {
    if (!selectedFilter) {
      return (
        <section className={styles.boardShell}>
          <div className={styles.emptyBoard}>
            <strong>Nenhuma janela de datas disponível</strong>
            <p>Assim que houver agenda, os cards aparecem aqui.</p>
          </div>
        </section>
      );
    }

    const bulkActionDisabled =
      bulkDeleting || (!bulkSelectAllAccount && selectedBulkLeadIds.size === 0);
    const bulkSelectionLabel = bulkSelectAllAccount
      ? "Todos os cards da conta"
      : `${selectedBulkLeadIds.size} selecionado(s)`;

    return (
      <section className={styles.boardShell}>
        <div className={styles.cardsHeader}>
          <div>
            <span className={styles.panelEyebrow}>Clientes</span>
            <h2 className={styles.boardTitle}>{selectedFilter.title}</h2>
            <p className={styles.boardSubtitle}>
              Acompanhe quem você já chamou e quem precisa de retorno.
            </p>
          </div>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight}`}
              onClick={() => setComposerOpen(true)}
            >
              Criar novo Lead
            </button>
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight}`}
              data-active={bulkSelectionMode ? "true" : "false"}
              onClick={toggleBulkSelectionMode}
            >
              {bulkSelectionMode ? "Cancelar seleção" : "Selecionar"}
            </button>
            {bulkSelectionMode ? (
              <>
                <button
                  type="button"
                  className={`${styles.secondaryAction} ${styles.toolbarHighlight}`}
                  data-active={bulkSelectAllAccount ? "true" : "false"}
                  onClick={toggleBulkSelectAll}
                >
                  {bulkSelectAllAccount ? "Limpar todos" : "Selecionar todos"}
                </button>
                <button
                  type="button"
                  className={`${styles.secondaryAction} ${styles.bulkDeleteButton}`}
                  onClick={() => void deleteSelectedLeadsBulk()}
                  disabled={bulkActionDisabled}
                  title="Remove os cards do Vendas sem apagar a base do Radar Digital"
                >
                  {bulkDeleting
                    ? "Excluindo..."
                    : `Excluir em massa (${bulkSelectionLabel})`}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight} ${styles.whatsappFilterButton}`}
              data-active={whatsappFilter !== "all" ? "true" : "false"}
              onClick={() =>
                setWhatsappFilter((current) => nextWhatsappFilter(current))
              }
              aria-pressed={whatsappFilter !== "all"}
              title="Alternar filtro com WhatsApp / sem WhatsApp"
            >
              {WHATSAPP_FILTER_LABELS[whatsappFilter]}
            </button>
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight} ${styles.inboxFilterButton}`}
              data-active={inboxFilter !== "all" ? "true" : "false"}
              onClick={() =>
                setInboxFilter((current) => nextInboxFilter(current))
              }
              aria-pressed={inboxFilter !== "all"}
              title="Alternar filtro de presença no Inbox"
            >
              {INBOX_FILTER_LABELS[inboxFilter]}
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => setShowClosed((current) => !current)}
            >
              {showClosed
                ? "Ocultar arquivo"
                : `Arquivo (${closedLeads.length})`}
            </button>
          </div>
        </div>

        {filteredLeads.length ? (
          <div className={styles.cardsGrid}>
            {filteredLeads.map((lead) =>
              renderLeadCard(lead, selectedFilter.blockKey),
            )}
          </div>
        ) : (
          <div className={styles.emptyBoard}>
            <strong>Sem cards nesta data</strong>
            <p>Nenhum cliente caiu nessa janela ainda.</p>
          </div>
        )}
      </section>
    );
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold
        title="Vendas"
        description="Carregando sessão do CRM comercial."
        hideHeader={true}
      >
        <section className={styles.loadingCard}>
          <div className={styles.skeletonHero} />
          <div className={styles.skeletonBoard} />
        </section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  const activeDragRecord = activeDragLeadId
    ? leadById.get(activeDragLeadId) || null
    : null;
  const activeDragLead = activeDragRecord?.lead || null;
  const activeDragDraft = activeDragLead
    ? drafts[activeDragLead.id] || createDraft(activeDragLead)
    : null;
  const flyStyle = flyAnimation
    ? ({
        ["--fly-start-x" as string]: `${flyAnimation.from.x}px`,
        ["--fly-start-y" as string]: `${flyAnimation.from.y}px`,
        ["--fly-width" as string]: `${flyAnimation.from.width}px`,
        ["--fly-height" as string]: `${flyAnimation.from.height}px`,
        ["--fly-end-x" as string]: `${flyAnimation.to.x + flyAnimation.to.width / 2 - flyAnimation.from.width / 2}px`,
        ["--fly-end-y" as string]: `${flyAnimation.to.y + flyAnimation.to.height / 2 - flyAnimation.from.height / 2}px`,
        ["--fly-scale-x" as string]: `${Math.max(0.28, flyAnimation.to.width / flyAnimation.from.width)}`,
        ["--fly-scale-y" as string]: `${Math.max(0.24, flyAnimation.to.height / flyAnimation.from.height)}`,
      } satisfies CSSProperties)
    : undefined;

  const activeDragDateItem = activeDragDateKey
    ? dateFilters.find((f) => f.key === activeDragDateKey)
    : null;

  const vendasDragTopbarLockStyle = `
html[data-vendas-dragging-card="true"] {
  --topbar-total-height: 0px;
}

html[data-vendas-dragging-card="true"] .app-topbar,
html[data-vendas-dragging-card="true"] .app-topbar__frame,
html[data-vendas-dragging-card="true"] .app-topbar__portal,
html[data-vendas-dragging-card="true"] header[class*="topbar" i],
html[data-vendas-dragging-card="true"] [class*="app-topbar" i] {
  transform: translate3d(0, -140%, 0) !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  transition: none !important;
}

html[data-vendas-dragging-card="true"] .${styles.filterRail} {
  position: sticky;
  top: 0 !important;
  z-index: 2147483000 !important;
  isolation: isolate;
  transform: translateZ(0);
  overflow: visible !important;
  border-color: color-mix(in srgb, var(--brand) 46%, var(--line)) !important;
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--surface-raised) 94%, transparent) inset,
    0 0 0 2px color-mix(in srgb, var(--brand) 18%, transparent),
    0 24px 56px -24px color-mix(in srgb, var(--brand) 34%, transparent),
    0 34px 84px -42px rgba(15, 23, 42, 0.36),
    var(--shadow-inset) !important;
}

html[data-vendas-dragging-card="true"] .${styles.filterRail}::after {
  content: "Solte no filtro de data";
  position: absolute;
  right: 1rem;
  top: -0.72rem;
  z-index: 4;
  padding: 0.22rem 0.58rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--brand) 38%, var(--line));
  background: color-mix(in srgb, var(--surface-raised) 96%, var(--background));
  color: color-mix(in srgb, var(--brand) 88%, var(--foreground));
  box-shadow: 0 14px 28px -18px color-mix(in srgb, var(--brand) 44%, transparent);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
}

html[data-vendas-dragging-card="true"] .${styles.dateFilterCard} {
  pointer-events: auto;
}

html[data-vendas-dragging-card="true"] .${styles.dateFilterCard}[data-dropover="true"] {
  z-index: 2147483001 !important;
  border-color: color-mix(in srgb, var(--brand) 78%, var(--line)) !important;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--brand) 24%, transparent),
    0 30px 58px -26px color-mix(in srgb, var(--brand) 42%, transparent) !important;
}
`;

  return (
    <DashboardScaffold title="Vendas" hideHeader={true}>
      <style dangerouslySetInnerHTML={{ __html: vendasDragTopbarLockStyle }} />
      {renderMobileVendas()}
      <div className={styles.desktopVendasShell}>
        <DndContext
          sensors={sensors}
          collisionDetection={detectDateFilterCollision}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
        <div className={styles.premiumBackdrop}>
          <div className={styles.premiumBg} />
          <div className={styles.page}>
            <section className={styles.filterRail}>
              <div className={styles.filterRailHeader}>
                <div>
                  <span className={styles.panelEyebrow}>Filtro por datas</span>
                  <strong>Agenda comercial</strong>
                </div>
                <div className={styles.filterRailActions}>
                  <Link
                    href="/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas"
                    prefetch={false}
                    className={styles.secondaryAction}
                  >
                    Agenda Vendas
                  </Link>
                </div>
              </div>
              <div className={styles.filterRailCarousel}>
                <button
                  type="button"
                  className={styles.dateRailScrollButton}
                  data-side="left"
                  onClick={() => scrollDateRail(-1)}
                  aria-label="Rolar datas para esquerda"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <div
                  className={styles.filterRailScroller}
                  ref={filterScrollerRef}
                >
                  {dateFilters.map((item) => (
                    <DateDropSlot
                      key={item.key}
                      item={item}
                      active={selectedDateKey === item.key}
                      pulse={pulseDateKey === item.key}
                      dragging={Boolean(activeDragLeadId || activeDragDateKey)}
                      ignoreClick={() =>
                        performance.now() - lastDragEndedAtRef.current < 70
                      }
                      onDateShortcut={() => void handleActiveDateShortcut()}
                      onSelect={() => setSelectedDateKey(item.key)}
                      register={(node) => registerDateFilterRef(item.key, node)}
                    />
                  ))}

                  {/* +Agenda button: rendered after all date cards so it is always last */}
                  <button
                    type="button"
                    className={`${styles.dateFilterCard} ${styles.addAgendaButton}`}
                    aria-label="+Agenda"
                    title="+Agenda"
                    onClick={() => {
                      /* graphical placeholder - no action */
                    }}
                  >
                    <span className={styles.dateFilterDay} />
                    <strong>+</strong>
                    <span />
                    <b />
                    <span className={styles.receiveHint} />
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.dateRailScrollButton}
                  data-side="right"
                  onClick={() => scrollDateRail(1)}
                  aria-label="Rolar datas para direita"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            </section>

            {loading ? (
              <section className={styles.loadingCard}>
                <div className={styles.skeletonBoard} />
              </section>
            ) : (
              <div className={styles.stageGrid}>
                <div className={styles.stageMain}>{renderPipelineBoard()}</div>
                <div className={styles.stageAside}>{renderDetailPanel()}</div>
              </div>
            )}

            {showClosed ? (
              <section
                ref={archiveRef}
                tabIndex={-1}
                className={styles.archiveSection}
                aria-labelledby="archive-heading"
              >
                <div className={styles.sectionTopline}>
                  <div id="archive-heading">
                    <span className={styles.panelEyebrow}>Arquivo</span>
                    <strong>Encerrados</strong>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => setShowClosed(false)}
                  >
                    Ocultar arquivo
                  </button>
                </div>
                {closedLeads.length ? (
                  <div className={styles.cardsGrid}>
                    {closedLeads.map((lead) => renderLeadCard(lead, "closed"))}
                  </div>
                ) : (
                  <div className={styles.emptyPanel}>
                    <strong>Nenhum encerrado ainda</strong>
                    <p>Os cards arquivados aparecem aqui.</p>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragLead && activeDragDraft ? (
            <div className={styles.dragOverlayCard}>
              <LeadCardView
                lead={activeDragLead}
                draft={activeDragDraft}
                blockKey={activeDragRecord?.block || "today"}
                selected={false}
                saving={false}
                onFocus={() => focusLead(activeDragLead.id)}
                onQuickAction={(action) =>
                  void runQuickAction(activeDragLead, action)
                }
                onInboxAction={(targetLead) =>
                  void handleLeadInboxAction(targetLead)
                }
              />
            </div>
          ) : activeDragDateItem ? (
            <div
              className={`${styles.dragOverlayCard} ${styles.dragOverlayDateCard}`}
            >
              <div
                className={styles.dateFilterCard}
                style={{ pointerEvents: "none" }}
              >
                <span className={styles.dateFilterDay}>
                  {activeDragDateItem.dayLabel}
                </span>
                <strong>{activeDragDateItem.title}</strong>
                <span>{activeDragDateItem.subtitle}</span>
                <b>{activeDragDateItem.count}</b>
                <span className={styles.receiveHint}>Mover todos</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>

        {flyAnimation ? (
          <div className={styles.flyCard} style={flyStyle}>
            <LeadCardView
              lead={flyAnimation.lead}
              draft={flyAnimation.draft}
              blockKey={flyAnimation.blockKey}
              selected={false}
              saving={false}
              onFocus={() => {}}
              onQuickAction={() => {}}
              onInboxAction={() => {}}
            />
          </div>
        ) : null}
        </DndContext>
        </div>

      {composerOpen ? createPortal(
        <div
          className={`${styles.systemPopupOverlay} ${styles.systemPopupOverlayActive} ${styles.mobileComposerOverlay}`}
          onClick={() => setComposerOpen(false)}
        >
          <div
            className={`${styles.systemPopupFrame} ${styles.mobileComposerSheet}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-lead-title"
          >
            <div className={styles.systemPopupChrome}>
              <div>
                <p className={styles.systemPopupEyebrow}>Vendas</p>
                <strong id="new-lead-title">Novo lead</strong>
              </div>
              <div className={styles.systemPopupActions}>
                <span className={styles.metaBadge}>Cadastro rápido</span>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm ${styles.mobileComposerClose}`}
                  onClick={() => setComposerOpen(false)}
                  aria-label="Fechar cadastro de lead"
                >
                  <span className={styles.mobileComposerCloseGlyph} aria-hidden="true">
                    ×
                  </span>
                  <span className={styles.mobileComposerCloseText}>Fechar</span>
                </button>
              </div>
            </div>
            <div className={`${styles.systemPopupBody} ${styles.mobileComposerBody}`}>
              <form
                className={styles.composerForm}
                onSubmit={handleCreateManual}
              >
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Nome</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.name}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Ex: Clínica Horizonte"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Telefone</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.phone}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="Ex: (11) 99999-0000"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>E-mail</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.email}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="Opcional"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Retorno</span>
                  <input
                    className={styles.fieldInput}
                    type="datetime-local"
                    value={manualLead.returnAt}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        returnAt: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.fieldWide}>
                  <span className={styles.fieldLabel}>Próxima ação</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.nextAction}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        nextAction: event.target.value,
                      }))
                    }
                    placeholder="Ex: Primeiro contato"
                  />
                </label>
                <label className={styles.fieldWide}>
                  <span className={styles.fieldLabel}>Observação</span>
                  <textarea
                    className={styles.fieldTextarea}
                    rows={4}
                    value={manualLead.shortNote}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        shortNote: event.target.value,
                      }))
                    }
                    placeholder="Contexto rápido do lead."
                  />
                </label>
                <div className={`${styles.formFooter} ${styles.mobileComposerActions}`}>
                  <button
                    type="submit"
                    className={styles.primaryAction}
                    disabled={creatingManual}
                  >
                    {creatingManual ? "Criando..." : "Criar lead"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {accountSheetOpen ? createPortal(
        <div
          className={styles.mobileVendasSheetBackdrop}
          onClick={() => setAccountSheetOpen(false)}
        >
          <section
            className={`${styles.mobileVendasNoteSheet} ${styles.mobileVendasAccountSheet}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-vendas-account-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={styles.mobileVendasSheetHandle} aria-hidden="true" />
            <div className={styles.mobileVendasSheetHeader}>
              <h2 id="mobile-vendas-account-title">Conta</h2>
              <button type="button" onClick={() => setAccountSheetOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <div className={styles.mobileVendasAccountAvatar} aria-hidden="true">
              {(accountProfile?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <label className={styles.mobileVendasAccountField}>
              <span>Como quer ser chamado</span>
              <input
                value={accountNameDraft}
                onChange={(event) => setAccountNameDraft(event.target.value)}
                placeholder="Ex.: Ana"
                maxLength={80}
              />
            </label>
            <button
              type="button"
              className={`${styles.mobileVendasAccountSave} hbx-mobile-primary-button`}
              onClick={() => {
                const trimmed = accountNameDraft.trim();
                saveMobilePreferredCallerName(trimmed);
                setMobilePreferredCallerName(trimmed);
                setAccountSheetOpen(false);
                if (trimmed) setFeedback("Preferência salva.");
              }}
            >
              Salvar
            </button>
            <div className={styles.mobileVendasAccountBlock}>
              <strong>Financeiro</strong>
              <p>
                {accountProfileLoading
                  ? "Carregando..."
                  : accountProfile?.company
                    ? [
                        accountProfile.company.subscriptionStatus &&
                          `Plano: ${accountProfile.company.subscriptionStatus}`,
                        accountProfile.company.paymentStatus &&
                          `Pagamento: ${accountProfile.company.paymentStatus}`,
                        accountProfile.company.premiumAccess ? "Premium ativo" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sem dados de cobrança nesta sessão."
                    : "Não foi possível carregar agora."}
              </p>
            </div>
            <div className={styles.mobileVendasAccountActions}>
              <Link className="hbx-mobile-secondary-button" href="/boasvindas" onClick={() => setAccountSheetOpen(false)}>
                Upgrade
              </Link>
              <Link className="hbx-mobile-primary-button" href="/atendimento" onClick={() => setAccountSheetOpen(false)}>
                Suporte
              </Link>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {commandOpen ? (
        <div
          className="ui-popup-backdrop"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className={styles.commandPalette}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sectionTopline}>
              <div>
                <span className={styles.panelEyebrow}>Command palette</span>
                <strong>Buscar lead, cidade, ação, histórico ou origem</strong>
              </div>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setCommandOpen(false)}
              >
                Fechar
              </button>
            </div>
            <input
              className={styles.commandInput}
              placeholder="Digite nome, telefone, cidade, origem ou próxima ação..."
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              autoFocus
            />
            <div className={styles.commandList}>
              {commandResults.length ? (
                commandResults.map(({ lead, block }) => (
                  <article
                    key={`command-${lead.id}`}
                    className={styles.commandRow}
                  >
                    <button
                      type="button"
                      className={styles.commandMain}
                      onClick={() => focusLead(lead.id)}
                    >
                      <strong>{lead.name || "Lead sem nome"}</strong>
                      <span>
                        {BLOCK_LABELS[block]} • {lead.statusLabel} •{" "}
                        {lead.nextAction || "Sem próxima ação"}
                      </span>
                    </button>
                    <div className={styles.commandActionRow}>
                      <a
                        className={styles.secondaryAction}
                        href={buildCallUrl(lead.phone) || undefined}
                      >
                        Ligar
                      </a>
                      <a
                        className={styles.secondaryAction}
                        href={
                          buildWhatsAppUrl(lead.phone, lead.name) || undefined
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    </div>
                  </article>
                ))
              ) : (
                <div className={styles.emptyPanel}>
                  <strong>Nenhum resultado</strong>
                  <p>Tente nome, telefone, cidade, status ou próxima ação.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DashboardScaffold>
  );
}
