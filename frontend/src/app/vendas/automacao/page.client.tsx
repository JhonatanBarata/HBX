"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { QR_PAIRED_EVENT } from "@/components/QrPairedNextStepPrompt";
import {
  getBotAiPlanRedirectFromError,
  hasBotAi,
  type CommercialPlansPayload,
} from "@/lib/commercial-plans";
import { getProviderCapabilitiesFromWhatsAppCenter } from "@/lib/provider-capabilities";
import type { UserModule } from "@/lib/hbx-modules";
import { dispatchModulesChanged } from "@/lib/module-events";
import {
  HbxAdvancedFilters,
  HbxEngineSelector,
  HbxQuantitySelector,
  HbxSegmentCombobox,
  HbxStateCityPicker,
  HbxTargetTypeSelector,
  type HbxAdvancedFiltersValue,
} from "@/components/prospecting-filters";
import {
  getWhatsAppModalPlanRedirect,
  type WhatsAppCenterPayload,
  type WhatsAppModalPayload,
} from "@/lib/whatsapp-center";
import { apiFetch } from "@/app/_lib/api";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import {
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  normalizeAgendaConfig,
  normalizeBotConfig,
  type AtendimentoAgendaConfig,
  type AtendimentoBotConfig,
} from "../../atendimento/inbox-model";
import ConversationBuilder from "./_components/ConversationBuilder";
import BotQrWorkspace from "./_components/BotQrWorkspace";
import {
  type BotQrWorkspaceTab,
} from "./model";
import styles from "./page.module.css";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

type ProspectingAutomationConfig = {
  city: string;
  state: string;
  segment: string;
  engine: "hbx" | "google";
  targetType: "pj" | "pf" | "agenda_pf";
  messageTemplate: string;
  intervalMinutes: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  dailyLimit: number;
  minLeadBuffer: number;
  desiredLeadBuffer: number;
  maxAttemptsPerLead: number;
  typingSeconds: number;
  typingVarianceSeconds: number;
  positiveIntentKeywords: string[];
  negativeIntentKeywords: string[];
  optOutMessage: string;
  optOutReplyEnabled: boolean;
  websiteFallbackEnabled: boolean;
  filtersJson?: Record<string, unknown>;
};

type ProspectingAutomationLiveStatus = {
  status: "parado" | "buscando" | "importando" | "agendando" | "enviando" | "aguardando" | "dormindo" | "pausado" | "erro";
  text: string;
  active: boolean;
  campaign: (ProspectingAutomationConfig & {
    id: string;
    status: string;
    filtersJson?: Record<string, unknown>;
    optOutReplyEnabled?: boolean;
    lastStatusText?: string | null;
    lastError?: string | null;
  }) | null;
  counters: {
    todayPending?: number;
    overdue?: number;
    future?: number;
    pending?: number;
    sent: number;
    positives?: number;
    interested?: number;
    archived: number;
    failed: number;
    sentToday?: number;
    dailyLimit?: number;
    remainingToday?: number;
    pendingJobs?: number;
    scheduledJobs?: number;
    skippedJobsToday?: number;
    needsReviewCount?: number;
    noWhatsappCount?: number;
    failedJobsToday?: number;
  };
  nextScheduledAt?: string | null;
  sentToday?: number;
  dailyLimit?: number;
  remainingToday?: number;
  nextAllowedSendAt?: string | null;
  cooldownActive?: boolean;
  pendingJobs?: number;
  scheduledJobs?: number;
  skippedJobsToday?: number;
  needsReviewCount?: number;
  noWhatsappCount?: number;
  failedJobsToday?: number;
  lastSkipReason?: string | null;
  lastSuccessfulSendAt?: string | null;
  nextEligibleLeadName?: string | null;
  lastError?: string | null;
};

const DRAFT_STORAGE_KEY = "hbx.vendas.automacao.bot-qrcode.draft.v1";
const BOT_PLAN_HREF = "/planos?intent=bot_ia&from=vendas_automacao";
const PROSPECTING_SCENE_ID = "first_contact_rules_prospeccao";
const PROSPECTING_RULE_CONDITION = "first_contact_rules";
const CAMPAIGN_TYPES = [
  {
    id: "cnpj_local",
    label: "CNPJ local — vender HBX para empresas finais",
  },
  {
    id: "agencias_vendedores",
    label: "Agências/vendedores — achar quem vai usar HBX para prospectar para terceiros",
  },
  {
    id: "servicos_orcamento",
    label: "Serviços com orçamento — empresas que vivem de orçamento e follow-up",
  },
] as const;

type CampaignTypeId = (typeof CAMPAIGN_TYPES)[number]["id"];

const GENERIC_ERROR_MESSAGE_TEMPLATE =
  "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Posso te mandar uma ideia rápida para organizar contatos e retornos no WhatsApp?";

const SAFE_FIRST_CONTACT_VARIANTS = [
  GENERIC_ERROR_MESSAGE_TEMPLATE,
  "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Posso te mostrar uma ideia rápida para organizar retornos no WhatsApp?",
  "Oii, tudo bem? Trabalho com uma ferramenta para organizar contatos e retornos. Posso te explicar em 1 minuto?",
  "Oi! Vi a {{cliente}} e achei que o HBX talvez ajude na organização dos contatos. Posso te mandar uma explicação curta?",
] as const;

const CLICKABLE_FIRST_CONTACT_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com(?:\.br)?|br|net|org|io|app|dev|ai|co|gov|edu|info|biz|me|site|online|store|tech|digital)(?:\/[^\s<>()]*)?/gi;

function sanitizeFirstContactPreview(text: string) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(CLICKABLE_FIRST_CONTACT_PATTERN, "").replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^(cadastre(?:-se)? aqui|acesse|link|clique aqui)\s*:?$/i.test(line))
    .join("\n")
    .trim();
}

function hasFirstContactLink(text: string) {
  CLICKABLE_FIRST_CONTACT_PATTERN.lastIndex = 0;
  return CLICKABLE_FIRST_CONTACT_PATTERN.test(String(text || ""));
}

const MESSAGE_PRESETS = [
  {
    id: "generica_caso_erro",
    group: "cnpj_local",
    label: "Genérica segura",
    segment: "serviços locais",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "local_general",
    group: "cnpj_local",
    label: "Empresa local - geral",
    segment: "serviços locais",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "auto_socorro",
    group: "cnpj_local",
    label: "Auto socorro / guincho",
    segment: "auto socorro",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "energia_solar",
    group: "cnpj_local",
    label: "Energia solar",
    segment: "energia solar",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "limpeza_piscina",
    group: "cnpj_local",
    label: "Limpeza de piscina",
    segment: "limpeza de piscina",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "clinica_estetica",
    group: "cnpj_local",
    label: "Clínica estética",
    segment: "clínicas de estética",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "ar_condicionado",
    group: "cnpj_local",
    label: "Ar condicionado",
    segment: "ar condicionado",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "oficina_mecanica",
    group: "servicos_orcamento",
    label: "Oficina mecânica",
    segment: "oficinas mecânicas",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "orcamento_vidracaria",
    group: "servicos_orcamento",
    label: "Vidraçaria / serralheria / marcenaria",
    segment: "vidraçarias",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "seguranca_eletronica",
    group: "servicos_orcamento",
    label: "Segurança eletrônica",
    segment: "sistemas de segurança",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "odontologia_saude",
    group: "cnpj_local",
    label: "Odontologia / saúde",
    segment: "clínicas odontológicas",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "imobiliaria",
    group: "cnpj_local",
    label: "Imobiliária",
    segment: "imobiliárias",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "provedor_internet",
    group: "cnpj_local",
    label: "Provedor de internet",
    segment: "provedores de internet",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "escola_curso",
    group: "cnpj_local",
    label: "Escola / curso profissionalizante",
    segment: "cursos profissionalizantes",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "loja_moveis",
    group: "servicos_orcamento",
    label: "Loja de móveis / colchões / planejados",
    segment: "lojas de móveis",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "agencia_marketing",
    group: "agencias_vendedores",
    label: "Agência de marketing",
    segment: "agências de marketing",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "gestor_trafego",
    group: "agencias_vendedores",
    label: "Gestor de tráfego / freelancer",
    segment: "gestores de tráfego",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "agencia_revenda",
    group: "agencias_vendedores",
    label: "Agência que quer revender prospecção",
    segment: "agências de marketing",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "representante_comercial",
    group: "agencias_vendedores",
    label: "Vendedor autônomo / representante comercial",
    segment: "representantes comerciais",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "consultoria_comercial",
    group: "agencias_vendedores",
    label: "Consultoria comercial",
    segment: "consultorias empresariais",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "software_house",
    group: "agencias_vendedores",
    label: "Software house / web design",
    segment: "web design",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "servicos_limpeza",
    group: "servicos_orcamento",
    label: "Serviços de limpeza",
    segment: "serviços de limpeza",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
  {
    id: "materiais_construcao",
    group: "servicos_orcamento",
    label: "Materiais de construção",
    segment: "materiais de construção",
    targetType: "pj",
    messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  },
] as const;
const PROSPECTING_VARIABLES = [
  { token: "cliente", label: "Cliente" },
  { token: "empresa", label: "Empresa" },
  { token: "funcionario", label: "Funcionário" },
  { token: "cidade", label: "Cidade" },
  { token: "estado", label: "Estado" },
  { token: "segmento", label: "Segmento" },
];

function getSafePresetFirstContact(presetId: string) {
  const index = Math.abs(
    Array.from(presetId).reduce((sum, char) => sum + char.charCodeAt(0), 0),
  ) % SAFE_FIRST_CONTACT_VARIANTS.length;
  return SAFE_FIRST_CONTACT_VARIANTS[index];
}

const DEFAULT_PROSPECTING_CONFIG: ProspectingAutomationConfig = {
  city: "",
  state: "",
  segment: "",
  engine: "hbx",
  targetType: "pj",
  messageTemplate: GENERIC_ERROR_MESSAGE_TEMPLATE,
  intervalMinutes: 20,
  workingHoursStart: "09:00",
  workingHoursEnd: "17:30",
  minLeadBuffer: 15,
  desiredLeadBuffer: 60,
  maxAttemptsPerLead: 1,
  typingSeconds: 8,
  typingVarianceSeconds: 12,
  positiveIntentKeywords: ["tenho interesse", "pode mandar", "quero saber", "me explica", "quanto custa"],
  dailyLimit: 15,
  negativeIntentKeywords: ["não tenho interesse", "não quero", "remover", "pare", "não me chame", "spam", "bloqueia", "não autorizei"],
  optOutMessage: "Entendi. Vou arquivar este contato e não chamaremos novamente.",
  optOutReplyEnabled: false,
  websiteFallbackEnabled: false,
};

type CurrentUserProfile = {
  id: number;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  company?: {
    id?: number | null;
    name?: string | null;
  } | null;
  masterContext?: {
    active?: boolean | null;
    companyName?: string | null;
  } | null;
};

type ProspectingPreviewVariables = {
  funcionario: string;
  empresa: string;
};

type MobileLeadStatus = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";

type MobileLeadItem = {
  id: string;
  name?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
  city?: string | null;
  state?: string | null;
  status?: MobileLeadStatus | string;
  statusLabel?: string | null;
  nextAction?: string | null;
  returnAt?: string | null;
  shortNote?: string | null;
  lastContactAt?: string | null;
  attemptCount?: number | null;
  closedAt?: string | null;
  updatedAt?: string | null;
  whatsappAvailability?: {
    status?: "unknown" | "available" | "unavailable" | string;
    checkedAt?: string | null;
    message?: string | null;
  } | null;
};

type MobileBoardResponse = {
  summary?: {
    total?: number;
    today?: number;
    overdue?: number;
    scheduled?: number;
    closed?: number;
  };
  blocks?: {
    overdue?: MobileLeadItem[];
    today?: MobileLeadItem[];
    scheduled?: MobileLeadItem[];
    closed?: MobileLeadItem[];
  };
};

type MobileDialPrefs = {
  userDdd: string;
  csp: string;
};

type MobileAgendaTab = "agora" | "atrasados" | "hoje" | "proximos" | "fechados";

const MOBILE_DIAL_PREFS_KEY = "hbx.vendas.mobileDialPrefs.v1";
const DEFAULT_MOBILE_DIAL_PREFS: MobileDialPrefs = { userDdd: "", csp: "15" };

function useSmallViewport(query = "(max-width: 820px)") {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function readMobileDialPrefs(): MobileDialPrefs {
  if (typeof window === "undefined") return DEFAULT_MOBILE_DIAL_PREFS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MOBILE_DIAL_PREFS_KEY) || "null") as Partial<MobileDialPrefs> | null;
    return {
      userDdd: String(parsed?.userDdd || "").replace(/\D/g, "").slice(0, 2),
      csp: String(parsed?.csp || DEFAULT_MOBILE_DIAL_PREFS.csp).replace(/\D/g, "").slice(0, 3) || DEFAULT_MOBILE_DIAL_PREFS.csp,
    };
  } catch {
    return DEFAULT_MOBILE_DIAL_PREFS;
  }
}

function saveMobileDialPrefs(prefs: MobileDialPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOBILE_DIAL_PREFS_KEY, JSON.stringify(prefs));
}

function normalizeBrazilPhoneForMobile(value?: string | null) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function getMobilePhoneParts(lead: MobileLeadItem) {
  const digits = normalizeBrazilPhoneForMobile(lead.phoneNormalized || lead.phone);
  if (digits.length < 10) return { ddd: "", local: digits, national: digits };
  const national = digits.slice(-11).length === 11 ? digits.slice(-11) : digits.slice(-10);
  return {
    ddd: national.slice(0, 2),
    local: national.slice(2),
    national,
  };
}

function buildMobileWhatsAppHref(lead: MobileLeadItem) {
  const parts = getMobilePhoneParts(lead);
  if (!parts.ddd || !parts.local) return "";
  return `https://wa.me/55${parts.ddd}${parts.local}`;
}

function buildMobileCallHref(lead: MobileLeadItem, prefs: MobileDialPrefs) {
  const parts = getMobilePhoneParts(lead);
  if (!parts.ddd || !parts.local) return "";
  const userDdd = String(prefs.userDdd || "").replace(/\D/g, "").slice(0, 2);
  const csp = String(prefs.csp || "").replace(/\D/g, "");
  if (userDdd && parts.ddd === userDdd) return `tel:${parts.local}`;
  return `tel:0${csp}${parts.ddd}${parts.local}`;
}

function mobileDateMs(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function compareMobileClosedLeads(left: MobileLeadItem, right: MobileLeadItem) {
  return mobileDateMs(right.updatedAt || right.lastContactAt) - mobileDateMs(left.updatedAt || left.lastContactAt);
}

function mobileReturnLabel(lead: MobileLeadItem) {
  if (!lead.returnAt) return "Entrou na fila de hoje";
  const parsed = new Date(lead.returnAt);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return parsed.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function mobileOverdueText(lead: MobileLeadItem) {
  const parsed = new Date(String(lead.returnAt || ""));
  if (Number.isNaN(parsed.getTime())) return "Atrasado";
  const diffMs = Date.now() - parsed.getTime();
  const hours = Math.max(1, Math.floor(diffMs / 36e5));
  if (hours < 24) return `Atrasado há ${hours}h`;
  if (hours < 48) return "Atrasado desde ontem";
  return `Atrasado há ${Math.floor(hours / 24)} dias`;
}

function mobileWhatsappStatusLabel(lead: MobileLeadItem) {
  const status = String(lead.whatsappAvailability?.status || "unknown").toLowerCase();
  if (status === "available") return "confirmado";
  if (status === "unavailable") return "sem WhatsApp";
  return "não confirmado";
}

function mobileLeadLocation(lead: MobileLeadItem) {
  const city = String(lead.city || "").trim();
  const state = String(lead.state || "").trim().toUpperCase();
  if (city && state) return `${city}/${state}`;
  return city || state || "Cidade/UF não informada";
}

function flattenMobileBoard(board: MobileBoardResponse | null) {
  const blocks = board?.blocks || {};
  return [
    ...(blocks.overdue || []),
    ...(blocks.today || []),
    ...(blocks.scheduled || []),
  ];
}

function getLeadReturnDate(lead: MobileLeadItem) {
  if (!lead.returnAt) return null;
  const parsed = new Date(lead.returnAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function getStartOfTomorrow() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

function isLeadOverdue(lead: MobileLeadItem) {
  const date = getLeadReturnDate(lead);
  if (!date) return false;
  return date.getTime() < getStartOfToday().getTime();
}

function isLeadToday(lead: MobileLeadItem) {
  const date = getLeadReturnDate(lead);
  if (!date) return true;
  return date.getTime() >= getStartOfToday().getTime() && date.getTime() < getStartOfTomorrow().getTime();
}

function isLeadUpcoming(lead: MobileLeadItem) {
  const date = getLeadReturnDate(lead);
  if (!date) return false;
  return date.getTime() >= getStartOfTomorrow().getTime();
}

function leadUrgencyLabel(lead: MobileLeadItem) {
  const date = getLeadReturnDate(lead);
  if (!date) return "Hoje";
  const now = new Date();
  if (date.getTime() < now.getTime()) {
    const diffHours = Math.max(1, Math.round((now.getTime() - date.getTime()) / 36e5));
    if (diffHours < 24) return `Atrasado há ${diffHours}h`;
    return "Atrasado";
  }
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortMobileAgendaLeads(leads: MobileLeadItem[]) {
  return [...leads].sort((a, b) => {
    const aOverdue = isLeadOverdue(a) ? 0 : 1;
    const bOverdue = isLeadOverdue(b) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const aAgendaRank = isLeadToday(a) ? 0 : isLeadUpcoming(a) ? 1 : 2;
    const bAgendaRank = isLeadToday(b) ? 0 : isLeadUpcoming(b) ? 1 : 2;
    if (aAgendaRank !== bAgendaRank) return aAgendaRank - bAgendaRank;
    const aDate = getLeadReturnDate(a)?.getTime() || 0;
    const bDate = getLeadReturnDate(b)?.getTime() || 0;
    if (aDate !== bDate) return aDate - bDate;
    const aWhatsapp = String(a.whatsappAvailability?.status || "unknown") === "available" ? 0 : 1;
    const bWhatsapp = String(b.whatsappAvailability?.status || "unknown") === "available" ? 0 : 1;
    if (aWhatsapp !== bWhatsapp) return aWhatsapp - bWhatsapp;
    return Number(a.attemptCount || 0) - Number(b.attemptCount || 0);
  });
}

function resolveRecommendedLead(board: MobileBoardResponse | null) {
  const leads = flattenMobileBoard(board);
  return sortMobileAgendaLeads(leads).find((lead) => String(lead.status || "") !== "encerrado") || null;
}

function patchLeadInMobileBoard(
  board: MobileBoardResponse | null,
  leadId: string,
  patch: Partial<MobileLeadItem>,
) {
  if (!board?.blocks) return board;
  const patchLead = (lead: MobileLeadItem) => (lead.id === leadId ? { ...lead, ...patch } : lead);
  return {
    ...board,
    blocks: {
      ...board.blocks,
      overdue: board.blocks.overdue?.map(patchLead),
      today: board.blocks.today?.map(patchLead),
      scheduled: board.blocks.scheduled?.map(patchLead),
      closed: board.blocks.closed?.map(patchLead),
    },
  };
}

function MobileAgendaLeadRow({
  lead,
  dialPrefs,
  onOpen,
  onOpenNote,
  onCall,
  onWhatsapp,
}: {
  lead: MobileLeadItem;
  dialPrefs: MobileDialPrefs;
  onOpen: () => void;
  onOpenNote: () => void;
  onCall: () => void;
  onWhatsapp: () => void;
}) {
  const whatsappHref = buildMobileWhatsAppHref(lead);
  const callHref = buildMobileCallHref(lead, dialPrefs);
  const whatsappStatus = mobileWhatsappStatusLabel(lead);
  return (
    <article className={styles.mobileAgendaLeadRow} data-overdue={isLeadOverdue(lead) ? "true" : "false"}>
      <button type="button" className={styles.mobileAgendaLeadMain} onClick={onOpen}>
        <div>
          <strong>{lead.name || "Lead sem nome"}</strong>
          <span>{mobileLeadLocation(lead)}</span>
        </div>
        <em>{leadUrgencyLabel(lead)}</em>
      </button>
      <div className={styles.mobileAgendaLeadMeta}>
        <span>{lead.statusLabel || lead.status || "Novo lead"}</span>
        <span>{whatsappStatus}</span>
        <span>{lead.nextAction || "Sem próxima ação"}</span>
      </div>
      {lead.shortNote ? (
        <p className={styles.mobileAgendaNotePreview}>{lead.shortNote}</p>
      ) : null}
      <div className={styles.mobileAgendaLeadActions}>
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); onWhatsapp(); }}>
            WhatsApp
          </a>
        ) : (
          <button type="button" disabled>WhatsApp</button>
        )}
        {callHref ? (
          <a href={callHref} onClick={(event) => { event.preventDefault(); onCall(); }}>
            Ligar
          </a>
        ) : (
          <button type="button" disabled>Ligar</button>
        )}
        <button type="button" onClick={onOpenNote}>Observação</button>
      </div>
    </article>
  );
}

function MobileAgendaSheet({
  board,
  activeTab,
  onTabChange,
  onClose,
  onOpenNote,
  onOpenLead,
  onCallLead,
  onWhatsappLead,
  dialPrefs,
}: {
  board: MobileBoardResponse | null;
  activeTab: MobileAgendaTab;
  onTabChange: (tab: MobileAgendaTab) => void;
  onClose: () => void;
  onOpenNote: (lead: MobileLeadItem) => void;
  onOpenLead: (lead: MobileLeadItem) => void;
  onCallLead: (lead: MobileLeadItem) => void;
  onWhatsappLead: (lead: MobileLeadItem) => void;
  dialPrefs: MobileDialPrefs;
}) {
  const blocks = board?.blocks || {};
  const all = useMemo(() => flattenMobileBoard(board), [board]);
  const agendaCounts = useMemo(() => {
    const overdue = blocks.overdue?.length || 0;
    const today = blocks.today?.length || 0;
    const scheduled = blocks.scheduled?.length || 0;
    const closed = blocks.closed?.length || 0;
    return {
      agora: overdue + today,
      atrasados: overdue,
      hoje: today,
      proximos: scheduled,
      fechados: closed,
      active: overdue + today + scheduled,
    };
  }, [blocks.closed, blocks.overdue, blocks.scheduled, blocks.today]);
  const leads = useMemo(() => {
    if (activeTab === "atrasados") return sortMobileAgendaLeads(blocks.overdue || []);
    if (activeTab === "hoje") return sortMobileAgendaLeads(blocks.today || []);
    if (activeTab === "proximos") return sortMobileAgendaLeads(blocks.scheduled || []);
    if (activeTab === "fechados") return [...(blocks.closed || [])].sort(compareMobileClosedLeads);
    return sortMobileAgendaLeads(all);
  }, [activeTab, all, blocks.closed, blocks.overdue, blocks.scheduled, blocks.today]);
  const nextLead = resolveRecommendedLead(board);

  return (
    <div className={styles.mobileSheetOverlay} role="dialog" aria-modal="true">
      <button className={styles.mobileSheetBackdrop} type="button" onClick={onClose} aria-label="Fechar agenda" />
      <section className={styles.mobileAgendaSheet}>
        <div className={styles.mobileSheetHandle} />
        <header className={styles.mobileSheetHeader}>
          <div>
            <span>Central mobile</span>
            <strong>Agenda de Cards</strong>
            <small>
              {agendaCounts.active.toLocaleString("pt-BR")} ativos · {agendaCounts.atrasados.toLocaleString("pt-BR")} atrasados
            </small>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        {nextLead ? (
          <button type="button" className={styles.mobileNextLead} onClick={() => onOpenLead(nextLead)}>
            <span>Próximo card recomendado</span>
            <strong>{nextLead.name || "Lead sem nome"}</strong>
            <small>{leadUrgencyLabel(nextLead)} · {nextLead.nextAction || "Executar contato"}</small>
          </button>
        ) : null}
        <nav className={styles.mobileAgendaTabs}>
          {[
            ["agora", "Agora", agendaCounts.agora],
            ["atrasados", "Atrasados", agendaCounts.atrasados],
            ["hoje", "Hoje", agendaCounts.hoje],
            ["proximos", "Próximos", agendaCounts.proximos],
            ["fechados", "Fechados", agendaCounts.fechados],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-active={activeTab === id ? "true" : "false"}
              onClick={() => onTabChange(id as MobileAgendaTab)}
            >
              {label}<span>{Number(agendaCounts[id as MobileAgendaTab] || 0).toLocaleString("pt-BR")}</span>
            </button>
          ))}
        </nav>
        <div className={styles.mobileAgendaList}>
          {leads.length ? leads.map((lead) => (
            <MobileAgendaLeadRow
              key={lead.id}
              lead={lead}
              dialPrefs={dialPrefs}
              onOpen={() => onOpenLead(lead)}
              onOpenNote={() => onOpenNote(lead)}
              onCall={() => onCallLead(lead)}
              onWhatsapp={() => onWhatsappLead(lead)}
            />
          )) : (
            <div className={styles.mobileAgendaEmpty}>Nenhum card nesta agenda.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function MobileVendasProspecaoV2({
  notice,
  error,
  setNotice,
  setError,
}: {
  notice: NoticeState | null;
  error: string | null;
  setNotice: (notice: NoticeState | null) => void;
  setError: (error: string | null) => void;
}) {
  const [mobileLoading, setMobileLoading] = useState(true);
  const [mobileBoard, setMobileBoard] = useState<MobileBoardResponse | null>(null);
  const [mobileActionLeadId, setMobileActionLeadId] = useState<string | null>(null);
  const [mobileSavingLeadId, setMobileSavingLeadId] = useState<string | null>(null);
  const [mobilePrefs, setMobilePrefs] = useState<MobileDialPrefs>(() => readMobileDialPrefs());
  const [mobileAgendaOpen, setMobileAgendaOpen] = useState(false);
  const [mobileAgendaTab, setMobileAgendaTab] = useState<MobileAgendaTab>("agora");
  const [mobileLeadSearch, setMobileLeadSearch] = useState("");
  const [mobileDialConfigOpen, setMobileDialConfigOpen] = useState(false);
  const [mobileNoteLead, setMobileNoteLead] = useState<MobileLeadItem | null>(null);
  const [mobileNoteDraft, setMobileNoteDraft] = useState("");
  const [mobileSelectedLeadId, setMobileSelectedLeadId] = useState<string | null>(null);

  const loadMobileBoard = useCallback(async () => {
    setMobileLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<MobileBoardResponse>("/vendas/board", { timeoutMs: 15000 });
      setMobileBoard(payload || null);
    } catch (boardError) {
      setError(boardError instanceof Error ? boardError.message : "Falha ao carregar cards de Vendas.");
    } finally {
      setMobileLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    saveMobileDialPrefs(mobilePrefs);
  }, [mobilePrefs]);

  useEffect(() => {
    void loadMobileBoard();
  }, [loadMobileBoard]);

  const mobileLeads = useMemo(() => flattenMobileBoard(mobileBoard), [mobileBoard]);
  const selectedMobileLead = useMemo(
    () => mobileLeads.find((lead) => lead.id === mobileSelectedLeadId) || null,
    [mobileLeads, mobileSelectedLeadId],
  );
  const mobileAgenda = useMemo(() => {
    const blocks = mobileBoard?.blocks || {};
    const overdue = sortMobileAgendaLeads(blocks.overdue || []);
    const today = sortMobileAgendaLeads(blocks.today || []);
    const scheduled = sortMobileAgendaLeads(blocks.scheduled || []);
    const closed = [...(blocks.closed || [])].sort(compareMobileClosedLeads);
    const now = [...overdue, ...today];
    return { now, overdue, today, scheduled, closed };
  }, [mobileBoard]);
  const patchMobileLead = useCallback(async (
    lead: MobileLeadItem,
    patch: Record<string, unknown>,
    options: { reload?: boolean; successText?: string; errorText?: string } = {},
  ) => {
    setMobileSavingLeadId(lead.id);
    setError(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMobileBoard((current) => patchLeadInMobileBoard(current, lead.id, patch as Partial<MobileLeadItem>));
      if (options.reload !== false) await loadMobileBoard();
      setNotice({ tone: "success", text: options.successText || "Card atualizado." });
      return true;
    } catch (updateError) {
      const message = options.errorText || (updateError instanceof Error ? updateError.message : "Falha ao atualizar o card.");
      setError(message);
      setNotice({ tone: "error", text: message });
      return false;
    } finally {
      setMobileSavingLeadId(null);
    }
  }, [loadMobileBoard, setError, setNotice]);

  const registerMobileAttempt = useCallback(async (lead: MobileLeadItem, channel: string) => {
    setMobileSavingLeadId(lead.id);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/attempt`, {
        method: "POST",
        body: JSON.stringify({ channel }),
      });
      await loadMobileBoard();
    } catch {
      setNotice({ tone: "error", text: "A tentativa abriu no celular, mas não foi registrada no histórico." });
    } finally {
      setMobileSavingLeadId(null);
    }
  }, [loadMobileBoard, setNotice]);

  function handleMobileCall(lead: MobileLeadItem) {
    const href = buildMobileCallHref(lead, mobilePrefs);
    if (!href) {
      setNotice({ tone: "error", text: "Este card não tem telefone válido para ligação." });
      return;
    }
    setMobileActionLeadId(lead.id);
    void registerMobileAttempt(lead, "ligacao");
    window.location.href = href;
  }

  function handleMobileWhatsapp(lead: MobileLeadItem) {
    const href = buildMobileWhatsAppHref(lead);
    if (!href) {
      setNotice({ tone: "error", text: "Este card não tem WhatsApp válido." });
      return;
    }
    void registerMobileAttempt(lead, "whatsapp");
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function openMobileNote(lead: MobileLeadItem) {
    setMobileNoteLead(lead);
    setMobileNoteDraft(String(lead.shortNote || ""));
  }

  function openMobileLeadDetail(lead: MobileLeadItem) {
    setMobileSelectedLeadId(lead.id);
    setMobileNoteLead(null);
    setMobileNoteDraft(String(lead.shortNote || ""));
  }

  function closeMobileLeadDetail() {
    setMobileSelectedLeadId(null);
    setMobileNoteLead(null);
    setMobileNoteDraft("");
  }

  async function saveMobileNote() {
    const leadToSave = mobileNoteLead || selectedMobileLead;
    if (!leadToSave) return;
    const noteValue = mobileNoteDraft.trim() || null;
    const saved = await patchMobileLead(
      leadToSave,
      { shortNote: noteValue },
      {
        reload: false,
        successText: "Observação salva.",
        errorText: "Não foi possível salvar a observação.",
      },
    );
    if (!saved) return;
    setMobileNoteLead((current) => current ? { ...current, shortNote: noteValue } : current);
    if (!selectedMobileLead) {
      setMobileNoteLead(null);
      setMobileNoteDraft("");
    }
  }

  const summary = mobileBoard?.summary || {};
  const mobileLeadSearchText = mobileLeadSearch.trim().toLowerCase();
  const visibleMobileLeads = [...mobileAgenda.overdue, ...mobileAgenda.today, ...mobileAgenda.scheduled].filter((lead) => {
    if (!mobileLeadSearchText) return true;
    return [
      lead.name,
      lead.city,
      lead.state,
      lead.statusLabel,
      lead.nextAction,
      lead.shortNote,
    ].filter(Boolean).join(" ").toLowerCase().includes(mobileLeadSearchText);
  });

  const renderMobileLeadCard = (lead: MobileLeadItem, bucket: MobileAgendaTab) => {
    const saving = mobileSavingLeadId === lead.id;
    const whatsappStatus = mobileWhatsappStatusLabel(lead);
    const isOverdue = bucket === "atrasados";
    const isClosed = bucket === "fechados";
    const dataBucket = isOverdue ? "overdue" : bucket === "proximos" ? "scheduled" : isClosed ? "closed" : "today";
    return (
      <article
        id={`mobile-lead-${lead.id}`}
        key={lead.id}
        className={styles.mobileSalesCard}
        data-bucket={dataBucket}
        data-active={mobileActionLeadId === lead.id ? "true" : "false"}
        role="button"
        tabIndex={0}
        onClick={() => openMobileLeadDetail(lead)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openMobileLeadDetail(lead);
          }
        }}
      >
        <div className={styles.mobileLeadAvatar} aria-hidden>{lead.name?.trim()?.charAt(0)?.toUpperCase() || "H"}</div>
        <div className={styles.mobileSalesCardTop}>
          <div>
            <strong>{lead.name || "Lead sem nome"}</strong>
            <span>{mobileLeadLocation(lead)}</span>
          </div>
          <button type="button" aria-label="Abrir observação" onClick={(event) => { event.stopPropagation(); openMobileNote(lead); }} disabled={saving}>
            •••
          </button>
        </div>
        <div className={styles.mobileLeadStatusLine}>
          <em data-status={whatsappStatus}>{whatsappStatus}</em>
          <span>Retorno <strong>{isOverdue ? mobileOverdueText(lead) : mobileReturnLabel(lead)}</strong></span>
        </div>
        <div className={styles.mobileLeadNextAction}>
          <small>Próxima ação</small>
          <strong>{lead.nextAction || "Ligação de apresentação"}</strong>
        </div>
        <div className={styles.mobileLeadContactActions}>
          <button type="button" data-whatsapp="true" onClick={(event) => { event.stopPropagation(); handleMobileWhatsapp(lead); }} disabled={saving || isClosed} aria-label="WhatsApp">
            W
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); handleMobileCall(lead); }} disabled={saving || isClosed} aria-label="Ligar">
            ☎
          </button>
        </div>
        <button type="button" className={styles.mobileLeadPrimaryAction} onClick={(event) => { event.stopPropagation(); openMobileLeadDetail(lead); }} disabled={saving || isClosed}>
          Abrir card
        </button>
      </article>
    );
  };

  const renderMobileLeadDetail = (lead: MobileLeadItem) => {
    const saving = mobileSavingLeadId === lead.id;
    const whatsappStatus = mobileWhatsappStatusLabel(lead);
    const isClosed = Boolean(lead.closedAt || String(lead.status || "").toLowerCase() === "encerrado");

    return (
      <section className={styles.mobileLeadDetailScreen}>
        <header className={styles.mobileLeadDetailHeader}>
          <button type="button" className={styles.mobileLeadBackButton} onClick={closeMobileLeadDetail}>
            Voltar
          </button>
          <div>
            <span>Detalhe do lead</span>
            <strong>{lead.name || "Lead sem nome"}</strong>
          </div>
        </header>

        <div className={styles.mobileLeadDetailBody}>
          {notice ? <section className={styles.mobileSalesNotice} data-tone={notice.tone}>{notice.text}</section> : null}
          {error ? <section className={styles.mobileSalesNotice} data-tone="error">{error}</section> : null}

          <section className={styles.mobileLeadDetailHero}>
            <div className={styles.mobileLeadAvatar} aria-hidden>{lead.name?.trim()?.charAt(0)?.toUpperCase() || "H"}</div>
            <div>
              <strong>{lead.name || "Lead sem nome"}</strong>
              <span>{mobileLeadLocation(lead)}</span>
            </div>
            <em data-status={whatsappStatus}>{whatsappStatus}</em>
          </section>

          <section className={styles.mobileLeadDetailInfoGrid}>
            <span><b>Retorno</b>{isLeadOverdue(lead) ? mobileOverdueText(lead) : mobileReturnLabel(lead)}</span>
            <span><b>Status</b>{lead.statusLabel || lead.status || "Novo lead"}</span>
            <span><b>Tentativas</b>{Number(lead.attemptCount || 0).toLocaleString("pt-BR")}</span>
            <span><b>Telefone</b>{getMobilePhoneParts(lead).national || "Não informado"}</span>
          </section>

          <section className={styles.mobileLeadNextAction}>
            <small>Próxima ação</small>
            <strong>{lead.nextAction || "Ligação de apresentação"}</strong>
          </section>

          <section className={styles.mobileDialPreview}>
            <span>Mensagem pronta</span>
            <strong>{lead.nextAction || "Contato inicial pelo WhatsApp"}</strong>
          </section>

          <section className={styles.mobileLeadDetailInfoGrid}>
            <span><b>Último contato</b>{lead.lastContactAt ? new Date(lead.lastContactAt).toLocaleString("pt-BR") : "Sem registro"}</span>
            <span><b>Atualizado</b>{lead.updatedAt ? new Date(lead.updatedAt).toLocaleString("pt-BR") : "Sem registro"}</span>
          </section>

          <section id="mobile-lead-note" className={styles.mobileNoteInline} aria-label="Observação do lead">
            <div>
              <strong>Observação</strong>
              <span>{mobileNoteDraft.length.toLocaleString("pt-BR")}/280</span>
            </div>
            <textarea
              value={mobileNoteDraft}
              onChange={(event) => setMobileNoteDraft(event.target.value)}
              placeholder="Digite uma observação sobre este lead..."
              maxLength={280}
            />
            <button type="button" onClick={() => void saveMobileNote()} disabled={saving}>
              {saving ? "Salvando..." : "Salvar observação"}
            </button>
          </section>
        </div>

        <nav className={styles.mobileLeadDetailActionBar} aria-label="Ações do lead">
          <button type="button" data-whatsapp="true" onClick={() => handleMobileWhatsapp(lead)} disabled={saving || isClosed}>
            WhatsApp
          </button>
          <button type="button" onClick={() => handleMobileCall(lead)} disabled={saving || isClosed}>
            Ligar
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("mobile-lead-note")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            disabled={saving}
          >
            Observação
          </button>
        </nav>
      </section>
    );
  };

  return (
    <div className={styles.mobileSalesShell}>
      {selectedMobileLead ? renderMobileLeadDetail(selectedMobileLead) : (
      <div className={styles.mobileLeadListScreen}>
      <header className={styles.mobileSalesHeader}>
        <strong>Vendas</strong>
        <div>
          <button type="button" aria-label="Notificações">♧</button>
          <button type="button" aria-label="Configurar filtros" onClick={() => setMobileDialConfigOpen((current) => !current)}>☷</button>
        </div>
      </header>

      <section className={styles.mobileAgendaHero} aria-label="Resumo da agenda mobile">
        <button type="button" className={styles.mobileAgendaMetric} onClick={() => { setMobileAgendaTab("atrasados"); setMobileAgendaOpen(true); }} data-tone="danger">
          <span>Atrasados</span>
          <strong>{Number(summary.overdue || 0).toLocaleString("pt-BR")}</strong>
          <small>Precisam de ação</small>
        </button>
        <button type="button" className={styles.mobileAgendaMetric} onClick={() => { setMobileAgendaTab("hoje"); setMobileAgendaOpen(true); }} data-tone="blue">
          <span>Hoje</span>
          <strong>{Number(summary.today || 0).toLocaleString("pt-BR")}</strong>
          <small>Agendados para hoje</small>
        </button>
        <button type="button" className={styles.mobileAgendaMetric} onClick={() => { setMobileAgendaTab("proximos"); setMobileAgendaOpen(true); }} data-tone="success">
          <span>Próximos</span>
          <strong>{Number(summary.scheduled || 0).toLocaleString("pt-BR")}</strong>
          <small>Futuros</small>
        </button>
      </section>

      {mobileDialConfigOpen ? (
        <section className={styles.mobileDialPrefs} aria-label="Configuração de ligação">
          <label>
            <span>Seu DDD</span>
            <input
              inputMode="numeric"
              value={mobilePrefs.userDdd}
              onChange={(event) => setMobilePrefs((current) => ({ ...current, userDdd: event.target.value.replace(/\D/g, "").slice(0, 2) }))}
              placeholder="11"
            />
          </label>
          <label>
            <span>Operadora/CSP</span>
            <select
              value={mobilePrefs.csp}
              onChange={(event) => setMobilePrefs((current) => ({ ...current, csp: event.target.value }))}
            >
              <option value="15">Vivo 15</option>
              <option value="21">Claro/NET 21</option>
              <option value="41">TIM 41</option>
              <option value="31">Oi 31</option>
              <option value="14">Brasil Telecom 14</option>
            </select>
          </label>
        </section>
      ) : null}

      <section className={styles.mobileSalesSearchRow} aria-label="Busca de leads">
        <label>
          <span>Buscar leads</span>
          <input
            value={mobileLeadSearch}
            onChange={(event) => setMobileLeadSearch(event.target.value)}
            placeholder="Buscar por nome, cidade ou status"
          />
        </label>
        <button type="button" onClick={() => void loadMobileBoard()} disabled={mobileLoading} aria-label="Atualizar cards">
          ☷
        </button>
      </section>

      {notice ? <section className={styles.mobileSalesNotice} data-tone={notice.tone}>{notice.text}</section> : null}
      {error ? <section className={styles.mobileSalesNotice} data-tone="error">{error}</section> : null}

      {mobileLoading ? (
        <section className={styles.mobileSalesLoading} aria-live="polite">
          <div className={styles.mobileSalesLoadingRing}>
            <strong>HBX</strong>
          </div>
          <div>
            <span>Sincronizando Vendas</span>
            <strong>Montando sua agenda em tempo real</strong>
            <p>Buscando cards, retornos e prioridades da operação.</p>
          </div>
          <div className={styles.mobileSalesLoadingSteps} aria-hidden>
            <i />
            <i />
            <i />
          </div>
        </section>
      ) : mobileLeads.length ? (
        <section className={styles.mobileSalesQueue}>
          {visibleMobileLeads.map((lead) => {
            const bucket = mobileAgenda.overdue.some((item) => item.id === lead.id)
              ? "atrasados"
              : mobileAgenda.scheduled.some((item) => item.id === lead.id)
                ? "proximos"
                : "hoje";
            return renderMobileLeadCard(lead, bucket);
          })}
        </section>
      ) : (
        <section className={styles.mobileSalesEmpty}>
          Nenhum card disponível. Volte ao Radar Digital para buscar novos contatos.
        </section>
      )}

      {mobileAgendaOpen ? (
        <MobileAgendaSheet
          board={mobileBoard}
          activeTab={mobileAgendaTab}
          onTabChange={setMobileAgendaTab}
          onClose={() => setMobileAgendaOpen(false)}
          onOpenNote={openMobileNote}
          onCallLead={handleMobileCall}
          onWhatsappLead={handleMobileWhatsapp}
          onOpenLead={(lead) => {
            setMobileAgendaOpen(false);
            openMobileLeadDetail(lead);
          }}
          dialPrefs={mobilePrefs}
        />
      ) : null}

      {mobileNoteLead ? (
        <div className={styles.mobileSheetOverlay} onClick={() => !mobileSavingLeadId && setMobileNoteLead(null)}>
          <section className={styles.mobileNoteSheet} role="dialog" aria-modal="true" aria-label="Observação" onClick={(event) => event.stopPropagation()}>
            <div className={styles.mobileSheetHandle} />
            <header className={styles.mobileAgendaHeader}>
              <div>
                <strong>Observação</strong>
                <span>{mobileNoteLead.name || "Lead sem nome"} · {mobileLeadLocation(mobileNoteLead)}</span>
              </div>
              <button type="button" onClick={() => setMobileNoteLead(null)} disabled={Boolean(mobileSavingLeadId)}>Cancelar</button>
            </header>
            <textarea
              value={mobileNoteDraft}
              onChange={(event) => setMobileNoteDraft(event.target.value)}
              placeholder="Digite uma observação sobre este lead..."
              maxLength={280}
            />
            <div className={styles.mobileNoteActions}>
              <button type="button" onClick={() => setMobileNoteLead(null)} disabled={Boolean(mobileSavingLeadId)}>Cancelar</button>
              <button type="button" onClick={() => void saveMobileNote()} disabled={Boolean(mobileSavingLeadId)}>
                {mobileSavingLeadId ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <nav className={styles.mobileBottomNav} aria-label="Navegação mobile de Vendas">
        <button type="button" data-active="true" onClick={() => { setMobileAgendaTab("agora"); setMobileAgendaOpen(true); }}><span>▣</span>Agenda</button>
        <Link href="/vendas"><span>♙</span>Leads</Link>
        <Link href="/radar-digital" data-main="true">+</Link>
        <Link href="/dashboard/vendas"><span>▤</span>Relatórios</Link>
        <button type="button" onClick={() => setMobileDialConfigOpen((current) => !current)}><span>•••</span>Mais</button>
      </nav>
      </div>
      )}
    </div>
  );
}

function renderProspectingPreview(
  template: string,
  config: ProspectingAutomationConfig,
  variables: ProspectingPreviewVariables,
) {
  const values: Record<string, string> = {
    cliente: "Cliente Modelo",
    empresa: variables.empresa,
    funcionario: variables.funcionario,
    cidade: config.city || "sua região",
    estado: config.state || "BR",
    segmento: config.segment || "seu segmento",
  };
  return String(template || "")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => values[token] || `[${token}]`)
    .trim();
}

function shouldLoadModalQr(nextPayload: WhatsAppModalPayload | null, includeQr: boolean) {
  if (!includeQr || !nextPayload?.data.available) return false;
  return nextPayload.status !== "connected";
}

function mergeModalPayload(
  statusPayload: WhatsAppModalPayload,
  qrPayload: WhatsAppModalPayload,
): WhatsAppModalPayload {
  if (qrPayload.data.qrCodeDataUrl || qrPayload.status === "connected") {
    return {
      ...qrPayload,
      data: {
        ...statusPayload.data,
        ...qrPayload.data,
      },
    };
  }

  return {
    ...statusPayload,
    data: {
      ...statusPayload.data,
      updatedAt: qrPayload.data.updatedAt || statusPayload.data.updatedAt,
      lastError: qrPayload.data.lastError || statusPayload.data.lastError,
      qrCodeDataUrl: qrPayload.data.qrCodeDataUrl || null,
    },
  };
}

function clearStoredDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}

function normalizeTextList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : fallback;
  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function requiresProspectingCity(config: Pick<ProspectingAutomationConfig, "engine" | "targetType">) {
  return config.engine === "google" || config.targetType === "pj";
}

function humanizeProspectingReason(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  const labels: Record<string, string> = {
    no_whatsapp: "Contato sem WhatsApp confirmado.",
    invalid_whatsapp: "Telefone inválido ou sem WhatsApp confirmado.",
    first_contact_already_sent: "Primeiro contato já enviado para esse lead.",
    negative_or_opt_out: "Negativa/opt-out real; recontato bloqueado.",
    auto_reply_detected: "Autoatendimento detectado; aguardando humano.",
    bot_menu_detected: "Menu de bot detectado; não é negativa.",
    out_of_hours_auto_reply: "Fora de horário; não insistir agora.",
    awaiting_human: "Autoatendimento detectado; aguardando humano.",
    real_negative_safety_pause: "Campanha pausada por excesso de negativas/opt-outs reais hoje.",
    auto_reply_streak_safety_pause: "Campanha pausada por sequência de auto-respostas.",
    repeated_first_contact_review: "Mensagem inicial repetida demais; revisar antes de continuar.",
    radar_protected: "Radar bloqueou por histórico protegido.",
    segment_mismatch_fallback: "Segmento divergente: usando mensagem genérica segura.",
    segment_mismatch_fallback_draft: "Segmento divergente: rascunho genérico preparado.",
    missing_opt_in_or_permission: "Lead sem permissão de envio automático. Ficou para revisão manual.",
    needs_review: "Lead precisa de revisão antes do envio.",
    blocked: "Lead ou conversa bloqueada para automação.",
    lead_status_not_eligible: "Lead fora da fila Prospecção.",
    daily_limit_reached: "Limite diário atingido.",
    send_failed: "Falha do provedor ao enviar. A fila continua.",
  };
  if (labels[normalized]) return labels[normalized];
  if (normalized.includes("cidade")) return raw;
  if (normalized.includes("segmento")) return raw;
  if (normalized.includes("whatsapp")) return raw;
  if (normalized.includes("opt-out") || normalized.includes("opt out")) return raw;
  if (normalized.includes("primeiro contato")) return raw;
  return raw;
}

function resolveProspectingAttentionText(status: ProspectingAutomationLiveStatus | null) {
  if (!status) return "";
  const explicitError = humanizeProspectingReason(status.lastError || status.campaign?.lastError || null);
  if (explicitError) return `Motivo: ${explicitError}`;
  const failedToday = Number(status.failedJobsToday || status.counters?.failedJobsToday || 0);
  const skippedToday = Number(status.skippedJobsToday || status.counters?.skippedJobsToday || 0);
  const lastSkip = humanizeProspectingReason(status.lastSkipReason || null);
  if (lastSkip && (failedToday > 0 || skippedToday > 0)) return `Último bloqueio: ${lastSkip}`;
  const text = String(status.text || "");
  if (text.toLowerCase().startsWith("bot parado")) return text;
  return "";
}

function getProspectingSceneRule(config: AtendimentoBotConfig) {
  return (config.sceneRules || []).find(
    (rule) => rule.sceneId === PROSPECTING_SCENE_ID && rule.conditionType === PROSPECTING_RULE_CONDITION,
  ) || null;
}

function getProspectingRulesFromBot(config: AtendimentoBotConfig) {
  const metadata = (getProspectingSceneRule(config)?.metadata || {}) as Record<string, unknown>;
  return {
    intervalMinutes: Number(metadata.nextContactDelayMinutes || DEFAULT_PROSPECTING_CONFIG.intervalMinutes),
    typingSeconds: Number(metadata.typingSeconds || DEFAULT_PROSPECTING_CONFIG.typingSeconds),
    typingVarianceSeconds: Number(metadata.typingVarianceSeconds || DEFAULT_PROSPECTING_CONFIG.typingVarianceSeconds),
    positiveIntentKeywords: normalizeTextList(
      metadata.positiveIntentKeywords,
      DEFAULT_PROSPECTING_CONFIG.positiveIntentKeywords,
    ),
    negativeIntentKeywords: normalizeTextList(
      metadata.negativeIntentKeywords || metadata.stopIntentKeywords,
      DEFAULT_PROSPECTING_CONFIG.negativeIntentKeywords,
    ),
    optOutMessage: String(metadata.optOutMessage || DEFAULT_PROSPECTING_CONFIG.optOutMessage),
    optOutReplyEnabled: Boolean(metadata.optOutReplyEnabled),
  };
}

function mergeProspectingConfigFromStatus(
  status: ProspectingAutomationLiveStatus | null,
  botConfig: AtendimentoBotConfig,
): ProspectingAutomationConfig {
  const rules = getProspectingRulesFromBot(botConfig);
  const campaign = status?.campaign;
  const campaignFilters = campaign?.filtersJson && typeof campaign.filtersJson === "object" ? campaign.filtersJson : {};
  return {
    ...DEFAULT_PROSPECTING_CONFIG,
    ...rules,
    city: String(campaign?.city || DEFAULT_PROSPECTING_CONFIG.city),
    state: String(campaign?.state || DEFAULT_PROSPECTING_CONFIG.state),
    segment: String(campaign?.segment || DEFAULT_PROSPECTING_CONFIG.segment),
    engine: campaign?.engine === "google" ? "google" : "hbx",
    targetType:
      campaign?.targetType === "pf" || campaign?.targetType === "agenda_pf"
        ? campaign.targetType
        : "pj",
    messageTemplate: String(campaign?.messageTemplate || DEFAULT_PROSPECTING_CONFIG.messageTemplate),
    intervalMinutes: Number(campaign?.intervalMinutes || rules.intervalMinutes || DEFAULT_PROSPECTING_CONFIG.intervalMinutes),
    workingHoursStart: String(campaign?.workingHoursStart || DEFAULT_PROSPECTING_CONFIG.workingHoursStart),
    workingHoursEnd: String(campaign?.workingHoursEnd || DEFAULT_PROSPECTING_CONFIG.workingHoursEnd),
    dailyLimit: Number(campaign?.dailyLimit || DEFAULT_PROSPECTING_CONFIG.dailyLimit),
    minLeadBuffer: Number(campaign?.minLeadBuffer || DEFAULT_PROSPECTING_CONFIG.minLeadBuffer),
    desiredLeadBuffer: Number(campaign?.desiredLeadBuffer || DEFAULT_PROSPECTING_CONFIG.desiredLeadBuffer),
    maxAttemptsPerLead: Math.max(1, Number(campaign?.maxAttemptsPerLead || DEFAULT_PROSPECTING_CONFIG.maxAttemptsPerLead)),
    typingSeconds: Number(campaign?.typingSeconds || rules.typingSeconds || DEFAULT_PROSPECTING_CONFIG.typingSeconds),
    typingVarianceSeconds: Number(campaign?.typingVarianceSeconds || rules.typingVarianceSeconds || DEFAULT_PROSPECTING_CONFIG.typingVarianceSeconds),
    positiveIntentKeywords: normalizeTextList(campaign?.positiveIntentKeywords, rules.positiveIntentKeywords),
    negativeIntentKeywords: normalizeTextList(campaign?.negativeIntentKeywords, rules.negativeIntentKeywords),
    optOutMessage: String(campaign?.optOutMessage || rules.optOutMessage || DEFAULT_PROSPECTING_CONFIG.optOutMessage),
    optOutReplyEnabled: Boolean(campaign?.optOutReplyEnabled ?? campaignFilters.optOutReplyEnabled ?? rules.optOutReplyEnabled),
    websiteFallbackEnabled: false,
    filtersJson: campaignFilters,
  };
}

function toProspectingRequestPayload(config: ProspectingAutomationConfig): ProspectingAutomationConfig {
  return {
    city: config.city,
    state: config.state,
    segment: config.segment,
    engine: config.engine,
    targetType: config.targetType,
    messageTemplate: config.messageTemplate,
    intervalMinutes: config.intervalMinutes,
    workingHoursStart: config.workingHoursStart,
    workingHoursEnd: config.workingHoursEnd,
    dailyLimit: config.dailyLimit,
    minLeadBuffer: config.minLeadBuffer,
    desiredLeadBuffer: Math.min(100, Math.max(1, Math.trunc(Number(config.desiredLeadBuffer || 1)))),
    maxAttemptsPerLead: config.maxAttemptsPerLead,
    typingSeconds: config.typingSeconds,
    typingVarianceSeconds: config.typingVarianceSeconds,
    positiveIntentKeywords: config.positiveIntentKeywords,
    negativeIntentKeywords: config.negativeIntentKeywords,
    optOutMessage: config.optOutMessage,
    optOutReplyEnabled: config.optOutReplyEnabled,
    websiteFallbackEnabled: false,
    filtersJson: config.filtersJson || {},
  };
}

function upsertProspectingRules(
  config: AtendimentoBotConfig,
  prospecting: ProspectingAutomationConfig,
): AtendimentoBotConfig {
  const sceneRules = [...(config.sceneRules || [])];
  const currentIndex = sceneRules.findIndex(
    (rule) => rule.sceneId === PROSPECTING_SCENE_ID && rule.conditionType === PROSPECTING_RULE_CONDITION,
  );
  const current = currentIndex >= 0 ? sceneRules[currentIndex] : null;
  const nextRule = {
    ...(current || {
      sceneId: PROSPECTING_SCENE_ID,
      conditionType: PROSPECTING_RULE_CONDITION,
      enabled: true,
    }),
    metadata: {
      ...((current?.metadata || {}) as Record<string, unknown>),
      guideId: "prospeccao",
      nextContactDelayMinutes: prospecting.intervalMinutes,
      typingSeconds: prospecting.typingSeconds,
      typingVarianceSeconds: prospecting.typingVarianceSeconds,
      positiveIntentKeywords: prospecting.positiveIntentKeywords,
      negativeIntentKeywords: prospecting.negativeIntentKeywords,
      optOutMessage: prospecting.optOutMessage,
      optOutReplyEnabled: prospecting.optOutReplyEnabled,
    },
  };
  if (currentIndex >= 0) sceneRules[currentIndex] = nextRule;
  else sceneRules.push(nextRule);
  return normalizeBotConfig({ ...config, sceneRules });
}

function ProspectingAutomationPanel({
  config,
  liveStatus,
  loading,
  actionLoading,
  previewVariables,
  onChange,
  onSave,
  onStart,
  onPause,
  onResume,
  onCancel,
}: {
  config: ProspectingAutomationConfig;
  liveStatus: ProspectingAutomationLiveStatus | null;
  loading: boolean;
  actionLoading: string | null;
  previewVariables: ProspectingPreviewVariables;
  onChange: (updater: (current: ProspectingAutomationConfig) => ProspectingAutomationConfig) => void;
  onSave: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const counters = liveStatus?.counters || { todayPending: 0, overdue: 0, future: 0, sent: 0, positives: 0, archived: 0, failed: 0 };
  const todayPending = counters.todayPending ?? counters.pending ?? 0;
  const positives = counters.positives ?? counters.interested ?? 0;
  const sentToday = liveStatus?.sentToday ?? counters.sentToday ?? counters.sent ?? 0;
  const dailyLimit = liveStatus?.dailyLimit ?? counters.dailyLimit ?? config.dailyLimit;
  const remainingToday = liveStatus?.remainingToday ?? counters.remainingToday ?? Math.max(0, dailyLimit - sentToday);
  const skippedToday = liveStatus?.skippedJobsToday ?? counters.skippedJobsToday ?? 0;
  const cooldownLabel = liveStatus?.cooldownActive
    ? "Cooldown ativo"
    : liveStatus?.nextEligibleLeadName
      ? `Próximo: ${liveStatus.nextEligibleLeadName}`
      : "Sem cooldown";
  const campaignStatus = liveStatus?.campaign?.status || "paused";
  const botAttentionText = resolveProspectingAttentionText(liveStatus);
  const canPause = campaignStatus === "running";
  const canResume = campaignStatus === "paused";
  const [positiveKeywordsDraft, setPositiveKeywordsDraft] = useState(config.positiveIntentKeywords.join(", "));
  const [negativeKeywordsDraft, setNegativeKeywordsDraft] = useState(config.negativeIntentKeywords.join(", "));
  const [variableTarget, setVariableTarget] = useState<"messageTemplate" | "optOutMessage">("messageTemplate");
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [selectedCampaignTypeId, setSelectedCampaignTypeId] = useState<CampaignTypeId>("cnpj_local");
  const [selectedMessagePresetId, setSelectedMessagePresetId] = useState("");
  const messageTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const optOutMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const filteredMessagePresets = useMemo(
    () => MESSAGE_PRESETS.filter((preset) => preset.group === selectedCampaignTypeId),
    [selectedCampaignTypeId],
  );
  const messageTemplateHasLink = hasFirstContactLink(config.messageTemplate);
  const sanitizedMessagePreview = sanitizeFirstContactPreview(config.messageTemplate) || GENERIC_ERROR_MESSAGE_TEMPLATE;
  const cityRequired = requiresProspectingCity(config);
  const advancedFilters = useMemo<HbxAdvancedFiltersValue>(() => ({
    minRating: String(config.filtersJson?.minRating ?? ""),
    minReviews: String(config.filtersJson?.minReviews ?? ""),
    onlyWithWebsite: config.filtersJson?.onlyWithWebsite === true,
  }), [config.filtersJson]);

  useEffect(() => {
    // Keep textarea drafts aligned when a saved campaign replaces the local config.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositiveKeywordsDraft(config.positiveIntentKeywords.join(", "));
  }, [config.positiveIntentKeywords]);

  useEffect(() => {
    // Keep textarea drafts aligned when a saved campaign replaces the local config.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNegativeKeywordsDraft(config.negativeIntentKeywords.join(", "));
  }, [config.negativeIntentKeywords]);

  const setField = <K extends keyof ProspectingAutomationConfig,>(field: K, value: ProspectingAutomationConfig[K]) => {
    onChange((current) => ({ ...current, [field]: value }));
  };
  const setStateField = (state: string) => {
    const nextState = state.toUpperCase();
    onChange((current) => ({
      ...current,
      state: nextState,
      city: String(current.state || "").trim().toUpperCase() === nextState ? current.city : "",
    }));
  };
  const setNumberField = (
    field:
      | "intervalMinutes"
      | "dailyLimit"
      | "minLeadBuffer"
      | "desiredLeadBuffer"
      | "maxAttemptsPerLead"
      | "typingSeconds"
      | "typingVarianceSeconds",
    value: string,
    min = 0,
  ) => {
    const parsed = Math.max(min, Math.trunc(Number(value) || 0));
    onChange((current) => ({ ...current, [field]: parsed }));
  };
  const setAdvancedFilters = (next: HbxAdvancedFiltersValue) => {
    onChange((current) => ({
      ...current,
      filtersJson: {
        ...(current.filtersJson || {}),
        minRating: next.minRating || undefined,
        minReviews: next.minReviews || undefined,
        onlyWithWebsite: next.onlyWithWebsite === true,
      },
    }));
  };
  const setListField = (field: "positiveIntentKeywords" | "negativeIntentKeywords", value: string) => {
    onChange((current) => ({ ...current, [field]: normalizeTextList(value, current[field]) }));
  };
  const applyMessagePreset = (presetId: string) => {
    setSelectedMessagePresetId(presetId);
    const preset = MESSAGE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedCampaignTypeId(preset.group);
    onChange((current) => ({
      ...current,
      segment: preset.segment,
      targetType: preset.targetType,
      messageTemplate: getSafePresetFirstContact(preset.id),
    }));
  };
  const applyCampaignType = (campaignTypeId: CampaignTypeId) => {
    setSelectedCampaignTypeId(campaignTypeId);
    const preset = MESSAGE_PRESETS.find((item) => item.group === campaignTypeId);
    if (!preset) {
      setSelectedMessagePresetId("");
      return;
    }
    setSelectedMessagePresetId(preset.id);
    onChange((current) => ({
      ...current,
      segment: preset.segment,
      targetType: preset.targetType,
      messageTemplate: getSafePresetFirstContact(preset.id),
    }));
  };
  const insertVariable = (token: string) => {
    const field = variableTarget;
    const ref = field === "messageTemplate" ? messageTemplateRef.current : optOutMessageRef.current;
    const currentValue = String(config[field] || "");
    const start = ref?.selectionStart ?? currentValue.length;
    const end = ref?.selectionEnd ?? currentValue.length;
    const insert = `{{${token}}}`;
    const nextValue = `${currentValue.slice(0, start)}${insert}${currentValue.slice(end)}`;
    setField(field, nextValue as ProspectingAutomationConfig[typeof field]);
    setVariablesOpen(false);
    window.setTimeout(() => {
      ref?.focus();
      ref?.setSelectionRange(start + insert.length, start + insert.length);
    }, 0);
  };

  return (
    <section className={styles.prospectingShell}>
      <div className={styles.prospectingStatusBar}>
        <div>
          <span className={styles.sectionEyebrow}>Prospecção automática</span>
          <h3 className={styles.cardTitle}>{liveStatus?.text || "Motor contínuo"}</h3>
          {botAttentionText ? (
            <div className={styles.prospectingHeaderAlert} role="status">
              {botAttentionText}
            </div>
          ) : null}
        </div>
        <div className={styles.prospectingStatusMetrics}>
          <span>Créditos usados <strong>{sentToday}/{dailyLimit}</strong></span>
          <span>Restantes hoje <strong>{remainingToday}</strong></span>
          <span>Pendentes <strong>{liveStatus?.pendingJobs ?? counters.pendingJobs ?? todayPending}</strong></span>
          <span>Pulados hoje <strong>{skippedToday}</strong></span>
          <span>Positivos <strong>{positives}</strong></span>
          <span title={liveStatus?.lastSkipReason || cooldownLabel}>Status <strong>{cooldownLabel}</strong></span>
        </div>
      </div>

      <div className={styles.prospectingGrid}>
        <section className={styles.prospectingPanel}>
          <div className={styles.editorSectionHeader}>
            <div>
              <strong>Pesquisa base</strong>
              <span>{loading ? "Carregando status..." : campaignStatus}</span>
            </div>
          </div>
          <div className={styles.prospectingFormGrid}>
            <div className={styles.prospectingWideField}>
              <HbxStateCityPicker
                state={config.state}
                city={config.city}
                onStateChange={setStateField}
                onCityChange={(value) => setField("city", value)}
                requiredCity={cityRequired}
              />
            </div>
            <HbxSegmentCombobox
              value={config.segment}
              onChange={(value) => setField("segment", value)}
            />
            <HbxEngineSelector
              value={config.engine}
              onChange={(value) => setField("engine", value)}
            />
            <HbxTargetTypeSelector
              value={config.targetType}
              onChange={(value) => setField("targetType", value as ProspectingAutomationConfig["targetType"])}
              allowedTypes={["pj", "pf", "agenda_pf"]}
            />
            <HbxQuantitySelector
              value={config.dailyLimit}
              onChange={(value) => setNumberField("dailyLimit", String(value), 1)}
              options={[10, 15, 20, 30, 40, 50]}
              limitLabel="Novos contatos por dia"
              helperText="Quantidade de pessoas diferentes que podem receber uma mensagem automática com sucesso hoje."
            />
            <div className={styles.prospectingWideField}>
              <HbxAdvancedFilters
                mode="automation"
                filters={advancedFilters}
                onChange={setAdvancedFilters}
              />
            </div>
          </div>
        </section>

        <section className={styles.prospectingPanel}>
          <div className={styles.editorSectionHeader}>
            <div>
              <strong>Envio seguro</strong>
              <span>{config.maxAttemptsPerLead} tentativa(s) por lead. Recomendado: 1.</span>
            </div>
          </div>
          <div className={styles.prospectingFormGrid}>
            <label>
              <span>Intervalo entre envios</span>
              <input className={styles.inputField} type="number" min={1} value={config.intervalMinutes} onChange={(event) => setNumberField("intervalMinutes", event.target.value, 1)} />
              <small>Tempo mínimo entre mensagens realmente enviadas. Leads pulados não contam.</small>
            </label>
            <label>
              <span>Início</span>
              <input className={styles.inputField} type="time" value={config.workingHoursStart} onChange={(event) => setField("workingHoursStart", event.target.value)} />
            </label>
            <label>
              <span>Fim</span>
              <input className={styles.inputField} type="time" value={config.workingHoursEnd} onChange={(event) => setField("workingHoursEnd", event.target.value)} />
            </label>
            <label>
              <span>Estoque mínimo</span>
              <input className={styles.inputField} type="number" min={1} value={config.minLeadBuffer} onChange={(event) => setNumberField("minLeadBuffer", event.target.value, 1)} />
            </label>
            <label>
              <span>Estoque desejado</span>
              <input className={styles.inputField} type="number" min={1} max={100} value={config.desiredLeadBuffer} onChange={(event) => setNumberField("desiredLeadBuffer", event.target.value, 1)} />
              <small>Por segurança, cada herança do Radar para Vendas usa no máximo 100 leads.</small>
            </label>
            <label>
              <span>Tentativas por lead</span>
              <input className={styles.inputField} type="number" min={1} max={3} value={config.maxAttemptsPerLead} onChange={(event) => setNumberField("maxAttemptsPerLead", event.target.value, 1)} />
              <small>Quantas vezes o bot pode tentar falar com a mesma pessoa. Recomendado: 1.</small>
            </label>
            <label>
              <span>Typing</span>
              <input className={styles.inputField} type="number" min={0} value={config.typingSeconds} onChange={(event) => setNumberField("typingSeconds", event.target.value, 0)} />
            </label>
            <label>
              <span>Variação</span>
              <input className={styles.inputField} type="number" min={0} value={config.typingVarianceSeconds} onChange={(event) => setNumberField("typingVarianceSeconds", event.target.value, 0)} />
            </label>
          </div>
          <div className={styles.riskNotice}>
            <strong>Exemplo operacional</strong>
            <p>
              Para amanhã, use 15 novos contatos/dia, 1 tentativa por lead, intervalo mínimo de 20min e variação de typing.
              Leads pulados por revisão, sem WhatsApp ou já contatados não consomem limite.
            </p>
          </div>
        </section>
      </div>

      <section className={styles.prospectingPanel}>
        <div className={styles.prospectingMessageWorkbench}>
          <div className={styles.prospectingMessageEditorStack}>
            <label className={styles.messagePresetField} onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "campaignType" ? null : prev)), 120)}>
              <span>Tipo de campanha</span>
              <div className={styles.hbxDropdown}>
                <select
                  className={styles.selectField}
                  value={selectedCampaignTypeId}
                  onChange={(event) => applyCampaignType(event.target.value as CampaignTypeId)}
                  onFocus={() => setOpenDropdown("campaignType")}
                  onClick={() => setOpenDropdown("campaignType")}
                  onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "campaignType" ? null : prev)), 120)}
                >
                  {CAMPAIGN_TYPES.map((campaignType) => (
                    <option key={campaignType.id} value={campaignType.id}>
                      {campaignType.label}
                    </option>
                  ))}
                </select>
                {openDropdown === "campaignType" ? <div className={styles.hbxDropdownOpeningNotice}>Abrindo os dados...</div> : null}
              </div>
            </label>
            <label className={styles.messagePresetField} onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "messagePreset" ? null : prev)), 120)}>
              <span>Modelo de abordagem</span>
              <div className={styles.hbxDropdown}>
                <select
                  className={styles.selectField}
                  value={selectedMessagePresetId}
                  onChange={(event) => applyMessagePreset(event.target.value)}
                  onFocus={() => setOpenDropdown("messagePreset")}
                  onClick={() => setOpenDropdown("messagePreset")}
                  onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "messagePreset" ? null : prev)), 120)}
                >
                  <option value="">Personalizado</option>
                  {filteredMessagePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                {openDropdown === "messagePreset" ? <div className={styles.hbxDropdownOpeningNotice}>Abrindo os dados...</div> : null}
              </div>
            </label>
            <div className={styles.prospectingMessageGrid}>
              <label>
                <span>Mensagem inicial</span>
                <textarea
                  ref={messageTemplateRef}
                  className={styles.editorTextarea}
                  value={config.messageTemplate}
                  onFocus={() => setVariableTarget("messageTemplate")}
                  onChange={(event) => {
                    setSelectedMessagePresetId("");
                    setField("messageTemplate", event.target.value);
                  }}
                />
                <small>Primeiro contato não envia links automaticamente. Links só depois que a pessoa responder.</small>
              </label>
              <label>
                <span>Encerramento negativo</span>
                <textarea
                  ref={optOutMessageRef}
                  className={styles.editorTextarea}
                  value={config.optOutMessage}
                  disabled={!config.optOutReplyEnabled}
                  onFocus={() => setVariableTarget("optOutMessage")}
                  onChange={(event) => setField("optOutMessage", event.target.value)}
                />
              </label>
            </div>
            {messageTemplateHasLink ? (
              <div className={styles.riskNotice}>
                O link será removido no primeiro contato para proteger o número.
              </div>
            ) : null}
            <label className={styles.toggleCard}>
              <span>
                <strong>Responder encerramento negativo</strong>
                <small>Desligado por padrão. Mesmo desligado, resposta negativa arquiva e bloqueia recontato automático.</small>
              </span>
              <input type="checkbox" checked={config.optOutReplyEnabled} onChange={(event) => setField("optOutReplyEnabled", event.target.checked)} />
            </label>
            {config.optOutReplyEnabled ? (
              <div className={styles.riskNotice}>
                Responder depois de uma negativa pode aumentar risco de bloqueio no WhatsApp. Use apenas uma mensagem curta, sem insistência e sem link.
              </div>
            ) : null}
            <div className={styles.prospectingKeywordGrid}>
              <label>
                <span>Palavras positivas</span>
                <input
                  className={styles.inputField}
                  value={positiveKeywordsDraft}
                  placeholder="tenho interesse, pode mandar, quero saber"
                  onChange={(event) => {
                    setPositiveKeywordsDraft(event.target.value);
                  }}
                  onBlur={(event) => setListField("positiveIntentKeywords", event.target.value)}
                />
              </label>
              <label>
                <span>Palavras negativas</span>
                <input
                  className={styles.inputField}
                  value={negativeKeywordsDraft}
                  placeholder="não tenho interesse, pare, remover, spam"
                  onChange={(event) => {
                    setNegativeKeywordsDraft(event.target.value);
                  }}
                  onBlur={(event) => setListField("negativeIntentKeywords", event.target.value)}
                />
              </label>
            </div>
          </div>

          <aside className={styles.prospectingWhatsAppPreview}>
            <div className={styles.prospectingPreviewHeader}>
              <div>
                <span>WhatsApp</span>
                <strong>Prévia ao vivo</strong>
              </div>
              <button
                type="button"
                className={styles.previewHeaderButton}
                onClick={() => setVariablesOpen(true)}
              >
                Variáveis
              </button>
            </div>
            <div className={styles.prospectingPhoneFrame}>
              <div className={styles.prospectingPhoneTopbar}>
                <span className={styles.prospectingPhoneAvatar}>HBX</span>
                <div>
                  <strong>{previewVariables.empresa}</strong>
                  <small>online agora</small>
                </div>
                <i aria-hidden="true" />
              </div>
              <div className={styles.prospectingPhoneBody}>
                <span className={styles.prospectingPhoneDate}>Hoje</span>
                <div className={styles.prospectingCustomerBubble}>Contato recebido na fila.</div>
                <div className={styles.prospectingBotBubble} data-tone="typing">
                  <small>Digitando</small>
                  <p>typing por {config.typingSeconds}s, com variação humana de até {config.typingVarianceSeconds}s.</p>
                </div>
                <div className={styles.prospectingBotBubble}>
                  <small>Disparo inicial</small>
                  <p>{renderProspectingPreview(sanitizedMessagePreview, config, previewVariables)}</p>
                </div>
                <div className={styles.prospectingCustomerBubble}>Não tenho interesse, remova meu contato.</div>
                {config.optOutReplyEnabled ? (
                  <div className={styles.prospectingBotBubble}>
                    <small>Encerramento negativo</small>
                    <p>{renderProspectingPreview(config.optOutMessage, config, previewVariables)}</p>
                  </div>
                ) : (
                  <div className={styles.prospectingSystemBubble}>Arquiva, marca opt-out e não envia resposta.</div>
                )}
              </div>
              <div className={styles.prospectingPhoneComposer}>
                <span>Mensagem</span>
                <strong>+</strong>
              </div>
            </div>
          </aside>
        </div>
        <div className={styles.variablePreviewCard} aria-label="Valores atuais das variáveis">
          <div>
            <span>{"{{funcionario}}"}</span>
            <strong>{previewVariables.funcionario}</strong>
            <small>nome do usuário logado</small>
          </div>
          <div>
            <span>{"{{empresa}}"}</span>
            <strong>{previewVariables.empresa}</strong>
            <small>nome da empresa</small>
          </div>
        </div>
        {variablesOpen ? (
          <div className={styles.variablePopover} role="dialog" aria-modal="true">
            <div className={styles.variablePopoverCard}>
              <header>
                <strong>Variáveis</strong>
                <button type="button" className={styles.ghostButton} onClick={() => setVariablesOpen(false)}>Fechar</button>
              </header>
              <div className={styles.variableGrid}>
                {PROSPECTING_VARIABLES.map((variable) => (
                  <button key={variable.token} type="button" className={styles.inlineGhostButton} onClick={() => insertVariable(variable.token)}>
                    {variable.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className={styles.prospectingActionRow}>
        <button type="button" className={styles.secondaryButton} onClick={onSave} disabled={Boolean(actionLoading)}>
          {actionLoading === "save" ? "Salvando..." : "Salvar configuração"}
        </button>
        <button type="button" className={styles.primaryButton} onClick={onStart} disabled={Boolean(actionLoading)}>
          {actionLoading === "start" ? "Iniciando..." : "Iniciar campanha"}
        </button>
        {canPause ? (
          <button type="button" className={styles.ghostButton} onClick={onPause} disabled={Boolean(actionLoading)}>
            {actionLoading === "pause" ? "Pausando..." : "Pausar"}
          </button>
        ) : canResume ? (
          <button type="button" className={styles.ghostButton} onClick={onResume} disabled={Boolean(actionLoading)}>
            {actionLoading === "resume" ? "Retomando..." : "Retomar"}
          </button>
        ) : null}
        {liveStatus?.campaign ? (
          <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={Boolean(actionLoading)}>
            {actionLoading === "cancel" ? "Cancelando..." : "Cancelar"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function VendasAutomationClientPage() {
  const hasToken = useRequireModule("vendas");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [, setConnectionLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [activeTab, setActiveTab] = useState<BotQrWorkspaceTab>("flow");
  const [connectionPaired, setConnectionPaired] = useState(false);
  const [draftConfig, setDraftConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [publishedConfig, setPublishedConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [prospectingConfig, setProspectingConfig] = useState<ProspectingAutomationConfig>(DEFAULT_PROSPECTING_CONFIG);
  const [prospectingStatus, setProspectingStatus] = useState<ProspectingAutomationLiveStatus | null>(null);
  const [prospectingLoading, setProspectingLoading] = useState(false);
  const [prospectingAction, setProspectingAction] = useState<string | null>(null);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(DEFAULT_ATENDIMENTO_AGENDA_CONFIG);
  const [centerPayload, setCenterPayload] = useState<WhatsAppCenterPayload | null>(null);
  const [modalPayload, setModalPayload] = useState<WhatsAppModalPayload | null>(null);
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlansPayload | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
  const [, setDraftSavedAt] = useState<string | null>(null);
  const [, setPublishedAt] = useState<string | null>(null);
  const previousConnectionStatusRef = useRef<WhatsAppModalPayload["status"] | null>(null);
  const prospectingDirtyRef = useRef(false);
  const prospectingConfigRef = useRef<ProspectingAutomationConfig>(DEFAULT_PROSPECTING_CONFIG);

  const draftSignature = useMemo(() => JSON.stringify(draftConfig), [draftConfig]);
  const publishedSignature = useMemo(() => JSON.stringify(publishedConfig), [publishedConfig]);
  const hasUnsavedChanges = draftSignature !== publishedSignature;
  const providerCapabilities = useMemo(
    () => getProviderCapabilitiesFromWhatsAppCenter(centerPayload),
    [centerPayload],
  );
  const botAiActive = hasBotAi(commercialPlans);
  const assistedSetupPending = Boolean(
    commercialPlans?.current.assistedSetup?.required &&
      String(commercialPlans.current.assistedSetup.status || "").toLowerCase() !== "completed",
  );
  const assistedSetupMessage =
    commercialPlans?.current.assistedSetup?.message ||
    "Implantação assistida pendente. A HBX configura mensagens, limites, horários e handoff humano antes de liberar automação completa.";
  const previewVariables = useMemo<ProspectingPreviewVariables>(() => {
    const funcionario = String(currentUserProfile?.name || "").trim() || "time comercial";
    const empresa =
      String(
        currentUserProfile?.masterContext?.active
          ? currentUserProfile.masterContext.companyName
          : currentUserProfile?.company?.name,
      ).trim() || "nossa empresa";
    return { funcionario, empresa };
  }, [
    currentUserProfile?.company?.name,
    currentUserProfile?.masterContext?.active,
    currentUserProfile?.masterContext?.companyName,
    currentUserProfile?.name,
  ]);
  const recoveryEnabled = useMemo(() => {
    const trialModule = String(centerPayload?.company.trialModuleSelection || "").trim().toLowerCase();
    if (trialModule === "recovery") return true;
    return userModules.some((module) => module.accessible && module.key === "hbx_recovery");
  }, [centerPayload?.company.trialModuleSelection, userModules]);

  useEffect(() => {
    prospectingConfigRef.current = prospectingConfig;
  }, [prospectingConfig]);

  const openBotPlans = useCallback(() => {
    router.push(BOT_PLAN_HREF);
  }, [router]);

  const handleModalPlanRedirect = useCallback(
    (payload: WhatsAppModalPayload | null) => {
      const redirectTo = getWhatsAppModalPlanRedirect(payload);
      if (!redirectTo) return false;
      setNotice({
        tone: "error",
        text: "Este WhatsApp já utilizou o trial. Para continuar usando o HBX com este número, escolha um plano.",
      });
      router.push(redirectTo);
      return true;
    },
    [router],
  );

  const setWorkspaceTab = useCallback(
    (tab: BotQrWorkspaceTab) => {
      if (tab === "connection") {
        router.push("/whatsapp?focus=qr");
        return;
      }
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadConnection = useCallback(async (background = false, includeQr = true) => {
    if (!background) setConnectionLoading(true);
    try {
      const centerData = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center");
      const statusData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status");
      let nextModal = statusData;

      if (shouldLoadModalQr(statusData, includeQr)) {
        const qrData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
        nextModal = mergeModalPayload(statusData, qrData);
      }

      setCenterPayload(centerData);
      setModalPayload(nextModal);
      handleModalPlanRedirect(nextModal);
    } catch {
      setModalPayload(null);
    } finally {
      if (!background) setConnectionLoading(false);
    }
  }, [handleModalPlanRedirect]);

  const loadAutomation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansPayload, agendaPayload] = await Promise.all([
        apiFetch<CommercialPlansPayload>("/commercial-plans/me"),
        apiFetch<AtendimentoAgendaConfig>("/vendas/automation/agenda"),
      ]);
      setCommercialPlans(plansPayload);
      const normalizedAgenda = normalizeAgendaConfig(agendaPayload);
      setAgendaConfig(normalizedAgenda);

      if (!hasBotAi(plansPayload)) {
        setPublishedConfig(DEFAULT_ATENDIMENTO_BOT_CONFIG);
        setDraftConfig(DEFAULT_ATENDIMENTO_BOT_CONFIG);
        setPublishedAt(null);
        setDraftSavedAt(null);
        return;
      }

      const botPayload = await apiFetch<AtendimentoBotConfig>("/vendas/automation/bot-config");
      const normalizedBot = normalizeBotConfig(botPayload);

      setPublishedConfig(normalizedBot);
      setPublishedAt(new Date().toISOString());
      clearStoredDraft();
      setDraftConfig(normalizedBot);
      prospectingDirtyRef.current = false;
      setProspectingConfig(mergeProspectingConfigFromStatus(null, normalizedBot));
      setDraftSavedAt(null);
    } catch (loadError) {
      const redirectTo = getBotAiPlanRedirectFromError(loadError, BOT_PLAN_HREF);
      if (redirectTo) {
        setNotice({
          tone: "info",
          text: "Bot de atendimento está disponível no HBX Full — Bot e IA.",
        });
        router.push(redirectTo);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a automacao WhatsApp.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadProspectingStatus = useCallback(async (background = false, botForMerge?: AtendimentoBotConfig) => {
    if (!background) setProspectingLoading(true);
    try {
      const payload = await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/live-status");
      setProspectingStatus(payload);
      setProspectingConfig((current) => {
        if (prospectingDirtyRef.current || background || (!payload.campaign && !botForMerge)) return current;
        return {
          ...current,
          ...mergeProspectingConfigFromStatus(payload, botForMerge || DEFAULT_ATENDIMENTO_BOT_CONFIG),
        };
      });
      return payload;
    } catch {
      return null;
    } finally {
      if (!background) setProspectingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadAutomation();
    void loadConnection(false, true);
    void apiFetch<CurrentUserProfile>("/profile/current-user")
      .then((profile) => setCurrentUserProfile(profile))
      .catch(() => setCurrentUserProfile(null));
    void apiFetch<UserModule[]>("/modules/me")
      .then((modules) => setUserModules(Array.isArray(modules) ? modules : []))
      .catch(() => setUserModules([]));
  }, [hasToken, loadAutomation, loadConnection]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (!commercialPlans || !hasBotAi(commercialPlans)) return;
    void loadProspectingStatus(false);
    const timer = window.setInterval(() => {
      void loadProspectingStatus(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [commercialPlans, hasToken, loadProspectingStatus]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "connection") {
      router.replace("/whatsapp?focus=qr");
      return;
    }
    if (requestedTab === "atendimento" || requestedTab === "flow" || requestedTab === "prospeccao" || requestedTab === "recovery") {
      setActiveTab(requestedTab);
      return;
    }
    if (requestedTab === "publish") {
      setWorkspaceTab("flow");
    }
  }, [router, searchParams, setWorkspaceTab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const currentStatus = modalPayload?.status || null;
    const previousStatus = previousConnectionStatusRef.current;
    previousConnectionStatusRef.current = currentStatus;

    if (currentStatus !== "connected" || previousStatus === "connected") return;

    dispatchModulesChanged({ reason: "whatsapp_connected" });
    if (!previousStatus) return;

    setConnectionPaired(true);
    window.dispatchEvent(new Event(QR_PAIRED_EVENT));
    const timer = window.setTimeout(() => setConnectionPaired(false), 3200);
    return () => window.clearTimeout(timer);
  }, [modalPayload?.status]);

  useEffect(() => {
    if (!modalPayload?.data.available) return;
    const interval = window.setInterval(() => {
      void loadConnection(true, modalPayload.status !== "connected");
    }, modalPayload.status === "connected" ? 20000 : 8000);
    return () => window.clearInterval(interval);
  }, [loadConnection, modalPayload?.data.available, modalPayload?.status]);

  const saveBotConfig = useCallback(async (nextConfig: AtendimentoBotConfig, successText: string) => {
    if (!botAiActive) {
      setNotice({
        tone: "info",
        text: "Bot de atendimento está disponível no HBX Full — Bot e IA.",
      });
      openBotPlans();
      return false;
    }
    if (assistedSetupPending && nextConfig.routingRules.globalBotEnabled) {
      setNotice({ tone: "info", text: assistedSetupMessage });
      return false;
    }
    setPublishing(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/vendas/automation/bot-config", {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
      });
      const normalized = normalizeBotConfig(payload);
      setDraftConfig(normalized);
      setPublishedConfig(normalized);
      setPublishedAt(new Date().toISOString());
      clearStoredDraft();
      setDraftSavedAt(null);
      setNotice({ tone: "success", text: successText });
      return true;
    } catch (publishError) {
      const redirectTo = getBotAiPlanRedirectFromError(publishError, BOT_PLAN_HREF);
      if (redirectTo) {
        setNotice({
          tone: "info",
          text: "Bot de atendimento está disponível no HBX Full — Bot e IA.",
        });
        router.push(redirectTo);
        return false;
      }
      const message =
        publishError instanceof Error ? publishError.message : "Falha ao salvar a automacao WhatsApp.";
      setError(message);
      setNotice({ tone: "error", text: message });
      return false;
    } finally {
      setPublishing(false);
    }
  }, [assistedSetupMessage, assistedSetupPending, botAiActive, openBotPlans, router]);

  const handleSaveDraft = useCallback(() => {
    void saveBotConfig(draftConfig, "Rascunho salvo no banco de dados.");
  }, [draftConfig, saveBotConfig]);

  const disableAi = useCallback(() => {
    if (!botAiActive) {
      openBotPlans();
      return;
    }
    const nextConfig = normalizeBotConfig({
      ...draftConfig,
      routingRules: {
        ...draftConfig.routingRules,
        globalBotEnabled: false,
      },
    });
    void saveBotConfig(nextConfig, "IA desativada. O HBot ficará em modo humano.");
  }, [botAiActive, draftConfig, openBotPlans, saveBotConfig]);

  const updateProspectingConfigState = useCallback(
    (updater: (current: ProspectingAutomationConfig) => ProspectingAutomationConfig) => {
      setProspectingConfig((current) => {
        const next = updater(current);
        prospectingConfigRef.current = next;
        prospectingDirtyRef.current = true;
        setDraftConfig((botCurrent) => upsertProspectingRules(botCurrent, next));
        return next;
      });
    },
    [],
  );

  const saveProspectingConfig = useCallback(async () => {
    if (!botAiActive) {
      openBotPlans();
      return;
    }
    const currentProspectingConfig = prospectingConfigRef.current;
    const nextBotConfig = upsertProspectingRules(draftConfig, currentProspectingConfig);
    setProspectingAction("save");
    setError(null);
    try {
      const payload = await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/prospecting/config", {
        method: "PATCH",
        body: JSON.stringify(toProspectingRequestPayload(currentProspectingConfig)),
      });
      setProspectingStatus(payload);
      prospectingDirtyRef.current = false;
      const mergedConfig = mergeProspectingConfigFromStatus(payload, nextBotConfig);
      prospectingConfigRef.current = mergedConfig;
      setProspectingConfig(mergedConfig);
      await saveBotConfig(nextBotConfig, "Configuração de prospecção salva.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar a prospecção automática.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setProspectingAction(null);
    }
  }, [botAiActive, draftConfig, openBotPlans, saveBotConfig]);

  const runProspectingAction = useCallback(
    async (action: "start" | "pause" | "resume" | "cancel") => {
      if (!botAiActive) {
        openBotPlans();
        return;
      }
      if ((action === "start" || action === "resume") && assistedSetupPending) {
        setError(assistedSetupMessage);
        setNotice({ tone: "info", text: assistedSetupMessage });
        return;
      }
      const currentProspectingConfig = prospectingConfigRef.current;
      if (
        action === "start" &&
        requiresProspectingCity(currentProspectingConfig) &&
        !currentProspectingConfig.city.trim()
      ) {
        const message = "Informe a cidade para buscar empresas.";
        setError(message);
        setNotice({ tone: "error", text: message });
        return;
      }
      if (action === "start" && !currentProspectingConfig.segment.trim()) {
        const message = "Informe o segmento para iniciar a prospecção automática.";
        setError(message);
        setNotice({ tone: "error", text: message });
        return;
      }
      const nextBotConfig = upsertProspectingRules(draftConfig, currentProspectingConfig);
      setProspectingAction(action);
      setError(null);
      try {
        if (action === "start") {
          const configPayload = await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/prospecting/config", {
            method: "PATCH",
            body: JSON.stringify(toProspectingRequestPayload(currentProspectingConfig)),
          });
          setProspectingStatus(configPayload);
          const botSaved = await saveBotConfig(nextBotConfig, "Bot sincronizado para a prospecção.");
          if (!botSaved) return;
        }
        const payload = await apiFetch<ProspectingAutomationLiveStatus>(`/vendas/automation/prospecting/${action}`, {
          method: "POST",
          body: action === "start" ? JSON.stringify(toProspectingRequestPayload(currentProspectingConfig)) : undefined,
        });
        setProspectingStatus(payload);
        if (action === "start") prospectingDirtyRef.current = false;
        const mergedConfig = mergeProspectingConfigFromStatus(payload, nextBotConfig);
        prospectingConfigRef.current = mergedConfig;
        setProspectingConfig(mergedConfig);
        setNotice({
          tone: "success",
          text:
            action === "start"
              ? "Campanha de prospecção iniciada."
              : action === "pause"
                ? "Campanha pausada."
                : action === "resume"
                  ? "Campanha retomada."
                  : "Campanha cancelada.",
        });
        if (action === "start") {
          router.push("/atendimento?atendimentoQueue=bot");
        }
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Falha ao controlar a prospecção automática.";
        setError(message);
        setNotice({ tone: "error", text: message });
      } finally {
        setProspectingAction(null);
      }
    },
    [assistedSetupMessage, assistedSetupPending, botAiActive, draftConfig, openBotPlans, router, saveBotConfig],
  );

  const renderBotPlanPaywall = () => (
    <section className={styles.botPlanPaywall}>
      <span className={styles.sectionEyebrow}>Plano necessário</span>
      <h3>Bot de atendimento está disponível no HBX Full — Bot e IA</h3>
      <p>Para configurar ou ativar o bot, escolha o plano que mostra o valor antes da ativação.</p>
      <button type="button" className={styles.primaryButton} onClick={openBotPlans}>
        Ver planos
      </button>
    </section>
  );

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Automacao WhatsApp" description="Carregando automacao do modulo Vendas." hideHeader={true}>
        <section className={styles.loadingCard}>Carregando Automacao WhatsApp...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Automacao WhatsApp" hideHeader={true}>
      <div className={styles.shell}>
        <div className={styles.backdrop} />
        <div className={styles.page}>
          {notice ? <section className={styles.notice} data-tone={notice.tone}>{notice.text}</section> : null}
          {botAiActive && assistedSetupPending ? (
            <section className={styles.notice} data-tone="info">
              {assistedSetupMessage}
            </section>
          ) : null}
          {error ? <section className={styles.notice} data-tone="error">{error}</section> : null}
          {loading ? (
            <section className={styles.loadingCard}>Carregando configuracao atual da Automacao WhatsApp...</section>
          ) : (
            <BotQrWorkspace
              activeTab={activeTab}
              onTabChange={setWorkspaceTab}
              connectionPaired={connectionPaired}
              aiDisabled={!draftConfig.routingRules.globalBotEnabled}
              aiBusy={publishing}
              onDisableAi={botAiActive ? disableAi : undefined}
              connectionPanel={
                <section className={styles.connectionRedirectPanel}>
                  <span className={styles.sectionEyebrow}>Conexão</span>
                  <h3>Use a central WhatsApp para QR e WebWhats</h3>
                  <p>{modalPayload?.data.phone ? `Número conectado: ${modalPayload.data.phone}` : "Abrindo painel de conexão QR."}</p>
                  <button type="button" className={styles.primaryButton} onClick={() => router.push("/whatsapp?focus=qr")}>
                    Abrir conexão
                  </button>
                </section>
              }
              atendimentoPanel={
                botAiActive ? (
                  <ConversationBuilder
                    botConfig={draftConfig}
                    agendaConfig={agendaConfig}
                    providerCapabilities={providerCapabilities}
                    activeGuide="atendimento"
                    publishing={publishing}
                    recoveryEnabled={recoveryEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onConfigChange={setDraftConfig}
                    onSaveDraft={handleSaveDraft}
                    onSave={(nextConfig) => void saveBotConfig(nextConfig, "Bot publicado.")}
                  />
                ) : renderBotPlanPaywall()
              }
              flowPanel={
                botAiActive ? (
                  <ConversationBuilder
                    botConfig={draftConfig}
                    agendaConfig={agendaConfig}
                    providerCapabilities={providerCapabilities}
                    activeGuide="prospeccao"
                    publishing={publishing}
                    recoveryEnabled={recoveryEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onConfigChange={setDraftConfig}
                    onSaveDraft={handleSaveDraft}
                    onSave={(nextConfig) => void saveBotConfig(nextConfig, "Bot publicado.")}
                  />
                ) : renderBotPlanPaywall()
              }
              prospectingPanel={
                botAiActive ? (
                  <ProspectingAutomationPanel
                    config={prospectingConfig}
                    liveStatus={prospectingStatus}
                    loading={prospectingLoading}
                    actionLoading={prospectingAction}
                    previewVariables={previewVariables}
                    onChange={updateProspectingConfigState}
                    onSave={() => void saveProspectingConfig()}
                    onStart={() => void runProspectingAction("start")}
                    onPause={() => void runProspectingAction("pause")}
                    onResume={() => void runProspectingAction("resume")}
                    onCancel={() => void runProspectingAction("cancel")}
                  />
                ) : renderBotPlanPaywall()
              }
              recoveryPanel={
                botAiActive ? (
                  <ConversationBuilder
                    botConfig={draftConfig}
                    agendaConfig={agendaConfig}
                    providerCapabilities={providerCapabilities}
                    activeGuide="recovery"
                    publishing={publishing}
                    recoveryEnabled={recoveryEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onConfigChange={setDraftConfig}
                    onSaveDraft={handleSaveDraft}
                    onSave={(nextConfig) => void saveBotConfig(nextConfig, "Bot publicado.")}
                  />
                ) : renderBotPlanPaywall()
              }
            />
          )}
        </div>
      </div>
    </DashboardScaffold>
  );
}
